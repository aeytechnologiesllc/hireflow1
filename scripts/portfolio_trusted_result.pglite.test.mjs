#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20260916150500_enforce_portfolio_result.sql
 * — the portfolio_upload part-B conversion's own migration. Real Postgres
 * (via PGlite), the real migration files (foundation + this one), no copy,
 * no paraphrase.
 *
 * Loads, in deploy order: 20260915110000_quiz_answer_keys_server_side.sql
 * (needed so protected_application_notes_subset and the baseline
 * protect_application_columns() exist), 20260915140000_trusted_step_results.sql
 * (the foundation — trusted_result_enforcement, seeded all-false), then
 * 20260916150500_enforce_portfolio_result.sql (this phase's own flip) — same
 * fixture schema scripts/trusted_step_results.pglite.test.mjs already uses.
 *
 * Proves, with THIS migration applied:
 *   - trusted_result_enforcement's portfolioResult row is enforced = true;
 *     every OTHER row (including 'phase') is still enforced = false
 *   - a candidate's own direct write of notes.portfolioResult is refused
 *   - a candidate's own direct write of notes[stepId] shaped
 *     { type: "portfolio_upload", ... } (the legacy by-id entry) is refused
 *   - a candidate's own direct write of an UNRELATED, still-unenforced
 *     result key (typingTestResult) is still freely writable — this
 *     migration protects ONLY portfolioResult, nothing else
 *   - applications.phase is still candidate-writable (the 'phase' flag is
 *     flipped only once every phase's own conversion has landed)
 *   - service_role, the job owner, and an active team member can all still
 *     write notes.portfolioResult freely regardless
 *   - re-running this migration is a no-op (idempotent)
 *
 * Run with: node scripts/portfolio_trusted_result.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const QUIZ_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915110000_quiz_answer_keys_server_side.sql");
const FOUNDATION_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915140000_trusted_step_results.sql");
const PORTFOLIO_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260916150500_enforce_portfolio_result.sql");

let pass = 0;
let fail = 0;
const failures = [];

function ok(cond, label) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(label);
    console.log(`  FAIL: ${label}`);
  }
}

async function guardedSection(label, fn) {
  try {
    await fn();
  } catch (e) {
    fail++;
    const msg = `section crashed: ${label} — ${e.message}`;
    failures.push(msg);
    console.log(`  FAIL: ${msg}`);
  }
}

