#!/usr/bin/env node
/**
 * billing-webhook, the function itself, against a fake Stripe and a fake
 * database (pricing v9; docs/BILLING.md). No network.
 *
 *   1. _shared/stripe.ts: the Stripe-Signature check (HMAC-SHA256 of
 *      "<t>.<raw body>", every v1 compared in constant time, 5 minutes'
 *      tolerance either way), the form encoding, the return origins, and
 *      reading a subscription's period in either API shape.
 *   2. handle.ts: each of the six events goes to its database function with
 *      the right arguments (their names held to the migration's own, so a
 *      renamed argument fails here as PostgREST would fail it); a
 *      subscription is read again from Stripe, never taken from the body, and
 *      one Stripe has no record of is recorded, never retried; a $99 payment
 *      is read again from Stripe and one refunded already gives nothing; a
 *      Checkout that completed unpaid is told to the admins; anything else is
 *      recorded and ignored; a repeat is a duplicate and changes nothing; a
 *      database or Stripe failure is a 5xx with nothing recorded, so Stripe's
 *      retry does it.
 *   2b. Money owed back: a payment with nothing given for it is refunded in
 *      Stripe at once (an Idempotency-Key from the event), and a second
 *      Unlimited is cancelled and its payment refunded (either API shape);
 *      Stripe refusing is a 503 and the refund still owed is made on the
 *      retry; one refunded by hand counts as done.
 *   3. index.ts, bundled with the Supabase client and serve() replaced: 503
 *      "billing is not set up" without the secrets, 400 and nothing touched
 *      for a missing, wrong, tampered or stale signature, 405 for a GET, 413
 *      for a huge body; a signed event is handled once, however often it is
 *      sent.
 *
 * The SQL the events call is proved in launch_locks_behaviour section 33.
 *
 * Run with: node scripts/billing_webhook.test.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { rpcArgsProblem, sqlSignatures } from "./billing_sql_signatures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `\n        ${String(detail).slice(0, 600)}` : ""}`);
  }
}
const show = (v) => JSON.stringify(v);

const S = await import(path.join(ROOT, "supabase/functions/_shared/stripe.ts"));
const H = await import(path.join(ROOT, "supabase/functions/billing-webhook/handle.ts"));

const SECRET = "whsec_test_0123456789abcdef";
const now = Math.floor(Date.now() / 1000);

console.log("\n1. The signature, and the small readers\n");
{
  const body = JSON.stringify({ id: "evt_1", type: "charge.refunded", data: { object: {} } });
  const good = await S.signStripePayload(body, SECRET, now);
  const v = (header, payload = body, at = now) => S.verifyStripeSignature(payload, header, SECRET, at);
  check("a body signed with the endpoint's secret checks out", (await v(good)).ok === true);
  check("the same body signed with another secret does not", (await S.verifyStripeSignature(body, await S.signStripePayload(body, "whsec_other", now), SECRET, now)).reason === "mismatch");
  check("one changed character in the body does not", (await v(good, body.replace("evt_1", "evt_2"))).reason === "mismatch");
  check("re-serialised JSON (spaces) does not: only the raw body is signed", (await v(good, JSON.stringify(JSON.parse(body), null, 1))).reason === "mismatch");
  check("more than 5 minutes old is refused", (await v(good, body, now + 301)).reason === "too_old");
  check("…and more than 5 minutes ahead", (await v(good, body, now - 301)).reason === "too_old");
  check("…while 299 seconds either way is taken", (await v(good, body, now + 299)).ok && (await v(good, body, now - 299)).ok);
  const twice = `t=${now},v1=${"0".repeat(64)},v1=${good.split("v1=")[1]}`;
  check("a header with several v1 signatures checks out when one matches (a secret being rolled)", (await v(twice)).ok === true);
  check("no header, no timestamp, no v1, a v0 only: refused", (await v(null)).reason === "no_header" && (await v(`v1=${"a".repeat(64)}`)).reason === "no_signature" && (await v(`t=${now}`)).reason === "no_signature" && (await v(`t=${now},v0=${"a".repeat(64)}`)).reason === "no_signature");
  check("timingSafeEqual: equal only when equal, different lengths never", S.timingSafeEqual("abc", "abc") && !S.timingSafeEqual("abc", "abd") && !S.timingSafeEqual("abc", "abcd") && !S.timingSafeEqual("", "a"));
  check("the HMAC is Stripe's (a known vector)", (await S.hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog")) === "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
  const src = await import("node:fs").then((fs) => fs.readFileSync(path.join(ROOT, "supabase/functions/_shared/stripe.ts"), "utf8"));
  check("every v1 is compared (no early return in the loop)", /for \(const signature of signatures\) matched = timingSafeEqual\(signature, expected\) \|\| matched;/.test(src));

  check("no secrets: billing is not set up", S.stripeConfig(() => undefined) === null && S.stripeConfig((k) => (k === "STRIPE_SECRET_KEY" ? "sk_test_x" : "")) === null && S.stripeConfig((k) => (k === "STRIPE_WEBHOOK_SECRET" ? "whsec_x" : undefined)) === null);
  const live = S.stripeConfig((k) => ({ STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_x" })[k]);
  const test = S.stripeConfig((k) => ({ STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" })[k]);
  const restricted = S.stripeConfig((k) => ({ STRIPE_SECRET_KEY: "rk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_x" })[k]);
  check("live or test mode from the key", live.livemode === true && test.livemode === false && restricted.livemode === true);
  check(
    "Stripe's form encoding: nested keys and lists",
    S.formEncode({ mode: "payment", line_items: [{ price: "price_x", quantity: 1 }], metadata: { owner_id: "o", job_id: undefined }, skip: null }) ===
      "mode=payment&line_items%5B0%5D%5Bprice%5D=price_x&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Bowner_id%5D=o",
  );
  const env = (k) => (k === "BILLING_RETURN_ORIGINS" ? "http://localhost:8080, javascript:alert(1)" : undefined);
  check(
    "return origins: HireFlow's own hosts (and one named in BILLING_RETURN_ORIGINS), anything else the main site",
    S.returnOrigin("https://staff.hireflownow.com", env) === "https://staff.hireflownow.com" &&
      S.returnOrigin("http://localhost:8080", env) === "http://localhost:8080" &&
      S.returnOrigin("https://evil.example", env) === "https://hireflownow.com" &&
      S.returnOrigin(null, env) === "https://hireflownow.com" &&
      S.returnOrigin("javascript:alert(1)", env) === "https://hireflownow.com",
  );
  const older = { current_period_start: 1_700_000_000, current_period_end: 1_702_592_000, items: { data: [{ price: { lookup_key: S.UNLIMITED_PRICE_LOOKUP_KEY, unit_amount: 29900, currency: "usd" } }] } };
  const newer = { items: { data: [{ current_period_start: 1_700_000_000, current_period_end: 1_702_592_000, price: { lookup_key: S.UNLIMITED_PRICE_LOOKUP_KEY, unit_amount: 29900, currency: "usd" } }] } };
  check(
    "a subscription's period, on the subscription (older API versions) or on its items (2025-03-31 and later)",
    show(S.subscriptionPeriod(older)) === show(S.subscriptionPeriod(newer)) && S.subscriptionPeriod(newer).end === new Date(1_702_592_000_000).toISOString(),
  );
  check("Unlimited is known by its price's lookup key", S.isUnlimitedSubscription(older) && !S.isUnlimitedSubscription({ items: { data: [{ price: { lookup_key: S.JOB_PRICE_LOOKUP_KEY } }] } }) && !S.isUnlimitedSubscription({}));
}

// A fake database: the billing_apply_* functions' contract (the event id is
// recorded with the effect; a repeat answers duplicate; a failure records
// nothing). Every call's argument names are held to the SQL function's own,
// read from the migration (scripts/billing_sql_signatures.mjs): a renamed
// argument is "function not found", as PostgREST answers it.
const SIGNATURES = sqlSignatures();
function fakeDatabase() {
  const events = new Set();
  const calls = [];
  const problems = [];
  const answers = {};
  let failNext = false;
  return {
    calls,
    events,
    problems,
    answers,
    failOnce() {
      failNext = true;
    },
    async rpc(fn, args) {
      const problem = rpcArgsProblem(SIGNATURES, fn, args);
      if (problem) {
        problems.push(problem);
        return { data: null, error: { message: `Could not find the function: ${problem}` } };
      }
      if (failNext) {
        failNext = false;
        return { data: null, error: { message: "could not serialize access" } };
      }
      if (!("p_event_id" in args) || fn === "billing_refund_owed") {
        calls.push({ fn, args });
        return { data: answers[fn] ? answers[fn](args) : { ok: true }, error: null };
      }
      if (events.has(args.p_event_id)) return { data: { ok: true, duplicate: true }, error: null };
      events.add(args.p_event_id);
      calls.push({ fn, args });
      return { data: answers[fn] ? answers[fn](args) : { ok: true }, error: null };
    },
  };
}

// A fake Stripe: what it holds, what it was asked, and whether it answers at all.
function fakeStripe() {
  const subscriptions = new Map();
  const charges = new Map();
  const invoices = new Map();
  const invoicePayments = new Map();
  const asked = [];
  const refunds = [];
  let down = false;
  let refundAnswer = () => ({ status: 200, body: { id: `re_${refunds.length + 1}`, object: "refund", status: "succeeded" } });
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, body });
  const missing = (what) => reply(404, { error: { code: "resource_missing", message: `No such ${what}` } });
  return {
    subscriptions,
    charges,
    invoices,
    invoicePayments,
    asked,
    refunds,
    setDown(v) {
      down = v;
    },
    answerRefunds(fn) {
      refundAnswer = fn;
    },
    async call(method, p, params = {}, options = {}) {
      asked.push({ method, path: p, params, key: options.idempotencyKey ?? null });
      if (down) return reply(0, null);
      const sub = /^\/subscriptions\/([^/?]+)$/.exec(p);
      if (sub && method === "GET") {
        const found = subscriptions.get(decodeURIComponent(sub[1]));
        return found ? reply(200, found) : missing("subscription");
      }
      if (sub && method === "DELETE") {
        const found = subscriptions.get(decodeURIComponent(sub[1]));
        if (!found) return missing("subscription");
        if (found.status === "canceled") return reply(400, { error: { message: "already canceled" } });
        found.status = "canceled";
        return reply(200, found);
      }
      if (method === "GET" && p === "/charges") return reply(200, { object: "list", data: charges.get(params.payment_intent) ?? [{ id: "ch_x", paid: true, status: "succeeded", refunded: false }] });
      if (method === "GET" && p === "/invoices") return reply(200, { object: "list", data: invoices.get(params.subscription) ?? [] });
      if (method === "GET" && p === "/invoice_payments") return reply(200, { object: "list", data: invoicePayments.get(params.invoice) ?? [] });
      if (method === "POST" && p === "/refunds") {
        const r = refundAnswer(params);
        if (r.status === 200) refunds.push({ params, key: options.idempotencyKey ?? null });
        return reply(r.status, r.body);
      }
      return reply(404, { error: { message: "unknown" } });
    },
  };
}

const OWNER = "11111111-1111-4111-8111-111111111111";
const JOB = "22222222-2222-4222-8222-222222222222";
const GONE_JOB = "33333333-3333-4333-8333-333333333333";
const unlimitedSub = (id, status, extra = {}) => ({
  id,
  object: "subscription",
  customer: "cus_A",
  status,
  cancel_at_period_end: false,
  items: { data: [{ current_period_start: now - 86400, current_period_end: now + 29 * 86400, price: { lookup_key: S.UNLIMITED_PRICE_LOOKUP_KEY, unit_amount: 29900, currency: "usd" } }] },
  ...extra,
});

console.log("\n2. Each event, against a fake Stripe and a fake database\n");
{
  const db = fakeDatabase();
  const stripe = fakeStripe();
  const deps = { rpc: (fn, args) => db.rpc(fn, args), stripe: (m, p, params, options) => stripe.call(m, p, params, options) };
  const event = (id, type, object, livemode = false) => ({ id, object: "event", type, livemode, data: { object } });

  const paidSession = { id: "cs_test_1", object: "checkout.session", mode: "payment", payment_status: "paid", customer: "cus_A", payment_intent: "pi_1", amount_total: 9900, currency: "usd", metadata: { owner_id: OWNER, job_id: JOB, kind: "job" } };
  const first = await H.handleStripeEvent(event("evt_job_1", "checkout.session.completed", paidSession), deps);
  const call = db.calls.at(-1);
  check(
    "a paid job checkout: the payment is read again from Stripe, then billing_apply_job_payment with the owner, job, customer, session, payment intent and amount",
    first.status === 200 && call?.fn === "billing_apply_job_payment" && stripe.asked.some((a) => a.method === "GET" && a.path === "/charges" && a.params.payment_intent === "pi_1") &&
      show(call.args) === show({ p_event_id: "evt_job_1", p_event_type: "checkout.session.completed", p_livemode: false, p_owner: OWNER, p_customer: "cus_A", p_job: JOB, p_session: "cs_test_1", p_payment_intent: "pi_1", p_amount: 9900, p_currency: "usd" }),
    show([first, call]),
  );
  const again = await H.handleStripeEvent(event("evt_job_1", "checkout.session.completed", paidSession), deps);
  check(
    "the same event again: 200, a duplicate, nothing done twice (and no refund is owed for it)",
    again.status === 200 && again.body.duplicate === true && db.calls.filter((c) => c.fn === "billing_apply_job_payment" && c.args.p_event_id === "evt_job_1").length === 1 &&
      db.calls.at(-1).fn === "billing_refund_owed" && !stripe.asked.some((a) => a.path === "/refunds"),
    show(again),
  );

  const unpaid = await H.handleStripeEvent(event("evt_job_2", "checkout.session.completed", { ...paidSession, id: "cs_test_2", payment_status: "unpaid" }), deps);
  const unpaidCall = db.calls.at(-1);
  const unpaidSub = await H.handleStripeEvent(event("evt_job_2b", "checkout.session.completed", { id: "cs_test_2b", mode: "subscription", payment_status: "no_payment_required", customer: "cus_A", subscription: "sub_x", metadata: { owner_id: OWNER, kind: "unlimited" } }), deps);
  const unpaidSubCall = db.calls.at(-1);
  check(
    "a Checkout that completed unpaid (a job or Unlimited; Checkout takes cards only) gives nothing and is recorded for the admins (billing_record_unpaid_checkout), never silently",
    unpaid.status === 200 && unpaidCall.fn === "billing_record_unpaid_checkout" && unpaidCall.args.p_payment_status === "unpaid" && unpaidCall.args.p_kind === "job" && unpaidCall.args.p_session === "cs_test_2" &&
      unpaidSub.status === 200 && unpaidSubCall.fn === "billing_record_unpaid_checkout" && unpaidSubCall.args.p_kind === "unlimited" && !stripe.asked.some((a) => a.path === "/subscriptions/sub_x"),
    show([unpaidCall, unpaidSubCall]),
  );
  const noMeta = await H.handleStripeEvent(event("evt_job_3", "checkout.session.completed", { ...paidSession, id: "cs_test_3", metadata: { kind: "job", owner_id: "not-a-uuid" } }), deps);
  const noMetaCall = db.calls.at(-1);
  const foreign = await H.handleStripeEvent(event("evt_job_4", "checkout.session.completed", { ...paidSession, id: "cs_test_4", metadata: {} }), deps);
  const foreignCall = db.calls.at(-1);
  check(
    "one without a real owner and job, and another product's checkout, are recorded and ignored",
    [noMeta, foreign].every((r) => r.status === 200) && [noMetaCall, foreignCall].every((c) => c.fn === "billing_record_event" && /^ignored/.test(c.args.p_outcome)),
    show([noMetaCall, foreignCall]),
  );
  // Refunded before its own event came (a retried delivery): Stripe says so, and nothing is given.
  stripe.charges.set("pi_refunded", [{ id: "ch_r", paid: true, status: "succeeded", refunded: true }]);
  const refundedFirst = await H.handleStripeEvent(event("evt_job_5", "checkout.session.completed", { ...paidSession, id: "cs_test_5", payment_intent: "pi_refunded" }), deps);
  check(
    "a payment Stripe already refunded in full is recorded and ignored: no pass (the billing review, finding 8)",
    refundedFirst.status === 200 && db.calls.at(-1).fn === "billing_record_event" && db.calls.at(-1).args.p_outcome === "ignored: refunded before it was recorded" &&
      !db.calls.some((c) => c.fn === "billing_apply_job_payment" && c.args.p_payment_intent === "pi_refunded"),
    show(db.calls.at(-1)),
  );
  stripe.setDown(true);
  const before = db.calls.length;
  const unreadable = await H.handleStripeEvent(event("evt_job_6", "checkout.session.completed", { ...paidSession, id: "cs_test_6", payment_intent: "pi_6" }), deps);
  stripe.setDown(false);
  check("Stripe not answering about the payment: 503 and nothing recorded, so Stripe's retry does it", unreadable.status === 503 && db.calls.length === before && !db.events.has("evt_job_6"), show(unreadable));

  stripe.subscriptions.set("sub_1", unlimitedSub("sub_1", "active"));
  const subSession = { id: "cs_test_5", object: "checkout.session", mode: "subscription", payment_status: "paid", customer: "cus_A", subscription: "sub_1", metadata: { owner_id: OWNER, job_id: JOB, kind: "unlimited" } };
  const started = await H.handleStripeEvent(event("evt_sub_1", "checkout.session.completed", subSession), deps);
  const subCall = db.calls.at(-1);
  check(
    "Unlimited's checkout: the subscription is read again from Stripe and applied with its period (from its items) and the job named at checkout",
    started.status === 200 && stripe.asked.at(-1).path === "/subscriptions/sub_1" && subCall.fn === "billing_apply_subscription" &&
      subCall.args.p_status === "active" && subCall.args.p_subscription === "sub_1" && subCall.args.p_customer === "cus_A" && subCall.args.p_job === JOB &&
      subCall.args.p_period_end === new Date((now + 29 * 86400) * 1000).toISOString() && subCall.args.p_amount === 29900,
    show([started, subCall]),
  );
  // The body says active; Stripe says canceled: Stripe wins (events can arrive out of order).
  stripe.subscriptions.set("sub_1", unlimitedSub("sub_1", "canceled"));
  const updated = await H.handleStripeEvent(event("evt_sub_2", "customer.subscription.updated", unlimitedSub("sub_1", "active")), deps);
  check("a subscription event applies Stripe's current state, never the body's", updated.status === 200 && db.calls.at(-1).args.p_status === "canceled" && db.calls.at(-1).args.p_job === null, show(db.calls.at(-1)));
  stripe.subscriptions.set("sub_job", { ...unlimitedSub("sub_job", "active"), items: { data: [{ price: { lookup_key: S.JOB_PRICE_LOOKUP_KEY } }] } });
  const notOurs = await H.handleStripeEvent(event("evt_sub_3", "customer.subscription.created", { id: "sub_job" }), deps);
  check("a subscription that is not on the Unlimited price is recorded and ignored", notOurs.status === 200 && db.calls.at(-1).fn === "billing_record_event", show(db.calls.at(-1)));
  const gone = await H.handleStripeEvent(event("evt_sub_gone", "customer.subscription.updated", { id: "sub_nowhere" }), deps);
  check(
    "Stripe has no such subscription (resource_missing): recorded and answered 200, never retried for days (finding 14)",
    gone.status === 200 && db.calls.at(-1).fn === "billing_record_event" && db.calls.at(-1).args.p_outcome === "ignored: Stripe has no such subscription" && db.events.has("evt_sub_gone"),
    show([gone, db.calls.at(-1)]),
  );
  stripe.setDown(true);
  const before2 = db.calls.length;
  const down = await H.handleStripeEvent(event("evt_sub_4", "customer.subscription.deleted", { id: "sub_1" }), deps);
  const recordedWhileDown = db.events.has("evt_sub_4") || db.calls.length !== before2;
  stripe.setDown(false);
  const retried = await H.handleStripeEvent(event("evt_sub_4", "customer.subscription.deleted", { id: "sub_1" }), deps);
  check(
    "Stripe not answering: 503 and nothing recorded, so Stripe's retry applies it",
    down.status === 503 && !recordedWhileDown && retried.status === 200 && db.calls.length === before2 + 1 && db.calls.at(-1).fn === "billing_apply_subscription",
    show([down, retried]),
  );

  const failedPay = await H.handleStripeEvent(event("evt_inv_1", "invoice.payment_failed", { id: "in_1", customer: "cus_A", subscription: "sub_1" }), deps);
  const failedOld = db.calls.at(-1);
  await H.handleStripeEvent(event("evt_inv_2", "invoice.payment_failed", { id: "in_2", customer: "cus_A", parent: { type: "subscription_details", subscription_details: { subscription: "sub_2" } } }), deps);
  const failedNew = db.calls.at(-1);
  check(
    "a failed payment: billing_apply_payment_failed for its customer and its subscription, in either API shape (once a day each, in the database)",
    failedPay.status === 200 && failedOld.fn === "billing_apply_payment_failed" && failedOld.args.p_customer === "cus_A" && failedOld.args.p_subscription === "sub_1" && failedNew.args.p_subscription === "sub_2",
    show([failedOld, failedNew]),
  );
  await H.handleStripeEvent(event("evt_ref_1", "charge.refunded", { id: "ch_1", payment_intent: "pi_1", refunded: true }), deps);
  const full = db.calls.at(-1);
  await H.handleStripeEvent(event("evt_ref_2", "charge.refunded", { id: "ch_2", payment_intent: { id: "pi_2" }, refunded: false }), deps);
  const partial = db.calls.at(-1);
  check(
    "a refund: billing_apply_refund with its payment intent (bare or expanded) and whether it was in full",
    full.fn === "billing_apply_refund" && full.args.p_payment_intent === "pi_1" && full.args.p_fully_refunded === true && partial.args.p_payment_intent === "pi_2" && partial.args.p_fully_refunded === false,
    show([full, partial]),
  );
  const other = await H.handleStripeEvent(event("evt_other", "customer.created", { id: "cus_B" }), deps);
  check("any other event is recorded and ignored", other.status === 200 && db.calls.at(-1).fn === "billing_record_event" && db.calls.at(-1).args.p_outcome === "ignored: customer.created");
  const junk = [await H.handleStripeEvent(null, deps), await H.handleStripeEvent({ id: "nope", type: "x", data: { object: {} } }, deps), await H.handleStripeEvent({ id: "evt_x", type: "x" }, deps)];
  check("not a Stripe event: 400", junk.every((r) => r.status === 400), show(junk));
  db.failOnce();
  const broke = await H.handleStripeEvent(event("evt_job_9", "checkout.session.completed", { ...paidSession, id: "cs_test_9" }), deps);
  const fixed = await H.handleStripeEvent(event("evt_job_9", "checkout.session.completed", { ...paidSession, id: "cs_test_9" }), deps);
  check("the database failing: 500 and nothing recorded; Stripe's retry then applies it once", broke.status === 500 && fixed.status === 200 && db.calls.filter((c) => c.fn === "billing_apply_job_payment" && c.args.p_event_id === "evt_job_9").length === 1, show([broke, fixed]));
  check("the six events billing-webhook acts on are the ones docs/BILLING.md tells Stripe to send", show(H.HANDLED_EVENTS) === show(["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.payment_failed", "charge.refunded"]));
  check("every call the webhook made named the SQL function's own arguments", db.problems.length === 0, show(db.problems));
}

console.log("\n2b. Money owed back is refunded in Stripe (the billing review, findings 1 and 5)\n");
{
  const db = fakeDatabase();
  const stripe = fakeStripe();
  const deps = { rpc: (fn, args) => db.rpc(fn, args), stripe: (m, p, params, options) => stripe.call(m, p, params, options) };
  const event = (id, type, object) => ({ id, object: "event", type, livemode: false, data: { object } });
  const owed = new Map();
  const results = [];
  db.answers.billing_apply_job_payment = (args) =>
    args.p_job === GONE_JOB
      ? (owed.set(args.p_event_id, { id: "aaaaaaaa-0000-4000-8000-000000000001", eventId: args.p_event_id, kind: "job_payment", reason: "job_gone", paymentIntent: args.p_payment_intent, subscription: null }),
        { ok: true, published: "job_gone", refund: owed.get(args.p_event_id) })
      : { ok: true, published: "published" };
  db.answers.billing_refund_owed = (args) => (owed.has(args.p_event_id) ? { refund: owed.get(args.p_event_id) } : {});
  db.answers.billing_refund_result = (args) => {
    results.push(args);
    if (!args.p_error) for (const [k, v] of owed) if (v.id === args.p_refund) owed.delete(k);
    return { ok: true, status: args.p_error ? "failed" : "done" };
  };
  const gone = { id: "cs_gone", object: "checkout.session", mode: "payment", payment_status: "paid", customer: "cus_A", payment_intent: "pi_gone", amount_total: 9900, currency: "usd", metadata: { owner_id: OWNER, job_id: GONE_JOB, kind: "job" } };
  stripe.answerRefunds(() => ({ status: 500, body: { error: { message: "Stripe is having a moment" } } }));
  const firstTry = await H.handleStripeEvent(event("evt_owed_1", "checkout.session.completed", gone), deps);
  const refundAsk = stripe.asked.find((a) => a.path === "/refunds");
  check(
    "a payment the database owes back is refunded at once (its payment intent, an Idempotency-Key from the event); Stripe refusing: the failure is recorded and the answer is 503, so Stripe sends the event again",
    firstTry.status === 503 && refundAsk?.params.payment_intent === "pi_gone" && refundAsk.key === "hireflow-refund-evt_owed_1" &&
      results.length === 1 && results[0].p_refund === "aaaaaaaa-0000-4000-8000-000000000001" && /Stripe is having a moment/.test(results[0].p_error) && results[0].p_stripe_refunds === null,
    show([firstTry, refundAsk, results]),
  );
  stripe.answerRefunds(() => ({ status: 200, body: { id: "re_gone", object: "refund" } }));
  const retry = await H.handleStripeEvent(event("evt_owed_1", "checkout.session.completed", gone), deps);
  check(
    "…Stripe's retry: the event is a duplicate, the refund still owed is found (billing_refund_owed) and made with the same key; done, 200",
    retry.status === 200 && retry.body.refunded === true && stripe.refunds.length === 1 && stripe.refunds[0].key === "hireflow-refund-evt_owed_1" &&
      results.at(-1).p_stripe_refunds === "re_gone" && results.at(-1).p_error === null && db.calls.some((c) => c.fn === "billing_refund_owed" && c.args.p_event_id === "evt_owed_1"),
    show([retry, results.at(-1)]),
  );
  const third = await H.handleStripeEvent(event("evt_owed_1", "checkout.session.completed", gone), deps);
  check("…once done, the same event again refunds nothing more", third.status === 200 && stripe.refunds.length === 1, show(third));
  stripe.answerRefunds(() => ({ status: 400, body: { error: { code: "charge_already_refunded", message: "already refunded" } } }));
  const already = await H.handleStripeEvent(event("evt_owed_2", "checkout.session.completed", { ...gone, id: "cs_gone2", payment_intent: "pi_gone2" }), deps);
  check("…a payment refunded already (by hand in Stripe) counts as done", already.status === 200 && results.at(-1).p_error === null, show([already, results.at(-1)]));

  // A second Unlimited: cancelled at once, its payment refunded, in either API shape.
  stripe.answerRefunds(() => ({ status: 200, body: { id: `re_s${stripe.refunds.length + 1}`, object: "refund" } }));
  stripe.subscriptions.set("sub_two", unlimitedSub("sub_two", "active"));
  stripe.invoices.set("sub_two", [{ id: "in_two", amount_paid: 29900, payment_intent: "pi_two" }, { id: "in_zero", amount_paid: 0 }]);
  db.answers.billing_apply_subscription = (args) =>
    args.p_subscription === "sub_two" || args.p_subscription === "sub_three"
      ? { ok: true, ignored: "second_subscription", refund: { id: `bbbbbbbb-0000-4000-8000-00000000000${args.p_subscription === "sub_two" ? 2 : 3}`, eventId: args.p_event_id, kind: "second_subscription", reason: "second_unlimited", paymentIntent: null, subscription: args.p_subscription } }
      : { ok: true };
  const second = await H.handleStripeEvent(event("evt_two", "customer.subscription.created", { id: "sub_two" }), deps);
  const cancelAsk = stripe.asked.find((a) => a.method === "DELETE" && a.path === "/subscriptions/sub_two");
  const twoRefund = stripe.refunds.find((r) => r.params.payment_intent === "pi_two");
  check(
    "a second live Unlimited (finding 1): cancelled at once in Stripe, the payment it took refunded (reason duplicate, a key from the event), the result told to the database; nothing for an invoice that took nothing",
    second.status === 200 && !!cancelAsk && stripe.subscriptions.get("sub_two").status === "canceled" && twoRefund?.params.reason === "duplicate" && twoRefund.key === "hireflow-refund-evt_two-in_two-0" &&
      stripe.refunds.filter((r) => r.key?.startsWith("hireflow-refund-evt_two")).length === 1 && results.at(-1).p_refund === "bbbbbbbb-0000-4000-8000-000000000002" && results.at(-1).p_error === null,
    show([second, cancelAsk, twoRefund, results.at(-1)]),
  );
  // 2025-03-31 and later: the invoice names its payments through /invoice_payments.
  stripe.subscriptions.set("sub_three", unlimitedSub("sub_three", "active"));
  stripe.invoices.set("sub_three", [{ id: "in_three", amount_paid: 29900 }]);
  stripe.invoicePayments.set("in_three", [{ id: "inpay_1", status: "paid", payment: { type: "payment_intent", payment_intent: "pi_three" } }, { id: "inpay_2", status: "open", payment: { type: "payment_intent", payment_intent: "pi_open" } }]);
  const third2 = await H.handleStripeEvent(event("evt_three", "customer.subscription.created", { id: "sub_three" }), deps);
  check(
    "…in the newer API shape too (the invoice's payments), refunding only what was paid",
    third2.status === 200 && stripe.refunds.some((r) => r.params.payment_intent === "pi_three") && !stripe.refunds.some((r) => r.params.payment_intent === "pi_open"),
    show([third2, stripe.refunds]),
  );
  check("every call named the SQL function's own arguments", db.problems.length === 0, show(db.problems));
  const renamed = rpcArgsProblem(SIGNATURES, "billing_apply_job_payment", { p_event_id: "e", p_event_type: "t", p_livemode: false, p_owner: OWNER, p_customer: "c", p_job_id: JOB, p_session: "s", p_payment_intent: "p", p_amount: 1, p_currency: "usd" });
  const left = rpcArgsProblem(SIGNATURES, "billing_refund_result", { p_refund: "x", p_error: null });
  check(
    "…which the fake database checks against the migration: a renamed argument, or one left out, is \"function not found\" there (finding 20)",
    /has no argument p_job_id/.test(renamed ?? "") && /needs p_stripe_refunds/.test(left ?? "") && rpcArgsProblem(SIGNATURES, "billing_apply_payment_failed", { p_event_id: "e", p_event_type: "t", p_livemode: false, p_customer: "c" }) === null,
    show([renamed, left]),
  );
}

console.log("\n3. The function itself (index.ts), bundled with stand-ins\n");
{
  const bundle = await build({
    stdin: { contents: 'import "./supabase/functions/billing-webhook/index.ts";\n', resolveDir: ROOT, loader: "ts" },
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    logLevel: "silent",
    plugins: [
      {
        name: "outside-modules",
        setup(b) {
          b.onResolve({ filter: /^https:\/\// }, (args) => {
            if (/esm\.sh\/@supabase\/supabase-js@/.test(args.path)) return { path: "supabase", namespace: "stub" };
            if (/deno\.land\/std@[\d.]+\/http\/server\.ts$/.test(args.path)) return { path: "serve", namespace: "stub" };
            throw new Error(`the function imports something this test has no stand-in for: ${args.path}`);
          });
          b.onLoad({ filter: /^supabase$/, namespace: "stub" }, () => ({ contents: "export const createClient = (url, key) => globalThis.__world.client(url, key);", loader: "js" }));
          b.onLoad({ filter: /^serve$/, namespace: "stub" }, () => ({ contents: "export const serve = (handler) => { globalThis.__webhook = handler; };", loader: "js" }));
        },
      },
    ],
  });
  const env = {};
  globalThis.Deno = { env: { get: (key) => env[key] } };
  const db = fakeDatabase();
  const stripe = fakeStripe();
  const clients = [];
  globalThis.__world = { client: (url, key) => (clients.push(key), { rpc: (fn, args) => db.rpc(fn, args) }) };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const params = Object.fromEntries(new URLSearchParams(init.method === "POST" ? String(init.body ?? "") : u.search));
    const r = await stripe.call(init.method ?? "GET", u.pathname.replace(/^\/v1/, ""), params, { idempotencyKey: init.headers?.["Idempotency-Key"] });
    return new Response(JSON.stringify(r.body), { status: r.status || 500, headers: { "Content-Type": "application/json" } });
  };
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  const handler = globalThis.__webhook;
  const send = async (body, headers = {}, method = "POST") => {
    const res = await handler(new Request("https://fn.example/billing-webhook", { method, headers, body: method === "POST" ? body : undefined }));
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const payload = JSON.stringify({ id: "evt_http_1", object: "event", type: "invoice.payment_failed", livemode: false, data: { object: { id: "in_1", customer: "cus_A" } } });

  const unset = await send(payload, { "stripe-signature": await S.signStripePayload(payload, SECRET, now) });
  check("without the Stripe secrets: 503 \"billing is not set up\", the database untouched", unset.status === 503 && unset.body?.error === "billing is not set up" && db.calls.length === 0 && clients.length === 0, show(unset));

  env.STRIPE_SECRET_KEY = "sk_test_0000";
  env.STRIPE_WEBHOOK_SECRET = SECRET;
  env.SUPABASE_URL = "http://database.stand-in";
  env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  const refusals = [
    ["no signature", await send(payload)],
    ["another secret's", await send(payload, { "stripe-signature": await S.signStripePayload(payload, "whsec_someone_else", now) })],
    ["a tampered body", await send(payload.replace("cus_A", "cus_B"), { "stripe-signature": await S.signStripePayload(payload, SECRET, now) })],
    ["ten minutes old", await send(payload, { "stripe-signature": await S.signStripePayload(payload, SECRET, now - 600) })],
  ];
  check(
    "a missing, wrong, tampered or stale signature: 400 and the database never even reached",
    refusals.every(([, r]) => r.status === 400 && r.body?.error === "signature") && db.calls.length === 0 && clients.length === 0,
    show(refusals),
  );
  check("a GET: 405", (await send(null, {}, "GET")).status === 405);
  check("a body far too big for an event: 413", (await send("x".repeat(600 * 1024), { "stripe-signature": "t=1,v1=" + "a".repeat(64) })).status === 413);
  const signed = { "stripe-signature": await S.signStripePayload(payload, SECRET, now) };
  const ok = await send(payload, signed);
  const replay = await send(payload, signed);
  check(
    "a signed event is handled with the service role, once; the same signed request again is a duplicate",
    ok.status === 200 && ok.body?.received === true && replay.status === 200 && replay.body?.duplicate === true &&
      db.calls.length === 1 && db.calls[0].fn === "billing_apply_payment_failed" && clients.every((k) => k === "service-key"),
    show([ok, replay, db.calls]),
  );
  stripe.subscriptions.set("sub_9", unlimitedSub("sub_9", "past_due"));
  const subPayload = JSON.stringify({ id: "evt_http_2", object: "event", type: "customer.subscription.updated", livemode: true, data: { object: { id: "sub_9", status: "active" } } });
  const sub = await send(subPayload, { "stripe-signature": await S.signStripePayload(subPayload, SECRET, now) });
  check("a subscription event reads the subscription from Stripe's API (the fake) and applies its state, in live mode as sent", sub.status === 200 && db.calls.at(-1).fn === "billing_apply_subscription" && db.calls.at(-1).args.p_status === "past_due" && db.calls.at(-1).args.p_livemode === true, show([sub, db.calls.at(-1)]));
  check("…with the secret key, and never a call the SQL does not take", stripe.asked.length > 0 && db.problems.length === 0, show(db.problems));
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
