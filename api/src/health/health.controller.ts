import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Public } from "../auth/public.decorator";

@Controller("health")
export class HealthController {
  constructor(private prisma: PrismaService) {}

  /**
   * Liveness + a real database round-trip, so a container that can't reach
   * Postgres is reported unhealthy rather than quietly serving 500s. Public
   * by necessity (load balancers don't authenticate) and deliberately
   * returns nothing about the system beyond up/down.
   */
  @Public()
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok" };
    } catch {
      return { status: "degraded", database: "unreachable" };
    }
  }
}
