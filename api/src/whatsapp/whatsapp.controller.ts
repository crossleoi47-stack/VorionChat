import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { Public } from "../auth/public.decorator";
import { WhatsappService } from "./whatsapp.service";
import { verifyMetaSignature } from "./signature.util";
import { WebhookEnvelope } from "./webhook-payload.types";
import { WhatsappAccountsService } from "./whatsapp-accounts.service";

@Controller("whatsapp/webhook")
export class WhatsappController {
  constructor(
    private whatsapp: WhatsappService,
    private config: ConfigService,
    private accounts: WhatsappAccountsService,
  ) {}

  /**
   * Meta's one-time subscription handshake. The verify token is whatever the
   * admin entered under Settings → WhatsApp for that number; the env var is
   * kept as a fallback for installs configured before that screen existed.
   */
  @Public()
  @Get()
  async verify(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
  ) {
    if (mode !== "subscribe" || !token) throw new ForbiddenException("Invalid verify token");

    const fromEnv = this.config.get<string>("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
    if (fromEnv && token === fromEnv) return challenge;
    if (await this.accounts.verifyTokenMatches(token)) return challenge;

    throw new ForbiddenException("Invalid verify token");
  }

  @Public()
  @Post()
  async receive(@Body() body: WebhookEnvelope, @Req() req: Request) {
    const signature = req.headers["x-hub-signature-256"] as string | undefined;

    // Prefer the per-number app secret stored via Settings → WhatsApp; fall
    // back to the env var. Whichever is present, the signature is enforced.
    const phoneNumberId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    const appSecret =
      (phoneNumberId ? await this.accounts.appSecretFor(phoneNumberId) : null) ??
      this.config.get<string>("WHATSAPP_APP_SECRET");

    // With no app secret configured at all (mock/dev), signature checks are
    // skipped so local testing works without a real Meta app — never run
    // production without one.
    if (appSecret) {
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      if (!rawBody || !verifyMetaSignature(rawBody, signature, appSecret)) {
        throw new ForbiddenException("Invalid webhook signature");
      }
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (!change.value) continue;
        await this.whatsapp.handleInboundMessages(change.value);
        await this.whatsapp.handleStatusUpdates(change.value);
      }
    }

    return { ok: true };
  }
}
