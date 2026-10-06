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
  formDealBreakersFrom,
  formReviewFlagsFrom,
  formatQuizAreas,
  highSignalProgress,
  isEligibilityBlocker,
  isPendingPhaseNote,
  isStatedDealBreakerConflict,
  orphanFlagOptions,
  proseAffirmsDealBreaker,
  quizAreaBreakdown,
  readChatInterviewResult,
  readChatSimulationResult,
  readQuizResult,
  realHardConflicts,
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

// The live role's shape: a 10-question quiz, then the computer and connection
// check, typing, chat practice, written interview. The connection check is
// evidence, never a score and never a test "still ahead" (docs/EQUIPMENT-CHECK.md
// rule 3): every assertion below holds with it in the workflow.
const ZULU_STEPS = [
  { id: "step_connection", type: "equipment_check" },
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
    equipmentCheck: done.equipmentCheck ?? null,
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
    // Anything else buildAvaScorecard takes (requiredWpm, formDealBreakers, …).
    ...(done.extra || {}),
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
  !none.pendingHighSignalPhases.some((label) => /connection|equipment|computer/i.test(label)),
  `the connection check is never a test still to come (pending: ${JSON.stringify(none.pendingHighSignalPhases)})`,
);
assert(
  computeJudgmentScore({ hardRequirementConflicts: [OBSERVED_NOTE] }) === computeJudgmentScore({ hardRequirementConflicts: [] }),
  "computeJudgmentScore ignores it too",
);

// Owner, 2026-10-05 (second decision that day): in auto mode NOBODY is parked
// part-way. A real deal-breaker is a highlighted flag for him, never a stop.
// (2026-10-06, second pass: availability is no longer read from the judge's
// prose at all, so the deal-breaker here is a missing work permit; see "Which
// hours someone can cover" below for what a schedule note does now.)
const SCHEDULE_BLOCKER = "Has no work permit for the United States.";
const blocked = applicationStage([SCHEDULE_BLOCKER]);
assert(blocked.hardRejectReason === null, `a real deal-breaker is NOT a reason to stop anyone mid-way (got ${JSON.stringify(blocked.hardRejectReason)})`);
assert(blocked.overallScore < 60, `but the number already sorts below the pass mark (${blocked.overallScore}), so the list agrees with the flag before the last test (2026-10-06, second pass)`);
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

// 2026-10-06: a finished test's own result is that test's score, never a
// conflict on top of it. Before, this note (with the bare word "required")
// became the decline reason after the last test, and the same 38 WPM lead was
// "review" or "Ava recommends declining" depending on one word.
const finishedSlowInput = {
  ...weak,
  typingTest: { wpm: 20, score: 44, accuracy: 90 },
  chatSimulationScore: 35,
  chatInterviewScore: 40,
};
const finishedSlow = applicationStage([SLOW], finishedSlowInput);
const finishedSlowNoNote = applicationStage([], finishedSlowInput);
assert(finishedSlow.hardRejectReason === null, `after the last test a slow typing result is NOT the reason to decline (got ${JSON.stringify(finishedSlow.hardRejectReason)})`);
assert(finishedSlow.riskFlags.includes(SLOW), "it is still shown to the owner");
assert(finishedSlow.overallScore === finishedSlowNoNote.overallScore, `and it costs nothing on top of the typing score (${finishedSlow.overallScore} vs ${finishedSlowNoNote.overallScore})`);
assert(finishedSlow.autopilotAction === "reject", "a weak finisher's read is still to decline, on the score, for him to confirm");

