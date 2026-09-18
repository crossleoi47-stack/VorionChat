import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import { SupabaseService } from "../supabase/supabase.service";

const KEY = (userId: string) => `presence:${userId}`;
const TTL_SECONDS = 70; // refreshed by heartbeat every 30s; survives a brief blip

export interface PresenceDto {
  userId: string;
  online: boolean;
  lastSeenAt: string | null;
}

/**
 * Presence lives in Redis, not Postgres: it's ephemeral, high-churn, and
 * needs to be shared across API instances (a user's sockets may land on
 * different ones). Only `lastSeenAt` is durable, written on disconnect.
 *
 * A TTL rather than a plain flag means a hard-crashed instance can't leave
 * users stuck "online" forever — the key simply expires.
 */
@Injectable()
export class PresenceService implements OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  private readonly redis: Redis | null;
  /** Fallback when Redis is unavailable, so local dev still works. */
  private readonly memory = new Map<string, number>();
  /** One user can have several sockets (tabs, devices); count them. */
  private readonly sockets = new Map<string, Set<string>>();

  constructor(
    config: ConfigService,
    private prisma: PrismaService,
    private supabase: SupabaseService,
  ) {
    const url = config.get<string>("REDIS_URL");
    if (url) {
      this.redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
      this.redis.connect().catch((e) => {
        this.logger.warn(`Redis unavailable, using in-memory presence: ${e.message}`);
      });
      this.redis.on("error", () => {
        /* handled by the fallback path; don't spam logs per reconnect attempt */
      });
    } else {
      this.redis = null;
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }

  async connect(userId: string, socketId: string): Promise<boolean> {
    const set = this.sockets.get(userId) ?? new Set<string>();
    const wasOffline = set.size === 0;
    set.add(socketId);
    this.sockets.set(userId, set);
    await this.mark(userId);
    return wasOffline; // caller broadcasts only on the 0→1 transition
  }

  async disconnect(userId: string, socketId: string): Promise<boolean> {
    const set = this.sockets.get(userId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size > 0) return false; // still connected elsewhere

    this.sockets.delete(userId);
    await this.clear(userId);
    await this.prisma.user
      .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
    return true; // genuinely went offline
  }

  /** Keeps the TTL alive for long-lived sockets. */
  async heartbeat(userId: string): Promise<void> {
    if (this.sockets.get(userId)?.size) await this.mark(userId);
  }

  async get(userIds: string[]): Promise<PresenceDto[]> {
    if (userIds.length === 0) return [];

    const online = new Set<string>();
    if (this.redis?.status === "ready") {
      const vals = await this.redis.mget(userIds.map(KEY)).catch(() => null);
      vals?.forEach((v, i) => v && online.add(userIds[i]));
    } else {
      const now = Date.now();
      userIds.forEach((id) => {
        const exp = this.memory.get(id);
        if (exp && exp > now) online.add(id);
      });
    }

    if (!this.prisma.isConfigured) {
      const users = await Promise.all(userIds.map((id) => this.supabase.getUserById(id)));
      return users.flatMap((u) => {
        if (!u) return [];
        const visible = u.status === "ACTIVE";
        return [{ userId: u.id, online: visible && online.has(u.id), lastSeenAt: null }];
      });
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, lastSeenAt: true, showLastSeen: true },
    });

    return users.map((u) => ({
      userId: u.id,
      online: online.has(u.id),
      // Respect the privacy toggle: hiding last-seen also hides "online",
      // exactly like WhatsApp — otherwise the setting is trivially defeated.
      lastSeenAt: u.showLastSeen && u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
    })).map((p, i) => (users[i].showLastSeen ? p : { ...p, online: false }));
  }

  private async mark(userId: string): Promise<void> {
    if (this.redis?.status === "ready") {
      await this.redis.set(KEY(userId), "1", "EX", TTL_SECONDS).catch(() => undefined);
    } else {
      this.memory.set(userId, Date.now() + TTL_SECONDS * 1000);
    }
  }

  private async clear(userId: string): Promise<void> {
    if (this.redis?.status === "ready") {
      await this.redis.del(KEY(userId)).catch(() => undefined);
    } else {
      this.memory.delete(userId);
    }
  }
}
