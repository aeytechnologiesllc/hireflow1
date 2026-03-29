import { supabase } from "@/integrations/supabase/client";

interface WorkflowStep {
  id: string;
  type: string;
  title: string;
}

export interface CatchUpResult {
  processed: number;
  advanced: number;
  rejected: number;
  failed: number;
}

/**
 * Safely parses notes - handles both string (legacy) and object (JSONB) formats
 */
function parseNotes(notes: string | Record<string, any> | null): Record<string, any> {
  if (!notes) return {};
  
  // If already an object (JSONB from Supabase), use directly
  if (typeof notes === "object") {
    return notes as Record<string, any>;
  }
  
  // If string, try to parse
  if (typeof notes === "string") {
    try {
      return JSON.parse(notes);
    } catch {
      return {};
    }
  }
  
  return {};
}

/**
 * Determines if a phase has been completed by the candidate based on phase type and notes
 */
function hasCompletedPhase(
  phaseId: string,
  phaseType: string,
  notes: string | Record<string, any> | null,
  voiceInterviewResult: any
): boolean {
  const parsedNotes = parseNotes(notes);
  
  // Check completion based on phase type
  switch (phaseType) {
    case "application":
      // Application form completed ONLY if we have actual applicationAnswers with real content
      // Just having metadata (like resumeUrl, coverLetter, timestamps) doesn't count
      const hasApplicationAnswers = Array.isArray(parsedNotes.applicationAnswers) && 
        parsedNotes.applicationAnswers.length > 0 &&
        parsedNotes.applicationAnswers.some((a: any) => a.answer && a.answer.trim() !== "");
      return hasApplicationAnswers;
    
    case "typing_test":
      return !!parsedNotes.typingTestResult;
    
    case "quiz":
      return !!parsedNotes.quizResult || !!parsedNotes.quiz;
    
    case "chat_simulation":
      return !!parsedNotes.chatSimulationResult;
    
    case "chat_interview":
      return !!parsedNotes.chatInterviewResult;
    
    case "sales_simulation":
      return !!parsedNotes.salesSimulationResult;
    
    case "video_intro":
      return !!parsedNotes.videoIntroUrl;
    
    case "portfolio":
      return !!parsedNotes.portfolioResult;
    
    case "voice_interview":
    case "ava_interview":
      return !!voiceInterviewResult;
    
    case "review":
      // Review phases don't need candidate action
      return true;
    
    default:
      // Unknown phase type - assume complete if there's any notes
      return Object.keys(parsedNotes).length > 0;
  }
}

/**
 * Gets the next phase in the workflow after the current phase.
 * Handles the implicit "application" and "quiz" phases that aren't in workflow_steps.
 */
function getNextPhase(
  currentPhaseId: string,
  workflowSteps: WorkflowStep[],
  hasQuizQuestions: boolean
): WorkflowStep | null {
  // If currently at "application" phase
  if (currentPhaseId === "application") {
    // If job has quiz questions, next phase is the quiz
    if (hasQuizQuestions) {
      return { id: "quiz", type: "quiz", title: "Quiz" };
    }
    // Otherwise, go to first workflow step
    if (workflowSteps.length > 0) {
      return workflowSteps[0];
    }
    return null;
  }
  
  // If currently at "quiz" phase, go to first workflow step
  if (currentPhaseId === "quiz") {
    if (workflowSteps.length > 0) {
      return workflowSteps[0];
    }
    return null;
  }
  
  // Otherwise, find current position in workflow_steps
  const currentIndex = workflowSteps.findIndex(s => s.id === currentPhaseId);
  if (currentIndex === -1) {
    return null;
  }
  if (currentIndex >= workflowSteps.length - 1) {
    return null;
  }
  
  const nextStep = workflowSteps[currentIndex + 1];
  return nextStep;
}

/**
 * Processes all pending applications for a job when switching to autopilot mode.
 * This "catches up" applications that were waiting for manual review.
 * 
 * For each application:
 * 1. Check if current phase is complete (candidate has done their part)
 * 2. Hand the decision to trigger-ava-analysis with autopilotDecision=true
 * 3. Count the backend's authoritative result
 */
export async function processAutopilotCatchUp(
  jobId: string
): Promise<CatchUpResult> {
  const result: CatchUpResult = {
    processed: 0,
    advanced: 0,
    rejected: 0,
    failed: 0,
  };

  try {
    // Fetch job details to get workflow steps and current mode
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("processing_mode, workflow_steps")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      console.error("[processAutopilotCatchUp] Failed to fetch job:", jobError);
      return result;
    }

    // SAFETY: Never run catch-up unless the job is actually in auto mode.
    if (job.processing_mode !== "auto") {
      return result;
    }

    const workflowSteps = (job.workflow_steps as unknown as WorkflowStep[]) || [];

    // Fetch all pending/reviewing applications for this job
    const { data: applications, error: appError } = await supabase
      .from("applications")
      .select("*")
      .eq("job_id", jobId)
      .in("status", ["pending", "reviewing", "in_progress"])
      .neq("status", "rejected")
      .neq("status", "hired");

    if (appError) {
      console.error("[processAutopilotCatchUp] Failed to fetch applications:", appError);
      return result;
    }

    if (!applications || applications.length === 0) {
      return result;
    }

    // Process each application
    for (const application of applications) {
      result.processed++;

      try {
        const currentPhaseId = application.phase || "application";
        
        // Determine phase type - handle implicit phases that aren't in workflowSteps
        let currentPhaseType: string;
        if (currentPhaseId === "application") {
          currentPhaseType = "application";
        } else if (currentPhaseId === "quiz") {
          currentPhaseType = "quiz";
        } else {
          const currentPhase = workflowSteps.find(s => s.id === currentPhaseId);
          currentPhaseType = currentPhase?.type || "unknown";
        }
        
        // Only catch up candidates who have finished their current phase and are waiting on employer action.
        const isPhaseComplete = hasCompletedPhase(
          currentPhaseId,
          currentPhaseType,
          application.notes,
          application.voice_interview_result
        );

        if (!isPhaseComplete) {
          continue;
        }

        const { data: autopilotResult, error: autopilotError } = await supabase.functions.invoke("trigger-ava-analysis", {
          body: {
            applicationId: application.id,
            force: application.ai_score === null || application.ai_score === undefined,
            autopilotDecision: true,
            currentPhaseId,
          },
        });

        if (autopilotError) {
          console.error(`[processAutopilotCatchUp] Backend autopilot error for ${application.id}:`, autopilotError);
          result.failed++;
          continue;
        }

        if (autopilotResult?.decision === "rejected") {
          result.rejected++;
          continue;
        }

        if (autopilotResult?.decision === "advanced") {
          result.advanced++;
          continue;
        }

        if (autopilotResult?.decision === "needs_employer_approval") {
          continue;
        }

        const { data: refreshedApplication } = await supabase
          .from("applications")
          .select("status")
          .eq("id", application.id)
          .single();

        if (refreshedApplication?.status === "rejected") {
          result.rejected++;
        } else {
          result.failed++;
        }
      } catch (appProcessError) {
        console.error(`[processAutopilotCatchUp] Error processing application ${application.id}:`, appProcessError);
        result.failed++;
      }
    }

    return result;
  } catch (error) {
    console.error("[processAutopilotCatchUp] Unexpected error:", error);
    return result;
  }
}
