#!/usr/bin/env node
/**
 * Local test runner for
 * supabase/functions/submit-typing-test/calculateResults.ts's pure grading
 * formula — plain assertions, no framework, same style as
 * scripts/trusted_results_logic.test.mjs.
 *
 * Runs the REAL server module (no copy) against an independent, line-cited
 * reproduction of TypingTestPhase.tsx's own client-side `calculateResults`
 * (the function this conversion moved server-side — see
 * src/pages/TypingTestPhase.tsx, "calculateResults" around lines 274-314 as
 * of the conversion commit) across realistic samples: a perfect typist, a
 * slow/partial typist, extra words typed past the passage, zero input, a
 * "finish early" submission, and the 0.1-minute elapsed-time floor. Both
 * implementations must agree exactly, for every sample, given the SAME
 * (typedText, targetText, elapsedMs, requiredWpm) inputs.
 *
 * scripts/guards/typing-test-formula-shared-copy.mjs statically guards the
 * underlying source expressions in both files against drifting apart, so
 * this file only needs to prove the two functions compute the same thing
 * on real inputs, not re-derive that guarantee itself.
 *
 * Run with: node scripts/typing_test_results.test.mjs
 */
import { calculateTypingResults, resolveElapsedMs } from "../supabase/functions/submit-typing-test/calculateResults.ts";

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
// Reference implementation — an independent, faithful reproduction of
// TypingTestPhase.tsx's own client-side calculateResults(), parameterized
// the same way calculateTypingResults() is (typedText, targetText,
// elapsedMs, requiredWpm) instead of reading component refs/state, so it
// can run here without React. Every line below mirrors that function's own
// logic byte-for-byte, including its comments.
// ============================================================================
function oldClientCalculateResults(typedText, targetText, elapsedMs, requiredWpm) {
  // Calculate elapsed time in minutes
  const elapsedMinutes = Math.max(elapsedMs / 60000, 0.1); // At least 0.1 minutes to avoid division issues

  // Calculate Gross WPM (standard: 5 characters = 1 word)
  const charCount = typedText.length;
  const grossWpm = Math.round((charCount / 5) / elapsedMinutes);

  // Word-by-word accuracy comparison (more forgiving than character position matching)
  const typedWords = typedText.trim().split(/\s+/).filter(w => w.length > 0);
  const targetWords = targetText.trim().split(/\s+/).filter(w => w.length > 0);

  let correctWords = 0;
  for (let i = 0; i < typedWords.length; i++) {
    if (i < targetWords.length && typedWords[i] === targetWords[i]) {
      correctWords++;
    }
  }

  // Accuracy based on correctly typed words
  const accuracy = typedWords.length > 0
    ? Math.round((correctWords / typedWords.length) * 100)
    : 0;

  // Calculate overall score: Gross WPM weighted by accuracy
  const speedScore = Math.min(100, (grossWpm / requiredWpm) * 100);
  const score = Math.round(speedScore * (accuracy / 100));

  // NOTE: local 'passed' is for UI display ONLY. Backend trigger-ava-analysis is the SINGLE SOURCE OF TRUTH
  const passed = false; // Always false locally - backend decides

  return { wpm: grossWpm, accuracy, score, passed };
}

const TARGET =
  "The quick brown fox jumps over the lazy dog. This classic pangram contains every letter of the English alphabet at least once. It has been used for decades to test typewriters, keyboards, and typing software.";

/** Runs both implementations on the same inputs and asserts identical output. */
function checkParity(label, typedText, targetText, elapsedMs, requiredWpm) {
  const server = calculateTypingResults(typedText, targetText, elapsedMs, requiredWpm);
  const client = oldClientCalculateResults(typedText, targetText, elapsedMs, requiredWpm);
  check(
    `${label}: wpm matches (${server.wpm} vs ${client.wpm})`,
    server.wpm === client.wpm,
  );
  check(
    `${label}: accuracy matches (${server.accuracy}% vs ${client.accuracy}%)`,
    server.accuracy === client.accuracy,
  );
  check(
    `${label}: score matches (${server.score} vs ${client.score})`,
    server.score === client.score,
  );
  check(`${label}: passed is always false on both sides`, server.passed === false && client.passed === false);
  return server;
}

console.log("calculateTypingResults vs. the old client calculateResults — realistic samples:\n");

// A candidate who typed the whole passage perfectly in 55 seconds.
checkParity("perfect typist, full passage, 55s", TARGET, TARGET, 55_000, 40);

// A slow, partial typist — only got through the first sentence in 60s.
checkParity(
  "slow partial typist, first sentence only, 60s",
  "The quick brown fox jumps over the lazy dog.",
  TARGET,
  60_000,
  40,
);

// A typist with some wrong words interspersed (word-by-word accuracy, not char-level).
checkParity(
  "some words wrong",
  "The quick brown cat jumps over the lazy dog. This classic pangram contains every letter",
  TARGET,
  45_000,
  35,
);

// Typed MORE words than the target has (accuracy denominator uses typedWords.length).
checkParity(
  "typed past the end of the passage",
  TARGET + " extra bonus words nobody asked for",
  TARGET,
  58_000,
  40,
);

