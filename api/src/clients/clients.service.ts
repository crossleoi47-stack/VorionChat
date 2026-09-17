import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { SupabaseService } from "../supabase/supabase.service";
import { can } from "../rbac/policy";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { CreateClientDto } from "./dto/create-client.dto";
import { PolicyService } from "../policy/policy.service";
import { ClientDetailDto, ClientSummaryDto } from "./clients.projector";

@Injectable()
export class ClientsService {
  constructor(
    private audit: AuditService,
    private policy: PolicyService,
    private supabase: SupabaseService,
  ) {}

  /**
   * Row-level visibility, not just field-level masking: an employee only
   * ever sees clients currently assigned to them; a manager sees clients
   * assigned to anyone in their department; admin/auditor see the company.
   */
  async list(user: AuthenticatedUser): Promise<ClientSummaryDto[]> {
    const supabaseClients = await this.supabase.listClients(user.companyId);
    return supabaseClients.map((client) => ({
      id: client.id,
      displayCode: client.id,
      name: client.full_name,
      org: null,
    }));
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<ClientDetailDto> {
    const client = await this.supabase.getClientById(id, user.companyId);
    if (!client) throw new NotFoundException("Client not found");

    // Two gates, both must pass: the ROLE must permit reading a phone number,
    // and this specific person's feature switch must not have revoked it.
    // The switch can only ever subtract, never grant (see features.ts).
    const features = await this.policy.featuresFor(user.id);
    if (can(user.role, "client.phone", "read") && !features.viewClientPhone) {
      await this.audit.record({
        companyId: user.companyId,
        actorId: user.id,
        action: "client.phone.denied",
        target: `client:${client.id}`,
        after: { reason: "viewClientPhone disabled for this user" },
      });
      return { id: client.id, displayCode: client.id, name: client.full_name, org: null };
    }

    if (can(user.role, "client.phone", "read")) {
      await this.audit.record({
        companyId: user.companyId,
        actorId: user.id,
        action: "client.phone.read",
        target: `client:${client.id}`,
      });
    }

    return {
      id: client.id,
      displayCode: client.id,
      name: client.full_name,
      org: null,
      ...(can(user.role, "client.phone", "read")
        ? { ...(client.phone ? { phoneE164: client.phone } : {}), email: client.email }
        : {}),
    };
  }

  async create(dto: CreateClientDto, user: AuthenticatedUser): Promise<ClientDetailDto> {
    if (!can(user.role, "client", "create")) throw new ForbiddenException();

    const client = await this.supabase.createClient({
      company_id: user.companyId,
      full_name: dto.name.trim(),
      phone: dto.phoneE164,
      email: dto.email?.trim() || null,
      created_by: user.id,
    });

    await this.supabase.recordAudit({
      company_id: user.companyId,
      actor_user_id: user.id,
      action: "client.create",
      entity_type: "client",
      entity_id: client.id,
    });

    return {
      id: client.id,
      displayCode: client.id,
      name: client.full_name,
      org: dto.org?.trim() || null,
    };
  }
}
