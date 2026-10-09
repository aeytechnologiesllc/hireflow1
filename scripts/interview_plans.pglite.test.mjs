#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/*_interview_plans.sql (a job's own
 * changes to the interview guide's questions): plain assertions against a
 * real Postgres, not a text match.
 *
 * The owner, 2026-10-09: "Why don't you also allow me to edit the interview
 * guide so people can also make some changes here?"
 *
 * What must hold: an applicant can never read what they will be asked, and
 * only the people who run the hiring can change what everyone is asked.
 * This proves:
 *
 *   0. The migration applies twice, and puts lock_timeout back afterwards.
 *   1. Saving: the job's owner, and a team member on that job who may manage
 *      the pipeline. Not a team member who may only look, not one limited to
 *      another job, nobody else; "not found" reads the same as "not
 *      allowed". One row per job, replaced in place. NULL, or changes with
 *      nothing in them, take the row away.
 *   2. What is kept: only the known parts, as plain single lines within
 *      their limits; anything malformed is refused whole and changes nothing.
 *   3. Who can read: the job's hiring team (a look-only team member too).
 *      Not anon, a stranger, another employer, a former team member, or an
 *      applicant.
 *   4. Nobody writes the table directly, not even the owner.
 *   5. A deleted job takes its plan with it.
 *
 * Run with: node scripts/interview_plans.pglite.test.mjs
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
const TEAM_ALL = "10000000-0000-4000-8000-0000000000a1"; // EMP_1, every job, may manage the pipeline
const TEAM_JOB_B = "10000000-0000-4000-8000-0000000000a3"; // EMP_1, JOB_B only, may manage the pipeline
const TEAM_GONE = "10000000-0000-4000-8000-0000000000a4"; // EMP_1, no longer active
const TEAM_VIEW = "10000000-0000-4000-8000-0000000000a5"; // EMP_1, every job, may only look
const STRANGER = "10000000-0000-4000-8000-0000000000ff";

const ANA = "20000000-0000-4000-8000-000000000001"; // applied to JOB_A
const BEN = "20000000-0000-4000-8000-000000000002"; // applied to JOB_B
const DEE = "20000000-0000-4000-8000-000000000004"; // applied to EMP_2's JOB_X

const JOB_A = "30000000-0000-4000-8000-00000000000a";
const JOB_B = "30000000-0000-4000-8000-00000000000b";
const JOB_X = "30000000-0000-4000-8000-0000000000aa";
const NO_JOB = "30000000-0000-4000-8000-0000000000ee";

const APP_ANA_A = "40000000-0000-4000-8000-000000000001";
const APP_BEN_B = "40000000-0000-4000-8000-000000000002";
const APP_DEE_X = "40000000-0000-4000-8000-000000000005";

const EDITS = {
  version: 1,
  welcome: "Thanks for joining. About half an hour.",
  changed: { good_candidate: { question: "To start, what makes you right for this job?" }, hard_day: { listenFor: "One real day." } },
  removed: ["disagreement"],
  added: [{ id: "custom_ab12cd34", question: "Can you tell me about your last team?", listenFor: "Numbers.", redFlag: "" }],
};

