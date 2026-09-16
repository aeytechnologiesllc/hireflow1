/**
 * Chat simulation (part B of the trusted-step-results fix — see
 * docs/TRUSTED-RESULTS.md): ChatSimulationPhase.tsx used to fetch an
 * "evaluation" from ai-chat-simulation and then write
 * notes.chatSimulationResult (+ phase_ai_analysis) into `applications`
 * itself, from the candidate's own browser session. A candidate who edited
 * that fetch response — or skipped it and called
 * `supabase.from("applications").update(...)` directly with any score they
 * liked — was trusted completely; trigger-ava-analysis and the cockpit read
 * notes.chatSimulationResult as real evidence.
 *
 * Fixed by:
 *   - supabase/functions/ai-chat-simulation/index.ts's "evaluate" mode now
 *     grades the transcript itself (never a client-supplied score), verifies
 *     the caller's own session JWT resolves to this application's candidate,
 *     and calls `recordStepResult` (service-role) to write the result —
 *     the ONE place `applications` gets written for this step now.
 *   - src/pages/ChatSimulationPhase.tsx no longer writes `applications` at
 *     all; it POSTs to that same function with the real access token and
 *     uses the JSON response.
 *   - supabase/migrations/20260916150200_enforce_chat_simulation_result.sql
 *     flips `chatSimulationResult` to enforced = true, so
 *     protect_application_columns() (20260915140000) now refuses a
 *     candidate's direct write of that key too, as a second layer under the
 *     trigger.
 *
 * These are static text checks over the source — cheap, no server or DB
 * needed — not a substitute for
 * scripts/chat_simulation_enforcement.pglite.test.mjs (the trigger proof)
 * or scripts/chat_simulation_grading.test.mjs (the grading-shape proof).
 */

function stripTsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");
}

const PAGE = "src/pages/ChatSimulationPhase.tsx";
const FUNCTION = "supabase/functions/ai-chat-simulation/index.ts";
const MIGRATION = "supabase/migrations/20260916150200_enforce_chat_simulation_result.sql";

export default [
  {
    id: "chat-simulation-page-never-writes-applications",
    why:
      `${PAGE} must never call supabase.from("applications").update(...) again for this step — ` +
      "that raw client write is exactly the forgery path this fix closes. If it comes back, a " +
      "candidate can once again self-report any chatSimulationResult score they like.",
    run: async ({ read }) => {
      const page = await read(PAGE);
      if (page == null) return { ok: false, detail: [`${PAGE} is missing`] };
      const code = stripTsComments(page);
      const bad = [];

      if (/\.from\(\s*["']applications["']\s*\)\s*\.update\(/.test(code)) {
        bad.push(
          `${PAGE}: still calls supabase.from("applications").update(...) directly — the candidate's ` +
            "browser must never write applications for this step again; use ai-chat-simulation's " +
            "\"evaluate\" response instead."
        );
      }
      // The old inline construction of the result object client-side — if
      // this literal shows back up, someone reintroduced local scoring.
      if (/chatSimulationResult\s*:\s*\{\s*\n?\s*scenario/.test(code)) {
        bad.push(
          `${PAGE}: builds a chatSimulationResult object literal locally again — grading must happen ` +
            "server-side in ai-chat-simulation, never assembled in the browser."
        );
      }
      if (!/mode\s*:\s*["']evaluate["']/.test(code) || !/applicationId/.test(code) || !/stepId/.test(code)) {
        bad.push(
          `${PAGE}: no longer posts { mode: "evaluate", applicationId, stepId, ... } to ai-chat-simulation — ` +
            "recordStepResult needs both to verify the caller and the step."
        );
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "chat-simulation-function-owns-the-write",
    why:
      `${FUNCTION} must verify the caller's own session JWT and call recordStepResult with ` +
      "resultKey \"chatSimulationResult\" / stepType \"chat_simulation\" — without both, either an " +
      "unauthenticated caller could record a result for someone else's application, or the write " +
      "would stop landing in the shape trigger-ava-analysis/the cockpit/CondensedAIAnalysis expect.",
    run: async ({ read }) => {
      const fn = await read(FUNCTION);
      if (fn == null) return { ok: false, detail: [`${FUNCTION} is missing`] };
      const code = stripTsComments(fn);
      const bad = [];

      if (!/recordStepResult\s*\(/.test(code)) {
        bad.push(`${FUNCTION}: no longer calls recordStepResult — the server-side write is gone.`);
      }
      if (!/resultKey\s*:\s*["']chatSimulationResult["']/.test(code)) {
        bad.push(`${FUNCTION}: recordStepResult call no longer passes resultKey: "chatSimulationResult".`);
      }
      if (!/stepType\s*:\s*["']chat_simulation["']/.test(code)) {
        bad.push(`${FUNCTION}: recordStepResult call no longer passes stepType: "chat_simulation".`);
      }
      // Caller identity must come from the request's own JWT, never a body field.
      if (!/auth\.getUser\s*\(/.test(code)) {
        bad.push(
          `${FUNCTION}: no longer resolves the caller via auth.getUser() from the request's own ` +
            "Authorization header — recordStepResult's candidate check is worthless if callerUserId " +
            "can come from anywhere else."
        );
      }
      if (/callerUserId\s*:\s*(request|body|payload)\./.test(code)) {
        bad.push(
          `${FUNCTION}: passes callerUserId from a request/body field — it must be the server's own ` +
            "auth.getUser() result, never client-supplied."
        );
      }
      // Never accept a client-supplied score for the field recordStepResult
      // actually persists — the evaluation object must come from this
      // function's own callOpenAIJson call, not straight off the request.
      if (/result\s*:\s*request\.(evaluation|score)/.test(code) || /result\s*:\s*body\.(evaluation|score)/.test(code)) {
        bad.push(
          `${FUNCTION}: passes a client-supplied evaluation/score straight into recordStepResult's ` +
            "result — the server must compute this itself."
        );
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "chat-simulation-result-key-enforced",
    why:
      `${MIGRATION} must flip ONLY chatSimulationResult to enforced = true, idempotently — flipping ` +
      "the wrong key (or 'phase', which flips only in the final part-B migration) would either do " +
      "nothing for this phase or break every phase not yet converted.",
    run: async ({ read }) => {
      const migration = await read(MIGRATION);
      if (migration == null) return { ok: false, detail: [`${MIGRATION} is missing`] };
      const bad = [];

      if (!/UPDATE\s+public\.trusted_result_enforcement/i.test(migration)) {
        bad.push(`${MIGRATION}: no UPDATE against public.trusted_result_enforcement found.`);
      }
      if (!/SET\s+enforced\s*=\s*true/i.test(migration)) {
        bad.push(`${MIGRATION}: does not set enforced = true.`);
      }
      if (!/WHERE\s+result_key\s*=\s*'chatSimulationResult'/i.test(migration)) {
        bad.push(`${MIGRATION}: does not scope the UPDATE to result_key = 'chatSimulationResult'.`);
      }
      if (/result_key\s*=\s*'phase'/i.test(migration)) {
        bad.push(
          `${MIGRATION}: touches result_key = 'phase' — that flag must only flip in the final part-B ` +
            "migration, once every phase's own result_key is enforced."
        );
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
