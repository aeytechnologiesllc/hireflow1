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
  const writer = read(`supabase/functions/${fn}/index.ts`);
  check(`${fn}: requires a signed-in user`, /const signedIn = await signedInUserId\(req\);\s*if \(!signedIn\)/.test(writer));
  // The second Phase 5 review: an applicant's account spent job-writing AI on its own budget.
  check(`${fn}: …a hiring account (its business pays), at most 40 calls an hour per account`, /const askedBy = await jobWritingBusiness\(signedIn\);\s*if \(!askedBy\)/.test(writer) && /guardAuthenticatedAiCall\("job-writing", signedIn, corsHeaders, 40, 3600\)/.test(writer));
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
check("callOpenAIChat takes from the daily budget (the business's, then the platform's) before calling", /if \(!\(await takeDailyAiBudget\(budgetUnitsFor\(messages\), business\)\)\) \{\s*throw new AiUnavailableError\("budget_reached"/.test(openai));
check("the streaming helper does too", /takeDailyAiBudget\(budgetUnitsFor\(messages\), business\)/.test(read("supabase/functions/_shared/openaiStreaming.ts")));
const flowFn = read("supabase/functions/generate-flow/index.ts");
check("generate-flow does too: a hiring account only, its business pays, 40 calls an hour per account", /const business = await jobWritingBusiness\(user\.id\);\s*if \(!business\) return json\(\{ error: "not_a_business" \}, 403\);/.test(flowFn) && /takeDailyAiBudget\(budgetUnitsForText\(JSON\.stringify\(brief \?\? \{\}\)\.length\), business\)/.test(flowFn) && /guardAuthenticatedAiCall\("job-writing", user\.id, CORS, 40, 3600\)/.test(flowFn));
const signedInTs = read("supabase/functions/_shared/signedIn.ts");
// The third Phase 5 review: the document endpoints, the plan writer per connection, empty interview answers.
for (const fn of ["ai-generate-document", "ai-analyze-document-fields"]) {
  const text = read(`supabase/functions/${fn}/index.ts`);
  check(`${fn}: a hiring account only (owner or team member), billed to its business`, /const business = await hiringBusiness\(caller\.userId\);\s*if \(!business\)/.test(text) && /\n\s*business,\n/.test(text) && !/business: caller\.userId/.test(text));
}
{
  const helper = read("supabase/functions/_shared/signedIn.ts");
  const body = helper.slice(helper.indexOf("export async function hiringBusiness"));
  check("document AI's business is the owner's own, or a teammate's who may send documents (never an applicant)", /r\.role === "employer"\)\) return userId;/.test(body) && /\.eq\("status", "active"\)\s*(\/\/[^\n]*\s*)*\.eq\("can_send_documents", true\)/.test(body) && /return typeof team\?\.employer_id === "string" \? team\.employer_id : null;/.test(body) && !/return userId;\s*\}\s*catch/.test(body));
}
// The fifth Phase 5 review: an unset permission reads as allowed (as in the app); a teammate is told why; a budget refusal reads plainly.
check("…only an explicit send-documents yes counts, as the database's document rules require (the sixth review)", !/can_send_documents\.is\.null/.test(signedInTs));
check("a teammate without the permission is told their role does not include documents", /Your team role does not include sending documents/.test(signedInTs) && ["ai-generate-document", "ai-analyze-document-fields"].every((fn) => /error: await hiringBusinessRefusal\(caller\.userId\)/.test(read(`supabase/functions/${fn}/index.ts`))));
check("a document budget refusal answers 503 with a plain sentence, and the wizard shows the server's sentence", /if \(isAiUnavailable\(error\)\)/.test(read("supabase/functions/ai-generate-document/index.ts")) && /status: 503/.test(read("supabase/functions/ai-generate-document/index.ts")) && /context\?\.clone\(\)\.json\(\)/.test(read("src/components/documents/DocumentWizard.tsx")));
check("generate-flow checks the connection before the account, so a refused request costs the account nothing", read("supabase/functions/generate-flow/index.ts").indexOf('guardPublicAiCall(req, "generate-flow"') < read("supabase/functions/generate-flow/index.ts").indexOf('guardAuthenticatedAiCall("job-writing"'));
check("the written interview bills the application's business even when its record could not be read", /const billedBusiness = serverRecord\?\.employerId\s*\?\? \(recordApplicationId && recordReader \? await employerOfApplication/.test(read("supabase/functions/ai-chat-interview/index.ts")) && !/business: serverRecord\?\.employerId \?\? null/.test(read("supabase/functions/ai-chat-interview/index.ts")));
check("no AI function speaks of credits or funds to add (nothing is paid for while billing is off)", !/add funds|credits exhausted/i.test(read("supabase/functions/ai-generate-document/index.ts")));
check("generate-flow is also limited per connection, like the other job writers", /guardPublicAiCall\(req, "generate-flow", CORS, 15, 3600\)/.test(read("supabase/functions/generate-flow/index.ts")));
check("the written interview refuses an empty answer before any model call", /if \(mode === "respond" && !\(typeof userMessage === "string" && userMessage\.trim\(\)\)\)/.test(read("supabase/functions/ai-chat-interview/index.ts")));
check("a hiring account is a business owner, or a teammate allowed to create jobs (never an applicant)", /r\.role === "employer"\)\) return userId;/.test(signedInTs) && /\.eq\("can_create_jobs", true\)/.test(signedInTs) && /return typeof team\?\.employer_id === "string" \? team\.employer_id : null;/.test(signedInTs));
const turnsCap = read("supabase/functions/_shared/rateLimit.ts");
check("the per-application day cap answers with the calm 'come back later' 503, nothing stored (not a 429)", /export const PRACTICE_TURNS_PER_APPLICATION_PER_DAY = 200;/.test(turnsCap) && /aiUnavailableResponse\(corsHeaders, \{ wait: "long", retryAfterSeconds: secondsToNextUtcDay\(\), message: AI_BUDGET_WAIT_MESSAGE, turnSaved: false \}\)/.test(turnsCap));
const prune = read("supabase/migrations/20261025210000_rate_limit_prune.sql");
check("the rate-limit table keeps two days (a day cap is not reset) and is pruned every hour", /window_start < now\(\) - interval '2 days'/.test(prune) && /cron\.schedule\('prune-rate-limits', '41 \* \* \* \*'/.test(prune));
{
  const budget = await import(path.join(ROOT, "supabase/functions/_shared/aiBudget.ts"));
  check("the budget check fails open when it has no settings (a Node run)", (await budget.takeDailyAiBudget()) === true);
// The second Phase 7 security review: one unit paid for a prompt of any size.
check("an ordinary call takes one unit", budget.budgetUnitsFor([{ content: "x".repeat(30000) }]) === 1);
check("a 1.2 MB prompt takes 30 units, not one", budget.budgetUnitsFor([{ role: "user", content: "x".repeat(1_200_000) }]) === 30);
check("each file or image adds one; text parts count their characters", budget.budgetUnitsFor([{ content: [{ type: "text", text: "hi" }, { type: "image_url" }, { type: "file" }] }]) === 3);
// The third security review: a big file costs by its size.
const pdf8mb = { type: "file", file: { filename: "a.pdf", file_data: "data:application/pdf;base64," + "A".repeat(10_700_000) } };
check("an 8 MB PDF costs about one unit a megabyte (8), not one", budget.budgetUnitsFor([{ content: [{ type: "text", text: "Review" }, pdf8mb] }]) === 1 + 1 + Math.floor(pdf8mb.file.file_data.length / 1_500_000));
check("…a small picture still costs one", budget.budgetUnitsFor([{ content: [{ type: "image_url", image_url: { url: "data:image/png;base64," + "A".repeat(50_000) } }] }]) === 2);
check("never more than 100 at once (what ai_budget_take takes)", budget.budgetUnitsForText(50_000_000) === 100);
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

// ---------------------------------------------------------------------------
// The per-business budget (20261025160000_ai_business_budget.sql; Phase 5, task 4)
console.log("\nA daily budget per business\n");
const B_OWNER = "30000000-0000-4000-8000-000000000001";
const B_SHOP = "30000000-0000-4000-8000-000000000002";
const B_CLERK = "30000000-0000-4000-8000-000000000003";
const B_OTHER = "30000000-0000-4000-8000-000000000004";
await db.exec(`
  create table public.platform_admins (user_id uuid primary key);
  create table public.team_members (employer_id uuid, user_id uuid, status text);
  create type public.notification_type as enum ('message', 'system');
  create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null, type public.notification_type not null, title text not null, message text not null, link text, is_read boolean not null default false, created_at timestamptz not null default now());
  insert into public.platform_admins values ('${B_OWNER}');
  insert into public.team_members values ('${B_SHOP}', '${B_CLERK}', 'active');
  delete from private.ai_daily_usage;
  update public.app_settings set value = '1000'::jsonb where key = 'ai_daily_call_cap';
`);
await db.exec(read("supabase/migrations/20261025160000_ai_business_budget.sql"));
await db.exec(read("supabase/migrations/20261025190000_ai_budget_count_only_taken.sql"));
await db.exec(`create table if not exists public.jobs (id uuid primary key default gen_random_uuid(), employer_id uuid, status text);`);
await db.exec(read("supabase/migrations/20261025230000_phase5_review3.sql").split("CREATE OR REPLACE FUNCTION public.admin_reply_help")[0]);
// The confirmed-email check the full day waits for (20261025240000), as a stand-in.
await db.exec(`create table if not exists public.zz_verified (user_id uuid primary key);
  create or replace function public.business_email_verified(p_user uuid) returns boolean language sql stable as $$ select exists (select 1 from public.zz_verified v where v.user_id = p_user) or exists (select 1 from public.platform_admins a where a.user_id = p_user) $$;`);
await db.exec(read("supabase/migrations/20261025240000_phase5_review4.sql"));
await db.exec(read("supabase/migrations/20261025250000_phase5_review5.sql"));
await db.exec(read("supabase/migrations/20261025270000_phase5_review6.sql"));
// The Phase 7 security audit: HireFlow's own jobs count against their own day.
await db.exec(read("supabase/migrations/20261025300000_ai_budget_own_jobs.sql"));
// The businesses the older checks below use have confirmed their email (they hire).
await db.exec(`insert into public.zz_verified values ('${B_SHOP}'), ('${B_OTHER}') on conflict do nothing;`);
const b_bcap = await db.query(`select value #>> '{}' as v from public.app_settings where key = 'ai_business_daily_call_cap'`);
check("a business's budget starts at 2,000 calls a day", b_bcap.rows[0]?.v === "2000");
await db.exec(`update public.app_settings set value = '3'::jsonb where key = 'ai_business_daily_call_cap'`);
const b_take = async (business) => (await db.query(business ? `select public.ai_budget_take(1, '${business}') as ok` : `select public.ai_budget_take() as ok`)).rows[0].ok;
const b_shop = [];
for (let i = 0; i < 3; i += 1) b_shop.push(await b_take(B_SHOP));
b_shop.push(await b_take(B_CLERK));
b_shop.push(await b_take(B_SHOP));
check("a business's calls go ahead up to its budget, then are refused", JSON.stringify(b_shop) === JSON.stringify([true, true, true, false, false]), JSON.stringify(b_shop));
check("…and a team member's calls count against the business they work for", (await db.query(`select calls from private.ai_business_daily_usage where business_id = '${B_SHOP}'`)).rows[0]?.calls === 5);
check("another business is not held back by it", (await b_take(B_OTHER)) === true);
const b_owner = [];
for (let i = 0; i < 6; i += 1) b_owner.push(await b_take(B_OWNER));
check("HireFlow's own business is not held to a business's budget (here 3)…", b_owner.every(Boolean));
check("…but its calls are counted, against its own day (the Phase 7 security audit)", (await db.query(`select calls from private.ai_business_daily_usage where business_id = '${B_OWNER}'`)).rows[0]?.calls === 6);
check("a call with no business takes only from the platform budget", (await b_take(null)) === true);
check("a refused business call does not spend the platform's budget", (await db.query(`select calls from private.ai_daily_usage`)).rows[0]?.calls === 3 + 1 + 6 + 1, String((await db.query(`select calls from private.ai_daily_usage`)).rows[0]?.calls));
const b_told = await db.query(`select title from public.notifications where user_id = '${B_OWNER}'`);
check("the owner is told once that a business reached its budget, however many calls it refuses", b_told.rows.filter((r) => /business reached its daily AI budget/.test(r.title)).length === 1, JSON.stringify(b_told.rows));
check("nobody but the platform admins is told", (await db.query(`select count(*)::int as n from public.notifications where user_id <> '${B_OWNER}'`)).rows[0].n === 0);
await db.exec(`update public.app_settings set value = '15'::jsonb where key = 'ai_daily_call_cap'`);
const b_platform = [];
for (let i = 0; i < 6; i += 1) b_platform.push(await b_take(null));
check("the platform budget still refuses past its ceiling", JSON.stringify(b_platform) === JSON.stringify([true, true, true, true, false, false]), JSON.stringify(b_platform));
// The Phase 5 review: a call the platform refused still counted against the business.
const b_otherBefore = (await db.query(`select calls from private.ai_business_daily_usage where business_id = '${B_OTHER}'`)).rows[0]?.calls;
// Three refused calls: without the refund the business would pass its cap of 3 and set off its alert.
const b_otherRefused = [await b_take(B_OTHER), await b_take(B_OTHER), await b_take(B_OTHER)];
const b_otherAfter = (await db.query(`select calls from private.ai_business_daily_usage where business_id = '${B_OTHER}'`)).rows[0]?.calls;
check("calls the platform budget refuses are refused, and the business gets each unit back", b_otherRefused.every((ok) => ok === false) && b_otherBefore === 1 && b_otherAfter === 1, `${JSON.stringify(b_otherRefused)} ${b_otherBefore} -> ${b_otherAfter}`);
check("…so it never sets off the business's own alert", (await db.query(`select count(*)::int as n from public.notifications where title like 'A business reached%' and message like '%${B_OTHER}%'`)).rows[0].n === 0);
const b_titles = (await db.query(`select title from public.notifications where user_id = '${B_OWNER}' order by created_at`)).rows.map((r) => r.title);
check("the owner is told once at 80% and once when it is used up", b_titles.filter((t) => /80% of today/.test(t)).length === 1 && b_titles.filter((t) => /budget is used up/.test(t)).length === 1, JSON.stringify(b_titles));
let b_directBlocked = false;
try {
  await db.exec(`set role authenticated; select public.ai_budget_take(1, '${B_SHOP}');`);
} catch {
  b_directBlocked = true;
} finally {
  await db.exec(`reset role;`);
}
check("a signed-in user cannot call the two-argument ai_budget_take directly", b_directBlocked);
let b_businessTableBlocked = false;
try {
  await db.exec(`set role authenticated; select * from private.ai_business_daily_usage;`);
} catch {
  b_businessTableBlocked = true;
} finally {
  await db.exec(`reset role;`);
}
check("the per-business usage is not readable over the API", b_businessTableBlocked);
check("the old one-argument function is gone (one budget function, no way round the business count)", (await db.query(`select count(*)::int as n from pg_proc where proname = 'ai_budget_take'`)).rows[0].n === 1);
// The third and fourth Phase 5 reviews: until a business confirms its sign-in email it gets a smaller day.
{
  const B_NEW = "30000000-0000-4000-8000-000000000009";
  await db.exec(`update public.app_settings set value = '100000'::jsonb where key = 'ai_daily_call_cap'; update public.app_settings set value = '2000'::jsonb where key = 'ai_business_daily_call_cap'; insert into public.app_settings (key, value) values ('ai_new_business_daily_call_cap', '2'::jsonb) on conflict (key) do update set value = excluded.value;`);
  const fresh = [await b_take(B_NEW), await b_take(B_NEW), await b_take(B_NEW)];
  check("a business that has not confirmed its email gets the smaller day (here 2), not the full 2,000", JSON.stringify(fresh) === JSON.stringify([true, true, false]), JSON.stringify(fresh));
  await db.exec(`insert into public.jobs (employer_id, status) values ('${B_NEW}', 'closed'), ('${B_NEW}', 'archived');`);
  check("…a job saved as closed or archived without publishing does not lift it (the fourth review)", (await b_take(B_NEW)) === false);
  const alert = await db.query(`select message from public.notifications where title = 'A business reached its daily AI budget' and message like '%${B_NEW}%'`);
  check("…and the owner's alert names the setting that applies (ai_new_business_daily_call_cap)", alert.rows.length === 1 && /ai_new_business_daily_call_cap/.test(alert.rows[0].message) && !/ai_business_daily_call_cap/.test(alert.rows[0].message), JSON.stringify(alert.rows));
  await db.exec(`insert into public.zz_verified values ('${B_NEW}');`);
  check("…confirming its sign-in email does (the full day)", (await b_take(B_NEW)) === true);
  // The fifth review: a business whose stamp lapsed (it changed its sign-in address) but has a job live keeps the full day.
  const B_LIVE = "30000000-0000-4000-8000-00000000000a";
  await db.exec(`insert into public.jobs (employer_id, status) values ('${B_LIVE}', 'published');`);
  const live = [await b_take(B_LIVE), await b_take(B_LIVE), await b_take(B_LIVE)];
  check("…a job live (only a confirmed business can publish one) keeps the full day after the stamp lapses", live.every(Boolean), JSON.stringify(live));
  // ...and the two alerts are told apart: one for the new-business day, one for the full day, the same day.
  const B_BOTH = "30000000-0000-4000-8000-00000000000b";
  await db.exec(`update public.app_settings set value = '3'::jsonb where key = 'ai_business_daily_call_cap';`);
  await b_take(B_BOTH); await b_take(B_BOTH); await b_take(B_BOTH);
  await db.exec(`insert into public.zz_verified values ('${B_BOTH}');`);
  await b_take(B_BOTH); await b_take(B_BOTH);
  const both = (await db.query(`select message from public.notifications where title = 'A business reached its daily AI budget' and message like '%${B_BOTH}%'`)).rows;
  check("…a business that hits the small day, confirms and hits the full day is reported twice, once for each", both.length === 2 && both.some((r) => /before confirming/.test(r.message)) && both.some((r) => !/before confirming/.test(r.message)), JSON.stringify(both));
  const B_CAPPED = "30000000-0000-4000-8000-00000000000c";
  await db.exec(`update public.app_settings set value = '1'::jsonb where key = 'ai_business_daily_call_cap'; update public.app_settings set value = '5'::jsonb where key = 'ai_new_business_daily_call_cap';`);
  await b_take(B_CAPPED); await b_take(B_CAPPED);
  const capped = (await db.query(`select message from public.notifications where message like '%${B_CAPPED}%'`)).rows[0]?.message ?? "";
  check("…and when the business cap is the lower one, it is simply the full day (no 'confirm first' alert), naming ai_business_daily_call_cap", /Raise ai_business_daily_call_cap/.test(capped) && !/before confirming/.test(capped), capped);
  // The sixth review: equal caps are no new-business day either.
  const B_EQUAL = "30000000-0000-4000-8000-00000000000d";
  await db.exec(`update public.app_settings set value = '2'::jsonb where key = 'ai_business_daily_call_cap'; update public.app_settings set value = '2'::jsonb where key = 'ai_new_business_daily_call_cap';`);
  await b_take(B_EQUAL); await b_take(B_EQUAL); await b_take(B_EQUAL);
  const equal = (await db.query(`select message from public.notifications where message like '%${B_EQUAL}%'`)).rows.map((r) => r.message);
  check("…equal caps: one full-day alert, never 'confirm for the full day'", equal.length === 1 && !/before confirming/.test(equal[0]), JSON.stringify(equal));
  const owner = [await b_take(B_OWNER), await b_take(B_OWNER), await b_take(B_OWNER)];
  check("…HireFlow's own business is held to neither the business nor the new-business day", owner.every(Boolean));
  // The Phase 7 security audit: one job's applicants could take the platform's whole day.
  check("HireFlow's own jobs start with 6,000 calls a day of their own", (await db.query(`select value #>> '{}' as v from public.app_settings where key = 'ai_platform_business_daily_call_cap'`)).rows[0]?.v === "6000");
  const ownUsed = (await db.query(`select calls from private.ai_business_daily_usage where business_id = '${B_OWNER}' and day = (now() at time zone 'utc')::date`)).rows[0].calls;
  await db.exec(`update public.app_settings set value = '${ownUsed + 2}'::jsonb where key = 'ai_platform_business_daily_call_cap';`);
  const platformBefore = (await db.query(`select calls from private.ai_daily_usage`)).rows[0].calls;
  const ownDay = [await b_take(B_OWNER), await b_take(B_OWNER), await b_take(B_OWNER), await b_take(B_OWNER)];
  check("…refused past them, so the rest of the platform's day stays for everyone else", JSON.stringify(ownDay) === JSON.stringify([true, true, false, false]) && (await db.query(`select calls from private.ai_daily_usage`)).rows[0].calls === platformBefore + 2, JSON.stringify(ownDay));
  check("…while another business still goes ahead", (await b_take(B_OTHER)) === true);
  const ownAlert = (await db.query(`select title, message from public.notifications where title like 'HireFlow''s own jobs%'`)).rows;
  check("…and the owner is told once, naming ai_platform_business_daily_call_cap", ownAlert.length === 1 && /ai_platform_business_daily_call_cap/.test(ownAlert[0].message) && /other businesses are not held back/.test(ownAlert[0].message), JSON.stringify(ownAlert));
}
// The second Phase 7 product audit: the business is told too, once a day.
{
  await db.exec(read("supabase/migrations/20261025380000_ai_budget_tell_business.sql"));
  const B_TOLD = "30000000-0000-4000-8000-00000000000e";
  await db.exec(`insert into public.zz_verified values ('${B_TOLD}') on conflict do nothing; update public.app_settings set value = '2'::jsonb where key = 'ai_business_daily_call_cap'; update public.app_settings set value = '100000'::jsonb where key = 'ai_daily_call_cap';`);
  const told = [await b_take(B_TOLD), await b_take(B_TOLD), await b_take(B_TOLD), await b_take(B_TOLD)];
  const cards = (await db.query(`select title, message from public.notifications where user_id = '${B_TOLD}'`)).rows;
  check("a business past its day is told in its own bell, once, that its applicants' tests wait until midnight UTC", JSON.stringify(told) === JSON.stringify([true, true, false, false]) && cards.length === 1 && /paused until tomorrow/.test(cards[0].title) && /place is kept/.test(cards[0].message), JSON.stringify({ told, cards }));
  await db.exec(`update public.app_settings set value = '2'::jsonb where key = 'ai_platform_business_daily_call_cap'`);
  for (let i = 0; i < 4; i += 1) await b_take(B_OWNER);
  check("…HireFlow's own business gets no such card (its admins are told)", (await db.query(`select count(*)::int as n from public.notifications where user_id = '${B_OWNER}' and title like 'Applicants%'`)).rows[0].n === 0);
}
// The eighth Phase 5 review: a new business is told that confirming its email
// gives the full day, and no card counts "calls" (the allowance is units).
{
  const v8 = read("supabase/migrations/20261025410000_phase5_review8.sql");
  await db.exec(v8);
  await db.exec(v8);
  const B_NEW8 = "30000000-0000-4000-8000-00000000000f";
  const B_FULL8 = "30000000-0000-4000-8000-000000000010";
  await db.exec(`insert into public.zz_verified values ('${B_FULL8}') on conflict do nothing; update public.app_settings set value = '3'::jsonb where key = 'ai_business_daily_call_cap'; update public.app_settings set value = '1'::jsonb where key = 'ai_new_business_daily_call_cap';`);
  const newDay = [await b_take(B_NEW8), await b_take(B_NEW8), await b_take(B_NEW8)];
  const newCards = (await db.query(`select title, message, link from public.notifications where user_id = '${B_NEW8}'`)).rows;
  check("a new business past its smaller day is told, once, that confirming its email gives the full allowance at once", JSON.stringify(newDay) === JSON.stringify([true, false, false]) && newCards.length === 1 && /new accounts/.test(newCards[0].title) && /Confirm your email/.test(newCards[0].message) && /6-digit code/.test(newCards[0].message) && !/paused until tomorrow/.test(newCards[0].title), JSON.stringify(newCards));
  for (let i = 0; i < 5; i += 1) await b_take(B_FULL8);
  const fullCards = (await db.query(`select title, message from public.notifications where user_id = '${B_FULL8}'`)).rows;
  check("…a confirmed business gets the paused-until-tomorrow card", fullCards.length === 1 && /paused until tomorrow/.test(fullCards[0].title) && /place is kept/.test(fullCards[0].message), JSON.stringify(fullCards));
  check("…and neither card counts \"calls\"", ![...newCards, ...fullCards].some((c) => /calls/.test(c.message)));
}
// The ninth Phase 5 review: refusals give their units back, the two cards are
// told apart, and the admins' alerts count units.
{
  const v9 = read("supabase/migrations/20261025450000_phase5_review9.sql");
  await db.exec(v9);
  await db.exec(v9);
  const B_NINE = "30000000-0000-4000-8000-000000000011";
  await db.exec(`update public.app_settings set value = '2'::jsonb where key = 'ai_business_daily_call_cap'; update public.app_settings set value = '1'::jsonb where key = 'ai_new_business_daily_call_cap';`);
  const first = [await b_take(B_NINE), await b_take(B_NINE), await b_take(B_NINE)];
  const used = (await db.query(`select calls from private.ai_business_daily_usage where business_id = '${B_NINE}' and day = (now() at time zone 'utc')::date`)).rows[0].calls;
  check("refused calls give their units back (one allowed on the new-account day, two refused, one used)", JSON.stringify(first) === JSON.stringify([true, false, false]) && used === 1, JSON.stringify({ first, used }));
  await db.exec(`insert into public.zz_verified values ('${B_NINE}') on conflict do nothing`);
  const after = [await b_take(B_NINE), await b_take(B_NINE)];
  check("…so confirming the email gives the full day at once (one more of two)", JSON.stringify(after) === JSON.stringify([true, false]), JSON.stringify(after));
  const cards = (await db.query(`select title from public.notifications where user_id = '${B_NINE}' order by created_at`)).rows.map((r) => r.title);
  check("…and the new-account card and the full-day card both reach the business the same day", cards.length === 2 && /new accounts/.test(cards[0]) && /paused until tomorrow/.test(cards[1]), JSON.stringify(cards));
  const adminTexts = (await db.query(`select message from public.notifications where message like '%${B_NINE}%'`)).rows.map((r) => r.message);
  check("…the admins' alerts count units, not calls", adminTexts.length > 0 && adminTexts.every((m) => /AI units/.test(m) && !/AI calls/.test(m)), JSON.stringify(adminTexts));
}
const b_aiBudgetTs = read("supabase/functions/_shared/aiBudget.ts");
check("the helper sends the business only when it is a uuid", /UUID\.test\(business\) \? \{ p_calls: calls, p_business: business \} : \{ p_calls: calls \}/.test(b_aiBudgetTs));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
