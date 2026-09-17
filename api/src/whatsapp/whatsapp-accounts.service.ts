import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CryptoService } from "../crypto/crypto.service";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";

const GRAPH_API_VERSION = "v20.0";

export interface WhatsappAccountDto {
  id: string;
  wabaId: string;
  phoneNumberId: string;
  displayNumber: string;
  label: string | null;
  status: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  /** Masked, never the real value. Tells the admin a token is stored. */
  accessTokenMasked: string | null;
  hasAppSecret: boolean;
  hasVerifyToken: boolean;
  webhookUrl: string;
}

export interface UpsertAccountInput {
  wabaId: string;
  phoneNumberId: string;
  displayNumber: string;
  label?: string;
  accessToken?: string;
  appSecret?: string;
  verifyToken?: string;
}

@Injectable()
export class WhatsappAccountsService {
  private readonly logger = new Logger(WhatsappAccountsService.name);

  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private audit: AuditService,
  ) {}

  private publicBase(): string {
    return process.env.PUBLIC_API_URL ?? "https://your-server.example.com";
  }

  private isPrismaUnavailable(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes("Prisma startup skipped because DATABASE_URL is not a PostgreSQL connection string") ||
      message.includes("DATABASE_URL") ||
      message.includes("PrismaClientInitializationError") ||
      message.includes("Invalid `this.prisma") ||
      message.includes("Can't reach database server")
    );
  }

  private handleWritePathFailure(error: unknown): never {
    if (this.isPrismaUnavailable(error)) {
      this.logger.error("[WHATSAPP_ACCOUNTS] Database unavailable for legacy WhatsApp accounts flow");
      throw new ServiceUnavailableException(
        "WhatsApp account storage is temporarily unavailable because its database connection is not configured correctly yet.",
      );
    }
    throw error;
  }

  private toDto(a: {
    id: string;
    wabaId: string;
    phoneNumberId: string;
    displayNumber: string;
    label: string | null;
    status: string;
    lastCheckedAt: Date | null;
    lastError: string | null;
    accessTokenEnc: string | null;
    appSecretEnc: string | null;
    verifyTokenEnc: string | null;
  }): WhatsappAccountDto {
    let masked: string | null = null;
    if (a.accessTokenEnc) {
      try {
        masked = CryptoService.mask(this.crypto.decrypt(a.accessTokenEnc));
      } catch {
        // Usually means APP_ENCRYPTION_KEY changed since the token was saved.
        masked = "unreadable — re-enter";
      }
    }
    return {
      id: a.id,
      wabaId: a.wabaId,
      phoneNumberId: a.phoneNumberId,
      displayNumber: a.displayNumber,
      label: a.label,
      status: a.status,
      lastCheckedAt: a.lastCheckedAt?.toISOString() ?? null,
      lastError: a.lastError,
      accessTokenMasked: masked,
      hasAppSecret: !!a.appSecretEnc,
      hasVerifyToken: !!a.verifyTokenEnc,
      webhookUrl: `${this.publicBase()}/api/whatsapp/webhook`,
    };
  }

  async list(user: AuthenticatedUser): Promise<WhatsappAccountDto[]> {
    try {
      const rows = await this.prisma.whatsappAccount.findMany({
        where: { companyId: user.companyId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((r) => this.toDto(r));
    } catch (error) {
      if (this.isPrismaUnavailable(error)) {
        this.logger.warn("[WHATSAPP_ACCOUNTS] Returning empty list because the legacy Prisma data path is unavailable.");
        return [];
      }
      throw error;
    }
  }

  async upsert(input: UpsertAccountInput, user: AuthenticatedUser): Promise<WhatsappAccountDto> {
    try {
      if (!this.crypto.available && (input.accessToken || input.appSecret || input.verifyToken)) {
        throw new BadRequestException(
          "The server has no APP_ENCRYPTION_KEY set, so credentials can't be stored securely. Set it and restart before adding tokens.",
        );
      }

      const existing = await this.prisma.whatsappAccount.findUnique({
        where: { phoneNumberId: input.phoneNumberId },
      });
      if (existing && existing.companyId !== user.companyId) {
        throw new BadRequestException("That phone number ID is already registered.");
      }

      const secrets = {
        ...(input.accessToken ? { accessTokenEnc: this.crypto.encrypt(input.accessToken) } : {}),
        ...(input.appSecret ? { appSecretEnc: this.crypto.encrypt(input.appSecret) } : {}),
        ...(input.verifyToken ? { verifyTokenEnc: this.crypto.encrypt(input.verifyToken) } : {}),
      };

      const saved = existing
        ? await this.prisma.whatsappAccount.update({
            where: { id: existing.id },
            data: {
              wabaId: input.wabaId,
              displayNumber: input.displayNumber,
              label: input.label,
              ...secrets,
              ...(Object.keys(secrets).length ? { status: "UNVERIFIED" as const, lastError: null } : {}),
            },
          })
        : await this.prisma.whatsappAccount.create({
            data: {
              companyId: user.companyId,
              wabaId: input.wabaId,
              phoneNumberId: input.phoneNumberId,
              displayNumber: input.displayNumber,
              label: input.label,
              ...secrets,
            },
          });

      await this.audit.record({
        companyId: user.companyId,
        actorId: user.id,
        action: existing ? "whatsapp.account.update" : "whatsapp.account.create",
        target: `whatsapp:${saved.phoneNumberId}`,
        after: {
          displayNumber: saved.displayNumber,
          changed: Object.keys(secrets),
        },
      });

      return this.toDto(saved);
    } catch (error) {
      this.handleWritePathFailure(error);
    }
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    try {
      const account = await this.prisma.whatsappAccount.findFirst({
        where: { id, companyId: user.companyId },
      });
      if (!account) throw new NotFoundException("WhatsApp account not found");

      const linked = await this.prisma.conversation.count({ where: { whatsappAccountId: id } });
      if (linked > 0) {
        throw new BadRequestException(
          `This number has ${linked} conversation${linked === 1 ? "" : "s"} attached. Removing it would orphan that history — disconnect it in Meta instead, or contact support to migrate.`,
        );
      }

      await this.prisma.whatsappAccount.delete({ where: { id } });
      await this.audit.record({
        companyId: user.companyId,
        actorId: user.id,
        action: "whatsapp.account.delete",
        target: `whatsapp:${account.phoneNumberId}`,
      });
    } catch (error) {
      this.handleWritePathFailure(error);
    }
  }

  /** Resolve the live access token for a number. Used by the Meta provider. */
  async accessTokenFor(phoneNumberId: string): Promise<string | null> {
    const a = await this.prisma.whatsappAccount.findUnique({ where: { phoneNumberId } });
    if (!a) return null;
    if (a.accessTokenEnc) {
      try {
        return this.crypto.decrypt(a.accessTokenEnc);
      } catch {
        this.logger.error(`Could not decrypt token for ${phoneNumberId} — APP_ENCRYPTION_KEY changed?`);
        return null;
      }
    }
    // Fall back to the env-var path for installs configured before the UI existed.
    return a.accessTokenRef ? (process.env[a.accessTokenRef] ?? null) : null;
  }

  async appSecretFor(phoneNumberId: string): Promise<string | null> {
    const a = await this.prisma.whatsappAccount.findUnique({ where: { phoneNumberId } });
    if (!a?.appSecretEnc) return null;
    try {
      return this.crypto.decrypt(a.appSecretEnc);
    } catch {
      return null;
    }
  }

  async verifyTokenMatches(candidate: string): Promise<boolean> {
    const accounts = await this.prisma.whatsappAccount.findMany({
      where: { verifyTokenEnc: { not: null } },
      select: { verifyTokenEnc: true },
    });
    for (const a of accounts) {
      try {
        if (a.verifyTokenEnc && this.crypto.decrypt(a.verifyTokenEnc) === candidate) return true;
      } catch {
        /* skip undecryptable rows */
      }
    }
    return false;
  }

  /**
   * Calls Meta to confirm the token actually works for this number, so an
   * admin finds out here rather than when the first client message fails.
   */
  async testConnection(id: string, user: AuthenticatedUser): Promise<WhatsappAccountDto> {
    try {
      const account = await this.prisma.whatsappAccount.findFirst({
        where: { id, companyId: user.companyId },
      });
      if (!account) throw new NotFoundException("WhatsApp account not found");

      const token = await this.accessTokenFor(account.phoneNumberId);
      if (!token) {
        return this.finishTest(account.id, "ERROR", "No access token stored for this number.");
      }

      try {
        const res = await fetch(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/${account.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          return this.finishTest(
            account.id,
            "ERROR",
            body.error?.message ?? `Meta returned ${res.status}`,
          );
        }
        const info = (await res.json()) as { display_phone_number?: string; verified_name?: string };
        await this.prisma.whatsappAccount.update({
          where: { id: account.id },
          data: {
            displayNumber: info.display_phone_number ?? account.displayNumber,
            label: account.label ?? info.verified_name ?? null,
          },
        });
        return this.finishTest(account.id, "CONNECTED", null);
      } catch (e) {
        return this.finishTest(
          account.id,
          "ERROR",
          e instanceof Error ? e.message : "Could not reach Meta",
        );
      }
    } catch (error) {
      this.handleWritePathFailure(error);
    }
  }

  private async finishTest(
    id: string,
    status: "CONNECTED" | "ERROR",
    error: string | null,
  ): Promise<WhatsappAccountDto> {
    const updated = await this.prisma.whatsappAccount.update({
      where: { id },
      data: { status, lastError: error, lastCheckedAt: new Date() },
    });
    return this.toDto(updated);
  }
}
