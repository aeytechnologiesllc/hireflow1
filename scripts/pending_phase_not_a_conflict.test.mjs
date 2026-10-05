#!/usr/bin/env node
/**
 * A step that has not happened yet is not a reason to stop someone before it.
 *
 * On 2026-10-05 the first applicant to the Zulu chat-agent role finished step 1
 * (the application form) and was held there, "Ava recommends declining — needs your
 * review", because the judge wrote this into hardRequirementConflicts:
 *
 *   "Required typing speed and accuracy have not yet been verified; the typing test is pending."
 *
 * The typing test is step 3. The word "required" made that note the hard reject
 * reason, so every applicant to a role with a typing test would have stopped at
 * step 1. These checks run the real pure functions in
 * supabase/functions/_shared/autopilot.ts (Node 24+ strips the types natively).
 *
 * Run with: node scripts/pending_phase_not_a_conflict.test.mjs
 */

import {
  buildAvaScorecard,
  computeJudgmentScore,
  isPendingPhaseNote,
  resolveAutopilotAction,
} from "../supabase/functions/_shared/autopilot.ts";

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  ok    ${message}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  }
}

// The production note, word for word.
const OBSERVED_NOTE =
  "Required typing speed and accuracy have not yet been verified; the typing test is pending.";

// The live role's shape: a 10-question quiz, then typing, chat practice, written interview.
const ZULU_STEPS = [
  { id: "step_typing", type: "typing_test" },
  { id: "step_chat", type: "chat_simulation" },
  { id: "step_interview", type: "chat_interview" },
];

/** An applicant who has only sent the application form (nothing else has happened yet). */
function applicationStage(hardRequirementConflicts, done = {}) {
  return buildAvaScorecard({
    finalScore: done.finalScore ?? null,
    passingScore: 60,
    quizScore: done.quizScore ?? null,
    quizConfigured: true,
    typingTest: done.typingTest ?? null,
    voiceScore: null,
    portfolioScore: null,
    chatSimulationScore: done.chatSimulationScore ?? null,
    salesSimulationScore: null,
    chatInterviewScore: done.chatInterviewScore ?? null,
    videoIntroScore: null,
    videoIntroSubmitted: false,
    analysisText: "",
    resumeUnavailable: true,
    resumeTextUsed: false,
    resumeImageCount: 0,
    applicationAnswerCount: 11,
    coverLetterProvided: false,
    workflowSteps: ZULU_STEPS,
    jobTitle: "Customer Support Chat Agent (Zulu Royal & Zulu Rush)",
    jobDescription: "Remote chat support for players",
    jobSkillsRequired: ["Fluent written English", "Fast, accurate typing", "De-escalation"],
    experienceLevel: "entry",
    directMatchScore: done.directMatchScore ?? 62,
    transferableFitScore: 66,
    learningSignalScore: 60,
    writingQualityScore: 78,
    attentionToDetailScore: 74,
    authenticityScore: 85,
    specificityScore: 58,
    hardRequirementConflicts,
    transferableEvidence: ["Two years of online-shop chat support"],
    evidenceFingerprint: "pending-phase-test",
  });
}

console.log("Notes that only say a later step is still to come:\n");
for (const note of [
  OBSERVED_NOTE,
  "Typing speed is not yet verified because the typing test has not been completed.",
  "Chat handling will be assessed in the chat simulation.",
  "The written interview is still pending.",
  "Quiz results are awaiting completion.",
]) {
  assert(isPendingPhaseNote(note), `pending, not a conflict: "${note}"`);
}

console.log("\nReal blockers stay blockers:\n");
for (const note of [
  "Cannot work the required overnight schedule.",
  "Work visa is pending.",
  "Resume belongs to a different person.",
  "Requires a nursing license the candidate does not hold.",
]) {
  assert(!isPendingPhaseNote(note), `still a conflict: "${note}"`);
}

console.log("\nThe application-stage decision:\n");

const observed = applicationStage([OBSERVED_NOTE]);
assert(observed.hardRejectReason === null, `the observed note is not a hard reject reason (got ${JSON.stringify(observed.hardRejectReason)})`);
assert(observed.autopilotAction === "defer", `the applicant moves on to collect evidence: autopilotAction "defer" (got "${observed.autopilotAction}")`);
assert(observed.decisionState === "needs_more_evidence", `decisionState "needs_more_evidence" (got "${observed.decisionState}")`);
assert(
  resolveAutopilotAction(observed.overallScore, 60, observed) === "defer",
  "trigger-ava-analysis would move them to the next step, not hold them for a decline",
);
assert(!observed.riskFlags.includes(OBSERVED_NOTE), "the note is not shown to the owner as a risk flag");

const none = applicationStage([]);
assert(
  observed.overallScore === none.overallScore,
  `the note costs no points (${observed.overallScore} with it, ${none.overallScore} without)`,
);
assert(
  computeJudgmentScore({ hardRequirementConflicts: [OBSERVED_NOTE] }) === computeJudgmentScore({ hardRequirementConflicts: [] }),
  "computeJudgmentScore ignores it too",
);

const blocked = applicationStage(["Cannot work the required overnight schedule."]);
assert(blocked.hardRejectReason !== null, "a real schedule blocker is still the hard reject reason");
assert(blocked.autopilotAction === "reject", `and still holds the applicant for the owner (got "${blocked.autopilotAction}")`);

const mixed = applicationStage([OBSERVED_NOTE, "Work visa is pending."]);
assert(mixed.hardRejectReason === null || mixed.hardRejectReason === "Work visa is pending.", "a pending note never hides a real one");
assert(mixed.riskFlags.includes("Work visa is pending."), "the real one is still shown to the owner");

console.log("\nEveryone takes every test; the owner decides at the end (2026-10-05):\n");

// A weak applicant who has finished the skills check and nothing else.
const weak = { directMatchScore: 30, quizScore: 40, finalScore: 40 };
const afterQuiz = applicationStage([], weak);
assert(afterQuiz.overallScore < 60, `the fixture really is under the passing score (${afterQuiz.overallScore})`);
assert(afterQuiz.autopilotAction === "defer", `a low score after the skills check moves on to the typing test (got "${afterQuiz.autopilotAction}")`);
assert(afterQuiz.decisionState === "needs_more_evidence", "and is not put in front of the owner yet");
assert(
  resolveAutopilotAction(afterQuiz.overallScore, 60, afterQuiz) === "defer",
  "trigger-ava-analysis would open the next test, not hold them",
);

const allDone = applicationStage([], {
  ...weak,
  typingTest: { wpm: 30, score: 60, accuracy: 90 },
  chatSimulationScore: 35,
  chatInterviewScore: 40,
});
assert(allDone.pendingHighSignalPhases.length === 0, `nothing left to take (pending: ${JSON.stringify(allDone.pendingHighSignalPhases)})`);
assert(allDone.decisionState === "ready_for_decision", "after the last test the decision is the owner's");
assert(allDone.autopilotAction === "reject", `and Ava's read on a weak finisher is to decline, for him to confirm (got "${allDone.autopilotAction}")`);

const blockedEarly = applicationStage(["Cannot work the required overnight schedule."], weak);
assert(blockedEarly.autopilotAction === "reject", "a real deal-breaker still stops someone before the next test");

console.log(failures ? `\n${failures} assertion(s) failed.` : "\nAll assertions passed.");
process.exit(failures ? 1 : 0);
