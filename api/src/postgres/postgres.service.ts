import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool, QueryResultRow } from "pg";

export interface PostgresConnectionState {
  configured: boolean;
  connected: boolean;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export interface PostgresUserRow {
  id: string;
  company_id: string;
  department_id: string | null;
  full_name: string;
  email: string;
  password_hash: string;
  role: "SUPER_ADMIN" | "ADMIN" | "VA";
  status: "ACTIVE" | "INACTIVE";
  avatar_url: string | null;
  last_seen_at: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PostgresDepartmentRow {
  id: string;
  company_id: string;
  name: string;
  department_code: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PostgresCompanyRow {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

type UserWriteInput = Omit<PostgresUserRow, "id" | "created_at" | "updated_at" | "last_seen_at">;
type UserUpdateInput = Partial<
  Pick<PostgresUserRow, "department_id" | "full_name" | "email" | "password_hash" | "role" | "status" | "avatar_url" | "last_seen_at">
>;
type DepartmentWriteInput = Omit<PostgresDepartmentRow, "id" | "created_at" | "updated_at">;
type DepartmentUpdateInput = Partial<Pick<PostgresDepartmentRow, "name" | "department_code" | "description" | "is_active">>;

@Injectable()
export class PostgresService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostgresService.name);
  private readonly pool: Pool | null;
  private readonly connectionState: PostgresConnectionState = {
    configured: false,
    connected: false,
    lastErrorCode: null,
    lastErrorMessage: null,
  };
  private startupCheckPromise: Promise<boolean> | null = null;

  constructor(config: ConfigService) {
    const databaseUrl = config.get<string>("DATABASE_URL")?.trim() ?? "";
    const isPostgresDsn = /^postgres(ql)?:\/\//i.test(databaseUrl);
    this.connectionState.configured = isPostgresDsn;
    this.pool = isPostgresDsn ? new Pool({ connectionString: databaseUrl }) : null;
  }

  async onModuleInit(): Promise<void> {
    await this.ensureStartupCheckPassed();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) await this.pool.end();
  }

  getConnectionState(): PostgresConnectionState {
    return { ...this.connectionState };
  }

  async ensureStartupCheckPassed(): Promise<boolean> {
    if (!this.startupCheckPromise) {
      this.startupCheckPromise = this.runStartupCheck();
    }
    return this.startupCheckPromise;
  }

  async runStartupCheck(): Promise<boolean> {
    if (!this.pool) {
      this.connectionState.connected = false;
      this.connectionState.lastErrorCode = "DATABASE_URL_INVALID";
      this.connectionState.lastErrorMessage = "DATABASE_URL must be a PostgreSQL connection string.";
      this.logger.error("[DATABASE] Supabase PostgreSQL Pooler: FAILED");
      this.logger.error("[DATABASE] Connection test: FAIL");
      this.logger.error("[DATABASE] Error: DATABASE_URL must be a PostgreSQL connection string.");
      return false;
    }

    try {
      await this.pool.query("SELECT 1");
      this.connectionState.connected = true;
      this.connectionState.lastErrorCode = null;
      this.connectionState.lastErrorMessage = null;
      this.logger.log("[DATABASE] Supabase PostgreSQL Pooler: CONNECTED");
      this.logger.log("[DATABASE] Connection test: PASS");
      return true;
    } catch (error) {
      const safe = this.formatError(error);
      this.connectionState.connected = false;
      this.connectionState.lastErrorCode = safe.code;
      this.connectionState.lastErrorMessage = safe.message;
      this.logger.error("[DATABASE] Supabase PostgreSQL Pooler: FAILED");
      this.logger.error("[DATABASE] Connection test: FAIL");
      this.logger.error(`[DATABASE] Error: ${safe.message}`);
      return false;
    }
  }

  async query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
    if (!this.pool) throw new Error("DATABASE_URL must be a PostgreSQL connection string.");
    const result = await this.pool.query<T>(text, values);
    return result.rows;
  }

