/**
 * Fix: src/pages/ChatInterviewPhase.tsx used to write
 * notes.chatInterviewResult (and, on the AI-detected-closing-message path,
 * notes[stepId] plus applications.phase/status) straight from the
 * candidate's own browser session, trusting an `evaluation` object that
 * itself came from an earlier, separately-editable fetch to
 * ai-chat-interview. A candidate could edit that response — or skip the
 * fetch and invent one — in devtools before the write landed.
 *
 * The fix: ai-chat-interview grew a "submit" mode that (a) requires the
 * caller's real JWT and resolves candidate identity via auth.getUser(),
 * never a body param, (b) runs the OpenAI evaluation itself, server-side,
 * from messages sent in THAT SAME request, and (c) calls recordStepResult
 * (supabase/functions/_shared/trustedResults.ts) to write
 * notes.chatInterviewResult and advance phase/status atomically,
 * service-role. The page now only ever POSTs to that mode and reads the
 * response — it never calls `.from("applications").update(...)` for this
 * step's result again. supabase/migrations/20260916150300_enforce_chat_interview_result.sql
 * then flips 'chatInterviewResult' in trusted_result_enforcement so the
 * database itself refuses a candidate's own attempt to write that notes key
 * (or any type:"chat_interview" entry) directly, closing the gap even if
 * this page ever regressed.
 *
 * This guard fails if ANY of those pieces disappear.
 */
const PAGE = "src/pages/ChatInterviewPhase.tsx";
const FUNCTION = "supabase/functions/ai-chat-interview/index.ts";
const MIGRATION = "supabase/migrations/20260916150300_enforce_chat_interview_result.sql";

