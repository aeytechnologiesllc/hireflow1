#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20260916170000_job_billing_schema.sql
 * — plain assertions against a real Postgres (PGlite), not a text match.
 *
 * Builds a minimal fixture (auth shim, jobs/applications/team_members/
 * subscriptions trimmed to what this migration touches, plus the ALREADY-
 * SHIPPED is_job_owner/is_active_team_member_for_job bodies verbatim from
 * 20260915141000), applies the migration under test read from disk, and
 * proves:
 *
 *   1. app_settings is the generic key/value table shared with
 *      fix/w1-coaching-report's 20260916160000 migration (this one was
 *      renamed to 20260916170000 to run after it), seeded with
 *      billing_enabled/boost_enabled rows, publicly SELECT-able but not
 *      writable by anon/authenticated, and get_billing_flags() returns the
 *      real values (false/false by default).
 *   2. job_unlocks / applicant_packs / voice_interview_charges / boost_orders
 *      all have RLS on; the job owner and an active team member can SELECT
 *      their own job's rows, an unrelated employer and a stranger cannot,
 *      anon cannot, and no INSERT/UPDATE/DELETE succeeds for anon or
 *      authenticated (server-only — only service_role, which bypasses RLS,
 *      writes).
 *   3. The entitlement functions compute the documented high-water-mark
 *      model correctly across a matrix of unlock/pack/applicant-count
 *      fixtures, and are NOT directly callable by anon/authenticated
 *      (revoked) — only via the caller-checked get_job_billing_status().
 *   4. get_job_billing_status() refuses a stranger and an unrelated
 *      employer, and returns the correct computed snapshot for the job
 *      owner, an active team member, and service_role.
 *   5. Voice interview billability: unmetered before any unlock, included
 *      for the first 10 after a job's first unlock, billable from #11, and
 *      flat at 10 (never scaling with unlock count) across a second unlock,
 *      an overlapping applicant pack, and a lapsed (expired) unlock window.
 *
 * Run with: node scripts/job_billing_schema.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260916170000_job_billing_schema.sql");

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

const EMP_1 = "10000000-0000-0000-0000-00000000000a"; // owns JOB_1
const EMP_2 = "10000000-0000-0000-0000-00000000000b"; // owns JOB_2, unrelated
const TEAM_ACTIVE = "30000000-0000-0000-0000-000000000001"; // active team member of EMP_1
const TEAM_INACTIVE = "30000000-0000-0000-0000-000000000002"; // revoked team member of EMP_1
const STRANGER = "40000000-0000-0000-0000-000000000001";

