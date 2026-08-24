import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload, AuthenticatedUser } from "./jwt-payload.interface";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
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
      secretOrKey: config.getOrThrow<string>("JWT_ACCESS_SECRET"),
    });
  }

  /**
   * Runs on every authenticated request. Beyond verifying the JWT signature,
   * this re-checks that the session backing it hasn't been revoked — the
   * mechanism that makes "force logout on disable" (blueprint §5/§13)
   * actually instant instead of "expires within 15 minutes."
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (!session || session.revokedAt) {
      throw new UnauthorizedException("Session revoked");
    }
    if (session.user.status !== "ACTIVE") {
      throw new UnauthorizedException("User disabled");
    }
    if (session.userId !== payload.sub || session.user.companyId !== payload.companyId) {
      throw new UnauthorizedException("Token/session mismatch");
    }

    return {
      id: payload.sub,
      companyId: payload.companyId,
      role: payload.role,
      sessionId: payload.sessionId,
    };
  }
}
