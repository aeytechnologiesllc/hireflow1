import { supabase } from "@/integrations/supabase/client";
import { triggerAvaAnalysis } from "./triggerAvaAnalysis";
import { notifyPhaseAdvanced } from "./emailNotifications";

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
      console.log("[parseNotes] Failed to parse notes string:", notes.substring(0, 100));
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
  
  console.log(`[hasCompletedPhase] phaseId=${phaseId}, phaseType=${phaseType}, notesType=${typeof notes}, notesKeys=${Object.keys(parsedNotes).join(",")}`);

  // Check completion based on phase type
  switch (phaseType) {
    case "application":
      // Application form completed if we have ANY answers (applicationAnswers array or individual question fields)
      const hasApplicationAnswers = !!parsedNotes.applicationAnswers?.length;
      const hasAnyAnswers = Object.keys(parsedNotes).some(key => 
        key !== "resumeUrl" && key !== "coverLetter" && parsedNotes[key]
      );
      const isComplete = hasApplicationAnswers || hasAnyAnswers || Object.keys(parsedNotes).length > 0;
      console.log(`[hasCompletedPhase] application phase: hasApplicationAnswers=${hasApplicationAnswers}, hasAnyAnswers=${hasAnyAnswers}, isComplete=${isComplete}`);
      return isComplete;
    
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
  console.log(`[getNextPhase] currentPhaseId=${currentPhaseId}, hasQuiz=${hasQuizQuestions}, workflowStepsCount=${workflowSteps.length}`);
  
  // If currently at "application" phase
  if (currentPhaseId === "application") {
    // If job has quiz questions, next phase is the quiz
    if (hasQuizQuestions) {
      console.log("[getNextPhase] application -> quiz (job has quiz questions)");
      return { id: "quiz", type: "quiz", title: "Quiz" };
    }
    // Otherwise, go to first workflow step
    if (workflowSteps.length > 0) {
      console.log(`[getNextPhase] application -> ${workflowSteps[0].id} (first workflow step)`);
      return workflowSteps[0];
    }
    console.log("[getNextPhase] application -> null (no more phases)");
    return null;
  }
  
  // If currently at "quiz" phase, go to first workflow step
  if (currentPhaseId === "quiz") {
    if (workflowSteps.length > 0) {
      console.log(`[getNextPhase] quiz -> ${workflowSteps[0].id} (first workflow step)`);
      return workflowSteps[0];
    }
    console.log("[getNextPhase] quiz -> null (no workflow steps)");
    return null;
  }
  
  // Otherwise, find current position in workflow_steps
  const currentIndex = workflowSteps.findIndex(s => s.id === currentPhaseId);
  if (currentIndex === -1) {
    console.log(`[getNextPhase] ${currentPhaseId} not found in workflow_steps`);
    return null;
  }
  if (currentIndex >= workflowSteps.length - 1) {
    console.log(`[getNextPhase] ${currentPhaseId} is the last workflow step`);
    return null;
  }
  
  const nextStep = workflowSteps[currentIndex + 1];
  console.log(`[getNextPhase] ${currentPhaseId} -> ${nextStep.id}`);
  return nextStep;
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
    rejected: 0,
    failed: 0,
  };

  try {
    console.log("[processAutopilotCatchUp] Starting catch-up for job:", jobId);

    // Fetch job details to get workflow steps, passing score, and quiz questions
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("workflow_steps, passing_score, title, employer_id, quiz_questions")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      console.error("[processAutopilotCatchUp] Failed to fetch job:", jobError);
      return result;
    }

    const workflowSteps = (job.workflow_steps as unknown as WorkflowStep[]) || [];
    const passingScore = job.passing_score || 60;
    const quizQuestions = job.quiz_questions as unknown as any[] | null;
    const hasQuizQuestions = Array.isArray(quizQuestions) && quizQuestions.length > 0;
    
    console.log(`[processAutopilotCatchUp] Job config: passingScore=${passingScore}, hasQuiz=${hasQuizQuestions}, workflowStepsCount=${workflowSteps.length}`);

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
        
        console.log(`[processAutopilotCatchUp] Application ${application.id} at phase=${currentPhaseId}, type=${currentPhaseType}`);

        // FIRST: Check AI score - reject immediately if below threshold (regardless of phase completion)
        let aiScore = application.ai_score;
        
        // Run AI analysis if no score exists
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

        // Check if score is below threshold - REJECT regardless of phase completion
        if (aiScore !== null && aiScore < passingScore) {
          const rejectionReason = `Overall AI score of ${aiScore}% is below the passing threshold of ${passingScore}%. This application was automatically rejected by Ava when autopilot mode was engaged. The candidate did not meet the minimum score requirements for this position.`;
          
          console.log(`[processAutopilotCatchUp] Rejecting application ${application.id} - score ${aiScore} below passing ${passingScore}`);
          
          const { error: rejectError } = await supabase
            .from("applications")
            .update({
              status: "rejected",
              rejected_by: "ava",
              rejected_by_type: "ava",
              phase_ai_analysis: rejectionReason,
              updated_at: new Date().toISOString(),
            })
            .eq("id", application.id);

          if (rejectError) {
            console.error(`[processAutopilotCatchUp] Failed to reject application ${application.id}:`, rejectError);
            result.failed++;
          } else {
            result.rejected++;
            console.log(`[processAutopilotCatchUp] Rejected application ${application.id}`);
          }
          continue; // Move to next application after rejection
        }

        // THEN: Check if candidate has completed their part of the current phase
        const isPhaseComplete = hasCompletedPhase(
          currentPhaseId,
          currentPhaseType,
          application.notes,
          application.voice_interview_result
        );

        if (!isPhaseComplete) {
          console.log(`[processAutopilotCatchUp] Application ${application.id} phase not complete, skipping advancement`);
          continue;
        }

        // Check if candidate passed - advance to next phase
        if (aiScore !== null && aiScore >= passingScore) {
          // Find next phase
          const nextPhase = getNextPhase(currentPhaseId, workflowSteps, hasQuizQuestions);
          
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
        } else if (aiScore === null) {
          console.log(`[processAutopilotCatchUp] Application ${application.id} has no score yet, skipping`);
        }
      } catch (appProcessError) {
        console.error(`[processAutopilotCatchUp] Error processing application ${application.id}:`, appProcessError);
        result.failed++;
      }
    }

    console.log(`[processAutopilotCatchUp] Complete. Processed: ${result.processed}, Advanced: ${result.advanced}, Rejected: ${result.rejected}, Failed: ${result.failed}`);
    return result;
  } catch (error) {
    console.error("[processAutopilotCatchUp] Unexpected error:", error);
    return result;
  }
}
