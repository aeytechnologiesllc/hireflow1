#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261025235000_application_evaluations.sql
 * (docs/LAUNCH-PLAN.md, Phase 7, task 6): the hiring team's evaluation of an
 * application (ai_score, ai_analysis, ai_scorecard, phase_ai_analysis,
 * employer_notes) lives in public.application_evaluations, and the
 * applicant's own row never holds it.
 *
 * The stub is the slice of the live schema this touches; everything that
 * decides who reads or writes is replayed from the migration files
 * themselves (the latest definition of each function and policy, wherever
 * it is), not copied here: is_job_owner, is_active_team_member_for_job,
 * has_role, the applications SELECT/UPDATE/DELETE policies, the two protect
 * triggers, the insert-clean trigger, the staff lists' view, and then this
 * migration.
 *
 * It proves: an applicant reads none of the five (not from applications,
 * not from the staff view, not from application_evaluations); the job's
 * owner, an assigned teammate and a developer read them; a teammate not
 * assigned to the job, another business and a signed-out visitor read
 * nothing; a write of each column through applications lands in
 * application_evaluations and leaves applications NULL, a clear clears it,
 * an applicant's write never lands; the backfill moves what was there
 * without touching updated_at; deleting the application deletes its
 * evaluation; the triggers fire after every other BEFORE trigger.
 *
 * Run with: node scripts/application_evaluations.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const MIGRATION = "20261025235000_application_evaluations.sql";
const FILES = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
const text = (name) => readFileSync(path.join(MIGRATIONS, name), "utf8");
const BEFORE_THIS = FILES.filter((f) => f < MIGRATION);

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

