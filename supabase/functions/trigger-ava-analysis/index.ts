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
  chatTypingBlendScore,
  chatTypingEvidenceLine,
  chatTypingForJob,
  computeJudgmentScore,
  familyPhaseWeights,
  formatQuizAreas,
  formDealBreakersFrom,
  formReviewFlagsFrom,
  highSignalProgress,
  inferJobFamily,
  orphanFlagOptions,
  phaseBlendScore,
  quizAreaBreakdown,
  quizAreaLabel,
  readChatInterviewResult,
  readChatSimulationResult,
  readQuizResult,
  resolveAutopilotAction,
  type AvaScorecard,
  type AutopilotAction,
  type ConflictNote,
} from "../_shared/autopilot.ts";
import { buildCandidateJourney, type WorkflowStepLike } from "../_shared/candidateJourney.ts";
import { AI_UNAVAILABLE_RETRY_AFTER_SECONDS } from "../_shared/openai.ts";
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
import { connectionEvidenceLine, recordedEquipmentCheck } from "../_shared/connectionStamps.ts";

// 5 (2026-10-05): the scorecard's auto-mode rules changed (nobody is stopped
// part-way; dealBreakerFlags), and the written interview is read in both of
// its shapes. Bumping it re-runs a frozen analysis once instead of reusing a
// scorecard built on the old rules.
// 6 (2026-10-06): team-lead scoring (tests 0.65 / judgment 0.35 once the
// tests are done, judgment counted once, leadership and adaptability
// evidence), "advance" needs every hard requirement met, a recommended
// decline sorts below the pass mark, a finished test's own result is never a
// conflict, form deal-breakers, a real 0 is a score, an ungraded result is
// not, and the judge now sees responsibilities, the skills check by area and
// the interview's concerns.
// 7 (2026-10-06, second pass): the judge says where each conflict came from
// (a finished test's own result is never a conflict); the interview's
// credibility is a review flag, not a verdict; availability is read from the
// form, never from the judge's prose; more measured shortfalls keep a card off
// "advance"; a decline-grade flag sorts below the pass mark mid-way; a lead
// job's tests weigh in proportion to the tests it has; the judge's narrative
// number is used when it returns no sub-scores; the resume penalty applies
// only when a resume was asked for or sent; and the team-lead judge rates the
// application only, never the tests.
// 8 (2026-10-06, third pass): the escalated chat practice's own findings (a
// new promise or disrespect in the lead's own words, what capped the score, a
// chat the grader wants a person to read) and the lead interview's own marks
// (leadership, adaptability, working lead, written English, an interview cut
// short and the topics it never asked) reach the judge, the fingerprint and
// the scorecard's flags; a test graded from the page's own transcript
// (transcriptSource "browser") is flagged as not trusted.
// 9 (2026-10-06, typing in the chat): typing is measured while they write
// their chat practice replies (notes.chatSimulationResult.typing,
// docs/TYPING-IN-CHAT.md). On a job with no typing step the chat block
// prints the typing line and the fingerprint carries it; a speed under the
// chat step's bar, a median reply time over it, or replies that arrived
// without being typed is a flag and a reason for "review" (the first two
// also a "why down" line), and a team lead's tests take typing's 0.10 from
// it (chatTypingBlendScore). A job with a typing step is unchanged: the
// judge never sees the chat's typing there.
const ANALYSIS_VERSION = 9;

/** What capped a lead's escalated chat score, in words (readChatSimulationResult.cappedBy). */
const CHAT_CAP_LABELS: Record<string, string> = {
  new_promise: "a new promise",
  disrespect: "disrespect to the player",
  tone: "tone",
};

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
  /** Team-lead jobs only (ai-analyze asks for them when context.job_family is "team_lead"). */
  leadershipEvidenceScore?: number | null;
  adaptabilityEvidenceScore?: number | null;
  hardRequirementConflicts: string[];
  /**
   * Where each conflict came from, index for index ("application", "resume",
   * "interview", or "test:<name>" for a test's own result). Built by
   * ai-analyze's sanitizer from the judge's { text, source } objects, so the
   * two arrays always line up; absent from an older ai-analyze.
   */
  hardRequirementConflictSources?: Array<string | null>;
  transferableEvidence: string[];
  confidence: number;
  summary: string;
}