  async queryOne<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(text, values);
    return rows[0] ?? null;
  }

  async listUsers(companyId: string): Promise<PostgresUserRow[]> {
    return this.query<PostgresUserRow>(
      `SELECT id, company_id, department_id, full_name, email, password_hash, role, status, avatar_url, last_seen_at, created_at, updated_at
       FROM public.users
       WHERE company_id = $1
       ORDER BY created_at DESC`,
      [companyId],
    );
  }

  async getUserByEmail(email: string): Promise<PostgresUserRow | null> {
    return this.queryOne<PostgresUserRow>(
      `SELECT id, company_id, department_id, full_name, email, password_hash, role, status, avatar_url, last_seen_at, created_at, updated_at
       FROM public.users
       WHERE lower(email) = lower($1)
       LIMIT 1`,
      [email],
    );
  }

  async getUserById(id: string): Promise<PostgresUserRow | null> {
    return this.queryOne<PostgresUserRow>(
      `SELECT id, company_id, department_id, full_name, email, password_hash, role, status, avatar_url, last_seen_at, created_at, updated_at
       FROM public.users
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
  }

  async listUsersByRole(role: PostgresUserRow["role"]): Promise<PostgresUserRow[]> {
    return this.query<PostgresUserRow>(
      `SELECT id, company_id, department_id, full_name, email, password_hash, role, status, avatar_url, last_seen_at, created_at, updated_at
       FROM public.users
       WHERE role = $1
       ORDER BY created_at ASC`,
      [role],
    );
  }

  async createUser(data: UserWriteInput): Promise<PostgresUserRow> {
    const created = await this.queryOne<PostgresUserRow>(
      `INSERT INTO public.users (company_id, department_id, full_name, email, password_hash, role, status, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, company_id, department_id, full_name, email, password_hash, role, status, avatar_url, last_seen_at, created_at, updated_at`,
      [data.company_id, data.department_id, data.full_name, data.email, data.password_hash, data.role, data.status, data.avatar_url],
    );
    if (!created) throw new Error("User insert returned no row.");
    return created;
  }

  async updateUser(id: string, data: UserUpdateInput): Promise<PostgresUserRow> {
    const assignments: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    for (const [column, value] of Object.entries(data).filter(([, value]) => value !== undefined)) {
      assignments.push(`${column} = $${index}`);
      values.push(value);
      index += 1;
    }
    assignments.push("updated_at = NOW()");
    values.push(id);
    const updated = await this.queryOne<PostgresUserRow>(
      `UPDATE public.users
       SET ${assignments.join(", ")}
       WHERE id = $${index}
       RETURNING id, company_id, department_id, full_name, email, password_hash, role, status, avatar_url, last_seen_at, created_at, updated_at`,
      values,
    );
    if (!updated) throw new Error("User update returned no row.");
    return updated;
  }

  async listDepartments(companyId: string): Promise<PostgresDepartmentRow[]> {
    return this.query<PostgresDepartmentRow>(
      `SELECT id, company_id, name, department_code, description, is_active, created_by, created_at, updated_at
       FROM public.departments
       WHERE company_id = $1
       ORDER BY is_active DESC, name ASC`,
      [companyId],
    );
  }

  async getDepartmentById(id: string): Promise<PostgresDepartmentRow | null> {
    return this.queryOne<PostgresDepartmentRow>(
      `SELECT id, company_id, name, department_code, description, is_active, created_by, created_at, updated_at
       FROM public.departments
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
  }

  async createDepartment(data: DepartmentWriteInput): Promise<PostgresDepartmentRow> {
    const created = await this.queryOne<PostgresDepartmentRow>(
      `INSERT INTO public.departments (company_id, name, department_code, description, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, company_id, name, department_code, description, is_active, created_by, created_at, updated_at`,
      [data.company_id, data.name, data.department_code, data.description, data.is_active, data.created_by],
    );
    if (!created) throw new Error("Department insert returned no row.");
    return created;
  }

  async updateDepartment(id: string, data: DepartmentUpdateInput): Promise<PostgresDepartmentRow> {
    const assignments: string[] = [];
    const values: unknown[] = [];
    let index = 1;
    for (const [column, value] of Object.entries(data).filter(([, value]) => value !== undefined)) {
      assignments.push(`${column} = $${index}`);
      values.push(value);
      index += 1;
    }
    assignments.push("updated_at = NOW()");
    values.push(id);
    const updated = await this.queryOne<PostgresDepartmentRow>(
      `UPDATE public.departments
       SET ${assignments.join(", ")}
       WHERE id = $${index}
       RETURNING id, company_id, name, department_code, description, is_active, created_by, created_at, updated_at`,
      values,
    );
    if (!updated) throw new Error("Department update returned no row.");
    return updated;
  }

  async deleteDepartment(id: string): Promise<void> {
    await this.query("DELETE FROM public.departments WHERE id = $1", [id]);
  }

  async getCompanyById(id: string): Promise<PostgresCompanyRow | null> {
    return this.queryOne<PostgresCompanyRow>(
      `SELECT id, name, code, is_active, created_at, updated_at
       FROM public.companies
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
  }

  async listActiveCompanies(): Promise<PostgresCompanyRow[]> {
    return this.query<PostgresCompanyRow>(
      `SELECT id, name, code, is_active, created_at, updated_at
       FROM public.companies
       WHERE is_active = true
       ORDER BY created_at ASC`,
    );
  }

  private formatError(error: unknown): { code: string; message: string } {
    if (typeof error === "object" && error && "code" in error && typeof (error as { code?: unknown }).code === "string") {
      const maybeMessage = "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Unknown PostgreSQL error";
      return {
        code: (error as { code: string }).code,
        message: maybeMessage,
      };
    }
    if (error instanceof Error) return { code: "POSTGRES_CONNECTION_ERROR", message: error.message };
    return { code: "POSTGRES_CONNECTION_ERROR", message: "Unknown PostgreSQL error" };
  }
}
