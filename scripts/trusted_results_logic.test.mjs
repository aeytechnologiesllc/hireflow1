#!/usr/bin/env node
/**
 * Local test runner for supabase/functions/_shared/trustedResults.ts's pure
 * decision logic — plain assertions, no framework, same style as
 * scripts/step_gate.test.mjs. Runs directly against the REAL server file (no
 * copy), which is itself guarded against drifting from
 * src/lib/candidateJourney.ts by scripts/guards/candidate-journey-shared-copy.mjs
 * — so this file only needs to exercise trustedResults.ts's OWN logic
 * (hasReachedStep, computeNextStepDecision, nextStepForCandidate,
 * mergeTrustedNotes), not re-prove candidateJourney.ts's own rules again
 * (step_gate.test.mjs already does that).
 *
 * Covers realistic journeys: a full auto-mode journey with a quiz, a manual-
 * mode journey without one, the synthetic "application"/"quiz"/"decision"
 * stages, and the legacy video_message/video_intro alias — plus
 * mergeTrustedNotes's own merge/overwrite/malformed-JSON behavior in
 * isolation from any database.
 *
 * Run with: node scripts/trusted_results_logic.test.mjs
 */
import {
  hasReachedStep,
  computeNextStepDecision,
  nextStepForCandidate,
  mergeTrustedNotes,
  buildTrustedNotesPatch,
  recordStepResult,
  stepResultLanded,
  planAutoAdvance,
  advanceAfterStep,
  analysisCoversStep,
  shouldScoreAfterStep,
  withoutNulCharacters,
} from "../supabase/functions/_shared/trustedResults.ts";
import { buildCandidateJourney, DECISION_STAGE_ID } from "../supabase/functions/_shared/candidateJourney.ts";

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

// ============================================================================
// Journey A — the full shape: application, quiz, typing test, voice
// interview, decision. Auto mode.
// ============================================================================
console.log("Journey A — application -> quiz -> typing_test -> voice_interview -> decision:\n");

const journeyA = buildCandidateJourney(
  [
    { id: "wf-typing", type: "typing_test", title: "Typing Test" },
    { id: "wf-voice", type: "voice_interview", title: "Interview" },
  ],
  { hasQuiz: true },
);
// [application, quiz, wf-typing, wf-voice, decision]

check(
  "hasReachedStep: candidate on 'quiz' has reached 'wf-typing'? no — one step ahead is still blocked",
  hasReachedStep(journeyA, { stepId: "wf-typing", expectedType: "typing_test", phase: "quiz", status: "pending" }).reached === false,
);
check(
  "hasReachedStep: reason is 'not_yet_reached' for a real step not yet arrived at",
  hasReachedStep(journeyA, { stepId: "wf-typing", expectedType: "typing_test", phase: "quiz", status: "pending" }).reason === "not_yet_reached",
);
check(
  "hasReachedStep: candidate exactly on 'wf-typing' has reached it",
  hasReachedStep(journeyA, { stepId: "wf-typing", expectedType: "typing_test", phase: "wf-typing", status: "pending" }).reached === true,
);
check(
  "hasReachedStep: candidate past 'wf-typing' can still revisit it",
  hasReachedStep(journeyA, { stepId: "wf-typing", expectedType: "typing_test", phase: "wf-voice", status: "pending" }).reached === true,
);
check(
  "hasReachedStep: unrecognized stepId refused with 'unrecognized_or_wrong_type_step'",
  hasReachedStep(journeyA, { stepId: "not-a-real-step", expectedType: "typing_test", phase: "wf-voice", status: "pending" }).reason ===
    "unrecognized_or_wrong_type_step",
);
check(
  "hasReachedStep: real stepId under the wrong expectedType refused the same way",
  hasReachedStep(journeyA, { stepId: "wf-typing", expectedType: "voice_interview", phase: "wf-voice", status: "pending" }).reason ===
    "unrecognized_or_wrong_type_step",
);

console.log("\nJourney A — computeNextStepDecision, auto mode:\n");

check(
  "auto mode: application -> quiz advances, status 'reviewing'",
  (() => {
    const d = computeNextStepDecision(journeyA, "application", "application", "auto");
    return d.advance === true && d.nextStep.id === "quiz" && d.nextStatus === "reviewing";
  })(),
);
check(
  "auto mode: quiz -> wf-typing advances",
  (() => {
    const d = computeNextStepDecision(journeyA, "quiz", "quiz", "auto");
    return d.advance === true && d.nextStep.id === "wf-typing";
  })(),
);
check(
  "auto mode: wf-typing's next step is voice_interview — STOPS, needs employer approval, does not advance",
  (() => {
    const d = computeNextStepDecision(journeyA, "wf-typing", "wf-typing", "auto");
    return d.advance === false && d.reason === "needs_employer_approval" && d.nextStep.id === "wf-voice";
  })(),
);
check(
  "auto mode: wf-voice's next step is the closing decision stage — advances into it (nothing left to gate)",
  (() => {
    const d = computeNextStepDecision(journeyA, "wf-voice", "wf-voice", "auto");
    return d.advance === true && d.nextStep.id === DECISION_STAGE_ID && d.nextStatus === "reviewing";
  })(),
);
check(
  "auto mode: already at the closing decision stage — no next step at all",
  (() => {
    const d = computeNextStepDecision(journeyA, DECISION_STAGE_ID, DECISION_STAGE_ID, "auto");
    return d.advance === false && d.reason === "no_next_step" && d.nextStep === null;
  })(),
);
check(
  "auto mode: currentStepId unresolved falls back to phase, same as candidateJourney's own positionFor",
  (() => {
    const d = computeNextStepDecision(journeyA, "some-stale-id", "quiz", "auto");
    return d.advance === true && d.nextStep.id === "wf-typing";
  })(),
);

console.log("\nJourney A — computeNextStepDecision, manual mode:\n");

check(
  "manual mode: never advances, even mid-journey with a clean next step",
  (() => {
    const d = computeNextStepDecision(journeyA, "quiz", "quiz", "manual");
    return d.advance === false && d.reason === "manual" && d.nextStep.id === "wf-typing";
  })(),
);
check(
  "manual mode: null/undefined processing_mode is treated as manual too (not 'auto')",
  computeNextStepDecision(journeyA, "quiz", "quiz", null).reason === "manual" &&
    computeNextStepDecision(journeyA, "quiz", "quiz", undefined).reason === "manual",
);
check(
  "manual mode: only the literal 'auto' counts as auto — 'Auto'/'AUTO' do not",
  computeNextStepDecision(journeyA, "quiz", "quiz", "Auto").reason === "manual",
);

console.log("\nnextStepForCandidate:\n");

check(
  "advance=true with a real next step (not decision) returns that step",
  (() => {
    const d = computeNextStepDecision(journeyA, "application", "application", "auto");
    const n = nextStepForCandidate(d);
    return n !== "waiting" && n.id === "quiz";
  })(),
);
check(
  "advance=true but nextStep IS the closing decision stage returns 'waiting' (nothing to click into)",
  (() => {
    const d = computeNextStepDecision(journeyA, "wf-voice", "wf-voice", "auto");
    return nextStepForCandidate(d) === "waiting";
  })(),
);
check(
  "advance=false (manual) returns 'waiting' regardless of what nextStep would have been",
  nextStepForCandidate(computeNextStepDecision(journeyA, "quiz", "quiz", "manual")) === "waiting",
);
check(
  "advance=false (needs_employer_approval) returns 'waiting'",
  nextStepForCandidate(computeNextStepDecision(journeyA, "wf-typing", "wf-typing", "auto")) === "waiting",
);
check(
  "advance=false (no_next_step) returns 'waiting'",
  nextStepForCandidate(computeNextStepDecision(journeyA, DECISION_STAGE_ID, DECISION_STAGE_ID, "auto")) === "waiting",
);

