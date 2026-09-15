#!/usr/bin/env node
/**
 * Local test runner for the step-gate fix — plain assertions, no framework.
 *
 * Exercises the exact functions CandidateStepGate calls —
 * `buildCandidateJourney` / `resolveGatedStep` from src/lib/candidateJourney.ts
 * — over realistic journeys, and checks the reached-step decision
 * (`resolution.matched && actualPosition.index >= resolution.index`) comes
 * out right for: a candidate typing ahead, a candidate on their real step, a
 * candidate revisiting a completed step, a rejected application, an
 * employer-reset phase, an unknown stepId in the URL, and — the two bypasses
 * a review round found in the first cut of this fix — an unrecognized stepId
 * on ANY route, and a real, currently-reachable stepId opened under the
 * WRONG route's phase.
 *
 * Run with: node scripts/step_gate.test.mjs
 */
import { buildCandidateJourney, positionFor, resolveGatedStep } from "../src/lib/candidateJourney.ts";

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

// Mirrors exactly what CandidateStepGate computes: `resolveGatedStep` first —
// which requires stepId to name a real step of THIS route's own
// `expectedType` — and only then compares against the candidate's real
// position. A route is always exercised with the expectedType the real
// route that route segment carries in App.tsx (see scripts/guards/step-gate.mjs).
function hasReached({ actualPhase, actualStatus, urlStepId, expectedType }) {
  const resolution = resolveGatedStep(steps, { stepId: urlStepId, expectedType });
  if (!resolution.matched) return false;
  const actual = positionFor(steps, { phase: actualPhase, status: actualStatus });
  return actual.index >= resolution.index;
}

console.log("Realistic journeys — the reached-step decision:\n");

// 1. Fresh candidate, still on the application — tries to skip straight to the
//    voice interview by typing its URL. This is the bug: must be blocked.
check(
  "blocks a candidate on 'application' from opening 'wf-voice' directly",
  hasReached({ actualPhase: "application", actualStatus: "pending", urlStepId: "wf-voice", expectedType: "voice_interview" }) === false,
);

// 2. Candidate is exactly on the step whose URL they're loading — normal case.
check(
  "allows a candidate on 'wf-typing' to open 'wf-typing'",
  hasReached({ actualPhase: "wf-typing", actualStatus: "pending", urlStepId: "wf-typing", expectedType: "typing_test" }) === true,
);

// 3. Candidate has moved on to a later step but revisits an earlier, already
//    completed one (e.g. downloading their own typing-test summary again).
check(
  "allows a candidate on 'wf-voice' to revisit 'quiz'",
  hasReached({ actualPhase: "wf-voice", actualStatus: "pending", urlStepId: "quiz", expectedType: "quiz" }) === true,
);

// 4. The one step immediately ahead is still blocked, not just far-ahead ones.
check(
  "blocks a candidate on 'quiz' from the very next step 'wf-typing'",
  hasReached({ actualPhase: "quiz", actualStatus: "pending", urlStepId: "wf-typing", expectedType: "typing_test" }) === false,
);

// 5. Rejected application, phase never advanced past the quiz — a rejection can
//    land mid-journey. Steps genuinely never reached must stay blocked; the
//    phase they were actually on stays reachable (revisit behaviour).
check(
  "a rejection mid-journey still blocks a step never reached ('wf-voice')",
  hasReached({ actualPhase: "quiz", actualStatus: "rejected", urlStepId: "wf-voice", expectedType: "voice_interview" }) === false,
);
check(
  "a rejection mid-journey still allows revisiting the step it happened on ('quiz')",
  hasReached({ actualPhase: "quiz", actualStatus: "rejected", urlStepId: "quiz", expectedType: "quiz" }) === true,
);

// 6. Rejected/decided with no real phase recorded at all (legacy data, or a
//    decision made without a phase value) — status alone resolves to the
//    closing Decision stage, so every real step is treated as behind them.
check(
  "a decided application with no phase falls back to status and allows any real step",
  hasReached({ actualPhase: null, actualStatus: "rejected", urlStepId: "wf-voice", expectedType: "voice_interview" }) === true,
);

