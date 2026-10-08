#!/usr/bin/env node
/**
 * Who may make send-notification-email send what, to whom
 * (docs/NOTIFICATION-EMAILS.md; supabase/functions/_shared/notificationAccess.ts).
 *
 * Until 2026-10-07 the function sent whatever it was asked: the kind of
 * email, the recipient's user id and every word came from the request, and
 * the request needed only the site's public key. Anyone could have the hiring
 * address send any user a "You've got the job" signed with any company name.
 *
 * Two halves:
 *
 *   A. The rules, as plain functions: every kind of email the function knows
 *      has an owner; who may ask for each; what the email may say.
 *
 *   B. The function itself. Its real index.ts is bundled with its three
 *      outside modules replaced by stand-ins (the HTTP server, the mail
 *      client, the database client) and driven request by request against a
 *      small world: an owner, another employer, team members with and without
 *      each permission, applicants, a signed-in stranger, and nobody. No
 *      network, no email. It proves the things that must stay true:
 *        - nobody without a real sign-in gets any email sent, of any kind;
 *        - nobody can send themself, or anyone else, a decision they are not
 *          the hiring team for (the "You've got the job" forgery);
 *        - who signs an email, the names in it and (for an applicant) the job
 *          are looked up, whatever the request said;
 *        - every legitimate sender still gets their email sent;
 *        - the system's own callers (the service key) are served as before.
 *
 * Run with: node scripts/notification_access.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import * as A from "../supabase/functions/_shared/notificationAccess.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}
const show = (v) => JSON.stringify(v);
const src = (rel) => readFile(path.join(ROOT, rel), "utf8");
const code = (text) => text.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── The world ─────────────────────────────────────────────────────────── */

const id = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const OWNER = id(1); // owns JOB_A and JOB_B; "Zulu Support Team"
const RIVAL = id(2); // another employer; owns JOB_X
const TEAM_ALL = id(11); // OWNER's team: every permission, every job
const TEAM_VIEW = id(12); // OWNER's team: no permission at all
const TEAM_JOB_B = id(13); // OWNER's team: every permission, JOB_B only
const TEAM_GONE = id(14); // OWNER's team once: no longer active
const ANA = id(21); // applied to JOB_A, then JOB_B
const BEN = id(22); // applied to JOB_B
const CAT = id(23); // applied to RIVAL's JOB_X only
const STRANGER = id(31); // signed in, applied to nothing
const NOBODY_HERE = id(99); // not a user at all
const JOB_A = id(101);
const JOB_B = id(102);
const JOB_X = id(103);
const TITLE_A = "Chat Support Team Leader (Zulu Royal & Zulu Rush)";
const TITLE_B = "Night Shift Agent";
const TITLE_X = "Rival Role";
const SERVICE_KEY = "service-key-of-this-project";

function freshWorld() {
  const person = (user_id, email, full_name, company_name = null) => ({
    user_id, email, full_name, company_name,
    email_notifications_enabled: true, email_new_applications: true, email_messages: true,
    email_interview_reminders: true, email_document_updates: true, email_phase_updates: true, email_voice_minutes: true,
  });
  return {
    tokens: {
      "tok-owner": OWNER, "tok-rival": RIVAL, "tok-team-all": TEAM_ALL, "tok-team-view": TEAM_VIEW,
      "tok-team-job-b": TEAM_JOB_B, "tok-team-gone": TEAM_GONE, "tok-ana": ANA, "tok-ben": BEN, "tok-cat": CAT, "tok-stranger": STRANGER,
    },
    profiles: [
      person(OWNER, "owner@zulu.example", "Zack Owner", "Zulu Support Team"),
      person(RIVAL, "boss@rival.example", "Rival Boss", "Rival Co"),
      person(TEAM_ALL, "all@zulu.example", "Tess Team"),
      person(TEAM_VIEW, "view@zulu.example", "Vic Viewer"),
      person(TEAM_JOB_B, "jobb@zulu.example", "Jo Limited"),
      person(TEAM_GONE, "gone@zulu.example", "Gil Gone"),
      person(ANA, "ana@example.com", "Ana Reyes"),
      person(BEN, "ben@example.com", "Ben Cruz"),
      person(CAT, "cat@example.com", "Cat Lim"),
      person(STRANGER, "stranger@example.com", "Sam Stranger"),
    ],
    jobs: [
      { id: JOB_A, title: TITLE_A, employer_id: OWNER },
      { id: JOB_B, title: TITLE_B, employer_id: OWNER },
      { id: JOB_X, title: TITLE_X, employer_id: RIVAL },
    ],
    applications: [
      { id: id(201), candidate_id: ANA, job_id: JOB_A, status: "reviewing", created_at: "2026-10-05T10:00:00Z" },
      { id: id(202), candidate_id: ANA, job_id: JOB_B, status: "reviewing", created_at: "2026-10-06T10:00:00Z" },
      { id: id(203), candidate_id: BEN, job_id: JOB_B, status: "reviewing", created_at: "2026-10-06T11:00:00Z" },
      { id: id(204), candidate_id: CAT, job_id: JOB_X, status: "reviewing", created_at: "2026-10-06T12:00:00Z" },
    ],
    team_members: [
      { user_id: TEAM_ALL, employer_id: OWNER, status: "active", assigned_job_ids: [], can_manage_pipeline: true, can_schedule_interviews: true, can_send_documents: true, can_message_candidates: true },
      { user_id: TEAM_VIEW, employer_id: OWNER, status: "active", assigned_job_ids: [], can_manage_pipeline: false, can_schedule_interviews: false, can_send_documents: false, can_message_candidates: false },
      { user_id: TEAM_JOB_B, employer_id: OWNER, status: "active", assigned_job_ids: [JOB_B], can_manage_pipeline: true, can_schedule_interviews: true, can_send_documents: true, can_message_candidates: true },
      { user_id: TEAM_GONE, employer_id: OWNER, status: "revoked", assigned_job_ids: [], can_manage_pipeline: true, can_schedule_interviews: true, can_send_documents: true, can_message_candidates: true },
    ],
    user_roles: [{ user_id: OWNER, role: "employer" }, { user_id: RIVAL, role: "employer" }, { user_id: ANA, role: "candidate" }],
    sent: [],
    counters: new Map(),
    limiterDown: false,
    databaseDown: false,
    providerRefuses: false,
    outside: [],
  };
}

/* ══ A. The rules ══════════════════════════════════════════════════════ */

