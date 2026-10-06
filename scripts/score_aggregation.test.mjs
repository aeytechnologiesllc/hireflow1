#!/usr/bin/env node
/**
 * Local test runner for the Ava scoring-aggregation fix — plain assertions, no framework.
 *
 * Feeds the four judgment sets measured against the deployed judge (temp 0, gpt-4.1, two
 * runs each) straight through the real pure functions in
 * supabase/functions/_shared/autopilot.ts (imported directly — Node 24+ strips the type
 * annotations natively, no build step) and checks that the persisted score:
 *
 *   - keeps a clean, well-matched resume comfortably above the passing bar        (strong >= 85)
 *   - separates it from the *same* resume riddled with typos by a real margin     (strong - typo >= 20)
 *   - still treats a generic/buzzwordy resume with a conflict as a reject         (generic <= 50)
 *   - still caps a fabricated resume near zero, despite its high raw LLM score    (lies <= 35)
 *   - is exactly reproducible — same input, same output, every time               (determinism)
 *
 * Run with: node scripts/score_aggregation.test.mjs
 */

import {
  buildAvaScorecard,
  computeJudgmentScore,
  highSignalProgress,
  inferJobFamily,
  phaseBlendScore,
} from "../supabase/functions/_shared/autopilot.ts";

// --- fixtures ----------------------------------------------------------------
//
// Only overallScore, writing/attention/authenticity/specificity, and (for generic/lies)
// the presence of hardRequirementConflicts were actually measured against the deployed
// judge. directMatchScore/transferableFitScore/learningSignalScore weren't part of the
// measurement, so they're filled in here consistent with each candidate's described
// substance — STRONG and TYPO-BOMB are given the *same* direct/transferable/learning
// values because they're the same candidate's background; only the writing differs.
// `llmOverallScore` is recorded for the printout only — it is never passed to
// computeJudgmentScore, which has no parameter for it at all.

const STRONG = {
  label: "STRONG",
  directMatchScore: 94,
  transferableFitScore: 94,
  learningSignalScore: 94,
  writingQualityScore: 95,
  attentionToDetailScore: 97,
  authenticityScore: 100,
  specificityScore: 98,
  hardRequirementConflicts: [],
  llmOverallScore: "94 / 94",
};

const TYPO_BOMB = {
  label: "TYPO-BOMB",
  directMatchScore: 94,
  transferableFitScore: 94,
  learningSignalScore: 94,
  writingQualityScore: 35,
  attentionToDetailScore: 40,
  authenticityScore: 95,
  specificityScore: 90,
  hardRequirementConflicts: [],
  llmOverallScore: "81 / 78 (nondeterministic)",
};

const GENERIC = {
  label: "GENERIC",
  directMatchScore: 40,
  transferableFitScore: 38,
  learningSignalScore: 45,
  writingQualityScore: 65,
  attentionToDetailScore: 60,
  authenticityScore: 75,
  specificityScore: 20, // vague buzzwords, no concrete achievements
  hardRequirementConflicts: ["Requires 3+ years of directly relevant experience; candidate has none"],
  llmOverallScore: "38 / 38",
};

const LIES = {
  label: "LIES",
  directMatchScore: 25,
  transferableFitScore: 22,
  learningSignalScore: 30,
  writingQualityScore: 82,
  attentionToDetailScore: 78,
  authenticityScore: 5,
  specificityScore: 83,
  hardRequirementConflicts: [
    "Employment history shows overlapping full-time roles across 18 months",
    "Claimed certification could not be verified",
  ],
  llmOverallScore: "20 / 20",
};

const FIXTURES = [STRONG, TYPO_BOMB, GENERIC, LIES];

// --- helpers -------------------------------------------------------------------

/** Round-trip a fixture through buildAvaScorecard with no phase-performance data at
 * all (no quiz, no typing test, no voice interview, etc.) so overallScore reduces to
 * whatever the judgment aggregation alone produces — exercising the exact function
 * trigger-ava-analysis calls, not a reimplementation of it. */
