import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { ConversationsService } from "../conversations/conversations.service";
import { STORAGE_PROVIDER, StorageProvider } from "../storage/storage-provider.interface";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { ALLOWED_MIME_TYPES } from "./attachment-limits";
import { PolicyService } from "../policy/policy.service";

export interface UploadDescriptor {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  originalName: string;
  kind: "IMAGE" | "VOICE" | "DOCUMENT";
}

@Injectable()
export class AttachmentsService {
  constructor(
    private prisma: PrismaService,
    private conversations: ConversationsService,
    private policy: PolicyService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
  ) {}

  /**
   * Uploading is deliberately a separate step from sending a message: the
   * file lands here first (no DB row, no conversation linkage yet), and
   * MessagesService links it to a real Attachment row only once the message
   * that carries it is actually created — see messages.service.ts.
   */
  async upload(file: Express.Multer.File): Promise<UploadDescriptor> {
    const rule = ALLOWED_MIME_TYPES[file.mimetype];
    if (!rule) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }
    if (file.size > rule.maxBytes) {
      throw new BadRequestException(`File exceeds the ${Math.round(rule.maxBytes / 1024 / 1024)}MB limit for this type`);
    }

    const checksum = createHash("sha256").update(file.buffer).digest("hex");
    const { storageKey } = await this.storage.save(file.buffer, { extension: rule.extension });

    return {
      storageKey,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      checksum,
      originalName: file.originalname,
      kind: rule.kind,
    };
  }

  /** Same checks as a download, without reading the bytes — used before signing a URL. */
  async assertReadable(attachmentId: string, user: AuthenticatedUser): Promise<void> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { message: true },
    });
    if (!attachment) throw new NotFoundException("Attachment not found");
    await this.conversations.assertVisible(attachment.message.conversationId, user);
    await this.policy.assertFeature(user.id, "downloadAttachments", "Downloading attachments");
  }

  async getContentForDownload(
    attachmentId: string,
    user: AuthenticatedUser,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { message: true },
    });
    if (!attachment) throw new NotFoundException("Attachment not found");

    // Authorization is "can this user see the conversation this attachment's
    // message belongs to" — the same check messages themselves go through,
    // so a client's uploaded ID card can't be fetched by URL guessing.
    await this.conversations.assertVisible(attachment.message.conversationId, user);

    // Separate switch: an employee may be allowed to *see* that a file exists
    // in a thread without being allowed to pull the bytes out of the company.
    await this.policy.assertFeature(user.id, "downloadAttachments", "Downloading attachments");

    const buffer = await this.storage.read(attachment.storageKey);
    return {
      buffer,
      mimeType: attachment.mimeType,
      filename: attachment.originalName ?? attachment.storageKey,
    };
  }
}
