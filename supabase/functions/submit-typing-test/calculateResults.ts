/**
 * calculateTypingResults — the exact same formula TypingTestPhase.tsx's own
 * `calculateResults` (client-side, lines ~274-314) computes, reproduced
 * here so submit-typing-test can grade a candidate's typing test
 * authoritatively, server-side, off the elapsed time the SERVER measured
 * (started_at recorded by this function's own "start" action) rather than
 * anything the candidate's browser reports.
 *
 * Deliberately zero imports, same reasoning as
 * supabase/functions/_shared/trustedResults.ts: this file's one exported
 * function is pure (string/number in, object out), so it runs under plain
 * Node (scripts/typing_test_results.test.mjs) exactly as it does inside the
 * Deno edge function. That test compares this module's output against an
 * independent, line-cited reproduction of TypingTestPhase.tsx's own
 * calculateResults across realistic samples.
 *
 * scripts/guards/typing-test-formula-shared-copy.mjs statically checks that
 * the handful of formula expressions below (elapsed-minutes floor, gross
 * WPM, word-accuracy, speed/score blend) still appear verbatim in
 * TypingTestPhase.tsx's own client-side preview calculation, so the two
 * can't silently drift apart the way candidateJourney.ts's two copies are
 * separately guarded against.
 *
 * One deliberate difference from the original client code: the client had
 * TWO different "required WPM" values in play at once — calculateResults
 * used `application?.jobs?.required_wpm || 35` (a value from React Query's
 * possibly-stale cache) while handleSubmit re-fetched a fresh copy with
 * `freshJob?.required_wpm || 40` for the notes entry and the phase-analysis
 * text. Since the server does exactly one fresh read of `required_wpm` (no
 * cache to go stale), this module takes it as a single caller-supplied
 * parameter and expects ONE value used everywhere — submit-typing-test's
 * own index.ts passes the same freshly-read `required_wpm` (defaulting to
 * 40, matching handleSubmit's own default) into both the score formula and
 * the stored result, which is strictly more consistent than the two-values
 * bug it replaces, not a scoring-rule change.
 */

export interface TypingTestResult {
  wpm: number;
  accuracy: number;
  score: number;
  /** Always false — the real pass/fail decision is trigger-ava-analysis's
   *  weighted score, never this formula. Matches TypingTestPhase.tsx's own
   *  comment: "local 'passed' is for UI display ONLY." */
  passed: boolean;
}

export function calculateTypingResults(
  typedText: string,
  targetText: string,
  elapsedMs: number,
  requiredWpm: number,
): TypingTestResult {
  // At least 0.1 minutes (6 seconds) to avoid division issues — identical
  // floor to the client's own `Math.max(elapsedMs / 60000, 0.1)`.
  const elapsedMinutes = Math.max(elapsedMs / 60000, 0.1);

  // Gross WPM (standard: 5 characters = 1 word).
  const charCount = typedText.length;
  const grossWpm = Math.round((charCount / 5) / elapsedMinutes);

  // Word-by-word accuracy comparison (more forgiving than character
  // position matching) — identical to the client's own loop.
  const typedWords = typedText.trim().split(/\s+/).filter((w) => w.length > 0);
  const targetWords = targetText.trim().split(/\s+/).filter((w) => w.length > 0);

  let correctWords = 0;
  for (let i = 0; i < typedWords.length; i++) {
    if (i < targetWords.length && typedWords[i] === targetWords[i]) {
      correctWords++;
    }
  }

  const accuracy = typedWords.length > 0
    ? Math.round((correctWords / typedWords.length) * 100)
    : 0;

  // Overall score: Gross WPM weighted by accuracy.
  const speedScore = Math.min(100, (grossWpm / requiredWpm) * 100);
  const score = Math.round(speedScore * (accuracy / 100));

  return { wpm: grossWpm, accuracy, score, passed: false };
}

/**
 * The candidate typing passages a "start" call chooses from and echoes back
 * — kept here (not duplicated in TypingTestPhase.tsx any more) so there is
 * exactly one place that decides what text a candidate is graded against.
 * Identical wording to the array TypingTestPhase.tsx used to pick from
 * client-side before this conversion.
 */
export const TYPING_TEST_PASSAGES: readonly string[] = [
  "The quick brown fox jumps over the lazy dog. This classic pangram contains every letter of the English alphabet at least once. It has been used for decades to test typewriters, keyboards, and typing software.",
  "Customer service is about creating positive experiences for every client. Active listening, empathy, and clear communication are essential skills. A great support representative can turn a frustrated customer into a loyal advocate.",
  "In today's fast-paced business environment, effective communication is more important than ever. Whether you're writing emails, preparing reports, or participating in meetings, your ability to express ideas clearly can make or break your career.",
  "Technology continues to transform how we work and interact with customers. From chatbots to CRM systems, understanding these tools helps us provide better service. Embracing change while maintaining a human touch is the key to success.",
  "Problem-solving is a critical skill in any workplace. When faced with challenges, taking a step back to analyze the situation, considering multiple solutions, and implementing the best approach can lead to positive outcomes for everyone involved.",
];

export function pickTypingPassage(): string {
  const index = Math.floor(Math.random() * TYPING_TEST_PASSAGES.length);
  return TYPING_TEST_PASSAGES[index];
}

/**
 * Anti-cheat floor: rejects a submission whose SERVER-measured elapsed time
 * is implausibly short for how much text was typed, independent of the
 * `elapsedMinutes` 0.1-minute floor above (which exists to avoid a
 * division blow-up, not to catch cheating — a submission at, say, 400
 * characters and 1 second raw elapsed would otherwise be silently floored
 * to a merely-high-but-plausible-looking WPM instead of refused outright).
 *
 * MAX_CHARS_PER_MINUTE (1500 = 300 WPM sustained) is a deliberately
 * generous ceiling — well above elite human sustained typing speed — so no
 * honest candidate can ever trip it; it only catches a submission that
 * could not possibly have been typed by hand in the time the server
 * actually observed. Also refuses anything submitted inside half a second
 * of its own start, regardless of length (charCount 0 would otherwise pass
 * the proportional check trivially).
 */
const MAX_CHARS_PER_MINUTE = 1500;
const MIN_MS_PER_CHAR = 60000 / MAX_CHARS_PER_MINUTE;
const ABSOLUTE_MIN_ELAPSED_MS = 500;

export function isImplausiblyFast(typedTextLength: number, elapsedMs: number): boolean {
  const requiredMinElapsedMs = Math.max(ABSOLUTE_MIN_ELAPSED_MS, typedTextLength * MIN_MS_PER_CHAR);
  return elapsedMs < requiredMinElapsedMs;
}
