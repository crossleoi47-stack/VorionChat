import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { JwtPayload, AuthenticatedUser } from "./jwt-payload.interface";
import { SupabaseService } from "../supabase/supabase.service";
import { mapSupabaseRoleToApp } from "../users/user-compat";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    config: ConfigService,
    private supabase: SupabaseService,
  ) {
    super({
      // Header first, then a `?token=` query param — the fallback exists
      // only because <img>/<audio>/<a download> can't set an Authorization
      // header when loading attachment content. Same verification either
      // way; see attachmentUrl() in the frontend for the tradeoff note.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter("token"),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_ACCESS_SECRET") || config.getOrThrow<string>("JWT_SECRET"),
    });
  }

  /**
   * Runs on every authenticated request. Beyond verifying the JWT signature,
   * this re-checks that the session backing it hasn't been revoked — the
   * mechanism that makes "force logout on disable" (blueprint §5/§13)
   * actually instant instead of "expires within 15 minutes."
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    try {
      this.logger.log("[AUTH] Looking up user through Supabase");
      const user = await this.supabase.getUserById(payload.sub);
      if (!user || user.status !== "ACTIVE") {
        throw new UnauthorizedException("User disabled");
      }
      const company = await this.supabase.getCompanyById(user.company_id);
      if (!company || !company.is_active || user.company_id !== payload.companyId) {
        throw new UnauthorizedException("Token/session mismatch");
      }

      return {
        id: user.id,
        companyId: user.company_id,
        role: mapSupabaseRoleToApp(user.role),
        sessionId: payload.sessionId,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.error(`[AUTH] Session validation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw new ServiceUnavailableException("Authentication service is temporarily unavailable.");
    }
  }
}
