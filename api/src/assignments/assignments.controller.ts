import { Body, Controller, Post, Req } from "@nestjs/common";
import { AssignmentsService } from "./assignments.service";
import { ReassignDto } from "./dto/reassign.dto";
import { OffboardDto } from "./dto/offboard.dto";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller("assignments")
export class AssignmentsController {
  constructor(private assignments: AssignmentsService) {}

  @RequirePermission("assignment", "reassign")
  @Post("reassign")
  async reassign(@Body() dto: ReassignDto, @Req() req: AuthenticatedRequest) {
    await this.assignments.reassign(dto, req.user!);
    return { ok: true };
  }

  @RequirePermission("assignment", "reassign")
  @Post("offboard")
  async offboard(@Body() dto: OffboardDto, @Req() req: AuthenticatedRequest) {
    await this.assignments.offboardAndReassign(dto, req.user!);
    return { ok: true };
  }
}
