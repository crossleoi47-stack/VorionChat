import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { AuditService } from "../audit/audit.service";
import { can } from "../rbac/policy";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { SupabaseService } from "../supabase/supabase.service";
import { mapAppRoleToSupabase, mapAppStatusToSupabase, mapSupabaseRoleToApp, mapSupabaseStatusToApp } from "./user-compat";

export interface CreatedUserDto {
  success: true;
  message: string;
  user: {
    id: string;
    employeeCode: string;
    fullName: string;
    email: string | null;
    role: string;
    status: string;
    departmentId: string | null;
    companyId: string;
  };
}

export interface UserSummaryDto {
  id: string;
  employeeCode: string;
  email: string | null;
  fullName: string;
  role: string;
  status: string;
  departmentId: string | null;
  department: { id: string; code: string; name: string; status: string } | null;
}

export interface UserListResult {
  items: UserSummaryDto[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private audit: AuditService,
    private supabase: SupabaseService,
  ) {}

  private normalizeEmployeeCode(code: string | null | undefined): string {
    return code?.trim() || "";
  }

  private getNextEmployeeCode(existingCodes: string[]): string {
    const max = existingCodes.reduce((highest, code) => {
      const match = /^EMP-(\d+)$/i.exec(code.trim());
      if (!match) return highest;
      const value = Number(match[1]);
      return Number.isFinite(value) ? Math.max(highest, value) : highest;
    }, 0);
    return `EMP-${String(max + 1).padStart(6, "0")}`;
  }

  private async ensureEmployeeCodes(rows: Awaited<ReturnType<SupabaseService["listUsers"]>>) {
    return rows;
  }

  async list(
    user: AuthenticatedUser,
    query: { search?: string; role?: string | "ALL"; departmentId?: string | "ALL"; status?: string | "ALL"; page?: number; pageSize?: number },
  ): Promise<UserListResult> {
    this.logger.log("[EMPLOYEE_LIST] Fetching employees");
    this.logger.log(`[EMPLOYEE_LIST] Company resolved: ${user.companyId}`);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(25, Math.max(1, query.pageSize ?? 10));
    const roleFilter = query.role && query.role !== "ALL" ? mapAppRoleToSupabase(query.role) : null;
    const statusFilter =
      query.status && query.status !== "ALL" ? mapAppStatusToSupabase(query.status) : null;
    if (query.role && query.role !== "ALL" && !roleFilter) {
      return { items: [], page, pageSize, total: 0 };
    }

    const [rawUsers, departments] = await Promise.all([this.supabase.listUsers(user.companyId), this.supabase.listDepartments(user.companyId)]);
    const users = await this.ensureEmployeeCodes(rawUsers);
    const departmentMap = new Map(departments.map((department) => [department.id, department]));
    const filtered = users.filter((row) => {
      if (roleFilter && row.role !== roleFilter) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (query.departmentId && query.departmentId !== "ALL" && row.department_id !== query.departmentId) return false;
      if (!query.search) return true;
      const q = query.search.toLowerCase();
      const department = row.department_id ? departmentMap.get(row.department_id) : null;
      return (
        row.full_name.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        department?.name.toLowerCase().includes(q) ||
        department?.department_code.toLowerCase().includes(q)
      );
    });
    const total = filtered.length;
    const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

    this.logger.log(`[EMPLOYEE_LIST] Employees fetched successfully: ${paged.length}`);

    return {
      items: paged.map((u) => {
        const department = u.department_id ? departmentMap.get(u.department_id) : null;
        return {
          id: u.id,
          employeeCode: this.normalizeEmployeeCode(u.employee_code),
          email: u.email,
          fullName: u.full_name,
          role: mapSupabaseRoleToApp(u.role),
          status: mapSupabaseStatusToApp(u.status),
          departmentId: u.department_id,
          department: department
            ? { id: department.id, code: department.department_code, name: department.name, status: department.is_active ? "ACTIVE" : "INACTIVE" }
            : null,
        };
      }),
      page,
      pageSize,
      total,
    };
  }

