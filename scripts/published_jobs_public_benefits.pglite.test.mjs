#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20260916200000_published_jobs_public_benefits.sql
 * — plain assertions against a real Postgres (via PGlite), not a text match.
 *
 * Builds the same fixture of public.jobs / public.profiles as scripts/
 * public_jobs_view_row_filter.pglite.test.mjs (same column shapes, same real
 * vs. internal-QA vs. draft jobs), applies 20260915130000_public_views_tighten.sql
 * first (the migration this one replaces, so the "before" state is the ACTUAL
 * live view, not a strawman), proves benefits is genuinely absent from that
 * view, then applies 20260916200000_published_jobs_public_benefits.sql
 * VERBATIM (read from disk) and re-checks:
 *
 *   1. anon can now read `benefits` for a published, non-excluded job.
 *   2. every row-visibility rule from the prior migration is untouched —
 *      the exclude_from_feed/employer_id row filter, an unpublished draft
 *      never appearing, the owning employer's own excluded/QA job still
 *      working while a stranger's does not.
 *   3. column safety is untouched — internal-only columns (ai_bias_score,
 *      processing_mode, etc.) and the quiz/application answer-key fields
 *      stay stripped; `select *` gains exactly one new column (`benefits`),
 *      nothing else in the column set moved or disappeared.
 *
 * Run with: node scripts/published_jobs_public_benefits.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PRIOR_MIGRATION = path.join(ROOT, "supabase/migrations/20260915130000_public_views_tighten.sql");
const MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260916200000_published_jobs_public_benefits.sql");

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

const EMP_REAL = "10000000-0000-0000-0000-00000000000a";
const EMP_QA = "10000000-0000-0000-0000-00000000000b";
const STRANGER = "40000000-0000-0000-0000-000000000001";

const JOB_REAL = "50000000-0000-0000-0000-00000000000a"; // real, published, exclude_from_feed = false, HAS benefits
const JOB_QA = "50000000-0000-0000-0000-00000000000b"; // internal QA, published, exclude_from_feed = true
const JOB_DRAFT = "50000000-0000-0000-0000-00000000000c"; // real employer's own draft — never public
const JOB_NO_BENEFITS = "50000000-0000-0000-0000-00000000000d"; // real, published, benefits column is NULL

