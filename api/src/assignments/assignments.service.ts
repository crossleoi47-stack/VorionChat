import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { ReassignDto } from "./dto/reassign.dto";
import { OffboardDto } from "./dto/offboard.dto";
import { can } from "../rbac/policy";
import { SupabaseAssignmentRow, SupabaseService } from "../supabase/supabase.service";

export interface AssignmentContextClient {
  id: string;
  displayCode: string;
  name: string;
  currentOwnerId: string | null;
  currentOwnerName: string | null;
}

export interface AssignmentHistoryRow {
  id: string;
  clientId: string;
  clientName: string;
  clientDisplayCode: string;
  previousOwnerId: string | null;
  previousOwnerName: string | null;
  newOwnerId: string;
  newOwnerName: string;
  assignedById: string | null;
  assignedByName: string | null;
  reason: string | null;
  assignedAt: Date;
}

@Injectable()
export class AssignmentsService {
  constructor(
    private supabase: SupabaseService,
    private audit: AuditService,
  ) {}

  private async requireManager(admin: AuthenticatedUser) {
    if (!can(admin.role, "assignment", "reassign")) throw new ForbiddenException();
  }

  async context(admin: AuthenticatedUser): Promise<{ clients: AssignmentContextClient[]; users: { id: string; employeeCode: string; fullName: string; departmentId: string | null; departmentName: string | null; role: string; status: string }[] }> {
    await this.requireManager(admin);
    const [clients, users, departments, assignments] = await Promise.all([
      this.supabase.listClients(admin.companyId),
      this.supabase.listUsers(admin.companyId),
      this.supabase.listDepartments(admin.companyId),
      this.supabase.listAssignmentRows(admin.companyId),
    ]);
    const latestActiveAssignmentByClientId = new Map<string, SupabaseAssignmentRow>();
    for (const assignment of assignments) {
      if (assignment.unassigned_at) continue;
      if (!latestActiveAssignmentByClientId.has(assignment.client_id)) {
        latestActiveAssignmentByClientId.set(assignment.client_id, assignment);
      }
    }
    const usersById = new Map(users.map((user) => [user.id, user]));
    const departmentsById = new Map(departments.map((department) => [department.id, department]));

    return {
      clients: clients.map((client) => ({
        id: client.id,
        displayCode: client.id,
        name: client.full_name,
        currentOwnerId: latestActiveAssignmentByClientId.get(client.id)?.user_id ?? null,
        currentOwnerName: latestActiveAssignmentByClientId.get(client.id)?.user_id
          ? usersById.get(latestActiveAssignmentByClientId.get(client.id)!.user_id)?.full_name ?? null
          : null,
      })),
      users: users
        .filter((user) => user.status === "ACTIVE" && ["VA", "ADMIN"].includes(user.role))
        .map((user) => ({
        id: user.id,
        employeeCode: "",
        fullName: user.full_name,
        departmentId: user.department_id,
        departmentName: user.department_id ? departmentsById.get(user.department_id)?.name ?? null : null,
        role: user.role,
        status: user.status,
      })),
    };
  }

  async history(
    admin: AuthenticatedUser,
    query: { search?: string; clientId?: string; ownerId?: string; from?: string; to?: string; page?: number; pageSize?: number },
  ): Promise<{ items: AssignmentHistoryRow[]; page: number; pageSize: number; total: number }> {
    await this.requireManager(admin);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(25, Math.max(1, query.pageSize ?? 10));
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    const [rows, clients, users] = await Promise.all([
      this.supabase.listAssignmentRows(admin.companyId),
      this.supabase.listClients(admin.companyId),
      this.supabase.listUsers(admin.companyId),
    ]);
    const clientsById = new Map(clients.map((client) => [client.id, client]));
    const usersById = new Map(users.map((user) => [user.id, user]));
    const filtered = rows.filter((row) => {
      if (query.clientId && row.client_id !== query.clientId) return false;
      if (query.ownerId && row.user_id !== query.ownerId) return false;
      const assignedAt = new Date(row.assigned_at);
      if (from && assignedAt < from) return false;
      if (to && assignedAt > to) return false;
      if (!query.search?.trim()) return true;
      const q = query.search.trim().toLowerCase();
      const client = clientsById.get(row.client_id);
      const newOwner = usersById.get(row.user_id);
      const previousOwner = row.previous_user_id ? usersById.get(row.previous_user_id) : null;
      const assignedBy = row.assigned_by_id ? usersById.get(row.assigned_by_id) : null;
      return (
        client?.full_name.toLowerCase().includes(q) ||
        client?.id.toLowerCase().includes(q) ||
        newOwner?.full_name.toLowerCase().includes(q) ||
        previousOwner?.full_name.toLowerCase().includes(q) ||
        assignedBy?.full_name.toLowerCase().includes(q)
      );
    });
    const total = filtered.length;
    const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

    return {
      items: paged.map((row) => this.projectHistoryRow(row, clientsById, usersById)),
      page,
      pageSize,
      total,
    };
  }

