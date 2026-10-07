#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/*_shortlisted_applications.sql (the
 * hiring team's shortlist): plain assertions against a real Postgres, not a
 * text match.
 *
 * The owner, 2026-10-07: "I need you to also add a feature where I can add
 * them as favorites. Maybe do a short list for this particular job." This
 * proves the database half:
 *
 *   0. The migration applies twice (it must be re-runnable). The first run
 *      holds only the two foreign keys' locks on applications and jobs, a
 *      re-run none that a form save would wait for, and lock_timeout is put
 *      back afterwards.
 *   1. Who may change it: the job's owner and an active team member who may
 *      manage that job's pipeline. Anyone else's application comes back under
 *      "skipped" and nothing is written: a stranger, another employer, the
 *      applicant themself, a view-only team member, a team member limited to
 *      another job, and an id that does not exist (which reads the same).
 *      anon cannot call it at all.
 *   2. What it does, and does not: one row per application, its job taken
 *      from the application (never from the caller), who added it and when.
 *      Adding twice keeps the first; removing one that is not on is quiet.
 *      The application itself is not touched (status, notes, updated_at).
 *   3. It is per job: the same person on two jobs is on one shortlist only.
 *   4. One call for many: allowed ones done, the rest skipped, duplicates and
 *      nulls ignored, more than 200 refused, on-or-off required.
 *   5. RLS: anon is refused; a stranger, another employer, the applicant and
 *      a team member limited to another job see nothing; the owner and the
 *      job's team (view-only included) see it. Nobody writes the table
 *      directly, not even the owner.
 *   6. Deleting an application, or a job, takes its shortlist rows with it.
 *   7. The client: the hook calls the function and nothing else, never the
 *      applications table and never an email sender (a shortlist tells the
 *      applicant nothing).
 *
 * anon / authenticated / service_role are real, separate roles, so RLS and
 * GRANT/REVOKE are genuinely in force.
 *
 * Run with: node scripts/shortlist.pglite.test.mjs
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

// ── People and jobs ─────────────────────────────────────────────────────────
const EMP_1 = "10000000-0000-4000-8000-000000000001"; // owns JOB_A, JOB_B
const EMP_2 = "10000000-0000-4000-8000-000000000002"; // owns JOB_X (unrelated)
const TEAM_PIPE = "10000000-0000-4000-8000-0000000000a1"; // EMP_1, may manage pipeline, every job
const TEAM_VIEW = "10000000-0000-4000-8000-0000000000a2"; // EMP_1, view only, every job
const TEAM_JOB_B = "10000000-0000-4000-8000-0000000000a3"; // EMP_1, pipeline, JOB_B only
const TEAM_GONE = "10000000-0000-4000-8000-0000000000a4"; // EMP_1, pipeline, no longer active
const STRANGER = "10000000-0000-4000-8000-0000000000ff";

const ANA = "20000000-0000-4000-8000-000000000001"; // applied to JOB_A and JOB_B
const BEN = "20000000-0000-4000-8000-000000000002"; // applied to JOB_A
const CAT = "20000000-0000-4000-8000-000000000003"; // applied to JOB_B
const DEE = "20000000-0000-4000-8000-000000000004"; // applied to EMP_2's JOB_X

const JOB_A = "30000000-0000-4000-8000-00000000000a";
const JOB_B = "30000000-0000-4000-8000-00000000000b";
const JOB_X = "30000000-0000-4000-8000-0000000000aa";

const APP_ANA_A = "40000000-0000-4000-8000-000000000001";
const APP_ANA_B = "40000000-0000-4000-8000-000000000002";
const APP_BEN_A = "40000000-0000-4000-8000-000000000003";
const APP_CAT_B = "40000000-0000-4000-8000-000000000004";
const APP_DEE_X = "40000000-0000-4000-8000-000000000005";
const APP_MISSING = "40000000-0000-4000-8000-0000000000ee";

