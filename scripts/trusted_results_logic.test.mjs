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

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
