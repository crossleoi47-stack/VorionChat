import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ConversationsService } from "../conversations/conversations.service";
import { WhatsappService } from "../whatsapp/whatsapp.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { SendMessageDto } from "./dto/send-message.dto";
import { PolicyService } from "../policy/policy.service";

export interface MessageAttachmentDto {
  id: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string | null;
}

export interface ReactionDto {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface ReplyPreviewDto {
  id: string;
  senderLabel: string;
  text: string;
  kind: string;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  senderUserId: string | null;
  senderName: string | null;
  senderIsClient: boolean;
  channel: string;
  type: string;
  body: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedForAll: boolean;
  forwarded: boolean;
  attachment: MessageAttachmentDto | null;
  replyTo: ReplyPreviewDto | null;
  reactions: ReactionDto[];
  starred: boolean;
  deliveredAt?: string | null;
  readAt?: string | null;
}

type RawMessage = {
  id: string;
  conversationId: string;
  senderUserId: string | null;
  senderIsClient: boolean;
  channel: string;
  type: string;
  body: string | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedForAll: boolean;
  forwarded: boolean;
  senderUser?: { fullName: string } | null;
  attachments?: { id: string; mimeType: string; sizeBytes: number; originalName: string | null }[];
  reactions?: { emoji: string; userId: string | null }[];
  stars?: { userId: string }[];
  replyTo?: {
    id: string;
    body: string | null;
    type: string;
    senderIsClient: boolean;
    senderUser?: { fullName: string } | null;
  } | null;
};

const INCLUDE = {
  senderUser: { select: { fullName: true } },
  attachments: true,
  reactions: true,
  stars: true,
  replyTo: { include: { senderUser: { select: { fullName: true } } } },
} as const;

/** Outbound WhatsApp text carries a `*Name:* ` prefix; strip it for previews. */
function stripPrefix(body: string | null): string {
  if (!body) return "";
  const m = body.match(/^\*(.+?):\*\s([\s\S]*)$/);
  return m ? m[2] : body;
}

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private conversations: ConversationsService,
    private whatsapp: WhatsappService,
    private gateway: RealtimeGateway,
    private policy: PolicyService,
  ) {}

  async listForConversation(conversationId: string, user: AuthenticatedUser): Promise<MessageDto[]> {
    await this.conversations.assertVisible(conversationId, user);
    const messages = await this.prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: INCLUDE,
    });
    return messages.map((m) => this.toDto(m as RawMessage, user.id));
  }

  async send(conversationId: string, user: AuthenticatedUser, dto: SendMessageDto): Promise<MessageDto> {
    if (!dto.body?.trim() && !dto.attachment) {
      throw new BadRequestException("Message needs a body or an attachment");
    }
    await this.conversations.assertVisible(conversationId, user);

    // Feature switches, then DLP. Both run before anything is persisted or
    // sent, so a blocked message never reaches the client or the database.
    if (dto.attachment) {
      const kindNow = dto.type ?? "DOCUMENT";
      if (kindNow === "VOICE") {
        await this.policy.assertFeature(user.id, "sendVoice", "Sending voice messages");
      } else {
        await this.policy.assertFeature(user.id, "sendMedia", "Sending photos and documents");
      }
    }
    await this.policy.screenOutgoing(user, dto.body, conversationId);

    const conversation = await this.prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    const kind = dto.attachment ? (dto.type ?? "DOCUMENT") : undefined;

    let message;
    if (conversation.type === "WHATSAPP") {
      // Shared-inbox model: the client's WhatsApp thread has no concept of
      // "which employee", so the sender's name is prefixed onto the text.
      const sender = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const prefixed = dto.body ? `*${sender.fullName}:* ${dto.body}` : undefined;
      message = await this.whatsapp.sendOutbound(
        conversationId,
        user.id,
        prefixed,
        dto.attachment && kind && kind !== "TEXT"
          ? {
              storageKey: dto.attachment.storageKey,
              mimeType: dto.attachment.mimeType,
              originalName: dto.attachment.originalName ?? dto.attachment.storageKey,
              kind: kind as "IMAGE" | "VOICE" | "DOCUMENT",
            }
          : undefined,
        dto.replyToId,
      );
    } else {
      message = await this.prisma.message.create({
        data: {
          conversationId,
          senderUserId: user.id,
          senderIsClient: false,
          channel: "INTERNAL",
          type: dto.type ?? "TEXT",
          body: dto.body,
          replyToId: dto.replyToId,
        },
      });
    }

    if (dto.attachment) {
      await this.prisma.attachment.create({
        data: {
          messageId: message.id,
          storageKey: dto.attachment.storageKey,
          mimeType: dto.attachment.mimeType,
          sizeBytes: dto.attachment.sizeBytes,
          checksum: dto.attachment.checksum,
          originalName: dto.attachment.originalName,
        },
      });
    }

    return this.reloadAndBroadcast(message.id, conversationId, user.id, "message:new");
  }

  /** WhatsApp semantics: reacting with the same emoji twice removes it; a different emoji replaces. */
  async react(messageId: string, user: AuthenticatedUser, emoji: string): Promise<MessageDto> {
    const message = await this.loadVisible(messageId, user);

    const existing = await this.prisma.messageReaction.findFirst({
      where: { messageId, userId: user.id },
    });

    if (!emoji || (existing && existing.emoji === emoji)) {
      if (existing) await this.prisma.messageReaction.delete({ where: { id: existing.id } });
    } else if (existing) {
      await this.prisma.messageReaction.update({ where: { id: existing.id }, data: { emoji } });
    } else {
      await this.prisma.messageReaction.create({ data: { messageId, userId: user.id, emoji } });
    }

    return this.reloadAndBroadcast(messageId, message.conversationId, user.id, "message:update");
  }

  async star(messageId: string, user: AuthenticatedUser): Promise<MessageDto> {
    const message = await this.loadVisible(messageId, user);
    const existing = await this.prisma.messageStar.findUnique({
      where: { messageId_userId: { messageId, userId: user.id } },
    });
    if (existing) {
      await this.prisma.messageStar.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.messageStar.create({ data: { messageId, userId: user.id } });
    }
    // Starring is private, so this one isn't broadcast to the room.
    const fresh = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      include: INCLUDE,
    });
    return this.toDto(fresh as RawMessage, user.id);
  }

  async edit(messageId: string, user: AuthenticatedUser, body: string): Promise<MessageDto> {
    const message = await this.loadVisible(messageId, user);
    if (message.senderUserId !== user.id) {
      throw new ForbiddenException("You can only edit your own messages");
    }
    if (message.channel === "WHATSAPP") {
      // Meta exposes no edit API — silently "editing" our copy would show the
      // client the original text while staff saw the new one. Refuse instead.
      throw new BadRequestException(
        "WhatsApp does not allow editing a delivered message. Send a correction instead.",
      );
    }
    await this.prisma.message.update({
      where: { id: messageId },
      data: { body, editedAt: new Date() },
    });
    return this.reloadAndBroadcast(messageId, message.conversationId, user.id, "message:update");
  }

  async remove(messageId: string, user: AuthenticatedUser, forEveryone: boolean): Promise<MessageDto> {
    const message = await this.loadVisible(messageId, user);
    if (forEveryone && message.senderUserId !== user.id) {
      throw new ForbiddenException("You can only unsend your own messages");
    }
    if (forEveryone && message.channel === "WHATSAPP") {
      throw new BadRequestException(
        "WhatsApp does not allow unsending a delivered message. It stays on the client's phone.",
      );
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: forEveryone
        ? { deletedForAll: true, body: null }
        : { deletedAt: new Date() },
    });

    return this.reloadAndBroadcast(messageId, message.conversationId, user.id, "message:update");
  }

  async forward(messageId: string, user: AuthenticatedUser, toConversationId: string): Promise<MessageDto> {
    await this.policy.assertFeature(user.id, "forwardMessages", "Forwarding messages");
    const source = await this.loadVisible(messageId, user);
    await this.conversations.assertVisible(toConversationId, user);

    const attachment = await this.prisma.attachment.findFirst({ where: { messageId } });
    const text = stripPrefix(source.body);

    const dto: SendMessageDto = {
      body: text || undefined,
      type: (source.type as SendMessageDto["type"]) ?? "TEXT",
      attachment: attachment
        ? {
            storageKey: attachment.storageKey,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            checksum: attachment.checksum,
            originalName: attachment.originalName ?? undefined,
          }
        : undefined,
    };

    const created = await this.send(toConversationId, user, dto);
    await this.prisma.message.update({ where: { id: created.id }, data: { forwarded: true } });
    return { ...created, forwarded: true };
  }

  private async loadVisible(messageId: string, user: AuthenticatedUser) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException("Message not found");
    // Every action re-checks conversation visibility — an id alone is never
    // enough to act on a message.
    await this.conversations.assertVisible(message.conversationId, user);
    return message;
  }

  private async reloadAndBroadcast(
    messageId: string,
    conversationId: string,
    viewerId: string,
    event: "message:new" | "message:update",
  ): Promise<MessageDto> {
    const fresh = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      include: INCLUDE,
    });
    // Broadcast without the viewer's private flags (starred/mine) resolved —
    // each client re-derives those from its own session.
    this.gateway.broadcast(conversationId, event, this.toDto(fresh as RawMessage, null));
    return this.toDto(fresh as RawMessage, viewerId);
  }

  private toDto(m: RawMessage, viewerId: string | null): MessageDto {
    const att = m.attachments?.[0] ?? null;

    const grouped = new Map<string, { count: number; mine: boolean }>();
    for (const r of m.reactions ?? []) {
      const cur = grouped.get(r.emoji) ?? { count: 0, mine: false };
      cur.count += 1;
      if (viewerId && r.userId === viewerId) cur.mine = true;
      grouped.set(r.emoji, cur);
    }

    return {
      id: m.id,
      conversationId: m.conversationId,
      senderUserId: m.senderUserId,
      senderName: m.senderUser?.fullName ?? null,
      senderIsClient: m.senderIsClient,
      channel: m.channel,
      type: m.type,
      body: m.deletedForAll ? null : m.body,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt ? m.editedAt.toISOString() : null,
      deletedForAll: m.deletedForAll,
      forwarded: m.forwarded,
      attachment:
        att && !m.deletedForAll
          ? {
              id: att.id,
              mimeType: att.mimeType,
              sizeBytes: att.sizeBytes,
              originalName: att.originalName,
            }
          : null,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            senderLabel: m.replyTo.senderIsClient
              ? "Client"
              : (m.replyTo.senderUser?.fullName ?? "You"),
            text: stripPrefix(m.replyTo.body) || m.replyTo.type.toLowerCase(),
            kind: m.replyTo.type,
          }
        : null,
      reactions: [...grouped.entries()].map(([emoji, v]) => ({ emoji, ...v })),
      starred: viewerId ? (m.stars ?? []).some((s) => s.userId === viewerId) : false,
    };
  }
}
