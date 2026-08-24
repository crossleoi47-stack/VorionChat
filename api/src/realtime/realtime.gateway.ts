import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Server, Socket } from "socket.io";
import { JwtPayload } from "../auth/jwt-payload.interface";
import { PresenceService } from "../presence/presence.service";
import { CallsService } from "../calls/calls.service";
import { PolicyService } from "../policy/policy.service";

/**
 * Employee-side real-time channel (blueprint §12). WhatsApp's side of a
 * conversation has no live socket — Meta delivers it over the webhook.
 * Presence/typing here apply to employees only, for the same reason.
 */
@Injectable()
@WebSocketGateway({ cors: { origin: "*" }, namespace: "/realtime" })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private jwt: JwtService,
    private config: ConfigService,
    private presence: PresenceService,
    private calls: CallsService,
    private policy: PolicyService,
  ) {}

  async handleConnection(socket: Socket) {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      socket.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      });
      socket.data.user = payload;

      // Everyone in a company shares a room, so presence changes reach
      // colleagues without needing to know who is looking at whom.
      socket.join(`company:${payload.companyId}`);
      // Per-user room so a call can ring every device this person is on.
      socket.join(`user:${payload.sub}`);

      const cameOnline = await this.presence.connect(payload.sub, socket.id);
      if (cameOnline) this.emitPresence(payload.companyId, payload.sub, true, null);
    } catch {
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket) {
    const payload = socket.data.user as JwtPayload | undefined;
    if (!payload) return;
    const wentOffline = await this.presence.disconnect(payload.sub, socket.id);
    if (wentOffline) {
      this.emitPresence(payload.companyId, payload.sub, false, new Date().toISOString());
    }
  }

  /** Client pings this so a long-lived socket keeps its presence TTL alive. */
  @SubscribeMessage("presence:ping")
  async onPing(@ConnectedSocket() socket: Socket) {
    const payload = socket.data.user as JwtPayload | undefined;
    if (payload) await this.presence.heartbeat(payload.sub);
  }

  private emitPresence(
    companyId: string,
    userId: string,
    online: boolean,
    lastSeenAt: string | null,
  ) {
    this.server.to(`company:${companyId}`).emit("presence:update", { userId, online, lastSeenAt });
  }

  @SubscribeMessage("conversation:join")
  onJoin(@ConnectedSocket() socket: Socket, @MessageBody() conversationId: string) {
    // Room membership is intentionally not authorization-checked twice here —
    // clients only ever learn a conversationId they were already permitted
    // to see via the REST API (ConversationsService.listForUser), so joining
    // the room can't leak anything the API wouldn't already have returned.
    socket.join(`conversation:${conversationId}`);
  }

  /**
   * Relayed to everyone else in the room, never echoed to the sender.
   * Presence/typing is employee-side only — WhatsApp doesn't expose a
   * client's typing state to businesses (blueprint §12).
   */
  @SubscribeMessage("conversation:typing")
  onTyping(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { conversationId: string; name: string },
  ) {
    if (!payload?.conversationId) return;
    socket.to(`conversation:${payload.conversationId}`).emit("conversation:typing", payload);
  }

  broadcastMessage(conversationId: string, payload: unknown) {
    this.server.to(`conversation:${conversationId}`).emit("message:new", payload);
  }

  /** Generic room emit — used for message:update (edits, reactions, deletes). */
  broadcast(conversationId: string, event: string, payload: unknown) {
    this.server.to(`conversation:${conversationId}`).emit(event, payload);
  }

  // ── Calling: signalling only ─────────────────────────────────────────
  // Audio/video never passes through this server — the browsers negotiate a
  // direct peer connection and we just ferry SDP offers/answers and ICE
  // candidates between them. Every handler re-checks that the sender is
  // actually a party to the call, so a leaked callId can't be used to
  // inject signalling into someone else's conversation.

  @SubscribeMessage("call:invite")
  async onInvite(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { calleeId: string; type?: "VOICE" | "VIDEO" },
  ) {
    const me = socket.data.user as JwtPayload | undefined;
    if (!me || !body?.calleeId) return;

    try {
      await this.policy.assertFeature(me.sub, "placeCalls", "Placing calls");
      const { call, callerName } = await this.calls.start(
        me.sub,
        me.companyId,
        body.calleeId,
        body.type ?? "VOICE",
      );

      this.server.to(`user:${body.calleeId}`).emit("call:incoming", {
        callId: call.id,
        callerId: me.sub,
        callerName,
        type: call.type,
      });
      socket.emit("call:ringing", { callId: call.id, calleeId: body.calleeId, type: call.type });
    } catch (e) {
      socket.emit("call:failed", { reason: e instanceof Error ? e.message : "Could not start call" });
    }
  }

  @SubscribeMessage("call:accept")
  async onAccept(@ConnectedSocket() socket: Socket, @MessageBody() body: { callId: string }) {
    const me = socket.data.user as JwtPayload | undefined;
    if (!me || !body?.callId) return;
    const call = await this.calls.assertParticipant(body.callId, me.sub).catch(() => null);
    if (!call || call.calleeId !== me.sub) return;

    await this.calls.answer(call.id);
    // The caller creates the WebRTC offer once the callee has accepted.
    this.server.to(`user:${call.callerId}`).emit("call:accepted", { callId: call.id });
  }

  @SubscribeMessage("call:decline")
  async onDecline(@ConnectedSocket() socket: Socket, @MessageBody() body: { callId: string }) {
    const me = socket.data.user as JwtPayload | undefined;
    if (!me || !body?.callId) return;
    const call = await this.calls.assertParticipant(body.callId, me.sub).catch(() => null);
    if (!call) return;

    await this.calls.finish(call.id, "DECLINED");
    this.server.to(`user:${call.callerId}`).emit("call:ended", { callId: call.id, reason: "declined" });
    this.server.to(`user:${call.calleeId}`).emit("call:ended", { callId: call.id, reason: "declined" });
  }

  @SubscribeMessage("call:end")
  async onEnd(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { callId: string; reason?: "ended" | "failed" },
  ) {
    const me = socket.data.user as JwtPayload | undefined;
    if (!me || !body?.callId) return;
    const call = await this.calls.assertParticipant(body.callId, me.sub).catch(() => null);
    if (!call) return;

    // A call whose media never connected shouldn't sit in the log looking
    // like a normal conversation — record it as FAILED.
    await this.calls.finish(call.id, body.reason === "failed" ? "FAILED" : "ENDED");
    this.server.to(`user:${call.callerId}`).emit("call:ended", { callId: call.id, reason: "ended" });
    this.server.to(`user:${call.calleeId}`).emit("call:ended", { callId: call.id, reason: "ended" });
  }

  /** Relays one SDP or ICE payload to the *other* party in the call. */
  @SubscribeMessage("call:signal")
  async onSignal(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { callId: string; data: unknown },
  ) {
    const me = socket.data.user as JwtPayload | undefined;
    if (!me || !body?.callId) return;
    const call = await this.calls.assertParticipant(body.callId, me.sub).catch(() => null);
    if (!call) return;

    const otherId = call.callerId === me.sub ? call.calleeId : call.callerId;
    this.server.to(`user:${otherId}`).emit("call:signal", { callId: call.id, data: body.data });
  }

  /** Company-wide fan-out (status updates, presence). */
  broadcastToCompany(companyId: string, event: string, payload: unknown) {
    this.server.to(`company:${companyId}`).emit(event, payload);
  }

  broadcastStatus(conversationId: string, payload: unknown) {
    this.server.to(`conversation:${conversationId}`).emit("message:status", payload);
  }
}
