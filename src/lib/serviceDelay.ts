/**
 * When our side cannot answer a test right now (2026-10-07).
 *
 * The chat practice and the written interview need the AI service for every
 * reply and for the check at the end. When it refuses (out of credit, rate
 * limited, down), ai-chat-simulation and ai-chat-interview answer
 * **503 `{ error: "ai_unavailable", code: "ai_unavailable", retryable: true,
 * retryAfterSeconds, turnSaved? }`** (supabase/functions/_shared/openai.ts
 * aiUnavailableBody) and keep NOTHING of the failed step:
 *
 *   - a new message is not stored, so the page takes its bubble back off and
 *     puts the text back in the reply box (`turnSaved: false`);
 *   - a message already on the record (a reload asking for its reply again)
 *     stays where it is (`turnSaved: true`);
 *   - a send at the end is not recorded as finished: the attempt stays open
 *     with everything the applicant wrote.
 *
 * The page then shows ONE calm line and a Try again button, never a toast,
 * never a raw error, and never a word about AI, a model or a machine: from
 * the applicant's side this is simply a short delay on ours.
 *
 * The body is also `retryable: true` on purpose: a page still on the
 * previous build reads that as "your message was not saved", sends it once
 * more, then gives the text back to the box. So `isServiceDelay` must be
 * checked BEFORE `isTurnNotSaved` (src/hooks/useAssessmentSession.ts).
 *
 * Import-free, so plain Node runs it for scripts/ai_unavailable.test.mjs.
 */

/** The one line an applicant sees while our side cannot answer. */
export const SERVICE_DELAY_LINE =
  "We're having a short delay on our side. Your answers are saved. Please try again in a couple of minutes.";

/** The test function's answer while the AI service refuses. */
export function isServiceDelay(status: number, body: unknown): boolean {
  if (status !== 503 || !body || typeof body !== "object") return false;
  const reply = body as Record<string, unknown>;
  return reply.code === "ai_unavailable" || reply.error === "ai_unavailable";
}

/** Thrown inside a page's send when the server answered `ai_unavailable`. */
export class ServiceDelayError extends Error {
  /** The message the page sent is already on the server's record (it stays on screen). */
  readonly turnSaved: boolean;

  constructor(body: unknown) {
    super("ai_unavailable");
    this.name = "ServiceDelayError";
    this.turnSaved = !!body && typeof body === "object" && (body as Record<string, unknown>).turnSaved === true;
  }
}