function scoreViaScorecard(fixture) {
  const scorecard = buildAvaScorecard({
    finalScore: null,
    passingScore: 60,
    quizScore: null,
    quizConfigured: false,
    typingTest: null,
    voiceScore: null,
    portfolioScore: null,
    chatSimulationScore: null,
    salesSimulationScore: null,
    chatInterviewScore: null,
    videoIntroScore: null,
    videoIntroSubmitted: false,
    analysisText: "",
    resumeUnavailable: false,
    resumeTextUsed: true,
    resumeImageCount: 0,
    applicationAnswerCount: 3,
    coverLetterProvided: false,
    workflowSteps: [],
    jobTitle: "Customer Support Specialist",
    jobDescription: "Front-line support role",
    experienceLevel: "mid",
    directMatchScore: fixture.directMatchScore,
    transferableFitScore: fixture.transferableFitScore,
    learningSignalScore: fixture.learningSignalScore,
    writingQualityScore: fixture.writingQualityScore,
    attentionToDetailScore: fixture.attentionToDetailScore,
    authenticityScore: fixture.authenticityScore,
    specificityScore: fixture.specificityScore,
    hardRequirementConflicts: fixture.hardRequirementConflicts,
    evidenceFingerprint: "score-aggregation-test",
  });
  return scorecard.overallScore;
}

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  ok    ${message}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  }
}

// --- run -------------------------------------------------------------------------

console.log("Scoring the four measured judgment sets (computeJudgmentScore + buildAvaScorecard):\n");

const judgment = {};
const viaScorecard = {};

for (const fixture of FIXTURES) {
  const first = computeJudgmentScore(fixture);
  const second = computeJudgmentScore(fixture); // identical call again — determinism check
  const scorecardScore = scoreViaScorecard(fixture);

  judgment[fixture.label] = first;
  viaScorecard[fixture.label] = scorecardScore;

  console.log(
    `${fixture.label.padEnd(10)} computeJudgmentScore=${String(first).padStart(3)}  ` +
      `buildAvaScorecard.overallScore=${String(scorecardScore).padStart(3)}  ` +
      `(LLM's own raw overallScore was ${fixture.llmOverallScore} — not used above)`,
  );

  assert(first === second, `${fixture.label}: computeJudgmentScore(x) === computeJudgmentScore(x) (${first} === ${second})`);
  assert(
    first === scorecardScore,
    `${fixture.label}: buildAvaScorecard.overallScore matches computeJudgmentScore with no phase data (${scorecardScore} === ${first})`,
  );
}

console.log("");

const gap = judgment.STRONG - judgment["TYPO-BOMB"];

assert(judgment.STRONG >= 85, `strong >= 85 (got ${judgment.STRONG})`);
assert(gap >= 20, `strong - typo >= 20 (got ${judgment.STRONG} - ${judgment["TYPO-BOMB"]} = ${gap})`);
assert(judgment.GENERIC <= 50, `generic <= 50 (got ${judgment.GENERIC})`);
assert(judgment.LIES <= 35, `lies <= 35 (got ${judgment.LIES})`);

// --- team leads: leading counts more than polish (2026-10-06) ------------------
//
// The audit's two applicants to the Chat Support Team Leader job: an experienced
// working lead who writes plain second-language English, and a polished writer
// who has never led anyone. With the general weights (writing, attention and
// specificity 54%) the writer wins; with the team-lead weights (leadership 25%,
// adaptability 10%) the lead does. The general weights never read the two new
// sub-scores, so every other job scores exactly as before.

console.log("\nTeam-lead judgment weights:\n");

const PLAIN_LEAD = { directMatchScore: 88, transferableFitScore: 85, learningSignalScore: 70, writingQualityScore: 60, attentionToDetailScore: 62, authenticityScore: 90, specificityScore: 80, leadershipEvidenceScore: 90, adaptabilityEvidenceScore: 85 };
const POLISHED_NEVER_LED = { directMatchScore: 50, transferableFitScore: 70, learningSignalScore: 85, writingQualityScore: 96, attentionToDetailScore: 95, authenticityScore: 88, specificityScore: 82, leadershipEvidenceScore: 25, adaptabilityEvidenceScore: 70 };

