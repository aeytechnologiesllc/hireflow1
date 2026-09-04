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
}

const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number) {
  const base = 400 * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(base + jitter, 4000);
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
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
        if (isRetryableStatus(response.status) && attempt < retries) {
          console.warn(`[openai] retryable HTTP error on attempt ${attempt}/${retries}:`, message);
          await sleep(backoffDelay(attempt));
          continue;
        }
        throw new Error(message);
      }

      const raw = (await response.json()) as Record<string, unknown>;
      const content = (raw as any)?.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new Error("OpenAI response did not include message content");
      }

      return { content, raw };
    } catch (error) {
      lastError = error;
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      const retryable = isAbort || error instanceof TypeError;
      if (retryable && attempt < retries) {
        console.warn(`[openai] retryable network error on attempt ${attempt}/${retries}:`, error);
        await sleep(backoffDelay(attempt));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("OpenAI request failed");
}

export async function callOpenAIJson<T>(options: OpenAIJsonOptions<T>): Promise<{ data: T; rawContent: string; raw: Record<string, unknown> }> {
  const { validator, fallback, retries = 2, ...chatOptions } = options;
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
    let current: any = value;
    for (const part of parts) {
      if (current == null || !Object.prototype.hasOwnProperty.call(current, part)) {
        return `Missing required path: ${path}`;
      }
      current = current[part];
    }
  }

  return null;
}