// ============================================================================
// Journey B — no quiz on this job; a portfolio step instead. Confirms the
// journey (and therefore hasReachedStep/computeNextStepDecision) genuinely
// changes shape per-job rather than assuming a fixed stage count.
// ============================================================================
console.log("\nJourney B — application -> portfolio_upload -> decision (no quiz):\n");

const journeyB = buildCandidateJourney(
  [{ id: "wf-portfolio", type: "portfolio_upload", title: "Portfolio" }],
  { hasQuiz: false },
);
// [application, wf-portfolio, decision]

check(
  "no quiz on this job: 'quiz' is not a real step here",
  hasReachedStep(journeyB, { stepId: "quiz", expectedType: "quiz", phase: "application", status: "pending" }).reason ===
    "unrecognized_or_wrong_type_step",
);
check(
  "application -> wf-portfolio advances directly (no quiz stage in between)",
  (() => {
    const d = computeNextStepDecision(journeyB, "application", "application", "auto");
    return d.advance === true && d.nextStep.id === "wf-portfolio";
  })(),
);
check(
  "wf-portfolio -> decision advances straight to the close (no voice_interview on this job)",
  (() => {
    const d = computeNextStepDecision(journeyB, "wf-portfolio", "wf-portfolio", "auto");
    return d.advance === true && d.nextStep.id === DECISION_STAGE_ID;
  })(),
);

// ============================================================================
// Journey C — legacy video_message alias. A job whose stored workflow_steps
// entry is typed "video_message" (the pre-rename value some real jobs still
// carry) must still be recordable by a part-B VideoIntroPhase conversion
// that calls recordStepResult with stepType "video_intro" (the current type
// every phase page and candidateJourney.ts's own titles use), and
// vice-versa.
// ============================================================================
console.log("\nJourney C — legacy 'video_message' step, recorded as 'video_intro':\n");

const journeyC = buildCandidateJourney(
  [{ id: "wf-video", type: "video_message", title: "Say hello" }],
  { hasQuiz: false },
);

check(
  "a stored 'video_message' step is reachable when the caller passes stepType 'video_intro'",
  hasReachedStep(journeyC, { stepId: "wf-video", expectedType: "video_intro", phase: "wf-video", status: "pending" }).reached === true,
);
check(
  "...and vice versa: a caller passing stepType 'video_message' matches too",
  hasReachedStep(journeyC, { stepId: "wf-video", expectedType: "video_message", phase: "wf-video", status: "pending" }).reached === true,
);
check(
  "...but neither alias matches an unrelated expectedType",
  hasReachedStep(journeyC, { stepId: "wf-video", expectedType: "typing_test", phase: "wf-video", status: "pending" }).reached === false,
);

// ============================================================================
// mergeTrustedNotes — pure string-in/string-out, no database involved.
// ============================================================================
console.log("\nmergeTrustedNotes:\n");

check(
  "merges into existing notes without disturbing unrelated keys",
  (() => {
    const existing = JSON.stringify({ applicationAnswers: { q1: "hi" }, otherStepResult: { x: 1 } });
    const out = JSON.parse(
      mergeTrustedNotes(
        existing,
        { stepId: "wf-typing", stepType: "typing_test", resultKey: "typingTestResult", result: { wpm: 80 } },
        "2026-09-16T00:00:00Z",
      ),
    );
    return (
      out.applicationAnswers.q1 === "hi" &&
      out.otherStepResult.x === 1 &&
      out.typingTestResult.wpm === 80 &&
      out._trusted["wf-typing"].stepType === "typing_test" &&
      out._trusted["wf-typing"].completedAt === "2026-09-16T00:00:00Z"
    );
  })(),
);
check(
  "writes the optional legacyStepEntry under the raw stepId, for by-id readers",
  (() => {
    const out = JSON.parse(
      mergeTrustedNotes(
        null,
        {
          stepId: "wf-portfolio",
          stepType: "portfolio_upload",
          resultKey: "portfolioResult",
          result: { score: 90 },
          legacyStepEntry: { type: "portfolio_upload", files: ["a.pdf"] },
        },
        "2026-09-16T00:00:00Z",
      ),
    );
    return out["wf-portfolio"].type === "portfolio_upload" && out["wf-portfolio"].files[0] === "a.pdf";
  })(),
);
check(
  "omitting legacyStepEntry never adds a stepId-keyed entry at all",
  (() => {
    const out = JSON.parse(
      mergeTrustedNotes(
        null,
        { stepId: "wf-typing", stepType: "typing_test", resultKey: "typingTestResult", result: { wpm: 1 } },
        "2026-09-16T00:00:00Z",
      ),
    );
    return !("wf-typing" in out);
  })(),
);
check(
  "malformed existing notes JSON is treated as empty, not thrown",
  (() => {
    const out = JSON.parse(
      mergeTrustedNotes(
        "{not valid json",
        { stepId: "wf-typing", stepType: "typing_test", resultKey: "typingTestResult", result: { wpm: 1 } },
        "2026-09-16T00:00:00Z",
      ),
    );
    return out.typingTestResult.wpm === 1;
  })(),
);
check(
  "a previous _trusted entry for a DIFFERENT step is preserved, not overwritten",
  (() => {
    const existing = JSON.stringify({
      _trusted: { application: { stepType: "application", completedAt: "2026-09-01T00:00:00Z" } },
    });
    const out = JSON.parse(
      mergeTrustedNotes(
        existing,
        { stepId: "wf-typing", stepType: "typing_test", resultKey: "typingTestResult", result: { wpm: 1 } },
        "2026-09-16T00:00:00Z",
      ),
    );
    return (
      out._trusted.application.completedAt === "2026-09-01T00:00:00Z" &&
      out._trusted["wf-typing"].stepType === "typing_test"
    );
  })(),
);
check(
  "recording the SAME step twice overwrites that step's own result and _trusted entry (retake/redo)",
  (() => {
    const first = mergeTrustedNotes(
      null,
      { stepId: "wf-typing", stepType: "typing_test", resultKey: "typingTestResult", result: { wpm: 40 } },
      "2026-09-16T00:00:00Z",
    );
    const out = JSON.parse(
      mergeTrustedNotes(
        first,
        { stepId: "wf-typing", stepType: "typing_test", resultKey: "typingTestResult", result: { wpm: 90 } },
        "2026-09-16T01:00:00Z",
      ),
    );
    return out.typingTestResult.wpm === 90 && out._trusted["wf-typing"].completedAt === "2026-09-16T01:00:00Z";
  })(),
);

