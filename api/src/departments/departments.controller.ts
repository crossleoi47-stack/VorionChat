import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { DepartmentsService } from "./departments.service";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller("departments")
export class DepartmentsController {
  constructor(private departments: DepartmentsService) {}

  @RequirePermission("department", "read")
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.departments.list(req.user!);
  }

  @RequirePermission("department", "create")
  @Post()
  create(@Body() dto: CreateDepartmentDto, @Req() req: AuthenticatedRequest) {
    return this.departments.create(dto.name, req.user!);
  }
}
