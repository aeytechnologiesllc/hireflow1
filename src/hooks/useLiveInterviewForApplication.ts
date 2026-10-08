import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TeamInterviewLike } from "@/lib/teamInterviewStatus";

/**
 * The applicant's live interview, for the applicant's own page on the staff
 * side: the newest one that is not cancelled or completed, or null.
 *
 * Keyed under ["interviews"], so setting one up (the wizard), an answer on
 * the Interviews page, and the staff live-sync's own interviews channel all
 * refresh it without the page being reloaded. A plain select on the one
 * table: no join for the database to refuse.
 */
export function useLiveInterviewForApplication(applicationId: string | null | undefined) {
  return useQuery({
    queryKey: ["interviews", "application-live", applicationId],
    queryFn: async (): Promise<(TeamInterviewLike & { id: string }) | null> => {
      const { data, error } = await supabase
        .from("interviews")
        .select("id, status, candidate_response, scheduled_at, duration_minutes, employer_windows, created_at")
        .eq("application_id", applicationId as string)
        .eq("status", "scheduled")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data ?? [])[0] as (TeamInterviewLike & { id: string }) | undefined) ?? null;
    },
    enabled: !!applicationId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}
