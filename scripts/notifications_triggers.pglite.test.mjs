#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20260915122000_in_app_notifications_for_key_moments.sql
 *
 * Runs the real migration SQL (read straight off disk, not retyped) against
 * an in-memory Postgres (@electric-sql/pglite) and asserts on the actual
 * `public.notifications` rows the triggers write — not a JS reimplementation
 * of their logic. The harness below reproduces just enough of the live
 * schema for these triggers to run: the relevant tables/enums from
 * 20251214183024_*.sql plus the later columns these triggers touch
 * (application_status "in_progress" from 20251219051027_*.sql; interviews.
 * candidate_response/proposed_times/candidate_note from
 * 20251218160711_*.sql; team_members from 20251215054759_*.sql), a minimal
 * `auth.users` + `auth.uid()` (real Supabase behavior: the current
 * request's JWT `sub`, NULL for a service_role call with no user JWT — see
 * migration comment), and notify_application_status_change() /
 * on_application_status_change (20251217214606_*.sql body, as restated by
 * 20260904120000_*.sql) so the "no duplicate on offered" claim is proven
 * against the real status trigger, not assumed.
 *
 * RLS is intentionally NOT enabled here — every function under test is
 * SECURITY DEFINER and every existing RLS policy on these tables is already
 * covered by 20260827211000_lockdown_notification_inserts.sql's own reasoning;
 * this proof is about trigger logic (who gets notified, with what, and when
 * they must NOT be), which RLS is orthogonal to.
 *
 * Run with: node scripts/notifications_triggers.pglite.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = path.join(
  __dirname,
  "..",
  "supabase/migrations/20260915122000_in_app_notifications_for_key_moments.sql",
);

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

const SCHEMA_SQL = `
  -- The real project has these as real Postgres roles; the migration's
  -- REVOKE ALL ... FROM PUBLIC, anon, authenticated statements need them to
  -- exist here too.
  create role anon;
  create role authenticated;
  create role service_role;

  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid());

  -- Real Supabase behavior: auth.uid() reads the JWT 'sub' claim off the
  -- current request. A service_role call (no user JWT) leaves it unset, so
  -- this returns NULL exactly like it does in production.
  create function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  create type public.application_status as enum
    ('pending', 'reviewing', 'interview', 'offered', 'hired', 'rejected', 'in_progress');
  create type public.notification_type as enum
    ('message', 'application', 'interview', 'status_update', 'team', 'system');

  create table public.profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    full_name text,
    company_name text
  );

  create table public.jobs (
    id uuid primary key default gen_random_uuid(),
    employer_id uuid not null references auth.users(id) on delete cascade,
    title text not null
  );

  create table public.applications (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.jobs(id) on delete cascade,
    candidate_id uuid not null references auth.users(id) on delete cascade,
    status public.application_status not null default 'pending',
    phase text default 'application',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table public.interviews (
    id uuid primary key default gen_random_uuid(),
    application_id uuid not null references public.applications(id) on delete cascade,
    scheduled_at timestamptz not null,
    duration_minutes integer default 60,
    candidate_response text default 'pending',
    proposed_times jsonb,
    candidate_note text,
    employer_windows jsonb
  );

  create table public.team_members (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    employer_id uuid not null references auth.users(id) on delete cascade,
    status text default 'active',
    assigned_job_ids uuid[] default '{}'
  );

  create table public.notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    type public.notification_type not null,
    title text not null,
    message text not null,
    link text,
    is_read boolean not null default false,
    created_at timestamptz not null default now()
  );

  -- notify_application_status_change() body, as re-stated (unchanged) by
  -- 20260904120000_candidate_notification_links.sql — included so the "no
  -- duplicate on status -> offered" claim is checked against the real
  -- trigger, not an assumption about what it does.
  CREATE OR REPLACE FUNCTION public.notify_application_status_change()
  RETURNS TRIGGER AS $BODY$
  DECLARE
    job_title TEXT;
    company_name TEXT;
    team_label TEXT;
    notification_title TEXT;
    notification_message TEXT;
    notification_type public.notification_type;
    notification_link TEXT;
  BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      SELECT j.title, p.company_name
        INTO job_title, company_name
        FROM jobs j
        LEFT JOIN profiles p ON p.user_id = j.employer_id
       WHERE j.id = NEW.job_id;

      team_label := CASE
        WHEN NULLIF(TRIM(company_name), '') IS NOT NULL THEN 'The ' || TRIM(company_name) || ' team'
        ELSE 'The hiring team'
      END;

      notification_link := '/candidate/auth?redirect=' || replace('/applications/' || NEW.id::text, '/', '%2F');

      CASE NEW.status
        WHEN 'rejected' THEN
          notification_title := 'Application update';
          notification_message := team_label || ' has made a decision on your application'
            || CASE WHEN job_title IS NOT NULL THEN ' for ' || job_title ELSE '' END || '.';
          notification_type := 'status_update';
        WHEN 'hired' THEN
          notification_title := 'Congratulations! You''re hired';
          notification_message := 'Great news! You''ve been selected for ' || COALESCE(job_title, 'the position') || '. Welcome aboard!';
          notification_type := 'status_update';
        WHEN 'interview' THEN
          notification_title := 'Interview scheduled';
          notification_message := 'You''ve been invited to interview for ' || COALESCE(job_title, 'a position') || '. Check the details and prepare!';
          notification_type := 'interview';
        WHEN 'offered' THEN
          notification_title := 'Offer extended';
          notification_message := 'Congratulations! You''ve received an offer for ' || COALESCE(job_title, 'a position') || '.';
          notification_type := 'status_update';
        ELSE
          RETURN NEW;
      END CASE;

      INSERT INTO notifications (user_id, type, title, message, link, is_read)
      VALUES (NEW.candidate_id, notification_type, notification_title, notification_message, notification_link, false);
    END IF;

    RETURN NEW;
  END;
  $BODY$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

  CREATE TRIGGER on_application_status_change
  AFTER UPDATE ON applications
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_application_status_change();
`;

