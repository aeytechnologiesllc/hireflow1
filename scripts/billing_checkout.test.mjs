#!/usr/bin/env node
/**
 * billing-checkout and billing-portal, the functions themselves, against a
 * fake Stripe (fetch) and a fake database (pricing v9; docs/BILLING.md). Each
 * real index.ts is bundled with the Supabase client and serve() replaced. No
 * network.
 *
 * It proves:
 *   - without the Stripe secrets both answer 503 "billing is not set up"
 *     and touch neither Stripe nor the database;
 *   - who is asking comes from the sign-in (401 without one), and the
 *     database's refusals (billing off, an applicant, the exempt account,
 *     another business's job, a live job, Unlimited already on, email not
 *     confirmed, paused) are answered with their own code, Stripe untouched;
 *   - the price is found by its lookup key, never a price id (none is in the
 *     source), and a missing or wrong-kind price is "not set up";
 *   - the owner's Stripe customer is made once (Idempotency-Key, kept with
 *     billing_save_customer) and reused after;
 *   - the Checkout Session: payment for a job, subscription for Unlimited,
 *     cards only, metadata naming owner, kind and job on the session and its
 *     payment or subscription, and success and cancel pages on HireFlow's own
 *     site (another origin is never used);
 *   - one at a time (the billing review, findings 1 and 9): the database's
 *     claim (billing_checkout_begin) refuses a second request at the same
 *     moment, the earlier open page is expired in Stripe before a new one is
 *     made (one already paid for a job: "goes live in a moment"), the page is
 *     made with an Idempotency-Key from the claim, and for Unlimited Stripe's
 *     own list of the customer's subscriptions refuses a second (on, or still
 *     being charged); a claim is let go whenever no page is made;
 *   - every database call names the SQL function's own arguments;
 *   - the billing portal is the owner's own customer's, back to Settings.
 *
 * Run with: node scripts/billing_checkout.test.mjs
 */
import path from "node:path";
import { readFileSync } from "node:fs";
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
    console.log(`FAIL  - ${name}${detail ? `\n        ${String(detail).slice(0, 700)}` : ""}`);
  }
}
const show = (v) => JSON.stringify(v);

async function load(fn, global) {
  const bundle = await build({
    stdin: { contents: `import "./supabase/functions/${fn}/index.ts";\n`, resolveDir: ROOT, loader: "ts" },
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
          b.onLoad({ filter: /^supabase$/, namespace: "stub" }, () => ({ contents: "export const createClient = (url, key, opts) => globalThis.__world.client(url, key, opts);", loader: "js" }));
          b.onLoad({ filter: /^serve$/, namespace: "stub" }, () => ({ contents: `export const serve = (handler) => { globalThis.${global} = handler; };`, loader: "js" }));
        },
      },
    ],
  });
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  return globalThis[global];
}

const OWNER = "11111111-1111-4111-8111-111111111111";
const MATE = "33333333-3333-4333-8333-333333333333";
const JOB = "22222222-2222-4222-8222-222222222222";
const TOKENS = { "Bearer owner-token": OWNER, "Bearer mate-token": MATE };

