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
  computeJudgmentScore,
  inferJobFamily,
  readChatInterviewResult,
  resolveAutopilotAction,
  type AvaScorecard,
  type AutopilotAction,
} from "../_shared/autopilot.ts";
import { buildCandidateJourney, type WorkflowStepLike } from "../_shared/candidateJourney.ts";
import {
  advanceAfterStep,
  isMissingFunctionError,
  parseNotesObject,
  planAutoAdvance,
  shouldScoreAfterStep,
  withoutNulCharacters,
  type AdvanceAdmin,
  type AdvanceAfterStepOutcome,
  type AdvanceSnapshot,
} from "../_shared/trustedResults.ts";
import { hasSubscriptionBypassForUser } from "../_shared/subscriptionBypass.ts";
import { isScopedTeamMemberFromRpc } from "../_shared/teamMemberRpcAccess.ts";

// 5 (2026-10-05): the scorecard's auto-mode rules changed (nobody is stopped
// part-way; dealBreakerFlags), and the written interview is read in both of
// its shapes. Bumping it re-runs a frozen analysis once instead of reusing a
// scorecard built on the old rules.
const ANALYSIS_VERSION = 5;

// Supabase's hosted edge runtime keeps a worker alive for a promise handed to
// EdgeRuntime.waitUntil after the response has been sent (up to the 400 s
// wall clock on Pro). Declared here because nothing in this project's Deno
// setup types it; where it is missing (a plain local Deno run) the work is
// simply awaited before responding.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StructuredScore {
  // The LLM's own holistic judgment. Kept on the type for logging/analysisMeta only —
  // it MUST NOT be read into the persisted score. See computeJudgmentScore in
  // _shared/autopilot.ts, which is the deterministic function that replaces it.
  overallScore: number;
  directMatchScore: number;
  transferableFitScore: number;
  learningSignalScore: number;
  writingQualityScore: number;
  attentionToDetailScore: number;
  authenticityScore: number;
  specificityScore: number;
  hardRequirementConflicts: string[];
  transferableEvidence: string[];
  confidence: number;
  summary: string;
}

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
  supabaseAdmin: any;
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

/**
 * The original decision path: score first, then advance, defer or park on
 * Ava's recommendation. Since 2026-10-05 it serves MANUAL jobs only (their
 * behaviour is unchanged). Auto-mode jobs go through handleAutoModeStep
 * below, which never parks anyone and never waits on Ava.
 */
