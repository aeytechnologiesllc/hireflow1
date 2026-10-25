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
 * Pure apart from Response, so scripts/ava_analysis_applicant_limits.test.mjs loads it.
 */

export const APPLICANT_REPLY_KEYS: ReadonlySet<string> = new Set([
  "success",
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

/**
 * Decisions that would tell an applicant the verdict before a person has
 * made it. Their page treats every "waiting on the hiring team" answer the
 * same way (src/lib/journeyProgress.ts SERVER_HELD_DECISIONS), so the reply
 * says only that (Pass C review, 2026-10-25: "recommend_decline" reached
 * the applicant, with a message naming Ava).
 */
const DECISION_FOR_APPLICANT: Readonly<Record<string, string>> = {
  recommend_decline: "needs_employer_approval",
};

/** The reply body with only the keys an applicant may read. No message: it is the hiring team's wording. */
export function applicantReplyBody(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const kept: Record<string, unknown> = Object.fromEntries(
    Object.entries(body as Record<string, unknown>).filter(([key]) => APPLICANT_REPLY_KEYS.has(key)),
  );
  if (typeof kept.decision === "string" && DECISION_FOR_APPLICANT[kept.decision]) {
    kept.decision = DECISION_FOR_APPLICANT[kept.decision];
  }
  return kept;
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