  private projectHistoryRow(
    row: SupabaseAssignmentRow,
    clientsById: Map<string, { id: string; full_name: string }>,
    usersById: Map<string, { id: string; full_name: string }>,
  ): AssignmentHistoryRow {
    const client = clientsById.get(row.client_id);
    const newOwner = usersById.get(row.user_id);
    const previousOwner = row.previous_user_id ? usersById.get(row.previous_user_id) : null;
    const assignedBy = row.assigned_by_id ? usersById.get(row.assigned_by_id) : null;
    return {
      id: row.id,
      clientId: row.client_id,
      clientName: client?.full_name ?? "Unknown client",
      clientDisplayCode: client?.id ?? row.client_id,
      previousOwnerId: row.previous_user_id ?? null,
      previousOwnerName: previousOwner?.full_name ?? "Unassigned",
      newOwnerId: row.user_id,
      newOwnerName: newOwner?.full_name ?? "Unknown user",
      assignedById: row.assigned_by_id,
      assignedByName: assignedBy?.full_name ?? null,
      reason: row.reason ?? null,
      assignedAt: new Date(row.assigned_at),
    };
  }

  private async validateTarget(clientId: string, newUserId: string, admin: AuthenticatedUser) {
    const [client, users, assignments] = await Promise.all([
      this.supabase.getClientById(clientId, admin.companyId),
      this.supabase.listUsers(admin.companyId),
      this.supabase.listAssignmentRows(admin.companyId),
    ]);
    if (!client) throw new NotFoundException("Client not found");

    const newOwner = users.find((user) => user.id === newUserId && user.status === "ACTIVE" && ["VA", "ADMIN"].includes(user.role));
    if (!newOwner) throw new BadRequestException("Selected employee is inactive or not eligible to handle clients");

    const currentAssignment = assignments.find((assignment) => assignment.client_id === client.id && !assignment.unassigned_at) ?? null;
    const currentOwner = currentAssignment ? users.find((user) => user.id === currentAssignment.user_id) ?? null : null;
    if (currentOwner?.id === newUserId) {
      throw new BadRequestException("Client is already assigned to this employee");
    }

    return { client, newOwner, currentOwner };
  }

  async submit(dto: ReassignDto, admin: AuthenticatedUser): Promise<{ action: "assigned" | "reassigned" }> {
    await this.requireManager(admin);
    const { client, newOwner, currentOwner } = await this.validateTarget(dto.clientId, dto.newUserId, admin);

    if (currentOwner) {
      await this.supabase.closeActiveAssignments(client.id);
    }

    await this.supabase.createAssignment({
      company_id: admin.companyId,
      client_id: client.id,
      previous_user_id: currentOwner?.id ?? null,
      user_id: newOwner.id,
      assigned_by_id: admin.id,
      reason: dto.reason?.trim() || null,
    });

    await this.audit.record({
      companyId: admin.companyId,
      actorId: admin.id,
      action: currentOwner ? "client.reassign" : "client.assign",
      target: `client:${client.id}`,
      before: { previousOwnerId: currentOwner?.id ?? null, previousOwnerName: currentOwner?.full_name ?? "Unassigned" },
      after: { newOwnerId: newOwner.id, newOwnerName: newOwner.full_name, reason: dto.reason?.trim() || null },
    });

    return { action: currentOwner ? "reassigned" : "assigned" };
  }

  async offboardAndReassign(dto: OffboardDto, admin: AuthenticatedUser): Promise<void> {
    if (!can(admin.role, "user", "disable") || !can(admin.role, "assignment", "reassign")) {
      throw new ForbiddenException();
    }

    for (const item of dto.reassignments) {
      await this.submit({ clientId: item.clientId, newUserId: item.newUserId }, admin);
    }
  }
}
