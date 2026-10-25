#!/usr/bin/env node
/**
 * The public AI endpoints only spend money for the people they serve
 * (docs/LAUNCH-PLAN.md, Phase 1, task 3).
 *
 *   - _shared/practiceTurnGuard.ts: a practice turn needs an application, a
 *     signed-in caller, and that caller must be the application's applicant;
 *     every field has a size;
 *   - _shared/rateLimit.ts callerId counts by CF-Connecting-IP (Cloudflare
 *     sets it; the first X-Forwarded-For entry is whatever the caller wrote);
 *   - the job-writing functions require a signed-in user;
 *   - every OpenAI call takes one unit from the platform's daily budget, and
 *     public.ai_budget_take() refuses past the ceiling (PGlite).
 *
 * Run with: node scripts/ai_endpoint_limits.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const guard = await import(path.join(ROOT, "supabase/functions/_shared/practiceTurnGuard.ts"));
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

const APP = "30000000-0000-4000-8000-000000000008";
const ME = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000099";
const target = { applicationId: APP, stepId: "wf-chatsim" };
const owner = async (id) => (id === APP ? ME : null);

// ---- who may take a turn ---------------------------------------------------
let v = await guard.practiceTurnVerdict({ target: null, userId: ME, loadCandidateId: owner });
check("no application: refused 400", !v.ok && v.status === 400 && v.code === "application_required");
v = await guard.practiceTurnVerdict({ target, userId: null, loadCandidateId: owner });
check("nobody signed in: refused 401", !v.ok && v.status === 401 && v.code === "sign_in_required");
v = await guard.practiceTurnVerdict({ target, userId: OTHER, loadCandidateId: owner });
check("someone else's application: refused 403", !v.ok && v.status === 403);
v = await guard.practiceTurnVerdict({ target: { applicationId: "30000000-0000-4000-8000-000000000000", stepId: "x" }, userId: ME, loadCandidateId: owner });
check("an application that does not exist: refused", !v.ok && v.status === 403);
v = await guard.practiceTurnVerdict({ target, userId: ME, loadCandidateId: async () => { throw new Error("db down"); } });
check("a lookup that fails is a refusal, never a pass", !v.ok);
v = await guard.practiceTurnVerdict({ target, userId: ME, loadCandidateId: owner });
check("the applicant's own application: served", v.ok);
check("refusal messages never say AI or Ava", !/\bAI\b|Ava/.test(JSON.stringify([
  await guard.practiceTurnVerdict({ target: null, userId: ME, loadCandidateId: owner }),
  await guard.practiceTurnVerdict({ target, userId: null, loadCandidateId: owner }),
  await guard.practiceTurnVerdict({ target, userId: OTHER, loadCandidateId: owner }),
])));

// ---- sizes -----------------------------------------------------------------
const normal = { scenario: "x".repeat(1500), customerName: "Alex", messages: [{ role: "user", content: "Hi" }], agentMessage: "Hello" };
check("a normal turn is not oversized", guard.oversizedPracticeField(normal) === null);
check("a huge scenario is refused", guard.oversizedPracticeField({ ...normal, scenario: "x".repeat(7000) }) === "scenario");
check("a huge reply is refused", guard.oversizedPracticeField({ ...normal, agentMessage: "x".repeat(5000) }) === "agentMessage");
check("too many history messages are refused", guard.oversizedPracticeField({ ...normal, messages: Array.from({ length: 81 }, () => ({ role: "user", content: "a" })) }) === "messages");
check("a huge history message is refused", guard.oversizedPracticeField({ ...normal, messages: [{ role: "user", content: "x".repeat(4100) }] }) === "messages");
check("a non-string history message is refused", guard.oversizedPracticeField({ ...normal, messages: [{ role: "user", content: { a: 1 } }] }) === "messages");
check("messages that are not a list are refused", guard.oversizedPracticeField({ ...normal, messages: "lots" }) === "messages");

// ---- the functions use it ---------------------------------------------------
for (const fn of ["ai-chat-simulation", "ai-chat-interview", "ai-sales-simulation"]) {
  const src = read(`supabase/functions/${fn}/index.ts`);
  check(`${fn}: checks the body size before reading it`, /MAX_PRACTICE_BODY_BYTES/.test(src));
  check(`${fn}: refuses oversized fields`, /oversizedPracticeField\(request\)/.test(src));
  check(`${fn}: serves a turn only for the applicant's own application`, /practiceTurnVerdict\(\{/.test(src) && /candidateIdLoader\(/.test(src));
}
for (const fn of ["ai-generate-job-content", "ai-generate-workflow"]) {
  check(`${fn}: requires a signed-in user`, /if \(!\(await signedInUserId\(req\)\)\)/.test(read(`supabase/functions/${fn}/index.ts`)));
}

// ---- who is counted ----------------------------------------------------------
const rl = read("supabase/functions/_shared/rateLimit.ts");
const callerFn = rl.slice(rl.indexOf("export function callerId"), rl.indexOf("export async function checkRateLimit"));
check("the limiter counts by CF-Connecting-IP first", callerFn.indexOf("cf-connecting-ip") > -1 && callerFn.indexOf("cf-connecting-ip") < callerFn.indexOf("x-forwarded-for"));
{
  // Run the real function against made-up requests (it reads only headers).
  const body = callerFn.replace(/^export function callerId\(req: Request\): string \{/, "").replace(/\}\s*$/, "");
  const callerId = new Function("req", body.replace(/\?\.trim\(\)/g, "?.trim()"));
  const req = (h) => ({ headers: { get: (k) => h[k.toLowerCase()] ?? null } });
  check("a spoofed X-Forwarded-For does not change who is counted", callerId(req({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9, 3.2.52.20" })) === "1.2.3.4");
  check("…and two spoofed values still count as one caller", callerId(req({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "8.8.8.8" })) === callerId(req({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "7.7.7.7" })));
  check("without Cloudflare's header it falls back", callerId(req({ "x-forwarded-for": "5.5.5.5, 3.2.52.20" })) === "5.5.5.5");
}

// ---- the daily budget ---------------------------------------------------------
const openai = read("supabase/functions/_shared/openai.ts");
check("callOpenAIChat takes from the daily budget before calling", /if \(!\(await takeDailyAiBudget\(\)\)\) \{\s*throw new AiUnavailableError\("budget_reached"/.test(openai));
check("the streaming helper does too", /takeDailyAiBudget\(\)/.test(read("supabase/functions/_shared/openaiStreaming.ts")));
check("generate-flow does too", /takeDailyAiBudget\(\)/.test(read("supabase/functions/generate-flow/index.ts")));
{
  const budget = await import(path.join(ROOT, "supabase/functions/_shared/aiBudget.ts"));
  check("the budget check fails open when it has no settings (a Node run)", (await budget.takeDailyAiBudget()) === true);
}

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  grant anon, authenticated, service_role to postgres;
  create table public.app_settings (key text primary key, value jsonb not null);
`);
await db.exec(read("supabase/migrations/20261025020000_ai_daily_budget.sql"));
const cap = await db.query(`select value #>> '{}' as v from public.app_settings where key = 'ai_daily_call_cap'`);
check("the ceiling starts at 10,000 calls a day", cap.rows[0]?.v === "10000");
await db.exec(`update public.app_settings set value = '3'::jsonb where key = 'ai_daily_call_cap'`);
const takes = [];
for (let i = 0; i < 5; i += 1) takes.push((await db.query(`select public.ai_budget_take() as ok`)).rows[0].ok);
check("calls go ahead up to the ceiling, then are refused", JSON.stringify(takes) === JSON.stringify([true, true, true, false, false]), JSON.stringify(takes));
const usage = await db.query(`select calls, refused from private.ai_daily_usage`);
check("today's usage records calls and refusals", usage.rows[0]?.calls === 5 && usage.rows[0]?.refused === 2);
let anonBlocked = false;
try {
  await db.exec(`set role authenticated; select public.ai_budget_take();`);
} catch {
  anonBlocked = true;
} finally {
  await db.exec(`reset role;`);
}
check("a signed-in user cannot call ai_budget_take directly", anonBlocked);
let tableBlocked = false;
try {
  await db.exec(`set role anon; select * from private.ai_daily_usage;`);
} catch {
  tableBlocked = true;
} finally {
  await db.exec(`reset role;`);
}
check("the usage table is not readable over the API", tableBlocked);

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
