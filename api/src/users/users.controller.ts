import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller("users")
export class UsersController {
  constructor(private users: UsersService) {}

  @RequirePermission("user", "read")
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.users.list(req.user!);
  }

  @RequirePermission("user", "create")
  @Post()
  create(@Body() dto: CreateUserDto, @Req() req: AuthenticatedRequest) {
    return this.users.create(dto, req.user!);
  }

  @RequirePermission("user", "disable")
  @Post(":id/disable")
  async disable(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    await this.users.disable(id, req.user!);
    return { ok: true };
  }
}
