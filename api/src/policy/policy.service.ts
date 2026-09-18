import { ForbiddenException, Injectable } from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { SupabaseService } from "../supabase/supabase.service";
import { Feature, FeatureMap, resolveFeatures } from "./features";
import { mapSupabaseRoleToApp } from "../users/user-compat";
import { DEFAULT_DLP, DlpConfig, DlpHit, describeHits, scanText } from "./dlp";

interface CompanySettings {
  dlp?: Partial<DlpConfig>;
  roleFeatures?: Partial<Record<Role, Partial<FeatureMap>>>;
}

@Injectable()
export class PolicyService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private supabase: SupabaseService,
  ) {}

  private async settings(companyId: string): Promise<CompanySettings> {
    return (await this.supabase.getCompanySettings(companyId)) as CompanySettings;
  }

  async featuresFor(userId: string): Promise<FeatureMap> {
    if (!this.prisma.isConfigured) {
      const user = await this.supabase.getUserById(userId);
      if (!user) return resolveFeatures("EMPLOYEE", undefined, undefined);
      return resolveFeatures(mapSupabaseRoleToApp(user.role) as Role, undefined, undefined);
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { role: true, companyId: true, featureOverrides: true },
    });
    const s = await this.settings(user.companyId);
    return resolveFeatures(
      user.role,
      s.roleFeatures?.[user.role],
      (user.featureOverrides as Partial<FeatureMap>) ?? undefined,
    );
  }

  /** Throws unless the feature is enabled for this user. */
  async assertFeature(userId: string, feature: Feature, whatTheyTried: string): Promise<void> {
    const features = await this.featuresFor(userId);
    if (!features[feature]) {
      throw new ForbiddenException(`${whatTheyTried} has been disabled for your account`);
    }
  }

  async dlpConfig(companyId: string): Promise<DlpConfig> {
    const s = await this.settings(companyId);
    return { ...DEFAULT_DLP, ...(s.dlp ?? {}) };
  }

  /**
   * Runs DLP over an outgoing message. Returns the hits so the caller can
   * mark the message; throws when the company's policy is "block".
   * Every hit is written to the audit log regardless of mode — the point of
   * "warn" is to build evidence, not to stay silent.
   */
  async screenOutgoing(
    user: AuthenticatedUser,
    text: string | undefined,
    conversationId: string,
  ): Promise<DlpHit[]> {
    if (!text?.trim()) return [];
    const config = await this.dlpConfig(user.companyId);
    const hits = scanText(text, config);
    if (hits.length === 0) return [];

    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: `dlp.${config.mode}`,
      target: `conversation:${conversationId}`,
      after: {
        mode: config.mode,
        hits: hits.map((h) => ({ kind: h.kind, match: h.match })),
        // The message text itself is deliberately not copied into the audit
        // row — the conversation already holds it, and duplicating client
        // content into a second store widens the blast radius of a leak.
      },
    });

    if (config.mode === "block") {
      throw new ForbiddenException(
        `Blocked: this message appears to contain ${describeHits(hits)}. Company policy doesn't allow sharing that here.`,
      );
    }
    return hits;
  }

  async setUserOverrides(
    targetUserId: string,
    overrides: Partial<FeatureMap>,
    admin: AuthenticatedUser,
  ): Promise<FeatureMap> {
    const target = await this.prisma.user.findFirstOrThrow({
      where: { id: targetUserId, companyId: admin.companyId },
      select: { id: true, featureOverrides: true },
    });

    const before = (target.featureOverrides as Partial<FeatureMap>) ?? {};
    const merged = { ...before, ...overrides };

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { featureOverrides: merged },
    });

    await this.audit.record({
      companyId: admin.companyId,
      actorId: admin.id,
      action: "user.features.update",
      target: `user:${targetUserId}`,
      before,
      after: merged,
    });

    return this.featuresFor(targetUserId);
  }

  async setDlp(config: Partial<DlpConfig>, admin: AuthenticatedUser): Promise<DlpConfig> {
    const s = await this.settings(admin.companyId);
    const before = { ...DEFAULT_DLP, ...(s.dlp ?? {}) };
    const next = { ...before, ...config };

    await this.supabase.updateCompanySettings(admin.companyId, { ...s, dlp: next });

    await this.audit.record({
      companyId: admin.companyId,
      actorId: admin.id,
      action: "company.dlp.update",
      target: `company:${admin.companyId}`,
      before,
      after: next,
    });

    return next;
  }
}
