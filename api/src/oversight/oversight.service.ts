import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";

export interface OversightConversationDto {
  id: string;
  type: string;
  title: string;
  clientDisplayCode: string | null;
  ownerName: string | null;
  messageCount: number;
  lastMessageAt: string | null;
}

export interface OversightMessageDto {
  id: string;
  senderName: string;
  senderIsClient: boolean;
  body: string | null;
  type: string;
  createdAt: string;
  hasAttachment: boolean;
}

export interface AnomalyDto {
  userId: string;
  fullName: string;
  employeeCode: string;
  phoneReads: number;
  dlpHits: number;
  exports: number;
  severity: "high" | "medium";
  reasons: string[];
}

const PRIVILEGED = new Set(["COMPANY_ADMIN", "SUPER_ADMIN", "AUDITOR"]);

/**
 * Outbound WhatsApp text carries a `*Name:* ` prefix so the client knows who
 * replied. That's a transport detail — strip it here so a reviewer reads the
 * conversation, not our wire format.
 */
function stripPrefix(body: string | null): string | null {
  if (!body) return body;
  const m = body.match(/^\*(.+?):\*\s([\s\S]*)$/);
  return m ? m[2] : body;
}

@Injectable()
export class OversightService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private assertOversight(user: AuthenticatedUser) {
    if (!PRIVILEGED.has(user.role)) {
      throw new ForbiddenException("Oversight is limited to admins and auditors");
    }
  }

  async conversations(user: AuthenticatedUser): Promise<OversightConversationDto[]> {
    this.assertOversight(user);
    // The active deployment uses Supabase REST and may not have DATABASE_URL
    // configured for the legacy Prisma oversight queries yet.
    if (!this.prisma.isConfigured) return [];

    const rows = await this.prisma.conversation.findMany({
      where: { companyId: user.companyId },
      include: {
        client: {
          include: {
            assignments: {
              where: { unassignedAt: null },
              include: { user: { select: { fullName: true } } },
              take: 1,
            },
          },
        },
        group: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return rows.map((c) => ({
      id: c.id,
      type: c.type,
      title: c.client?.name ?? c.group?.name ?? "Direct chat",
      clientDisplayCode: c.client?.displayCode ?? null,
      ownerName: c.client?.assignments[0]?.user.fullName ?? null,
      messageCount: c._count.messages,
      lastMessageAt: c.messages[0]?.createdAt.toISOString() ?? null,
    }));
  }

  /**
   * Reading someone else's conversation is a real privilege, so the act of
   * opening it is itself written to the audit log. An admin can look at
   * anything — but never invisibly.
   */
  async readConversation(
    conversationId: string,
    user: AuthenticatedUser,
  ): Promise<OversightMessageDto[]> {
    this.assertOversight(user);
    if (!this.prisma.isConfigured) return [];

    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, companyId: user.companyId },
      include: { client: true, group: true },
    });
    if (!conversation) throw new NotFoundException("Conversation not found");

    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: "oversight.conversation.read",
      target: `conversation:${conversationId}`,
      after: {
        type: conversation.type,
        subject: conversation.client?.displayCode ?? conversation.group?.name ?? null,
      },
    });

    const messages = await this.prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { senderUser: { select: { fullName: true } }, attachments: { select: { id: true } } },
    });

    return messages.map((m) => ({
      id: m.id,
      senderName: m.senderIsClient
        ? (conversation.client?.name ?? "Client")
        : (m.senderUser?.fullName ?? "Unknown"),
      senderIsClient: m.senderIsClient,
      body: m.deletedForAll ? null : stripPrefix(m.body),
      type: m.type,
      createdAt: m.createdAt.toISOString(),
      hasAttachment: m.attachments.length > 0,
    }));
  }

  /**
   * The signal that actually matters for client poaching: unusual bulk
   * access in a short window, which is what tends to precede a resignation.
   * Deliberately simple and explainable — an admin has to trust it enough to
   * act on it, so it reports the counts behind every flag.
   */
  async anomalies(user: AuthenticatedUser, days = 7): Promise<AnomalyDto[]> {
    this.assertOversight(user);
    if (!this.prisma.isConfigured) return [];

    const since = new Date(Date.now() - days * 86400_000);
    const logs = await this.prisma.auditLog.findMany({
      where: { companyId: user.companyId, createdAt: { gte: since }, actorId: { not: null } },
      include: { actor: { select: { id: true, fullName: true, employeeCode: true } } },
    });

    const byUser = new Map<string, AnomalyDto>();
    for (const l of logs) {
      if (!l.actor) continue;
      const e =
        byUser.get(l.actor.id) ??
        ({
          userId: l.actor.id,
          fullName: l.actor.fullName,
          employeeCode: l.actor.employeeCode,
          phoneReads: 0,
          dlpHits: 0,
          exports: 0,
          severity: "medium",
          reasons: [],
        } as AnomalyDto);

      if (l.action === "client.phone.read") e.phoneReads += 1;
      if (l.action.startsWith("dlp.")) e.dlpHits += 1;
      if (l.action.includes("export")) e.exports += 1;
      byUser.set(l.actor.id, e);
    }

    const flagged: AnomalyDto[] = [];
    for (const e of byUser.values()) {
      const reasons: string[] = [];
      if (e.phoneReads >= 20) reasons.push(`${e.phoneReads} client phone numbers viewed`);
      if (e.dlpHits >= 3) reasons.push(`${e.dlpHits} messages flagged for contact details`);
      if (e.exports >= 1) reasons.push(`${e.exports} export${e.exports === 1 ? "" : "s"}`);
      if (reasons.length === 0) continue;

      flagged.push({
        ...e,
        reasons,
        severity: e.dlpHits >= 3 || e.phoneReads >= 50 ? "high" : "medium",
      });
    }

    return flagged.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
  }
}