/** The last CREATE [OR REPLACE] FUNCTION public.<name>( before this migration, whole. */
function latestFunction(name) {
  const start = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${name}\\s*\\(`, "gi");
  let found = null;
  for (const file of BEFORE_THIS) {
    const sql = text(file);
    for (const m of sql.matchAll(start)) {
      const open = /\bAS\s+(\$[A-Za-z_]*\$)/i.exec(sql.slice(m.index));
      if (!open) continue;
      const bodyAt = m.index + open.index + open[0].length;
      const close = sql.indexOf(open[1], bodyAt);
      const end = sql.indexOf(";", close + open[1].length);
      found = { file, sql: sql.slice(m.index, end + 1) };
    }
  }
  if (!found) throw new Error(`no definition of public.${name} in the migrations`);
  return found;
}

/** The last CREATE POLICY "<name>" ON public.<table> before this migration (dropped ones excluded). */
function latestPolicy(name, table) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const create = new RegExp(`CREATE\\s+POLICY\\s+"${esc}"\\s+ON\\s+(?:public\\.)?${table}\\b[\\s\\S]*?;`, "gi");
  const drop = new RegExp(`DROP\\s+POLICY\\s+(?:IF\\s+EXISTS\\s+)?"${esc}"\\s+ON\\s+(?:public\\.)?${table}\\b`, "gi");
  let found = null;
  for (const file of BEFORE_THIS) {
    const sql = text(file).replace(/--[^\n]*/g, "");
    const events = [
      ...[...sql.matchAll(create)].map((m) => ({ at: m.index, sql: m[0] })),
      ...[...sql.matchAll(drop)].map((m) => ({ at: m.index, sql: null })),
    ].sort((a, b) => a.at - b.at);
    for (const e of events) found = e.sql ? { file, sql: e.sql } : null;
  }
  if (!found) throw new Error(`policy "${name}" on ${table} is not live per the migrations`);
  return found;
}

const APPLICANT = "10000000-0000-4000-8000-000000000001";
const OTHER_APPLICANT = "10000000-0000-4000-8000-000000000002";
const OWNER = "20000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS = "20000000-0000-4000-8000-000000000002";
const TEAM_ALL = "20000000-0000-4000-8000-000000000003"; // every job of OWNER's, manages the pipeline
const TEAM_THIS = "20000000-0000-4000-8000-000000000004"; // assigned to JOB only, cannot manage the pipeline
const TEAM_OTHER_JOB = "20000000-0000-4000-8000-000000000005"; // assigned to JOB_2 only
const DEVELOPER = "20000000-0000-4000-8000-000000000006";
const JOB = "50000000-0000-4000-8000-000000000001";
const JOB_2 = "50000000-0000-4000-8000-000000000002";
const OTHER_JOB = "50000000-0000-4000-8000-000000000003";
const APP = "30000000-0000-4000-8000-000000000001"; // scored before the migration
const APP_BLANK = "30000000-0000-4000-8000-000000000002"; // nothing to move
const APP_OTHER = "30000000-0000-4000-8000-000000000003"; // another business's applicant
const STAMP = "2026-10-20 08:00:00+00";

const db = new PGlite();
await db.exec(`
  create schema auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create or replace function auth.role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant anon, authenticated, service_role to postgres;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
  create publication supabase_realtime;

  create type public.app_role as enum ('employer', 'candidate', 'team_member', 'developer');
  create table public.user_roles (user_id uuid, role public.app_role);
  create table public.jobs (id uuid primary key, employer_id uuid not null, title text);
  create table public.team_members (
    user_id uuid, employer_id uuid, status text,
    can_manage_pipeline boolean default false, can_create_jobs boolean default false, can_delete_jobs boolean default false,
    assigned_job_ids uuid[]
  );
  create table public.documents (id uuid primary key default gen_random_uuid(), application_id uuid, candidate_signed_at timestamptz, status text);
  -- ai_score as double precision on purpose: the repo's migrations disagree
  -- about its type, and the new table must take whatever applications has.
  create table public.applications (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.jobs(id),
    candidate_id uuid not null,
    status text default 'in_progress',
    cover_letter text,
    resume_url text,
    ai_analysis text,
    ai_score double precision,
    notes text,
    phase text,
    phase_ai_analysis text,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    employer_notes text,
    voice_interview_result jsonb,
    voice_interview_language text,
    voice_interview_duration integer,
    voice_interview_recording_url text,
    voice_interview_language_rule text,
    voice_interview_video_enabled boolean,
    voice_interview_transcript jsonb,
    rejected_by uuid,
    rejected_by_type text,
    resume_score numeric,
    source text,
    external_provider text,
    external_application_id text,
    ai_scorecard jsonb
  );
  alter table public.applications enable row level security;
  grant select, insert, update, delete on public.applications to authenticated;
  grant all on public.applications to service_role;
  grant select on public.jobs, public.team_members, public.user_roles, public.documents to authenticated, service_role;

  -- What protect_application_columns reads; not what this test is about.
  create table public.trusted_result_enforcement (result_key text primary key, enforced boolean);
  create function public.protected_application_notes_subset(p jsonb) returns jsonb language sql immutable as $$ select '{}'::jsonb $$;
  create function public.protected_trusted_result_notes_subset(p jsonb) returns jsonb language sql immutable as $$ select '{}'::jsonb $$;

  insert into public.jobs values ('${JOB}', '${OWNER}', 'Support agent'), ('${JOB_2}', '${OWNER}', 'Team lead'), ('${OTHER_JOB}', '${OTHER_BUSINESS}', 'Elsewhere');
  insert into public.team_members values
    ('${TEAM_ALL}', '${OWNER}', 'active', true, false, false, null),
    ('${TEAM_THIS}', '${OWNER}', 'active', false, false, false, array['${JOB}']::uuid[]),
    ('${TEAM_OTHER_JOB}', '${OWNER}', 'active', true, false, false, array['${JOB_2}']::uuid[]);
  insert into public.user_roles values ('${APPLICANT}', 'candidate'), ('${OTHER_APPLICANT}', 'candidate'), ('${OWNER}', 'employer'),
    ('${OTHER_BUSINESS}', 'employer'), ('${DEVELOPER}', 'developer');
`);

// The real access helpers and rules, latest definition of each.
const replayed = [];
for (const name of ["update_updated_at_column", "has_role", "is_job_owner", "is_active_team_member_for_job", "protect_application_columns", "protect_application_staff_columns", "applications_insert_starts_clean"]) {
  const { file, sql } = latestFunction(name);
  await db.exec(sql);
  replayed.push(`${name} (${file})`);
}
for (const name of [
  "Candidates can view their own applications",
  "Candidates can create applications",
  "Candidates can update their own applications",
  "Candidates can delete their own applications",
  "Employers can view applications to their jobs",
  "Employers can update applications to their jobs",
  "Employers can delete applications to their jobs",
  "Team members can view applications for assigned jobs",
  "Team members can update applications if permitted",
  "Team members can delete applications if permitted",
  "Developers can view all applications",
]) {
  const { file, sql } = latestPolicy(name, "applications");
  await db.exec(sql);
  replayed.push(`"${name}" (${file})`);
}
await db.exec(`
  create trigger update_applications_updated_at before update on public.applications for each row execute function public.update_updated_at_column();
  create trigger protect_applications_candidate_writes before update on public.applications for each row execute function public.protect_application_columns();
  create trigger applications_protect_staff_columns before update on public.applications for each row execute function public.protect_application_staff_columns();
  create trigger applications_insert_starts_clean before insert on public.applications for each row execute function public.applications_insert_starts_clean();
`);
await db.exec(text("20261011201000_applications_staff_list.sql"));
console.log(`Replayed: ${replayed.join("; ")}; 20261011201000_applications_staff_list.sql\n`);

// Before the migration: one scored application, one with nothing yet, one of
// another business's. Written as the system (the insert-clean trigger would
// clear an applicant's own).
await db.exec(`
  select set_config('request.jwt.claim.role', 'service_role', false);
  insert into public.applications (id, job_id, candidate_id, status, phase, notes, ai_score, ai_analysis, ai_scorecard, phase_ai_analysis, employer_notes, created_at, updated_at)
  values
    ('${APP}', '${JOB}', '${APPLICANT}', 'reviewing', 'step_chat', '{"applicationAnswers":[{"answer":"yes"}]}', 72.5, 'Strong resume.', '{"overallScore":72.5,"whyDown":["late"]}', 'Chat practice: solid.', 'Call Monday.', '${STAMP}', '${STAMP}'),
    ('${APP_BLANK}', '${JOB}', '${OTHER_APPLICANT}', 'in_progress', 'application', null, null, null, null, null, null, '${STAMP}', '${STAMP}'),
    ('${APP_OTHER}', '${OTHER_JOB}', '${OTHER_APPLICANT}', 'reviewing', 'step_1', null, 40, 'Elsewhere.', '{"overallScore":40}', 'Other summary.', 'Their notes.', '${STAMP}', '${STAMP}');
  select set_config('request.jwt.claim.role', '', false);
`);

try {
  await db.exec(text(MIGRATION));
  check("the migration applies", true);
} catch (e) {
  check("the migration applies", false, e.message);
  process.exit(1);
}

async function as(uid, role, sql) {
  const pgRole = role === "service_role" ? "service_role" : role === "anon" ? "anon" : "authenticated";
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); select set_config('request.jwt.claim.role', '${role}', false); set role ${pgRole};`);
  try {
    const r = await db.query(sql);
    return { rows: r.rows, error: null, count: r.affectedRows };
  } catch (e) {
    return { rows: [], error: e.message ?? String(e) };
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claim.role', '', false);`);
  }
}
const evalOf = async (id) => (await db.query(`select * from public.application_evaluations where application_id = $1`, [id])).rows[0] ?? null;
const appOf = async (id) => (await db.query(`select * from public.applications where id = $1`, [id])).rows[0] ?? null;
const FIVE = ["ai_score", "ai_analysis", "ai_scorecard", "phase_ai_analysis", "employer_notes"];
const allNull = (row) => !!row && FIVE.every((c) => row[c] === null);

