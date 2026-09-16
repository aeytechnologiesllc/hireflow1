/**
 * Pure path-ownership check for the portfolio_upload trusted-results
 * conversion (see docs/TRUSTED-RESULTS.md). Split out of index.ts so it can
 * be exercised directly with `deno test` without importing index.ts itself
 * (which calls `serve(...)` at module load).
 *
 * Matches ONLY the exact path shape PortfolioUploadPhase.tsx's own
 * `uploadFiles()` produces (src/pages/PortfolioUploadPhase.tsx, around
 * line 255):
 *
 *   `${user.id}/${applicationId}-${stepId}-${Date.now()}-${i}.${ext}`
 *
 * A candidate's own upload lands under their own auth uid (enforced
 * separately by the `portfolios` bucket's own upload RLS policy — see
 * supabase/migrations/20260915100000_private_portfolios_and_attachments.sql,
 * "Candidates can upload portfolio files") — this function additionally
 * requires the REST of the name to name THIS application and THIS step, so
 * a candidate can never submit a path that only proves "some file of mine,
 * somewhere" as evidence for a specific step of a specific application. A
 * path that doesn't match — a stranger's file, a stale path from a
 * different application/step, a hand-typed guess — must be refused
 * outright by the caller, never silently skipped.
 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildOwnedPortfolioPathPattern(uid: string, applicationId: string, stepId: string): RegExp {
  return new RegExp(
    `^${escapeRegExp(uid)}/${escapeRegExp(applicationId)}-${escapeRegExp(stepId)}-\\d+-\\d+\\.[A-Za-z0-9]+$`
  );
}
