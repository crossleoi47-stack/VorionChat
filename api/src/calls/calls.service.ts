import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";

/** How long a call may ring before it's written off as missed. */
const RING_TIMEOUT_MS = 45_000;
const SWEEP_INTERVAL_MS = 30_000;

export interface CallLogDto {
  id: string;
  type: string;
  status: string;
  direction: "in" | "out";
  peerId: string;
  peerName: string;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
}

@Injectable()
export class CallsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CallsService.name);
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    // A caller who closes the tab mid-ring, or a server restart during a
    // ring, would otherwise leave the row RINGING forever and pollute every
    // call log. Sweep rather than per-call timers so it survives restarts.
    this.sweeper = setInterval(() => {
      void this.expireStaleRinging();
    }, SWEEP_INTERVAL_MS);
    void this.expireStaleRinging();
  }

  onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  private async expireStaleRinging(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - RING_TIMEOUT_MS);
      const { count } = await this.prisma.call.updateMany({
        where: { status: "RINGING", startedAt: { lt: cutoff } },
        data: { status: "MISSED", endedAt: new Date() },
      });
      if (count > 0) this.logger.log(`Marked ${count} unanswered call(s) as missed`);
    } catch (e) {
      this.logger.warn(`Ring sweep failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async start(
    callerId: string,
    companyId: string,
    calleeId: string,
    type: "VOICE" | "VIDEO",
  ) {
    if (calleeId === callerId) throw new BadRequestException("You can't call yourself");
    const callee = await this.prisma.user.findFirst({
      where: { id: calleeId, companyId, status: "ACTIVE" },
      select: { id: true, fullName: true },
    });
    if (!callee) throw new BadRequestException("That colleague is not available");

    const caller = await this.prisma.user.findUniqueOrThrow({
      where: { id: callerId },
      select: { fullName: true },
    });

    const call = await this.prisma.call.create({
      data: { companyId, callerId, calleeId, type, status: "RINGING" },
    });

    return { call, callerName: caller.fullName, calleeName: callee.fullName };
  }

  /** Guards every signalling hop: only the two parties may touch a call. */
  async assertParticipant(callId: string, userId: string) {
    const call = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundException("Call not found");
    if (call.callerId !== userId && call.calleeId !== userId) {
      throw new NotFoundException("Call not found");
    }
    return call;
  }

  answer(callId: string) {
    return this.prisma.call.update({
      where: { id: callId },
      data: { status: "ONGOING", answeredAt: new Date() },
    });
  }

  async finish(callId: string, status: "ENDED" | "DECLINED" | "MISSED" | "FAILED") {
    const existing = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!existing || existing.endedAt) return existing;
    // A call that never got answered ends as MISSED/DECLINED, not ENDED.
    const finalStatus = status === "ENDED" && !existing.answeredAt ? "MISSED" : status;
    return this.prisma.call.update({
      where: { id: callId },
      data: { status: finalStatus, endedAt: new Date() },
    });
  }

  async history(user: AuthenticatedUser): Promise<CallLogDto[]> {
    const calls = await this.prisma.call.findMany({
      where: {
        companyId: user.companyId,
        OR: [{ callerId: user.id }, { calleeId: user.id }],
      },
      orderBy: { startedAt: "desc" },
      take: 100,
      include: {
        caller: { select: { id: true, fullName: true } },
        callee: { select: { id: true, fullName: true } },
      },
    });

    return calls.map((c) => {
      const out = c.callerId === user.id;
      const peer = out ? c.callee : c.caller;
      const duration =
        c.answeredAt && c.endedAt
          ? Math.round((c.endedAt.getTime() - c.answeredAt.getTime()) / 1000)
          : null;
      return {
        id: c.id,
        type: c.type,
        status: c.status,
        direction: out ? "out" : "in",
        peerId: peer.id,
        peerName: peer.fullName,
        startedAt: c.startedAt.toISOString(),
        answeredAt: c.answeredAt?.toISOString() ?? null,
        endedAt: c.endedAt?.toISOString() ?? null,
        durationSeconds: duration,
      };
    });
  }
}
