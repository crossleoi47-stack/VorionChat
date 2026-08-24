import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { can } from "../rbac/policy";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  list(user: AuthenticatedUser) {
    return this.prisma.department.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" } });
  }

  async create(name: string, user: AuthenticatedUser) {
    if (!can(user.role, "department", "create")) throw new ForbiddenException();
    return this.prisma.department.create({ data: { companyId: user.companyId, name } });
  }
}