const leadGeneral = computeJudgmentScore(PLAIN_LEAD);
const polishedGeneral = computeJudgmentScore(POLISHED_NEVER_LED);
const leadAsLead = computeJudgmentScore({ ...PLAIN_LEAD, jobFamily: "team_lead" });
const polishedAsLead = computeJudgmentScore({ ...POLISHED_NEVER_LED, jobFamily: "team_lead" });
console.log(`  general weights: lead ${leadGeneral}, polished ${polishedGeneral}; team-lead weights: lead ${leadAsLead}, polished ${polishedAsLead}`);
assert(polishedGeneral > leadGeneral, `general weights still favour polish (the agent roles keep them): ${polishedGeneral} > ${leadGeneral}`);
assert(leadAsLead > polishedAsLead + 10, `team-lead weights favour the proven lead by a real margin: ${leadAsLead} > ${polishedAsLead}`);
for (const fixture of FIXTURES) {
  assert(
    computeJudgmentScore({ ...fixture, leadershipEvidenceScore: 0, adaptabilityEvidenceScore: 0 }) === judgment[fixture.label] &&
      computeJudgmentScore({ ...fixture, leadershipEvidenceScore: 100, jobFamily: "support" }) === judgment[fixture.label],
    `${fixture.label}: the leadership sub-scores never move a non-lead job's judgment`,
  );
}
assert(
  computeJudgmentScore({ ...PLAIN_LEAD, leadershipEvidenceScore: null, adaptabilityEvidenceScore: null, jobFamily: "team_lead" }) ===
    computeJudgmentScore({ ...PLAIN_LEAD, leadershipEvidenceScore: 50, adaptabilityEvidenceScore: 50, jobFamily: "team_lead" }),
  "a lead analysis without the new sub-scores (narrative fallback, older run) uses a neutral 50, never 0",
);
assert(computeJudgmentScore({ ...LIES, ...POLISHED_NEVER_LED, authenticityScore: 5, jobFamily: "team_lead" }) <= 35, "the authenticity ceiling still holds for a lead");

// --- a support-agent job scores exactly as before (2026-10-06) ----------------
//
// The golden values below were produced by the code as it stood before the
// team-lead change (commit e97d5ce: autopilot.ts plus trigger-ava-analysis's
// inline support-family blend and floors), for an agent job whose own text
// mentions "your team lead" and "the shift supervisor". The new code must give
// the same judgment, phase blend, overall score, confidence, recommendation,
// requirement status, action, decision state and dimensions. (A 4,000-case
// random comparison of the two versions on the support, operations and sales
// families, with no zero scores, no ungraded results, no conflict about a
// finished test and no hard reject, found no difference either.)

console.log("\nA support-agent job scores identically before and after the team-lead change:\n");

