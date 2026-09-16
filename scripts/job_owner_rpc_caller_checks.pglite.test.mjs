#!/usr/bin/env node
/**
 * PGlite proof for
 * supabase/migrations/20260915141000_job_owner_rpc_caller_checks.sql
 * — plain assertions against a real Postgres (PGlite), not a text match.
 *
 * Builds a minimal fixture of the tables is_job_owner/
 * is_active_team_member_for_job and their calling policies/functions touch
 * (jobs, applications, team_members, messages, notifications,
 * document_requests, document_audit_logs, job_quiz_keys,
 * quiz_attempt_ledger), seeds the PRE-fix function bodies (SECURITY
 * DEFINER, no caller check, granted to anon/authenticated/service_role --
 * the actual live shape, confirmed via mcp__supabase__execute_sql) together
 * with every live policy/function that calls one of them, and proves:
 *
 *   1. Pre-fix, the leak is real: any signed-in stranger (and anon) can
 *      call is_job_owner/is_active_team_member_for_job directly with an
 *      arbitrary p_user_id and learn whether that OTHER user owns/manages a
 *      job.
 *   2. Applying the migration (read verbatim from disk, not retyped) makes
 *      that same direct probe return false instead of the real answer for
 *      authenticated, and fail outright (permission denied) for anon.
 *   3. Every legitimate caller shape is unaffected: employer/team-member
 *      applications SELECT/UPDATE/DELETE, document_audit_logs logging,
 *      job_quiz_keys read/write (owner and team member), get_job_quiz_keys,
 *      grant_quiz_retake, protect_application_columns (candidate self-write
 *      guard, employer/team bypass), notify_new_application_submitted
 *      (employer + team notification fan-out).
 *   4. The two rewritten policy branches (messages "Counterparties can send
 *      messages" candidate->employer, notifications "Related parties can
 *      insert notifications" candidate->employer) allow the exact same
 *      inserts they did before the migration, and still deny a candidate
 *      messaging/notifying an employer they never applied to.
 *
 * Run with: node scripts/job_owner_rpc_caller_checks.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915141000_job_owner_rpc_caller_checks.sql");

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

// --- fixture ids --------------------------------------------------------------
const EMP_1 = "10000000-0000-0000-0000-00000000000a"; // owns JOB_1
const EMP_2 = "10000000-0000-0000-0000-00000000000b"; // owns JOB_2, unrelated
const TEAM_ACTIVE = "30000000-0000-0000-0000-000000000001"; // active team member of EMP_1, can_manage_pipeline
const TEAM_INACTIVE = "30000000-0000-0000-0000-000000000002"; // revoked team member of EMP_1
const CAND_1 = "20000000-0000-0000-0000-000000000001"; // applied to JOB_1
const CAND_2 = "20000000-0000-0000-0000-000000000002"; // never applied to JOB_1 at any point in this test
const CAND_3 = "20000000-0000-0000-0000-000000000003"; // applies to JOB_1 mid-test (section 4)
const STRANGER = "40000000-0000-0000-0000-000000000001"; // authenticated, no relationship to anything

const JOB_1 = "50000000-0000-0000-0000-00000000000a";
const JOB_2 = "50000000-0000-0000-0000-00000000000b";
const APP_1 = "60000000-0000-0000-0000-00000000000a"; // CAND_1 -> JOB_1

async function main() {
  const db = new PGlite();

  const migrationSql = await readFile(MIGRATION_PATH, "utf8").catch(() => null);
  check("migration file exists on disk", migrationSql != null, MIGRATION_PATH);
  if (!migrationSql) {
    console.log(`\n${failed} of ${passed + failed} checks failed.`);
    process.exit(1);
  }

  await db.exec(`
    -- ---- auth shims (mirror Supabase's auth.uid()/auth.role()) ----
    create schema auth;
    create table auth.users (id uuid primary key);
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
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant execute on function auth.role() to anon, authenticated, service_role;
    grant select on auth.users to anon, authenticated, service_role;

    -- ---- minimal public schema (live column shapes, trimmed to what the
    -- reviewed functions/triggers/policies touch) ----
    create table public.jobs (
      id uuid primary key default gen_random_uuid(),
      employer_id uuid not null
    );

    create table public.applications (
      id uuid primary key default gen_random_uuid(),
      job_id uuid not null references public.jobs(id),
      candidate_id uuid not null,
      status text not null default 'pending',
      notes text,
      phase text default 'application',
      ai_score numeric,
      ai_scorecard jsonb,
      ai_analysis text,
      resume_score numeric,
      voice_interview_result jsonb,
      rejected_by uuid,
      rejected_by_type text
    );

    create table public.team_members (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      employer_id uuid not null,
      status text not null default 'active',
      can_manage_pipeline boolean not null default true,
      can_create_jobs boolean not null default false,
      can_delete_jobs boolean not null default false,
      assigned_job_ids uuid[]
    );

    create table public.messages (
      id uuid primary key default gen_random_uuid(),
      sender_id uuid not null,
      receiver_id uuid not null,
      application_id uuid,
      content text not null
    );

    create table public.notifications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      type text not null default 'application',
      title text not null default 't',
      message text not null default 'm',
      link text,
      is_read boolean not null default false
    );

    create table public.document_requests (
      id uuid primary key default gen_random_uuid(),
      application_id uuid not null,
      employer_id uuid not null,
      candidate_id uuid not null
    );

    create table public.documents (
      id uuid primary key default gen_random_uuid(),
      application_id uuid,
      sender_id uuid,
      recipient_id uuid
    );

    create table public.document_audit_logs (
      id uuid primary key default gen_random_uuid(),
      document_id uuid,
      user_id uuid,
      action text not null
    );

    create table public.job_quiz_keys (
      job_id uuid not null,
      step_id text not null,
      question_id text not null,
      key jsonb not null,
      primary key (job_id, step_id, question_id)
    );

    create table public.quiz_attempt_ledger (
      candidate_id uuid not null,
      job_id uuid not null,
      step_id text not null,
      attempts integer not null default 0,
      retakes_granted integer not null default 0,
      primary key (candidate_id, job_id, step_id)
    );

    alter table public.jobs enable row level security;
    alter table public.applications enable row level security;
    alter table public.team_members enable row level security;
    alter table public.messages enable row level security;
    alter table public.notifications enable row level security;
    alter table public.document_requests enable row level security;
    alter table public.documents enable row level security;
    alter table public.document_audit_logs enable row level security;
    alter table public.job_quiz_keys enable row level security;

    grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;

    -- ---- PRE-fix function bodies, verbatim from the live project
    -- (confirmed via mcp__supabase__execute_sql), WITH the pre-fix grants
    -- (anon, authenticated, postgres, service_role -- no caller check). ----
    create or replace function public.is_job_owner(p_job_id uuid, p_user_id uuid)
    returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
      select exists (
        select 1 from public.jobs j where j.id = p_job_id and j.employer_id = p_user_id
      );
    $$;
    grant execute on function public.is_job_owner(uuid, uuid) to anon, authenticated, service_role;

    create or replace function public.is_active_team_member_for_job(
      p_job_id uuid, p_user_id uuid,
      p_require_manage_pipeline boolean default false,
      p_require_create_jobs boolean default false,
      p_require_delete_jobs boolean default false
    )
    returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
      select exists (
        select 1 from public.jobs j join public.team_members tm on tm.employer_id = j.employer_id
        where j.id = p_job_id and tm.user_id = p_user_id and tm.status = 'active'
          and (not p_require_manage_pipeline or tm.can_manage_pipeline = true)
          and (not p_require_create_jobs or tm.can_create_jobs = true)
          and (not p_require_delete_jobs or tm.can_delete_jobs = true)
          and (array_length(tm.assigned_job_ids, 1) is null or j.id = any (tm.assigned_job_ids))
      );
    $$;
    grant execute on function public.is_active_team_member_for_job(uuid, uuid, boolean, boolean, boolean) to anon, authenticated, service_role;

    -- ---- other live functions that call the two above (verbatim bodies,
    -- trimmed of unrelated logic like notifications for team members /
    -- exception-wrapping where it doesn't affect what's under test) ----
    create or replace function public.get_job_quiz_keys(p_job_id uuid)
    returns table(step_id text, question_id text, key jsonb)
    language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
    begin
      if not (
        public.is_job_owner(p_job_id, auth.uid())
        or public.is_active_team_member_for_job(p_job_id, auth.uid())
      ) then
        raise exception 'Not authorized to read this job''s quiz answer keys';
      end if;
      return query select jqk.step_id, jqk.question_id, jqk.key from public.job_quiz_keys jqk where jqk.job_id = p_job_id;
    end;
    $$;

    create or replace function public.grant_quiz_retake(p_candidate_id uuid, p_job_id uuid, p_step_id text)
    returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
    begin
      if not (
        auth.role() = 'service_role'
        or public.is_job_owner(p_job_id, auth.uid())
        or public.is_active_team_member_for_job(p_job_id, auth.uid(), true)
      ) then
        raise exception 'Not authorized to grant a quiz retake for this job';
      end if;
      insert into public.quiz_attempt_ledger (candidate_id, job_id, step_id, attempts, retakes_granted)
      values (p_candidate_id, p_job_id, p_step_id, 0, 1)
      on conflict (candidate_id, job_id, step_id)
      do update set retakes_granted = public.quiz_attempt_ledger.retakes_granted + 1;
    end;
    $$;

    create or replace function public.protect_application_columns()
    returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
    begin
      if auth.role() = 'service_role' then
        return new;
      end if;

      if public.is_job_owner(old.job_id, auth.uid())
         or public.is_active_team_member_for_job(old.job_id, auth.uid(), true) then
        return new;
      end if;

      if auth.uid() is distinct from old.candidate_id then
        return new;
      end if;

      if new.job_id is distinct from old.job_id then
        raise exception 'Candidates cannot change job_id';
      end if;
      if new.ai_score is distinct from old.ai_score then
        raise exception 'Candidates cannot change ai_score';
      end if;

      if new.status is distinct from old.status then
        if new.status in ('interview', 'offered', 'hired') then
          raise exception 'Candidates cannot set application status to %', new.status;
        end if;
        if old.status in ('rejected', 'offered', 'hired') then
          raise exception 'Candidates cannot change application status once it is %', old.status;
        end if;
      end if;

      return new;
    end;
    $$;

    create trigger protect_application_columns_trigger
      before update on public.applications
      for each row execute function public.protect_application_columns();

    create or replace function public.notify_new_application_submitted()
    returns trigger language plpgsql security definer set search_path to 'public' as $$
    declare
      v_job record;
      v_team_member record;
    begin
      select j.id, j.employer_id into v_job from public.jobs j where j.id = new.job_id;
      if v_job.employer_id is null then
        return new;
      end if;

      insert into public.notifications (user_id, type, title, message, link, is_read)
      values (v_job.employer_id, 'application', 'New application', 'A candidate applied.', '/applicants/' || new.id::text, false);

      for v_team_member in
        select tm.user_id from public.team_members tm
        where tm.employer_id = v_job.employer_id and tm.status = 'active' and tm.user_id <> v_job.employer_id
          and (array_length(tm.assigned_job_ids, 1) is null or v_job.id = any (tm.assigned_job_ids))
      loop
        insert into public.notifications (user_id, type, title, message, link, is_read)
        values (v_team_member.user_id, 'application', 'New application', 'A candidate applied.', '/applicants/' || new.id::text, false);
      end loop;
      return new;
    end;
    $$;

    create trigger notify_new_application_submitted_trigger
      after insert on public.applications
      for each row execute function public.notify_new_application_submitted();

    -- ---- live policies that call is_job_owner / is_active_team_member_for_job,
    -- and the two PRE-fix policies under test (copied from pg_policies.qual/
    -- with_check on the live project) ----
    create policy "Employers can view their own jobs" on public.jobs for select
    using (auth.uid() = employer_id);

    create policy "Candidates can view jobs they applied to" on public.jobs for select
    using (exists (select 1 from public.applications a where a.job_id = jobs.id and a.candidate_id = auth.uid()));

    create policy "Employers can view applications to their jobs" on public.applications for select
    using (public.is_job_owner(job_id, auth.uid()));
    create policy "Employers can update applications to their jobs" on public.applications for update
    using (public.is_job_owner(job_id, auth.uid()));
    create policy "Employers can delete applications to their jobs" on public.applications for delete
    using (public.is_job_owner(job_id, auth.uid()));
    create policy "Team members can view applications for assigned jobs" on public.applications for select
    using (public.is_active_team_member_for_job(job_id, auth.uid()));
    create policy "Team members can update applications if permitted" on public.applications for update
    using (public.is_active_team_member_for_job(job_id, auth.uid(), true));
    create policy "Team members can delete applications if permitted" on public.applications for delete
    using (public.is_active_team_member_for_job(job_id, auth.uid(), true));
    create policy "Candidates can insert their applications" on public.applications for insert
    with check (auth.uid() = candidate_id);
    create policy "Candidates can view their own applications" on public.applications for select
    using (auth.uid() = candidate_id);
    create policy "Candidates can update their own applications" on public.applications for update
    using (auth.uid() = candidate_id);

    -- Fixture-only SELECT policies so INSERT ... RETURNING can see the row
    -- it just inserted (Postgres RLS requires a satisfied SELECT policy for
    -- RETURNING, on top of the WITH CHECK the INSERT policies above already
    -- prove) -- not part of the migration under test.
    create policy "Fixture: participants can view their messages" on public.messages for select
    using (auth.uid() = sender_id or auth.uid() = receiver_id);
    create policy "Fixture: recipients can view their notifications" on public.notifications for select
    using (auth.uid() = user_id);
    create policy "Fixture: loggers can view their audit log rows" on public.document_audit_logs for select
    using (auth.uid() = user_id);
    create policy "Fixture: participants can view their documents" on public.documents for select
    using (auth.uid() = sender_id or auth.uid() = recipient_id);

    create policy "Job owner can read quiz keys" on public.job_quiz_keys for select
    using (public.is_job_owner(job_id, auth.uid()));
    create policy "Job owner can write quiz keys" on public.job_quiz_keys for all
    using (public.is_job_owner(job_id, auth.uid()))
    with check (public.is_job_owner(job_id, auth.uid()));
    create policy "Team members can read quiz keys" on public.job_quiz_keys for select
    using (public.is_active_team_member_for_job(job_id, auth.uid()));
    create policy "Team members can write quiz keys" on public.job_quiz_keys for all
    using (public.is_active_team_member_for_job(job_id, auth.uid(), true))
    with check (public.is_active_team_member_for_job(job_id, auth.uid(), true));

    create policy "Related parties can log non-signing document activity" on public.document_audit_logs for insert
    with check (
      user_id = auth.uid()
      and exists (
        select 1 from public.documents d join public.applications a on a.id = d.application_id
        where d.id = document_audit_logs.document_id
          and (
            a.candidate_id = auth.uid()
            or d.sender_id = auth.uid()
            or d.recipient_id = auth.uid()
            or public.is_job_owner(a.job_id, auth.uid())
            or public.is_active_team_member_for_job(a.job_id, auth.uid())
          )
      )
    );

    -- messages/notifications policies under test are created below, once
    -- pre-fix (from the live 20260915121000 / 20260827211000 text) and once
    -- more after the migration -- see the run() sequence.
  `);

  const PRE_FIX_MESSAGES_POLICY = `
    create policy "Counterparties can send messages" on public.messages for insert to authenticated
    with check (
      auth.uid() = sender_id
      and (
        exists (
          select 1 from public.applications a
          where a.candidate_id = auth.uid()
            and public.is_job_owner(a.job_id, messages.receiver_id)
            and (messages.application_id is null or messages.application_id = a.id)
        )
        or exists (
          select 1 from public.applications a
          where a.candidate_id = messages.receiver_id
            and public.is_job_owner(a.job_id, auth.uid())
            and (messages.application_id is null or messages.application_id = a.id)
        )
      )
    );
  `;

  const PRE_FIX_NOTIFICATIONS_POLICY = `
    create policy "Related parties can insert notifications" on public.notifications for insert to authenticated
    with check (
      auth.uid() = user_id
      or exists (
        select 1 from public.applications a
        where a.candidate_id = notifications.user_id
          and (public.is_job_owner(a.job_id, auth.uid()) or public.is_active_team_member_for_job(a.job_id, auth.uid()))
      )
      or exists (
        select 1 from public.document_requests dr
        where dr.employer_id = auth.uid() and dr.candidate_id = notifications.user_id
      )
      or exists (
        select 1 from public.applications a
        where a.candidate_id = auth.uid()
          and public.is_job_owner(a.job_id, notifications.user_id)
      )
      or exists (
        select 1 from public.document_requests dr
        where dr.candidate_id = auth.uid() and dr.employer_id = notifications.user_id
      )
    );
  `;

  await db.exec(PRE_FIX_MESSAGES_POLICY);
  await db.exec(PRE_FIX_NOTIFICATIONS_POLICY);

  // ---- seed data ----
  await db.query(`insert into public.jobs (id, employer_id) values ($1,$2),($3,$4)`, [JOB_1, EMP_1, JOB_2, EMP_2]);
  await db.query(`insert into public.applications (id, job_id, candidate_id) values ($1,$2,$3)`, [APP_1, JOB_1, CAND_1]);
  await db.query(
    `insert into public.team_members (user_id, employer_id, status, can_manage_pipeline, can_create_jobs, can_delete_jobs) values
       ($1,$2,'active',true,true,true), ($3,$2,'revoked',true,true,true)`,
    [TEAM_ACTIVE, EMP_1, TEAM_INACTIVE],
  );

  async function asUser(uid, role, sql, params = []) {
    if (uid) await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false);`);
    else await db.exec(`select set_config('request.jwt.claim.sub', '', false);`);
    await db.exec(`select set_config('request.jwt.claim.role', '${role}', false);`);
    await db.exec(`set role ${role};`);
    try {
      const r = await db.query(sql, params);
      return { ok: true, rows: r.rows };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      await db.exec(`reset role;`);
    }
  }

  async function asPostgres(sql, params = []) {
    await db.exec(`reset role;`);
    return db.query(sql, params);
  }

  return { db, asUser, asPostgres, migrationSql };
}

async function run() {
  const { db, asUser, asPostgres, migrationSql } = await main();

  console.log("\n-- sanity: PRE-fix, is_job_owner/is_active_team_member_for_job leak to a stranger --");
  {
    const r = await asUser(STRANGER, "authenticated", `select public.is_job_owner($1,$2) as v`, [JOB_1, EMP_1]);
    check("OLD: an authenticated stranger can ask is_job_owner(JOB_1, EMP_1) and get the real (true) answer", r.ok && r.rows[0].v === true, JSON.stringify(r));
  }
  {
    const r = await asUser(null, "anon", `select public.is_job_owner($1,$2) as v`, [JOB_1, EMP_1]);
    check("OLD: even signed-out anon can ask is_job_owner(JOB_1, EMP_1) directly", r.ok && r.rows[0].v === true, JSON.stringify(r));
  }
  {
    const r = await asUser(STRANGER, "authenticated", `select public.is_active_team_member_for_job($1,$2) as v`, [JOB_1, TEAM_ACTIVE]);
    check("OLD: a stranger can probe whether TEAM_ACTIVE is an active team member of JOB_1", r.ok && r.rows[0].v === true, JSON.stringify(r));
  }

  console.log("\n-- sanity: PRE-fix, legit candidate->employer message/notification insert works --");
  {
    const r = await asUser(CAND_1, "authenticated", `insert into public.messages (sender_id, receiver_id, application_id, content) values ($1,$2,$3,'hi') returning id`, [CAND_1, EMP_1, APP_1]);
    check("OLD: CAND_1 can message EMP_1 (owner of the job CAND_1 applied to)", r.ok && r.rows.length === 1, JSON.stringify(r));
  }
  {
    // No RETURNING: a candidate inserting a notification addressed to the
    // employer can satisfy the INSERT policy's WITH CHECK without being
    // able to SELECT the employer's own notification row back (same as
    // live -- notifications has no "sender can read the recipient's row"
    // policy). Confirm the insert landed via a direct postgres read instead.
    const before = await asPostgres(`select count(*)::int as c from public.notifications where user_id = $1`, [EMP_1]);
    const r = await asUser(CAND_1, "authenticated", `insert into public.notifications (user_id) values ($1)`, [EMP_1]);
    const after = await asPostgres(`select count(*)::int as c from public.notifications where user_id = $1`, [EMP_1]);
    check("OLD: CAND_1 can notify EMP_1 (owner of the job CAND_1 applied to)", r.ok && after.rows[0].c === before.rows[0].c + 1, JSON.stringify({ r, before: before.rows, after: after.rows }));
  }

  // =====================================================================
  // Apply the migration under test, verbatim.
  // =====================================================================
  await db.exec(migrationSql);

  console.log("\n-- (1) direct RPC probe of an arbitrary p_user_id is closed --");
  {
    const r = await asUser(STRANGER, "authenticated", `select public.is_job_owner($1,$2) as v`, [JOB_1, EMP_1]);
    check("NEW: authenticated stranger asking is_job_owner(JOB_1, EMP_1) gets false, not the real answer", r.ok && (r.rows[0].v === false || r.rows[0].v === null), JSON.stringify(r));
  }
  {
    const r = await asUser(null, "anon", `select public.is_job_owner($1,$2) as v`, [JOB_1, EMP_1]);
    check("NEW: anon calling is_job_owner directly is refused outright (permission denied)", !r.ok, JSON.stringify(r));
  }
  {
    const r = await asUser(STRANGER, "authenticated", `select public.is_active_team_member_for_job($1,$2) as v`, [JOB_1, TEAM_ACTIVE]);
    check("NEW: stranger probing is_active_team_member_for_job(JOB_1, TEAM_ACTIVE) gets false, not the real answer", r.ok && (r.rows[0].v === false || r.rows[0].v === null), JSON.stringify(r));
  }
  {
    const r = await asUser(null, "anon", `select public.is_active_team_member_for_job($1,$2) as v`, [JOB_1, TEAM_ACTIVE]);
    check("NEW: anon calling is_active_team_member_for_job directly is refused outright", !r.ok, JSON.stringify(r));
  }
  {
    const r = await asUser(EMP_1, "authenticated", `select public.is_job_owner($1,$2) as v`, [JOB_1, EMP_1]);
    check("legit: EMP_1 asking is_job_owner(JOB_1, EMP_1) about themselves still returns true", r.ok && r.rows[0].v === true, JSON.stringify(r));
  }
  {
    const r = await asUser(EMP_1, "authenticated", `select public.is_job_owner($1,$2) as v`, [JOB_2, EMP_1]);
    check("unchanged: EMP_1 asking is_job_owner(JOB_2, EMP_1) about themselves (a job they don't own) still correctly returns false", r.ok && r.rows[0].v === false, JSON.stringify(r));
  }
  {
    const r = await asUser(TEAM_ACTIVE, "authenticated", `select public.is_active_team_member_for_job($1,$2) as v`, [JOB_1, TEAM_ACTIVE]);
    check("legit: TEAM_ACTIVE checking their own active membership on JOB_1 still returns true", r.ok && r.rows[0].v === true, JSON.stringify(r));
  }
  {
    const r = await asUser(null, "service_role", `select public.is_job_owner($1,$2) as v`, [JOB_1, EMP_1]);
    check("service_role: calling is_job_owner as service_role still returns the real answer (edge functions unaffected)", r.ok && r.rows[0].v === true, JSON.stringify(r));
  }

  console.log("\n-- (2) applications employer/team RLS policies unaffected --");
  {
    const r = await asUser(EMP_1, "authenticated", `select id from public.applications where id = $1`, [APP_1]);
    check("legit: EMP_1 (owner of JOB_1) can still see CAND_1's application", r.ok && r.rows.length === 1, JSON.stringify(r));
  }
  {
    const r = await asUser(EMP_2, "authenticated", `select id from public.applications where id = $1`, [APP_1]);
    check("unchanged: EMP_2 (unrelated employer) still cannot see CAND_1's application via the owner policy", r.ok && r.rows.length === 0, JSON.stringify(r));
  }
  {
    const r = await asUser(TEAM_ACTIVE, "authenticated", `select id from public.applications where id = $1`, [APP_1]);
    check("legit: TEAM_ACTIVE (active team member of EMP_1) can still see CAND_1's application", r.ok && r.rows.length === 1, JSON.stringify(r));
  }
  {
    const r = await asUser(TEAM_INACTIVE, "authenticated", `select id from public.applications where id = $1`, [APP_1]);
    check("unchanged: TEAM_INACTIVE (revoked team member) still cannot see CAND_1's application", r.ok && r.rows.length === 0, JSON.stringify(r));
  }
  {
    const r = await asUser(EMP_1, "authenticated", `update public.applications set status = 'reviewing' where id = $1 returning id`, [APP_1]);
    check("legit: EMP_1 can still update CAND_1's application", r.ok && r.rows.length === 1, JSON.stringify(r));
  }

  console.log("\n-- (3) document_audit_logs, job_quiz_keys, get_job_quiz_keys, grant_quiz_retake unaffected --");
  {
    await asPostgres(`insert into public.documents (id, application_id, sender_id) values ($1,$2,$3)`, ["70000000-0000-0000-0000-00000000000a", APP_1, EMP_1]);
    const r = await asUser(EMP_1, "authenticated", `insert into public.document_audit_logs (document_id, user_id, action) values ($1,$2,'document_viewed') returning id`, ["70000000-0000-0000-0000-00000000000a", EMP_1]);
    check("legit: EMP_1 (job owner) can still log document activity on CAND_1's application", r.ok && r.rows.length === 1, JSON.stringify(r));
  }
  {
    await asPostgres(`insert into public.job_quiz_keys (job_id, step_id, question_id, key) values ($1,'quiz','q1','{"a":1}'::jsonb)`, [JOB_1]);
    const r = await asUser(EMP_1, "authenticated", `select * from public.job_quiz_keys where job_id = $1`, [JOB_1]);
    check("legit: EMP_1 (job owner) can still read JOB_1's quiz keys", r.ok && r.rows.length === 1, JSON.stringify(r));
    const asStranger = await asUser(STRANGER, "authenticated", `select * from public.job_quiz_keys where job_id = $1`, [JOB_1]);
    check("unchanged: a stranger still sees zero quiz key rows for JOB_1", asStranger.ok && asStranger.rows.length === 0, JSON.stringify(asStranger));
  }
  {
    const r = await asUser(EMP_1, "authenticated", `select * from public.get_job_quiz_keys($1)`, [JOB_1]);
    check("legit: get_job_quiz_keys still works for EMP_1 (job owner)", r.ok && r.rows.length === 1, JSON.stringify(r));
  }
  {
    const r = await asUser(TEAM_ACTIVE, "authenticated", `select * from public.get_job_quiz_keys($1)`, [JOB_1]);
    check("legit: get_job_quiz_keys still works for TEAM_ACTIVE (active team member)", r.ok && r.rows.length === 1, JSON.stringify(r));
  }
  {
    const r = await asUser(STRANGER, "authenticated", `select * from public.get_job_quiz_keys($1)`, [JOB_1]);
    check("unchanged: get_job_quiz_keys still refuses a stranger", !r.ok, JSON.stringify(r));
  }
  {
    const r = await asUser(EMP_1, "authenticated", `select public.grant_quiz_retake($1,$2,'quiz')`, [CAND_1, JOB_1]);
    check("legit: grant_quiz_retake still works for EMP_1 (job owner)", r.ok, JSON.stringify(r));
  }
  {
    const r = await asUser(STRANGER, "authenticated", `select public.grant_quiz_retake($1,$2,'quiz')`, [CAND_1, JOB_1]);
    check("unchanged: grant_quiz_retake still refuses a stranger", !r.ok, JSON.stringify(r));
  }

  console.log("\n-- (4) protect_application_columns and notify_new_application_submitted unaffected --");
  {
    const r = await asUser(EMP_1, "authenticated", `update public.applications set status = 'interview' where id = $1 returning id`, [APP_1]);
    check("legit: EMP_1 (job owner) can still move CAND_1's application to 'interview' via the trigger's owner bypass", r.ok && r.rows.length === 1, JSON.stringify(r));
  }
  {
    await asPostgres(`update public.applications set status = 'reviewing' where id = $1`, [APP_1]);
    const r = await asUser(CAND_1, "authenticated", `update public.applications set status = 'interview' where id = $1 returning id`, [APP_1]);
    check("unchanged: a candidate is still blocked from self-promoting to 'interview' by the trigger", !r.ok && /Candidates cannot set application status/.test(r.error || ""), JSON.stringify(r));
  }
  {
    const newAppId = "60000000-0000-0000-0000-00000000000b";
    await asPostgres(`insert into public.applications (id, job_id, candidate_id) values ($1,$2,$3)`, [newAppId, JOB_1, CAND_3]);
    const owner = await asPostgres(`select count(*)::int as c from public.notifications where user_id = $1`, [EMP_1]);
    const team = await asPostgres(`select count(*)::int as c from public.notifications where user_id = $1`, [TEAM_ACTIVE]);
    check("legit: notify_new_application_submitted still notifies the job owner on a new application", owner.rows[0].c >= 1, JSON.stringify(owner.rows));
    check("legit: notify_new_application_submitted still notifies the active team member on a new application", team.rows[0].c >= 1, JSON.stringify(team.rows));
  }

  console.log("\n-- (5) messages/notifications: the two rewritten policy branches keep their exact live behavior --");
  {
    const r = await asUser(CAND_1, "authenticated", `insert into public.messages (sender_id, receiver_id, application_id, content) values ($1,$2,$3,'hi again') returning id`, [CAND_1, EMP_1, APP_1]);
    check("legit (unchanged): CAND_1 can still message EMP_1 (owner of the job CAND_1 applied to)", r.ok && r.rows.length === 1, JSON.stringify(r));
  }
  {
    const r = await asUser(EMP_1, "authenticated", `insert into public.messages (sender_id, receiver_id, application_id, content) values ($1,$2,$3,'hello') returning id`, [EMP_1, CAND_1, APP_1]);
    check("legit (unchanged): EMP_1 can still message CAND_1 back (employer -> candidate branch, untouched)", r.ok && r.rows.length === 1, JSON.stringify(r));
  }
  {
    const r = await asUser(CAND_2, "authenticated", `insert into public.messages (sender_id, receiver_id, content) values ($1,$2,'spam')`, [CAND_2, EMP_1]);
    check("unchanged: CAND_2 (never applied to any EMP_1 job) is still refused messaging EMP_1", !r.ok, JSON.stringify(r));
  }
  {
    const before = await asPostgres(`select count(*)::int as c from public.notifications where user_id = $1`, [EMP_1]);
    const r = await asUser(CAND_1, "authenticated", `insert into public.notifications (user_id) values ($1)`, [EMP_1]);
    const after = await asPostgres(`select count(*)::int as c from public.notifications where user_id = $1`, [EMP_1]);
    check("legit (unchanged): CAND_1 can still notify EMP_1 (owner of the job CAND_1 applied to)", r.ok && after.rows[0].c === before.rows[0].c + 1, JSON.stringify({ r, before: before.rows, after: after.rows }));
  }
  {
    const r = await asUser(CAND_1, "authenticated", `insert into public.notifications (user_id) values ($1) returning id`, [EMP_2]);
    check("unchanged: CAND_1 (never applied to EMP_2's job) is still refused notifying EMP_2", !r.ok, JSON.stringify(r));
  }
  {
    // The actual leak shape this migration closes: a stranger inserting a
    // message/notification can no longer use messages.receiver_id /
    // notifications.user_id as a free probe of is_job_owner via the WITH
    // CHECK expression, because that branch no longer calls the RPC-exposed
    // function with a non-caller id at all -- it's an inline EXISTS the
    // stranger's own application row (of which they have none) can't
    // satisfy either way.
    const r = await asUser(STRANGER, "authenticated", `insert into public.messages (sender_id, receiver_id, content) values ($1,$2,'probe')`, [STRANGER, EMP_1]);
    check("unchanged: a stranger with no application to JOB_1 still cannot message EMP_1", !r.ok, JSON.stringify(r));
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  await db.close();
  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
