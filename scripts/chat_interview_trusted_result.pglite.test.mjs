#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20260916150300_enforce_chat_interview_result.sql
 * — plain assertions, real Postgres (via PGlite), loading the REAL migration
 * files in deploy order (no copy, no paraphrase):
 *   20260915110000_quiz_answer_keys_server_side.sql
 *   20260915140000_trusted_step_results.sql   (the shared foundation)
 *   20260916150300_enforce_chat_interview_result.sql   (this phase's own flip)
 *
 * Proves, with 'chatInterviewResult' now enforced = true (this migration's
 * only effect):
 *   - a candidate's direct write of notes.chatInterviewResult is refused
 *   - a candidate's direct write of a legacy by-id entry (any key) whose
 *     `type` is "chat_interview" is refused too — protected_trusted_result_notes_subset
 *     matches by `type`, not just by exact key name
 *   - a service-role write (what ai-chat-interview's new "submit" mode /
 *     recordStepResult actually performs) still succeeds
 *   - every OTHER phase's result_key (typingTestResult, chatSimulationResult,
 *     salesSimulationResult, portfolioResult, videoIntroResult,
 *     voiceInterviewResult) — and 'phase' itself — stays candidate-writable,
 *     completely unaffected by this migration
 *   - the migration is idempotent: applying it twice leaves the same single
 *     enforced = true row, no error
 *
 * Uses the same minimal fixture schema as scripts/trusted_step_results.pglite.test.mjs
 * (kept local to this file rather than imported, so this test stays a
 * self-contained proof of exactly what THIS migration changes).
 *
 * Run with: node scripts/chat_interview_trusted_result.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const QUIZ_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915110000_quiz_answer_keys_server_side.sql");