console.log("\nA. The rules\n");
const fn = await src("supabase/functions/send-notification-email/index.ts");
{
  const union = /type NotificationType =([\s\S]*?);/.exec(fn)?.[1] ?? "";
  const kinds = [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  check("the function names its kinds of email", kinds.length >= 21 && kinds.includes("status_hired") && kinds.includes("continue_on_computer"), `${kinds.length}`);
  const ruled = Object.keys(A.NOTIFICATION_RULES);
  check("every kind has an owner (a new kind fails here until it is given a rule)", kinds.every((k) => ruled.includes(k)), kinds.filter((k) => !ruled.includes(k)).join(", "));
  check("no rule is for a kind that is gone", ruled.every((k) => kinds.includes(k)), ruled.filter((k) => !kinds.includes(k)).join(", "));

  const who = (k) => A.NOTIFICATION_RULES[k]?.who;
  check("the system's own alerts are the system's only", ["document_signed", "reschedule_requested", "voice_minutes_low", "voice_minutes_exhausted", "interview_ready", "interview_reminder", "steps_reopened", "interview_confirmed", "interview_time_picked"].every((k) => who(k) === "service"));
  check("a decision or a phase move is the hiring team's, and needs the pipeline permission", ["status_rejected", "status_hired", "phase_advanced"].every((k) => who(k) === "staff" && A.NOTIFICATION_RULES[k].permission === "can_manage_pipeline"));
  check("interview emails need the scheduling permission", ["interview_scheduled", "interview_pick_time", "interview_cancelled", "interview_rescheduled"].every((k) => who(k) === "staff" && A.NOTIFICATION_RULES[k].permission === "can_schedule_interviews"));
  check("document emails need the documents permission", ["document_sent", "document_requested"].every((k) => who(k) === "staff" && A.NOTIFICATION_RULES[k].permission === "can_send_documents"));
  check("an applicant's own: received (to themself), new application and phase completed (to the job's owner)", who("application_received") === "self" && who("new_application") === "applicant" && who("phase_completed") === "applicant");
  check("a message goes either way; 'Email me the link' keeps its own gate", who("new_message") === "message" && who("continue_on_computer") === "own-gate");

  // staffLinks mirrors the database's write policies.
  const apps = [
    { id: "a1", job_id: JOB_A, job_title: TITLE_A, employer_id: OWNER },
    { id: "a2", job_id: JOB_B, job_title: TITLE_B, employer_id: OWNER },
    { id: "a3", job_id: JOB_X, job_title: TITLE_X, employer_id: RIVAL },
  ];
  const tm = (over = {}) => ({ employer_id: OWNER, assigned_job_ids: [], can_manage_pipeline: true, ...over });
  check("the job's owner is the hiring team for their own jobs, with no permission needed", show(A.staffLinks(OWNER, [], apps, "can_manage_pipeline").map((a) => a.id)) === show(["a1", "a2"]));
  check("a team member with the permission, for every job of that owner", show(A.staffLinks("tm", [tm()], apps, "can_manage_pipeline").map((a) => a.id)) === show(["a1", "a2"]));
  check("…not without that permission, even holding another", A.staffLinks("tm", [tm({ can_manage_pipeline: false, can_send_documents: true })], apps, "can_manage_pipeline").length === 0);
  check("…and only the jobs they are limited to", show(A.staffLinks("tm", [tm({ assigned_job_ids: [JOB_B] })], apps, "can_manage_pipeline").map((a) => a.id)) === show(["a2"]));
  check("…never another employer's job", A.staffLinks("tm", [tm()], [apps[2]], "can_manage_pipeline").length === 0);
  check("a permission that is not exactly true is not a permission", A.staffLinks("tm", [tm({ can_manage_pipeline: null })], apps, "can_manage_pipeline").length === 0 && A.staffLinks("tm", [tm({ can_manage_pipeline: "yes" })], apps, "can_manage_pipeline").length === 0);

  check("a plain line: no line breaks, no control characters, no runs of space, cut short", A.plainLine("  Offer\r\nBcc: someone@x.example \u0000 now\u2028ok  ") === "Offer Bcc: someone@x.example now ok" && A.plainLine("x".repeat(500)).length === 160 && A.plainLine("x".repeat(500), 40).length === 40);
  check("…and only text is text", A.plainLine(42) === undefined && A.plainLine({}) === undefined && A.plainLine("   ") === undefined && A.plainLine(null) === undefined);

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  check("a token that could be a service key in another form is recognised as worth asking about", A.looksLikeServiceKey("sb_secret_abc") && A.looksLikeServiceKey(`${b64({ alg: "HS256" })}.${b64({ role: "service_role" })}.sig`));
  check("…a person's sign-in, the public key and junk are not", !A.looksLikeServiceKey(`${b64({ alg: "HS256" })}.${b64({ role: "authenticated", sub: ANA })}.sig`) && !A.looksLikeServiceKey("sb_publishable_abc") && !A.looksLikeServiceKey("") && !A.looksLikeServiceKey(null) && !A.looksLikeServiceKey("a.b.c"));
  check("secrets are compared whole", A.sameSecret("abc", "abc") && !A.sameSecret("abc", "abd") && !A.sameSecret("abc", "abcd") && !A.sameSecret("", "") && !A.sameSecret(null, "abc"));
}

/* ══ B. The function itself ════════════════════════════════════════════ */

console.log("\nB. The function, request by request (no network, no email)\n");

// The three outside modules, replaced. Everything else is the real code.
const STUBS = {
  server: "export const serve = (handler) => { globalThis.__emailFunction = handler; };",
  resend: "export class Resend { constructor() { this.emails = { send: (payload) => globalThis.__world.mail(payload) }; } }",
  supabase: "export const createClient = (url, key) => globalThis.__world.client(url, key);",
};
const bundle = await build({
  stdin: { contents: 'import "./supabase/functions/send-notification-email/index.ts";\n', resolveDir: ROOT, loader: "ts" },
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
          if (/deno\.land\/std@[^/]+\/http\/server\.ts$/.test(args.path)) return { path: "server", namespace: "stub" };
          if (/esm\.sh\/resend@/.test(args.path)) return { path: "resend", namespace: "stub" };
          if (/esm\.sh\/@supabase\/supabase-js@/.test(args.path)) return { path: "supabase", namespace: "stub" };
          throw new Error(`the function imports something this test has no stand-in for: ${args.path}`);
        });
        b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: STUBS[args.path], loader: "js" }));
      },
    },
  ],
});

let world = freshWorld();
const ENV = { SUPABASE_URL: "http://database.stand-in", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, RESEND_API_KEY: "re_stand_in" };
globalThis.Deno = { env: { get: (key) => ENV[key] } };

