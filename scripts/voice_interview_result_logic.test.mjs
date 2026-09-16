#!/usr/bin/env node
/**
 * Plain-Node proof for the voice_interview part-B conversion's own logic —
 * same style as scripts/trusted_results_logic.test.mjs (which this
 * supplements, not replaces: that file already covers hasReachedStep /
 * computeNextStepDecision / mergeTrustedNotes generically, including one
 * voice_interview step in its "Journey A" fixture). This file exercises the
 * SAME real, unmodified trustedResults.ts functions against realistic
 * voice_interview-specific journeys and result shapes — the closest
 * equivalent this phase has to "server-side grading logic matching today's
 * client logic": voice_interview has no client-side SCORE computation to
 * replicate (Ava's end_interview tool call, and the fixed manual-end
 * fallback in submit_voice_interview_manual_end, both already compute the
 * evaluation server-side and are untouched by this conversion) — what
 * changed is the PHASE-ADVANCE decision recordStepResult now makes for this
 * step, and the notes shape it writes, neither of which the browser ever
 * computed for voice_interview before (grep of VoiceInterviewPhase.tsx: no
 * `phase:` write, ever). This proves that decision is correct for the real
 * shapes ava-voice-tools' "record_interview_transcript" case now feeds it.
 *
 * Run with: node scripts/voice_interview_result_logic.test.mjs
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
// Realistic journey: application -> typing_test -> voice_interview -> decision
// (voice_interview as the LAST configured step — the common real-world
// shape: an employer configures Ava interview after everything else, per
// docs/TRUSTED-RESULTS.md's own note that earlier phases stop one step
// early specifically to wait for voice_interview to be configured).
// ============================================================================
console.log("Journey — application -> typing_test -> voice_interview -> decision (auto mode):\n");

const autoSteps = buildCandidateJourney([
  { id: "wf-typing", type: "typing_test", title: "Typing Test" },
  { id: "wf-voice", type: "voice_interview", title: "Ava Interview" },
]);
// [application, wf-typing, wf-voice, decision]

check(
  "hasReachedStep: candidate exactly on wf-voice (phase=wf-voice) has reached it",
  hasReachedStep(autoSteps, { stepId: "wf-voice", expectedType: "voice_interview", phase: "wf-voice", status: "pending" }).reached === true,
);
check(
  "hasReachedStep: candidate still on wf-typing has NOT reached wf-voice",
  hasReachedStep(autoSteps, { stepId: "wf-voice", expectedType: "voice_interview", phase: "wf-typing", status: "pending" }).reached === false,
);
check(
  "hasReachedStep: a real step id under the wrong expectedType (typing_test route asking for voice_interview) is refused",
  hasReachedStep(autoSteps, { stepId: "wf-typing", expectedType: "voice_interview", phase: "wf-voice", status: "pending" }).reached === false,
);

const autoDecision = computeNextStepDecision(autoSteps, "wf-voice", "wf-voice", "auto");
check(
  "computeNextStepDecision: auto mode, voice_interview is the last real step -> advances to the closing decision stage",
  autoDecision.advance === true && autoDecision.nextStep.id === DECISION_STAGE_ID && autoDecision.nextStatus === "reviewing",
);
check(
  "nextStepForCandidate: the decision stage itself is never offered as a clickable next step -> 'waiting'",
  nextStepForCandidate(autoDecision) === "waiting",
);

const manualSteps = autoSteps; // same shape, different processing_mode
const manualDecision = computeNextStepDecision(manualSteps, "wf-voice", "wf-voice", "manual");
check(
  "computeNextStepDecision: manual mode never auto-advances past voice_interview — employer decides from the cockpit",
  manualDecision.advance === false && manualDecision.reason === "manual",
);

const nullModeDecision = computeNextStepDecision(manualSteps, "wf-voice", "wf-voice", null);
check(
  "computeNextStepDecision: processing_mode null/undefined is treated as manual, same as every phase page's own processing_mode === 'auto' check",
  nullModeDecision.advance === false && nullModeDecision.reason === "manual",
);

// ============================================================================
// A job that (unusually) configures a real step AFTER voice_interview.
// Structurally possible even if uncommon in practice — recordStepResult
// must not assume voice_interview is always last.
// ============================================================================
console.log("\nJourney — voice_interview followed by a portfolio_upload step (auto mode):\n");

const trailingSteps = buildCandidateJourney([
  { id: "wf-voice", type: "voice_interview", title: "Ava Interview" },
  { id: "wf-portfolio", type: "portfolio_upload", title: "Portfolio" },
]);
// [application, wf-voice, wf-portfolio, decision]

const trailingDecision = computeNextStepDecision(trailingSteps, "wf-voice", "wf-voice", "auto");
check(
  "computeNextStepDecision: recording voice_interview's OWN result advances to whatever real step comes after it, not to the decision stage",
  trailingDecision.advance === true && trailingDecision.nextStep.id === "wf-portfolio",
);

// ============================================================================
// mergeTrustedNotes — the exact shape ava-voice-tools' record_interview_transcript
// case writes: resultKey "voiceInterviewResult", no legacyStepEntry, no
// extraNotesEntries (docs/TRUSTED-RESULTS.md's result_key table says "no" to
// both for this phase — unlike video_intro's videoIntroUrl).
// ============================================================================
console.log("\nmergeTrustedNotes — voiceInterviewResult shape:\n");

const evaluation = {
  overall_score: 78,
  recommendation: "advance",
  summary: "Strong communicator, solid technical depth.",
  ended_by: "ava_tool_call",
};

const mergedJson = mergeTrustedNotes(
  JSON.stringify({ applicationAnswers: [{ q: "Why us?", answer: "..." }] }),
  {
    stepId: "wf-voice",
    stepType: "voice_interview",
    resultKey: "voiceInterviewResult",
    result: evaluation,
  },
  "2026-09-16T00:00:00.000Z",
);
const merged = JSON.parse(mergedJson);

check(
  "mergeTrustedNotes: writes notes.voiceInterviewResult with the exact evaluation object",
  JSON.stringify(merged.voiceInterviewResult) === JSON.stringify(evaluation),
);
check(
  "mergeTrustedNotes: does NOT write a legacy notes[stepId] entry for voice_interview (no legacyStepEntry passed)",
  merged["wf-voice"] === undefined,
);
check(
  "mergeTrustedNotes: writes the server-only _trusted marker for this step",
  merged._trusted?.["wf-voice"]?.stepType === "voice_interview" && merged._trusted["wf-voice"].completedAt === "2026-09-16T00:00:00.000Z",
);
check(
  "mergeTrustedNotes: leaves unrelated existing notes untouched",
  JSON.stringify(merged.applicationAnswers) === JSON.stringify([{ q: "Why us?", answer: "..." }]),
);

// A second call (simulating a retry) must be a clean overwrite of the same
// key, not a duplicate/array — recordStepResult's own overwrite-refusal
// (guarded separately, at the ava-voice-tools layer, by checking
// voice_interview_transcript is still null) is what actually stops a
// second REAL call from happening; this just proves the merge itself stays
// well-behaved if it ever did run twice.
const mergedTwiceJson = mergeTrustedNotes(mergedJson, {
  stepId: "wf-voice",
  stepType: "voice_interview",
  resultKey: "voiceInterviewResult",
  result: { ...evaluation, overall_score: 999 },
}, "2026-09-16T00:05:00.000Z");
const mergedTwice = JSON.parse(mergedTwiceJson);
check(
  "mergeTrustedNotes: a second merge cleanly replaces the prior result (no duplication)",
  mergedTwice.voiceInterviewResult.overall_score === 999,
);

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
