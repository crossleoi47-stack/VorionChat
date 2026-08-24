import { AsyncLocalStorage } from "async_hooks";

export interface TenantContext {
  companyId: string;
  userId: string;
}

/**
 * Carries the authenticated tenant through the whole async call chain without
 * threading it manually through every service signature. A global interceptor
 * populates it per request; the Prisma extension reads it to set Postgres'
 * `app.company_id`, which is what the Row-Level Security policies check.
 */
export const tenantStore = new AsyncLocalStorage<TenantContext>();

export function currentTenant(): TenantContext | undefined {
  return tenantStore.getStore();
}

/**
 * Runs `fn` with no tenant bound — for the genuinely tenant-less paths:
 * login (we don't know the company until credentials resolve) and the
 * WhatsApp webhook (Meta authenticates by signature, not by session).
 * Those paths must scope their own queries explicitly.
 */
export function runUnscoped<T>(fn: () => T): T {
  return tenantStore.run(undefined as unknown as TenantContext, fn);
}