async function main() {
  const priorSql = await readFile(PRIOR_MIGRATION, "utf8").catch(() => null);
  const migrationSql = await readFile(MIGRATION_PATH, "utf8").catch(() => null);
  check("prior migration file exists on disk", priorSql != null, PRIOR_MIGRATION);
  check("new migration file exists on disk", migrationSql != null, MIGRATION_PATH);
  if (!priorSql || !migrationSql) {
    console.log(`\n${failed} of ${passed + failed} checks failed.`);
    process.exit(1);
  }

  const db = new PGlite();

  await db.exec(`
    create schema auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    create role anon nologin;
    create role authenticated nologin;
    grant anon to postgres;
    grant authenticated to postgres;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;

    create type job_status as enum ('draft', 'published', 'closed');

    create table public.jobs (
      id uuid primary key default gen_random_uuid(),
      employer_id uuid not null,
      title text,
      description text,
      responsibilities text,
      requirements text,
      location text,
      job_type text,
      experience_level text,
      department text,
      skills_required text[],
      salary_min integer,
      salary_max integer,
      salary_currency text,
      salary_period text,
      status job_status not null default 'draft',
      job_code text,
      location_city text,
      location_region text,
      location_country text,
      location_country_code text,
      latitude double precision,
      longitude double precision,
      is_remote boolean,
      locations jsonb,
      require_resume boolean,
      application_questions jsonb,
      quiz_questions jsonb,
      workflow_steps jsonb,
      exclude_from_feed boolean not null default false,
      benefits text[],
      ai_bias_score numeric,
      ai_bias_feedback text,
      processing_mode text,
      passing_score integer,
      workflow_difficulty text,
      required_wpm integer,
      created_at timestamptz not null default now(),
      application_deadline timestamptz
    );

    alter table public.jobs enable row level security;
    grant select, insert, update, delete on public.jobs to anon, authenticated;

    create policy "Employers can view their own jobs"
    on public.jobs for select
    using (auth.uid() = employer_id);

    create table public.profiles (
      user_id uuid primary key,
      company_name text,
      company_logo text,
      email text
    );
    alter table public.profiles enable row level security;
    grant select on public.profiles to anon, authenticated;
    create policy "Users can view their own profile" on public.profiles for select using (auth.uid() = user_id);
  `);

  await db.query(
    `insert into public.jobs (
       id, employer_id, title, description, status, job_code, exclude_from_feed, benefits,
       ai_bias_score, ai_bias_feedback, processing_mode, passing_score,
       workflow_difficulty, required_wpm,
       application_questions, quiz_questions
     ) values
     ($1, $2, 'Barista', 'Pull shots, steam milk.', 'published', 'JOB-REAL01', false,
       ARRAY['Free shift drinks','Flexible schedule'],
       0.12, 'Slight bias toward degree language', 'ai_assisted', 70, 'standard', 35,
       '[{"id":"aq0","type":"textarea","question":"Describe your experience.","required":true}]'::jsonb,
       '[{"id":"q0","type":"multiple_choice","question":"Oil light comes on. First step?","options":["Ignore it","Check the dipstick","Replace the engine","Call a tow truck"],"correct_answer":1,"fit_context":"Looks for a calm, procedural first check.","time_limit_seconds":30}]'::jsonb
     ),
     ($3, $4, 'Internal QA Fixture Role', 'Do not show to real candidates.', 'published', 'JOB-QA0001', true, ARRAY['Should never be readable'],
       null, null, null, null, null, null,
       '[]'::jsonb, '[]'::jsonb
     ),
     ($5, $2, 'Unpublished Draft', 'Not live yet.', 'draft', 'JOB-DRAFT1', false, ARRAY['Should never be readable'],
       null, null, null, null, null, null, '[]'::jsonb, '[]'::jsonb
     ),
     ($6, $2, 'Server', 'Take orders, run food.', 'published', 'JOB-NOBEN1', false, null,
       null, null, null, null, null, null, '[]'::jsonb, '[]'::jsonb
     )`,
    [JOB_REAL, EMP_REAL, JOB_QA, EMP_QA, JOB_DRAFT, JOB_NO_BENEFITS]
  );

  await db.query(
    `insert into public.profiles (user_id, company_name, company_logo, email) values ($1, $2, $3, $4)`,
    [EMP_REAL, "Corner Grocery", "https://example.com/logo.png", "owner@corner-grocery.example"]
  );

  async function asUser(uid, role, sql, params = []) {
    if (uid) await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false);`);
    else await db.exec(`select set_config('request.jwt.claim.sub', '', false);`);
    await db.exec(`set role ${role};`);
    try {
      const result = await db.query(sql, params);
      return { ok: true, rows: result.rows };
    } catch (e) {
      return { ok: false, error: e.message, rows: [] };
    } finally {
      await db.exec(`reset role;`);
    }
  }

  // =====================================================================
  // BEFORE: apply the prior (live) migration and prove benefits is genuinely
  // absent — this fixture models the real hole, not a strawman.
  // =====================================================================
  console.log("\n-- before: the live view (20260915130000) has no benefits column --");
  await db.exec(priorSql);
  {
    const r = await asUser(STRANGER, "authenticated", `select * from public.published_jobs_public where id = '${JOB_REAL}'`);
    check("(sanity) prior view returns the real published job", r.ok && r.rows.length === 1);
    check("(sanity) prior view's row has no 'benefits' key at all", r.ok && !("benefits" in (r.rows[0] || {})), JSON.stringify(Object.keys(r.rows[0] || {})));
  }

  // =====================================================================
  // AFTER: apply the migration under test, verbatim.
  // =====================================================================
  await db.exec(migrationSql);

  console.log("\n-- after: benefits is exposed for a normal published job --");
  {
    const r = await asUser(STRANGER, "authenticated", `select benefits from public.published_jobs_public where id = '${JOB_REAL}'`);
    check("a stranger can read benefits for a real published job", r.ok && r.rows.length === 1);
    check(
      "benefits values are exact (order preserved, nothing coerced/stripped)",
      JSON.stringify(r.rows[0]?.benefits) === JSON.stringify(["Free shift drinks", "Flexible schedule"]),
      JSON.stringify(r.rows[0]?.benefits)
    );
  }
  {
    const r = await asUser(null, "anon", `select benefits from public.published_jobs_public where id = '${JOB_REAL}'`);
    check("signed-out anon can read benefits too", r.ok && r.rows.length === 1 && JSON.stringify(r.rows[0]?.benefits) === JSON.stringify(["Free shift drinks", "Flexible schedule"]));
  }
  {
    const r = await asUser(STRANGER, "authenticated", `select benefits from public.published_jobs_public where id = '${JOB_NO_BENEFITS}'`);
    check("a job with no benefits set returns null, not an error", r.ok && r.rows.length === 1 && r.rows[0]?.benefits === null);
  }
  {
    const r = await asUser(STRANGER, "authenticated", `select id from public.published_jobs_public where id = '${JOB_QA}'`);
    check("an internal QA job's benefits (and everything else) still unreadable by a stranger", r.ok && r.rows.length === 0);
  }
  {
    const r = await asUser(EMP_QA, "authenticated", `select benefits from public.published_jobs_public where id = '${JOB_QA}'`);
    check("the owning employer can still read their own excluded/QA job's benefits", r.ok && r.rows.length === 1 && JSON.stringify(r.rows[0]?.benefits) === JSON.stringify(["Should never be readable"]));
  }
  {
    const r = await asUser(EMP_REAL, "authenticated", `select id from public.published_jobs_public where id = '${JOB_DRAFT}'`);
    check("an unpublished draft's benefits never leak either, even to its own owner", r.ok && r.rows.length === 0);
  }

  console.log("\n-- after: row visibility rules from the prior migration are unchanged --");
  {
    const r = await asUser(STRANGER, "authenticated", `select id from public.published_jobs_public where id = '${JOB_QA}'`);
    check("a total stranger still cannot read the internal QA job", r.ok && r.rows.length === 0);
  }
  {
    const r = await asUser(EMP_REAL, "authenticated", `select id from public.published_jobs_public where id = '${JOB_QA}'`);
    check("a DIFFERENT signed-in employer still cannot see someone else's excluded/QA job", r.ok && r.rows.length === 0);
  }

  console.log("\n-- after: column safety — nothing else about the column set moved --");
  {
    const r = await asUser(STRANGER, "authenticated", `select * from public.published_jobs_public where id = '${JOB_REAL}'`);
    check("select * still succeeds", r.ok && r.rows.length === 1);
    const row = r.rows[0] || {};
    const cols = Object.keys(row).sort();
    const expected = [
      "application_deadline", "application_questions", "benefits", "created_at",
      "department", "description", "employer_id", "exclude_from_feed",
      "experience_level", "id", "is_remote", "job_code", "job_type",
      "latitude", "location", "location_city", "location_country",
      "location_country_code", "location_region", "locations", "longitude",
      "quiz_questions", "require_resume", "requirements", "responsibilities",
      "salary_currency", "salary_max", "salary_min", "salary_period",
      "skills_required", "title", "workflow_steps",
    ].sort();
    check("the column set is exactly the old set plus 'benefits' — nothing else added or removed", cols.join(",") === expected.join(","), cols.join(","));
    for (const col of ["ai_bias_score", "ai_bias_feedback", "processing_mode", "passing_score", "workflow_difficulty", "required_wpm"]) {
      check(`internal column "${col}" is still not exposed`, !(col in row));
    }
  }
  {
    const r = await asUser(STRANGER, "authenticated", `select quiz_questions from public.published_jobs_public where id = '${JOB_REAL}'`);
    const q = (r.rows[0]?.quiz_questions || [])[0] || {};
    check("quiz_questions answer key (correct_answer) is still stripped", !("correct_answer" in q));
    check("quiz_questions rubric (fit_context) is still stripped", !("fit_context" in q));
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