check(
  "extraNotesEntries writes flat top-level keys alongside resultKey — video_intro's videoIntroUrl case",
  (() => {
    const out = JSON.parse(
      mergeTrustedNotes(
        null,
        {
          stepId: "wf-video",
          stepType: "video_intro",
          resultKey: "videoIntroResult",
          result: { duration: 30, completed: true, videoUrl: "https://x/video.webm" },
          extraNotesEntries: { videoIntroUrl: "https://x/video.webm" },
        },
        "2026-09-16T00:00:00Z",
      ),
    );
    return (
      out.videoIntroUrl === "https://x/video.webm" &&
      out.videoIntroResult.videoUrl === "https://x/video.webm" &&
      out._trusted["wf-video"].stepType === "video_intro"
    );
  })(),
);
check(
  "extraNotesEntries can never override resultKey, stepId, or _trusted even if it reuses those names",
  (() => {
    const out = JSON.parse(
      mergeTrustedNotes(
        null,
        {
          stepId: "wf-video",
          stepType: "video_intro",
          resultKey: "videoIntroResult",
          result: { real: true },
          legacyStepEntry: { real: true },
          extraNotesEntries: {
            videoIntroResult: { forged: true },
            "wf-video": { forged: true },
            _trusted: { forged: true },
          },
        },
        "2026-09-16T00:00:00Z",
      ),
    );
    return (
      out.videoIntroResult.real === true &&
      out["wf-video"].real === true &&
      out._trusted["wf-video"].stepType === "video_intro" &&
      out._trusted.forged === undefined
    );
  })(),
);
check(
  "omitting extraNotesEntries changes nothing — same output as before it existed",
  (() => {
    const out = JSON.parse(
      mergeTrustedNotes(
        null,
        { stepId: "wf-typing", stepType: "typing_test", resultKey: "typingTestResult", result: { wpm: 1 } },
        "2026-09-16T00:00:00Z",
      ),
    );
    return Object.keys(out).sort().join(",") === ["_trusted", "typingTestResult"].sort().join(",");
  })(),
);

// ============================================================================
// recordStepResult end-to-end, per phase's own `advance` value — a plain
// in-memory MinimalSupabaseAdmin (no PGlite needed; this is exercising
// recordStepResult's own decision logic, not the database trigger, which
// scripts/trusted_step_results.pglite.test.mjs already proves separately).
//
// The bug this proves fixed: cycle 4 part B's recordStepResult used to
// advance applications.phase/status in auto mode for EVERY step with a
// real next step (other than voice_interview) — including the five step
// types (typing_test, chat_simulation, chat_interview, sales_simulation,
// voice_interview) whose pre-conversion pages never wrote phase/status
// themselves at all, leaving that decision entirely to a follow-up
// trigger-ava-analysis call. Since trigger-ava-analysis deliberately does
// NOT move `phase` when Ava recommends declining (a human must review
// first), the old behavior put a candidate one step ahead of that pending
// review the moment their result happened to trigger a decline
// recommendation — CandidateStepGate.tsx would then let them navigate
// straight into the next step's route.
// ============================================================================
console.log("\nrecordStepResult — per-phase `advance` semantics:\n");

/** A plain in-memory MinimalSupabaseAdmin backed by one mutable `applications`
 *  row plus its job — enough surface for recordStepResult's own
 *  `.select(...).eq(...).maybeSingle()` / `.update(...).eq(...)` calls. */
