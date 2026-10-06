#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261006200000_waiting_on_computer.sql:
 * public.mark_waiting_on_computer, the one write the "Continue on your
 * computer" screen makes (docs/COMPUTER-ONLY-TESTS.md, "Staff").
 *
 * Loads the REAL migration files, in deploy order, over the live-schema
 * fixture of scripts/assessment_session_server.pglite.test.mjs (roles and
 * grants are real: every call runs under `set role`, with the JWT claims
 * auth.uid() reads):
 *   20260915110000_quiz_answer_keys_server_side.sql  (the forgery guard)
 *   20260915140000_trusted_step_results.sql          (its current body)
 *   20261005180943_merge_application_notes.sql       (the one notes write)
 *   20261005230146_assessment_record.sql             (journey, access rule)
 *   20261006124409_equipment_check.sql
 *   20261006200000_waiting_on_computer.sql           (under test; twice)
 *
 * Proves:
 *   - who may call it: the application's own applicant, signed in. Not
 *     anon (no EXECUTE), not PUBLIC, not another applicant, not the job's
 *     owner, not signed out;
 *   - which steps: only one the computer-only rule covers (the first
 *     connection check and after; with none, the first typing test / chat /
 *     interview and after), reached, not finished, on an open application;
 *     never the form or the skills check; phone or tablet only;
 *   - idempotent: a second call for the same step (another device, two fired
 *     together) leaves the first stamp exactly as it is; a later step
 *     replaces it;
 *   - it opens no attempt, records no event, sends no notification, and
 *     changes nothing but notes.waiting_on_computer (every other key, status
 *     and phase are as they were), through the candidate forgery guard.
 *
 * Run with: node scripts/waiting_on_computer.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = [
  "20260915110000_quiz_answer_keys_server_side.sql",
  "20260915140000_trusted_step_results.sql",
  "20261005180943_merge_application_notes.sql",
  "20261005230146_assessment_record.sql",
  "20261006124409_equipment_check.sql",
];
const UNDER_TEST = "20261006200000_waiting_on_computer.sql";

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
const CANDIDATE = "20000000-0000-4000-8000-000000000001";
const OTHER_CANDIDATE = "20000000-0000-4000-8000-000000000002";
const JOB = "30000000-0000-4000-8000-000000000001"; // connection check first
const NO_CHECK_JOB = "30000000-0000-4000-8000-000000000002"; // no connection check
const APP = "40000000-0000-4000-8000-000000000001";
const OTHER_APP = "40000000-0000-4000-8000-000000000002";
const NO_CHECK_APP = "40000000-0000-4000-8000-000000000003";

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

  -- Supabase's live default privileges in public: client roles get
  -- everything on new tables, sequences and functions; RLS and REVOKEs do
  -- the restricting. (So a function that only GRANTs restricts nothing.)
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

  create type public.application_status as enum
    ('pending', 'reviewing', 'interview', 'offered', 'hired', 'rejected', 'in_progress');
  create type public.notification_type as enum
    ('message', 'application', 'interview', 'status_update', 'team', 'system');

  create table public.profiles (user_id uuid primary key, email text, full_name text);

  create table public.jobs (
    id uuid primary key default gen_random_uuid(),
    employer_id uuid not null,
    title text not null default 'Job',
    workflow_steps jsonb default '[]'::jsonb,
    quiz_questions jsonb default '[]'::jsonb,
    application_questions jsonb default '[]'::jsonb,
    passing_score int default 60,
    processing_mode text default 'auto'
  );

  create table public.applications (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.jobs(id) on delete cascade,
    candidate_id uuid not null,
    status public.application_status not null default 'pending',
    phase text default 'application',
    cover_letter text,
    resume_url text,
    ai_analysis text,
    ai_score numeric,
    ai_scorecard jsonb,
    notes text,
    phase_ai_analysis text,
    rejected_by uuid,
    rejected_by_type text,
    resume_score numeric,
    voice_interview_result jsonb,
    voice_interview_transcript jsonb,
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

  alter table public.applications enable row level security;
  create policy "candidate reads own" on public.applications for select using (auth.uid() = candidate_id);
  create policy "candidate updates own" on public.applications for update using (auth.uid() = candidate_id);
  alter table public.notifications enable row level security;
  create policy "own notifications" on public.notifications for select using (auth.uid() = user_id);

  create publication supabase_realtime;
  alter publication supabase_realtime add table public.applications, public.notifications;
`;

const db = new PGlite();

/** One statement as `role`, with `uid` as the signed-in user (PostgREST's GUCs). */
async function as(role, uid, sql, params = []) {
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
  await db.query("select set_config('request.jwt.claim.role', $1, false)", [role]);
  await db.exec(`set role ${role};`);
  try {
    const res = await db.query(sql, params);
    return { rows: res.rows, error: null };
  } catch (e) {
    return { rows: null, error: { code: e.code, message: e.message } };
  } finally {
    await db.exec("reset role;");
  }
}

/** The screen's call, as the person it names. */
function mark(role, uid, appId, stepId, device = "phone") {
  return as(role, uid, "select public.mark_waiting_on_computer($1, $2, $3) as r", [appId, stepId, device]).then((res) =>
    res.error ? res : { ...res, data: res.rows[0].r },
  );
}

/** JSON with its keys sorted at every level: jsonb keeps its own key order. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function notesOf(appId) {
  const r = await db.query("select notes, status::text as status, phase, updated_at from public.applications where id = $1", [appId]);
  return { ...r.rows[0], parsed: JSON.parse(r.rows[0].notes || "{}") };
}

async function counts() {
  const r = await db.query(
    `select (select count(*) from public.assessment_sessions)::int as sessions,
            (select count(*) from public.assessment_events)::int as events,
            (select count(*) from public.notifications)::int as notifications`,
  );
  return r.rows[0];
}

async function setAsService(appId, setSql, params = []) {
  const res = await as("service_role", "", `update public.applications set ${setSql} where id = $1`, [appId, ...params]);
  if (res.error) throw new Error(res.error.message);
}

async function main() {
  await db.exec(SCHEMA_SQL);
  for (const file of MIGRATIONS) await db.exec(await readFile(path.join(ROOT, "supabase/migrations", file), "utf8"));
  const sql = await readFile(path.join(ROOT, "supabase/migrations", UNDER_TEST), "utf8");
  await db.exec(sql);
  await db.exec(sql);
  console.log(`Loaded ${MIGRATIONS.length} migrations and ${UNDER_TEST} (twice: re-runnable).\n`);

  // The live job's shape: a skills check, then the connection check first of
  // the workflow, then the tests. A video before the check is not gated.
  const WORKFLOW = [
    { id: "wf-video", type: "video_intro", title: "Say hello" },
    { id: "wf-check", type: "equipment_check", title: "Your computer and connection" },
    { id: "wf-typing", type: "typing_test", title: "Typing speed and accuracy" },
    { id: "wf-chat", type: "chat_simulation", title: "Escalated chat practice" },
  ];
  const NO_CHECK = [
    { id: "nc-video", type: "video_intro", title: "Say hello" },
    { id: "nc-typing", type: "typing_test", title: "Typing test" },
    { id: "nc-chat", type: "chat_simulation", title: "Chat practice" },
  ];
  const QUIZ = [{ id: "zu1", type: "multiple_choice", question: "Q?", options: ["a", "b"] }];
  await db.query(
    `insert into public.jobs (id, employer_id, title, workflow_steps, quiz_questions) values
       ($1, $2, 'Team leader', $3, $4), ($5, $2, 'Agent', $6, '[]')`,
    [JOB, EMPLOYER, JSON.stringify(WORKFLOW), JSON.stringify(QUIZ), NO_CHECK_JOB, JSON.stringify(NO_CHECK)],
  );
  const NOTES = {
    applicationAnswers: [{ questionId: "q1", answer: "Robin" }],
    quizResult: { score: 80 },
    "wf-video": { completed: true, videoUrl: "videos/x.webm" },
    avaScorecard: { overall: 71 },
  };
  await db.query(
    `insert into public.applications (id, job_id, candidate_id, status, phase, notes) values
       ($1, $2, $3, 'pending', 'wf-check', $4),
       ($5, $2, $6, 'pending', 'wf-check', '{}'),
       ($7, $8, $3, 'pending', 'nc-typing', '{}')`,
    [APP, JOB, CANDIDATE, JSON.stringify(NOTES), OTHER_APP, OTHER_CANDIDATE, NO_CHECK_APP, NO_CHECK_JOB],
  );

  console.log("Who may call it:\n");
  {
    const acl = await db.query(
      `select has_function_privilege('anon', 'public.mark_waiting_on_computer(uuid, text, text)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.mark_waiting_on_computer(uuid, text, text)', 'execute') as authed,
              exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                       where p.proname = 'mark_waiting_on_computer' and a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_has,
              (select prosecdef from pg_proc where proname = 'mark_waiting_on_computer') as definer`,
    );
    const g = acl.rows[0];
    check("anon cannot execute it (revoked, despite Supabase's default grant)", g.anon === false);
    check("PUBLIC has no EXECUTE", g.public_has === false);
    check("authenticated can", g.authed === true);
    check("SECURITY DEFINER (the applicant cannot write past the guard any other way)", g.definer === true);

    const anon = await mark("anon", "", APP, "wf-check");
    check("signed out (anon role): refused before it runs", anon.error?.code === "42501", JSON.stringify(anon.error));
    const noUser = await mark("authenticated", "", APP, "wf-check");
    check("authenticated with no user: not_signed_in", noUser.error?.code === "42501" && /not_signed_in/.test(noUser.error.message), JSON.stringify(noUser.error));
    const other = await mark("authenticated", OTHER_CANDIDATE, APP, "wf-check");
    check("another applicant: not_your_application", other.error?.code === "42501" && /not_your_application/.test(other.error.message), JSON.stringify(other.error));
    const owner = await mark("authenticated", EMPLOYER, APP, "wf-check");
    check("the job's owner: not_your_application (it is the applicant's own screen)", owner.error?.code === "42501", JSON.stringify(owner.error));
    const n = await notesOf(APP);
    check("…and none of those wrote anything", n.parsed.waiting_on_computer === undefined);
  }

  console.log("\nWhich steps and devices:\n");
  {
    const quiz = await mark("authenticated", CANDIDATE, APP, "quiz");
    check("the skills check is never gated: HF002", quiz.error?.code === "HF002", JSON.stringify(quiz.error));
    const form = await mark("authenticated", CANDIDATE, APP, "application");
    check("the application form is never gated: HF002", form.error?.code === "HF002", JSON.stringify(form.error));
    const video = await mark("authenticated", CANDIDATE, APP, "wf-video");
    check("a step BEFORE the connection check is not gated: HF002", video.error?.code === "HF002", JSON.stringify(video.error));
    const unknown = await mark("authenticated", CANDIDATE, APP, "wf-nope");
    check("a step the job does not have: HF002", unknown.error?.code === "HF002", JSON.stringify(unknown.error));
    const ahead = await mark("authenticated", CANDIDATE, APP, "wf-typing");
    check("a step not reached yet: HF003", ahead.error?.code === "HF003", JSON.stringify(ahead.error));
    const computer = await mark("authenticated", CANDIDATE, APP, "wf-check", "computer");
    check("a computer is not a device that waits: 22023", computer.error?.code === "22023", JSON.stringify(computer.error));
    const nothing = await mark("authenticated", CANDIDATE, APP, "wf-check", null);
    check("no device: 22023", nothing.error?.code === "22023", JSON.stringify(nothing.error));
    const noCheckVideo = await mark("authenticated", CANDIDATE, NO_CHECK_APP, "nc-video");
    check("no connection check: a video before the first test is not gated", noCheckVideo.error?.code === "HF002", JSON.stringify(noCheckVideo.error));
    const noCheckTyping = await mark("authenticated", CANDIDATE, NO_CHECK_APP, "nc-typing", "tablet");
    check("no connection check: the first typing test is", noCheckTyping.error == null && noCheckTyping.data.stamped === true, JSON.stringify(noCheckTyping.error ?? noCheckTyping.data));
  }

  console.log("\nThe stamp, once:\n");
  {
    const before = await notesOf(APP);
    const c0 = await counts();
    const first = await mark("authenticated", CANDIDATE, APP, "wf-check", "phone");
    check("the applicant on their phone: stamped", first.error == null && first.data.stamped === true, JSON.stringify(first.error ?? first.data));
    const after = await notesOf(APP);
    const w = after.parsed.waiting_on_computer;
    check("notes.waiting_on_computer = {step_id, at, device_kind}", w && w.step_id === "wf-check" && w.device_kind === "phone" && !Number.isNaN(Date.parse(w.at)) && Object.keys(w).length === 3, JSON.stringify(w));
    check("`at` is an ISO time in UTC", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(w?.at ?? ""), w?.at);
    const { waiting_on_computer: _drop, ...rest } = after.parsed;
    check("every other notes key is exactly as it was", canonical(rest) === canonical(before.parsed), canonical(rest));
    check("status and phase are unchanged", after.status === before.status && after.phase === before.phase);
    const c1 = await counts();
    check("no attempt opened, no event recorded, no notification sent", c1.sessions === c0.sessions && c1.events === c0.events && c1.notifications === c0.notifications, JSON.stringify({ c0, c1 }));

    const again = await mark("authenticated", CANDIDATE, APP, "wf-check", "tablet");
    check("the same step again (their tablet): not stamped", again.error == null && again.data.stamped === false, JSON.stringify(again.error ?? again.data));
    const kept = (await notesOf(APP)).parsed.waiting_on_computer;
    check("…the first stamp is kept exactly (first time at the gate, first device)", canonical(kept) === canonical(w), JSON.stringify(kept));
    check("…and the answer names it", canonical(again.data.waiting_on_computer) === canonical(w));

    // Two screens at once. PGlite runs one statement at a time, so this
    // proves the answer for two calls in a row; in Postgres the row lock
    // (FOR UPDATE before the stamp is read) makes the second of two
    // concurrent calls wait and then see the first one's stamp.
    await setAsService(OTHER_APP, "notes = '{}'");
    const [a, b] = await Promise.all([
      mark("authenticated", OTHER_CANDIDATE, OTHER_APP, "wf-check", "phone"),
      mark("authenticated", OTHER_CANDIDATE, OTHER_APP, "wf-check", "tablet"),
    ]);
    const stamped = [a, b].filter((r) => r.data?.stamped === true).length;
    check("two calls fired together stamp it once", stamped === 1 && !a.error && !b.error, JSON.stringify({ a: a.error ?? a.data, b: b.error ?? b.data }));
  }

  console.log("\nA later step, a finished step, a closed application:\n");
  {
    // The check is done (the server records it) and they are moved on.
    await setAsService(APP, "notes = (notes::jsonb || $2::jsonb)::text, phase = 'wf-typing'", [JSON.stringify({ equipmentCheckResult: { download: 50 } })]);
    const finished = await mark("authenticated", CANDIDATE, APP, "wf-check");
    check("a finished step: HF004 step_finished", finished.error?.code === "HF004", JSON.stringify(finished.error));
    const next = await mark("authenticated", CANDIDATE, APP, "wf-typing", "tablet");
    check("the next step on a tablet: stamped", next.error == null && next.data.stamped === true, JSON.stringify(next.error ?? next.data));
    const w = (await notesOf(APP)).parsed.waiting_on_computer;
    check("…the stamp now names the later step (a later step replaces it)", w?.step_id === "wf-typing" && w?.device_kind === "tablet", JSON.stringify(w));
    check("…and the result that landed is untouched", canonical((await notesOf(APP)).parsed.equipmentCheckResult) === canonical({ download: 50 }));

    await setAsService(APP, "status = 'rejected'");
    const closed = await mark("authenticated", CANDIDATE, APP, "wf-typing");
    check("a closed application: HF001", closed.error?.code === "HF001", JSON.stringify(closed.error));
  }

  console.log("\nThe forgery guard still guards:\n");
  {
    // The function's write went through protect_application_columns as the
    // candidate; the guard itself is unchanged for their direct writes.
    const forged = await as("authenticated", OTHER_CANDIDATE, "update public.applications set notes = (notes::jsonb || '{\"quizResult\":{\"score\":100}}'::jsonb)::text where id = $1", [OTHER_APP]);
    check("a candidate writing a protected key directly is still refused", forged.error != null, JSON.stringify(forged.error));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
