import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { DepartmentsService } from "./departments.service";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "INACTIVE"])
  status?: "ACTIVE" | "INACTIVE";
}

class ListDepartmentsQuery {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "INACTIVE"])
  status?: "ACTIVE" | "INACTIVE";
}

@Controller("departments")
export class DepartmentsController {
  constructor(private departments: DepartmentsService) {}

  @RequirePermission("department", "read")
  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: ListDepartmentsQuery) {
    return this.departments.list(req.user!, query.search?.trim(), query.status);
  }

  @RequirePermission("department", "create")
  @Post()
  create(@Body() dto: CreateDepartmentDto, @Req() req: AuthenticatedRequest) {
    return this.departments.create(dto.name, dto.description, dto.code, dto.status, req.user!);
  }

  @RequirePermission("department", "update")
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateDepartmentDto, @Req() req: AuthenticatedRequest) {
    return this.departments.update(
      id,
      { name: dto.name, description: dto.description, code: dto.code, status: dto.status },
      req.user!,
    );
  }

  @RequirePermission("department", "delete")
  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.departments.remove(id, req.user!);
  }
}
