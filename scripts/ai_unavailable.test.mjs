#!/usr/bin/env node
/**
 * When the AI service refuses (2026-10-07). From 00:36 UTC that night the
 * OpenAI account answered every call with 429 insufficient_quota /
 * credit_balance_exhausted; the helpers retried it like a busy server, the
 * chat functions stored every applicant message and then met it with
 * silence, and every send closed the test as "not graded". This file runs
 * the REAL modules (Node strips the types; the page helpers are bundled with
 * esbuild as in scripts/assessment_session_client.test.mjs) with a stubbed
 * fetch, and proves:
 *
 *   - classification: out of credit (the exact production body) is a
 *     refusal that is never retried; a rate limit and a 5xx are retried and
 *     then a refusal; an invalid key, a forbidden account and a retired
 *     model (401, 403, 404) are a refusal, never retried (our side is broken
 *     for everyone); a bad request (400, 422, any other 4xx) is an ordinary
 *     error; no answer at all after the retries is a refusal, and so is no
 *     answer in time (our own timeout, after the retries);
 *   - callOpenAIChat / callOpenAIJson / streamOpenAIChatCompletion follow
 *     it: one request for out of credit, no JSON retry after a refusal, a
 *     fallback still answers an outage unless the caller asks
 *     (throwWhenUnavailable, the chat grading), and the error message keeps
 *     the "OpenAI error <status>:" shape openAIErrorStatus reads;
 *   - the streamed call waits a bounded time for the response HEADERS only
 *     (headerTimeoutMs, 20 s by default): a provider that never answers is a
 *     refusal after the tries, and a reply that has started streaming is
 *     never cut off by that timer, however long its body takes;
 *   - the 503 the pages get: `ai_unavailable`, Retry-After 120, one calm
 *     sentence that never names AI, a model or a machine, the same sentence
 *     the pages carry (src/lib/serviceDelay.ts);
 *   - the pages: isServiceDelay recognises it, and a page still on the
 *     previous build reads the same answer as "not saved" (it gives the text
 *     back to the box) for a message, and as an ordinary error for a send;
 *   - the reply time the chat practice measures takes off the time the
 *     server held a new reply while the model took it (typing.ts).
 *
 * The no-finish-on-outage rule against a real database is in
 * scripts/assessment_session_server.pglite.test.mjs ("When the AI service
 * refuses"); the source-level wiring is guarded by
 * scripts/guards/ai-outage-keeps-tests-open.mjs.
 *
 * Run with: node scripts/ai_unavailable.test.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import * as O from "../supabase/functions/_shared/openai.ts";
import { DEFAULT_HEADER_TIMEOUT_MS, streamOpenAIChatCompletion } from "../supabase/functions/_shared/openaiStreaming.ts";
import { replyTypingRows, modelWaitMs } from "../supabase/functions/ai-chat-simulation/typing.ts";
import { SERVICE_DELAY_LINE, ServiceDelayError, isServiceDelay } from "../src/lib/serviceDelay.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

// The body OpenAI sent on 2026-10-07 (function logs, ai-analyze 00:36:09).
const QUOTA_BODY = JSON.stringify({
  error: {
    message: "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.",
    type: "insufficient_quota",
    param: null,
    code: "credit_balance_exhausted",
  },
});
const RATE_BODY = JSON.stringify({
  error: { message: "Rate limit reached for gpt-5.6-luna on tokens per min (TPM).", type: "tokens", param: null, code: "rate_limit_exceeded" },
});

/** Replaces fetch with a script of answers; returns the call count. */
function stubFetch(answers) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const next = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (next.throws) throw next.throws;
    if (next.hangs) return hang(init);
    if (next.respond) return next.respond(init);
    return new Response(next.body ?? "", { status: next.status, headers: { "Content-Type": "application/json" } });
  };
  return calls;
}
const okChat = (content) => ({ status: 200, body: JSON.stringify({ choices: [{ message: { content } }] }) });

/** A provider that takes the connection and never answers: only the caller's own abort ends it, the way fetch ends it. */
function hang(init) {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")), { once: true });
  });
}

/**
 * Headers at once, then a body that takes `bodyMs`. As with fetch, the body
 * breaks if the request's signal is ever aborted, so a timer that outlived
 * the headers would show up as a broken reply.
 */
