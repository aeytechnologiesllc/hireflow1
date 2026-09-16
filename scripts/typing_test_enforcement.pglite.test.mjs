#!/usr/bin/env node
/**
 * PGlite proof for
 * supabase/migrations/20260916150100_enforce_typing_test_result.sql — real
 * Postgres (via PGlite), not a text match. Loads the REAL migration files
 * off disk, in deploy order: 20260915110000_quiz_answer_keys_server_side.sql
 * (defines protected_application_notes_subset / the baseline
 * protect_application_columns()), 20260915140000_trusted_step_results.sql
 * (the foundation — trusted_result_enforcement, the extended trigger), and
 * this phase's own 20260916150100_enforce_typing_test_result.sql (creates
 * typing_test_starts, flips ONLY 'typingTestResult' to enforced = true).
 *
 * Proves, with the migration's OWN flip already applied (not a flag this
 * test flips itself — this migration ships with typingTestResult already
 * enforced = true, the same state it will be in once deployed):
 *
 *   1. typingTestResult is enforced = true; every OTHER result_key
 *      (including 'phase') is still enforced = false — this migration
 *      touches its own row only.
 *   2. A candidate's direct write of notes.typingTestResult is refused.
 *   3. A candidate's direct write of a legacy by-id entry — any key whose
 *      value has `type: "typing_test"` — is refused too (the trigger
 *      matches by TYPE, not just by the literal "typingTestResult" key
 *      name).
 *   4. A candidate's direct write under a differently-cased key name
 *      (`TypingTestResult`, `typingtestresult`) is refused the same way —
 *      "extra" forged spellings of the same protected slot, not just the
 *      one exact casing every reader happens to use today.
 *   5. The service-role admin client (submit-typing-test's own writer)
 *      still succeeds — protect_application_columns exempts
 *      auth.role() = 'service_role' unconditionally.
 *   6. Every OTHER phase's own result_key notes entry
 *      (chatSimulationResult, chatInterviewResult, salesSimulationResult,
 *      portfolioResult, videoIntroResult + its videoIntroUrl legacy flat
 *      key, voiceInterviewResult) is still freely candidate-writable —
 *      converting typing_test did not touch any other phase's gate.
 *   7. applications.phase itself is still freely candidate-writable — the
 *      global 'phase' flag stays off until every part-B phase is done (see
 *      docs/TRUSTED-RESULTS.md); this migration must not have flipped it.
 *   8. typing_test_starts is genuinely server-only: with real Postgres
 *      role switching (not just the auth.uid()/auth.role() GUC shim the
 *      trigger checks above use) and Supabase's own default
 *      GRANT ... TO anon, authenticated, service_role mirrored so a denial
 *      is provably RLS (zero policies), not a missing table GRANT — anon
 *      and authenticated (including the row's own application's
 *      candidate) get zero rows on SELECT and a denied INSERT/UPDATE
 *      (covering both started_at and ended_at — a candidate can't rewind
 *      the start OR fake an early end-of-typing instant); service_role
 *      (BYPASSRLS, matching the real Supabase service key) can insert,
 *      stamp ended_at ("complete"), upsert by (application_id, step_id)
 *      resetting ended_at back to null on a "Try again" retry, and select
 *      freely.
 *   9. Re-running the migration file a second time does not error
 *      (CREATE TABLE/INDEX IF NOT EXISTS, and the flip is a plain UPDATE).
 *
 * Run with: node scripts/typing_test_enforcement.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const QUIZ_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915110000_quiz_answer_keys_server_side.sql");
const FOUNDATION_MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915140000_trusted_step_results.sql");
const MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260916150100_enforce_typing_test_result.sql");

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
  // Fixture: the trigger-facing auth.uid()/auth.role() GUC shim (same as
  // scripts/trusted_step_results.pglite.test.mjs) PLUS real Postgres roles
  // with BYPASSRLS on service_role and Supabase's own default table grants
  // (same as scripts/voice_session_log.pglite.test.mjs) — this migration
  // needs both: protect_application_columns() reads the GUC shim, while
  // typing_test_starts' own bare RLS-with-zero-policies needs genuine
  // `SET ROLE` switching to prove anything about who is denied.
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

    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT authenticated TO postgres;
    GRANT anon TO postgres;
    GRANT service_role TO postgres;

    CREATE TYPE application_status AS ENUM (
      'pending', 'reviewing', 'interview', 'offered', 'hired', 'rejected', 'in_progress'
    );

    CREATE TABLE public.jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      employer_id uuid NOT NULL,
      quiz_questions jsonb,
      workflow_steps jsonb,
      passing_score int DEFAULT 60,
      required_wpm int DEFAULT 40,
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
  await db.exec(migrationSql);
  console.log("Loaded all three real migration files OK.\n");

  // Mirror Supabase's own default grants (also done by every other RLS
  // proof in this repo, e.g. voice_session_log.pglite.test.mjs) so a denial
  // on typing_test_starts is provably RLS, not a missing table GRANT.
  await db.exec(`
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
  `);

  const employerId = randomUUID();
  const candidateId = randomUUID();
  const strangerId = randomUUID();

  const jobRow = await db.query(
    `INSERT INTO public.jobs (employer_id, processing_mode) VALUES ($1, 'auto') RETURNING id`,
    [employerId],
  );
  const jobId = jobRow.rows[0].id;

  /** Sets both the GUC shim protect_application_columns() reads AND does a
   *  real `SET ROLE` so typing_test_starts' own bare RLS is genuinely
   *  exercised too. `pgRole` defaults to 'authenticated' for any
   *  non-service caller — anon calls set it explicitly. */
  async function actAs(uid, testRole, pgRole) {
    await db.exec(`RESET ROLE`);
    await db.query(`SELECT set_config('test.uid', $1, false), set_config('test.role', $2, false)`, [
      uid ?? "",
      testRole ?? "",
    ]);
    if (pgRole) await db.exec(`SET ROLE ${pgRole}`);
  }

  async function newApplication(status = "in_progress", extra = {}) {
    const cols = ["job_id", "candidate_id", "status", ...Object.keys(extra)];
    const vals = [jobId, candidateId, status, ...Object.values(extra)];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const r = await db.query(
      `INSERT INTO public.applications (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
      vals,
    );
    return r.rows[0].id;
  }

  async function updateAsCandidate(appId, setSql, params) {
    await actAs(candidateId, "authenticated", "authenticated");
    return db.query(`UPDATE public.applications SET ${setSql} WHERE id = $1`, [appId, ...params]);
  }

  async function updateAsService(appId, setSql, params) {
    await actAs(null, "service_role", "service_role");
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
  console.log("== 1. Enforcement flags: typingTestResult on, every other row still off ==");
  await guardedSection("1. flags", async () => {
    await actAs(null, "service_role", "service_role");
    const rows = await db.query(`SELECT result_key, enforced FROM public.trusted_result_enforcement ORDER BY result_key`);
    ok(rows.rows.length === 8, `seeded exactly 8 rows (got ${rows.rows.length})`);
    const byKey = Object.fromEntries(rows.rows.map((r) => [r.result_key, r.enforced]));
    ok(byKey.typingTestResult === true, "typingTestResult is enforced = true");
    for (const otherKey of [
      "chatSimulationResult", "chatInterviewResult", "salesSimulationResult",
      "portfolioResult", "videoIntroResult", "voiceInterviewResult", "phase",
    ]) {
      ok(byKey[otherKey] === false, `${otherKey} is still enforced = false (untouched by this migration)`);
    }
  });

  // ==========================================================================
  console.log("\n== 2. Candidate cannot write notes.typingTestResult directly ==");
  await guardedSection("2. exact key", async () => {
    const appId = await newApplication("pending", {
      notes: JSON.stringify({ typingTestResult: { wpm: 40, accuracy: 90, score: 80 } }),
    });
    await expectFail(
      () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({ typingTestResult: { wpm: 999, accuracy: 100, score: 100 } })]),
      "candidate cannot forge a higher notes.typingTestResult",
      "Candidates cannot edit a trusted step result directly",
    );
    await expectFail(
      () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({})]),
      "candidate cannot REMOVE notes.typingTestResult either",
      "Candidates cannot edit a trusted step result directly",
    );
  });

  // ==========================================================================
  console.log("\n== 3. Legacy by-id entry (type: 'typing_test' under any key) is refused too ==");
  await guardedSection("3. legacy by-id", async () => {
    const appId = await newApplication("pending", {
      notes: JSON.stringify({ "step-typing-1": { type: "typing_test", wpm: 40, completedAt: "2026-09-16T00:00:00Z" } }),
    });
    await expectFail(
      () =>
        updateAsCandidate(appId, "notes = $2", [
          JSON.stringify({ "step-typing-1": { type: "typing_test", wpm: 999, completedAt: "2026-09-16T00:00:01Z" } }),
        ]),
      "candidate cannot forge a stepId-keyed entry whose type is 'typing_test'",
      "Candidates cannot edit a trusted step result directly",
    );
  });

  // ==========================================================================
  console.log("\n== 4. Different casings of the same key are refused the same way ==");
  await guardedSection("4. casing", async () => {
    for (const forgedKey of ["TypingTestResult", "typingtestresult", "TYPINGTESTRESULT"]) {
      const appId = await newApplication("pending");
      await expectFail(
        () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({ [forgedKey]: { wpm: 999 } })]),
        `candidate cannot use casing "${forgedKey}" to smuggle a typing test result past the guard`,
        "Candidates cannot edit a trusted step result directly",
      );
    }
  });

  // ==========================================================================
  console.log("\n== 5. service_role still succeeds (submit-typing-test's own writer) ==");
  await guardedSection("5. service role", async () => {
    const appId = await newApplication("pending");
    await expectOk(
      () =>
        updateAsService(appId, "notes = $2", [
          JSON.stringify({
            typingTestResult: { wpm: 52, accuracy: 96, score: 88, passed: false, requiredWpm: 40, tabSwitches: 0, violations: [] },
            "step-typing-1": { type: "typing_test", wpm: 52, completedAt: new Date().toISOString() },
          }),
        ]),
      "service_role can write notes.typingTestResult + the legacy by-id entry together",
    );
    await expectOk(
      () => updateAsService(appId, "phase = $2, status = $3", ["next-step", "reviewing"]),
      "service_role can still advance phase/status (recordStepResult's own write)",
    );
  });

  // ==========================================================================
  console.log("\n== 6. Every OTHER phase's own result_key is unaffected ==");
  await guardedSection("6. other phases untouched", async () => {
    const otherKeys = [
      "chatSimulationResult", "chatInterviewResult", "salesSimulationResult",
      "portfolioResult", "videoIntroResult", "voiceInterviewResult",
    ];
    for (const notesKey of otherKeys) {
      const appId = await newApplication("pending");
      await expectOk(
        () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({ [notesKey]: { score: 91 } })]),
        `typingTestResult enforced does not block candidate writes to notes.${notesKey}`,
      );
    }
    // video_intro's flat legacy key (autopilot-batch/index.ts:129,
    // usePendingActionsCount.ts:77) — still untouched, same as every other
    // still-unenforced key.
    {
      const appId = await newApplication("pending");
      await expectOk(
        () => updateAsCandidate(appId, "notes = $2", [JSON.stringify({ videoIntroUrl: "https://example.com/v.webm" })]),
        "typingTestResult enforced does not block candidate writes to notes.videoIntroUrl",
      );
    }
  });

  // ==========================================================================
  console.log("\n== 7. applications.phase is still freely candidate-writable ==");
  await guardedSection("7. phase untouched", async () => {
    const appId = await newApplication("pending", { phase: "typing_test" });
    await expectOk(
      () => updateAsCandidate(appId, "phase = $2", ["video_intro"]),
      "candidate can still change phase directly — the global 'phase' flag was not flipped by this migration",
    );
  });

  // ==========================================================================
  console.log("\n== 8. typing_test_starts is genuinely server-only ==");
  await guardedSection("8. typing_test_starts RLS", async () => {
    const appId = await newApplication("pending");

    await actAs(null, "service_role", "service_role");
    const mint = await db.query(
      `INSERT INTO public.typing_test_starts (application_id, step_id, target_text) VALUES ($1, $2, $3) RETURNING id`,
      [appId, "step-typing-1", "The quick brown fox."],
    );
    ok(mint.rows.length === 1, "service_role can insert a typing_test_starts row (the 'start' action)");
    const startId = mint.rows[0]?.id;

    // anon: zero rows, denied write.
    await actAs(null, "", "anon");
    const anonSelect = await db.query(`SELECT * FROM public.typing_test_starts WHERE id = $1`, [startId]);
    ok(anonSelect.rows.length === 0, "anon SELECT sees zero typing_test_starts rows (RLS, no policy for anon)");
    let anonInsertDenied = false;
    try {
      await db.query(
        `INSERT INTO public.typing_test_starts (application_id, step_id, target_text) VALUES ($1, $2, $3)`,
        [appId, "step-typing-forged", "forged"],
      );
    } catch {
      anonInsertDenied = true;
    }
    ok(anonInsertDenied, "anon INSERT into typing_test_starts is denied (RLS, no policy for anon)");

    // authenticated, including the row's OWN application's candidate: same
    // zero rows / denied write — this table has no candidate-facing policy
    // at all, by design (submit-typing-test's service-role client is the
    // only legitimate reader/writer).
    await actAs(candidateId, "authenticated", "authenticated");
    const ownerSelect = await db.query(`SELECT * FROM public.typing_test_starts WHERE id = $1`, [startId]);
    ok(
      ownerSelect.rows.length === 0,
      "even the application's own candidate gets zero rows on SELECT (server-only, same as voice_session_log/quiz_attempt_ledger)",
    );
    let ownerUpdateBlocked = false;
    const ownerUpdate = await db.query(
      `UPDATE public.typing_test_starts SET started_at = now() WHERE id = $1 RETURNING id`,
      [startId],
    );
    ownerUpdateBlocked = ownerUpdate.rows.length === 0;
    ok(ownerUpdateBlocked, "the candidate cannot rewind their own started_at (RLS blocks the UPDATE, matches zero rows)");
    // Same RLS coverage for ended_at ("complete"'s own column, the fix for
    // the think-time bug) — a candidate can't fake an earlier end-of-typing
    // instant (to shrink elapsed time / inflate wpm) any more than they can
    // rewind started_at.
    const ownerEndedAtUpdate = await db.query(
      `UPDATE public.typing_test_starts SET ended_at = now() WHERE id = $1 RETURNING id`,
      [startId],
    );
    ok(
      ownerEndedAtUpdate.rows.length === 0,
      "the candidate cannot stamp their own ended_at either (RLS blocks the UPDATE, matches zero rows) — 'complete' is service-role only",
    );
    let ownerInsertDenied = false;
    try {
      await db.query(
        `INSERT INTO public.typing_test_starts (application_id, step_id, target_text) VALUES ($1, $2, $3)`,
        [appId, "step-typing-2", "a candidate cannot mint their own start row either"],
      );
    } catch {
      ownerInsertDenied = true;
    }
    ok(ownerInsertDenied, "the candidate cannot insert their own typing_test_starts row either");

    // An unrelated authenticated user gets the same zero-rows treatment.
    await actAs(strangerId, "authenticated", "authenticated");
    const strangerSelect = await db.query(`SELECT * FROM public.typing_test_starts WHERE id = $1`, [startId]);
    ok(strangerSelect.rows.length === 0, "an unrelated authenticated user also sees zero rows");

    // service_role can stamp ended_at — the "complete" action, called the
    // instant typing actually stops. Only ever set once: the fix's whole
    // point is that this timestamp, not whenever "submit" later arrives,
    // is what elapsed time gets measured against.
    await actAs(null, "service_role", "service_role");
    const completeUpdate = await db.query(
      `UPDATE public.typing_test_starts SET ended_at = now() WHERE id = $1 AND ended_at IS NULL RETURNING id, ended_at`,
      [startId],
    );
    ok(completeUpdate.rows.length === 1 && completeUpdate.rows[0].ended_at !== null, "service_role can stamp ended_at ('complete') for a genuine start row");
    const afterComplete = await db.query(`SELECT ended_at FROM public.typing_test_starts WHERE id = $1`, [startId]);
    ok(afterComplete.rows[0].ended_at !== null, "ended_at is now set on the row submit-typing-test's 'submit' leg will read");

    // service_role can upsert on (application_id, step_id) — a "Try again"
    // retry legitimately resets started_at + target_text for the same step,
    // AND must reset ended_at back to null too (the fix for a bug where a
    // stale ended_at from a completed-but-abandoned attempt would otherwise
    // survive into the next attempt's own started_at, corrupting its
    // elapsed-time measurement).
    const restart = await db.query(
      `INSERT INTO public.typing_test_starts (application_id, step_id, target_text, started_at, ended_at)
       VALUES ($1, $2, $3, now(), NULL)
       ON CONFLICT (application_id, step_id) DO UPDATE SET target_text = EXCLUDED.target_text, started_at = EXCLUDED.started_at, ended_at = EXCLUDED.ended_at
       RETURNING id, target_text, ended_at`,
      [appId, "step-typing-1", "Customer service is about creating positive experiences."],
    );
    ok(restart.rows.length === 1 && restart.rows[0].id === startId, "restarting the same step upserts the SAME row (unique on application_id, step_id)");
    ok(
      restart.rows[0].target_text === "Customer service is about creating positive experiences.",
      "the upsert really did replace the passage text",
    );
    ok(
      restart.rows[0].ended_at === null,
      "restarting ('Try again') really does clear the previous attempt's ended_at — a stale completion timestamp cannot leak into the new attempt's elapsed-time measurement",
    );

    const countAfter = await db.query(`SELECT count(*)::int AS n FROM public.typing_test_starts WHERE application_id = $1`, [appId]);
    ok(countAfter.rows[0].n === 1, "still exactly one row for this application+step after the upsert — no duplicate");
  });

  // ==========================================================================
  console.log("\n== 9. Re-running this migration is idempotent ==");
  await guardedSection("9. idempotent", async () => {
    // Runs as the actual schema owner (postgres) — DDL like CREATE TABLE
    // isn't something the service_role GRANT above hands out, exactly like
    // real migrations run as the Postgres superuser/owner, never as the
    // service_role API key.
    await db.exec(`RESET ROLE`);
    await expectOk(() => db.exec(migrationSql), "migration file can be executed a second time without error");
    const rows = await db.query(`SELECT enforced FROM public.trusted_result_enforcement WHERE result_key = 'typingTestResult'`);
    ok(rows.rows[0]?.enforced === true, "typingTestResult is still enforced = true after re-running");
  });

  console.log(failures.length ? `\n${pass} passed, ${fail} failed:\n  - ${failures.join("\n  - ")}` : `\n${pass} passed, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error running PGlite proof:", err);
  process.exit(1);
});
