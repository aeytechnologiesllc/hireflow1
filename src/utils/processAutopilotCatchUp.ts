import { supabase } from "@/integrations/supabase/client";
import { notifyPhaseAdvanced, notifyInterviewReady } from "./emailNotifications";

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
    // Fetch job details to get workflow steps, passing score, required WPM, and quiz questions
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("processing_mode, workflow_steps, passing_score, required_wpm, title, employer_id, quiz_questions")
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
    const passingScore = job.passing_score || 60;
    const requiredWpm = job.required_wpm || 35;
    const quizQuestions = job.quiz_questions as unknown as Array<Record<string, unknown>> | null;
    const hasQuizQuestions = Array.isArray(quizQuestions) && quizQuestions.length > 0;
    const hasTypingTest = workflowSteps.some(step => step.type === 'typing_test');

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
        
        // FIRST: Check AI score - reject immediately if below threshold (regardless of phase completion)
        let aiScore = application.ai_score;
        
        // Run AI analysis via backend function if no score exists
        // The backend function computes the weighted overall score (resume + quiz + voice + portfolio)
        if (aiScore === null || aiScore === undefined) {
          const { error: analysisError } = await supabase.functions.invoke("trigger-ava-analysis", {
            body: {
              applicationId: application.id,
              force: true,
            },
          });
          
          if (analysisError) {
            console.error(`[processAutopilotCatchUp] Backend analysis error for ${application.id}:`, analysisError);
          }
          
          // Fetch updated score
          const { data: updated } = await supabase
            .from("applications")
            .select("ai_score")
            .eq("id", application.id)
            .single();
          
          aiScore = updated?.ai_score ?? null;
        }

        // Check if score is below threshold - REJECT regardless of phase completion
        if (aiScore !== null && aiScore < passingScore) {
          const rejectionReason = `Overall Ava score of ${aiScore}% is below the passing threshold of ${passingScore}%. This application was automatically rejected by Ava when autopilot mode was engaged. The candidate did not meet the minimum score requirements for this position.`;
          
          const { error: rejectError } = await supabase
            .from("applications")
            .update({
              status: "rejected",
              rejected_by: null, // Use null since this is a UUID column - Ava doesn't have a user ID
              rejected_by_type: "ava", // This field identifies Ava as the rejector
              phase_ai_analysis: rejectionReason,
              updated_at: new Date().toISOString(),
            })
            .eq("id", application.id);

          if (rejectError) {
            console.error(`[processAutopilotCatchUp] Failed to reject application ${application.id}:`, rejectError);
            result.failed++;
          } else {
            result.rejected++;
          }
          continue; // Move to next application after rejection
        }

        // SECOND: Check typing test failure - reject if WPM is below required threshold
        if (hasTypingTest && application.notes) {
          try {
            const parsedNotes = typeof application.notes === 'string' 
              ? JSON.parse(application.notes) 
              : application.notes;
            
            const typingTestResult = parsedNotes?.typingTestResult;
            if (typingTestResult && typingTestResult.wpm !== undefined) {
              const candidateWpm = typingTestResult.wpm;
              
              // Check if candidate's WPM is below the required threshold
              if (candidateWpm < requiredWpm) {
                const rejectionReason = `Typing test failed. Speed: ${candidateWpm} WPM (required: ${requiredWpm} WPM). This application was automatically rejected by Ava because the candidate did not meet the minimum typing speed requirement.`;
                
                const { error: rejectError } = await supabase
                  .from("applications")
                  .update({
                    status: "rejected",
                    rejected_by: null,
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
                }
                continue; // Move to next application after rejection
              }
            }
          } catch (parseError) {
            // Could not parse notes for typing test check
          }
        }

        // THEN: Check if candidate has completed their part of the current phase
        const isPhaseComplete = hasCompletedPhase(
          currentPhaseId,
          currentPhaseType,
          application.notes,
          application.voice_interview_result
        );

        if (!isPhaseComplete) {
          continue;
        }

        // Check if candidate passed - advance to next phase
        if (aiScore !== null && aiScore >= passingScore) {
          // Find next phase
          const nextPhase = getNextPhase(currentPhaseId, workflowSteps, hasQuizQuestions);
          
          if (nextPhase) {
            // STOP before voice_interview - requires employer to configure
            if (nextPhase.type === "voice_interview") {
              // Don't advance - employer must manually configure and approve for Ava interview
              // Just update the status to show they're ready
              await supabase
                .from("applications")
                .update({
                  status: "reviewing",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", application.id);
              
              // Notify employer that candidate is ready for AIVA interview
              try {
                // Fetch candidate profile for name
                const { data: candidateProfile } = await supabase
                  .from("profiles")
                  .select("full_name, email")
                  .eq("user_id", application.candidate_id)
                  .single();
                
                const candidateName = candidateProfile?.full_name || candidateProfile?.email || "A candidate";
                
                // Create in-app notification for employer
                await supabase.from("notifications").insert({
                  user_id: job.employer_id,
                  type: "interview",
                  title: "Candidate Ready for AIVA Interview",
                  message: `${candidateName} scored ${aiScore}% and is ready for the AIVA voice interview for ${job.title}`,
                  link: `/applicants/${application.id}`,
                  is_read: false,
                });
                
                // Send email notification
                await notifyInterviewReady(
                  job.employer_id,
                  candidateName,
                  job.title,
                  aiScore
                );
                
              } catch (notifyError) {
                console.error(`[processAutopilotCatchUp] Failed to notify employer:`, notifyError);
              }
              
              continue;
            }
            
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
          }
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
