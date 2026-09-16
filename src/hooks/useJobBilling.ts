import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface JobBillingBoostOrder {
  id: string;
  status: "pending_payment" | "authorized" | "submitted_for_review" | "captured" | "released" | "canceled";
  tier_cents: number;
  radius_miles: number;
  reach_estimate_low: number | null;
  reach_estimate_high: number | null;
  captured_at: string | null;
  released_at: string | null;
  created_at: string;
}

export interface JobBillingStatus {
  billingEnabled: boolean;
  applicantCount: number;
  processedAllowance: number;
  sealedCount: number;
  isLocked: boolean;
  unlockCount: number;
  hasActiveUnlock: boolean;
  activeUnlockExpiresAt: string | null;
  packCount: number;
  voice: { included: number; used: number; nextIsBillable: boolean };
  latestBoostOrder: JobBillingBoostOrder | null;
}

/** One job's billing snapshot — powers the locked-job banner, sealed applicant rows, and the unlock/pack/Boost dialogs. Only ever fetched for a job the current user owns or is an active team member on (job-billing-status enforces that server-side). */
export function useJobBilling(jobId: string | null | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["job-billing-status", jobId],
    queryFn: async (): Promise<JobBillingStatus> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Your session expired. Please sign in again.");

      const { data, error } = await supabase.functions.invoke("job-billing-status", {
        body: { jobId },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) throw error;
      return data as JobBillingStatus;
    },
    enabled: Boolean(jobId),
    staleTime: 15_000,
    retry: 1,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["job-billing-status", jobId] });

  return { ...query, invalidate };
}
