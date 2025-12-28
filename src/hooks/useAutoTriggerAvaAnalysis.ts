import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

interface UseAutoTriggerAvaAnalysisOptions {
  applicationId: string | undefined;
  enabled?: boolean;
  cooldownMs?: number;
  debounceMs?: number;
}

/**
 * Hook that automatically triggers AVA analysis when:
 * 1. ai_analysis or ai_score is null/empty
 * 2. AND meaningful evaluation data is present
 * 
 * This ensures analysis runs after phase reset + resubmission without manual intervention.
 */
export function useAutoTriggerAvaAnalysis({
  applicationId,
  enabled = true,
  cooldownMs = 45000, // 45 second cooldown between triggers
  debounceMs = 1500, // 1.5 second debounce
}: UseAutoTriggerAvaAnalysisOptions) {
  const lastTriggerTimeRef = useRef<number>(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inFlightRef = useRef<boolean>(false);
  
  const triggerAnalysis = useCallback(async (force: boolean = true) => {
    if (!applicationId || inFlightRef.current) {
      console.log("[useAutoTriggerAvaAnalysis] Skip: no appId or already in flight");
      return;
    }
    
    // Check cooldown
    const now = Date.now();
    if (now - lastTriggerTimeRef.current < cooldownMs) {
      console.log("[useAutoTriggerAvaAnalysis] Skip: within cooldown period");
      return;
    }
    
    inFlightRef.current = true;
    lastTriggerTimeRef.current = now;
    
    try {
      console.log("[useAutoTriggerAvaAnalysis] Triggering analysis for:", applicationId, "force:", force);
      
      const { data, error } = await supabase.functions.invoke("trigger-ava-analysis", {
        body: { applicationId, force },
      });
      
      if (error) {
        console.error("[useAutoTriggerAvaAnalysis] Error:", error);
      } else {
        console.log("[useAutoTriggerAvaAnalysis] Analysis triggered successfully:", data);
      }
    } catch (err) {
      console.error("[useAutoTriggerAvaAnalysis] Exception:", err);
    } finally {
      inFlightRef.current = false;
    }
  }, [applicationId, cooldownMs]);
  
  const checkAndTrigger = useCallback((application: Tables<"applications">) => {
    // RACE CONDITION FIX: Skip if application is in a candidate-submission phase
    // Let the autopilot system handle the analysis without interference
    const candidateSubmissionPhases = [
      "application", "quiz", "typing_test", "video_intro", 
      "portfolio_upload", "chat_simulation", "chat_interview", 
      "sales_simulation", "voice_interview"
    ];
    
    if (application.status === "pending" && 
        candidateSubmissionPhases.includes(application.phase || "")) {
      console.log("[useAutoTriggerAvaAnalysis] Skipping - in candidate submission phase, autopilot will handle");
      return;
    }
    
    // Parse notes to check for meaningful data
    let parsedNotes: Record<string, any> = {};
    try {
      parsedNotes = application.notes ? JSON.parse(application.notes as string) : {};
    } catch {
      parsedNotes = {};
    }
    
    // Check if analysis is needed (null/empty)
    const needsAnalysis = !application.ai_analysis || !application.ai_score;
    
    if (!needsAnalysis) {
      console.log("[useAutoTriggerAvaAnalysis] Analysis already present, skipping");
      return;
    }
    
    // Check if meaningful data is present
    const hasMeaningfulData = !!(
      application.resume_url ||
      parsedNotes.applicationAnswers?.length > 0 ||
      parsedNotes.typingTestResult ||
      parsedNotes.quizResult ||
      parsedNotes.quiz ||
      parsedNotes.chatSimulationResult ||
      parsedNotes.chatInterviewResult ||
      parsedNotes.salesSimulationResult ||
      parsedNotes.videoIntroUrl ||
      parsedNotes.portfolioResult ||
      application.voice_interview_result ||
      application.cover_letter
    );
    
    if (!hasMeaningfulData) {
      console.log("[useAutoTriggerAvaAnalysis] No meaningful data yet, skipping");
      return;
    }
    
    console.log("[useAutoTriggerAvaAnalysis] Conditions met - scheduling analysis trigger");
    
    // Debounce the trigger
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      triggerAnalysis(true);
    }, debounceMs);
  }, [triggerAnalysis, debounceMs]);
  
  useEffect(() => {
    if (!applicationId || !enabled) return;
    
    console.log("[useAutoTriggerAvaAnalysis] Setting up realtime subscription for:", applicationId);
    
    const channel = supabase
      .channel(`auto-ava-analysis-${applicationId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "applications",
          filter: `id=eq.${applicationId}`,
        },
        (payload) => {
          const newData = payload.new as Tables<"applications">;
          const oldData = payload.old as Partial<Tables<"applications">>;
          
          // Skip if this update IS the ai_analysis being set (avoid loop)
          if (newData.ai_analysis && !oldData.ai_analysis) {
            console.log("[useAutoTriggerAvaAnalysis] Skipping - ai_analysis just arrived");
            return;
          }
          
          // Skip if ai_score just got set
          if (newData.ai_score !== null && oldData.ai_score === null) {
            console.log("[useAutoTriggerAvaAnalysis] Skipping - ai_score just arrived");
            return;
          }
          
          console.log("[useAutoTriggerAvaAnalysis] Application updated, checking if analysis needed");
          checkAndTrigger(newData);
        }
      )
      .subscribe();
    
    return () => {
      console.log("[useAutoTriggerAvaAnalysis] Cleaning up subscription");
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [applicationId, enabled, checkAndTrigger]);
  
  // Also check on mount/when applicationId changes
  useEffect(() => {
    if (!applicationId || !enabled) return;
    
    // Fetch current application state and check
    const checkInitialState = async () => {
      const { data } = await supabase
        .from("applications")
        .select("*")
        .eq("id", applicationId)
        .single();
      
      if (data) {
        console.log("[useAutoTriggerAvaAnalysis] Initial check for application:", applicationId);
        checkAndTrigger(data);
      }
    };
    
    // Small delay to avoid race conditions on page load
    const timer = setTimeout(checkInitialState, 2000);
    
    return () => clearTimeout(timer);
  }, [applicationId, enabled, checkAndTrigger]);
  
  return { triggerAnalysis };
}
