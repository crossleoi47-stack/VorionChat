import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LoginDto } from "./dto/login.dto";
import { AuthenticatedUser, JwtPayload } from "./jwt-payload.interface";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  mustResetPassword: boolean;
}

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "30d";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private audit: AuditService,
  ) {}

  /**
   * Resolves either login shape to a user. Every failure returns the same
   * generic error so the response can't be used to enumerate which emails or
   * company codes exist.
   */
  private async findLoginUser(dto: LoginDto) {
    if (dto.email) {
      return this.prisma.user.findUnique({
        where: { email: dto.email.trim().toLowerCase() },
        include: { company: true },
      });
    }
    if (dto.companyCode && dto.employeeCode) {
      const company = await this.prisma.company.findUnique({ where: { code: dto.companyCode } });
      if (!company) return null;
      return this.prisma.user.findUnique({
        where: { companyId_employeeCode: { companyId: company.id, employeeCode: dto.employeeCode } },
        include: { company: true },
      });
    }
    return null;
  }

  async login(dto: LoginDto, ip?: string): Promise<TokenPair> {
    if (!dto.email && !(dto.companyCode && dto.employeeCode)) {
      throw new UnauthorizedException("Enter your email and password");
    }

    const user = await this.findLoginUser(dto);
    if (!user || user.status !== "ACTIVE" || user.company.status !== "ACTIVE") {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordOk = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordOk) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const sessionId = randomUUID();
    const refreshToken = await this.signRefresh({
      sub: user.id,
      companyId: user.companyId,
      role: user.role,
      sessionId,
    });

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: await argon2.hash(refreshToken),
        deviceLabel: dto.deviceLabel,
        ip,
      },
    });

    const accessToken = await this.signAccess({
      sub: user.id,
      companyId: user.companyId,
      role: user.role,
      sessionId,
    });

    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: "auth.login",
      target: `user:${user.id}`,
      ip,
    });

    return { accessToken, refreshToken, mustResetPassword: user.mustResetPassword };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.user.status !== "ACTIVE") {
      throw new UnauthorizedException("Session no longer valid");
    }

    const matches = await argon2.verify(session.refreshTokenHash, refreshToken);
    if (!matches) {
      // Reuse of a rotated-out refresh token: treat as compromise, kill the session.
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Refresh token reuse detected — session revoked");
    }

    const newRefreshToken = await this.signRefresh({
      sub: session.userId,
      companyId: session.user.companyId,
      role: session.user.role,
      sessionId: session.id,
    });

    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: await argon2.hash(newRefreshToken), lastSeenAt: new Date() },
    });

    const accessToken = await this.signAccess({
      sub: session.userId,
      companyId: session.user.companyId,
      role: session.user.role,
      sessionId: session.id,
    });

    return { accessToken, refreshToken: newRefreshToken, mustResetPassword: session.user.mustResetPassword };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Used by admins to force-logout every device of a user (e.g. on disable). */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(user: AuthenticatedUser) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return {
      id: record.id,
      employeeCode: record.employeeCode,
      fullName: record.fullName,
      role: record.role,
      departmentId: record.departmentId,
    };
  }

  private signAccess(payload: JwtPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      expiresIn: ACCESS_TOKEN_TTL,
    });
  }

  private signRefresh(payload: JwtPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      expiresIn: REFRESH_TOKEN_TTL,
    });
  }
}
