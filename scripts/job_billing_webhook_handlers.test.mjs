#!/usr/bin/env node
/**
 * Stripe webhook handler tests, with signed fixtures — plain assertions, no
 * framework. Drives the REAL handler function
 * (supabase/functions/_shared/jobBillingWebhookHandlers.ts's
 * handleJobBillingCheckoutCompleted / isJobBillingCheckout — the exact code
 * stripe-webhook/index.ts calls once it has verified a webhook's signature)
 * against a signed checkout.session.completed fixture
 * (scripts/stripe_webhook_fixtures.mjs, proven correct in
 * scripts/stripe_webhook_signature.test.mjs) and an in-memory mock of the
 * Supabase/Stripe clients it talks to.
 *
 * Proves:
 *   - unlock: job_unlocks flips pending -> active with a 30-day
 *     expires_at, and the card is saved to
 *     subscriptions.stripe_default_payment_method_id for future $2 voice
 *     overage charges.
 *   - pack: applicant_packs flips pending -> active.
 *   - boost: boost_orders flips pending_payment -> authorized with a 24h
 *     hold_expires_at.
 *   - idempotency: replaying the SAME (already-processed) event a second
 *     time changes nothing — no double-activation, no reset window/expiry.
 *   - a session with no recognized `kind` is left alone entirely
 *     (isJobBillingCheckout returns false).
 *   - a failure saving the payment method (Stripe unreachable) does not
 *     stop the unlock itself from activating.
 *
 * Run with: node scripts/job_billing_webhook_handlers.test.mjs
 */
import { handleJobBillingCheckoutCompleted, isJobBillingCheckout } from "../supabase/functions/_shared/jobBillingWebhookHandlers.ts";
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

/** Minimal in-memory stand-in for the Supabase admin client's fluent query builder — supports exactly the chain shapes the handler under test uses (.from().update().eq()[.eq()][.select()][.maybeSingle()], and bare `await ...eq(...)` without a terminal call, matching how supabase-js's builder is itself "thenable"). */
function createMockSupabaseAdmin(tables) {
  return {
    tables,
    from(name) {
      return {
        update(patch) {
          const filters = [];
          function execute() {
            const rows = tables[name] || (tables[name] = []);
            const matches = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
            for (const r of matches) Object.assign(r, patch);
            return { data: matches[0] ?? null, error: null };
          }
          const builder = {
            eq(col, val) {
              filters.push([col, val]);
              return builder;
            },
            select() {
              return builder;
            },
            async maybeSingle() {
              return execute();
            },
            then(resolve, reject) {
              Promise.resolve(execute()).then(resolve, reject);
            },
          };
          return builder;
        },
      };
    },
  };
}

/** Parses a signed fixture's session object back out, the way stripe-webhook does after constructEventAsync verifies it. */
function sessionFromSignedFixture(metadata) {
  const now = Math.floor(Date.now() / 1000);
  const payload = buildCheckoutSessionCompletedPayload({ metadata });
  const header = signStripeWebhook(payload, "whsec_test", now);
  const verification = verifyStripeWebhook(payload, header, "whsec_test", { now });
  if (!verification.ok) throw new Error("test fixture itself failed to verify — broken test setup");
  const event = JSON.parse(payload);
  return event.data.object;
}

function makeStripe({ paymentMethodId = "pm_test_1", retrieveFails = false } = {}) {
  const calls = { retrieve: 0 };
  return {
    calls,
    paymentIntents: {
      async retrieve() {
        calls.retrieve += 1;
        if (retrieveFails) throw new Error("Stripe unreachable");
        return { payment_method: paymentMethodId };
      },
    },
  };
}

console.log("-- unlock: pending -> active, 30-day window, card saved --");
{
  const tables = {
    job_unlocks: [{ id: "unlock_1", job_id: "job_1", employer_id: "emp_1", status: "pending", unlocked_at: null, expires_at: null, stripe_payment_intent_id: null }],
    subscriptions: [{ user_id: "emp_1", stripe_customer_id: "cus_1", stripe_default_payment_method_id: null }],
  };
  const supabaseAdmin = createMockSupabaseAdmin(tables);
  const stripe = makeStripe({ paymentMethodId: "pm_saved_1" });
  const session = sessionFromSignedFixture({ kind: "unlock", job_unlock_id: "unlock_1" });

  check("isJobBillingCheckout recognizes an unlock session", isJobBillingCheckout(session));

  const result = await handleJobBillingCheckoutCompleted(supabaseAdmin, stripe, session, new Date("2026-09-16T00:00:00.000Z"));
  check("handler reports kind 'unlock', updated true", result.kind === "unlock" && result.updated === true, JSON.stringify(result));

  const row = tables.job_unlocks[0];
  check("job_unlocks row is now active", row.status === "active");
  check("unlocked_at is set", row.unlocked_at === "2026-09-16T00:00:00.000Z");
  check("expires_at is exactly 30 days later", row.expires_at === "2026-10-16T00:00:00.000Z");
  check("stripe_payment_intent_id recorded", row.stripe_payment_intent_id === "pi_test_1");

  const sub = tables.subscriptions[0];
  check("the card is saved for future off-session voice-overage charges", sub.stripe_default_payment_method_id === "pm_saved_1");
}

