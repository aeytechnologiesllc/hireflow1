export type OpenAIMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
      // Chat Completions file input (PDFs). `file_data` is a data URL:
      // "data:application/pdf;base64,…". Images do NOT go through this shape.
      | { type: "file"; file: { filename: string; file_data: string } }
    >;

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "developer";
  content: OpenAIMessageContent;
}

export interface OpenAIChatOptions {
  apiKey: string;
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  maxCompletionTokens?: number;
  responseFormat?: { type: "json_object" };
  endpoint?: string;
  retries?: number;
  timeoutMs?: number;
}

export interface OpenAIChatResult {
  content: string;
  raw: Record<string, unknown>;
}

export interface OpenAIJsonOptions<T> extends OpenAIChatOptions {
  validator?: (value: unknown) => string | null;
  fallback?: () => T;
  /**
   * When the AI service refuses (AiUnavailableError: credit exhausted, rate
   * limited, refused, down, unreachable or timed out), throw instead of
   * answering with `fallback`.
   * For callers that keep the applicant's work open and ask again later
   * (the chat practice and interview grading) rather than record a fallback
   * as the result. Without it, `fallback` still answers an outage, as before.
   */
  throwWhenUnavailable?: boolean;
}

const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";

// ============================================================================
// When the AI service refuses (2026-10-07)
// ============================================================================
//
// From 2026-10-07 00:36 UTC the OpenAI account answered every call with
// 429 insufficient_quota / credit_balance_exhausted. Each helper treated that
// like a busy server: it retried with backoff (3 HTTP tries x 2 JSON tries),
// then the chat functions recorded the applicant's test as finished and NOT
// graded ("model_failed"). Seventeen applicants wrote an interview nobody
// asked, and their attempts closed with nothing to grade.
//
// A refusal is now its own typed error, AiUnavailableError, so a caller can
// tell "the service is refusing us" from "this request was bad":
//   - credit exhausted (429 insufficient_quota): never retried, it cannot
//     clear within a request;
//   - rate limited (any other 429) and a provider error (5xx): retried as
//     before, a refusal once the retries are spent;
//   - refused outright (401 an invalid key, 403 a forbidden account, 404 a
//     retired model): never retried. It is our side that is broken, and for
//     every applicant alike, so their tests stay open like any other refusal;
//   - unreachable (the request never got an answer, after the retries);
//   - timed out (our own per-try timeout cut every try off, after the
//     retries): no answer came, the same as unreachable.
// Any other 4xx (400, 422, …) stays an ordinary error: that request was bad,
// and calling it an outage would leave one applicant waiting forever.
// Its message keeps the old "OpenAI error <status>: <body>" shape, so
// openAIErrorStatus and every log reader still work.

/** Why the AI service refused, for logs and the record (never shown to an applicant). */
export type AiUnavailableReason =
  | "credit_exhausted"
  | "rate_limited"
  | "provider_error"
  | "provider_refused"
  | "provider_unreachable"
  | "provider_timeout";

/** How long an applicant is asked to wait before trying again ("a couple of minutes"). */
export const AI_UNAVAILABLE_RETRY_AFTER_SECONDS = 120;

/**
 * The one sentence an applicant is shown while the service refuses. The
 * pages carry their own copy (src/lib/serviceDelay.ts); this is for any
 * client that shows the server's message. It never says what the service is.
 */
export const AI_UNAVAILABLE_MESSAGE =
  "We're having a short delay on our side. Your answers are saved. Please try again in a couple of minutes.";

export class AiUnavailableError extends Error {
  readonly reason: AiUnavailableReason;
  /** The provider's HTTP status, or null when no answer came back. */
  readonly status: number | null;
  readonly retryAfterSeconds: number;

  constructor(reason: AiUnavailableReason, message: string, status: number | null) {
    super(message);
    this.name = "AiUnavailableError";
    this.reason = reason;
    this.status = status;
    this.retryAfterSeconds = AI_UNAVAILABLE_RETRY_AFTER_SECONDS;
  }
}

/** True for an AiUnavailableError (by class, or by name across module copies). */
export function isAiUnavailable(error: unknown): error is AiUnavailableError {
  if (error instanceof AiUnavailableError) return true;
  return !!error && typeof error === "object" && (error as { name?: unknown }).name === "AiUnavailableError" &&
    typeof (error as { reason?: unknown }).reason === "string";
}

const QUOTA_CODES = new Set(["insufficient_quota", "credit_balance_exhausted", "billing_hard_limit_reached", "billing_not_active"]);