async function migrationFile() {
  const names = (await readdir(MIGRATIONS)).filter((n) => /^\d+_interview_plans\.sql$/.test(n));
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
    `insert into public.team_members (user_id, employer_id, status, can_manage_pipeline, assigned_job_ids) values
       ($1, $4, 'active', true, '{}'), ($2, $4, 'active', true, $5::uuid[]), ($3, $4, 'removed', true, '{}'), ($6, $4, 'active', false, '{}')`,
    [TEAM_ALL, TEAM_JOB_B, TEAM_GONE, EMP_1, `{${JOB_B}}`, TEAM_VIEW],
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

const SAVE = `select public.save_interview_plan($1::uuid, $2::jsonb) as saved`;

async function main() {
  const file = await migrationFile();
  check("exactly one *_interview_plans.sql migration", file != null);
  if (!file) {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(1);
  }
  const migration = await readFile(file, "utf8");
  const { db, as, pg } = await setup();
  const save = (uid, job, edits, role = "authenticated") => as(uid, role, SAVE, [job, edits === null ? null : typeof edits === "string" ? edits : JSON.stringify(edits)]);
  const rowFor = (job) => pg(`select edits, updated_by::text from public.interview_plans where job_id = $1`, [job]);

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
    const fks = await pg(`select conname from pg_constraint where conrelid = 'public.interview_plans'::regclass and contype = 'f' order by 1`);
    check("one foreign key, once", show(fks.map((r) => r.conname)) === show(["interview_plans_job_fkey"]), show(fks));
  }

  console.log("\n1. Saving");
  {
    const first = await save(EMP_1, JOB_A, EDITS);
    check("the job's owner saves changes", first.ok, show(first));
    const back = first.ok ? first.rows[0].saved : null;
    check("…and gets back exactly what was kept", back && back.version === 1 && back.welcome === EDITS.welcome && back.changed.good_candidate.question === EDITS.changed.good_candidate.question && back.changed.hard_day.listenFor === "One real day." && show(back.removed) === show(["disagreement"]) && back.added.length === 1 && back.added[0].id === "custom_ab12cd34" && back.added[0].redFlag === "", show(back));
    let rows = await rowFor(JOB_A);
    check("one row for the job, with who saved it", rows.length === 1 && rows[0].updated_by === EMP_1 && rows[0].edits.welcome === EDITS.welcome, show(rows));
    const mate = await save(TEAM_ALL, JOB_A, { welcome: "Hello, and thanks for your time." });
    rows = await rowFor(JOB_A);
    check("a team member who may manage the pipeline saves; it replaces the row in place", mate.ok && rows.length === 1 && rows[0].updated_by === TEAM_ALL && rows[0].edits.welcome === "Hello, and thanks for your time." && show(rows[0].edits.changed) === "{}" && show(rows[0].edits.added) === "[]", show(rows));
    check("a team member limited to another job cannot change this job's", !(await save(TEAM_JOB_B, JOB_A, EDITS)).ok);
    check("…but can change their own job's", (await save(TEAM_JOB_B, JOB_B, EDITS)).ok);

    const refused = [];
    for (const [who, uid] of [["a team member who may only look", TEAM_VIEW], ["a former team member", TEAM_GONE], ["another employer", EMP_2], ["a stranger", STRANGER], ["an applicant to the job", ANA], ["another applicant", BEN]]) {
      const r = await save(uid, JOB_A, { welcome: "forged" });
      refused.push(r);
      check(`${who} cannot save`, !r.ok && r.code === "42501" && /not allowed/.test(r.error), show(r));
    }
    const missing = await save(EMP_1, NO_JOB, EDITS);
    check("a job that does not exist reads the same as one that is not yours", !missing.ok && missing.code === "42501" && missing.error === refused[2].error, show(missing));
    const anon = await save(null, JOB_A, EDITS, "anon");
    check("anon cannot call it at all", !anon.ok && /permission denied/i.test(anon.error), show(anon));
    rows = await rowFor(JOB_A);
    check("none of that changed the row", rows.length === 1 && rows[0].edits.welcome === "Hello, and thanks for your time.", show(rows));
    const cannotDelete = await save(TEAM_VIEW, JOB_A, null);
    check("…and someone who may not save may not take the changes away either", !cannotDelete.ok && (await rowFor(JOB_A)).length === 1);

    const gone = await save(EMP_1, JOB_A, null);
    check("NULL takes the job's changes away: back to the plan as written", gone.ok && gone.rows[0].saved === null && (await rowFor(JOB_A)).length === 0, show(gone));
    await save(EMP_1, JOB_A, EDITS);
    const empty = await save(EMP_1, JOB_A, { version: 1, welcome: "   ", changed: { good_candidate: { question: " " } }, removed: [], added: [] });
    check("changes with nothing in them take the row away too", empty.ok && empty.rows[0].saved === null && (await rowFor(JOB_A)).length === 0, show(empty));
    check("the other employer changes their own job", (await save(EMP_2, JOB_X, EDITS)).ok);
    await save(EMP_1, JOB_A, EDITS);
  }

  console.log("\n2. What is kept, and what is refused");
  {
    const before = show(await rowFor(JOB_A));
    const q = (over = {}) => ({ id: "custom_zz99yy88", question: "Can you tell me more?", listenFor: "", redFlag: "", ...over });
    const bad = [
      ["a list instead of an object", "[1,2]"],
      ["a welcome that is not text", { welcome: 12 }],
      ["a welcome of 401 characters", { welcome: "w".repeat(401) }],
      ["reworded questions that are not an object", { changed: [1] }],
      ["a reworded question under a strange id", { changed: { "Bad Id": { question: "x" } } }],
      ["a reworded question that is not an object", { changed: { good_candidate: "x" } }],
      ["a reworded question whose words are not text", { changed: { good_candidate: { question: 5 } } }],
      ["a reworded question of 321 characters", { changed: { good_candidate: { question: "q".repeat(321) } } }],
      ["a 'listen for' of 221 characters", { changed: { good_candidate: { listenFor: "l".repeat(221) } } }],
      ["21 reworded questions", { changed: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`q${i}`, { question: "x" }])) }],
      ["questions not asked that are not a list", { removed: "hard_day" }],
      ["a question not asked that is not an id", { removed: ["Hard Day!"] }],
      ["21 questions not asked", { removed: Array.from({ length: 21 }, (_, i) => `q${i}`) }],
      ["added questions that are not a list", { added: {} }],
      ["an added question with no id", { added: [{ question: "x" }] }],
      ["an added question whose id is a built-in one", { added: [q({ id: "good_candidate" })] }],
      ["an added question with no words", { added: [q({ question: "   " })] }],
      ["an added question of 321 characters", { added: [q({ question: "q".repeat(321) })] }],
      ["two added questions with the same id", { added: [q(), q()] }],
      ["11 added questions", { added: Array.from({ length: 11 }, (_, i) => q({ id: `custom_aaaaaa${String(i).padStart(2, "0")}` })) }],
    ];
    for (const [what, edits] of bad) {
      const r = await save(EMP_1, JOB_A, edits);
      check(`${what} is refused`, !r.ok && r.code === "22023", show(r).slice(0, 150));
    }
    check("every refusal left the stored changes exactly as they were", show(await rowFor(JOB_A)) === before);

    const tidy = await save(EMP_1, JOB_A, {
      welcome: "  Thanks   for\njoining.  ",
      changed: { good_candidate: { question: "What makes\n you right?\t", listenFor: null, extra: "<b>x</b>" }, hard_day: { question: "  " } },
      removed: ["disagreement", "disagreement", "weak_agent"],
      added: [q({ question: " One\nmore   thing? ", listenFor: null })],
      verdict: "No Hire",
      stages: [1, 2, 3],
    });
    const kept = tidy.ok ? tidy.rows[0].saved : null;
    check("line breaks and runs of spaces become single spaces; ends are trimmed", tidy.ok && kept.welcome === "Thanks for joining." && kept.changed.good_candidate.question === "What makes you right?" && kept.added[0].question === "One more thing?", show(kept));
    check("a reworded question with nothing in it is dropped; a part given as null is left out", tidy.ok && !("hard_day" in kept.changed) && show(Object.keys(kept.changed.good_candidate)) === show(["question"]));
    check("a question not asked is listed once", tidy.ok && show(kept.removed) === show(["disagreement", "weak_agent"]));
    check("an added question always has all three parts, empty when not given", tidy.ok && show(Object.keys(kept.added[0]).sort()) === show(["id", "listenFor", "question", "redFlag"]) && kept.added[0].listenFor === "");
    check("only the five known parts are stored", tidy.ok && show(Object.keys(kept).sort()) === show(["added", "changed", "removed", "version", "welcome"]));
    const full = await save(EMP_1, JOB_A, {
      welcome: "w".repeat(400),
      changed: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`q${i}`, { question: "q".repeat(320), listenFor: "l".repeat(220), redFlag: "r".repeat(220) }])),
      removed: Array.from({ length: 20 }, (_, i) => `r${i}`),
      added: Array.from({ length: 10 }, (_, i) => q({ id: `custom_bbbbbb${String(i).padStart(2, "0")}`, question: "q".repeat(320), listenFor: "l".repeat(220), redFlag: "r".repeat(220) })),
    });
    check("everything at its limit is kept", full.ok && full.rows[0].saved.welcome.length === 400 && Object.keys(full.rows[0].saved.changed).length === 20 && full.rows[0].saved.removed.length === 20 && full.rows[0].saved.added.length === 10, show(full).slice(0, 120));
    const onlyWelcome = await save(EMP_1, JOB_A, { welcome: "Just this." });
    check("a welcome alone is a change worth keeping", onlyWelcome.ok && onlyWelcome.rows[0].saved.welcome === "Just this." && show(onlyWelcome.rows[0].saved.added) === "[]");
  }

  console.log("\n3. Who can read them");
  {
    const READ = `select job_id::text from public.interview_plans order by 1`;
    const ids = (r) => (r.ok ? r.rows.map((x) => x.job_id) : null);
    const anon = await as(null, "anon", READ);
    check("anon: permission denied", !anon.ok && /permission denied/i.test(anon.error), show(anon));
    check("AN APPLICANT sees nothing: not what they will be asked", show(ids(await as(ANA, "authenticated", READ))) === "[]");
    const direct = await as(ANA, "authenticated", `select edits from public.interview_plans where job_id = $1`, [JOB_A]);
    check("…asked for by the job's own id, still nothing", direct.ok && direct.rows.length === 0, show(direct));
    check("…while they can still read their own application", (await as(ANA, "authenticated", `select id from public.applications`)).rows.length === 1);
    check("a stranger sees nothing", show(ids(await as(STRANGER, "authenticated", READ))) === "[]");
    check("another employer sees only their own job's", show(ids(await as(EMP_2, "authenticated", READ))) === show([JOB_X]));
    check("a former team member sees nothing", show(ids(await as(TEAM_GONE, "authenticated", READ))) === "[]");
    check("the owner sees their jobs' plans", show(ids(await as(EMP_1, "authenticated", READ))) === show([JOB_A, JOB_B].sort()));
    check("a team member who may only look still reads them (they interview from the same guide)", show(ids(await as(TEAM_VIEW, "authenticated", READ))) === show([JOB_A, JOB_B].sort()));
    check("a team member limited to one job sees that job's only", show(ids(await as(TEAM_JOB_B, "authenticated", READ))) === show([JOB_B]));
  }

  console.log("\n4. Nobody writes the table directly");
  {
    const insert = await as(EMP_1, "authenticated", `insert into public.interview_plans (job_id, edits) values ($1, '{}'::jsonb)`, [JOB_X]);
    check("the owner cannot insert a row", !insert.ok && /permission denied/i.test(insert.error), show(insert));
    const update = await as(EMP_1, "authenticated", `update public.interview_plans set edits = '{"welcome":"x"}'::jsonb where job_id = $1`, [JOB_A]);
    check("…nor change one", !update.ok && /permission denied/i.test(update.error), show(update));
    const del = await as(EMP_1, "authenticated", `delete from public.interview_plans where job_id = $1`, [JOB_A]);
    check("…nor delete one", !del.ok && /permission denied/i.test(del.error), show(del));
    const rls = await pg(`select relrowsecurity from pg_class where oid = 'public.interview_plans'::regclass`);
    check("row level security is on", rls[0]?.relrowsecurity === true);
    const policies = await pg(`select cmd, roles::text from pg_policies where schemaname = 'public' and tablename = 'interview_plans'`);
    check("one policy, for SELECT, for signed-in people", policies.length === 1 && policies[0].cmd === "SELECT" && /authenticated/.test(policies[0].roles), show(policies));
    const grants = await pg(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'interview_plans' and grantee in ('anon', 'authenticated', 'PUBLIC') order by 1, 2`,
    );
    check("authenticated has SELECT and nothing else; anon has nothing", show(grants) === show([{ grantee: "authenticated", privilege_type: "SELECT" }]), show(grants));
    const fn = await pg(`select prosecdef, proconfig::text from pg_proc where proname = 'save_interview_plan'`);
    check("the function runs as its owner with a pinned search_path", fn.length === 1 && fn[0].prosecdef === true && /search_path=public, pg_temp/.test(fn[0].proconfig), show(fn));
    const exec = await pg(`select has_function_privilege('anon', 'public.save_interview_plan(uuid, jsonb)', 'execute') as anon, has_function_privilege('authenticated', 'public.save_interview_plan(uuid, jsonb)', 'execute') as auth`);
    check("signed-in people may call it; anon may not", exec[0].anon === false && exec[0].auth === true, show(exec));
    const direct = await as(EMP_1, "service_role", `insert into public.interview_plans (job_id, edits) values ($1, '[1]'::jsonb) on conflict (job_id) do update set edits = excluded.edits`, [JOB_A]);
    check("even the service role cannot store something that is not an object", !direct.ok && /check constraint/i.test(direct.error), show(direct));
  }

  console.log("\n5. A deleted job takes its plan with it");
  {
    await pg(`delete from public.jobs where id = $1`, [JOB_B]);
    const after = await pg(`select job_id::text from public.interview_plans order by 1`);
    check("the deleted job's plan is gone, the others stay", show(after.map((r) => r.job_id)) === show([JOB_A, JOB_X].sort()), show(after));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
