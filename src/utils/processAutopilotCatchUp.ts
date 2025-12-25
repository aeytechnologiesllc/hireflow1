import { supabase } from "@/integrations/supabase/client";
import { triggerAvaAnalysis } from "./triggerAvaAnalysis";
import { notifyPhaseAdvanced } from "./emailNotifications";

interface WorkflowStep {
  id: string;
  type: string;
  title: string;
}

interface CatchUpResult {
  processed: number;
  advanced: number;
  failed: number;
}

/**
 * Determines if a phase has been completed by the candidate based on phase type and notes
 */
function hasCompletedPhase(
  phaseId: string,
  phaseType: string,
  notes: string | null,
  voiceInterviewResult: any
): boolean {
  // Parse notes to check for phase completion
  let parsedNotes: Record<string, any> = {};
  if (notes) {
    try {
      parsedNotes = JSON.parse(notes);
    } catch {
      return false;
    }
  }

  // Check completion based on phase type
  switch (phaseType) {
    case "application":
      // Application form completed if we have answers
      return !!parsedNotes.applicationAnswers?.length;
    
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
 * Gets the next phase in the workflow after the current phase
 */
function getNextPhase(
  currentPhaseId: string,
  workflowSteps: WorkflowStep[]
): WorkflowStep | null {
  const currentIndex = workflowSteps.findIndex(s => s.id === currentPhaseId);
  if (currentIndex === -1 || currentIndex >= workflowSteps.length - 1) {
    return null;
  }
  return workflowSteps[currentIndex + 1];
}

/**
 * Processes all pending applications for a job when switching to autopilot mode.
 * This "catches up" applications that were waiting for manual review.
 * 
 * For each application:
 * 1. Check if current phase is complete (candidate has done their part)
 * 2. Run AI analysis if no score exists
 * 3. If score >= passing_score, advance to next phase
 * 4. Send notification to candidate
 */
export async function processAutopilotCatchUp(
  jobId: string
): Promise<CatchUpResult> {
  const result: CatchUpResult = {
    processed: 0,
    advanced: 0,
    failed: 0,
  };

  try {
    console.log("[processAutopilotCatchUp] Starting catch-up for job:", jobId);

    // Fetch job details to get workflow steps and passing score
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("workflow_steps, passing_score, title, employer_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      console.error("[processAutopilotCatchUp] Failed to fetch job:", jobError);
      return result;
    }

    const workflowSteps = (job.workflow_steps as unknown as WorkflowStep[]) || [];
    const passingScore = job.passing_score || 60;

    // Fetch employer profile for company name
    const { data: employerProfile } = await supabase
      .from("profiles")
      .select("company_name")
      .eq("user_id", job.employer_id)
      .single();

    const companyName = employerProfile?.company_name || undefined;

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
      console.log("[processAutopilotCatchUp] No pending applications to process");
      return result;
    }

    console.log(`[processAutopilotCatchUp] Found ${applications.length} applications to process`);

    // Process each application
    for (const application of applications) {
      result.processed++;

      try {
        const currentPhaseId = application.phase || "application";
        const currentPhase = workflowSteps.find(s => s.id === currentPhaseId);
        const currentPhaseType = currentPhase?.type || "application";

        // Check if candidate has completed their part of the current phase
        const isPhaseComplete = hasCompletedPhase(
          currentPhaseId,
          currentPhaseType,
          application.notes,
          application.voice_interview_result
        );

        if (!isPhaseComplete) {
          console.log(`[processAutopilotCatchUp] Application ${application.id} phase not complete, skipping`);
          continue;
        }

        // Run AI analysis if no score exists
        let aiScore = application.ai_score;
        if (aiScore === null || aiScore === undefined) {
          console.log(`[processAutopilotCatchUp] Running AI analysis for application ${application.id}`);
          await triggerAvaAnalysis(application.id);
          
          // Fetch updated score
          const { data: updated } = await supabase
            .from("applications")
            .select("ai_score")
            .eq("id", application.id)
            .single();
          
          aiScore = updated?.ai_score ?? null;
        }

        console.log(`[processAutopilotCatchUp] Application ${application.id} score: ${aiScore}, passing: ${passingScore}`);

        // Check if candidate passed
        if (aiScore !== null && aiScore >= passingScore) {
          // Find next phase
          const nextPhase = getNextPhase(currentPhaseId, workflowSteps);
          
          if (nextPhase) {
            // Advance to next phase
            const { error: updateError } = await supabase
              .from("applications")
              .update({
                phase: nextPhase.id,
                status: "reviewing", // Keep in reviewing status
                updated_at: new Date().toISOString(),
              })
              .eq("id", application.id);

            if (updateError) {
              console.error(`[processAutopilotCatchUp] Failed to advance application ${application.id}:`, updateError);
              result.failed++;
              continue;
            }

            result.advanced++;
            console.log(`[processAutopilotCatchUp] Advanced application ${application.id} to phase: ${nextPhase.id}`);

            // Send notification to candidate
            try {
              await notifyPhaseAdvanced(
                application.candidate_id,
                nextPhase.title,
                job.title,
                companyName
              );
            } catch (notifyError) {
              console.error(`[processAutopilotCatchUp] Failed to send notification:`, notifyError);
              // Don't mark as failed, advancement was successful
            }
          } else {
            console.log(`[processAutopilotCatchUp] Application ${application.id} at final phase`);
          }
        } else {
          console.log(`[processAutopilotCatchUp] Application ${application.id} score ${aiScore} below passing ${passingScore}`);
        }
      } catch (appProcessError) {
        console.error(`[processAutopilotCatchUp] Error processing application ${application.id}:`, appProcessError);
        result.failed++;
      }
    }

    console.log(`[processAutopilotCatchUp] Complete. Processed: ${result.processed}, Advanced: ${result.advanced}, Failed: ${result.failed}`);
    return result;
  } catch (error) {
    console.error("[processAutopilotCatchUp] Unexpected error:", error);
    return result;
  }
}