// The world: who is signed in, what the database answers, what Stripe holds.
const world = {
  env: {},
  dbCalls: [],
  checkAnswer: () => ({ ok: true, owner_id: OWNER, email: "owner@clinic.example", company: "Clinic One", job_title: "Chat agent", customer_id: null }),
  portalAnswer: () => ({ ok: true, customer_id: "cus_kept" }),
  saved: new Map(),
  stripe: [],
  prices: {
    hireflow_job_30d_v1: { id: "price_job_from_lookup", lookup_key: "hireflow_job_30d_v1", active: true, unit_amount: 9900, currency: "usd", recurring: null },
    hireflow_unlimited_monthly_v1: { id: "price_unl_from_lookup", lookup_key: "hireflow_unlimited_monthly_v1", active: true, unit_amount: 29900, currency: "usd", recurring: { interval: "month" } },
  },
  stripeDown: false,
  // billing_checkout_begin's answer, and the customer's subscriptions and earlier pages as Stripe has them.
  beginAnswer: () => ({ ok: true, claim: "c1a1a1a1-0000-4000-8000-000000000001", earlier: [] }),
  subscriptionsListed: [],
  listDown: false,
  sessions: {},
  expireRefused: false,
  sessionRefused: false,
  uiModesRefused: [],
  problems: [],
  client(url, key, opts) {
    if (key === "anon-key") {
      const auth = opts?.global?.headers?.Authorization ?? "";
      return { auth: { getUser: async () => ({ data: { user: TOKENS[auth] ? { id: TOKENS[auth] } : null } }) } };
    }
    return {
      rpc: async (fn, args) => {
        const problem = rpcArgsProblem(SIGNATURES, fn, args);
        if (problem) {
          world.problems.push(problem);
          return { data: null, error: { message: `Could not find the function: ${problem}` } };
        }
        world.dbCalls.push({ fn, args });
        if (fn === "billing_checkout_begin") return { data: world.beginAnswer(args), error: null };
        if (fn === "billing_checkout_opened" || fn === "billing_checkout_closed") return { data: null, error: null };
        if (fn === "billing_checkout_check") return { data: world.checkAnswer(args), error: null };
        if (fn === "billing_portal_check") return { data: world.portalAnswer(args), error: null };
        if (fn === "billing_save_customer") {
          const k = `${args.p_owner}:${args.p_livemode}`;
          if (!world.saved.has(k)) world.saved.set(k, args.p_customer);
          return { data: world.saved.get(k), error: null };
        }
        return { data: null, error: { message: `no stand-in for ${fn}` } };
      },
    };
  },
};
const SIGNATURES = sqlSignatures();
globalThis.__world = world;
globalThis.Deno = { env: { get: (key) => world.env[key] } };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const call = { method: init.method ?? "GET", path: u.pathname.replace(/^\/v1/, ""), query: u.search, headers: init.headers ?? {}, body: init.body ? new URLSearchParams(String(init.body)) : null };
  world.stripe.push(call);
  if (world.stripeDown) return new Response(JSON.stringify({ error: { message: "Stripe is down" } }), { status: 500 });
  if (call.method === "GET" && call.path === "/prices") {
    const key = u.searchParams.get("lookup_keys[]");
    const price = world.prices[key];
    return new Response(JSON.stringify({ object: "list", data: price ? [price] : [] }), { status: 200 });
  }
  if (call.method === "POST" && call.path === "/customers") return new Response(JSON.stringify({ id: "cus_new_1", object: "customer" }), { status: 200 });
  if (call.method === "GET" && call.path === "/subscriptions") {
    if (world.listDown) return new Response(JSON.stringify({ error: { message: "down" } }), { status: 500 });
    return new Response(JSON.stringify({ object: "list", data: world.subscriptionsListed.filter((s) => s.customer === u.searchParams.get("customer")) }), { status: 200 });
  }
  const expire = /^\/checkout\/sessions\/(cs_[A-Za-z0-9_]+)\/expire$/.exec(call.path);
  if (call.method === "POST" && expire) {
    const now = world.sessions[expire[1]];
    if (world.expireRefused || now !== "open") return new Response(JSON.stringify({ error: { message: "Only Checkout Sessions with a status in [\"open\"] can be expired." } }), { status: 400 });
    world.sessions[expire[1]] = "expired";
    return new Response(JSON.stringify({ id: expire[1], status: "expired" }), { status: 200 });
  }
  const read = /^\/checkout\/sessions\/(cs_[A-Za-z0-9_]+)$/.exec(call.path);
  if (call.method === "GET" && read) return new Response(JSON.stringify({ id: read[1], status: world.sessions[read[1]] ?? "open" }), { status: 200 });
  if (call.method === "POST" && call.path === "/checkout/sessions") {
    if (world.sessionRefused) return new Response(JSON.stringify({ error: { message: "no" } }), { status: 400 });
    const ui = call.body.get("ui_mode");
    // The account's API version knows one name for the embedded form (2026-03-25 renamed it).
    if (ui && world.uiModesRefused.includes(ui)) return new Response(JSON.stringify({ error: { type: "invalid_request_error", param: "ui_mode", message: `Invalid ui_mode: ${ui}` } }), { status: 400 });
    if (ui) return new Response(JSON.stringify({ id: "cs_test_x", url: null, client_secret: "cs_test_x_secret_abc123" }), { status: 200 });
    return new Response(JSON.stringify({ id: "cs_test_x", url: "https://checkout.stripe.com/c/pay/cs_test_x" }), { status: 200 });
  }
  if (call.method === "POST" && call.path === "/billing_portal/sessions") return new Response(JSON.stringify({ id: "bps_1", url: "https://billing.stripe.com/p/session/test_1" }), { status: 200 });
  return new Response(JSON.stringify({ error: { message: "unknown" } }), { status: 404 });
};

