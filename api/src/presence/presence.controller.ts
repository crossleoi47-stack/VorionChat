import { Body, Controller, Get, Patch, Query, Req } from "@nestjs/common";
import { PresenceService } from "./presence.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller("presence")
export class PresenceController {
  constructor(
    private presence: PresenceService,
    private prisma: PrismaService,
  ) {}

  /** `ids` is a comma-separated list of user ids, scoped to the caller's company. */
  @Get()
  async get(@Query("ids") ids: string, @Req() req: AuthenticatedRequest) {
    const wanted = (ids ?? "").split(",").filter(Boolean);
    if (wanted.length === 0) return [];

    // Never leak presence across tenants: filter to this company first.
    const sameCompany = await this.prisma.user.findMany({
      where: { id: { in: wanted }, companyId: req.user!.companyId },
      select: { id: true },
    });
    return this.presence.get(sameCompany.map((u) => u.id));
  }

  @Patch("settings")
  async update(@Body() body: { showLastSeen?: boolean }, @Req() req: AuthenticatedRequest) {
    if (typeof body.showLastSeen !== "boolean") return { ok: false };
    await this.prisma.user.update({
      where: { id: req.user!.id },
      data: { showLastSeen: body.showLastSeen },
    });
    return { ok: true };
  }
}
