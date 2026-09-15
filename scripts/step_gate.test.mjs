#!/usr/bin/env node
/**
 * Local test runner for the step-gate fix — plain assertions, no framework.
 *
 * Exercises the exact functions CandidateStepGate (and VoiceInterviewPhase's own
 * gate) call — buildCandidateJourney / positionFor from
 * src/lib/candidateJourney.ts — over realistic journeys, and checks the
 * reached-step decision (`actualPosition.index >= journey.index`) comes out
 * right for: a candidate typing ahead, a candidate on their real step, a
 * candidate revisiting a completed step, a rejected application, an
 * employer-reset phase, and an unknown stepId in the URL.
 *
 * Run with: node scripts/step_gate.test.mjs
 */
import { buildCandidateJourney, positionFor } from "../src/lib/candidateJourney.ts";

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

// A realistic job: application, quiz, typing test, voice interview, decision.
const workflowSteps = [
  { id: "wf-typing", type: "typing_test", title: "Typing Test" },
  { id: "wf-voice", type: "voice_interview", title: "Interview" },
];
const steps = buildCandidateJourney(workflowSteps, { hasQuiz: true });
// steps: [application, quiz, wf-typing, wf-voice, decision]  (indices 0..4)

function hasReached({ actualPhase, actualStatus, urlStepId }) {
  const journey = positionFor(steps, { stepId: urlStepId, phase: actualPhase });
  const actual = positionFor(steps, { phase: actualPhase, status: actualStatus });
  return actual.index >= journey.index;
}

console.log("Realistic journeys — the reached-step decision:\n");

// 1. Fresh candidate, still on the application — tries to skip straight to the
//    voice interview by typing its URL. This is the bug: must be blocked.
check(
  "blocks a candidate on 'application' from opening 'wf-voice' directly",
  hasReached({ actualPhase: "application", actualStatus: "pending", urlStepId: "wf-voice" }) === false,
);

// 2. Candidate is exactly on the step whose URL they're loading — normal case.
check(
  "allows a candidate on 'wf-typing' to open 'wf-typing'",
  hasReached({ actualPhase: "wf-typing", actualStatus: "pending", urlStepId: "wf-typing" }) === true,
);

// 3. Candidate has moved on to a later step but revisits an earlier, already
//    completed one (e.g. downloading their own typing-test summary again).
check(
  "allows a candidate on 'wf-voice' to revisit 'quiz'",
  hasReached({ actualPhase: "wf-voice", actualStatus: "pending", urlStepId: "quiz" }) === true,
);

// 4. The one step immediately ahead is still blocked, not just far-ahead ones.
check(
  "blocks a candidate on 'quiz' from the very next step 'wf-typing'",
  hasReached({ actualPhase: "quiz", actualStatus: "pending", urlStepId: "wf-typing" }) === false,
);

// 5. Rejected application, phase never advanced past the quiz — a rejection can
//    land mid-journey. Steps genuinely never reached must stay blocked; the
//    phase they were actually on stays reachable (revisit behaviour).
check(
  "a rejection mid-journey still blocks a step never reached ('wf-voice')",
  hasReached({ actualPhase: "quiz", actualStatus: "rejected", urlStepId: "wf-voice" }) === false,
);
check(
  "a rejection mid-journey still allows revisiting the step it happened on ('quiz')",
  hasReached({ actualPhase: "quiz", actualStatus: "rejected", urlStepId: "quiz" }) === true,
);

// 6. Rejected/decided with no real phase recorded at all (legacy data, or a
//    decision made without a phase value) — status alone resolves to the
//    closing Decision stage, so every real step is treated as behind them.
check(
  "a decided application with no phase falls back to status and allows any real step",
  hasReached({ actualPhase: null, actualStatus: "rejected", urlStepId: "wf-voice" }) === true,
);

// 7. Employer resets the phase back to an earlier step (e.g. re-opening the
//    quiz after a reset) — the candidate must be blocked from the later step
//    they'd already reached before the reset, the same way a fresh candidate
//    would be.
check(
  "an employer-reset phase blocks the later step that was reset away",
  hasReached({ actualPhase: "quiz", actualStatus: "pending", urlStepId: "wf-voice" }) === false,
);

// 8. Unknown stepId in the URL (typo'd, stale, or a step id from a job whose
//    workflow_steps changed) — must never fabricate an "ahead of everything"
//    position that unlocks steps the candidate hasn't reached. It falls back
//    to the candidate's real phase, which can only ever equal — never exceed —
//    their real position.
check(
  "an unknown stepId never grants access beyond the candidate's real step",
  hasReached({ actualPhase: "application", actualStatus: "pending", urlStepId: "not-a-real-step-id" }) === true,
  "falls back to the real phase's own position, which always passes its own gate",
);
check(
  "an unknown stepId does not itself unlock a later real step",
  positionFor(steps, { stepId: "not-a-real-step-id", phase: "application" }).index ===
    positionFor(steps, { phase: "application" }).index,
);

// 9. Completed final step, decision pending — candidate revisits the last real
//    step they did.
check(
  "a candidate at 'decision' can revisit the last real step they completed",
  hasReached({ actualPhase: "decision", actualStatus: "reviewing", urlStepId: "wf-voice" }) === true,
);

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