function fakeAdmin(row) {
  return {
    from(table) {
      if (table !== "applications") throw new Error(`unexpected table ${table}`);
      return {
        select() {
          return {
            eq(column, value) {
              return {
                async maybeSingle() {
                  if (row[column] !== value) return { data: null, error: null };
                  return {
                    data: {
                      id: row.id,
                      candidate_id: row.candidate_id,
                      phase: row.phase,
                      status: row.status,
                      notes: row.notes,
                      jobs: row.jobs,
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
        update(values) {
          return {
            async eq(column, value) {
              if (row[column] !== value) return { error: { message: "not found" } };
              Object.assign(row, values);
              return { error: null };
            },
          };
        },
      };
    },
  };
}

function newRow(overrides = {}) {
  return {
    id: "app-1",
    candidate_id: "cand-1",
    phase: "wf-current",
    status: "reviewing",
    notes: null,
    jobs: { processing_mode: "auto", workflow_steps: [], quiz_questions: undefined },
    ...overrides,
  };
}

// Every "never"-advance step type gets the SAME proof: in auto mode, with a
// real next step available, recordStepResult must still succeed and merge
// notes, but must NEVER move phase/status — even though computeNextStepDecision
// itself (used only for the informational `next`) says it could.
const neverAdvanceCases = [
  { stepType: "typing_test", resultKey: "typingTestResult" },
  { stepType: "chat_simulation", resultKey: "chatSimulationResult" },
  { stepType: "chat_interview", resultKey: "chatInterviewResult" },
  { stepType: "sales_simulation", resultKey: "salesSimulationResult" },
  { stepType: "voice_interview", resultKey: "voiceInterviewResult" },
];

for (const { stepType, resultKey } of neverAdvanceCases) {
  const workflowSteps = [
    { id: "wf-current", type: stepType, title: "Current step" },
    { id: "wf-next", type: "chat_simulation", title: "Next step" },
  ];
  const row = newRow({
    jobs: { processing_mode: "auto", workflow_steps: workflowSteps, quiz_questions: undefined },
  });
  const admin = fakeAdmin(row);

  const outcome = await recordStepResult(admin, {
    applicationId: "app-1",
    callerUserId: "cand-1",
    stepId: "wf-current",
    stepType,
    advance: "never",
    resultKey,
    result: { score: 80 },
  });

  check(
    `${stepType}: recordStepResult reports ok:true`,
    outcome.ok === true,
    outcome.ok ? "" : outcome.error,
  );
  check(
    `${stepType}: applications.phase is untouched (still "wf-current", not advanced to "wf-next")`,
    row.phase === "wf-current",
    `phase is now "${row.phase}"`,
  );
  check(
    `${stepType}: applications.status is untouched (still "reviewing")`,
    row.status === "reviewing",
    `status is now "${row.status}"`,
  );
  check(
    `${stepType}: notes[resultKey] was still recorded, despite no phase move`,
    outcome.ok && JSON.parse(row.notes)[resultKey]?.score === 80,
  );
}

// The recommend-decline path itself, spelled out end to end for one
// representative "never" step (chat_simulation): recordStepResult records
// the result and leaves phase alone; trigger-ava-analysis's own
// autopilotAction === "reject" branch (index.ts's reject branch) then only
// ever writes status: "reviewing" + phase_ai_analysis — it NEVER touches
// phase either. The candidate must end this whole flow still sitting on
// the step they just submitted, never one step into the next.
// (Since 2026-10-05 that reject branch is reached for MANUAL jobs only. An
// auto-mode job never parks anyone: trigger-ava-analysis moves them on with
// advanceAfterStep, proved further down, and recordStepResult itself still
// never moves a "never" step.)
console.log("\nrecordStepResult — recommend-decline path leaves phase exactly where it was:\n");
{
  const workflowSteps = [
    { id: "wf-chat", type: "chat_simulation", title: "Chat simulation" },
    { id: "wf-voice2", type: "sales_simulation", title: "Sales simulation" },
  ];
  const row = newRow({
    phase: "wf-chat",
    jobs: { processing_mode: "auto", workflow_steps: workflowSteps, quiz_questions: undefined },
  });
  const admin = fakeAdmin(row);

  const outcome = await recordStepResult(admin, {
    applicationId: "app-1",
    callerUserId: "cand-1",
    stepId: "wf-chat",
    stepType: "chat_simulation",
    advance: "never",
    resultKey: "chatSimulationResult",
    result: { score: 20 }, // a low score — exactly the kind trigger-ava-analysis would decline
  });
  check("recommend-decline setup: recordStepResult still succeeds", outcome.ok === true);
  check(
    "recommend-decline setup: recordStepResult itself never advanced phase past chat_simulation",
    row.phase === "wf-chat",
  );

  // Simulate trigger-ava-analysis's OWN reject-branch write exactly
  // (index.ts's autopilotAction === "reject" branch): status flips to
  // "reviewing" (it already was) with a phase_ai_analysis note — phase is
  // never part of that update.
  row.status = "reviewing";
  row.phase_ai_analysis = "Ava recommends declining — needs your review.";

  check(
    "recommend-decline: after Ava's decline recommendation too, phase is STILL wf-chat — not one step ahead",
    row.phase === "wf-chat",
    `phase drifted to "${row.phase}"`,
  );
}

// portfolio_upload / video_intro: the two step types that DID advance
// phase locally pre-conversion keep doing so via recordStepResult itself —
// this is the one existing behavior this fix must NOT regress.
console.log("\nrecordStepResult — advance:\"auto_mode\" steps (portfolio_upload/video_intro) still advance:\n");
{
  const workflowSteps = [
    { id: "wf-portfolio", type: "portfolio_upload", title: "Portfolio" },
    { id: "wf-chat3", type: "chat_simulation", title: "Chat simulation" },
  ];

  // Auto mode: really advances.
  const autoRow = newRow({
    phase: "wf-portfolio",
    jobs: { processing_mode: "auto", workflow_steps: workflowSteps, quiz_questions: undefined },
  });
  const autoOutcome = await recordStepResult(fakeAdmin(autoRow), {
    applicationId: "app-1",
    callerUserId: "cand-1",
    stepId: "wf-portfolio",
    stepType: "portfolio_upload",
    advance: "auto_mode",
    resultKey: "portfolioResult",
    result: { score: 90 },
  });
  check("portfolio_upload auto mode: recordStepResult succeeds", autoOutcome.ok === true);
  check(
    "portfolio_upload auto mode: phase DOES advance to the next step (unlike the five 'never' steps above)",
    autoRow.phase === "wf-chat3",
    `phase is "${autoRow.phase}"`,
  );
  check("portfolio_upload auto mode: status becomes 'reviewing'", autoRow.status === "reviewing");

  // Manual mode: advance:"auto_mode" is still passed (it's the phase's own
  // fixed value), but computeNextStepDecision itself refuses to advance in
  // manual mode — recordStepResult must respect that too.
  const manualRow = newRow({
    phase: "wf-portfolio",
    jobs: { processing_mode: "manual", workflow_steps: workflowSteps, quiz_questions: undefined },
  });
  const manualOutcome = await recordStepResult(fakeAdmin(manualRow), {
    applicationId: "app-1",
    callerUserId: "cand-1",
    stepId: "wf-portfolio",
    stepType: "portfolio_upload",
    advance: "auto_mode",
    resultKey: "portfolioResult",
    result: { score: 90 },
  });
  check("portfolio_upload manual mode: recordStepResult succeeds", manualOutcome.ok === true);
  check(
    "portfolio_upload manual mode: phase is NOT advanced — manual mode never advances regardless of advance:\"auto_mode\"",
    manualRow.phase === "wf-portfolio",
  );
}

// ============================================================================
// recordStepResult writes notes through merge_application_notes (2026-10-05)
//
// Ava now scores in the background after the candidate has already moved on,
// so the old whole-notes write (read the row, merge in JS, write the WHOLE
// object back) could erase a scorecard that landed in between, and Ava's own
// whole-notes write could erase the next step's result. With a client that
// has .rpc, recordStepResult hands the database only the keys it owns.
// ============================================================================
console.log("\nrecordStepResult — notes go through merge_application_notes:\n");

/** fakeAdmin plus an `rpc` that merges like the SQL function does, against
 *  the row AS IT IS when the RPC runs — and an optional hook that runs right
 *  after recordStepResult's own read, to simulate a write landing between
 *  that read and its write. */
function fakeAdminWithMerge(row, { afterRead, rpcError } = {}) {
  const base = fakeAdmin(row);
  const calls = [];
  return {
    calls,
    from(table) {
      const inner = base.from(table);
      return {
        select(columns) {
          return {
            eq(column, value) {
              return {
                async maybeSingle() {
                  const result = await inner.select(columns).eq(column, value).maybeSingle();
                  if (afterRead) afterRead(row);
                  return result;
                },
              };
            },
          };
        },
        update(values) {
          calls.push({ kind: "update", values });
          return inner.update(values);
        },
      };
    },
    async rpc(fn, args) {
      calls.push({ kind: "rpc", fn, args });
      if (rpcError) return { data: null, error: rpcError };
      let existing = {};
      try {
        const parsed = row.notes ? JSON.parse(row.notes) : {};
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) existing = parsed;
      } catch {
        existing = {};
      }
      const merged = { ...existing, ...args.p_patch };
      row.notes = JSON.stringify(merged);
      return { data: merged, error: null };
    },
  };
}

{
  const workflowSteps = [
    { id: "wf-typing", type: "typing_test", title: "Typing test" },
    { id: "wf-chat", type: "chat_simulation", title: "Chat simulation" },
  ];
  const lateScorecard = { overallScore: 58, evidenceFingerprint: "landed-meanwhile" };
  const row = newRow({
    phase: "wf-typing",
    notes: JSON.stringify({ applicationAnswers: [{ question: "Name", answer: "A" }] }),
    jobs: { processing_mode: "auto", workflow_steps: workflowSteps, quiz_questions: undefined },
  });
  // Ava's background write lands after recordStepResult has read the row.
  const admin = fakeAdminWithMerge(row, {
    afterRead(r) {
      const notes = JSON.parse(r.notes);
      r.notes = JSON.stringify({ ...notes, avaScorecard: lateScorecard });
    },
  });
  const outcome = await recordStepResult(admin, {
    applicationId: "app-1",
    callerUserId: "cand-1",
    stepId: "wf-typing",
    stepType: "typing_test",
    advance: "never",
    resultKey: "typingTestResult",
    result: { wpm: 52 },
    legacyStepEntry: { type: "typing_test", wpm: 52 },
  });
  const notes = JSON.parse(row.notes);
  check("merge path: recordStepResult succeeds", outcome.ok === true, outcome.ok ? "" : outcome.error);
  const rpcCall = admin.calls.find((call) => call.kind === "rpc");
  check("merge path: it calls merge_application_notes", rpcCall?.fn === "merge_application_notes");
  check(
    "merge path: the patch carries only this step's keys (result, by-id entry, _trusted)",
    rpcCall && Object.keys(rpcCall.args.p_patch).sort().join(",") === ["_trusted", "typingTestResult", "wf-typing"].sort().join(","),
    rpcCall ? Object.keys(rpcCall.args.p_patch).join(",") : "no rpc call",
  );
  check("merge path: the patch never carries the application answers", rpcCall && !("applicationAnswers" in rpcCall.args.p_patch));
  check(
    "merge path: a scorecard written between the read and the write SURVIVES",
    notes.avaScorecard?.evidenceFingerprint === "landed-meanwhile",
    JSON.stringify(notes.avaScorecard),
  );
  check("merge path: the step result landed", notes.typingTestResult?.wpm === 52 && notes._trusted?.["wf-typing"]?.stepType === "typing_test");
  check("merge path: the answers are untouched", notes.applicationAnswers?.[0]?.answer === "A");
  check(
    "merge path: an advance:\"never\" step makes no .update() call at all",
    !admin.calls.some((call) => call.kind === "update"),
    JSON.stringify(admin.calls.filter((call) => call.kind === "update")),
  );
  check("merge path: phase/status untouched", row.phase === "wf-typing" && row.status === "reviewing");
}

{
  // The same race through the OLD path (an adapter without .rpc) erases the
  // scorecard — the defect the merge path exists to remove.
  const row = newRow({
    phase: "wf-typing",
    notes: JSON.stringify({ applicationAnswers: [] }),
    jobs: { processing_mode: "auto", workflow_steps: [{ id: "wf-typing", type: "typing_test" }], quiz_questions: undefined },
  });
  const legacy = fakeAdmin(row);
  const wrapped = {
    from(table) {
      const inner = legacy.from(table);
      return {
        select: (columns) => ({
          eq: (column, value) => ({
            async maybeSingle() {
              const result = await inner.select(columns).eq(column, value).maybeSingle();
              row.notes = JSON.stringify({ ...JSON.parse(row.notes), avaScorecard: { overallScore: 1 } });
              return result;
            },
          }),
        }),
        update: (values) => inner.update(values),
      };
    },
  };
  await recordStepResult(wrapped, {
    applicationId: "app-1",
    callerUserId: "cand-1",
    stepId: "wf-typing",
    stepType: "typing_test",
    advance: "never",
    resultKey: "typingTestResult",
    result: { wpm: 40 },
  });
  check(
    "(control) without .rpc the old whole-notes write still erases a scorecard that landed meanwhile",
    JSON.parse(row.notes).avaScorecard === undefined,
  );
}

{
  // advance:"auto_mode" (portfolio) through the merge path: notes via the
  // RPC first, then one phase/status update.
  const workflowSteps = [
    { id: "wf-portfolio", type: "portfolio_upload", title: "Portfolio" },
    { id: "wf-chat4", type: "chat_simulation", title: "Chat simulation" },
  ];
  const row = newRow({
    phase: "wf-portfolio",
    jobs: { processing_mode: "auto", workflow_steps: workflowSteps, quiz_questions: undefined },
  });
  const admin = fakeAdminWithMerge(row);
  const outcome = await recordStepResult(admin, {
    applicationId: "app-1",
    callerUserId: "cand-1",
    stepId: "wf-portfolio",
    stepType: "portfolio_upload",
    advance: "auto_mode",
    resultKey: "portfolioResult",
    result: { score: 90 },
  });
  const order = admin.calls.map((call) => call.kind).join(",");
  check("merge path, auto_mode: succeeds", outcome.ok === true);
  check("merge path, auto_mode: notes first, then the move", order === "rpc,update", order);
  const update = admin.calls.find((call) => call.kind === "update");
  check(
    "merge path, auto_mode: the update carries only phase/status, never the whole notes",
    update && Object.keys(update.values).sort().join(",") === "phase,status",
    update ? Object.keys(update.values).join(",") : "no update",
  );
  check("merge path, auto_mode: phase advanced", row.phase === "wf-chat4");
  check("merge path, auto_mode: result stored", JSON.parse(row.notes).portfolioResult?.score === 90);
}

{
  // Migration not applied yet: PGRST202 falls back to the old single write.
  const row = newRow({
    phase: "wf-current",
    jobs: { processing_mode: "auto", workflow_steps: [{ id: "wf-current", type: "typing_test" }], quiz_questions: undefined },
  });
  const admin = fakeAdminWithMerge(row, { rpcError: { code: "PGRST202", message: "Could not find the function" } });
  const originalError = console.error;
  console.error = () => {};
  const outcome = await recordStepResult(admin, {
    applicationId: "app-1",
    callerUserId: "cand-1",
    stepId: "wf-current",
    stepType: "typing_test",
    advance: "never",
    resultKey: "typingTestResult",
    result: { wpm: 33 },
  });
  console.error = originalError;
  check("missing RPC: still saves the result (falls back, loudly)", outcome.ok === true && JSON.parse(row.notes).typingTestResult?.wpm === 33);

  // Any other RPC failure is a real failure — never a silent fallback.
  const row2 = newRow({
    phase: "wf-current",
    jobs: { processing_mode: "auto", workflow_steps: [{ id: "wf-current", type: "typing_test" }], quiz_questions: undefined },
  });
  const admin2 = fakeAdminWithMerge(row2, { rpcError: { code: "57014", message: "canceling statement due to statement timeout" } });
  const outcome2 = await recordStepResult(admin2, {
    applicationId: "app-1",
    callerUserId: "cand-1",
    stepId: "wf-current",
    stepType: "typing_test",
    advance: "never",
    resultKey: "typingTestResult",
    result: { wpm: 33 },
  });
  check("other RPC error: write_failed, nothing written", outcome2.ok === false && outcome2.code === "write_failed" && row2.notes === null);
  check("other RPC error: no whole-notes fallback write", !admin2.calls.some((call) => call.kind === "update"));
}

check(
  "buildTrustedNotesPatch + spread equals mergeTrustedNotes (one rule, two uses)",
  (() => {
    const existing = { a: 1, _trusted: { s0: { stepType: "quiz", completedAt: "x" } } };
    const input = { stepId: "s1", stepType: "typing_test", resultKey: "typingTestResult", result: { wpm: 1 }, legacyStepEntry: { wpm: 1 } };
    const viaPatch = JSON.stringify({ ...existing, ...buildTrustedNotesPatch(existing, input, "t") });
    return viaPatch === mergeTrustedNotes(JSON.stringify(existing), input, "t");
  })(),
);

// ============================================================================
// Moving on after a step in auto mode — planAutoAdvance / advanceAfterStep
// (2026-10-05). The live Zulu job's journey: application -> Skills check ->
// typing -> player chat practice -> written interview -> Decision.
// ============================================================================
console.log("\nAuto mode: moving on after a step, without waiting on Ava:\n");

const ZULU = buildCandidateJourney(
  [
    { id: "step_typing", type: "typing_test", title: "Typing speed and accuracy" },
    { id: "step_chat", type: "chat_simulation", title: "Player chat practice" },
    { id: "step_interview", type: "chat_interview", title: "Written interview" },
  ],
  { hasQuiz: true },
);
const trusted = (stepId, stepType) => ({ _trusted: { [stepId]: { stepType, completedAt: "2026-10-05T15:47:40.146Z" } } });
const plan = (completedStepId, application, processingMode = "auto") =>
  planAutoAdvance({ steps: ZULU, completedStepId, application, processingMode });

{
  const answers = JSON.stringify({ applicationAnswers: [{ question: "Full name", answer: "A" }] });
  const p1 = plan("application", { phase: "application", status: "pending", notes: answers });
  check(
    "application sent -> Skills check, titled the way the journey titles it",
    p1.kind === "advance" && p1.nextStep.id === "quiz" && p1.nextStep.title === "Skills check" && p1.nextStatus === "reviewing",
    JSON.stringify(p1),
  );
  const p1b = plan("application", { phase: "application", status: "in_progress", notes: answers });
  check("a form still being filled in (in_progress) is not moved on", p1b.kind === "refused" && p1b.reason === "result_missing");

  const p2 = plan("quiz", { phase: "quiz", status: "reviewing", notes: JSON.stringify({ quizResult: { score: 40 } }) });
  check("skills check graded (even a low score) -> typing test", p2.kind === "advance" && p2.nextStep.id === "step_typing");
  const p2b = plan("quiz", { phase: "quiz", status: "reviewing", notes: "{}" });
  check("skills check not graded yet -> nobody moves", p2b.kind === "refused" && p2b.reason === "result_missing");

  const p3 = plan("step_typing", { phase: "step_typing", status: "reviewing", notes: JSON.stringify(trusted("step_typing", "typing_test")) });
  check(
    "typing recorded -> Player chat practice (38 WPM or not, Ava is not asked)",
    p3.kind === "advance" && p3.nextStep.id === "step_chat" && p3.nextStep.title === "Player chat practice",
  );
  const p3b = plan("step_chat", { phase: "step_chat", status: "reviewing", notes: JSON.stringify(trusted("step_typing", "typing_test")) });
  check("the chat step's own result is required, not an earlier step's", p3b.kind === "refused" && p3b.reason === "result_missing");

  const p4 = plan("step_interview", {
    phase: "step_interview",
    status: "reviewing",
    notes: JSON.stringify({ chatInterviewResult: { evaluation: { score: 25 } } }),
  });
  check(
    "written interview done -> the Decision stage, and the journey is finished",
    p4.kind === "advance" && p4.nextStep.id === DECISION_STAGE_ID && p4.nextStep.title === "Decision" && p4.finishedAllSteps === true,
    JSON.stringify(p4),
  );
  check("only the last step finishes the journey", p3.kind === "advance" && p3.finishedAllSteps === false);

  console.log("\nA retry can never skip a step:\n");
  const retry = plan("step_typing", { phase: "step_chat", status: "reviewing", notes: JSON.stringify(trusted("step_typing", "typing_test")) });
  check("a repeat after the move answers 'already moved' and writes nothing", retry.kind === "already_advanced" && retry.nextStep.id === "step_chat");
  const late = plan("step_typing", {
    phase: "step_interview",
    status: "reviewing",
    notes: JSON.stringify({ ...trusted("step_typing", "typing_test") }),
  });
  check("a repeat two steps late is refused, not applied", late.kind === "refused" && late.reason === "phase_mismatch");
  const ahead = plan("step_chat", { phase: "step_typing", status: "reviewing", notes: JSON.stringify(trusted("step_typing", "typing_test")) });
  check("naming a step they have not reached is refused", ahead.kind === "refused" && ahead.reason === "phase_mismatch");
  const noId = plan(null, { phase: "step_typing", status: "reviewing", notes: JSON.stringify(trusted("step_typing", "typing_test")) });
  check("no step named: refused — it never falls back to the stored phase", noId.kind === "refused" && noId.reason === "no_step_id");
  check("the Decision stage is not a step to finish", plan(DECISION_STAGE_ID, { phase: DECISION_STAGE_ID, status: "reviewing", notes: "{}" }).reason === "unknown_step");
  check("an unknown step id is refused", plan("step_nope", { phase: "step_nope", status: "reviewing", notes: "{}" }).reason === "unknown_step");

  console.log("\nOnly auto-mode jobs, and only open applications:\n");
  check(
    "manual job: nothing moves (the owner moves people himself)",
    plan("step_typing", { phase: "step_typing", status: "reviewing", notes: JSON.stringify(trusted("step_typing", "typing_test")) }, "manual").reason === "not_auto_mode",
  );
  for (const status of ["rejected", "hired", "offered"]) {
    check(
      `${status}: never moved`,
      plan("step_typing", { phase: "step_typing", status, notes: JSON.stringify(trusted("step_typing", "typing_test")) }).reason === "application_closed",
    );
  }

  const voiceSteps = buildCandidateJourney(
    [
      { id: "wf-typing", type: "typing_test" },
      { id: "wf-voice", type: "voice_interview" },
    ],
    { hasQuiz: false },
  );
  const voice = planAutoAdvance({
    steps: voiceSteps,
    completedStepId: "wf-typing",
    application: { phase: "wf-typing", status: "reviewing", notes: JSON.stringify({ typingTestResult: { wpm: 50 } }) },
    processingMode: "auto",
  });
  check("a voice interview next still waits for the employer to set it up", voice.kind === "needs_employer_approval");
}

console.log("\nstepResultLanded reads each step type's own result:\n");
{
  const step = (id, type) => ({ id, type, title: type });
  check("a _trusted marker of the right type is enough", stepResultLanded(step("s", "chat_simulation"), { phase: "s", status: "reviewing", notes: trusted("s", "chat_simulation") }));
  check("a _trusted marker of the WRONG type is not", !stepResultLanded(step("s", "chat_simulation"), { phase: "s", status: "reviewing", notes: trusted("s", "typing_test") }));
  check("video_message counts as video_intro", stepResultLanded(step("v", "video_intro"), { phase: "v", status: "reviewing", notes: trusted("v", "video_message") }));
  check("voice: the result column", stepResultLanded(step("vo", "voice_interview"), { phase: "vo", status: "reviewing", notes: null, voice_interview_result: { overall_score: 70 } }));
  check("malformed notes read as nothing landed", !stepResultLanded(step("s", "typing_test"), { phase: "s", status: "reviewing", notes: "{oops" }));
}

console.log("\nadvanceAfterStep: one compare-and-set write:\n");

/** A fake for advanceAfterStep's update/select chains that really applies
 *  the eq/not filters against one row. */
function casAdmin(row, { error } = {}) {
  const writes = [];
  return {
    writes,
    from() {
      return {
        update(values) {
          const filters = [];
          const chain = {
            eq(column, value) {
              filters.push((r) => r[column] === value);
              return chain;
            },
            not(column, operator, value) {
              const list = value.replace(/^\(|\)$/g, "").split(",");
              filters.push((r) => !list.includes(r[column]));
              return chain;
            },
            select() {
              return {
                async maybeSingle() {
                  writes.push({ values, filters: filters.length });
                  if (error) return { data: null, error };
                  if (!filters.every((f) => f(row))) return { data: null, error: null };
                  Object.assign(row, values);
                  return { data: { id: row.id, phase: row.phase, status: row.status }, error: null };
                },
              };
            },
          };
          return chain;
        },
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: { phase: row.phase, status: row.status }, error: null }) };
            },
          };
        },
      };
    },
  };
}

