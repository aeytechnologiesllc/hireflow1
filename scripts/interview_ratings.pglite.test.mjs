#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/*_interview_ratings.sql (the
 * interviewer's own ratings and notes in the interview guide): plain
 * assertions against a real Postgres, not a text match.
 *
 * The owner, 2026-10-09: "give me a button that I could rate all of these
 * answers from 1 to 10 here in the interview guide ... and I could probably
 * write extra notes here as well."
 *
 * The one thing that must hold: an applicant can never read how their
 * answers were rated. That is why ratings are not in applications.notes
 * (which they can read) but in a table of their own. This proves:
 *
 *   0. The migration applies twice (it must be re-runnable), and puts
 *      lock_timeout back afterwards.
 *   1. Saving: the job's owner and an active team member on that job can;
 *      each has their OWN row; a save replaces that row. Nobody else can,
 *      and "not found" reads the same as "not allowed".
 *   2. What is kept: a whole-number score from 1 to 10 or none, a note, the
 *      question as asked; an entry with neither a score nor a note is
 *      dropped; anything malformed is refused whole and changes nothing.
 *   3. Who can read: the job's hiring team. Not anon, not a stranger, not
 *      another employer, not a former team member, and not the applicant.
 *   4. Nobody writes the table directly, not even the owner.
 *   5. Deleting an application, or a job, takes its ratings with it.
 *
 * anon / authenticated / service_role are real, separate roles, so RLS and
 * GRANT/REVOKE are genuinely in force.
 *
 * Run with: node scripts/interview_ratings.pglite.test.mjs
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
const NOWHERE = "40000000-0000-4000-8000-0000000000ee";

const Q1 = "To start, what makes you a good candidate for this role?";
const ANSWERS = {
  good_candidate: { score: 8, note: "A real example.", question: Q1 },
  hard_day: { score: null, note: "Blamed the tools.", question: "Can you tell me about a really hard day at work?" },
  "personal:0a1b2c3d": { score: 4, note: "", question: "You wrote that you led a team of eight." },
  "mark:speaking": { score: 7, note: "", question: "How they speak" },
};

