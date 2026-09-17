import { Controller, Get, Query, Req } from "@nestjs/common";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { SupabaseService } from "../supabase/supabase.service";

@Controller("audit-log")
export class AuditController {
  constructor(private supabase: SupabaseService) {}

  @RequirePermission("audit_log", "read")
  @Get()
  list(@Req() req: AuthenticatedRequest, @Query("take") take?: string) {
    return this.supabase.listAuditLogs(req.user!.companyId, take ? Math.min(Number(take), 200) : 50);
  }
}