{
  const snapshot = { phase: "step_chat", status: "reviewing", notes: JSON.stringify(trusted("step_chat", "chat_simulation")) };
  const row = { id: "app-z", ...snapshot };
  const admin = casAdmin(row);
  const outcome = await advanceAfterStep(admin, {
    applicationId: "app-z",
    steps: ZULU,
    completedStepId: "step_chat",
    application: snapshot,
    processingMode: "auto",
  });
  check("moves the row on", outcome.kind === "advance" && outcome.moved === true && row.phase === "step_interview" && row.status === "reviewing");
  check("with three filters: id, phase = the finished step, status still open", admin.writes[0]?.filters === 3, JSON.stringify(admin.writes));

  // The same request again (a network retry) from the same old snapshot: the
  // compare-and-set matches nothing, the re-read says they already moved.
  const again = await advanceAfterStep(admin, {
    applicationId: "app-z",
    steps: ZULU,
    completedStepId: "step_chat",
    application: snapshot,
    processingMode: "auto",
  });
  check("a duplicate request reads 'already moved', and does not move them twice", again.kind === "already_advanced" && row.phase === "step_interview");

  // Staff moved them somewhere else meanwhile: refused, nothing written.
  const row2 = { id: "app-y", ...snapshot, phase: "quiz" };
  const lost = await advanceAfterStep(casAdmin(row2), {
    applicationId: "app-y",
    steps: ZULU,
    completedStepId: "step_chat",
    application: snapshot,
    processingMode: "auto",
  });
  check("if the row changed under it, it refuses and leaves the row alone", lost.kind === "refused" && lost.reason === "state_changed" && row2.phase === "quiz");

  // Rejected in between: the status filter stops the write.
  const row3 = { id: "app-x", ...snapshot, status: "rejected" };
  const closed = await advanceAfterStep(casAdmin(row3), {
    applicationId: "app-x",
    steps: ZULU,
    completedStepId: "step_chat",
    application: snapshot,
    processingMode: "auto",
  });
  check("rejected in between: not moved", closed.kind === "refused" && closed.reason === "application_closed" && row3.phase === "step_chat");

  const failing = await advanceAfterStep(casAdmin({ id: "app-w", ...snapshot }, { error: { message: "boom" } }), {
    applicationId: "app-w",
    steps: ZULU,
    completedStepId: "step_chat",
    application: snapshot,
    processingMode: "auto",
  });
  check("a database error is reported, not swallowed", failing.kind === "error" && /boom/.test(failing.error));

  const refusedEarly = await advanceAfterStep(casAdmin({ id: "app-v", ...snapshot }), {
    applicationId: "app-v",
    steps: ZULU,
    completedStepId: "step_chat",
    application: { ...snapshot, notes: "{}" },
    processingMode: "auto",
  });
  check("no stored result: refused before any write", refusedEarly.kind === "refused" && refusedEarly.reason === "result_missing");
}