// ── The backfill ──────────────────────────────────────────────────────────
{
  const e = await evalOf(APP);
  check(
    "the backfill moved every value of the scored application",
    e && e.ai_score === 72.5 && e.ai_analysis === "Strong resume." && e.ai_scorecard?.overallScore === 72.5 && e.phase_ai_analysis === "Chat practice: solid." && e.employer_notes === "Call Monday.",
    JSON.stringify(e),
  );
  const a = await appOf(APP);
  check("...and left the applicant's row with none of them", allNull(a), JSON.stringify(a));
  check("...without touching updated_at (clearing hidden columns is no activity)", new Date(a.updated_at).toISOString() === new Date(STAMP).toISOString(), String(a.updated_at));
  check("an application with nothing to move gets no row", (await evalOf(APP_BLANK)) === null);
  check("another business's application moved too", (await evalOf(APP_OTHER))?.ai_score === 40);
  const type = (await db.query(`select format_type(atttypid, atttypmod) as t from pg_attribute where attrelid = 'public.application_evaluations'::regclass and attname = 'ai_score'`)).rows[0]?.t;
  check("ai_score takes applications' own type (double precision here)", type === "double precision", type);
}

// ── Who reads ─────────────────────────────────────────────────────────────
{
  const own = await as(APPLICANT, "authenticated", `select ${FIVE.join(", ")} from public.applications where id = '${APP}'`);
  check("the applicant reads their own application", own.error === null && own.rows.length === 1, own.error);
  check("...with none of the five in it", allNull(own.rows[0]), JSON.stringify(own.rows[0]));
  const view = await as(APPLICANT, "authenticated", `select ${FIVE.join(", ")} from public.applications_staff_list where id = '${APP}'`);
  check("the staff lists' view gives the applicant their row with all five NULL", view.error === null && view.rows.length === 1 && allNull(view.rows[0]), view.error ?? JSON.stringify(view.rows[0]));
  const evals = await as(APPLICANT, "authenticated", `select * from public.application_evaluations`);
  check("the applicant reads nothing from application_evaluations", evals.error === null && evals.rows.length === 0, evals.error ?? JSON.stringify(evals.rows));
  const byId = await as(APPLICANT, "authenticated", `select * from public.application_evaluations where application_id = '${APP}'`);
  check("...not even their own application's, asked by id", byId.rows.length === 0);
  const embedLike = await as(APPLICANT, "authenticated", `select a.id, e.ai_score from public.applications a left join public.application_evaluations e on e.application_id = a.id where a.id = '${APP}'`);
  check("...nor through a join (what an embedded select does)", embedLike.rows.length === 1 && embedLike.rows[0].ai_score === null, JSON.stringify(embedLike.rows));
  const anon = await as(null, "anon", `select * from public.application_evaluations`);
  check("a signed-out visitor is refused outright", !!anon.error && /permission denied/.test(anon.error), anon.error ?? "no error");

  for (const [who, uid] of [["the job's owner", OWNER], ["a teammate on every job", TEAM_ALL], ["a teammate assigned to this job", TEAM_THIS], ["a developer", DEVELOPER]]) {
    const r = await as(uid, "authenticated", `select application_id, ai_score, employer_notes from public.application_evaluations where application_id = '${APP}'`);
    check(`${who} reads the evaluation`, r.rows.length === 1 && r.rows[0].ai_score === 72.5 && r.rows[0].employer_notes === "Call Monday.", r.error ?? JSON.stringify(r.rows));
  }
  const ownerView = await as(OWNER, "authenticated", `select ai_score, ai_scorecard, phase_ai_analysis, employer_notes, ai_analysis from public.applications_staff_list where id = '${APP}'`);
  check("the owner's staff list shows the score, the scorecard, the summary and the notes", ownerView.rows[0]?.ai_score === 72.5 && ownerView.rows[0]?.ai_scorecard?.whyDown?.[0] === "late" && ownerView.rows[0]?.phase_ai_analysis === "Chat practice: solid." && ownerView.rows[0]?.employer_notes === "Call Monday.", JSON.stringify(ownerView.rows));
  const ownerEmbed = await as(OWNER, "authenticated", `select count(*)::int as n from public.application_evaluations`);
  check("the owner sees their own business's evaluations only", ownerEmbed.rows[0]?.n === 1, JSON.stringify(ownerEmbed.rows));
  const otherJob = await as(TEAM_OTHER_JOB, "authenticated", `select * from public.application_evaluations where application_id = '${APP}'`);
  check("a teammate assigned only to another job reads nothing", otherJob.rows.length === 0, JSON.stringify(otherJob.rows));
  const otherBiz = await as(OTHER_BUSINESS, "authenticated", `select application_id from public.application_evaluations`);
  check("another business reads only its own applicant's", otherBiz.rows.length === 1 && otherBiz.rows[0].application_id === APP_OTHER, JSON.stringify(otherBiz.rows));
  const otherBizView = await as(OTHER_BUSINESS, "authenticated", `select * from public.applications_staff_list where id = '${APP}'`);
  check("...and nothing of this business's through the staff view", otherBizView.rows.length === 0);
}

