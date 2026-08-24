import { createHmac, timingSafeEqual } from "crypto";

/**
 * Short-lived signed URLs for media, replacing the earlier `?token=<jwt>`
 * approach.
 *
 * The problem with putting a session JWT in a query string: it lands in
 * server access logs, browser history, and Referer headers, and it grants
 * *everything* that session can do. A signature grants exactly one
 * attachment, for a few minutes, and is worthless if leaked afterwards.
 */
export interface SignedParams {
  id: string;
  userId: string;
  exp: number;
  sig: string;
}

const TTL_SECONDS = 300;

function payload(id: string, userId: string, exp: number): string {
  return `${id}.${userId}.${exp}`;
}

export function signMediaUrl(
  id: string,
  userId: string,
  secret: string,
  ttlSeconds = TTL_SECONDS,
): { exp: number; sig: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = createHmac("sha256", secret).update(payload(id, userId, exp)).digest("hex");
  return { exp, sig };
}

export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "expired" | "invalid" };

export function verifyMediaUrl(
  id: string,
  userId: string,
  exp: number,
  sig: string,
  secret: string,
): VerifyResult {
  if (!userId || !sig || !Number.isFinite(exp)) return { ok: false, reason: "invalid" };
  if (exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: "expired" };

  const expected = createHmac("sha256", secret).update(payload(id, userId, exp)).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  if (a.length !== b.length) return { ok: false, reason: "invalid" };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };

  return { ok: true, userId };
}