const AGENT_JOB = {
  title: "Customer Support Chat Agent (Zulu Royal & Zulu Rush)",
  description: "Remote chat support for players of Zulu Royal and Zulu Rush. Anything you cannot solve goes to your team lead or the shift supervisor.",
  experienceLevel: "entry",
};
const AGENT_STEPS = [
  { id: "step_connection", type: "equipment_check" },
  { id: "step_typing", type: "typing_test" },
  { id: "step_chat", type: "chat_simulation" },
  { id: "step_interview", type: "chat_interview" },
];
const AGENT_SUB = {
  strong: { directMatchScore: 86, transferableFitScore: 80, learningSignalScore: 74, writingQualityScore: 88, attentionToDetailScore: 85, authenticityScore: 90, specificityScore: 82 },
  average: { directMatchScore: 64, transferableFitScore: 70, learningSignalScore: 66, writingQualityScore: 76, attentionToDetailScore: 72, authenticityScore: 84, specificityScore: 58 },
  weak: { directMatchScore: 38, transferableFitScore: 45, learningSignalScore: 40, writingQualityScore: 55, attentionToDetailScore: 48, authenticityScore: 70, specificityScore: 30 },
};
const OK_LINE = { downloadMbps: 48, uploadMbps: 14, latencyMs: 36, meetsBars: true, below: [], usingThisComputer: "yes", deviceKind: "computer" };
const SLOW_LINE = { downloadMbps: 28, uploadMbps: 1.2, latencyMs: 60, meetsBars: false, below: ["upload"], usingThisComputer: "yes", deviceKind: "computer" };
const GOLDEN = [
  { name: "strong agent, every test done", sub: "strong", quizScore: 90, typingTest: { wpm: 62, accuracy: 97, score: 97, requiredWpm: 45 }, chatSimulationScore: 84, chatInterviewScore: 80, equipmentCheck: OK_LINE, mode: "auto",
    expect: { judgment: 83, finalScore: 85.96, overallScore: 84, confidence: 78, recommendedAction: "advance", hardRequirementStatus: "met", autopilotAction: "advance", decisionState: "ready_for_decision", dimensionScores: { hard_requirements: 83, role_competency: 83, communication: 82, execution_reliability: 89, work_style_fit: 83, evidence_quality: 100 } } },
  { name: "average agent, every test done", sub: "average", quizScore: 70, typingTest: { wpm: 48, accuracy: 95, score: 95, requiredWpm: 45 }, chatSimulationScore: 66, chatInterviewScore: 64, equipmentCheck: OK_LINE, mode: "auto",
    expect: { judgment: 68, finalScore: 70.93, overallScore: 69, confidence: 78, recommendedAction: "advance", hardRequirementStatus: "met", autopilotAction: "advance", decisionState: "ready_for_decision", dimensionScores: { hard_requirements: 67, role_competency: 67, communication: 65, execution_reliability: 76, work_style_fit: 67, evidence_quality: 100 } } },
  { name: "weak agent, every test done, slow line", sub: "weak", quizScore: 40, typingTest: { wpm: 46, accuracy: 88, score: 88, requiredWpm: 45 }, chatSimulationScore: 35, chatInterviewScore: 40, equipmentCheck: SLOW_LINE, mode: "auto",
    expect: { judgment: 43, finalScore: 46.11, overallScore: 44, confidence: 78, recommendedAction: "reject", hardRequirementStatus: "mixed", autopilotAction: "reject", decisionState: "ready_for_decision", dimensionScores: { hard_requirements: 41, role_competency: 40, communication: 38, execution_reliability: 55, work_style_fit: 41, evidence_quality: 100 } } },
  { name: "average agent after the skills check", sub: "average", quizScore: 80, typingTest: null, chatSimulationScore: null, chatInterviewScore: null, equipmentCheck: null, mode: "auto",
    expect: { judgment: 68, finalScore: 72.36, overallScore: 69, confidence: 33, recommendedAction: "review", hardRequirementStatus: "met", autopilotAction: "defer", decisionState: "needs_more_evidence", dimensionScores: { hard_requirements: 69, role_competency: 72, communication: 65, execution_reliability: 74, work_style_fit: 69, evidence_quality: 74 } } },
  { name: "strong agent, form only", sub: "strong", quizScore: null, typingTest: null, chatSimulationScore: null, chatInterviewScore: null, equipmentCheck: null, mode: "auto",
    expect: { judgment: 83, finalScore: 83, overallScore: 83, confidence: 18, recommendedAction: "review", hardRequirementStatus: "met", autopilotAction: "defer", decisionState: "needs_more_evidence", dimensionScores: { hard_requirements: 82, role_competency: 82, communication: 79, execution_reliability: 83, work_style_fit: 83, evidence_quality: 58 } } },
  { name: "aced quiz, weak elsewhere (the quiz floor)", sub: "weak", quizScore: 100, typingTest: { wpm: 64, accuracy: 96, score: 96, requiredWpm: 45 }, chatSimulationScore: 20, chatInterviewScore: 25, equipmentCheck: OK_LINE, mode: "manual",
    expect: { judgment: 43, finalScore: 60, overallScore: 48, confidence: 78, recommendedAction: "review", hardRequirementStatus: "mixed", autopilotAction: "reject", decisionState: "ready_for_decision", dimensionScores: { hard_requirements: 48, role_competency: 45, communication: 25, execution_reliability: 73, work_style_fit: 35, evidence_quality: 100 } } },
];

