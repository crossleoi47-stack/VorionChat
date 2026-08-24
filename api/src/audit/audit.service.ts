import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface AuditEntry {
  companyId: string;
  actorId?: string;
  action: string;
  target: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

/**
 * Append-only by convention: nothing in this codebase exposes an update or
 * delete on audit_log. Every phone-number read, export, and assignment
 * change is written here with actor + before/after state (blueprint §14).
 */
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        companyId: entry.companyId,
        actorId: entry.actorId,
        action: entry.action,
        target: entry.target,
        before: entry.before === undefined ? undefined : (entry.before as object),
        after: entry.after === undefined ? undefined : (entry.after as object),
        ip: entry.ip,
      },
    });
  }
}
