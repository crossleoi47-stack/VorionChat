import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { STORAGE_PROVIDER, StorageProvider } from "../storage/storage-provider.interface";
import { WHATSAPP_PROVIDER, WhatsappProvider } from "./whatsapp-provider.interface";
import { createHash } from "crypto";
import { ALLOWED_MIME_TYPES } from "../attachments/attachment-limits";
import { InboundMedia, InboundMessage, StatusUpdate, WebhookChangeValue } from "./webhook-payload.types";

/** Fallback when a mime type isn't in our allow-list (inbound is not restricted the way uploads are). */
function extensionFor(mimeType: string): string {
  const known: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "video/mp4": ".mp4",
    "application/pdf": ".pdf",
  };
  return known[mimeType] ?? ".bin";
}

export interface OutboundAttachment {
  storageKey: string;
  mimeType: string;
  originalName: string;
  kind: "IMAGE" | "VOICE" | "DOCUMENT";
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private gateway: RealtimeGateway,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
    @Inject(WHATSAPP_PROVIDER) private provider: WhatsappProvider,
  ) {}

  /** Employee side → WhatsApp: called by MessagesService when a conversation's channel is WhatsApp. */
  async sendOutbound(
    conversationId: string,
    senderUserId: string,
    body: string | undefined,
    attachment?: OutboundAttachment,
    replyToId?: string,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { client: true, whatsappAccount: true },
    });
    if (!conversation?.client || !conversation.whatsappAccount) {
      throw new NotFoundException("Conversation has no linked WhatsApp client/account");
    }

    const to = conversation.client.phoneE164.replace("+", "");
    const phoneNumberId = conversation.whatsappAccount.phoneNumberId;

    let waMessageId: string;
    if (attachment) {
      const buffer = await this.storage.read(attachment.storageKey);
      ({ waMessageId } = await this.provider.sendMedia({
        phoneNumberId,
        to,
        buffer,
        mimeType: attachment.mimeType,
        filename: attachment.originalName,
        kind: attachment.kind,
        caption: body,
      }));
    } else {
      ({ waMessageId } = await this.provider.sendText({ phoneNumberId, to, body: body ?? "" }));
    }

    return this.prisma.message.create({
      data: {
        conversationId,
        senderUserId,
        senderIsClient: false,
        channel: "WHATSAPP",
        type: attachment?.kind ?? "TEXT",
        body,
        waMessageId,
        replyToId,
      },
    });
  }

  /** Meta → Custodian: a client's inbound message, routed by phone_number_id to the right tenant. */
  async handleInboundMessages(value: WebhookChangeValue): Promise<void> {
    const phoneNumberId = value.metadata?.phone_number_id;
    if (!phoneNumberId || !value.messages?.length) return;

    const account = await this.prisma.whatsappAccount.findUnique({ where: { phoneNumberId } });
    if (!account) {
      this.logger.warn(`Inbound webhook for unknown phone_number_id=${phoneNumberId} — dropped`);
      return;
    }

    for (const msg of value.messages) {
      await this.ingestOneMessage(account.companyId, account.id, msg, value, phoneNumberId);
    }
  }

  /** Maps a WhatsApp message type onto our MessageType + the media payload it carries. */
  private mediaOf(msg: InboundMessage): {
    type: "TEXT" | "IMAGE" | "VOICE" | "DOCUMENT";
    media?: InboundMedia;
  } {
    switch (msg.type) {
      case "image":
        return { type: "IMAGE", media: msg.image };
      case "sticker":
        return { type: "IMAGE", media: msg.sticker };
      case "audio":
        return { type: "VOICE", media: msg.audio };
      case "video":
        // No dedicated VIDEO message type yet; treated as a document so the
        // file is at least preserved and downloadable rather than dropped.
        return { type: "DOCUMENT", media: msg.video };
      case "document":
        return { type: "DOCUMENT", media: msg.document };
      default:
        return { type: "TEXT" };
    }
  }

  private async ingestOneMessage(
    companyId: string,
    whatsappAccountId: string,
    msg: InboundMessage,
    value: WebhookChangeValue,
    phoneNumberId: string,
  ): Promise<void> {
    const phoneE164 = `+${msg.from}`;
    const contactName = value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name;

    const client = await this.findOrCreateClient(companyId, phoneE164, contactName);
    const conversation = await this.findOrCreateConversation(companyId, whatsappAccountId, client.id);

    const { type, media } = this.mediaOf(msg);
    const body = msg.text?.body ?? media?.caption ?? null;

    // If the client replied to one of our messages, thread it — Meta gives us
    // the original's wa id in `context`.
    let replyToId: string | undefined;
    if (msg.context?.id) {
      const original = await this.prisma.message.findUnique({
        where: { waMessageId: msg.context.id },
        select: { id: true },
      });
      replyToId = original?.id;
    }

    const created = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderIsClient: true,
        channel: "WHATSAPP",
        type,
        body,
        waMessageId: msg.id,
        replyToId,
      },
    });

    // Meta hosts inbound media only briefly, so pull the bytes into our own
    // storage now. A failure here must not lose the message itself — the text
    // and the fact that something was sent still get through.
    let attachment: { id: string; mimeType: string; sizeBytes: number; originalName: string | null } | null =
      null;
    if (media?.id) {
      try {
        const { buffer, mimeType } = await this.provider.downloadMedia({
          mediaId: media.id,
          phoneNumberId,
        });
        const rule = ALLOWED_MIME_TYPES[media.mime_type ?? mimeType];
        const { storageKey } = await this.storage.save(buffer, {
          extension: rule?.extension ?? extensionFor(media.mime_type ?? mimeType),
        });
        attachment = await this.prisma.attachment.create({
          data: {
            messageId: created.id,
            storageKey,
            mimeType: media.mime_type ?? mimeType,
            sizeBytes: buffer.length,
            checksum: createHash("sha256").update(buffer).digest("hex"),
            originalName: media.filename ?? null,
          },
          select: { id: true, mimeType: true, sizeBytes: true, originalName: true },
        });
      } catch (e) {
        this.logger.error(
          `Failed to fetch inbound ${msg.type} media ${media.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    this.gateway.broadcastMessage(conversation.id, {
      id: created.id,
      conversationId: conversation.id,
      senderUserId: null,
      senderName: null,
      senderIsClient: true,
      channel: "WHATSAPP",
      type: created.type,
      body: created.body,
      createdAt: created.createdAt.toISOString(),
      editedAt: null,
      deletedForAll: false,
      forwarded: false,
      attachment,
      replyTo: null,
      reactions: [],
      starred: false,
    });
  }

  private async findOrCreateClient(companyId: string, phoneE164: string, name?: string) {
    const existing = await this.prisma.client.findUnique({
      where: { companyId_phoneE164: { companyId, phoneE164 } },
    });
    if (existing) return existing;

    const displayCode = `CL-${Math.floor(10000 + Math.random() * 89999)}`;
    const created = await this.prisma.client.create({
      data: { companyId, phoneE164, name: name ?? "Unknown contact", displayCode },
    });

    await this.audit.record({
      companyId,
      action: "client.autocreate.whatsapp",
      target: `client:${created.id}`,
      after: { displayCode, source: "whatsapp-inbound" },
    });
    return created;
  }

  private async findOrCreateConversation(companyId: string, whatsappAccountId: string, clientId: string) {
    const existing = await this.prisma.conversation.findFirst({
      where: { companyId, clientId, type: "WHATSAPP" },
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: { companyId, type: "WHATSAPP", clientId, whatsappAccountId },
    });
  }

  async handleStatusUpdates(value: WebhookChangeValue): Promise<void> {
    if (!value.statuses?.length) return;
    for (const status of value.statuses) {
      await this.applyStatus(status);
    }
  }

  private async applyStatus(status: StatusUpdate): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { waMessageId: status.id },
      include: { conversation: true },
    });
    if (!message?.conversation.clientId) return;

    const timestamp = new Date(Number(status.timestamp) * 1000);
    await this.prisma.messageStatus.upsert({
      where: {
        messageId_participantType_participantId: {
          messageId: message.id,
          participantType: "CLIENT",
          participantId: message.conversation.clientId,
        },
      },
      create: {
        messageId: message.id,
        participantType: "CLIENT",
        participantId: message.conversation.clientId,
        deliveredAt: status.status === "delivered" || status.status === "read" ? timestamp : undefined,
        readAt: status.status === "read" ? timestamp : undefined,
      },
      update: {
        deliveredAt: status.status === "delivered" || status.status === "read" ? timestamp : undefined,
        readAt: status.status === "read" ? timestamp : undefined,
      },
    });

    this.gateway.broadcastStatus(message.conversationId, {
      messageId: message.id,
      status: status.status,
    });
  }
}
