/**
 * Fix: TypingTestPhase.tsx used to compute wpm/accuracy/score in the
 * browser and write the result straight into `applications.notes`/`phase`
 * with a plain candidate-session `supabase.from("applications").update(...)`
 * call — trivially forgeable from devtools before trigger-ava-analysis ever
 * ran. supabase/functions/submit-typing-test now grades server-side (off a
 * SERVER-recorded start time, never the client's) and writes through
 * _shared/trustedResults.ts's recordStepResult instead; the page calls that
 * function for both "start" and "submit" and no longer touches
 * `applications` directly for this step at all. Two guards, one file:
 *
 *   1. typing-test-server-side — fails if the direct-write regression this
 *      fix removed reappears, if the page stops calling submit-typing-test
 *      for any of its three legs, if the edge function stops measuring
 *      elapsed time off its own recorded start/end (typing_test_starts) via
 *      resolveElapsedMs or stops rejecting an implausibly-fast/start-less
 *      submission, or if this phase's own migration stops flipping
 *      'typingTestResult' to enforced = true. Also fails if the "submit"
 *      leg's elapsed-time computation regresses back to grading off
 *      whenever the submit request arrives (Date.now() at request time)
 *      instead of off the server-frozen end-of-typing instant "complete"
 *      records — the bug where a candidate who paused on the results
 *      screen before clicking "Submit results" got a silently lower score
 *      than one who typed identically and submitted instantly.
 *
 *   2. typing-test-formula-shared-copy-matches-client — Deno edge functions
 *      cannot import from `src/` (different module graph/bundler/path
 *      aliases — same reasoning as candidate-journey-shared-copy.mjs), so
 *      calculateResults.ts's calculateTypingResults is necessarily a
 *      SEPARATE, hand-maintained reproduction of TypingTestPhase.tsx's own
 *      local calculateResults (kept client-side only for the instant,
 *      non-authoritative "Nice work" preview shown before the candidate
 *      presses Submit). This fails if the two copies' formula expressions
 *      (the elapsed-minutes floor, gross-WPM, word-accuracy, speed/score
 *      blend) drift apart — the candidate's own preview would then
 *      disagree with the authoritative score submit-typing-test actually
 *      records. scripts/typing_test_results.test.mjs is the companion
 *      proof that these expressions produce identical output on realistic
 *      samples; this guard only catches a textual edit to one copy without
 *      the other.
 */
const PAGE_PATH = "src/pages/TypingTestPhase.tsx";
const FUNCTION_PATH = "supabase/functions/submit-typing-test/index.ts";
const CALC_PATH = "supabase/functions/submit-typing-test/calculateResults.ts";
const MIGRATION_PATH = "supabase/migrations/20260916150100_enforce_typing_test_result.sql";

const FORMULA_EXPRESSIONS = [
  ["elapsed-minutes floor (>= 0.1 minutes)", "Math.max(elapsedMs / 60000, 0.1)"],
  ["gross WPM (5 chars = 1 word)", "Math.round((charCount / 5) / elapsedMinutes)"],
  ["word-by-word accuracy", "Math.round((correctWords / typedWords.length) * 100)"],
  ["speed score capped at 100", "Math.min(100, (grossWpm / requiredWpm) * 100)"],
  ["overall score = speed x accuracy", "Math.round(speedScore * (accuracy / 100))"],
];

