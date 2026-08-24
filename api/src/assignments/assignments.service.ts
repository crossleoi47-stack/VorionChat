import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { UsersService } from "../users/users.service";
import { AuthService } from "../auth/auth.service";
import { can } from "../rbac/policy";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { ReassignDto } from "./dto/reassign.dto";
import { OffboardDto } from "./dto/offboard.dto";

@Injectable()
export class AssignmentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private users: UsersService,
    private auth: AuthService,
  ) {}

  /** The single-owner transfer: unassign the current owner, assign the new one, atomically. */
  async reassign(dto: ReassignDto, admin: AuthenticatedUser): Promise<void> {
    if (!can(admin.role, "assignment", "reassign")) throw new ForbiddenException();

    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, companyId: admin.companyId },
    });
    if (!client) throw new BadRequestException("Client not found");

    const newOwner = await this.prisma.user.findFirst({
      where: { id: dto.newUserId, companyId: admin.companyId, status: "ACTIVE" },
    });
    if (!newOwner) throw new BadRequestException("New assignee not found or not active");

    const previous = await this.prisma.$transaction(async (tx) => {
      const active = await tx.clientAssignment.findFirst({
        where: { clientId: dto.clientId, unassignedAt: null },
      });
      if (active) {
        await tx.clientAssignment.update({
          where: { id: active.id },
          data: { unassignedAt: new Date() },
        });
      }
      await tx.clientAssignment.create({
        data: { clientId: dto.clientId, userId: dto.newUserId, assignedById: admin.id },
      });
      return active;
    });

    await this.audit.record({
      companyId: admin.companyId,
      actorId: admin.id,
      action: "client.reassign",
      target: `client:${dto.clientId}`,
      before: { userId: previous?.userId ?? null },
      after: { userId: dto.newUserId },
    });
  }

  /**
   * The offboarding flow the product exists for (blueprint §5): disable the
   * account, force-logout every device, and transfer every listed client to
   * its new owner — as one action from the admin's point of view, logged as
   * one audit entry plus one per client transfer.
   */
  async offboardAndReassign(dto: OffboardDto, admin: AuthenticatedUser): Promise<void> {
    if (!can(admin.role, "user", "disable") || !can(admin.role, "assignment", "reassign")) {
      throw new ForbiddenException();
    }

    for (const item of dto.reassignments) {
      await this.reassign({ clientId: item.clientId, newUserId: item.newUserId }, admin);
    }

    await this.users.disable(dto.userId, admin);
    await this.auth.revokeAllSessions(dto.userId);

    await this.audit.record({
      companyId: admin.companyId,
      actorId: admin.id,
      action: "user.offboard",
      target: `user:${dto.userId}`,
      after: { reassignedClients: dto.reassignments.map((r) => r.clientId) },
    });
  }
}
