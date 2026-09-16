// Shared helper for building and signing Stripe webhook fixtures in tests —
// NOT itself a test (no `.test.` in the filename, so it's not picked up by
// the `node scripts/*.test.mjs` check loop). Used by both
// stripe_webhook_signature.test.mjs (proves the signing scheme itself) and
// job_billing_webhook_handlers.test.mjs (proves the handler that would
// receive a verified event).
import { createHmac, timingSafeEqual } from "node:crypto";

/** Builds a `stripe-signature` header value the same way Stripe (and every official SDK) does. */
export function signStripeWebhook(payload, secret, timestamp) {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

/** Mirrors Stripe SDKs' verification: recompute the HMAC, compare in constant time, enforce a tolerance window. */
export function verifyStripeWebhook(payload, header, secret, { toleranceSeconds = 300, now = Math.floor(Date.now() / 1000) } = {}) {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=")));
  const timestamp = Number(parts.t);
  const providedSig = parts.v1;
  if (!Number.isFinite(timestamp) || !providedSig) return { ok: false, reason: "malformed header" };

  const expectedSig = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  const providedBuf = Buffer.from(providedSig, "hex");
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    return { ok: false, reason: "signature mismatch" };
  }
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return { ok: false, reason: "timestamp outside tolerance" };
  }
  return { ok: true };
}

/** A checkout.session.completed fixture body, shaped like the real thing (trimmed to the fields our handlers read). */
export function buildCheckoutSessionCompletedPayload(overrides = {}) {
  return JSON.stringify({
    id: "evt_test_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        payment_intent: "pi_test_1",
        metadata: { kind: "unlock", job_id: "job_1", employer_id: "emp_1", job_unlock_id: "unlock_1" },
        ...overrides,
      },
    },
  });
}