// ── Writes through applications land in application_evaluations ─────────
{
  const writes = [
    ["ai_score", "88", (e) => e.ai_score === 88],
    ["ai_analysis", "'Re-read: stronger.'", (e) => e.ai_analysis === "Re-read: stronger."],
    ["ai_scorecard", `'{"overallScore":88,"riskFlags":["none"]}'`, (e) => e.ai_scorecard?.overallScore === 88],
    ["phase_ai_analysis", "'Typing: 61 wpm.'", (e) => e.phase_ai_analysis === "Typing: 61 wpm."],
    ["employer_notes", "'Hire if references check out.'", (e) => e.employer_notes === "Hire if references check out."],
  ];
  for (const [col, value, landed] of writes) {
    const w = await as(null, "service_role", `update public.applications set ${col} = ${value} where id = '${APP}'`);
    const e = await evalOf(APP);
    const a = await appOf(APP);
    check(`the system's write of ${col} lands in application_evaluations`, w.error === null && landed(e), w.error ?? JSON.stringify(e));
    check(`...and applications.${col} stays NULL`, a[col] === null, JSON.stringify(a[col]));
  }
  const before = await evalOf(APP);
  await as(null, "service_role", `update public.applications set ai_score = 91, ai_scorecard = '{"overallScore":91}', ai_analysis = 'Third read.' where id = '${APP}'`);
  const three = await evalOf(APP);
  check("one write of three columns (what trigger-ava-analysis sends) lands all three", three.ai_score === 91 && three.ai_scorecard?.overallScore === 91 && three.ai_analysis === "Third read.");
  check("...and leaves the other two as they were", three.phase_ai_analysis === before.phase_ai_analysis && three.employer_notes === before.employer_notes);
  check("...and stamps the evaluation's updated_at", new Date(three.updated_at) >= new Date(before.updated_at));

  const noteBlank = await as(null, "service_role", `update public.applications set ai_score = 50 where id = '${APP_BLANK}'`);
  check("the first value for an application with no evaluation yet makes its row", noteBlank.error === null && (await evalOf(APP_BLANK))?.ai_score === 50, noteBlank.error);

  const ownerNotes = await as(OWNER, "authenticated", `update public.applications set employer_notes = 'Owner: call Tuesday.', status = 'rejected', rejected_by = '${OWNER}', rejected_by_type = 'user' where id = '${APP}'`);
  check("the owner's decline reason (useCockpitData's reject) lands", ownerNotes.error === null && (await evalOf(APP)).employer_notes === "Owner: call Tuesday.", ownerNotes.error);
  check("...with the status change on applications as before", (await appOf(APP)).status === "rejected");
  const teamNotes = await as(TEAM_ALL, "authenticated", `update public.applications set employer_notes = 'Team: called.' where id = '${APP}'`);
  check("a teammate who manages the pipeline writes the notes too", teamNotes.error === null && (await evalOf(APP)).employer_notes === "Team: called.", teamNotes.error);
  const cleared = await as(OWNER, "authenticated", `update public.applications set employer_notes = null where id = '${APP}'`);
  check("clearing the notes (ApplicantNotesDialog's empty save) clears them", cleared.error === null && (await evalOf(APP)).employer_notes === null, cleared.error);
  await as(OWNER, "authenticated", `update public.applications set employer_notes = 'Back again.' where id = '${APP}'`);
  const reread = await as(null, "service_role", `update public.applications set ai_scorecard = null where id = '${APP}'`);
  check("a re-analysis that saves no scorecard clears the old one", reread.error === null && (await evalOf(APP)).ai_scorecard === null);
  await as(null, "service_role", `update public.applications set ai_scorecard = '{"overallScore":91}' where id = '${APP}'`);
  const untouched = await as(OWNER, "authenticated", `update public.applications set status = 'reviewing' where id = '${APP}'`);
  check("a write that sets none of the five leaves the evaluation alone", untouched.error === null && (await evalOf(APP)).ai_score === 91 && (await evalOf(APP)).employer_notes === "Back again.");
}