export default [
  {
    id: "chat-interview-phase-never-writes-its-own-result",
    why:
      "ChatInterviewPhase.tsx must never write notes.chatInterviewResult (or notes[stepId] typed " +
      "chat_interview, or applications.phase/status for this step) directly from the browser again — " +
      "that is exactly the devtools-forgeable pattern this fix removed. Both submission paths (the " +
      "AI-detected auto-end effect and the 'End Interview' button's handleSubmit) must instead POST " +
      "mode: \"submit\" to ai-chat-interview and use its response.",
    async run({ read }) {
      const text = await read(PAGE);
      if (text == null) return { ok: false, detail: [`${PAGE} is missing`] };

      const bad = [];
      const lines = text.split("\n");

      for (let i = 0; i < lines.length; i++) {
        if (!/from\(\s*["']applications["']\s*\)/.test(lines[i])) continue;
        const window = lines.slice(i, i + 10).join("\n");
        const updateMatch = window.match(/\.update\(\s*\{([\s\S]*?)\}\s*\)/);
        if (!updateMatch) continue;
        const body = updateMatch[1];
        if (/notes\s*:/.test(body)) {
          bad.push(`${PAGE}:${i + 1}  writes "notes" directly via .update(): ${lines[i].trim()}`);
        }
        if (/\bphase\s*:/.test(body)) {
          bad.push(`${PAGE}:${i + 1}  writes "phase" directly via .update(): ${lines[i].trim()}`);
        }
      }

      if (!/mode:\s*["']submit["']/.test(text)) {
        bad.push(`${PAGE} no longer sends mode: "submit" to ai-chat-interview`);
      }
      // Both submission call sites must send the real session's access
      // token, not the public/anon key — SUPABASE_PUBLISHABLE_KEY is still
      // fine for start/respond/evaluate, but never for submit.
      const submitCalls = (text.match(/mode:\s*["']submit["']/g) ?? []).length;
      const sessionTokenUses = (text.match(/session\.access_token/g) ?? []).length;
      if (submitCalls > 0 && sessionTokenUses < submitCalls) {
        bad.push(
          `${PAGE} sends mode:"submit" ${submitCalls} time(s) but only uses session.access_token ` +
            `${sessionTokenUses} time(s) — a submit call may still be authenticating with the anon key`
        );
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "chat-interview-submit-mode-requires-real-caller-identity",
    why:
      "ai-chat-interview's \"submit\" mode is the only place a chat interview's evaluation can turn into " +
      "notes.chatInterviewResult. It must resolve the caller's identity from auth.getUser() against the " +
      "request's own Authorization header (never a body-supplied applicationId/candidateId alone) before " +
      "calling recordStepResult, and the evaluation it records must come from its OWN OpenAI call in this " +
      "request, never a client-supplied `evaluation` field.",
    async run({ read }) {
      const text = await read(FUNCTION);
      if (text == null) return { ok: false, detail: [`${FUNCTION} is missing`] };

      const bad = [];

      if (!/mode === ["']submit["']/.test(text)) {
        bad.push(`${FUNCTION} no longer has a "submit" mode branch`);
      }
      if (!/\.auth\.getUser\(\)/.test(text)) {
        bad.push(`${FUNCTION} no longer calls auth.getUser() to resolve the caller's real identity`);
      }
      if (!/callerUserId:\s*submitCallerUserId/.test(text)) {
        bad.push(`${FUNCTION} no longer passes the JWT-resolved user id as recordStepResult's callerUserId`);
      }
      if (!/recordStepResult\s*\(/.test(text) || !text.includes('from "../_shared/trustedResults.ts"')) {
        bad.push(`${FUNCTION} no longer calls recordStepResult from _shared/trustedResults.ts`);
      }
      if (!/resultKey:\s*["']chatInterviewResult["']/.test(text)) {
        bad.push(`${FUNCTION} no longer records the result under resultKey "chatInterviewResult"`);
      }
      if (!/stepType:\s*["']chat_interview["']/.test(text)) {
        bad.push(`${FUNCTION} no longer records the result with stepType "chat_interview"`);
      }
      // A request body cannot smuggle a ready-made evaluation into the trusted write —
      // "submit" must always run callOpenAIJson itself and use ITS return value.
      if (/body\.evaluation|request\.evaluation/.test(text)) {
        bad.push(`${FUNCTION} appears to read an "evaluation" field from the request body — the score must always be computed server-side`);
      }
      if (!/const \{ data \} = await callOpenAIJson/.test(text)) {
        bad.push(`${FUNCTION} no longer computes the evaluation itself via callOpenAIJson`);
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "chat-interview-result-enforcement-migration-flips-only-its-own-key",
    why:
      "The migration that turns on database-level enforcement for this phase must flip ONLY " +
      "'chatInterviewResult' — never 'phase' (that's the last, global part-B migration's job, once every " +
      "phase is converted) and never any other phase's own result_key.",
    async run({ read }) {
      const text = await read(MIGRATION);
      if (text == null) return { ok: false, detail: [`${MIGRATION} is missing`] };

      const bad = [];
      if (!/result_key\s*=\s*['"]chatInterviewResult['"]/.test(text)) {
        bad.push(`${MIGRATION} does not flip result_key = 'chatInterviewResult'`);
      }
      if (/result_key\s*=\s*['"]phase['"]/.test(text)) {
        bad.push(`${MIGRATION} touches result_key = 'phase' — that flag is global and must only flip once every phase is converted`);
      }
      const otherKeys = [
        "typingTestResult",
        "chatSimulationResult",
        "salesSimulationResult",
        "portfolioResult",
        "videoIntroResult",
        "voiceInterviewResult",
      ];
      for (const key of otherKeys) {
        if (new RegExp(`result_key\\s*=\\s*['"]${key}['"]`).test(text)) {
          bad.push(`${MIGRATION} touches result_key = '${key}' — this migration must only ever flip chatInterviewResult`);
        }
      }
      if (!/SET\s+enforced\s*=\s*true/i.test(text)) {
        bad.push(`${MIGRATION} doesn't SET enforced = true — it wouldn't actually turn enforcement on`);
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
