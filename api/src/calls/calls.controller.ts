import { Controller, Get, Req } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CallsService } from "./calls.service";
import { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller("calls")
export class CallsController {
  constructor(
    private calls: CallsService,
    private config: ConfigService,
  ) {}

  @Get()
  history(@Req() req: AuthenticatedRequest) {
    return this.calls.history(req.user!);
  }

  /**
   * ICE servers for the browser's RTCPeerConnection.
   *
   * STUN alone only discovers your public address — it's enough when both
   * peers can reach each other directly (same LAN/office, or friendly NATs).
   * Calls between symmetric NATs or restrictive corporate firewalls need a
   * TURN *relay*, which is a server you must run and pay for. Configure
   * TURN_URL / TURN_USERNAME / TURN_CREDENTIAL to enable it; without those,
   * expect some cross-network calls to connect audio but never see video,
   * or fail to connect at all. See the README.
   */
  @Get("ice")
  ice() {
    const servers: Array<Record<string, unknown>> = [
      { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    ];

    const turnUrl = this.config.get<string>("TURN_URL");
    if (turnUrl) {
      servers.push({
        urls: turnUrl,
        username: this.config.get<string>("TURN_USERNAME"),
        credential: this.config.get<string>("TURN_CREDENTIAL"),
      });
    }

    return { iceServers: servers, hasTurn: !!turnUrl };
  }
}