async function handleAutopilotDecision(params: {
  supabaseAdmin: any;
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

  const latestStatus = typeof latestApplication?.status === "string"
    ? latestApplication.status
    : null;
  const latestPhase = typeof latestApplication?.phase === "string"
    ? latestApplication.phase
    : null;
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
      decision: autopilotAction === "reject" ? "recommend_decline" : "advanced",
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
    // LEGAL/POLICY: Ava NEVER auto-rejects. It surfaces a decline RECOMMENDATION and
    // a human makes the final call (bulk-reject in the cockpit). Keep the candidate in
    // a review state with Ava's reasoning — no status:"rejected", no rejected_by_type:"ava",
    // no rejection email to the candidate.
    // Quote the number that made the decision: scorecard.overallScore, which is
    // also what ai_score stores and every screen shows. `score` is the phase blend
    // (a 30% input to it), so the note used to read "64.14% is below 60%".
    const decidingScore = typeof scorecard?.overallScore === "number" ? scorecard.overallScore : score;
    const declineReason = scorecard?.hardRejectReason
      ? `${scorecard.hardRejectReason}.`
      : `Overall Ava score of ${Math.round(decidingScore || 0)}% is below the passing threshold of ${passingScore}%.`;

    const reviewQuery = applyExpectedApplicationStateFilter(
      supabaseAdmin
        .from("applications")
        .update({
          status: "reviewing",
          phase_ai_analysis: `Ava recommends declining — needs your review. ${declineReason}`,
        }),
      latestStatus,
      latestPhase,
    );

    const { data: reviewApplication, error: reviewError } = await reviewQuery
      .eq("id", applicationId)
      .select("id, status, phase, rejected_by_type")
      .maybeSingle();

    if (reviewError) {
      console.error("[trigger-ava-analysis] Failed to flag application for human review:", reviewError);
      return jsonResponse({
        error: "Failed to record Ava's recommendation",
        details: reviewError.message,
      }, 500);
    }

    if (!reviewApplication) {
      console.log("[trigger-ava-analysis] Recommend-decline write skipped because application state changed mid-flight", {
        applicationId,
        expectedStatus: latestStatus,
        expectedPhase: latestPhase,
      });

      return jsonResponse({
        success: true,
        skipped: true,
        message: "Application state changed before Ava's recommendation could be applied",
        score,
        decision: "stale",
        autopilotAction,
        currentStatus: latestStatus,
        currentPhase: latestPhase,
        scorecard,
      });
    }

    // No rejection email — a human owns the decline decision.
    return jsonResponse({
      success: true,
      message: "Analysis completed — Ava recommends declining; awaiting human review",
      score,
      decision: "recommend_decline",
      reason: declineReason,
      autopilotAction,
      updatedApplication: reviewApplication,
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



/** Runs `task` after the response when the runtime allows it, otherwise
 *  before. Never throws: a background failure is logged, not surfaced. */
async function runInBackground(label: string, task: Promise<unknown>) {
  const guarded = task.catch((error) => {
    console.error(`[trigger-ava-analysis] ${label} failed:`, error);
  });
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime && typeof EdgeRuntime.waitUntil === "function") {
    EdgeRuntime.waitUntil(guarded);
    return;
  }
  await guarded;
}

// The client and the rows below are the same untyped values the handler has
// always worked with (an untyped createClient, select("*") rows); this names
// them once for the context passed into runAvaAnalysis.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
type Loose = any;

interface AnalysisContext {
  supabaseAdmin: Loose;
  application: Loose;
  applicationId: string;
  job: Loose;
  employerId: string | null | undefined;
  force: boolean;
  /** The step the caller says was just finished — informational for the
   *  analysis (it is part of the evidence fingerprint). */
  currentPhaseId: string | null;
  /** jobs.processing_mode === "auto", read from the database row. */
  autoMode: boolean;
}

type AnalysisOutcome =
  | {
      ok: true;
      /** The stored analysis already matched this evidence; nothing was re-run. */
      reused: boolean;
      /** A run that started later had already saved; this one wrote nothing. */
      superseded: boolean;
      score: number | null;
      scorecard: AvaScorecard | null;
      profile: Loose;
    }
  | { ok: false; status: number; body: Record<string, unknown>; profile: Loose };

/**
 * Ava's analysis of everything this application has submitted so far: the
 * ai-analyze call (~40 s), the weighted score and the scorecard, saved into
 * ai_analysis / ai_score / ai_scorecard / resume_score (and, in auto mode,
 * phase_ai_analysis as information) plus notes.avaScorecard /
 * notes.avaAnalysisMeta. It NEVER writes phase or status: moving a candidate
 * is advanceAfterStep's job (auto mode) or handleAutopilotDecision's (manual).
 */
async function runAvaAnalysis(ctx: AnalysisContext): Promise<AnalysisOutcome> {
  const { supabaseAdmin, application, applicationId, job, employerId, force, currentPhaseId, autoMode } = ctx;
  const runStartedAt = new Date().toISOString();
  try {
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
      // Both of the interview's result shapes (flat and nested under
      // .evaluation) — the auto-end shape used to read as all-null here.
      chatInterview: readChatInterviewResult(parsedNotes.chatInterviewResult),
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
      existingAnalysisMeta?.evidenceFingerprint === evidenceFingerprint &&
      existingAnalysisMeta?.analysisVersion === ANALYSIS_VERSION;

    if (canReuseExistingAnalysis) {
      console.log("[trigger-ava-analysis] Reusing frozen analysis for unchanged evidence snapshot");
      return {
        ok: true,
        reused: true,
        superseded: false,
        score: application.ai_score,
        scorecard: existingScorecard,
        profile,
      };
    }

    // ========== AI ANALYSES LIMIT CHECK ==========
    if (employerId) {
      const subscriptionBypass = await hasSubscriptionBypassForUser(supabaseAdmin, employerId);

      if (subscriptionBypass) {
        console.log("[trigger-ava-analysis] Internal test account bypass active", { employerId });
      } else {
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
          return {
            ok: false,
            status: 403,
            body: {
              error: "Subscription inactive",
              message: "This employer's subscription is not active, so Ava analysis is unavailable.",
            },
            profile,
          };
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
              return {
                ok: false,
                status: 403,
                body: {
                  error: "AI analysis limit reached",
                  message: `You've reached your AI analysis limit (${currentCount}/${aiLimit}). Upgrade your plan for more analyses.`,
                  limitReached: true,
                },
                profile,
              };
            }
            console.log(`[trigger-ava-analysis] AI analysis count: ${currentCount}/${aiLimit}`);
          }
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

    // Add Chat Interview results if available (either result shape)
    const chatInterview = readChatInterviewResult(parsedNotes.chatInterviewResult);
    if (chatInterview) {
      content += `
Interview Results:
- Overall Score: ${chatInterview.score ?? 'N/A'}/100
- Recommendation: ${chatInterview.recommendation || 'N/A'}
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
      return {
        ok: false,
        status: 500,
        body: { error: "AI analysis failed", details: analysisError.message },
        profile,
      };
    }

    console.log("[trigger-ava-analysis] AI analysis completed, extracting score...");

    // Improved score extraction with multiple patterns - supports decimal scores
    const analysisText = analysisData?.analysis || "";
    const structuredScore = analysisData?.structuredScore as StructuredScore | null | undefined;
    let newScore: number | null = null;
    if (structuredScore) {
      // Deterministic aggregate of the judge's per-dimension sub-scores. The LLM's own
      // structuredScore.overallScore is intentionally never read here — it was found to
      // be nondeterministic (±3 across identical reruns) and too soft to separate a
      // clean resume from the same resume riddled with typos (~14pt gap vs. the ~24pt
      // gap the underlying sub-scores actually support). See computeJudgmentScore.
      newScore = computeJudgmentScore({
        directMatchScore: structuredScore.directMatchScore,
        transferableFitScore: structuredScore.transferableFitScore,
        learningSignalScore: structuredScore.learningSignalScore,
        writingQualityScore: structuredScore.writingQualityScore,
        attentionToDetailScore: structuredScore.attentionToDetailScore,
        authenticityScore: structuredScore.authenticityScore,
        specificityScore: structuredScore.specificityScore,
        hardRequirementConflicts: structuredScore.hardRequirementConflicts,
      });
      console.log(
        "[trigger-ava-analysis] Score computed via computeJudgmentScore (sub-scores only, LLM overallScore ignored):",
        newScore,
        "LLM's own overallScore was:",
        structuredScore.overallScore,
      );
    }

    // Pattern 1: FINAL CALCULATED SCORE (preferred) - supports decimals
    const finalScoreMatch = newScore === null
      ? analysisText.match(/FINAL CALCULATED SCORE[:\s]+(\d+(?:\.\d+)?)/i)
      : null;
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
    const chatInterviewScore = chatInterview?.score ?? null;
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
      jobRequirements: job?.requirements || null,
      jobSkillsRequired: Array.isArray(job?.skills_required) ? (job.skills_required as string[]) : null,
      experienceLevel: job?.experience_level || null,
      processingMode: job?.processing_mode ?? null,
      directMatchScore: structuredScore?.directMatchScore ?? null,
      transferableFitScore: structuredScore?.transferableFitScore ?? null,
      learningSignalScore: structuredScore?.learningSignalScore ?? null,
      writingQualityScore: structuredScore?.writingQualityScore ?? null,
      attentionToDetailScore: structuredScore?.attentionToDetailScore ?? null,
      authenticityScore: structuredScore?.authenticityScore ?? null,
      specificityScore: structuredScore?.specificityScore ?? null,
      hardRequirementConflicts: structuredScore?.hardRequirementConflicts ?? [],
      transferableEvidence: structuredScore?.transferableEvidence ?? [],
      evidenceFingerprint,
    });
    const analysisMeta = {
      provider: analysisData?.provider || "openai",
      model: analysisData?.model || null,
      analyzedAt: new Date().toISOString(),
      // When this run began, and the step that asked for it. A run only writes
      // if no run that STARTED later has written already (see below).
      analysisStartedAt: runStartedAt,
      triggeredByStep: currentPhaseId || null,
      analysisVersion: ANALYSIS_VERSION,
      evidenceFingerprint,
      structuredScoring: {
        enabled: !!structuredScore,
        directMatchScore: structuredScore?.directMatchScore ?? null,
        transferableFitScore: structuredScore?.transferableFitScore ?? null,
        learningSignalScore: structuredScore?.learningSignalScore ?? null,
        confidence: structuredScore?.confidence ?? null,
        summary: structuredScore?.summary ?? null,
      },
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
    // ---- Saving. In auto mode this runs in the background, after the
    // candidate has already moved on (and may already be submitting the next
    // step), so it must never overwrite anything newer than itself:
    //
    // 1. A run that started earlier never overwrites one that started later
    //    (runs take 37-47 s and retries can stretch one, so they can finish
    //    out of order). The window between this read and the writes below is
    //    milliseconds, against runs that start tens of seconds apart.
    // 2. It writes ONLY analysis fields. Never phase, never status.
    // 3. Its notes keys (avaScorecard, avaAnalysisMeta) go through
    //    merge_application_notes, which merges just those two keys into what
    //    is stored at that moment. This used to write the whole notes object
    //    from the snapshot taken at the start of the request, ~40 s earlier,
    //    and would have erased the next step's result.
    const { data: freshRow, error: freshError } = await supabaseAdmin
      .from("applications")
      .select("notes")
      .eq("id", applicationId)
      .maybeSingle();
    if (freshError) {
      console.error("[trigger-ava-analysis] Could not re-read the application before saving:", freshError);
      return { ok: false, status: 500, body: { error: "Failed to save analysis", details: freshError.message }, profile };
    }
    const freshNotes = parseNotesObject(freshRow?.notes);
    const storedMeta = (freshNotes.avaAnalysisMeta || {}) as Record<string, unknown>;
    if (typeof storedMeta.analysisStartedAt === "string" && storedMeta.analysisStartedAt > runStartedAt) {
      console.log("[trigger-ava-analysis] A newer analysis has already been saved; this older run writes nothing", {
        applicationId,
        thisRunStartedAt: runStartedAt,
        savedRunStartedAt: storedMeta.analysisStartedAt,
      });
      return { ok: true, reused: false, superseded: true, score: finalScore, scorecard, profile };
    }

    // Auto mode: Ava's read is information for the owner, never an action —
    // her rationale says so ("nobody was stopped, and the decision is yours").
    // It replaces the step's own phase_ai_analysis line the way the old
    // advance did. Manual runs leave that column to handleAutopilotDecision.
    const phaseAnalysisNote = autoMode ? scorecard?.rationale || null : null;

    // Update the application with AI analysis using admin client (bypasses RLS)
    // ai_score mirrors scorecard.overallScore exactly — buildAvaScorecard is the single
    // source of truth for the persisted score, so this column and the canonical
    // scorecard below can never disagree.
    const { error: updateError } = await supabaseAdmin
      .from("applications")
      .update({
        ai_analysis: analysisData?.analysis || null,
        ai_score: typeof scorecard?.overallScore === "number" ? scorecard.overallScore : null,
        // Canonical scorecard — single source of truth read by every screen.
        ai_scorecard: scorecard ?? null,
        // Only set resume_score if the resume was actually analyzed (not RESUME_UNAVAILABLE)
        resume_score: resumeUnavailable ? null : (typeof newScore === "number" && newScore >= 0 && newScore <= 100 ? newScore : null),
        ...(phaseAnalysisNote ? { phase_ai_analysis: phaseAnalysisNote } : {}),
      })
      .eq("id", applicationId);

    if (updateError) {
      console.error("[trigger-ava-analysis] Failed to update application:", updateError);
      return { ok: false, status: 500, body: { error: "Failed to save analysis", details: updateError.message }, profile };
    }

    const { error: notesError } = await supabaseAdmin.rpc("merge_application_notes", {
      p_application_id: applicationId,
      p_patch: withoutNulCharacters({ avaScorecard: scorecard, avaAnalysisMeta: analysisMeta }),
    });
    if (notesError) {
      if (!isMissingFunctionError(notesError)) {
        console.error("[trigger-ava-analysis] Failed to save the scorecard into notes:", notesError);
        return { ok: false, status: 500, body: { error: "Failed to save analysis", details: notesError.message }, profile };
      }
      // Migration 20261005180943 not applied yet. Degrade to a whole-notes
      // write built from the row read a moment ago (not the request's own
      // snapshot), and say so loudly.
      console.error(
        "[trigger-ava-analysis] merge_application_notes does not exist — apply migration 20261005180943_merge_application_notes.sql. Falling back to a whole-notes write.",
      );
      const { error: fallbackError } = await supabaseAdmin
        .from("applications")
        .update({ notes: JSON.stringify({ ...freshNotes, avaScorecard: scorecard, avaAnalysisMeta: analysisMeta }) })
        .eq("id", applicationId);
      if (fallbackError) {
        console.error("[trigger-ava-analysis] Fallback notes write failed:", fallbackError);
        return { ok: false, status: 500, body: { error: "Failed to save analysis", details: fallbackError.message }, profile };
      }
    }

    console.log("[trigger-ava-analysis] Analysis completed successfully for application:", applicationId, "score:", finalScore);

    return { ok: true, reused: false, superseded: false, score: finalScore, scorecard, profile };
  } catch (error) {
    console.error("[trigger-ava-analysis] Analysis failed:", error);
    return {
      ok: false,
      status: 500,
      body: { error: "Unexpected error", details: error instanceof Error ? error.message : "Unknown" },
      profile: null,
    };
  }
}

/**
 * Auto-mode jobs (processing_mode read from the database, never from the
 * request). Owner, 2026-10-05: nobody is ever parked part-way; every
 * applicant takes every test up to and including the last one, Ava only
 * scores and flags, and he decides at the end.
 *
 * So the move to the next step no longer waits on, or reads, Ava: it is
 * advanceAfterStep (_shared/trustedResults.ts) — the finished step must be
 * the row's current phase and its result must be stored, and one
 * compare-and-set moves them on (to Decision after the last step). The
 * browser gets its answer in well under a second; Ava's ~40 s analysis then
 * runs in the background and only ever writes analysis fields. Her decline
 * recommendation is stored for the owner and never acted on.
 *
 * `awaitAnalysis` (autopilot-batch) waits for the analysis before answering,
 * so a batch scores one application at a time instead of starting dozens of
 * background LLM calls at once.
 */
async function handleAutoModeStep(params: {
  context: AnalysisContext;
  previewOnly: boolean;
  awaitAnalysis: boolean;
}) {
  const { context, previewOnly, awaitAnalysis } = params;
  const { supabaseAdmin, application, applicationId, job, currentPhaseId } = context;
  const steps = buildCandidateJourney((job?.workflow_steps as WorkflowStepLike[]) || [], {
    hasQuiz: Array.isArray(job?.quiz_questions) && job.quiz_questions.length > 0,
  });
  const snapshot: AdvanceSnapshot = {
    phase: typeof application.phase === "string" ? application.phase : null,
    status: typeof application.status === "string" ? application.status : null,
    notes: application.notes,
    voice_interview_result: application.voice_interview_result,
  };

  if (previewOnly) {
    // What the move WOULD be, with a fresh score, and nothing moved.
    const plan = planAutoAdvance({
      steps,
      completedStepId: currentPhaseId,
      application: snapshot,
      processingMode: job?.processing_mode,
    });
    const analysis = await runAvaAnalysis(context);
    if (!analysis.ok) return jsonResponse(analysis.body, analysis.status);
    const wouldBe: AdvanceAfterStepOutcome = plan.kind === "refused"
      ? { kind: "refused", reason: plan.reason, currentPhase: snapshot.phase, currentStatus: snapshot.status }
      : plan.kind === "advance"
        ? { ...plan, moved: true }
        : plan;
    return jsonResponse({ ...autoModeAnswer(wouldBe, analysis, false), previewOnly: true });
  }

  if (!currentPhaseId) {
    // The advance never guesses the finished step from the stored phase: a
    // retry or a stale tab would skip a step that way.
    return jsonResponse({
      error: "currentPhaseId is required",
      message: "Say which step was just finished; nobody is moved on a guess.",
    }, 400);
  }

  const outcome = await advanceAfterStep(supabaseAdmin as unknown as AdvanceAdmin, {
    applicationId,
    steps,
    completedStepId: currentPhaseId,
    application: snapshot,
    processingMode: job?.processing_mode,
  });

  if (outcome.kind === "error") {
    console.error("[trigger-ava-analysis] Moving the candidate on failed:", outcome.error);
    return jsonResponse({ error: "Failed to advance application", details: outcome.error }, 500);
  }

  console.log("[trigger-ava-analysis] Auto-mode step outcome", {
    applicationId,
    completedStepId: currentPhaseId,
    outcome: outcome.kind,
    nextPhaseId: "nextStep" in outcome ? outcome.nextStep.id : null,
    reason: outcome.kind === "refused" ? outcome.reason : null,
  });

  // Score when this request moved them on, or when no stored analysis has
  // read this step's result yet (shouldScoreAfterStep). The second case is
  // not only a repeat: complete-video-intro and ai-analyze-portfolio move
  // the candidate on themselves (recordStepResult, advance "auto_mode"), so
  // the page's own call after a video or a portfolio always finds them
  // "already_advanced" and is the only request that will ever ask for that
  // step to be scored. A true repeat starts nothing (and does not notify the
  // employer twice); a refused request scores nothing; a batch always waits
  // for a score.
  const startsAnalysis = shouldScoreAfterStep(outcome, application.notes);
  if (!startsAnalysis && !awaitAnalysis) {
    return jsonResponse(autoModeAnswer(outcome, null, false));
  }

  const task = scoreAfterStep(context, outcome);
  if (awaitAnalysis) {
    return jsonResponse(autoModeAnswer(outcome, await task, false));
  }
  await runInBackground("Background analysis", task);
  return jsonResponse(autoModeAnswer(outcome, null, true));
}

/** The background half of an auto-mode step: Ava's analysis, then (only if a
 *  voice interview is next) the employer's heads-up, which wants her score. */
async function scoreAfterStep(context: AnalysisContext, outcome: AdvanceAfterStepOutcome): Promise<AnalysisOutcome> {
  const startedAt = Date.now();
  const analysis = await runAvaAnalysis(context);
  if (analysis.ok) {
    console.log("[trigger-ava-analysis] Background analysis finished", {
      applicationId: context.applicationId,
      seconds: Math.round((Date.now() - startedAt) / 100) / 10,
      score: analysis.score,
      reused: analysis.reused,
      superseded: analysis.superseded,
    });
  } else {
    console.error("[trigger-ava-analysis] Background analysis did not save", {
      applicationId: context.applicationId,
      status: analysis.status,
      body: analysis.body,
    });
  }

  if (outcome.kind === "needs_employer_approval") {
    await notifyEmployerInterviewReady({
      supabaseAdmin: context.supabaseAdmin,
      employerId: context.job?.employer_id,
      job: context.job,
      profile: analysis.profile,
      applicationId: context.applicationId,
      score: analysis.ok ? analysis.score : null,
    });
  }
  return analysis;
}

/** The JSON the candidate's page (or autopilot-batch) gets for an auto-mode
 *  step. Same decision vocabulary the pages already branch on:
 *  "advanced" | "needs_employer_approval" | "rejected" | anything else
 *  (they re-read the row). */
function autoModeAnswer(
  outcome: AdvanceAfterStepOutcome,
  analysis: AnalysisOutcome | null,
  analysisRunning: boolean,
): Record<string, unknown> {
  const scoreFields = analysis && analysis.ok
    ? { score: analysis.score, scorecard: analysis.scorecard, autopilotAction: analysis.scorecard?.autopilotAction ?? null }
    : { score: null, scorecard: null, autopilotAction: null };
  // An analysis this request waited for (awaitAnalysis: autopilot-batch)
  // that did not save is said out loud, so a batch never reports an
  // unscored applicant as handled. The move itself still stands.
  const analysisField = analysis && !analysis.ok
    ? {
        analysisPending: analysisRunning,
        analysisError: {
          status: analysis.status,
          error: typeof analysis.body?.error === "string" ? analysis.body.error : "Analysis failed",
          details: typeof analysis.body?.details === "string" ? analysis.body.details : null,
        },
      }
    : { analysisPending: analysisRunning };

  switch (outcome.kind) {
    case "advance":
    case "already_advanced":
      return {
        success: true,
        message: outcome.finishedAllSteps
          ? "Every step is done; the application is with the hiring team"
          : "Step recorded; the next step is open",
        decision: "advanced",
        nextPhaseId: outcome.nextStep.id,
        nextPhaseTitle: outcome.nextStep.title,
        finishedAllSteps: outcome.finishedAllSteps,
        alreadyAdvanced: outcome.kind === "already_advanced",
        ...analysisField,
        ...scoreFields,
      };
    case "needs_employer_approval":
      return {
        success: true,
        message: "Step recorded; the next step is an interview the employer sets up",
        decision: "needs_employer_approval",
        reason: "Next phase is Ava Interview which requires employer configuration",
        ...analysisField,
        ...scoreFields,
      };
    case "refused":
      return {
        success: true,
        skipped: true,
        message:
          outcome.reason === "result_missing"
            ? "This step's result is not saved yet, so nobody was moved"
            : outcome.reason === "application_closed"
              ? "This application is already decided"
              : "The application is no longer on this step, so nothing was changed",
        decision:
          outcome.reason === "application_closed" && outcome.currentStatus === "rejected"
            ? "rejected"
            : outcome.reason === "result_missing"
              ? "not_ready"
              : "stale",
        reason: outcome.reason,
        currentStatus: outcome.currentStatus,
        currentPhase: outcome.currentPhase,
        ...analysisField,
        ...scoreFields,
      };
    default:
      return { success: false, error: "Unexpected outcome" };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      applicationId,
      force = false,
      autopilotDecision = false,
      previewOnly = false,
      currentPhaseId = null,
      // autopilot-batch: wait for Ava's analysis before answering (see handleAutoModeStep).
      awaitAnalysis = false,
    } = await req.json();
    
    if (!applicationId) {
      return new Response(
        JSON.stringify({ error: "applicationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[trigger-ava-analysis] Starting analysis for application:", applicationId, "force:", force, "autopilotDecision:", autopilotDecision, "previewOnly:", previewOnly, "currentPhaseId:", currentPhaseId, "awaitAnalysis:", awaitAnalysis);

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

    // Team-member access must be scoped to THIS job the same way the live
    // RLS policy on `applications` scopes it ("Team members can view
    // applications for assigned jobs" -> is_active_team_member_for_job),
    // whose definition requires assigned_job_ids to be null (whole-employer
    // access) OR contain this job's id. A plain team_members row check
    // (user_id + employer_id + active) would let a team member scoped to
    // job A trigger/read analysis for job B's application at the same
    // employer -- call the same SECURITY DEFINER function the applications
    // RLS policy uses (via the caller's own JWT, so its
    // p_user_id = auth.uid() check passes) instead of re-implementing the
    // scoping rule here.
    const [teamMemberRpc, { data: developerRole }] = await Promise.all([
      !isCandidateOwner && !isEmployerOwner && employerId
        ? supabaseUserClient.rpc("is_active_team_member_for_job", {
            p_job_id: application.job_id,
            p_user_id: requestingUser.id,
          })
        : Promise.resolve({ data: false, error: null }),
      supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", requestingUser.id)
        .eq("role", "developer")
        .maybeSingle(),
    ]);

    if (teamMemberRpc.error) {
      // Fail closed: an RPC error must never be treated as access granted.
      console.error("[trigger-ava-analysis] is_active_team_member_for_job RPC error:", teamMemberRpc.error);
    }
    const isScopedTeamMember = isScopedTeamMemberFromRpc(teamMemberRpc);

    if (!isCandidateOwner && !isEmployerOwner && !isScopedTeamMember && !developerRole) {
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


    const job = application.jobs as any;
    // processing_mode comes from the database row, never from the request.
    const autoMode = job?.processing_mode === "auto";
    const analysisContext: AnalysisContext = {
      supabaseAdmin,
      application,
      applicationId,
      job,
      employerId,
      force: !!force,
      currentPhaseId: typeof currentPhaseId === "string" && currentPhaseId ? currentPhaseId : null,
      autoMode,
    };

    if (autoMode && (autopilotDecision || previewOnly)) {
      return await handleAutoModeStep({
        context: analysisContext,
        previewOnly: !!previewOnly,
        awaitAnalysis: !!awaitAnalysis,
      });
    }

    // Manual jobs, and every score-only call: unchanged — the analysis runs
    // while the caller waits.
    const analysis = await runAvaAnalysis(analysisContext);
    if (!analysis.ok) {
      return jsonResponse(analysis.body, analysis.status);
    }

    if (analysis.reused && !autopilotDecision && !previewOnly) {
      return jsonResponse({
        success: true,
        message: "Analysis already present",
        skipped: true,
        reused: true,
        score: analysis.score,
        scorecard: analysis.scorecard,
      });
    }

    if (autopilotDecision || previewOnly) {
      return await handleAutopilotDecision({
        supabaseAdmin,
        application,
        applicationId,
        currentPhaseId: currentPhaseId || application.phase,
        passingScore: (job?.passing_score as number) || 60,
        score: analysis.score,
        scorecard: analysis.scorecard,
        profile: analysis.profile,
        job,
        previewOnly,
      });
    }

    return jsonResponse({ 
      success: true, 
      message: "Analysis completed and saved",
      score: analysis.score,
      forced: force,
      scorecard: analysis.scorecard,
    });

  } catch (error) {
    console.error("[trigger-ava-analysis] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: error instanceof Error ? error.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
