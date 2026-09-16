/**
 * Thin, shared wrapper around the get_employer_sealed_application_ids() RPC
 * (supabase/migrations/20260916170000_job_billing_schema.sql) — the single
 * server-side source of truth for which application ids are currently
 * sealed behind the employer's unlock paywall, across every job they own or
 * team-member on.
 *
 * Every hook that fetches raw `applications` rows for an employer
 * (useEmployerApplications, useActivityFeed) calls this once per fetch and
 * redacts by id (src/lib/billingVisibility.ts's redactSealedApplications)
 * before returning — so every consumer of that data inherits the same gate
 * without needing its own billing check. See the migration's own comment on
 * the function for the full "why" (the finding this closes).
 *
 * Never throws: a billing-status hiccup must never take down the applicant
 * list or the dashboard. An RPC failure resolves to an empty set — the same
 * "nothing sealed, render everything" behavior as billing being off — and
 * is logged for diagnosis rather than surfaced as a page-level error.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchEmployerSealedApplicationIds(
  supabaseClient: SupabaseClient,
): Promise<Set<string>> {
  try {
    const { data, error } = await supabaseClient.rpc("get_employer_sealed_application_ids");
    if (error) {
      console.error("[sealedApplicationIds] get_employer_sealed_application_ids failed; treating as nothing sealed:", error);
      return new Set();
    }
    const rows = (data ?? []) as Array<{ application_id: string }>;
    return new Set(rows.map((r) => r.application_id));
  } catch (err) {
    console.error("[sealedApplicationIds] Unexpected error; treating as nothing sealed:", err);
    return new Set();
  }
}
