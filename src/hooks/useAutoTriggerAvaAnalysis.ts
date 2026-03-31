import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { invokeTriggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";
import { parseApplicationNotes } from "@/utils/applicationNotes";

interface UseAutoTriggerAvaAnalysisOptions {
  applicationId: string | undefined;
  enabled?: boolean;
  cooldownMs?: number;
  debounceMs?: number;
}

type AnalysisWatchedApplication = Pick<
  Tables<"applications">,
  "phase" | "status" | "resume_url" | "cover_letter" | "voice_interview_result" | "phase_ai_analysis" | "notes"
>;

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
  const lastEvidenceKeyRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<boolean>(false);

  const buildEvidenceRefreshKey = useCallback((application: AnalysisWatchedApplication) => {
    const parsedNotes = parseApplicationNotes(application.notes);
    const {
      avaScorecard: _avaScorecard,
      avaAnalysisMeta: _avaAnalysisMeta,
      ...evidenceNotes
    } = parsedNotes;

    return JSON.stringify({
      phase: application.phase,
      status: application.status,
      resume_url: application.resume_url,
      cover_letter: application.cover_letter,
      voice_interview_result: application.voice_interview_result,
      phase_ai_analysis: application.phase_ai_analysis,
      notes: evidenceNotes,
    });
  }, []);

  const toWatchedApplication = useCallback((
    snapshot: Partial<Tables<"applications">> | null | undefined,
    fallback: Tables<"applications">,
  ): AnalysisWatchedApplication => ({
    phase: snapshot?.phase ?? fallback.phase,
    status: snapshot?.status ?? fallback.status,
    resume_url: snapshot?.resume_url ?? fallback.resume_url,
    cover_letter: snapshot?.cover_letter ?? fallback.cover_letter,
    voice_interview_result: snapshot?.voice_interview_result ?? fallback.voice_interview_result,
    phase_ai_analysis: snapshot?.phase_ai_analysis ?? fallback.phase_ai_analysis,
    notes: snapshot?.notes ?? fallback.notes,
  }), []);

  const findLatestEvidenceTimestamp = useCallback((value: unknown): number | null => {
    let latest: number | null = null;

    const visit = (entry: unknown) => {
      if (!entry) return;

      if (Array.isArray(entry)) {
        entry.forEach(visit);
        return;
      }

      if (typeof entry !== "object") return;

      const record = entry as Record<string, unknown>;
      const completedAt = typeof record.completedAt === "string"
        ? Date.parse(record.completedAt)
        : typeof record.completed_at === "string"
          ? Date.parse(record.completed_at)
          : Number.NaN;

      if (Number.isFinite(completedAt)) {
        latest = latest === null ? completedAt : Math.max(latest, completedAt);
      }

      Object.entries(record).forEach(([key, nested]) => {
        if (key === "avaScorecard" || key === "avaAnalysisMeta") return;
        visit(nested);
      });
    };

    visit(value);
    return latest;
  }, []);

  const hasMeaningfulEvidence = useCallback((application: Tables<"applications">) => {
    const parsedNotes = parseApplicationNotes(application.notes);

    return !!(
      application.resume_url ||
      parsedNotes.applicationAnswers?.length ||
      parsedNotes.typingTestResult ||
      parsedNotes.quizResult ||
      parsedNotes.quiz ||
      parsedNotes.chatSimulationResult ||
      parsedNotes.chatInterviewResult ||
      parsedNotes.salesSimulationResult ||
      parsedNotes.videoIntroUrl ||
      parsedNotes.videoIntroResult ||
      parsedNotes.portfolioResult ||
      application.voice_interview_result ||
      application.cover_letter
    );
  }, []);
  
  const triggerAnalysis = useCallback(async (force: boolean = false) => {
    if (!applicationId || inFlightRef.current) {
      return;
    }
    
    // Check cooldown
    const now = Date.now();
    if (now - lastTriggerTimeRef.current < cooldownMs) {
      return;
    }
    
    inFlightRef.current = true;
    lastTriggerTimeRef.current = now;
    
    try {
      const { error } = await invokeTriggerAvaAnalysis({
        applicationId,
        force,
      });
      
      if (error) {
        console.error("[useAutoTriggerAvaAnalysis] Error:", error);
      }
    } catch (err) {
      console.error("[useAutoTriggerAvaAnalysis] Exception:", err);
    } finally {
      inFlightRef.current = false;
    }
  }, [applicationId, cooldownMs]);
  
  const checkAndTrigger = useCallback((
    application: Tables<"applications">,
    previousApplication?: Partial<Tables<"applications">> | null,
    initialCheck: boolean = false,
  ) => {
    const parsedNotes = parseApplicationNotes(application.notes);
    const evidenceKey = buildEvidenceRefreshKey(application);
    const previousEvidenceKey = previousApplication
      ? buildEvidenceRefreshKey(toWatchedApplication(previousApplication, application))
      : lastEvidenceKeyRef.current;

    const evidenceChanged = previousApplication
      ? previousEvidenceKey !== evidenceKey
      : lastEvidenceKeyRef.current !== null && lastEvidenceKeyRef.current !== evidenceKey;

    lastEvidenceKeyRef.current = evidenceKey;

    const needsAnalysis =
      !application.ai_analysis ||
      application.ai_score === null ||
      application.ai_score === undefined;

    if (!hasMeaningfulEvidence(application)) {
      return;
    }

    const analyzedAtMs = typeof parsedNotes.avaAnalysisMeta?.analyzedAt === "string"
      ? Date.parse(parsedNotes.avaAnalysisMeta.analyzedAt)
      : Number.NaN;
    const latestEvidenceMs = findLatestEvidenceTimestamp({
      notes: parsedNotes,
      voice_interview_result: application.voice_interview_result,
    });
    const analysisIsStale =
      Number.isFinite(analyzedAtMs) &&
      latestEvidenceMs !== null &&
      latestEvidenceMs > analyzedAtMs;

    const shouldRefreshForEvidence =
      !needsAnalysis &&
      (evidenceChanged || (initialCheck && analysisIsStale));

    if (!needsAnalysis && !shouldRefreshForEvidence) {
      return;
    }

    // Debounce the trigger
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      triggerAnalysis(false);
    }, debounceMs);
  }, [buildEvidenceRefreshKey, debounceMs, findLatestEvidenceTimestamp, hasMeaningfulEvidence, toWatchedApplication, triggerAnalysis]);
  
  useEffect(() => {
    if (!applicationId || !enabled) return;
    
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

          checkAndTrigger(newData, oldData, false);
        }
      )
      .subscribe();
    
    return () => {
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
        checkAndTrigger(data, null, true);
      }
    };
    
    // Small delay to avoid race conditions on page load
    const timer = setTimeout(checkInitialState, 2000);
    
    return () => clearTimeout(timer);
  }, [applicationId, enabled, checkAndTrigger]);
  
  return { triggerAnalysis };
}
