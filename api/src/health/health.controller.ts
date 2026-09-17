import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { SupabaseService } from "../supabase/supabase.service";

@Controller("health")
export class HealthController {
  constructor(private supabase: SupabaseService) {}

  /**
   * Liveness + a real database round-trip, so a container that can't reach
   * Postgres is reported unhealthy rather than quietly serving 500s. Public
   * by necessity (load balancers don't authenticate) and deliberately
   * returns nothing about the system beyond up/down.
   */
  @Public()
  @Get()
  async check() {
    const state = this.supabase.getConnectionState();
    return state.connected
      ? { status: "ok", supabase: "connected" }
      : {
          status: "degraded",
          supabase: "disconnected",
          error: state.lastErrorMessage ?? "Supabase unavailable",
        };
  }
}
