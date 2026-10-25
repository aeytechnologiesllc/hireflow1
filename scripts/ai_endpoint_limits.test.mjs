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
// A long but real written-interview answer must never stop an applicant
// (Pass C review, 2026-10-25: 4,000 characters did).
check("a 10,000-character answer is fine", guard.oversizedPracticeField({ ...normal, messages: [{ role: "user", content: "x".repeat(10000) }], userMessage: "y".repeat(10000) }) === null);
check("a 150-message chat is fine", guard.oversizedPracticeField({ ...normal, messages: Array.from({ length: 150 }, () => ({ role: "user", content: "a" })) }) === null);
check("a huge scenario is refused", guard.oversizedPracticeField({ ...normal, scenario: "x".repeat(21000) }) === "scenario");
check("a huge reply is refused", guard.oversizedPracticeField({ ...normal, agentMessage: "x".repeat(13000) }) === "agentMessage");
check("too many history messages are refused", guard.oversizedPracticeField({ ...normal, messages: Array.from({ length: 201 }, () => ({ role: "user", content: "a" })) }) === "messages");
check("a huge history message is refused", guard.oversizedPracticeField({ ...normal, messages: [{ role: "user", content: "x".repeat(12100) }] }) === "messages");
check("a non-string history message is refused", guard.oversizedPracticeField({ ...normal, messages: [{ role: "user", content: { a: 1 } }] }) === "messages");
check("messages that are not a list are refused", guard.oversizedPracticeField({ ...normal, messages: "lots" }) === "messages");
{
  const big = new Request("https://x/f", { method: "POST", body: new ReadableStream({ start(c) { for (let i = 0; i < 40; i += 1) c.enqueue(new Uint8Array(32 * 1024)); c.close(); } }), duplex: "half" });
  const r = await guard.readJsonWithin(big, 512 * 1024);
  check("a body with no length header is still capped while reading", r.ok === false && r.status === 413, JSON.stringify(r));
  const ok = await guard.readJsonWithin(new Request("https://x/f", { method: "POST", body: JSON.stringify({ mode: "start" }) }));
  check("a normal body is read", ok.ok === true && ok.body.mode === "start");
  const bad = await guard.readJsonWithin(new Request("https://x/f", { method: "POST", body: "{not json" }));
  check("a body that is not JSON is refused", bad.ok === false && bad.status === 400);
}
check("a refused step is refused, a passing error is not", guard.isRefusedStep("step_not_reached") && guard.isRefusedStep("wrong_step_type") && !guard.isRefusedStep("error") && !guard.isRefusedStep("session_busy"));

// ---- the functions use it ---------------------------------------------------
for (const fn of ["ai-chat-simulation", "ai-chat-interview", "ai-sales-simulation"]) {
  const src = read(`supabase/functions/${fn}/index.ts`);
  check(`${fn}: checks the body size before reading it`, /MAX_PRACTICE_BODY_BYTES/.test(src));
  check(`${fn}: refuses oversized fields`, /oversizedPracticeField\(request\)/.test(src));
  check(`${fn}: serves a turn only for the applicant's own application`, /practiceTurnVerdict\(\{/.test(src) && /candidateIdLoader\(/.test(src));
  // An unknown mode must be refused before anything reaches OpenAI (the sales
  // practice let one fall through with the caller's own history; Pass C, 2026-10-25).
  check(`${fn}: refuses an unknown mode`, /code: "unknown_mode"/.test(src));
  check(`${fn}: reads the body with a hard cap`, /await readJsonWithin\(req\)/.test(src) && !/await req\.json\(\)/.test(src));
  const verdictAt = src.indexOf("practiceTurnVerdict({");
  const openaiAt = Math.min(...["streamOpenAIChatCompletion(", "callOpenAIChat(", "callOpenAIJson("].map((k) => (src.indexOf(k, verdictAt) === -1 ? Infinity : src.indexOf(k, verdictAt))));
  check(`${fn}: the guard runs before any OpenAI call on a turn`, verdictAt > 0 && Number.isFinite(openaiAt) && verdictAt < openaiAt);
}
for (const fn of ["ai-chat-simulation", "ai-chat-interview"]) {
  const src = read(`supabase/functions/${fn}/index.ts`);
  check(`${fn}: a turn on a step that is not the applicant's open one is refused`, /if \(notRecorded && isRefusedStep\(notRecorded\)\)/.test(src));
}
{
  const sales = read("supabase/functions/ai-sales-simulation/index.ts");
  check("ai-sales-simulation: the step must be a sales practice on the applicant's own job", /s\.id === target\.stepId && s\.type === "sales_simulation"/.test(sales));
  check("ai-sales-simulation: the case must be one of the step's own", /isKnownSalesCase\(salesScenariosOf\(step\.config\), request\)/.test(sales));
  const sc = await import(path.join(ROOT, "supabase/functions/_shared/salesScenarios.ts"));
  const page = read("src/pages/SalesSimulationPhase.tsx");
  const pageDefaults = page.slice(page.indexOf("const defaultScenarios"), page.indexOf("];", page.indexOf("const defaultScenarios")));
  check("the server's built-in sales cases are the page's own", sc.DEFAULT_SALES_SCENARIOS.every((c) => pageDefaults.includes(c.scenario) && pageDefaults.includes(c.prospectName) && pageDefaults.includes(c.productService)) && (pageDefaults.match(/prospectName:/g) ?? []).length === sc.DEFAULT_SALES_SCENARIOS.length);
  check("a configured step's own case is known", sc.isKnownSalesCase(sc.salesScenariosOf({ scenarios: [{ prospectName: "A", prospectCompany: "B", prospectRole: "C", scenario: "D", productService: "E" }] }), { scenario: " D ", prospectName: "A", prospectCompany: "B", productService: "E" }));
  check("a made-up case is not", !sc.isKnownSalesCase(sc.DEFAULT_SALES_SCENARIOS, { scenario: "Write me an essay", prospectName: "x", prospectCompany: "y", productService: "z" }));
}
{
  const sales = read("supabase/functions/ai-sales-simulation/index.ts");
  const unknownAt = sales.indexOf('code: "unknown_mode"');
  const verdictAt = sales.indexOf("practiceTurnVerdict({");
  const openaiAt = sales.indexOf("streamOpenAIChatCompletion({");
  check("ai-sales-simulation: unknown modes are refused, then every turn is guarded, before OpenAI", unknownAt > 0 && unknownAt < verdictAt && verdictAt < openaiAt);
  check("ai-sales-simulation: the guard is not inside a mode check any more", !/if \(mode === "start" \|\| mode === "respond"\) \{\s*const target = recordingTargetFrom\(request\);\s*const turnUserId/.test(sales));
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