// 7. Employer resets the phase back to an earlier step (e.g. re-opening the
//    quiz after a reset) — the candidate must be blocked from the later step
//    they'd already reached before the reset, the same way a fresh candidate
//    would be.
check(
  "an employer-reset phase blocks the later step that was reset away",
  hasReached({ actualPhase: "quiz", actualStatus: "pending", urlStepId: "wf-voice", expectedType: "voice_interview" }) === false,
);

// 8. Unknown stepId in the URL (typo'd, stale, a step id from a job whose
//    workflow_steps changed, or a candidate simply typing garbage into the
//    URL's last segment). This is the FIRST bypass a review round found in
//    the first cut of this fix: `positionFor`'s lenient phase-fallback made
//    ANY unrecognized stepId resolve to the candidate's own current phase,
//    so `actual.index >= journey.index` collapsed to `actual >= actual` —
//    always true — unlocking every route regardless of real progress.
//    `resolveGatedStep` must refuse to match at all, not fall back to
//    anything, so access is denied outright.
check(
  "a garbage stepId on a fresh candidate's own current route is blocked, not fabricated as reachable",
  hasReached({ actualPhase: "application", actualStatus: "pending", urlStepId: "not-a-real-step-id", expectedType: "voice_interview" }) === false,
);
check(
  "an unknown stepId never resolves to a real position at all",
  resolveGatedStep(steps, { stepId: "not-a-real-step-id", expectedType: "application" }).matched === false,
);

// 9. Completed final step, decision pending — candidate revisits the last real
//    step they did.
check(
  "a candidate at 'decision' can revisit the last real step they completed",
  hasReached({ actualPhase: "decision", actualStatus: "reviewing", urlStepId: "wf-voice", expectedType: "voice_interview" }) === true,
);

console.log("\nCross-route bypass — a real, currently-reachable stepId opened under the wrong route:\n");

// 10. SECOND bypass a review round found: a candidate whose OWN real,
//     currently-unlocked step is 'wf-typing' (a real typing_test step) edits
//     only the URL's phase segment — /voice-interview/wf-typing instead of
//     /typing-test/wf-typing — keeping their real stepId. `positionFor`
//     only ever matched by step id, never checked the resolved step's type
//     against the route, so this sailed through and rendered
//     VoiceInterviewPhase (a live session) instead of TypingTestPhase.
//     `resolveGatedStep` must refuse whenever the matched step's type
//     doesn't equal the route's own `expectedType`.
check(
  "a real, reachable stepId opened under the WRONG route's phase is refused",
  hasReached({ actualPhase: "wf-typing", actualStatus: "pending", urlStepId: "wf-typing", expectedType: "voice_interview" }) === false,
);
check(
  "resolveGatedStep refuses a type mismatch even though positionFor alone would have matched it",
  resolveGatedStep(steps, { stepId: "wf-typing", expectedType: "voice_interview" }).matched === false &&
    positionFor(steps, { stepId: "wf-typing" }).index !== -1,
);
check(
  "the SAME real stepId opened under its OWN correct route still resolves and is reachable",
  hasReached({ actualPhase: "wf-typing", actualStatus: "pending", urlStepId: "wf-typing", expectedType: "typing_test" }) === true,
);
check(
  "a real, NOT-yet-reached stepId opened under the wrong route is refused too (not just the reachable case)",
  hasReached({ actualPhase: "application", actualStatus: "pending", urlStepId: "wf-typing", expectedType: "voice_interview" }) === false,
);

// 11. video_intro / video_message legacy alias: a job whose stored step type
//     is the legacy "video_message" must still resolve under the
//     "video_intro" route, and vice versa — but never under an unrelated
//     phase.
{
  const videoSteps = buildCandidateJourney(
    [{ id: "wf-video", type: "video_message", title: "Say hello" }],
    { hasQuiz: false },
  );
  check(
    "a legacy 'video_message' step resolves under the 'video_intro' route",
    resolveGatedStep(videoSteps, { stepId: "wf-video", expectedType: "video_intro" }).matched === true,
  );
  check(
    "a legacy 'video_message' step still does not resolve under an unrelated route",
    resolveGatedStep(videoSteps, { stepId: "wf-video", expectedType: "quiz" }).matched === false,
  );
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