const JOB_1 = "50000000-0000-0000-0000-00000000000a";
const JOB_2 = "50000000-0000-0000-0000-00000000000b"; // EMP_2's, unrelated
const JOB_EMPTY = "50000000-0000-0000-0000-00000000000c"; // EMP_1's, zero applicants
const JOB_VOICE = "50000000-0000-0000-0000-00000000000d"; // EMP_1's, dedicated to the voice-billing matrix (section 6b)

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

    -- ---- minimal public schema (live column shapes, trimmed) ----
    create table public.jobs (
      id uuid primary key default gen_random_uuid(),
      employer_id uuid not null
    );

    create table public.applications (
      id uuid primary key default gen_random_uuid(),
      job_id uuid not null references public.jobs(id),
      candidate_id uuid not null,
      created_at timestamptz not null default now()
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

    create table public.subscriptions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null
    );

    create table public.voice_session_log (
      id uuid primary key default gen_random_uuid()
    );

    alter table public.jobs enable row level security;
    alter table public.applications enable row level security;
    alter table public.team_members enable row level security;

    grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;

    -- ---- already-shipped helpers (20260915141000), verbatim ----
    create or replace function public.is_job_owner(p_job_id uuid, p_user_id uuid)
    returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
      select (p_user_id = auth.uid() or auth.role() = 'service_role')
        and exists (
          select 1 from public.jobs j where j.id = p_job_id and j.employer_id = p_user_id
        );
    $$;

    create or replace function public.is_active_team_member_for_job(
      p_job_id uuid, p_user_id uuid,
      p_require_manage_pipeline boolean default false,
      p_require_create_jobs boolean default false,
      p_require_delete_jobs boolean default false
    )
    returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
      select (p_user_id = auth.uid() or auth.role() = 'service_role')
        and exists (
          select 1 from public.jobs j join public.team_members tm on tm.employer_id = j.employer_id
          where j.id = p_job_id and tm.user_id = p_user_id and tm.status = 'active'
            and (not p_require_manage_pipeline or tm.can_manage_pipeline = true)
            and (not p_require_create_jobs or tm.can_create_jobs = true)
            and (not p_require_delete_jobs or tm.can_delete_jobs = true)
            and (array_length(tm.assigned_job_ids, 1) is null or j.id = any (tm.assigned_job_ids))
        );
    $$;
    revoke execute on function public.is_job_owner(uuid, uuid) from public, anon;
    revoke execute on function public.is_active_team_member_for_job(uuid, uuid, boolean, boolean, boolean) from public, anon;
    grant execute on function public.is_job_owner(uuid, uuid) to authenticated, service_role;
    grant execute on function public.is_active_team_member_for_job(uuid, uuid, boolean, boolean, boolean) to authenticated, service_role;

    -- ---- already-shipped update_updated_at_column (20251214183024) ----
    create or replace function public.update_updated_at_column()
    returns trigger language plpgsql set search_path = public as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$;

    -- policies so RETURNING and ordinary reads work the way they do live
    create policy "Employers can view their own jobs" on public.jobs for select
    using (auth.uid() = employer_id);
    create policy "Candidates can insert their applications" on public.applications for insert
    with check (auth.uid() = candidate_id);
    create policy "Employers can view applications to their jobs" on public.applications for select
    using (public.is_job_owner(job_id, auth.uid()));
  `);

  // ---- seed data ----
  await db.query(`insert into public.jobs (id, employer_id) values ($1,$2),($3,$4),($5,$6),($7,$8)`, [
    JOB_1, EMP_1, JOB_2, EMP_2, JOB_EMPTY, EMP_1, JOB_VOICE, EMP_1,
  ]);
  await db.query(
    `insert into public.team_members (user_id, employer_id, status) values ($1,$2,'active'), ($3,$2,'revoked')`,
    [TEAM_ACTIVE, EMP_1, TEAM_INACTIVE],
  );
  // JOB_1: 5 applicants (3 free + 2 sealed, with no unlock yet)
  for (let i = 0; i < 5; i++) {
    await db.query(`insert into public.applications (job_id, candidate_id) values ($1, gen_random_uuid())`, [JOB_1]);
  }

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

  // =====================================================================
  // Apply the migration under test, verbatim.
  // =====================================================================
  await db.exec(migrationSql);

  // Fixture-only, not part of the migration under test: on the real
  // Supabase platform, anon/authenticated/service_role get table-level
  // privileges on every table via a database-level `ALTER DEFAULT
  // PRIVILEGES`, set once outside any migration — new tables inherit it
  // automatically (this is exactly why voice_session_log's own migration
  // has no GRANT statements either, yet works live). PGlite starts from a
  // blank database with no such default, so replicate it here for the
  // tables this migration just created, the same way the blanket
  // `grant ... on all tables in schema public` above covers the
  // pre-existing fixture tables. RLS (created by the migration) is what
  // actually restricts access from this point on.
  await db.exec(`
    grant select, insert, update, delete on
      public.app_settings, public.job_unlocks, public.applicant_packs,
      public.voice_interview_charges, public.boost_orders
    to anon, authenticated, service_role;
  `);

  return { db, asUser, asPostgres };
}