async function migrationFile() {
  const names = (await readdir(MIGRATIONS)).filter((n) => /^\d+_shortlisted_applications\.sql$/.test(n));
  return names.length === 1 ? path.join(MIGRATIONS, names[0]) : null;
}

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
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
    -- As on Supabase: client roles reach every new public table and function
    -- by default; RLS and REVOKEs do the restricting.
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

    create type public.application_status as enum ('pending', 'reviewing', 'interview', 'offered', 'hired', 'rejected', 'in_progress');

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
      status public.application_status not null default 'pending',
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (job_id, candidate_id)
    );
    create or replace function public.update_updated_at_column() returns trigger language plpgsql as $$
    begin new.updated_at = now(); return new; end; $$;
    create trigger update_applications_updated_at before update on public.applications
      for each row execute function public.update_updated_at_column();

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

    -- The live applications policies.
    alter table public.applications enable row level security;
    create policy "Candidates can view their own applications" on public.applications for select using (auth.uid() = candidate_id);
    create policy "Employers can view applications to their jobs" on public.applications for select to authenticated using (public.is_job_owner(job_id, auth.uid()));
    create policy "Team members can view applications for assigned jobs" on public.applications for select to authenticated using (public.is_active_team_member_for_job(job_id, auth.uid()));
  `);

  for (const id of [EMP_1, EMP_2, TEAM_PIPE, TEAM_VIEW, TEAM_JOB_B, TEAM_GONE, STRANGER, ANA, BEN, CAT, DEE]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id.slice(-4)}@example.com`]);
  }
  await db.query(`insert into public.jobs (id, employer_id, title) values ($1,$2,'Support lead'),($3,$2,'Night shift'),($4,$5,'Other job')`, [JOB_A, EMP_1, JOB_B, JOB_X, EMP_2]);
  await db.query(
    `insert into public.team_members (user_id, employer_id, status, can_manage_pipeline, assigned_job_ids) values
       ($1, $5, 'active', true, '{}'), ($2, $5, 'active', false, '{}'), ($3, $5, 'active', true, $6::uuid[]), ($4, $5, 'removed', true, '{}')`,
    [TEAM_PIPE, TEAM_VIEW, TEAM_JOB_B, TEAM_GONE, EMP_1, `{${JOB_B}}`],
  );
  const apps = [
    [APP_ANA_A, JOB_A, ANA, "reviewing"],
    [APP_ANA_B, JOB_B, ANA, "reviewing"],
    [APP_BEN_A, JOB_A, BEN, "in_progress"],
    [APP_CAT_B, JOB_B, CAT, "reviewing"],
    [APP_DEE_X, JOB_X, DEE, "reviewing"],
  ];
  for (const a of apps) await db.query(`insert into public.applications (id, job_id, candidate_id, status, notes) values ($1,$2,$3,$4,'{"quizResult":{"score":8}}')`, a);

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

