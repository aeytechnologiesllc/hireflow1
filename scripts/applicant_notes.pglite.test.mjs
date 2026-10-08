#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/*_applicant_notes_and_views.sql (the
 * hiring team's notes on an applicant, and each person's "viewed" mark):
 * plain assertions against a real Postgres, not a text match.
 *
 * The owner, 2026-10-08: "is there a way you can cleanly allow me to add
 * some notes ... I like him or he did something really good ... Also ...
 * sometimes I forget which one I've already clicked on and reviewed." This
 * proves the database half:
 *
 *   0. The migration applies twice (it must be re-runnable), holding only
 *      the foreign keys' locks on applications and jobs the first time.
 *   1. Who may write a note: the job's owner and any active team member on
 *      that job. Refused, the same way, for a stranger, another employer,
 *      the applicant themself, a team member limited to another job, one no
 *      longer active, and an id that does not exist. anon cannot call it.
 *   2. What a note is: 1 to 2000 characters, trimmed; its job taken from the
 *      application and its author from the caller; at most 200 on one
 *      application. The application itself is not touched.
 *   3. Who may READ a note: the job's owner and its team. Never the
 *      applicant, a stranger, another employer or anon. Nobody writes the
 *      table directly, not even the owner.
 *   4. Taking a note away: its author, or the job's owner. Anyone else, and
 *      a note that does not exist: a quiet false, nothing removed.
 *   5. "Viewed": the owner and the job's team may set their own mark; each
 *      person reads only their own; opening again moves the time on; the
 *      applicant and strangers are refused; nobody writes it directly.
 *   6. Deleting an application, or a job, takes its notes and marks with it.
 *
 * anon / authenticated / service_role are real, separate roles, so RLS and
 * GRANT/REVOKE are genuinely in force.
 *
 * Run with: node scripts/applicant_notes.pglite.test.mjs
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
  const names = (await readdir(MIGRATIONS)).filter((n) => /^\d+_applicant_notes_and_views\.sql$/.test(n));
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
  check("exactly one *_applicant_notes_and_views.sql migration", file != null);
  if (!file) {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(1);
  }
  const migration = await readFile(file, "utf8");
  const { db, as, pg } = await setup();

  console.log("\n0. The migration applies, twice, holding as little as it can");
  {
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
    let first = null;
    let second = null;
    let error = "";
    try {
      first = await run();
      second = await run();
    } catch (e) {
      error = e.message;
    }
    check("it applies, and applies again", !!first && !!second, error);
    const heavy = (locks) => (locks ?? []).filter((l) => /AccessExclusive|^ExclusiveLock|ShareRowExclusive/.test(l.mode));
    check("the first run holds only the foreign keys' locks on applications and jobs", (first ?? []).every((l) => /ShareRowExclusiveLock|AccessShareLock|RowShareLock/.test(l.mode)), show(first));
    check("a re-run takes none that a form save would wait for", heavy(second).length === 0, show(second));
    const timeout = (await pg(`show lock_timeout`))[0].lock_timeout;
    check("lock_timeout is put back afterwards", timeout === "0", timeout);
  }

  const note = (uid, app, text) => as(uid, "authenticated", `select public.add_applicant_note($1, $2) as note`, [app, text]);
  const notesSeenBy = async (uid, role = "authenticated") => {
    const r = await as(uid, role, `select id, application_id, job_id, author_id, body from public.applicant_notes order by created_at, id`);
    return r.ok ? r.rows : `refused: ${r.error}`;
  };

  console.log("\n1. Who may write a note");
  let ownerNote = null;
  let teamNote = null;
  {
    const before = (await pg(`select status, notes, updated_at from public.applications where id = $1`, [APP_ANA_A]))[0];
    let r = await note(EMP_1, APP_ANA_A, "  Calm under pressure in the chat practice. My first pick.  ");
    check("the job's owner", r.ok && r.rows[0].note.body === "Calm under pressure in the chat practice. My first pick.", show(r));
    ownerNote = r.ok ? r.rows[0].note : null;
    r = await note(TEAM_VIEW, APP_ANA_A, "Agree, strong written English.");
    check("a team member on the job, even one who only views", r.ok, show(r));
    teamNote = r.ok ? r.rows[0].note : null;
    check("…a team member who manages the pipeline", (await note(TEAM_PIPE, APP_ANA_A, "Ask about nights.")).ok);
    const refused = [];
    for (const [who, uid, app] of [
      ["a stranger", STRANGER, APP_ANA_A],
      ["another employer", EMP_2, APP_ANA_A],
      ["the applicant themself", ANA, APP_ANA_A],
      ["a team member limited to another job", TEAM_JOB_B, APP_ANA_A],
      ["a team member no longer active", TEAM_GONE, APP_ANA_A],
      ["an id that does not exist", EMP_1, APP_MISSING],
    ]) {
      const x = await note(uid, app, "Should not be written.");
      if (x.ok || x.code !== "42501") refused.push(`${who}: ${show(x)}`);
    }
    check("refused, the same way, for a stranger, another employer, the applicant, a team member on another job, one no longer active, and an id that does not exist", refused.length === 0, refused.join(" | "));
    r = await as(null, "anon", `select public.add_applicant_note($1, 'x')`, [APP_ANA_A]);
    check("anon cannot call it at all", !r.ok, show(r));
    check("nothing was written by any of them", Number((await pg(`select count(*)::int as n from public.applicant_notes`))[0].n) === 3);
    const after = (await pg(`select status, notes, updated_at from public.applications where id = $1`, [APP_ANA_A]))[0];
    check("the application itself is untouched (status, notes, updated_at)", show(before) === show(after));
  }

  console.log("\n2. What a note is");
  {
    const row = (await pg(`select * from public.applicant_notes where id = $1`, [ownerNote.id]))[0];
    check("its job comes from the application, its author from the caller", row.job_id === JOB_A && row.author_id === EMP_1 && row.application_id === APP_ANA_A);
    check("what comes back to the page is the note, and not its job", show(Object.keys(ownerNote).sort()) === show(["application_id", "author_id", "body", "created_at", "id"]));
    let r = await note(EMP_1, APP_ANA_A, "   \n  ");
    check("an empty note is refused", !r.ok && r.code === "22023", show(r));
    r = await note(EMP_1, APP_ANA_A, null);
    check("…and so is none at all", !r.ok && r.code === "22023", show(r));
    r = await note(EMP_1, APP_ANA_A, "x".repeat(2001));
    check("more than 2000 characters is refused", !r.ok && r.code === "22023", show(r));
    r = await note(EMP_1, APP_BEN_A, "y".repeat(2000));
    check("2000 is kept whole", r.ok && r.rows[0].note.body.length === 2000);
    r = await note(EMP_1, APP_BEN_A, "Line one\nLine two");
    check("a line break inside a note is kept", r.ok && r.rows[0].note.body === "Line one\nLine two");
    // 200 on one application, then no more.
    await pg(`insert into public.applicant_notes (application_id, job_id, author_id, body) select $1, $2, $3, 'n' || g from generate_series(1, 198) g`, [APP_BEN_A, JOB_A, EMP_1]);
    r = await note(EMP_1, APP_BEN_A, "the 201st");
    check("at most 200 notes on one applicant", !r.ok && r.code === "22023" && /at most 200/.test(r.error), show(r));
    await pg(`delete from public.applicant_notes where application_id = $1`, [APP_BEN_A]);
  }

  console.log("\n3. Who may read a note");
  {
    const mine = await notesSeenBy(EMP_1);
    check("the job's owner reads them", Array.isArray(mine) && mine.length === 3, show(mine));
    check("…and so does the job's team, view-only included", (await notesSeenBy(TEAM_VIEW)).length === 3 && (await notesSeenBy(TEAM_PIPE)).length === 3);
    // The one that matters most.
    check("the applicant can NEVER read the team's notes about them", show(await notesSeenBy(ANA)) === "[]");
    check("a stranger, another employer, a team member on another job and one no longer active see nothing", [await notesSeenBy(STRANGER), await notesSeenBy(EMP_2), await notesSeenBy(TEAM_JOB_B), await notesSeenBy(TEAM_GONE)].every((x) => show(x) === "[]"));
    const anon = await notesSeenBy(null, "anon");
    check("anon is refused", typeof anon === "string" && /permission denied/.test(anon), show(anon));
    const tries = [
      await as(EMP_1, "authenticated", `insert into public.applicant_notes (application_id, job_id, author_id, body) values ($1,$2,$3,'direct')`, [APP_ANA_A, JOB_A, EMP_1]),
      await as(EMP_1, "authenticated", `update public.applicant_notes set body = 'changed' where id = $1`, [ownerNote.id]),
      await as(EMP_1, "authenticated", `delete from public.applicant_notes where id = $1`, [ownerNote.id]),
      await as(ANA, "authenticated", `insert into public.applicant_notes (application_id, job_id, author_id, body) values ($1,$2,$3,'mine')`, [APP_ANA_A, JOB_A, ANA]),
    ];
    check("nobody writes the table directly, not even the owner", tries.every((t) => !t.ok && /permission denied/.test(t.error)), show(tries.map((t) => t.ok || t.error)));
    check("…and the note is as it was", (await pg(`select body from public.applicant_notes where id = $1`, [ownerNote.id]))[0].body.startsWith("Calm under pressure"));
  }

  console.log("\n4. Taking a note away");
  {
    const del = (uid, id) => as(uid, "authenticated", `select public.delete_applicant_note($1) as gone`, [id]);
    const quiet = [];
    for (const [who, uid, id] of [
      ["a teammate, of the owner's note", TEAM_PIPE, ownerNote.id],
      ["a teammate, of another teammate's note", TEAM_PIPE, teamNote.id],
      ["the applicant", ANA, ownerNote.id],
      ["a stranger", STRANGER, ownerNote.id],
      ["another employer", EMP_2, ownerNote.id],
      ["anyone, of a note that does not exist", EMP_1, APP_MISSING],
    ]) {
      const x = await del(uid, id);
      if (!x.ok || x.rows[0].gone !== false) quiet.push(`${who}: ${show(x)}`);
    }
    check("anyone but its author or the job's owner: a quiet false", quiet.length === 0, quiet.join(" | "));
    check("…and nothing was removed", Number((await pg(`select count(*)::int as n from public.applicant_notes`))[0].n) === 3);
    let r = await del(TEAM_VIEW, teamNote.id);
    check("its own author takes it back", r.ok && r.rows[0].gone === true && (await pg(`select count(*)::int as n from public.applicant_notes where id = $1`, [teamNote.id]))[0].n === 0, show(r));
    const pipes = (await pg(`select id from public.applicant_notes where author_id = $1`, [TEAM_PIPE]))[0];
    r = await del(EMP_1, pipes.id);
    check("the job's owner removes a teammate's", r.ok && r.rows[0].gone === true);
    // Someone who has left the team keeps no hold on what they wrote.
    await pg(`insert into public.applicant_notes (id, application_id, job_id, author_id, body) values ('50000000-0000-4000-8000-000000000001', $1, $2, $3, 'written before leaving')`, [APP_ANA_A, JOB_A, TEAM_GONE]);
    r = await del(TEAM_GONE, "50000000-0000-4000-8000-000000000001");
    check("someone no longer on the team cannot remove even their own", r.ok && r.rows[0].gone === false);
    r = await as(null, "anon", `select public.delete_applicant_note($1)`, [ownerNote.id]);
    check("anon cannot call it at all", !r.ok, show(r));
  }

  console.log("\n5. Viewed");
  {
    const mark = (uid, app) => as(uid, "authenticated", `select public.mark_applicant_viewed($1) as at`, [app]);
    const seen = async (uid, role = "authenticated") => {
      const r = await as(uid, role, `select viewer_id, application_id, viewed_at from public.applicant_views order by application_id`);
      return r.ok ? r.rows : `refused: ${r.error}`;
    };
    const before = (await pg(`select status, notes, updated_at from public.applications where id = $1`, [APP_ANA_A]))[0];
    let r = await mark(EMP_1, APP_ANA_A);
    check("the owner opens an applicant: their mark is set", r.ok && !!r.rows[0].at, show(r));
    const firstAt = r.ok ? new Date(r.rows[0].at).getTime() : 0;
    check("a team member on the job sets their own", (await mark(TEAM_VIEW, APP_ANA_A)).ok && (await mark(TEAM_VIEW, APP_BEN_A)).ok);
    const refused = [];
    for (const [who, uid, app] of [
      ["the applicant", ANA, APP_ANA_A],
      ["a stranger", STRANGER, APP_ANA_A],
      ["another employer", EMP_2, APP_ANA_A],
      ["a team member limited to another job", TEAM_JOB_B, APP_ANA_A],
      ["an id that does not exist", EMP_1, APP_MISSING],
    ]) {
      const x = await mark(uid, app);
      if (x.ok || x.code !== "42501") refused.push(`${who}: ${show(x)}`);
    }
    check("refused for the applicant, a stranger, another employer, a team member on another job and an id that does not exist", refused.length === 0, refused.join(" | "));
    const owners = await seen(EMP_1);
    const teams = await seen(TEAM_VIEW);
    check("each person reads only their own marks", owners.length === 1 && owners[0].viewer_id === EMP_1 && teams.length === 2 && teams.every((v) => v.viewer_id === TEAM_VIEW), show({ owners, teams }));
    check("the applicant, a stranger and another employer read none", [await seen(ANA), await seen(STRANGER), await seen(EMP_2)].every((x) => show(x) === "[]"));
    const anon = await seen(null, "anon");
    check("anon is refused", typeof anon === "string" && /permission denied/.test(anon), show(anon));
    await new Promise((resolve) => setTimeout(resolve, 15));
    r = await mark(EMP_1, APP_ANA_A);
    check("opening again moves the time on, and stays one mark", r.ok && new Date(r.rows[0].at).getTime() > firstAt && (await seen(EMP_1)).length === 1, show(r));
    const tries = [
      await as(EMP_1, "authenticated", `insert into public.applicant_views (viewer_id, application_id, job_id) values ($1,$2,$3)`, [EMP_1, APP_BEN_A, JOB_A]),
      await as(EMP_1, "authenticated", `update public.applicant_views set viewed_at = now() - interval '1 year' where viewer_id = $1`, [EMP_1]),
      await as(EMP_1, "authenticated", `delete from public.applicant_views where viewer_id = $1`, [EMP_1]),
    ];
    check("nobody writes it directly", tries.every((t) => !t.ok && /permission denied/.test(t.error)), show(tries.map((t) => t.ok || t.error)));
    r = await as(null, "anon", `select public.mark_applicant_viewed($1)`, [APP_ANA_A]);
    check("anon cannot call it at all", !r.ok, show(r));
    const after = (await pg(`select status, notes, updated_at from public.applications where id = $1`, [APP_ANA_A]))[0];
    check("looking at an applicant does not touch their application", show(before) === show(after));
  }

  console.log("\n6. Deleting an application, or a job, takes its notes and marks with it");
  {
    await as(EMP_1, "authenticated", `select public.add_applicant_note($1, 'on job B')`, [APP_CAT_B]);
    await as(EMP_1, "authenticated", `select public.mark_applicant_viewed($1)`, [APP_CAT_B]);
    const count = async () => ({
      notes: Number((await pg(`select count(*)::int as n from public.applicant_notes`))[0].n),
      views: Number((await pg(`select count(*)::int as n from public.applicant_views`))[0].n),
    });
    const start = await count();
    await pg(`delete from public.applications where id = $1`, [APP_ANA_A]);
    const afterApp = await count();
    check("an application deleted: its notes and marks go", afterApp.notes < start.notes && afterApp.views < start.views && Number((await pg(`select count(*)::int as n from public.applicant_notes where application_id = $1`, [APP_ANA_A]))[0].n) === 0, show({ start, afterApp }));
    await pg(`delete from public.jobs where id = $1`, [JOB_B]);
    const afterJob = await count();
    check("a job deleted: its notes and marks go", Number((await pg(`select count(*)::int as n from public.applicant_notes where job_id = $1`, [JOB_B]))[0].n) === 0 && Number((await pg(`select count(*)::int as n from public.applicant_views where job_id = $1`, [JOB_B]))[0].n) === 0, show(afterJob));
  }

  await db.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