// ── The applicant never writes it ─────────────────────────────────────────
{
  const snapshot = JSON.stringify(await evalOf(APP));
  for (const [col, value] of [["ai_score", "100"], ["ai_analysis", "'Perfect.'"], ["ai_scorecard", `'{"overallScore":100}'`], ["phase_ai_analysis", "'Strong hire.'"], ["employer_notes", "'Hire me.'"]]) {
    const w = await as(APPLICANT, "authenticated", `update public.applications set ${col} = ${value} where id = '${APP}'`);
    check(`an applicant's ${col} is refused`, !!w.error && w.error.includes(`cannot change ${col}`), w.error ?? "no error");
  }
  for (const col of FIVE) {
    const w = await as(APPLICANT, "authenticated", `update public.applications set ${col} = null where id = '${APP}'`);
    check(`an applicant's NULL for ${col} (what their row shows) is no error`, w.error === null, w.error);
  }
  check("...and none of it reached the team's evaluation", JSON.stringify(await evalOf(APP)) === snapshot, JSON.stringify(await evalOf(APP)));
  const own = await as(APPLICANT, "authenticated", `update public.applications set cover_letter = 'Updated', notes = '{"applicationAnswers":[{"answer":"still yes"}]}' where id = '${APP}'`);
  check("the applicant's own columns are still theirs", own.error === null, own.error);
  await db.exec(`select set_config('hireflow.in_quiz_submit', 'on', false)`);
  const quiz = await as(APPLICANT, "authenticated", `update public.applications set phase_ai_analysis = 'Quiz: 8/10 correct.' where id = '${APP}'`);
  await db.exec(`select set_config('hireflow.in_quiz_submit', '', false)`);
  check("the quiz submit function's own summary, on the applicant's behalf, lands", quiz.error === null && (await evalOf(APP)).phase_ai_analysis === "Quiz: 8/10 correct.", quiz.error);
  check("...and is not on the applicant's row", (await appOf(APP)).phase_ai_analysis === null);

  const direct = await as(APPLICANT, "authenticated", `update public.application_evaluations set employer_notes = 'x' where application_id = '${APP}'`);
  check("an applicant cannot write application_evaluations directly", direct.error === null && direct.count === 0, direct.error ?? `rows ${direct.count}`);
  const insert = await as(APPLICANT, "authenticated", `insert into public.application_evaluations (application_id, ai_score) values ('${APP}', 100)`);
  check("...nor insert into it", !!insert.error && /permission denied/.test(insert.error), insert.error ?? "no error");
  const del = await as(OWNER, "authenticated", `delete from public.application_evaluations where application_id = '${APP}'`);
  check("nobody deletes from it directly, the owner included", !!del.error && /permission denied/.test(del.error), del.error ?? "no error");
}

