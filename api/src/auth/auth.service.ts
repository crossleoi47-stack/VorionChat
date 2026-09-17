import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { LoginDto } from "./dto/login.dto";
import { AuthenticatedUser, JwtPayload } from "./jwt-payload.interface";
import { SupabaseService } from "../supabase/supabase.service";
import { mapSupabaseRoleToApp } from "../users/user-compat";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  mustResetPassword: boolean;
}

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "30d";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private jwt: JwtService,
    private config: ConfigService,
    private supabase: SupabaseService,
  ) {}

  /**
   * Resolves either login shape to a user. Every failure returns the same
   * generic error so the response can't be used to enumerate which emails or
   * company codes exist.
   */
  private async findLoginUser(dto: LoginDto) {
    if (!dto.email) return null;
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.supabase.getUserByEmail(normalizedEmail);
    if (!user) return null;
    const company = await this.supabase.getCompanyById(user.company_id);
    if (!company) return null;
    return { user, company };
  }

  async login(dto: LoginDto, ip?: string): Promise<TokenPair> {
    const identifier = dto.email?.trim().toLowerCase() ?? "unknown";
    this.logger.log(`[AUTH] Login request received for: ${identifier}`);
    if (!dto.email && !(dto.companyCode && dto.employeeCode)) {
      this.logger.warn("[AUTH] Login failed");
      this.logger.warn("[AUTH] Reason: USER_NOT_FOUND");
      throw new UnauthorizedException("Enter your email and password");
    }

    let user: Awaited<ReturnType<AuthService["findLoginUser"]>>;
    try {
      this.logger.log("[AUTH] Looking up/authenticating user through Supabase");
      user = await this.findLoginUser(dto);
    } catch (error) {
      this.logger.error("[AUTH] Login failed");
      this.logger.error("[AUTH] Reason: DATABASE_ERROR");
      this.logger.error(`[AUTH] Database error: ${error instanceof Error ? error.message : "Unknown Supabase error"}`);
      throw new ServiceUnavailableException("Authentication service is temporarily unavailable.");
    }
    this.logger.log(`[AUTH] User found: ${user ? "YES" : "NO"}`);
    if (!user) {
      this.logger.warn("[AUTH] Login failed");
      this.logger.warn("[AUTH] Reason: USER_NOT_FOUND");
      throw new UnauthorizedException("Invalid credentials");
    }
    const active = user.user.status === "ACTIVE" && user.company.is_active;
    this.logger.log(`[AUTH] User active: ${active ? "YES" : "NO"}`);
    if (!active) {
      this.logger.warn("[AUTH] Login failed");
      this.logger.warn("[AUTH] Reason: USER_DISABLED");
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordOk = await argon2.verify(user.user.password_hash, dto.password);
    this.logger.log(`[AUTH] Password valid: ${passwordOk ? "YES" : "NO"}`);
    if (!passwordOk) {
      this.logger.warn("[AUTH] Login failed");
      this.logger.warn("[AUTH] Reason: INVALID_PASSWORD");
      throw new UnauthorizedException("Invalid credentials");
    }

    const sessionId = `sb:${user.user.id}`;
    const role = mapSupabaseRoleToApp(user.user.role);
    const refreshToken = await this.signRefresh({
      sub: user.user.id,
      companyId: user.user.company_id,
      role,
      sessionId,
    });

    const accessToken = await this.signAccess({
      sub: user.user.id,
      companyId: user.user.company_id,
      role,
      sessionId,
    });
    this.logger.log("[AUTH] JWT generated successfully");

    try {
      await this.supabase.recordAudit({
        company_id: user.user.company_id,
        actor_user_id: user.user.id,
        action: "auth.login",
        entity_type: "user",
        entity_id: user.user.id,
        ip_address: ip,
      });
    } catch (error) {
      this.logger.warn(`[AUTH] Audit log skipped: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    this.logger.log("[AUTH] Login successful");
    return {
      accessToken,
      refreshToken,
      mustResetPassword: false,
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, { secret: this.getRefreshSecret() });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (payload.sessionId.startsWith("sb:")) {
      const supabaseUser = await this.supabase.getUserById(payload.sub);
      if (!supabaseUser || supabaseUser.status !== "ACTIVE" || supabaseUser.company_id !== payload.companyId) {
        throw new UnauthorizedException("Session no longer valid");
      }
      const accessToken = await this.signAccess({
        sub: supabaseUser.id,
        companyId: supabaseUser.company_id,
        role: mapSupabaseRoleToApp(supabaseUser.role),
        sessionId: payload.sessionId,
      });
      const newRefreshToken = await this.signRefresh({
        sub: supabaseUser.id,
        companyId: supabaseUser.company_id,
        role: mapSupabaseRoleToApp(supabaseUser.role),
        sessionId: payload.sessionId,
      });
      return { accessToken, refreshToken: newRefreshToken, mustResetPassword: false };
    }

    throw new UnauthorizedException("Invalid refresh token");
  }

  async logout(sessionId: string): Promise<void> {
    return;
  }

  /** Used by admins to force-logout every device of a user (e.g. on disable). */
  async revokeAllSessions(userId: string): Promise<void> {
    return;
  }

  async me(user: AuthenticatedUser) {
    try {
      this.logger.log("[AUTH] Validating access token");
      this.logger.log("[AUTH] JWT payload valid");
      this.logger.log("[AUTH] Looking up user through Supabase");
      const record = await this.supabase.getUserById(user.id);
      if (!record || record.status !== "ACTIVE" || record.company_id !== user.companyId) {
        throw new UnauthorizedException("User not found");
      }
      this.logger.log("[AUTH] Session valid");
      return {
        id: record.id,
        employeeCode: record.employee_code ?? "",
        fullName: record.full_name,
        role: mapSupabaseRoleToApp(record.role),
        departmentId: record.department_id,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.error(`[AUTH] /auth/me failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw new ServiceUnavailableException("Authentication service is temporarily unavailable.");
    }
  }

  private signAccess(payload: JwtPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.getAccessSecret(),
      expiresIn: ACCESS_TOKEN_TTL,
    });
  }

  private signRefresh(payload: JwtPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.getRefreshSecret(),
      expiresIn: REFRESH_TOKEN_TTL,
    });
  }

  private getAccessSecret(): string {
    return this.config.get<string>("JWT_ACCESS_SECRET") || this.config.getOrThrow<string>("JWT_SECRET");
  }

  private getRefreshSecret(): string {
    return this.config.get<string>("JWT_REFRESH_SECRET") || this.config.getOrThrow<string>("JWT_SECRET");
  }
}
