import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { GroupsService } from "./groups.service";
import { AddMembersDto, CreateGroupDto, UpdateGroupDto } from "./dto/group.dto";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller("groups")
export class GroupsController {
  constructor(private groups: GroupsService) {}

  @RequirePermission("group", "create")
  @Post()
  create(@Body() dto: CreateGroupDto, @Req() req: AuthenticatedRequest) {
    return this.groups.create(dto, req.user!);
  }

  @RequirePermission("group", "read")
  @Get(":id")
  detail(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.groups.detail(id, req.user!);
  }

  @RequirePermission("group", "read")
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateGroupDto, @Req() req: AuthenticatedRequest) {
    return this.groups.update(id, dto, req.user!);
  }

  @RequirePermission("group", "read")
  @Post(":id/members")
  addMembers(@Param("id") id: string, @Body() dto: AddMembersDto, @Req() req: AuthenticatedRequest) {
    return this.groups.addMembers(id, dto.userIds, req.user!);
  }

  @RequirePermission("group", "read")
  @Patch(":id/members/:userId/admin")
  setAdmin(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Body() body: { isAdmin: boolean },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.groups.setAdmin(id, userId, !!body.isAdmin, req.user!);
  }

  @RequirePermission("group", "read")
  @Delete(":id/members/:userId")
  removeMember(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.groups.removeMember(id, userId, req.user!);
  }
}
