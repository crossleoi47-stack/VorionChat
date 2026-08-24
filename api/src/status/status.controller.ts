import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
} from "@nestjs/common";
import type { Response } from "express";
import { StatusService } from "./status.service";
import { CreateStatusDto } from "./dto/status.dto";
import { STORAGE_PROVIDER, StorageProvider } from "../storage/storage-provider.interface";
import { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller("status")
export class StatusController {
  constructor(
    private status: StatusService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
  ) {}

  @Get()
  feed(@Req() req: AuthenticatedRequest) {
    return this.status.feed(req.user!);
  }

  @Post()
  create(@Body() dto: CreateStatusDto, @Req() req: AuthenticatedRequest) {
    return this.status.create(dto, req.user!);
  }

  @Post(":id/view")
  async view(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    await this.status.markViewed(id, req.user!);
    return { ok: true };
  }

  @Get(":id/viewers")
  viewers(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.status.viewers(id, req.user!);
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    await this.status.remove(id, req.user!);
    return { ok: true };
  }

  @Get(":id/media")
  async media(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { storageKey, mimeType } = await this.status.mediaFor(id, req.user!);
    const buffer = await this.storage.read(storageKey);
    res.set({
      "Content-Type": mimeType,
      // Same reasoning as attachments: the web app is a different origin from
      // the API, and Helmet's default CORP would block the <img>. Still gated
      // by the auth + expiry check above.
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    return new StreamableFile(buffer);
  }
}
