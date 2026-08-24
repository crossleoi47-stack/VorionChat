import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { SendTextResult, WhatsappProvider } from "../whatsapp-provider.interface";

/**
 * Default provider until a real WhatsApp Business Account exists (see the
 * blueprint's "0.5 — WhatsApp prerequisites" roadmap step). Logs what would
 * have been sent and returns a fake message id so the rest of the send/
 * receive pipeline — persistence, conversation threading, delivery status —
 * can be built and tested without live Meta credentials.
 */
@Injectable()
export class MockWhatsappProvider implements WhatsappProvider {
  private readonly logger = new Logger(MockWhatsappProvider.name);

  async sendText(params: { phoneNumberId: string; to: string; body: string }): Promise<SendTextResult> {
    const waMessageId = `mock.${randomUUID()}`;
    this.logger.log(
      `[MOCK SEND] from phoneNumberId=${params.phoneNumberId} to=${params.to}: "${params.body}" (id=${waMessageId})`,
    );
    return { waMessageId };
  }

  /**
   * Returns a tiny generated PNG so the inbound-media path can be exercised
   * end to end without a real WhatsApp Business Account.
   */
  async downloadMedia(params: {
    mediaId: string;
    phoneNumberId: string;
  }): Promise<{ buffer: Buffer; mimeType: string }> {
    this.logger.log(`[MOCK DOWNLOAD] mediaId=${params.mediaId}`);
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAKklEQVRYhe3OMQEAAAgDoJnc" +
      "6BpjHyRgctIAAAAAAAAAAAAAAAAAAAB4NQZUAAGb0y0nAAAAAElFTkSuQmCC";
    return { buffer: Buffer.from(pngBase64, "base64"), mimeType: "image/png" };
  }

  async sendMedia(params: {
    phoneNumberId: string;
    to: string;
    buffer: Buffer;
    mimeType: string;
    filename: string;
    kind: "IMAGE" | "VOICE" | "DOCUMENT";
    caption?: string;
  }): Promise<SendTextResult> {
    const waMessageId = `mock.${randomUUID()}`;
    this.logger.log(
      `[MOCK SEND ${params.kind}] from phoneNumberId=${params.phoneNumberId} to=${params.to}: ` +
        `${params.filename} (${params.mimeType}, ${params.buffer.length} bytes)` +
        `${params.caption ? ` caption="${params.caption}"` : ""} (id=${waMessageId})`,
    );
    return { waMessageId };
  }

  async sendTemplate(params: {
    phoneNumberId: string;
    to: string;
    templateName: string;
    languageCode: string;
    variables: string[];
  }): Promise<SendTextResult> {
    const waMessageId = `mock.${randomUUID()}`;
    this.logger.log(
      `[MOCK SEND TEMPLATE] from phoneNumberId=${params.phoneNumberId} to=${params.to}: ` +
        `${params.templateName}/${params.languageCode} ${JSON.stringify(params.variables)} (id=${waMessageId})`,
    );
    return { waMessageId };
  }
}
