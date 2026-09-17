import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { can } from "../rbac/policy";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { SupabaseService } from "../supabase/supabase.service";

function nextDepartmentCode(codes: string[]): string {
  const numbers = codes
    .map((code) => Number(code.replace(/^DEP-/, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return `DEP-${String(next).padStart(3, "0")}`;
}

@Injectable()
export class DepartmentsService {
  private readonly logger = new Logger(DepartmentsService.name);

  constructor(private supabase: SupabaseService) {}

  async list(user: AuthenticatedUser, search?: string, status?: "ACTIVE" | "INACTIVE" | "ALL") {
    this.logger.log("[DEPARTMENT_LIST] Departments fetch started");
    const [departments, users] = await Promise.all([
      this.supabase.listDepartments(user.companyId),
      this.supabase.listUsers(user.companyId),
    ]);
    const userCountByDepartmentId = new Map<string, number>();
    for (const row of users) {
      if (!row.department_id) continue;
      userCountByDepartmentId.set(row.department_id, (userCountByDepartmentId.get(row.department_id) ?? 0) + 1);
    }
    return departments
      .filter((department) => {
        if (status === "ACTIVE") return department.is_active;
        if (status === "INACTIVE") return !department.is_active;
        return true;
      })
      .filter((department) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return department.name.toLowerCase().includes(q) || department.department_code.toLowerCase().includes(q);
      })
      .map((department) => ({
        id: department.id,
        code: department.department_code,
        name: department.name,
        description: department.description,
        status: department.is_active ? "ACTIVE" : "INACTIVE",
        userCount: userCountByDepartmentId.get(department.id) ?? 0,
      }));
  }

  async create(
    name: string,
    description: string | undefined,
    code: string | undefined,
    status: "ACTIVE" | "INACTIVE" | undefined,
    user: AuthenticatedUser,
  ) {
    if (!can(user.role, "department", "create")) throw new ForbiddenException();
    const existingDepartments = await this.supabase.listDepartments(user.companyId);
    const existingCodes = existingDepartments.map((d) => d.department_code);
    const generatedCode = code?.trim().toUpperCase() || nextDepartmentCode(existingCodes);
    const duplicate = existingCodes.find((existingCode) => existingCode.toLowerCase() === generatedCode.toLowerCase());
    if (duplicate) throw new ConflictException(`Department code ${generatedCode} already exists.`);
    const duplicateName = existingDepartments.find((department) => department.name.toLowerCase() === name.trim().toLowerCase());
    if (duplicateName) throw new ConflictException(`Department name ${name} already exists.`);
    this.logger.log(`[DEPARTMENT_CREATE] Company resolved: ${user.companyId}`);
    const created = await this.supabase.createDepartment({
      company_id: user.companyId,
      name: name.trim(),
      department_code: generatedCode,
      description: description?.trim() || null,
      is_active: (status ?? "ACTIVE") === "ACTIVE",
      created_by: user.id,
    });
    this.logger.log(`[DEPARTMENT_CREATE] Department created successfully: ${created.id}`);
    return {
      id: created.id,
      code: created.department_code,
      name: created.name,
      description: created.description,
      status: created.is_active ? "ACTIVE" : "INACTIVE",
      userCount: 0,
    };
  }

  async update(
    id: string,
    data: { name?: string; description?: string; code?: string; status?: "ACTIVE" | "INACTIVE" },
    user: AuthenticatedUser,
  ) {
    if (!can(user.role, "department", "update")) throw new ForbiddenException();
    const department = await this.supabase.getDepartmentById(id);
    if (department && department.company_id !== user.companyId) throw new NotFoundException("Department not found");
    if (!department) throw new NotFoundException("Department not found");

    const existingDepartments = await this.supabase.listDepartments(user.companyId);

    if (data.code && data.code.toLowerCase() !== department.department_code.toLowerCase()) {
      const existingCode = existingDepartments.find(
        (row) => row.id !== id && row.department_code.toLowerCase() === data.code!.toLowerCase(),
      );
      if (existingCode) throw new ConflictException(`Department code ${data.code} already exists.`);
    }

    if (data.name && data.name.toLowerCase() !== department.name.toLowerCase()) {
      const existingName = existingDepartments.find((row) => row.id !== id && row.name.toLowerCase() === data.name!.toLowerCase());
      if (existingName) throw new ConflictException(`Department name ${data.name} already exists.`);
    }

    const updated = await this.supabase.updateDepartment(id, {
      name: data.name?.trim() ?? department.name,
      description: data.description !== undefined ? data.description.trim() || null : department.description,
      department_code: data.code?.trim().toUpperCase() ?? department.department_code,
      is_active: data.status ? data.status === "ACTIVE" : department.is_active,
    });
    return {
      id: updated.id,
      code: updated.department_code,
      name: updated.name,
      description: updated.description,
      status: updated.is_active ? "ACTIVE" : "INACTIVE",
      userCount: (await this.supabase.listUsers(user.companyId)).filter((row) => row.department_id === updated.id).length,
    };
  }

  async remove(id: string, user: AuthenticatedUser) {
    if (!can(user.role, "department", "delete")) throw new ForbiddenException();
    const department = await this.supabase.getDepartmentById(id);
    if (department && department.company_id !== user.companyId) throw new NotFoundException("Department not found");
    if (!department) throw new NotFoundException("Department not found");
    const assignedUsers = (await this.supabase.listUsers(user.companyId)).filter((row) => row.department_id === id && row.status === "ACTIVE");
    if (assignedUsers.length > 0) {
      throw new ConflictException(
        `Cannot delete department. ${assignedUsers.length} users are currently assigned to ${department.name}. Please reassign the users before deleting this department.`,
      );
    }
    await this.supabase.deleteDepartment(id);
  }
}
