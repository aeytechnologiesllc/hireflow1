import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  detectResumeUrl,
  fetchResumeText,
  fetchResumeVisualInputs,
  isFileLikeUrl,
  isResumeQuestion,
  type ResumeVisualInput,
} from "../_shared/resume.ts";
import {
  buildAvaScorecard,
  buildEvidenceFingerprint,
  inferJobFamily,
  resolveAutopilotAction,
  type AvaScorecard,
  type AutopilotAction,
} from "../_shared/autopilot.ts";

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

function weightedAverage(values: Array<{ value: number | null | undefined; weight: number }>, fallback: number) {
  let weightedTotal = 0;
  let weightTotal = 0;

  for (const entry of values) {
    if (typeof entry.value === "number" && Number.isFinite(entry.value)) {
      weightedTotal += entry.value * entry.weight;
      weightTotal += entry.weight;
    }
  }

  if (weightTotal === 0) {
    return fallback;
  }

  return weightedTotal / weightTotal;
}

function getAutopilotNextPhase(params: {
  currentPhaseId: string | null;
  workflowSteps: any[];
  hasQuizQuestions: boolean;
}) {
  const { currentPhaseId, workflowSteps, hasQuizQuestions } = params;
  const phaseId = currentPhaseId || "application";
  const nonVoiceSteps = workflowSteps.filter((step: any) => step?.type !== "voice_interview");

  if (phaseId === "application") {
    if (hasQuizQuestions) {
      return { nextPhaseId: "quiz", nextPhaseTitle: "Quiz" };
    }
    if (nonVoiceSteps.length > 0) {
      return { nextPhaseId: nonVoiceSteps[0].id, nextPhaseTitle: nonVoiceSteps[0].title || nonVoiceSteps[0].type };
    }
    return null;
  }

  if (phaseId === "quiz") {
    if (nonVoiceSteps.length > 0) {
      return { nextPhaseId: nonVoiceSteps[0].id, nextPhaseTitle: nonVoiceSteps[0].title || nonVoiceSteps[0].type };
    }
    return null;
  }

  const currentIndex = workflowSteps.findIndex((step: any) => step?.id === phaseId);
  if (currentIndex === -1) {
    return { nextPhaseId: phaseId, nextPhaseTitle: phaseId };
  }

  const remainingSteps = workflowSteps.slice(currentIndex + 1);
  for (const step of remainingSteps) {
    if (step?.type === "voice_interview") {
      return null;
    }
    return { nextPhaseId: step.id, nextPhaseTitle: step.title || step.type };
  }

  return { nextPhaseId: "review", nextPhaseTitle: "Review" };
}

function applyExpectedApplicationStateFilter(
  query: any,
  expectedStatus: string | null | undefined,
  expectedPhase: string | null | undefined,
) {
  let nextQuery = query;

  if (expectedStatus == null) {
    nextQuery = nextQuery.is("status", null);
  } else {
    nextQuery = nextQuery.eq("status", expectedStatus);
  }

  if (expectedPhase == null) {
    nextQuery = nextQuery.is("phase", null);
  } else {
    nextQuery = nextQuery.eq("phase", expectedPhase);
  }

  return nextQuery;
}

async function notifyEmployerInterviewReady(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  employerId: string | null | undefined;
  job: any;
  profile: any;
  applicationId: string;
  score: number | null;
}) {
  const { supabaseAdmin, employerId, job, profile, applicationId, score } = params;
  if (!employerId) return;

  try {
    const candidateName = profile?.full_name || profile?.email || "A candidate";
    const jobTitle = job?.title || "your job posting";

    await supabaseAdmin.from("notifications").insert({
      user_id: employerId,
      type: "interview",
      title: "Candidate Ready for AIVA Interview",
      message: `${candidateName} scored ${score ?? "N/A"}% and is ready for the AIVA voice interview for ${jobTitle}`,
      link: `/applicants/${applicationId}`,
      is_read: false,
    });

    await supabaseAdmin.functions.invoke("send-notification-email", {
      body: {
        type: "interview_ready",
        recipient_user_id: employerId,
        data: {
          candidate_name: candidateName,
          job_title: jobTitle,
          score: score?.toString(),
        },
      },
    });
  } catch (notifyError) {
    console.error("[trigger-ava-analysis] Failed to notify employer:", notifyError);
  }
}

