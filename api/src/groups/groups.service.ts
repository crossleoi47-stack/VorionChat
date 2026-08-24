import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { CreateGroupDto, UpdateGroupDto } from "./dto/group.dto";
import { PolicyService } from "../policy/policy.service";

export interface GroupMemberDto {
  userId: string;
  fullName: string;
  employeeCode: string;
  isAdmin: boolean;
}

export interface GroupDetailDto {
  id: string;
  conversationId: string;
  name: string;
  description: string | null;
  createdAt: string;
  members: GroupMemberDto[];
  iAmAdmin: boolean;
}

@Injectable()
export class GroupsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private gateway: RealtimeGateway,
    private policy: PolicyService,
  ) {}

  /**
   * Groups are staff-only by design. A WhatsApp client cannot be a member —
   * the Cloud API has no group messaging, and a native WhatsApp group would
   * expose every member's phone number to every other member, which is the
   * exact leak this product exists to prevent.
   */
  async create(dto: CreateGroupDto, user: AuthenticatedUser): Promise<GroupDetailDto> {
    await this.policy.assertFeature(user.id, "createGroups", "Creating groups");
    const memberIds = Array.from(new Set([...dto.userIds, user.id]));

    const valid = await this.prisma.user.findMany({
      where: { id: { in: memberIds }, companyId: user.companyId, status: "ACTIVE" },
      select: { id: true },
    });
    if (valid.length !== memberIds.length) {
      throw new BadRequestException("One or more members are not active users in your company");
    }

    const existing = await this.prisma.conversationGroup.findUnique({
      where: { companyId_name: { companyId: user.companyId, name: dto.name } },
    });
    if (existing) throw new BadRequestException("A group with that name already exists");

    const group = await this.prisma.$transaction(async (tx) => {
      const g = await tx.conversationGroup.create({
        data: {
          companyId: user.companyId,
          name: dto.name,
          description: dto.description,
          createdById: user.id,
          members: {
            create: memberIds.map((id) => ({
              memberType: "USER" as const,
              userId: id,
              isAdmin: id === user.id,
            })),
          },
        },
      });

      const conversation = await tx.conversation.create({
        data: {
          companyId: user.companyId,
          type: "GROUP",
          groupId: g.id,
          participants: {
            create: memberIds.map((id) => ({ participantType: "USER" as const, userId: id })),
          },
        },
      });

      return { g, conversation };
    });

    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: "group.create",
      target: `group:${group.g.id}`,
      after: { name: dto.name, memberCount: memberIds.length },
    });

    return this.detail(group.g.id, user);
  }

  async detail(groupId: string, user: AuthenticatedUser): Promise<GroupDetailDto> {
    const group = await this.prisma.conversationGroup.findFirst({
      where: { id: groupId, companyId: user.companyId },
      include: {
        conversation: true,
        members: { include: { user: { select: { fullName: true, employeeCode: true } } } },
      },
    });
    if (!group) throw new NotFoundException("Group not found");

    const mine = group.members.find((m) => m.userId === user.id);
    // Admins/managers can inspect any group; otherwise you must be a member.
    const privileged = user.role === "COMPANY_ADMIN" || user.role === "SUPER_ADMIN";
    if (!mine && !privileged) throw new NotFoundException("Group not found");

    return {
      id: group.id,
      conversationId: group.conversation!.id,
      name: group.name,
      description: group.description,
      createdAt: group.createdAt.toISOString(),
      members: group.members
        .filter((m) => m.userId)
        .map((m) => ({
          userId: m.userId!,
          fullName: m.user?.fullName ?? "Unknown",
          employeeCode: m.user?.employeeCode ?? "",
          isAdmin: m.isAdmin,
        })),
      iAmAdmin: !!mine?.isAdmin || privileged,
    };
  }

  async update(groupId: string, dto: UpdateGroupDto, user: AuthenticatedUser): Promise<GroupDetailDto> {
    await this.assertAdmin(groupId, user);
    await this.prisma.conversationGroup.update({
      where: { id: groupId },
      data: { name: dto.name, description: dto.description },
    });
    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: "group.update",
      target: `group:${groupId}`,
      after: { ...dto },
    });
    return this.detail(groupId, user);
  }

  async addMembers(groupId: string, userIds: string[], user: AuthenticatedUser): Promise<GroupDetailDto> {
    const group = await this.assertAdmin(groupId, user);

    const valid = await this.prisma.user.findMany({
      where: { id: { in: userIds }, companyId: user.companyId, status: "ACTIVE" },
      select: { id: true },
    });
    if (valid.length !== userIds.length) {
      throw new BadRequestException("One or more members are not active users in your company");
    }

    const already = await this.prisma.groupMember.findMany({
      where: { groupId, userId: { in: userIds } },
      select: { userId: true },
    });
    const toAdd = userIds.filter((id) => !already.some((a) => a.userId === id));
    if (toAdd.length === 0) return this.detail(groupId, user);

    await this.prisma.$transaction([
      this.prisma.groupMember.createMany({
        data: toAdd.map((id) => ({ groupId, memberType: "USER" as const, userId: id })),
      }),
      this.prisma.conversationParticipant.createMany({
        data: toAdd.map((id) => ({
          conversationId: group.conversation!.id,
          participantType: "USER" as const,
          userId: id,
        })),
        skipDuplicates: true,
      }),
    ]);

    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: "group.members.add",
      target: `group:${groupId}`,
      after: { added: toAdd },
    });

    this.gateway.broadcast(group.conversation!.id, "group:updated", { groupId });
    return this.detail(groupId, user);
  }

  async removeMember(groupId: string, memberUserId: string, user: AuthenticatedUser): Promise<GroupDetailDto> {
    // Leaving yourself needs no admin rights; removing someone else does.
    const isSelf = memberUserId === user.id;
    const group = isSelf ? await this.assertMember(groupId, user) : await this.assertAdmin(groupId, user);

    await this.prisma.$transaction([
      this.prisma.groupMember.deleteMany({ where: { groupId, userId: memberUserId } }),
      this.prisma.conversationParticipant.deleteMany({
        where: { conversationId: group.conversation!.id, userId: memberUserId },
      }),
    ]);

    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: isSelf ? "group.leave" : "group.members.remove",
      target: `group:${groupId}`,
      after: { removed: memberUserId },
    });

    await this.ensureAnAdminRemains(groupId);
    this.gateway.broadcast(group.conversation!.id, "group:updated", { groupId });
    return this.detail(groupId, user).catch(() => ({
      // The caller just left, so they can no longer read the group.
      id: groupId,
      conversationId: group.conversation!.id,
      name: "",
      description: null,
      createdAt: new Date().toISOString(),
      members: [],
      iAmAdmin: false,
    }));
  }

  /** Promote or demote a group admin. Only an existing admin (or a company admin) may do it. */
  async setAdmin(
    groupId: string,
    memberUserId: string,
    isAdmin: boolean,
    user: AuthenticatedUser,
  ): Promise<GroupDetailDto> {
    const group = await this.assertAdmin(groupId, user);

    const member = group.members.find((m) => m.userId === memberUserId);
    if (!member) throw new BadRequestException("That person is not in this group");

    if (!isAdmin) {
      const adminCount = group.members.filter((m) => m.isAdmin).length;
      if (member.isAdmin && adminCount <= 1) {
        throw new BadRequestException(
          "This is the group's only admin — promote someone else before stepping down",
        );
      }
    }

    await this.prisma.groupMember.update({ where: { id: member.id }, data: { isAdmin } });

    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: isAdmin ? "group.admin.promote" : "group.admin.demote",
      target: `group:${groupId}`,
      after: { userId: memberUserId },
    });

    this.gateway.broadcast(group.conversation!.id, "group:updated", { groupId });
    return this.detail(groupId, user);
  }

  /**
   * A group with members but no admin is unmanageable by its own members —
   * only a company admin could ever touch it again. If the last admin leaves
   * or is removed, hand the role to the longest-standing remaining member.
   */
  private async ensureAnAdminRemains(groupId: string): Promise<void> {
    const members = await this.prisma.groupMember.findMany({
      where: { groupId },
      orderBy: { addedAt: "asc" },
    });
    if (members.length === 0 || members.some((m) => m.isAdmin)) return;

    await this.prisma.groupMember.update({
      where: { id: members[0].id },
      data: { isAdmin: true },
    });
  }

  private async assertMember(groupId: string, user: AuthenticatedUser) {
    const group = await this.prisma.conversationGroup.findFirst({
      where: { id: groupId, companyId: user.companyId },
      include: { conversation: true, members: true },
    });
    if (!group) throw new NotFoundException("Group not found");
    if (!group.members.some((m) => m.userId === user.id)) {
      throw new ForbiddenException("You are not a member of this group");
    }
    return group;
  }

  private async assertAdmin(groupId: string, user: AuthenticatedUser) {
    const group = await this.prisma.conversationGroup.findFirst({
      where: { id: groupId, companyId: user.companyId },
      include: { conversation: true, members: true },
    });
    if (!group) throw new NotFoundException("Group not found");

    const privileged = user.role === "COMPANY_ADMIN" || user.role === "SUPER_ADMIN";
    const isGroupAdmin = group.members.some((m) => m.userId === user.id && m.isAdmin);
    if (!privileged && !isGroupAdmin) {
      throw new ForbiddenException("Only a group admin can do that");
    }
    return group;
  }
}
