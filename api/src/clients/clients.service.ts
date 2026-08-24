import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { can } from "../rbac/policy";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { CreateClientDto } from "./dto/create-client.dto";
import { PolicyService } from "../policy/policy.service";
import {
  ClientDetailDto,
  ClientSummaryDto,
  projectClient,
  projectClientList,
} from "./clients.projector";

@Injectable()
export class ClientsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private policy: PolicyService,
  ) {}

  /**
   * Row-level visibility, not just field-level masking: an employee only
   * ever sees clients currently assigned to them; a manager sees clients
   * assigned to anyone in their department; admin/auditor see the company.
   */
  private async visibilityFilter(user: AuthenticatedUser): Promise<Prisma.ClientWhereInput> {
    switch (user.role) {
      case "SUPER_ADMIN":
      case "COMPANY_ADMIN":
      case "AUDITOR":
        return { companyId: user.companyId };

      case "EMPLOYEE":
        return {
          companyId: user.companyId,
          assignments: { some: { userId: user.id, unassignedAt: null } },
        };

      case "MANAGER": {
        const manager = await this.prisma.user.findUnique({ where: { id: user.id } });
        return {
          companyId: user.companyId,
          assignments: {
            some: { unassignedAt: null, user: { departmentId: manager?.departmentId ?? "__none__" } },
          },
        };
      }
    }
  }

  async list(user: AuthenticatedUser): Promise<ClientSummaryDto[]> {
    const where = await this.visibilityFilter(user);
    const clients = await this.prisma.client.findMany({ where, orderBy: { createdAt: "desc" } });
    return projectClientList(clients, user.role);
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<ClientDetailDto> {
    const where = await this.visibilityFilter(user);
    const client = await this.prisma.client.findFirst({ where: { ...where, id } });
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
      return projectClient(client, "EMPLOYEE");
    }

    if (can(user.role, "client.phone", "read")) {
      await this.audit.record({
        companyId: user.companyId,
        actorId: user.id,
        action: "client.phone.read",
        target: `client:${client.id}`,
      });
    }

    return projectClient(client, user.role);
  }

  async create(dto: CreateClientDto, user: AuthenticatedUser): Promise<ClientDetailDto> {
    if (!can(user.role, "client", "create")) throw new ForbiddenException();

    const client = await this.prisma.withTenant((tx) =>
      tx.client.create({
        data: {
          companyId: user.companyId,
          displayCode: dto.displayCode,
          name: dto.name,
          org: dto.org,
          phoneE164: dto.phoneE164,
          email: dto.email,
          createdById: user.id,
        },
      }),
    );

    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: "client.create",
      target: `client:${client.id}`,
      after: { displayCode: client.displayCode, name: client.name },
    });

    return projectClient(client, user.role);
  }
}