export default [
  {
    id: "typing-test-server-side",
    why:
      "TypingTestPhase.tsx must never again write notes.typingTestResult / phase directly from the " +
      "candidate's own session — submit-typing-test (service-role, via recordStepResult) is the only " +
      "legitimate writer now, and it must grade off its OWN server-recorded start time, not anything " +
      "the client reports.",
    async run({ read }) {
      const bad = [];

      const page = await read(PAGE_PATH);
      if (page == null) {
        bad.push(`${PAGE_PATH} is missing`);
      } else {
        // The regression this fix removed: a candidate-session write of the
        // typing test result straight into applications.notes.
        if (/\.from\(\s*["']applications["']\s*\)\s*\.update\(\s*\{\s*\n\s*notes:\s*JSON\.stringify\(updatedNotes\)/.test(page)) {
          bad.push(`${PAGE_PATH}: still contains a direct applications.update({ notes: JSON.stringify(updatedNotes) ... }) write`);
        }
        const invokesSubmitTypingTest = /supabase\.functions\.invoke\(\s*["']submit-typing-test["']/.test(page);
        if (!invokesSubmitTypingTest) {
          bad.push(`${PAGE_PATH}: no longer calls the submit-typing-test edge function at all`);
        } else {
          if (!/action:\s*["']start["']/.test(page)) {
            bad.push(`${PAGE_PATH}: no longer calls submit-typing-test's "start" action when the test begins`);
          }
          if (!/action:\s*["']complete["']/.test(page)) {
            bad.push(`${PAGE_PATH}: no longer calls submit-typing-test's "complete" action the instant typing stops — elapsed time would silently include time spent on the results screen before "Submit results" is clicked`);
          }
          if (!/action:\s*["']submit["']/.test(page)) {
            bad.push(`${PAGE_PATH}: no longer calls submit-typing-test's "submit" action to record the result`);
          }
        }
        // The "complete" call must happen where typing actually stops
        // (handleTestComplete), not be left only inside handleSubmit —
        // otherwise it's just a relabeled version of the same bug.
        const handleTestCompleteMatch = /const handleTestComplete = useCallback\(\(\) => \{([\s\S]{0,800}?)\}, \[/.exec(page);
        if (!handleTestCompleteMatch) {
          bad.push(`${PAGE_PATH}: couldn't locate the handleTestComplete useCallback body at all`);
        } else if (!handleTestCompleteMatch[1].includes("completeTest()")) {
          bad.push(`${PAGE_PATH}: handleTestComplete no longer calls completeTest() — the server-side end-of-typing stamp must fire when typing stops, not later when "Submit results" is clicked`);
        }
      }

      const fn = await read(FUNCTION_PATH);
      if (fn == null) {
        bad.push(`${FUNCTION_PATH} is missing`);
      } else {
        if (!/action\s*===\s*["']complete["']/.test(fn)) {
          bad.push(`${FUNCTION_PATH}: no longer handles a "complete" action to stamp typing_test_starts.ended_at when typing actually stops`);
        }
        if (!/resolveElapsedMs\(/.test(fn)) {
          bad.push(`${FUNCTION_PATH}: "submit" no longer computes elapsed time via resolveElapsedMs (preferring the server-frozen ended_at over the submit request's own arrival time) — a candidate who pauses before clicking Submit would again be graded on that pause`);
        }
        if (!/from\(\s*["']typing_test_starts["']\s*\)/.test(fn)) {
          bad.push(`${FUNCTION_PATH}: no longer reads typing_test_starts — the server-side start-time record this conversion depends on`);
        }
        if (!/ended_at/.test(fn)) {
          bad.push(`${FUNCTION_PATH}: no longer references typing_test_starts.ended_at`);
        }
        if (!/resultKey:\s*["']typingTestResult["']/.test(fn) || !/stepType:\s*["']typing_test["']/.test(fn)) {
          bad.push(`${FUNCTION_PATH}: no longer calls recordStepResult with resultKey "typingTestResult" / stepType "typing_test"`);
        }
        if (!/isImplausiblyFast\(/.test(fn)) {
          bad.push(`${FUNCTION_PATH}: no longer rejects an implausibly-fast submission for the amount of text typed`);
        }
        if (!/no_start_recorded/.test(fn)) {
          bad.push(`${FUNCTION_PATH}: no longer refuses a submit with no matching start row`);
        }
      }

      const calc = await read(CALC_PATH);
      if (calc == null) {
        bad.push(`${CALC_PATH} is missing`);
      } else if (!/export function resolveElapsedMs/.test(calc)) {
        bad.push(`${CALC_PATH}: no longer exports resolveElapsedMs`);
      }

      const migration = await read(MIGRATION_PATH);
      if (migration == null) {
        bad.push(`${MIGRATION_PATH} is missing`);
      } else if (!/WHERE\s+result_key\s*=\s*'typingTestResult'/.test(migration) || !/SET\s+enforced\s*=\s*true/.test(migration)) {
        bad.push(`${MIGRATION_PATH}: no longer flips result_key = 'typingTestResult' to enforced = true`);
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "typing-test-formula-shared-copy-matches-client",
    why:
      `${CALC_PATH}'s calculateTypingResults must stay byte-identical, expression by expression, ` +
      `to ${PAGE_PATH}'s own local calculateResults preview — a formula change on one side without ` +
      "the other means the candidate's own \"Nice work\" preview and the authoritative server-recorded " +
      "score silently disagree.",
    async run({ read }) {
      const clientSrc = await read(PAGE_PATH);
      const serverSrc = await read(CALC_PATH);
      if (clientSrc == null) return { ok: false, detail: [`${PAGE_PATH} is missing`] };
      if (serverSrc == null) return { ok: false, detail: [`${CALC_PATH} is missing`] };

      const bad = [];
      for (const [label, expr] of FORMULA_EXPRESSIONS) {
        const inClient = clientSrc.includes(expr);
        const inServer = serverSrc.includes(expr);
        if (!inClient && !inServer) {
          bad.push(`neither file contains the "${label}" expression (\`${expr}\`) any more`);
        } else if (!inClient) {
          bad.push(`${PAGE_PATH} no longer contains the "${label}" expression (\`${expr}\`) — ${CALC_PATH} still does, so they've drifted`);
        } else if (!inServer) {
          bad.push(`${CALC_PATH} no longer contains the "${label}" expression (\`${expr}\`) — ${PAGE_PATH} still does, so they've drifted`);
        }
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