/** A database client that answers from the world, in the few shapes the function asks. */
function client() {
  const rowsOf = (table) => {
    if (table === "applications") {
      return world.applications.map((a) => {
        const job = world.jobs.find((j) => j.id === a.job_id) ?? null;
        return { ...a, jobs: job ? { title: job.title, employer_id: job.employer_id } : null };
      });
    }
    return world[table] ?? [];
  };
  const from = (table) => {
    const filters = [];
    let order = null;
    let cap = null;
    const run = () => {
      if (world.databaseDown) return { data: null, error: { message: "stand-in: database down" } };
      let rows = rowsOf(table).filter((r) => filters.every(([col, val]) => r[col] === val));
      if (order) rows = [...rows].sort((a, b) => (order.ascending ? 1 : -1) * String(a[order.col]).localeCompare(String(b[order.col])));
      if (cap != null) rows = rows.slice(0, cap);
      return { data: rows, error: null };
    };
    const q = {
      select: () => q,
      eq: (col, val) => (filters.push([col, val]), q),
      order: (col, opts) => ((order = { col, ascending: opts?.ascending !== false }), q),
      limit: (n) => ((cap = n), q),
      maybeSingle: async () => {
        const r = run();
        return r.error ? r : { data: r.data[0] ?? null, error: null };
      },
      single: async () => {
        const r = run();
        if (r.error) return r;
        return r.data.length === 1 ? { data: r.data[0], error: null } : { data: null, error: { code: "PGRST116", message: "0 rows" } };
      },
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
    };
    return q;
  };
  return {
    from,
    auth: {
      getUser: async (token) => {
        const userId = world.tokens[token];
        return userId ? { data: { user: { id: userId } }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } };
      },
    },
  };
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const headers = new Headers(init?.headers ?? (typeof input === "string" ? undefined : input.headers));
  if (url.host === "database.stand-in" && url.pathname === "/rest/v1/rpc/check_rate_limit") {
    // Only a service key may call the limiter, as in the real database.
    const key = headers.get("apikey");
    if (key !== SERVICE_KEY && key !== "sb_secret_the_other_form") return new Response(JSON.stringify({ message: "permission denied" }), { status: 403 });
    if (world.limiterDown) return new Response("{}", { status: 500 });
    const body = JSON.parse(init?.body ?? "{}");
    const k = `${body.p_bucket}|${body.p_identifier}`;
    const hits = (world.counters.get(k) ?? 0) + 1;
    world.counters.set(k, hits);
    return new Response(JSON.stringify({ allowed: hits <= body.p_limit, hits, limit: body.p_limit, retryAfter: 900 }), { status: 200 });
  }
  world.outside.push(url.href);
  throw new Error(`the function reached outside: ${url.href}`);
};

await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const emailFunction = globalThis.__emailFunction;
check("the real function loaded, with only its three outside modules replaced", typeof emailFunction === "function");