async function migrationFile() {
  const names = (await readdir(MIGRATIONS)).filter((n) => /^\d+_interview_ratings\.sql$/.test(n));
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

const SAVE = `select public.save_interview_ratings($1::uuid, $2::jsonb, $3) as saved`;

async function main() {
  const file = await migrationFile();
  check("exactly one *_interview_ratings.sql migration", file != null);
  if (!file) {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(1);
  }
  const migration = await readFile(file, "utf8");
  const { db, as, pg } = await setup();
  const save = (uid, app, answers, overall = "", role = "authenticated") => as(uid, role, SAVE, [app, typeof answers === "string" ? answers : JSON.stringify(answers), overall]);
  const rowsFor = (app) => pg(`select rated_by::text, job_id::text, answers, overall_note from public.interview_ratings where application_id = $1 order by rated_by`, [app]);

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
    const fks = await pg(`select conname from pg_constraint where conrelid = 'public.interview_ratings'::regclass and contype = 'f' order by 1`);
    check("two foreign keys, once each", show(fks.map((r) => r.conname)) === show(["interview_ratings_application_fkey", "interview_ratings_job_fkey"]), show(fks));
  }

  console.log("\n1. Saving");
  {
    const first = await save(EMP_1, APP_ANA_A, ANSWERS, "Trust on a quiet shift first.");
    check("the job's owner saves ratings and notes", first.ok, show(first));
    const back = first.ok ? first.rows[0].saved : null;
    check("…and gets back what was kept", back && back.answers.good_candidate.score === 8 && back.overall_note === "Trust on a quiet shift first." && typeof back.updated_at === "string", show(back));
    let rows = await rowsFor(APP_ANA_A);
    check("one row, under the caller, with the job taken from the application", rows.length === 1 && rows[0].rated_by === EMP_1 && rows[0].job_id === JOB_A, show(rows));
    check("a note with no score, a score with no note, a personal question and the whole-call mark are all kept", rows[0].answers.hard_day.score === null && rows[0].answers.hard_day.note === "Blamed the tools." && rows[0].answers["personal:0a1b2c3d"].score === 4 && rows[0].answers["mark:speaking"].score === 7, show(rows[0].answers));
    check("the question is kept as it was asked", rows[0].answers.good_candidate.question === Q1);

    const again = await save(EMP_1, APP_ANA_A, { good_candidate: { score: 9, note: "Better than I first thought.", question: Q1 } }, "");
    rows = await rowsFor(APP_ANA_A);
    check("saving again replaces the caller's own row with what was sent", again.ok && rows.length === 1 && rows[0].answers.good_candidate.score === 9 && Object.keys(rows[0].answers).length === 1 && rows[0].overall_note === "", show(rows));

    const mate = await save(TEAM_ALL, APP_ANA_A, { good_candidate: { score: 5, note: "", question: Q1 } }, "My own view.");
    rows = await rowsFor(APP_ANA_A);
    check("a team member's ratings are a row of their own; the owner's are untouched", mate.ok && rows.length === 2 && rows.find((r) => r.rated_by === EMP_1).answers.good_candidate.score === 9 && rows.find((r) => r.rated_by === TEAM_ALL).answers.good_candidate.score === 5, show(rows));
    check("a team member limited to another job cannot rate this applicant", !(await save(TEAM_JOB_B, APP_ANA_A, ANSWERS)).ok);
    check("…but can rate one on their own job", (await save(TEAM_JOB_B, APP_BEN_B, ANSWERS)).ok);

    const refused = [];
    for (const [who, uid, app] of [["a former team member", TEAM_GONE, APP_ANA_A], ["another employer", EMP_2, APP_ANA_A], ["a stranger", STRANGER, APP_ANA_A], ["the applicant, on their own application", ANA, APP_ANA_A], ["another applicant", BEN, APP_ANA_A]]) {
      const r = await save(uid, app, ANSWERS, "forged");
      refused.push([who, r]);
      check(`${who} cannot save`, !r.ok && r.code === "42501" && /not allowed/.test(r.error), show(r));
    }
    const missing = await save(EMP_1, NOWHERE, ANSWERS);
    check("an application that does not exist reads the same as one that is not yours", !missing.ok && missing.code === "42501" && missing.error === refused[1][1].error, show(missing));
    const anon = await save(null, APP_ANA_A, ANSWERS, "", "anon");
    check("anon cannot call it at all", !anon.ok && /permission denied/i.test(anon.error), show(anon));
    rows = await rowsFor(APP_ANA_A);
    check("none of that changed a row", rows.length === 2 && !rows.some((r) => r.overall_note === "forged"), show(rows));
    const theirs = await save(EMP_2, APP_DEE_X, ANSWERS, "Other team.");
    check("the other employer rates their own applicant", theirs.ok);
  }

  console.log("\n2. What is kept, and what is refused");
  {
    const before = show(await rowsFor(APP_ANA_A));
    const bad = [
      ["a score of 0", { a: { score: 0, note: "", question: "q" } }],
      ["a score of 11", { a: { score: 11, note: "", question: "q" } }],
      ["a score of 7.5", { a: { score: 7.5, note: "", question: "q" } }],
      ["a score written as text", { a: { score: "8", note: "", question: "q" } }],
      ["a note that is not text", { a: { score: 5, note: 12, question: "q" } }],
      ["a note of 2001 characters", { a: { score: 5, note: "x".repeat(2001), question: "q" } }],
      ["a question of 401 characters", { a: { score: 5, note: "", question: "x".repeat(401) } }],
      ["a key with a space or capitals", { "Bad Key": { score: 5, note: "", question: "q" } }],
      ["a key of 81 characters", { ["k".repeat(81)]: { score: 5, note: "", question: "q" } }],
      ["an entry that is not an object", { a: 8 }],
      ["41 ratings", Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`k${i}`, { score: 5, note: "", question: "q" }]))],
    ];
    for (const [what, answers] of bad) {
      const r = await save(EMP_1, APP_ANA_A, answers);
      check(`${what} is refused`, !r.ok && r.code === "22023", show(r).slice(0, 160));
    }
    check("a list instead of an object is refused", !(await save(EMP_1, APP_ANA_A, "[1,2]")).ok);
    const long = await save(EMP_1, APP_ANA_A, {}, "x".repeat(4001));
    check("an overall note of 4001 characters is refused", !long.ok && long.code === "22023", show(long).slice(0, 120));
    check("every refusal left the stored ratings exactly as they were", show(await rowsFor(APP_ANA_A)) === before);

    const edges = await save(EMP_1, APP_ANA_A, {
      one: { score: 1, note: "", question: "q" },
      ten: { score: 10, note: "x".repeat(2000), question: "y".repeat(400) },
      cleared: { score: null, note: "   \n ", question: "q" },
      bare: {},
      noted: { note: "Only a note." },
    }, "x".repeat(4000));
    const kept = edges.ok ? edges.rows[0].saved.answers : null;
    check("1 and 10 are kept, with a note and a question at their full length", edges.ok && kept.one.score === 1 && kept.ten.score === 10 && kept.ten.note.length === 2000 && kept.ten.question.length === 400, show(edges).slice(0, 160));
    check("an entry with neither a score nor a note (a rating that was cleared) is dropped", edges.ok && !("cleared" in kept) && !("bare" in kept) && show(Object.keys(kept).sort()) === show(["noted", "one", "ten"]), show(kept && Object.keys(kept)));
    check("a note alone is kept, with no score", edges.ok && kept.noted.score === null && kept.noted.note === "Only a note." && kept.noted.question === "");
    check("only the three known parts of an entry are kept", show(Object.keys(kept.one).sort()) === show(["note", "question", "score"]));
    const extra = await save(EMP_1, APP_ANA_A, { a: { score: 6, note: "n", question: "q", verdict: "No Hire", html: "<b>x</b>" } });
    check("anything else sent in an entry is left out", extra.ok && show(Object.keys(extra.rows[0].saved.answers.a).sort()) === show(["note", "question", "score"]));
    const forty = await save(EMP_1, APP_ANA_A, Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, { score: 5, note: "", question: "q" }])));
    check("40 ratings are kept", forty.ok && Object.keys(forty.rows[0].saved.answers).length === 40);
    const empty = await save(EMP_1, APP_ANA_A, {}, "");
    check("an empty save is kept as empty (everything was cleared)", empty.ok && show(empty.rows[0].saved.answers) === "{}");
  }

  console.log("\n3. Who can read them");
  {
    const READ = `select application_id::text, rated_by::text from public.interview_ratings order by 1, 2`;
    const ids = (r) => (r.ok ? [...new Set(r.rows.map((x) => x.application_id))] : null);
    const anon = await as(null, "anon", READ);
    check("anon: permission denied", !anon.ok && /permission denied/i.test(anon.error), show(anon));
    check("THE APPLICANT sees nothing, not even how they themselves were rated", show(ids(await as(ANA, "authenticated", READ))) === "[]");
    const direct = await as(ANA, "authenticated", `select answers from public.interview_ratings where application_id = $1`, [APP_ANA_A]);
    check("…asked for by their own application id, still nothing", direct.ok && direct.rows.length === 0, show(direct));
    check("…while they can still read their own application", (await as(ANA, "authenticated", `select id from public.applications`)).rows.length === 1);
    check("another applicant sees nothing", show(ids(await as(BEN, "authenticated", READ))) === "[]");
    check("a stranger sees nothing", show(ids(await as(STRANGER, "authenticated", READ))) === "[]");
    check("another employer sees only their own job's", show(ids(await as(EMP_2, "authenticated", READ))) === show([APP_DEE_X]));
    check("a former team member sees nothing", show(ids(await as(TEAM_GONE, "authenticated", READ))) === "[]");
    const owner = await as(EMP_1, "authenticated", READ);
    check("the owner sees their jobs' ratings, their own and their team's", show(ids(owner)) === show([APP_ANA_A, APP_BEN_B].sort()) && owner.rows.filter((r) => r.application_id === APP_ANA_A).length === 2, show(owner));
    check("an active team member sees them", show(ids(await as(TEAM_ALL, "authenticated", READ))) === show([APP_ANA_A, APP_BEN_B].sort()));
    check("a team member limited to one job sees that job's only", show(ids(await as(TEAM_JOB_B, "authenticated", READ))) === show([APP_BEN_B]));
    const mine = await as(EMP_1, "authenticated", `select rated_by::text from public.interview_ratings where application_id = $1 and rated_by = $2`, [APP_ANA_A, EMP_1]);
    check("the guide's own read (this application, my own row) finds one row", mine.ok && mine.rows.length === 1);
  }

  console.log("\n4. Nobody writes the table directly");
  {
    const insert = await as(EMP_1, "authenticated", `insert into public.interview_ratings (application_id, rated_by, job_id) values ($1, $2, $3)`, [APP_DEE_X, EMP_1, JOB_A]);
    check("the owner cannot insert a row (no pairing someone else's applicant with their job)", !insert.ok && /permission denied/i.test(insert.error), show(insert));
    const update = await as(EMP_1, "authenticated", `update public.interview_ratings set overall_note = 'x' where application_id = $1`, [APP_ANA_A]);
    check("…nor change one", !update.ok && /permission denied/i.test(update.error), show(update));
    const del = await as(EMP_1, "authenticated", `delete from public.interview_ratings where application_id = $1`, [APP_ANA_A]);
    check("…nor delete one", !del.ok && /permission denied/i.test(del.error), show(del));
    const forged = await as(ANA, "authenticated", `insert into public.interview_ratings (application_id, rated_by, job_id) values ($1, $2, $3)`, [APP_ANA_A, ANA, JOB_A]);
    check("an applicant cannot write one either", !forged.ok && /permission denied/i.test(forged.error), show(forged));
    const rls = await pg(`select relrowsecurity from pg_class where oid = 'public.interview_ratings'::regclass`);
    check("row level security is on", rls[0]?.relrowsecurity === true);
    const policies = await pg(`select cmd, roles::text from pg_policies where schemaname = 'public' and tablename = 'interview_ratings'`);
    check("one policy, for SELECT, for signed-in people", policies.length === 1 && policies[0].cmd === "SELECT" && /authenticated/.test(policies[0].roles), show(policies));
    const grants = await pg(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'interview_ratings' and grantee in ('anon', 'authenticated', 'PUBLIC') order by 1, 2`,
    );
    check("authenticated has SELECT and nothing else; anon has nothing", show(grants) === show([{ grantee: "authenticated", privilege_type: "SELECT" }]), show(grants));
    const fn = await pg(`select prosecdef, proconfig::text from pg_proc where proname = 'save_interview_ratings'`);
    check("the function runs as its owner with a pinned search_path", fn.length === 1 && fn[0].prosecdef === true && /search_path=public, pg_temp/.test(fn[0].proconfig), show(fn));
    const exec = await pg(`select has_function_privilege('anon', 'public.save_interview_ratings(uuid, jsonb, text)', 'execute') as anon, has_function_privilege('authenticated', 'public.save_interview_ratings(uuid, jsonb, text)', 'execute') as auth`);
    check("signed-in people may call it; anon may not", exec[0].anon === false && exec[0].auth === true, show(exec));
  }

  console.log("\n5. A deleted application or job takes its ratings with it");
  {
    await pg(`delete from public.applications where id = $1`, [APP_ANA_A]);
    const left = await pg(`select distinct application_id::text from public.interview_ratings order by 1`);
    check("the application's ratings go with it", show(left.map((r) => r.application_id)) === show([APP_BEN_B, APP_DEE_X].sort()), show(left));
    await pg(`delete from public.jobs where id = $1`, [JOB_B]);
    const after = await pg(`select distinct application_id::text from public.interview_ratings order by 1`);
    check("a deleted job's ratings go too, the other job's stay", show(after.map((r) => r.application_id)) === show([APP_DEE_X]), show(after));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