async function main() {
  const db = new PGlite();
  await db.exec(SCHEMA_SQL);

  const migrationSql = readFileSync(MIGRATION_PATH, "utf8");
  await db.exec(migrationSql);

  // --- fixtures --------------------------------------------------------------
  const employerId = "10000000-0000-0000-0000-000000000001";
  const teamMemberActiveAssignedId = "10000000-0000-0000-0000-000000000002";
  const teamMemberActiveUnassignedJobId = "10000000-0000-0000-0000-000000000003";
  const teamMemberInactiveId = "10000000-0000-0000-0000-000000000004";
  const teamMemberActiveUnrestrictedId = "10000000-0000-0000-0000-000000000005";
  const candidateId = "20000000-0000-0000-0000-000000000001";
  const otherCandidateId = "20000000-0000-0000-0000-000000000002";

  for (const id of [
    employerId,
    teamMemberActiveAssignedId,
    teamMemberActiveUnassignedJobId,
    teamMemberInactiveId,
    teamMemberActiveUnrestrictedId,
    candidateId,
    otherCandidateId,
  ]) {
    await db.query("insert into auth.users (id) values ($1)", [id]);
  }
  await db.query(
    "insert into public.profiles (user_id, email, full_name, company_name) values ($1,$2,$3,$4)",
    [employerId, "owner@acme.test", "Owner", "Acme Cafe"],
  );
  await db.query("insert into public.profiles (user_id, email, full_name) values ($1,$2,$3)", [
    candidateId,
    "cand@test.test",
    "Jamie Rivera",
  ]);

  const jobId = "30000000-0000-0000-0000-000000000001";
  const otherJobId = "30000000-0000-0000-0000-000000000002";
  await db.query("insert into public.jobs (id, employer_id, title) values ($1,$2,$3)", [
    jobId,
    employerId,
    "Barista",
  ]);
  await db.query("insert into public.jobs (id, employer_id, title) values ($1,$2,$3)", [
    otherJobId,
    employerId,
    "Line Cook",
  ]);

  // Team roster: active+assigned to `jobId` (should be notified), active but
  // assigned only to the OTHER job (should not), inactive (should not), and
  // active with an empty assigned_job_ids — i.e. unrestricted — assigned
  // implicitly to every job (should be notified for a second, unrelated app).
  await db.query(
    "insert into public.team_members (user_id, employer_id, status, assigned_job_ids) values ($1,$2,'active',$3)",
    [teamMemberActiveAssignedId, employerId, [jobId]],
  );
  await db.query(
    "insert into public.team_members (user_id, employer_id, status, assigned_job_ids) values ($1,$2,'active',$3)",
    [teamMemberActiveUnassignedJobId, employerId, [otherJobId]],
  );
  await db.query(
    "insert into public.team_members (user_id, employer_id, status, assigned_job_ids) values ($1,$2,'inactive',$3)",
    [teamMemberInactiveId, employerId, [jobId]],
  );
  await db.query(
    "insert into public.team_members (user_id, employer_id, status, assigned_job_ids) values ($1,$2,'active','{}')",
    [teamMemberActiveUnrestrictedId, employerId],
  );

  const notifsFor = async (userId) => {
    const r = await db.query(
      "select type, title, message, link from public.notifications where user_id = $1 order by created_at",
      [userId],
    );
    return r.rows;
  };
  const countAll = async () => {
    const r = await db.query("select count(*)::int as n from public.notifications");
    return r.rows[0].n;
  };
  const asActor = async (uid) => {
    // SET doesn't take bind parameters; set_config does (and matches
    // set request.jwt.claim.sub = '' for "no actor" when passed '').
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
  };

  console.log("1. New application submitted -> job owner + scoped active team members\n");

  // Candidate's own session creates the row "in_progress" (JobDetails.tsx),
  // then submits it to "pending" (ApplicationFormPhase.tsx handleSubmit).
  await asActor(candidateId);
  const appId = "40000000-0000-0000-0000-000000000001";
  await db.query(
    "insert into public.applications (id, job_id, candidate_id, status, phase) values ($1,$2,$3,'in_progress','application')",
    [appId, jobId, candidateId],
  );
  check("insert as in_progress notifies nobody yet", (await countAll()) === 0);

  await db.query("update public.applications set status = 'pending' where id = $1", [appId]);

  const employerNotifs = await notifsFor(employerId);
  check("job owner gets exactly one notification", employerNotifs.length === 1, JSON.stringify(employerNotifs));
  check(
    "owner notification names the candidate, the job, and links to the cockpit applicant",
    employerNotifs[0]?.message === "Jamie Rivera applied for Barista." && employerNotifs[0]?.link === `/applicants/${appId}`,
    JSON.stringify(employerNotifs[0]),
  );
  check("owner notification type is 'application'", employerNotifs[0]?.type === "application");

  check(
    "active team member assigned to this job is notified",
    (await notifsFor(teamMemberActiveAssignedId)).length === 1,
  );
  check(
    "active team member with no assigned_job_ids (unrestricted) is notified",
    (await notifsFor(teamMemberActiveUnrestrictedId)).length === 1,
  );
  check(
    "active team member assigned to a DIFFERENT job is not notified",
    (await notifsFor(teamMemberActiveUnassignedJobId)).length === 0,
  );
  check("inactive team member is not notified", (await notifsFor(teamMemberInactiveId)).length === 0);

  const totalAfterSubmit = await countAll();
  check("exactly 3 notifications total for the submit (owner + 2 team members)", totalAfterSubmit === 3, String(totalAfterSubmit));

  // An unrelated update to the same row (still "pending") must not re-fire.
  await db.query("update public.applications set phase = 'application' where id = $1", [appId]);
  check("re-saving while already pending does not duplicate", (await countAll()) === totalAfterSubmit);

  console.log("\n2. Interview scheduled / windows offered / rescheduled -> candidate\n");

  await db.query("delete from public.notifications");

  // Exact-time creation, by the employer.
  await asActor(employerId);
  const interviewExactId = "50000000-0000-0000-0000-000000000001";
  await db.query(
    "insert into public.interviews (id, application_id, scheduled_at, candidate_response) values ($1,$2, now() + interval '3 days', 'pending')",
    [interviewExactId, appId],
  );
  let candNotifs = await notifsFor(candidateId);
  check("exact-time interview creation notifies the candidate once", candNotifs.length === 1, JSON.stringify(candNotifs));
  check(
    "exact-time copy says 'scheduled', not 'pick a time', and routes through candidate sign-in",
    candNotifs[0]?.title === "Interview scheduled" && candNotifs[0]?.link?.startsWith("/candidate/auth?redirect="),
    JSON.stringify(candNotifs[0]),
  );

  // Windows-offered creation, by the employer.
  const interviewWindowsId = "50000000-0000-0000-0000-000000000002";
  await db.query(
    "insert into public.interviews (id, application_id, scheduled_at, candidate_response, employer_windows) values ($1,$2, now() + interval '2 days', 'awaiting_pick', '[]'::jsonb)",
    [interviewWindowsId, appId],
  );
  candNotifs = await notifsFor(candidateId);
  check("windows-offered creation adds a second, distinct notification", candNotifs.length === 2, JSON.stringify(candNotifs));
  check("windows-offered copy says 'pick a time'", candNotifs[1]?.title === "Pick a time for your interview");

  // Employer reschedules the exact-time interview (RescheduleInterviewDialog.tsx path).
  await db.query("delete from public.notifications");
  await asActor(employerId);
  await db.query("update public.interviews set scheduled_at = now() + interval '5 days' where id = $1", [
    interviewExactId,
  ]);
  candNotifs = await notifsFor(candidateId);
  check(
    "employer-initiated reschedule notifies the candidate once, as 'time changed'",
    candNotifs.length === 1 && candNotifs[0]?.title === "Interview time changed",
    JSON.stringify(candNotifs),
  );

  // A team member (still not the candidate) also counts as "not the candidate".
  await db.query("delete from public.notifications");
  await asActor(teamMemberActiveAssignedId);
  await db.query("update public.interviews set scheduled_at = now() + interval '6 days' where id = $1", [
    interviewExactId,
  ]);
  check("team-member-initiated reschedule also notifies the candidate", (await notifsFor(candidateId)).length === 1);

  // The candidate picking their own offered window — candidate-interview-
  // response runs on service_role, so there is no request JWT at all.
  await db.query("delete from public.notifications");
  await asActor(null);
  await db.query(
    "update public.interviews set scheduled_at = now() + interval '2 days', candidate_response = 'confirmed' where id = $1",
    [interviewWindowsId],
  );
  check(
    "candidate picking their own window (service_role actor) does NOT self-notify",
    (await notifsFor(candidateId)).length === 0,
  );
  check("no notification is written for anyone on that pick", (await countAll()) === 0);

  // The candidate's own authenticated session editing their own interview
  // row directly (not through the edge function) must be caught too.
  await db.query("delete from public.notifications");
  await asActor(candidateId);
  await db.query("update public.interviews set scheduled_at = now() + interval '9 days' where id = $1", [
    interviewExactId,
  ]);
  check(
    "candidate's own session moving their own interview does NOT self-notify",
    (await notifsFor(candidateId)).length === 0,
  );

  // A no-op update that doesn't touch scheduled_at must not fire the reschedule path.
  await db.query("delete from public.notifications");
  await asActor(employerId);
  await db.query("update public.interviews set candidate_note = 'left early' where id = $1", [interviewExactId]);
  check("editing an unrelated interview column does not notify", (await countAll()) === 0);

  console.log("\n3. Meaningful phase advance -> candidate (status is untouched)\n");

  await db.query("delete from public.notifications");

  // The hiring team moves the candidate to a real next step.
  await asActor(employerId);
  await db.query("update public.applications set phase = 'quiz' where id = $1", [appId]);
  candNotifs = await notifsFor(candidateId);
  check("hiring-team-initiated phase advance notifies the candidate once", candNotifs.length === 1, JSON.stringify(candNotifs));
  check("phase-advance type is 'status_update'", candNotifs[0]?.type === "status_update");

  // The candidate's own client self-advancing (auto-mode) must stay silent.
  await db.query("delete from public.notifications");
  await asActor(candidateId);
  await db.query("update public.applications set phase = 'wf-typing-test' where id = $1", [appId]);
  check("candidate self-advancing their own phase does NOT self-notify", (await notifsFor(candidateId)).length === 0);

  // A legacy/closing literal must not double up with the status trigger.
  await db.query("delete from public.notifications");
  await asActor(employerId);
  await db.query("update public.applications set phase = 'decision' where id = $1", [appId]);
  check("phase flipping to the synthetic 'decision' stage does not notify", (await countAll()) === 0);

  console.log("\n4. Status -> offered: exactly the existing trigger's notification, never doubled\n");

  await db.query("delete from public.notifications");
  await asActor(employerId);
  // Advance through the real pipeline shape (nextAdvanceStatus in
  // useCockpitData.ts): pending -> reviewing -> interview -> offered.
  await db.query("update public.applications set status = 'reviewing' where id = $1", [appId]);
  await db.query("update public.applications set status = 'interview' where id = $1", [appId]);
  await db.query("delete from public.notifications"); // isolate just the offered transition
  await db.query("update public.applications set status = 'offered' where id = $1", [appId]);

  const afterOffered = await notifsFor(candidateId);
  check(
    "status -> offered produces exactly ONE notification (the existing status trigger's, not a second one from this migration)",
    afterOffered.length === 1 && afterOffered[0]?.title === "Offer extended",
    JSON.stringify(afterOffered),
  );

  await db.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
