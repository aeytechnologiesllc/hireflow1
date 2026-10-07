#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/*_interview_guides.sql (where the
 * personal part of an applicant's interview guide is kept): plain assertions
 * against a real Postgres, not a text match.
 *
 * The one thing that must hold: an applicant can never read what they will be
 * asked or what the interviewer is listening for. That is why the guide is
 * not in applications.notes (which they can read) but in a table of its own.
 * This proves:
 *
 *   0. The migration applies twice (it must be re-runnable), and puts
 *      lock_timeout back afterwards.
 *   1. Who can read a guide: the job's owner and the job's active team
 *      members (one limited to another job cannot). Nobody else: not anon,
 *      not a stranger, not another employer, not a former team member, and
 *      not the applicant the guide is about.
 *   2. Nobody writes the table from a client, not even the owner: no insert,
 *      no update, no delete. authenticated holds SELECT and nothing else;
 *      anon holds nothing.
 *   3. The edge function's own write (service role) works as an upsert: one
 *      row per application, written again in place.
 *   4. The guide must be a JSON object.
 *   5. Deleting an application, or a job, takes its guide with it.
 *
 * anon / authenticated / service_role are real, separate roles, so RLS and
 * GRANT/REVOKE are genuinely in force.
 *
 * Run with: node scripts/interview_guides.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");

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
const show = (v) => JSON.stringify(v);

// Invented people, fixed ids.
const EMP_1 = "10000000-0000-4000-8000-000000000001"; // owns JOB_A, JOB_B
const EMP_2 = "10000000-0000-4000-8000-000000000002"; // owns JOB_X (unrelated)
const TEAM_ALL = "10000000-0000-4000-8000-0000000000a1"; // EMP_1, every job
const TEAM_JOB_B = "10000000-0000-4000-8000-0000000000a3"; // EMP_1, JOB_B only
const TEAM_GONE = "10000000-0000-4000-8000-0000000000a4"; // EMP_1, no longer active
const STRANGER = "10000000-0000-4000-8000-0000000000ff";

const ANA = "20000000-0000-4000-8000-000000000001"; // applied to JOB_A
const BEN = "20000000-0000-4000-8000-000000000002"; // applied to JOB_B
const DEE = "20000000-0000-4000-8000-000000000004"; // applied to EMP_2's JOB_X

const JOB_A = "30000000-0000-4000-8000-00000000000a";
const JOB_B = "30000000-0000-4000-8000-00000000000b";
const JOB_X = "30000000-0000-4000-8000-0000000000aa";

const APP_ANA_A = "40000000-0000-4000-8000-000000000001";
const APP_BEN_B = "40000000-0000-4000-8000-000000000002";
const APP_DEE_X = "40000000-0000-4000-8000-000000000005";

const GUIDE = { version: 1, atAGlance: ["Says 4 years in support."], questions: [{ question: "Tell me about the team.", why: "w", listenFor: "l", redFlag: "r", source: "application", quote: null }], confirm: [] };

async function migrationFile() {
  const names = (await readdir(MIGRATIONS)).filter((n) => /^\d+_interview_guides\.sql$/.test(n));
  return names.length === 1 ? path.join(MIGRATIONS, names[0]) : null;
}