// "Finish early" with almost nothing typed.
checkParity("finished early, almost nothing typed", "The quick", TARGET, 8_000, 40);

// Nothing typed at all — accuracy's zero-typed-words branch.
checkParity("nothing typed at all", "", TARGET, 60_000, 40);

// Extremely short elapsed time hits the 0.1-minute (6s) floor identically
// on both sides — this is the floor the anti-cheat check in
// isImplausiblyFast (submit-typing-test/index.ts) exists to catch
// separately; the formula itself must still agree given the same raw input.
checkParity("elapsed time floor (2s raw, short text)", "The quick brown", TARGET, 2_000, 40);

// A very high required_wpm caps speedScore at 100 via Math.min.
checkParity("required_wpm far above achievable — speed score capped at 100", TARGET, TARGET, 20_000, 500);

// required_wpm defaults differ between the two former client call sites
// (35 in the old calculateResults, 40 in the old handleSubmit) — this
// module takes ONE value, used consistently; parity only needs to hold
// given the same value, which it does at both defaults.
checkParity("consistent with the old 35 default", TARGET, TARGET, 55_000, 35);
checkParity("consistent with the old 40 default", TARGET, TARGET, 55_000, 40);

// Extra whitespace between words shouldn't change the word split.
checkParity(
  "extra whitespace between words",
  "The   quick\tbrown  fox  jumps over   the lazy dog.",
  TARGET,
  50_000,
  40,
);

// ============================================================================
// resolveElapsedMs — the "think time" fix. "submit" must grade off the
// server-frozen end-of-typing instant ("complete"'s ended_at), never off
// whenever the "submit" HTTP request happens to arrive, or an honest
// candidate who pauses on the results screen before clicking "Submit
// results" gets a silently lower score for identical typing.
// ============================================================================
console.log("\nresolveElapsedMs — grading is pinned to when typing stopped, not to when Submit is clicked:\n");

{
  const startedAtMs = 1_000_000;
  const endedAtMs = startedAtMs + 45_000; // typing took 45s

  // No matter how much later "submit" actually arrives — 0s, 5s, 30s, or
  // 5 minutes of reading the results screen — elapsed time must stay
  // pinned to the 45s ended_at - started_at recorded when typing stopped.
  for (const thinkTimeMs of [0, 5_000, 10_000, 30_000, 300_000]) {
    const nowMs = endedAtMs + thinkTimeMs;
    check(
      `ended_at set: ${thinkTimeMs / 1000}s of think time before Submit doesn't change elapsed`,
      resolveElapsedMs(startedAtMs, endedAtMs, nowMs) === 45_000,
      `got ${resolveElapsedMs(startedAtMs, endedAtMs, nowMs)}, expected 45000`,
    );
  }

  // Fallback path — "complete" never landed (e.g. a dropped request): grade
  // off the submit request's own arrival time, exactly like the pre-fix
  // behavior for this one edge case (no worse than before, not the common
  // path any more).
  const nowMsNoComplete = startedAtMs + 20_000;
  check(
    "ended_at null: falls back to nowMs - startedAtMs",
    resolveElapsedMs(startedAtMs, null, nowMsNoComplete) === 20_000,
    `got ${resolveElapsedMs(startedAtMs, null, nowMsNoComplete)}`,
  );

  // Regression check for the actual reported bug: with the OLD (buggy)
  // behavior of always using nowMs, a 5s/10s/20s/30s/60s pause would have
  // dropped a perfect-typist score from 100 to 95/90/78/70/53 (per the
  // finding). With the fix, using ended_at instead of nowMs must produce
  // the SAME score regardless of pause length.
  const TARGET_FOR_PACE =
    "The quick brown fox jumps over the lazy dog. This classic pangram contains every letter of the English alphabet at least once. It has been used for decades to test typewriters, keyboards, and typing software.";
  const perfectTypedText = TARGET_FOR_PACE;
  const requiredWpm = 40;
  const typingElapsedMs = 60_000; // typed the whole 60s window
  const perfectStartedAtMs = 5_000_000;
  const perfectEndedAtMs = perfectStartedAtMs + typingElapsedMs;

  const baselineElapsed = resolveElapsedMs(perfectStartedAtMs, perfectEndedAtMs, perfectEndedAtMs);
  const baselineResult = calculateTypingResults(perfectTypedText, TARGET_FOR_PACE, baselineElapsed, requiredWpm);

  for (const pauseMs of [5_000, 10_000, 20_000, 30_000, 60_000]) {
    const submitArrivesAtMs = perfectEndedAtMs + pauseMs;
    const elapsedWithFix = resolveElapsedMs(perfectStartedAtMs, perfectEndedAtMs, submitArrivesAtMs);
    const resultWithFix = calculateTypingResults(perfectTypedText, TARGET_FOR_PACE, elapsedWithFix, requiredWpm);
    check(
      `regression check: a ${pauseMs / 1000}s pause before Submit no longer changes wpm/score (was the reported bug)`,
      resultWithFix.wpm === baselineResult.wpm && resultWithFix.score === baselineResult.score,
      `got wpm=${resultWithFix.wpm} score=${resultWithFix.score}, expected wpm=${baselineResult.wpm} score=${baselineResult.score}`,
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
