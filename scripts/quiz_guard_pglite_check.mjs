/**
 * PGlite harness for supabase/migrations/20260915110000_quiz_answer_keys_server_side.sql
 *
 * Loads the REAL migration file (no copy, no paraphrase) into an in-memory
 * Postgres (PGlite) with a minimal schema standing in for the live tables
 * this migration touches (public.jobs, public.applications,
 * public.team_members) plus the two pre-existing SECURITY DEFINER helpers
 * the migration's policies/trigger call by name (public.is_job_owner,
 * public.is_active_team_member_for_job — copied verbatim from
 * supabase/migrations/20260715014000_break_jobs_applications_rls_recursion.sql,
 * the migration that defines them on the live DB) and proves, against that
 * real file, every behavior the orchestrator asked for:
 *
 *   - application submit in_progress -> pending succeeds
 *   - auto-mode phase -> 'decision' (a synthetic id never present in a job's
 *     own workflow_steps) succeeds
 *   - every status value a candidate page writes today succeeds
 *   - candidate -> interview / offered / hired fails, for every current
 *     status
 *   - candidate can't touch status at all once it's rejected/offered/hired
 *   - candidate edits to quizResult, a quiz notes entry, or any AI/score
 *     column (ai_score, ai_scorecard, ai_analysis, resume_score,
 *     voice_interview_result) fail — voice_interview_transcript stays
 *     candidate-writable on purpose (self-reported, not a score)
 *   - candidate edits to job_id / candidate_id / rejected_by /
 *     rejected_by_type fail
 *   - employer (job owner), an active team member, and service_role remain
 *     unrestricted for every one of the above
 *   - submit_quiz_attempt grades multiple_choice (numeric key, string key,
 *     missing key), multi_select (full credit, partial credit), and passes
 *     text/fit questions through ungraded — matching the old client's
 *     calculateResults()/handleSubmit() rules
 *   - submit_quiz_attempt's one-shot resubmission guard raises on a second
 *     call, and a retake (clearing notes[stepId]/notes.quizResult, exactly
 *     what move_applicant_to_phase now does) lets it grade again
 *   - the answer key never lands in applications.notes
 *   - submit_voice_interview_manual_end always returns/persists the same
 *     fixed "needs manual review" result regardless of caller input (no
 *     score/recommendation parameter exists to forge), computes
 *     candidate_turns/ava_turns from the supplied transcript, is one-shot
 *     per its own transaction-local guard bypass (a direct candidate write
 *     to voice_interview_result still fails immediately afterward), and
 *     refuses a caller who isn't the application's own candidate
 *
 * WHAT'S STUBBED, AND WHY IT'S STILL A FAIR TEST: PGlite has no Supabase
 * `auth` schema and every statement here runs as its single superuser role,
 * so real Row Level Security policies never fire either way (matching how
 * this migration's own comments describe RLS: "Candidates can update their
 * own applications" has no column restriction — the trigger under test IS
 * the restriction, not RLS). auth.uid()/auth.role() are re-implemented here
 * to read plain session GUCs (test.uid / test.role) that this script sets
 * before each statement, instead of the request.jwt.claim.* GUCs PostgREST
 * actually sets — the trigger code never inspects where those functions get
 * their value from, only what they return, so this exercises the exact same
 * branches (including the auth.role() = 'service_role' branch used by
 * trigger-ava-analysis/autopilot-batch/ava-voice-tools, all three of which
 * call createClient() with SUPABASE_SERVICE_ROLE_KEY — confirmed by grep
 * before writing this harness). This script does not attempt to prove RLS
 * itself (e.g. that job_quiz_keys has no candidate SELECT policy) — that
 * surface didn't change this round.
 *
 * Run: node scripts/quiz_guard_pglite_check.mjs
 * Needs @electric-sql/pglite (installed --no-save for this check only; it
 * is a verification tool, not a runtime dependency of the app).
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import process from "node:process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATION_PATH = path.join(
  ROOT,
  "supabase/migrations/20260915110000_quiz_answer_keys_server_side.sql"
);

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

async function main() {
  const db = new PGlite();
  const migrationSql = await readFile(MIGRATION_PATH, "utf8");

  // --------------------------------------------------------------------
  // Minimal schema stand-in for the live tables/helpers this migration
  // depends on or touches.
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
    -- migration file's policies/trigger resolve against the real logic.
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
  // The real migration file under test, unmodified.
  // --------------------------------------------------------------------
  await db.exec(migrationSql);
  console.log("Loaded real migration file OK.\n");

  // --------------------------------------------------------------------
  // Test fixtures
  // --------------------------------------------------------------------
  const employerId = randomUUID();
  const teamMemberId = randomUUID();
  const candidateId = randomUUID();

  const quizQuestions = [
    { id: "q1", type: "multiple_choice", question: "Q1", options: ["A", "B", "C"], correct_answer: 1 },
    { id: "q2", type: "multiple_choice", question: "Q2", options: ["Red", "Blue", "Green"], correct_answer: "Blue" },
    { id: "q3", type: "multiple_choice", question: "Q3 (no key on file)", options: ["X", "Y"] },
    { id: "q4", type: "multi_select", question: "Q4", options: ["Red", "Blue", "Green", "Yellow"], correct_answers: ["Red", "Blue"] },
    { id: "q5", type: "multi_select", question: "Q5 (partial)", options: ["Red", "Blue", "Green", "Yellow"], correct_answers: ["Red", "Blue"] },
    { id: "q6", type: "text", question: "Q6 open-ended" },
    { id: "q7", type: "personality", question: "Q7 fit", options: ["Introvert", "Extrovert"], fit_context: "internal rubric note" },
  ];

  const jobRow = await db.query(
    `INSERT INTO public.jobs (employer_id, workflow_steps, passing_score, processing_mode)
     VALUES ($1, $2::jsonb, 60, 'auto')
     RETURNING id`,
    [
      employerId,
      JSON.stringify([
        { id: "quiz", type: "quiz", config: { questions: quizQuestions } },
        { id: "video", type: "video_intro" },
      ]),
    ]
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

  async function updateAsCandidate(appId, setSql, params, uid = candidateId) {
    await actAs(uid, "authenticated");
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

  console.log("== 1. Legitimate candidate flows the old allow-list broke ==");

  {
    const appId = await newApplication("in_progress");
    await expectOk(
      () => updateAsCandidate(appId, "status = $2, notes = $3", ["pending", JSON.stringify({ applicationAnswers: [] })]),
      "ApplicationFormPhase submit: in_progress -> pending succeeds"
    );
  }

  {
    const appId = await newApplication("pending");
    await expectOk(
      () => updateAsCandidate(appId, "phase = $2", ["decision"]),
      "auto-mode phase -> synthetic 'decision' stage succeeds (not in job.workflow_steps)"
    );
  }

  for (const statusValue of ["pending", "reviewing"]) {
    const appId = await newApplication("pending");
    await expectOk(
      () => updateAsCandidate(appId, "status = $2", [statusValue]),
      `candidate-page status write "${statusValue}" succeeds`
    );
  }

  {
    // TypingTestPhase.tsx's auto-mode write: phase/status resent unchanged.
    const appId = await newApplication("pending", { phase: "typing" });
    await expectOk(
      () => updateAsCandidate(appId, "phase = $2, status = $3, notes = $4", ["typing", "pending", JSON.stringify({ typingTestResult: { wpm: 80 } })]),
      "TypingTestPhase same-value phase/status passthrough succeeds"
    );
  }

  console.log("\n== 2. Deny-list: status ==");

  for (const target of ["interview", "offered", "hired"]) {
    const appId = await newApplication("pending");
    await expectFail(
      () => updateAsCandidate(appId, "status = $2", [target]),
      `candidate -> ${target} fails`,
      `set application status to ${target}`
    );
  }

  for (const lockedFrom of ["rejected", "offered", "hired"]) {
    const appId = await newApplication(lockedFrom);
    await expectFail(
      () => updateAsCandidate(appId, "status = $2", ["reviewing"]),
      `candidate cannot change status once it is ${lockedFrom}`,
      `once it is ${lockedFrom}`
    );
  }

  console.log("\n== 3. Deny-list: AI/score columns, job_id, candidate_id, rejected_by(_type) ==");

  const columnDenials = [
    ["ai_score = $2", [99], "ai_score"],
    ["ai_scorecard = $2::jsonb", ['{"overallScore":99}'], "ai_scorecard"],
    ["ai_analysis = $2", ["I am great"], "ai_analysis"],
    ["resume_score = $2", [99], "resume_score"],
    [
      "voice_interview_result = $2::jsonb",
      ['{"overall_score":100,"recommendation":"strong_hire","credibility_rating":"Excellent"}'],
      "voice_interview_result",
    ],
    ["job_id = $2::uuid", [randomUUID()], "job_id"],
    ["candidate_id = $2::uuid", [randomUUID()], "candidate_id"],
    ["rejected_by = $2::uuid", [randomUUID()], "rejected_by"],
    ["rejected_by_type = $2", ["ai"], "rejected_by_type"],
  ];
  for (const [setSql, params, col] of columnDenials) {
    const appId = await newApplication("pending");
    await expectFail(
      () => updateAsCandidate(appId, setSql, params),
      `candidate cannot change ${col}`
    );
  }

  console.log("\n== 4. Deny-list: quizResult and quiz notes entries ==");

  {
    const appId = await newApplication("pending", { notes: "{}" });
    await expectFail(
      () =>
        updateAsCandidate(appId, "notes = $2", [
          JSON.stringify({ quizResult: { score: 100, correct: 7, total: 7, passed: true } }),
        ]),
      "candidate cannot write notes.quizResult directly"
    );
  }

  {
    const appId = await newApplication("pending", { notes: "{}" });
    await expectFail(
      () =>
        updateAsCandidate(appId, "notes = $2", [
          JSON.stringify({ quiz: { type: "quiz", score: 100, answers: [] } }),
        ]),
      "candidate cannot write a notes entry with type \"quiz\""
    );
  }

  {
    // Non-quiz notes keys stay freely writable (typing/chat/portfolio/etc).
    const appId = await newApplication("pending", { notes: "{}" });
    await expectOk(
      () =>
        updateAsCandidate(appId, "notes = $2", [
          JSON.stringify({ typingTestResult: { wpm: 80 }, portfolioResult: { overallScore: 90 } }),
        ]),
      "candidate can still write non-quiz notes keys freely"
    );
  }

  console.log("\n== 5. Employer / team member / service_role stay unrestricted ==");

  for (const [label, uid, role] of [
    ["job owner", employerId, "authenticated"],
    ["active team member", teamMemberId, "authenticated"],
    ["service_role", randomUUID(), "service_role"],
  ]) {
    const appId = await newApplication("rejected");
    await expectOk(
      () => updateAsCandidate(appId, "status = $2, ai_score = $3, voice_interview_result = $4::jsonb, notes = $5", ["interview", 88, '{"overall_score":95}', JSON.stringify({ quizResult: { score: 100, correct: 7, total: 7, passed: true } })], uid),
      `${label} can set status->interview, ai_score, voice_interview_result, and notes.quizResult even from status='rejected'`
    );
  }

  console.log("\n== 5b. voice_interview_transcript stays candidate-writable (self-reported, not a score) ==");
  {
    const appId = await newApplication("pending");
    await expectOk(
      () => updateAsCandidate(appId, "voice_interview_transcript = $2::jsonb", ['[{"role":"user","content":"hi"}]']),
      "candidate can still write voice_interview_transcript directly"
    );
  }

  console.log("\n== 6. submit_quiz_attempt grading ==");

  {
    const appId = await newApplication("pending", { phase: "quiz" });
    await actAs(candidateId, "authenticated");
    const answers = {
      q1: 1, // correct (numeric key)
      q2: 1, // correct (string key "Blue" matched by option text)
      q3: 0, // key has no correct_answer on file -> never correct
      q4: [0, 1], // full credit
      q5: [0], // partial credit (any overlap, not all/no-extras)
      q6: "free text answer",
      q7: 1,
    };
    const result = await db.query(
      `SELECT public.submit_quiz_attempt($1, 'quiz', $2::jsonb, '[]'::jsonb) AS r`,
      [appId, JSON.stringify(answers)]
    );
    const r = result.rows[0].r;
    ok(r.score === 70, `score_pct is 70 (got ${r.score})`);
    ok(Number(r.correct) === 3.5, `correct total is 3.5 (got ${r.correct})`);
    ok(r.total === 5, `scored_total excludes text/fit questions (got ${r.total})`);
    ok(r.passed === true, `70 >= passing_score 60 -> passed (got ${r.passed})`);

    const appRow = (await db.query(`SELECT notes FROM public.applications WHERE id = $1`, [appId])).rows[0];
    const notes = JSON.parse(appRow.notes);
    ok(notes.quizResult.score === 70 && notes.quizResult.correct === 3.5 && notes.quizResult.total === 5, "notes.quizResult mirrors the RPC result");
    const raw = appRow.notes;
    // correct_answer / correct_answers / fit_context are the actual
    // answer-key field names and must never appear at all. `correctAnswer`
    // (camelCase) IS a key the text/fit branches legitimately write — but
    // only ever as a literal null, never the real key value; checked below
    // per-answer instead of as a raw substring.
    for (const forbidden of ["correct_answer", "correct_answers", "fit_context"]) {
      ok(!raw.includes(forbidden), `answer key field "${forbidden}" never appears in applications.notes`);
    }
    const quizAnswers = notes.quiz.answers;
    ok(
      quizAnswers.every((a) => !("correctAnswer" in a) || a.correctAnswer === null),
      "every answer's correctAnswer key (where present) is null, never a real key value"
    );

    await expectFail(
      () => db.query(`SELECT public.submit_quiz_attempt($1, 'quiz', $2::jsonb, '[]'::jsonb) AS r`, [appId, JSON.stringify(answers)]),
      "resubmission guard: second submit_quiz_attempt call on the same step fails",
      "already been submitted"
    );

    // Retake: move_applicant_to_phase's clearing of notes[stepId]/quizResult
    // — a write ava-voice-tools makes as service_role, not the candidate
    // (protect_application_columns denies the candidate's own writes to
    // notes.quizResult, by design — only an employer/Ava decides a retake
    // is warranted).
    const cleared = { ...notes };
    delete cleared.quiz;
    delete cleared.quizResult;
    await actAs(null, "service_role");
    await db.query(`UPDATE public.applications SET notes = $2 WHERE id = $1`, [appId, JSON.stringify(cleared)]);
    await actAs(candidateId, "authenticated");
    await expectOk(
      () => db.query(`SELECT public.submit_quiz_attempt($1, 'quiz', $2::jsonb, '[]'::jsonb) AS r`, [appId, JSON.stringify(answers)]),
      "after a retake-clear, submit_quiz_attempt grades again"
    );
  }

  {
    // Candidate cannot grade someone else's application.
    const appId = await newApplication("pending", { phase: "quiz" });
    await actAs(randomUUID(), "authenticated");
    await expectFail(
      () => db.query(`SELECT public.submit_quiz_attempt($1, 'quiz', '{}'::jsonb, '[]'::jsonb) AS r`, [appId]),
      "submit_quiz_attempt refuses a caller who isn't the application's candidate",
      "Not authorized"
    );
  }

  console.log("\n== 7. submit_voice_interview_manual_end (manual-end fallback, server-graded) ==");

  {
    const appId = await newApplication("pending");
    await actAs(candidateId, "authenticated");
    const transcript = [
      { role: "user", content: "Hi, this is me." },
      { role: "assistant", content: "Hello!" },
      { role: "user", content: "" }, // blank turns don't count
    ];
    const result = await db.query(
      `SELECT public.submit_voice_interview_manual_end($1, $2::jsonb, $3) AS r`,
      [appId, JSON.stringify(transcript), 42]
    );
    const r = result.rows[0].r;
    ok(r.overall_score === null, `overall_score is null, not attacker-influenceable (got ${r.overall_score})`);
    ok(r.recommendation === "review", `recommendation is fixed "review" (got ${r.recommendation})`);
    ok(r.credibility_rating === "manual_review_required", `credibility_rating is fixed (got ${r.credibility_rating})`);
    ok(r.candidate_turns === 1, `candidate_turns counted from transcript (got ${r.candidate_turns})`);
    ok(r.ava_turns === 1, `ava_turns counted from transcript (got ${r.ava_turns})`);
    ok(r.duration_seconds === 42, `duration_seconds passed through (got ${r.duration_seconds})`);

    const appRow = (await db.query(
      `SELECT voice_interview_result, voice_interview_transcript FROM public.applications WHERE id = $1`,
      [appId]
    )).rows[0];
    ok(
      appRow.voice_interview_result.recommendation === "review",
      "voice_interview_result was actually persisted by the RPC (transaction-local guard bypass worked)"
    );
    ok(
      JSON.stringify(appRow.voice_interview_transcript) === JSON.stringify(transcript),
      "voice_interview_transcript was persisted by the RPC"
    );

    // The RPC never accepts a score/recommendation parameter at all — there
    // is no way to pass one in. Confirm a direct candidate write is still
    // denied immediately afterward (no residual bypass window).
    await expectFail(
      () => updateAsCandidate(appId, "voice_interview_result = $2::jsonb", ['{"overall_score":100}']),
      "candidate still cannot forge voice_interview_result after a manual-end submission"
    );
  }

  {
    // Candidate cannot manual-end someone else's application.
    const appId = await newApplication("pending");
    await actAs(randomUUID(), "authenticated");
    await expectFail(
      () => db.query(`SELECT public.submit_voice_interview_manual_end($1, '[]'::jsonb, 10) AS r`, [appId]),
      "submit_voice_interview_manual_end refuses a caller who isn't the application's candidate",
      "Not authorized"
    );
  }

  console.log("\n== 8. job_quiz_keys extraction (still intact) ==");
  {
    const keys = await db.query(
      `SELECT step_id, question_id, key FROM public.job_quiz_keys WHERE job_id = $1 ORDER BY question_id`,
      [jobId]
    );
    ok(keys.rows.length === 5, `job_quiz_keys holds the 5 answer-bearing questions (got ${keys.rows.length})`);
    const jobRowAfter = (await db.query(`SELECT workflow_steps FROM public.jobs WHERE id = $1`, [jobId])).rows[0];
    const stepsRaw = JSON.stringify(jobRowAfter.workflow_steps);
    for (const forbidden of ["correct_answer", "correctAnswer", "correct_answers", "fit_context"]) {
      ok(!stepsRaw.includes(forbidden), `jobs.workflow_steps no longer carries "${forbidden}"`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  await db.close();
  if (fail > 0) {
    console.log("\nFailures:\n - " + failures.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Harness crashed:", e);
  process.exit(1);
});
