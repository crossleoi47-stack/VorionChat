import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { SupabaseService } from "../supabase/supabase.service";

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

  constructor(private supabase: SupabaseService) {}

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
      const count = await this.supabase.expireStaleCalls(cutoff, new Date());
      if (count > 0) this.logger.log(`[CALLS] Ring sweep: updated ${count} stale calls`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown Supabase error";
      this.logger.error(`[CALLS] Ring sweep: FAILED`);
      this.logger.error(`[CALLS] Error: ${message}`);
    }
  }

  async start(
    callerId: string,
    companyId: string,
    calleeId: string,
    type: "VOICE" | "VIDEO",
  ) {
    if (calleeId === callerId) throw new BadRequestException("You can't call yourself");
    const callee = await this.supabase.getCallUserById(calleeId);
    if (!callee || callee.companyId !== companyId || callee.status !== "ACTIVE") {
      throw new BadRequestException("That colleague is not available");
    }

    const caller = await this.supabase.getCallUserById(callerId);
    if (!caller) throw new NotFoundException("Caller not found");

    const call = await this.supabase.createCall({ companyId, callerId, calleeId, type });

    return { call, callerName: caller.fullName, calleeName: callee.fullName };
  }

  /** Guards every signalling hop: only the two parties may touch a call. */
  async assertParticipant(callId: string, userId: string) {
    const call = await this.supabase.getCallById(callId);
    if (!call) throw new NotFoundException("Call not found");
    if (call.callerId !== userId && call.calleeId !== userId) {
      throw new NotFoundException("Call not found");
    }
    return call;
  }

  answer(callId: string) {
    return this.supabase.updateCall(callId, { status: "ONGOING", answeredAt: new Date().toISOString() });
  }

  async finish(callId: string, status: "ENDED" | "DECLINED" | "MISSED" | "FAILED") {
    const existing = await this.supabase.getCallById(callId);
    if (!existing || existing.endedAt) return existing;
    // A call that never got answered ends as MISSED/DECLINED, not ENDED.
    const finalStatus = status === "ENDED" && !existing.answeredAt ? "MISSED" : status;
    return this.supabase.updateCall(callId, { status: finalStatus, endedAt: new Date().toISOString() });
  }

  async history(user: AuthenticatedUser): Promise<CallLogDto[]> {
    const calls = await this.supabase.listCallsForUser(user.companyId, user.id);
    const userIds = [...new Set(calls.flatMap((call) => [call.callerId, call.calleeId]))];
    const callUsers = await Promise.all(userIds.map((id) => this.supabase.getCallUserById(id)));
    const usersById = new Map(callUsers.filter((callUser) => callUser).map((callUser) => [callUser!.id, callUser!]));

    return calls.map((c) => {
      const out = c.callerId === user.id;
      const peer = usersById.get(out ? c.calleeId : c.callerId);
      if (!peer) throw new NotFoundException("Call participant not found");
      const duration =
        c.answeredAt && c.endedAt
          ? Math.round((new Date(c.endedAt).getTime() - new Date(c.answeredAt).getTime()) / 1000)
          : null;
      return {
        id: c.id,
        type: c.type,
        status: c.status,
        direction: out ? "out" : "in",
        peerId: peer.id,
        peerName: peer.fullName,
        startedAt: c.startedAt,
        answeredAt: c.answeredAt,
        endedAt: c.endedAt,
        durationSeconds: duration,
      };
    });
  }
}