// ============================================================================
// Review fixes (2026-10-05, second pass).
// ============================================================================
console.log("\nstepResultLanded: a step recorded by the server needs its OWN marker:\n");
{
  const twoChats = buildCandidateJourney(
    [
      { id: "wf-chat-a", type: "chat_simulation", title: "Chat A" },
      { id: "wf-chat-b", type: "chat_simulation", title: "Chat B" },
      { id: "wf-interview", type: "chat_interview", title: "Interview" },
    ],
    { hasQuiz: false },
  );
  const afterFirstChat = JSON.stringify({
    applicationAnswers: [{ question: "Name", answer: "A" }],
    chatSimulationResult: { score: 70 },
    _trusted: { "wf-chat-a": { stepType: "chat_simulation", completedAt: "2026-10-05T15:51:46.150Z" } },
  });
  const chatB = twoChats.find((step) => step.id === "wf-chat-b");
  check(
    "two chat simulations: the first one's result does NOT count as the second's",
    stepResultLanded(chatB, { phase: "wf-chat-b", status: "reviewing", notes: afterFirstChat }) === false,
  );
  const skip = planAutoAdvance({
    steps: twoChats,
    completedStepId: "wf-chat-b",
    application: { phase: "wf-chat-b", status: "reviewing", notes: afterFirstChat },
    processingMode: "auto",
  });
  check(
    "so naming the second chat (a batch passes the stored phase) cannot move them past it",
    skip.kind === "refused" && skip.reason === "result_missing",
    JSON.stringify(skip),
  );
  check(
    "a legacy row with no _trusted markers at all still reads the per-type key",
    stepResultLanded(chatB, { phase: "wf-chat-b", status: "reviewing", notes: JSON.stringify({ chatSimulationResult: { score: 70 } }) }) === true,
  );
  const quizStep = ZULU.find((step) => step.id === "quiz");
  check(
    "the quiz (saved by its own database function, no marker) still reads quizResult beside other markers",
    stepResultLanded(quizStep, { phase: "quiz", status: "reviewing", notes: JSON.stringify({ ...trusted("step_typing", "typing_test"), quizResult: { score: 40 } }) }),
  );
  const appStep = ZULU.find((step) => step.id === "application");
  check(
    "the application form still counts once sent with its answers, beside other markers",
    stepResultLanded(appStep, { phase: "application", status: "pending", notes: JSON.stringify({ ...trusted("step_typing", "typing_test"), applicationAnswers: [] }) }),
  );
  check(
    "the live row's shape (every server step has its own marker) lands each step",
    ["step_typing", "step_chat", "step_interview"].every((id) =>
      stepResultLanded(ZULU.find((step) => step.id === id), {
        phase: id,
        status: "reviewing",
        notes: JSON.stringify({
          typingTestResult: {},
          chatSimulationResult: {},
          chatInterviewResult: { evaluation: { score: 25 } },
          _trusted: {
            step_typing: { stepType: "typing_test", completedAt: "2026-10-05T15:47:40.146Z" },
            step_chat: { stepType: "chat_simulation", completedAt: "2026-10-05T15:51:46.150Z" },
            step_interview: { stepType: "chat_interview", completedAt: "2026-10-05T15:57:59.597Z" },
          },
        }),
      }),
    ),
  );
}

