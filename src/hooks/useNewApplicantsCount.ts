import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useSchemaMode } from "@/hooks/useSchemaMode";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";

const LAST_SEEN_KEY = "applicants_last_seen";

function getLastSeenTimestamp(): string {
  const stored = localStorage.getItem(LAST_SEEN_KEY);
  if (stored) return stored;
  // Default to 24 hours ago if never visited
  const defaultTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return defaultTime;
}

function setLastSeenTimestamp(): void {
  localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
}

export function useNewApplicantsCount() {
  const { user, role, isTeamMember } = useAuth();
  const { data: mode } = useSchemaMode();
  const queryClient = useQueryClient();
  const location = useLocation();
  const isEmployerOrTeam = role === "employer" || isTeamMember;

  const query = useQuery({
    queryKey: ["new-applicants-count", user?.id],
    queryFn: async () => {
      if (!user?.id || !isEmployerOrTeam) return 0;
      if (mode === "showcase") {
        const lastSeen = getLastSeenTimestamp();
        const lastSeenEpoch = Math.floor(new Date(lastSeen).getTime() / 1000);
        const { count, error } = await supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .gt("sort_order", lastSeenEpoch);
        if (error) return 0;
        return count || 0;
      }

      const lastSeen = getLastSeenTimestamp();

      // Get employer's jobs first
      let jobsQuery = supabase.from("jobs").select("id");
      
      if (isTeamMember) {
        // For team members, get jobs from their employer
        const { data: teamMember } = await supabase
          .from("team_members")
          .select("employer_id, assigned_job_ids")
          .eq("user_id", user.id)
          .eq("status", "active")
          .single();

        if (!teamMember) return 0;

        // If team member has assigned jobs, only count those
        if (teamMember.assigned_job_ids && teamMember.assigned_job_ids.length > 0) {
          jobsQuery = jobsQuery.in("id", teamMember.assigned_job_ids);
        } else {
          jobsQuery = jobsQuery.eq("employer_id", teamMember.employer_id);
        }
      } else {
        jobsQuery = jobsQuery.eq("employer_id", user.id);
      }

      const { data: jobs, error: jobsError } = await jobsQuery;
      if (jobsError || !jobs?.length) return 0;

      const jobIds = jobs.map((j) => j.id);

      // Count applications created after last seen
      const { count, error } = await supabase
        .from("applications")
        .select("*", { count: "exact", head: true })
        .in("job_id", jobIds)
        .gt("created_at", lastSeen);

      if (error) {
        console.error("Error fetching new applicants count:", error);
        return 0;
      }

      return count || 0;
    },
    enabled: !!user?.id && isEmployerOrTeam && mode !== undefined,
    staleTime: 30000,
  });

  // Real-time subscription for applications
  useEffect(() => {
    if (!user?.id || !isEmployerOrTeam) return;

    const channel = supabase
      .channel("new-applicants-count")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "applications",
        },
        () => {
          // New application received, invalidate count
          queryClient.invalidateQueries({ queryKey: ["new-applicants-count", user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isEmployerOrTeam, queryClient]);

  // Mark as seen when visiting applicants page
  const markAsSeen = useCallback(() => {
    setLastSeenTimestamp();
    queryClient.invalidateQueries({ queryKey: ["new-applicants-count", user?.id] });
  }, [queryClient, user?.id]);

  useEffect(() => {
    if (location.pathname === "/applicants") {
      markAsSeen();
    }
  }, [location.pathname, markAsSeen]);

  return { ...query, markAsSeen };
}