async function setup() {
  const db = new PGlite();
  await db.exec(`
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
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant execute on function auth.role() to anon, authenticated, service_role;
    -- As on Supabase: client roles reach every new public table by default;
    -- RLS and REVOKEs do the restricting.
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

    create table public.jobs (id uuid primary key, employer_id uuid not null, title text not null);
    create table public.team_members (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null, employer_id uuid not null,
      status text default 'active',
      can_manage_pipeline boolean default false,
      assigned_job_ids uuid[] default '{}'
    );
    create table public.applications (
      id uuid primary key default gen_random_uuid(),
      job_id uuid not null references public.jobs(id) on delete cascade,
      candidate_id uuid not null,
      notes text
    );

    -- The live helpers (pg_get_functiondef, production, 2026-10-07).
    create or replace function public.is_job_owner(p_job_id uuid, p_user_id uuid)
    returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
      select (p_user_id = auth.uid() or auth.role() = 'service_role')
        and exists (select 1 from public.jobs j where j.id = p_job_id and j.employer_id = p_user_id);
    $$;
    create or replace function public.is_active_team_member_for_job(p_job_id uuid, p_user_id uuid, p_require_manage_pipeline boolean default false, p_require_create_jobs boolean default false, p_require_delete_jobs boolean default false)
    returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
      select (p_user_id = auth.uid() or auth.role() = 'service_role')
        and exists (
          select 1 from public.jobs j join public.team_members tm on tm.employer_id = j.employer_id
           where j.id = p_job_id and tm.user_id = p_user_id and tm.status = 'active'
             and (not p_require_manage_pipeline or tm.can_manage_pipeline = true)
             and (array_length(tm.assigned_job_ids, 1) is null or j.id = any (tm.assigned_job_ids))
        );
    $$;

    alter table public.applications enable row level security;
    create policy "Candidates can view their own applications" on public.applications for select using (auth.uid() = candidate_id);
  `);

  await db.query(`insert into public.jobs (id, employer_id, title) values ($1,$2,'Team leader'),($3,$2,'Night shift'),($4,$5,'Other job')`, [JOB_A, EMP_1, JOB_B, JOB_X, EMP_2]);
  await db.query(
    `insert into public.team_members (user_id, employer_id, status, assigned_job_ids) values
       ($1, $4, 'active', '{}'), ($2, $4, 'active', $5::uuid[]), ($3, $4, 'removed', '{}')`,
    [TEAM_ALL, TEAM_JOB_B, TEAM_GONE, EMP_1, `{${JOB_B}}`],
  );
  for (const a of [[APP_ANA_A, JOB_A, ANA], [APP_BEN_B, JOB_B, BEN], [APP_DEE_X, JOB_X, DEE]]) {
    await db.query(`insert into public.applications (id, job_id, candidate_id, notes) values ($1,$2,$3,'{}')`, a);
  }

  async function as(uid, role, sql, params = []) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
    await db.exec(`select set_config('request.jwt.claim.role', '${role}', false);`);
    await db.exec(`set role ${role};`);
    try {
      const r = await db.query(sql, params);
      return { ok: true, rows: r.rows };
    } catch (e) {
      return { ok: false, error: e.message, code: e.code };
    } finally {
      await db.exec(`reset role;`);
      await db.exec(`select set_config('request.jwt.claim.sub', '', false);`);
      await db.exec(`select set_config('request.jwt.claim.role', '', false);`);
    }
  }
  const pg = (sql, params = []) => db.query(sql, params).then((r) => r.rows);
  return { db, as, pg };
}

/** What the edge function does, as the service role. */
const UPSERT = `insert into public.interview_guides (application_id, job_id, guide, fingerprint, prompt_version, model, generated_by, generated_at)
                values ($1, $2, $3::jsonb, $4, 'interview-guide-1', 'test-model', $5, now())
                on conflict (application_id) do update set job_id = excluded.job_id, guide = excluded.guide, fingerprint = excluded.fingerprint,
                  prompt_version = excluded.prompt_version, model = excluded.model, generated_by = excluded.generated_by, generated_at = excluded.generated_at`;

