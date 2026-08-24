import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type { Response } from "express";
import { AttachmentsService } from "./attachments.service";
import { RequirePermission } from "../rbac/permissions.decorator";
import { Public } from "../auth/public.decorator";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { MAX_UPLOAD_BYTES } from "./attachment-limits";
import { signMediaUrl, verifyMediaUrl } from "./signed-url";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { PrismaService } from "../prisma/prisma.service";

@Controller("attachments")
export class AttachmentsController {
  constructor(
    private attachments: AttachmentsService,
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  private get signingSecret(): string {
    return this.config.getOrThrow<string>("JWT_ACCESS_SECRET");
  }

  @RequirePermission("message", "create")
  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.attachments.upload(file);
  }

  /**
   * Mints a short-lived signed URL for one attachment. The caller is
   * authenticated normally here; the resulting link is what goes into an
   * <img>/<audio> tag, which cannot send an Authorization header.
   */
  @RequirePermission("message", "read")
  @Get(":id/link")
  async link(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    // Authorize before signing, so a signature is never issued for something
    // this person couldn't fetch directly.
    await this.attachments.assertReadable(id, req.user!);
    const { exp, sig } = signMediaUrl(id, req.user!.id, this.signingSecret);
    return { url: `/api/attachments/${id}/content?uid=${req.user!.id}&exp=${exp}&sig=${sig}` };
  }

  /**
   * Public route by JWT standards — it carries its own proof in the
   * signature rather than a session token, then re-runs the full
   * conversation-visibility and feature checks for the signed-for user.
   */
  @Public()
  @Get(":id/content")
  async download(
    @Param("id") id: string,
    @Query("uid") uid: string,
    @Query("exp") exp: string,
    @Query("sig") sig: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const verdict = verifyMediaUrl(id, uid, Number(exp), sig, this.signingSecret);
    if (!verdict.ok) {
      throw new ForbiddenException(
        verdict.reason === "expired" ? "This link has expired" : "Invalid link",
      );
    }

    // A signature proves the link was issued to this user; it does not prove
    // they still have access. Re-check against live data, so revoking an
    // assignment or a feature switch takes effect immediately.
    const user = await this.prisma.user.findUnique({
      where: { id: verdict.userId },
      select: { id: true, companyId: true, role: true, status: true },
    });
    if (!user || user.status !== "ACTIVE") throw new ForbiddenException("Account is not active");

    const asUser: AuthenticatedUser = {
      id: user.id,
      companyId: user.companyId,
      role: user.role,
      sessionId: "signed-url",
    };

    const { buffer, mimeType, filename } = await this.attachments.getContentForDownload(id, asUser);
    res.set({
      "Content-Type": mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      // Helmet defaults every response to CORP same-origin, which would stop
      // the web app (a different origin) rendering an <img>. Safe to relax:
      // the content is still gated by the signature + live checks above.
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": "private, max-age=300",
    });
    return new StreamableFile(buffer);
  }
}
