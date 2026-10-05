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
 * Later the same day the owner went further: in auto mode nobody is ever
 * parked part-way. Every applicant takes every test up to and including the
 * written interview, Ava only scores and flags, and he decides at the end. A
 * real deal-breaker (visa, schedule, wrong resume) is now a highlighted flag
 * (scorecard.dealBreakerFlags), never a stop; the judge's prose ("below the
 * non-negotiable 45 WPM requirement") is never a reason at all. Manual jobs
 * keep the early recommendation.
 *
 * Run with: node scripts/pending_phase_not_a_conflict.test.mjs
 */

import {
  buildAvaScorecard,
  computeJudgmentScore,
  isEligibilityBlocker,
  isPendingPhaseNote,
  proseAffirmsDealBreaker,
  readChatInterviewResult,
  resolveAutopilotAction,
  STATED_DEAL_BREAKER_FLAG,
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

/**
 * An applicant to the live role (an AUTO-mode job, like the real one) who has
 * only sent the application form unless `done` says otherwise. `done.mode`
 * switches the job to manual; `done.analysisText` / `done.jobRequirements`
 * feed the judge's prose and the job's own text.
 */
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
    analysisText: done.analysisText ?? "",
    resumeUnavailable: true,
    resumeTextUsed: false,
    resumeImageCount: 0,
    applicationAnswerCount: 11,
    coverLetterProvided: false,
    workflowSteps: ZULU_STEPS,
    jobTitle: "Customer Support Chat Agent (Zulu Royal & Zulu Rush)",
    jobDescription: "Remote chat support for players",
    jobRequirements: done.jobRequirements ?? "• Typing speed of at least 45 words a minute with high accuracy",
    jobSkillsRequired: ["Fluent written English", "Fast, accurate typing", "De-escalation"],
    experienceLevel: "entry",
    processingMode: done.mode ?? "auto",
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

// Owner, 2026-10-05 (second decision that day): in auto mode NOBODY is parked
// part-way. A real deal-breaker is a highlighted flag for him, never a stop.
const SCHEDULE_BLOCKER = "Cannot work the required overnight schedule.";
const blocked = applicationStage([SCHEDULE_BLOCKER]);
assert(blocked.hardRejectReason === null, `a real schedule blocker is NOT a reason to stop anyone mid-way (got ${JSON.stringify(blocked.hardRejectReason)})`);
assert(blocked.autopilotAction === "defer", `the applicant goes on to the next test (got "${blocked.autopilotAction}")`);
assert(resolveAutopilotAction(blocked.overallScore, 60, blocked) === "defer", "nothing in trigger-ava-analysis would hold them");
assert(blocked.dealBreakerFlags?.includes(SCHEDULE_BLOCKER), `it is highlighted for the owner (dealBreakerFlags: ${JSON.stringify(blocked.dealBreakerFlags)})`);
assert(blocked.riskFlags.includes(SCHEDULE_BLOCKER), "and listed with the risks");
assert(blocked.hardRequirementStatus === "at_risk", "the hard-requirement read says at risk");
assert(/Flagged for your review/.test(blocked.rationale), `Ava's note says it is flagged, not that she stopped them (${blocked.rationale})`);

const mixed = applicationStage([OBSERVED_NOTE, "Work visa is pending."]);
assert(mixed.hardRejectReason === null, "a pending note never becomes a reason, and the real one is a flag mid-way");
assert(mixed.riskFlags.includes("Work visa is pending."), "the real one is still shown to the owner");
assert(mixed.dealBreakerFlags?.includes("Work visa is pending.") && !mixed.dealBreakerFlags.includes(OBSERVED_NOTE), "only the real one is highlighted");

// Manual jobs are untouched: there the owner reviews each step, and Ava may
// still recommend stopping at a real deal-breaker.
const manualBlocked = applicationStage([SCHEDULE_BLOCKER], { mode: "manual" });
assert(manualBlocked.hardRejectReason === SCHEDULE_BLOCKER, "manual job: a real deal-breaker is still Ava's reason to stop early");
assert(manualBlocked.autopilotAction === "reject", `manual job: and her action is still "reject" (got "${manualBlocked.autopilotAction}")`);
const manualPending = applicationStage([OBSERVED_NOTE], { mode: "manual" });
assert(manualPending.hardRejectReason === null && manualPending.autopilotAction === "defer", "manual job: a pending-step note is still not a reason");

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

const blockedEarly = applicationStage([SCHEDULE_BLOCKER], weak);
assert(blockedEarly.autopilotAction === "defer", `a real deal-breaker no longer stops someone before the next test (got "${blockedEarly.autopilotAction}")`);
assert(blockedEarly.dealBreakerFlags?.includes(SCHEDULE_BLOCKER), "it is flagged for the owner instead");

const blockedAtEnd = applicationStage([SCHEDULE_BLOCKER], {
  ...weak,
  typingTest: { wpm: 50, score: 80, accuracy: 97 },
  chatSimulationScore: 70,
  chatInterviewScore: 70,
});
assert(blockedAtEnd.hardRejectReason === SCHEDULE_BLOCKER, "after the last test it is Ava's reason for the owner to weigh");
assert(blockedAtEnd.autopilotAction === "reject" && blockedAtEnd.recommendedAction === "reject", "and her end-of-tests read is to decline, for him to confirm");
assert(/nobody was stopped/.test(blockedAtEnd.rationale), `her note says nobody was stopped (${blockedAtEnd.rationale})`);

console.log("\nThe judge words the same non-reason differently every time (2026-10-05, second run):\n");

// Seen live on the second throwaway applicant, after the phrase-list fix shipped.
const REWORDED = "No evidence is provided for the required 45+ WPM typing threshold or high typing accuracy.";
assert(!isPendingPhaseNote(REWORDED), "the phrase list alone does not catch this wording (why the topic rule exists)");
const reworded = applicationStage([REWORDED]);
assert(reworded.hardRejectReason === null, `a typing note is not a reason to stop anyone before the typing test (got ${JSON.stringify(reworded.hardRejectReason)})`);
assert(reworded.autopilotAction === "defer", `the applicant moves on (got "${reworded.autopilotAction}")`);
assert(!reworded.riskFlags.includes(REWORDED), "and it is not shown to the owner as a risk while the test is still ahead");
assert(reworded.overallScore === applicationStage([]).overallScore, "and costs no points");

console.log("\nA measured shortfall waits for the end, and in auto mode so does a deal-breaker:\n");

const SLOW = "Typing speed of 20 WPM is far below the required 45 WPM.";
assert(!isEligibilityBlocker(SLOW), "a slow typing result is not an eligibility deal-breaker");
const typedSlowly = applicationStage([SLOW], { ...weak, typingTest: { wpm: 20, score: 44, accuracy: 90 } });
assert(typedSlowly.hardRejectReason === null, `after the typing test, a slow result does not stop them before the chat practice (got ${JSON.stringify(typedSlowly.hardRejectReason)})`);
assert(typedSlowly.autopilotAction === "defer", `they go on to the chat practice (got "${typedSlowly.autopilotAction}")`);
assert(typedSlowly.riskFlags.includes(SLOW), "the measured result is shown to the owner");

const finishedSlow = applicationStage([SLOW], {
  ...weak,
  typingTest: { wpm: 20, score: 44, accuracy: 90 },
  chatSimulationScore: 35,
  chatInterviewScore: 40,
});
assert(finishedSlow.hardRejectReason === SLOW, "after the last test it is Ava's reason for the owner to weigh");
assert(finishedSlow.autopilotAction === "reject", "and her read is to decline, for him to confirm");

for (const blocker of [
  "Says they cannot work any US Eastern shift.",
  "Work visa is pending.",
  "Name mismatch between the application and the documents.",
  "Answers appear fabricated.",
]) {
  assert(isEligibilityBlocker(blocker), `eligibility deal-breaker: "${blocker}"`);
  const early = applicationStage([blocker], weak);
  assert(early.autopilotAction === "defer" && early.hardRejectReason === null, `"${blocker}" does not stop anyone before the next test`);
  assert(early.dealBreakerFlags?.includes(blocker), `"${blocker}" is highlighted for the owner`);
  assert(applicationStage([blocker], { ...weak, mode: "manual" }).autopilotAction === "reject", `manual job: "${blocker}" still makes Ava recommend stopping`);
}

console.log("\nThe judge's prose is never a reason to stop anyone (2026-10-05, the run that parked twice):\n");

// Stored word for word in the owner's test applicant's ai_analysis. The job
// never says non-negotiable; the judge did.
const JUDGE_ADJECTIVE = "Areas of Concern:\n- The completed typing test was below the non-negotiable 45 WPM requirement at 38 WPM.";
const everyTestDone = {
  ...weak,
  typingTest: { wpm: 38, score: 72, accuracy: 85 },
  chatSimulationScore: 18,
  chatInterviewScore: 25,
};
const judged = applicationStage([], { ...everyTestDone, analysisText: JUDGE_ADJECTIVE });
assert(judged.hardRejectReason === null, `the judge's own adjective is not a reason (got ${JSON.stringify(judged.hardRejectReason)})`);
assert(!judged.riskFlags.includes(STATED_DEAL_BREAKER_FLAG), "and not even a flag: the job states no non-negotiable");
const judgedMidway = applicationStage([], { ...weak, typingTest: { wpm: 38, score: 72, accuracy: 85 }, analysisText: JUDGE_ADJECTIVE });
assert(judgedMidway.autopilotAction === "defer" && judgedMidway.hardRejectReason === null, "mid-way it stops nobody either");

const WEEKEND_JOB = "Non-negotiable: you must work every weekend.";
for (const [text, expected] of [
  ["No deal-breakers identified.", false],
  ["There are no non-negotiables in this posting.", false],
  ["Non-negotiables: none stated.", false],
  ["Nothing here is a dealbreaker.", false],
  ["The candidate is available for the required schedule.", false],
  ["The candidate did not mention a deal-breaker.", false],
  ["Working weekends is a deal-breaker for this candidate.", true],
  ["The candidate cannot work weekends, which conflicts with the non-negotiable.", true],
  ["Did not list a preference, but cannot work nights.", true],
]) {
  assert(
    proseAffirmsDealBreaker(text, WEEKEND_JOB) === expected,
    `${expected ? "flags" : "does not flag"}: "${text}"`,
  );
}
assert(!proseAffirmsDealBreaker("This is a deal-breaker for the role.", "Remote chat support"), "a deal-breaker the job never stated is not flagged");
assert(proseAffirmsDealBreaker("This is a deal-breaker for the role.", WEEKEND_JOB), "one the job states is");

const statedConflict = applicationStage([], {
  ...everyTestDone,
  jobRequirements: WEEKEND_JOB,
  analysisText: "The candidate cannot work weekends, which conflicts with the non-negotiable.",
});
assert(statedConflict.riskFlags.includes(STATED_DEAL_BREAKER_FLAG), "a real, affirmed conflict with the job's own non-negotiable is shown to the owner");
assert(statedConflict.hardRejectReason !== STATED_DEAL_BREAKER_FLAG, "but the prose flag is never promoted to the reason itself");

console.log("\nThe written interview counts in both of its shapes:\n");

const flatInterview = readChatInterviewResult({ score: 64, recommendation: "Hire", messageCount: 12 });
assert(flatInterview?.score === 64 && flatInterview.recommendation === "Hire" && flatInterview.messageCount === 12, "the End Interview (flat) shape");
const nestedInterview = readChatInterviewResult({
  evaluation: { score: 25, recommendation: "No Hire" },
  messages: [{ role: "assistant", content: "Hi" }, { role: "user", content: "Hello" }],
  questionCount: 4,
});
assert(nestedInterview?.score === 25 && nestedInterview.recommendation === "No Hire", `the auto-end (nested) shape (${JSON.stringify(nestedInterview)})`);
assert(nestedInterview?.messageCount === 2, "its message count comes from the transcript");
assert(readChatInterviewResult({ score: 0 })?.score === 0, "a real 0 is a score, not 'not completed'");
assert(readChatInterviewResult(null) === null && readChatInterviewResult("x") === null, "no result reads as none");

console.log(failures ? `\n${failures} assertion(s) failed.` : "\nAll assertions passed.");
process.exit(failures ? 1 : 0);
