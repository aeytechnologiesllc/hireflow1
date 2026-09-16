#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20260915140000_trusted_step_results.sql
 * — plain assertions, no framework, real Postgres (via PGlite), not a text
 * match. Loads the REAL migration files (no copy, no paraphrase): first
 * 20260915110000_quiz_answer_keys_server_side.sql (the migration this one
 * extends — needed so protected_application_notes_subset and the baseline
 * protect_application_columns() exist to be CREATE OR REPLACEd), then
 * 20260915140000_trusted_step_results.sql itself, on top of a minimal fixture
 * schema for the tables/helpers both migrations depend on (same fixture
 * scripts/quiz_guard_pglite_check.mjs already uses).
 *
 * Proves:
 *   - trusted_result_enforcement seeds every row enforced = false
 *   - WITH EVERY FLAG OFF (today's live default): nothing changes for a
 *     candidate's own write — every notes key this migration COULD protect
 *     (typingTestResult, chatSimulationResult, chatInterviewResult,
 *     salesSimulationResult, portfolioResult, videoIntroResult,
 *     voiceInterviewResult, any casing, by exact key name or by a `type`/
 *     `stepType` match), applications.phase, and
 *     applications.voice_interview_transcript (even once
 *     voice_interview_result is already set) all stay candidate-writable —
 *     AND every rule 20260915110000 already enforced unconditionally
 *     (quizResult, avaScorecard, ai_score/ai_scorecard/ai_analysis/
 *     resume_score/voice_interview_result, job_id/candidate_id/rejected_by*,
 *     the status deny-list) still fires exactly as before. notes._trusted is
 *     the one exception: it is blocked EVEN WITH EVERY FLAG OFF, because its
 *     protection is unconditional, not gated by any result_key's flag.
 *   - flipping ONE result_key's flag on protects ONLY that key (by exact
 *     name, any casing, and by `type`/`stepType` match) — every other
 *     still-unenforced key stays candidate-writable; notes._trusted itself
 *     stays blocked throughout, regardless of which (if any) flags are on
 *   - flipping 'voiceInterviewResult' on blocks
 *     applications.voice_interview_transcript ONLY once
 *     voice_interview_result is already non-null (never while it's still
 *     null — the legitimate first write)
 *   - flipping 'phase' on blocks applications.phase entirely for a
 *     candidate, with no carved-out exception
 *   - service_role, the job owner, and an active team member stay fully
 *     unrestricted regardless of any flag's state
 *
 * Run with: node scripts/trusted_step_results.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const QUIZ_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915110000_quiz_answer_keys_server_side.sql");
const MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915140000_trusted_step_results.sql");

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
  const migrationSql = await readFile(MIGRATION_PATH, "utf8");

  // --------------------------------------------------------------------
  // Minimal schema stand-in for the live tables/helpers these migrations
  // depend on — same fixture as scripts/quiz_guard_pglite_check.mjs.
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
  // The two real migration files under test, unmodified, in deploy order.
  // --------------------------------------------------------------------
  await db.exec(quizMigrationSql);
  await db.exec(migrationSql);
  console.log("Loaded both real migration files OK.\n");

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

  async function setFlag(resultKey, enforced) {
    await actAs(null, "service_role");
    await db.query(`UPDATE public.trusted_result_enforcement SET enforced = $2 WHERE result_key = $1`, [
      resultKey,
      enforced,
    ]);
  }

  // ==========================================================================
  await guardedSection("0. seed", async () => {
    console.log("== 0. trusted_result_enforcement seeds every row enforced = false ==");
    const rows = await db.query(`SELECT result_key, enforced FROM public.trusted_result_enforcement ORDER BY result_key`);
    const expectedKeys = [
      "chatInterviewResult", "chatSimulationResult", "phase", "portfolioResult",
      "salesSimulationResult", "typingTestResult", "videoIntroResult", "voiceInterviewResult",
    ].sort();
    ok(rows.rows.length === 8, `seeded exactly 8 rows (got ${rows.rows.length})`);
    ok(
      JSON.stringify(rows.rows.map((r) => r.result_key).sort()) === JSON.stringify(expectedKeys),
      "seeded exactly the 8 expected result_keys"
    );
    ok(rows.rows.every((r) => r.enforced === false), "every seeded row is enforced = false");
  });

  // ==========================================================================
  console.log("\n== 1. Every flag OFF: nothing changes for a candidate's own write ==");
  await guardedSection("1. flags off", async () => {
    const resultKeyToNotesKey = {
      typingTestResult: "typingTestResult",
      chatSimulationResult: "chatSimulationResult",
      chatInterviewResult: "chatInterviewResult",
      salesSimulationResult: "salesSimulationResult",
      portfolioResult: "portfolioResult",
      videoIntroResult: "videoIntroResult",
      voiceInterviewResult: "voiceInterviewResult",
    };
    for (const notesKey of Object.values(resultKeyToNotesKey)) {
      const appId = await newApplication("pending");
      await expectOk(
        () =>
          updateAsCandidate(appId, "notes = $2", [
            JSON.stringify({ [notesKey]: { score: 91 } }),
          ]),
        `flags off: candidate can freely write notes.${notesKey}`
      );
    }

    // video_intro's flat legacy key (notes.videoIntroUrl, not nested under
    // videoIntroResult) — autopilot-batch/index.ts:129 and
    // usePendingActionsCount.ts:77 read this exclusively. Flags off: still
    // freely writable, same as every other still-unenforced key.
    {
      const appId = await newApplication("pending");
      await expectOk(
        () =>
          updateAsCandidate(appId, "notes = $2", [
            JSON.stringify({ videoIntroUrl: "https://example.com/video.webm" }),
          ]),
        "flags off: candidate can freely write notes.videoIntroUrl (the flat video_intro legacy key)"
      );
    }

    // A stepId-keyed entry whose own `type` matches one of the guarded
    // shapes, with flags off, is also untouched.
    {
      const appId = await newApplication("pending");
      await expectOk(
        () =>
          updateAsCandidate(appId, "notes = $2", [
            JSON.stringify({ step_abc: { type: "typing_test", wpm: 999 } }),
          ]),
        "flags off: candidate can freely write a type:'typing_test' entry under any key"
      );
    }

    // notes._trusted is protected UNCONDITIONALLY — unlike every result_key
    // above, this does NOT depend on any enforcement flag, so it still
    // blocks a candidate write even with every flag off (nothing client-side
    // legitimately writes this key today, so this changes nothing for the
    // real app either way).
    {
      const appId = await newApplication("pending");
      await expectFail(
        () =>
          updateAsCandidate(appId, "notes = $2", [
            JSON.stringify({ _trusted: { typing_test: { stepType: "typing_test", completedAt: "x" } } }),
          ]),
        "flags off: candidate still cannot write notes._trusted (unconditional)",
        "Candidates cannot edit a trusted step result directly"
      );
    }

    // phase, with the 'phase' flag off, is untouched — matches every
    // auto-mode phase page's own client-side advance today.
    {
      const appId = await newApplication("pending", { phase: "typing_test" });
      await expectOk(
        () => updateAsCandidate(appId, "phase = $2", ["video_intro"]),
        "flags off: candidate can freely change phase"
      );
    }

    // voice_interview_transcript, with the 'voiceInterviewResult' flag off,
    // is untouched even once voice_interview_result is already set —
    // matches VoiceInterviewPhase.tsx's own real-world write order.
    {
      const appId = await newApplication("pending", {
        voice_interview_result: JSON.stringify({ overall_score: 80 }),
      });
      await expectOk(
        () =>
          updateAsCandidate(appId, "voice_interview_transcript = $2::jsonb", [
            JSON.stringify([{ role: "user", content: "hi" }]),
          ]),
        "flags off: candidate can write voice_interview_transcript even after evaluation"
      );
    }
  });

  console.log("\n== 2. Every flag OFF: every PRE-EXISTING rule from 20260915110000 still fires ==");
  await guardedSection("2. baseline unchanged", async () => {
    const appId = await newApplication("pending");
    await expectFail(
      () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({ quizResult: { score: 100 } })]),
      "quizResult stays blocked",
      "Candidates cannot edit quiz results"
    );
    await expectFail(
      () => updateAsCandidate(appId, "ai_score = $2", [99]),
      "ai_score stays blocked",
      "Candidates cannot change ai_score"
    );
    await expectFail(
      () => updateAsCandidate(appId, "voice_interview_result = $2::jsonb", [JSON.stringify({ overall_score: 100 })]),
      "voice_interview_result stays unconditionally blocked",
      "Candidates cannot change voice_interview_result"
    );
    const rejectedApp = await newApplication("rejected");
    await expectFail(
      () => updateAsCandidate(rejectedApp, "status = $2", ["reviewing"]),
      "status deny-list still blocks self-write once rejected",
      "Candidates cannot change application status"
    );
    await expectOk(
      () => updateAsCandidate(appId, "status = $2", ["reviewing"]),
      "status: pending -> reviewing still allowed (unrelated to this migration)"
    );
  });

  // ==========================================================================
  console.log("\n== 3. Flipping ONE result_key protects only that key ==");
  await guardedSection("3. per-key enforcement", async () => {
    await setFlag("typingTestResult", true);

    const appId = await newApplication("pending", {
      notes: JSON.stringify({ typingTestResult: { wpm: 60, score: 80 } }),
    });

    await expectFail(
      () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({ typingTestResult: { wpm: 999, score: 100 } })]),
      "enforced key: candidate cannot change notes.typingTestResult"
    );
    await expectFail(
      () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({})]),
      "enforced key: candidate cannot REMOVE notes.typingTestResult"
    );
    await expectFail(
      () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({ TypingTestResult: { wpm: 1 } })]),
      "enforced key: matches by any casing (TypingTestResult)"
    );

    const typeApp = await newApplication("pending", {
      notes: JSON.stringify({ step_xyz: { type: "typing_test", wpm: 60 } }),
    });
    await expectFail(
      () =>
        updateAsCandidate(typeApp, "notes = $2", [
          JSON.stringify({ step_xyz: { type: "typing_test", wpm: 999 } }),
        ]),
      "enforced key: matches by type: 'typing_test' under an arbitrary key name too"
    );

    const trustedApp = await newApplication("pending", {
      notes: JSON.stringify({
        typingTestResult: { wpm: 60 },
        _trusted: { typing_test: { stepType: "typing_test", completedAt: "2026-09-15T00:00:00Z" } },
      }),
    });
    await expectFail(
      () =>
        updateAsCandidate(trustedApp, "notes = $2", [
          JSON.stringify({
            typingTestResult: { wpm: 60 },
            _trusted: {}, // erasing the server-only marker
          }),
        ]),
      "enforced key: candidate cannot erase notes._trusted[stepId] for an enforced stepType"
    );

    // A DIFFERENT result_key's notes entry, still unenforced, stays writable.
    const otherApp = await newApplication("pending", {
      notes: JSON.stringify({ chatSimulationResult: { score: 70 } }),
    });
    await expectOk(
      () =>
        updateAsCandidate(otherApp, "notes = $2", [
          JSON.stringify({ chatSimulationResult: { score: 999 } }),
        ]),
      "unenforced key: candidate can still freely change notes.chatSimulationResult"
    );

    // _trusted is unconditional — even a _trusted entry for a still-
    // unenforced stepType is blocked, because the protection isn't gated by
    // any individual stepType's flag at all.
    const otherTrustedApp = await newApplication("pending", {
      notes: JSON.stringify({
        _trusted: { chat: { stepType: "chat_simulation", completedAt: "2026-09-15T00:00:00Z" } },
      }),
    });
    await expectFail(
      () =>
        updateAsCandidate(otherTrustedApp, "notes = $2", [
          JSON.stringify({ _trusted: {} }),
        ]),
      "unconditional _trusted: candidate cannot erase a _trusted entry even for an unenforced stepType",
      "Candidates cannot edit a trusted step result directly"
    );

    // Employer / team / service_role remain unrestricted regardless.
    await expectOk(
      () =>
        updateAsEmployer(appId, "notes = $2", [
          JSON.stringify({ typingTestResult: { wpm: 1, employerOverride: true } }),
        ]),
      "employer stays unrestricted with the flag on"
    );
    await expectOk(
      () =>
        updateAsTeamMember(appId, "notes = $2", [
          JSON.stringify({ typingTestResult: { wpm: 2, teamOverride: true } }),
        ]),
      "active team member stays unrestricted with the flag on"
    );
    await expectOk(
      () =>
        updateAsService(appId, "notes = $2", [
          JSON.stringify({ typingTestResult: { wpm: 3, serviceOverride: true } }),
        ]),
      "service_role stays unrestricted with the flag on"
    );

    await setFlag("typingTestResult", false); // reset for later sections
  });

  // ==========================================================================
  console.log("\n== 3b. videoIntroUrl is folded into videoIntroResult's own flag ==");
  await guardedSection("3b. videoIntroUrl", async () => {
    await setFlag("videoIntroResult", true);

    // The flat legacy key alone (no videoIntroResult entry even present) is
    // blocked — this is the exact gap the foundation's own review caught:
    // recordStepResult writes this key via extraNotesEntries, so it must be
    // in the SAME protected subset as videoIntroResult itself, or a
    // candidate could keep forging autopilot-batch's / the sidebar's
    // "submitted" signal even after videoIntroResult is trusted.
    const appId = await newApplication("pending", {
      notes: JSON.stringify({ videoIntroUrl: "https://example.com/real.webm" }),
    });
    await expectFail(
      () =>
        updateAsCandidate(appId, "notes = $2", [
          JSON.stringify({ videoIntroUrl: "https://example.com/forged.webm" }),
        ]),
      "enforced videoIntroResult: candidate cannot change notes.videoIntroUrl directly"
    );
    await expectFail(
      () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({})]),
      "enforced videoIntroResult: candidate cannot REMOVE notes.videoIntroUrl either"
    );

    // Matches by any casing, same as every other result_key.
    const casingApp = await newApplication("pending", {
      notes: JSON.stringify({ VideoIntroUrl: "https://example.com/real.webm" }),
    });
    await expectFail(
      () =>
        updateAsCandidate(casingApp, "notes = $2", [
          JSON.stringify({ VideoIntroUrl: "https://example.com/forged.webm" }),
        ]),
      "enforced videoIntroResult: matches notes.videoIntroUrl by any casing too"
    );

    // Employer / service_role remain unrestricted regardless.
    await expectOk(
      () =>
        updateAsEmployer(appId, "notes = $2", [
          JSON.stringify({ videoIntroUrl: "https://example.com/employer-edit.webm" }),
        ]),
      "employer stays unrestricted on notes.videoIntroUrl with the flag on"
    );
    await expectOk(
      () =>
        updateAsService(appId, "notes = $2", [
          JSON.stringify({ videoIntroUrl: "https://example.com/service-edit.webm" }),
        ]),
      "service_role stays unrestricted on notes.videoIntroUrl with the flag on"
    );

    await setFlag("videoIntroResult", false);
  });

  // ==========================================================================
  console.log("\n== 4. voice_interview_transcript: blocked only once evaluated AND enforced ==");
  await guardedSection("4. voice_interview_transcript", async () => {
    await setFlag("voiceInterviewResult", true);

    const ungradedApp = await newApplication("pending");
    await expectOk(
      () =>
        updateAsCandidate(ungradedApp, "voice_interview_transcript = $2::jsonb", [
          JSON.stringify([{ role: "user", content: "hi" }]),
        ]),
      "enforced but ungraded: candidate can still write voice_interview_transcript (the legitimate first write)"
    );

    const gradedApp = await newApplication("pending", {
      voice_interview_result: JSON.stringify({ overall_score: 80 }),
    });
    await expectFail(
      () =>
        updateAsCandidate(gradedApp, "voice_interview_transcript = $2::jsonb", [
          JSON.stringify([{ role: "user", content: "rewritten after the fact" }]),
        ]),
      "enforced and graded: candidate cannot rewrite voice_interview_transcript",
      "has been evaluated"
    );
    await expectOk(
      () =>
        updateAsEmployer(gradedApp, "voice_interview_transcript = $2::jsonb", [
          JSON.stringify([{ role: "user", content: "employer edit" }]),
        ]),
      "employer stays unrestricted on voice_interview_transcript with the flag on"
    );

    await setFlag("voiceInterviewResult", false);
  });

  // ==========================================================================
  console.log("\n== 5. phase: blocked entirely once enforced, no exception ==");
  await guardedSection("5. phase", async () => {
    await setFlag("phase", true);

    const appId = await newApplication("pending", { phase: "typing_test" });
    await expectFail(
      () => updateAsCandidate(appId, "phase = $2", ["video_intro"]),
      "enforced: candidate cannot advance phase at all",
      "Candidates cannot change application phase"
    );
    await expectFail(
      () => updateAsCandidate(appId, "phase = $2", ["decision"]),
      "enforced: candidate cannot self-advance into the synthetic decision stage either"
    );
    await expectOk(
      () => updateAsEmployer(appId, "phase = $2", ["video_intro"]),
      "employer stays unrestricted on phase with the flag on"
    );
    await expectOk(
      () => updateAsService(appId, "phase = $2", ["decision"]),
      "service_role stays unrestricted on phase with the flag on"
    );

    await setFlag("phase", false);
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
