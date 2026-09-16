#!/usr/bin/env node
/**
 * Local test runner for the voice-minutes-drain fix — plain assertions, no
 * framework. Imports the real, pure functions in
 * supabase/functions/_shared/voiceSessionCharge.ts directly (Node 24+ strips
 * the type annotations natively, no build step) and proves:
 *
 *   - the original exploit is closed: a client-reported sessionDurationMinutes
 *     of 999999 against a session that has only actually been open a few
 *     minutes charges only those few minutes, not 999999
 *   - the configured interview time limit (+ buffer) caps a session that
 *     really has been open a long time, even with an honest client report
 *   - the absolute hard cap wins even over a huge configured time limit
 *   - assistant-mode sessions get the flat assistant ceiling, not the
 *     interview default
 *   - a non-finite / negative / missing client duration charges zero, not
 *     NaN or a negative number
 *   - computeSessionTimeLimitMinutes falls back to the same 10-minute
 *     default ava-voice-session's own prompt-building code uses when the
 *     application has no configured voice_interview_duration
 *
 * Run with: node scripts/voice_session_charge.test.mjs
 */

import {
  computeChargeMinutes,
  computeSessionTimeLimitMinutes,
  HARD_CAP_MINUTES,
  ASSISTANT_DEFAULT_LIMIT_MINUTES,
  INTERVIEW_BUFFER_MINUTES,
} from "../supabase/functions/_shared/voiceSessionCharge.ts";

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

const NOW = new Date("2026-09-16T12:30:00.000Z");
function minutesAgo(n) {
  return new Date(NOW.getTime() - n * 60_000);
}

// --- the actual vulnerability: an inflated client report ----------------------
{
  const timeLimitMinutes = computeSessionTimeLimitMinutes("interview", 10); // 10 + 2 buffer = 12
  const charged = computeChargeMinutes({
    clientMinutes: 999999, // exactly the exploit payload described in the fix
    startedAt: minutesAgo(3), // session has really only been open 3 minutes
    now: NOW,
    timeLimitMinutes,
    hardCapMinutes: HARD_CAP_MINUTES,
  });
  check(
    "999999-minute client report on a 3-minute-old session charges only ~3 minutes, not 999999",
    charged === 3,
    `got ${charged}`,
  );
}

// --- honest client report, but the session really has run long ---------------
{
  const timeLimitMinutes = computeSessionTimeLimitMinutes("interview", 10); // 12
  const charged = computeChargeMinutes({
    clientMinutes: 45,
    startedAt: minutesAgo(45), // genuinely open 45 minutes
    now: NOW,
    timeLimitMinutes,
    hardCapMinutes: HARD_CAP_MINUTES,
  });
  check(
    "a genuinely long-running interview session is still capped at its configured limit (10 + 2 buffer)",
    charged === timeLimitMinutes && charged === 12,
    `got ${charged}, expected ${timeLimitMinutes}`,
  );
}

// --- the absolute hard cap wins even over a huge configured limit ------------
{
  const charged = computeChargeMinutes({
    clientMinutes: 500,
    startedAt: minutesAgo(500),
    now: NOW,
    timeLimitMinutes: 400, // some huge/misconfigured employer-set limit
    hardCapMinutes: HARD_CAP_MINUTES,
  });
  check(
    `the hard cap (${HARD_CAP_MINUTES}) wins even when both client minutes and the configured limit are far larger`,
    charged === HARD_CAP_MINUTES,
    `got ${charged}`,
  );
}

// --- assistant mode gets the flat ceiling, not the interview default ---------
{
  const assistantLimit = computeSessionTimeLimitMinutes("assistant");
  check(
    "assistant mode uses ASSISTANT_DEFAULT_LIMIT_MINUTES, not the interview default",
    assistantLimit === ASSISTANT_DEFAULT_LIMIT_MINUTES,
    `got ${assistantLimit}`,
  );

  const charged = computeChargeMinutes({
    clientMinutes: 999999,
    startedAt: minutesAgo(999),
    now: NOW,
    timeLimitMinutes: assistantLimit,
    hardCapMinutes: HARD_CAP_MINUTES,
  });
  check(
    "an inflated assistant-mode session is capped at the assistant ceiling",
    charged === ASSISTANT_DEFAULT_LIMIT_MINUTES,
    `got ${charged}`,
  );
}

// --- interview time limit falls back to 10 minutes, same as ava-voice-session's own prompt default
{
  const limitMissing = computeSessionTimeLimitMinutes("interview", undefined);
  const limitNull = computeSessionTimeLimitMinutes("interview", null);
  const limitZero = computeSessionTimeLimitMinutes("interview", 0);
  const limitNegative = computeSessionTimeLimitMinutes("interview", -5);
  check(
    "missing/null/zero/negative configured duration all fall back to 10 + buffer",
    [limitMissing, limitNull, limitZero, limitNegative].every((v) => v === 10 + INTERVIEW_BUFFER_MINUTES),
    `got ${JSON.stringify({ limitMissing, limitNull, limitZero, limitNegative })}`,
  );

  const limitConfigured = computeSessionTimeLimitMinutes("interview", 20);
  check(
    "a real configured duration (20) is honored, plus the buffer",
    limitConfigured === 20 + INTERVIEW_BUFFER_MINUTES,
    `got ${limitConfigured}`,
  );
}

// --- degenerate client input never charges a negative number or NaN ----------
{
  for (const bad of [-10, NaN, Infinity, -Infinity, "not a number", undefined, null]) {
    const charged = computeChargeMinutes({
      clientMinutes: bad,
      startedAt: minutesAgo(5),
      now: NOW,
      timeLimitMinutes: 12,
      hardCapMinutes: HARD_CAP_MINUTES,
    });
    check(
      `degenerate clientMinutes (${JSON.stringify(bad)}) charges 0, never negative/NaN`,
      charged === 0,
      `got ${charged}`,
    );
  }
}

// --- clock skew (started_at in the future somehow) never charges negative ----
{
  const charged = computeChargeMinutes({
    clientMinutes: 10,
    startedAt: new Date(NOW.getTime() + 5 * 60_000), // "started" 5 minutes from now
    now: NOW,
    timeLimitMinutes: 12,
    hardCapMinutes: HARD_CAP_MINUTES,
  });
  check("a startedAt after now() charges 0 rather than a negative amount", charged === 0, `got ${charged}`);
}

// --- rounds up to the minute like the client's own Math.ceil, not down -------
{
  const charged = computeChargeMinutes({
    clientMinutes: 999,
    startedAt: minutesAgo(0), // shift below by a few seconds
    now: new Date(minutesAgo(0).getTime() + 30_000), // 30 seconds later
    timeLimitMinutes: 12,
    hardCapMinutes: HARD_CAP_MINUTES,
  });
  check("30 elapsed seconds rounds up to 1 minute, not down to 0", charged === 1, `got ${charged}`);
}

console.log(failed ? `\n${failed} of ${passed + failed} checks failed.` : `\nAll ${passed} assertions passed.`);
process.exit(failed ? 1 : 0);