// ── Direct writes of the notes, and only the notes ───────────────────────
{
  const notes = await as(OWNER, "authenticated", `update public.application_evaluations set employer_notes = 'Direct note.' where application_id = '${APP}'`);
  check("the owner may write the notes directly", notes.error === null && notes.count === 1 && (await evalOf(APP)).employer_notes === "Direct note.", notes.error ?? `rows ${notes.count}`);
  const score = await as(OWNER, "authenticated", `update public.application_evaluations set ai_score = 99 where application_id = '${APP}'`);
  check("...but not the score", !!score.error && /permission denied/.test(score.error), score.error ?? "no error");
  const viewer = await as(TEAM_THIS, "authenticated", `update public.application_evaluations set employer_notes = 'x' where application_id = '${APP}'`);
  check("a teammate who cannot manage the pipeline writes nothing", viewer.error === null && viewer.count === 0, viewer.error ?? `rows ${viewer.count}`);
  const other = await as(OTHER_BUSINESS, "authenticated", `update public.application_evaluations set employer_notes = 'x' where application_id = '${APP}'`);
  check("another business writes nothing", other.error === null && other.count === 0, other.error ?? `rows ${other.count}`);
  check("the notes are as the owner left them", (await evalOf(APP)).employer_notes === "Direct note.");
}

