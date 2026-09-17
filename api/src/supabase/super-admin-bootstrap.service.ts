import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { SupabaseService } from "./supabase.service";

@Injectable()
export class SuperAdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SuperAdminBootstrapService.name);
  private hasRun = false;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.hasRun) return;
    this.hasRun = true;

    this.logger.log("[SUPER_ADMIN_BOOTSTRAP] Checking for existing Super Admin");

    try {
      const connected = await this.supabase.ensureStartupCheckPassed();
      if (!connected) {
        this.logger.error("[SUPER_ADMIN_BOOTSTRAP] Failed");
        this.logger.error("[SUPER_ADMIN_BOOTSTRAP] Error code: SUPABASE_UNAVAILABLE");
        this.logger.error("[SUPER_ADMIN_BOOTSTRAP] Error message: Supabase connection check failed during startup.");
        return;
      }
      const existing = await this.supabase.listUsersByRole("SUPER_ADMIN");
      const activeExisting = existing.find((user) => user.status === "ACTIVE") ?? existing[0];

      if (activeExisting) {
        this.logger.log(`[SUPER_ADMIN_BOOTSTRAP] Existing Super Admin found: ${activeExisting.id}`);
        this.logger.log("[SUPER_ADMIN_BOOTSTRAP] Skipping creation");
        return;
      }

      this.logger.log("[SUPER_ADMIN_BOOTSTRAP] No Super Admin found");
      const companies = await this.supabase.listActiveCompanies();
      const company = companies[0];

      if (!company) {
        this.logger.error("[SUPER_ADMIN_BOOTSTRAP] Failed");
        this.logger.error("[SUPER_ADMIN_BOOTSTRAP] Error code: NO_ACTIVE_COMPANY");
        this.logger.error("[SUPER_ADMIN_BOOTSTRAP] Error message: No active company exists for Super Admin bootstrap.");
        return;
      }

      this.logger.log("[SUPER_ADMIN_BOOTSTRAP] Creating initial Super Admin");
      const email = this.config.get<string>("SUPER_ADMIN_EMAIL")?.trim().toLowerCase() || "superadmin@vorion.local";
      const password = this.config.get<string>("SUPER_ADMIN_PASSWORD");
      const fullName = this.config.get<string>("SUPER_ADMIN_FULL_NAME")?.trim() || "Vorion Super Admin";
      const employeeCode = this.config.get<string>("SUPER_ADMIN_EMPLOYEE_CODE")?.trim() || null;

      if (!password) {
        this.logger.error("[SUPER_ADMIN_BOOTSTRAP] Failed");
        this.logger.error("[SUPER_ADMIN_BOOTSTRAP] Error code: SUPER_ADMIN_PASSWORD_MISSING");
        this.logger.error("[SUPER_ADMIN_BOOTSTRAP] Error message: Set SUPER_ADMIN_PASSWORD to create the initial Super Admin.");
        return;
      }

      const passwordHash = await argon2.hash(password);
      const created = await this.supabase.createUser({
        company_id: company.id,
        department_id: null,
        employee_code: employeeCode,
        full_name: fullName,
        email,
        password_hash: passwordHash,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        avatar_url: null,
      });
      this.logger.log(`[SUPER_ADMIN_BOOTSTRAP] Super Admin created successfully: ${created.id}`);
    } catch (error) {
      const safeMessage = error instanceof Error ? error.message : "Unknown bootstrap error";
      const errorCode =
        typeof error === "object" && error && "code" in error && typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : "BOOTSTRAP_FAILED";
      this.logger.error("[SUPER_ADMIN_BOOTSTRAP] Failed");
      this.logger.error(`[SUPER_ADMIN_BOOTSTRAP] Error code: ${errorCode}`);
      this.logger.error(`[SUPER_ADMIN_BOOTSTRAP] Error message: ${safeMessage}`);
    }
  }
}
