export interface SendTextResult {
  waMessageId: string;
}

/**
 * Everything the rest of the system needs from WhatsApp, behind one
 * interface — swap MockWhatsappProvider for MetaWhatsappProvider via
 * WHATSAPP_PROVIDER=meta once real WABA credentials exist (blueprint §17).
 * Nothing outside src/whatsapp/ imports a concrete provider directly.
 */
export interface WhatsappProvider {
  sendText(params: { phoneNumberId: string; to: string; body: string }): Promise<SendTextResult>;

  sendTemplate(params: {
    phoneNumberId: string;
    to: string;
    templateName: string;
    languageCode: string;
    variables: string[];
  }): Promise<SendTextResult>;

  /**
   * Fetch media a client sent us. Meta hosts it only temporarily, so this is
   * called during webhook processing and the bytes are copied into our own
   * storage immediately.
   */
  downloadMedia(params: {
    mediaId: string;
    phoneNumberId: string;
  }): Promise<{ buffer: Buffer; mimeType: string }>;

  sendMedia(params: {
    phoneNumberId: string;
    to: string;
    buffer: Buffer;
    mimeType: string;
    filename: string;
    kind: "IMAGE" | "VOICE" | "DOCUMENT";
    caption?: string;
  }): Promise<SendTextResult>;
}

export const WHATSAPP_PROVIDER = Symbol("WHATSAPP_PROVIDER");
