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

import { buildAvaScorecard, computeJudgmentScore } from "../supabase/functions/_shared/autopilot.ts";

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

console.log(failures ? `\n${failures} assertion(s) failed.` : "\nAll assertions passed.");
process.exit(failures ? 1 : 0);
