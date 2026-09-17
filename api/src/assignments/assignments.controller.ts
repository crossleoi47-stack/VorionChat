import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import { AssignmentsService } from "./assignments.service";
import { ReassignDto } from "./dto/reassign.dto";
import { OffboardDto } from "./dto/offboard.dto";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller("assignments")
export class AssignmentsController {
  constructor(private assignments: AssignmentsService) {}

  @RequirePermission("assignment", "read")
  @Get("context")
  context(@Req() req: AuthenticatedRequest) {
    return this.assignments.context(req.user!);
  }

  @RequirePermission("assignment", "read")
  @Get("history")
  history(
    @Req() req: AuthenticatedRequest,
    @Query("search") search?: string,
    @Query("clientId") clientId?: string,
    @Query("ownerId") ownerId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.assignments.history(req.user!, {
      search,
      clientId,
      ownerId,
      from,
      to,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @RequirePermission("assignment", "reassign")
  @Post("reassign")
  async reassign(@Body() dto: ReassignDto, @Req() req: AuthenticatedRequest) {
    const result = await this.assignments.submit(dto, req.user!);
    return { ok: true, ...result };
  }

  @RequirePermission("assignment", "reassign")
  @Post("offboard")
  async offboard(@Body() dto: OffboardDto, @Req() req: AuthenticatedRequest) {
    await this.assignments.offboardAndReassign(dto, req.user!);
    return { ok: true };
  }
}