/**
 * True when a 429 body says the account is out of credit (no retry can
 * help), not that it is sending too fast. OpenAI's own body, 2026-10-07:
 * {"error":{"message":"You have no credits remaining. …","type":"insufficient_quota","code":"credit_balance_exhausted"}}
 */
export function isQuotaExhausted(bodyText: string): boolean {
  try {
    const parsed = JSON.parse(bodyText) as { error?: { type?: unknown; code?: unknown } } | null;
    const error = parsed && typeof parsed === "object" ? parsed.error : null;
    if (error && typeof error === "object") {
      if ([error.type, error.code].some((value) => typeof value === "string" && QUOTA_CODES.has(value))) return true;
    }
  } catch {
    // Not JSON: read the text below.
  }
  return /insufficient_quota|credit_balance_exhausted|billing_hard_limit_reached|billing_not_active/i.test(bodyText);
}

export interface OpenAIHttpFailure {
  /** Worth asking again within this request (after a pause). */
  retry: boolean;
  /** Once no retry is left: the service is refusing (AiUnavailableError), or null for an ordinary error. */
  unavailable: AiUnavailableReason | null;
}

/** Pure: what a non-2xx answer from OpenAI means. */
export function classifyOpenAIHttpFailure(status: number, bodyText: string): OpenAIHttpFailure {
  if (status === 429) {
    return isQuotaExhausted(bodyText)
      ? { retry: false, unavailable: "credit_exhausted" }
      : { retry: true, unavailable: "rate_limited" };
  }
  if (status >= 500) return { retry: true, unavailable: "provider_error" };
  // An invalid key, a forbidden account, a retired model: no retry can help,
  // and it fails every applicant the same way, so it is a refusal.
  if (status === 401 || status === 403 || status === 404) return { retry: false, unavailable: "provider_refused" };
  if (status === 408 || status === 409 || status === 425) return { retry: true, unavailable: null };
  // 400, 422 and any other 4xx: this request was bad. An ordinary error.
  return { retry: false, unavailable: null };
}

/** The HTTP answer an applicant's page gets while the service refuses: 503, never a raw provider error. */
export function aiUnavailableBody(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    error: "ai_unavailable",
    code: "ai_unavailable",
    // A page on the previous build reads a retryable 503 as "your message
    // was not saved": it sends it once more, then puts the text back in the
    // reply box. That is exactly right here: nothing was stored.
    retryable: true,
    retryAfterSeconds: AI_UNAVAILABLE_RETRY_AFTER_SECONDS,
    message: AI_UNAVAILABLE_MESSAGE,
    ...extra,
  };
}

export function aiUnavailableResponse(corsHeaders: Record<string, string>, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify(aiUnavailableBody(extra)), {
    status: 503,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Retry-After": String(AI_UNAVAILABLE_RETRY_AFTER_SECONDS),
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number) {
  const base = 400 * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(base + jitter, 4000);
}

function normalizeJsonText(content: string) {
  const trimmed = content.trim();
  const withoutFences = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  if (withoutFences.startsWith("{") && withoutFences.endsWith("}")) {
    return withoutFences;
  }

  const firstBrace = withoutFences.indexOf("{");
  const lastBrace = withoutFences.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return withoutFences.slice(firstBrace, lastBrace + 1);
  }

  return withoutFences;
}

export function parseJsonContent<T>(content: string): T {
  const normalized = normalizeJsonText(content);
  return JSON.parse(normalized) as T;
}

function validateJson(value: unknown, validator?: (value: unknown) => string | null) {
  if (!validator) return;
  const error = validator(value);
  if (error) {
    throw new Error(error);
  }
}

/**
 * GPT-5-family (and o-series) models accept only the default sampling
 * temperature and return 400 `unsupported_value` for anything else. Older
 * models still honour it. Callers keep passing what they always did; we drop
 * the field where the model would reject it.
 */
export function modelSupportsTemperature(model: string): boolean {
  return !/^(gpt-5|o[1-9])/i.test(model.trim());
}

