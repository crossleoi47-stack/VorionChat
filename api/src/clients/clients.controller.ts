import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ClientsService } from "./clients.service";
import { CreateClientDto } from "./dto/create-client.dto";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller("clients")
export class ClientsController {
  constructor(private clients: ClientsService) {}

  @RequirePermission("client", "read")
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.clients.list(req.user!);
  }

  @RequirePermission("client", "read")
  @Get(":id")
  findOne(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.clients.findOne(id, req.user!);
  }

  @RequirePermission("client", "create")
  @Post()
  create(@Body() dto: CreateClientDto, @Req() req: AuthenticatedRequest) {
    return this.clients.create(dto, req.user!);
  }
}
