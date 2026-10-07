/**
 * Fix (2026-10-07): when the AI service refuses, an applicant's test stays
 * open and nothing they did is lost or shown as broken.
 *
 * That night the OpenAI account ran out of credit (429 insufficient_quota /
 * credit_balance_exhausted) for about ninety minutes. The helpers retried it
 * like a busy server; ai-chat-simulation and ai-chat-interview stored every
 * applicant message and met it with silence, then recorded every send as
 * finished and "not graded" (model_failed): 17 interviews of answers to no
 * questions, closed. ai-analyze fell back to a degraded read and saved it
 * as the applicant's score.
 *
 * Fixed by (docs/ASSESSMENT-RECORD.md §5.1.2 and §5.1.4):
 *   - _shared/openai.ts: AiUnavailableError, out of credit never retried;
 *     _shared/openaiStreaming.ts throws it too;
 *   - both chat functions hold a NEW message until the model takes it, so a
 *     refusal stores nothing (503 ai_unavailable, the page puts the text back
 *     in the box), and grade with throwWhenUnavailable so a refusal lets go
 *     of the claim instead of recording "not graded";
 *   - ai-analyze never falls back on a refusal and answers 503;
 *     trigger-ava-analysis saves nothing then;
 *   - the two pages show one calm line and Try again (src/lib/serviceDelay.ts,
 *     ServiceDelayNotice) and check it before the turn_not_saved resend.
 *
 * Static text checks; the behaviour is proved by scripts/ai_unavailable.test.mjs
 * and the "When the AI service refuses" section of
 * scripts/assessment_session_server.pglite.test.mjs.
 */