const checkout = await load("billing-checkout", "__checkout");
const portal = await load("billing-portal", "__portal");
const ask = async (handler, body, { token = "owner-token", origin = "https://staff.hireflownow.com", method = "POST" } = {}) => {
  const headers = { "Content-Type": "application/json", origin };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await handler(new Request("https://fn.example/x", { method, headers, body: method === "POST" ? JSON.stringify(body) : undefined }));
  return { status: res.status, body: await res.json().catch(() => null) };
};
const reset = () => {
  world.dbCalls = [];
  world.stripe = [];
};

console.log("\n1. Not set up, not signed in, not a request\n");
{
  const a = await ask(checkout, { kind: "job", jobId: JOB });
  const b = await ask(portal, {});
  check("without the Stripe secrets, both answer 503 \"billing is not set up\" and touch neither Stripe nor the database", a.status === 503 && a.body?.error === "billing is not set up" && b.status === 503 && b.body?.code === "not_set_up" && world.dbCalls.length === 0 && world.stripe.length === 0, show([a, b]));
  world.env = { STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_abc", SUPABASE_URL: "http://db.stand-in", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-key" };
  const noSign = await ask(checkout, { kind: "job", jobId: JOB }, { token: "public-anon-key" });
  const noSignPortal = await ask(portal, {}, { token: null });
  check("no sign-in (or only the site's public key): 401", noSign.status === 401 && noSignPortal.status === 401 && world.dbCalls.length === 0, show([noSign, noSignPortal]));
  const kinds = [await ask(checkout, { kind: "boost" }), await ask(checkout, { kind: "job" }), await ask(checkout, { kind: "job", jobId: "not-a-uuid" }), await ask(checkout, {}, { method: "GET" })];
  check("an unknown kind (400), a job checkout with no job (404), a GET (405)", kinds[0].status === 400 && kinds[1].status === 404 && kinds[2].status === 404 && kinds[3].status === 405 && world.stripe.length === 0, show(kinds));
}

console.log("\n2. The database says no\n");
{
  const reasons = {
    billing_off: 409,
    not_hiring_account: 403,
    exempt: 409,
    job_not_found: 404,
    already_unlimited: 409,
    unlimited_active: 409,
    job_live: 409,
    free_job_available: 409,
    email_not_verified: 409,
    business_suspended: 403,
    job_has_time: 409,
    owner_only: 403,
    unlimited_retrying: 409,
  };
  const got = {};
  for (const reason of Object.keys(reasons)) {
    world.checkAnswer = () => ({ ok: false, reason });
    reset();
    const r = await ask(checkout, { kind: "job", jobId: JOB });
    got[reason] = [r.status, r.body?.code, world.stripe.length];
  }
  check("each refusal comes back with its own status and code, and Stripe is never asked", Object.entries(reasons).every(([k, s]) => got[k][0] === s && got[k][1] === k && got[k][2] === 0), show(got));
  check("the database is asked with the caller from the sign-in, the kind, the job and the mode", show(world.dbCalls[0]?.args) === show({ p_caller: OWNER, p_kind: "job", p_job: JOB, p_livemode: false }), show(world.dbCalls[0]));
}

console.log("\n3. A checkout for a job\n");
{
  world.checkAnswer = () => ({ ok: true, owner_id: OWNER, email: "owner@clinic.example", company: "Clinic One", job_title: "Chat agent", customer_id: null });
  reset();
  const made = await ask(checkout, { kind: "job", jobId: JOB }, { token: "mate-token" });
  const priceAsk = world.stripe.find((c) => c.path === "/prices");
  const customer = world.stripe.find((c) => c.path === "/customers");
  const session = world.stripe.find((c) => c.path === "/checkout/sessions");
  const p = session?.body;
  check("the URL of Stripe's Checkout page comes back", made.status === 200 && made.body?.url === "https://checkout.stripe.com/c/pay/cs_test_x", show(made));
  check("the price is found by its lookup key, active", priceAsk && new URLSearchParams(priceAsk.query).get("lookup_keys[]") === "hireflow_job_30d_v1" && new URLSearchParams(priceAsk.query).get("active") === "true", show(priceAsk));
  check(
    "a teammate's checkout makes the OWNER's customer, once (Idempotency-Key per owner and mode), and keeps it",
    customer?.headers["Idempotency-Key"] === `hireflow-customer-${OWNER}-test` && customer.body.get("email") === "owner@clinic.example" && customer.body.get("metadata[owner_id]") === OWNER &&
      world.dbCalls.some((c) => c.fn === "billing_save_customer" && c.args.p_owner === OWNER && c.args.p_customer === "cus_new_1"),
    show([customer?.headers, customer && [...customer.body]]),
  );
  check(
    "the session: payment mode, the owner's customer, one of the lookup key's price, metadata owner/kind/job on it and its payment",
    p?.get("mode") === "payment" && p.get("customer") === "cus_new_1" && p.get("line_items[0][price]") === "price_job_from_lookup" && p.get("line_items[0][quantity]") === "1" &&
      p.get("metadata[owner_id]") === OWNER && p.get("metadata[kind]") === "job" && p.get("metadata[job_id]") === JOB &&
      p.get("payment_intent_data[metadata][owner_id]") === OWNER && p.get("payment_intent_data[metadata][job_id]") === JOB && !p.has("subscription_data[metadata][owner_id]") && p.get("client_reference_id") === OWNER,
    show(p && [...p]),
  );
  check(
    "cards only (a payment that settles days later would be taken with nothing given), made with an Idempotency-Key from the database's claim, and the page recorded on the claim",
    p?.get("payment_method_types[0]") === "card" && !p.has("payment_method_types[1]") &&
      world.stripe.find((c) => c.path === "/checkout/sessions")?.headers["Idempotency-Key"] === "hireflow-checkout-c1a1a1a1-0000-4000-8000-000000000001" &&
      show(world.dbCalls.find((c) => c.fn === "billing_checkout_begin")?.args) === show({ p_owner: OWNER, p_kind: "job", p_job: JOB, p_livemode: false }) &&
      show(world.dbCalls.find((c) => c.fn === "billing_checkout_opened")?.args) === show({ p_claim: "c1a1a1a1-0000-4000-8000-000000000001", p_session: "cs_test_x" }),
    show([p && [...p], world.dbCalls]),
  );
  check(
    "it comes back to the job on the page's own HireFlow host: paid or cancelled",
    p?.get("success_url") === `https://staff.hireflownow.com/jobs/${JOB}?billing=paid` && p.get("cancel_url") === `https://staff.hireflownow.com/jobs/${JOB}?billing=cancelled`,
    show([p?.get("success_url"), p?.get("cancel_url")]),
  );
  reset();
  world.checkAnswer = () => ({ ok: true, owner_id: OWNER, email: "owner@clinic.example", company: null, customer_id: "cus_kept" });
  await ask(checkout, { kind: "job", jobId: JOB }, { origin: "https://evil.example" });
  const again = world.stripe.find((c) => c.path === "/checkout/sessions")?.body;
  check("a customer already kept is reused (no new one), and another origin never becomes the way back", !world.stripe.some((c) => c.path === "/customers") && again?.get("customer") === "cus_kept" && again.get("success_url") === `https://hireflownow.com/jobs/${JOB}?billing=paid`, show(again && [...again]));
}

console.log("\n3b. Paying inside HireFlow (Stripe's embedded form), and an invoice for each $99 (2026-11-01)\n");
{
  world.checkAnswer = () => ({ ok: true, owner_id: OWNER, email: "owner@clinic.example", company: "Clinic One", job_title: "Chat agent\u0007 <b>", customer_id: "cus_kept" });
  // Before the publishable key is a function secret, the page's ask is Stripe's own page.
  reset();
  const keyless = await ask(checkout, { kind: "job", jobId: JOB, ui: "embedded" });
  const keylessPage = world.stripe.find((c) => c.path === "/checkout/sessions")?.body;
  world.env.STRIPE_PUBLISHABLE_KEY = "pk_live_abc";
  reset();
  const otherMode = await ask(checkout, { kind: "job", jobId: JOB, ui: "embedded" });
  check(
    "without STRIPE_PUBLISHABLE_KEY (or with one of the other mode), ui: \"embedded\" gets Stripe's hosted page, never a form the page could not open",
    keyless.status === 200 && typeof keyless.body?.url === "string" && !("clientSecret" in keyless.body) && !keylessPage?.has("ui_mode") &&
      otherMode.status === 200 && typeof otherMode.body?.url === "string" && !("clientSecret" in otherMode.body),
    show([keyless, otherMode]),
  );
  world.env.STRIPE_PUBLISHABLE_KEY = " pk_test_abc ";
  reset();
  const made = await ask(checkout, { kind: "job", jobId: JOB, ui: "embedded" });
  const sessions = world.stripe.filter((c) => c.path === "/checkout/sessions");
  const p = sessions[0]?.body;
  check(
    "with the key and ui: \"embedded\" the answer is the session's client secret and the publishable key, never a page address",
    made.status === 200 && made.body?.clientSecret === "cs_test_x_secret_abc123" && made.body?.publishableKey === "pk_test_abc" && !("url" in (made.body ?? {})),
    show(made),
  );
  check(
    "the embedded session: ui_mode embedded_page, no redirect for a card, the way back only to the job on HireFlow's own host, and no success or cancel page",
    p?.get("ui_mode") === "embedded_page" && p.get("redirect_on_completion") === "if_required" && p.get("return_url") === `https://staff.hireflownow.com/jobs/${JOB}?billing=paid` &&
      !p.has("success_url") && !p.has("cancel_url"),
    show(p && [...p]),
  );
  check(
    "…and every rule of Checkout kept: cards only, the owner's customer, the claim's Idempotency-Key, the metadata, the page recorded on the claim",
    p?.get("payment_method_types[0]") === "card" && !p.has("payment_method_types[1]") && p.get("customer") === "cus_kept" && p.get("mode") === "payment" &&
      sessions[0].headers["Idempotency-Key"] === "hireflow-checkout-c1a1a1a1-0000-4000-8000-000000000001" && p.get("metadata[owner_id]") === OWNER && p.get("metadata[job_id]") === JOB &&
      show(world.dbCalls.find((c) => c.fn === "billing_checkout_opened")?.args) === show({ p_claim: "c1a1a1a1-0000-4000-8000-000000000001", p_session: "cs_test_x" }),
    show(p && [...p]),
  );
  check(
    "each $99 payment makes an invoice saying which job it paid for (the title made plain), on the invoice and the payment",
    p?.get("invoice_creation[enabled]") === "true" && p.get("invoice_creation[invoice_data][description]") === "HireFlow: “Chat agent b” live for 30 days, unlimited applicants" &&
      p.get("payment_intent_data[description]") === p.get("invoice_creation[invoice_data][description]") && p.get("invoice_creation[invoice_data][metadata][job_id]") === JOB,
    show([p?.get("invoice_creation[invoice_data][description]")]),
  );
  reset();
  await ask(checkout, { kind: "job", jobId: JOB });
  const hosted = world.stripe.find((c) => c.path === "/checkout/sessions")?.body;
  check("without it, Stripe's hosted page as before (and its invoice too)", !hosted?.has("ui_mode") && hosted?.get("success_url") === `https://staff.hireflownow.com/jobs/${JOB}?billing=paid` && hosted.get("invoice_creation[enabled]") === "true", show(hosted && [...hosted]));

  // An account on an API version before 2026-03-25 knows "embedded", not "embedded_page".
  world.uiModesRefused = ["embedded_page"];
  reset();
  const older = await ask(checkout, { kind: "unlimited", ui: "embedded" }, { origin: "https://hireflownow.com" });
  const tries = world.stripe.filter((c) => c.path === "/checkout/sessions");
  check(
    "Stripe refusing the ui_mode name: the other name, once, with the same Idempotency-Key (a refused request is not kept for it); Unlimited's way back is Settings",
    older.status === 200 && older.body?.clientSecret === "cs_test_x_secret_abc123" && tries.length === 2 && tries[0].body.get("ui_mode") === "embedded_page" && tries[1].body.get("ui_mode") === "embedded" &&
      tries[0].headers["Idempotency-Key"] === tries[1].headers["Idempotency-Key"] && tries[1].body.get("return_url") === "https://hireflownow.com/settings?billing=unlimited" &&
      tries[1].body.get("mode") === "subscription" && !tries[1].body.has("invoice_creation[enabled]") && /Unlimited/.test(tries[1].body.get("subscription_data[description]") ?? ""),
    show([older, tries.map((t) => [...t.body])]),
  );
  world.uiModesRefused = ["embedded_page", "embedded"];
  reset();
  const neither = await ask(checkout, { kind: "job", jobId: JOB, ui: "embedded" });
  const released = world.dbCalls.filter((c) => c.fn === "billing_checkout_opened" && c.args.p_session === null).length;
  check("neither name taken: 502 and the claim let go, never a third try", neither.status === 502 && world.stripe.filter((c) => c.path === "/checkout/sessions").length === 2 && released === 1, show(neither));
  world.uiModesRefused = [];
  world.sessionRefused = true;
  reset();
  const otherRefusal = await ask(checkout, { kind: "job", jobId: JOB, ui: "embedded" });
  world.sessionRefused = false;
  check("any other refusal is not retried", otherRefusal.status === 502 && world.stripe.filter((c) => c.path === "/checkout/sessions").length === 1, show(otherRefusal));
  const pageReads = (await import(path.join(ROOT, "src/lib/billing.ts"))).billingCallOutcome(200, made.body);
  check("the answer is read by the page as the form to mount, with its key", pageReads.kind === "embedded" && pageReads.publishableKey === "pk_test_abc", show(pageReads));
  delete world.env.STRIPE_PUBLISHABLE_KEY;
  world.checkAnswer = () => ({ ok: true, owner_id: OWNER, email: "owner@clinic.example", company: "Clinic One", job_title: "Chat agent", customer_id: null });
}

console.log("\n4. Unlimited\n");
{
  world.checkAnswer = () => ({ ok: true, owner_id: OWNER, email: "owner@clinic.example", customer_id: "cus_kept" });
  reset();
  const withJob = await ask(checkout, { kind: "unlimited", jobId: JOB });
  const s1 = world.stripe.find((c) => c.path === "/checkout/sessions")?.body;
  reset();
  await ask(checkout, { kind: "unlimited" }, { origin: "https://hireflownow.com" });
  const s2 = world.stripe.find((c) => c.path === "/checkout/sessions")?.body;
  check(
    "subscription mode, cards only, the Unlimited price by its lookup key, metadata on the subscription; from the publish dialog it comes back to the job, from Settings to Settings",
    withJob.status === 200 && s1?.get("mode") === "subscription" && s1.get("payment_method_types[0]") === "card" && s1.get("line_items[0][price]") === "price_unl_from_lookup" && s1.get("subscription_data[metadata][kind]") === "unlimited" &&
      s1.get("subscription_data[metadata][job_id]") === JOB && !s1.has("payment_intent_data[metadata][owner_id]") && s1.get("success_url") === `https://staff.hireflownow.com/jobs/${JOB}?billing=unlimited` &&
      s2?.get("success_url") === "https://hireflownow.com/settings?billing=unlimited" && s2.get("cancel_url") === "https://hireflownow.com/settings?billing=cancelled" && !s2.has("metadata[job_id]"),
    show([s1 && [...s1], s2 && [...s2]]),
  );
}

console.log("\n4b. One at a time: never two Unlimited, never two pages for one job\n");
{
  const CLAIM = "c1a1a1a1-0000-4000-8000-000000000002";
  world.checkAnswer = () => ({ ok: true, owner_id: OWNER, email: "owner@clinic.example", customer_id: "cus_kept" });
  const released = () => world.dbCalls.filter((c) => c.fn === "billing_checkout_opened" && c.args.p_session === null && c.args.p_claim === CLAIM).length;
  const made = () => world.stripe.some((c) => c.path === "/checkout/sessions");

  world.beginAnswer = () => ({ ok: false, reason: "checkout_busy" });
  reset();
  const busy = await ask(checkout, { kind: "unlimited" });
  check("a second request while the first is opening its page: 409 checkout_busy, Stripe never asked", busy.status === 409 && busy.body?.code === "checkout_busy" && world.stripe.filter((c) => c.path !== "/prices").length === 0, show(busy));

  world.beginAnswer = () => ({ ok: true, claim: CLAIM, earlier: ["cs_earlier_1"] });
  world.sessions = { cs_earlier_1: "open" };
  world.subscriptionsListed = [];
  reset();
  const replaced = await ask(checkout, { kind: "unlimited" });
  const order = world.stripe.map((c) => `${c.method} ${c.path}`);
  check(
    "the earlier open page is expired in Stripe first (and recorded), then the customer's subscriptions are read, then the new page is made",
    replaced.status === 200 && world.sessions.cs_earlier_1 === "expired" &&
      order.indexOf("POST /checkout/sessions/cs_earlier_1/expire") >= 0 && order.indexOf("POST /checkout/sessions/cs_earlier_1/expire") < order.indexOf("GET /subscriptions") &&
      order.indexOf("GET /subscriptions") < order.indexOf("POST /checkout/sessions") &&
      world.dbCalls.some((c) => c.fn === "billing_checkout_closed" && c.args.p_session === "cs_earlier_1" && c.args.p_status === "expired"),
    show([replaced, order]),
  );

  for (const [status, code] of [["active", "already_unlimited"], ["trialing", "already_unlimited"], ["past_due", "unlimited_retrying"], ["unpaid", "unlimited_retrying"], ["incomplete", "unlimited_retrying"]]) {
    world.subscriptionsListed = [{ id: "sub_other", customer: "cus_kept", status: "canceled" }, { id: "sub_live", customer: "cus_kept", status }];
    world.sessions = {};
    world.beginAnswer = () => ({ ok: true, claim: CLAIM, earlier: [] });
    reset();
    const r = await ask(checkout, { kind: "unlimited" });
    check(`Stripe lists a subscription that is ${status}: 409 ${code}, no page made, the claim let go`, r.status === 409 && r.body?.code === code && !made() && released() === 1, show(r));
  }
  world.subscriptionsListed = [{ id: "sub_old", customer: "cus_kept", status: "canceled" }, { id: "sub_x", customer: "cus_kept", status: "incomplete_expired" }];
  reset();
  const fresh = await ask(checkout, { kind: "unlimited" });
  check("only ended ones (canceled, incomplete_expired): Unlimited may start again", fresh.status === 200 && made(), show(fresh));
  world.listDown = true;
  reset();
  const listDown = await ask(checkout, { kind: "unlimited" });
  world.listDown = false;
  check("Stripe not listing them: 502, no page made, the claim let go", listDown.status === 502 && !made() && released() === 1, show(listDown));
  world.checkAnswer = () => ({ ok: true, owner_id: OWNER, email: "owner@clinic.example", customer_id: null });
  world.subscriptionsListed = [{ id: "sub_live", customer: "cus_new_1", status: "active" }];
  reset();
  const newCustomer = await ask(checkout, { kind: "unlimited" });
  check("a customer made just now has no subscriptions to ask about", newCustomer.status === 200 && !world.stripe.some((c) => c.path === "/subscriptions"), show(newCustomer));

  // $99: one page per job; an earlier one already paid is left to the webhook.
  world.checkAnswer = () => ({ ok: true, owner_id: OWNER, email: "owner@clinic.example", customer_id: "cus_kept" });
  world.beginAnswer = () => ({ ok: true, claim: CLAIM, earlier: ["cs_paid_1"] });
  world.sessions = { cs_paid_1: "complete" };
  reset();
  const paidAlready = await ask(checkout, { kind: "job", jobId: JOB });
  check(
    "a job whose earlier page was paid meanwhile: 409 already_paid (it goes live in a moment), no second page, the claim let go",
    paidAlready.status === 409 && paidAlready.body?.code === "already_paid" && !made() && released() === 1 &&
      world.dbCalls.some((c) => c.fn === "billing_checkout_closed" && c.args.p_session === "cs_paid_1" && c.args.p_status === "complete") && !world.stripe.some((c) => c.path === "/subscriptions"),
    show(paidAlready),
  );
  world.sessions = { cs_paid_1: "open" };
  world.expireRefused = true;
  reset();
  const cannotExpire = await ask(checkout, { kind: "job", jobId: JOB });
  world.expireRefused = false;
  check("an earlier page Stripe will not expire and still says is open: 502, no second page, the claim let go", cannotExpire.status === 502 && !made() && released() === 1, show(cannotExpire));
  world.beginAnswer = () => ({ ok: true, claim: CLAIM, earlier: [] });
  world.sessionRefused = true;
  reset();
  const noPage = await ask(checkout, { kind: "job", jobId: JOB });
  world.sessionRefused = false;
  check("Stripe refusing the page itself: 502 and the claim let go", noPage.status === 502 && released() === 1, show(noPage));
  world.beginAnswer = () => ({ ok: true, claim: "c1a1a1a1-0000-4000-8000-000000000001", earlier: [] });
  world.sessions = {};
}

console.log("\n5. Prices that are not there, and Stripe failing\n");
{
  const saved = world.prices.hireflow_job_30d_v1;
  delete world.prices.hireflow_job_30d_v1;
  reset();
  const missing = await ask(checkout, { kind: "job", jobId: JOB });
  world.prices.hireflow_job_30d_v1 = { ...saved, recurring: { interval: "month" } };
  const wrongKind = await ask(checkout, { kind: "job", jobId: JOB });
  world.prices.hireflow_job_30d_v1 = saved;
  check("no active price with the lookup key, or a monthly one for a job: 503 \"billing is not set up\" (price_missing), no session made", missing.status === 503 && missing.body?.code === "price_missing" && wrongKind.status === 503 && !world.stripe.some((c) => c.path === "/checkout/sessions"), show([missing, wrongKind]));
  world.stripeDown = true;
  reset();
  const down = await ask(checkout, { kind: "job", jobId: JOB });
  world.stripeDown = false;
  check("Stripe failing: 502 \"not available just now\" (never \"not set up\"), no session made", down.status === 502 && down.body?.code === "stripe" && /not available just now/.test(down.body?.error ?? "") && !world.stripe.some((c) => c.path === "/checkout/sessions"), show(down));
  const sources = ["billing-checkout", "billing-portal", "billing-webhook"].map((f) => readFileSync(path.join(ROOT, "supabase/functions", f, "index.ts"), "utf8")).join("\n") + readFileSync(path.join(ROOT, "supabase/functions/_shared/stripe.ts"), "utf8");
  check("no price id is written in the functions (only lookup keys)", !/\bprice_1[A-Za-z0-9]{6,}/.test(sources) && /hireflow_job_30d_v1/.test(sources) && /hireflow_unlimited_monthly_v1/.test(sources));
}

console.log("\n6. The billing portal\n");
{
  reset();
  const ok = await ask(portal, {});
  const call = world.stripe.find((c) => c.path === "/billing_portal/sessions");
  check(
    "the owner's own customer (asked of the database with the caller from the sign-in), back to Settings on the page's host",
    ok.status === 200 && ok.body?.url === "https://billing.stripe.com/p/session/test_1" && call?.body.get("customer") === "cus_kept" &&
      call.body.get("return_url") === "https://staff.hireflownow.com/settings?billing=back" && show(world.dbCalls[0]?.args) === show({ p_caller: OWNER, p_livemode: false }),
    show([ok, call && [...call.body], world.dbCalls[0]]),
  );
  const refused = {};
  for (const reason of ["owner_only", "exempt", "no_customer"]) {
    world.portalAnswer = () => ({ ok: false, reason });
    reset();
    const r = await ask(portal, {}, { token: "mate-token" });
    refused[reason] = [r.status, r.body?.code, world.stripe.length];
  }
  check("a teammate, the exempt account and an owner who never paid are told so, Stripe never asked", refused.owner_only[0] === 403 && refused.exempt[0] === 409 && refused.no_customer[0] === 404 && Object.values(refused).every((r) => r[2] === 0), show(refused));
}

check("every database call named the SQL function's own arguments (scripts/billing_sql_signatures.mjs)", world.problems.length === 0, show(world.problems));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
