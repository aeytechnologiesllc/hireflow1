/**
 * Pure authorization decision for ai-generate-performance-report.
 *
 * Kept separate from the Deno/Supabase-specific edge function code so it can
 * be unit-tested with plain node (see
 * scripts/performance_report_access.test.mjs) without a live Supabase
 * project or the Deno-only imports the rest of that function needs.
 *
 * The report is a candidate's private evaluation (notes, AI analysis), also
 * shown as the Improvement Blueprint (src/hooks/useImprovementBlueprint.ts).
 * Access is allowed only for:
 *   (a) the application's own candidate, always and free: applicants never
 *       pay on HireFlow (the owner, 2026-10-11). The old paid path (the
 *       'blueprint_paid' setting and the purchase-blueprint checkout) is gone;
 *   (b) the job's owner (jobs.employer_id) or an active team member of that
 *       employer scoped to this job.
 * Everyone else, including any other signed-in user, is refused.
 */
export interface PerformanceReportAccessInput {
  isCandidateOwner: boolean;
  isEmployerSide: boolean;
}

export function canAccessPerformanceReport(input: PerformanceReportAccessInput): boolean {
  const { isCandidateOwner, isEmployerSide } = input;
  if (isEmployerSide) return true;
  if (isCandidateOwner) return true;
  return false;
}
