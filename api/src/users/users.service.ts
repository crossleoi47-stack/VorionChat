import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { can } from "../rbac/policy";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { CreateUserDto } from "./dto/create-user.dto";

export interface CreatedUserDto {
  id: string;
  employeeCode: string;
  email: string | null;
  fullName: string;
  role: string;
  temporaryPassword: string;
}

export interface UserSummaryDto {
  id: string;
  employeeCode: string;
  email: string | null;
  fullName: string;
  role: string;
  status: string;
  departmentId: string | null;
}

function generateTempPassword(): string {
  // 12 chars, URL-safe — shown once to the admin, never logged or stored raw.
  return randomBytes(9).toString("base64url");
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list(user: AuthenticatedUser): Promise<UserSummaryDto[]> {
    const users = await this.prisma.user.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
    });
    return users.map((u) => ({
      id: u.id,
      employeeCode: u.employeeCode,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      status: u.status,
      departmentId: u.departmentId,
    }));
  }

  async create(dto: CreateUserDto, admin: AuthenticatedUser): Promise<CreatedUserDto> {
    if (!can(admin.role, "user", "create")) throw new ForbiddenException();

    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { companyId_employeeCode: { companyId: admin.companyId, employeeCode: dto.employeeCode } },
    });
    if (existing) throw new ConflictException("That employee ID is already in use in this company");

    // Email is the login identity and globally unique, so a clash with any
    // other company's user has to be reported too.
    const emailTaken = await this.prisma.user.findUnique({ where: { email } });
    if (emailTaken) throw new ConflictException("That email address is already registered");

    const temporaryPassword = generateTempPassword();
    const created = await this.prisma.user.create({
      data: {
        companyId: admin.companyId,
        employeeCode: dto.employeeCode,
        email,
        fullName: dto.fullName,
        role: dto.role,
        departmentId: dto.departmentId,
        passwordHash: await argon2.hash(temporaryPassword),
        mustResetPassword: true,
      },
    });

    await this.audit.record({
      companyId: admin.companyId,
      actorId: admin.id,
      action: "user.create",
      target: `user:${created.id}`,
      after: { employeeCode: created.employeeCode, role: created.role },
    });

    return {
      id: created.id,
      employeeCode: created.employeeCode,
      email: created.email,
      fullName: created.fullName,
      role: created.role,
      temporaryPassword,
    };
  }

  /** Disables the account. Does not touch client assignments — see AssignmentsService.offboardAndReassign for the combined flow. */
  async disable(userId: string, admin: AuthenticatedUser): Promise<void> {
    if (!can(admin.role, "user", "disable")) throw new ForbiddenException();

    const target = await this.prisma.user.findFirst({ where: { id: userId, companyId: admin.companyId } });
    if (!target) throw new NotFoundException("User not found");
    if (target.status === "DISABLED") return;

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: "DISABLED", disabledAt: new Date(), disabledBy: admin.id },
    });

    await this.audit.record({
      companyId: admin.companyId,
      actorId: admin.id,
      action: "user.disable",
      target: `user:${userId}`,
      before: { status: target.status },
      after: { status: "DISABLED" },
    });
  }
}
