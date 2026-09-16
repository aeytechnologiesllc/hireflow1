#!/usr/bin/env node
/**
 * Stripe webhook signature fixtures — plain assertions, no framework.
 *
 * stripe-webhook/index.ts verifies every incoming webhook with
 * `stripe.webhooks.constructEventAsync(body, signature, webhookSecret, ...,
 * Stripe.createSubtleCryptoProvider())` — Deno-only code (the Stripe SDK is
 * imported from esm.sh), so it cannot run under Node. What CAN be proven
 * under Node is the signing scheme itself: Stripe's webhook signatures are a
 * documented, cross-SDK-identical HMAC-SHA256 over `${timestamp}.${body}`
 * with the webhook secret, sent as a `t=...,v1=...` header — the exact
 * bytes any Stripe SDK (including the Deno one stripe-webhook uses) checks.
 * scripts/stripe_webhook_fixtures.mjs builds SIGNED fixtures with that
 * scheme, using only Node's built-in crypto (no network, no real Stripe
 * account); this proves:
 *
 *   - a correctly-signed fixture verifies
 *   - a tampered payload (one byte changed after signing) fails verification
 *   - the right signature under the WRONG secret fails verification
 *   - a signature whose timestamp is outside the tolerance window fails,
 *     exactly as Stripe SDKs enforce by default (replay protection)
 *
 * These same fixture builders back
 * scripts/job_billing_webhook_handlers.test.mjs's checkout.session.completed
 * payloads, so the handler tests exercise realistic, correctly-signed bodies.
 *
 * Run with: node scripts/stripe_webhook_signature.test.mjs
 */
import { signStripeWebhook, verifyStripeWebhook, buildCheckoutSessionCompletedPayload } from "./stripe_webhook_fixtures.mjs";

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

const SECRET = "whsec_test_fixture_secret_do_not_use_in_prod";
const WRONG_SECRET = "whsec_wrong_secret";

console.log("-- signed fixtures verify exactly like a real Stripe SDK would --");
{
  const now = Math.floor(Date.now() / 1000);
  const payload = buildCheckoutSessionCompletedPayload();
  const header = signStripeWebhook(payload, SECRET, now);
  const result = verifyStripeWebhook(payload, header, SECRET, { now });
  check("a correctly-signed checkout.session.completed fixture verifies", result.ok, JSON.stringify(result));
}

console.log("\n-- tampering, wrong secret, and replay are all rejected --");
{
  const now = Math.floor(Date.now() / 1000);
  const payload = buildCheckoutSessionCompletedPayload();
  const header = signStripeWebhook(payload, SECRET, now);

  const tampered = payload.replace('"pi_test_1"', '"pi_attacker_substituted"');
  const tamperedResult = verifyStripeWebhook(tampered, header, SECRET, { now });
  check("a payload tampered with AFTER signing fails verification", !tamperedResult.ok && tamperedResult.reason === "signature mismatch");

  const wrongSecretResult = verifyStripeWebhook(payload, header, WRONG_SECRET, { now });
  check("the right signature checked against the WRONG webhook secret fails", !wrongSecretResult.ok);

  const staleHeader = signStripeWebhook(payload, SECRET, now - 600); // 10 minutes old
  const staleResult = verifyStripeWebhook(payload, staleHeader, SECRET, { now, toleranceSeconds: 300 });
  check("a signature older than the tolerance window is rejected (replay protection)", !staleResult.ok && staleResult.reason === "timestamp outside tolerance");

  const freshHeader = signStripeWebhook(payload, SECRET, now - 60); // 1 minute old, within tolerance
  const freshResult = verifyStripeWebhook(payload, freshHeader, SECRET, { now, toleranceSeconds: 300 });
  check("a signature within the tolerance window still verifies", freshResult.ok);
}

console.log("\n-- fixtures cover all three job-billing checkout kinds --");
for (const [kind, metadata] of [
  ["unlock", { kind: "unlock", job_id: "job_1", employer_id: "emp_1", job_unlock_id: "unlock_1" }],
  ["pack", { kind: "pack", job_id: "job_1", employer_id: "emp_1", applicant_pack_id: "pack_1" }],
  ["boost", { kind: "boost", job_id: "job_1", employer_id: "emp_1", boost_order_id: "boost_1" }],
]) {
  const now = Math.floor(Date.now() / 1000);
  const payload = buildCheckoutSessionCompletedPayload({ metadata });
  const header = signStripeWebhook(payload, SECRET, now);
  const result = verifyStripeWebhook(payload, header, SECRET, { now });
  check(`'${kind}' checkout fixture signs and verifies`, result.ok);
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
