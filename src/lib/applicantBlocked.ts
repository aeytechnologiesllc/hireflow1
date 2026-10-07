/**
 * applicantBlocked.ts — what a candidate is told when an employer has blocked
 * them (Remove and block, supabase/migrations/20261007022249_block_applicants.sql).
 *
 * The database refuses a blocked person's new application with exactly
 * APPLICANT_BLOCKED_MESSAGE (code P0001, HINT applicant_blocked); the job
 * page shows it as it is, instead of "Failed to start application. Please
 * try again." (a retry can never work, and nothing is wrong on their side to
 * fix). It names no employer, no reason and no block.
 *
 * Import-free, so the candidate pages carry nothing from the staff cockpit.
 */

export const APPLICANT_BLOCKED_MESSAGE = "We can't take an application from this account.";

/** True for the database's refusal of a blocked person's new application. */
export function isApplicantBlockedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { hint?: unknown; message?: unknown };
  return e.hint === "applicant_blocked" || (typeof e.message === "string" && e.message.includes(APPLICANT_BLOCKED_MESSAGE));
}