async function main() {
  const file = await migrationFile();
  check("exactly one *_shortlisted_applications.sql migration", file != null);
  if (!file) {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(1);
  }
  const migration = await readFile(file, "utf8");
  const { db, as, pg } = await setup();

  console.log("\n0. The migration applies, twice, holding as little as it can");
  {
    let ok = true;
    let detail = "";
    const run = async () => {
      await db.exec("begin;");
      try {
        await db.exec(migration);
        const locks = (
          await db.query(
            `select c.relname, l.mode from pg_locks l join pg_class c on c.oid = l.relation
              where l.locktype = 'relation' and c.relname in ('applications', 'jobs')`,
          )
        ).rows;
        await db.exec("commit;");
        return locks;
      } catch (e) {
        await db.exec("rollback;").catch(() => {});
        throw e;
      }
    };
    let first = [];
    let second = [];
    try {
      first = await run();
      second = await run();
    } catch (e) {
      ok = false;
      detail = e.message;
    }
    check("applies cleanly and is re-runnable", ok, detail);
    if (!ok) {
      console.log(`\n${passed} passed, ${failed} failed`);
      process.exit(1);
    }
    // ACCESS SHARE and ROW SHARE block no reader and no writer of rows.
    const harmless = (m) => m === "AccessShareLock" || m === "RowShareLock";
    const modes = (rows, rel) => rows.filter((r) => r.relname === rel).map((r) => r.mode);
    check(
      "the first run locks applications only for its foreign key (SHARE ROW EXCLUSIVE, never ACCESS EXCLUSIVE)",
      modes(first, "applications").includes("ShareRowExclusiveLock") && modes(first, "applications").every((m) => harmless(m) || m === "ShareRowExclusiveLock"),
      show(first),
    );
    check("…and jobs the same way", modes(first, "jobs").every((m) => harmless(m) || m === "ShareRowExclusiveLock"), show(first));
    check("a re-run takes no lock a form save or a test result would wait for", second.every((r) => harmless(r.mode)), show(second));
    check("it gives up rather than queue: lock_timeout first, then put back", /^SET lock_timeout = '3s';/m.test(migration) && (await db.query(`show lock_timeout`)).rows[0].lock_timeout === "0");
    const code = migration.replace(/--.*$/gm, "");
    const fkAt = code.indexOf("ADD CONSTRAINT shortlisted_applications_application_fkey");
    check("the foreign keys are the last thing it creates", fkAt > 0 && !/CREATE (OR REPLACE )?(FUNCTION|TABLE|POLICY|INDEX|TRIGGER)/.test(code.slice(fkAt)));
    check("it changes nothing on applications but the key that points at it", !/ALTER TABLE public\.applications|ON public\.applications\b|UPDATE public\.applications|CREATE TRIGGER/.test(code));
  }

  const SET = `select public.set_applications_shortlisted($1::uuid[], $2) as r`;
  const result = (r) => (r.ok ? r.rows[0].r : null);
  const listed = async () => (await pg(`select application_id::text from public.shortlisted_applications order by 1`)).map((r) => r.application_id);
  const row = async (id) => (await pg(`select application_id::text, job_id::text, added_by::text, created_at from public.shortlisted_applications where application_id = $1`, [id]))[0] ?? null;
  const app = async (id) => (await pg(`select status::text as status, notes, updated_at::text as updated_at from public.applications where id = $1`, [id]))[0];

  console.log("\n1. Who may change the shortlist");
  {
    const anon = await as(null, "anon", SET, [[APP_ANA_A], true]);
    check("anon: permission denied (EXECUTE revoked)", !anon.ok && /permission denied/i.test(anon.error), show(anon));
    const skippedBy = async (uid, label) => {
      const r = await as(uid, "authenticated", SET, [[APP_ANA_A], true]);
      const out = result(r);
      check(`${label}: skipped, nothing written`, !!out && out.done.length === 0 && out.skipped.length === 1 && out.skipped[0] === APP_ANA_A, show(r));
    };
    await skippedBy(STRANGER, "a stranger");
    await skippedBy(EMP_2, "another employer");
    await skippedBy(ANA, "the applicant themself");
    await skippedBy(TEAM_VIEW, "a team member who may not manage the pipeline");
    await skippedBy(TEAM_JOB_B, "a pipeline team member limited to another job");
    await skippedBy(TEAM_GONE, "a team member who is no longer active");
    const missing = result(await as(EMP_1, "authenticated", SET, [[APP_MISSING], true]));
    check("an id that does not exist reads the same as one that is not yours", !!missing && missing.done.length === 0 && missing.skipped[0] === APP_MISSING, show(missing));
    check("…and none of that wrote a row", (await listed()).length === 0, show(await listed()));
  }

  console.log("\n2. The owner shortlists someone");
  {
    const before = await app(APP_ANA_A);
    const out = result(await as(EMP_1, "authenticated", SET, [[APP_ANA_A], true]));
    check("done", !!out && out.done.length === 1 && out.done[0] === APP_ANA_A && out.skipped.length === 0, show(out));
    const r = await row(APP_ANA_A);
    check("one row, with the application's own job", !!r && r.job_id === JOB_A, show(r));
    check("…who added it, and when", !!r && r.added_by === EMP_1 && r.created_at != null, show(r));
    const after = await app(APP_ANA_A);
    check("the application itself is untouched (status, notes, updated_at)", show(before) === show(after), `${show(before)} → ${show(after)}`);

    // A second add, by a teammate: quiet, and the first stands.
    const again = result(await as(TEAM_PIPE, "authenticated", SET, [[APP_ANA_A], true]));
    const r2 = await row(APP_ANA_A);
    check("adding one already on is a quiet success", !!again && again.done.length === 1 && (await listed()).length === 1, show(again));
    check("…and keeps who first added it", !!r2 && r2.added_by === EMP_1 && String(r2.created_at) === String(r.created_at), show(r2));

    const team = result(await as(TEAM_PIPE, "authenticated", SET, [[APP_BEN_A], true]));
    check("a pipeline team member can add too", !!team && team.done[0] === APP_BEN_A && (await row(APP_BEN_A))?.added_by === TEAM_PIPE, show(team));
    const limited = result(await as(TEAM_JOB_B, "authenticated", SET, [[APP_CAT_B], true]));
    check("a team member limited to a job can add on that job", !!limited && limited.done[0] === APP_CAT_B && (await row(APP_CAT_B))?.job_id === JOB_B, show(limited));
  }

  console.log("\n3. It is per job");
  {
    check("the same person's other application is not on a shortlist", (await row(APP_ANA_B)) === null && (await row(APP_ANA_A)) !== null);
    const byJob = await pg(`select job_id::text, count(*)::int n from public.shortlisted_applications group by 1 order by 1`);
    check("each job has its own", show(byJob) === show([{ job_id: JOB_A, n: 2 }, { job_id: JOB_B, n: 1 }]), show(byJob));
  }

  console.log("\n4. Taking someone off, and many at once");
  {
    const stranger = result(await as(STRANGER, "authenticated", SET, [[APP_ANA_A], false]));
    check("a stranger cannot take anyone off", !!stranger && stranger.skipped[0] === APP_ANA_A && (await row(APP_ANA_A)) !== null, show(stranger));
    const viewer = result(await as(TEAM_VIEW, "authenticated", SET, [[APP_ANA_A], false]));
    check("nor a view-only team member", !!viewer && viewer.skipped[0] === APP_ANA_A && (await row(APP_ANA_A)) !== null, show(viewer));

    const off = result(await as(EMP_1, "authenticated", SET, [[APP_BEN_A], false]));
    check("the owner takes one off", !!off && off.done[0] === APP_BEN_A && (await row(APP_BEN_A)) === null, show(off));
    const offAgain = result(await as(EMP_1, "authenticated", SET, [[APP_BEN_A], false]));
    check("taking off one that is not on is a quiet success", !!offAgain && offAgain.done[0] === APP_BEN_A && offAgain.skipped.length === 0, show(offAgain));

    // One call: his own two, a duplicate, a null, another employer's, a missing one.
    const many = result(await as(EMP_1, "authenticated", SET, [[APP_BEN_A, APP_ANA_B, APP_BEN_A, null, APP_DEE_X, APP_MISSING], true]));
    const done = [...(many?.done ?? [])].sort();
    const skipped = [...(many?.skipped ?? [])].sort();
    check("many at once: his own are done, once each", show(done) === show([APP_ANA_B, APP_BEN_A].sort()), show(many));
    check("…the ones that are not his are skipped, not an error", show(skipped) === show([APP_DEE_X, APP_MISSING].sort()), show(many));
    check("…and only his were written", show(await listed()) === show([APP_ANA_A, APP_ANA_B, APP_BEN_A, APP_CAT_B].sort()), show(await listed()));

    const tooMany = await as(EMP_1, "authenticated", SET, [Array.from({ length: 201 }, (_, i) => `50000000-0000-4000-8000-${String(i).padStart(12, "0")}`), true]);
    check("more than 200 at a time is refused", !tooMany.ok && tooMany.code === "22023", show(tooMany));
    const noFlag = await as(EMP_1, "authenticated", SET, [[APP_ANA_A], null]);
    check("on or off is required", !noFlag.ok && noFlag.code === "22004", show(noFlag));
    const none = result(await as(EMP_1, "authenticated", `select public.set_applications_shortlisted(null::uuid[], true) as r`));
    check("no ids: nothing done, no error", !!none && none.done.length === 0 && none.skipped.length === 0, show(none));
    const signedOut = await as(null, "authenticated", SET, [[APP_ANA_A], true]);
    check("a signed-in role with no user id is refused (42501)", !signedOut.ok && signedOut.code === "42501", show(signedOut));
  }

  console.log("\n5. Who can read it, and that nobody writes it directly");
  {
    const READ = `select application_id::text from public.shortlisted_applications order by 1`;
    const ids = (r) => (r.ok ? r.rows.map((x) => x.application_id) : null);
    const anon = await as(null, "anon", READ);
    check("anon: permission denied", !anon.ok && /permission denied/i.test(anon.error), show(anon));
    check("a stranger sees nothing", show(ids(await as(STRANGER, "authenticated", READ))) === "[]");
    check("another employer sees nothing", show(ids(await as(EMP_2, "authenticated", READ))) === "[]");
    check("the applicant sees nothing, not even their own", show(ids(await as(ANA, "authenticated", READ))) === "[]");
    check("…and neither does anyone else who applied", show(ids(await as(BEN, "authenticated", READ))) === "[]");
    check("a former team member sees nothing", show(ids(await as(TEAM_GONE, "authenticated", READ))) === "[]");
    check("the owner sees their jobs' shortlists", show(ids(await as(EMP_1, "authenticated", READ))) === show([APP_ANA_A, APP_ANA_B, APP_BEN_A, APP_CAT_B].sort()));
    check("a view-only team member can read it", show(ids(await as(TEAM_VIEW, "authenticated", READ))) === show([APP_ANA_A, APP_ANA_B, APP_BEN_A, APP_CAT_B].sort()));
    check("a team member limited to one job sees that job's only", show(ids(await as(TEAM_JOB_B, "authenticated", READ))) === show([APP_ANA_B, APP_CAT_B].sort()));

    const insert = await as(EMP_1, "authenticated", `insert into public.shortlisted_applications (application_id, job_id) values ($1, $2)`, [APP_DEE_X, JOB_A]);
    check("the owner cannot insert a row directly (no pairing someone else's application with their job)", !insert.ok && /permission denied/i.test(insert.error), show(insert));
    const update = await as(EMP_1, "authenticated", `update public.shortlisted_applications set job_id = $2 where application_id = $1`, [APP_ANA_A, JOB_B]);
    check("…nor update one", !update.ok && /permission denied/i.test(update.error), show(update));
    const del = await as(ANA, "authenticated", `delete from public.shortlisted_applications where application_id = $1`, [APP_ANA_A]);
    check("…and nobody deletes one directly", !del.ok && /permission denied/i.test(del.error), show(del));
    const rls = await pg(`select relrowsecurity from pg_class where oid = 'public.shortlisted_applications'::regclass`);
    check("row level security is on", rls[0]?.relrowsecurity === true);
    const grants = await pg(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'shortlisted_applications' and grantee in ('anon', 'authenticated', 'PUBLIC') order by 1, 2`,
    );
    check("authenticated has SELECT and nothing else; anon has nothing", show(grants) === show([{ grantee: "authenticated", privilege_type: "SELECT" }]), show(grants));
    const fn = await pg(
      `select has_function_privilege('anon', 'public.set_applications_shortlisted(uuid[], boolean)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.set_applications_shortlisted(uuid[], boolean)', 'execute') as authed`,
    );
    check("the function: authenticated may call it, anon may not", fn[0].anon === false && fn[0].authed === true, show(fn));
  }

  console.log("\n6. A deleted application or job takes its shortlist rows with it");
  {
    await pg(`delete from public.applications where id = $1`, [APP_BEN_A]);
    check("the application's row goes with it", (await row(APP_BEN_A)) === null && (await row(APP_ANA_A)) !== null);
    await pg(`delete from public.jobs where id = $1`, [JOB_B]);
    check("a deleted job's rows go too, the other job's stay", show(await listed()) === show([APP_ANA_A]), show(await listed()));
  }

  console.log("\n7. The client goes through the function and nothing else");
  {
    const hook = await readFile(path.join(ROOT, "src/cockpit/hooks/useShortlist.ts"), "utf8").catch(() => null);
    check("the shortlist hook exists", hook != null);
    if (hook != null) {
      const code = hook.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      check("…calls the set_applications_shortlisted function", /\.rpc\(\s*"set_applications_shortlisted"/.test(code));
      check("…reads only the shortlist table", /\.from\(\s*"shortlisted_applications"\s*\)/.test(code) && !/\.from\(\s*"applications"\s*\)/.test(code));
      check("…never writes the table itself", !/\.(insert|upsert|update|delete)\(/.test(code));
      check("…and never reaches an email sender or a status write", !/useUpdateApplication|notifyStatus|emailNotifications|send-notification-email/.test(code));
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
