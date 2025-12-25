import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";

const LAST_SEEN_KEY = "interviews_last_seen";

function getLastSeenTimestamp(): string {
  const stored = localStorage.getItem(LAST_SEEN_KEY);
  if (stored) return stored;
  // Default to 24 hours ago if never seen
  const defaultTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return defaultTime;
}

function setLastSeenTimestamp(): void {
  localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
}

export function useUpcomingInterviewsCount() {
  const { user, role, isTeamMember } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();

  const lastSeen = useMemo(() => getLastSeenTimestamp(), []);

  const query = useQuery({
    queryKey: ["upcoming-interviews-count", user?.id, lastSeen],
    queryFn: async () => {
      if (!user?.id) return 0;

      const isEmployerOrTeam = role === "employer" || isTeamMember;

      if (isEmployerOrTeam) {
        // Get employer's jobs
        let jobIds: string[] = [];
        
        if (isTeamMember) {
          const { data: teamMember } = await supabase
            .from("team_members")
            .select("employer_id, assigned_job_ids")
            .eq("user_id", user.id)
            .eq("status", "active")
            .single();

          if (!teamMember) return 0;

          if (teamMember.assigned_job_ids && teamMember.assigned_job_ids.length > 0) {
            jobIds = teamMember.assigned_job_ids;
          } else {
            const { data: jobs } = await supabase
              .from("jobs")
              .select("id")
              .eq("employer_id", teamMember.employer_id);
            jobIds = jobs?.map((j) => j.id) || [];
          }
        } else {
          const { data: jobs } = await supabase
            .from("jobs")
            .select("id")
            .eq("employer_id", user.id);
          jobIds = jobs?.map((j) => j.id) || [];
        }

        if (!jobIds.length) return 0;

        // Get applications for these jobs
        const { data: applications } = await supabase
          .from("applications")
          .select("id")
          .in("job_id", jobIds);

        if (!applications?.length) return 0;

        const applicationIds = applications.map((a) => a.id);

        // Count interviews created after last seen
        const { count, error } = await supabase
          .from("interviews")
          .select("*", { count: "exact", head: true })
          .in("application_id", applicationIds)
          .eq("status", "scheduled")
          .gt("created_at", lastSeen);

        if (error) return 0;
        return count || 0;
      } else {
        // Candidate: count their new interviews
        const { data: applications } = await supabase
          .from("applications")
          .select("id")
          .eq("candidate_id", user.id);

        if (!applications?.length) return 0;

        const applicationIds = applications.map((a) => a.id);

        const { count, error } = await supabase
          .from("interviews")
          .select("*", { count: "exact", head: true })
          .in("application_id", applicationIds)
          .eq("status", "scheduled")
          .gt("created_at", lastSeen);

        if (error) return 0;
        return count || 0;
      }
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  const markAsSeen = useCallback(() => {
    setLastSeenTimestamp();
    queryClient.invalidateQueries({ queryKey: ["upcoming-interviews-count", user?.id] });
  }, [queryClient, user?.id]);

  // Clear badge when visiting /interviews
  useEffect(() => {
    if (location.pathname === "/interviews") {
      markAsSeen();
    }
  }, [location.pathname, markAsSeen]);

  // Real-time subscription for interviews
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("upcoming-interviews-count")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "interviews",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["upcoming-interviews-count", user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  return { ...query, markAsSeen };
}
