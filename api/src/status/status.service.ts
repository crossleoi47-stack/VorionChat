import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { CreateStatusDto } from "./dto/status.dto";

const TTL_HOURS = 24;

export interface StatusItemDto {
  id: string;
  type: string;
  body: string | null;
  backgroundColor: string | null;
  hasMedia: boolean;
  mimeType: string | null;
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
  viewCount: number | null; // only populated for your own statuses
}

export interface StatusFeedEntryDto {
  authorId: string;
  authorName: string;
  isMe: boolean;
  latestAt: string;
  unseenCount: number;
  items: StatusItemDto[];
}

export interface StatusViewerDto {
  userId: string;
  fullName: string;
  viewedAt: string;
}

@Injectable()
export class StatusService {
  constructor(
    private prisma: PrismaService,
    private gateway: RealtimeGateway,
  ) {}

  async create(dto: CreateStatusDto, user: AuthenticatedUser): Promise<StatusItemDto> {
    if (!this.prisma.isConfigured) {
      throw new ServiceUnavailableException(
        "Status posting is unavailable until DATABASE_URL is configured with a PostgreSQL connection.",
      );
    }
    const type = dto.type ?? "TEXT";
    if (type === "TEXT" && !dto.body?.trim()) {
      throw new BadRequestException("A text status needs some text");
    }
    if (type !== "TEXT" && !dto.storageKey) {
      throw new BadRequestException("A media status needs an uploaded file");
    }

    const now = new Date();
    const status = await this.prisma.status.create({
      data: {
        companyId: user.companyId,
        authorId: user.id,
        type,
        body: dto.body?.trim() || null,
        backgroundColor: dto.backgroundColor ?? null,
        storageKey: dto.storageKey ?? null,
        mimeType: dto.mimeType ?? null,
        sizeBytes: dto.sizeBytes ?? null,
        expiresAt: new Date(now.getTime() + TTL_HOURS * 3600 * 1000),
      },
    });

    // Colleagues share a company room, so a new status lights up their rail
    // without polling.
    this.gateway.broadcastToCompany(user.companyId, "status:new", {
      authorId: user.id,
      statusId: status.id,
    });

    return this.toItem(status, true, 0);
  }

  /**
   * The feed groups live statuses by author, newest author first, with mine
   * pinned to the top — the shape WhatsApp's Status tab uses.
   */
  async feed(user: AuthenticatedUser): Promise<StatusFeedEntryDto[]> {
    // Status storage still uses Prisma. A Supabase-only deployment has no
    // Prisma connection, so an empty feed should not produce a 500 response.
    if (!this.prisma.isConfigured) return [];
    const now = new Date();
    const rows = await this.prisma.status.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: { id: true, fullName: true } },
        views: { where: { viewerId: user.id }, select: { id: true } },
        _count: { select: { views: true } },
      },
    });

    const byAuthor = new Map<string, StatusFeedEntryDto>();
    for (const r of rows) {
      const isMe = r.authorId === user.id;
      const viewed = isMe || r.views.length > 0;
      const entry =
        byAuthor.get(r.authorId) ??
        ({
          authorId: r.authorId,
          authorName: r.author.fullName,
          isMe,
          latestAt: r.createdAt.toISOString(),
          unseenCount: 0,
          items: [],
        } satisfies StatusFeedEntryDto);

      entry.items.push(this.toItem(r, viewed, isMe ? r._count.views : null));
      entry.latestAt = r.createdAt.toISOString();
      if (!viewed) entry.unseenCount += 1;
      byAuthor.set(r.authorId, entry);
    }

    return [...byAuthor.values()].sort((a, b) => {
      if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
      // Unseen updates surface above ones you've already caught up on.
      if ((a.unseenCount > 0) !== (b.unseenCount > 0)) return a.unseenCount > 0 ? -1 : 1;
      return b.latestAt.localeCompare(a.latestAt);
    });
  }

  async markViewed(statusId: string, user: AuthenticatedUser): Promise<void> {
    const status = await this.loadLive(statusId, user);
    if (status.authorId === user.id) return; // viewing your own doesn't count

    await this.prisma.statusView.upsert({
      where: { statusId_viewerId: { statusId, viewerId: user.id } },
      create: { statusId, viewerId: user.id },
      update: {},
    });
  }

  /** Only the author may see who viewed — same as WhatsApp. */
  async viewers(statusId: string, user: AuthenticatedUser): Promise<StatusViewerDto[]> {
    const status = await this.loadLive(statusId, user);
    if (status.authorId !== user.id) {
      throw new ForbiddenException("Only the author can see who viewed a status");
    }
    const views = await this.prisma.statusView.findMany({
      where: { statusId },
      orderBy: { viewedAt: "desc" },
      include: { viewer: { select: { id: true, fullName: true } } },
    });
    return views.map((v) => ({
      userId: v.viewer.id,
      fullName: v.viewer.fullName,
      viewedAt: v.viewedAt.toISOString(),
    }));
  }

  async remove(statusId: string, user: AuthenticatedUser): Promise<void> {
    const status = await this.loadLive(statusId, user);
    const privileged = user.role === "COMPANY_ADMIN" || user.role === "SUPER_ADMIN";
    if (status.authorId !== user.id && !privileged) {
      throw new ForbiddenException("You can only delete your own status");
    }
    await this.prisma.status.update({ where: { id: statusId }, data: { deletedAt: new Date() } });
  }

  /** Reading the media bytes goes through here so expiry and tenancy are enforced. */
  async mediaFor(statusId: string, user: AuthenticatedUser): Promise<{ storageKey: string; mimeType: string }> {
    const status = await this.loadLive(statusId, user);
    if (!status.storageKey) throw new NotFoundException("This status has no media");
    return { storageKey: status.storageKey, mimeType: status.mimeType ?? "application/octet-stream" };
  }

  private async loadLive(statusId: string, user: AuthenticatedUser) {
    const status = await this.prisma.status.findFirst({
      where: {
        id: statusId,
        companyId: user.companyId,
        deletedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    // An expired status is indistinguishable from a missing one on purpose.
    if (!status) throw new NotFoundException("Status not found or expired");
    return status;
  }

  private toItem(
    s: {
      id: string;
      type: string;
      body: string | null;
      backgroundColor: string | null;
      storageKey: string | null;
      mimeType: string | null;
      createdAt: Date;
      expiresAt: Date;
    },
    viewed: boolean,
    viewCount: number | null,
  ): StatusItemDto {
    return {
      id: s.id,
      type: s.type,
      body: s.body,
      backgroundColor: s.backgroundColor,
      hasMedia: !!s.storageKey,
      mimeType: s.mimeType,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      viewed,
      viewCount,
    };
  }
}
