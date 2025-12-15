import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Hook to count applications where the candidate needs to take action
 * (i.e., they've been advanced to a new phase that requires their input)
 */
export function usePendingActionsCount() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["pending-actions-count", user?.id],
    queryFn: async () => {
      // Get all applications for this candidate
      const { data, error } = await supabase
        .from("applications")
        .select("id, phase, status, notes")
        .eq("candidate_id", user!.id)
        .neq("status", "rejected")
        .neq("status", "hired");

      if (error) throw error;

      // Count applications where action is needed
      let count = 0;
      
      for (const app of data || []) {
        const phase = app.phase || "application";
        
        // Skip if in waiting phases
        if (["application", "review", "interview", "hired"].includes(phase)) {
          continue;
        }
        
        // Check if the phase has been completed
        let notes: Record<string, any> = {};
        try {
          notes = app.notes ? JSON.parse(app.notes) : {};
        } catch {
          // ignore
        }
        
        // Check for phase-specific data
        const hasPhaseData = (() => {
          if (phase.includes("quiz") || phase.includes("step")) {
            return !!notes.quizAnswers?.[phase];
          }
          if (phase === "typing_test") {
            return !!notes.typingTestResult;
          }
          if (phase === "video_intro") {
            return !!notes.videoIntroUrl;
          }
          if (phase === "chat_simulation") {
            return !!notes.chatSimulationResult;
          }
          if (phase === "chat_interview") {
            return !!notes.chatInterviewResult;
          }
          if (phase === "sales_simulation") {
            return !!notes.salesSimulationResult;
          }
          return false;
        })();
        
        if (!hasPhaseData) {
          count++;
        }
      }
      
      return count;
    },
    enabled: !!user && role === "candidate",
    refetchInterval: 30000,
  });

  // Real-time subscription for application changes
  useEffect(() => {
    if (!user || role !== "candidate") return;

    const channel = supabase
      .channel("pending-actions-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "applications",
          filter: `candidate_id=eq.${user.id}`,
        },
        () => {
          // Invalidate the count query when any application changes
          queryClient.invalidateQueries({ queryKey: ["pending-actions-count"] });
          queryClient.invalidateQueries({ queryKey: ["candidate-applications"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, role, queryClient]);

  return query;
}