console.log("\nanalysisCoversStep: has the stored analysis read this step's result?\n");
{
  const recorded = "2026-10-05T15:51:46.150Z";
  const notesWith = (meta) => JSON.stringify({ _trusted: { step_chat: { stepType: "chat_simulation", completedAt: recorded } }, avaAnalysisMeta: meta });
  check("no analysis stored: no", analysisCoversStep("step_chat", JSON.stringify(trusted("step_chat", "chat_simulation"))) === false);
  check(
    "an analysis that started after the result was recorded: yes",
    analysisCoversStep("step_chat", notesWith({ analysisStartedAt: "2026-10-05T15:51:47.000Z", triggeredByStep: "step_chat" })) === true,
  );
  check(
    "an analysis that started before it (the previous step's, still the stored one): no",
    analysisCoversStep("step_chat", notesWith({ analysisStartedAt: "2026-10-05T15:47:41.000Z", triggeredByStep: "step_typing" })) === false,
  );
  check(
    "an analysis saved by an older version (no start time): no, so it scores again",
    analysisCoversStep("step_chat", notesWith({ analyzedAt: "2026-10-05T15:52:30.000Z", triggeredByStep: "step_chat" })) === false,
  );
  check(
    "a step with no marker (the quiz): yes only when that analysis was the quiz's own",
    analysisCoversStep("quiz", JSON.stringify({ quizResult: {}, avaAnalysisMeta: { analysisStartedAt: "2026-10-05T15:45:44.000Z", triggeredByStep: "quiz" } })) === true
      && analysisCoversStep("quiz", JSON.stringify({ quizResult: {}, avaAnalysisMeta: { analysisStartedAt: "2026-10-05T15:45:44.000Z", triggeredByStep: "application" } })) === false,
  );
  check("malformed notes: no", analysisCoversStep("step_chat", "{oops") === false);
}

