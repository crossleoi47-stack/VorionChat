import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ConversationsService } from "./conversations.service";
import { ConversationStateDto } from "../messages/dto/message-actions.dto";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller("conversations")
export class ConversationsController {
  constructor(private conversations: ConversationsService) {}

  @RequirePermission("conversation", "read")
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.conversations.listForUser(req.user!);
  }

  @RequirePermission("message", "create")
  @Post("direct")
  openDirect(@Body() body: { userId: string }, @Req() req: AuthenticatedRequest) {
    return this.conversations.openDirect(body.userId, req.user!);
  }

  @RequirePermission("conversation", "read")
  @Patch(":id/state")
  async setState(
    @Param("id") id: string,
    @Body() dto: ConversationStateDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.conversations.setState(id, req.user!, dto);
    return { ok: true };
  }

  @RequirePermission("conversation", "read")
  @Post(":id/read")
  async markRead(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    await this.conversations.markRead(id, req.user!);
    return { ok: true };
  }
}
