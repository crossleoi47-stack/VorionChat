import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller("users")
export class UsersController {
  constructor(private users: UsersService) {}

  @RequirePermission("user", "read")
  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query("search") search?: string,
    @Query("role") role?: string | "ALL",
    @Query("departmentId") departmentId?: string | "ALL",
    @Query("status") status?: string | "ALL",
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.users.list(req.user!, {
      search,
      role,
      departmentId,
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @RequirePermission("user", "create")
  @Post()
  create(@Body() dto: CreateUserDto, @Req() req: AuthenticatedRequest) {
    return this.users.create(dto, req.user!);
  }

  @RequirePermission("user", "update")
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateUserDto, @Req() req: AuthenticatedRequest) {
    return this.users.update(id, dto, req.user!);
  }

  @RequirePermission("user", "disable")
  @Post(":id/disable")
  async disable(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    await this.users.disable(id, req.user!);
    return { ok: true };
  }

  @RequirePermission("user", "update")
  @Post(":id/enable")
  async enable(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    await this.users.enable(id, req.user!);
    return { ok: true };
  }

  @RequirePermission("user", "delete")
  @Delete(":id")
  async delete(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    await this.users.delete(id, req.user!);
    return { ok: true };
  }
}
