/**
 * The employer applicant-list side of the paywall: which candidate ids may
 * render as real cards, and which must render only as a count inside
 * SealedApplicantsCard.
 *
 * Pulled out of src/cockpit/pages/Applicants.tsx so the arrival-order +
 * allowance math has one place to live and one place to test (see
 * scripts/billing_visibility.test.mjs) — this is exactly the logic a prior
 * review found missing: the applicant list rendered every card regardless
 * of a locked job's paid allowance, making the paywall purely decorative.
 *
 * Matches the model documented in
 * supabase/migrations/20260916170000_job_billing_schema.sql: "processed" vs
 * "sealed" is a VISIBILITY gate on the employer's own applicant list, never
 * a compute gate on the candidate's pipeline. Nothing here ever removes an
 * application or changes what a candidate experiences — it only decides
 * which of the employer's own already-fetched rows are allowed to render.
 */

export interface BillingVisibilitySnapshot {
  billingEnabled: boolean;
  isLocked: boolean;
  processedAllowance: number;
}

export interface BillingVisibilityEntry {
  id: string;
  /** The application's created_at, ISO-ish and string-sortable. Missing/empty
   *  sorts first, which only matters for malformed data and never hides a
   *  well-formed row that should be visible. */
  createdAt: string;
}

/**
 * Returns the set of candidate ids allowed to render as real cards, or
 * `null` when nothing should be hidden (billing is off, the job isn't
 * locked, or there's no billing snapshot yet) — callers can treat `null` as
 * "render everything, as always" without a separate branch.
 *
 * Earliest arrivals fill the allowance first, matching "first 3 applicants,
 * by arrival order, are free" in the decided pricing model: the employer
 * always gets to see who applied first, and it is the later arrivals beyond
 * the paid allowance that stay sealed.
 */
export function computeBillingVisibleIds(
  entries: BillingVisibilityEntry[],
  billing: BillingVisibilitySnapshot | null | undefined,
): Set<string> | null {
  if (!billing || !billing.billingEnabled || !billing.isLocked) return null;
  const byArrival = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const allowance = Math.max(0, billing.processedAllowance);
  return new Set(byArrival.slice(0, allowance).map((e) => e.id));
}
