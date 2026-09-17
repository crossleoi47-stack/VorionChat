import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { currentTenant } from "./tenant-context.store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PrismaClient with tenant isolation wired in two independent layers:
 *
 *  1. Application layer — every service filters by companyId explicitly.
 *  2. Database layer — Postgres Row-Level Security policies keyed off the
 *     session variable `app.company_id`, set here per query.
 *
 * The second layer exists precisely because the first can be forgotten. A new
 * endpoint that omits its companyId filter returns nothing instead of leaking
 * another company's rows.
 *
 * `SET LOCAL` is transaction-scoped and `$transaction(callback)` pins the work
 * to one connection, which is what makes this correct under a pooled client —
 * a bare `SET` would bleed across pooled queries into other requests.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly rlsEnabled: boolean;
  private readonly canConnect: boolean;

  constructor() {
    super();
    this.rlsEnabled = process.env.ENABLE_RLS === "true";
    this.canConnect = /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL ?? "");
  }

  async onModuleInit() {
    if (!this.canConnect) {
      this.logger.warn("Prisma startup skipped because DATABASE_URL is not a PostgreSQL connection string.");
      return;
    }
    try {
      await this.$connect();
    } catch (error) {
      this.logger.warn(`Prisma startup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      return;
    }
    if (this.rlsEnabled) {
      this.logger.log("Row-Level Security enforcement is ON (ENABLE_RLS=true)");
    } else {
      this.logger.warn(
        "Row-Level Security enforcement is OFF. Tenant isolation relies on application-layer filters only. Set ENABLE_RLS=true after running prisma/rls.sql.",
      );
    }
  }

  async onModuleDestroy() {
    if (this.canConnect) await this.$disconnect();
  }

  /**
   * Runs `fn` inside a transaction with `app.company_id` set, so RLS applies.
   * When RLS is disabled, or no tenant is bound (login, webhooks), the work
   * runs normally — the application-layer filters still apply either way.
   */
  async withTenant<T>(fn: (tx: Prisma.TransactionClient | PrismaService) => Promise<T>): Promise<T> {
    const tenant = currentTenant();
    if (!this.rlsEnabled || !tenant?.companyId) return fn(this);

    if (!UUID_RE.test(tenant.companyId)) {
      // Postgres SET takes no bind parameters, so this check is what stands
      // between here and string interpolation. Never relax it.
      throw new Error("withTenant: companyId must be a UUID");
    }

    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.company_id = '${tenant.companyId}'`);
      return fn(tx);
    });
  }
}