function reset(change) {
  world = freshWorld();
  world.client = client;
  world.mail = async (payload) => {
    if (world.providerRefuses) return { data: null, error: { name: "daily_quota_exceeded", message: "stand-in refusal" } };
    world.sent.push(payload);
    return { data: { id: `mail_${world.sent.length}` }, error: null };
  };
  globalThis.__world = world;
  change?.(world);
}
async function ask(token, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await emailFunction(new Request("http://fn.stand-in/send-notification-email", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json().catch(() => null), retryAfter: res.headers.get("Retry-After") };
}
/**
 * A request with the two credential headers set exactly as given. This is
 * how the real callers differ, as seen live on 2026-10-07:
 *   - another edge function: NO Authorization header, `apikey` = the
 *     project's secret key;
 *   - a browser: `apikey` = the public key, Authorization = the public key
 *     (signed out) or the person's own sign-in.
 */
async function askWith({ authorization, apikey }, body) {
  const headers = { "Content-Type": "application/json" };
  if (authorization) headers.Authorization = `Bearer ${authorization}`;
  if (apikey) headers.apikey = apikey;
  const res = await emailFunction(new Request("http://fn.stand-in/send-notification-email", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json().catch(() => null) };
}
const PUBLIC_KEY = "sb_publishable_the_sites_public_key";
/** As another edge function calls: the secret key in `apikey`, nothing else. */
const asFunction = (body) => askWith({ apikey: SERVICE_KEY }, body);
const textOf = (mail) => String(mail?.html ?? "").replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const emailOf = (userId) => world.profiles.find((p) => p.user_id === userId)?.email;
const KINDS = Object.keys(A.NOTIFICATION_RULES);
const HOSTILE = { job_title: "Chief Executive", company_name: "Some Other Company", candidate_name: "<b>Free Money</b>", sender_name: "The CEO", sender_id: OWNER, recipient_role: "employer" };

reset();
const quiet = console.log;
const hush = async (fnToRun) => {
  // The function logs every step; keep this test's own output readable.
  const log = console.log, warn = console.warn, error = console.error;
  console.log = console.warn = console.error = () => {};
  try {
    return await fnToRun();
  } finally {
    console.log = log;
    console.warn = warn;
    console.error = error;
  }
};
void quiet;

/* 1. Nobody. */
{
  const results = await hush(async () => {
    const out = [];
    for (const type of KINDS) {
      for (const token of [null, "sb_publishable_the_sites_public_key", "not-a-real-sign-in"]) {
        reset();
        const r = await ask(token, { type, recipient_user_id: ANA, data: { ...HOSTILE, application_id: id(201) } });
        out.push({ type, token, status: r.status, sent: world.sent.length });
      }
    }
    return out;
  });
  const leaked = results.filter((r) => r.sent > 0);
  const wrong = results.filter((r) => r.status !== 401);
  check(`with no real sign-in, none of the ${KINDS.length} kinds sends anything (no token, the public key, a made-up token)`, leaked.length === 0, show(leaked.slice(0, 3)));
  check("…each is refused as not signed in (401)", wrong.length === 0, show(wrong.slice(0, 4)));
}

/* 2. The forgery: "You've got the job". */
{
  const tries = [
    ["a signed-in stranger, to an applicant", "tok-stranger", ANA],
    ["a signed-in stranger, to themself", "tok-stranger", STRANGER],
    ["an applicant, to themself", "tok-ana", ANA],
    ["an applicant, to another applicant", "tok-ana", BEN],
    ["another employer, to someone who never applied to them", "tok-rival", ANA],
    ["a team member with no permission", "tok-team-view", ANA],
    ["a team member limited to another job", "tok-team-job-b", CAT],
    ["a team member who is no longer active", "tok-team-gone", ANA],
    ["an applicant, to the owner", "tok-ana", OWNER],
  ];
  for (const kind of ["status_hired", "status_rejected", "phase_advanced", "interview_scheduled", "document_sent"]) {
    const bad = [];
    for (const [label, token, to] of tries) {
      const r = await hush(async () => (reset(), ask(token, { type: kind, recipient_user_id: to, data: { ...HOSTILE, phase_name: "Hired", interview_date: "Monday", interview_time: "9", document_name: "Offer" } })));
      if (r.status !== 403 || r.body?.code !== "not_allowed" || world.sent.length !== 0) bad.push(`${label}: ${r.status} ${show(r.body)} sent=${world.sent.length}`);
    }
    check(`${kind}: nobody who is not the hiring team for that applicant can send it (9 ways tried)`, bad.length === 0, bad.join(" | "));
  }
  const limitedOk = await hush(async () => (reset(), ask("tok-team-job-b", { type: "status_rejected", recipient_user_id: BEN, data: {} })));
  check("…while a team member limited to a job CAN decide on that job's applicant", limitedOk.status === 200 && world.sent.length === 1 && show(world.sent[0].to) === show([emailOf(BEN)]), show(limitedOk));
  const limitedNo = await hush(async () => (reset((w) => { w.applications = w.applications.filter((a) => !(a.candidate_id === ANA && a.job_id === JOB_B)); }), ask("tok-team-job-b", { type: "status_rejected", recipient_user_id: ANA, data: {} })));
  check("…and not on an applicant who only applied to a job they are not on", limitedNo.status === 403 && world.sent.length === 0, show(limitedNo));
}

/* 3. The hiring team's own emails still go, and say only what is true. */
{
  let r = await hush(async () => (reset(), ask("tok-owner", { type: "status_hired", recipient_user_id: ANA, data: { ...HOSTILE, job_title: TITLE_A } })));
  let mail = world.sent[0];
  check("the owner hires their applicant: sent, to that applicant", r.status === 200 && r.body?.success === true && world.sent.length === 1 && show(mail.to) === show([emailOf(ANA)]), show(r));
  check("…from the hiring address, signed by the owner's own business whatever the request said", mail.from === "Zulu Support Team <hiring@hireflownow.com>" && textOf(mail).endsWith("— The Zulu Support Team") && !/Some Other Company/.test(mail.html), textOf(mail).slice(-60));
  check("…naming the job the owner named", mail.subject === `Welcome aboard — ${TITLE_A}`, mail.subject);

  r = await hush(async () => (reset(), ask("tok-team-all", { type: "status_rejected", recipient_user_id: ANA, data: { company_name: "Rival Co" } })));
  mail = world.sent[0];
  check("a team member with the permission declines: sent, signed by the job owner's business, not a name they chose", r.status === 200 && show(mail.to) === show([emailOf(ANA)]) && textOf(mail).endsWith("— The Zulu Support Team") && !/Rival/.test(mail.html), textOf(mail).slice(-60));
  check("…and with no job named, the job that links them (the newest)", mail.subject === `An update on your ${TITLE_B} application`, mail.subject);

  r = await hush(async () => (reset((w) => { w.profiles.find((p) => p.user_id === OWNER).company_name = null; }), ask("tok-owner", { type: "status_rejected", recipient_user_id: ANA, data: { job_title: TITLE_A, company_name: "This employer" } })));
  check("an owner with no business name on file signs as 'The hiring team', not as words from the request", r.status === 200 && textOf(world.sent[0]).endsWith("— The hiring team"), textOf(world.sent[0]).slice(-40));

  const staffKinds = [
    ["phase_advanced", { phase_name: "Chat practice\r\nBcc: x@y.example", job_title: TITLE_A }, /Chat practice Bcc: x@y\.example/],
    ["interview_scheduled", { job_title: TITLE_A, interview_date: "Friday, October 9", interview_time: "3:00 PM" }, /Friday, October 9/],
    ["interview_pick_time", { job_title: TITLE_A, proposed_times_list: ["Fri 3 PM", "<i>Sat</i> 10 AM", 7, "  "], window_count: "99" }, /proposed 2 times/],
    ["interview_cancelled", { job_title: TITLE_A, original_date: "Friday" }, /Original date: Friday/],
    ["interview_rescheduled", { job_title: TITLE_A, new_date: "Monday", new_time: "9 AM" }, /New Date: Monday/],
    ["document_sent", { document_name: "Offer letter" }, /Document: Offer letter/],
    ["document_requested", { document_name: "ID" }, /Document Type: ID/],
  ];
  // One time is the rule since 2026-10-07: the email states it, says what to
  // do if they cannot make it, and a new time after that is said as one.
  r = await hush(async () => (reset(), ask("tok-team-all", { type: "interview_pick_time", recipient_user_id: ANA, data: { ...HOSTILE, job_title: TITLE_A, proposed_times_list: ["Sunday, October 11 · 2:00 PM Philippine Standard Time"], window_count: "1" } })));
  mail = world.sent[0];
  check("one offered time: the invitation states it, and how to answer if they can't make it", r.status === 200 && mail.subject === `You're invited to an interview: ${TITLE_A}` && /would like to interview you at this time:/.test(textOf(mail)) && textOf(mail).includes("Sunday, October 11 · 2:00 PM Philippine Standard Time") && /Can't make it\? Tell them there which days you are free, and from what time to what time/.test(textOf(mail)) && !/proposed|Pick whichever/.test(textOf(mail)), `${mail?.subject} ${textOf(mail).slice(0, 200)}`);
  r = await hush(async () => (reset(), ask("tok-team-all", { type: "interview_pick_time", recipient_user_id: ANA, data: { job_title: TITLE_A, proposed_times_list: ["Monday, October 12 · 9:00 AM Philippine Standard Time"], again: "1" } })));
  mail = world.sent[0];
  check("a new time after 'can't make it' is said as a new time", r.status === 200 && mail.subject === `A new time for your interview: ${TITLE_A}` && /set a new time for your interview:/.test(textOf(mail)), mail?.subject);
  r = await hush(async () => (reset(), ask("tok-team-all", { type: "interview_pick_time", recipient_user_id: ANA, data: { job_title: TITLE_A, proposed_times_list: ["Monday, October 12 · 9:00 AM"], again: "<b>yes</b>" } })));
  check("…and that mark is only ever a mark: other words in its place do nothing", r.status === 200 && world.sent[0].subject === `You're invited to an interview: ${TITLE_A}` && !/<b>yes/.test(world.sent[0].html));

  for (const [kind, data, expect] of staffKinds) {
    r = await hush(async () => (reset(), ask("tok-team-all", { type: kind, recipient_user_id: ANA, data: { ...HOSTILE, ...data } })));
    mail = world.sent[0];
    const text = textOf(mail);
    check(`${kind}: the hiring team's is sent to the applicant, with its own details and nothing forged`, r.status === 200 && world.sent.length === 1 && show(mail.to) === show([emailOf(ANA)]) && expect.test(text) && !/Some Other Company|Free Money|The CEO/.test(mail.html) && !/[\r\n]/.test(mail.subject), `${r.status} ${text.slice(0, 160)}`);
  }
  check("…a subject never carries a line break from the request", !/[\r\n]/.test(world.sent[0]?.subject ?? ""));
}

/* 4. An applicant's own emails. */
{
  let r = await hush(async () => (reset(), ask("tok-ana", { type: "application_received", recipient_user_id: ANA, data: HOSTILE })));
  let mail = world.sent[0];
  check("application received: to the applicant themself", r.status === 200 && show(mail.to) === show([emailOf(ANA)]), show(r));
  check("…naming a job they really applied to and signed by its real owner, not the request's", mail.subject === `Application Submitted: ${TITLE_B}` && textOf(mail).endsWith("— The Zulu Support Team") && !/Chief Executive|Some Other Company/.test(mail.html), `${mail.subject} | ${textOf(mail).slice(-40)}`);
  r = await hush(async () => (reset(), ask("tok-ana", { type: "application_received", recipient_user_id: ANA, data: { job_title: TITLE_A } })));
  check("…or the one they named, when it is one of theirs", world.sent[0]?.subject === `Application Submitted: ${TITLE_A}`, world.sent[0]?.subject);
  r = await hush(async () => (reset(), ask("tok-ana", { type: "application_received", data: {} })));
  check("…with no recipient named it still goes to them", r.status === 200 && show(world.sent[0]?.to) === show([emailOf(ANA)]));
  r = await hush(async () => (reset(), ask("tok-ana", { type: "application_received", recipient_user_id: BEN, data: {} })));
  check("…never to someone else", r.status === 403 && world.sent.length === 0, show(r));
  r = await hush(async () => (reset(), ask("tok-stranger", { type: "application_received", recipient_user_id: STRANGER, data: { job_title: "Anything", company_name: "Anyone" } })));
  check("…and someone who has applied to nothing cannot have one written for them", r.status === 403 && world.sent.length === 0, show(r));

  r = await hush(async () => (reset(), ask("tok-ana", { type: "new_application", recipient_user_id: OWNER, data: HOSTILE })));
  mail = world.sent[0];
  check("new application: to the owner of the job they applied to, as a team alert", r.status === 200 && show(mail.to) === show([emailOf(OWNER)]) && mail.from === "HireFlow <notifications@hireflownow.com>", show(r));
  check("…with the applicant's own name and a job they really applied to, not the request's", mail.subject === `New Application: Ana Reyes applied for ${TITLE_B}` && !/Free Money|Chief Executive/.test(mail.html + mail.subject), mail.subject);
  r = await hush(async () => (reset(), ask("tok-ana", { type: "new_application", recipient_user_id: RIVAL, data: {} })));
  check("…never to an employer they did not apply to", r.status === 403 && world.sent.length === 0, show(r));
  r = await hush(async () => (reset(), ask("tok-ana", { type: "new_application", recipient_user_id: BEN, data: {} })));
  check("…never to another applicant", r.status === 403 && world.sent.length === 0);
  r = await hush(async () => (reset(), ask("tok-cat", { type: "phase_completed", recipient_user_id: RIVAL, data: { phase_name: "Ava Video Interview", candidate_name: "Someone Else" } })));
  check("phase completed: to their own job's owner, in their own name", r.status === 200 && world.sent[0]?.subject === "Phase Completed: Cat Lim finished Ava Video Interview", world.sent[0]?.subject);
}

/* 5. Messages, both ways. */
{
  let r = await hush(async () => (reset(), ask("tok-owner", { type: "new_message", recipient_user_id: ANA, data: { sender_name: "The CEO", message_preview: "Hello Ana", recipient_role: "employer" } })));
  let mail = world.sent[0];
  check("the owner messages their applicant: the applicant's copy, through candidate sign-in", r.status === 200 && show(mail.to) === show([emailOf(ANA)]) && /new message from the hiring team/.test(textOf(mail)) && /candidate\/auth\?redirect=%2Fmessages/.test(mail.html), textOf(mail).slice(0, 120));
  r = await hush(async () => (reset(), ask("tok-ana", { type: "new_message", recipient_user_id: OWNER, data: { sender_name: "The CEO", sender_id: RIVAL, message_preview: "Hi", recipient_role: "candidate", job_title: "Chief Executive" } })));
  mail = world.sent[0];
  check("an applicant messages the job's owner: the owner's copy, in the applicant's real name", r.status === 200 && show(mail.to) === show([emailOf(OWNER)]) && mail.subject === "New message from Ana Reyes" && !/The CEO|Chief Executive/.test(mail.html + mail.subject), mail.subject);
  check("…and its link opens THEIR thread, not one the request named", mail.html.includes(`/messages?candidate=${encodeURIComponent(ANA)}`) && !mail.html.includes(RIVAL));
  r = await hush(async () => (reset(), ask("tok-team-view", { type: "new_message", recipient_user_id: ANA, data: { message_preview: "x" } })));
  check("a team member without the messaging permission cannot", r.status === 403 && world.sent.length === 0, show(r));
  r = await hush(async () => (reset(), ask("tok-stranger", { type: "new_message", recipient_user_id: OWNER, data: { message_preview: "Buy now" } })));
  check("a stranger cannot message an employer they never applied to", r.status === 403 && world.sent.length === 0);
  r = await hush(async () => (reset(), ask("tok-ana", { type: "new_message", recipient_user_id: BEN, data: { message_preview: "x" } })));
  check("an applicant cannot message another applicant", r.status === 403 && world.sent.length === 0);
}

/* 6. The system's own. */
{
  const systemKinds = KINDS.filter((k) => A.NOTIFICATION_RULES[k].who === "service");
  const bad = [];
  for (const kind of systemKinds) {
    for (const token of ["tok-owner", "tok-team-all", "tok-ana"]) {
      const r = await hush(async () => (reset(), ask(token, { type: kind, recipient_user_id: OWNER, data: { candidate_name: "x", job_title: "y", score: "99", minutes_remaining: "1", retake_steps: "z" } })));
      if (r.status !== 403 || world.sent.length !== 0) bad.push(`${kind}/${token}: ${r.status}`);
    }
  }
  check(`the ${systemKinds.length} system alerts cannot be asked for by any signed-in person, the owner included`, bad.length === 0, bad.join(", "));

  let r = await hush(async () => (reset(), ask(SERVICE_KEY, { type: "interview_ready", recipient_user_id: OWNER, data: { candidate_name: "Ana Reyes", job_title: TITLE_A, score: "82" } })));
  check("the system (the service key) is served as before: sent as asked", r.status === 200 && show(world.sent[0]?.to) === show([emailOf(OWNER)]) && world.sent[0].subject === `Ready for Interview: Ana Reyes scored 82% for ${TITLE_A}`, show(r));
  r = await hush(async () => (reset(), ask(SERVICE_KEY, { type: "steps_reopened", recipient_user_id: ANA, data: { candidate_name: "Ana Reyes", job_title: TITLE_A, company_name: "Zulu Support Team", retake_steps: "the chat practice" } })));
  check("…including the 'please redo' email a script sends", r.status === 200 && show(world.sent[0]?.to) === show([emailOf(ANA)]) && /Please redo one part of your Zulu application/.test(world.sent[0].subject), world.sent[0]?.subject);
  r = await hush(async () => (reset(), ask(SERVICE_KEY, { type: "new_message", recipient_user_id: OWNER, data: { sender_name: "Ana Reyes", message_preview: "Hi" } })));
  check("…and a message from the system still reads by the recipient's role", r.status === 200 && world.sent[0]?.subject === "New message from Ana Reyes", world.sent[0]?.subject);
  r = await hush(async () => (reset(), ask("sb_secret_the_other_form", { type: "interview_ready", recipient_user_id: OWNER, data: { candidate_name: "A", job_title: "B", score: "1" } })));
  check("the service key in its other form is recognised once the database itself accepts it", r.status === 200 && world.sent.length === 1, show(r));
  r = await hush(async () => (reset(), ask("sb_secret_made_up", { type: "interview_ready", recipient_user_id: OWNER, data: {} })));
  check("…a made-up one that only looks like it is nobody", r.status === 401 && world.sent.length === 0, show(r));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  r = await hush(async () => (reset(), ask(`${b64({ alg: "none" })}.${b64({ role: "service_role" })}.`, { type: "status_hired", recipient_user_id: ANA, data: {} })));
  check("…and so is a hand-made token that merely CLAIMS to be the service", r.status === 401 && world.sent.length === 0, show(r));
}

/* 6b. The system, as it REALLY calls. Another edge function holds the
   project's secret key, and its request arrives with that key in `apikey`
   and no Authorization header at all. The first version of the caller check
   read only Authorization: every email one function asked another to send
   was refused (401) on the live site for five hours on 2026-10-07, while
   every check above passed. */
{
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  let r = await hush(async () => (reset(), asFunction({ type: "interview_ready", recipient_user_id: OWNER, data: { candidate_name: "Ana Reyes", job_title: TITLE_A, score: "82" } })));
  check("another edge function (secret key in apikey, no Authorization) is the system: its email is sent", r.status === 200 && r.body?.success === true && show(world.sent[0]?.to) === show([emailOf(OWNER)]), show(r));
  r = await hush(async () => (reset(), asFunction({ type: "reschedule_requested", recipient_user_id: OWNER, data: { candidate_name: "Ana Reyes", job_title: TITLE_A, proposed_times: "Thursday, October 8 at 9:00 AM EDT; Friday, October 9 at 9:00 AM EDT", candidate_note: "Mornings are best." } })));
  check("…the 'they suggested other times' email among them, with the times as given", r.status === 200 && world.sent[0]?.subject === `Reschedule Request: Ana Reyes for ${TITLE_A}` && textOf(world.sent[0]).includes("Thursday, October 8 at 9:00 AM EDT; Friday, October 9 at 9:00 AM EDT"), world.sent[0]?.subject);
  r = await hush(async () => (reset(), asFunction({ type: "reschedule_requested", recipient_user_id: OWNER, data: { candidate_name: "Ana Reyes", job_title: TITLE_A, availability: "Monday to Wednesday, 9:00 AM to 2:00 PM. <i>Friday</i> after 4", cannot_make: "Thursday, October 8 at 9:00 AM EDT", clock_gap: "12 hours ahead of yours" } })));
  check("…and the 'can't make it' email: what they wrote, the time, whose clock, and to set a new time", r.status === 200 && world.sent[0]?.subject === `Ana Reyes can't make the interview time: ${TITLE_A}` && textOf(world.sent[0]).includes("can't make Thursday, October 8 at 9:00 AM EDT") && textOf(world.sent[0]).includes('When they are free: "Monday to Wednesday, 9:00 AM to 2:00 PM.') && textOf(world.sent[0]).includes("which is 12 hours ahead of yours") && /Set a New Time/i.test(world.sent[0].html) && !/<i>Friday<\/i>/.test(world.sent[0].html) && !/Proposed times|approve a new time or decline/.test(textOf(world.sent[0])), `${world.sent[0]?.subject} | ${textOf(world.sent[0] ?? { html: "" }).slice(0, 260)}`);
  r = await hush(async () => (reset(), askWith({ apikey: "sb_secret_the_other_form" }, { type: "interview_ready", recipient_user_id: OWNER, data: { candidate_name: "A", job_title: "B", score: "1" } })));
  check("the key's other form in apikey counts once the database itself accepts it", r.status === 200 && world.sent.length === 1, show(r));

  const bad = [];
  for (const kind of KINDS) {
    for (const [label, headers] of [
      ["public key only", { apikey: PUBLIC_KEY }],
      ["public key in both", { apikey: PUBLIC_KEY, authorization: PUBLIC_KEY }],
      ["a made-up secret in apikey", { apikey: "sb_secret_made_up" }],
      ["a token that only claims to be the service, in apikey", { apikey: `${b64({ alg: "none" })}.${b64({ role: "service_role" })}.` }],
      ["the secret key cut short", { apikey: SERVICE_KEY.slice(0, -1) }],
      ["the secret key with one more character", { apikey: `${SERVICE_KEY}x` }],
    ]) {
      const res = await hush(async () => (reset(), askWith(headers, { type: kind, recipient_user_id: ANA, data: { application_id: id(201), job_title: "x", candidate_name: "y" } })));
      if (res.status !== 401 || world.sent.length !== 0) bad.push(`${kind}/${label}: ${res.status}`);
    }
  }
  check(`anything in apikey that is not the secret key is nobody, for all ${KINDS.length} kinds`, bad.length === 0, bad.slice(0, 6).join(", "));

  r = await hush(async () => (reset(), askWith({ apikey: PUBLIC_KEY, authorization: "tok-owner" }, { type: "status_rejected", recipient_user_id: ANA, data: {} })));
  check("a browser (public key in apikey, the person's sign-in in Authorization) is still that person", r.status === 200 && show(world.sent[0]?.to) === show([emailOf(ANA)]), show(r));
  r = await hush(async () => (reset(), askWith({ apikey: PUBLIC_KEY, authorization: "tok-ana" }, { type: "status_hired", recipient_user_id: ANA, data: {} })));
  check("…and still cannot send themself a decision", r.status === 403 && world.sent.length === 0, show(r));
  r = await hush(async () => (reset(), askWith({ apikey: PUBLIC_KEY, authorization: "tok-owner" }, { type: "interview_confirmed", recipient_user_id: ANA, data: { job_title: TITLE_A, interview_date: "x", interview_time: "y" } })));
  check("…nor ask for a system email by putting the public key in apikey", r.status === 403 && world.sent.length === 0, show(r));
}

/* 6c. A time is agreed: the applicant's confirmation and the team's notice
   (candidate-interview-response sends both, as the system). */
{
  const confirmed = (over = {}) => ({
    type: "interview_confirmed",
    recipient_user_id: ANA,
    data: {
      job_title: TITLE_A,
      company_name: "Zulu Support Team",
      interview_date: "Thursday, October 8, 2026",
      interview_time: "9:00 PM Philippine Standard Time",
      interview_length: "30 minutes",
      join_note: "This is a video call. The button to join is on your application page and opens 15 minutes before the start.",
      application_id: id(201),
      ...over,
    },
  });
  let r = await hush(async () => (reset(), asFunction(confirmed())));
  let mail = world.sent[0];
  let text = textOf(mail);
  check("the applicant's confirmation is sent to the applicant, from the hiring address", r.status === 200 && show(mail?.to) === show([emailOf(ANA)]) && /^Zulu Support Team <hiring@/.test(mail?.from ?? ""), show({ to: mail?.to, from: mail?.from }));
  check("it says it is confirmed, for which job", mail?.subject === `Interview confirmed: ${TITLE_A}` && text.includes("Your interview is confirmed") && text.includes(`Your interview for ${TITLE_A} is confirmed.`), mail?.subject);
  check("with the date, the time on a named clock, and the length", text.includes("Date: Thursday, October 8, 2026") && text.includes("Time: 9:00 PM Philippine Standard Time") && text.includes("Length: 30 minutes"), text.slice(0, 260));
  check("how to join, and what to do if they cannot make it", text.includes("The button to join is on your application page and opens 15 minutes before the start.") && text.includes(`choose "Can't make it?"`));
  check("the button opens their own application, through applicant sign-in", mail?.html.includes(`/candidate/auth?redirect=${encodeURIComponent(`/applications/${id(201)}`)}`), (/href="([^"]+)"/.exec(mail?.html ?? "") ?? [])[1]);
  check("it is signed by the team that is hiring", text.includes("— The Zulu Support Team") && !text.includes("Team team"));
  check("no meeting link is ever in it", !/meet\.google|zoom\.us|https?:\/\/[^ "]*daily/i.test(mail?.html ?? ""));
  r = await hush(async () => (reset(), asFunction(confirmed({ application_id: "../../employer/auth", interview_length: undefined, join_note: undefined, company_name: undefined }))));
  mail = world.sent[0];
  check("an application id that is not an id never reaches the link", r.status === 200 && mail.html.includes(`/candidate/auth?redirect=${encodeURIComponent("/applications")}"`) && !mail.html.includes("employer"), (/href="([^"]+)"/.exec(mail?.html ?? "") ?? [])[1]);
  check("…and with no length, join line or team name it is still a whole email", !/undefined|null/.test(textOf(mail)) && textOf(mail).includes("— The hiring team") && !textOf(mail).includes("Length:"));
  r = await hush(async () => (reset(), asFunction(confirmed({ job_title: '<img src=x onerror=alert(1)>', join_note: "<script>x</script>" }))));
  check("words in it are escaped", r.status === 200 && !/<img|<script/i.test(world.sent[0].html));
  r = await hush(async () => (reset((w) => { w.profiles.find((p) => p.user_id === ANA).email_interview_reminders = false; }), asFunction(confirmed())));
  check("an applicant who turned interview emails off is not sent it", r.status === 200 && r.body?.success !== true && world.sent.length === 0, show(r));

  const picked = (change, over = {}) => ({
    type: "interview_time_picked",
    recipient_user_id: OWNER,
    data: { candidate_name: "Ana Reyes", job_title: TITLE_A, interview_when: "Thursday, October 8 at 9:00 AM EDT", interview_change: change, interview_length: "30 minutes", ...over },
  });
  r = await hush(async () => (reset(), asFunction(picked("picked"))));
  mail = world.sent[0];
  text = textOf(mail);
  check("the team's notice goes to the job's owner, from HireFlow", r.status === 200 && show(mail?.to) === show([emailOf(OWNER)]) && /^HireFlow <notifications@/.test(mail?.from ?? ""), show({ to: mail?.to, from: mail?.from }));
  check("it says who picked, for which job, and when on the team's clock", mail?.subject === `Ana Reyes picked an interview time: ${TITLE_A}` && text.includes(`Ana Reyes picked an interview time for ${TITLE_A}`) && text.includes("When: Thursday, October 8 at 9:00 AM EDT") && text.includes("Length: 30 minutes"), mail?.subject);
  check("its button opens the Interviews page", /href="https:\/\/hireflownow\.com\/interviews"/.test(mail?.html ?? ""));
  r = await hush(async () => (reset(), asFunction(picked("moved"))));
  check("a swap to another offered time reads as moved", world.sent[0]?.subject === `Ana Reyes moved their interview: ${TITLE_A}` && textOf(world.sent[0]).includes("Interview moved"));
  r = await hush(async () => (reset(), asFunction(picked("confirmed"))));
  check("confirming a set time reads as confirmed", world.sent[0]?.subject === `Ana Reyes confirmed their interview: ${TITLE_A}` && textOf(world.sent[0]).includes("Interview confirmed"));
  r = await hush(async () => (reset(), asFunction(picked("anything else", { candidate_name: "<b>Ana</b>" }))));
  check("an unknown word for how it happened reads as picked, and names are escaped", world.sent[0]?.subject.includes("picked an interview time") && !/<b>Ana/.test(world.sent[0].html));
  r = await hush(async () => (reset((w) => { w.profiles.find((p) => p.user_id === OWNER).email_interview_reminders = false; }), asFunction(picked("picked"))));
  check("an owner who turned interview emails off is not sent it", r.status === 200 && world.sent.length === 0);
}

/* 7. Limits, failures, and the rest. */
{
  let r;
  let last = null;
  await hush(async () => {
    reset();
    for (let i = 0; i < 31; i += 1) last = await ask("tok-ana", { type: "new_application", recipient_user_id: OWNER, data: {} });
  });
  check("an applicant's 31st email in an hour is refused (429), the 30 before it sent", last.status === 429 && last.body?.code === "too_many" && world.sent.length === 30 && Number(last.retryAfter) > 0, `${last.status} sent=${world.sent.length}`);
  await hush(async () => {
    reset();
    for (let i = 0; i < 40; i += 1) last = await ask("tok-owner", { type: "status_rejected", recipient_user_id: i % 2 ? ANA : BEN, data: {} });
  });
  check("the hiring team passing on 40 people in a row is not stopped", last.status === 200 && world.sent.length === 40);
  await hush(async () => {
    reset();
    for (let i = 0; i < 5; i += 1) await ask("tok-stranger", { type: "status_hired", recipient_user_id: ANA, data: {} });
  });
  check("refused requests are not counted against anyone", world.counters.size === 0, show([...world.counters]));
  r = await hush(async () => (reset((w) => { w.limiterDown = true; }), ask("tok-owner", { type: "status_rejected", recipient_user_id: ANA, data: {} })));
  check("with the limiter down, an entitled email still goes (it is a ceiling, not the lock)", r.status === 200 && world.sent.length === 1, show(r));
  r = await hush(async () => (reset((w) => { w.limiterDown = true; }), ask("tok-stranger", { type: "status_hired", recipient_user_id: ANA, data: {} })));
  check("…and an unentitled one is still refused", r.status === 403 && world.sent.length === 0);
  r = await hush(async () => (reset((w) => { w.databaseDown = true; }), ask("tok-owner", { type: "status_rejected", recipient_user_id: ANA, data: {} })));
  check("when it cannot look up whose request this is, nothing is sent (503)", r.status === 503 && r.body?.code === "try_later" && world.sent.length === 0, show(r));
  r = await hush(async () => (reset(), ask("tok-owner", { type: "you_have_won", recipient_user_id: ANA, data: {} })));
  check("a kind the function does not know is refused (400), where it used to crash (500)", r.status === 400 && r.body?.code === "unknown_type" && world.sent.length === 0, show(r));
  r = await hush(async () => (reset(), ask("tok-owner", { type: "toString", recipient_user_id: ANA, data: {} })));
  check("…including names that every object happens to have", r.status === 400 && world.sent.length === 0, show(r));
  r = await hush(async () => {
    reset();
    const res = await emailFunction(new Request("http://fn.stand-in/send-notification-email", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer tok-owner" }, body: "{ this is not json" }));
    return { status: res.status, body: await res.json().catch(() => null) };
  });
  check("a request it cannot read fails without handing back its own workings (no stack trace in the answer)", r.status === 500 && typeof r.body?.error === "string" && r.body.stack === undefined && !/at |\.ts|index|JSON/.test(r.body.error), show(r));
  r = await hush(async () => (reset(), ask("tok-owner", { type: "status_rejected", recipient_user_id: "not-an-id", data: {} })));
  check("a recipient that is not an id is refused", r.status === 403 && world.sent.length === 0);
  r = await hush(async () => (reset(), ask("tok-owner", { type: "status_rejected", recipient_user_id: NOBODY_HERE, data: {} })));
  check("so is one that is nobody", r.status === 403 && world.sent.length === 0);
  r = await hush(async () => (reset((w) => { w.providerRefuses = true; }), ask("tok-owner", { type: "status_rejected", recipient_user_id: ANA, data: {} })));
  check("a message the mail provider refuses is still never reported as sent", r.status === 502 && r.body?.success === false, show(r));
  r = await hush(async () => (reset((w) => { w.profiles.find((p) => p.user_id === ANA).email_phase_updates = false; }), ask("tok-owner", { type: "status_rejected", recipient_user_id: ANA, data: {} })));
  check("the recipient's email settings are still respected", r.status === 200 && r.body?.success !== true && world.sent.length === 0, show(r));

  // "Email me the link" keeps its own gate (scripts/continue_link_email.test.mjs).
  r = await hush(async () => (reset(), ask("tok-ana", { type: "continue_on_computer", recipient_user_id: BEN, data: { application_id: id(201), job_title: "Chief Executive" } })));
  check("'Email me the link' is unchanged: to the signed-in applicant, looked up", r.status === 200 && show(world.sent[0]?.to) === show([emailOf(ANA)]) && textOf(world.sent[0]).includes(`for the ${TITLE_A} role`), show(r));
  r = await hush(async () => (reset(), ask(SERVICE_KEY, { type: "continue_on_computer", recipient_user_id: ANA, data: { application_id: id(201) } })));
  check("…and it is not the system's to send for someone", r.status === 401 && world.sent.length === 0, show(r));
}
check("nothing in any of this reached outside the stand-ins", world.outside.length === 0 && globalThis.__world.outside.length === 0);
globalThis.fetch = realFetch;

/* ══ C. The wiring ═════════════════════════════════════════════════════ */

console.log("\nC. The wiring\n");
{
  const body = code(fn);
  const identifyAt = body.indexOf("const caller = await identifyCaller(req, supabase, supabaseUrl, supabaseServiceKey);");
  const decideAt = body.indexOf("const access = await decideNotification(");
  const profileAt = body.indexOf('.select("email, email_notifications_enabled');
  const sendAt = body.indexOf("resend.emails.send(");
  check("whose request it is is settled before the recipient is read, long before anything is sent", identifyAt > 0 && decideAt > identifyAt && profileAt > decideAt && sendAt > profileAt, `${identifyAt} ${decideAt} ${profileAt} ${sendAt}`);
  check("only the service key skips the decision, compared whole in either header, or proven by the database itself", /if \(sameSecret\(token, serviceKey\) \|\| sameSecret\(apikey, serviceKey\)\) return \{ kind: "service" \};/.test(body) && /for \(const candidate of new Set\(\[token, apikey\]\)\) \{\s*if \(!candidate \|\| !looksLikeServiceKey\(candidate\)\) continue;[\s\S]*?rpc\/check_rate_limit[\s\S]*?if \(proof\.ok\) return \{ kind: "service" \};/.test(body));
  check("a person is only ever read from Authorization, never from apikey", /if \(!token\) return \{ kind: "anonymous" \};\s*const \{ data: auth, error \} = await supabase\.auth\.getUser\(token\);/.test(body) && !/getUser\(apikey\)/.test(body));
  check("a person is who their own sign-in says", /await supabase\.auth\.getUser\(token\);\s*return !error && auth\?\.user\?\.id \? \{ kind: "user", id: auth\.user\.id \} : \{ kind: "anonymous" \};/.test(body));
  check("a refusal answers there and then", /if \(!access\.ok\) \{[\s\S]*?return refuse\(refusal\.status,/.test(body));
  check("then the recipient, the words and the side are REPLACED by what was decided", /recipient_user_id = access\.recipientUserId;\s*data = access\.data as NotificationRequest\["data"\];\s*recipientRole = access\.recipientRole;/.test(body));
  check("an unknown kind never reaches a template", /hasOwnProperty\.call\(NOTIFICATION_RULES, type\)/.test(body) && body.indexOf("hasOwnProperty.call(NOTIFICATION_RULES, type)") < identifyAt);
  check("the function is still deployed behind the gateway's own check too", /\[functions\.send-notification-email\]\s*\nverify_jwt = true/.test(await src("supabase/config.toml")));
  const doc = await src("docs/NOTIFICATION-EMAILS.md").catch(() => "");
  check("the rules are written down for the next person", /notificationAccess\.ts/.test(doc) && /You've got the job/.test(doc));
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
