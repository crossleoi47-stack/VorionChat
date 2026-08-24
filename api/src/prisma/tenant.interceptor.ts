import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { AuthenticatedRequest } from "../auth/authenticated-request";
import { tenantStore } from "./tenant-context.store";

/**
 * Binds the authenticated user's company to the async context for the life of
 * the request, so every Prisma query underneath it runs with Postgres'
 * `app.company_id` set and Row-Level Security applies.
 *
 * Runs after the auth guard (req.user is populated by then). Unauthenticated
 * routes — login, the WhatsApp webhook — simply proceed with no tenant bound
 * and must scope their own queries, which they already do.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest | undefined>();
    const user = req?.user;
    if (!user) return next.handle();

    return tenantStore.run({ companyId: user.companyId, userId: user.id }, () => next.handle());
  }
}
