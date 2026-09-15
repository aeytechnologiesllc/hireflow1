#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20260915130000_public_views_tighten.sql
 * — plain assertions against a real Postgres (via PGlite), not a text match.
 *
 * Builds a minimal but faithful fixture of public.jobs (the columns this
 * migration's view selects, plus the ones it must NOT select — ai_bias_score,
 * ai_bias_feedback, processing_mode, passing_score, workflow_difficulty,
 * required_wpm, and raw quiz_questions/application_questions with their real
 * answer-key/rubric fields), seeds it with the exact shape confirmed live on
 * 2026-09-15 (a real published job with exclude_from_feed = false, and an
 * internal QA job with exclude_from_feed = true — both owned by different
 * employers), proves the OLD view (status='published' only, no
 * exclude_from_feed condition) actually leaks the QA job to a stranger (so
 * this fixture is known to model the real hole, not a strawman), then
 * applies supabase/migrations/20260915130000_public_views_tighten.sql
 * VERBATIM (read from disk, not retyped) and re-checks every viewer shape
 * used in src/pages/JobDetails.tsx, src/pages/ApplyWithCode.tsx,
 * api/job-feed.mjs and api/job-prerender.mjs (all unauthenticated/anon),
 * plus the owning employer's authenticated path (commit cb2b547).
 *
 * `anon`/`authenticated` are real, separate Postgres roles (not the table
 * owner, and never granted BYPASSRLS), and public.jobs has row_security
 * enabled with the same SELECT policies as the live project (no policy
 * admits anon at all) — so a passing "OLD view still hides jobs.* internal
 * columns from anon" check here would be meaningless if anon could bypass
 * RLS outright; it can't, which is exactly why published_jobs_public has to
 * stay a security-definer-style view (no security_invoker) rather than
 * switching to security_invoker.
 *
 * Run with: node scripts/public_jobs_view_row_filter.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915130000_public_views_tighten.sql");

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

const EMP_REAL = "10000000-0000-0000-0000-00000000000a"; // a real customer employer
const EMP_QA = "10000000-0000-0000-0000-00000000000b"; // employer.test@hireflow.dev-shaped internal account
const STRANGER = "40000000-0000-0000-0000-000000000001";

const JOB_REAL = "50000000-0000-0000-0000-00000000000a"; // real, published, exclude_from_feed = false
const JOB_QA = "50000000-0000-0000-0000-00000000000b"; // internal QA, published, exclude_from_feed = true
const JOB_DRAFT = "50000000-0000-0000-0000-00000000000c"; // real employer's own draft — never public

