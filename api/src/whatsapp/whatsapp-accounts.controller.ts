import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { WhatsappAccountsService } from "./whatsapp-accounts.service";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AuthenticatedRequest } from "../auth/authenticated-request";

class UpsertAccountDto {
  @IsString() @MinLength(1) @MaxLength(64) wabaId!: string;
  @IsString() @MinLength(1) @MaxLength(64) phoneNumberId!: string;
  @IsString() @MinLength(1) @MaxLength(32) displayNumber!: string;
  @IsOptional() @IsString() @MaxLength(80) label?: string;
  @IsOptional() @IsString() @MaxLength(400) accessToken?: string;
  @IsOptional() @IsString() @MaxLength(200) appSecret?: string;
  @IsOptional() @IsString() @MaxLength(200) verifyToken?: string;
}

@Controller("whatsapp/accounts")
export class WhatsappAccountsController {
  constructor(private accounts: WhatsappAccountsService) {}

  @RequirePermission("whatsapp_account", "read")
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.accounts.list(req.user!);
  }

  @RequirePermission("whatsapp_account", "update")
  @Post()
  upsert(@Body() dto: UpsertAccountDto, @Req() req: AuthenticatedRequest) {
    return this.accounts.upsert(dto, req.user!);
  }

  @RequirePermission("whatsapp_account", "update")
  @Post(":id/test")
  test(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.accounts.testConnection(id, req.user!);
  }

  @RequirePermission("whatsapp_account", "update")
  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    await this.accounts.remove(id, req.user!);
    return { ok: true };
  }
}