export async function callOpenAIChat(options: OpenAIChatOptions): Promise<OpenAIChatResult> {
  const {
    apiKey,
    model,
    messages,
    temperature,
    maxCompletionTokens = 2000,
    responseFormat,
    endpoint = DEFAULT_ENDPOINT,
    retries = 3,
    timeoutMs = 60000,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= Math.max(1, retries); attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          ...(temperature !== undefined && modelSupportsTemperature(model) ? { temperature } : {}),
          max_completion_tokens: maxCompletionTokens,
          ...(responseFormat ? { response_format: responseFormat } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        const message = `OpenAI error ${response.status}: ${errorText}`;
        const failure = classifyOpenAIHttpFailure(response.status, errorText);
        if (failure.retry && attempt < retries) {
          console.warn(`[openai] retryable HTTP error on attempt ${attempt}/${retries}:`, message);
          await sleep(backoffDelay(attempt));
          continue;
        }
        // Out of credit and an outright refusal (401, 403, 404) are never
        // retried: neither can clear within a request.
        if (failure.unavailable) throw new AiUnavailableError(failure.unavailable, message, response.status);
        throw new Error(message);
      }

      const raw = (await response.json()) as Record<string, unknown>;
      const content = (raw as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new Error("OpenAI response did not include message content");
      }

      return { content, raw };
    } catch (error) {
      lastError = error;
      if (isAiUnavailable(error)) throw error;
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      const retryable = isAbort || error instanceof TypeError;
      if (retryable && attempt < retries) {
        console.warn(`[openai] retryable network error on attempt ${attempt}/${retries}:`, error);
        await sleep(backoffDelay(attempt));
        continue;
      }
      // The retries are spent and no answer came: the service is refusing us,
      // whether the connection never opened (TypeError) or our own per-try
      // timeout cut every try off (AbortError). A timeout is NOT an ordinary
      // error. While it was one, a provider that hung went through the
      // caller's fallback, and the chat functions recorded the applicant's
      // test as finished and not graded, as on the out-of-credit night.
      if (isAbort) {
        throw new AiUnavailableError("provider_timeout", `OpenAI timed out: no answer within ${timeoutMs} ms`, null);
      }
      if (error instanceof TypeError) {
        throw new AiUnavailableError("provider_unreachable", `OpenAI unreachable: ${error.message}`, null);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("OpenAI request failed");
}

export async function callOpenAIJson<T>(options: OpenAIJsonOptions<T>): Promise<{ data: T; rawContent: string; raw: Record<string, unknown> }> {
  const { validator, fallback, throwWhenUnavailable = false, retries = 2, ...chatOptions } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= Math.max(1, retries); attempt++) {
    try {
      // `retries` above is the JSON parse/validation retry count and is
      // destructured OUT of chatOptions, so the HTTP retry count for each
      // attempt is always the helper default of 3. (This used to read
      // `chatOptions.retries ?? 3`, which was a type error that evaluated to
      // 3 at runtime — same behaviour, now spelled honestly.)
      const result = await callOpenAIChat({
        ...chatOptions,
        responseFormat: { type: "json_object" },
        retries: 3,
      });

      const parsed = parseJsonContent<unknown>(result.content);
      validateJson(parsed, validator);
      return { data: parsed as T, rawContent: result.content, raw: result.raw };
    } catch (error) {
      lastError = error;
      if (isAiUnavailable(error)) {
        // The service refused: asking again for valid JSON cannot help, and
        // callOpenAIChat already spent the retries that could.
        if (fallback && !throwWhenUnavailable) {
          console.warn(`[openai] AI service unavailable (${error.reason}), falling back:`, error.message);
          return { data: fallback(), rawContent: "", raw: {} };
        }
        throw error;
      }
      if (attempt < retries) {
        console.warn(`[openai] JSON parse/validation retry ${attempt}/${retries}:`, error);
        await sleep(backoffDelay(attempt));
        continue;
      }
      if (fallback) {
        console.warn("[openai] falling back after repeated JSON failures:", error);
        return { data: fallback(), rawContent: "", raw: {} };
      }
      throw error;
    }
  }

  if (fallback) {
    return { data: fallback(), rawContent: "", raw: {} };
  }

  throw lastError instanceof Error ? lastError : new Error("OpenAI JSON request failed");
}

/**
 * Recover the HTTP status from an error thrown by callOpenAIChat/callOpenAIJson
 * ("OpenAI error 429: …"). Returns null for anything that isn't an OpenAI HTTP
 * failure (network errors, JSON parse errors, validator errors), so callers can
 * keep mapping 429/402 to their own responses without string-matching inline.
 */
export function openAIErrorStatus(error: unknown): number | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = message.match(/^OpenAI error (\d{3})\b/);
  return match ? Number(match[1]) : null;
}

export function requireJsonKeys(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object") {
    return "Expected a JSON object";
  }

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      return `Missing required key: ${key}`;
    }
  }

  return null;
}

export function requireNestedJsonPaths(value: unknown, paths: string[]) {
  if (!value || typeof value !== "object") {
    return "Expected a JSON object";
  }

  for (const path of paths) {
    const parts = path.split(".");
    let current: unknown = value;
    for (const part of parts) {
      if (current == null || !Object.prototype.hasOwnProperty.call(current, part)) {
        return `Missing required path: ${path}`;
      }
      current = (current as Record<string, unknown>)[part];
    }
  }

  return null;
}

