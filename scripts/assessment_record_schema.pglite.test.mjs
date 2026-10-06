#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261005230146_assessment_record.sql
 * — real Postgres (PGlite), plain assertions, the migration read off disk and
 * applied VERBATIM, twice (it must be re-runnable).
 *
 * The fixture reproduces just enough of the live schema (read from
 * production on 2026-10-06 with read-only SQL): the application_status and
 * notification_type enums, profiles / jobs / applications / team_members /
 * notifications with their live columns, the live bodies of is_job_owner()
 * and is_active_team_member_for_job(), Supabase's default privileges (anon
 * and authenticated get everything on new tables and functions; RLS and
 * REVOKEs do the restricting), and the supabase_realtime publication.
 * auth.uid()/auth.role() read the request claims, as on Supabase.
 *
 * It proves, as the roles that will really call it:
 *   - anon gets nothing: no rows, no function;
 *   - another candidate gets nothing and can write nothing for someone
 *     else's application;
 *   - the candidate can record only for their own application and only for
 *     steps they have reached; Decision and unknown steps are refused; a
 *     closed (rejected) application is refused; a finished step is refused;
 *   - the candidate can never read the tables, and start never returns
 *     grading or context;
 *   - the employer and an active team member scoped to the job read
 *     sessions and events; a team member scoped to another job and an
 *     inactive one read nothing;
 *   - the integrity card is created once per recipient, then UPDATED with
 *     the running tally (never duplicated) and comes back unread; the
 *     application form step and record-only kinds create no card; a
 *     sub-second blip does not ping;
 *   - the per-session event cap holds; a repeated client id is stored once;
 *   - turns written by the service role get seq, application_id and job_id
 *     from the session, a repeated client_msg_id inserts nothing, and the
 *     turn counters move; events cannot be edited;
 *   - the form draft, quiz timing, heartbeat, form submission and the
 *     "left / came back" cycle behave as docs/ASSESSMENT-RECORD.md says;
 *   - a heartbeat alone is not activity, and the page's progress hint is
 *     replaced (it cannot grow without limit);
 *   - the page cannot forge the keys the server writes into an integrity
 *     event, and an implausible page clock is not stored as a time;
 *   - a candidate cannot plant or rewrite a grouped / integrity bell card;
 *   - an applicant who sets their own status to "pending" reopens nothing;
 *     a staff hand-back does, once, until the retake's result lands;
 *   - the quiz session closes when the quiz result lands; the sweep never
 *     marks a finished step as "left"; a write racing a submit cannot open
 *     a second attempt of a finished step;
 *   - opening a finished step completes (result_recorded) an attempt left
 *     'active', or stuck in 'grading' / 'failed' for more than 7 minutes,
 *     and never a younger 'grading' or 'failed' one;
 *   - a grading claim whose request died (7 minutes untouched) never reads
 *     "being checked" for ever: start, the heartbeat and the sweep make it
 *     'failed' (claim_expired, the page sends again) when no result is on
 *     file, 'completed' when one is; a younger claim is left alone;
 *   - assessment_sessions (not events) is in supabase_realtime.
 *
 * Run with: node scripts/assessment_record_schema.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not URL.pathname: the checkout lives in "HireFlow 1", and a
// pathname keeps the space as %20.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20261005230146_assessment_record.sql");
// The computer and connection check (docs/EQUIPMENT-CHECK.md): the step type
// in the CHECK, the title, the completion CASE and the access list.
const EQUIPMENT_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20261006124409_equipment_check.sql");

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

// Invented people (example.com), fixed ids.
const EMPLOYER = "10000000-0000-4000-8000-000000000001";
const OTHER_EMPLOYER = "10000000-0000-4000-8000-000000000002";
const TEAM_SCOPED = "10000000-0000-4000-8000-000000000003";
const TEAM_OTHER_JOB = "10000000-0000-4000-8000-000000000004";
const TEAM_INACTIVE = "10000000-0000-4000-8000-000000000005";
const CANDIDATE = "20000000-0000-4000-8000-000000000001";
const OTHER_CANDIDATE = "20000000-0000-4000-8000-000000000002";
const JOB = "30000000-0000-4000-8000-000000000001";
const OTHER_JOB = "30000000-0000-4000-8000-000000000002";
const APP = "40000000-0000-4000-8000-000000000001";
const OTHER_APP = "40000000-0000-4000-8000-000000000002";

const SCHEMA_SQL = `
  create schema auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create or replace function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
  $$;

  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant anon to postgres;
  grant authenticated to postgres;
  grant service_role to postgres;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant execute on function auth.role() to anon, authenticated, service_role;

  -- Supabase's live default privileges in public (pg_default_acl, read
  -- 2026-10-06): client roles get everything on new tables, sequences and
  -- functions; RLS and REVOKEs do the restricting.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

  create type public.application_status as enum
    ('pending', 'reviewing', 'interview', 'offered', 'hired', 'rejected', 'in_progress');
  create type public.notification_type as enum
    ('message', 'application', 'interview', 'status_update', 'team', 'system');

  create table public.profiles (
    user_id uuid primary key,
    email text,
    full_name text
  );

  create table public.jobs (
    id uuid primary key default gen_random_uuid(),
    employer_id uuid not null,
    title text not null,
    workflow_steps jsonb default '[]'::jsonb,
    quiz_questions jsonb default '[]'::jsonb,
    application_questions jsonb default '[]'::jsonb,
    processing_mode text default 'auto'
  );

  create table public.applications (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.jobs(id) on delete cascade,
    candidate_id uuid not null,
    status public.application_status not null default 'pending',
    phase text default 'application',
    notes text,
    voice_interview_result jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table public.team_members (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    employer_id uuid not null,
    status text default 'active',
    can_create_jobs boolean default false,
    can_delete_jobs boolean default false,
    can_manage_pipeline boolean default false,
    assigned_job_ids uuid[] default '{}'
  );

  create table public.notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    type public.notification_type not null,
    title text not null,
    message text not null,
    link text,
    is_read boolean not null default false,
    created_at timestamptz not null default now(),
    push_sent_at timestamptz
  );

  -- Live bodies (pg_get_functiondef, production, 2026-10-06).
  CREATE OR REPLACE FUNCTION public.is_job_owner(p_job_id uuid, p_user_id uuid)
   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$
    SELECT (p_user_id = auth.uid() OR auth.role() = 'service_role')
      AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = p_job_id AND j.employer_id = p_user_id);
  $function$;

  CREATE OR REPLACE FUNCTION public.is_active_team_member_for_job(p_job_id uuid, p_user_id uuid,
    p_require_manage_pipeline boolean DEFAULT false, p_require_create_jobs boolean DEFAULT false,
    p_require_delete_jobs boolean DEFAULT false)
   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$
    SELECT (p_user_id = auth.uid() OR auth.role() = 'service_role')
      AND EXISTS (
        SELECT 1
        FROM public.jobs j
        JOIN public.team_members tm ON tm.employer_id = j.employer_id
        WHERE j.id = p_job_id
          AND tm.user_id = p_user_id
          AND tm.status = 'active'
          AND (NOT p_require_manage_pipeline OR tm.can_manage_pipeline = true)
          AND (NOT p_require_create_jobs OR tm.can_create_jobs = true)
          AND (NOT p_require_delete_jobs OR tm.can_delete_jobs = true)
          AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY (tm.assigned_job_ids))
      );
  $function$;

  -- RLS the live tables already have, cut down to what this proof touches.
  alter table public.applications enable row level security;
  create policy "candidate reads own" on public.applications for select using (auth.uid() = candidate_id);
  create policy "candidate updates own" on public.applications for update using (auth.uid() = candidate_id);
  create policy "job owner reads" on public.applications for select using (public.is_job_owner(job_id, auth.uid()));
  create policy "job owner updates" on public.applications for update using (public.is_job_owner(job_id, auth.uid()));
  alter table public.notifications enable row level security;
  create policy "own notifications" on public.notifications for select using (auth.uid() = user_id);
  create policy "own notifications update" on public.notifications for update using (auth.uid() = user_id);
  create policy "own notifications delete" on public.notifications for delete using (auth.uid() = user_id);
  -- Production's "Related parties can insert notifications", cut down to the
  -- branches this proof needs: anyone for themselves, staff for an applicant
  -- of their job, and an APPLICANT FOR THE EMPLOYER of a job they applied to
  -- (the branch that would let a candidate plant a card).
  create policy "related parties insert" on public.notifications for insert to authenticated with check (
    auth.uid() = user_id
    or exists (select 1 from public.applications a
                where a.candidate_id = notifications.user_id
                  and (public.is_job_owner(a.job_id, auth.uid()) or public.is_active_team_member_for_job(a.job_id, auth.uid())))
    or exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id
                where a.candidate_id = auth.uid() and j.employer_id = notifications.user_id)
  );

  create publication supabase_realtime;
  alter publication supabase_realtime add table public.applications, public.notifications;
`;

