import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";

const LAST_SEEN_KEY = "applications_last_seen";

/**
 * Hook to count applications with new updates since last visit to /applications
 */
export function usePendingActionsCount() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();

  // Mark as seen when visiting /applications
  const markAsSeen = useCallback(() => {
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    queryClient.invalidateQueries({ queryKey: ["pending-actions-count"] });
  }, [queryClient]);

  // Auto-mark as seen when on /applications page or any application sub-route
  useEffect(() => {
    if (location.pathname === "/applications" || location.pathname.startsWith("/applications/")) {
      markAsSeen();
    }
  }, [location.pathname, markAsSeen]);

  const query = useQuery({
    queryKey: ["pending-actions-count", user?.id],
    queryFn: async () => {
      const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
      
      // Get all applications for this candidate
      const { data, error } = await supabase
        .from("applications")
        .select("id, phase, status, notes, updated_at, voice_interview_result")
        .eq("candidate_id", user!.id)
        .neq("status", "rejected")
        .neq("status", "hired");

      if (error) throw error;

      // Count applications with new updates since last visit
      let count = 0;
      
      for (const app of data || []) {
        // Skip if not updated since last seen
        if (lastSeen && new Date(app.updated_at) <= new Date(lastSeen)) {
          continue;
        }

        const phase = app.phase || "application";
        
        // Skip if in waiting phases (no action needed)
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
          if (phase.includes("voice_interview")) {
            return !!app.voice_interview_result;
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
          // If user is currently on an application page (viewing/completing a phase),
          // mark as seen BEFORE invalidating to prevent false notification badge
          const currentPath = window.location.pathname;
          if (currentPath.startsWith("/applications/")) {
            localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
          }
          queryClient.invalidateQueries({ queryKey: ["pending-actions-count"] });
          queryClient.invalidateQueries({ queryKey: ["candidate-applications"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, role, queryClient]);

  return { ...query, markAsSeen };
}
