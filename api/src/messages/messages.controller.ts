import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { MessagesService } from "./messages.service";
import { SendMessageDto } from "./dto/send-message.dto";
import { EditMessageDto, ForwardMessageDto, ReactDto } from "./dto/message-actions.dto";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller()
export class MessagesController {
  constructor(private messages: MessagesService) {}

  @RequirePermission("message", "read")
  @Get("conversations/:conversationId/messages")
  list(@Param("conversationId") conversationId: string, @Req() req: AuthenticatedRequest) {
    return this.messages.listForConversation(conversationId, req.user!);
  }

  @RequirePermission("message", "create")
  @Post("conversations/:conversationId/messages")
  send(
    @Param("conversationId") conversationId: string,
    @Body() dto: SendMessageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.messages.send(conversationId, req.user!, dto);
  }

  @RequirePermission("message", "create")
  @Post("messages/:id/react")
  react(@Param("id") id: string, @Body() dto: ReactDto, @Req() req: AuthenticatedRequest) {
    return this.messages.react(id, req.user!, dto.emoji);
  }

  @RequirePermission("message", "read")
  @Post("messages/:id/star")
  star(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.messages.star(id, req.user!);
  }

  @RequirePermission("message", "create")
  @Patch("messages/:id")
  edit(@Param("id") id: string, @Body() dto: EditMessageDto, @Req() req: AuthenticatedRequest) {
    return this.messages.edit(id, req.user!, dto.body);
  }

  @RequirePermission("message", "create")
  @Delete("messages/:id")
  remove(
    @Param("id") id: string,
    @Query("forEveryone") forEveryone: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.messages.remove(id, req.user!, forEveryone === "true");
  }

  @RequirePermission("message", "create")
  @Post("messages/:id/forward")
  forward(
    @Param("id") id: string,
    @Body() dto: ForwardMessageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.messages.forward(id, req.user!, dto.toConversationId);
  }
}
