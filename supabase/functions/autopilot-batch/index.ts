import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(
    JSON.stringify(body),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function invokeTriggerAvaAnalysis(params: {
  supabaseUrl: string;
  anonKey: string;
  authHeader: string;
  applicationId: string;
  currentPhaseId: string;
  force: boolean;
  autopilotDecision: boolean;
  previewOnly: boolean;
}) {
  const response = await fetch(`${params.supabaseUrl}/functions/v1/trigger-ava-analysis`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: params.anonKey,
      Authorization: params.authHeader,
    },
    body: JSON.stringify({
      applicationId: params.applicationId,
      currentPhaseId: params.currentPhaseId,
      force: params.force,
      autopilotDecision: params.autopilotDecision,
      previewOnly: params.previewOnly,
    }),
  });

  const responseText = await response.text();
  let parsedBody: unknown = null;
  if (responseText) {
    try {
      parsedBody = JSON.parse(responseText);
    } catch {
      parsedBody = responseText;
    }
  }

  if (!response.ok) {
    return {
      data: null,
      error: {
        message:
          (parsedBody &&
          typeof parsedBody === "object" &&
          "error" in parsedBody &&
          typeof parsedBody.error === "string"
            ? parsedBody.error
            : responseText) || `trigger-ava-analysis returned ${response.status}`,
        status: response.status,
        body: parsedBody ?? responseText,
      },
    };
  }

  return {
    data: parsedBody,
    error: null,
  };
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
  application: {
    ai_score?: number | null;
    ai_analysis?: string | null;
    resume_url?: string | null;
    cover_letter?: string | null;
  },
) {
  const parsedNotes = parseNotes(notes);

  switch (phaseType) {
    case "application":
      return (
        (Array.isArray(parsedNotes.applicationAnswers)
          && parsedNotes.applicationAnswers.length > 0
          && parsedNotes.applicationAnswers.some((answer: any) => answer.answer && String(answer.answer).trim() !== ""))
        || !!application.resume_url
        || !!application.cover_letter
        || typeof application.ai_score === "number"
        || !!application.ai_analysis
        || Object.keys(parsedNotes).length > 0
      );
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
    case "video_message":
      return !!parsedNotes.videoIntroUrl;
    case "portfolio_upload":
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Authentication required" }, 401);
    }

    const { jobId, previewOnly = false } = await req.json();
    if (!jobId) {
      return jsonResponse({ error: "jobId is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Invalid authentication token" }, 401);
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from("jobs")
      .select("id, title, employer_id, passing_score, workflow_steps, quiz_questions")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return jsonResponse({ error: "Job not found" }, 404);
    }

    const [{ data: developerRole }, { data: teamMembership }] = await Promise.all([
      supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "developer")
        .maybeSingle(),
      supabaseAdmin
        .from("team_members")
        .select("id, can_create_jobs, assigned_job_ids")
        .eq("user_id", user.id)
        .eq("employer_id", job.employer_id)
        .eq("status", "active")
        .maybeSingle(),
    ]);

    const teamCanAccessJob = !!teamMembership
      && teamMembership.can_create_jobs !== false
      && (!Array.isArray(teamMembership.assigned_job_ids)
        || teamMembership.assigned_job_ids.length === 0
        || teamMembership.assigned_job_ids.includes(jobId));

    if (job.employer_id !== user.id && !developerRole && !teamCanAccessJob) {
      return jsonResponse({ error: "You do not have permission to manage this job" }, 403);
    }

    const { data: allApplications, error: applicationsError } = await supabaseAdmin
      .from("applications")
      .select("id, candidate_id, ai_score, ai_analysis, phase, notes, voice_interview_result, status, resume_url, cover_letter")
      .eq("job_id", jobId);

    if (applicationsError) {
      return jsonResponse({ error: "Failed to load applications", details: applicationsError.message }, 500);
    }

    const applications = (allApplications || []).filter((application) => {
      const normalizedStatus = (application.status || "").toLowerCase();
      return !["rejected", "hired", "offered"].includes(normalizedStatus);
    });

    const candidateIds = [...new Set((applications || []).map((application) => application.candidate_id))];
    const { data: profiles } = candidateIds.length > 0
      ? await supabaseAdmin
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", candidateIds)
      : { data: [] };
    const profileMap = new Map(
      (profiles || []).map((profile: any) => [
        profile.user_id,
        {
          name: profile.full_name || "Unknown Applicant",
          email: profile.email || "",
        },
      ]),
    );

    const workflowSteps = Array.isArray(job.workflow_steps) ? job.workflow_steps : [];
    const passingScore = job.passing_score || 60;
    const response = {
      success: true,
      previewOnly,
      jobId,
      passingScore,
      totals: {
        processed: 0,
        reject: 0,
        advance: 0,
        defer: 0,
        review: 0,
        failed: 0,
      },
      applicants: [] as Record<string, unknown>[],
    };

    for (const application of applications || []) {
      const phaseId = application.phase || "application";
      const normalizedStatus = (application.status || "").toLowerCase();
      const phaseType =
        phaseId === "application"
          ? "application"
          : phaseId === "quiz"
            ? "quiz"
            : (workflowSteps.find((step: any) => step?.id === phaseId)?.type || "unknown");
      const isWaitingStatus =
        normalizedStatus === "pending"
        || normalizedStatus === "reviewing"
        || normalizedStatus === "submitted";

      if (!isWaitingStatus && !hasCompletedPhase(phaseId, phaseType, application.notes as any, application.voice_interview_result, application)) {
        continue;
      }

      response.totals.processed++;

      const profile = profileMap.get(application.candidate_id);
      const { data: decisionData, error: decisionError } = await invokeTriggerAvaAnalysis({
        supabaseUrl,
        anonKey,
        authHeader,
        applicationId: application.id,
        currentPhaseId: phaseId,
        force: application.ai_score === null || application.ai_score === undefined,
        autopilotDecision: !previewOnly,
        previewOnly,
      });

      if (decisionError) {
        response.totals.failed++;
        response.applicants.push({
          applicationId: application.id,
          candidateId: application.candidate_id,
          candidateName: profile?.name || "Unknown Applicant",
          candidateEmail: profile?.email || "",
          currentPhaseId: phaseId,
          action: "failed",
          error: decisionError.message,
        });
        continue;
      }

      const scorecard = (decisionData?.scorecard || null) as Record<string, any> | null;
      const autopilotAction = scorecard?.autopilotAction || (decisionData?.decision === "rejected" ? "reject" : "advance");
      const decisionState = scorecard?.decisionState || "ready_for_decision";
      const needsEmployerReview = decisionData?.decision === "needs_employer_approval"
        || (!decisionData?.nextPhaseId && autopilotAction !== "reject");

      if (autopilotAction === "reject") {
        response.totals.reject++;
      } else if (needsEmployerReview) {
        response.totals.review++;
      } else if (autopilotAction === "defer" || decisionState === "needs_more_evidence") {
        response.totals.defer++;
      } else {
        response.totals.advance++;
      }

      response.applicants.push({
        applicationId: application.id,
        candidateId: application.candidate_id,
        candidateName: profile?.name || "Unknown Applicant",
        candidateEmail: profile?.email || "",
        currentPhaseId: phaseId,
        score: decisionData?.score ?? application.ai_score ?? null,
        action: needsEmployerReview ? "review" : autopilotAction,
        decision: decisionData?.decision || null,
        decisionState,
        nextPhaseId: decisionData?.nextPhaseId || null,
        nextPhaseTitle: decisionData?.nextPhaseTitle || null,
        rationale: scorecard?.rationale || null,
        pendingHighSignalPhases: scorecard?.pendingHighSignalPhases || [],
        hardRejectReason: scorecard?.hardRejectReason || null,
      });
    }

    return jsonResponse(response);
  } catch (error) {
    console.error("[autopilot-batch] Unexpected error:", error);
    return jsonResponse({
      error: "Unexpected error",
      details: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});
