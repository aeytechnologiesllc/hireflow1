/**
 * Fix: Cycle 4 part B converted every screening step to call
 * supabase/functions/_shared/trustedResults.ts's recordStepResult, which
 * advanced applications.phase/status in auto mode for ANY step with a real
 * next step (other than voice_interview) — a uniform rule that only ever
 * matched two of the seven step types' actual pre-conversion behavior
 * (portfolio_upload, video_intro/video_message: VideoIntroPhase.tsx and
 * PortfolioUploadPhase.tsx really did advance `phase` locally in auto
 * mode). The other five (typing_test, chat_simulation, chat_interview,
 * sales_simulation, voice_interview) never wrote `phase`/`status` from the
 * browser at all — the whole advance/reject decision was always left to a
 * follow-up trigger-ava-analysis({ autopilotDecision: true }) call, which
 * deliberately leaves `phase` untouched when Ava recommends declining (a
 * human must review first). Once recordStepResult started advancing those
 * five anyway, a candidate whose result triggered a decline recommendation
 * ended up one step ahead of where the employer's review — the very thing
 * `CandidateStepGate.tsx` is supposed to block.
 *
 * The fix: recordStepResult takes a required `advance: "auto_mode" |
 * "never"` input (supabase/functions/_shared/trustedResults.ts's own
 * `StepAdvanceMode`), and its write to `applications` only ever includes
 * `phase`/`status` when the caller passed `advance: "auto_mode"` AND the
 * computed decision itself says to advance. Every call site now passes the
 * value that reproduces its own phase's pre-conversion behavior exactly.
 *
 * This guard fails if the gate in trustedResults.ts disappears, or if any
 * call site's `advance` value drifts from the phase it belongs to.
 */
const SHARED = "supabase/functions/_shared/trustedResults.ts";

// stepType -> the correct `advance` value, and the one file that calls
// recordStepResult for it (see the module doc comment above for why each
// value is what it is).
const CALL_SITES = [
  { file: "supabase/functions/submit-typing-test/index.ts", stepType: "typing_test", advance: "never" },
  { file: "supabase/functions/ai-chat-simulation/index.ts", stepType: "chat_simulation", advance: "never" },
  { file: "supabase/functions/ai-chat-interview/index.ts", stepType: "chat_interview", advance: "never" },
  { file: "supabase/functions/submit-sales-simulation/index.ts", stepType: "sales_simulation", advance: "never" },
  { file: "supabase/functions/ava-voice-tools/index.ts", stepType: "voice_interview", advance: "never" },
  { file: "supabase/functions/ai-analyze-portfolio/index.ts", stepType: "portfolio_upload", advance: "auto_mode" },
  { file: "supabase/functions/complete-video-intro/index.ts", stepType: null, advance: "auto_mode" },
];

// Finds every `recordStepResult(...)` call's own argument object text (from
// its opening `{` to the matching closing `}`), by brace-depth counting —
// good enough for this file's own formatting, and robust to call sites that
// span many lines with nested object literals (e.g. `result: {...}`).
function callArgBlocks(text) {
  const blocks = [];
  const callRe = /recordStepResult\s*\(\s*[^,]+,\s*\{/g;
  let m;
  while ((m = callRe.exec(text))) {
    const start = m.index + m[0].length - 1; // position of the opening '{'
    let depth = 0;
    let i = start;
    for (; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    blocks.push(text.slice(start, i + 1));
  }
  return blocks;
}

export default [
  {
    id: "record-step-result-advance-is-required-and-gates-the-write",
    why:
      "recordStepResult must declare `advance` as a REQUIRED input on RecordStepResultInput (not optional/" +
      "defaulted) and its applications.update() payload must only include phase/status when the caller " +
      "passed advance: \"auto_mode\" AND the computed decision itself says to advance — collapsing either " +
      "condition back to just `decision.advance` reopens the over-advance bug for every step whose page " +
      "never wrote phase locally.",
    async run({ read }) {
      const text = await read(SHARED);
      if (text == null) return { ok: false, detail: [`${SHARED} is missing`] };

      const bad = [];

      if (!/export type StepAdvanceMode\s*=\s*["']auto_mode["']\s*\|\s*["']never["']/.test(text)) {
        bad.push(`${SHARED} no longer defines StepAdvanceMode = "auto_mode" | "never"`);
      }
      // Required — `advance:` (no `?`) inside the RecordStepResultInput
      // interface's own declaration of the field.
      if (!/\n\s*advance:\s*StepAdvanceMode;/.test(text)) {
        bad.push(`${SHARED} no longer declares "advance" as a REQUIRED field (advance: StepAdvanceMode;) on RecordStepResultInput`);
      }
      if (/\n\s*advance\?:\s*StepAdvanceMode/.test(text)) {
        bad.push(`${SHARED} declares "advance" as optional — it must be required so every call site chooses consciously`);
      }
      // The actual write gate.
      if (!/input\.advance\s*===\s*["']auto_mode["']\s*&&\s*decision\.advance/.test(text)) {
        bad.push(
          `${SHARED} no longer gates the phase/status write on both input.advance === "auto_mode" AND decision.advance`
        );
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "record-step-result-call-sites-match-their-phase-original-behavior",
    why:
      "Each recordStepResult call site must pass the advance value that reproduces its OWN phase's " +
      "pre-conversion (commit 40e17d8) behavior exactly: \"auto_mode\" only for portfolio_upload and " +
      "video_intro/video_message (the two pages that really did write applications.phase locally in auto " +
      "mode), \"never\" for every other step type (typing_test, chat_simulation, chat_interview, " +
      "sales_simulation, voice_interview), whose pages left the whole advance/reject decision to a " +
      "follow-up trigger-ava-analysis call.",
    async run({ read }) {
      const bad = [];

      for (const site of CALL_SITES) {
        const text = await read(site.file);
        if (text == null) {
          bad.push(`${site.file} is missing`);
          continue;
        }

        const blocks = callArgBlocks(text);
        if (blocks.length === 0) {
          bad.push(`${site.file} no longer calls recordStepResult(...) at all`);
          continue;
        }

        // A file may call recordStepResult more than once (e.g. only in one
        // branch) — at least one call in the file must carry BOTH this
        // phase's stepType (when it's a fixed literal; complete-video-intro
        // resolves it dynamically, so stepType is skipped for that one) and
        // its correct advance value, together in the same call.
        const matching = blocks.filter((block) => {
          const hasAdvance = new RegExp(`advance:\\s*["']${site.advance}["']`).test(block);
          if (site.stepType == null) return hasAdvance;
          const hasStepType =
            new RegExp(`stepType:\\s*["']${site.stepType}["']`).test(block) || /stepType,/.test(block) || /stepType\s*$/.test(block);
          return hasAdvance && hasStepType;
        });

        if (matching.length === 0) {
          bad.push(
            `${site.file}: no recordStepResult(...) call found with advance: "${site.advance}"` +
              (site.stepType ? ` alongside stepType "${site.stepType}"` : "")
          );
        }
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
