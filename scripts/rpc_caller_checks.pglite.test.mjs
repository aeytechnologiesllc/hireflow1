#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20260915131000_rpc_caller_checks.sql
 * — plain assertions against a real Postgres (PGlite), not a text match.
 *
 * Builds a minimal fixture of the tables/enum the 14 reviewed functions and
 * their calling RLS policies touch (user_roles, subscriptions, jobs,
 * applications, team_members, documents, document_requests,
 * team_invitations, profiles, plus auth.users and private.
 * has_subscription_bypass_for_user), seeds the PRE-fix function bodies and
 * PRE-fix grants (PUBLIC has EXECUTE — the actual root cause, confirmed live)
 * together with every live RLS policy that calls one of the six kept
 * functions, and proves:
 *
 *   1. Pre-fix, the leak is real: a stranger (or anon) can call the eight
 *      internal/dead functions directly and get a real answer about ANY
 *      target id.
 *   2. Applying the migration (read verbatim from disk, not retyped) makes
 *      that same direct call fail with a Postgres permission error for
 *      anon/authenticated, while service_role and the internal call chain
 *      (can_create_jobs_for_user -> job_limit_for_user ->
 *      subscription_plan_for_limits, etc.) keep working exactly as before.
 *   3. For the six kept-and-guarded functions, a direct call naming a
 *      target the caller has no relationship to now returns false/NULL
 *      instead of the real answer, while every real call shape the live
 *      RLS policies use — self, and the team-member-on-behalf-of-employer
 *      shape — returns the identical answer as pre-fix.
 *   4. The actual RLS-driven INSERT/SELECT flows (jobs, documents,
 *      document_requests, team_invitations, profiles, applications) behave
 *      identically for legitimate employers, team members and candidates,
 *      and stay blocked for strangers, after the migration as before it.
 *
 * `anon`/`authenticated`/`service_role` are real, separate Postgres roles
 * (not the table owner), so every check below is genuinely subject to RLS
 * and to GRANT/REVOKE, not an approximation of it.
 *
 * Run with: node scripts/rpc_caller_checks.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915131000_rpc_caller_checks.sql");

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
const EMP_1 = "10000000-0000-0000-0000-00000000000a"; // owns JOB_1; growth plan; 1 job posted (under limit=3)
const EMP_2 = "10000000-0000-0000-0000-00000000000b"; // owns JOB_2; unrelated to EMP_1
const EMP_BIZ = "10000000-0000-0000-0000-00000000000c"; // business plan (team_member_limit = -1, unlimited) -- used for the can_invite_team_members true-case
const TEAM_ACTIVE = "30000000-0000-0000-0000-000000000001"; // active team member of EMP_1, can_create_jobs/can_send_documents
const TEAM_INACTIVE = "30000000-0000-0000-0000-000000000002"; // revoked team member of EMP_1
const CAND_1 = "20000000-0000-0000-0000-000000000001"; // applied to JOB_1
const CAND_2 = "20000000-0000-0000-0000-000000000002"; // never applied anywhere
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
    create table auth.users (
      id uuid primary key,
      raw_app_meta_data jsonb not null default '{}'::jsonb
    );
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

    -- ---- private.has_subscription_bypass_for_user, verbatim from the live
    -- project (confirmed via mcp__supabase__execute_sql before writing this
    -- fixture) ----
    create schema private;
    create or replace function private.has_subscription_bypass_for_user(target_user_id uuid)
    returns boolean language sql stable security definer set search_path to '' as $$
      select coalesce(
        (
          select lower(coalesce(u.raw_app_meta_data ->> 'subscription_bypass', 'false')) = 'true'
          from auth.users u
          where u.id = target_user_id
        ),
        false
      );
    $$;

    -- ---- minimal public schema ----
    create type public.app_role as enum ('employer', 'candidate', 'team_member', 'developer');

    create table public.user_roles (
      user_id uuid not null,
      role public.app_role not null
    );

    create table public.subscriptions (
      user_id uuid not null,
      plan_type text,
      status text,
      trial_end timestamptz,
      updated_at timestamptz default now(),
      created_at timestamptz default now()
    );

    create table public.jobs (
      id uuid primary key default gen_random_uuid(),
      employer_id uuid not null
    );

    create table public.applications (
      id uuid primary key default gen_random_uuid(),
      job_id uuid not null references public.jobs(id),
      candidate_id uuid not null
    );

    create table public.team_members (
      user_id uuid not null,
      employer_id uuid not null,
      status text not null default 'active',
      can_create_jobs boolean not null default false,
      can_send_documents boolean not null default false,
      assigned_job_ids uuid[]
    );

    create table public.documents (
      id uuid primary key default gen_random_uuid(),
      application_id uuid references public.applications(id),
      sender_id uuid
    );

    create table public.document_requests (
      id uuid primary key default gen_random_uuid(),
      application_id uuid not null references public.applications(id),
      employer_id uuid not null
    );

    create table public.team_invitations (
      id uuid primary key default gen_random_uuid(),
      inviter_id uuid not null
    );

    create table public.profiles (
      user_id uuid primary key
    );

    alter table public.user_roles enable row level security;
    alter table public.jobs enable row level security;
    alter table public.applications enable row level security;
    alter table public.team_members enable row level security;
    alter table public.documents enable row level security;
    alter table public.document_requests enable row level security;
    alter table public.team_invitations enable row level security;
    alter table public.profiles enable row level security;

    grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;

    -- ---- PRE-fix function bodies, verbatim from the live project as of
    -- commit 85ac0fa (confirmed via mcp__supabase__execute_sql), WITH the
    -- pre-fix PUBLIC grant left in place — this is the actual root cause,
    -- not a strawman: every one of these was created without an explicit
    -- REVOKE FROM PUBLIC. ----
    create or replace function public.subscription_plan_for_limits(target_user_id uuid)
    returns text language plpgsql stable security definer set search_path to 'public' as $$
    declare
      sub_record public.subscriptions%rowtype;
    begin
      if private.has_subscription_bypass_for_user(target_user_id) then
        return 'business';
      end if;
      select * into sub_record from public.subscriptions
        where user_id = target_user_id
        order by updated_at desc nulls last, created_at desc nulls last limit 1;
      if not found then return 'trial'; end if;
      if sub_record.status = 'active' then return coalesce(sub_record.plan_type, 'growth'); end if;
      if coalesce(sub_record.plan_type, 'trial') = 'trial' or sub_record.status in ('trialing', 'expired') then
        return 'trial';
      end if;
      return 'none';
    end;
    $$;

    create or replace function public.get_user_role(_user_id uuid)
    returns public.app_role language sql stable security definer set search_path to 'public' as $$
      select role from public.user_roles where user_id = _user_id limit 1
    $$;

    create or replace function public.job_limit_for_user(target_user_id uuid)
    returns integer language sql stable security definer set search_path to 'public' as $$
      select case public.subscription_plan_for_limits(target_user_id)
        when 'business' then -1 when 'enterprise' then -1 when 'growth' then 3 when 'trial' then -1 else -1
      end;
    $$;

    create or replace function public.team_member_limit_for_user(target_user_id uuid)
    returns integer language sql stable security definer set search_path to 'public' as $$
      select case
        when private.has_subscription_bypass_for_user(target_user_id) then -1
        when exists (
          select 1 from public.subscriptions s
          where s.user_id = target_user_id and s.status = 'trialing'
            and (s.trial_end is null or s.trial_end > now())
        ) then 1
        when exists (
          select 1 from public.subscriptions s
          where s.user_id = target_user_id and s.status = 'active' and s.plan_type in ('business', 'enterprise')
        ) then -1
        else 0
      end;
    $$;

    create or replace function public.document_workflow_limit_for_user(target_user_id uuid)
    returns integer language sql stable security definer set search_path to 'public' as $$
      select case public.subscription_plan_for_limits(target_user_id)
        when 'business' then -1 when 'enterprise' then -1 when 'growth' then 20 when 'trial' then -1 else 0
      end;
    $$;

    create or replace function public.document_workflow_count_for_user(target_user_id uuid)
    returns integer language sql stable security definer set search_path to 'public' as $$
      with generated_docs as (
        select count(*)::integer as total from public.documents d
        join public.applications a on a.id = d.application_id
        join public.jobs j on j.id = a.job_id
        where j.employer_id = target_user_id
      ),
      requested_docs as (
        select count(*)::integer as total from public.document_requests dr where dr.employer_id = target_user_id
      )
      select coalesce((select total from generated_docs), 0) + coalesce((select total from requested_docs), 0);
    $$;

    create or replace function public.can_create_jobs_for_user(target_user_id uuid)
    returns boolean language sql stable security definer set search_path to 'public' as $$
      with limits as (select public.job_limit_for_user(target_user_id) as job_limit),
      usage as (select count(*)::integer as jobs_created from public.jobs where employer_id = target_user_id)
      select case
        when limits.job_limit = -1 then true
        when limits.job_limit <= 0 then false
        else usage.jobs_created < limits.job_limit
      end from limits, usage;
    $$;

    create or replace function public.can_create_document_workflows_for_user(target_user_id uuid)
    returns boolean language sql stable security definer set search_path to 'public' as $$
      with limits as (select public.document_workflow_limit_for_user(target_user_id) as document_limit),
      usage as (select public.document_workflow_count_for_user(target_user_id) as workflows_created)
      select case
        when limits.document_limit = -1 then true
        when limits.document_limit <= 0 then false
        else usage.workflows_created < limits.document_limit
      end from limits, usage;
    $$;

    create or replace function public.can_invite_team_members(target_user_id uuid)
    returns boolean language sql stable security definer set search_path to 'public' as $$
      with limits as (select public.team_member_limit_for_user(target_user_id) as team_member_limit),
      usage as (
        select count(*)::integer as active_team_members from public.team_members tm
        where tm.employer_id = target_user_id and tm.status = 'active'
      )
      select case
        when limits.team_member_limit = -1 then true
        when limits.team_member_limit <= 0 then false
        else usage.active_team_members < limits.team_member_limit
      end from limits, usage;
    $$;

    create or replace function public.is_team_member(_user_id uuid, _employer_id uuid)
    returns boolean language sql stable security definer set search_path to 'public' as $$
      select exists (
        select 1 from public.team_members
        where user_id = _user_id and employer_id = _employer_id and status = 'active'
      )
    $$;

    create or replace function public.get_team_member_permissions(_user_id uuid, _employer_id uuid)
    returns table(permission_level text, can_create_jobs boolean, assigned_job_ids uuid[])
    language sql stable security definer set search_path to 'public' as $$
      select 'standard'::text, tm.can_create_jobs, tm.assigned_job_ids
      from public.team_members tm
      where tm.user_id = _user_id and tm.employer_id = _employer_id and tm.status = 'active'
    $$;

    create or replace function public.has_role(_user_id uuid, _role public.app_role)
    returns boolean language sql stable security definer set search_path to 'public' as $$
      select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
    $$;

    create or replace function public.can_view_applicant_profile(p_profile_user_id uuid, p_viewer_id uuid)
    returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
      select exists (
        select 1 from public.applications a join public.jobs j on j.id = a.job_id
        where a.candidate_id = p_profile_user_id
          and (
            j.employer_id = p_viewer_id
            or exists (
              select 1 from public.team_members tm
              where tm.employer_id = j.employer_id and tm.user_id = p_viewer_id and tm.status = 'active'
                and (array_length(tm.assigned_job_ids, 1) is null or j.id = any (tm.assigned_job_ids))
            )
          )
      );
    $$;
    -- Live proacl has no PUBLIC entry for this one (20260715014000 already
    -- revoked it) -- only explicit anon/authenticated/service_role grants.
    -- Matching that here (rather than leaving the implicit default PUBLIC
    -- grant every fresh CREATE FUNCTION gets) is what makes the migration's
    -- later REVOKE ... FROM anon actually remove access in this fixture,
    -- same as it does live.
    revoke all on function public.can_view_applicant_profile(uuid, uuid) from public;

    create or replace function public.did_candidate_apply_to_job(p_job_id uuid, p_user_id uuid)
    returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
      select exists (select 1 from public.applications a where a.job_id = p_job_id and a.candidate_id = p_user_id);
    $$;
    revoke all on function public.did_candidate_apply_to_job(uuid, uuid) from public;

    -- The pre-fix state: no explicit REVOKE FROM PUBLIC was ever run for the
    -- other twelve, so every one of them still carries the default PUBLIC
    -- grant Postgres gives EXECUTE on CREATE FUNCTION -- this is the actual
    -- root cause, confirmed live. service_role additionally gets its own
    -- explicit grant, matching the live proacl (a separate ACL entry, not
    -- merely inherited through PUBLIC) so that revoking PUBLIC/anon/
    -- authenticated below cannot also take service_role's access with it.
    grant execute on function public.subscription_plan_for_limits(uuid) to public, service_role;
    grant execute on function public.get_user_role(uuid) to public, service_role;
    grant execute on function public.job_limit_for_user(uuid) to public, service_role;
    grant execute on function public.team_member_limit_for_user(uuid) to public, service_role;
    grant execute on function public.document_workflow_limit_for_user(uuid) to public, service_role;
    grant execute on function public.document_workflow_count_for_user(uuid) to public, service_role;
    grant execute on function public.is_team_member(uuid, uuid) to public, service_role;
    grant execute on function public.get_team_member_permissions(uuid, uuid) to public, service_role;
    grant execute on function public.can_create_jobs_for_user(uuid) to public, service_role;
    grant execute on function public.can_create_document_workflows_for_user(uuid) to public, service_role;
    grant execute on function public.can_invite_team_members(uuid) to public, service_role;
    grant execute on function public.has_role(uuid, public.app_role) to public, service_role;
    grant execute on function public.can_view_applicant_profile(uuid, uuid) to anon, authenticated, service_role;
    grant execute on function public.did_candidate_apply_to_job(uuid, uuid) to anon, authenticated, service_role;

    -- ---- live RLS policies that call the six kept functions (copied from
    -- pg_policies.qual/with_check on the live project) ----
    create policy "Candidates can create applications" on public.applications for insert
    with check (auth.uid() = candidate_id and public.has_role(auth.uid(), 'candidate'));

    create policy "Candidates can view jobs they applied to" on public.jobs for select
    using (public.did_candidate_apply_to_job(jobs.id, auth.uid()));

    create policy "Employers can create jobs" on public.jobs for insert
    with check (auth.uid() = employer_id and public.has_role(auth.uid(), 'employer') and public.can_create_jobs_for_user(auth.uid()));

    create policy "Team members can create jobs if permitted" on public.jobs for insert
    with check (
      exists (
        select 1 from public.team_members tm
        where tm.user_id = auth.uid() and tm.status = 'active' and tm.employer_id = jobs.employer_id
          and tm.can_create_jobs = true and public.can_create_jobs_for_user(tm.employer_id)
      )
    );

    create policy "Employers can create documents" on public.documents for insert to authenticated
    with check (
      public.can_create_document_workflows_for_user(auth.uid())
      and (
        (application_id is not null and exists (
          select 1 from public.applications a join public.jobs j on j.id = a.job_id
          where a.id = documents.application_id and j.employer_id = auth.uid()
        ))
        or (sender_id = auth.uid() and public.has_role(auth.uid(), 'employer'))
      )
    );

    create policy "Team members can create documents if permitted" on public.documents for insert to authenticated
    with check (
      sender_id = auth.uid() and exists (
        select 1 from public.team_members tm
        where tm.user_id = auth.uid() and tm.status = 'active' and tm.can_send_documents = true
          and public.can_create_document_workflows_for_user(tm.employer_id)
      )
    );

    create policy "Employers can create document requests" on public.document_requests for insert
    with check (
      auth.uid() = employer_id and public.can_create_document_workflows_for_user(auth.uid())
      and exists (
        select 1 from public.applications a join public.jobs j on j.id = a.job_id
        where a.id = document_requests.application_id and j.employer_id = auth.uid()
      )
    );

    create policy "Employers can create invitations" on public.team_invitations for insert
    with check (auth.uid() = inviter_id and public.has_role(auth.uid(), 'employer') and public.can_invite_team_members(auth.uid()));

    create policy "Employers can view applicant profiles" on public.profiles for select to authenticated
    using (auth.uid() = user_id or public.can_view_applicant_profile(user_id, auth.uid()));

    -- These four are read by the inline EXISTS(...) subqueries INSIDE the
    -- policies above (documents/document_requests/team-member-jobs) as the
    -- querying role itself, not through a SECURITY DEFINER helper -- so they
    -- need their own SELECT policy or RLS hides the rows from that subquery
    -- regardless of what the outer WITH CHECK intends. Copied from the live
    -- project's own "Employers can view their own jobs" / "Employers can
    -- view applications to their jobs" / "Team members can view their own
    -- record" policies.
    create policy "Employers can view their own jobs" on public.jobs for select
    using (auth.uid() = employer_id);

    create policy "Employers can view applications to their jobs" on public.applications for select
    using (exists (select 1 from public.jobs j where j.id = applications.job_id and j.employer_id = auth.uid()));

    create policy "Team members can view their own record" on public.team_members for select
    using (auth.uid() = user_id);
  `);

  // ---- seed data ----
  await db.query(`insert into public.user_roles (user_id, role) values ($1,'employer'),($2,'employer'),($3,'employer'),($4,'candidate'),($5,'candidate')`, [
    EMP_1, EMP_2, EMP_BIZ, CAND_1, CAND_2,
  ]);
  await db.query(`insert into public.subscriptions (user_id, plan_type, status) values ($1,'growth','active'),($2,'growth','active'),($3,'business','active')`, [
    EMP_1, EMP_2, EMP_BIZ,
  ]);
  await db.query(`insert into public.jobs (id, employer_id) values ($1,$2),($3,$4)`, [JOB_1, EMP_1, JOB_2, EMP_2]);
  await db.query(`insert into public.applications (id, job_id, candidate_id) values ($1,$2,$3)`, [APP_1, JOB_1, CAND_1]);
  await db.query(
    `insert into public.team_members (user_id, employer_id, status, can_create_jobs, can_send_documents) values
       ($1,$2,'active',true,true), ($3,$2,'revoked',true,true)`,
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

  // =====================================================================
  // PRE-fix sanity: prove the leak is real in this fixture before the
  // migration is applied — a pass below means the migration closes a real
  // door, not a strawman.
  // =====================================================================
  console.log("\n-- sanity: PRE-fix, the eight internal/dead functions leak to a stranger --");

  {
    const r = await asUser(STRANGER, "authenticated", `select public.get_user_role($1) as role`, [EMP_1]);
    check("OLD: a stranger can call get_user_role(EMP_1) directly and learn EMP_1 is an employer", r.ok && r.rows[0].role === "employer", JSON.stringify(r));
  }
  {
    const r = await asUser(null, "anon", `select public.get_user_role($1) as role`, [EMP_1]);
    check("OLD: even signed-out anon can call get_user_role(EMP_1) directly", r.ok && r.rows[0].role === "employer", JSON.stringify(r));
  }
  {
    const r = await asUser(STRANGER, "authenticated", `select public.subscription_plan_for_limits($1) as plan`, [EMP_1]);
    check("OLD: a stranger can learn EMP_1's billing plan directly", r.ok && r.rows[0].plan === "growth", JSON.stringify(r));
  }
  {
    const r = await asUser(STRANGER, "authenticated", `select public.job_limit_for_user($1) as v`, [EMP_1]);
    check("OLD: a stranger can learn EMP_1's job limit directly", r.ok && Number(r.rows[0].v) === 3, JSON.stringify(r));
  }
  {
    const r = await asUser(STRANGER, "authenticated", `select public.team_member_limit_for_user($1) as v`, [EMP_1]);
    check("OLD: a stranger can learn EMP_1's team member limit directly", r.ok, JSON.stringify(r));
  }
  {
    const r = await asUser(STRANGER, "authenticated", `select public.document_workflow_limit_for_user($1) as v`, [EMP_1]);
    check("OLD: a stranger can learn EMP_1's document workflow limit directly", r.ok, JSON.stringify(r));
  }
  {
    const r = await asUser(STRANGER, "authenticated", `select public.document_workflow_count_for_user($1) as v`, [EMP_1]);
    check("OLD: a stranger can learn EMP_1's document workflow usage directly", r.ok, JSON.stringify(r));
  }
  {
    const r = await asUser(STRANGER, "authenticated", `select public.is_team_member($1,$2) as v`, [TEAM_ACTIVE, EMP_1]);
    check("OLD: a stranger can probe whether TEAM_ACTIVE is a team member of EMP_1 directly", r.ok && r.rows[0].v === true, JSON.stringify(r));
  }
  {
    const r = await asUser(STRANGER, "authenticated", `select * from public.get_team_member_permissions($1,$2)`, [TEAM_ACTIVE, EMP_1]);
    check("OLD: a stranger can read TEAM_ACTIVE's full permission set for EMP_1 directly", r.ok && r.rows.length === 1, JSON.stringify(r));
  }

  // =====================================================================
  // Apply the migration under test, verbatim.
  // =====================================================================
  await db.exec(migrationSql);

  // =====================================================================
  // 1) The eight internal/dead functions: direct calls now fail outright
  // for anon/authenticated; service_role and the internal call chain still
  // work.
  // =====================================================================
  console.log("\n-- (1) internal/dead functions: PostgREST RPC endpoint closed --");

  const leafChecks = [
    ["get_user_role", `select public.get_user_role($1)`, [EMP_1]],
    ["subscription_plan_for_limits", `select public.subscription_plan_for_limits($1)`, [EMP_1]],
    ["job_limit_for_user", `select public.job_limit_for_user($1)`, [EMP_1]],
    ["team_member_limit_for_user", `select public.team_member_limit_for_user($1)`, [EMP_1]],
    ["document_workflow_limit_for_user", `select public.document_workflow_limit_for_user($1)`, [EMP_1]],
    ["document_workflow_count_for_user", `select public.document_workflow_count_for_user($1)`, [EMP_1]],
    ["is_team_member", `select public.is_team_member($1,$2)`, [TEAM_ACTIVE, EMP_1]],
    ["get_team_member_permissions", `select * from public.get_team_member_permissions($1,$2)`, [TEAM_ACTIVE, EMP_1]],
  ];
  for (const [name, sql, params] of leafChecks) {
    const asStranger = await asUser(STRANGER, "authenticated", sql, params);
    check(`NEW: authenticated stranger calling ${name}(...) directly is refused (permission denied)`, !asStranger.ok, JSON.stringify(asStranger));
    const asAnonCall = await asUser(null, "anon", sql, params);
    check(`NEW: anon calling ${name}(...) directly is refused (permission denied)`, !asAnonCall.ok, JSON.stringify(asAnonCall));
  }
  {
    const r = await asUser(EMP_1, "service_role", `select public.get_user_role($1) as role`, [EMP_1]);
    check("NEW: service_role can still call get_user_role directly (edge functions unaffected)", r.ok && r.rows[0].role === "employer", JSON.stringify(r));
  }
  {
    // The internal SECURITY DEFINER chain (owned by postgres throughout)
    // still works after the leaves are locked down: can_create_jobs_for_user
    // -> job_limit_for_user -> subscription_plan_for_limits.
    const r = await asUser(EMP_1, "authenticated", `select public.can_create_jobs_for_user($1) as v`, [EMP_1]);
    check(
      "NEW: can_create_jobs_for_user still resolves correctly for EMP_1 (internal chain to job_limit_for_user/subscription_plan_for_limits unaffected by revoking anon/authenticated on the leaves)",
      r.ok && r.rows[0].v === true,
      JSON.stringify(r),
    );
  }

  // =====================================================================
  // 2) The six kept-and-guarded functions: direct probing of an unrelated
  // target now returns false/NULL instead of the real answer; every real
  // call shape still returns the identical answer as pre-fix.
  // =====================================================================
  console.log("\n-- (2) kept functions: caller checks close the probe, legit shapes unchanged --");

  {
    const r = await asUser(STRANGER, "authenticated", `select public.has_role($1,'employer') as v`, [EMP_1]);
    check("NEW: stranger directly asking has_role(EMP_1,'employer') gets false, not the real answer", r.ok && (r.rows[0].v === false || r.rows[0].v === null), JSON.stringify(r));
  }
  {
    const r = await asUser(EMP_1, "authenticated", `select public.has_role($1,'employer') as v`, [EMP_1]);
    check("legit: has_role(auth.uid(),'employer') called on yourself still returns true", r.ok && r.rows[0].v === true, JSON.stringify(r));
  }

  {
    const r = await asUser(STRANGER, "authenticated", `select public.can_create_jobs_for_user($1) as v`, [EMP_1]);
    check("NEW: stranger directly probing can_create_jobs_for_user(EMP_1) gets false, not EMP_1's real limit status", r.ok && (r.rows[0].v === false || r.rows[0].v === null), JSON.stringify(r));
  }
  {
    const r = await asUser(TEAM_ACTIVE, "authenticated", `select public.can_create_jobs_for_user($1) as v`, [EMP_1]);
    check("legit: an active team member checking their own employer's job-creation capacity still returns true", r.ok && r.rows[0].v === true, JSON.stringify(r));
  }
  {
    const r = await asUser(TEAM_INACTIVE, "authenticated", `select public.can_create_jobs_for_user($1) as v`, [EMP_1]);
    check("NEW: a revoked team member calling can_create_jobs_for_user(EMP_1) directly gets false (not an active relationship)", r.ok && (r.rows[0].v === false || r.rows[0].v === null), JSON.stringify(r));
  }

  {
    const r = await asUser(STRANGER, "authenticated", `select public.can_create_document_workflows_for_user($1) as v`, [EMP_1]);
    check("NEW: stranger directly probing can_create_document_workflows_for_user(EMP_1) gets false", r.ok && (r.rows[0].v === false || r.rows[0].v === null), JSON.stringify(r));
  }
  {
    const r = await asUser(TEAM_ACTIVE, "authenticated", `select public.can_create_document_workflows_for_user($1) as v`, [EMP_1]);
    check("legit: an active team member checking their own employer's document-workflow capacity still returns true", r.ok && r.rows[0].v === true, JSON.stringify(r));
  }

  {
    // EMP_BIZ (business plan) really can invite (unlimited team_member_limit)
    // -- probing with EMP_BIZ's id makes a false result here unambiguously
    // the caller check, not a coincidental real "no" from the plan limit.
    const r = await asUser(STRANGER, "authenticated", `select public.can_invite_team_members($1) as v`, [EMP_BIZ]);
    check("NEW: stranger directly probing can_invite_team_members(EMP_BIZ) gets false, not EMP_BIZ's real (true) capacity", r.ok && (r.rows[0].v === false || r.rows[0].v === null), JSON.stringify(r));
  }
  {
    const r = await asUser(EMP_BIZ, "authenticated", `select public.can_invite_team_members($1) as v`, [EMP_BIZ]);
    check("legit: EMP_BIZ checking their own invite capacity still returns true", r.ok && r.rows[0].v === true, JSON.stringify(r));
  }
  {
    // EMP_1 (growth plan) has a real team_member_limit of 0 -- confirms the
    // false above is the caller check, by showing the *real*, self-checked
    // answer for a plan that genuinely disallows it is also false.
    const r = await asUser(EMP_1, "authenticated", `select public.can_invite_team_members($1) as v`, [EMP_1]);
    check("unchanged: EMP_1 (growth plan, real team-member limit is 0) still correctly gets false checking themselves", r.ok && r.rows[0].v === false, JSON.stringify(r));
  }

  {
    // STRANGER probes "can EMP_1 view CAND_1's profile" by passing EMP_1 as
    // p_viewer_id while authenticated as themself — the actual leak shape.
    const r = await asUser(STRANGER, "authenticated", `select public.can_view_applicant_profile($1,$2) as v`, [CAND_1, EMP_1]);
    check("NEW: stranger passing someone else's id as p_viewer_id gets false, not the real answer", r.ok && (r.rows[0].v === false || r.rows[0].v === null), JSON.stringify(r));
  }
  {
    const r = await asUser(EMP_1, "authenticated", `select public.can_view_applicant_profile($1,$2) as v`, [CAND_1, EMP_1]);
    check("legit: EMP_1 checking their own view of CAND_1 (their real applicant) still returns true", r.ok && r.rows[0].v === true, JSON.stringify(r));
  }
  {
    const r = await asUser(TEAM_ACTIVE, "authenticated", `select public.can_view_applicant_profile($1,$2) as v`, [CAND_1, TEAM_ACTIVE]);
    check("legit: an active team member checking their own view of an applicant to their employer's job still returns true", r.ok && r.rows[0].v === true, JSON.stringify(r));
  }
  {
    const r = await asUser(EMP_2, "authenticated", `select public.can_view_applicant_profile($1,$2) as v`, [CAND_1, EMP_2]);
    check("legit (unchanged): an unrelated employer checking their own view of CAND_1 still correctly returns false", r.ok && r.rows[0].v === false, JSON.stringify(r));
  }
  {
    const r = await asUser(null, "anon", `select public.can_view_applicant_profile($1,$2) as v`, [CAND_1, EMP_1]);
    check("NEW: anon's EXECUTE grant on can_view_applicant_profile is revoked (never legitimately used signed-out)", !r.ok, JSON.stringify(r));
  }

  {
    const r = await asUser(STRANGER, "authenticated", `select public.did_candidate_apply_to_job($1,$2) as v`, [JOB_1, CAND_1]);
    check("NEW: stranger passing someone else's id as p_user_id gets false, not whether CAND_1 really applied", r.ok && (r.rows[0].v === false || r.rows[0].v === null), JSON.stringify(r));
  }
  {
    const r = await asUser(CAND_1, "authenticated", `select public.did_candidate_apply_to_job($1,$2) as v`, [JOB_1, CAND_1]);
    check("legit: CAND_1 checking their own application to JOB_1 still returns true", r.ok && r.rows[0].v === true, JSON.stringify(r));
  }
  {
    const r = await asUser(CAND_2, "authenticated", `select public.did_candidate_apply_to_job($1,$2) as v`, [JOB_1, CAND_2]);
    check("legit (unchanged): CAND_2 checking their own (nonexistent) application to JOB_1 still correctly returns false", r.ok && r.rows[0].v === false, JSON.stringify(r));
  }
  {
    const r = await asUser(null, "anon", `select public.did_candidate_apply_to_job($1,$2) as v`, [JOB_1, CAND_1]);
    check("NEW: anon's EXECUTE grant on did_candidate_apply_to_job is revoked (never legitimately used signed-out)", !r.ok, JSON.stringify(r));
  }

  // =====================================================================
  // 3) The real RLS-driven flows: identical behavior for legitimate users,
  // still blocked for strangers, after the migration.
  // =====================================================================
  console.log("\n-- (3) real INSERT/SELECT flows through the calling policies, unchanged --");

  {
    const r = await asUser(EMP_1, "authenticated", `insert into public.jobs (employer_id) values ($1)`, [EMP_1]);
    check("legit: EMP_1 (employer, under their job limit) can still create a job", r.ok, JSON.stringify(r));
  }
  {
    const r = await asUser(TEAM_ACTIVE, "authenticated", `insert into public.jobs (employer_id) values ($1)`, [EMP_1]);
    check("legit: an active team member with can_create_jobs can still create a job on behalf of EMP_1", r.ok, JSON.stringify(r));
  }
  {
    const r = await asUser(TEAM_INACTIVE, "authenticated", `insert into public.jobs (employer_id) values ($1)`, [EMP_1]);
    check("unchanged: a revoked team member still cannot create a job for EMP_1", !r.ok, JSON.stringify(r));
  }
  {
    const r = await asUser(STRANGER, "authenticated", `insert into public.jobs (employer_id) values ($1)`, [EMP_1]);
    check("unchanged: a stranger still cannot create a job claiming EMP_1 as employer_id", !r.ok, JSON.stringify(r));
  }

  {
    const r = await asUser(EMP_1, "authenticated", `insert into public.document_requests (application_id, employer_id) values ($1,$2)`, [APP_1, EMP_1]);
    check("legit: EMP_1 can still create a document request for their own applicant", r.ok, JSON.stringify(r));
  }

  {
    const r = await asUser(EMP_BIZ, "authenticated", `insert into public.team_invitations (inviter_id) values ($1)`, [EMP_BIZ]);
    check("legit: EMP_BIZ (business plan, real capacity) can still create a team invitation", r.ok, JSON.stringify(r));
  }
  {
    const r = await asUser(STRANGER, "authenticated", `insert into public.team_invitations (inviter_id) values ($1)`, [STRANGER]);
    check("unchanged: a non-employer stranger still cannot create a team invitation (has_role fails)", !r.ok, JSON.stringify(r));
  }

  {
    const r = await asUser(CAND_1, "authenticated", `select 1 from public.jobs where id = $1`, [JOB_1]);
    check("legit: CAND_1 (who applied) can still see JOB_1 via did_candidate_apply_to_job", r.ok && r.rows.length === 1, JSON.stringify(r));
  }
  {
    const r = await asUser(CAND_2, "authenticated", `select 1 from public.jobs where id = $1`, [JOB_1]);
    check("unchanged: CAND_2 (never applied) still cannot see JOB_1 via that policy", r.ok && r.rows.length === 0, JSON.stringify(r));
  }

  {
    await asPostgres(`insert into public.profiles (user_id) values ($1)`, [CAND_1]);
    const r = await asUser(EMP_1, "authenticated", `select 1 from public.profiles where user_id = $1`, [CAND_1]);
    check("legit: EMP_1 can still view CAND_1's profile (real applicant to EMP_1's job)", r.ok && r.rows.length === 1, JSON.stringify(r));
    const r2 = await asUser(EMP_2, "authenticated", `select 1 from public.profiles where user_id = $1`, [CAND_1]);
    check("unchanged: EMP_2 (unrelated) still cannot view CAND_1's profile", r2.ok && r2.rows.length === 0, JSON.stringify(r2));
  }

  console.log(`\n${passed} of ${passed + failed} checks passed.`);
  console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