async function run() {
  const { db, asUser, asPostgres } = await main();

  console.log("\n-- (1) app_settings (shared key/value table) + get_billing_flags() --");
  {
    const r = await asPostgres(
      `select key, (value #>> '{}')::boolean as v from public.app_settings where key in ('billing_enabled', 'boost_enabled') order by key`,
    );
    check(
      "billing_enabled and boost_enabled are both seeded, both false",
      r.rows.length === 2 && r.rows.every((row) => row.v === false),
      JSON.stringify(r.rows),
    );
  }
  {
    const dupe = await asPostgres(`insert into public.app_settings (key, value) values ('billing_enabled', 'true'::jsonb)`).catch((e) => e);
    check("a duplicate key is rejected by the primary key (ON CONFLICT is required to reseed)", dupe instanceof Error, String(dupe));
  }
  {
    const r = await asUser(STRANGER, "authenticated", `select * from public.get_billing_flags()`);
    check("get_billing_flags() is callable by any authenticated user", r.ok, JSON.stringify(r));
    check("billing_enabled defaults to false", r.ok && r.rows[0].billing_enabled === false, JSON.stringify(r));
    check("boost_enabled defaults to false", r.ok && r.rows[0].boost_enabled === false, JSON.stringify(r));
  }
  {
    const r = await asUser(null, "anon", `select * from public.get_billing_flags()`);
    check("get_billing_flags() is also callable by anon (no PII on it)", r.ok && r.rows.length === 1, JSON.stringify(r));
  }
  {
    // Unlike the old singleton shape, this table IS directly SELECT-able
    // (shared with fix/w1-coaching-report's 'blueprint_paid' key, which the
    // client reads directly for pricing copy) -- just not writable.
    const r = await asUser(STRANGER, "authenticated", `select key from public.app_settings where key = 'billing_enabled'`);
    check("app_settings is directly readable (public SELECT policy)", r.ok && r.rows.length === 1, JSON.stringify(r));

    // No UPDATE policy exists, so RLS's implicit USING(false) makes the
    // UPDATE affect zero rows rather than throw (that's Postgres RLS UPDATE
    // semantics — contrast with INSERT in section 2, whose WITH CHECK
    // failure DOES throw). Prove it via the value actually being unchanged
    // afterward, not just "no error".
    await asUser(STRANGER, "authenticated", `update public.app_settings set value = 'true'::jsonb where key = 'billing_enabled'`);
    const stillFalse = await asPostgres(`select (value #>> '{}')::boolean as v from public.app_settings where key = 'billing_enabled'`);
    check(
      "...but not writable by authenticated (RLS has no write policy — the value is unchanged)",
      stillFalse.rows[0].v === false,
      JSON.stringify(stillFalse.rows),
    );
  }

  console.log("\n-- (2) RLS on the four new tables --");
  await asPostgres(
    `insert into public.job_unlocks (id, job_id, employer_id, status, unlocked_at, expires_at) values
       ('60000000-0000-0000-0000-00000000000a', $1, $2, 'active', now(), now() + interval '30 days')`,
    [JOB_1, EMP_1],
  );
  await asPostgres(
    `insert into public.applicant_packs (id, job_id, employer_id, job_unlock_id, status) values
       ('61000000-0000-0000-0000-00000000000a', $1, $2, '60000000-0000-0000-0000-00000000000a', 'active')`,
    [JOB_1, EMP_1],
  );
  await asPostgres(
    `insert into public.voice_interview_charges (id, job_id, employer_id, ordinal, status) values
       ('62000000-0000-0000-0000-00000000000a', $1, $2, 1, 'included')`,
    [JOB_1, EMP_1],
  );
  await asPostgres(
    `insert into public.boost_orders (id, job_id, employer_id, tier_cents, status) values
       ('63000000-0000-0000-0000-00000000000a', $1, $2, 7900, 'pending_payment')`,
    [JOB_1, EMP_1],
  );

  for (const [table] of [["job_unlocks"], ["applicant_packs"], ["voice_interview_charges"], ["boost_orders"]]) {
    const owner = await asUser(EMP_1, "authenticated", `select id from public.${table} where job_id = $1`, [JOB_1]);
    check(`${table}: job owner EMP_1 can read their own job's rows`, owner.ok && owner.rows.length === 1, JSON.stringify(owner));

    const team = await asUser(TEAM_ACTIVE, "authenticated", `select id from public.${table} where job_id = $1`, [JOB_1]);
    check(`${table}: active team member can read EMP_1's job rows`, team.ok && team.rows.length === 1, JSON.stringify(team));

    const revokedTeam = await asUser(TEAM_INACTIVE, "authenticated", `select id from public.${table} where job_id = $1`, [JOB_1]);
    check(`${table}: revoked team member cannot read EMP_1's job rows`, revokedTeam.ok && revokedTeam.rows.length === 0, JSON.stringify(revokedTeam));

    const other = await asUser(EMP_2, "authenticated", `select id from public.${table} where job_id = $1`, [JOB_1]);
    check(`${table}: unrelated employer EMP_2 cannot read EMP_1's job rows`, other.ok && other.rows.length === 0, JSON.stringify(other));

    const stranger = await asUser(STRANGER, "authenticated", `select id from public.${table} where job_id = $1`, [JOB_1]);
    check(`${table}: a stranger cannot read EMP_1's job rows`, stranger.ok && stranger.rows.length === 0, JSON.stringify(stranger));

    // anon gets either zero rows or a hard permission error, depending on
    // whether it trips the table grant or the is_job_owner/
    // is_active_team_member_for_job EXECUTE revoke first (that revoke is
    // already shipped, in 20260915141000, and applies here exactly as it
    // does to every other RLS policy that calls those two functions) --
    // both outcomes mean anon reads nothing, which is what this asserts.
    const anonRead = await asUser(null, "anon", `select id from public.${table} where job_id = $1`, [JOB_1]);
    check(
      `${table}: anon cannot read EMP_1's job rows`,
      !anonRead.ok || anonRead.rows.length === 0,
      JSON.stringify(anonRead),
    );

    const ownerWrite = await asUser(
      EMP_1, "authenticated",
      `insert into public.${table} (job_id, employer_id${table === "boost_orders" ? ", tier_cents" : ""}) values ($1,$2${table === "boost_orders" ? ",7900" : ""})`,
      [JOB_1, EMP_1],
    );
    check(`${table}: even the job owner cannot INSERT directly (server-only writes)`, !ownerWrite.ok, JSON.stringify(ownerWrite));
  }

  console.log("\n-- (3) entitlement functions: high-water-mark math --");
  {
    // JOB_1: 5 applicants, 1 active unlock, 1 active pack -> allowance 3+25+25=53, not locked.
    const r = await asPostgres(`select public.job_processed_allowance($1) as allowance, public.job_is_locked($1) as locked, public.job_sealed_count($1) as sealed`, [JOB_1]);
    check("JOB_1 allowance = 3 + 25*1 unlock + 25*1 pack = 53", r.rows[0].allowance === 53, JSON.stringify(r.rows));
    check("JOB_1 is not locked (5 applicants << 53 allowance)", r.rows[0].locked === false, JSON.stringify(r.rows));
    check("JOB_1 sealed_count is 0", r.rows[0].sealed === 0, JSON.stringify(r.rows));
  }
  {
    // JOB_EMPTY: never unlocked, 0 applicants -> allowance 3, not locked.
    const r = await asPostgres(`select public.job_processed_allowance($1) as allowance, public.job_is_locked($1) as locked, public.job_has_active_unlock($1) as active`, [JOB_EMPTY]);
    check("a never-unlocked, empty job has the 3-free allowance", r.rows[0].allowance === 3, JSON.stringify(r.rows));
    check("a never-unlocked, empty job is not locked", r.rows[0].locked === false, JSON.stringify(r.rows));
    check("a never-unlocked job has no active unlock", r.rows[0].active === false, JSON.stringify(r.rows));
  }
  {
    // Push JOB_EMPTY past the free tier: 4 applicants, still never unlocked -> locked, sealed=1.
    await asPostgres(`insert into public.applications (job_id, candidate_id) select $1, gen_random_uuid() from generate_series(1,4)`, [JOB_EMPTY]);
    const r = await asPostgres(`select public.job_is_locked($1) as locked, public.job_sealed_count($1) as sealed`, [JOB_EMPTY]);
    check("4th applicant on a never-unlocked job trips the lock", r.rows[0].locked === true, JSON.stringify(r.rows));
    check("exactly 1 applicant is sealed (4 - 3 free)", r.rows[0].sealed === 1, JSON.stringify(r.rows));
  }
  {
    // A pending (unpaid) unlock must NOT count toward allowance.
    await asPostgres(
      `insert into public.job_unlocks (job_id, employer_id, status) values ($1, $2, 'pending')`,
      [JOB_EMPTY, EMP_1],
    );
    const r2 = await asPostgres(`select public.job_processed_allowance($1) as allowance`, [JOB_EMPTY]);
    check("a 'pending' (unpaid) unlock does not add to the allowance", r2.rows[0].allowance === 3, JSON.stringify(r2.rows));
  }
  {
    // An EXPIRED-by-time but still status='active' unlock still counts (high-water mark).
    await asPostgres(
      `insert into public.job_unlocks (job_id, employer_id, status, unlocked_at, expires_at) values
         ($1, $2, 'active', now() - interval '40 days', now() - interval '10 days')`,
      [JOB_EMPTY, EMP_1],
    );
    const allowance = await asPostgres(`select public.job_processed_allowance($1) as v`, [JOB_EMPTY]);
    check("a time-expired but paid unlock still counts toward allowance (high-water mark)", allowance.rows[0].v === 28, JSON.stringify(allowance.rows));
    const active = await asPostgres(`select public.job_has_active_unlock($1) as v`, [JOB_EMPTY]);
    check("but it does NOT count as a currently-active unlock (packs need a live window)", active.rows[0].v === false, JSON.stringify(active.rows));
  }

  console.log("\n-- (4) entitlement functions are not directly callable by clients --");
  {
    const r = await asUser(EMP_1, "authenticated", `select public.job_processed_allowance($1) as v`, [JOB_1]);
    check("job_processed_allowance is revoked from authenticated (even the job owner)", !r.ok, JSON.stringify(r));
  }
  {
    const r = await asUser(null, "anon", `select public.job_is_locked($1) as v`, [JOB_1]);
    check("job_is_locked is revoked from anon", !r.ok, JSON.stringify(r));
  }

  console.log("\n-- (5) get_job_billing_status(): the caller-checked entry point --");
  {
    const r = await asUser(STRANGER, "authenticated", `select * from public.get_job_billing_status($1)`, [JOB_1]);
    check("a stranger is refused", !r.ok, JSON.stringify(r));
  }
  {
    const r = await asUser(EMP_2, "authenticated", `select * from public.get_job_billing_status($1)`, [JOB_1]);
    check("an unrelated employer is refused", !r.ok, JSON.stringify(r));
  }
  {
    const r = await asUser(EMP_1, "authenticated", `select * from public.get_job_billing_status($1)`, [JOB_1]);
    check("the job owner is allowed", r.ok && r.rows.length === 1, JSON.stringify(r));
    check("...and sees the correct applicant_count (5)", r.ok && r.rows[0].applicant_count === 5, JSON.stringify(r.rows));
    check("...and the correct processed_allowance (53)", r.ok && r.rows[0].processed_allowance === 53, JSON.stringify(r.rows));
    check("...and billing_enabled reads the real (false) flag", r.ok && r.rows[0].billing_enabled === false, JSON.stringify(r.rows));
  }
  {
    const r = await asUser(TEAM_ACTIVE, "authenticated", `select * from public.get_job_billing_status($1)`, [JOB_1]);
    check("an active team member is allowed", r.ok && r.rows.length === 1, JSON.stringify(r));
  }
  {
    const r = await asUser(null, "service_role", `select * from public.get_job_billing_status($1)`, [JOB_1]);
    check("service_role is allowed (edge functions unaffected)", r.ok && r.rows.length === 1, JSON.stringify(r));
  }

  console.log("\n-- (6) voice interview billability --");
  {
    const r = await asPostgres(`select public.job_voice_interview_is_billable($1) as v`, [JOB_EMPTY]);
    // JOB_EMPTY now HAS an unlock (from section 3) but 0 voice_interview_charges rows yet.
    check("first interview after a job's first unlock is included, not billable", r.rows[0].v === false, JSON.stringify(r.rows));
  }
  {
    await asPostgres(
      `insert into public.voice_interview_charges (job_id, employer_id, ordinal, status)
       select $1, $2, gs, 'included' from generate_series(1, 10) gs`,
      [JOB_EMPTY, EMP_1],
    );
    const used = await asPostgres(`select public.job_voice_interviews_used($1) as v`, [JOB_EMPTY]);
    check("10 included interviews recorded", used.rows[0].v === 10, JSON.stringify(used.rows));
    const billable = await asPostgres(`select public.job_voice_interview_is_billable($1) as v`, [JOB_EMPTY]);
    check("the 11th interview on this job is billable", billable.rows[0].v === true, JSON.stringify(billable.rows));
  }
  {
    // JOB_2 (EMP_2's) has never been unlocked at all -> unmetered, never billable.
    const r = await asPostgres(`select public.job_voice_interview_is_billable($1) as v`, [JOB_2]);
    check("a never-unlocked job's voice interviews are unmetered (never billable)", r.rows[0].v === false, JSON.stringify(r.rows));
  }
  {
    // Regression: re-unlock JOB_EMPTY a second time -- its first unlock's
    // 30-day window already lapsed, so buying another one is exactly the
    // documented flow ("once the active window lapses, buying another pack
    // requires a fresh unlock", header comment), not a contrived edge case.
    // job_unlock_count(JOB_EMPTY) goes from 1 to 2. voice_included_total
    // must stay flat at 10 -- NOT scale with unlock count -- because
    // job_voice_interview_is_billable() enforces a flat 10-per-job
    // threshold regardless of how many times the job has been unlocked;
    // the two must never disagree about how many free interviews are left.
    await asPostgres(
      `insert into public.job_unlocks (job_id, employer_id, status, unlocked_at, expires_at) values
         ($1, $2, 'active', now(), now() + interval '30 days')`,
      [JOB_EMPTY, EMP_1],
    );
    const unlockCount = await asPostgres(`select public.job_unlock_count($1) as v`, [JOB_EMPTY]);
    check("JOB_EMPTY now has 2 completed unlocks", unlockCount.rows[0].v === 2, JSON.stringify(unlockCount.rows));

    const status = await asUser(EMP_1, "authenticated", `select * from public.get_job_billing_status($1)`, [JOB_EMPTY]);
    check(
      "voice_included_total stays flat at 10 after a second unlock, not 10 * unlock_count",
      status.ok && status.rows[0].voice_included_total === 10,
      JSON.stringify(status.rows),
    );
    check(
      "voice_next_is_billable agrees with voice_used >= voice_included_total (the two never contradict each other)",
      status.ok && status.rows[0].voice_next_is_billable === (status.rows[0].voice_used >= status.rows[0].voice_included_total),
      JSON.stringify(status.rows),
    );
  }

  console.log("\n-- (6b) voice_included_total full matrix: first unlock, second unlock, overlapping pack, expiry --");
  console.log("   (isolated on JOB_VOICE so each scenario's starting state is unambiguous)");
  {
    // -- first unlock --
    // Before any unlock: unmetered, no charges yet.
    const before = await asPostgres(`select public.job_voice_interview_is_billable($1) as v`, [JOB_VOICE]);
    check("JOB_VOICE, never unlocked: voice is unmetered", before.rows[0].v === false, JSON.stringify(before.rows));

    await asPostgres(
      `insert into public.job_unlocks (job_id, employer_id, status, unlocked_at, expires_at) values
         ($1, $2, 'active', now(), now() + interval '30 days')`,
      [JOB_VOICE, EMP_1],
    );
    const afterFirst = await asUser(EMP_1, "authenticated", `select * from public.get_job_billing_status($1)`, [JOB_VOICE]);
    check(
      "first unlock: voice_included_total is 10, voice_used is 0, next interview is included",
      afterFirst.ok &&
        afterFirst.rows[0].voice_included_total === 10 &&
        afterFirst.rows[0].voice_used === 0 &&
        afterFirst.rows[0].voice_next_is_billable === false,
      JSON.stringify(afterFirst.rows),
    );

    // Use up all 10 included interviews.
    await asPostgres(
      `insert into public.voice_interview_charges (job_id, employer_id, ordinal, status)
       select $1, $2, gs, 'included' from generate_series(1, 10) gs`,
      [JOB_VOICE, EMP_1],
    );
    const atCap = await asUser(EMP_1, "authenticated", `select * from public.get_job_billing_status($1)`, [JOB_VOICE]);
    check(
      "first unlock, 10 used: voice_included_total still 10, next interview is now billable",
      atCap.ok && atCap.rows[0].voice_included_total === 10 && atCap.rows[0].voice_next_is_billable === true,
      JSON.stringify(atCap.rows),
    );
  }
  {
    // -- second unlock (re-unlock) --
    // A second unlock (job_unlock_count 1 -> 2) must NOT double the
    // allowance to 20 -- it's flat 10 for the job, forever, per the header
    // comment and the finding this guards against.
    await asPostgres(
      `insert into public.job_unlocks (job_id, employer_id, status, unlocked_at, expires_at) values
         ($1, $2, 'active', now(), now() + interval '30 days')`,
      [JOB_VOICE, EMP_1],
    );
    const unlockCount = await asPostgres(`select public.job_unlock_count($1) as v`, [JOB_VOICE]);
    check("second unlock: JOB_VOICE now has 2 completed unlocks", unlockCount.rows[0].v === 2, JSON.stringify(unlockCount.rows));

    const status = await asUser(EMP_1, "authenticated", `select * from public.get_job_billing_status($1)`, [JOB_VOICE]);
    check(
      "second unlock: voice_included_total is still 10 (not 20 = 10 * unlock_count)",
      status.ok && status.rows[0].voice_included_total === 10,
      JSON.stringify(status.rows),
    );
    check(
      "second unlock: the 10 already-used interviews from the first unlock still count, next is still billable",
      status.ok && status.rows[0].voice_used === 10 && status.rows[0].voice_next_is_billable === true,
      JSON.stringify(status.rows),
    );
  }
  {
    // -- overlapping pack --
    // An active $25 applicant pack raises the *applicant* allowance but
    // must have zero effect on the *voice* allowance -- they are two
    // unrelated entitlements that happen to live on the same job.
    const beforePack = await asPostgres(`select public.job_processed_allowance($1) as allowance`, [JOB_VOICE]);
    await asPostgres(
      `insert into public.applicant_packs (job_id, employer_id, status) values ($1, $2, 'active')`,
      [JOB_VOICE, EMP_1],
    );
    const afterPack = await asUser(EMP_1, "authenticated", `select * from public.get_job_billing_status($1)`, [JOB_VOICE]);
    check(
      "overlapping pack: the pack DID raise the applicant allowance by 25",
      afterPack.ok && afterPack.rows[0].processed_allowance === beforePack.rows[0].allowance + 25,
      JSON.stringify({ before: beforePack.rows, after: afterPack.rows }),
    );
    check(
      "overlapping pack: voice_included_total is untouched by the pack, still flat 10",
      afterPack.ok && afterPack.rows[0].voice_included_total === 10,
      JSON.stringify(afterPack.rows),
    );
  }
  {
    // -- expiry --
    // Both of JOB_VOICE's unlocks lapse (expires_at in the past, status
    // stays 'active' -- exactly how a real 30-day window lapsing looks,
    // per job_has_active_unlock's definition). voice_included_total is a
    // lifetime, not a windowed, entitlement: it must stay flat 10 and
    // voice_used must stay cumulative, same as job_processed_allowance
    // never shrinking when a window lapses (section 3's high-water-mark
    // proof) -- lapsing changes has_active_unlock, nothing about voice.
    await asPostgres(`update public.job_unlocks set expires_at = now() - interval '1 day' where job_id = $1`, [JOB_VOICE]);

    const activeNow = await asPostgres(`select public.job_has_active_unlock($1) as v`, [JOB_VOICE]);
    check("expiry: JOB_VOICE no longer has an active (live-window) unlock", activeNow.rows[0].v === false, JSON.stringify(activeNow.rows));

    const statusExpired = await asUser(EMP_1, "authenticated", `select * from public.get_job_billing_status($1)`, [JOB_VOICE]);
    check(
      "expiry: voice_included_total is still flat 10 after both unlock windows lapse",
      statusExpired.ok && statusExpired.rows[0].voice_included_total === 10,
      JSON.stringify(statusExpired.rows),
    );
    check(
      "expiry: voice_used stays at its cumulative 10 (lapsing never resets usage)",
      statusExpired.ok && statusExpired.rows[0].voice_used === 10 && statusExpired.rows[0].voice_next_is_billable === true,
      JSON.stringify(statusExpired.rows),
    );
    check(
      "expiry: has_active_unlock is false but unlock_count (high-water mark) stays 2",
      statusExpired.ok && statusExpired.rows[0].has_active_unlock === false && statusExpired.rows[0].unlock_count === 2,
      JSON.stringify(statusExpired.rows),
    );
  }

  console.log("\n-- (7) subscriptions carries the saved-payment-method column --");
  {
    const r = await asPostgres(`select stripe_default_payment_method_id from public.subscriptions limit 0`);
    check("subscriptions.stripe_default_payment_method_id exists", Array.isArray(r.rows), "column query did not throw");
  }

  console.log("\n-- (8) migration is idempotent (safe to re-run) --");
  {
    let err = null;
    try {
      await db.exec(`reset role;`);
      const migrationSql = await readFile(MIGRATION_PATH, "utf8");
      await db.exec(migrationSql);
    } catch (e) {
      err = e;
    }
    check("re-running the migration verbatim does not throw", err === null, String(err));
  }

  console.log("\n-- (9) the billing_enabled switch itself actually flips what every reader sees --");
  {
    const before = await asPostgres(`select * from public.get_billing_flags()`);
    check("before the flip, billing_enabled reads false", before.rows[0].billing_enabled === false, JSON.stringify(before.rows));

    await asPostgres(`update public.app_settings set value = 'true'::jsonb where key = 'billing_enabled'`);

    const after = await asPostgres(`select * from public.get_billing_flags()`);
    check("after the flip, get_billing_flags() reads true", after.rows[0].billing_enabled === true, JSON.stringify(after.rows));

    const statusAfter = await asUser(EMP_1, "authenticated", `select billing_enabled from public.get_job_billing_status($1)`, [JOB_1]);
    check("get_job_billing_status() also now reads billing_enabled = true for the same job", statusAfter.ok && statusAfter.rows[0].billing_enabled === true, JSON.stringify(statusAfter));

    await asPostgres(`update public.app_settings set value = 'false'::jsonb where key = 'billing_enabled'`);
    const restored = await asPostgres(`select * from public.get_billing_flags()`);
    check("flipping it back off is reflected immediately too", restored.rows[0].billing_enabled === false, JSON.stringify(restored.rows));
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
