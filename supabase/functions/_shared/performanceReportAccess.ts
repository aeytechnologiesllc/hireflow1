/**
 * Pure authorization decision for ai-generate-performance-report.
 *
 * Kept separate from the Deno/Supabase-specific edge function code so it can
 * be unit-tested with plain node (see
 * scripts/performance_report_access.test.mjs) without a live Supabase
 * project or the Deno-only imports the rest of that function needs.
 *
 * The report is both (1) a candidate's private evaluation (voice transcript,
 * notes, AI analysis) and (2) the Improvement Blueprint
 * (src/hooks/useImprovementBlueprint.ts). Access is allowed only for:
 *   (a) the application's own candidate, once they hold a completed
 *       blueprint_purchases row for that specific applicationId, OR while
 *       billing is off (`billingEnabled` false -- see
 *       supabase/functions/_shared/appSettings.ts / app_settings key
 *       'blueprint_paid'; the free tier has been open on purpose since
 *       2026-09-04 and nothing may sit behind a paywall while it is), or
 *   (b) the job's owner (jobs.employer_id) or an active team member of that
 *       employer.
 * Everyone else — including any other signed-in user — is refused.
 */
export interface PerformanceReportAccessInput {
  isCandidateOwner: boolean;
  hasPurchasedBlueprint: boolean;
  isEmployerSide: boolean;
  /** app_settings 'blueprint_paid'. false (billing off) means the report is
   *  free/included for the candidate — no purchase required. */
  billingEnabled: boolean;
}

export function canAccessPerformanceReport(input: PerformanceReportAccessInput): boolean {
  const { isCandidateOwner, hasPurchasedBlueprint, isEmployerSide, billingEnabled } = input;
  if (isEmployerSide) return true;
  if (isCandidateOwner && (hasPurchasedBlueprint || !billingEnabled)) return true;
  return false;
}
