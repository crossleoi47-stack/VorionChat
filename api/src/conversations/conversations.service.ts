import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { PolicyService } from "../policy/policy.service";
import { SupabaseService } from "../supabase/supabase.service";

export interface ConversationSummaryDto {
  id: string;
  type: string;
  groupId: string | null;
  /** For DIRECT staff chats: the other person, so the UI can title it and show presence. */
  peerUserId: string | null;
  peerName: string | null;
  clientDisplayCode: string | null;
  clientName: string | null;
  groupName: string | null;
  lastMessageAt: string | null;
  archived: boolean;
  pinned: boolean;
  muted: boolean;
  unreadCount: number;
}

@Injectable()
export class ConversationsService {
  constructor(
    private prisma: PrismaService,
    private policy: PolicyService,
    private supabase: SupabaseService,
  ) {}

  private async visibilityFilter(user: AuthenticatedUser): Promise<Prisma.ConversationWhereInput> {
    if (user.role === "SUPER_ADMIN" || user.role === "COMPANY_ADMIN" || user.role === "AUDITOR") {
      return { companyId: user.companyId };
    }
    if (user.role === "MANAGER") {
      const manager = await this.prisma.user.findUnique({ where: { id: user.id } });
      return {
        companyId: user.companyId,
        OR: [
          { participants: { some: { participantType: "USER", userId: user.id } } },
          { client: { assignments: { some: { unassignedAt: null, user: { departmentId: manager?.departmentId ?? "__none__" } } } } },
        ],
      };
    }
    return {
      companyId: user.companyId,
      OR: [
        { participants: { some: { participantType: "USER", userId: user.id } } },
        { client: { assignments: { some: { userId: user.id, unassignedAt: null } } } },
      ],
    };
  }

  async listForUser(user: AuthenticatedUser): Promise<ConversationSummaryDto[]> {
    return (await this.supabase.listConversationsForUser(user)) as unknown as ConversationSummaryDto[];
  }

  async assertVisible(conversationId: string, user: AuthenticatedUser): Promise<void> {
    const where = await this.visibilityFilter(user);
    const found = await this.prisma.conversation.findFirst({ where: { ...where, id: conversationId } });
    if (!found) throw new NotFoundException("Conversation not found");
  }

  /**
   * Find-or-create a 1:1 staff chat. Idempotent, so tapping a colleague twice
   * reopens the same thread instead of forking history.
   */
  async openDirect(otherUserId: string, user: AuthenticatedUser): Promise<{ conversationId: string }> {
    await this.policy.assertFeature(user.id, "initiateChat", "Starting new conversations");
    if (otherUserId === user.id) {
      throw new BadRequestException("You can't start a chat with yourself");
    }
    const other = await this.prisma.user.findFirst({
      where: { id: otherUserId, companyId: user.companyId, status: "ACTIVE" },
    });
    if (!other) throw new BadRequestException("That colleague is not available");

    const existing = await this.prisma.conversation.findFirst({
      where: {
        companyId: user.companyId,
        type: "DIRECT",
        AND: [
          { participants: { some: { participantType: "USER", userId: user.id } } },
          { participants: { some: { participantType: "USER", userId: otherUserId } } },
        ],
      },
    });
    if (existing) return { conversationId: existing.id };

    const created = await this.prisma.conversation.create({
      data: {
        companyId: user.companyId,
        type: "DIRECT",
        participants: {
          create: [
            { participantType: "USER", userId: user.id },
            { participantType: "USER", userId: otherUserId },
          ],
        },
      },
    });
    return { conversationId: created.id };
  }

  /** Archive / pin / mute are per-user, so they live in ConversationState. */
  async setState(
    conversationId: string,
    user: AuthenticatedUser,
    patch: { archived?: boolean; pinned?: boolean; muted?: boolean },
  ): Promise<void> {
    await this.assertVisible(conversationId, user);
    const now = new Date();
    const muteUntil = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8h, like WhatsApp's default

    const data = {
      ...(patch.archived !== undefined ? { archivedAt: patch.archived ? now : null } : {}),
      ...(patch.pinned !== undefined ? { pinnedAt: patch.pinned ? now : null } : {}),
      ...(patch.muted !== undefined ? { mutedUntil: patch.muted ? muteUntil : null } : {}),
    };

    await this.prisma.conversationState.upsert({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      create: { conversationId, userId: user.id, ...data },
      update: data,
    });
  }

  async markRead(conversationId: string, user: AuthenticatedUser): Promise<void> {
    await this.assertVisible(conversationId, user);
    await this.prisma.conversationState.upsert({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      create: { conversationId, userId: user.id, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
  }
}
