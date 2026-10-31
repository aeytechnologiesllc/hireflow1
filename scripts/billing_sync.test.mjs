#!/usr/bin/env node
/**
 * billing-sync, the function itself, against a fake Stripe and a fake
 * database (pricing v9; docs/BILLING.md; the billing review, finding 2). No
 * network.
 *
 * The hourly close never closes an Unlimited business's jobs on the
 * database's clock alone; billing-sync reads each Unlimited whose period has
 * ended or ends within a day again from Stripe first. This proves:
 *   - it answers only the scheduler: without the secret Vault keeps (asked
 *     of the database, billing_sync_secret_matches) it is 401 and reads
 *     nothing; a GET is 405; without the Stripe secrets, 503 and nothing read;
 *   - each subscription the database says is due (billing_sync_due, in the
 *     key's mode) is read from Stripe and applied as Stripe has it
 *     (billing_sync_subscription: status, period in either API shape,
 *     cancel_at_period_end, the amount);
 *   - one Stripe has no record of changes nothing and is told
 *     (billing_sync_missing); one Stripe does not answer changes nothing,
 *     and the admins are told once a day (billing_alert_admins);
 *   - { all: true } reads every one (after a webhook outage);
 *   - every database call names the SQL function's own arguments.
 *
 * The SQL is proved in launch_locks_behaviour section 33 (m).
 *
 * Run with: node scripts/billing_sync.test.mjs
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
    console.log(`FAIL  - ${name}${detail ? `\n        ${String(detail).slice(0, 700)}` : ""}`);
  }
}
const show = (v) => JSON.stringify(v);

const SIGNATURES = sqlSignatures();
const SECRET = "a".repeat(64);
const now = Math.floor(Date.now() / 1000);
const sub = (id, status, extra = {}) => ({
  id,
  object: "subscription",
  customer: "cus_A",
  status,
  cancel_at_period_end: false,
  items: { data: [{ current_period_start: now - 86400, current_period_end: now + 29 * 86400, price: { lookup_key: "hireflow_unlimited_monthly_v1", unit_amount: 29900, currency: "usd" } }] },
  ...extra,
});

const world = {
  env: {},
  due: [],
  calls: [],
  problems: [],
  stripe: new Map(),
  stripeDown: new Set(),
  asked: [],
  client(url, key) {
    return {
      rpc: async (fn, args) => {
        const problem = rpcArgsProblem(SIGNATURES, fn, args);
        if (problem) {
          world.problems.push(problem);
          return { data: null, error: { message: `Could not find the function: ${problem}` } };
        }
        world.calls.push({ fn, args, key });
        if (fn === "billing_sync_secret_matches") return { data: args.p_given === SECRET, error: null };
        if (fn === "billing_sync_due") return { data: world.due, error: null };
        if (fn === "billing_sync_subscription") return { data: { ok: true, closed: args.p_status === "canceled" ? 2 : 0 }, error: null };
        return { data: { ok: true }, error: null };
      },
    };
  },
};

const bundle = await build({
  stdin: { contents: 'import "./supabase/functions/billing-sync/index.ts";\n', resolveDir: ROOT, loader: "ts" },
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
        b.onLoad({ filter: /^serve$/, namespace: "stub" }, () => ({ contents: "export const serve = (handler) => { globalThis.__sync = handler; };", loader: "js" }));
      },
    },
  ],
});
globalThis.__world = world;
globalThis.Deno = { env: { get: (key) => world.env[key] } };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const p = u.pathname.replace(/^\/v1/, "");
  world.asked.push({ method: init.method ?? "GET", path: p, auth: init.headers?.Authorization });
  const id = /^\/subscriptions\/([^/]+)$/.exec(p)?.[1];
  if (id && world.stripeDown.has(id)) return new Response(JSON.stringify({ error: { message: "down" } }), { status: 500 });
  const found = id && world.stripe.get(decodeURIComponent(id));
  if (!found) return new Response(JSON.stringify({ error: { code: "resource_missing", message: "No such subscription" } }), { status: 404 });
  return new Response(JSON.stringify(found), { status: 200 });
};
const realError = console.error;
console.error = () => {};
await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const handler = globalThis.__sync;
const send = async ({ secret = SECRET, body = "{}", method = "POST" } = {}) => {
  const headers = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-billing-sync-secret"] = secret;
  const res = await handler(new Request("https://fn.example/billing-sync", { method, headers, body: method === "POST" ? body : undefined }));
  return { status: res.status, body: await res.json().catch(() => null) };
};
const reset = () => {
  world.calls = [];
  world.asked = [];
};

console.log("\n1. Only the scheduler, and only once billing is set up\n");
{
  world.env = { SUPABASE_URL: "http://db.stand-in", SUPABASE_SERVICE_ROLE_KEY: "service-key" };
  const none = await send({ secret: null });
  const short = await send({ secret: "x".repeat(10) });
  const wrong = await send({ secret: "b".repeat(64) });
  check(
    "no secret, a short one, or the wrong one: 401, and nothing read but the secret's own check",
    none.status === 401 && short.status === 401 && wrong.status === 401 && world.calls.every((c) => c.fn === "billing_sync_secret_matches") && world.asked.length === 0,
    show([none, short, wrong, world.calls]),
  );
  check("a GET: 405", (await send({ method: "GET" })).status === 405);
  reset();
  const unset = await send();
  check("the right secret but no Stripe secrets: 503 \"billing is not set up\", nothing read", unset.status === 503 && unset.body?.error === "billing is not set up" && !world.calls.some((c) => c.fn === "billing_sync_due") && world.asked.length === 0, show([unset, world.calls]));
}

console.log("\n2. A run\n");
{
  world.env = { ...world.env, STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_x" };
  world.due = [{ subscription: "sub_renewed", owner: "o1" }, { subscription: "sub_ended", owner: "o2" }, { subscription: "sub_gone", owner: "o3" }, { subscription: "sub_down", owner: "o4" }, { subscription: "not a sub", owner: "o5" }];
  world.stripe.set("sub_renewed", sub("sub_renewed", "active"));
  world.stripe.set("sub_ended", { ...sub("sub_ended", "canceled", { cancel_at_period_end: true }), current_period_start: now - 40 * 86400, current_period_end: now - 10 * 86400 });
  world.stripe.set("sub_down", sub("sub_down", "active"));
  world.stripeDown.add("sub_down");
  reset();
  const run = await send();
  const due = world.calls.find((c) => c.fn === "billing_sync_due");
  const applied = world.calls.filter((c) => c.fn === "billing_sync_subscription");
  const renewed = applied.find((c) => c.args.p_subscription === "sub_renewed")?.args;
  const ended = applied.find((c) => c.args.p_subscription === "sub_ended")?.args;
  check(
    "the subscriptions due in the key's mode are read from Stripe (the secret key) and applied as Stripe has them: status, period (on its items or on itself), cancel_at_period_end, amount",
    run.status === 200 && due?.args.p_livemode === true && due.args.p_all === false && applied.length === 2 &&
      renewed?.p_status === "active" && renewed.p_period_end === new Date((now + 29 * 86400) * 1000).toISOString() && renewed.p_customer === "cus_A" && renewed.p_amount === 29900 && renewed.p_livemode === true &&
      ended?.p_status === "canceled" && ended.p_period_end === new Date((now - 10 * 86400) * 1000).toISOString() && ended.p_cancel_at_period_end === true &&
      world.asked.every((a) => a.auth === "Bearer sk_live_x" && a.method === "GET") && !world.asked.some((a) => /not/.test(a.path)),
    show([run, due, applied]),
  );
  check(
    "one Stripe has no record of changes nothing and is told (billing_sync_missing); one Stripe did not answer changes nothing and the admins are told (once a day: a key)",
    world.calls.some((c) => c.fn === "billing_sync_missing" && c.args.p_subscription === "sub_gone") && !applied.some((c) => c.args.p_subscription === "sub_down" || c.args.p_subscription === "sub_gone") &&
      world.calls.some((c) => c.fn === "billing_alert_admins" && c.args.p_key === "billing:sync-failed" && /1 of 5/.test(c.args.p_message)) &&
      show(run.body) === show({ due: 5, checked: 2, missing: 1, failed: 1, closed: 2 }),
    show([run.body, world.calls.filter((c) => c.fn !== "billing_sync_subscription")]),
  );
  world.stripeDown.clear();
  world.due = [{ subscription: "sub_renewed", owner: "o1" }];
  reset();
  const all = await send({ body: JSON.stringify({ all: true }) });
  check(
    "{ all: true } (after a webhook outage) asks for every one Stripe still bills; a run that reads them all tells nobody",
    all.status === 200 && world.calls.find((c) => c.fn === "billing_sync_due")?.args.p_all === true && !world.calls.some((c) => c.fn === "billing_alert_admins"),
    show([all, world.calls]),
  );
  check("every database call is the service role's, and names the SQL function's own arguments", world.calls.every((c) => c.key === "service-key") && world.problems.length === 0, show(world.problems));
}

console.error = realError;
console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