for (const blocker of [
  "Is not authorized to work in the United States.",
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

console.log("\nThe connection check is evidence, never a conflict, before or after it lands:\n");

// A connection note is the check's job only when it is about the NETWORK.
const NOT_NETWORK = "No demonstrated connection between their retail background and the required CRM skills";
assert(realHardConflicts([NOT_NETWORK], 4, ["connection check"]).length === 1, "a bare 'connection' about something else stays a conflict while the check is ahead");
assert(realHardConflicts(["Pinged the team lead twice without an answer"], 4, ["connection check"]).length === 1, "…and so does a bare 'ping'");
for (const note of [
  'The job asks for "reliable internet"; the connection check measured upload 1.2 Mbps, below the required 3 Mbps.',
  "Home internet speed has not been verified yet.",
  "Wi-Fi connection quality is unknown.",
]) {
  assert(realHardConflicts([note], 4, ["connection check"]).length === 0, `a network note is the check's job: "${note}"`);
}

// Every test done, the check below the upload bar, the job asking for
// "reliable internet", and the judge listing the shortfall as a conflict
// anyway: Ava's read is the same as without that conflict (the shortfall is a
// risk flag for the owner, never the reason she recommends declining).
const slowLine = { downloadMbps: 28, uploadMbps: 1.2, latencyMs: 60, meetsBars: false, below: ["upload"], usingThisComputer: "yes", deviceKind: "computer" };
const remoteJob = "Reliable internet connection required\n• Typing speed of at least 45 words a minute with high accuracy";
const CONNECTION_CONFLICT = 'The job asks for "reliable internet"; the connection check measured upload 1.2 Mbps, below the required 3 Mbps.';
const strongFinisher = { ...everyTestDone, typingTest: { wpm: 60, score: 90, accuracy: 98 }, chatSimulationScore: 80, chatInterviewScore: 80, equipmentCheck: slowLine, jobRequirements: remoteJob };
const withConnConflict = applicationStage([CONNECTION_CONFLICT], strongFinisher);
const withoutConnConflict = applicationStage([], strongFinisher);
assert(withConnConflict.hardRejectReason === null, `the connection is never the reason to decline (got ${JSON.stringify(withConnConflict.hardRejectReason)})`);
assert(
  withConnConflict.recommendedAction === withoutConnConflict.recommendedAction && withConnConflict.autopilotAction === withoutConnConflict.autopilotAction,
  `Ava's read is the same with and without it (${withConnConflict.recommendedAction}/${withConnConflict.autopilotAction} vs ${withoutConnConflict.recommendedAction}/${withoutConnConflict.autopilotAction})`,
);
assert(withConnConflict.overallScore === withoutConnConflict.overallScore, `and it costs no points (${withConnConflict.overallScore} vs ${withoutConnConflict.overallScore})`);
assert(withConnConflict.riskFlags.some((flag) => /Connection below the job's bar \(upload\)/.test(flag)), "the shortfall is still shown to the owner as a risk");
const manualConn = applicationStage([CONNECTION_CONFLICT], { ...strongFinisher, mode: "manual" });
assert(manualConn.hardRejectReason === null, "in a manual job too");
const visaToo = applicationStage([CONNECTION_CONFLICT, "Work visa is pending."], strongFinisher);
assert(visaToo.hardRejectReason === "Work visa is pending.", `a real eligibility blocker beside it still counts (got ${JSON.stringify(visaToo.hardRejectReason)})`);

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

console.log("\nThe deal-breaker detector reads the candidate, not the job's vocabulary (2026-10-06):\n");

// For a team-lead role the judge describes the JOB with "shifts", "schedule"
// and "mismatch". Those words used to make a note a deal-breaker; the real
// gaps did not. None of these is an eligibility blocker; each is still a
// conflict the owner sees, and none can carry an "advance".
const LEAD_NOTES = [
  "Has never planned shifts for a team.",
  "Describes no schedule or rota they ran.",
  "Mismatch between leadership claimed and quiz answers.",
  "Has led no one.",
  "Would rather only manage the team, but this is a working lead role.",
];
for (const note of LEAD_NOTES) {
  assert(!isEligibilityBlocker(note), `not an eligibility deal-breaker: "${note}"`);
}
const LEAD_JOB = {
  jobTitle: "Chat Support Team Leader (Zulu Royal & Zulu Rush)",
  jobDescription: "This is a working team lead role. You will answer players on your shifts and lead a team of six chat agents.",
  experienceLevel: "lead",
};
const strongLeadFinish = {
  directMatchScore: 88,
  quizScore: 90,
  finalScore: 88,
  typingTest: { wpm: 52, score: 100, accuracy: 97 },
  chatSimulationScore: 86,
  chatInterviewScore: 84,
  extra: LEAD_JOB,
};
for (const note of LEAD_NOTES.filter((n) => !/quiz/i.test(n))) {
  const card = applicationStage([note], strongLeadFinish);
  assert(card.riskFlags.includes(note) && card.hardRejectReason === null, `"${note}" is shown, and is not a decline reason`);
  assert(card.hardRequirementStatus === "mixed" && card.recommendedAction !== "advance", `"${note}" means not every requirement is met: ${card.hardRequirementStatus}/${card.recommendedAction}`);
}
for (const blocker of [
  "Is not authorized to work in the United States.",
  "Name mismatch between the application and the documents.",
  "Lacks the required nursing certification.",
  "The job requires a valid nursing license; the candidate does not hold one.",
  "Work permit expired.",
  "Resume belongs to a different person.",
]) {
  assert(isEligibilityBlocker(blocker), `still a deal-breaker: "${blocker}"`);
}

// 2026-10-06 (second pass): lead vocabulary that still read as a deal-breaker
// and declined a strong lead at the end of the tests.
for (const note of [
  'The job asks for "at least 2 years … including time leading"; proof of the second year is not available in the application.',
  "No documented leadership results are available; the candidate's leadership history is unavailable.",
  "The job asks the lead to make sure players eligible for a refund are handled by the manager; the candidate could not explain eligibility.",
  "The candidate's only coaching is a COPC certification course plus 18 months leading.",
  "Holds a COPC customer experience certification but has never led a team.",
  "The candidate's coaching examples lack authenticity detail.",
  "The candidate says they cannot do schedule planning or rota building without help.",
  "Unable to do shift handover notes reliably.",
  "The candidate created a cheat sheet for new agents but has not led a team.",
  "The job's money rules say support cannot add bonuses; the candidate could not say how they would spot bonus fraud.",
]) {
  assert(!isEligibilityBlocker(note), `lead vocabulary, not a deal-breaker: "${note}"`);
  const card = applicationStage([note], strongLeadFinish);
  assert(card.hardRejectReason === null && card.recommendedAction === "review" && card.hardRequirementStatus === "mixed",
    `"${note.slice(0, 60)}…" is a gap to review at the end, never a decline (${card.recommendedAction}/${card.hardRequirementStatus})`);
}

console.log("\nWhich hours someone can cover is read from the form, never from the judge's prose (2026-10-06, second pass):\n");

// The job asks "tell us which hours you can cover". "Not available for
// overnight or weekend shifts" declined a strong lead while the same fact
// worded "selected only daytime and evening shifts" was a review.
for (const note of [
  "Cannot work the required overnight schedule.",
  "Says they cannot work any US Eastern shift.",
  "Not available to work nights or weekends.",
  "The candidate is not available for overnight or weekend shifts.",
  "The candidate selected only daytime and evening shifts.",
  "The candidate can\u2019t work weekends.",
  "The candidate is only available weekdays from 9 to 5.",
  "The candidate can only work 20 hours a week.",
]) {
  assert(!isEligibilityBlocker(note), `availability prose is not a deal-breaker: "${note}"`);
  const end = applicationStage([note], strongLeadFinish);
  assert(end.hardRejectReason === null && end.recommendedAction === "review" && end.hardRequirementStatus === "mixed" && end.riskFlags.includes(note),
    `"${note}": shown, "review" at the end, never a decline (${end.recommendedAction}/${end.hardRequirementStatus})`);
  const manualEarly = applicationStage([note], { ...weak, mode: "manual" });
  assert(manualEarly.hardRejectReason === null, `"${note}": not a reason to stop early in a manual job either`);
}
// What the owner will not bend on goes on the form: a flag on the shift or
// hours question, "decline" (the default) or "review".
const Q5 = {
  id: "q5", type: "multi_select", question: "Which shifts can you cover, in US Eastern time?",
  options: ["Daytime", "Evening", "Overnight", "Weekends", "None of these"],
  flag_options: ["None of these"], flag_label: "Can cover none of the shifts",
};
const Q6 = {
  id: "q6", type: "select", question: "How many hours a week can you work?",
  options: ["40 hours a week or more", "30 to 39", "20 to 29", "Under 20"],
  flag_options: ["20 to 29", "Under 20"], flag_label: "Can work fewer than 30 hours a week", flag_severity: "review",
};
const hours = (q5, q6) => [
  { questionId: "q5", question: Q5.question, answer: q5.join("; "), selected: q5, type: "multi_select" },
  { questionId: "q6", question: Q6.question, answer: q6, type: "select" },
];
assert(JSON.stringify(formDealBreakersFrom([Q5, Q6], hours(["None of these"], "Under 20"))) === JSON.stringify(["Can cover none of the shifts"]), "no shift at all: a deal-breaker from the form");
assert(JSON.stringify(formReviewFlagsFrom([Q5, Q6], hours(["Daytime"], "Under 20"))) === JSON.stringify(["Can work fewer than 30 hours a week"]), "a review-level flag is read separately");
assert(formDealBreakersFrom([Q5, Q6], hours(["Daytime"], "Under 20")).length === 0, "and is never a deal-breaker");
const reviewFlagged = applicationStage([], { ...strongLeadFinish, extra: { ...LEAD_JOB, formReviewFlags: ["Can work fewer than 30 hours a week"] } });
const reviewClean = applicationStage([], strongLeadFinish);
assert(reviewFlagged.recommendedAction === "review" && reviewFlagged.hardRequirementStatus === "mixed" && reviewFlagged.hardRejectReason === null,
  `a review-level form flag keeps the card off "advance", never a decline (${reviewFlagged.recommendedAction}/${reviewFlagged.hardRequirementStatus})`);
assert(reviewFlagged.overallScore === reviewClean.overallScore && reviewFlagged.riskFlags.includes("Can work fewer than 30 hours a week") && (reviewFlagged.dealBreakerFlags ?? []).length === 0,
  `and costs nothing on the number (${reviewFlagged.overallScore} = ${reviewClean.overallScore})`);
const WEEKEND_ONLY_JOB = "• Non-negotiable: you must work every weekend.";
const statedWeekend = "The job's non-negotiable weekend shifts conflict with the candidate's answer that they cannot work weekends.";
assert(isStatedDealBreakerConflict(statedWeekend, WEEKEND_ONLY_JOB) && !isStatedDealBreakerConflict(statedWeekend, "Remote chat support"),
  "a conflict naming a non-negotiable counts only when the job itself states one");
const statedEnd = applicationStage([statedWeekend], { ...strongLeadFinish, jobRequirements: WEEKEND_ONLY_JOB });
assert(statedEnd.hardRejectReason === statedWeekend, `the owner's own non-negotiable is a decline reason at the end (${JSON.stringify(statedEnd.hardRejectReason)})`);
const inventedEnd = applicationStage(["Below the non-negotiable two years of leading the job asks for."], strongLeadFinish);
assert(inventedEnd.hardRejectReason === null && inventedEnd.recommendedAction === "review", `the judge's own "non-negotiable" is not (${inventedEnd.recommendedAction})`);

console.log("\n'Advance' needs every hard requirement met; a decline sorts below the pass mark:\n");

const cleanLead = applicationStage([], strongLeadFinish);
assert(cleanLead.recommendedAction === "advance" && cleanLead.hardRequirementStatus === "met", `a clean strong lead advances (${cleanLead.recommendedAction}/${cleanLead.hardRequirementStatus})`);
const gapLead = applicationStage(['The job asks for "At least 2 years … including time leading a team"; the candidate has not led a team.'], strongLeadFinish);
assert(gapLead.recommendedAction === "review" && gapLead.hardRequirementStatus === "mixed", `the same score with a listed requirement gap is "review", not "advance" (${gapLead.recommendedAction}/${gapLead.hardRequirementStatus})`);
const visaLead = applicationStage(["Work visa is pending."], strongLeadFinish);
assert(visaLead.hardRejectReason === "Work visa is pending." && visaLead.overallScore === 59, `a recommended decline sorts just below the pass mark (${visaLead.overallScore})`);
const weakFinish = { ...weak, typingTest: { wpm: 30, score: 60, accuracy: 90 }, chatSimulationScore: 35, chatInterviewScore: 40 };
const weakVisa = applicationStage(["Work visa is pending."], { ...weakFinish, mode: "manual" });
// Same inputs and one conflict of the same weight that is not a decline reason: the uncapped number.
const weakGap = applicationStage(["Has about 1 year of support experience against the 2 years the job asks for."], { ...weakFinish, mode: "manual" });
assert(weakGap.hardRejectReason === null, "a plain experience gap is not a decline reason");
assert(weakVisa.overallScore < 59 && weakVisa.overallScore === weakGap.overallScore, `the cap only lowers, never raises (${weakVisa.overallScore} = ${weakGap.overallScore})`);

console.log("\nA measured bar is said in numbers, never counted twice (2026-10-06):\n");

const slowLead = applicationStage(["Typing speed of 38 WPM is below the required 45 WPM."], {
  ...strongLeadFinish,
  typingTest: { wpm: 38, score: 83, accuracy: 98, requiredWpm: 45 },
});
const slowLeadNoNote = applicationStage([], { ...strongLeadFinish, typingTest: { wpm: 38, score: 83, accuracy: 98, requiredWpm: 45 } });
assert(slowLead.riskFlags.includes("Typed 38 WPM; the job asks for 45"), `the code states the shortfall from the result (${JSON.stringify(slowLead.riskFlags)})`);
assert(!slowLead.riskFlags.includes("Typing speed of 38 WPM is below the required 45 WPM."), "the judge's own sentence about it is not shown twice");
assert(slowLead.hardRejectReason === null && slowLead.recommendedAction === "review", `a lead 7 WPM short is "review", never a decline (${slowLead.recommendedAction})`);
assert(slowLead.overallScore === slowLeadNoNote.overallScore, `the note costs nothing on top of the typing score (${slowLead.overallScore} vs ${slowLeadNoNote.overallScore})`);
const fastLead = applicationStage([], { ...strongLeadFinish, extra: { ...LEAD_JOB, requiredWpm: 45 } });
assert(!fastLead.riskFlags.some((f) => /^Typed/.test(f)) && fastLead.whyUp?.includes("Typed 52 WPM (bar 45)"), "a speed at or above the bar is a reason up, not a flag");

// The first judgment call (trigger-ava-analysis) and the scorecard's set aside
// the same notes: a connection note used to lower the first one only.
const progress = highSignalProgress({
  quizScore: 90, quizConfigured: true, workflowSteps: ZULU_STEPS, typingScore: 83, voiceScore: null, portfolioScore: null,
  chatSimulationScore: 86, salesSimulationScore: null, chatInterviewScore: 84, videoIntroScore: null, videoIntroSubmitted: false,
});
assert(progress.pending.length === 0 && progress.pendingTopicPhases.includes("connection check") && progress.completed.includes("typing test"),
  `the connection check is set aside and every test is taken (${JSON.stringify(progress)})`);
const judgedLead = (conflicts) => computeJudgmentScore({ directMatchScore: 80, hardRequirementConflicts: conflicts, pendingPhases: progress.pendingTopicPhases, takenPhases: progress.completed });
const CONN = 'The job asks for "a reliable internet connection"; the measured 6.2 Mbps download is below the 10 Mbps bar.';
assert(judgedLead([CONN]) === judgedLead([]), "a connection note does not lower the judgment");
assert(judgedLead(["Completed chat simulation result of 18/100, well below expectations."]) === judgedLead([]),
  "a taken test's own result is not a conflict on top of its score (the production note of 2026-10-05)");
assert(judgedLead(["Typing speed of 38 WPM is below the required 45 WPM."]) === judgedLead([]), "nor is a typing shortfall once the typing test is taken");
assert(judgedLead(["Has led no one."]) < judgedLead([]), "a real requirement gap still lowers it");
const GAP_SEEN_IN_INTERVIEW = "In the written interview the candidate said they have never led a team, and the job asks for 2 years of leading.";
assert(judgedLead([GAP_SEEN_IN_INTERVIEW]) < judgedLead([]), "so does a gap that merely came up in the interview (it is not the interview's result)");
assert(realHardConflicts([GAP_SEEN_IN_INTERVIEW], 4, progress.pendingTopicPhases, progress.completed).length === 1, "and it stays a conflict the owner sees");

console.log("\nThe owner's form deal-breakers are read from the form itself:\n");

const Q14 = {
  id: "q14",
  type: "select",
  question: "On a normal shift, how much of your time do you expect to spend answering players yourself?",
  options: ["Most of the shift", "About half", "A little; mostly managing the team", "None"],
  flag_options: ["A little; mostly managing the team", "None"],
  flag_label: "Wants to mostly manage, not work the chat queue",
};
const answer = (value, extra = {}) => [{ questionId: "q14", question: Q14.question, answer: value, type: "select", ...extra }];
assert(formDealBreakersFrom([Q14], answer("A little; mostly managing the team"))[0] === Q14.flag_label, "a flagged answer (with a ';' in it) carries the owner's label");
assert(formDealBreakersFrom([Q14], answer("none "))[0] === Q14.flag_label, "matching ignores case and spacing");
assert(formDealBreakersFrom([Q14], answer("Most of the shift")).length === 0, "an unflagged answer carries nothing");
assert(formDealBreakersFrom([{ ...Q14, flag_options: undefined }], answer("None")).length === 0, "a question with no flag_options is never a deal-breaker");
assert(formDealBreakersFrom([{ ...Q14, flag_label: undefined }], answer("None"))[0] === `Answered "None" to "${Q14.question}"`, "with no flag_label the answer itself is named");
const MULTI = { id: "q5", type: "multi_select", question: "Which shifts can you cover?", options: ["Day", "Night", "None of these"], flag_options: ["None of these"], flag_label: "Cannot cover any shift" };
assert(formDealBreakersFrom([MULTI], [{ questionId: "q5", answer: "Day; None of these", selected: ["Day", "None of these"] }])[0] === "Cannot cover any shift", "a pick-several answer is read from `selected`");
assert(formDealBreakersFrom(null, answer("None")).length === 0 && formDealBreakersFrom([Q14], null).length === 0, "no questions or no answers: nothing");
// 2026-10-06 (second pass): a single answer is never split on ";", an answer
// stored without its questionId is found by its question, and a flag on an
// option that no longer exists is reported.
const Q_SEMI = { id: "q9", type: "select", question: "Hours?", options: ["40 or more", "30 to 39; flexible"], flag_options: ["flexible"], flag_label: "X" };
assert(formDealBreakersFrom([Q_SEMI], [{ questionId: "q9", answer: "30 to 39; flexible", type: "select" }]).length === 0,
  "a fragment of a single answer is not a pick");
assert(formDealBreakersFrom([Q14], [{ question: Q14.question, answer: "None" }])[0] === Q14.flag_label, "an answer stored without a questionId is matched by its question");
assert(formDealBreakersFrom([Q14], answer("A little\u2019s mostly managing")).length === 0, "an unflagged answer with a curly quote carries nothing");
assert(JSON.stringify(orphanFlagOptions([{ ...Q14, options: ["Most of the shift", "About half", "A little, mostly managing the team", "None"] }])) ===
  JSON.stringify([{ questionId: "q14", option: "A little; mostly managing the team" }]), "a flag left on a renamed option is reported");
assert(orphanFlagOptions([Q14, Q5, Q6]).length === 0, "and flags on real options are not");

const formFlagged = { ...strongLeadFinish, extra: { ...LEAD_JOB, formDealBreakers: [Q14.flag_label] } };
const formMidway = applicationStage([], { ...formFlagged, chatInterviewScore: null });
assert(formMidway.dealBreakerFlags?.includes(Q14.flag_label) && formMidway.hardRejectReason === null && formMidway.autopilotAction === "defer",
  "mid-way the form deal-breaker is highlighted and stops nobody");
const formEnd = applicationStage([], formFlagged);
assert(formEnd.hardRejectReason === Q14.flag_label && formEnd.recommendedAction === "reject" && formEnd.overallScore < 60,
  `after the last test it is Ava's reason, and the score sorts below the pass mark (${formEnd.overallScore})`);

console.log("\nA real 0 is a score; an ungraded result is not (2026-10-06):\n");

const zeroQuiz = readQuizResult({ quizResult: { score: 0, correct: 0, total: 10, passed: false } });
assert(zeroQuiz?.score === 0 && zeroQuiz.correct === 0, `a 0% skills check reads as 0, not "not taken" (${JSON.stringify(zeroQuiz)})`);
const zeroCard = applicationStage([], { ...weak, quizScore: 0, typingTest: { wpm: 30, score: 60, accuracy: 90 }, chatSimulationScore: 0, chatInterviewScore: 0 });
assert(zeroCard.completedHighSignalPhases.includes("quiz") && zeroCard.completedHighSignalPhases.includes("chat simulation") && zeroCard.pendingHighSignalPhases.length === 0,
  `zeros count as taken (pending: ${JSON.stringify(zeroCard.pendingHighSignalPhases)})`);
assert(zeroCard.decisionState === "ready_for_decision" && !/Pending signals/.test(zeroCard.rationale),
  `and the applicant is ready for a decision, not stuck waiting on a test they took (${zeroCard.decisionState})`);
assert(zeroCard.autopilotAction === "reject", `Ava's read on all-zero tests is to decline, for the owner to confirm (${zeroCard.autopilotAction})`);
assert(readChatSimulationResult({ score: 0, empathy: 0, problemSolving: 0 })?.score === 0, "a 0 chat practice reads as 0");

const ungradedChat = readChatSimulationResult({ graded: false, score: 70, empathy: 70, problemSolving: 70, improvements: ["Unable to parse detailed evaluation"] });
assert(ungradedChat?.graded === false && ungradedChat.score === null && ungradedChat.improvements.length === 0, `graded:false is no score at all (${JSON.stringify(ungradedChat)})`);
const ungradedInterview = readChatInterviewResult({ evaluation: { graded: false, score: 70, recommendation: "Maybe" }, messages: [] });
assert(ungradedInterview?.graded === false && ungradedInterview.score === null && ungradedInterview.recommendation === null, "an ungraded interview (nested shape) has no score or recommendation");
const ungradedCard = applicationStage([], {
  ...weak,
  typingTest: { wpm: 50, score: 90, accuracy: 97 },
  chatSimulationScore: null,
  chatInterviewScore: 70,
  extra: { ungradedPhases: ["chat simulation"] },
});
assert(ungradedCard.pendingHighSignalPhases.includes("chat simulation"), "an ungraded chat practice is not counted as taken");
assert(ungradedCard.riskFlags.includes("Chat practice was not graded (the grader failed); open the transcript"),
  `the owner is told the grader failed and where to look; nothing re-grades a finished step yet (${JSON.stringify(ungradedCard.riskFlags)})`);

console.log("\nThe written interview's findings and the skills check by area reach Ava:\n");

const fullInterview = readChatInterviewResult({
  score: 38, recommendation: "No Hire", credibilityRating: "Low", summary: "Claims not supported.",
  concerns: ["Could not name an employer"],
  inconsistencies: [{ claim: "5+ years leading teams of 50+", evidence: "30% skills check" }],
});
assert(fullInterview?.credibilityRating === "Low" && fullInterview.concerns[0] === "Could not name an employer", "credibility and concerns are read");
assert(fullInterview?.inconsistencies[0] === "5+ years leading teams of 50+ → 30% skills check", "each inconsistency reads claim → evidence");
// 2026-10-06 (second pass): the interviewer rates credibility partly on the
// TESTS (a slow typing speed, a low skills check), so as a verdict it brought
// a measured shortfall back in as a decline reason: a strong lead rated "Low"
// went from 88 "advance" to 59 "reject" on one model field.
const lowCred = applicationStage([], { ...strongLeadFinish, extra: { ...LEAD_JOB, interviewCredibility: "Low" } });
const highCred = applicationStage([], { ...strongLeadFinish, extra: { ...LEAD_JOB, interviewCredibility: "High" } });
assert(lowCred.riskFlags.includes("Interview credibility is low") && lowCred.whyDown?.includes("Interview credibility is low"), "a Low interview credibility is shown to the owner");
assert(lowCred.recommendedAction === "review" && lowCred.hardRequirementStatus === "mixed", `and keeps the card off "advance" (${lowCred.recommendedAction}/${lowCred.hardRequirementStatus})`);
assert(lowCred.hardRejectReason === null && !(lowCred.dealBreakerFlags ?? []).includes("Interview credibility is low") && lowCred.overallScore === highCred.overallScore,
  `but is never a decline reason, a deal-breaker or a cap (${lowCred.overallScore} = ${highCred.overallScore})`);

const QUIZ_QUESTIONS = [
  { id: "zu1", category: "coaching" }, { id: "zu6", category: "integrity" }, { id: "zu8", category: "money_rules" },
  { id: "zu11", category: "coaching" }, { id: "zu12", category: "writing", must_pass: true },
];
const areas = quizAreaBreakdown(
  [
    { questionId: "zu1", isCorrect: true }, { questionId: "zu6", isCorrect: false }, { questionId: "zu8", isCorrect: true },
    { questionId: "zu11", isCorrect: false }, { questionId: "zu12", isCorrect: false },
  ],
  QUIZ_QUESTIONS,
);
assert(formatQuizAreas(areas.areas) === "coaching 1/2, integrity ✗, money rules ✓, writing ✗", `by area (${formatQuizAreas(areas.areas)})`);
assert(JSON.stringify(areas.mustPassMissed) === JSON.stringify(["integrity", "writing"]), `must-pass misses: integrity by default, writing by must_pass (${JSON.stringify(areas.mustPassMissed)})`);
// Must-pass is per question (2026-10-06, second pass).
const perQuestion = quizAreaBreakdown(
  [{ questionId: "a", isCorrect: true }, { questionId: "b", isCorrect: true }, { questionId: "c", isCorrect: false }, { questionId: "d", isCorrect: false }],
  [{ id: "a", category: "integrity", must_pass: false }, { id: "b", category: "coaching", must_pass: true }, { id: "c", category: "coaching" }, { id: "d", category: "integrity", must_pass: false }],
);
assert(JSON.stringify(perQuestion.missed) === JSON.stringify(["integrity", "coaching"]) && perQuestion.mustPassMissed.length === 0,
  `a wrong ordinary question in a category with one must-pass question is not a must-pass miss, and must_pass:false turns integrity off (${JSON.stringify(perQuestion)})`);
const unknownAnswer = quizAreaBreakdown([{ questionId: "zu6", isCorrect: null }, { questionId: "zu1", isCorrect: true }], QUIZ_QUESTIONS);
assert(unknownAnswer.mustPassMissed.length === 0 && !unknownAnswer.areas.some((area) => area.category === "integrity"),
  `an answer nobody could mark is not a miss (${JSON.stringify(unknownAnswer)})`);
const storedQuiz = readQuizResult({
  quizResult: { score: 80, correct: 8, total: 10, passed: true },
  step_quiz: { type: "quiz", answers: [{ questionId: "zu6", isCorrect: false, selectedAnswer: 1 }], score: 80 },
});
assert(storedQuiz?.answers.length === 1 && storedQuiz.answers[0].questionId === "zu6", "per-question results are found under the quiz step's own key");

console.log("\nA finished test's own result is told apart from a real gap by structure, not by words (2026-10-06, second pass):\n");

// Every test taken (the connection check is evidence): what the judge lists.
const ALL_TAKEN = ["quiz", "typing test", "chat simulation", "chat interview"];
const kept = (conflict) => realHardConflicts([conflict], 6, ["connection check"], ALL_TAKEN).length === 1;
// Real gaps that only share a word with a test: kept (the old keyword filter threw each one out).
for (const gap of [
  'In the interview the candidate failed to name any team they had led; the job asks for "time leading, coaching or training a team".',
  'Neither the application nor the interview shows results from leading a team; the job asks for "time leading, coaching or training a team".',
  'In the interview the candidate said they pass escalations to a manager rather than handle them; the job asks the lead to "Take the hardest chats".',
  "The job requires handling all types of player escalations; the candidate has only handled billing questions.",
  'The job asks for "Happy to work the chat queue on every shift as well as lead"; in the interview they rated working the queue as low priority.',
  'The job asks for "time leading, coaching or training a team"; the candidate has not yet led a team at any stage of their career.',
]) {
  assert(kept(gap), `a real gap stays a gap: "${gap.slice(0, 70)}…"`);
}
// A finished test's own result, untagged: set aside (shown, never counted).
for (const result of [
  "Completed chat simulation result of 18/100, well below expectations.",
  "The candidate missed the completed quiz's integrity and money-rules areas.",
  "Interview credibility is low: claims of leading 50+ agents are contradicted by the skills check.",
  "Typing speed of 38 WPM is below the 45 WPM the job asks for.",
  "The candidate failed the skills check.",
]) {
  assert(!kept(result), `a test's own result is not a gap: "${result.slice(0, 70)}"`);
}
// Tagged by the judge (ai-analyze returns { text, source }): the tag decides.
assert(!kept({ text: "Handled the escalated player with a new refund promise.", source: "test:chat_practice" }), "tagged test:chat_practice: a result, set aside whatever the words");
assert(kept({ text: "Typed up a three-page guide for agents but has never led a team; the job asks for two years of leading.", source: "application" }),
  "tagged application: a gap, even with a word the typing test owns");
assert(!kept("Typed up a three-page guide for agents but has never led a team; the job asks for two years of leading."), "(the same note untagged falls back to the keyword reading)");
assert(kept({ text: "In the interview they said they have led a team for 1 year, not the 2 the job asks for.", source: "interview" }), "what they SAID in the interview is a gap, not the interview's result");
const taggedLead = applicationStage([{ text: "Made a new refund promise in the escalated chat.", source: "test:chat_practice" }], strongLeadFinish);
assert(taggedLead.riskFlags.includes("Made a new refund promise in the escalated chat.") && taggedLead.overallScore === applicationStage([], strongLeadFinish).overallScore,
  "a tagged test result is shown to the owner and costs nothing on top of the test's score");
assert(taggedLead.recommendedAction === "advance", `and does not hold an otherwise clean card (${taggedLead.recommendedAction})`);

console.log("\nA 'not done yet' note must be about a test, and only while one is ahead (2026-10-06, second pass):\n");

for (const note of [
  'The job asks for "time leading…"; the candidate has not yet led a team at any stage.',
  "The candidate has not yet led a team; confirmed in the interview.",
  "Joined the support team at a later date and has not yet run a shift.",
]) {
  assert(!isPendingPhaseNote(note), `not a pending step: "${note}"`);
}
for (const note of ["The written interview is still pending.", "Has not yet taken the skills check.", "Awaiting the typing test.", "Will be assessed during the chat simulation."]) {
  assert(isPendingPhaseNote(note), `a pending step: "${note}"`);
}
const NOT_YET_GAP = 'The job asks for "time leading…"; the candidate has not yet led a team at any stage.';
assert(realHardConflicts([NOT_YET_GAP], 4, ["connection check"], ALL_TAKEN).length === 1, "once every test is done, a 'not yet' gap is a gap");
assert(realHardConflicts(["The typing test is pending."], 4, ["typing test", "connection check"], []).length === 0, "while a test is ahead, a pending-step note is still set aside");
assert(computeJudgmentScore({ hardRequirementConflicts: ["The typing test is pending."] }) === computeJudgmentScore({ hardRequirementConflicts: [] }),
  "and when the caller cannot say which steps are ahead, it is set aside too");

console.log(failures ? `\n${failures} assertion(s) failed.` : "\nAll assertions passed.");
process.exit(failures ? 1 : 0);
