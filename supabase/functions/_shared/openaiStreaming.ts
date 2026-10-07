import { AiUnavailableError, classifyOpenAIHttpFailure, modelSupportsTemperature } from "./openai.ts";
import type { OpenAIMessage } from "./openai.ts";

const OPENAI_STREAM_ENDPOINT = "https://api.openai.com/v1/chat/completions";

interface StreamOpenAIChatOptions {
  apiKey: string;
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  maxCompletionTokens?: number;
  /**
   * Tries in all for a refusal worth asking again (a rate limit, a 5xx, no
   * answer at all, no answer in time). An applicant is waiting on the other
   * end, so the pause between tries is short. Out of credit and an outright
   * refusal (401, 403, 404) are never asked again.
   */
  attempts?: number;
  /**
   * How long one try waits for OpenAI's response HEADERS (the request being
   * accepted or refused): 20 s by default. Only that wait is timed: once the
   * headers are in, nothing here can cut the reply's body off, however long
   * it streams. Tests shorten it.
   */
  headerTimeoutMs?: number;
  /** For tests: the pause before try `attempt + 1`. */
  pauseMs?: (attempt: number) => number;
}

/**
 * A streamed reply's first byte normally follows the request by a second or
 * two. Past this, the provider is not answering: the chat functions hold a
 * new message unstored until it does (assessmentSession.ts holdCandidateTurn),
 * so the wait has to end and say so.
 */
export const DEFAULT_HEADER_TIMEOUT_MS = 20_000;

function defaultPause(attempt: number): number {
  return Math.min(400 * attempt + Math.floor(Math.random() * 250), 1500);
}

/**
 * Opens a streamed chat completion. Resolves once OpenAI has ACCEPTED the
 * request (2xx with a body); the reply then streams through `response.body`.
 *
 * Throws AiUnavailableError when the service refuses (_shared/openai.ts:
 * credit exhausted or refused outright at once; a rate limit, a 5xx, no
 * answer, or no answer within `headerTimeoutMs`, after `attempts` tries), so
 * the chat functions can keep the applicant's message unsent and answer 503
 * `ai_unavailable` instead of a broken page. Any other failure (a bad
 * request) is a plain Error, as before, with the same
 * "OpenAI stream error <status>: <body>" message.
 */
export async function streamOpenAIChatCompletion(options: StreamOpenAIChatOptions) {
  const {
    apiKey,
    model,
    messages,
    temperature = 0.8,
    maxCompletionTokens = 1200,
    attempts = 2,
    headerTimeoutMs = DEFAULT_HEADER_TIMEOUT_MS,
    pauseMs = defaultPause,
  } = options;
  const tries = Math.max(1, attempts);
  const headerWaitMs = Number.isFinite(headerTimeoutMs) && headerTimeoutMs > 0 ? headerTimeoutMs : DEFAULT_HEADER_TIMEOUT_MS;

  for (let attempt = 1; ; attempt++) {
    let response: Response;
    // Only the wait for the headers is timed. The request's signal stays
    // tied to the reply's body for as long as it streams, so the one thing
    // that can abort it (this timer) is disarmed the moment the headers are
    // in: cleared, and a no-op even if it has already been queued.
    const controller = new AbortController();
    let headersIn = false;
    let timedOut = false;
    const headerTimer = setTimeout(() => {
      if (headersIn) return;
      timedOut = true;
      controller.abort();
    }, headerWaitMs);
    try {
      response = await fetch(OPENAI_STREAM_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          // GPT-5-family models reject any non-default temperature (400 unsupported_value).
          ...(modelSupportsTemperature(model) ? { temperature } : {}),
          max_completion_tokens: maxCompletionTokens,
          stream: true,
        }),
        signal: controller.signal,
      });
      headersIn = true;
      clearTimeout(headerTimer);
    } catch (error) {
      clearTimeout(headerTimer);
      // No answer at all (a dropped connection, DNS), or none in time.
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < tries) {
        console.warn(
          `[openai-stream] ${timedOut ? `no answer within ${headerWaitMs} ms` : "no answer"} on attempt ${attempt}/${tries}:`,
          message,
        );
        await new Promise((resolve) => setTimeout(resolve, pauseMs(attempt)));
        continue;
      }
      if (timedOut) {
        throw new AiUnavailableError("provider_timeout", `OpenAI stream timed out: no answer within ${headerWaitMs} ms`, null);
      }
      throw new AiUnavailableError("provider_unreachable", `OpenAI stream unreachable: ${message}`, null);
    }

    if (!response.ok) {
      const errorText = await response.text();
      const message = `OpenAI stream error ${response.status}: ${errorText}`;
      const failure = classifyOpenAIHttpFailure(response.status, errorText);
      if (failure.retry && attempt < tries) {
        console.warn(`[openai-stream] retryable HTTP error on attempt ${attempt}/${tries}:`, message);
        await new Promise((resolve) => setTimeout(resolve, pauseMs(attempt)));
        continue;
      }
      if (failure.unavailable) throw new AiUnavailableError(failure.unavailable, message, response.status);
      throw new Error(message);
    }

    if (!response.body) {
      throw new Error("OpenAI did not return a stream body");
    }

    return response;
  }
}