function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((line) => line.replace(/(^|[^:"'`])\/\/.*$/, "$1")).join("\n");
}

const OPENAI = "supabase/functions/_shared/openai.ts";
const STREAM = "supabase/functions/_shared/openaiStreaming.ts";
const CHAT = "supabase/functions/ai-chat-simulation/index.ts";
const INTERVIEW = "supabase/functions/ai-chat-interview/index.ts";
const ANALYZE = "supabase/functions/ai-analyze/index.ts";
const TRIGGER = "supabase/functions/trigger-ava-analysis/index.ts";
const CHAT_PAGE = "src/pages/ChatSimulationPhase.tsx";
const INTERVIEW_PAGE = "src/pages/ChatInterviewPhase.tsx";
const DELAY = "src/lib/serviceDelay.ts";

/** The text of the first `catch (error) {` block after `from`, up to its matching brace. */
function catchBlockAfter(src, from) {
  const at = src.indexOf("catch (error) {", from);
  if (at < 0) return null;
  let depth = 0;
  for (let i = src.indexOf("{", at); i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(at, i + 1);
    }
  }
  return null;
}

export default [
  {
    id: "ai-outage-out-of-credit-is-never-retried",
    why:
      "A 429 insufficient_quota must be a typed refusal (AiUnavailableError) that is never retried, " +
      "in both the JSON and the streaming helper; otherwise an outage is retried like a busy server and " +
      "every caller treats it as an ordinary failure again.",
    run: async ({ read }) => {
      const bad = [];
      const openai = await read(OPENAI);
      const stream = await read(STREAM);
      if (!openai || !stream) return { ok: false, detail: ["shared OpenAI helpers are missing"] };
      const o = code(openai);
      if (!/export class AiUnavailableError/.test(o)) bad.push(`${OPENAI}: AiUnavailableError is gone`);
      if (!/insufficient_quota/.test(o) || !/retry:\s*false,\s*unavailable:\s*"credit_exhausted"/.test(o)) {
        bad.push(`${OPENAI}: out of credit must classify as { retry: false, unavailable: "credit_exhausted" }`);
      }
      if (!/classifyOpenAIHttpFailure\(response\.status/.test(o)) bad.push(`${OPENAI}: callOpenAIChat no longer classifies its HTTP failures`);
      if (!/throwWhenUnavailable/.test(o)) bad.push(`${OPENAI}: callOpenAIJson lost throwWhenUnavailable`);
      const st = code(stream);
      if (!/classifyOpenAIHttpFailure\(response\.status/.test(st) || !/new AiUnavailableError\(/.test(st)) {
        bad.push(`${STREAM}: the streaming helper no longer throws AiUnavailableError on a refusal`);
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "ai-outage-never-finishes-a-test-as-not-graded",
    why:
      "When the AI service refuses at the end of the chat practice or the interview, the attempt must stay " +
      "open (claim released, 503 ai_unavailable), never recorded as finished and not graded; and a new " +
      "message must not be stored before the model takes it.",
    run: async ({ read }) => {
      const bad = [];
      for (const file of [CHAT, INTERVIEW]) {
        const src = await read(file);
        if (src == null) {
          bad.push(`${file} is missing`);
          continue;
        }
        const c = code(src);
        if (!/throwWhenUnavailable:\s*true/.test(c)) bad.push(`${file}: the grading call must pass throwWhenUnavailable: true`);
        const gradeAt = c.indexOf("callOpenAIJson(");
        const block = gradeAt >= 0 ? catchBlockAfter(c, gradeAt) : null;
        if (!block) bad.push(`${file}: cannot find the grading call's catch`);
        else {
          const unavailableAt = block.indexOf("isAiUnavailable(error)");
          const failAt = block.indexOf("failSession(");
          if (unavailableAt < 0 || !/refuseGradingForOutage\(/.test(block) || !/aiUnavailableResponse\(/.test(block)) {
            bad.push(`${file}: the grading catch must answer a refusal with refuseGradingForOutage + aiUnavailableResponse`);
          } else if (failAt >= 0 && failAt < unavailableAt) {
            bad.push(`${file}: a refusal must be handled BEFORE failSession (a failed attempt is "owed", not open)`);
          }
        }
        if (!/candidateTurnStatus\(/.test(c) || !/holdCandidateTurn\(/.test(c) || !/storeHeldCandidateTurn\(/.test(c)) {
          bad.push(`${file}: a new message must be held (holdCandidateTurn) and stored only once the model takes it (storeHeldCandidateTurn)`);
        }
        if (!/afterReplyAskFailed\(/.test(c)) bad.push(`${file}: a failed reply ask must go through afterReplyAskFailed`);
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "ai-outage-saves-no-degraded-score",
    why:
      "ai-analyze must not fall back to a narrative or text-only read when the AI service refuses, and " +
      "trigger-ava-analysis must save nothing then: a degraded score made during an outage was saved and reused. " +
      "A timeout alone still falls back (refusesFallback): the narrative read exists for a structured read that " +
      "runs out of time, and a model that is merely slow must not leave applicants unscored.",
    run: async ({ read }) => {
      const bad = [];
      const analyze = await read(ANALYZE);
      const trigger = await read(TRIGGER);
      if (!analyze || !trigger) return { ok: false, detail: ["ai-analyze or trigger-ava-analysis is missing"] };
      const a = code(analyze);
      if (!/if \(refusesFallback\(structuredError\)\) throw structuredError/.test(a)) bad.push(`${ANALYZE}: a refusal must not fall back to the narrative read`);
      if (!/!refusesFallback\(visionError\)/.test(a)) bad.push(`${ANALYZE}: a refusal must not retry text-only`);
      // Every refusal but a timeout: out of credit, rate limited, down, refused, unreachable.
      if (!/function refusesFallback\(error: unknown\): boolean \{\s*return isAiUnavailable\(error\) && error\.reason !== "provider_timeout";\s*\}/.test(a)) {
        bad.push(`${ANALYZE}: refusesFallback must cover every refusal except a timeout, and nothing else`);
      }
      if (!/aiUnavailableResponse\(/.test(a)) bad.push(`${ANALYZE}: a refusal must answer 503 ai_unavailable`);
      if (!/analyzeRefusedByService\(analysisError\)/.test(code(trigger))) bad.push(`${TRIGGER}: a refused analysis must be recognised and save nothing`);
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "ai-outage-candidate-pages-stay-calm",
    why:
      "The chat practice and the interview must recognise 503 ai_unavailable before the turn_not_saved resend " +
      "and show the one calm line with Try again; that line never names AI, a model or a machine.",
    run: async ({ read }) => {
      const bad = [];
      const delay = await read(DELAY);
      if (!delay) return { ok: false, detail: [`${DELAY} is missing`] };
      const line = delay.match(/SERVICE_DELAY_LINE\s*=\s*\n?\s*"([^"]+)"/)?.[1] ?? "";
      if (!line) bad.push(`${DELAY}: SERVICE_DELAY_LINE is gone`);
      if (/\bAI\b|openai|\bmodel\b|\bbot\b|machine|automat|credit|quota/i.test(line)) bad.push(`${DELAY}: the applicant's line names the service: "${line}"`);
      for (const file of [CHAT_PAGE, INTERVIEW_PAGE]) {
        const src = await read(file);
        if (!src) {
          bad.push(`${file} is missing`);
          continue;
        }
        const c = code(src);
        const delayAt = c.indexOf("isServiceDelay(response.status");
        const notSavedAt = c.indexOf("isTurnNotSaved(response.status");
        if (delayAt < 0) bad.push(`${file}: a reply's 503 ai_unavailable is not recognised`);
        else if (notSavedAt >= 0 && notSavedAt < delayAt) bad.push(`${file}: isServiceDelay must be checked before isTurnNotSaved`);
        if (!/isServiceDelay\((evalResponse|submitResponse)\.status/.test(c)) bad.push(`${file}: a refused send is not recognised`);
        if (!/<ServiceDelayNotice/.test(c)) bad.push(`${file}: the calm line (ServiceDelayNotice) is not shown`);
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
];