async function main() {
  const db = new PGlite();
  const migrationSql = await readFile(MIGRATION_PATH, "utf8").catch(() => null);
  check("migration file exists on disk", migrationSql != null, MIGRATION_PATH);
  if (!migrationSql) {
    console.log(`\n${failed} of ${passed + failed} checks failed.`);
    process.exit(1);
  }

  await db.exec(`
    -- ---- auth shims (mirror Supabase's auth.uid()) ----
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

    -- ---- minimal jobs schema: real columns the view selects, PLUS the
    -- internal columns it must never select, PLUS quiz/application question
    -- shapes carrying their real answer-key / rubric fields ----
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
      -- internal-only columns no public consumer reads — must never surface
      -- through published_jobs_public
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

    -- Same shape as the live project's jobs policies: no policy admits anon
    -- at all, so the RAW table is unreachable by anon regardless of this
    -- migration — only the SECURITY DEFINER view can serve it.
    create policy "Employers can view their own jobs"
    on public.jobs for select
    using (auth.uid() = employer_id);

    -- public.profiles must exist before the migration runs: it also
    -- (re)creates public.employer_public_branding, which selects from it.
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
       id, employer_id, title, description, status, job_code, exclude_from_feed,
       ai_bias_score, ai_bias_feedback, processing_mode, passing_score,
       workflow_difficulty, required_wpm,
       application_questions, quiz_questions
     ) values
     ($1, $2, 'Grocery Stocker', 'Stock shelves and help customers.', 'published', 'JOB-REAL01', false,
       0.12, 'Slight bias toward degree language', 'ai_assisted', 70, 'standard', 35,
       '[{"id":"aq0","type":"textarea","question":"Describe your experience.","required":true}]'::jsonb,
       '[{"id":"q0","type":"multiple_choice","question":"Oil light comes on. First step?","options":["Ignore it","Check the dipstick","Replace the engine","Call a tow truck"],"correct_answer":1,"fit_context":"Looks for a calm, procedural first check.","time_limit_seconds":30}]'::jsonb
     ),
     ($3, $4, 'Internal QA Fixture Role', 'Do not show to real candidates.', 'published', 'JOB-QA0001', true,
       null, null, null, null, null, null,
       '[]'::jsonb, '[]'::jsonb
     ),
     ($5, $2, 'Unpublished Draft', 'Not live yet.', 'draft', 'JOB-DRAFT1', false,
       null, null, null, null, null, null, '[]'::jsonb, '[]'::jsonb
     )`,
    [JOB_REAL, EMP_REAL, JOB_QA, EMP_QA, JOB_DRAFT]
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
  // Sanity: prove the OLD view (status='published' only) actually leaks the
  // internal QA job to a total stranger, so the fixture models a real hole.
  // =====================================================================
  console.log("\n-- sanity: OLD view (no exclude_from_feed condition) --");

  await db.exec(`
    create view public.published_jobs_public_old as
    select id, employer_id, title, description, job_code, exclude_from_feed
    from public.jobs
    where status = 'published';
    grant select on public.published_jobs_public_old to anon, authenticated;
  `);

  {
    const r = await asUser(
      STRANGER,
      "authenticated",
      `select id from public.published_jobs_public_old where id = '${JOB_QA}'`
    );
    check(
      "(sanity) OLD view: a total stranger can read the internal QA job",
      r.ok && r.rows.length === 1
    );
  }

  // =====================================================================
  // Apply the migration under test, verbatim.
  // =====================================================================
  await db.exec(migrationSql.replace(/\bauth\.uid\(\)/g, "auth.uid()"));

  // =====================================================================
  // Row visibility
  // =====================================================================
  console.log("\n-- row visibility --");

  {
    const r = await asUser(STRANGER, "authenticated", `select id from public.published_jobs_public where id = '${JOB_REAL}'`);
    check("a real employer's published job still loads for a stranger", r.ok && r.rows.length === 1);
  }
  {
    const r = await asUser(null, "anon", `select id from public.published_jobs_public where id = '${JOB_REAL}'`);
    check("a real employer's published job still loads for signed-out anon", r.ok && r.rows.length === 1);
  }
  {
    const r = await asUser(STRANGER, "authenticated", `select id from public.published_jobs_public where id = '${JOB_QA}'`);
    check("fixed: a total stranger can no longer read the internal QA job", r.ok && r.rows.length === 0);
  }
  {
    const r = await asUser(null, "anon", `select id from public.published_jobs_public where id = '${JOB_QA}'`);
    check("fixed: signed-out anon can no longer read the internal QA job", r.ok && r.rows.length === 0);
  }
  {
    const r = await asUser(EMP_QA, "authenticated", `select id from public.published_jobs_public where id = '${JOB_QA}'`);
    check(
      "the owning employer can still see their own excluded/QA job while signed in (cb2b547's own-posting preview)",
      r.ok && r.rows.length === 1
    );
  }
  {
    const r = await asUser(EMP_REAL, "authenticated", `select id from public.published_jobs_public where id = '${JOB_QA}'`);
    check("a DIFFERENT signed-in employer still cannot see someone else's excluded/QA job", r.ok && r.rows.length === 0);
  }
  {
    const r = await asUser(EMP_REAL, "authenticated", `select id from public.published_jobs_public where id = '${JOB_DRAFT}'`);
    check("an unpublished draft never appears via this view either, even to its own owner", r.ok && r.rows.length === 0);
  }

  // =====================================================================
  // Column safety
  // =====================================================================
  console.log("\n-- column safety --");

  {
    const r = await asUser(STRANGER, "authenticated", `select * from public.published_jobs_public where id = '${JOB_REAL}'`);
    check("select * from the view succeeds (real consumers use select *)", r.ok && r.rows.length === 1);
    const row = r.rows[0] || {};
    for (const col of ["ai_bias_score", "ai_bias_feedback", "processing_mode", "passing_score", "workflow_difficulty", "required_wpm"]) {
      check(`internal column "${col}" is not exposed`, !(col in row), JSON.stringify(Object.keys(row)));
    }
  }
  {
    const r = await asUser(
      STRANGER,
      "authenticated",
      `select quiz_questions from public.published_jobs_public where id = '${JOB_REAL}'`
    );
    check("quiz_questions is readable", r.ok && r.rows.length === 1);
    const q = (r.rows[0]?.quiz_questions || [])[0] || {};
    check("quiz question keeps its question text", q.question === "Oil light comes on. First step?");
    check("quiz question keeps its options (needed by ApplyWithCode's time/materials estimate)", Array.isArray(q.options) && q.options.length === 4);
    check("quiz question's correct_answer (the answer key) is stripped", !("correct_answer" in q), JSON.stringify(q));
    check("quiz question's fit_context (the grading rubric) is stripped", !("fit_context" in q), JSON.stringify(q));
  }

  // =====================================================================
  // employer_public_branding: unchanged, still column-minimal
  // =====================================================================
  console.log("\n-- employer_public_branding --");
  await db.query(
    `insert into public.profiles (user_id, company_name, company_logo, email) values ($1, $2, $3, $4)`,
    [EMP_REAL, "Corner Grocery", "https://example.com/logo.png", "owner@corner-grocery.example"]
  );
  check("employer_public_branding view definition found in the migration", /create or replace view public\.employer_public_branding as/i.test(migrationSql));
  {
    const r = await asUser(STRANGER, "authenticated", `select * from public.employer_public_branding where user_id = '${EMP_REAL}'`);
    check("a stranger can read the branding row", r.ok && r.rows.length === 1);
    const row = r.rows[0] || {};
    check("only user_id/company_name/company_logo are exposed", Object.keys(row).sort().join(",") === "company_logo,company_name,user_id");
    check("email is never exposed", !("email" in row));
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