async function main() {
  const db = new PGlite();
  const migrationSql = await readFile(MIGRATION_PATH, "utf8").catch(() => null);
  check("migration file exists on disk", migrationSql != null, MIGRATION_PATH);
  const equipmentSql = await readFile(EQUIPMENT_MIGRATION_PATH, "utf8").catch(() => null);
  check("the equipment_check migration exists on disk", equipmentSql != null, EQUIPMENT_MIGRATION_PATH);
  if (!migrationSql || !equipmentSql) {
    console.log(`\n${failed} of ${passed + failed} checks failed.`);
    process.exit(1);
  }

  await db.exec(SCHEMA_SQL);

  // ---------------------------------------------------------------- fixture
  const WORKFLOW = [
    { id: "step_typing", type: "typing_test", title: "Typing speed and accuracy" },
    { id: "step_chat", type: "chat_simulation", title: "Player chat practice" },
    { id: "step_interview", type: "chat_interview", title: "Written interview" },
  ];
  const QUIZ = [
    { id: "zq1", question: "Q1", options: ["a", "b"], type: "multiple_choice" },
    { id: "zq2", question: "Q2", options: ["a", "b"], type: "multiple_choice" },
    { id: "zq3", question: "Q3", options: ["a", "b"], type: "multiple_choice" },
  ];
  const FORM = [
    { id: "fq1", question: "Full name", type: "text" },
    { id: "fq2", question: "Shifts", type: "multi_select" },
    { id: "fq3", question: "Phone", type: "phone" },
    { id: "fq4", question: "Why us", type: "textarea" },
  ];
  await db.query(
    `insert into public.profiles (user_id, email, full_name) values
       ($1, 'owner@example.com', 'Owner Person'), ($2, 'robin@example.com', 'Robin Okafor'),
       ($3, 'sam@example.com', null), ($4, 'scoped@example.com', 'Scoped Teammate')`,
    [EMPLOYER, CANDIDATE, OTHER_CANDIDATE, TEAM_SCOPED],
  );
  await db.query(
    `insert into public.jobs (id, employer_id, title, workflow_steps, quiz_questions, application_questions) values
       ($1, $2, 'Chat agent', $3, $4, $5), ($6, $7, 'Other job', '[]', '[]', '[]')`,
    [JOB, EMPLOYER, JSON.stringify(WORKFLOW), JSON.stringify(QUIZ), JSON.stringify(FORM), OTHER_JOB, OTHER_EMPLOYER],
  );
  await db.query(
    `insert into public.team_members (user_id, employer_id, status, assigned_job_ids) values
       ($1, $4, 'active', '{}'),
       ($2, $4, 'active', array[$5::uuid]),
       ($3, $4, 'revoked', '{}')`,
    [TEAM_SCOPED, TEAM_OTHER_JOB, TEAM_INACTIVE, EMPLOYER, OTHER_JOB],
  );
  await db.query(
    `insert into public.applications (id, job_id, candidate_id, status, phase, notes) values
       ($1, $2, $3, 'in_progress', 'application', '{}'),
       ($4, $2, $5, 'in_progress', 'application', '{}')`,
    [APP, JOB, CANDIDATE, OTHER_APP, OTHER_CANDIDATE],
  );

  // ------------------------------------------------- apply, verbatim, twice
  let migrationError = null;
  try {
    await db.exec(migrationSql);
    await db.exec(migrationSql);
  } catch (e) {
    migrationError = e.message;
  }
  check("the migration applies cleanly, and again (re-runnable)", migrationError === null, migrationError ?? "");
  let equipmentError = null;
  try {
    await db.exec(equipmentSql);
    await db.exec(equipmentSql);
  } catch (e) {
    equipmentError = e.message;
  }
  check("the equipment_check migration applies on top, and again (re-runnable)", equipmentError === null, equipmentError ?? "");
  if (equipmentError) migrationError = equipmentError;
  if (migrationError) {
    console.log(`\n${passed} passed, ${failed} failed.`);
    process.exit(1);
  }

  // ---------------------------------------------------------------- helpers
  async function as(uid, role) {
    await db.exec(`reset role;`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]);
    await db.query(`select set_config('request.jwt.claim.role', $1, false)`, [role]);
    await db.exec(`set role ${role};`);
  }
  async function asOwner() {
    await db.exec(`reset role;`);
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    await db.query(`select set_config('request.jwt.claim.role', '', false)`);
  }
  async function q(sql, params = []) {
    try {
      const res = await db.query(sql, params);
      return { ok: true, rows: res.rows };
    } catch (e) {
      return { ok: false, error: e.message, code: e.code };
    }
  }
  async function rpc(uid, role, fn, args) {
    await as(uid, role);
    const names = Object.keys(args);
    const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as r`;
    const res = await q(sql, names.map((n) => args[n]));
    await asOwner();
    return res.ok ? { ok: true, r: res.rows[0].r } : res;
  }
  const asCandidate = (fn, args) => rpc(CANDIDATE, "authenticated", fn, args);
  const asOtherCandidate = (fn, args) => rpc(OTHER_CANDIDATE, "authenticated", fn, args);
  const ev = (o) => JSON.stringify(o);
  // Page clocks near the real now: the server keeps client_at only within
  // [attempt start - 1 day, now + 10 min].
  const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();
  async function notificationsFor(uid) {
    return (await db.query(`select * from public.notifications where user_id = $1 order by created_at`, [uid])).rows;
  }
  async function setApp(fields) {
    await asOwner();
    const keys = Object.keys(fields);
    await db.query(
      `update public.applications set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where id = $1`,
      [APP, ...keys.map((k) => fields[k])],
    );
  }
  async function sessionRow(stepId) {
    return sessionRowFor(APP, stepId);
  }
  async function sessionRowFor(applicationId, stepId) {
    await asOwner();
    return (await db.query(
      `select * from public.assessment_sessions where application_id = $1 and step_id = $2 order by attempt desc limit 1`,
      [applicationId, stepId],
    )).rows[0];
  }
  async function eventsOf(sessionId) {
    await asOwner();
    return (await db.query(`select * from public.assessment_events where session_id = $1 order by seq`, [sessionId])).rows;
  }
  async function selectAs(uid, role, table) {
    await as(uid, role);
    const res = await q(`select count(*)::int as n from public.${table}`);
    await asOwner();
    return res;
  }

  // =========================================================================
  console.log("\nShape and wiring:\n");

  const pub = (await db.query(
    `select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`,
  )).rows.map((r) => r.tablename);
  check("assessment_sessions is in supabase_realtime", pub.includes("assessment_sessions"), pub.join(","));
  check("assessment_events is NOT in supabase_realtime", !pub.includes("assessment_events"), pub.join(","));

  const enumVals = (await db.query(`select unnest(enum_range(null::public.notification_type))::text as v`)).rows.map((r) => r.v);
  check("notification_type has the 'integrity' value", enumVals.includes("integrity"), enumVals.join(","));
  const groupKeyCol = (await db.query(
    `select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='group_key'`,
  )).rows.length;
  check("notifications.group_key exists", groupKeyCol === 1);

  const rls = (await db.query(
    `select relname, relrowsecurity from pg_class where relname in ('assessment_sessions','assessment_events') order by 1`,
  )).rows;
  check("RLS is on for both tables", rls.length === 2 && rls.every((r) => r.relrowsecurity));
  const policies = (await db.query(
    `select tablename, cmd, roles::text as roles from pg_policies where tablename in ('assessment_sessions','assessment_events') order by 1`,
  )).rows;
  check(
    "each table has exactly one policy, SELECT, for authenticated",
    policies.length === 2 && policies.every((p) => p.cmd === "SELECT" && /authenticated/.test(p.roles)),
    JSON.stringify(policies),
  );
  const reopenPolicies = (await db.query(
    `select cmd, roles::text as roles from pg_policies where tablename = 'assessment_step_reopens'`,
  )).rows;
  check(
    "assessment_step_reopens has RLS and one staff SELECT policy",
    reopenPolicies.length === 1 && reopenPolicies[0].cmd === "SELECT"
      && (await db.query(`select relrowsecurity from pg_class where relname = 'assessment_step_reopens'`)).rows[0]?.relrowsecurity === true,
    JSON.stringify(reopenPolicies),
  );
  const touchOverloads = (await db.query(
    `select pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'touch_assessment_session'`,
  )).rows;
  check(
    "touch_assessment_session has exactly one signature, with p_active (no PostgREST ambiguity)",
    touchOverloads.length === 1 && /p_active boolean/.test(touchOverloads[0].args),
    JSON.stringify(touchOverloads),
  );

  // =========================================================================
  console.log("\nanon gets nothing:\n");

  for (const table of ["assessment_sessions", "assessment_events", "assessment_step_reopens"]) {
    const res = await selectAs(null, "anon", table);
    check(`anon cannot read ${table}`, !res.ok && /permission denied/i.test(res.error), res.error ?? JSON.stringify(res.rows));
  }
  for (const [fn, args] of [
    ["start_assessment_session", { p_application_id: APP, p_step_id: "application" }],
    ["record_integrity_events", { p_application_id: APP, p_step_id: "application", p_events: "[]" }],
    ["save_application_draft", { p_application_id: APP, p_answers: "{}" }],
    ["record_quiz_answer", { p_application_id: APP, p_question_id: "zq1", p_answer: null }],
    ["touch_assessment_session", { p_session_id: APP }],
  ]) {
    const res = await rpc(null, "anon", fn, args);
    check(`anon cannot call ${fn}`, !res.ok && /permission denied/i.test(res.error), res.error);
  }
  for (const [fn, args] of [
    ["open_assessment_session", { p_application_id: APP, p_step_id: "application", p_candidate_id: CANDIDATE }],
    ["mark_stale_assessment_sessions", {}],
    ["assessment_step_access", { p_application_id: APP, p_step_id: "application", p_caller: CANDIDATE }],
    ["assessment_step_completion", { p_application_id: APP, p_step_id: "application", p_step_type: "application", p_app_status: "in_progress", p_phase: "application", p_notes: "{}", p_voice_result: null }],
  ]) {
    const res = await asCandidate(fn, args);
    check(`a signed-in applicant cannot call the server-only ${fn}`, !res.ok && /permission denied/i.test(res.error), res.error);
  }

  // =========================================================================
  console.log("\nThe application form (status in_progress):\n");

  let res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "application" });
  check("the applicant can open their form session", res.ok, res.error);
  const formStart = res.r;
  check(
    "it is a new active attempt 1, not finished, not resumed, with no turns",
    formStart?.status === "active" && formStart.attempt === 1 && formStart.finished === false
      && formStart.resumed === false && Array.isArray(formStart.turns) && formStart.turns.length === 0,
    JSON.stringify(formStart),
  );

  res = await asCandidate("save_application_draft", {
    p_application_id: APP,
    p_answers: ev({ fq1: "Robin Okafor", fq2: ["Mornings", "Weekends"], fq3: "   ", fq4: "", _phoneCountryCodes: { fq3: "+1" } }),
  });
  check("the applicant can save a draft", res.ok, res.error);
  check(
    "progress counts only filled answers to real questions (2 of 4: blanks and _keys do not count)",
    res.r?.answered === 2 && res.r?.total === 4,
    JSON.stringify(res.r),
  );
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "application" });
  check(
    "reopening the form resumes the same attempt and hands the draft back",
    res.ok && res.r.session_id === formStart.session_id && res.r.resumed === true && res.r.draft?.fq1 === "Robin Okafor",
    JSON.stringify(res.r ?? res.error),
  );
  let formSession = await sessionRow("application");
  let formEvents = await eventsOf(formSession.id);
  check(
    "the record says it was started, then reloaded",
    formEvents.map((e) => e.detail.what).join(",") === "started,reloaded",
    formEvents.map((e) => `${e.kind}:${e.detail.what}`).join(","),
  );

  res = await asCandidate("record_integrity_events", {
    p_application_id: APP,
    p_step_id: "application",
    p_events: ev([{ kind: "tab_hidden", duration_ms: 95000, client_at: minutesAgo(2) }]),
  });
  check("integrity on the form is recorded", res.ok && res.r.accepted === 1, JSON.stringify(res.r ?? res.error));
  check("but raises no alert", res.r?.alerted === false);
  check("and puts nothing in anyone's bell", (await notificationsFor(EMPLOYER)).length === 0);

  // The page cannot forge the keys the server writes, and a bad clock is not a time.
  res = await asCandidate("record_integrity_events", {
    p_application_id: APP,
    p_step_id: "application",
    p_events: ev([
      { kind: "right_click", id: "f1", client_at: "infinity",
        detail: { after_end: true, duration_ms: 200, kind: "paste", reported_kind: "x", client_at_raw: "forged", note: "kept" } },
      { kind: "tab_hidden", id: "f2", client_at: "epoch", detail: { after_end: true, duration_ms: 200 } },
      { kind: "right_click", id: "f3", client_at: minutesAgo(1) },
      { kind: "right_click", id: "f4", client_at: "not a time" },
      { kind: "right_click", id: "f5", client_at: new Date(Date.now() + 2 * 3600_000).toISOString() },
    ]),
  });
  check("five page events with odd details are accepted", res.ok && res.r.accepted === 5, JSON.stringify(res.r ?? res.error));
  formSession = await sessionRow("application");
  const byId = Object.fromEntries((await eventsOf(formSession.id)).filter((e) => e.client_msg_id).map((e) => [e.client_msg_id, e]));
  check(
    "the page's own kind / duration_ms / reported_kind / after_end / client_at_raw never survive; its other keys do",
    byId.f1?.detail.kind === "right_click" && !("duration_ms" in byId.f1.detail) && !("reported_kind" in byId.f1.detail)
      && !("after_end" in byId.f1.detail) && byId.f1.detail.client_at_raw === "infinity" && byId.f1.detail.note === "kept",
    JSON.stringify(byId.f1?.detail),
  );
  check(
    "a live away episode the page labelled 'after sending, 200 ms' is stored as neither",
    byId.f2?.detail.kind === "tab_hidden" && !("after_end" in byId.f2.detail) && !("duration_ms" in byId.f2.detail)
      && byId.f2.duration_ms == null,
    JSON.stringify(byId.f2),
  );
  check(
    "client_at 'infinity', 'epoch', unparsable and two hours ahead are stored as NULL with the page's text kept",
    byId.f1?.client_at == null && byId.f2?.client_at == null && byId.f2.detail.client_at_raw === "epoch"
      && byId.f4?.client_at == null && byId.f4.detail.client_at_raw === "not a time"
      && byId.f5?.client_at == null && typeof byId.f5.detail.client_at_raw === "string",
    JSON.stringify([byId.f1?.client_at, byId.f2?.client_at, byId.f4?.client_at, byId.f5?.client_at]),
  );
  check("a plausible page time is kept as client_at", byId.f3?.client_at != null && !("client_at_raw" in byId.f3.detail), JSON.stringify(byId.f3));

  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "quiz" });
  check("the quiz is refused before it is reached", !res.ok && res.code === "HF003" && /step_not_reached/.test(res.error), `${res.code} ${res.error}`);
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "decision" });
  check("the closing Decision stage is not a step", !res.ok && res.code === "HF002", `${res.code} ${res.error}`);
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "made_up" });
  check("an unknown step is refused", !res.ok && res.code === "HF002", `${res.code} ${res.error}`);

  // =========================================================================
  console.log("\nAnother applicant gets nothing:\n");

  res = await asOtherCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "application" });
  check("cannot open someone else's step", !res.ok && res.code === "42501", `${res.code} ${res.error}`);
  res = await asOtherCandidate("record_integrity_events", { p_application_id: APP, p_step_id: "application", p_events: ev([{ kind: "paste" }]) });
  check("cannot record integrity on someone else's application", !res.ok && res.code === "42501", `${res.code} ${res.error}`);
  res = await asOtherCandidate("save_application_draft", { p_application_id: APP, p_answers: ev({ fq1: "x" }) });
  check("cannot write someone else's draft", !res.ok && res.code === "42501", `${res.code} ${res.error}`);
  res = await asOtherCandidate("touch_assessment_session", { p_session_id: formSession.id, p_hidden: true });
  check("cannot heartbeat someone else's session", !res.ok && res.code === "42501", `${res.code} ${res.error}`);
  res = await rpc(OTHER_CANDIDATE, "authenticated", "record_quiz_answer", { p_application_id: APP, p_question_id: "zq1", p_answer: ev("a") });
  check("cannot answer someone else's quiz", !res.ok && res.code === "42501", `${res.code} ${res.error}`);
  for (const table of ["assessment_sessions", "assessment_events"]) {
    let r2 = await selectAs(OTHER_CANDIDATE, "authenticated", table);
    check(`another applicant reads 0 rows of ${table}`, r2.ok && r2.rows[0].n === 0, JSON.stringify(r2));
    r2 = await selectAs(CANDIDATE, "authenticated", table);
    check(`the applicant themself reads 0 rows of ${table} (no candidate policy)`, r2.ok && r2.rows[0].n === 0, JSON.stringify(r2));
  }
  await as(CANDIDATE, "authenticated");
  let w = await q(`insert into public.assessment_events (session_id, kind) values ($1, 'system')`, [formSession.id]);
  check("the applicant cannot insert an event directly", !w.ok && /permission denied/i.test(w.error), w.error);
  w = await q(`update public.assessment_sessions set grading = '{}' where id = $1`, [formSession.id]);
  check("the applicant cannot update a session directly", !w.ok && /permission denied/i.test(w.error), w.error);
  await asOwner();

  // =========================================================================
  console.log("\nSending the form closes its session:\n");

  await as(CANDIDATE, "authenticated");
  w = await q(`update public.applications set status = 'pending' where id = $1`, [APP]);
  await asOwner();
  check("(fixture) the applicant submits the form", w.ok, w.error);
  formSession = await sessionRow("application");
  check(
    "the form session is completed, end_reason submitted",
    formSession.status === "completed" && formSession.end_reason === "submitted" && formSession.ended_at != null,
    `${formSession.status} ${formSession.end_reason}`,
  );
  formEvents = await eventsOf(formSession.id);
  check("with a 'submitted' marker", formEvents.at(-1)?.detail?.what === "submitted");
  res = await asCandidate("save_application_draft", { p_application_id: APP, p_answers: ev({ fq1: "late" }) });
  check("a draft after sending is refused (step_finished)", !res.ok && res.code === "HF004", `${res.code} ${res.error}`);
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "application" });
  check("opening the sent form says finished, without turns", res.ok && res.r.finished === true && res.r.turns.length === 0, JSON.stringify(res.r ?? res.error));

  // A draft save that read "not sent yet" just before the form was sent
  // reaches the session plumbing with that stale answer. Under the lock it
  // must decide again, and must not open a second form attempt.
  await asOwner();
  await db.exec(`set role service_role;`);
  const staleAccess = ev({
    application_id: APP, job_id: JOB, candidate_id: CANDIDATE, step_id: "application",
    step_type: "application", finished: false, reopened: false,
  });
  w = await q(`select public.assessment_session_for_write($1::jsonb) as r`, [staleAccess]);
  await asOwner();
  check("a write racing the form submit is refused (step_finished), not given attempt 2", !w.ok && w.code === "HF004", `${w.code} ${w.error}`);
  const formAttempts = (await db.query(`select count(*)::int as n from public.assessment_sessions where application_id = $1 and step_id = 'application'`, [APP])).rows[0].n;
  check("so the form still has exactly one attempt", formAttempts === 1, `${formAttempts}`);

  // =========================================================================
  console.log("\nQuiz: shown and answered on the server's clock:\n");

  await setApp({ phase: "quiz", status: "reviewing" });
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "quiz" });
  check("the quiz opens once reached", res.ok && res.r.status === "active", res.error);
  const quizSessionId = res.r?.session_id;

  res = await asCandidate("record_quiz_answer", { p_application_id: APP, p_question_id: "zq1", p_answer: null });
  check("a question can be marked shown", res.ok && res.r.recorded === "shown" && res.r.question_index === 0, JSON.stringify(res.r ?? res.error));
  // Make "shown" lie 12 s in the past, as if the applicant read for 12 s.
  // (Events are append-only, so the fixture lifts that trigger for this one
  // back-dating write and puts it straight back.)
  await asOwner();
  await db.exec(`alter table public.assessment_events disable trigger assessment_events_append_only`);
  await db.query(`update public.assessment_events set created_at = now() - interval '12 seconds' where session_id = $1 and kind = 'quiz_shown'`, [quizSessionId]);
  await db.exec(`alter table public.assessment_events enable trigger assessment_events_append_only`);

  res = await asCandidate("record_quiz_answer", { p_application_id: APP, p_question_id: "zq1", p_answer: null });
  let shownCount = (await eventsOf(quizSessionId)).filter((e) => e.kind === "quiz_shown").length;
  check("marking the same question shown again stores nothing new", res.ok && shownCount === 1, `${shownCount}`);

  res = await asCandidate("record_quiz_answer", { p_application_id: APP, p_question_id: "zq1", p_answer: ev(1) });
  check("an answer is recorded", res.ok && res.r.recorded === "answer", JSON.stringify(res.r ?? res.error));
  check(
    "seconds on the question come from the server's shown time (about 12 s)",
    res.r?.seconds_on_question >= 11.5 && res.r?.seconds_on_question <= 14,
    `${res.r?.seconds_on_question}`,
  );
  check("progress counts it (1 of 3)", res.r?.answered === 1 && res.r?.total === 3, JSON.stringify(res.r));
  const banned = /correct|is_?correct|score|key/i;
  check("the reply carries nothing about correctness", !Object.keys(res.r ?? {}).some((k) => banned.test(k)), Object.keys(res.r ?? {}).join(","));
  let quizEvents = await eventsOf(quizSessionId);
  const answerEvent = quizEvents.find((e) => e.kind === "quiz_answer");
  check(
    "the stored answer has question_id, answer, seconds_on_question, timing_source 'server' and no correctness",
    answerEvent?.detail.question_id === "zq1" && answerEvent.detail.answer === 1
      && answerEvent.detail.timing_source === "server" && typeof answerEvent.detail.seconds_on_question === "number"
      && !Object.keys(answerEvent.detail).some((k) => /correct/i.test(k)),
    JSON.stringify(answerEvent?.detail),
  );
  res = await asCandidate("record_quiz_answer", { p_application_id: APP, p_question_id: "zq2", p_answer: ev(0), p_shown_at: "1999-01-01T00:00:00Z" });
  quizEvents = await eventsOf(quizSessionId);
  const second = quizEvents.filter((e) => e.kind === "quiz_answer").at(-1);
  check(
    "a page-claimed shown time outside the attempt is not trusted",
    res.ok && second.detail.timing_source === "previous_answer",
    JSON.stringify(second?.detail),
  );
  res = await asCandidate("record_quiz_answer", { p_application_id: APP, p_question_id: "zq1", p_answer: ev(0) });
  quizEvents = await eventsOf(quizSessionId);
  check(
    "changing an answer adds an event marked changed, and still counts 2 answered",
    res.ok && res.r.answered === 2 && quizEvents.filter((e) => e.kind === "quiz_answer").at(-1).detail.changed === true,
    JSON.stringify(res.r ?? res.error),
  );
  res = await asCandidate("record_quiz_answer", { p_application_id: APP, p_question_id: "zq99", p_answer: ev(0) });
  check("an unknown question is refused", !res.ok && res.code === "22023", `${res.code} ${res.error}`);
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "quiz" });
  check(
    "resuming the quiz hands back the latest answers and the shown times, never correctness",
    res.ok && res.r.quiz?.answers?.zq1 === 0 && res.r.quiz?.answers?.zq2 === 0 && !!res.r.quiz?.shown_at?.zq1,
    JSON.stringify(res.r?.quiz ?? res.error),
  );

  res = await asCandidate("record_quiz_answer", { p_application_id: APP, p_question_id: "zq3", p_answer: null, p_shown_at: "infinity" });
  quizEvents = await eventsOf(quizSessionId);
  const shownZq3 = quizEvents.find((e) => e.kind === "quiz_shown" && e.detail.question_id === "zq3");
  check(
    "a page shown-time of 'infinity' is not stored as a time (client_at NULL, the text kept aside)",
    res.ok && shownZq3?.client_at == null && !("client_shown_at" in shownZq3.detail) && shownZq3.detail.client_shown_at_raw === "infinity",
    JSON.stringify(shownZq3),
  );

  // submit_quiz_attempt writes the result into notes (here, the fixture does).
  await setApp({ notes: JSON.stringify({ quiz: { completedAt: "2026-10-06T10:10:00Z" }, quizResult: { score: 100 } }) });
  let quizSession = await sessionRow("quiz");
  check(
    "the quiz session closes the moment the quiz result lands (completed, submitted)",
    quizSession.status === "completed" && quizSession.end_reason === "submitted" && quizSession.ended_at != null,
    `${quizSession.status} ${quizSession.end_reason}`,
  );
  check("with a 'submitted' marker", (await eventsOf(quizSession.id)).at(-1)?.detail?.what === "submitted");
  res = await asCandidate("record_quiz_answer", { p_application_id: APP, p_question_id: "zq3", p_answer: ev(0) });
  check("after the quiz is sent, answers are refused (step_finished)", !res.ok && res.code === "HF004", `${res.code} ${res.error}`);
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "quiz" });
  check("opening a sent quiz says finished", res.ok && res.r.finished === true && res.r.attempt === 1, JSON.stringify(res.r ?? res.error));

  // A quiz retake is staff clearing its result (move_applicant_to_phase does);
  // the lock-time re-check must still let attempt 2 open.
  await setApp({ notes: JSON.stringify({}) });
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "quiz" });
  check("a quiz handed back by clearing its result opens attempt 2", res.ok && res.r.finished === false && res.r.attempt === 2, JSON.stringify(res.r ?? res.error));
  await setApp({ notes: JSON.stringify({ quiz: { completedAt: "2026-10-06T10:20:00Z" }, quizResult: { score: 90 } }) });
  quizSession = await sessionRow("quiz");
  check("and its result landing closes attempt 2 as well", quizSession.attempt === 2 && quizSession.status === "completed", `${quizSession.attempt} ${quizSession.status}`);

  // =========================================================================
  console.log("\nChat practice: turns written by the server:\n");

  await setApp({ phase: "step_chat" });

  // Self-heal: a result recorded by a path that does not close its session.
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "step_typing" });
  check("an earlier step they reached (typing) opens", res.ok && res.r.status === "active" && res.r.attempt === 1, JSON.stringify(res.r ?? res.error));
  const NOTES_WITH_TYPING = { quiz: { completedAt: "2026-10-06T10:20:00Z" }, quizResult: { score: 90 }, typingTestResult: { wpm: 52, accuracy: 97 } };
  await setApp({ notes: JSON.stringify(NOTES_WITH_TYPING) });
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "step_typing" });
  const typingSession = await sessionRow("step_typing");
  check(
    "once its result is on file, opening it says finished and closes the attempt left open (result_recorded)",
    res.ok && res.r.finished === true && typingSession.status === "completed" && typingSession.end_reason === "result_recorded",
    `${JSON.stringify(res.r ?? res.error)} ${typingSession.status} ${typingSession.end_reason}`,
  );

  // An attempt whose grading request died after the result landed (the
  // attempt was never completed): opening the finished step completes it once
  // the claim is older than 7 minutes, the server's stale-claim limit. A
  // younger one may still be completed by its own request.
  async function addTypingAttempt(attempt, status, grading = null) {
    await asOwner();
    return (await db.query(
      `insert into public.assessment_sessions (application_id, job_id, candidate_id, step_id, step_type, attempt, status, grading)
       values ($1, $2, $3, 'step_typing', 'typing_test', $4, $5, $6) returning id`,
      [APP, JOB, CANDIDATE, attempt, status, grading ? JSON.stringify(grading) : null],
    )).rows[0].id;
  }
  async function ageAttempt(id, minutes) {
    // updated_at is stamped by a trigger on every write; age it with the trigger off.
    await asOwner();
    await db.exec(`alter table public.assessment_sessions disable trigger assessment_sessions_before_write`);
    await db.query(`update public.assessment_sessions set updated_at = now() - $2::int * interval '1 minute' where id = $1`, [id, minutes]);
    await db.exec(`alter table public.assessment_sessions enable trigger assessment_sessions_before_write`);
  }
  async function attemptRow(id) {
    await asOwner();
    return (await db.query(`select * from public.assessment_sessions where id = $1`, [id])).rows[0];
  }
  const stuckGrading = await addTypingAttempt(2, "grading");
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "step_typing" });
  let stuck = await attemptRow(stuckGrading);
  check(
    "a finished step whose attempt is being graded right now: left 'grading' (its request may still complete it)",
    res.ok && res.r.finished === true && res.r.status === "grading" && stuck.status === "grading" && stuck.ended_at === null,
    `${JSON.stringify(res.r ?? res.error)} ${stuck.status}`,
  );
  await ageAttempt(stuckGrading, 6);
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "step_typing" });
  stuck = await attemptRow(stuckGrading);
  check("…still left alone at 6 minutes", res.ok && stuck.status === "grading", stuck.status);
  await ageAttempt(stuckGrading, 8);
  await db.exec(`set role service_role;`);
  w = await q(`select public.open_assessment_session($1, 'step_typing', $2) as r`, [APP, CANDIDATE]);
  await asOwner();
  stuck = await attemptRow(stuckGrading);
  check(
    "stuck in 'grading' for 8 minutes: completed (result_recorded) when the step is opened",
    w.ok && w.rows[0].r.finished === true && stuck.status === "completed" && stuck.end_reason === "result_recorded" && stuck.ended_at !== null,
    `${w.error ?? ""} ${stuck.status} ${stuck.end_reason}`,
  );
  const stuckFailed = await addTypingAttempt(3, "failed", { last_error: "Failed to save: boom" });
  await ageAttempt(stuckFailed, 8);
  const youngFailed = await addTypingAttempt(4, "failed", { last_error: "just now" });
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "step_typing" });
  const failedOld = await attemptRow(stuckFailed);
  const failedYoung = await attemptRow(youngFailed);
  check(
    "a 'failed' attempt of a finished step older than 7 minutes is completed too, keeping its error for staff",
    res.ok && res.r.finished === true && failedOld.status === "completed" && failedOld.end_reason === "result_recorded" && failedOld.grading?.last_error === "Failed to save: boom",
    `${failedOld.status} ${failedOld.end_reason} ${JSON.stringify(failedOld.grading)}`,
  );
  check("…a younger 'failed' one is not", failedYoung.status === "failed" && failedYoung.ended_at === null, failedYoung.status);
  // The heartbeat expires a dead claim of a finished step too: the page waiting
  // on "being checked" reads 'completed' instead of waiting for ever.
  const stuckForTouch = await addTypingAttempt(5, "grading");
  await ageAttempt(stuckForTouch, 9);
  res = await asCandidate("touch_assessment_session", { p_session_id: stuckForTouch });
  const touchedFinished = await attemptRow(stuckForTouch);
  check(
    "a heartbeat on a finished step's claim dead for 9 minutes: completed (result_recorded), and says so",
    res.ok && res.r.updated === false && res.r.status === "completed"
      && touchedFinished.status === "completed" && touchedFinished.end_reason === "result_recorded",
    `${JSON.stringify(res.r ?? res.error)} ${touchedFinished.status}`,
  );
  await asOwner();
  await db.query(`delete from public.assessment_sessions where application_id = $1 and step_id = 'step_typing' and attempt > 1`, [APP]);

  // A grading claim whose request DIED before any result landed (the worker
  // killed mid-grading: wall clock, memory, a restart). Nothing else moves it,
  // so start, the heartbeat and the sweep each turn it into 'failed' (the
  // result is still owed: the page sends again and the server claims it from
  // 'failed'). A younger claim is left alone.
  async function addChatAttempt(status) {
    await asOwner();
    return (await db.query(
      `insert into public.assessment_sessions (application_id, job_id, candidate_id, step_id, step_type, attempt, status)
       values ($1, $2, $3, 'step_chat', 'chat_simulation', 1, $4) returning id`,
      [APP, JOB, CANDIDATE, status],
    )).rows[0].id;
  }
  const deadClaim = await addChatAttempt("grading");
  await ageAttempt(deadClaim, 3);
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "step_chat" });
  let dead = await attemptRow(deadClaim);
  check(
    "an unfinished step whose claim is 3 minutes old: start returns it as it is ('grading', being checked)",
    res.ok && res.r.finished === false && res.r.session_id === deadClaim && res.r.status === "grading" && dead.status === "grading",
    `${JSON.stringify(res.r ?? res.error)} ${dead.status}`,
  );
  res = await asCandidate("touch_assessment_session", { p_session_id: deadClaim });
  check("…and the heartbeat reports 'grading' without touching it", res.ok && res.r.updated === false && res.r.status === "grading", JSON.stringify(res.r ?? res.error));
  await ageAttempt(deadClaim, 60);
  res = await asCandidate("touch_assessment_session", { p_session_id: deadClaim });
  dead = await attemptRow(deadClaim);
  check(
    "claim dead for 60 minutes, no result on file: the heartbeat says 'failed' (the page sends it again)",
    res.ok && res.r.updated === false && res.r.status === "failed" && dead.status === "failed" && dead.ended_at === null
      && dead.grading?.last_error === "claim_expired" && !!dead.grading?.failed_at,
    `${JSON.stringify(res.r ?? res.error)} ${dead.status} ${JSON.stringify(dead.grading)}`,
  );
  await asOwner();
  await db.query(`update public.assessment_sessions set status = 'grading', grading = null where id = $1`, [deadClaim]);
  await ageAttempt(deadClaim, 60);
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "step_chat" });
  dead = await attemptRow(deadClaim);
  check(
    "…and a reload (start) turns it into the same attempt, 'failed', not a new one and not 'being checked' for ever",
    res.ok && res.r.finished === false && res.r.session_id === deadClaim && res.r.attempt === 1 && res.r.status === "failed"
      && dead.status === "failed" && dead.grading?.last_error === "claim_expired",
    `${JSON.stringify(res.r ?? res.error)} ${dead.status}`,
  );
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "step_chat" });
  check("opening it again keeps the one owed attempt", res.ok && res.r.session_id === deadClaim && res.r.status === "failed", JSON.stringify(res.r ?? res.error));
  await asOwner();
  await db.query(`update public.assessment_sessions set status = 'grading', grading = null where id = $1`, [deadClaim]);
  await ageAttempt(deadClaim, 60);
  await db.exec(`set role service_role;`);
  w = await q(`select public.mark_stale_assessment_sessions() as n`);
  await asOwner();
  dead = await attemptRow(deadClaim);
  check(
    "the sweep expires a dead claim as well",
    w.ok && w.rows[0].n >= 1 && dead.status === "failed" && dead.grading?.last_error === "claim_expired",
    `${JSON.stringify(w.rows ?? w.error)} ${dead.status}`,
  );
  await db.exec(`set role authenticated;`);
  w = await q(`select public.assessment_expire_stale_claim($1) as r`, [deadClaim]);
  await asOwner();
  check("the applicant cannot call the expiry helper directly", !w.ok && /permission denied/i.test(w.error), w.error);
  await db.query(`delete from public.assessment_sessions where id = $1`, [deadClaim]);

  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "step_interview" });
  check("the interview is not reached while on chat practice", !res.ok && res.code === "HF003", `${res.code} ${res.error}`);
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "step_chat" });
  check("chat practice opens", res.ok && res.r.status === "active", res.error);
  const chatSessionId = res.r.session_id;

  await asOwner();
  await db.exec(`set role service_role;`);
  w = await q(
    `insert into public.assessment_events (session_id, kind, content, client_msg_id, detail) values
       ($1, 'assistant_turn', 'Hi, my deposit is missing.', null, '{"role":"customer"}'),
       ($1, 'candidate_turn', 'Sorry to hear that, let me check.', 'm1', '{"role":"agent"}')`,
    [chatSessionId],
  );
  check("the service role writes turns without seq, application_id or job_id", w.ok, w.error);
  w = await q(`insert into public.assessment_events (session_id, kind, content, client_msg_id) values ($1, 'candidate_turn', 'Sorry to hear that, let me check.', 'm1') returning id`, [chatSessionId]);
  check("a retried turn with the same client_msg_id inserts nothing", w.ok && w.rows.length === 0, JSON.stringify(w));
  w = await q(`update public.assessment_events set content = 'edited' where session_id = $1`, [chatSessionId]);
  check("events cannot be edited, even by the service role", !w.ok && /append-only/.test(w.error), w.error);
  w = await q(`update public.assessment_sessions set grading = '{"score": 41, "verdict": "No hire"}', context = '{"scenario":"Missing deposit"}' where id = $1`, [chatSessionId]);
  check("the service role writes grading and context", w.ok, w.error);
  await asOwner();

  const chatEvents = await eventsOf(chatSessionId);
  const turns = chatEvents.filter((e) => e.kind.endsWith("_turn"));
  check(
    "turns get consecutive seqs after the 'started' marker",
    chatEvents.map((e) => e.seq).join(",") === "1,2,3",
    chatEvents.map((e) => `${e.seq}:${e.kind}`).join(","),
  );
  check(
    "application_id and job_id come from the session",
    turns.every((e) => e.application_id === APP && e.job_id === JOB),
  );
  let chatSession = await sessionRow("step_chat");
  check(
    "the session counts 1 candidate turn and 1 assistant turn",
    chatSession.progress.candidate_turns === 1 && chatSession.progress.assistant_turns === 1,
    JSON.stringify(chatSession.progress),
  );
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "step_chat" });
  check(
    "after a reload the applicant gets their conversation back (turns only)",
    res.ok && res.r.turns.length === 2 && res.r.turns.every((t) => t.kind.endsWith("_turn")) && res.r.turns[1].client_msg_id === "m1",
    JSON.stringify(res.r?.turns ?? res.error),
  );
  check(
    "and never the grading or the server's context",
    res.ok && !("grading" in res.r) && !("context" in res.r) && !JSON.stringify(res.r).includes("No hire") && !JSON.stringify(res.r).includes("Missing deposit"),
    Object.keys(res.r ?? {}).join(","),
  );

  // =========================================================================
  console.log("\nThe owner's live integrity card:\n");

  res = await asCandidate("record_integrity_events", {
    p_application_id: APP,
    p_step_id: "step_chat",
    p_events: ev([
      { kind: "tab_hidden", duration_ms: 5000, client_at: minutesAgo(3), id: "e1" },
      { kind: "tab_hidden", duration_ms: 67000, client_at: minutesAgo(2), id: "e2" },
      { kind: "paste", id: "e3" },
    ]),
  });
  check("three events are accepted and alert", res.ok && res.r.accepted === 3 && res.r.alerted === true, JSON.stringify(res.r ?? res.error));
  let ownerCards = await notificationsFor(EMPLOYER);
  check("the employer gets exactly one card", ownerCards.length === 1, `${ownerCards.length}`);
  const card = ownerCards[0];
  check("it is an 'integrity' card linking to the applicant", card?.type === "integrity" && card.link === `/applicants/${APP}`, `${card?.type} ${card?.link}`);
  check("titled with the applicant's name", card?.title === "Integrity — Robin Okafor", card?.title);
  check(
    "with the running tally in plain words",
    card?.message === "During Player chat practice: left the window 2 times (1m 12s away), paste attempt x1",
    card?.message,
  );
  check("grouped by application and step", card?.group_key === `integrity:${APP}:step_chat`, card?.group_key);
  check("the scoped team member gets the same card", (await notificationsFor(TEAM_SCOPED)).length === 1);
  check("a team member scoped to another job gets none", (await notificationsFor(TEAM_OTHER_JOB)).length === 0);
  check("an inactive team member gets none", (await notificationsFor(TEAM_INACTIVE)).length === 0);
  check("the applicant gets none", (await notificationsFor(CANDIDATE)).length === 0);

  // The owner reads it; a new switch must bring it back, updated, not duplicated.
  await asOwner();
  await db.query(`update public.notifications set is_read = true, created_at = now() - interval '5 minutes' where user_id = $1`, [EMPLOYER]);
  res = await asCandidate("record_integrity_events", {
    p_application_id: APP,
    p_step_id: "step_chat",
    p_events: ev([{ kind: "window_blur", duration_ms: 3000, id: "e4" }]),
  });
  ownerCards = await notificationsFor(EMPLOYER);
  check("a later event updates the same card (still one)", res.ok && ownerCards.length === 1, `${ownerCards.length}`);
  check("the card is unread again", ownerCards[0]?.is_read === false);
  check(
    "and moved to the top (created_at is now)",
    Date.now() - new Date(ownerCards[0]?.created_at).getTime() < 60_000,
    String(ownerCards[0]?.created_at),
  );
  check(
    "with the new count",
    ownerCards[0]?.message === "During Player chat practice: left the window 3 times (1m 15s away), paste attempt x1",
    ownerCards[0]?.message,
  );

  res = await asCandidate("record_integrity_events", {
    p_application_id: APP,
    p_step_id: "step_chat",
    p_events: ev([{ kind: "paste", id: "e3" }]),
  });
  check("a retried event id is stored once", res.ok && res.r.accepted === 0 && res.r.duplicates === 1, JSON.stringify(res.r ?? res.error));

  await asOwner();
  await db.query(`update public.notifications set is_read = true where user_id = $1`, [EMPLOYER]);
  res = await asCandidate("record_integrity_events", {
    p_application_id: APP,
    p_step_id: "step_chat",
    p_events: ev([{ kind: "right_click" }, { kind: "window_blur", duration_ms: 400 }, { kind: "something_new", detail: { x: 1 } }]),
  });
  ownerCards = await notificationsFor(EMPLOYER);
  check("right-click, a sub-second blip and an unknown kind are recorded", res.ok && res.r.accepted === 3, JSON.stringify(res.r ?? res.error));
  check("but do not ping the owner", res.r?.alerted === false && ownerCards[0]?.is_read === true, JSON.stringify(ownerCards[0]));
  chatSession = await sessionRow("step_chat");
  const unknown = (await eventsOf(chatSessionId)).find((e) => e.kind === "integrity" && e.detail.reported_kind === "something_new");
  check("an unknown kind is kept as 'other' with what the page called it", unknown?.detail.kind === "other", JSON.stringify(unknown?.detail));
  check(
    "the summary keeps counts per kind, total and time away",
    chatSession.integrity_summary.counts.tab_hidden === 2 && chatSession.integrity_summary.counts.window_blur === 2
      && chatSession.integrity_summary.counts.paste === 1 && chatSession.integrity_summary.total === 7
      && chatSession.integrity_summary.away_ms === 75400 && chatSession.integrity_summary.short_away === 1,
    JSON.stringify(chatSession.integrity_summary),
  );
  const away = (await eventsOf(chatSessionId)).find((e) => e.client_msg_id === "e2");
  check(
    "an away episode keeps its duration and the page's time, with server time beside it",
    away?.duration_ms === 67000 && away.detail.duration_ms === 67000 && away.client_at != null && away.created_at != null,
    JSON.stringify(away),
  );

  // Production lets an applicant insert a notification for the employer of a
  // job they applied to. They must not be able to plant or pre-empt a card.
  const integrityGroup = `integrity:${APP}:step_chat`;
  const typingGroup = `integrity:${APP}:step_typing`;
  await as(CANDIDATE, "authenticated");
  w = await q(
    `insert into public.notifications (user_id, type, title, message, link, group_key)
     values ($1, 'integrity', 'Integrity — Robin Okafor', 'During Typing test: no issues found', $2, $3)`,
    [EMPLOYER, `/applicants/${APP}`, typingGroup],
  );
  check("an applicant cannot plant an integrity card for the employer", !w.ok && w.code === "42501", `${w.code} ${w.error}`);
  w = await q(
    `insert into public.notifications (user_id, type, title, message, group_key) values ($1, 'system', 'Integrity — Robin Okafor', 'no issues', $2)`,
    [EMPLOYER, typingGroup],
  );
  check("nor take a card's group slot with another type", !w.ok && w.code === "42501", `${w.code} ${w.error}`);
  w = await q(`insert into public.notifications (user_id, type, title, message) values ($1, 'integrity', 'x', 'y')`, [EMPLOYER]);
  check("nor insert an ungrouped 'integrity' card", !w.ok && w.code === "42501", `${w.code} ${w.error}`);
  // (No RETURNING: the applicant cannot read the employer's row back.)
  w = await q(`insert into public.notifications (user_id, type, title, message) values ($1, 'message', 'Hello', 'A question about the job')`, [EMPLOYER]);
  check("an ordinary notification to the employer still goes through (the existing path)", w.ok, w.error);
  await asOwner();
  const ordinaryId = (await db.query(`select id from public.notifications where user_id = $1 and type = 'message'`, [EMPLOYER])).rows[0]?.id;
  await as(EMPLOYER, "authenticated");
  w = await q(`update public.notifications set is_read = true where group_key = $1`, [integrityGroup]);
  check("the owner can still mark the live card read", w.ok, w.error);
  w = await q(`update public.notifications set message = 'edited' where group_key = $1`, [integrityGroup]);
  check("but not rewrite it", !w.ok && w.code === "42501", `${w.code} ${w.error}`);
  await asOwner();
  if (ordinaryId) await db.query(`delete from public.notifications where id = $1`, [ordinaryId]);

  // =========================================================================
  console.log("\nWho can read the record:\n");

  for (const [label, uid, expect] of [
    ["the employer", EMPLOYER, true],
    ["an active team member scoped to the job", TEAM_SCOPED, true],
    ["a team member scoped to another job", TEAM_OTHER_JOB, false],
    ["an inactive team member", TEAM_INACTIVE, false],
    ["another employer", OTHER_EMPLOYER, false],
  ]) {
    const s = await selectAs(uid, "authenticated", "assessment_sessions");
    const e = await selectAs(uid, "authenticated", "assessment_events");
    const sawSessions = s.ok && s.rows[0].n > 0;
    const sawEvents = e.ok && e.rows[0].n > 0;
    check(`${label} ${expect ? "reads" : "does not read"} sessions and events`, sawSessions === expect && sawEvents === expect, `${JSON.stringify(s)} ${JSON.stringify(e)}`);
  }
  await as(EMPLOYER, "authenticated");
  const staffView = await q(`select grading, integrity_summary from public.assessment_sessions where step_id = 'step_chat'`);
  await asOwner();
  check("the employer reads the grading", staffView.ok && staffView.rows[0]?.grading?.verdict === "No hire", JSON.stringify(staffView));

  // =========================================================================
  console.log("\nHeartbeat, leaving and coming back:\n");

  res = await asCandidate("touch_assessment_session", { p_session_id: chatSessionId, p_hidden: true, p_progress: ev({ screen: "chat", candidate_turns: 99 }) });
  chatSession = await sessionRow("step_chat");
  check("a hidden heartbeat sets hidden_at", res.ok && res.r.updated === true && chatSession.hidden_at != null, JSON.stringify(res.r ?? res.error));
  check(
    "the page's progress hint goes under progress.client and cannot touch the server's counts",
    chatSession.progress.client?.screen === "chat" && chatSession.progress.candidate_turns === 1,
    JSON.stringify(chatSession.progress),
  );
  res = await asCandidate("touch_assessment_session", { p_session_id: chatSessionId, p_hidden: false });
  chatSession = await sessionRow("step_chat");
  check("a visible heartbeat clears hidden_at", res.ok && chatSession.hidden_at == null, JSON.stringify(res.r ?? res.error));

  res = await asCandidate("touch_assessment_session", { p_session_id: chatSessionId, p_progress: ev({ question: 2 }) });
  chatSession = await sessionRow("step_chat");
  check(
    "a new hint replaces progress.client (the old keys go), the server's counts stay",
    res.ok && chatSession.progress.client?.question === 2 && !("screen" in chatSession.progress.client) && chatSession.progress.candidate_turns === 1,
    JSON.stringify(chatSession.progress),
  );
  for (let i = 0; i < 40; i += 1) {
    await asCandidate("touch_assessment_session", { p_session_id: chatSessionId, p_progress: ev({ [`k${i}`]: "x".repeat(3900) }) });
  }
  const progressBytes = (await db.query(`select octet_length(progress::text) as n from public.assessment_sessions where id = $1`, [chatSessionId])).rows[0].n;
  check("40 different 3.9 KB hints leave progress under 5 KB (no growth without limit)", progressBytes < 5000, `${progressBytes} bytes`);
  res = await asCandidate("touch_assessment_session", { p_session_id: chatSessionId, p_progress: ev({ big: "x".repeat(5000) }) });
  check("a hint over 4 KB is refused", !res.ok && res.code === "22023", `${res.code} ${res.error}`);

  await asOwner();
  await db.query(`update public.assessment_sessions set last_activity_at = now() - interval '20 minutes' where id = $1`, [chatSessionId]);
  res = await asCandidate("touch_assessment_session", { p_session_id: chatSessionId });
  chatSession = await sessionRow("step_chat");
  const quietMs = Date.now() - new Date(chatSession.last_activity_at).getTime();
  check(
    "a plain heartbeat from a visible but untouched page is NOT activity (still quiet 20 min, so it can read as left)",
    res.ok && res.r.updated === true && quietMs > 19 * 60_000 && Date.now() - new Date(chatSession.last_heartbeat_at).getTime() < 60_000,
    `quiet ${Math.round(quietMs / 1000)} s`,
  );
  res = await asCandidate("touch_assessment_session", { p_session_id: chatSessionId, p_active: true });
  chatSession = await sessionRow("step_chat");
  check(
    "a heartbeat that reports input (p_active) is activity",
    res.ok && Date.now() - new Date(chatSession.last_activity_at).getTime() < 60_000,
    String(chatSession.last_activity_at),
  );

  // The sweep: a quiet attempt whose step is already FINISHED is not "left".
  // (A typing attempt still open although its result is on file, written
  // straight in by the fixture.)
  await asOwner();
  await db.query(
    `insert into public.assessment_sessions (application_id, job_id, candidate_id, step_id, step_type, attempt)
     values ($1, $2, $3, 'step_typing', 'typing_test', 2)`,
    [APP, JOB, CANDIDATE],
  );
  await db.query(`update public.assessment_sessions set last_activity_at = now() - interval '45 minutes' where id = $1`, [chatSessionId]);
  await db.query(
    `update public.assessment_sessions set last_activity_at = now() - interval '45 minutes'
      where application_id = $1 and step_id = 'step_typing' and attempt = 2`,
    [APP],
  );
  await db.exec(`set role service_role;`);
  const marked = await q(`select public.mark_stale_assessment_sessions() as n`);
  await asOwner();
  chatSession = await sessionRow("step_chat");
  check(
    "the sweep marks a session quiet for 45 minutes as left",
    marked.ok && marked.rows[0].n === 2 && chatSession.status === "abandoned" && chatSession.end_reason === "left",
    JSON.stringify(marked),
  );
  const sweptTyping = await sessionRow("step_typing");
  check(
    "but completes (result_recorded), never 'left', a quiet attempt whose result is on file",
    sweptTyping.attempt === 2 && sweptTyping.status === "completed" && sweptTyping.end_reason === "result_recorded"
      && !(await eventsOf(sweptTyping.id)).some((e) => e.detail?.what === "marked_left"),
    `${sweptTyping.attempt} ${sweptTyping.status} ${sweptTyping.end_reason}`,
  );
  res = await asCandidate("touch_assessment_session", { p_session_id: chatSessionId });
  check("a heartbeat on it changes nothing and says so", res.ok && res.r.updated === false && res.r.status === "abandoned", JSON.stringify(res.r ?? res.error));
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "step_chat" });
  chatSession = await sessionRow("step_chat");
  const cameBack = (await eventsOf(chatSessionId)).filter((e) => e.kind === "system").at(-1);
  check(
    "coming back revives the same attempt, with its conversation",
    res.ok && res.r.session_id === chatSessionId && res.r.attempt === 1 && chatSession.status === "active" && res.r.turns.length === 2,
    JSON.stringify(res.r ?? res.error),
  );
  check("and a 'came_back' marker that says how long they were gone", cameBack?.detail?.what === "came_back" && cameBack.detail.away_ms >= 45 * 60 * 1000, JSON.stringify(cameBack?.detail));

  // =========================================================================
  console.log("\nAfter the test is sent:\n");

  await setApp({ notes: JSON.stringify({ quiz: { completedAt: "x" }, quizResult: {}, chatSimulationResult: { score: 41 } }) });
  await asOwner();
  await db.query(`update public.assessment_sessions set status = 'completed', ended_at = now(), end_reason = 'submitted' where id = $1`, [chatSessionId]);
  res = await asCandidate("record_integrity_events", { p_application_id: APP, p_step_id: "step_chat", p_events: ev([{ kind: "page_closed" }]) });
  const late = (await eventsOf(chatSessionId)).filter((e) => e.kind === "integrity").at(-1);
  check("a flush right after the end is kept, marked after_end", res.ok && res.r.accepted === 1 && late?.detail?.after_end === true, JSON.stringify(res.r ?? res.error));
  await db.query(`update public.assessment_sessions set ended_at = now() - interval '5 minutes' where id = $1`, [chatSessionId]);
  res = await asCandidate("record_integrity_events", { p_application_id: APP, p_step_id: "step_chat", p_events: ev([{ kind: "paste" }]) });
  check("later events for a sent test are refused", !res.ok && res.code === "HF004", `${res.code} ${res.error}`);
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "step_chat" });
  check("opening it says finished", res.ok && res.r.finished === true && res.r.status === "completed", JSON.stringify(res.r ?? res.error));

  // The applicant sets their own status to "pending" (production lets them:
  // protect_application_columns only refuses interview/offered/hired). With
  // phase still on the step, that is the phase pages' retake shape, but it
  // is NOT a staff hand-back and must reopen nothing.
  await as(CANDIDATE, "authenticated");
  w = await q(`update public.applications set status = 'pending' where id = $1`, [APP]);
  await asOwner();
  check("(fixture) the applicant sets their own status to pending", w.ok, w.error);
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "step_chat" });
  check(
    "their own 'pending' does not reopen the finished step: start still says finished, attempt 1",
    res.ok && res.r.finished === true && res.r.attempt === 1 && res.r.status === "completed",
    JSON.stringify(res.r ?? res.error),
  );
  await db.exec(`set role service_role;`);
  w = await q(`select public.assessment_step_access($1, 'step_chat', $2) as r`, [APP, CANDIDATE]);
  await asOwner();
  check(
    "and the server's access rule (what the grading gate reads) says finished, not reopened",
    w.ok && w.rows[0].r.finished === true && w.rows[0].r.reopened === false,
    JSON.stringify(w.rows?.[0]?.r ?? w.error),
  );
  check(
    "no reopen marker was written for it",
    (await db.query(`select count(*)::int as n from public.assessment_step_reopens where application_id = $1`, [APP])).rows[0].n === 0,
  );
  res = await asCandidate("record_integrity_events", { p_application_id: APP, p_step_id: "step_chat", p_events: ev([{ kind: "paste" }]) });
  check("and recording for it is still refused", !res.ok && res.code === "HF004", `${res.code} ${res.error}`);

  // A retake staff opened: the employer hands the step back (status pending,
  // phase = the step), the shape move_applicant_to_phase writes.
  await setApp({ status: "reviewing" });
  await as(EMPLOYER, "authenticated");
  w = await q(`update public.applications set status = 'pending', phase = 'step_chat' where id = $1`, [APP]);
  await asOwner();
  check("(fixture) the employer hands chat practice back", w.ok, w.error);
  const marker = (await db.query(`select * from public.assessment_step_reopens where application_id = $1 and step_id = 'step_chat'`, [APP])).rows[0];
  check("a reopen marker records who and when", marker?.reopened_by === EMPLOYER && marker.reopen_count === 1 && marker.job_id === JOB, JSON.stringify(marker));
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "step_chat" });
  check("a reopened step starts a fresh attempt 2", res.ok && res.r.finished === false && res.r.attempt === 2 && res.r.turns.length === 0, JSON.stringify(res.r ?? res.error));
  for (const [label, uid, expect] of [["the employer", EMPLOYER, 1], ["the applicant", CANDIDATE, 0], ["another employer", OTHER_EMPLOYER, 0]]) {
    const r2 = await selectAs(uid, "authenticated", "assessment_step_reopens");
    check(`${label} reads ${expect} reopen marker(s)`, r2.ok && r2.rows[0].n === expect, JSON.stringify(r2));
  }

  // =========================================================================
  console.log("\nThe event cap (on the fresh attempt):\n");

  const attempt2Id = res.r.session_id;
  for (let i = 0; i < 6; i += 1) {
    const batch = Array.from({ length: 100 }, () => ({ kind: "right_click" }));
    await asCandidate("record_integrity_events", { p_application_id: APP, p_step_id: "step_chat", p_events: ev(batch) });
  }
  let attempt2 = await sessionRow("step_chat");
  const storedIntegrity = (await eventsOf(attempt2Id)).filter((e) => e.kind === "integrity").length;
  check(
    "no more than 500 integrity events are stored per session",
    attempt2.id === attempt2Id && storedIntegrity === 500 && attempt2.integrity_summary.total === 500,
    `${storedIntegrity}`,
  );
  check("the rest are counted as dropped", attempt2.integrity_summary.dropped === 100, `${attempt2.integrity_summary.dropped}`);
  res = await asCandidate("record_integrity_events", {
    p_application_id: APP,
    p_step_id: "step_chat",
    p_events: ev(Array.from({ length: 150 }, () => ({ kind: "copy" }))),
  });
  check("over the cap, a call is accepted but stores nothing", res.ok && res.r.accepted === 0 && res.r.dropped === 150, JSON.stringify(res.r ?? res.error));
  res = await asCandidate("record_integrity_events", { p_application_id: APP, p_step_id: "step_chat", p_events: ev({ kind: "copy" }) });
  check("events that are not a list are refused", !res.ok && res.code === "22023", `${res.code} ${res.error}`);

  // =========================================================================
  console.log("\nThe retake is one retake:\n");

  // The retake's result lands (recordStepResult writes the result and its
  // server-only _trusted marker). Status and phase are unchanged: still
  // "pending" on the step, which used to keep it open forever.
  await setApp({
    notes: JSON.stringify({
      quiz: { completedAt: "x" }, quizResult: {}, chatSimulationResult: { score: 77 },
      _trusted: { step_chat: { stepType: "chat_simulation", completedAt: new Date(Date.now() + 1000).toISOString() } },
    }),
  });
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "step_chat" });
  attempt2 = await sessionRow("step_chat");
  check(
    "once the retake's result is newer than the reopen, the step is finished again (no attempt 3)",
    res.ok && res.r.finished === true && attempt2.attempt === 2 && attempt2.status === "completed",
    `${JSON.stringify(res.r ?? res.error)} ${attempt2.attempt} ${attempt2.status}`,
  );
  await db.exec(`set role service_role;`);
  w = await q(`select public.assessment_step_access($1, 'step_chat', $2) as r`, [APP, CANDIDATE]);
  await asOwner();
  check("the access rule agrees (finished, not reopened)", w.ok && w.rows[0].r.finished === true && w.rows[0].r.reopened === false, JSON.stringify(w.rows?.[0]?.r ?? w.error));

  // =========================================================================
  console.log("\nThe computer and connection check (20261006124409_equipment_check.sql):\n");
  {
    // Its own job and application: the step is the FIRST workflow step
    // (docs/EQUIPMENT-CHECK.md §2) and the applicant is on it.
    const JOB_CONNECTION = "30000000-0000-4000-8000-000000000009";
    const APP_CONNECTION = "40000000-0000-4000-8000-000000000009";
    await asOwner();
    await db.query(
      `insert into public.jobs (id, employer_id, title, workflow_steps, quiz_questions, application_questions) values ($1, $2, 'Remote chat agent', $3, '[]', '[]')`,
      [
        JOB_CONNECTION,
        EMPLOYER,
        JSON.stringify([
          { id: "step_connection", type: "equipment_check", title: "Your computer and connection", config: { min_download_mbps: 10, min_upload_mbps: 3, max_latency_ms: 200 } },
          { id: "step_typing_2", type: "typing_test", title: "Typing" },
        ]),
      ],
    );
    await db.query(
      `insert into public.applications (id, job_id, candidate_id, status, phase, notes) values ($1, $2, $3, 'reviewing', 'step_connection', '{}')`,
      [APP_CONNECTION, JOB_CONNECTION, CANDIDATE],
    );

    const stepCheck = (await db.query(`select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'assessment_sessions_step_type_check'`)).rows[0]?.def ?? "";
    check(
      "the step_type CHECK names equipment_check, and still every other type",
      /'equipment_check'/.test(stepCheck) && /'typing_test'/.test(stepCheck) && /'portfolio_upload'/.test(stepCheck) && /'application'/.test(stepCheck),
      stepCheck,
    );
    const journey = (await db.query(`select public.assessment_journey($1::jsonb, false) as j`, [JSON.stringify([{ id: "step_connection", type: "equipment_check" }])])).rows[0].j;
    check(
      "assessment_journey titles an untitled equipment_check step as the candidate sees it",
      journey[1]?.type === "equipment_check" && journey[1]?.title === "Your computer and connection",
      JSON.stringify(journey),
    );

    res = await asCandidate("start_assessment_session", { p_application_id: APP_CONNECTION, p_step_id: "step_connection" });
    check("the applicant opens a session on the step (the access list and the CHECK agree)", res.ok && res.r.finished === false && res.r.status === "active", JSON.stringify(res.r ?? res.error));
    const connRow = await sessionRowFor(APP_CONNECTION, "step_connection");
    check("…stored with step_type equipment_check", connRow?.step_type === "equipment_check", JSON.stringify(connRow));

    await db.exec(`set role service_role;`);
    w = await q(
      `select public.assessment_step_completion($1, 'step_connection', 'equipment_check', 'reviewing', 'step_connection', $2::jsonb, null) as r`,
      [APP_CONNECTION, JSON.stringify({ step_connection: { type: "equipment_check", downloadMbps: 28 } })],
    );
    await asOwner();
    check("a legacyStepEntry alone is not a result (the WHEN reads equipmentCheckResult)", w.ok && w.rows[0].r.finished === false, JSON.stringify(w.rows?.[0]?.r ?? w.error));
    await db.exec(`set role service_role;`);
    w = await q(
      `select public.assessment_step_completion($1, 'step_connection', 'equipment_check', 'reviewing', 'step_connection', $2::jsonb, null) as r`,
      [APP_CONNECTION, JSON.stringify({ equipmentCheckResult: { downloadMbps: 28.4, uploadMbps: 9.1, latencyMs: 42 } })],
    );
    await asOwner();
    check("notes.equipmentCheckResult makes the step finished", w.ok && w.rows[0].r.finished === true, JSON.stringify(w.rows?.[0]?.r ?? w.error));

    // The result lands the way connection-test records it: the key and the
    // server-only marker, through recordStepResult.
    await db.query(`update public.applications set notes = $2 where id = $1`, [
      APP_CONNECTION,
      JSON.stringify({
        equipmentCheckResult: { downloadMbps: 28.4, uploadMbps: 9.1, latencyMs: 42, jitterMs: 6, measuredBy: "server", meetsBars: true, below: [] },
        _trusted: { step_connection: { stepType: "equipment_check", completedAt: new Date().toISOString() } },
      }),
    ]);
    res = await asCandidate("start_assessment_session", { p_application_id: APP_CONNECTION, p_step_id: "step_connection" });
    check("once recorded, the step is finished", res.ok && res.r.finished === true, JSON.stringify(res.r ?? res.error));
    const closedRow = await sessionRowFor(APP_CONNECTION, "step_connection");
    check("…and the open attempt was closed by the self-heal (result_recorded)", closedRow?.status === "completed" && closedRow?.end_reason === "result_recorded", JSON.stringify(closedRow));
    await db.exec(`set role service_role;`);
    w = await q(`select public.assessment_step_access($1, 'step_connection', $2) as r`, [APP_CONNECTION, CANDIDATE]);
    await asOwner();
    check(
      "the access rule knows the type and says finished",
      w.ok && w.rows[0].r.step_type === "equipment_check" && w.rows[0].r.finished === true && w.rows[0].r.step_title === "Your computer and connection",
      JSON.stringify(w.rows?.[0]?.r ?? w.error),
    );
    const mapped = (await db.query(
      `select public.trusted_result_key_for('equipmentCheckResult', null) as by_key, public.trusted_result_key_for('step_connection', 'equipment_check') as by_type`,
    )).rows[0];
    check("trusted_result_key_for maps the key and the type to equipmentCheckResult", mapped.by_key === "equipmentCheckResult" && mapped.by_type === "equipmentCheckResult", JSON.stringify(mapped));
  }

  // =========================================================================
  console.log("\nA closed application:\n");

  await setApp({ status: "rejected" });
  res = await asCandidate("start_assessment_session", { p_application_id: APP, p_step_id: "step_chat" });
  check("a rejected application records nothing (application_closed)", !res.ok && res.code === "HF001", `${res.code} ${res.error}`);
  res = await asCandidate("touch_assessment_session", { p_session_id: chatSessionId });
  check("a heartbeat on it is answered, not stored", res.ok && res.r.updated === false && res.r.reason === "application_closed", JSON.stringify(res.r ?? res.error));

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