assert(inferJobFamily(AGENT_JOB.title, AGENT_JOB.description) === "support", "the agent job is still the support family (its text names a team lead and a supervisor)");
for (const fixture of GOLDEN) {
  const sub = AGENT_SUB[fixture.sub];
  const family = inferJobFamily(AGENT_JOB.title, AGENT_JOB.description);
  // The sequence trigger-ava-analysis runs (see scripts/lead_scoring_scenarios.test.mjs).
  const progress = highSignalProgress({
    quizScore: fixture.quizScore, quizConfigured: true, workflowSteps: AGENT_STEPS, typingScore: fixture.typingTest?.score,
    voiceScore: null, portfolioScore: null, chatSimulationScore: fixture.chatSimulationScore, salesSimulationScore: null,
    chatInterviewScore: fixture.chatInterviewScore, videoIntroScore: null, videoIntroSubmitted: false,
  });
  const newScore = computeJudgmentScore({ ...sub, jobFamily: family, hardRequirementConflicts: [], pendingPhases: progress.pendingTopicPhases, takenPhases: progress.completed });
  const finalScore = phaseBlendScore({
    family, judgmentScore: newScore, quizScore: fixture.quizScore, typingTest: fixture.typingTest,
    chatSimulationScore: fixture.chatSimulationScore, salesSimulationScore: null, chatInterviewScore: fixture.chatInterviewScore,
    voiceScore: null, portfolioScore: null,
  });
  const card = buildAvaScorecard({
    finalScore, passingScore: 60, quizScore: fixture.quizScore, quizConfigured: true, typingTest: fixture.typingTest, requiredWpm: 45,
    equipmentCheck: fixture.equipmentCheck, voiceScore: null, portfolioScore: null, chatSimulationScore: fixture.chatSimulationScore,
    salesSimulationScore: null, chatInterviewScore: fixture.chatInterviewScore, videoIntroScore: null, videoIntroSubmitted: false,
    analysisText: "", resumeUnavailable: true, resumeTextUsed: false, resumeImageCount: 0, applicationAnswerCount: 11,
    coverLetterProvided: false, workflowSteps: AGENT_STEPS, jobTitle: AGENT_JOB.title, jobDescription: AGENT_JOB.description,
    jobRequirements: "• Typing speed of at least 45 words a minute with high accuracy", jobSkillsRequired: ["Chat"],
    experienceLevel: AGENT_JOB.experienceLevel, processingMode: fixture.mode, ...sub, hardRequirementConflicts: [],
    transferableEvidence: [], formDealBreakers: [], quizMissedAreas: [], quizMustPassMissed: [], ungradedPhases: [],
    evidenceFingerprint: "golden",
  });
  const got = {
    judgment: newScore, finalScore, overallScore: card.overallScore, confidence: card.confidence,
    recommendedAction: card.recommendedAction, hardRequirementStatus: card.hardRequirementStatus,
    autopilotAction: card.autopilotAction, decisionState: card.decisionState, dimensionScores: card.dimensionScores,
  };
  const same = JSON.stringify(got) === JSON.stringify(fixture.expect);
  assert(same, `${fixture.name}: identical to before (${same ? `overall ${got.overallScore}, ${got.recommendedAction}` : `got ${JSON.stringify(got)} expected ${JSON.stringify(fixture.expect)}`})`);
}

// --- what DID move on a support-agent job, on purpose (2026-10-06, second pass) --
//
// The weights above are untouched. These six cards change, and each change is
// one of the rules that apply to every family on purpose:
//   - a finished test's own result is never a conflict on top of its score
//     (the typing note), and "advance" needs every requirement met, so a
//     typing speed under the job's bar is "review" (two cases);
//   - the interview's credibility rating is a review flag, never a verdict or
//     a cap (it was briefly a decline: 59 "reject");
//   - "all types of billing tickets" is a requirement, not the typing test's
//     topic, so the gap is kept (it was briefly dropped: 82 "advance");
//   - which hours someone can cover is not read from the judge's prose, so
//     "cannot work weekends" and a shift note are a gap to review, never a
//     decline (a weekend schedule the owner will not bend on is a form flag);
//   - a test under 30 (here a 0 on the skills check, or on the chat practice)
//     keeps the card off "advance": not every requirement is met.
// Before the team-lead change (e97d5ce) these read: 73 advance, 81 advance,
// 82 advance, 73 advance, 73 reject, 73 reject, 78 advance, 76 advance.

console.log("\nA support-agent job: the cards that moved on purpose:\n");

