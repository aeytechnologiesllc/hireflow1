#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20260916150200_enforce_chat_simulation_result.sql
 * — plain assertions, no framework, real Postgres (via PGlite), not a text
 * match. Loads the three REAL migration files (no copy, no paraphrase), in
 * deploy order:
 *
 *   1. 20260915110000_quiz_answer_keys_server_side.sql (defines
 *      protected_application_notes_subset and the baseline
 *      protect_application_columns())
 *   2. 20260915140000_trusted_step_results.sql (the foundation — defines
 *      trusted_result_enforcement seeded enforced = false, and extends
 *      protect_application_columns() to also guard notes/_trusted/phase
 *      behind those flags)
 *   3. 20260916150200_enforce_chat_simulation_result.sql (THIS phase's own
 *      migration — flips only chatSimulationResult to enforced = true)
 *
 * on top of the same minimal fixture schema
 * scripts/trusted_step_results.pglite.test.mjs already uses.
 *
 * Proves, with chatSimulationResult now enforced (the live state after this
 * migration ships):
 *   - a candidate cannot change, remove, or (under any casing) forge
 *     notes.chatSimulationResult directly
 *   - a candidate cannot forge a chat_simulation result under an arbitrary
 *     key name either — trusted_result_key_for matches by the notes entry's
 *     own `type: "chat_simulation"` too, which is this phase's equivalent of
 *     the "legacy by-id entry" / "extra flat key" checks other phases need:
 *     ChatSimulationPhase.tsx has no by-id (notes[stepId]) reader and no
 *     flat legacy key the way video_intro does (see docs/TRUSTED-RESULTS.md's
 *     result_key table), so `type` matching is the only other forgery
 *     surface this result_key has to close
 *   - a candidate cannot erase notes._trusted for the chat_simulation step
 *   - service_role, the job owner, and an active team member all stay fully
 *     unrestricted
 *   - every OTHER still-unenforced result_key (typingTestResult,
 *     chatInterviewResult — the closest-named sibling — salesSimulationResult,
 *     portfolioResult, videoIntroResult, voiceInterviewResult) stays fully
 *     candidate-writable, and so does `phase` itself (flipped only in the
 *     final part-B migration)
 *   - the migration is idempotent: applying it twice is a no-op, not an error
 *
 * Run with: node scripts/chat_simulation_enforcement.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const QUIZ_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915110000_quiz_answer_keys_server_side.sql");
