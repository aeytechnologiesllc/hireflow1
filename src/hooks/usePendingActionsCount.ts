import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Hook to count applications where the candidate needs to take action
 * (i.e., they've been advanced to a new phase that requires their input)
 */
export function usePendingActionsCount() {
  const { user, role } = useAuth();

  return useQuery({
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
      // Action is needed when:
      // 1. Phase is not "application" (they've been advanced)
      // 2. Phase is not "review" or "interview" or "hired" (waiting phases)
      // 3. The phase data hasn't been submitted yet
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
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}