  async create(dto: CreateUserDto, admin: AuthenticatedUser): Promise<CreatedUserDto> {
    this.logger.log("[EMPLOYEE_CREATE] Request received");
    if (!can(admin.role, "user", "create")) throw new ForbiddenException();
    if (!admin.companyId) {
      throw new NotFoundException("Unable to create employee: company context is missing.");
    }

    this.logger.log("[EMPLOYEE_CREATE] Validating employee data");
    const email = dto.email.trim().toLowerCase();
    const mappedRole = mapAppRoleToSupabase(dto.role);
    if (!mappedRole) {
      throw new ForbiddenException("Selected role is not supported by the current database schema.");
    }
    this.logger.log(`[EMPLOYEE_CREATE] Role mapped: ${dto.role} -> ${mappedRole}`);

    const company = await this.supabase.getCompanyById(admin.companyId);
    if (!company || !company.is_active) {
      throw new NotFoundException("Unable to create employee: company context is missing.");
    }
    this.logger.log(`[EMPLOYEE_CREATE] Company resolved: ${company.id}`);

    let departmentId: string | null = null;
    if (dto.departmentId) {
      const department = await this.supabase.getDepartmentById(dto.departmentId);
      if (!department) throw new NotFoundException("Selected department was not found.");
      if (department.company_id !== admin.companyId) {
        throw new ForbiddenException("Selected department does not belong to this company.");
      }
      if (!department.is_active) {
        throw new ForbiddenException("Selected department is inactive.");
      }
      departmentId = department.id;
      this.logger.log(`[EMPLOYEE_CREATE] Department resolved: ${department.department_code} / ${department.name}`);
    }

    const existingUsers = await this.ensureEmployeeCodes(await this.supabase.listUsers(admin.companyId));
    if (existingUsers.some((row) => row.email.toLowerCase() === email)) {
      throw new ConflictException("An employee with this email already exists.");
    }
    const employeeCode = this.getNextEmployeeCode(existingUsers.map((row) => this.normalizeEmployeeCode(row.employee_code)).filter(Boolean));
    const passwordHash = await argon2.hash(dto.password);
    this.logger.log("[EMPLOYEE_CREATE] Saving to Supabase PostgreSQL...");
    let created;
    try {
      created = await this.supabase.createUser({
        company_id: admin.companyId,
        department_id: departmentId,
        employee_code: employeeCode,
        full_name: dto.fullName.trim(),
        email,
        password_hash: passwordHash,
        role: mappedRole,
        status: mapAppStatusToSupabase(dto.status),
        avatar_url: null,
      });
      this.logger.log("[EMPLOYEE_CREATE] INSERT: PASS");
      this.logger.log("[EMPLOYEE_CREATE] Employee successfully stored in Supabase");
      this.logger.log(`[EMPLOYEE_CREATE] ID: ${created.id}`);
    } catch (error) {
      const safeCode =
        typeof error === "object" && error && "code" in error && typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : "EMPLOYEE_CREATE_FAILED";
      const safeMessage = error instanceof Error ? error.message : "Unknown employee insert error";
      this.logger.error("[EMPLOYEE_CREATE] INSERT: FAILED");
      this.logger.error(`[EMPLOYEE_CREATE] Error code: ${safeCode}`);
      this.logger.error(`[EMPLOYEE_CREATE] Error: ${safeMessage}`);
      throw error;
    }

    try {
      await this.audit.record({
        companyId: admin.companyId,
        actorId: admin.id,
        action: "user.create",
        target: `user:${created.id}`,
        after: { email: created.email, role: created.role, status: created.status },
      });
    } catch (error) {
      this.logger.warn(`[EMPLOYEE_CREATE] Audit log skipped: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    return {
      success: true,
      message: "Employee created successfully.",
      user: {
        id: created.id,
        employeeCode: this.normalizeEmployeeCode(created.employee_code),
        fullName: created.full_name,
        email: created.email,
        role: mapSupabaseRoleToApp(created.role),
        status: mapSupabaseStatusToApp(created.status),
        departmentId: created.department_id,
        companyId: created.company_id,
      },
    };
  }

  async getOne(userId: string, admin: AuthenticatedUser) {
    const target = await this.supabase.getUserById(userId);
    if (!target || target.company_id !== admin.companyId) throw new NotFoundException("User not found");
    const department = target.department_id ? await this.supabase.getDepartmentById(target.department_id) : null;
    return {
      id: target.id,
      employeeCode: this.normalizeEmployeeCode(target.employee_code),
      email: target.email,
      fullName: target.full_name,
      role: mapSupabaseRoleToApp(target.role),
      status: mapSupabaseStatusToApp(target.status),
      departmentId: target.department_id,
      department: department
        ? { id: department.id, code: department.department_code, name: department.name, status: department.is_active ? "ACTIVE" : "INACTIVE" }
        : null,
    };
  }

  /** Disables the account. Does not touch client assignments — see AssignmentsService.offboardAndReassign for the combined flow. */
  async disable(userId: string, admin: AuthenticatedUser): Promise<void> {
    if (!can(admin.role, "user", "disable")) throw new ForbiddenException();
    const target = await this.supabase.getUserById(userId);
    if (!target || target.company_id !== admin.companyId) throw new NotFoundException("User not found");
    const targetRole = mapSupabaseRoleToApp(target.role);
    const targetStatus = mapSupabaseStatusToApp(target.status);
    if (!target) throw new NotFoundException("User not found");
    if (admin.role !== "SUPER_ADMIN" && targetRole === "SUPER_ADMIN") throw new ForbiddenException("You do not have permission to modify this user.");
    if (targetStatus === "DISABLED") return;

    await this.supabase.updateUser(userId, { status: "INACTIVE" });

    await this.audit.record({
      companyId: admin.companyId,
      actorId: admin.id,
      action: "user.disable",
      target: `user:${userId}`,
      before: { status: targetStatus },
      after: { status: "DISABLED" },
    });
  }

  async delete(userId: string, admin: AuthenticatedUser): Promise<void> {
    if (!can(admin.role, "user", "delete")) throw new ForbiddenException();
    const target = await this.supabase.getUserById(userId);
    if (!target || target.company_id !== admin.companyId) throw new NotFoundException("User not found");
    const targetRole = mapSupabaseRoleToApp(target.role);
    const targetStatus = mapSupabaseStatusToApp(target.status);
    if (admin.role !== "SUPER_ADMIN") throw new ForbiddenException("Only a Super Admin can remove employees.");
    if (admin.id === userId) throw new ForbiddenException("You cannot delete your own account.");
    if (targetRole === "SUPER_ADMIN") {
      const superAdmins = (await this.supabase.listUsersByRole("SUPER_ADMIN")).filter((row) => row.status === "ACTIVE");
      if (superAdmins.length <= 1) {
        throw new ForbiddenException("You cannot delete the last remaining Super Admin.");
      }
    }

    await this.supabase.deleteUser(userId);

    await this.audit.record({
      companyId: admin.companyId,
      actorId: admin.id,
      action: "user.delete",
      target: `user:${userId}`,
      before: { status: targetStatus },
      after: { deleted: true },
    });
  }

  async update(userId: string, dto: UpdateUserDto, admin: AuthenticatedUser) {
    if (!can(admin.role, "user", "update")) throw new ForbiddenException();
    const target = await this.supabase.getUserById(userId);
    if (!target || target.company_id !== admin.companyId) throw new NotFoundException("User not found");
    const targetRole = mapSupabaseRoleToApp(target.role);
    if (admin.role !== "SUPER_ADMIN" && targetRole === "SUPER_ADMIN") throw new ForbiddenException("You do not have permission to modify this user.");
    if (admin.role !== "SUPER_ADMIN" && dto.role === "SUPER_ADMIN") throw new ForbiddenException("You do not have permission to promote this user.");
    if (dto.email) {
      const email = dto.email.trim().toLowerCase();
      const existingUsers = await this.ensureEmployeeCodes(await this.supabase.listUsers(admin.companyId));
      const emailTaken = existingUsers.find((row) => row.id !== userId && row.email.toLowerCase() === email);
      if (emailTaken) throw new ConflictException("That email address is already registered");
      dto.email = email;
    }
    if (dto.departmentId) {
      const department = await this.supabase.getDepartmentById(dto.departmentId);
      if (!department) throw new NotFoundException("Department not found");
      if (department.company_id !== admin.companyId) throw new ForbiddenException("Selected department does not belong to this company.");
      if ((dto.status === "ACTIVE" || !dto.status) && !department.is_active) {
        throw new ForbiddenException("Only active departments can be assigned to active employees.");
      }
    }
    const passwordHash = dto.password ? await argon2.hash(dto.password) : undefined;
    const mappedRole = dto.role ? mapAppRoleToSupabase(dto.role) : undefined;
    if (dto.role && !mappedRole) {
      throw new ForbiddenException("Selected role is not supported by the current database schema.");
    }
    const mappedStatus = dto.status ? mapAppStatusToSupabase(dto.status) : target.status;
    const updated = await this.supabase.updateUser(userId, {
      full_name: dto.fullName?.trim() ?? target.full_name,
      email: dto.email ?? target.email,
      role: mappedRole ?? target.role,
      department_id: dto.departmentId !== undefined ? dto.departmentId || null : target.department_id,
      status: mappedStatus,
      ...(passwordHash ? { password_hash: passwordHash } : {}),
    });
    await this.audit.record({
      companyId: admin.companyId,
      actorId: admin.id,
      action: "user.update",
      target: `user:${userId}`,
      before: { role: targetRole, status: mapSupabaseStatusToApp(target.status), departmentId: target.department_id },
      after: { role: mapSupabaseRoleToApp(updated.role), status: mapSupabaseStatusToApp(updated.status), departmentId: updated.department_id },
    });
    return {
      id: updated.id,
      employeeCode: this.normalizeEmployeeCode(updated.employee_code),
      email: updated.email,
      fullName: updated.full_name,
      role: mapSupabaseRoleToApp(updated.role),
      status: mapSupabaseStatusToApp(updated.status),
      departmentId: updated.department_id,
      companyId: updated.company_id,
    };
  }

  async enable(userId: string, admin: AuthenticatedUser): Promise<void> {
    if (!can(admin.role, "user", "update")) throw new ForbiddenException();
    const target = await this.supabase.getUserById(userId);
    if (!target || target.company_id !== admin.companyId) throw new NotFoundException("User not found");
    const targetRole = mapSupabaseRoleToApp(target.role);
    if (admin.role !== "SUPER_ADMIN" && targetRole === "SUPER_ADMIN") throw new ForbiddenException("You do not have permission to modify this user.");
    await this.supabase.updateUser(userId, { status: "ACTIVE" });
    await this.audit.record({
      companyId: admin.companyId,
      actorId: admin.id,
      action: "user.enable",
      target: `user:${userId}`,
      before: { status: mapSupabaseStatusToApp(target.status) },
      after: { status: "ACTIVE" },
    });
  }
}