const FOUNDATION_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915140000_trusted_step_results.sql");
const PHASE_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260916150200_enforce_chat_simulation_result.sql");

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
  const phaseMigrationSql = await readFile(PHASE_MIGRATION_PATH, "utf8");

  // --------------------------------------------------------------------
  // Minimal schema stand-in for the live tables/helpers these migrations
  // depend on — same fixture scripts/trusted_step_results.pglite.test.mjs
  // and scripts/quiz_guard_pglite_check.mjs already use.
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
    -- (the migration that defines these on the live DB) so the real
    -- migration files' policies/trigger resolve against the real logic.
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
  await db.exec(phaseMigrationSql);
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
  console.log("== 0. The phase migration flipped chatSimulationResult ON, and nothing else ==");
  await guardedSection("0. flags after phase migration", async () => {
    const rows = await db.query(
      `SELECT result_key, enforced FROM public.trusted_result_enforcement ORDER BY result_key`
    );
    const byKey = Object.fromEntries(rows.rows.map((r) => [r.result_key, r.enforced]));
    ok(byKey.chatSimulationResult === true, "chatSimulationResult is enforced = true");
    for (const otherKey of [
      "typingTestResult",
      "chatInterviewResult",
      "salesSimulationResult",
      "portfolioResult",
      "videoIntroResult",
      "voiceInterviewResult",
      "phase",
    ]) {
      ok(byKey[otherKey] === false, `${otherKey} is still enforced = false`);
    }
  });

  // ==========================================================================
  console.log("\n== 1. Candidate cannot touch notes.chatSimulationResult, any casing, by name ==");
  await guardedSection("1. by-name forgery blocked", async () => {
    const appId = await newApplication("pending", {
      notes: JSON.stringify({ chatSimulationResult: { score: 82, empathy: 90, completed: true } }),
    });

    await expectFail(
      () =>
        updateAsCandidate(appId, "notes = $2", [
          JSON.stringify({ chatSimulationResult: { score: 100, empathy: 100, completed: true } }),
        ]),
      "candidate cannot inflate notes.chatSimulationResult.score",
      "Candidates cannot edit a trusted step result directly"
    );
    await expectFail(
      () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({})]),
      "candidate cannot REMOVE notes.chatSimulationResult",
      "Candidates cannot edit a trusted step result directly"
    );
    await expectFail(
      () =>
        updateAsCandidate(appId, "notes = $2", [
          JSON.stringify({ ChatSimulationResult: { score: 100 } }),
        ]),
      "candidate cannot forge it under a different casing (ChatSimulationResult)",
      "Candidates cannot edit a trusted step result directly"
    );
    await expectFail(
      () =>
        updateAsCandidate(appId, "notes = $2", [
          JSON.stringify({ chatsimulationresult: { score: 100 } }),
        ]),
      "candidate cannot forge it under a different casing (chatsimulationresult)",
      "Candidates cannot edit a trusted step result directly"
    );
  });

  // ==========================================================================
  console.log(
    "\n== 2. Candidate cannot forge a chat_simulation result under an arbitrary key (type-based match) =="
  );
  await guardedSection("2. by-type forgery blocked", async () => {
    // chatSimulationResult has no legacyStepEntry (no notes[stepId] reader)
    // and no flat legacy key the way video_intro's videoIntroUrl does — its
    // ONLY other forgery surface is trusted_result_key_for's `type` match,
    // which this proves is still closed.
    const appId = await newApplication("pending", {
      notes: JSON.stringify({ step_abc: { type: "chat_simulation", score: 82 } }),
    });
    await expectFail(
      () =>
        updateAsCandidate(appId, "notes = $2", [
          JSON.stringify({ step_abc: { type: "chat_simulation", score: 999 } }),
        ]),
      "candidate cannot forge a type: 'chat_simulation' entry under an arbitrary key name"
    );

    // A sibling type this phase's own flag must NOT protect — chat_interview
    // stays fully candidate-writable until its OWN result_key is enforced.
    const siblingApp = await newApplication("pending", {
      notes: JSON.stringify({ step_def: { type: "chat_interview", score: 82 } }),
    });
    await expectOk(
      () =>
        updateAsCandidate(siblingApp, "notes = $2", [
          JSON.stringify({ step_def: { type: "chat_interview", score: 999 } }),
        ]),
      "candidate CAN still freely edit a type: 'chat_interview' entry — chatSimulationResult's flag does not leak onto its sibling"
    );
  });

  // ==========================================================================
  console.log("\n== 3. notes._trusted for the chat_simulation step is still unconditionally blocked ==");
  await guardedSection("3. _trusted blocked", async () => {
    const appId = await newApplication("pending", {
      notes: JSON.stringify({
        chatSimulationResult: { score: 82 },
        _trusted: { step_chat: { stepType: "chat_simulation", completedAt: "2026-09-16T00:00:00Z" } },
      }),
    });
    await expectFail(
      () =>
        updateAsCandidate(appId, "notes = $2", [
          JSON.stringify({ chatSimulationResult: { score: 82 }, _trusted: {} }),
        ]),
      "candidate cannot erase notes._trusted for the chat_simulation step",
      "Candidates cannot edit a trusted step result directly"
    );
  });

  // ==========================================================================
  console.log("\n== 4. service_role, the job owner, and an active team member stay unrestricted ==");
  await guardedSection("4. privileged writers unaffected", async () => {
    const appId = await newApplication("pending", {
      notes: JSON.stringify({ chatSimulationResult: { score: 82 } }),
    });
    await expectOk(
      () =>
        updateAsService(appId, "notes = $2", [
          JSON.stringify({ chatSimulationResult: { score: 91 }, _trusted: { step_chat: { stepType: "chat_simulation", completedAt: "now" } } }),
        ]),
      "service_role can write notes.chatSimulationResult and notes._trusted freely"
    );
    await expectOk(
      () => updateAsEmployer(appId, "notes = $2", [JSON.stringify({ chatSimulationResult: { score: 55 } })]),
      "the job owner (employer) can still edit notes.chatSimulationResult"
    );
    await expectOk(
      () => updateAsTeamMember(appId, "notes = $2", [JSON.stringify({ chatSimulationResult: { score: 60 } })]),
      "an active team member with manage-pipeline can still edit notes.chatSimulationResult"
    );
  });

  // ==========================================================================
  console.log("\n== 5. Every OTHER still-unenforced result_key, and `phase`, stays candidate-writable ==");
  await guardedSection("5. other keys unaffected", async () => {
    const otherKeys = {
      typingTestResult: { wpm: 90 },
      chatInterviewResult: { score: 80 },
      salesSimulationResult: { score: 80 },
      portfolioResult: { score: 80 },
      videoIntroResult: { submitted: true },
      voiceInterviewResult: { overall_score: 80 },
    };
    for (const [key, value] of Object.entries(otherKeys)) {
      const appId = await newApplication("pending", { notes: JSON.stringify({ [key]: value }) });
      await expectOk(
        () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({ [key]: { ...value, forged: true } })]),
        `unenforced key: candidate can still freely change notes.${key}`
      );
    }

    // video_intro's own flat legacy key — still untouched by this phase's flag.
    const videoUrlApp = await newApplication("pending");
    await expectOk(
      () =>
        updateAsCandidate(videoUrlApp, "notes = $2", [
          JSON.stringify({ videoIntroUrl: "https://example.com/video.webm" }),
        ]),
      "unenforced key: candidate can still freely write notes.videoIntroUrl"
    );

    const phaseApp = await newApplication("pending", { phase: "chat_simulation" });
    await expectOk(
      () => updateAsCandidate(phaseApp, "phase = $2", ["chat_interview"]),
      "'phase' flag is still off: candidate can freely change phase (flips only in the final part-B migration)"
    );
  });

  // ==========================================================================
  console.log("\n== 6. The phase migration is idempotent ==");
  await guardedSection("6. idempotent", async () => {
    await expectOk(() => db.exec(phaseMigrationSql), "re-applying the phase migration does not throw");
    const row = await db.query(
      `SELECT enforced FROM public.trusted_result_enforcement WHERE result_key = 'chatSimulationResult'`
    );
    ok(row.rows[0]?.enforced === true, "chatSimulationResult is still enforced = true after re-applying");
  });

  // ==========================================================================
  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }

  await db.close();
}

main().catch((e) => {
  console.error("Fatal error running PGlite proof:", e);
  process.exit(1);
});