const SUPPORT_SUB = { directMatchScore: 88, transferableFitScore: 82, learningSignalScore: 76, writingQualityScore: 80, attentionToDetailScore: 80, authenticityScore: 88, specificityScore: 84 };
const typedAt = (wpm) => ({ wpm, accuracy: 97, score: Math.round(Math.min(100, (wpm / 45) * 100) * 0.97), requiredWpm: 45 });
const MOVED = [
  { name: "typed 38 WPM, judge lists the typing as a conflict", typingTest: typedAt(38), conflicts: ['The job asks for "Typing speed of at least 45 words a minute"; the candidate typed 38 WPM.'], expect: [81, "review", "mixed"] },
  { name: "typed 38 WPM, no conflict", typingTest: typedAt(38), expect: [81, "review", "mixed"] },
  { name: "interview credibility Low", typingTest: typedAt(55), credibility: "Low", expect: [82, "review", "mixed"] },
  { name: "'all types of billing tickets' gap", typingTest: typedAt(55), conflicts: ["The job requires handling all types of billing tickets; the candidate has only done chat."], expect: [73, "review", "mixed"] },
  { name: "'cannot work weekends'", typingTest: typedAt(55), conflicts: ["The candidate cannot work weekends; the job requires weekend shifts."], expect: [73, "review", "mixed"] },
  { name: "a shift note", typingTest: typedAt(55), conflicts: ["The candidate selected only daytime shifts; the job covers nights and weekends."], expect: [73, "review", "mixed"] },
  { name: "0 on the skills check", typingTest: typedAt(55), quizScore: 0, expect: [78, "review", "mixed"] },
  { name: "0 on the chat practice", typingTest: typedAt(55), chatSimulationScore: 0, expect: [76, "review", "mixed"] },
];
for (const fixture of MOVED) {
  const family = inferJobFamily(AGENT_JOB.title, AGENT_JOB.description);
  const quizScore = fixture.quizScore ?? 80;
  const chatSimulationScore = fixture.chatSimulationScore ?? 80;
  const progress = highSignalProgress({
    quizScore, quizConfigured: true, workflowSteps: AGENT_STEPS, typingScore: fixture.typingTest.score, voiceScore: null, portfolioScore: null,
    chatSimulationScore, salesSimulationScore: null, chatInterviewScore: 75, videoIntroScore: null, videoIntroSubmitted: false,
  });
  const conflicts = fixture.conflicts ?? [];
  const newScore = computeJudgmentScore({ ...SUPPORT_SUB, jobFamily: family, hardRequirementConflicts: conflicts, pendingPhases: progress.pendingTopicPhases, takenPhases: progress.completed });
  const finalScore = phaseBlendScore({
    family, judgmentScore: newScore, quizScore, typingTest: fixture.typingTest, chatSimulationScore, salesSimulationScore: null,
    chatInterviewScore: 75, voiceScore: null, portfolioScore: null,
  });
  const card = buildAvaScorecard({
    finalScore, passingScore: 60, quizScore, quizConfigured: true, typingTest: fixture.typingTest, requiredWpm: 45, equipmentCheck: OK_LINE,
    voiceScore: null, portfolioScore: null, chatSimulationScore, salesSimulationScore: null, chatInterviewScore: 75, videoIntroScore: null,
    videoIntroSubmitted: false, analysisText: "", resumeUnavailable: true, resumeTextUsed: false, resumeImageCount: 0, applicationAnswerCount: 11,
    coverLetterProvided: false, workflowSteps: AGENT_STEPS, jobTitle: AGENT_JOB.title, jobDescription: AGENT_JOB.description,
    jobRequirements: "• Typing speed of at least 45 words a minute with high accuracy", jobSkillsRequired: ["Chat"],
    experienceLevel: AGENT_JOB.experienceLevel, processingMode: "auto", ...SUPPORT_SUB, hardRequirementConflicts: conflicts, transferableEvidence: [],
    formDealBreakers: [], quizMissedAreas: [], quizMustPassMissed: [], interviewCredibility: fixture.credibility ?? null, ungradedPhases: [],
    evidenceFingerprint: "moved",
  });
  const got = [card.overallScore, card.recommendedAction, card.hardRequirementStatus];
  assert(JSON.stringify(got) === JSON.stringify(fixture.expect) && card.hardRejectReason === null,
    `${fixture.name}: ${got.join(" ")} (expected ${fixture.expect.join(" ")}, never a decline)`);
}

console.log(failures ? `\n${failures} assertion(s) failed.` : "\nAll assertions passed.");
process.exit(failures ? 1 : 0);
