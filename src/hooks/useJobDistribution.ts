/**
 * useJobDistribution — client hooks for the JOIN job-distribution pipeline.
 * Server-side counterparts: join-publish-job / join-sync-applications / join-archive-job.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface DistributionResult {
  configured: boolean;
  status: "not_configured" | "live" | "offline" | "needs_attention" | "publishing" | "archived" | "not_distributed";
  providerJobId?: number | string;
  note?: string;
  error?: string;
}

export interface DistributionPost {
  job_id: string;
  provider: string;
  provider_job_id: string | null;
  status: string;
  last_synced_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  last_error: string | null;
}

/** Send a job to JOIN for distribution (server enforces the offline-first safety). */
export function useDistributeJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, goLive = true }: { jobId: string; goLive?: boolean }): Promise<DistributionResult> => {
      const { data, error } = await supabase.functions.invoke("join-publish-job", { body: { jobId, goLive } });
      if (error) throw new Error(error.message);
      return data as DistributionResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-distribution"] });
    },
  });
}

/** The employer's distribution rows (for status pills + gating the sync button). */
export function useJobDistributionPosts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["job-distribution", user?.id],
    queryFn: async (): Promise<DistributionPost[]> => {
      const { data, error } = await supabase
        .from("job_distribution_posts")
        .select("job_id, provider, provider_job_id, status, last_synced_at, published_at, archived_at, last_error")
        .eq("employer_id", user!.id);
      if (error) throw error;
      return (data ?? []) as DistributionPost[];
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });
}

/** Pull new applications from JOIN into the pipeline (manual sync). */
export function useSyncJoinApplications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId?: string): Promise<{ configured: boolean; imported: number; skipped?: number; jobs?: number; errors?: string[] }> => {
      const { data, error } = await supabase.functions.invoke("join-sync-applications", { body: jobId ? { jobId } : {} });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      // Imported applicants should appear everywhere immediately.
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["cockpit-applications"] });
      queryClient.invalidateQueries({ queryKey: ["job-distribution"] });
    },
  });
}

/** Archive the JOIN posting when a HireFlow job closes (fire-and-forget safe). */
export function archiveJoinJobInBackground(jobId: string): void {
  void supabase.functions
    .invoke("join-archive-job", { body: { jobId } })
    .catch((e) => console.warn("[join-archive-job] background archive failed", e));
}
