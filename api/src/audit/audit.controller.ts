import { Controller, Get, Query, Req } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller("audit-log")
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @RequirePermission("audit_log", "read")
  @Get()
  list(@Req() req: AuthenticatedRequest, @Query("take") take?: string) {
    return this.prisma.auditLog.findMany({
      where: { companyId: req.user!.companyId },
      orderBy: { createdAt: "desc" },
      take: take ? Math.min(Number(take), 200) : 50,
      include: { actor: { select: { fullName: true, employeeCode: true } } },
    });
  }
}
