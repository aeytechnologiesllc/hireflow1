#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20260916150700_enforce_voice_interview_result.sql
 * — real Postgres (via PGlite), not a text match. Loads the REAL migration
 * files in deploy order: 20260915110000_quiz_answer_keys_server_side.sql
 * (defines submit_voice_interview_manual_end and the baseline
 * protect_application_columns), 20260915140000_trusted_step_results.sql
 * (the foundation — trusted_result_enforcement, protect_application_columns
 * extended, seeded enforced = false), then THIS phase's own migration —
 * on top of the same minimal fixture schema
 * scripts/trusted_step_results.pglite.test.mjs already uses.
 *
 * scripts/trusted_step_results.pglite.test.mjs already proves the FOUNDATION
 * trigger's generic voiceInterviewResult-flag behavior (any casing, by key
 * name or by `type`, and the voice_interview_transcript column guard) with
 * every flag left at its seeded false. This file proves what changes once
 * THIS migration actually ships and flips voiceInterviewResult on for real:
 *
 *   - trusted_result_enforcement ends with voiceInterviewResult = true and
 *     every OTHER result_key — especially 'phase' — still false.
 *   - a candidate's own direct write of notes.voiceInterviewResult (any
 *     casing) is refused; so is a stray entry under a different key whose
 *     own `type` is 'voice_interview' (the type-matching path, since this
 *     phase has no legacyStepEntry of its own to also prove).
 *   - a candidate's own direct write of voice_interview_transcript is
 *     refused once voice_interview_result is already set, and still
 *     allowed while it's null (the legitimate first write) — re-proven here
 *     layered under THIS migration, not just the foundation's.
 *   - service-role writes (recordStepResult's own notes/phase update, and
 *     ava-voice-tools' separate voice_interview_transcript/phase_ai_analysis
 *     update) both still succeed.
 *   - every OTHER phase's result_key (typingTestResult, videoIntroResult,
 *     ...) stays candidate-writable — this migration touches only its own
 *     flag.
 *   - the EXTENDED submit_voice_interview_manual_end: still writes only
 *     voice_interview_result (never voice_interview_transcript or
 *     phase_ai_analysis anymore — those move to the same
 *     record_interview_transcript finalize call the Ava-ended path uses),
 *     still refuses a second call once evaluated, still refuses a caller
 *     who isn't this application's own candidate.
 *
 * Run with: node scripts/enforce_voice_interview_result.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const QUIZ_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915110000_quiz_answer_keys_server_side.sql");