const FOUNDATION_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915140000_trusted_step_results.sql");
const MY_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260916150300_enforce_chat_interview_result.sql");

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
  const myMigrationSql = await readFile(MY_MIGRATION_PATH, "utf8");

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

  await db.exec(quizMigrationSql);
  await db.exec(foundationMigrationSql);
  await db.exec(myMigrationSql);
  console.log("Loaded quiz + foundation + this phase's own migration OK.\n");

  const employerId = randomUUID();
  const candidateId = randomUUID();

  const jobRow = await db.query(
    `INSERT INTO public.jobs (employer_id, processing_mode) VALUES ($1, 'auto') RETURNING id`,
    [employerId]
  );
  const jobId = jobRow.rows[0].id;

  async function actAs(uid, role) {
    await db.query(`SELECT set_config('test.uid', $1, false), set_config('test.role', $2, false)`, [
      uid ?? "",
      role ?? "",
    ]);
  }

  async function newApplication(status = "pending") {
    const r = await db.query(
      `INSERT INTO public.applications (job_id, candidate_id, status) VALUES ($1, $2, $3) RETURNING id`,
      [jobId, candidateId, status]
    );
    return r.rows[0].id;
  }

  async function updateAsCandidate(appId, notesObj) {
    await actAs(candidateId, "authenticated");
    return db.query(`UPDATE public.applications SET notes = $2 WHERE id = $1`, [appId, JSON.stringify(notesObj)]);
  }

  async function updateAsService(appId, notesObj) {
    await actAs(null, "service_role");
    return db.query(`UPDATE public.applications SET notes = $2 WHERE id = $1`, [appId, JSON.stringify(notesObj)]);
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
  await guardedSection("0. seed + flag state", async () => {
    console.log("== 0. Only chatInterviewResult is enforced; every other row stays false ==");
    const rows = await db.query(
      `SELECT result_key, enforced FROM public.trusted_result_enforcement ORDER BY result_key`
    );
    const enforcedKeys = rows.rows.filter((r) => r.enforced).map((r) => r.result_key);
    ok(
      JSON.stringify(enforcedKeys) === JSON.stringify(["chatInterviewResult"]),
      `exactly and only chatInterviewResult is enforced (got: ${JSON.stringify(enforcedKeys)})`
    );
  });

  // ==========================================================================
  await guardedSection("1. candidate cannot write notes.chatInterviewResult directly", async () => {
    console.log("\n== 1. Candidate direct write of notes.chatInterviewResult is refused ==");
    const appId = await newApplication();
    await expectFail(
      () => updateAsCandidate(appId, { chatInterviewResult: { score: 100, recommendation: "Strong Hire" } }),
      "candidate cannot forge notes.chatInterviewResult once enforced",
      "trusted step result"
    );

    // Any casing of the key name is caught too (trusted_result_key_for uses lower()).
    await expectFail(
      () => updateAsCandidate(appId, { ChatInterviewResult: { score: 100 } }),
      "candidate cannot forge notes.ChatInterviewResult (different casing) either"
    );
  });

  // ==========================================================================
  await guardedSection("2. candidate cannot forge a legacy by-id entry typed chat_interview", async () => {
    console.log("\n== 2. A by-id entry with type:'chat_interview' under ANY key is refused too ==");
    const appId = await newApplication();
    // Mirrors the OLD handleSubmit write (`notes[stepId] = { type: "chat_interview", ... }`)
    // that this conversion deliberately stopped writing — even if a candidate
    // tries to hand-forge it back under an arbitrary step id, the trigger
    // matches by `type`, not by key name, so it's refused all the same.
    await expectFail(
      () => updateAsCandidate(appId, { "wf-final-interview": { type: "chat_interview", phaseScore: 100 } }),
      "candidate cannot forge a type:'chat_interview' entry under any key once enforced"
    );
  });

  // ==========================================================================
  await guardedSection("3. service role can still write it", async () => {
    console.log("\n== 3. service_role (recordStepResult) can still write notes.chatInterviewResult ==");
    const appId = await newApplication();
    await expectOk(
      () => updateAsService(appId, { chatInterviewResult: { score: 91, recommendation: "Hire" } }),
      "service_role write succeeds with the flag enforced"
    );
  });

  // ==========================================================================
  await guardedSection("4. every other result_key is unaffected", async () => {
    console.log("\n== 4. Every OTHER phase's own key stays fully candidate-writable ==");
    const otherKeys = [
      "typingTestResult",
      "chatSimulationResult",
      "salesSimulationResult",
      "portfolioResult",
      "videoIntroResult",
      "voiceInterviewResult",
    ];
    for (const key of otherKeys) {
      const appId = await newApplication();
      await expectOk(
        () => updateAsCandidate(appId, { [key]: { score: 77 } }),
        `candidate can still freely write notes.${key} (its own flag is still off)`
      );
    }

    // video_intro's flat legacy key stays untouched by this migration too.
    {
      const appId = await newApplication();
      await expectOk(
        () => updateAsCandidate(appId, { videoIntroUrl: "https://example.com/video.webm" }),
        "candidate can still freely write notes.videoIntroUrl (unrelated to chatInterviewResult)"
      );
    }

    // `phase` itself is untouched — still globally unenforced until every
    // phase (including this one) is converted and the LAST migration flips it.
    {
      const appId = await newApplication();
      await actAs(candidateId, "authenticated");
      await expectOk(
        () => db.query(`UPDATE public.applications SET phase = 'next-step' WHERE id = $1`, [appId]),
        "candidate can still freely change applications.phase directly ('phase' flag is still off)"
      );
    }
  });

  // ==========================================================================
  await guardedSection("5. notes._trusted stays blocked, as always", async () => {
    console.log("\n== 5. notes._trusted remains unconditionally blocked (unchanged by this migration) ==");
    const appId = await newApplication();
    await expectFail(
      () =>
        updateAsCandidate(appId, {
          _trusted: { "wf-final-interview": { stepType: "chat_interview", completedAt: "2026-01-01T00:00:00Z" } },
        }),
      "candidate still cannot write notes._trusted"
    );
  });

  // ==========================================================================
  await guardedSection("6. this migration is idempotent", async () => {
    console.log("\n== 6. Re-applying this migration is a no-op, no error ==");
    await expectOk(() => db.exec(myMigrationSql), "running the migration a second time does not throw");
    const rows = await db.query(
      `SELECT result_key, enforced FROM public.trusted_result_enforcement WHERE result_key = 'chatInterviewResult'`
    );
    ok(
      rows.rows.length === 1 && rows.rows[0].enforced === true,
      "still exactly one chatInterviewResult row, still enforced = true"
    );
  });

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal error running PGlite proof:", e);
  process.exit(1);
});