async function main() {
  const db = new PGlite();
  const quizMigrationSql = await readFile(QUIZ_MIGRATION_PATH, "utf8");
  const foundationMigrationSql = await readFile(FOUNDATION_MIGRATION_PATH, "utf8");
  const portfolioMigrationSql = await readFile(PORTFOLIO_MIGRATION_PATH, "utf8");

  // --------------------------------------------------------------------
  // Minimal schema stand-in for the live tables/helpers these migrations
  // depend on — same fixture as scripts/trusted_step_results.pglite.test.mjs.
  // --------------------------------------------------------------------
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('test.uid', true), '')::uuid
      $$;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text
      LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('test.role', true), '')
      $$;

    CREATE ROLE authenticated;
    CREATE ROLE anon;
    CREATE ROLE service_role;

    CREATE TYPE application_status AS ENUM (
      'pending', 'reviewing', 'interview', 'offered', 'hired', 'rejected', 'in_progress'
    );

    CREATE TABLE public.jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      employer_id uuid NOT NULL,
      quiz_questions jsonb,
      workflow_steps jsonb,
      passing_score int DEFAULT 60,
      processing_mode text DEFAULT 'manual'
    );

    CREATE TABLE public.team_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      employer_id uuid NOT NULL,
      user_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'active',
      can_manage_pipeline boolean NOT NULL DEFAULT false,
      can_create_jobs boolean NOT NULL DEFAULT false,
      can_delete_jobs boolean NOT NULL DEFAULT false,
      assigned_job_ids uuid[]
    );

    CREATE TABLE public.applications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id uuid NOT NULL,
      candidate_id uuid NOT NULL,
      status application_status NOT NULL DEFAULT 'in_progress',
      cover_letter text,
      resume_url text,
      ai_analysis text,
      ai_score numeric,
      ai_scorecard jsonb,
      notes text,
      phase text,
      phase_ai_analysis text,
      rejected_by uuid,
      rejected_by_type text,
      resume_score numeric,
      voice_interview_result jsonb,
      voice_interview_transcript jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    -- Copied verbatim from supabase/migrations/20260715014000_break_jobs_applications_rls_recursion.sql
    CREATE OR REPLACE FUNCTION public.is_job_owner(p_job_id uuid, p_user_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
      SELECT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = p_job_id AND j.employer_id = p_user_id);
    $$;

    CREATE OR REPLACE FUNCTION public.is_active_team_member_for_job(
      p_job_id uuid, p_user_id uuid,
      p_require_manage_pipeline boolean DEFAULT false,
      p_require_create_jobs boolean DEFAULT false,
      p_require_delete_jobs boolean DEFAULT false
    )
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.jobs j
        JOIN public.team_members tm ON tm.employer_id = j.employer_id
        WHERE j.id = p_job_id AND tm.user_id = p_user_id AND tm.status = 'active'
          AND (NOT p_require_manage_pipeline OR tm.can_manage_pipeline = true)
          AND (NOT p_require_create_jobs OR tm.can_create_jobs = true)
          AND (NOT p_require_delete_jobs OR tm.can_delete_jobs = true)
          AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY (tm.assigned_job_ids))
      );
    $$;
  `);

  // --------------------------------------------------------------------
  // The three real migration files under test, unmodified, in deploy order.
  // --------------------------------------------------------------------
  await db.exec(quizMigrationSql);
  await db.exec(foundationMigrationSql);
  await db.exec(portfolioMigrationSql);
  console.log("Loaded quiz + foundation + portfolio migrations OK.\n");

  const employerId = randomUUID();
  const teamMemberId = randomUUID();
  const candidateId = randomUUID();

  const jobRow = await db.query(
    `INSERT INTO public.jobs (employer_id, processing_mode) VALUES ($1, 'auto') RETURNING id`,
    [employerId]
  );
  const jobId = jobRow.rows[0].id;

  await db.query(
    `INSERT INTO public.team_members (employer_id, user_id, status, can_manage_pipeline)
     VALUES ($1, $2, 'active', true)`,
    [employerId, teamMemberId]
  );

  async function actAs(uid, role) {
    await db.query(`SELECT set_config('test.uid', $1, false), set_config('test.role', $2, false)`, [
      uid ?? "",
      role ?? "",
    ]);
  }

  async function newApplication(status = "in_progress", extra = {}) {
    const cols = ["job_id", "candidate_id", "status", ...Object.keys(extra)];
    const vals = [jobId, candidateId, status, ...Object.values(extra)];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const r = await db.query(
      `INSERT INTO public.applications (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
      vals
    );
    return r.rows[0].id;
  }

  async function updateAsCandidate(appId, setSql, params) {
    await actAs(candidateId, "authenticated");
    return db.query(`UPDATE public.applications SET ${setSql} WHERE id = $1`, [appId, ...params]);
  }

  async function updateAsEmployer(appId, setSql, params) {
    await actAs(employerId, "authenticated");
    return db.query(`UPDATE public.applications SET ${setSql} WHERE id = $1`, [appId, ...params]);
  }

  async function updateAsTeamMember(appId, setSql, params) {
    await actAs(teamMemberId, "authenticated");
    return db.query(`UPDATE public.applications SET ${setSql} WHERE id = $1`, [appId, ...params]);
  }

  async function updateAsService(appId, setSql, params) {
    await actAs(null, "service_role");
    return db.query(`UPDATE public.applications SET ${setSql} WHERE id = $1`, [appId, ...params]);
  }

  async function expectOk(fn, label) {
    try {
      await fn();
      ok(true, label);
    } catch (e) {
      ok(false, `${label} — threw: ${e.message}`);
    }
  }

  async function expectFail(fn, label, msgSubstring) {
    try {
      await fn();
      ok(false, `${label} — did not throw`);
    } catch (e) {
      const matched = msgSubstring ? e.message.includes(msgSubstring) : true;
      ok(matched, `${label}${matched ? "" : ` — wrong error: ${e.message}`}`);
    }
  }

  // ==========================================================================
  await guardedSection("0. flags after this migration", async () => {
    console.log("== 0. portfolioResult is enforced; every other row (including 'phase') is not ==");
    const rows = await db.query(
      `SELECT result_key, enforced FROM public.trusted_result_enforcement ORDER BY result_key`
    );
    ok(rows.rows.length === 8, `still exactly 8 rows (got ${rows.rows.length})`);
    const byKey = Object.fromEntries(rows.rows.map((r) => [r.result_key, r.enforced]));
    ok(byKey.portfolioResult === true, "portfolioResult is enforced = true");
    for (const key of [
      "typingTestResult",
      "chatSimulationResult",
      "chatInterviewResult",
      "salesSimulationResult",
      "videoIntroResult",
      "voiceInterviewResult",
      "phase",
    ]) {
      ok(byKey[key] === false, `${key} is still enforced = false`);
    }
  });

  // ==========================================================================
  await guardedSection("1. candidate cannot forge portfolioResult directly", async () => {
    console.log("\n== 1. candidate's own direct write of notes.portfolioResult is refused ==");
    const appId = await newApplication("pending");
    await expectFail(
      () =>
        updateAsCandidate(appId, "notes = $2", [
          JSON.stringify({
            portfolioResult: {
              type: "portfolio_upload",
              files: [{ url: "forged/path.png", name: "forged.png", type: "image/png" }],
              completed: true,
              aiAnalysis: { score: 100, summary: "forged" },
              phaseScore: 100,
            },
          }),
        ]),
      "candidate cannot write notes.portfolioResult directly",
      "trusted step result"
    );
  });

  // ==========================================================================
  await guardedSection("2. candidate cannot forge the legacy by-id entry either", async () => {
    console.log("\n== 2. candidate's own direct write of notes[stepId] (type: portfolio_upload) is refused ==");
    const appId = await newApplication("pending");
    await expectFail(
      () =>
        updateAsCandidate(appId, "notes = $2", [
          JSON.stringify({
            "step-portfolio-1": { type: "portfolio_upload", completed: true, files: [] },
          }),
        ]),
      "candidate cannot write a stepId-keyed type:'portfolio_upload' entry directly",
      "trusted step result"
    );
  });

  // ==========================================================================
  await guardedSection("3. sibling still-unenforced keys stay untouched", async () => {
    console.log("\n== 3. an UNRELATED, still-unenforced result key stays freely candidate-writable ==");
    const appId = await newApplication("pending");
    await expectOk(
      () =>
        updateAsCandidate(appId, "notes = $2", [JSON.stringify({ typingTestResult: { wpm: 120 } })]),
      "candidate can still freely write notes.typingTestResult (not this migration's key)"
    );
  });

  // ==========================================================================
  await guardedSection("4. phase is not yet guarded", async () => {
    console.log("\n== 4. applications.phase is still candidate-writable (the global 'phase' flag is untouched) ==");
    const appId = await newApplication("pending", { phase: "portfolio_upload_step" });
    await expectOk(
      () => updateAsCandidate(appId, "phase = $2", ["decision"]),
      "candidate can still change phase (this migration never touches result_key = 'phase')"
    );
  });

  // ==========================================================================
  await guardedSection("5. unrestricted roles stay unrestricted", async () => {
    console.log("\n== 5. service_role / job owner / team member can all still write notes.portfolioResult ==");
    const goodResult = JSON.stringify({
      portfolioResult: {
        type: "portfolio_upload",
        files: [{ url: `${candidateId}/app-step-123-0.png`, name: "a.png", type: "image/png" }],
        completed: true,
        aiAnalysis: { score: 82, summary: "solid work" },
        phaseScore: 82,
      },
    });

    const appService = await newApplication("pending");
    await expectOk(
      () => updateAsService(appService, "notes = $2", [goodResult]),
      "service_role can write notes.portfolioResult"
    );

    const appEmployer = await newApplication("pending");
    await expectOk(
      () => updateAsEmployer(appEmployer, "notes = $2", [goodResult]),
      "the job owner (employer) can write notes.portfolioResult"
    );

    const appTeam = await newApplication("pending");
    await expectOk(
      () => updateAsTeamMember(appTeam, "notes = $2", [goodResult]),
      "an active assigned team member can write notes.portfolioResult"
    );
  });

  // ==========================================================================
  await guardedSection("6. idempotent re-run", async () => {
    console.log("\n== 6. re-running this migration is a no-op ==");
    await db.exec(portfolioMigrationSql);
    const rows = await db.query(
      `SELECT result_key, enforced FROM public.trusted_result_enforcement ORDER BY result_key`
    );
    ok(rows.rows.length === 8, "still exactly 8 rows after re-running the migration");
    const byKey = Object.fromEntries(rows.rows.map((r) => [r.result_key, r.enforced]));
    ok(byKey.portfolioResult === true, "portfolioResult is still enforced = true after re-run");
    ok(byKey.phase === false, "'phase' is still enforced = false after re-run");
  });

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("Fatal error running PGlite proof:", e);
  process.exitCode = 1;
});