function slowBody(parts, bodyMs) {
  return (init) =>
    new Response(
      new ReadableStream({
        async start(controller) {
          let broken = false;
          init?.signal?.addEventListener("abort", () => {
            broken = true;
            controller.error(new DOMException("The operation was aborted.", "AbortError"));
          }, { once: true });
          for (const part of parts) {
            await new Promise((resolve) => setTimeout(resolve, bodyMs / parts.length));
            if (broken) return;
            controller.enqueue(new TextEncoder().encode(part));
          }
          controller.close();
        },
      }),
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );
}

async function caught(fn) {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}

const realFetch = globalThis.fetch;

async function main() {
  // =========================================================================
  console.log("Classification:\n");

  check("the production 429 body is out of credit", O.isQuotaExhausted(QUOTA_BODY));
  check("a rate-limit 429 is not", !O.isQuotaExhausted(RATE_BODY));
  check("a plain-text body naming insufficient_quota is", O.isQuotaExhausted("insufficient_quota: billing"));
  const quota = O.classifyOpenAIHttpFailure(429, QUOTA_BODY);
  check("429 out of credit: a refusal, never retried", quota.retry === false && quota.unavailable === "credit_exhausted", JSON.stringify(quota));
  const rate = O.classifyOpenAIHttpFailure(429, RATE_BODY);
  check("429 rate limit: retried, then a refusal", rate.retry === true && rate.unavailable === "rate_limited", JSON.stringify(rate));
  for (const status of [500, 502, 503, 504]) {
    const f = O.classifyOpenAIHttpFailure(status, "upstream");
    check(`${status}: retried, then a refusal`, f.retry === true && f.unavailable === "provider_error");
  }
  // An invalid key, a forbidden account, a retired model: our side is broken
  // for every applicant, so it is a refusal (their tests stay open), and no
  // retry can help. Until 2026-10-07 (second pass) these were ordinary
  // errors: the chat was then recorded as finished and not graded.
  for (const status of [401, 403, 404]) {
    const f = O.classifyOpenAIHttpFailure(status, "{}");
    check(`${status}: a refusal (provider_refused), never retried`, f.retry === false && f.unavailable === "provider_refused", JSON.stringify(f));
  }
  // A bad request is that request's own fault: calling it an outage would
  // leave one applicant waiting forever.
  for (const status of [400, 402, 405, 413, 422]) {
    const f = O.classifyOpenAIHttpFailure(status, "{}");
    check(`${status}: an ordinary error, not retried`, f.retry === false && f.unavailable === null, JSON.stringify(f));
  }
  check("408 is retried and stays ordinary", O.classifyOpenAIHttpFailure(408, "").retry && O.classifyOpenAIHttpFailure(408, "").unavailable === null);
  const named = { name: "AiUnavailableError", reason: "credit_exhausted", message: "x" };
  check("isAiUnavailable: by class, and by name across module copies", O.isAiUnavailable(new O.AiUnavailableError("rate_limited", "m", 429)) && O.isAiUnavailable(named) && !O.isAiUnavailable(new Error("OpenAI error 429: x")) && !O.isAiUnavailable(null));

  // =========================================================================
  console.log("\ncallOpenAIChat:\n");

  let calls = stubFetch([{ status: 429, body: QUOTA_BODY }]);
  let error = await caught(() => O.callOpenAIChat({ apiKey: "k", model: "gpt-5.6-luna", messages: [{ role: "user", content: "hi" }] }));
  check("out of credit: ONE request (it used to be three)", calls.length === 1, String(calls.length));
  check("…an AiUnavailableError, reason credit_exhausted, status 429", O.isAiUnavailable(error) && error.reason === "credit_exhausted" && error.status === 429);
  check("…its message keeps the shape openAIErrorStatus reads", O.openAIErrorStatus(error) === 429 && error.message.startsWith("OpenAI error 429: "));
  check("…and an Error, for callers that only log it", error instanceof Error && error.retryAfterSeconds === 120);

  calls = stubFetch([{ status: 429, body: RATE_BODY }]);
  error = await caught(() => O.callOpenAIChat({ apiKey: "k", model: "m", messages: [], retries: 3 }));
  check("a rate limit: retried to the limit (3), then rate_limited", calls.length === 3 && O.isAiUnavailable(error) && error.reason === "rate_limited", String(calls.length));

  calls = stubFetch([{ status: 503, body: "busy" }, okChat("hello")]);
  const recovered = await O.callOpenAIChat({ apiKey: "k", model: "m", messages: [], retries: 3 });
  check("a 5xx that clears on the retry: answered as before", recovered.content === "hello" && calls.length === 2);

  calls = stubFetch([{ status: 500, body: "boom" }]);
  error = await caught(() => O.callOpenAIChat({ apiKey: "k", model: "m", messages: [], retries: 2 }));
  check("a 5xx to the end: provider_error", O.isAiUnavailable(error) && error.reason === "provider_error" && calls.length === 2);

  calls = stubFetch([{ status: 400, body: JSON.stringify({ error: { message: "bad", code: "invalid_request_error" } }) }]);
  error = await caught(() => O.callOpenAIChat({ apiKey: "k", model: "m", messages: [] }));
  check("a bad request: a plain Error, one request, not a refusal", error instanceof Error && !O.isAiUnavailable(error) && calls.length === 1 && O.openAIErrorStatus(error) === 400);

  calls = stubFetch([{ throws: new TypeError("error sending request: connection refused") }]);
  error = await caught(() => O.callOpenAIChat({ apiKey: "k", model: "m", messages: [], retries: 2 }));
  check("no answer at all, after the retries: provider_unreachable", O.isAiUnavailable(error) && error.reason === "provider_unreachable" && calls.length === 2);

  for (const [status, body] of [
    [401, JSON.stringify({ error: { message: "Incorrect API key provided", type: "invalid_request_error", code: "invalid_api_key" } })],
    [403, JSON.stringify({ error: { message: "Country, region, or territory not supported", type: "request_forbidden" } })],
    [404, JSON.stringify({ error: { message: "The model `gpt-5.6-luna` does not exist", type: "invalid_request_error", code: "model_not_found" } })],
  ]) {
    calls = stubFetch([{ status, body }]);
    error = await caught(() => O.callOpenAIChat({ apiKey: "k", model: "m", messages: [], retries: 3 }));
    check(
      `${status}: ONE request, an AiUnavailableError (provider_refused) that keeps its status and message shape`,
      calls.length === 1 && O.isAiUnavailable(error) && error.reason === "provider_refused" && error.status === status && O.openAIErrorStatus(error) === status,
      `${calls.length} ${error?.reason}`,
    );
  }

  // Our own per-try timeout (the caller's AbortController), with a provider
  // that takes the connection and never answers.
  calls = stubFetch([{ hangs: true }]);
  error = await caught(() => O.callOpenAIChat({ apiKey: "k", model: "m", messages: [], retries: 2, timeoutMs: 30 }));
  check("no answer in time, after the retries: provider_timeout (it was the raw AbortError, an ordinary error)", O.isAiUnavailable(error) && error.reason === "provider_timeout" && error.status === null, `${error?.name} ${error?.reason}`);
  check("…the retry count is unchanged (2 tries), and each try was cut off by its own timer", calls.length === 2 && calls.every((c) => c.init.signal.aborted === true), String(calls.length));
  check("…its message says how long it waited and carries no HTTP status", /no answer within 30 ms/.test(error.message) && O.openAIErrorStatus(error) === null, error?.message);

  calls = stubFetch([{ hangs: true }, okChat("late but there")]);
  const afterTimeout = await O.callOpenAIChat({ apiKey: "k", model: "m", messages: [], retries: 2, timeoutMs: 30 });
  check("a timeout that clears on the retry: answered as before", afterTimeout.content === "late but there" && calls.length === 2);

  // =========================================================================
  console.log("\ncallOpenAIJson:\n");

  let fellBack = 0;
  calls = stubFetch([{ status: 429, body: QUOTA_BODY }]);
  const answered = await O.callOpenAIJson({ apiKey: "k", model: "m", messages: [], fallback: () => { fellBack += 1; return { stand_in: true }; } });
  check("out of credit with a fallback (job writing, shortlist): the fallback, after ONE request", answered.data?.stand_in === true && fellBack === 1 && calls.length === 1, String(calls.length));

  fellBack = 0;
  calls = stubFetch([{ status: 429, body: QUOTA_BODY }]);
  error = await caught(() => O.callOpenAIJson({ apiKey: "k", model: "m", messages: [], fallback: () => { fellBack += 1; return null; }, throwWhenUnavailable: true }));
  check("throwWhenUnavailable (the chat grading): the refusal is thrown, the fallback never runs", O.isAiUnavailable(error) && fellBack === 0 && calls.length === 1);

  calls = stubFetch([{ status: 429, body: QUOTA_BODY }]);
  error = await caught(() => O.callOpenAIJson({ apiKey: "k", model: "m", messages: [] }));
  check("no fallback: the refusal is thrown, no JSON retry", O.isAiUnavailable(error) && calls.length === 1);

  fellBack = 0;
  calls = stubFetch([okChat("not json at all"), okChat("still not json")]);
  const unread = await O.callOpenAIJson({ apiKey: "k", model: "m", messages: [], fallback: () => { fellBack += 1; return null; }, throwWhenUnavailable: true });
  check("an unreadable answer is unchanged: retried once, then the fallback (that is 'not graded', not an outage)", unread.data === null && fellBack === 1 && calls.length === 2);

  // The two failures that still closed a test as "not graded" after the
  // first pass: a key the provider refuses, and a provider that hangs.
  fellBack = 0;
  calls = stubFetch([{ status: 401, body: JSON.stringify({ error: { message: "Incorrect API key provided", code: "invalid_api_key" } }) }]);
  error = await caught(() => O.callOpenAIJson({ apiKey: "k", model: "m", messages: [], fallback: () => { fellBack += 1; return null; }, throwWhenUnavailable: true }));
  check("a refused key with throwWhenUnavailable (the chat grading): thrown, the fallback never runs, ONE request", O.isAiUnavailable(error) && error.reason === "provider_refused" && fellBack === 0 && calls.length === 1, `${calls.length} ${fellBack}`);

  fellBack = 0;
  calls = stubFetch([{ hangs: true }]);
  error = await caught(() => O.callOpenAIJson({ apiKey: "k", model: "m", messages: [], timeoutMs: 20, fallback: () => { fellBack += 1; return null; }, throwWhenUnavailable: true }));
  check("every try timing out with throwWhenUnavailable: thrown as provider_timeout, the fallback never runs", O.isAiUnavailable(error) && error.reason === "provider_timeout" && fellBack === 0, `${error?.name} ${error?.reason} ${fellBack}`);
  check("…after the helper's own 3 HTTP tries, with no second JSON round (it was 6 tries, then the fallback)", calls.length === 3, String(calls.length));

  fellBack = 0;
  calls = stubFetch([{ status: 400, body: JSON.stringify({ error: { message: "context_length_exceeded", code: "context_length_exceeded" } }) }]);
  const badRequest = await O.callOpenAIJson({ apiKey: "k", model: "m", messages: [], fallback: () => { fellBack += 1; return null; }, throwWhenUnavailable: true });
  check("a bad request is still not an outage: the fallback answers it (one applicant is not left waiting forever)", badRequest.data === null && fellBack === 1 && calls.length === 2, `${calls.length} ${fellBack}`);

  // =========================================================================
  console.log("\nstreamOpenAIChatCompletion:\n");

  const streamArgs = { apiKey: "k", model: "gpt-5.6-luna", messages: [{ role: "user", content: "hi" }], pauseMs: () => 0 };
  calls = stubFetch([{ status: 429, body: QUOTA_BODY }]);
  error = await caught(() => streamOpenAIChatCompletion(streamArgs));
  check("out of credit: one request, credit_exhausted", calls.length === 1 && O.isAiUnavailable(error) && error.reason === "credit_exhausted");
  check("…message shape unchanged", error.message.startsWith("OpenAI stream error 429: "));

  calls = stubFetch([{ status: 503, body: "busy" }]);
  error = await caught(() => streamOpenAIChatCompletion(streamArgs));
  check("a 5xx twice: asked twice, then provider_error", calls.length === 2 && O.isAiUnavailable(error) && error.reason === "provider_error");

  calls = stubFetch([{ status: 502, body: "bad gateway" }, { status: 200, body: "data: {}\n\n" }]);
  const opened = await caught(async () => {
    const r = await streamOpenAIChatCompletion(streamArgs);
    if (!r.ok || !r.body) throw new Error("no stream");
  });
  check("a 5xx that clears: the stream opens", opened === null && calls.length === 2);

  calls = stubFetch([{ status: 400, body: "bad" }]);
  error = await caught(() => streamOpenAIChatCompletion(streamArgs));
  check("a bad request: a plain Error, one request", error instanceof Error && !O.isAiUnavailable(error) && calls.length === 1);

  calls = stubFetch([{ throws: new TypeError("connection reset") }]);
  error = await caught(() => streamOpenAIChatCompletion(streamArgs));
  check("no answer twice: provider_unreachable", O.isAiUnavailable(error) && error.reason === "provider_unreachable" && calls.length === 2);

  for (const status of [401, 403, 404]) {
    calls = stubFetch([{ status, body: JSON.stringify({ error: { message: "refused", code: "x" } }) }]);
    error = await caught(() => streamOpenAIChatCompletion(streamArgs));
    check(`${status}: one request, provider_refused (the message is held back, never stored into silence)`, calls.length === 1 && O.isAiUnavailable(error) && error.reason === "provider_refused" && error.message.startsWith(`OpenAI stream error ${status}: `), `${calls.length} ${error?.reason}`);
  }

  // The wait for the response HEADERS is bounded (20 s by default): the chat
  // functions hold a new message unstored until the model takes it, so a
  // provider that never answers must end as a refusal, not as a request that
  // dies with the message on screen and off the record.
  check("the default wait for the headers is 20 s", DEFAULT_HEADER_TIMEOUT_MS === 20_000);
  calls = stubFetch([{ hangs: true }]);
  let startedAt = Date.now();
  error = await caught(() => streamOpenAIChatCompletion({ ...streamArgs, headerTimeoutMs: 40 }));
  check("a provider that never answers: both tries cut off, then provider_timeout", calls.length === 2 && O.isAiUnavailable(error) && error.reason === "provider_timeout" && error.status === null && calls.every((c) => c.init.signal.aborted === true), `${calls.length} ${error?.name} ${error?.reason}`);
  check("…in about two waits, and it says how long each was", Date.now() - startedAt < 1500 && /no answer within 40 ms/.test(error.message), `${Date.now() - startedAt} ms ${error?.message}`);

  calls = stubFetch([{ hangs: true }, { status: 200, body: "data: {}\n\n" }]);
  const openedLate = await caught(async () => {
    const r = await streamOpenAIChatCompletion({ ...streamArgs, headerTimeoutMs: 40 });
    if (!r.ok || !r.body) throw new Error("no stream");
  });
  check("no answer in time once, then an answer: the stream opens on the second try", openedLate === null && calls.length === 2);

  calls = stubFetch([{ hangs: true }]);
  error = await caught(() => streamOpenAIChatCompletion({ ...streamArgs, headerTimeoutMs: 40, attempts: 1 }));
  check("one try only: one request, provider_timeout", calls.length === 1 && O.isAiUnavailable(error) && error.reason === "provider_timeout");

  // Headers in time, then a body four times longer than the header wait: the
  // timer is off once the headers are in, so the reply arrives whole.
  const part = (text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
  calls = stubFetch([{ respond: slowBody([part("Hello, "), part("my deposit "), part("is missing."), "data: [DONE]\n\n"], 240) }]);
  const slow = await streamOpenAIChatCompletion({ ...streamArgs, headerTimeoutMs: 60 });
  const slowText = await caught(async () => {
    const text = await slow.text();
    if (!text.includes("is missing.") || !text.includes("[DONE]")) throw new Error(`cut off: ${text.length} characters`);
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  check("a reply whose body outlasts the header wait is never cut off by it", slowText === null && calls.length === 1 && calls[0].init.signal.aborted === false, `${slowText?.message ?? ""} aborted=${calls[0]?.init.signal.aborted}`);

  globalThis.fetch = realFetch;

  // =========================================================================
  console.log("\nWhat the pages get:\n");

  const response = O.aiUnavailableResponse({ "Access-Control-Allow-Origin": "*" }, { turnSaved: false });
  const body = await response.json();
  check("503 with Retry-After 120 and CORS", response.status === 503 && response.headers.get("Retry-After") === "120" && response.headers.get("Access-Control-Allow-Origin") === "*");
  check("body: ai_unavailable, retryable, retryAfterSeconds, turnSaved", body.error === "ai_unavailable" && body.code === "ai_unavailable" && body.retryable === true && body.retryAfterSeconds === 120 && body.turnSaved === false);
  check("the server's sentence is the pages' sentence", body.message === SERVICE_DELAY_LINE && O.AI_UNAVAILABLE_MESSAGE === SERVICE_DELAY_LINE);
  check(
    "it says a short delay on our side and that the answers are saved",
    /short delay on our side/.test(SERVICE_DELAY_LINE) && /answers are saved/i.test(SERVICE_DELAY_LINE) && /couple of minutes/.test(SERVICE_DELAY_LINE),
  );
  check(
    "it never names AI, OpenAI, a model, a bot or a machine",
    !/\bAI\b|openai|\bmodel\b|\bbot\b|machine|automat|credit|quota/i.test(SERVICE_DELAY_LINE),
    SERVICE_DELAY_LINE,
  );

  check("isServiceDelay: the server's 503", isServiceDelay(503, body));
  check("…not a turn_not_saved 503, not a 500, not a 409", !isServiceDelay(503, { code: "turn_not_saved", retryable: true }) && !isServiceDelay(500, body) && !isServiceDelay(409, { code: "already_checking" }));
  check("ServiceDelayError carries turnSaved", new ServiceDelayError({ ...body, turnSaved: true }).turnSaved === true && new ServiceDelayError(body).turnSaved === false && new ServiceDelayError(null).turnSaved === false);

  // A page on the previous build (src/hooks/useAssessmentSession.ts, bundled
  // as scripts/assessment_session_client.test.mjs does).
  const bundle = await build({
    stdin: { contents: 'export { isTurnNotSaved, gradingReplyOutcome } from "./src/hooks/useAssessmentSession.ts";\n', resolveDir: ROOT, loader: "ts" },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
    plugins: [
      {
        name: "stub-aliases",
        setup(b) {
          b.onResolve({ filter: /^(@\/|sonner$)/ }, (args) => {
            if (args.path === "@/components/candidate/continueOnComputerContext") {
              return { path: path.join(ROOT, "src/components/candidate/continueOnComputerContext.ts") };
            }
            return { path: args.path, namespace: "stub" };
          });
          b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
            contents:
              args.path === "sonner"
                ? "export const toast = { warning() {}, info() {}, error() {}, success() {} };"
                : 'export const supabase = {};\nexport const SUPABASE_URL = "https://example.supabase.co";\nexport const SUPABASE_PUBLISHABLE_KEY = "k";\n',
            loader: "js",
          }));
        },
      },
    ],
  });
  const page = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
  check("a page on the previous build reads it as 'not saved': it sends once more, then gives the text back to the box", page.isTurnNotSaved(503, body));
  check("…and a refused send as an ordinary error (it stays on the chat, nothing finished)", page.gradingReplyOutcome(503, body) === "error");

  // =========================================================================
  console.log("\nReply time (typing.ts):\n");

  const t0 = Date.parse("2026-10-07T03:00:00.000Z");
  const at = (ms) => new Date(t0 + ms).toISOString();
  const turns = [
    { kind: "assistant_turn", content: "My deposit is missing.", created_at: at(0), detail: {} },
    { kind: "candidate_turn", content: "Let me check that for you right away.", created_at: at(32_500), detail: { model_wait_ms: 2_500 } },
    { kind: "assistant_turn", content: "Thanks.", created_at: at(40_000), detail: {} },
    { kind: "candidate_turn", content: "It is credited now, please check.", created_at: at(70_000), detail: {} },
    { kind: "assistant_turn", content: "OK.", created_at: at(80_000), detail: {} },
    { kind: "candidate_turn", content: "Anything else I can help with?", created_at: at(90_000), detail: { model_wait_ms: "9000" } },
  ];
  const rows = replyTypingRows(turns);
  check("a reply held 2.5 s while the model took it: timed as 30 s, not 32.5 s", rows[0].replySeconds === 30, String(rows[0].replySeconds));
  check("a reply stored at once: unchanged (30 s)", rows[1].replySeconds === 30, String(rows[1].replySeconds));
  check("a wait that is not a number is ignored (10 s)", rows[2].replySeconds === 10, String(rows[2].replySeconds));
  check("modelWaitMs: capped at 120 s, never negative", modelWaitMs({ model_wait_ms: 999_999 }) === 120_000 && modelWaitMs({ model_wait_ms: -5 }) === 0 && modelWaitMs({}) === 0);

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