async function handleAutopilotDecision(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  application: any;
  applicationId: string;
  currentPhaseId: string | null;
  passingScore: number;
  score: number | null;
  scorecard: AvaScorecard | null;
  profile: any;
  job: any;
  previewOnly: boolean;
}) {
  const {
    supabaseAdmin,
    application,
    applicationId,
    currentPhaseId,
    passingScore,
    score,
    scorecard,
    profile,
    job,
    previewOnly,
  } = params;

  const workflowSteps = (job?.workflow_steps as any[]) || [];
  const quizQuestions = job?.quiz_questions as any[] | undefined;
  const hasQuizQuestions = Array.isArray(quizQuestions) && quizQuestions.length > 0;
  const autopilotAction = resolveAutopilotAction(score, passingScore, scorecard);
  const nextPhase = getAutopilotNextPhase({
    currentPhaseId,
    workflowSteps,
    hasQuizQuestions,
  });

  const { data: latestApplication, error: latestApplicationError } = await supabaseAdmin
    .from("applications")
    .select("id, status, phase, rejected_by_type")
    .eq("id", applicationId)
    .single();

  if (latestApplicationError) {
    console.error("[trigger-ava-analysis] Failed to load latest application state:", latestApplicationError);
    return jsonResponse({
      error: "Failed to load the latest application state",
      details: latestApplicationError.message,
    }, 500);
  }

  const latestStatus = latestApplication?.status ?? null;
  const latestPhase = latestApplication?.phase ?? null;
  const staleApplicationState =
    latestStatus !== application.status ||
    latestPhase !== application.phase ||
    latestStatus === "rejected" ||
    latestStatus === "hired";

  if (previewOnly) {
    return jsonResponse({
      success: true,
      previewOnly: true,
      score,
      decision: autopilotAction === "reject" ? "rejected" : "advanced",
      autopilotAction,
      nextPhaseId: nextPhase?.nextPhaseId ?? null,
      nextPhaseTitle: nextPhase?.nextPhaseTitle ?? null,
      scorecard,
    });
  }

  if (staleApplicationState) {
    console.log("[trigger-ava-analysis] Skipping stale autopilot write", {
      applicationId,
      expectedStatus: application.status,
      expectedPhase: application.phase,
      latestStatus,
      latestPhase,
    });

    return jsonResponse({
      success: true,
      skipped: true,
      message: "Application state changed before the autopilot decision could be applied",
      score,
      decision: latestStatus === "rejected" ? "rejected" : "stale",
      autopilotAction,
      currentStatus: latestStatus,
      currentPhase: latestPhase,
      scorecard,
    });
  }

  if (autopilotAction === "reject") {
    const rejectReason = scorecard?.hardRejectReason
      ? `${scorecard.hardRejectReason}.`
      : `Overall Ava score of ${score || 0}% is below the passing threshold of ${passingScore}%.`;

    const rejectQuery = applyExpectedApplicationStateFilter(
      supabaseAdmin
        .from("applications")
        .update({
          status: "rejected",
          rejected_by_type: "ava",
          phase_ai_analysis: rejectReason,
        }),
      latestStatus,
      latestPhase,
    );

    const { data: rejectedApplication, error: rejectError } = await rejectQuery
      .eq("id", applicationId)
      .select("id, status, phase, rejected_by_type")
      .maybeSingle();

    if (rejectError) {
      console.error("[trigger-ava-analysis] Failed to reject application:", rejectError);
      return jsonResponse({
        error: "Failed to reject application",
        details: rejectError.message,
      }, 500);
    }

    if (!rejectedApplication) {
      console.log("[trigger-ava-analysis] Reject write skipped because application state changed mid-flight", {
        applicationId,
        expectedStatus: latestStatus,
        expectedPhase: latestPhase,
      });

      return jsonResponse({
        success: true,
        skipped: true,
        message: "Application state changed before the reject decision could be applied",
        score,
        decision: "stale",
        autopilotAction,
        currentStatus: latestStatus,
        currentPhase: latestPhase,
        scorecard,
      });
    }

    try {
      const jobTitle = job?.title || "this position";
      const { data: employerProfile } = await supabaseAdmin
        .from("profiles")
        .select("company_name")
        .eq("user_id", job?.employer_id)
        .single();

      await supabaseAdmin.functions.invoke("send-notification-email", {
        body: {
          type: "status_rejected",
          recipientUserId: application.candidate_id,
          data: {
            job_title: jobTitle,
            company_name: employerProfile?.company_name || undefined,
          },
        },
      });
    } catch (emailError) {
      console.error("[trigger-ava-analysis] Failed to send rejection email:", emailError);
    }

    return jsonResponse({
      success: true,
      message: "Analysis completed, candidate rejected",
      score,
      decision: "rejected",
      reason: rejectReason,
      autopilotAction,
      updatedApplication: rejectedApplication,
      scorecard,
    });
  }

  if (!nextPhase) {
    await notifyEmployerInterviewReady({
      supabaseAdmin,
      employerId: job?.employer_id,
      job,
      profile,
      applicationId,
      score,
    });

    return jsonResponse({
      success: true,
      message: "Analysis completed, awaiting employer configuration for Ava interview",
      score,
      decision: "needs_employer_approval",
      reason: "Next phase is Ava Interview which requires employer configuration",
      autopilotAction,
      scorecard,
    });
  }

  const phaseAnalysis = autopilotAction === "defer"
    ? scorecard?.rationale || "Ava needs more evidence and has moved the candidate to the next phase."
    : scorecard?.rationale || application.phase_ai_analysis;

  const advanceQuery = applyExpectedApplicationStateFilter(
    supabaseAdmin
      .from("applications")
      .update({
        phase: nextPhase.nextPhaseId,
        status: "reviewing",
        phase_ai_analysis: phaseAnalysis,
      }),
    latestStatus,
    latestPhase,
  );

  const { data: advancedApplication, error: advanceError } = await advanceQuery
    .eq("id", applicationId)
    .select("id, status, phase")
    .maybeSingle();

  if (advanceError) {
    console.error("[trigger-ava-analysis] Failed to advance phase:", advanceError);
    return jsonResponse({
      error: "Failed to advance application",
      details: advanceError.message,
    }, 500);
  }

  if (!advancedApplication) {
    console.log("[trigger-ava-analysis] Advance write skipped because application state changed mid-flight", {
      applicationId,
      expectedStatus: latestStatus,
      expectedPhase: latestPhase,
    });

    return jsonResponse({
      success: true,
      skipped: true,
      message: "Application state changed before the advance decision could be applied",
      score,
      decision: "stale",
      autopilotAction,
      currentStatus: latestStatus,
      currentPhase: latestPhase,
      scorecard,
    });
  }

  return jsonResponse({
    success: true,
    message: autopilotAction === "defer"
      ? "Analysis completed, candidate advanced for more evidence"
      : "Analysis completed, candidate advanced",
    score,
      decision: "advanced",
      autopilotAction,
      nextPhaseId: nextPhase.nextPhaseId,
      nextPhaseTitle: nextPhase.nextPhaseTitle,
      updatedApplication: advancedApplication,
      scorecard,
    });
}


serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { applicationId, force = false, autopilotDecision = false, previewOnly = false, currentPhaseId = null } = await req.json();
    
    if (!applicationId) {
      return new Response(
        JSON.stringify({ error: "applicationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[trigger-ava-analysis] Starting analysis for application:", applicationId, "force:", force, "autopilotDecision:", autopilotDecision, "previewOnly:", previewOnly, "currentPhaseId:", currentPhaseId);

    // Create admin client to bypass RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user: requestingUser },
      error: requestingUserError,
    } = await supabaseUserClient.auth.getUser();

    if (requestingUserError || !requestingUser) {
      console.error("[trigger-ava-analysis] Invalid auth token:", requestingUserError);
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch application data with all job fields needed for autopilot decision
    const { data: application, error: fetchError } = await supabaseAdmin
      .from("applications")
      .select(`
        *,
        jobs(title, description, requirements, skills_required, experience_level, job_type, workflow_steps, passing_score, processing_mode, quiz_questions, employer_id)
      `)
      .eq("id", applicationId)
      .single();

    if (fetchError || !application) {
      console.error("[trigger-ava-analysis] Failed to fetch application:", fetchError);
      return new Response(
        JSON.stringify({ error: "Application not found", details: fetchError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const employerId = (application.jobs as any)?.employer_id;

    const isCandidateOwner = application.candidate_id === requestingUser.id;
    const isEmployerOwner = employerId === requestingUser.id;

    const [{ data: teamMembership }, { data: developerRole }] = await Promise.all([
      employerId
        ? supabaseAdmin
            .from("team_members")
            .select("id")
            .eq("user_id", requestingUser.id)
            .eq("employer_id", employerId)
            .eq("status", "active")
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", requestingUser.id)
        .eq("role", "developer")
        .maybeSingle(),
    ]);

    if (!isCandidateOwner && !isEmployerOwner && !teamMembership && !developerRole) {
      console.warn("[trigger-ava-analysis] Unauthorized analysis attempt", {
        requesterId: requestingUser.id,
        applicationId,
        employerId,
        candidateId: application.candidate_id,
      });
      return new Response(
        JSON.stringify({ error: "You do not have permission to analyze this application" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // RACE CONDITION FIX: Skip if application was already rejected (unless force=true for reconsider)
    if (application.status === "rejected" && !force) {
      console.log("[trigger-ava-analysis] Application already rejected, skipping duplicate analysis");
      return jsonResponse({ success: true, message: "Application already rejected", skipped: true });
    }

    // Fetch profile separately using candidate_id
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, skills, experience_years, bio, location")
      .eq("user_id", application.candidate_id)
      .single();

    if (profileError) {
      console.log("[trigger-ava-analysis] Could not fetch profile (non-fatal):", profileError.message);
    }

    // Parse notes to get all phase data
    let parsedNotes: Record<string, any> = {};
    try {
      parsedNotes = application.notes ? JSON.parse(application.notes) : {};
    } catch {
      parsedNotes = {};
    }

    // Log what data we have for debugging - CRITICAL for resume troubleshooting
    console.log("[trigger-ava-analysis] Data inventory:", {
      hasResumeUrl: !!application.resume_url,
      resumeUrl: application.resume_url || "NULL",
      hasResumeImageUrls: !!parsedNotes.resumeImageUrls?.length,
      resumeImageUrlsCount: parsedNotes.resumeImageUrls?.length || 0,
      hasFileUploads: !!parsedNotes.fileUploads && Object.keys(parsedNotes.fileUploads).length > 0,
      fileUploadQuestionIds: parsedNotes.fileUploads ? Object.keys(parsedNotes.fileUploads) : [],
      hasApplicationAnswers: !!parsedNotes.applicationAnswers?.length,
      applicationAnswersCount: parsedNotes.applicationAnswers?.length || 0,
      hasCoverLetter: !!application.cover_letter,
      hasTypingTest: !!parsedNotes.typingTestResult,
      hasQuiz: !!(parsedNotes.quizResult || parsedNotes.quiz),
      hasChatSimulation: !!parsedNotes.chatSimulationResult,
      hasChatInterview: !!parsedNotes.chatInterviewResult,
      hasSalesSimulation: !!parsedNotes.salesSimulationResult,
      hasVideoIntro: !!parsedNotes.videoIntroUrl,
      hasPortfolio: !!parsedNotes.portfolioResult,
      hasVoiceInterview: !!application.voice_interview_result,
      existingAiAnalysis: !!application.ai_analysis,
      existingAiScore: application.ai_score,
    });
    
    // Log fileUploads details to debug resume detection
    if (parsedNotes.fileUploads) {
      for (const [qId, upload] of Object.entries(parsedNotes.fileUploads)) {
        const u = upload as any;
        console.log(`[trigger-ava-analysis] FileUpload[${qId}]:`, {
          url: u.url?.substring(0, 60) + "...",
          hasImageUrls: !!u.imageUrls?.length,
          imageUrlsCount: u.imageUrls?.length || 0,
        });
      }
    }

    // Detect resume URL from canonical field OR application answers
    const detectedResumeUrl = detectResumeUrl(application.resume_url, parsedNotes);
    console.log("[trigger-ava-analysis] Detected resume URL:", detectedResumeUrl);
    
    // CRITICAL BACKFILL: If resume_url is null but we detected one from answers, update the application
    // This ensures future analyses and the employer dashboard show the correct resume
    if (!application.resume_url && detectedResumeUrl) {
      console.log("[trigger-ava-analysis] BACKFILLING applications.resume_url from detected value...");
      const { error: backfillError } = await supabaseAdmin
        .from("applications")
        .update({ resume_url: detectedResumeUrl })
        .eq("id", applicationId);
      
      if (backfillError) {
        console.error("[trigger-ava-analysis] Failed to backfill resume_url:", backfillError.message);
      } else {
        console.log("[trigger-ava-analysis] Successfully backfilled resume_url");
        // Update local reference for this analysis
        application.resume_url = detectedResumeUrl;
      }
    }

    // Build content string from all available phase data
    const applicationAnswers = parsedNotes.applicationAnswers || [];
    
    // CRITICAL FIX: Separate resume answers from custom file uploads
    // This prevents AVA from confusing internet speed screenshots with resumes
    const customFileAnswers: any[] = [];
    const textAnswers: any[] = [];
    
    for (const a of applicationAnswers) {
      if (isFileLikeUrl(a.answer)) {
        if (isResumeQuestion(a.question)) {
          continue;
        } else {
          customFileAnswers.push(a);
        }
      } else {
        textAnswers.push(a);
      }
    }
    
    // Format text answers normally
    const textAnswersText = textAnswers.length > 0
      ? textAnswers.map((a: any) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")
      : "Not provided";
    
    // Format custom file uploads with clear context so AVA doesn't analyze them as resumes
    const customFilesText = customFileAnswers.length > 0
      ? `\n\n=== CUSTOM FILE UPLOADS (NOT RESUMES - DO NOT ANALYZE AS RESUMES) ===
These are supplementary files uploaded for specific questions. Evaluate them based on their stated purpose only.
${customFileAnswers.map((a: any) => 
  `Question: "${a.question}"
File URL: ${a.answer}
Purpose: This is a supplementary document for the above question. It is NOT a resume.`
).join("\n\n")}`
      : "";

    const job = application.jobs as any;
    
    // Extract workflow phases from job to inform AI what phases exist for this job
    const workflowSteps = (job?.workflow_steps as any[]) || [];
    const workflowPhaseTypes = workflowSteps.map((step: any) => step.type).filter(Boolean);

    // CRITICAL FIX: Extract candidate info from APPLICATION ANSWERS, not profile
    // Profile email is the LOGIN email, which may differ from the application email
    // We should cross-reference resume against what the candidate PROVIDED in their application
    const extractFromApplicationAnswers = (keywords: string[]): string | null => {
      for (const answer of applicationAnswers) {
        const q = (answer.question || "").toLowerCase();
        if (keywords.some(kw => q.includes(kw))) {
          return answer.answer || null;
        }
      }
      return null;
    };

    // Extract candidate-provided info from application (this is what should match the resume)
    const applicationEmail = extractFromApplicationAnswers(["email", "e-mail"]);
    const applicationName = extractFromApplicationAnswers(["full name", "your name", "name"]);
    const applicationPhone = extractFromApplicationAnswers(["phone", "mobile", "contact number"]);

    console.log("[trigger-ava-analysis] Candidate info sources:", {
      applicationEmail,
      applicationName,
      applicationPhone,
      profileEmail: profile?.email,
      profileName: profile?.full_name,
    });

    // Use application-provided name/email for cross-reference (the candidate's stated identity)
    // Fall back to profile only if not provided in application
    const candidateName = applicationName || profile?.full_name || "Unknown";
    const candidateEmail = applicationEmail || "Not provided in application";
    const quizData = parsedNotes.quizResult || parsedNotes.quiz;
    const evidenceFingerprint = buildEvidenceFingerprint({
      currentPhaseId: currentPhaseId || application.phase || "application",
      passingScore: job?.passing_score || 60,
      workflowSteps: workflowSteps.map((step: any) => ({ id: step.id, type: step.type, title: step.title || step.type })),
      quizQuestionCount: Array.isArray(job?.quiz_questions) ? job.quiz_questions.length : 0,
      resumeUrl: detectedResumeUrl || null,
      applicationAnswers: textAnswers.map((answer: any) => ({
        question: answer.question,
        answer: answer.answer,
      })),
      coverLetter: application.cover_letter || null,
      quizResult: quizData
        ? {
            score: quizData.score || quizData.percentage || null,
            correct: quizData.correct || null,
            total: quizData.total || null,
            passed: quizData.passed ?? null,
          }
        : null,
      typingTest: parsedNotes.typingTestResult
        ? {
            score: parsedNotes.typingTestResult.score || null,
            wpm: parsedNotes.typingTestResult.wpm || null,
            accuracy: parsedNotes.typingTestResult.accuracy || null,
            requiredWpm: parsedNotes.typingTestResult.requiredWpm || null,
          }
        : null,
      chatSimulation: parsedNotes.chatSimulationResult
        ? {
            score: parsedNotes.chatSimulationResult.score || parsedNotes.chatSimulationResult.overallScore || null,
            empathy: parsedNotes.chatSimulationResult.empathy || null,
            problemSolving: parsedNotes.chatSimulationResult.problemSolving || null,
          }
        : null,
      chatInterview: parsedNotes.chatInterviewResult
        ? {
            score: parsedNotes.chatInterviewResult.score || parsedNotes.chatInterviewResult.overall_score || null,
            recommendation: parsedNotes.chatInterviewResult.recommendation || null,
            messageCount: parsedNotes.chatInterviewResult.messageCount || null,
          }
        : null,
      salesSimulation: parsedNotes.salesSimulationResult
        ? {
            score: parsedNotes.salesSimulationResult.score || parsedNotes.salesSimulationResult.overallScore || null,
            discovery: parsedNotes.salesSimulationResult.discovery || null,
            objectionHandling: parsedNotes.salesSimulationResult.objectionHandling || null,
          }
        : null,
      videoIntro: parsedNotes.videoIntroResult || parsedNotes.videoIntroUrl
        ? {
            score: parsedNotes.videoIntroResult?.score || null,
            submitted: !!parsedNotes.videoIntroUrl,
          }
        : null,
      portfolio: parsedNotes.portfolioResult
        ? {
            score: parsedNotes.portfolioResult.aiAnalysis?.score || parsedNotes.portfolioResult.score || null,
            fileCount: parsedNotes.portfolioResult.files?.length || parsedNotes.portfolioResult.fileCount || null,
          }
        : null,
      voiceInterview: application.voice_interview_result
        ? {
            overallScore: application.voice_interview_result.overall_score || null,
            recommendation: application.voice_interview_result.recommendation || null,
          }
        : null,
    });
    const existingScorecard = (parsedNotes.avaScorecard || null) as AvaScorecard | null;
    const existingAnalysisMeta = (parsedNotes.avaAnalysisMeta || {}) as Record<string, any>;
    const canReuseExistingAnalysis =
      !force &&
      !!application.ai_analysis &&
      application.ai_score !== null &&
      !!existingScorecard?.decisionState &&
      existingAnalysisMeta?.evidenceFingerprint === evidenceFingerprint;

    if (canReuseExistingAnalysis) {
      console.log("[trigger-ava-analysis] Reusing frozen analysis for unchanged evidence snapshot");

      if (!autopilotDecision && !previewOnly) {
        return jsonResponse({
          success: true,
          message: "Analysis already present",
          skipped: true,
          reused: true,
          score: application.ai_score,
          scorecard: existingScorecard,
        });
      }

      return await handleAutopilotDecision({
        supabaseAdmin,
        application,
        applicationId,
        currentPhaseId: currentPhaseId || application.phase,
        passingScore: (job?.passing_score as number) || 60,
        score: application.ai_score,
        scorecard: existingScorecard,
        profile,
        job,
        previewOnly,
      });
    }

    // ========== AI ANALYSES LIMIT CHECK ==========
    if (employerId) {
      const { data: subscription } = await supabaseAdmin
        .from("subscriptions")
        .select("plan_type, status, trial_end")
        .eq("user_id", employerId)
        .maybeSingle();

      const hasActiveSubscriptionAccess =
        !subscription ||
        subscription.status === "active" ||
        (subscription.status === "trialing" &&
          (!subscription.trial_end || new Date(subscription.trial_end) > new Date()));

      if (!hasActiveSubscriptionAccess) {
        return jsonResponse({
          error: "Subscription inactive",
          message: "This employer's subscription is not active, so Ava analysis is unavailable.",
        }, 403);
      }

      const planType = subscription?.plan_type || "trial";
      const aiAnalysesLimits: Record<string, number> = {
        trial: 15,
        growth: 100,
        business: -1,
        enterprise: -1,
      };
      const aiLimit = aiAnalysesLimits[planType] ?? 15;

      if (aiLimit !== -1) {
        const { data: employerJobs } = await supabaseAdmin
          .from("jobs")
          .select("id")
          .eq("employer_id", employerId);

        const jobIds = (employerJobs || []).map((entry: any) => entry.id);
        if (jobIds.length > 0) {
          const { count: analysisCount } = await supabaseAdmin
            .from("applications")
            .select("*", { count: "exact", head: true })
            .in("job_id", jobIds)
            .not("ai_score", "is", null);

          const currentCount = analysisCount || 0;
          if (currentCount >= aiLimit) {
            console.log(`[trigger-ava-analysis] AI analysis limit reached for employer ${employerId}: ${currentCount}/${aiLimit}`);
            return jsonResponse({
              error: "AI analysis limit reached",
              message: `You've reached your AI analysis limit (${currentCount}/${aiLimit}). Upgrade your plan for more analyses.`,
              limitReached: true,
            }, 403);
          }
          console.log(`[trigger-ava-analysis] AI analysis count: ${currentCount}/${aiLimit}`);
        }
      }
    }
    // ========== END LIMIT CHECK ==========

    let content = `
Job Title: ${job?.title || "Unknown"}
Job Description: ${job?.description || "Not provided"}
Requirements: ${job?.requirements || "Not specified"}
Skills Required: ${job?.skills_required?.join(", ") || "Not specified"}
Experience Level: ${job?.experience_level || "Not specified"}

=== JOB WORKFLOW PHASES (ONLY analyze these phases) ===
${workflowPhaseTypes.length > 0 ? workflowPhaseTypes.map((p: string) => `- ${p}`).join("\n") : "- application_form (standard application only)"}

CRITICAL INSTRUCTION: In your PHASE PERFORMANCE SUMMARY, you must ONLY include phases that are listed above. Do NOT mention phases that were NOT part of this job's workflow. For example, if there is no "typing_test" in the workflow above, do NOT say "Typing Test: Not Completed" - simply omit it entirely.

=== CANDIDATE INFORMATION (from Application Form) ===
Candidate Name (as provided in application): ${candidateName}
Candidate Email (as provided in application): ${candidateEmail}
${applicationPhone ? `Candidate Phone (as provided in application): ${applicationPhone}` : ""}

IMPORTANT FOR CROSS-REFERENCE: Compare resume contact info against the ABOVE application-provided values.
The account login email (${profile?.email || "unknown"}) may differ from the application email - this is NORMAL and should NOT be flagged as a mismatch.
Only flag as a "name mismatch" if the resume name differs from "${candidateName}" above.
Only flag as an "email mismatch" if the resume email differs from "${candidateEmail}" above.

=== PROFILE METADATA (for context only, NOT for cross-reference) ===
Account Email: ${profile?.email || "Not provided"} (NOTE: This is the login email, may differ from application email - do NOT use for mismatch detection)
Skills: ${profile?.skills?.join(", ") || "Not specified"}
Experience Years: ${profile?.experience_years || "Not specified"}
Bio: ${profile?.bio || "Not provided"}
Location: ${profile?.location || "Not specified"}

Application Answers (Text Responses Only):
${textAnswersText}
${customFilesText}

Cover Letter:
${application.cover_letter || "Not provided"}

=== RESUME (ONLY THIS IS THE CANDIDATE'S RESUME) ===
Resume URL: ${detectedResumeUrl || "Not provided"}
NOTE: Only the file above is the resume. Any files in "CUSTOM FILE UPLOADS" section are NOT resumes.
`;

    // Add Typing Test results if available (include requiredWpm for context)
    if (parsedNotes.typingTestResult) {
      const typingRequiredWpm = parsedNotes.typingTestResult.requiredWpm || job?.required_wpm || 35;
      const meetsRequirement = parsedNotes.typingTestResult.wpm >= typingRequiredWpm;
      content += `
Typing Test Results:
- Speed: ${parsedNotes.typingTestResult.wpm} WPM
- Required: ${typingRequiredWpm} WPM
- Accuracy: ${parsedNotes.typingTestResult.accuracy}%
- Score: ${parsedNotes.typingTestResult.score || 'N/A'}
- Performance: ${meetsRequirement ? 'Meets requirement' : 'Below requirement'}
`;
    }

    // Add Quiz answers if available
    if (quizData) {
      content += `
Quiz Performance:
- Score: ${quizData.score || quizData.percentage || 'N/A'}%
- Correct: ${quizData.correct || 'N/A'}/${quizData.total || 'N/A'}
- Passed: ${quizData.passed ? 'Yes' : 'No'}
`;
    }

    // Add Chat Simulation results if available
    if (parsedNotes.chatSimulationResult) {
      content += `
Chat Simulation (Customer Support) Results:
- Score: ${parsedNotes.chatSimulationResult.score || 'N/A'}/100
- Empathy: ${parsedNotes.chatSimulationResult.empathy || 'N/A'}%
- Problem Solving: ${parsedNotes.chatSimulationResult.problemSolving || 'N/A'}%
`;
    }

    // Add Chat Interview results if available  
    if (parsedNotes.chatInterviewResult) {
      content += `
Interview Results:
- Overall Score: ${parsedNotes.chatInterviewResult.score || 'N/A'}/100
- Recommendation: ${parsedNotes.chatInterviewResult.recommendation || 'N/A'}
`;
    }

    // Add Sales Simulation results if available
    if (parsedNotes.salesSimulationResult) {
      content += `
Sales Simulation Results:
- Score: ${parsedNotes.salesSimulationResult.score || 'N/A'}/100
- Discovery: ${parsedNotes.salesSimulationResult.discovery || 'N/A'}%
- Objection Handling: ${parsedNotes.salesSimulationResult.objectionHandling || 'N/A'}%
- Would Buy: ${parsedNotes.salesSimulationResult.wouldBuy || 'N/A'}
`;
    }

    // Add Video Intro if available
    if (parsedNotes.videoIntroUrl) {
      content += `
Video Introduction: Submitted (demonstrates candidate effort and initiative)
`;
    }

    // Add Portfolio results if available
    if (parsedNotes.portfolioResult) {
      const analysis = parsedNotes.portfolioResult.aiAnalysis || parsedNotes.portfolioResult.analysis;
      content += `
Portfolio Upload:
- Files: ${parsedNotes.portfolioResult.files?.length || parsedNotes.portfolioResult.fileCount || 'N/A'} files submitted
- Score: ${analysis?.score || parsedNotes.portfolioResult.score || 'N/A'}/100
- Relevance: ${analysis?.relevance?.score || 'N/A'}%
- Quality: ${analysis?.quality?.score || 'N/A'}%
- Summary: ${analysis?.summary || 'Not analyzed'}
- Strengths: ${analysis?.strengths?.join(', ') || 'None identified'}
- Areas for Improvement: ${analysis?.areasForImprovement?.join(', ') || 'None identified'}
`;
    }

    // Add Voice Interview results if available
    if (application.voice_interview_result) {
      const vr = application.voice_interview_result as any;
      const interviewType = application.voice_interview_video_enabled !== false ? 'Video' : 'Voice';
      content += `
${interviewType} Interview with AVA Results:
- Overall Score: ${vr.overall_score || 'N/A'}/100
- Recommendation: ${vr.recommendation || 'N/A'}
- Technical Score: ${vr.technical_score || 'N/A'}/100
- Communication Score: ${vr.communication_score || 'N/A'}/100
- Culture Fit Score: ${vr.culture_fit_score || 'N/A'}/100
- Credibility Rating: ${vr.credibility_rating || 'N/A'}
- Summary: ${vr.summary || 'Not provided'}
- Concerns: ${vr.concerns?.join(', ') || 'None noted'}
`;
    }

    const resumeText = detectedResumeUrl
      ? await fetchResumeText(detectedResumeUrl, supabaseAdmin)
      : null;
    const resumeVisualInputs: ResumeVisualInput[] = await fetchResumeVisualInputs({
      resumeUrl: detectedResumeUrl,
      parsedNotes,
      adminClient: supabaseAdmin,
      maxImages: 3,
    });

    console.log("[trigger-ava-analysis] Resume evidence prepared:", {
      resumeUrl: detectedResumeUrl || "none",
      resumeTextLength: resumeText?.length || 0,
      resumeImageCount: resumeVisualInputs.length,
      visualSources: resumeVisualInputs.map((entry) => `${entry.source}:${entry.page ?? 1}`),
    });

    console.log("[trigger-ava-analysis] Calling ai-analyze edge function");

    // Call the AI analysis edge function using the admin client
    const { data: analysisData, error: analysisError } = await supabaseAdmin.functions.invoke("ai-analyze", {
      body: {
        type: "resume",
        content,
        resumeUrl: detectedResumeUrl,
        resumeText,
        resumeImages: resumeVisualInputs,
        applicantName: candidateName,
        applicationAnswers: textAnswers.map((answer: any) => ({
          question: answer.question,
          answer: answer.answer,
        })),
        coverLetter: application.cover_letter || undefined,
        context: {
          skills_required: job?.skills_required,
          experience_level: job?.experience_level,
          job_title: job?.title,
          job_type: job?.job_type,
        },
      },
    });

    if (analysisError) {
      console.error("[trigger-ava-analysis] AI analysis error:", analysisError);
      return new Response(
        JSON.stringify({ error: "AI analysis failed", details: analysisError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[trigger-ava-analysis] AI analysis completed, extracting score...");

    // Improved score extraction with multiple patterns - supports decimal scores
    const analysisText = analysisData?.analysis || "";
    let newScore: number | null = null;
    
    // Pattern 1: FINAL CALCULATED SCORE (preferred) - supports decimals
    const finalScoreMatch = analysisText.match(/FINAL CALCULATED SCORE[:\s]+(\d+(?:\.\d+)?)/i);
    if (finalScoreMatch) {
      newScore = parseFloat(finalScoreMatch[1]);
      console.log("[trigger-ava-analysis] Score extracted via FINAL CALCULATED SCORE:", newScore);
    }
    
    // Pattern 2: Overall Score - supports decimals
    if (newScore === null) {
      const overallMatch = analysisText.match(/Overall Score[:\s]+(\d+(?:\.\d+)?)/i);
      if (overallMatch) {
        newScore = parseFloat(overallMatch[1]);
        console.log("[trigger-ava-analysis] Score extracted via Overall Score:", newScore);
      }
    }
    
    // Pattern 3: Generic "Score: XX" at end of line - supports decimals
    if (newScore === null) {
      const genericMatch = analysisText.match(/Score[:\s]+(\d+(?:\.\d+)?)(?:\s*\/\s*100|\s*$)/im);
      if (genericMatch) {
        newScore = parseFloat(genericMatch[1]);
        console.log("[trigger-ava-analysis] Score extracted via generic pattern:", newScore);
      }
    }
    
    // Validate score range
    if (newScore !== null && (newScore < 0 || newScore > 100)) {
      console.log("[trigger-ava-analysis] Invalid score range, discarding:", newScore);
      newScore = null;
    }

    const hadResumeText = !!resumeText;
    const hadResumeImages = resumeVisualInputs.length > 0;
    const hadResumeEvidence = hadResumeText || hadResumeImages;
    const explicitResumeFailure =
      analysisText.includes("RESUME_UNAVAILABLE") ||
      analysisText.includes("Resume file could not be") ||
      analysisText.includes("couldn't analyze the resume") ||
      analysisText.includes("No resume was provided") ||
      analysisText.includes("resume could not be processed");
    const visualReadFailure =
      /unreadable|unable to read|could not read|no readable text|image was too low quality/i.test(analysisText);
    const invalidOrWrongResume = /INVALID_DOCUMENT|WRONG_RESUME/i.test(analysisText);
    const visualResumeShouldCountAsAnalyzed =
      hadResumeImages && !visualReadFailure && !invalidOrWrongResume;
    const resumeUnavailable =
      !hadResumeEvidence ||
      (!visualResumeShouldCountAsAnalyzed && explicitResumeFailure);
    
    if (resumeUnavailable) {
      console.log("[trigger-ava-analysis] Resume was unavailable/couldn't be processed - setting resume_score to null", {
        hadResumeText,
        hadResumeImages,
        hasResumeUrl: !!detectedResumeUrl,
        hasResumeImageUrls: !!parsedNotes.resumeImageUrls?.length,
      });
    }

    // WEIGHTED SCORE CALCULATION: Combine resume score with phase performance
    // This ensures quiz/assessment performance compensates for resume weaknesses
    // Reuse quizData from line 243 (already defined above)
    const quizScore = quizData?.score || quizData?.percentage || null;
    const typingTest = parsedNotes.typingTestResult;
    const voiceResult = application.voice_interview_result as any;
    const chatSimulationScore = parsedNotes.chatSimulationResult?.overallScore || parsedNotes.chatSimulationResult?.score || null;
    const salesSimulationScore = parsedNotes.salesSimulationResult?.overallScore || parsedNotes.salesSimulationResult?.score || null;
    const chatInterviewScore =
      parsedNotes.chatInterviewResult?.score ||
      parsedNotes.chatInterviewResult?.overall_score ||
      parsedNotes.chatInterviewResult?.evaluation?.score ||
      null;
    const hasVideoIntro = !!(parsedNotes.videoIntroResult?.completed || parsedNotes.videoIntroUrl);
    const videoIntroScore = typeof parsedNotes.videoIntroResult?.score === "number"
      ? parsedNotes.videoIntroResult.score
      : null;
    
    // Find portfolio data from workflow step IDs (stored under step ID like "step1", not "portfolioResult")
    let portfolioScore: number | null = null;
    // Reuse workflowSteps from line 510 (already defined above)
    for (const step of workflowSteps) {
      if (step.type === 'portfolio_upload') {
        const stepData = parsedNotes[step.id];
        if (stepData?.aiAnalysis?.score) {
          portfolioScore = stepData.aiAnalysis.score;
          console.log("[trigger-ava-analysis] Found portfolio score from step", step.id, ":", portfolioScore);
          break;
        }
      }
    }
    // Fallback to legacy portfolioResult format
    if (portfolioScore === null) {
      const legacyResult = parsedNotes.portfolioResult;
      portfolioScore = legacyResult?.aiAnalysis?.score || legacyResult?.score || null;
      if (portfolioScore) {
        console.log("[trigger-ava-analysis] Found portfolio score from legacy portfolioResult:", portfolioScore);
      }
    }
    
    let finalScore: number | null = newScore;
    const inferredFamily = inferJobFamily(job?.title || null, job?.description || null);
    
    // If we have phase performance data, calculate a weighted score
    if (newScore !== null) {
      const familyAwareWeights: Record<string, Array<{ label: string; value: number | null | undefined; weight: number }>> = {
        support: [
          { label: "resume", value: newScore, weight: 0.28 },
          { label: "quiz", value: quizScore, weight: 0.16 },
          { label: "typing", value: typingTest?.score, weight: 0.12 },
          { label: "chat_simulation", value: chatSimulationScore, weight: 0.22 },
          { label: "chat_interview", value: chatInterviewScore, weight: 0.12 },
          { label: "voice", value: voiceResult?.overall_score, weight: 0.10 },
        ],
        sales: [
          { label: "resume", value: newScore, weight: 0.28 },
          { label: "quiz", value: quizScore, weight: 0.10 },
          { label: "sales_simulation", value: salesSimulationScore, weight: 0.24 },
          { label: "chat_interview", value: chatInterviewScore, weight: 0.14 },
          { label: "voice", value: voiceResult?.overall_score, weight: 0.14 },
          { label: "portfolio", value: portfolioScore, weight: 0.10 },
        ],
        operations_admin: [
          { label: "resume", value: newScore, weight: 0.30 },
          { label: "quiz", value: quizScore, weight: 0.14 },
          { label: "typing", value: typingTest?.score, weight: 0.24 },
          { label: "chat_interview", value: chatInterviewScore, weight: 0.12 },
          { label: "voice", value: voiceResult?.overall_score, weight: 0.10 },
          { label: "chat_simulation", value: chatSimulationScore, weight: 0.10 },
        ],
        technical: [
          { label: "resume", value: newScore, weight: 0.34 },
          { label: "quiz", value: quizScore, weight: 0.26 },
          { label: "portfolio", value: portfolioScore, weight: 0.14 },
          { label: "chat_interview", value: chatInterviewScore, weight: 0.14 },
          { label: "voice", value: voiceResult?.overall_score, weight: 0.12 },
        ],
        creative: [
          { label: "resume", value: newScore, weight: 0.26 },
          { label: "portfolio", value: portfolioScore, weight: 0.24 },
          { label: "chat_interview", value: chatInterviewScore, weight: 0.18 },
          { label: "voice", value: voiceResult?.overall_score, weight: 0.16 },
          { label: "quiz", value: quizScore, weight: 0.16 },
        ],
        general: [
          { label: "resume", value: newScore, weight: 0.32 },
          { label: "quiz", value: quizScore, weight: 0.18 },
          { label: "typing", value: typingTest?.score, weight: 0.10 },
          { label: "chat_interview", value: chatInterviewScore, weight: 0.15 },
          { label: "chat_simulation", value: chatSimulationScore, weight: 0.10 },
          { label: "sales_simulation", value: salesSimulationScore, weight: 0.10 },
          { label: "voice", value: voiceResult?.overall_score, weight: 0.15 },
        ],
      };

      const weightedComponents = familyAwareWeights[inferredFamily] || familyAwareWeights.general;
      finalScore = Math.round(weightedAverage(weightedComponents, newScore) * 100) / 100;
      console.log(
        "[trigger-ava-analysis] Weighted score calculated:",
        finalScore,
        "family:",
        inferredFamily,
        "components:",
        weightedComponents
          .filter((component) => typeof component.value === "number")
          .map((component) => `${component.label}:${component.value}`),
      );
      
      // MINIMUM SCORE FLOORS based on quiz performance
      // A candidate who aced the quiz should NOT get a failing overall score
      if (quizScore !== null && typeof quizScore === 'number') {
        if (quizScore === 100 && finalScore !== null && finalScore < 60) {
          console.log("[trigger-ava-analysis] Applying floor: 100% quiz -> minimum 60 score");
          finalScore = 60;
        } else if (quizScore >= 80 && finalScore !== null && finalScore < 50) {
          console.log("[trigger-ava-analysis] Applying floor: 80%+ quiz -> minimum 50 score");
          finalScore = 50;
        }
      }
      
      // Typing test bonus (if excellent performance)
      if (typingTest && typingTest.wpm >= 60 && typingTest.accuracy >= 95) {
        if (finalScore !== null && finalScore < 55) {
          console.log("[trigger-ava-analysis] Applying floor: excellent typing -> minimum 55 score");
          finalScore = 55;
        }
      }
    }
    
    console.log("[trigger-ava-analysis] Final score after weighting and floors:", finalScore, "(AI raw score was:", newScore, ")");
    const passingScore = (job?.passing_score as number) || 60;
    const quizConfigured = Array.isArray(job?.quiz_questions) && job.quiz_questions.length > 0;
    const scorecard = buildAvaScorecard({
      finalScore,
      passingScore,
      quizScore,
      quizConfigured,
      typingTest,
      voiceScore: voiceResult?.overall_score || null,
      portfolioScore,
      chatSimulationScore,
      salesSimulationScore,
      chatInterviewScore,
      videoIntroScore,
      videoIntroSubmitted: hasVideoIntro,
      analysisText,
      resumeUnavailable,
      resumeTextUsed: hadResumeText,
      resumeImageCount: resumeVisualInputs.length,
      applicationAnswerCount: textAnswers.length,
      coverLetterProvided: !!application.cover_letter,
      workflowSteps,
      jobTitle: job?.title || null,
      jobDescription: job?.description || null,
      jobSkillsRequired: Array.isArray(job?.skills_required) ? (job.skills_required as string[]) : null,
      experienceLevel: job?.experience_level || null,
      evidenceFingerprint,
    });
    const analysisMeta = {
      provider: analysisData?.provider || "openai",
      model: analysisData?.model || null,
      analyzedAt: new Date().toISOString(),
      evidenceFingerprint,
      resume: {
        provided: !!detectedResumeUrl,
        analyzed: !resumeUnavailable,
        status: resumeUnavailable
          ? "unavailable"
          : hadResumeText && hadResumeImages
            ? "text_and_visual"
            : hadResumeText
              ? "text_only"
              : "visual_only",
        textExtracted: hadResumeText,
        textLength: resumeText?.length || 0,
        imagePagesUsed: resumeVisualInputs.length,
        visualSources: resumeVisualInputs.map((entry) => `${entry.source}:${entry.page ?? 1}`),
        url: detectedResumeUrl || null,
      },
      inputsUsed: {
        applicationAnswers: textAnswers.length,
        coverLetter: !!application.cover_letter,
        quiz: typeof quizScore === "number",
        typingTest: !!typingTest,
        chatSimulation: typeof chatSimulationScore === "number",
        salesSimulation: typeof salesSimulationScore === "number",
        chatInterview: typeof chatInterviewScore === "number",
        portfolio: typeof portfolioScore === "number",
        videoIntro: hasVideoIntro,
        voiceInterview: typeof voiceResult?.overall_score === "number",
      },
    };
    const updatedNotes = {
      ...parsedNotes,
      avaScorecard: scorecard,
      avaAnalysisMeta: analysisMeta,
    };

    // Update the application with AI analysis using admin client (bypasses RLS)
    // Save both the raw resume score (newScore) and the weighted overall score (finalScore)
    const { error: updateError } = await supabaseAdmin
      .from("applications")
      .update({
        ai_analysis: analysisData?.analysis || null,
        ai_score: typeof finalScore === "number" && finalScore >= 0 && finalScore <= 100 ? finalScore : null,
        // Only set resume_score if the resume was actually analyzed (not RESUME_UNAVAILABLE)
        resume_score: resumeUnavailable ? null : (typeof newScore === "number" && newScore >= 0 && newScore <= 100 ? newScore : null),
        notes: JSON.stringify(updatedNotes),
      })
      .eq("id", applicationId);

    if (updateError) {
      console.error("[trigger-ava-analysis] Failed to update application:", updateError);
      return jsonResponse({ error: "Failed to save analysis", details: updateError.message }, 500);
    }

    console.log("[trigger-ava-analysis] Analysis completed successfully for application:", applicationId, "score:", finalScore);

    if (autopilotDecision || previewOnly) {
      return await handleAutopilotDecision({
        supabaseAdmin,
        application,
        applicationId,
        currentPhaseId: currentPhaseId || application.phase,
        passingScore,
        score: finalScore,
        scorecard,
        profile,
        job,
        previewOnly,
      });
    }

    return jsonResponse({ 
      success: true, 
      message: "Analysis completed and saved",
      score: finalScore,
      forced: force,
      scorecard,
    });

  } catch (error) {
    console.error("[trigger-ava-analysis] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: error instanceof Error ? error.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
