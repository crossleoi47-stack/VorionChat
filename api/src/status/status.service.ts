import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { PostgresService } from "../postgres/postgres.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { CreateStatusDto } from "./dto/status.dto";

const TTL_HOURS = 24;

interface StatusRow {
  id: string;
  authorId: string;
  type: string;
  body: string | null;
  backgroundColor: string | null;
  storageKey: string | null;
  mimeType: string | null;
  createdAt: Date;
  expiresAt: Date;
}
const STATUS_COLUMNS = `s.id, s.author_id AS "authorId", s.type, s.body,
  s.background_color AS "backgroundColor", s.storage_key AS "storageKey",
  s.mime_type AS "mimeType", s.created_at AS "createdAt", s.expires_at AS "expiresAt"`;

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
    private db: PostgresService,
    private gateway: RealtimeGateway,
  ) {}

  async create(dto: CreateStatusDto, user: AuthenticatedUser): Promise<StatusItemDto> {
    if (!this.db.getConnectionState().configured) {
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
    const status = await this.db.queryOne<StatusRow>(
      `INSERT INTO public.status_updates AS s
       (company_id, author_id, type, body, background_color, storage_key, mime_type, size_bytes, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${STATUS_COLUMNS}`,
      [user.companyId, user.id, type, dto.body?.trim() || null, dto.backgroundColor ?? null,
       dto.storageKey ?? null, dto.mimeType ?? null, dto.sizeBytes ?? null,
       new Date(now.getTime() + TTL_HOURS * 3600 * 1000)],
    );
    if (!status) throw new ServiceUnavailableException("Could not save status");

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
    const rows = await this.db.query<StatusRow & { authorName: string; viewed: boolean; viewCount: number }>(
      `SELECT ${STATUS_COLUMNS}, u.full_name AS "authorName",
       EXISTS(SELECT 1 FROM public.status_update_views v WHERE v.status_id=s.id AND v.viewer_id=$2) AS viewed,
       (SELECT count(*)::int FROM public.status_update_views v WHERE v.status_id=s.id) AS "viewCount"
       FROM public.status_updates s JOIN public.users u ON u.id=s.author_id
       WHERE s.company_id=$1 AND s.deleted_at IS NULL AND s.expires_at>now()
       ORDER BY s.created_at ASC`, [user.companyId, user.id],
    );

    const byAuthor = new Map<string, StatusFeedEntryDto>();
    for (const r of rows) {
      const isMe = r.authorId === user.id;
      const viewed = isMe || r.viewed;
      const entry =
        byAuthor.get(r.authorId) ??
        ({
          authorId: r.authorId,
          authorName: r.authorName,
          isMe,
          latestAt: r.createdAt.toISOString(),
          unseenCount: 0,
          items: [],
        } satisfies StatusFeedEntryDto);

      entry.items.push(this.toItem(r, viewed, isMe ? r.viewCount : null));
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

    await this.db.query(`INSERT INTO public.status_update_views(status_id,viewer_id)
      SELECT id,$2 FROM public.status_updates WHERE id=$1 AND company_id=$3
      AND deleted_at IS NULL AND expires_at>now() ON CONFLICT DO NOTHING`,
      [statusId, user.id, user.companyId]);
  }

  /** Only the author may see who viewed — same as WhatsApp. */
  async viewers(statusId: string, user: AuthenticatedUser): Promise<StatusViewerDto[]> {
    const status = await this.loadLive(statusId, user);
    if (status.authorId !== user.id) {
      throw new ForbiddenException("Only the author can see who viewed a status");
    }
    const views = await this.db.query<{ userId: string; fullName: string; viewedAt: Date }>(
      `SELECT u.id AS "userId", u.full_name AS "fullName", v.viewed_at AS "viewedAt"
       FROM public.status_update_views v JOIN public.users u ON u.id=v.viewer_id
       WHERE v.status_id=$1 ORDER BY v.viewed_at DESC`, [statusId]);
    return views.map((v) => ({
      userId: v.userId,
      fullName: v.fullName,
      viewedAt: v.viewedAt.toISOString(),
    }));
  }

  async remove(statusId: string, user: AuthenticatedUser): Promise<void> {
    const status = await this.loadLive(statusId, user);
    const privileged = user.role === "COMPANY_ADMIN" || user.role === "SUPER_ADMIN";
    if (status.authorId !== user.id && !privileged) {
      throw new ForbiddenException("You can only delete your own status");
    }
    await this.db.query("UPDATE public.status_updates SET deleted_at=now() WHERE id=$1 AND company_id=$2", [statusId, user.companyId]);
  }

  /** Reading the media bytes goes through here so expiry and tenancy are enforced. */
  async mediaFor(statusId: string, user: AuthenticatedUser): Promise<{ storageKey: string; mimeType: string }> {
    const status = await this.loadLive(statusId, user);
    if (!status.storageKey) throw new NotFoundException("This status has no media");
    return { storageKey: status.storageKey, mimeType: status.mimeType ?? "application/octet-stream" };
  }

  private async loadLive(statusId: string, user: AuthenticatedUser) {
    const status = await this.db.queryOne<StatusRow>(`SELECT ${STATUS_COLUMNS}
      FROM public.status_updates s WHERE s.id=$1 AND s.company_id=$2
      AND s.deleted_at IS NULL AND s.expires_at>now()`, [statusId, user.companyId]);
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