console.log("\nA step that moves the candidate on by itself still gets scored:\n");
{
  // complete-video-intro / ai-analyze-portfolio call recordStepResult with
  // advance:"auto_mode", which moves the phase. The page's own trigger call
  // then finds the candidate already moved on.
  const steps = buildCandidateJourney(
    [
      { id: "wf-typing", type: "typing_test", title: "Typing test" },
      { id: "wf-portfolio", type: "portfolio_upload", title: "Portfolio" },
    ],
    { hasQuiz: false },
  );
  const typingAnalysis = { analysisStartedAt: "2026-10-05T15:47:41.000Z", triggeredByStep: "wf-typing" };
  const row = newRow({
    phase: "wf-portfolio",
    status: "reviewing",
    notes: JSON.stringify({
      typingTestResult: { wpm: 52 },
      _trusted: { "wf-typing": { stepType: "typing_test", completedAt: "2026-10-05T15:47:40.146Z" } },
      avaAnalysisMeta: typingAnalysis,
    }),
    jobs: { processing_mode: "auto", workflow_steps: [
      { id: "wf-typing", type: "typing_test", title: "Typing test" },
      { id: "wf-portfolio", type: "portfolio_upload", title: "Portfolio" },
    ], quiz_questions: undefined },
  });
  const recorded = await recordStepResult(fakeAdminWithMerge(row), {
    applicationId: "app-1",
    callerUserId: "cand-1",
    stepId: "wf-portfolio",
    stepType: "portfolio_upload",
    advance: "auto_mode",
    resultKey: "portfolioResult",
    result: { files: [{ name: "work.pdf" }] },
    legacyStepEntry: { files: [{ name: "work.pdf" }] },
  });
  check("(setup) the portfolio's own write moved them to Decision", recorded.ok && row.phase === DECISION_STAGE_ID, JSON.stringify({ recorded, phase: row.phase }));

  const snapshot = { phase: row.phase, status: row.status, notes: row.notes };
  const outcome = await advanceAfterStep(casAdmin({ id: "app-1", ...snapshot }), {
    applicationId: "app-1",
    steps,
    completedStepId: "wf-portfolio",
    application: snapshot,
    processingMode: "auto",
  });
  check("the page's call finds them already moved on", outcome.kind === "already_advanced" && outcome.finishedAllSteps === true, JSON.stringify(outcome));
  const oldRule = (o) => o.kind === "advance" || o.kind === "needs_employer_approval";
  check("(control) the first-pass rule scored nothing here: the portfolio was never read", oldRule(outcome) === false);
  check("now that call starts the analysis", shouldScoreAfterStep(outcome, row.notes) === true);

  // The analysis saves (it started after the portfolio was recorded). A
  // network retry of the same call then starts nothing.
  const portfolioRecordedAt = JSON.parse(row.notes)._trusted["wf-portfolio"].completedAt;
  const savedNotes = JSON.stringify({
    ...JSON.parse(row.notes),
    avaAnalysisMeta: { analysisStartedAt: new Date(Date.parse(portfolioRecordedAt) + 300).toISOString(), triggeredByStep: "wf-portfolio" },
  });
  check("a repeat after that analysis started and saved starts nothing", shouldScoreAfterStep(outcome, savedNotes) === false);

  // The ordinary step: this request moved them, so it scores.
  const typingSnapshot = { phase: "step_typing", status: "reviewing", notes: JSON.stringify(trusted("step_typing", "typing_test")) };
  const moved = await advanceAfterStep(casAdmin({ id: "app-2", ...typingSnapshot }), {
    applicationId: "app-2",
    steps: ZULU,
    completedStepId: "step_typing",
    application: typingSnapshot,
    processingMode: "auto",
  });
  check("the request that moved them always scores", moved.kind === "advance" && shouldScoreAfterStep(moved, typingSnapshot.notes) === true);
  check(
    "a refused request never scores",
    shouldScoreAfterStep({ kind: "refused", reason: "phase_mismatch", currentPhase: "quiz", currentStatus: "reviewing" }, typingSnapshot.notes) === false,
  );

  const voiceSteps = buildCandidateJourney(
    [
      { id: "wf-typing", type: "typing_test" },
      { id: "wf-voice", type: "voice_interview" },
    ],
    { hasQuiz: false },
  );
  const waiting = planAutoAdvance({
    steps: voiceSteps,
    completedStepId: "wf-typing",
    application: { phase: "wf-typing", status: "reviewing", notes: JSON.stringify(trusted("wf-typing", "typing_test")) },
    processingMode: "auto",
  });
  check("voice interview next: the first request scores (and tells the employer)", shouldScoreAfterStep(waiting, JSON.stringify(trusted("wf-typing", "typing_test"))) === true);
  check(
    "a repeat after that analysis saved does not score or tell the employer again",
    shouldScoreAfterStep(
      waiting,
      JSON.stringify({ ...trusted("wf-typing", "typing_test"), avaAnalysisMeta: { analysisStartedAt: "2026-10-05T15:47:41.000Z", triggeredByStep: "wf-typing" } }),
    ) === false,
  );
}

console.log("\nwithoutNulCharacters: jsonb refuses a NUL, so patches never carry one:\n");
{
  const NUL = String.fromCharCode(0);
  const input = {
    transcript: [{ role: "candidate", content: `hi${NUL}there` }],
    [`key${NUL}`]: 1,
    nested: { deep: [`a${NUL}${NUL}b`, 3, null, true] },
    when: new Date("2026-10-05T00:00:00.000Z"),
  };
  const out = withoutNulCharacters(input);
  check("a NUL inside a nested string becomes U+FFFD", out.transcript[0].content === "hi�there");
  check("in an object key too", Object.keys(out).includes("key�"));
  check("every NUL, not only the first", out.nested.deep[0] === "a��b");
  check("numbers, null and booleans are untouched", out.nested.deep[1] === 3 && out.nested.deep[2] === null && out.nested.deep[3] === true);
  check("a Date is left for JSON.stringify exactly as before", out.when instanceof Date && JSON.stringify(out.when) === JSON.stringify(input.when));
  check("nothing to replace: the same JSON", JSON.stringify(withoutNulCharacters({ a: "plain", b: [1, { c: "x" }] })) === JSON.stringify({ a: "plain", b: [1, { c: "x" }] }));
  check("the input is not mutated", input.transcript[0].content === `hi${NUL}there`);

  const row = newRow({
    phase: "wf-chat",
    notes: JSON.stringify({ applicationAnswers: [] }),
    jobs: { processing_mode: "auto", workflow_steps: [{ id: "wf-chat", type: "chat_simulation", title: "Chat" }], quiz_questions: undefined },
  });
  const admin = fakeAdminWithMerge(row);
  const outcome = await recordStepResult(admin, {
    applicationId: "app-1",
    callerUserId: "cand-1",
    stepId: "wf-chat",
    stepType: "chat_simulation",
    advance: "never",
    resultKey: "chatSimulationResult",
    result: { messages: [{ role: "candidate", content: `pasted${NUL}text` }] },
  });
  const rpcCall = admin.calls.find((call) => call.kind === "rpc");
  check("recordStepResult with a NUL in the transcript still succeeds", outcome.ok === true, outcome.ok ? "" : outcome.error);
  check(
    "and the patch it hands merge_application_notes holds no \\u0000 escape",
    rpcCall && !JSON.stringify(rpcCall.args.p_patch).includes("\\u0000") && rpcCall.args.p_patch.chatSimulationResult.messages[0].content === "pasted�text",
    rpcCall ? JSON.stringify(rpcCall.args.p_patch) : "no rpc call",
  );
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