console.log("\n-- unlock idempotency: replaying the same event a second time changes nothing --");
{
  const tables = {
    job_unlocks: [{ id: "unlock_2", job_id: "job_2", employer_id: "emp_2", status: "pending", unlocked_at: null, expires_at: null, stripe_payment_intent_id: null }],
    subscriptions: [{ user_id: "emp_2", stripe_customer_id: "cus_2", stripe_default_payment_method_id: null }],
  };
  const supabaseAdmin = createMockSupabaseAdmin(tables);
  const stripe = makeStripe({ paymentMethodId: "pm_saved_2" });
  const session = sessionFromSignedFixture({ kind: "unlock", job_unlock_id: "unlock_2" });

  const first = await handleJobBillingCheckoutCompleted(supabaseAdmin, stripe, session, new Date("2026-09-16T00:00:00.000Z"));
  const snapshotAfterFirst = { ...tables.job_unlocks[0] };

  // Simulate a webhook retry days later — a NEW `now` is passed, the way a
  // real redelivery would carry a later processing timestamp.
  const second = await handleJobBillingCheckoutCompleted(supabaseAdmin, stripe, session, new Date("2026-09-20T00:00:00.000Z"));

  check("first delivery activates the unlock", first.updated === true);
  check("replayed delivery matches zero rows (already active, not 'pending')", second.updated === false, JSON.stringify(second));
  check("unlocked_at/expires_at are untouched by the replay — window was NOT reset to the later timestamp", JSON.stringify(tables.job_unlocks[0]) === JSON.stringify(snapshotAfterFirst));
  check("Stripe was only asked to retrieve the payment intent once, not again on replay", stripe.calls.retrieve <= 1);
}

console.log("\n-- pack: pending -> active --");
{
  const tables = {
    applicant_packs: [{ id: "pack_1", job_id: "job_1", employer_id: "emp_1", status: "pending", stripe_payment_intent_id: null }],
  };
  const supabaseAdmin = createMockSupabaseAdmin(tables);
  const stripe = makeStripe();
  const session = sessionFromSignedFixture({ kind: "pack", applicant_pack_id: "pack_1" });

  check("isJobBillingCheckout recognizes a pack session", isJobBillingCheckout(session));
  const result = await handleJobBillingCheckoutCompleted(supabaseAdmin, stripe, session);
  check("handler reports kind 'pack', updated true", result.kind === "pack" && result.updated === true);
  check("applicant_packs row is now active", tables.applicant_packs[0].status === "active");
  check("stripe_payment_intent_id recorded on the pack", tables.applicant_packs[0].stripe_payment_intent_id === "pi_test_1");
}

console.log("\n-- boost: pending_payment -> authorized, 24h hold --");
{
  const tables = {
    boost_orders: [{ id: "boost_1", job_id: "job_1", employer_id: "emp_1", status: "pending_payment", authorized_at: null, hold_expires_at: null, stripe_payment_intent_id: null }],
  };
  const supabaseAdmin = createMockSupabaseAdmin(tables);
  const stripe = makeStripe();
  const session = sessionFromSignedFixture({ kind: "boost", boost_order_id: "boost_1" });

  check("isJobBillingCheckout recognizes a boost session", isJobBillingCheckout(session));
  const result = await handleJobBillingCheckoutCompleted(supabaseAdmin, stripe, session, new Date("2026-09-16T00:00:00.000Z"));
  check("handler reports kind 'boost', updated true", result.kind === "boost" && result.updated === true);

  const row = tables.boost_orders[0];
  check("boost_orders row is now authorized", row.status === "authorized");
  check("authorized_at is set", row.authorized_at === "2026-09-16T00:00:00.000Z");
  check("hold_expires_at is exactly 24h later", row.hold_expires_at === "2026-09-17T00:00:00.000Z");
}

console.log("\n-- an unrecognized session kind is left alone entirely --");
{
  const tables = { job_unlocks: [], applicant_packs: [], boost_orders: [] };
  const supabaseAdmin = createMockSupabaseAdmin(tables);
  const stripe = makeStripe();
  const voiceCreditsSession = { payment_intent: "pi_other", metadata: { type: "voice_credits", user_id: "u1" } };

  check("isJobBillingCheckout returns false for a voice-credits session", !isJobBillingCheckout(voiceCreditsSession));
  const result = await handleJobBillingCheckoutCompleted(supabaseAdmin, stripe, voiceCreditsSession);
  check("handler returns kind null, updated false for it", result.kind === null && result.updated === false);
}

console.log("\n-- a failed payment-method save does not block the unlock itself --");
{
  const tables = {
    job_unlocks: [{ id: "unlock_3", job_id: "job_3", employer_id: "emp_3", status: "pending", unlocked_at: null, expires_at: null, stripe_payment_intent_id: null }],
    subscriptions: [{ user_id: "emp_3", stripe_customer_id: "cus_3", stripe_default_payment_method_id: null }],
  };
  const supabaseAdmin = createMockSupabaseAdmin(tables);
  const stripe = makeStripe({ retrieveFails: true });
  const session = sessionFromSignedFixture({ kind: "unlock", job_unlock_id: "unlock_3" });

  const result = await handleJobBillingCheckoutCompleted(supabaseAdmin, stripe, session, new Date("2026-09-16T00:00:00.000Z"));
  check("the unlock still activates even though saving the card failed", result.updated === true && tables.job_unlocks[0].status === "active");
  check("no payment method was saved (Stripe retrieve failed) — left null, not fabricated", tables.subscriptions[0].stripe_default_payment_method_id === null);
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