async function main() {
  const file = await migrationFile();
  check("exactly one *_interview_guides.sql migration", file != null);
  if (!file) {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(1);
  }
  const migration = await readFile(file, "utf8");
  const { db, as, pg } = await setup();

  console.log("\n0. The migration applies, twice");
  {
    await db.exec(migration);
    let second = null;
    try {
      await db.exec(migration);
    } catch (e) {
      second = e.message;
    }
    check("a second run changes nothing and raises nothing", second === null, String(second));
    const timeout = await pg(`show lock_timeout`);
    check("lock_timeout is put back afterwards", ["0", "0ms"].includes(String(timeout[0].lock_timeout)), show(timeout));
    const fks = await pg(`select conname from pg_constraint where conrelid = 'public.interview_guides'::regclass and contype = 'f' order by 1`);
    check("two foreign keys, once each", show(fks.map((r) => r.conname)) === show(["interview_guides_application_fkey", "interview_guides_job_fkey"]), show(fks));
  }

  console.log("\n3. The function's own write (service role)");
  {
    const first = await as(EMP_1, "service_role", UPSERT, [APP_ANA_A, JOB_A, JSON.stringify(GUIDE), "f1", EMP_1]);
    check("the service role writes a guide", first.ok, show(first));
    await as(EMP_1, "service_role", UPSERT, [APP_BEN_B, JOB_B, JSON.stringify(GUIDE), "f1", EMP_1]);
    await as(EMP_2, "service_role", UPSERT, [APP_DEE_X, JOB_X, JSON.stringify(GUIDE), "f1", EMP_2]);
    const again = await as(TEAM_ALL, "service_role", UPSERT, [APP_ANA_A, JOB_A, JSON.stringify({ ...GUIDE, atAGlance: ["Written again."] }), "f2", TEAM_ALL]);
    check("writing again replaces it in place", again.ok, show(again));
    const rows = await pg(`select application_id::text, fingerprint, generated_by::text, guide -> 'atAGlance' ->> 0 as line from public.interview_guides where application_id = $1`, [APP_ANA_A]);
    check("…one row per application, the newest", rows.length === 1 && rows[0].fingerprint === "f2" && rows[0].generated_by === TEAM_ALL && rows[0].line === "Written again.", show(rows));
  }

  console.log("\n1. Who can read a guide");
  {
    const READ = `select application_id::text from public.interview_guides order by 1`;
    const ids = (r) => (r.ok ? r.rows.map((x) => x.application_id) : null);
    const anon = await as(null, "anon", READ);
    check("anon: permission denied", !anon.ok && /permission denied/i.test(anon.error), show(anon));
    check("THE APPLICANT sees nothing, not even the guide about them", show(ids(await as(ANA, "authenticated", READ))) === "[]");
    const direct = await as(ANA, "authenticated", `select guide from public.interview_guides where application_id = $1`, [APP_ANA_A]);
    check("…asked for by its own application id, still nothing", direct.ok && direct.rows.length === 0, show(direct));
    check("…while they can still read their own application", (await as(ANA, "authenticated", `select id from public.applications`)).rows.length === 1);
    check("another applicant sees nothing", show(ids(await as(BEN, "authenticated", READ))) === "[]");
    check("a stranger sees nothing", show(ids(await as(STRANGER, "authenticated", READ))) === "[]");
    check("another employer sees only their own job's", show(ids(await as(EMP_2, "authenticated", READ))) === show([APP_DEE_X]));
    check("a former team member sees nothing", show(ids(await as(TEAM_GONE, "authenticated", READ))) === "[]");
    check("the owner sees their jobs' guides", show(ids(await as(EMP_1, "authenticated", READ))) === show([APP_ANA_A, APP_BEN_B].sort()));
    check("an active team member sees them", show(ids(await as(TEAM_ALL, "authenticated", READ))) === show([APP_ANA_A, APP_BEN_B].sort()));
    check("a team member limited to one job sees that job's only", show(ids(await as(TEAM_JOB_B, "authenticated", READ))) === show([APP_BEN_B]));
  }

  console.log("\n2. Nobody writes it from a client");
  {
    const insert = await as(EMP_1, "authenticated", `insert into public.interview_guides (application_id, job_id, guide) values ($1, $2, '{}'::jsonb)`, [APP_DEE_X, JOB_A]);
    check("the owner cannot insert a row (no pairing someone else's applicant with their job)", !insert.ok && /permission denied/i.test(insert.error), show(insert));
    const update = await as(EMP_1, "authenticated", `update public.interview_guides set guide = '{"x":1}'::jsonb where application_id = $1`, [APP_ANA_A]);
    check("…nor change one", !update.ok && /permission denied/i.test(update.error), show(update));
    const del = await as(EMP_1, "authenticated", `delete from public.interview_guides where application_id = $1`, [APP_ANA_A]);
    check("…nor delete one", !del.ok && /permission denied/i.test(del.error), show(del));
    const forged = await as(ANA, "authenticated", `insert into public.interview_guides (application_id, job_id, guide) values ($1, $2, '{}'::jsonb)`, [APP_ANA_A, JOB_A]);
    check("an applicant cannot write one either", !forged.ok && /permission denied/i.test(forged.error), show(forged));
    const rls = await pg(`select relrowsecurity from pg_class where oid = 'public.interview_guides'::regclass`);
    check("row level security is on", rls[0]?.relrowsecurity === true);
    const policies = await pg(`select cmd, roles::text from pg_policies where schemaname = 'public' and tablename = 'interview_guides'`);
    check("one policy, for SELECT, for signed-in people", policies.length === 1 && policies[0].cmd === "SELECT" && /authenticated/.test(policies[0].roles), show(policies));
    const grants = await pg(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'interview_guides' and grantee in ('anon', 'authenticated', 'PUBLIC') order by 1, 2`,
    );
    check("authenticated has SELECT and nothing else; anon has nothing", show(grants) === show([{ grantee: "authenticated", privilege_type: "SELECT" }]), show(grants));
  }

  console.log("\n4. A guide is a JSON object");
  {
    const list = await as(EMP_1, "service_role", UPSERT, [APP_BEN_B, JOB_B, "[1,2]", "f", EMP_1]);
    check("a list is refused", !list.ok && /check constraint/i.test(list.error), show(list));
    const text = await as(EMP_1, "service_role", UPSERT, [APP_BEN_B, JOB_B, '"hello"', "f", EMP_1]);
    check("a bare string is refused", !text.ok && /check constraint/i.test(text.error), show(text));
  }

  console.log("\n5. A deleted application or job takes its guide with it");
  {
    await pg(`delete from public.applications where id = $1`, [APP_ANA_A]);
    const left = await pg(`select application_id::text from public.interview_guides order by 1`);
    check("the application's guide goes with it", show(left.map((r) => r.application_id)) === show([APP_BEN_B, APP_DEE_X].sort()), show(left));
    await pg(`delete from public.jobs where id = $1`, [JOB_B]);
    const after = await pg(`select application_id::text from public.interview_guides order by 1`);
    check("a deleted job's guides go too, the other job's stay", show(after.map((r) => r.application_id)) === show([APP_DEE_X]), show(after));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
