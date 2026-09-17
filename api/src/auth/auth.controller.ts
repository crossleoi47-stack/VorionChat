import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { Public } from "./public.decorator";
import { AuthenticatedRequest } from "./authenticated-request";

// JwtAuthGuard is registered globally (see app.module.ts) — only routes
// that opt out with @Public() skip it, so `logout` below needs no guard.

@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("login")
  login(@Body() dto: LoginDto, @Req() req: AuthenticatedRequest) {
    return this.auth.login(dto, req.ip);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post("logout")
  async logout(@Req() req: AuthenticatedRequest) {
    await this.auth.logout(req.user!.sessionId);
    return { ok: true };
  }

  /** Lets the frontend know who's logged in and what they can do, for nav/UI gating — not an authorization boundary itself. */
  @Get("me")
  me(@Req() req: AuthenticatedRequest) {
    return this.auth.me(req.user!);
  }
}
