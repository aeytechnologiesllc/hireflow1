import { supabase } from "@/integrations/supabase/client";

export interface AtRiskApplicant {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  aiScore: number;
  phase: string;
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
    .select("passing_score")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    console.error("[getAtRiskApplicants] Failed to fetch job:", jobError);
    return { atRiskApplicants: [], passingScore: 60 };
  }

  const passingScore = job.passing_score || 60;

  // Fetch all non-rejected applications that have an AI score below passing
  const { data: applications, error: appError } = await supabase
    .from("applications")
    .select(`
      id,
      candidate_id,
      ai_score,
      phase
    `)
    .eq("job_id", jobId)
    .in("status", ["pending", "reviewing", "in_progress"])
    .not("ai_score", "is", null)
    .lt("ai_score", passingScore);

  if (appError) {
    console.error("[getAtRiskApplicants] Failed to fetch applications:", appError);
    return { atRiskApplicants: [], passingScore };
  }

  if (!applications || applications.length === 0) {
    return { atRiskApplicants: [], passingScore };
  }

  // Fetch candidate profiles for names
  const candidateIds = applications.map(a => a.candidate_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name, email")
    .in("user_id", candidateIds);

  const profileMap = new Map(
    profiles?.map(p => [p.user_id, { name: p.full_name || "Unknown", email: p.email }]) || []
  );

  const atRiskApplicants: AtRiskApplicant[] = applications.map(app => {
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