// ── New applications ──────────────────────────────────────────────────────
{
  const imported = "30000000-0000-4000-8000-000000000010";
  const ins = await as(null, "service_role", `insert into public.applications (id, job_id, candidate_id, status, ai_score, employer_notes) values ('${imported}', '${JOB}', '${OTHER_APPLICANT}', 'pending', 64, 'From the job board.')`);
  check("a system insert that carries a score and notes saves them in application_evaluations", ins.error === null && (await evalOf(imported))?.ai_score === 64 && (await evalOf(imported))?.employer_notes === "From the job board.", ins.error ?? JSON.stringify(await evalOf(imported)));
  check("...and the new row holds none of the five", allNull(await appOf(imported)));
  const forged = "30000000-0000-4000-8000-000000000011";
  const own = await as(APPLICANT, "authenticated", `insert into public.applications (id, job_id, candidate_id, ai_score, ai_scorecard, employer_notes) values ('${forged}', '${JOB_2}', '${APPLICANT}', 100, '{"overallScore":100}', 'Hire.')`);
  check("an applicant's own insert goes through (the form opening)", own.error === null, own.error);
  check("...with no evaluation made from what it carried", (await evalOf(forged)) === null && allNull(await appOf(forged)));
}

// ── Deleting the application deletes its evaluation ─────────────────────
{
  check("the evaluation exists before the delete", (await evalOf(APP_BLANK)) !== null);
  const gone = await as(OWNER, "authenticated", `delete from public.applications where id = '${APP_BLANK}'`);
  check("deleting the application deletes its evaluation", gone.error === null && (await evalOf(APP_BLANK)) === null, gone.error);
}

// ── Order, publication, a second run ─────────────────────────────────────
{
  const order = (await db.query(`
    select tgname, (tgtype & 4) <> 0 as on_insert, (tgtype & 16) <> 0 as on_update
      from pg_trigger
     where tgrelid = 'public.applications'::regclass and not tgisinternal and (tgtype & 2) <> 0
     order by tgname`)).rows;
  const ours = order.filter((t) => t.tgname.startsWith("zz_applications_evaluation_"));
  check("six triggers: the insert one and one per column", ours.length === 6, ours.map((t) => t.tgname).join(", "));
  const firstOurs = order.findIndex((t) => t.tgname.startsWith("zz_applications_evaluation_"));
  const after = order.slice(firstOurs).filter((t) => !t.tgname.startsWith("zz_applications_evaluation_"));
  check("they fire after every other BEFORE trigger on applications (PostgreSQL goes by name)", firstOurs > 0 && after.length === 0, order.map((t) => t.tgname).join(", "));
  const pub = (await db.query(`select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'application_evaluations'`)).rows.length;
  check("application_evaluations is in the realtime publication (the staff shell merges scores live)", pub === 1);
  const rls = (await db.query(`select relrowsecurity from pg_class where oid = 'public.application_evaluations'::regclass`)).rows[0]?.relrowsecurity;
  check("row level security is on", rls === true);
  const beforeRerun = JSON.stringify(await evalOf(APP));
  let rerun = null;
  try {
    await db.exec(text(MIGRATION));
  } catch (e) {
    rerun = e.message;
  }
  check("running the migration a second time is safe", rerun === null, rerun);
  check("...and loses nothing", JSON.stringify(await evalOf(APP)) === beforeRerun);
}

// ── No migration after this one puts the five back where an applicant reads ──
{
  const later = FILES.filter((f) => f > MIGRATION);
  const back = later.filter((f) => /alter\s+table\s+(public\.)?application_evaluations\s+disable\s+row\s+level|drop\s+trigger\s+(if\s+exists\s+)?zz_applications_evaluation_/i.test(text(f).replace(/--[^\n]*/g, "")));
  check("no later migration turns off the table's RLS or drops its triggers", back.length === 0, back.join(", "));
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
