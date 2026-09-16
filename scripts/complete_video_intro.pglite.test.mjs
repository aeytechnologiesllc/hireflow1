#!/usr/bin/env node
/**
 * PGlite proof for the video_intro / video_message part-B conversion
 * (supabase/migrations/20260916150600_enforce_video_intro_result.sql +
 * supabase/functions/complete-video-intro). Real Postgres (via PGlite), the
 * REAL migration files (foundation + this one, unmodified), and the REAL
 * recordStepResult (supabase/functions/_shared/trustedResults.ts) — not a
 * copy, not a mock of its own logic — driven through a minimal
 * MinimalSupabaseAdmin shim backed by the same PGlite connection.
 *
 * The trigger-level proof that flipping 'videoIntroResult' blocks a
 * candidate's own direct write of notes.videoIntroResult / notes[stepId] /
 * notes.videoIntroUrl (any casing, by key name or by `type` match), that
 * service_role/employer/team stay unrestricted, and that every OTHER
 * result_key is unaffected, already lives in the foundation's own
 * scripts/trusted_step_results.pglite.test.mjs (sections 3 and 3b) — this
 * file does not repeat that generic trigger sweep. What THIS file proves
 * instead, specific to this conversion:
 *
 *   0. This migration is idempotent and flips ONLY the videoIntroResult row.
 *   1. A candidate's direct write of notes.videoIntroResult, the legacy
 *      notes[stepId] entry, and the flat notes.videoIntroUrl key are all
 *      refused once this migration has run — re-confirmed here (not just
 *      trusted on the foundation file) against THIS migration specifically,
 *      because this is the migration that actually ships enforced = true to
 *      production.
 *   2. Service-role writes of the same fields succeed.
 *   3. Every OTHER phase's own result_key (typingTestResult here, standing
 *      in for the rest — they all go through the same generic
 *      trusted_result_key_for/protected_trusted_result_notes_subset path)
 *      is completely unaffected by this migration.
 *   4. The REAL recordStepResult — the function complete-video-intro/index.ts
 *      actually calls — end to end against a real Postgres application row:
 *      refuses a caller who isn't the candidate, refuses a step not yet
 *      reached, and on success writes notes.videoIntroResult +
 *      notes[stepId] + notes.videoIntroUrl + notes._trusted together and
 *      advances phase/status in auto mode, exactly the shape
 *      VideoIntroPhase.tsx used to write directly. Also proves a manual-mode
 *      job never advances phase, and that the advance stops one step short
 *      of voice_interview, matching VideoIntroPhase.tsx's own former rules.
 *
 * Run with: node scripts/complete_video_intro.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { recordStepResult } from "../supabase/functions/_shared/trustedResults.ts";
import {
  buildVideoIntroLegacyStepEntry,
  buildVideoIntroResult,
  resolveVideoStepType,
} from "../supabase/functions/complete-video-intro/logic.ts";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const QUIZ_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915110000_quiz_answer_keys_server_side.sql");
const FOUNDATION_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915140000_trusted_step_results.sql");
const MY_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260916150600_enforce_video_intro_result.sql");

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

  // --------------------------------------------------------------------
  // Same minimal fixture schema as scripts/trusted_step_results.pglite.test.mjs
  // (itself copied from scripts/quiz_guard_pglite_check.mjs) — kept as its
  // own copy deliberately: six sibling part-B conversions run in parallel
  // worktrees, each proving its own migration, and none of them should need
  // to touch the shared foundation test file to do it.
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

  await db.exec(quizMigrationSql);
  await db.exec(foundationMigrationSql);
  console.log("Loaded quiz + foundation migrations OK.\n");

  const employerId = randomUUID();
  const candidateId = randomUUID();
  const otherCandidateId = randomUUID();

  async function actAs(uid, role) {
    await db.query(`SELECT set_config('test.uid', $1, false), set_config('test.role', $2, false)`, [
      uid ?? "",
      role ?? "",
    ]);
  }

  async function newJob(overrides = {}) {
    const cols = ["employer_id", ...Object.keys(overrides)];
    const vals = [employerId, ...Object.values(overrides)];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const r = await db.query(`INSERT INTO public.jobs (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`, vals);
    return r.rows[0].id;
  }

  async function newApplication(jobId, status = "in_progress", extra = {}) {
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

  // A minimal MinimalSupabaseAdmin (see trustedResults.ts's own interface)
  // backed by this same PGlite connection, supporting exactly the one
  // select shape and one update shape recordStepResult actually issues —
  // real SQL, real Postgres, running as service_role (bypassing the trigger
  // exactly as the real service-role client does in production).
  function pgliteAdmin() {
    return {
      from(table) {
        if (table !== "applications") throw new Error(`unexpected table ${table}`);
        return {
          select() {
            return {
              eq(column, value) {
                return {
                  async maybeSingle() {
                    await actAs(null, "service_role");
                    const appRes = await db.query(
                      `SELECT id, candidate_id, phase, status, notes, job_id FROM public.applications WHERE ${column} = $1`,
                      [value]
                    );
                    const row = appRes.rows[0];
                    if (!row) return { data: null, error: null };
                    const jobRes = await db.query(
                      `SELECT workflow_steps, quiz_questions, processing_mode FROM public.jobs WHERE id = $1`,
                      [row.job_id]
                    );
                    const jobRow = jobRes.rows[0];
                    const jobs = jobRow
                      ? {
                          workflow_steps: jobRow.workflow_steps,
                          quiz_questions: jobRow.quiz_questions,
                          processing_mode: jobRow.processing_mode,
                        }
                      : null;
                    return { data: { ...row, jobs }, error: null };
                  },
                };
              },
            };
          },
          update(values) {
            return {
              eq: async (column, value) => {
                await actAs(null, "service_role");
                const keys = Object.keys(values);
                const setSql = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
                const vals = keys.map((k) => values[k]);
                try {
                  await db.query(`UPDATE public.applications SET ${setSql} WHERE ${column} = $1`, [value, ...vals]);
                  return { error: null };
                } catch (e) {
                  return { error: { message: e.message } };
                }
              },
            };
          },
        };
      },
    };
  }

  async function notesOf(appId) {
    const r = await db.query(`SELECT notes, phase, status FROM public.applications WHERE id = $1`, [appId]);
    const row = r.rows[0];
    return { ...row, parsedNotes: row.notes ? JSON.parse(row.notes) : {} };
  }

  // ==========================================================================
  console.log("== 0. This migration is idempotent and flips ONLY videoIntroResult ==");
  await guardedSection("0. migration", async () => {
    await db.exec(myMigrationSql);
    await db.exec(myMigrationSql); // run twice — must not error or double-flip anything

    const rows = await db.query(
      `SELECT result_key, enforced FROM public.trusted_result_enforcement ORDER BY result_key`
    );
    for (const row of rows.rows) {
      if (row.result_key === "videoIntroResult") {
        ok(row.enforced === true, "videoIntroResult is enforced = true after this migration");
      } else {
        ok(row.enforced === false, `${row.result_key} is untouched (still enforced = false)`);
      }
    }
  });

  // ==========================================================================
  console.log("\n== 1. Candidate direct writes are refused once this migration has run ==");
  await guardedSection("1. candidate writes refused", async () => {
    const jobId = await newJob();
    const appId = await newApplication(jobId, "pending", {
      notes: JSON.stringify({
        videoIntroResult: { duration: 45, completed: true, passed: true, score: null, videoUrl: "real.webm", uploadMethod: "recorded" },
        wf_video: { type: "video_intro", duration: 45 },
        videoIntroUrl: "real.webm",
      }),
    });

    await expectFail(
      () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({ videoIntroResult: { duration: 999 } })]),
      "candidate cannot forge notes.videoIntroResult",
      "Candidates cannot edit a trusted step result directly"
    );
    await expectFail(
      () =>
        updateAsCandidate(appId, "notes = $2", [
          JSON.stringify({ wf_video: { type: "video_intro", duration: 999 } }),
        ]),
      "candidate cannot forge notes[stepId] (the legacy by-id entry, matched by type)",
      "Candidates cannot edit a trusted step result directly"
    );
    await expectFail(
      () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({ videoIntroUrl: "forged.webm" })]),
      "candidate cannot forge the flat notes.videoIntroUrl key",
      "Candidates cannot edit a trusted step result directly"
    );
    await expectFail(
      () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({})]),
      "candidate cannot erase the videoIntroResult entry either",
      "Candidates cannot edit a trusted step result directly"
    );
    // 'phase' has its own, separate enforcement row (this migration never
    // touches it) — still freely candidate-writable, matching every
    // auto-mode phase page's own client-side advance today.
    await expectOk(
      () => updateAsCandidate(appId, "phase = $2", ["quiz"]),
      "phase itself is untouched by this migration (its own flag stays off)"
    );
  });

  // ==========================================================================
  console.log("\n== 2. Service-role writes of the same fields succeed ==");
  await guardedSection("2. service role unrestricted", async () => {
    const jobId = await newJob();
    const appId = await newApplication(jobId, "pending", {
      notes: JSON.stringify({ videoIntroResult: { duration: 1 }, videoIntroUrl: "a.webm" }),
    });
    await expectOk(
      () =>
        updateAsService(appId, "notes = $2", [
          JSON.stringify({ videoIntroResult: { duration: 60 }, videoIntroUrl: "b.webm" }),
        ]),
      "service_role can freely rewrite videoIntroResult/videoIntroUrl"
    );
  });

  // ==========================================================================
  console.log("\n== 3. Every OTHER phase's own result_key is unaffected ==");
  await guardedSection("3. other keys unaffected", async () => {
    const jobId = await newJob();
    const appId = await newApplication(jobId, "pending", {
      notes: JSON.stringify({ typingTestResult: { wpm: 60 } }),
    });
    await expectOk(
      () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({ typingTestResult: { wpm: 999 } })]),
      "typingTestResult (still enforced = false) stays freely candidate-writable after this migration"
    );

    const flag = await db.query(
      `SELECT enforced FROM public.trusted_result_enforcement WHERE result_key = 'typingTestResult'`
    );
    ok(flag.rows[0].enforced === false, "typingTestResult's own row is still enforced = false");
  });

  // ==========================================================================
  console.log("\n== 4. The REAL recordStepResult, end to end, exactly as complete-video-intro calls it ==");
  await guardedSection("4. recordStepResult end-to-end", async () => {
    const admin = pgliteAdmin();

    // ---- auto mode: advances to the next step, writes every shape together
    const workflowSteps = [
      { id: "wf-typing", type: "typing_test", title: "Typing test" },
      { id: "wf-video", type: "video_intro", title: "Video introduction" },
      { id: "wf-chat", type: "chat_simulation", title: "Chat simulation" },
    ];
    const autoJobId = await newJob({ processing_mode: "auto", workflow_steps: JSON.stringify(workflowSteps) });
    const autoAppId = await newApplication(autoJobId, "reviewing", { phase: "wf-video" });

    const duration = 42;
    const videoUrl = `${candidateId}/${autoAppId}-wf-video-1700000000000.webm`;
    const stepType = resolveVideoStepType(workflowSteps, "wf-video");
    ok(stepType === "video_intro", "resolveVideoStepType found the real step type from workflow_steps");

    const recordedAt = "2026-09-16T00:00:00.000Z";
    const result = buildVideoIntroResult({ duration, videoUrl });
    const legacyStepEntry = buildVideoIntroLegacyStepEntry({ duration, videoUrl, stepType, recordedAt });

    const outcome = await recordStepResult(admin, {
      applicationId: autoAppId,
      callerUserId: candidateId,
      stepId: "wf-video",
      stepType,
      advance: "auto_mode",
      resultKey: "videoIntroResult",
      result,
      legacyStepEntry,
      extraNotesEntries: { videoIntroUrl: videoUrl },
    });

    ok(outcome.ok === true, `recordStepResult succeeded (${outcome.ok ? "" : outcome.error})`);
    if (outcome.ok) {
      ok(
        outcome.next && outcome.next !== "waiting" && outcome.next.id === "wf-chat",
        `advances to the real next step (got ${JSON.stringify(outcome.next)})`
      );
    }

    const after = await notesOf(autoAppId);
    ok(after.phase === "wf-chat", "auto mode: phase actually advanced in the database");
    ok(after.status === "reviewing", "auto mode: status is 'reviewing' after advancing");
    ok(
      JSON.stringify(after.parsedNotes.videoIntroResult) === JSON.stringify(result),
      "notes.videoIntroResult written exactly as built"
    );
    ok(
      JSON.stringify(after.parsedNotes["wf-video"]) === JSON.stringify(legacyStepEntry),
      "notes[stepId] (legacy by-id entry) written exactly as built"
    );
    ok(after.parsedNotes.videoIntroUrl === videoUrl, "flat notes.videoIntroUrl written for autopilot-batch/usePendingActionsCount");
    ok(
      after.parsedNotes._trusted?.["wf-video"]?.stepType === "video_intro",
      "server-only notes._trusted marker recorded for this step"
    );

    // That written videoIntroResult/videoIntroUrl is now itself protected —
    // proves the whole loop (write via recordStepResult, then guarded by
    // the very trigger this migration flips) really holds together.
    await expectFail(
      () => updateAsCandidate(autoAppId, "notes = $2", [JSON.stringify({ videoIntroResult: { duration: 1 } })]),
      "the result recordStepResult just wrote is itself immediately candidate-unforgeable"
    );

    // ---- a caller who isn't the candidate is refused
    const impersonated = await recordStepResult(admin, {
      applicationId: autoAppId,
      callerUserId: otherCandidateId,
      stepId: "wf-video",
      stepType: "video_intro",
      advance: "auto_mode",
      resultKey: "videoIntroResult",
      result: buildVideoIntroResult({ duration: 1, videoUrl: "x" }),
    });
    ok(
      impersonated.ok === false && impersonated.code === "not_candidate",
      `a non-owning caller is refused (got ${JSON.stringify(impersonated)})`
    );

    // ---- a step not yet reached is refused (409-worthy per the doc)
    const earlyAppId = await newApplication(autoJobId, "in_progress", { phase: "wf-typing" });
    const early = await recordStepResult(admin, {
      applicationId: earlyAppId,
      callerUserId: candidateId,
      stepId: "wf-video",
      stepType: "video_intro",
      advance: "auto_mode",
      resultKey: "videoIntroResult",
      result: buildVideoIntroResult({ duration: 1, videoUrl: "x" }),
    });
    ok(
      early.ok === false && early.code === "step_not_reached",
      `a step not yet reached is refused (got ${JSON.stringify(early)})`
    );

    // ---- manual mode never advances phase
    const manualJobId = await newJob({ processing_mode: "manual", workflow_steps: JSON.stringify(workflowSteps) });
    const manualAppId = await newApplication(manualJobId, "reviewing", { phase: "wf-video" });
    const manualOutcome = await recordStepResult(admin, {
      applicationId: manualAppId,
      callerUserId: candidateId,
      stepId: "wf-video",
      stepType: "video_intro",
      advance: "auto_mode",
      resultKey: "videoIntroResult",
      result: buildVideoIntroResult({ duration: 30, videoUrl: "m.webm" }),
      extraNotesEntries: { videoIntroUrl: "m.webm" },
    });
    ok(manualOutcome.ok === true, "manual mode: recordStepResult still succeeds");
    ok(manualOutcome.ok && manualOutcome.next === "waiting", "manual mode: next is 'waiting', not an auto-advance");
    const manualAfter = await notesOf(manualAppId);
    ok(manualAfter.phase === "wf-video", "manual mode: phase was NOT advanced — employer moves it from the cockpit");

    // ---- stops one step short of voice_interview (auto mode)
    const voiceSteps = [
      { id: "wf-video2", type: "video_intro", title: "Video introduction" },
      { id: "wf-voice", type: "voice_interview", title: "Ava interview" },
    ];
    const voiceJobId = await newJob({ processing_mode: "auto", workflow_steps: JSON.stringify(voiceSteps) });
    const voiceAppId = await newApplication(voiceJobId, "reviewing", { phase: "wf-video2" });
    const voiceOutcome = await recordStepResult(admin, {
      applicationId: voiceAppId,
      callerUserId: candidateId,
      stepId: "wf-video2",
      stepType: "video_intro",
      advance: "auto_mode",
      resultKey: "videoIntroResult",
      result: buildVideoIntroResult({ duration: 20, videoUrl: "v.webm" }),
      extraNotesEntries: { videoIntroUrl: "v.webm" },
    });
    ok(voiceOutcome.ok === true, "auto mode before voice_interview: recordStepResult still succeeds");
    ok(
      voiceOutcome.ok && voiceOutcome.next === "waiting",
      "auto mode before voice_interview: next is 'waiting' (no button), matching VideoIntroPhase.tsx's former STOP-before-voice_interview rule"
    );
    const voiceAfter = await notesOf(voiceAppId);
    ok(voiceAfter.phase === "wf-video2", "auto mode before voice_interview: phase was NOT advanced into it");

    // ---- the legacy 'video_message' alias is handled identically
    const aliasSteps = [
      { id: "wf-vm", type: "video_message", title: "Video message" },
      { id: "wf-chat2", type: "chat_simulation", title: "Chat simulation" },
    ];
    const aliasJobId = await newJob({ processing_mode: "auto", workflow_steps: JSON.stringify(aliasSteps) });
    const aliasAppId = await newApplication(aliasJobId, "reviewing", { phase: "wf-vm" });
    const aliasStepType = resolveVideoStepType(aliasSteps, "wf-vm");
    ok(aliasStepType === "video_message", "resolveVideoStepType returns the real 'video_message' alias, not a forced 'video_intro'");
    const aliasOutcome = await recordStepResult(admin, {
      applicationId: aliasAppId,
      callerUserId: candidateId,
      stepId: "wf-vm",
      stepType: aliasStepType,
      advance: "auto_mode",
      resultKey: "videoIntroResult",
      result: buildVideoIntroResult({ duration: 10, videoUrl: "vm.webm" }),
      legacyStepEntry: buildVideoIntroLegacyStepEntry({
        duration: 10,
        videoUrl: "vm.webm",
        stepType: aliasStepType,
        recordedAt,
      }),
      extraNotesEntries: { videoIntroUrl: "vm.webm" },
    });
    ok(aliasOutcome.ok === true, `legacy 'video_message' step type is accepted end to end (${aliasOutcome.ok ? "" : aliasOutcome.error})`);
    const aliasAfter = await notesOf(aliasAppId);
    ok(aliasAfter.parsedNotes["wf-vm"]?.type === "video_message", "notes[stepId] records the real 'video_message' type, not a rewritten 'video_intro'");
  });

  // --------------------------------------------------------------------
  console.log(`\n${pass} passed, ${fail} failed.\n`);
  if (fail > 0) {
    console.log("Failures:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("Fatal error running PGlite test:", e);
  process.exit(1);
});
