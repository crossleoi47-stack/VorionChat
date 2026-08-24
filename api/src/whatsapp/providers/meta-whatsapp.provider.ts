import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SendTextResult, WhatsappProvider } from "../whatsapp-provider.interface";
import { WhatsappAccountsService } from "../whatsapp-accounts.service";

const GRAPH_API_VERSION = "v20.0";

/**
 * Real integration against the WhatsApp Business Platform (Cloud API).
 * Only active when WHATSAPP_PROVIDER=meta — otherwise MockWhatsappProvider
 * is used (see whatsapp.module.ts). Requires a WhatsappAccount whose
 * accessTokenRef resolves to a real Meta access token.
 */
@Injectable()
export class MetaWhatsappProvider implements WhatsappProvider {
  private readonly logger = new Logger(MetaWhatsappProvider.name);

  constructor(
    private config: ConfigService,
    private accounts: WhatsappAccountsService,
  ) {}

  async sendText(params: { phoneNumberId: string; to: string; body: string }): Promise<SendTextResult> {
    return this.call(params.phoneNumberId, {
      messaging_product: "whatsapp",
      to: params.to,
      type: "text",
      text: { body: params.body },
    });
  }

  async sendTemplate(params: {
    phoneNumberId: string;
    to: string;
    templateName: string;
    languageCode: string;
    variables: string[];
  }): Promise<SendTextResult> {
    return this.call(params.phoneNumberId, {
      messaging_product: "whatsapp",
      to: params.to,
      type: "template",
      template: {
        name: params.templateName,
        language: { code: params.languageCode },
        components: params.variables.length
          ? [{ type: "body", parameters: params.variables.map((text) => ({ type: "text", text })) }]
          : [],
      },
    });
  }

  /**
   * Inbound media is also two calls: resolve the media id to a short-lived
   * CDN URL, then fetch the bytes — and the second request needs the bearer
   * token too, which is easy to miss. Meta expires this hosting quickly, so
   * callers must copy the result into our own storage right away.
   */
  async downloadMedia(params: {
    mediaId: string;
    phoneNumberId: string;
  }): Promise<{ buffer: Buffer; mimeType: string }> {
    const accessToken = await this.resolveAccessToken(params.phoneNumberId);

    const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${params.mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) {
      this.logger.error(`Media lookup failed (${metaRes.status}): ${await metaRes.text()}`);
      throw new InternalServerErrorException("WhatsApp media lookup failed");
    }
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
    if (!meta.url) throw new InternalServerErrorException("WhatsApp media lookup returned no URL");

    const binRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!binRes.ok) {
      this.logger.error(`Media download failed (${binRes.status})`);
      throw new InternalServerErrorException("WhatsApp media download failed");
    }

    return {
      buffer: Buffer.from(await binRes.arrayBuffer()),
      mimeType: meta.mime_type ?? "application/octet-stream",
    };
  }

  /**
   * Media sends are two Graph API calls: upload the bytes to get a media
   * id, then send a message referencing it. Written against Meta's
   * documented shape but — like the rest of this provider — never
   * exercised against a real WhatsApp Business Account in this codebase;
   * verify against a real sandbox number before trusting it in production.
   */
  async sendMedia(params: {
    phoneNumberId: string;
    to: string;
    buffer: Buffer;
    mimeType: string;
    filename: string;
    kind: "IMAGE" | "VOICE" | "DOCUMENT";
    caption?: string;
  }): Promise<SendTextResult> {
    const accessToken = await this.resolveAccessToken(params.phoneNumberId);

    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", new Blob([Uint8Array.from(params.buffer)], { type: params.mimeType }), params.filename);

    const uploadRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${params.phoneNumberId}/media`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: form },
    );
    if (!uploadRes.ok) {
      this.logger.error(`WhatsApp media upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
      throw new InternalServerErrorException("WhatsApp media upload failed");
    }
    const { id: mediaId } = (await uploadRes.json()) as { id: string };

    const typeKey = params.kind === "IMAGE" ? "image" : params.kind === "VOICE" ? "audio" : "document";
    return this.call(params.phoneNumberId, {
      messaging_product: "whatsapp",
      to: params.to,
      type: typeKey,
      [typeKey]: {
        id: mediaId,
        ...(params.kind !== "VOICE" && params.caption ? { caption: params.caption } : {}),
        ...(params.kind === "DOCUMENT" ? { filename: params.filename } : {}),
      },
    });
  }

  /**
   * Tokens now live encrypted in the database, entered through the WhatsApp
   * settings screen, so nobody has to edit a server config file to connect a
   * number. Falls back to the env-var path for installs configured before
   * that screen existed.
   */
  private async resolveAccessToken(phoneNumberId: string): Promise<string> {
    const token =
      (await this.accounts.accessTokenFor(phoneNumberId)) ??
      this.config.get<string>(`WHATSAPP_TOKEN__${phoneNumberId}`);
    if (!token) {
      throw new InternalServerErrorException(
        `No WhatsApp access token configured for ${phoneNumberId}. Add it under Settings → WhatsApp.`,
      );
    }
    return token;
  }

  private async call(phoneNumberId: string, body: Record<string, unknown>): Promise<SendTextResult> {
    // NOTE: the caller (WhatsappService) is expected to have already looked
    // up the WhatsappAccount and resolved its accessTokenRef; phoneNumberId
    // alone isn't a secret, but wiring the token lookup here keeps every
    // outbound call — text or template — funneled through one place.
    const accessToken = await this.resolveAccessToken(phoneNumberId);

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`WhatsApp send failed (${res.status}): ${text}`);
      throw new InternalServerErrorException("WhatsApp send failed");
    }

    const json = (await res.json()) as { messages?: { id: string }[] };
    const waMessageId = json.messages?.[0]?.id;
    if (!waMessageId) throw new InternalServerErrorException("WhatsApp send returned no message id");
    return { waMessageId };
  }
}