/** The judge's conflicts with their sources, as autopilot.ts reads them (a plain string when no source came back). */
function sourcedConflictNotes(structured: StructuredScore | null | undefined): ConflictNote[] {
  const texts = Array.isArray(structured?.hardRequirementConflicts) ? structured!.hardRequirementConflicts : [];
  const sources = Array.isArray(structured?.hardRequirementConflictSources) ? structured!.hardRequirementConflictSources : [];
  return texts.map((text, index) => {
    const source = sources[index];
    return typeof source === "string" && source.trim() ? { text, source: source.trim() } : text;
  });
}

/** A finite number or null: a real 0 stays 0 (`x || null` made it "not taken"). */
function finiteOrNull(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(
    JSON.stringify(body),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

/**
 * Whether a failed ai-analyze call was the AI service refusing (2026-10-07:
 * its 503 `ai_unavailable`, out of credit / rate limited / down) rather than
 * a broken request. supabase-js hands a non-2xx answer back as an error whose
 * `context` is the Response.
 */
async function analyzeRefusedByService(error: unknown): Promise<boolean> {
  const context = error && typeof error === "object" ? (error as { context?: unknown }).context : null;
  if (!(context instanceof Response) || context.status !== 503) return false;
  try {
    const body = await context.clone().json();
    return body?.code === "ai_unavailable" || body?.error === "ai_unavailable";
  } catch {
    return false;
  }
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
      hasEquipmentCheck: !!parsedNotes.equipmentCheckResult,
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
    // Every step's result, read once and the same way for the fingerprint,
    // the judge's content and the score. A real 0 is a score; a result the
    // grader marked `graded: false` is not (2026-10-06).
    const inferredFamily = inferJobFamily(job?.title || null, job?.description || null);
    const teamLead = inferredFamily === "team_lead";
    const quizReading = readQuizResult(parsedNotes);
    const quizAreas = quizAreaBreakdown(quizReading?.answers, job?.quiz_questions);
    const chatSimulation = readChatSimulationResult(parsedNotes.chatSimulationResult);
    // Typing measured in the chat practice (docs/TYPING-IN-CHAT.md), only when
    // it is this job's typing measure: the job has no typing step. A job that
    // still has one is judged, fingerprinted and scored on its typing test
    // alone, exactly as before (the judge is never shown a second figure).
    const chatTypingInUse = chatTypingForJob(workflowSteps, chatSimulation?.typing ?? null);
    const salesSimulation = readChatSimulationResult(parsedNotes.salesSimulationResult);
    const chatInterview = readChatInterviewResult(parsedNotes.chatInterviewResult);
    // The owner's own deal-breaker answers on the form (questions with
    // flag_options / flag_label in jobs.application_questions).
    const formDealBreakers = formDealBreakersFrom(job?.application_questions, applicationAnswers);
    // …and the answers he marked for review only (flag_severity "review"):
    // shown, never a decline (partial shift cover, "Never" led a team).
    const formReviewFlags = formReviewFlagsFrom(job?.application_questions, applicationAnswers);
    // A flag the owner set on an option he has since renamed catches nobody;
    // say so in the log until the job editor refuses it on save.
    const orphanFlags = orphanFlagOptions(job?.application_questions);
    if (orphanFlags.length > 0) {
      console.warn("[trigger-ava-analysis] flag_options that match none of their question's options (they catch nobody):", orphanFlags);
    }
    const typingRequiredWpmForFlag = finiteOrNull(parsedNotes.typingTestResult?.requiredWpm, job?.required_wpm);
    // The computer and connection check (docs/EQUIPMENT-CHECK.md §6): read
    // here, once, for the fingerprint, the content block, the scorecard's
    // flags and inputsUsed. It MUST be part of the fingerprint: otherwise the
    // result landing changes nothing and the frozen analysis is reused. Only
    // a result the SERVER recorded counts (its _trusted marker on one of this
    // job's equipment_check steps): a value without one is not "timed by our
    // server", whatever it says about itself.
    const equipmentCheck = recordedEquipmentCheck(
      parsedNotes,
      workflowSteps.filter((step) => step?.type === "equipment_check").map((step) => String(step.id)),
    );
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
      quizResult: quizReading
        ? {
            score: quizReading.score,
            correct: quizReading.correct,
            total: quizReading.total,
            passed: quizReading.passed,
            missedAreas: quizAreas.missed,
          }
        : null,
      typingTest: parsedNotes.typingTestResult
        ? {
            score: finiteOrNull(parsedNotes.typingTestResult.score),
            wpm: finiteOrNull(parsedNotes.typingTestResult.wpm),
            accuracy: finiteOrNull(parsedNotes.typingTestResult.accuracy),
            requiredWpm: typingRequiredWpmForFlag,
          }
        : null,
      chatSimulation: chatSimulation
        ? {
            score: chatSimulation.score,
            graded: chatSimulation.graded,
            empathy: chatSimulation.empathy,
            problemSolving: chatSimulation.problemSolving,
            improvements: chatSimulation.improvements,
            // The escalated rubric's own findings, and where the transcript
            // came from: each changes what the judge and the owner are told.
            rubric: chatSimulation.rubric,
            ownership: chatSimulation.ownership,
            correctedAgent: chatSimulation.correctedAgent,
            newPromiseMade: chatSimulation.newPromiseMade,
            newPromiseQuote: chatSimulation.newPromiseQuote,
            newPromiseUnverified: chatSimulation.newPromiseUnverified,
            disrespectMade: chatSimulation.disrespectMade,
            disrespectQuote: chatSimulation.disrespectQuote,
            cappedBy: chatSimulation.cappedBy,
            needsReview: chatSimulation.needsReview,
            reviewReasons: chatSimulation.reviewReasons,
            transcriptSource: chatSimulation.transcriptSource,
            // Typing measured in the chat (speed, corrections, reply time,
            // typos, the bars), on a job with no typing step only: it changes
            // the judge's line, the flags and, for a lead, the tests blend.
            typing: chatTypingInUse,
          }
        : null,
      formDealBreakers,
      formReviewFlags,
      equipmentCheck: equipmentCheck
        ? {
            downloadMbps: equipmentCheck.downloadMbps,
            uploadMbps: equipmentCheck.uploadMbps,
            latencyMs: equipmentCheck.latencyMs,
            meetsBars: equipmentCheck.meetsBars,
            usingThisComputer: equipmentCheck.usingThisComputer,
            deviceKind: equipmentCheck.deviceKind,
            measuredAt: equipmentCheck.measuredAt || null,
          }
        : null,
      // Both of the interview's result shapes (flat and nested under
      // .evaluation) — the auto-end shape used to read as all-null here —
      // with its concerns, credibility and inconsistencies, a lead's own
      // marks and quotes, whether it was cut short (incomplete,
      // mustCoverMissing) and where its transcript came from: the whole
      // reading, so every field it carries is in the fingerprint.
      chatInterview,
      salesSimulation: parsedNotes.salesSimulationResult
        ? {
            score: salesSimulation?.score ?? null,
            graded: salesSimulation?.graded ?? true,
            transcriptSource: salesSimulation?.transcriptSource ?? null,
            discovery: finiteOrNull(parsedNotes.salesSimulationResult.discovery),
            objectionHandling: finiteOrNull(parsedNotes.salesSimulationResult.objectionHandling),
          }
        : null,
      videoIntro: parsedNotes.videoIntroResult || parsedNotes.videoIntroUrl
        ? {
            score: finiteOrNull(parsedNotes.videoIntroResult?.score),
            submitted: !!parsedNotes.videoIntroUrl,
          }
        : null,
      portfolio: parsedNotes.portfolioResult
        ? {
            score: finiteOrNull(parsedNotes.portfolioResult.aiAnalysis?.score, parsedNotes.portfolioResult.score),
            fileCount: parsedNotes.portfolioResult.files?.length || parsedNotes.portfolioResult.fileCount || null,
          }
        : null,
      voiceInterview: application.voice_interview_result
        ? {
            overallScore: finiteOrNull(application.voice_interview_result.overall_score),
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

    // The skills check lives in jobs.quiz_questions, not workflow_steps, so it
    // was never on this list, and the judge was told to leave out phases that
    // are not on it: in every live analysis it never mentioned the skills check.
    const quizConfiguredForPhases = Array.isArray(job?.quiz_questions) && job.quiz_questions.length > 0;
    const phaseList = [...(quizConfiguredForPhases ? ["quiz (skills check)"] : []), ...workflowPhaseTypes];

    let content = `
Job Title: ${job?.title || "Unknown"}
Job Description: ${job?.description || "Not provided"}
Requirements: ${job?.requirements || "Not specified"}
Responsibilities: ${job?.responsibilities || "Not specified"}
Skills Required: ${job?.skills_required?.join(", ") || "Not specified"}
Experience Level: ${job?.experience_level || "Not specified"}

=== JOB WORKFLOW PHASES (ONLY analyze these phases) ===
${phaseList.length > 0 ? phaseList.map((p: string) => `- ${p}`).join("\n") : "- application_form (standard application only)"}

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

    // A team lead's tests are scored by the system, at 0.65 of the number
    // (_shared/autopilot.ts). The judge's sub-scores rate the application and
    // any resume only; if a test result also moved them, the same result was
    // counted twice (2026-10-06, second pass). It still sees every result, to
    // describe in its report, under a label that says so.
    if (teamLead) {
      content += `
=== TEST RESULTS (for your written summary only, NOT for scoring) ===
The system scores every test below separately. They must not raise or lower any structuredScore sub-score, and a test's own result is never a hard requirement conflict. Describe them in the PHASE PERFORMANCE SUMMARY.
`;
    }

    // Add Typing Test results if available (include requiredWpm for context)
    if (parsedNotes.typingTestResult) {
      const typingRequiredWpm = parsedNotes.typingTestResult.requiredWpm || job?.required_wpm || 35;
      const meetsRequirement = parsedNotes.typingTestResult.wpm >= typingRequiredWpm;
      content += `
Typing Test Results:
- Speed: ${parsedNotes.typingTestResult.wpm} WPM
- Required: ${typingRequiredWpm} WPM
- Accuracy: ${parsedNotes.typingTestResult.accuracy}%
- Score: ${parsedNotes.typingTestResult.score ?? 'N/A'}
- Performance: ${meetsRequirement ? 'Meets requirement' : 'Below requirement'}
`;
    }

    // The computer and connection check, timed by our server (one line, the
    // job's own bars inside it: docs/EQUIPMENT-CHECK.md §6). Evidence for the
    // narrative, never a score.
    if (equipmentCheck) {
      content += `
Computer and connection check (equipment_check):
- ${connectionEvidenceLine(equipmentCheck)}
`;
    }

    // Add Quiz answers if available. The totals alone made missing the
    // integrity or money question look the same as missing the writing one, so
    // the judge also gets the result by area (the job's own categories joined
    // to the candidate's own isCorrect; no answer key is in either).
    if (quizReading) {
      content += `
Skills Check (quiz) Performance:
- Score: ${quizReading.score ?? 'N/A'}%
- Correct: ${quizReading.correct ?? 'N/A'}/${quizReading.total ?? 'N/A'}
- Passed: ${quizReading.passed ? 'Yes' : 'No'}
${quizAreas.areas.length > 0 ? `- By area: ${formatQuizAreas(quizAreas.areas)}\n` : ""}${quizAreas.mustPassMissed.length > 0 ? `- Must-pass areas missed: ${quizAreas.mustPassMissed.map(quizAreaLabel).join(", ")}\n` : ""}`;
    }

    // Add Chat Simulation results if available
    if (chatSimulation) {
      // The rubric follows the case that was played (a takeover case is
      // marked as a team leader whatever the job), so the label does too.
      const escalatedChat = teamLead || chatSimulation.rubric === "team_lead";
      const chatLabel = escalatedChat
        ? "Escalated chat practice (team leader took over a mishandled chat) Results"
        : "Chat Simulation (Customer Support) Results";
      const leadChatLines = chatSimulation.rubric === "team_lead"
        ? `- Owned the team's mistake: ${chatSimulation.ownership ?? 'N/A'}/100
- Corrected the agent plainly: ${chatSimulation.correctedAgent ?? 'N/A'}/100
- New promise made: ${chatSimulation.newPromiseMade ? `YES, "${chatSimulation.newPromiseQuote ?? ''}" (score capped at 40)` : 'No'}
${chatSimulation.disrespectMade ? `- Disrespectful to the player: YES, "${chatSimulation.disrespectQuote ?? ''}"\n` : ""}${chatSimulation.newPromiseUnverified ? `- Possible new promise, not confirmed: "${chatSimulation.newPromiseUnverified}"\n` : ""}${chatSimulation.cappedBy.length > 0 ? `- Score capped by: ${chatSimulation.cappedBy.map((cap) => CHAT_CAP_LABELS[cap] ?? cap).join(", ")}\n` : ""}`
        : "";
      content += chatSimulation.graded
        ? `
${chatLabel}:
- Score: ${chatSimulation.score ?? 'N/A'}/100
- Empathy: ${chatSimulation.empathy ?? 'N/A'}%
- Problem Solving: ${chatSimulation.problemSolving ?? 'N/A'}%
${leadChatLines}${chatSimulation.improvements.length > 0 ? `- To improve: ${chatSimulation.improvements.join("; ")}\n` : ""}${chatSimulation.needsReview ? `- Needs a person to read it: ${chatSimulation.reviewReasons.join("; ") || "the grader asked for a review"}\n` : ""}${chatSimulation.transcriptSource === "browser" ? "- Graded from the transcript the page sent, not our own record: not trusted.\n" : ""}`
        : `
${chatLabel}:
- Not graded: the grader failed, so there is no score yet. Do not count it either way.
`;
      // Typing, measured while they wrote these replies (docs/TYPING-IN-CHAT.md),
      // on a job with no typing step only. Its own line whether or not the
      // grader marked the chat: speed and reply time never came from the grader.
      if (chatTypingInUse) {
        content += `- ${chatTypingEvidenceLine(chatTypingInUse)}\n`;
      }
    }

    // Add Chat Interview results if available (either result shape)
    if (chatInterview) {
      // A lead interview's own marks, each with the candidate's words behind it.
      const leadMark = (label: string, key: string, value: number | null) =>
        `- ${label}: ${value ?? 'not asked'}${value === null ? "" : "/100"}${chatInterview.leadEvidence[key] ? ` ("${chatInterview.leadEvidence[key]}")` : ""}\n`;
      // Present only when the interview was marked on the lead plan (written
      // English is always marked there); an older result has none of them.
      const leadPlanMarked = [chatInterview.leadership, chatInterview.adaptability, chatInterview.workingLead, chatInterview.writtenEnglish]
        .some((value) => value !== null);
      const leadInterviewLines = leadPlanMarked
        ? `${leadMark("Leadership", "leadership", chatInterview.leadership)}${leadMark("Adaptability", "adaptability", chatInterview.adaptability)}${leadMark("Works shifts and leads (working lead)", "workingLead", chatInterview.workingLead)}${chatInterview.writtenEnglish !== null ? leadMark("Written English", "writtenEnglish", chatInterview.writtenEnglish) : ""}`
        : "";
      content += chatInterview.graded
        ? `
Interview Results:
- Overall Score: ${chatInterview.score ?? 'N/A'}/100
- Recommendation: ${chatInterview.recommendation || 'N/A'}
${leadInterviewLines}${chatInterview.incomplete ? `- Incomplete: ended before the lead plan was covered${chatInterview.mustCoverMissing.length > 0 ? ` (not asked: ${chatInterview.mustCoverMissing.join(", ")})` : ""}\n` : ""}${chatInterview.credibilityRating ? `- Credibility: ${chatInterview.credibilityRating}\n` : ""}${chatInterview.summary ? `- Summary: ${chatInterview.summary}\n` : ""}${chatInterview.concerns.length > 0 ? `- Concerns: ${chatInterview.concerns.join("; ")}\n` : ""}${chatInterview.inconsistencies.length > 0 ? `- Inconsistencies (claim → evidence): ${chatInterview.inconsistencies.join("; ")}\n` : ""}${chatInterview.transcriptSource === "browser" ? "- Graded from the answers the page sent, not our own record: not trusted.\n" : ""}`
        : `
Interview Results:
- Not graded: the grader failed, so there is no score yet. Do not count it either way.
`;
    }

    // Add Sales Simulation results if available
    if (parsedNotes.salesSimulationResult) {
      content += `
Sales Simulation Results:
- Score: ${salesSimulation?.score ?? 'N/A'}/100
- Discovery: ${parsedNotes.salesSimulationResult.discovery ?? 'N/A'}%
- Objection Handling: ${parsedNotes.salesSimulationResult.objectionHandling ?? 'N/A'}%
- Would Buy: ${parsedNotes.salesSimulationResult.wouldBuy ?? 'N/A'}
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
- Score: ${analysis?.score ?? parsedNotes.portfolioResult.score ?? 'N/A'}/100
- Relevance: ${analysis?.relevance?.score ?? 'N/A'}%
- Quality: ${analysis?.quality?.score ?? 'N/A'}%
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
- Overall Score: ${vr.overall_score ?? 'N/A'}/100
- Recommendation: ${vr.recommendation || 'N/A'}
- Technical Score: ${vr.technical_score ?? 'N/A'}/100
- Communication Score: ${vr.communication_score ?? 'N/A'}/100
- Culture Fit Score: ${vr.culture_fit_score ?? 'N/A'}/100
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

    // A team-lead job that asks for no resume is judged with the APPLICATION
    // prompt, not the resume prompt (its company-name penalties and "MAX 60%"
    // caps assume a resume exists). Every other family is sent exactly what
    // it always was. ai-analyze returns the leadership and adaptability
    // evidence scores only when context.job_family says "team_lead".
    const analyzeType = teamLead && !detectedResumeUrl && job?.require_resume !== true ? "application" : "resume";

    // Call the AI analysis edge function using the admin client
    const { data: analysisData, error: analysisError } = await supabaseAdmin.functions.invoke("ai-analyze", {
      body: {
        type: analyzeType,
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
          ...(teamLead ? { job_family: inferredFamily } : {}),
        },
      },
    });

    if (analysisError) {
      if (await analyzeRefusedByService(analysisError)) {
        // Nothing is saved: no score, no scorecard, no fingerprint, so this
        // application stays unscored and the next finished step (or a forced
        // run, or autopilot-batch, which scores every ai_score null) reads it
        // properly. Never a stand-in score built without the judge.
        console.warn("[trigger-ava-analysis] AI service unavailable; analysis not saved", { applicationId });
        return {
          ok: false,
          status: 503,
          body: {
            error: "ai_unavailable",
            code: "ai_unavailable",
            retryAfterSeconds: AI_UNAVAILABLE_RETRY_AFTER_SECONDS,
            details: "The analysis service is unavailable right now; nothing was saved. Run it again once it is back.",
          },
          profile,
        };
      }
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

    // Every test's score, read once (a real 0 is a score; an ungraded result
    // is not) and used for the judgment's measured topics, the phase blend
    // and the scorecard alike.
    const quizScore = quizReading?.score ?? null;
    const typingTest = parsedNotes.typingTestResult;
    const voiceResult = application.voice_interview_result as any;
    const voiceScore = finiteOrNull(voiceResult?.overall_score);
    const chatSimulationScore = chatSimulation?.score ?? null;
    const salesSimulationScore = salesSimulation?.score ?? null;
    const chatInterviewScore = chatInterview?.score ?? null;
    const hasVideoIntro = !!(parsedNotes.videoIntroResult?.completed || parsedNotes.videoIntroUrl);
    const videoIntroScore = typeof parsedNotes.videoIntroResult?.score === "number"
      ? parsedNotes.videoIntroResult.score
      : null;
    const quizConfigured = Array.isArray(job?.quiz_questions) && job.quiz_questions.length > 0;
    const workflowTypeSet = new Set(workflowSteps.map((step: { type?: unknown }) => String(step?.type || "").toLowerCase()));
    const ungradedPhases = [
      ...(chatSimulation && !chatSimulation.graded && workflowTypeSet.has("chat_simulation") ? ["chat simulation"] : []),
      ...(salesSimulation && !salesSimulation.graded && workflowTypeSet.has("sales_simulation") ? ["sales simulation"] : []),
      ...(chatInterview && !chatInterview.graded && workflowTypeSet.has("chat_interview") ? ["chat interview"] : []),
    ];
    // A mark graded from the transcript the page sent (the record of the
    // attempt was not available) is not trusted: flagged, card on "review".
    const browserTranscriptPhases = [
      ...(chatSimulationScore !== null && chatSimulation?.transcriptSource === "browser" ? ["chat simulation"] : []),
      ...(salesSimulationScore !== null && salesSimulation?.transcriptSource === "browser" ? ["sales simulation"] : []),
      ...(chatInterviewScore !== null && chatInterview?.transcriptSource === "browser" ? ["chat interview"] : []),
    ];

    // Find portfolio data from workflow step IDs (stored under step ID like "step1", not "portfolioResult")
    let portfolioScore: number | null = null;
    for (const step of workflowSteps) {
      if (step.type === 'portfolio_upload') {
        const stepScore = finiteOrNull(parsedNotes[step.id]?.aiAnalysis?.score);
        if (stepScore !== null) {
          portfolioScore = stepScore;
          console.log("[trigger-ava-analysis] Found portfolio score from step", step.id, ":", portfolioScore);
          break;
        }
      }
    }
    // Fallback to legacy portfolioResult format
    if (portfolioScore === null) {
      const legacyResult = parsedNotes.portfolioResult;
      portfolioScore = finiteOrNull(legacyResult?.aiAnalysis?.score, legacyResult?.score);
      if (portfolioScore !== null) {
        console.log("[trigger-ava-analysis] Found portfolio score from legacy portfolioResult:", portfolioScore);
      }
    }

    // Typing measured in the chat practice, when it is this job's typing
    // measure (chatTypingInUse, above). A team lead's tests take typing's
    // 0.10 from it (chatTypingBlendScore), the same number buildAvaScorecard
    // reads.
    const chatTypingScoreForBlend = chatTypingBlendScore({
      family: inferredFamily,
      workflowSteps,
      typing: chatSimulation?.typing ?? null,
    });

    // Tests done, tests ahead and the connection check: a judge conflict about
    // anything they measure is not counted against the judgment, here or in
    // buildAvaScorecard (one helper, so both agree). On a job with no typing
    // step, typing is the chat practice's topic (owed while it is ahead, its
    // result once it is done, timed or not).
    const progress = highSignalProgress({
      quizScore,
      quizConfigured,
      workflowSteps,
      typingScore: typingTest?.score,
      voiceScore,
      portfolioScore,
      chatSimulationScore,
      salesSimulationScore,
      chatInterviewScore,
      videoIntroScore,
      videoIntroSubmitted: hasVideoIntro,
    });

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
        leadershipEvidenceScore: structuredScore.leadershipEvidenceScore ?? null,
        adaptabilityEvidenceScore: structuredScore.adaptabilityEvidenceScore ?? null,
        jobFamily: inferredFamily,
        hardRequirementConflicts: sourcedConflictNotes(structuredScore),
        pendingPhases: progress.pendingTopicPhases,
        takenPhases: progress.takenTopicPhases,
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

    // WEIGHTED SCORE CALCULATION: Combine the judge's score with phase
    // performance. The weights and floors live in _shared/autopilot.ts
    // (familyPhaseWeights / phaseBlendScore), unchanged for every family but
    // team_lead, whose blend is the four tests alone (the judgment is the
    // other half, counted once, in buildAvaScorecard).
    // A team lead's blend is the tests alone (the judgment never enters it
    // unless no test is scored), so it is computed even when the judge
    // returned no number at all: before 2026-10-06 (second pass) a failed
    // judge threw the four tests away and a strong and a weak lead both
    // scored 56.
    let finalScore: number | null = newScore;
    if (newScore !== null || teamLead) {
      const blendInputs = {
        family: inferredFamily,
        judgmentScore: newScore ?? computeJudgmentScore({ jobFamily: inferredFamily }),
        quizScore,
        typingTest,
        chatTypingScore: chatTypingScoreForBlend,
        chatSimulationScore,
        salesSimulationScore,
        chatInterviewScore,
        voiceScore,
        portfolioScore,
      };
      finalScore = phaseBlendScore(blendInputs);
      console.log(
        "[trigger-ava-analysis] Weighted score calculated:",
        finalScore,
        "family:",
        inferredFamily,
        "components:",
        familyPhaseWeights(blendInputs)
          .filter((component) => typeof component.value === "number")
          .map((component) => `${component.label}:${component.value}`),
      );
    }

    console.log("[trigger-ava-analysis] Final score after weighting and floors:", finalScore, "(AI raw score was:", newScore, ")");
    const passingScore = (job?.passing_score as number) || 60;
    const scorecard = buildAvaScorecard({
      finalScore,
      passingScore,
      quizScore,
      quizConfigured,
      typingTest,
      requiredWpm: typingRequiredWpmForFlag,
      equipmentCheck,
      voiceScore,
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
      leadershipEvidenceScore: structuredScore?.leadershipEvidenceScore ?? null,
      adaptabilityEvidenceScore: structuredScore?.adaptabilityEvidenceScore ?? null,
      hardRequirementConflicts: sourcedConflictNotes(structuredScore),
      transferableEvidence: structuredScore?.transferableEvidence ?? [],
      formDealBreakers,
      quizCorrect: quizReading?.correct ?? null,
      quizTotal: quizReading?.total ?? null,
      quizMissedAreas: quizAreas.missed,
      quizMustPassMissed: quizAreas.mustPassMissed,
      interviewCredibility: chatInterview?.credibilityRating ?? null,
      ungradedPhases,
      formReviewFlags,
      // No sub-scores came back: the judge's narrative number (if any) is the
      // judgment, not a rebuild from all-default sub-scores.
      judgmentScoreOverride: structuredScore ? null : newScore,
      judgeFailed: !structuredScore && newScore === null,
      resumeRequested: job?.require_resume === true || !!detectedResumeUrl,
      // The tests' own findings: shown, and a reason for "review", never a decline.
      chatNewPromiseQuote: chatSimulation?.newPromiseMade ? chatSimulation.newPromiseQuote : null,
      chatDisrespectQuote: chatSimulation?.disrespectMade ? chatSimulation.disrespectQuote : null,
      chatNeedsReview: chatSimulation?.needsReview ?? false,
      chatReviewReasons: chatSimulation?.reviewReasons ?? [],
      interviewIncomplete: chatInterview?.incomplete ?? false,
      interviewMustCoverMissing: chatInterview?.mustCoverMissing ?? [],
      // The interview's own lead marks: a review signal, never the number.
      interviewLeadership: chatInterview?.leadership ?? null,
      interviewAdaptability: chatInterview?.adaptability ?? null,
      interviewWorkingLead: chatInterview?.workingLead ?? null,
      browserTranscriptPhases,
      // Typing measured in the chat practice; the scorecard reads it only
      // when the job has no typing step.
      chatTyping: chatSimulation?.typing ?? null,
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
        jobFamily: inferredFamily,
        analyzeType,
        directMatchScore: structuredScore?.directMatchScore ?? null,
        transferableFitScore: structuredScore?.transferableFitScore ?? null,
        learningSignalScore: structuredScore?.learningSignalScore ?? null,
        leadershipEvidenceScore: structuredScore?.leadershipEvidenceScore ?? null,
        adaptabilityEvidenceScore: structuredScore?.adaptabilityEvidenceScore ?? null,
        hardRequirementConflictSources: structuredScore?.hardRequirementConflictSources ?? null,
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
        chatTyping: !!chatTypingInUse,
        equipmentCheck: !!equipmentCheck,
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
        jobs(title, description, requirements, responsibilities, skills_required, experience_level, job_type, workflow_steps, passing_score, processing_mode, quiz_questions, application_questions, require_resume, required_wpm, employer_id)
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
