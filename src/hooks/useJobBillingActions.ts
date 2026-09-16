import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

async function invokeAuthedFunction<TData = unknown>(functionName: string, body?: Record<string, unknown>): Promise<TData> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Your session expired. Please sign in again.");

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (error) throw error;
  return data as TData;
}

export interface ReachEstimate {
  available: boolean;
  low?: number;
  high?: number;
  radiusMiles?: number;
}

/** The checkout-creating mutations behind the unlock / applicant pack / Ava Boost dialogs. Each returns { url } — a Stripe Checkout URL to send the browser to (see VoiceCreditsSection's existing `window.location.href = result.url` convention). */
export function useJobBillingActions() {
  const unlockJob = useMutation({
    mutationFn: (jobId: string) =>
      invokeAuthedFunction<{ url: string }>("unlock-job-checkout", {
        jobId,
        successUrl: `${window.location.origin}/applicants?roleId=${jobId}&unlock=success`,
        cancelUrl: window.location.href,
      }),
  });

  const buyApplicantPack = useMutation({
    mutationFn: (jobId: string) =>
      invokeAuthedFunction<{ url: string }>("purchase-applicant-pack-checkout", {
        jobId,
        successUrl: `${window.location.origin}/applicants?roleId=${jobId}&pack=success`,
        cancelUrl: window.location.href,
      }),
  });

  const buyBoost = useMutation({
    mutationFn: ({ jobId, tierCents, radiusMiles }: { jobId: string; tierCents: number; radiusMiles?: number }) =>
      invokeAuthedFunction<{ url: string }>("ava-boost-checkout", {
        jobId,
        tierCents,
        radiusMiles,
        successUrl: `${window.location.origin}/applicants?roleId=${jobId}&boost=success`,
        cancelUrl: window.location.href,
      }),
  });

  const reachEstimate = useMutation({
    mutationFn: ({ jobId, radiusMiles }: { jobId: string; radiusMiles?: number }) =>
      invokeAuthedFunction<ReachEstimate>("ava-boost-reach-estimate", { jobId, radiusMiles }),
  });

  return { unlockJob, buyApplicantPack, buyBoost, reachEstimate };
}
