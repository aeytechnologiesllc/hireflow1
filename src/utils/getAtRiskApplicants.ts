import { supabase } from "@/integrations/supabase/client";

export interface AtRiskApplicant {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  aiScore: number;
  phase: string;
}

function parseNotes(notes: string | Record<string, any> | null): Record<string, any> {
  if (!notes) return {};
  if (typeof notes === "object") return notes as Record<string, any>;

  if (typeof notes === "string") {
    try {
      return JSON.parse(notes);
    } catch {
      return {};
    }
  }

  return {};
}

function hasCompletedPhase(
  phaseId: string,
  phaseType: string,
  notes: string | Record<string, any> | null,
  voiceInterviewResult: any,
): boolean {
  const parsedNotes = parseNotes(notes);

  switch (phaseType) {
    case "application":
      return Array.isArray(parsedNotes.applicationAnswers)
        && parsedNotes.applicationAnswers.length > 0
        && parsedNotes.applicationAnswers.some((answer: any) => answer.answer && answer.answer.trim() !== "");
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
      return true;
    default:
      return Object.keys(parsedNotes).length > 0;
  }
}

/**
 * Fetches applicants who are below the job's passing score and would be 
 * rejected if autopilot mode is engaged.
 */
export async function getAtRiskApplicants(jobId: string): Promise<{
  atRiskApplicants: AtRiskApplicant[];
  passingScore: number;
}> {
  // Fetch job's passing score
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("passing_score, workflow_steps, quiz_questions")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    console.error("[getAtRiskApplicants] Failed to fetch job:", jobError);
    return { atRiskApplicants: [], passingScore: 60 };
  }

  const passingScore = job.passing_score || 60;
  const workflowSteps = Array.isArray(job.workflow_steps) ? job.workflow_steps : [];

  // Fetch all active applications, including those without ai_score yet.
  // The confirmation dialog should warn using the same catch-up logic autopilot will use.
  const { data: applications, error: appError } = await supabase
    .from("applications")
    .select(`
      id,
      candidate_id,
      ai_score,
      phase,
      notes,
      voice_interview_result
    `)
    .eq("job_id", jobId)
    .in("status", ["pending", "reviewing", "in_progress"]);

  if (appError) {
    console.error("[getAtRiskApplicants] Failed to fetch applications:", appError);
    return { atRiskApplicants: [], passingScore };
  }

  if (!applications || applications.length === 0) {
    return { atRiskApplicants: [], passingScore };
  }

  const scoredApplications: Array<{
    id: string;
    candidate_id: string;
    ai_score: number | null;
    phase: string | null;
  }> = [];

  for (const application of applications) {
    const currentPhaseId = application.phase || "application";
    const currentPhaseType =
      currentPhaseId === "application"
        ? "application"
        : currentPhaseId === "quiz"
          ? "quiz"
          : (workflowSteps.find((step: any) => step?.id === currentPhaseId)?.type || "unknown");

    if (!hasCompletedPhase(currentPhaseId, currentPhaseType, application.notes as any, application.voice_interview_result)) {
      continue;
    }

    let aiScore = application.ai_score;

    if (aiScore === null || aiScore === undefined) {
      const { error: analysisError } = await supabase.functions.invoke("trigger-ava-analysis", {
        body: {
          applicationId: application.id,
          force: true,
          currentPhaseId,
        },
      });

      if (analysisError) {
        console.error(`[getAtRiskApplicants] Failed to pre-score application ${application.id}:`, analysisError);
        continue;
      }

      const { data: refreshedApplication } = await supabase
        .from("applications")
        .select("ai_score")
        .eq("id", application.id)
        .single();

      aiScore = refreshedApplication?.ai_score ?? null;
    }

    if (aiScore !== null && aiScore < passingScore) {
      scoredApplications.push({
        id: application.id,
        candidate_id: application.candidate_id,
        ai_score: aiScore,
        phase: application.phase,
      });
    }
  }

  if (scoredApplications.length === 0) {
    return { atRiskApplicants: [], passingScore };
  }

  // Fetch candidate profiles for names
  const candidateIds = scoredApplications.map(a => a.candidate_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name, email")
    .in("user_id", candidateIds);

  const profileMap = new Map(
    profiles?.map(p => [p.user_id, { name: p.full_name || "Unknown", email: p.email }]) || []
  );

  const atRiskApplicants: AtRiskApplicant[] = scoredApplications.map(app => {
    const profile = profileMap.get(app.candidate_id);
    return {
      id: app.id,
      candidateId: app.candidate_id,
      candidateName: profile?.name || "Unknown Applicant",
      candidateEmail: profile?.email || "",
      aiScore: app.ai_score!,
      phase: app.phase || "application",
    };
  });

  // Sort by score ascending (lowest first)
  atRiskApplicants.sort((a, b) => a.aiScore - b.aiScore);

  return { atRiskApplicants, passingScore };
}
