/**
 * What an applicant's own call to trigger-ava-analysis may read back
 * (2026-10-25; docs/LAUNCH-PLAN.md, Phase 1, task 2).
 *
 * Their pages need the move and nothing else (src/lib/journeyProgress.ts
 * reads decision and nextPhaseId: "Scores in the reply are ignored — a
 * candidate is never shown one"). The score, the scorecard and the judge's
 * notes are the hiring team's; returning them let an applicant read their
 * evaluation and, with force: true, re-run it until it came out higher.
 *
 * Pure apart from Response, so scripts/applicant_reply.test.mjs loads it.
 */

export const APPLICANT_REPLY_KEYS: ReadonlySet<string> = new Set([
  "success",
  "message",
  "skipped",
  "reused",
  "decision",
  "nextPhaseId",
  "nextPhaseTitle",
  "finishedAllSteps",
  "alreadyAdvanced",
  "analysisPending",
  "previewOnly",
  "error",
  "code",
  "retryAfter",
  "currentStatus",
  "currentPhase",
]);

/** The reply body with only the keys an applicant may read. */
export function applicantReplyBody(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  return Object.fromEntries(Object.entries(body as Record<string, unknown>).filter(([key]) => APPLICANT_REPLY_KEYS.has(key)));
}

/** The same Response, cut down to the applicant's keys (non-JSON passes through). */
export async function forApplicant(res: Response): Promise<Response> {
  if (!(res.headers.get("Content-Type") ?? "").includes("application/json")) return res;
  let body: unknown;
  try {
    body = await res.clone().json();
  } catch {
    return res;
  }
  return new Response(JSON.stringify(applicantReplyBody(body)), { status: res.status, headers: res.headers });
}
