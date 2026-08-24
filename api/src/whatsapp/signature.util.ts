import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifies Meta's X-Hub-Signature-256 header against the raw request body.
 * An unverified webhook is dropped before it ever reaches the conversation
 * core — see whatsapp.controller.ts — closing the "spoofed webhook injects
 * fake client messages" risk called out in the blueprint (§14/§22).
 */
export function verifyMetaSignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}
