import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

interface SupabaseConnectionState {
  configured: boolean;
  urlConfigured: boolean;
  serviceKeyConfigured: boolean;
  connected: boolean;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

const SUPABASE_STARTUP_TIMEOUT_MS = 8000;

type SafeSupabaseError = {
  code: string;
  message: string;
};

function hasMessage(error: unknown): error is { message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as Record<string, unknown>).message === "string"
  );
}

function getStringField(error: unknown, field: string): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    field in error &&
    typeof (error as Record<string, unknown>)[field] === "string"
  ) {
    return (error as Record<string, string>)[field];
  }
  return null;
}

export interface SupabaseUserRow {
  id: string;
  company_id: string;
  department_id: string | null;
  employee_code: string | null;
  full_name: string;
  email: string;
  password_hash: string;
  role: "SUPER_ADMIN" | "ADMIN" | "VA";
  status: "ACTIVE" | "INACTIVE";
  avatar_url: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseDepartmentRow {
  id: string;
  company_id: string;
  name: string;
  department_code: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseCompanyRow {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupabaseAssignmentRow {
  id: string;
  company_id: string;
  client_id: string;
  previous_user_id: string | null;
  user_id: string;
  assigned_by_id: string | null;
  reason: string | null;
  assigned_at: string;
  unassigned_at: string | null;
}

export interface SupabaseCallRow {
  id: string;
  companyId: string;
  conversationId: string | null;
  callerId: string;
  calleeId: string;
  type: "VOICE" | "VIDEO";
  status: "RINGING" | "ONGOING" | "ENDED" | "MISSED" | "DECLINED" | "FAILED";
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
}

export interface SupabaseCallUserRow {
  id: string;
  companyId: string;
  fullName: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface SupabaseAuditRow {
  company_id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  ip_address?: string;
}

export interface SupabaseClientRow {
  id: string;
  company_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  whatsapp_phone: string | null;
  status: string;
}

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;
  private readonly client: SupabaseClient | null;
  private readonly connectionState: SupabaseConnectionState = {
    configured: false,
    urlConfigured: false,
    serviceKeyConfigured: false,
    connected: false,
    lastErrorCode: null,
    lastErrorMessage: null,
  };
  private startupCheckPromise: Promise<boolean> | null = null;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>("SUPABASE_URL")?.replace(/\/$/, "") ?? "";
    this.serviceRoleKey = config.get<string>("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    this.connectionState.urlConfigured = Boolean(this.baseUrl);
    this.connectionState.serviceKeyConfigured = Boolean(this.serviceRoleKey);
    this.connectionState.configured = this.connectionState.urlConfigured && this.connectionState.serviceKeyConfigured;
    this.client = this.connectionState.configured
      ? createClient(this.baseUrl, this.serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { fetch: this.fetchWithRetry },
        })
      : null;
  }

  private fetchWithRetry: typeof fetch = async (input, init) => {
    try {
      return await fetch(input, init);
    } catch (error) {
      if (error instanceof TypeError && error.message === "fetch failed") {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return fetch(input, init);
      }
      throw error;
    }
  };

  async onModuleInit(): Promise<void> {
    await this.ensureStartupCheckPassed();
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  getConnectionState() {
    return { ...this.connectionState };
  }

  private formatError(error: unknown): SafeSupabaseError {
    if (error instanceof InternalServerErrorException) {
      const response = error.getResponse();
      if (typeof response === "string") {
        return { code: "SUPABASE_REQUEST_FAILED", message: response };
      }
      if (typeof response === "object" && response) {
        const message =
          "message" in response
            ? Array.isArray((response as { message?: unknown }).message)
              ? String((response as { message: unknown[] }).message[0] ?? "Supabase request failed")
              : String((response as { message?: unknown }).message ?? "Supabase request failed")
            : error.message;
        return { code: "SUPABASE_REQUEST_FAILED", message };
      }
    }

    if (typeof error === "object" && error && "code" in error && typeof (error as { code?: unknown }).code === "string") {
      const errorCode = getStringField(error, "code") ?? "SUPABASE_CONNECTION_ERROR";
      const errorMessage = hasMessage(error) ? error.message : String(error);
      return {
        code: errorCode,
        message: errorMessage,
      };
    }

    if (error instanceof Error) {
      return { code: "SUPABASE_CONNECTION_ERROR", message: error.message };
    }

    return { code: "SUPABASE_CONNECTION_ERROR", message: "Unknown Supabase error" };
  }

  async ensureStartupCheckPassed(): Promise<boolean> {
    if (!this.startupCheckPromise) {
      this.startupCheckPromise = this.runStartupCheck();
    }
    return this.startupCheckPromise;
  }

  async runStartupCheck(): Promise<boolean> {
    this.logger.log("[SUPABASE] Initializing...");
    this.logger.log(`[SUPABASE] URL configured: ${this.connectionState.urlConfigured ? "YES" : "NO"}`);
    this.logger.log(`[SUPABASE] Service key configured: ${this.connectionState.serviceKeyConfigured ? "YES" : "NO"}`);

    if (!this.connectionState.urlConfigured) {
      this.connectionState.connected = false;
      this.connectionState.lastErrorCode = "SUPABASE_URL_MISSING";
      this.connectionState.lastErrorMessage = "SUPABASE_URL is missing";
      this.logger.error("[SUPABASE] Database connection: FAILED");
      this.logger.error("[SUPABASE] Error code: SUPABASE_URL_MISSING");
      this.logger.error("[SUPABASE] Error message: SUPABASE_URL is missing");
      throw new InternalServerErrorException("SUPABASE_URL is missing.");
    }

    if (!this.connectionState.serviceKeyConfigured || !this.client) {
      this.connectionState.connected = false;
      this.connectionState.lastErrorCode = "SUPABASE_SERVICE_ROLE_KEY_MISSING";
      this.connectionState.lastErrorMessage = "SUPABASE_SERVICE_ROLE_KEY is missing";
      this.logger.error("[SUPABASE] Configuration error: SUPABASE_SERVICE_ROLE_KEY is missing");
      this.logger.error("[SUPABASE] Database connection: FAILED");
      this.logger.error("[SUPABASE] Error code: SUPABASE_SERVICE_ROLE_KEY_MISSING");
      this.logger.error("[SUPABASE] Error message: SUPABASE_SERVICE_ROLE_KEY is missing");
      throw new InternalServerErrorException("SUPABASE_SERVICE_ROLE_KEY is missing.");
    }

    this.logger.log("[SUPABASE] Testing database connection...");

    try {
      const query = this.client.from("companies").select("id").limit(1);
      const { error } = await Promise.race([
        query,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Supabase startup check timed out after ${SUPABASE_STARTUP_TIMEOUT_MS}ms`)), SUPABASE_STARTUP_TIMEOUT_MS),
        ),
      ]);
      if (error) throw error;
      this.connectionState.connected = true;
      this.connectionState.lastErrorCode = null;
      this.connectionState.lastErrorMessage = null;
      this.logger.log("[SUPABASE] Database connection: PASS");
      this.logger.log("[SUPABASE] Connected successfully");
      return true;
    } catch (error) {
      const safeError = this.formatError(error);
      this.connectionState.connected = false;
      this.connectionState.lastErrorCode = safeError.code;
      this.connectionState.lastErrorMessage = safeError.message;
      this.logger.error("[SUPABASE] Database connection: FAILED");
      this.logger.error(`[SUPABASE] Error code: ${safeError.code}`);
      this.logger.error(`[SUPABASE] Error message: ${safeError.message}`);
      return false;
    }
  }

  private readonly userSelect =
    "id,company_id,department_id,full_name,email,password_hash,role,status,avatar_url,last_seen_at,created_at,updated_at";

  private normalizeUserRow(row: Omit<SupabaseUserRow, "employee_code">): SupabaseUserRow {
    return { ...row, employee_code: null };
  }

  async getCallUserById(id: string): Promise<SupabaseCallUserRow | null> {
    const { data, error } = await this.client!
      .from("users")
      .select("id,company_id,full_name,status")
      .eq("id", id)
      .limit(1);
    if (error) throw new InternalServerErrorException(error.message);
    const row = ((data ?? [])[0] as
      | { id: string; company_id: string; full_name: string; status: "ACTIVE" | "INACTIVE" }
      | undefined);
    return row
      ? { id: row.id, companyId: row.company_id, fullName: row.full_name, status: row.status }
      : null;
  }

  async recordAudit(entry: SupabaseAuditRow): Promise<void> {
    const { error } = await this.client!.from("audit_logs").insert({
      company_id: entry.company_id,
      actor_user_id: entry.actor_user_id,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      ip_address: entry.ip_address ?? null,
    });
    if (error) throw new InternalServerErrorException(error.message);
  }

  async listAuditLogs(companyId: string, limit: number): Promise<Array<Record<string, unknown>>> {
    const { data, error } = await this.client!
      .from("audit_logs")
      .select("id,action,entity_type,entity_id,created_at,ip_address,actor_user_id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new InternalServerErrorException(error.message);
    const rows = (data ?? []) as Array<{
      id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      created_at: string;
      ip_address: string | null;
      actor_user_id: string | null;
    }>;
    const actors = await Promise.all(rows.map((row) => (row.actor_user_id ? this.getUserById(row.actor_user_id) : null)));
    return rows.map((row, index) => ({
      id: row.id,
      action: row.action,
      target: `${row.entity_type}:${row.entity_id}`,
      createdAt: row.created_at,
      ip: row.ip_address,
      actor: actors[index] ? { fullName: actors[index]!.full_name, employeeCode: "" } : null,
    }));
  }

  async listClients(companyId: string): Promise<SupabaseClientRow[]> {
    const { data, error } = await this.client!
      .from("clients")
      .select("id,company_id,full_name,phone,email,whatsapp_phone,status")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as SupabaseClientRow[];
  }

  async getClientById(id: string, companyId: string): Promise<SupabaseClientRow | null> {
    const { data, error } = await this.client!
      .from("clients")
      .select("id,company_id,full_name,phone,email,whatsapp_phone,status")
      .eq("id", id)
      .eq("company_id", companyId)
      .limit(1);
    if (error) throw new InternalServerErrorException(error.message);
    return ((data ?? [])[0] as SupabaseClientRow | undefined) ?? null;
  }

  async listConversationsForUser(user: { id: string; companyId: string; role: string }): Promise<Array<Record<string, unknown>>> {
    const privileged = ["SUPER_ADMIN", "COMPANY_ADMIN", "ADMIN", "AUDITOR"].includes(user.role);
    let conversationIds: string[] | null = null;
    if (!privileged) {
      const { data: memberships, error: membershipError } = await this.client!
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", user.id)
        .is("left_at", null);
      if (membershipError) throw new InternalServerErrorException(membershipError.message);
      conversationIds = (memberships ?? []).map((membership) => membership.conversation_id as string);
      if (conversationIds.length === 0) return [];
    }

    let conversationQuery = this.client!
      .from("conversations")
      .select("id,company_id,type,name,client_id,status,is_pinned,is_muted,last_message_at,created_at")
      .eq("company_id", user.companyId)
      .order("created_at", { ascending: false });
    if (conversationIds) conversationQuery = conversationQuery.in("id", conversationIds);
    const { data: conversations, error: conversationError } = await conversationQuery;
    if (conversationError) throw new InternalServerErrorException(conversationError.message);

    const rows = (conversations ?? []) as Array<{
      id: string;
      type: string;
      name: string | null;
      client_id: string | null;
      is_pinned: boolean;
      is_muted: boolean;
      last_message_at: string | null;
    }>;
    const results = await Promise.all(rows.map(async (conversation) => {
      const [{ data: members, error: membersError }, { data: clients, error: clientsError }, { count, error: countError }] = await Promise.all([
        this.client!.from("conversation_members").select("user_id,last_read_at").eq("conversation_id", conversation.id).is("left_at", null),
        conversation.client_id ? this.client!.from("clients").select("id,full_name").eq("id", conversation.client_id).limit(1) : Promise.resolve({ data: [], error: null }),
        this.client!.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversation.id).is("deleted_at", null),
      ]);
      if (membersError) throw new InternalServerErrorException(membersError.message);
      if (clientsError) throw new InternalServerErrorException(clientsError.message);
      if (countError) throw new InternalServerErrorException(countError.message);
      const peerId = conversation.type === "DIRECT"
        ? (members ?? []).map((member) => member.user_id as string).find((id) => id !== user.id) ?? null
        : null;
      const peer = peerId ? await this.getUserById(peerId) : null;
      const client = (clients ?? [])[0] as { full_name?: string } | undefined;
      return {
        id: conversation.id,
        type: conversation.type,
        groupId: null,
        peerUserId: peerId,
        peerName: peer?.full_name ?? null,
        clientDisplayCode: conversation.client_id,
        clientName: client?.full_name ?? null,
        groupName: conversation.name,
        lastMessageAt: conversation.last_message_at,
        archived: false,
        pinned: conversation.is_pinned,
        muted: conversation.is_muted,
        unreadCount: count ?? 0,
      };
    }));
    return results;
  }

  async createClient(data: {
    company_id: string;
    full_name: string;
    phone: string;
    email?: string | null;
    created_by: string;
  }): Promise<SupabaseClientRow> {
    const { data: rows, error } = await this.client!
      .from("clients")
      .insert({ ...data, email: data.email ?? null })
      .select("id,company_id,full_name,phone,email,whatsapp_phone,status")
      .limit(1);
    if (error) throw new InternalServerErrorException(error.message);
    return rows![0] as SupabaseClientRow;
  }

  async createCall(data: Pick<SupabaseCallRow, "companyId" | "callerId" | "calleeId" | "type">): Promise<SupabaseCallRow> {
    const { data: rows, error } = await this.client!
      .from("calls")
      .insert({ ...data, status: "RINGING" })
      .select("id,companyId,conversationId,callerId,calleeId,type,status,startedAt,answeredAt,endedAt");
    if (error) throw new InternalServerErrorException(error.message);
    return rows![0] as SupabaseCallRow;
  }

  async getCallById(id: string): Promise<SupabaseCallRow | null> {
    const { data, error } = await this.client!
      .from("calls")
      .select("id,companyId,conversationId,callerId,calleeId,type,status,startedAt,answeredAt,endedAt")
      .eq("id", id)
      .limit(1);
    if (error) throw new InternalServerErrorException(error.message);
    return ((data ?? [])[0] as SupabaseCallRow | undefined) ?? null;
  }

  async updateCall(id: string, data: Partial<Pick<SupabaseCallRow, "status" | "answeredAt" | "endedAt">>): Promise<SupabaseCallRow> {
    const { data: rows, error } = await this.client!
      .from("calls")
      .update(data)
      .eq("id", id)
      .select("id,companyId,conversationId,callerId,calleeId,type,status,startedAt,answeredAt,endedAt");
    if (error) throw new InternalServerErrorException(error.message);
    return rows![0] as SupabaseCallRow;
  }

  async expireStaleCalls(cutoff: Date, endedAt: Date): Promise<number> {
    const { data, error } = await this.client!
      .from("calls")
      .update({ status: "MISSED", endedAt: endedAt.toISOString() })
      .eq("status", "RINGING")
      .lt("startedAt", cutoff.toISOString())
      .select("id");
    if (error) throw new InternalServerErrorException(error.message);
    return data?.length ?? 0;
  }

  async listCallsForUser(companyId: string, userId: string): Promise<SupabaseCallRow[]> {
    const { data, error } = await this.client!
      .from("calls")
      .select("id,companyId,conversationId,callerId,calleeId,type,status,startedAt,answeredAt,endedAt")
      .eq("companyId", companyId)
      .or(`callerId.eq.${userId},calleeId.eq.${userId}`)
      .order("startedAt", { ascending: false })
      .limit(100);
    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as SupabaseCallRow[];
  }

  async listUsers(companyId: string): Promise<SupabaseUserRow[]> {
    const { data, error } = await this.client!
      .from("users")
      .select(this.userSelect)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return ((data ?? []) as Array<Omit<SupabaseUserRow, "employee_code">>).map((row) => this.normalizeUserRow(row));
  }

  async getUserByEmail(email: string): Promise<SupabaseUserRow | null> {
    const { data, error } = await this.client!
      .from("users")
      .select(this.userSelect)
      .ilike("email", email)
      .limit(1);
    if (error) throw new InternalServerErrorException(error.message);
    const row = ((data ?? [])[0] as Omit<SupabaseUserRow, "employee_code"> | undefined) ?? null;
    return row ? this.normalizeUserRow(row) : null;
  }

  async getUserById(id: string): Promise<SupabaseUserRow | null> {
    const { data, error } = await this.client!
      .from("users")
      .select(this.userSelect)
      .eq("id", id)
      .limit(1);
    if (error) throw new InternalServerErrorException(error.message);
    const row = ((data ?? [])[0] as Omit<SupabaseUserRow, "employee_code"> | undefined) ?? null;
    return row ? this.normalizeUserRow(row) : null;
  }

  async listUsersByRole(role: SupabaseUserRow["role"]): Promise<SupabaseUserRow[]> {
    const { data, error } = await this.client!
      .from("users")
      .select(this.userSelect)
      .eq("role", role)
      .order("created_at", { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    return ((data ?? []) as Array<Omit<SupabaseUserRow, "employee_code">>).map((row) => this.normalizeUserRow(row));
  }

  async createUser(data: Omit<SupabaseUserRow, "id" | "created_at" | "updated_at" | "last_seen_at">): Promise<SupabaseUserRow> {
    const { employee_code, ...insertData } = data;
    const { data: rows, error } = await this.client!
      .from("users")
      .insert(insertData)
      .select(this.userSelect);
    if (error) throw new InternalServerErrorException(error.message);
    return this.normalizeUserRow(rows![0] as Omit<SupabaseUserRow, "employee_code">);
  }

  async updateUser(
    id: string,
    data: Partial<Pick<SupabaseUserRow, "department_id" | "employee_code" | "full_name" | "email" | "password_hash" | "role" | "status" | "avatar_url" | "last_seen_at">>,
  ): Promise<SupabaseUserRow> {
    const { employee_code, ...updateData } = data;
    const { data: rows, error } = await this.client!
      .from("users")
      .update(updateData)
      .eq("id", id)
      .select(this.userSelect);
    if (error) throw new InternalServerErrorException(error.message);
    return this.normalizeUserRow(rows![0] as Omit<SupabaseUserRow, "employee_code">);
  }

  async deleteUser(id: string): Promise<void> {
    const { error } = await this.client!.from("users").delete().eq("id", id);
    if (error) throw new InternalServerErrorException(error.message);
  }

  async listDepartments(companyId: string): Promise<SupabaseDepartmentRow[]> {
    const { data, error } = await this.client!
      .from("departments")
      .select("id,company_id,name,department_code,description,is_active,created_by,created_at,updated_at")
      .eq("company_id", companyId)
      .order("is_active", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as SupabaseDepartmentRow[];
  }

  async getDepartmentById(id: string): Promise<SupabaseDepartmentRow | null> {
    const { data, error } = await this.client!
      .from("departments")
      .select("id,company_id,name,department_code,description,is_active,created_by,created_at,updated_at")
      .eq("id", id)
      .limit(1);
    if (error) throw new InternalServerErrorException(error.message);
    return ((data ?? [])[0] as SupabaseDepartmentRow | undefined) ?? null;
  }

  async getDepartmentByCode(companyId: string, code: string): Promise<SupabaseDepartmentRow | null> {
    const { data, error } = await this.client!
      .from("departments")
      .select("id,company_id,name,department_code,description,is_active,created_by,created_at,updated_at")
      .eq("company_id", companyId)
      .eq("department_code", code)
      .limit(1);
    if (error) throw new InternalServerErrorException(error.message);
    return ((data ?? [])[0] as SupabaseDepartmentRow | undefined) ?? null;
  }

  async createDepartment(data: Omit<SupabaseDepartmentRow, "id" | "created_at" | "updated_at">): Promise<SupabaseDepartmentRow> {
    const { data: rows, error } = await this.client!
      .from("departments")
      .insert(data)
      .select("id,company_id,name,department_code,description,is_active,created_by,created_at,updated_at");
    if (error) throw new InternalServerErrorException(error.message);
    return rows![0] as SupabaseDepartmentRow;
  }

  async updateDepartment(
    id: string,
    data: Partial<Pick<SupabaseDepartmentRow, "name" | "department_code" | "description" | "is_active">>,
  ): Promise<SupabaseDepartmentRow> {
    const { data: rows, error } = await this.client!
      .from("departments")
      .update(data)
      .eq("id", id)
      .select("id,company_id,name,department_code,description,is_active,created_by,created_at,updated_at");
    if (error) throw new InternalServerErrorException(error.message);
    return rows![0] as SupabaseDepartmentRow;
  }

  async deleteDepartment(id: string): Promise<void> {
    const { error } = await this.client!.from("departments").delete().eq("id", id);
    if (error) throw new InternalServerErrorException(error.message);
  }

  async getCompanyById(id: string): Promise<SupabaseCompanyRow | null> {
    const { data, error } = await this.client!
      .from("companies")
      .select("id,name,code,is_active,created_at,updated_at")
      .eq("id", id)
      .limit(1);
    if (error) throw new InternalServerErrorException(error.message);
    return ((data ?? [])[0] as SupabaseCompanyRow | undefined) ?? null;
  }

  async getCompanySettings(companyId: string): Promise<Record<string, unknown>> {
    const { data, error } = await this.client!
      .from("companies")
      .select("settings")
      .eq("id", companyId)
      .limit(1);
    // Older Supabase installations may not have the optional settings column
    // yet. Keep policy reads usable while the migration is being applied.
    if (error) {
      if (error.code === "42703") return {};
      throw new InternalServerErrorException(error.message);
    }
    const settings = (data?.[0] as { settings?: unknown } | undefined)?.settings;
    return settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  }

  async updateCompanySettings(companyId: string, settings: Record<string, unknown>): Promise<void> {
    const { error } = await this.client!.from("companies").update({ settings }).eq("id", companyId);
    if (error?.code === "42703") {
      throw new InternalServerErrorException("Company settings are unavailable until the Supabase schema migration is applied.");
    }
    if (error) throw new InternalServerErrorException(error.message);
  }

  async listActiveCompanies(): Promise<SupabaseCompanyRow[]> {
    const { data, error } = await this.client!
      .from("companies")
      .select("id,name,code,is_active,created_at,updated_at")
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as SupabaseCompanyRow[];
  }

  async listAssignmentRows(companyId: string): Promise<SupabaseAssignmentRow[]> {
    const clientIds = (await this.listClients(companyId)).map((client) => client.id);
    if (clientIds.length === 0) return [];

    const { data, error } = await this.client!
      .from("assignments")
      .select("id,company_id,client_id,assigned_to,assigned_by,status,started_at,ended_at,notes")
      .eq("company_id", companyId)
      .in("client_id", clientIds)
      .order("started_at", { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      company_id: row.company_id as string,
      client_id: row.client_id as string,
      previous_user_id: null,
      user_id: row.assigned_to as string,
      assigned_by_id: row.assigned_by as string | null,
      reason: row.notes as string | null,
      assigned_at: row.started_at as string,
      unassigned_at: row.ended_at as string | null,
    }));
  }

  async closeActiveAssignments(clientId: string): Promise<void> {
    const { error } = await this.client!
      .from("assignments")
      .update({ ended_at: new Date().toISOString(), status: "ENDED" })
      .eq("client_id", clientId)
      .eq("status", "ACTIVE")
      .is("ended_at", null);
    if (error) throw new InternalServerErrorException(error.message);
  }

  async createAssignment(data: {
    company_id: string;
    client_id: string;
    previous_user_id: string | null;
    user_id: string;
    assigned_by_id: string;
    reason?: string | null;
  }): Promise<SupabaseAssignmentRow> {
    const { data: rows, error } = await this.client!
      .from("assignments")
      .insert({
        company_id: data.company_id,
        client_id: data.client_id,
        assigned_to: data.user_id,
        assigned_by: data.assigned_by_id,
        status: "ACTIVE",
        started_at: new Date().toISOString(),
        notes: data.reason ?? null,
      })
      .select("id,company_id,client_id,assigned_to,assigned_by,status,started_at,ended_at,notes");
    if (error) throw new InternalServerErrorException(error.message);
    const row = rows![0] as Record<string, unknown>;
    return {
      id: row.id as string,
      company_id: row.company_id as string,
      client_id: row.client_id as string,
      previous_user_id: data.previous_user_id,
      user_id: row.assigned_to as string,
      assigned_by_id: row.assigned_by as string | null,
      reason: row.notes as string | null,
      assigned_at: row.started_at as string,
      unassigned_at: row.ended_at as string | null,
    };
  }
}