const FOUNDATION_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915140000_trusted_step_results.sql");
const MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260916150700_enforce_voice_interview_result.sql");

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
  const migrationSql = await readFile(MIGRATION_PATH, "utf8");

  // --------------------------------------------------------------------
  // Same minimal fixture schema as scripts/trusted_step_results.pglite.test.mjs
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
  await db.exec(migrationSql);
  console.log("Loaded all three real migration files OK.\n");

  const employerId = randomUUID();
  const otherCandidateId = randomUUID();
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

  async function newApplication(status = "in_progress", extra = {}, candidate = candidateId) {
    const cols = ["job_id", "candidate_id", "status", ...Object.keys(extra)];
    const vals = [jobId, candidate, status, ...Object.values(extra)];
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
    console.log("== 0. voiceInterviewResult enforced, every other key (esp. 'phase') still false ==");
    const rows = await db.query(`SELECT result_key, enforced FROM public.trusted_result_enforcement ORDER BY result_key`);
    const byKey = Object.fromEntries(rows.rows.map((r) => [r.result_key, r.enforced]));
    ok(byKey.voiceInterviewResult === true, "voiceInterviewResult is enforced = true");
    ok(byKey.phase === false, "phase is still enforced = false (flipped only once every phase is converted)");
    for (const otherKey of ["typingTestResult", "chatSimulationResult", "chatInterviewResult", "salesSimulationResult", "portfolioResult", "videoIntroResult"]) {
      ok(byKey[otherKey] === false, `${otherKey} is unaffected by this migration (still false)`);
    }
  });

  // ==========================================================================
  await guardedSection("1. candidate cannot write notes.voiceInterviewResult directly", async () => {
    console.log("\n== 1. candidate direct writes of the resultKey/type are refused ==");
    const appId = await newApplication("pending");
    await expectFail(
      () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({ voiceInterviewResult: { overall_score: 100, recommendation: "advance" } })]),
      "candidate cannot write notes.voiceInterviewResult directly",
      "Candidates cannot edit a trusted step result directly"
    );
    await expectFail(
      () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({ VOICEINTERVIEWRESULT: { overall_score: 100 } })]),
      "candidate cannot write notes.VOICEINTERVIEWRESULT (any casing) either",
      "Candidates cannot edit a trusted step result directly"
    );
    // No legacyStepEntry for this phase (docs/TRUSTED-RESULTS.md's table says
    // "no" for voiceInterviewResult) — what this phase DOES additionally
    // guard against is a stray entry under some OTHER key whose own `type`
    // is 'voice_interview', matched by trusted_result_key_for's type branch.
    await expectFail(
      () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({ some_other_key: { type: "voice_interview", overall_score: 100 } })]),
      "candidate cannot forge a voice_interview-typed entry under an unrelated key either",
      "Candidates cannot edit a trusted step result directly"
    );
    // A completely unrelated notes key is still untouched.
    await expectOk(
      () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({ applicationAnswers: [{ q: "x", answer: "y" }] })]),
      "candidate can still freely write unrelated notes keys"
    );
  });

  // ==========================================================================
  await guardedSection("2. voice_interview_transcript guard still holds under this migration", async () => {
    console.log("\n== 2. voice_interview_transcript: legitimate first write open, blocked once evaluated ==");
    const ungradedApp = await newApplication("pending");
    await expectOk(
      () => updateAsCandidate(ungradedApp, "voice_interview_transcript = $2::jsonb", [JSON.stringify([{ role: "user", content: "hi" }])]),
      "ungraded: candidate can still write voice_interview_transcript (the legitimate first write, pre-evaluation)"
    );

    const gradedApp = await newApplication("pending");
    await updateAsService(gradedApp, "voice_interview_result = $2::jsonb", [JSON.stringify({ overall_score: 80, recommendation: "advance", summary: "ok" })]);
    await expectFail(
      () => updateAsCandidate(gradedApp, "voice_interview_transcript = $2::jsonb", [JSON.stringify([{ role: "user", content: "forged" }])]),
      "graded: candidate cannot write voice_interview_transcript once voice_interview_result is set",
      "Candidates cannot change voice_interview_transcript"
    );
    await expectOk(
      () => updateAsEmployer(gradedApp, "voice_interview_transcript = $2::jsonb", [JSON.stringify([{ role: "user", content: "employer edit" }])]),
      "employer stays fully unrestricted on voice_interview_transcript"
    );
  });

  // ==========================================================================
  await guardedSection("3. service-role writes (recordStepResult + transcript finalize) both succeed", async () => {
    console.log("\n== 3. service-role writes succeed exactly like recordStepResult's own two-step write ==");
    const appId = await newApplication("pending", { phase: "voice_interview" });
    await updateAsService(appId, "voice_interview_result = $2::jsonb", [JSON.stringify({ overall_score: 88, recommendation: "advance", summary: "Great candidate." })]);

    // recordStepResult's own write: notes (+ phase/status if advancing).
    await expectOk(
      () =>
        updateAsService(appId, "notes = $2, phase = $3, status = $4", [
          JSON.stringify({
            voiceInterviewResult: { overall_score: 88, recommendation: "advance", summary: "Great candidate." },
            _trusted: { voice_interview: { stepType: "voice_interview", completedAt: "2026-09-16T00:00:00.000Z" } },
          }),
          "decision",
          "reviewing",
        ]),
      "service role can write notes.voiceInterviewResult + advance phase/status"
    );

    // ava-voice-tools' separate transcript/phase_ai_analysis write.
    await expectOk(
      () =>
        updateAsService(appId, "voice_interview_transcript = $2::jsonb, phase_ai_analysis = $3", [
          JSON.stringify([{ role: "assistant", content: "Let's begin." }]),
          "Great candidate.",
        ]),
      "service role can write voice_interview_transcript + phase_ai_analysis after the fact"
    );

    const { rows } = await db.query(`SELECT notes::jsonb ->> 'voiceInterviewResult' AS vr, phase, status, voice_interview_transcript FROM public.applications WHERE id = $1`, [appId]);
    ok(rows[0].phase === "decision" && rows[0].status === "reviewing", "final row reflects the advanced phase/status");
    ok(rows[0].voice_interview_transcript !== null, "final row has a saved transcript");
  });

  // ==========================================================================
  await guardedSection("4. extended submit_voice_interview_manual_end", async () => {
    console.log("\n== 4. submit_voice_interview_manual_end writes ONLY voice_interview_result now ==");
    const appId = await newApplication("pending");
    await actAs(candidateId, "authenticated");
    const r = await db.query(
      `SELECT public.submit_voice_interview_manual_end($1, $2::jsonb, $3) AS evaluation`,
      [appId, JSON.stringify([{ role: "user", content: "hello" }, { role: "assistant", content: "hi there" }]), 120]
    );
    ok(r.rows[0].evaluation.recommendation === "review", "returns the fixed manual-review evaluation shape");
    ok(r.rows[0].evaluation.overall_score === null, "overall_score is always null — never attacker-influenceable");

    const { rows } = await db.query(
      `SELECT voice_interview_result IS NOT NULL AS has_result, voice_interview_transcript IS NULL AS transcript_is_null, phase_ai_analysis IS NULL AS analysis_is_null FROM public.applications WHERE id = $1`,
      [appId]
    );
    ok(rows[0].has_result === true, "voice_interview_result IS written by the RPC");
    ok(rows[0].transcript_is_null === true, "voice_interview_transcript is NOT written by the RPC anymore — the finalize call does that now");
    ok(rows[0].analysis_is_null === true, "phase_ai_analysis is NOT written by the RPC anymore either");

    // Guards preserved: refuse a second call, and refuse a non-candidate caller.
    await expectFail(
      () => db.query(`SELECT public.submit_voice_interview_manual_end($1, $2::jsonb, $3)`, [appId, JSON.stringify([]), 10]),
      "a second call to submit_voice_interview_manual_end is refused (already evaluated)",
      "already been evaluated"
    );

    const freshApp = await newApplication("pending");
    await actAs(otherCandidateId, "authenticated");
    await expectFail(
      () => db.query(`SELECT public.submit_voice_interview_manual_end($1, $2::jsonb, $3)`, [freshApp, JSON.stringify([]), 10]),
      "a caller who is not this application's own candidate is refused",
      "Not authorized"
    );

    // The finalize call can now run on top of this RPC's write exactly like
    // it does for the Ava-ended path, since voice_interview_transcript is
    // still null.
    await expectOk(
      () =>
        updateAsService(appId, "voice_interview_transcript = $2::jsonb, phase_ai_analysis = $3", [
          JSON.stringify([{ role: "user", content: "hello" }]),
          "The candidate ended the interview manually before Ava returned a structured final evaluation. The transcript and recording were saved for employer review.",
        ]),
      "the finalize call's own transcript write succeeds on top of the manual-end RPC's result (no overwrite conflict)"
    );
  });

  console.log(fail === 0 ? `\nAll ${pass} checks passed.` : `\n${pass} passed, ${fail} FAILED:\n  - ${failures.join("\n  - ")}`);
  await db.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal error running PGlite proof:", e);
  process.exit(1);
});
