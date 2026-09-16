#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20260916150400_enforce_sales_simulation_result.sql
 * — the part-B migration that flips 'salesSimulationResult' to
 * enforced = true, on top of the REAL foundation migrations (unmodified,
 * not a copy), same fixture schema
 * scripts/trusted_step_results.pglite.test.mjs already uses.
 *
 * Proves, with the real migration chain loaded and the flag already flipped
 * (exactly the state this migration leaves the live DB in):
 *   - the migration is idempotent: applying it twice leaves exactly one
 *     'salesSimulationResult' row, enforced = true
 *   - a candidate's direct write of notes.salesSimulationResult is refused
 *     (any casing), and they cannot remove it either
 *   - a candidate cannot forge a "legacy by-id" entry either — an arbitrary
 *     notes key holding an object with type: "sales_simulation" is refused
 *     too, via the shared trigger's type-matching (trusted_result_key_for),
 *     even though recordStepResult itself never writes a legacyStepEntry
 *     for this key (see docs/TRUSTED-RESULTS.md's result_key table)
 *   - notes._trusted[stepId] for this stepType cannot be erased once
 *     written (the server-only completion marker)
 *   - service-role writes (what submit-sales-simulation/index.ts's
 *     recordStepResult call actually performs) succeed unconditionally
 *   - the employer and an active team member stay unrestricted
 *   - every OTHER phase's own result_key (still unenforced) is completely
 *     unaffected — this migration touches only its own row
 *
 * Run with: node scripts/sales_simulation_trusted_result.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const QUIZ_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915110000_quiz_answer_keys_server_side.sql");
const FOUNDATION_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915140000_trusted_step_results.sql");
const ENFORCE_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260916150400_enforce_sales_simulation_result.sql");

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
  const enforceMigrationSql = await readFile(ENFORCE_MIGRATION_PATH, "utf8");

  // Same minimal fixture schema as scripts/trusted_step_results.pglite.test.mjs
  // (the tables/helpers the foundation migration depends on).
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

  // The three real migration files, unmodified, in deploy order.
  await db.exec(quizMigrationSql);
  await db.exec(foundationMigrationSql);
  await db.exec(enforceMigrationSql);
  console.log("Loaded all three real migration files OK.\n");

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
  console.log("== 0. Migration state: salesSimulationResult is enforced, exactly once ==");
  await guardedSection("0. flag state", async () => {
    const rows = await db.query(
      `SELECT enforced FROM public.trusted_result_enforcement WHERE result_key = 'salesSimulationResult'`
    );
    ok(rows.rows.length === 1, "exactly one salesSimulationResult row");
    ok(rows.rows[0]?.enforced === true, "salesSimulationResult is enforced = true after this migration");

    // Idempotency: re-running the migration must not error and must leave
    // the same single enforced row.
    await db.exec(enforceMigrationSql);
    const rowsAgain = await db.query(
      `SELECT enforced FROM public.trusted_result_enforcement WHERE result_key = 'salesSimulationResult'`
    );
    ok(rowsAgain.rows.length === 1, "still exactly one row after re-applying the migration (idempotent)");
    ok(rowsAgain.rows[0]?.enforced === true, "still enforced = true after re-applying the migration");
  });

  // ==========================================================================
  console.log("\n== 1. Candidate direct write of notes.salesSimulationResult is refused ==");
  await guardedSection("1. direct write refused", async () => {
    const appId = await newApplication("pending", {
      notes: JSON.stringify({
        salesSimulationResult: { score: 82, wouldBuy: "yes", discovery: 80, objectionHandling: 75 },
      }),
    });

    await expectFail(
      () =>
        updateAsCandidate(appId, "notes = $2", [
          JSON.stringify({ salesSimulationResult: { score: 100, wouldBuy: "yes" } }),
        ]),
      "candidate cannot rewrite notes.salesSimulationResult to forge a higher score"
    );
    await expectFail(
      () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({})]),
      "candidate cannot remove notes.salesSimulationResult either"
    );
    await expectFail(
      () =>
        updateAsCandidate(appId, "notes = $2", [
          JSON.stringify({ SalesSimulationResult: { score: 100 } }),
        ]),
      "candidate cannot forge it under a different casing (SalesSimulationResult) either"
    );
  });

  // ==========================================================================
  console.log("\n== 2. A forged 'legacy by-id' entry (type: 'sales_simulation' under any key) is refused too ==");
  await guardedSection("2. by-id/type-matched entry refused", async () => {
    // recordStepResult never writes a legacyStepEntry for salesSimulationResult
    // (see docs/TRUSTED-RESULTS.md's result_key table — no notes[stepId]
    // write), but the shared trigger still protects ANY key holding an
    // object whose own `type` is 'sales_simulation', by design — so a
    // candidate can't route around the guard by writing the step's raw
    // by-id entry instead of the named result key.
    const appId = await newApplication("pending", {
      notes: JSON.stringify({ "step-sales-1": { type: "sales_simulation", score: 60 } }),
    });
    await expectFail(
      () =>
        updateAsCandidate(appId, "notes = $2", [
          JSON.stringify({ "step-sales-1": { type: "sales_simulation", score: 100 } }),
        ]),
      "candidate cannot forge a type:'sales_simulation' entry under an arbitrary step-id key"
    );
  });

  // ==========================================================================
  console.log("\n== 3. notes._trusted[stepId] for sales_simulation cannot be erased ==");
  await guardedSection("3. _trusted marker", async () => {
    const appId = await newApplication("pending", {
      notes: JSON.stringify({
        salesSimulationResult: { score: 82 },
        _trusted: { "step-sales-1": { stepType: "sales_simulation", completedAt: "2026-09-16T00:00:00Z" } },
      }),
    });
    await expectFail(
      () =>
        updateAsCandidate(appId, "notes = $2", [
          JSON.stringify({ salesSimulationResult: { score: 82 }, _trusted: {} }),
        ]),
      "candidate cannot erase the server-only _trusted marker for this step",
      "Candidates cannot edit a trusted step result directly"
    );
  });

  // ==========================================================================
  console.log("\n== 4. service_role, employer and active team member stay unrestricted ==");
  await guardedSection("4. privileged roles", async () => {
    const appId = await newApplication("pending", {
      notes: JSON.stringify({ salesSimulationResult: { score: 82 } }),
    });

    await expectOk(
      () =>
        updateAsService(appId, "notes = $2", [
          JSON.stringify({ salesSimulationResult: { score: 91, wouldBuy: "yes", recordedBy: "service" } }),
        ]),
      "service_role (what submit-sales-simulation's recordStepResult call performs) can write it"
    );
    await expectOk(
      () =>
        updateAsEmployer(appId, "notes = $2", [
          JSON.stringify({ salesSimulationResult: { score: 91, employerOverride: true } }),
        ]),
      "employer stays unrestricted"
    );
    await expectOk(
      () =>
        updateAsTeamMember(appId, "notes = $2", [
          JSON.stringify({ salesSimulationResult: { score: 91, teamOverride: true } }),
        ]),
      "active team member stays unrestricted"
    );
  });

  // ==========================================================================
  console.log("\n== 5. Every OTHER phase's own result_key is completely unaffected ==");
  await guardedSection("5. other keys unaffected", async () => {
    const otherKeys = {
      typingTestResult: "typing_test",
      chatSimulationResult: "chat_simulation",
      chatInterviewResult: "chat_interview",
      portfolioResult: "portfolio_upload",
      videoIntroResult: "video_intro",
      voiceInterviewResult: "voice_interview",
    };

    for (const [notesKey] of Object.entries(otherKeys)) {
      const appId = await newApplication("pending", {
        notes: JSON.stringify({ [notesKey]: { score: 55 } }),
      });
      await expectOk(
        () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({ [notesKey]: { score: 999 } })]),
        `still-unenforced key: candidate can freely change notes.${notesKey}`
      );
    }

    // phase itself is untouched by this migration (a separate, global flag).
    const phaseApp = await newApplication("pending", { phase: "sales-sim-step" });
    await expectOk(
      () => updateAsCandidate(phaseApp, "phase = $2", ["voice-interview-step"]),
      "phase (a separate, still-unenforced flag) stays candidate-writable"
    );

    // A different application's own salesSimulationResult (different row) is
    // still, correctly, independently refused — enforcement isn't somehow
    // scoped to only the application touched earlier in this run.
    const anotherSalesApp = await newApplication("pending", {
      notes: JSON.stringify({ salesSimulationResult: { score: 40 } }),
    });
    await expectFail(
      () =>
        updateAsCandidate(anotherSalesApp, "notes = $2", [
          JSON.stringify({ salesSimulationResult: { score: 100 } }),
        ]),
      "a second, unrelated application's own salesSimulationResult is refused too"
    );
  });

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
