import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callOpenAIJson,
  requireJsonKeys,
} from "../_shared/openai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_SHORTLIST_MODEL") || "gpt-5.4";

type Recommendation = "strong_yes" | "yes" | "maybe" | "no";
type RecommendedAction = "advance" | "review" | "reject";
type DecisionState = "ready_for_decision" | "needs_more_evidence";
type AutopilotAction = "advance" | "reject" | "defer";

interface RankedCandidateScorecard {
  overallScore: number;
  confidence: number;
  recommendedAction: RecommendedAction;
  directMatchScore?: number;
  transferableFitScore?: number;
  learningSignalScore?: number;
  transferableEvidence?: string[];
  decisionState?: DecisionState;
  pendingHighSignalPhases?: string[];
  autopilotAction?: AutopilotAction;
  dimensionScores: {
    hardRequirements: number;
    roleCompetency: number;
    communication: number;
    reliability: number;
    workStyleFit: number;
    evidenceQuality: number;
  };
  riskFlags: string[];
  rationale: string;
}

interface RankedCandidate {
  rank: number;
  candidateName: string;
  aiScore: number | null;
  keyDifferentiator: string;
  strengths: string[];
  concerns: string[];
  recommendation: Recommendation;
  scorecard?: RankedCandidateScorecard;
  applicationId?: string;
}

interface ShortlistResult {
  rankedCandidates: RankedCandidate[];
  comparativeInsights: string[];
  quickDecision: {
    interviewImmediately: string[];
    considerWithReservations: string[];
    pass: string[];
  };
  summaryStatement: string;
  scorecardSummary?: {
    averageScore: number;
    highestScore: number;
    lowestScore: number;
    strongestCategory: string;
    commonRiskFlags: string[];
    decisionReadyCount: number;
    provisionalCount: number;
  };
  jobId: string;
  jobTitle: string;
  candidateCount: number;
  generatedAt: string;
}

function buildScorecardSummary(candidates: RankedCandidate[]) {
  const decisionReadyCandidates = candidates.filter((candidate) => candidate.scorecard?.decisionState !== "needs_more_evidence");
  const provisionalCount = candidates.length - decisionReadyCandidates.length;
  const summaryPool = decisionReadyCandidates.length > 0 ? decisionReadyCandidates : candidates;
  const scores = summaryPool.map((candidate) => candidate.aiScore ?? 0);
  const averageScore = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
  const highestScore = scores.length ? Math.max(...scores) : 0;
  const lowestScore = scores.length ? Math.min(...scores) : 0;
  const strongestCategory = summaryPool[0]?.scorecard
    ? Object.entries(summaryPool[0].scorecard.dimensionScores).sort((a, b) => b[1] - a[1])[0]?.[0] || "roleCompetency"
    : "roleCompetency";

  return {
    averageScore,
    highestScore,
    lowestScore,
    strongestCategory,
    commonRiskFlags: Array.from(
      new Set(candidates.flatMap((candidate) => candidate.scorecard?.riskFlags || [])),
    ).slice(0, 5),
    decisionReadyCount: decisionReadyCandidates.length,
    provisionalCount,
  };
}

function parseMaybeJson<T>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === "object") return value as T;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampScore(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function inferRecommendation(score: number): Recommendation {
  if (score >= 80) return "strong_yes";
  if (score >= 65) return "yes";
  if (score >= 50) return "maybe";
  return "no";
}

function inferAction(score: number): RecommendedAction {
  if (score >= 80) return "advance";
  if (score >= 60) return "review";
  return "reject";
}

function normalizePendingSignals(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((signal) => String(signal || "").trim())
    .filter(Boolean);
}

function deriveFallbackDecisionState(app: any, notes: Record<string, any>, dimensionScores: ReturnType<typeof buildDimensionScores>) {
  const observedHighSignalCount = [
    toNumber(notes.quizResult?.score ?? notes.quiz?.score, 0),
    toNumber(notes.typingTestResult?.overallScore ?? notes.typingTestResult?.score, 0),
    toNumber(notes.chatSimulationResult?.overallScore, 0),
    toNumber(notes.salesSimulationResult?.overallScore, 0),
    toNumber(app.voice_interview_result?.overall_score ?? app.voice_interview_result?.overallScore, 0),
    toNumber(notes.portfolioResult?.overallScore, 0),
    toNumber(notes.videoIntroResult?.overallScore ?? notes.videoIntroResult?.score, 0),
    toNumber(notes.chatInterviewResult?.overallScore ?? notes.chatInterviewResult?.score, 0),
  ].filter((value) => value > 0).length;

  if (observedHighSignalCount > 0 || dimensionScores.evidenceQuality >= 65) {
    return "ready_for_decision" as const;
  }

  return "needs_more_evidence" as const;
}

function buildDimensionScores(app: any, score: number) {
  const notes = parseMaybeJson<Record<string, any>>(app.notes) || {};
  const hasResume = !!app.resume_url || !!notes.resumeImageUrls || !!notes.resumeUrl;
  const quizScore = toNumber(notes.quizResult?.score ?? notes.quiz?.score, 0);
  const typingScore = toNumber(notes.typingTestResult?.overallScore ?? notes.typingTestResult?.score, 0);
  const chatScore = toNumber(notes.chatSimulationResult?.overallScore, 0);
  const salesScore = toNumber(notes.salesSimulationResult?.overallScore, 0);
  const voiceScore = toNumber(app.voice_interview_result?.overall_score ?? app.voice_interview_result?.overallScore, 0);
  const portfolioScore = toNumber(notes.portfolioResult?.overallScore ?? notes.portfolioResult?.overallScore, 0);
  const evidenceSignals = [
    hasResume ? 20 : 0,
    quizScore > 0 ? 15 : 0,
    typingScore > 0 ? 10 : 0,
    chatScore > 0 ? 10 : 0,
    salesScore > 0 ? 10 : 0,
    voiceScore > 0 ? 10 : 0,
    portfolioScore > 0 ? 10 : 0,
  ];

  return {
    hardRequirements: clampScore(Math.min(100, score + (hasResume ? 5 : -5))),
    roleCompetency: clampScore(Math.max(score - 5, 0)),
    communication: clampScore(typingScore ? (typingScore + Math.min(score, 100)) / 2 : score - 3),
    reliability: clampScore(Math.max(score - (notes.missedQuestions ? 10 : 0), 0)),
    workStyleFit: clampScore(Math.max(score - (notes.riskFlags?.length ? 8 : 0), 0)),
    evidenceQuality: clampScore(Math.min(100, evidenceSignals.reduce((sum, n) => sum + n, 0))),
  };
}

export function buildScorecard(app: any, score: number): RankedCandidateScorecard {
  const notes = parseMaybeJson<Record<string, any>>(app.notes) || {};
  const storedScorecard = notes.avaScorecard;

  if (storedScorecard && typeof storedScorecard === "object") {
    const dimensions = storedScorecard.dimensionScores || {};
    return {
      overallScore: clampScore(toNumber(storedScorecard.overallScore, score)),
      confidence: clampScore(toNumber(storedScorecard.confidence, 65)),
      recommendedAction: ["advance", "review", "reject"].includes(storedScorecard.recommendedAction)
        ? storedScorecard.recommendedAction
        : inferAction(score),
      directMatchScore: storedScorecard.directMatchScore === undefined ? undefined : clampScore(toNumber(storedScorecard.directMatchScore, score)),
      transferableFitScore: storedScorecard.transferableFitScore === undefined ? undefined : clampScore(toNumber(storedScorecard.transferableFitScore, score)),
      learningSignalScore: storedScorecard.learningSignalScore === undefined ? undefined : clampScore(toNumber(storedScorecard.learningSignalScore, 50)),
      transferableEvidence: Array.isArray(storedScorecard.transferableEvidence)
        ? storedScorecard.transferableEvidence.map(String).filter(Boolean)
        : [],
      dimensionScores: {
        hardRequirements: clampScore(toNumber(dimensions.hardRequirements ?? dimensions.hard_requirements, score)),
        roleCompetency: clampScore(toNumber(dimensions.roleCompetency ?? dimensions.role_competency, score)),
        communication: clampScore(toNumber(dimensions.communication, score)),
        reliability: clampScore(toNumber(dimensions.reliability ?? dimensions.execution_reliability, score)),
        workStyleFit: clampScore(toNumber(dimensions.workStyleFit ?? dimensions.work_style_fit, score)),
        evidenceQuality: clampScore(toNumber(dimensions.evidenceQuality ?? dimensions.evidence_quality, score)),
      },
      decisionState: storedScorecard.decisionState === "needs_more_evidence" ? "needs_more_evidence" : "ready_for_decision",
      pendingHighSignalPhases: normalizePendingSignals(storedScorecard.pendingHighSignalPhases),
      autopilotAction: ["advance", "reject", "defer"].includes(storedScorecard.autopilotAction)
        ? storedScorecard.autopilotAction
        : undefined,
      riskFlags: Array.isArray(storedScorecard.riskFlags) ? storedScorecard.riskFlags.map(String) : [],
      rationale: String(storedScorecard.rationale || "Structured scorecard available"),
    };
  }

  const riskFlags: string[] = [];

  if (!app.resume_url && !notes.resumeImageUrls && !notes.resumeUrl) {
    riskFlags.push("No resume provided");
  }
  if (!app.ai_analysis) {
    riskFlags.push("No AI analysis available");
  }
  if (score < 50) {
    riskFlags.push("Low overall score");
  }

  const dimensionScores = buildDimensionScores(app, score);
  const decisionState = deriveFallbackDecisionState(app, notes, dimensionScores);
  const pendingHighSignalPhases = decisionState === "needs_more_evidence" ? ["Further assessment signals"] : [];

  return {
    overallScore: clampScore(score),
    confidence: decisionState === "needs_more_evidence"
      ? clampScore(Math.min(68, Math.max(28, dimensionScores.evidenceQuality - 8)))
      : clampScore(Math.min(95, Math.max(35, score + (riskFlags.length === 0 ? 10 : -5)))),
    recommendedAction: decisionState === "needs_more_evidence" ? "review" : inferAction(score),
    directMatchScore: dimensionScores.hardRequirements,
    transferableFitScore: undefined,
    learningSignalScore: decisionState === "needs_more_evidence" ? Math.max(45, dimensionScores.evidenceQuality - 10) : undefined,
    transferableEvidence: [],
    decisionState,
    pendingHighSignalPhases,
    autopilotAction: decisionState === "needs_more_evidence" ? "defer" : inferAction(score) === "advance" ? "advance" : "reject",
    dimensionScores,
    riskFlags,
    rationale: decisionState === "needs_more_evidence"
      ? "This score is provisional until more assessment evidence arrives."
      : score >= 80
        ? "Strong overall fit with multiple signals pointing to readiness."
        : score >= 60
          ? "Mixed but promising profile that deserves manual review."
          : "Candidate needs stronger assessment results or evidence.",
  };
}

function buildApplicantSummaries(applications: any[]) {
  return applications.map((app: any, index: number) => {
    const notes = parseMaybeJson<Record<string, any>>(app.notes) || {};
    const profile = app.profiles || {};
    const score = toNumber(app.ai_score, 0);
    const summaryParts: string[] = [
      `CANDIDATE ${index + 1}: ${profile.full_name || "Unknown"}`,
      `- AI Score: ${app.ai_score ?? "Not evaluated"}`,
      `- Current Phase: ${app.phase || "Unknown"}`,
      `- Status: ${app.status || "Unknown"}`,
      `- Experience: ${profile.experience_years ? `${profile.experience_years} years` : "Not specified"}`,
      `- Location: ${profile.location || "Not specified"}`,
    ];

    if (notes.quizResult) {
      summaryParts.push(`- Quiz Score: ${notes.quizResult.score}% (${notes.quizResult.correctAnswers}/${notes.quizResult.totalQuestions} correct)`);
    }

    if (notes.typingTestResult) {
      summaryParts.push(`- Typing Test: ${notes.typingTestResult.wpm} WPM, ${notes.typingTestResult.accuracy}% accuracy`);
    }

    if (notes.chatSimulationResult) {
      summaryParts.push(`- Chat Simulation: ${notes.chatSimulationResult.overallScore}/100`);
    }

    if (notes.salesSimulationResult) {
      summaryParts.push(`- Sales Simulation: ${notes.salesSimulationResult.overallScore}/100, Would Buy: ${notes.salesSimulationResult.wouldBuy ? "Yes" : "No"}`);
    }

    if (notes.portfolioResult) {
      summaryParts.push(`- Portfolio: ${notes.portfolioResult.overallScore}/100`);
    }

    if (app.voice_interview_result) {
      summaryParts.push(`- Voice Interview: ${app.voice_interview_result.overall_score || app.voice_interview_result.overallScore}/100, Recommendation: ${app.voice_interview_result.recommendation}`);
    }

    if (app.ai_analysis) {
      const analysisPreview = String(app.ai_analysis).substring(0, 500);
      summaryParts.push(`- AI Analysis Summary: ${analysisPreview}...`);
    }

    return {
      summary: summaryParts.join("\n"),
      score,
      name: profile.full_name || `Candidate ${index + 1}`,
      app,
    };
  });
}

export function buildFallbackShortlist(jobTitle: string, jobDescription: string | null, applications: any[]): ShortlistResult {
  const candidates = buildApplicantSummaries(applications)
    .sort((a, b) => b.score - a.score)
    .map((entry, index) => {
      const scorecard = buildScorecard(entry.app, entry.score);
      const needsMoreEvidence = scorecard.decisionState === "needs_more_evidence";
      return {
        rank: index + 1,
        candidateName: entry.name,
        aiScore: scorecard.overallScore,
        keyDifferentiator: needsMoreEvidence
          ? "Awaiting more evidence before a final shortlist decision"
          : scorecard.overallScore >= 80
            ? "Strong demonstrated fit across available signals"
            : scorecard.overallScore >= 60
              ? "Solid profile with some evidence gaps"
              : "Needs stronger evidence for this role",
        strengths: needsMoreEvidence
          ? ["Initial profile collected"]
          : scorecard.overallScore >= 60
            ? ["Relevant experience", "Assessment signals"]
            : ["Basic profile present"],
        concerns: scorecard.riskFlags.length > 0
          ? scorecard.riskFlags
          : needsMoreEvidence
            ? ["Awaiting more assessment evidence"]
            : ["Limited signal depth"],
        recommendation: needsMoreEvidence ? "maybe" : inferRecommendation(scorecard.overallScore),
        scorecard,
        applicationId: entry.app.id,
      };
    });

  const interviewImmediately = candidates.filter((candidate) => candidate.recommendation === "strong_yes" || candidate.recommendation === "yes").map((candidate) => candidate.candidateName);
  const considerWithReservations = candidates.filter((candidate) => candidate.recommendation === "maybe").map((candidate) => candidate.candidateName);
  const pass = candidates.filter((candidate) => candidate.recommendation === "no").map((candidate) => candidate.candidateName);
  const scorecardSummary = buildScorecardSummary(candidates);
  const scoreSpread = scorecardSummary.highestScore - scorecardSummary.lowestScore;
  const provisionalVerb = scorecardSummary.provisionalCount === 1 ? "needs" : "need";
  const provisionalTail = scorecardSummary.provisionalCount > 0
    ? scorecardSummary.decisionReadyCount > 0
      ? ` ${scorecardSummary.provisionalCount} candidate${scorecardSummary.provisionalCount === 1 ? "" : "s"} still ${provisionalVerb} more evidence, so the score summary emphasizes the ${scorecardSummary.decisionReadyCount} decision-ready profile${scorecardSummary.decisionReadyCount === 1 ? "" : "s"}.`
      : ` All candidates are still gathering evidence, so the score summary remains provisional.`
    : "";

  return {
    rankedCandidates: candidates,
    comparativeInsights: [
      `The strongest candidates for ${jobTitle} are the ones with the clearest evidence signals and the most complete assessment trails.`,
      jobDescription ? "The role description points to a mix of skill fit and follow-through, so evidence quality matters alongside experience." : "Without a long role description, the ranking leans more heavily on observed assessment performance.",
      candidates.length > 1
        ? `There is a ${scoreSpread} point spread between the top and bottom candidates in the current score summary, showing meaningful separation in readiness.`
        : "Only one candidate was available, so comparison depth is limited.",
    ],
    quickDecision: {
      interviewImmediately,
      considerWithReservations,
      pass,
    },
    summaryStatement: candidates.length
      ? `Based on the available signals, ${candidates[0].candidateName} is the leading candidate for ${jobTitle}. The shortlist reflects a mix of assessed performance, supporting evidence, and overall consistency.${provisionalTail}`
      : `No candidates were available for ${jobTitle}.`,
    scorecardSummary,
    jobId: "",
    jobTitle,
    candidateCount: applications.length,
    generatedAt: new Date().toISOString(),
  };
}

function normalizeShortlist(raw: unknown, applications: any[], jobId: string, jobTitle: string, jobDescription: string | null, candidateCount: number): ShortlistResult {
  const shortlist = (raw || {}) as Partial<ShortlistResult> & { rankedCandidates?: any[] };
  const rankedCandidates = Array.isArray(shortlist.rankedCandidates) ? shortlist.rankedCandidates : [];

  const normalizedCandidates: RankedCandidate[] = rankedCandidates.map((candidate, index) => {
    const matchingApp = applications.find((app) => {
      const name = app.profiles?.full_name || "";
      return name.toLowerCase() === String(candidate.candidateName || "").toLowerCase();
    }) || applications[index];

    const score = clampScore(
      toNumber(candidate.aiScore ?? candidate.scorecard?.overallScore ?? matchingApp?.ai_score, 0),
    );
    const scorecard = candidate.scorecard || buildScorecard(matchingApp || {}, score);
    const needsMoreEvidence = scorecard.decisionState === "needs_more_evidence";

    return {
      rank: toNumber(candidate.rank, index + 1),
      candidateName: String(candidate.candidateName || matchingApp?.profiles?.full_name || `Candidate ${index + 1}`),
      aiScore: score,
      keyDifferentiator: String(
        candidate.keyDifferentiator ||
          (needsMoreEvidence ? "Awaiting more evidence before a final shortlist decision" : scorecard.rationale) ||
          "Strong overall fit",
      ),
      strengths: Array.isArray(candidate.strengths) ? candidate.strengths.map(String) : [],
      concerns: Array.isArray(candidate.concerns) ? candidate.concerns.map(String) : [],
      recommendation: needsMoreEvidence
        ? "maybe"
        : ["strong_yes", "yes", "maybe", "no"].includes(candidate.recommendation)
          ? candidate.recommendation
          : inferRecommendation(score),
      scorecard: {
        overallScore: scorecard.overallScore ?? score,
        confidence: clampScore(toNumber(candidate.scorecard?.confidence ?? scorecard.confidence, 65)),
        recommendedAction: scorecard.decisionState === "needs_more_evidence"
          ? "review"
          : ["advance", "review", "reject"].includes(candidate.scorecard?.recommendedAction)
            ? candidate.scorecard.recommendedAction
            : inferAction(score),
        decisionState: scorecard.decisionState,
        pendingHighSignalPhases: scorecard.pendingHighSignalPhases,
        autopilotAction: scorecard.autopilotAction,
        dimensionScores: candidate.scorecard?.dimensionScores || scorecard.dimensionScores,
        riskFlags: Array.isArray(candidate.scorecard?.riskFlags) ? candidate.scorecard.riskFlags.map(String) : scorecard.riskFlags,
        rationale: String(candidate.scorecard?.rationale || scorecard.rationale || ""),
      },
      applicationId: matchingApp?.id,
    };
  });

  const fallback = buildFallbackShortlist(jobTitle, jobDescription, applications);
  const finalCandidates = normalizedCandidates.length ? normalizedCandidates : fallback.rankedCandidates;
  const scorecardSummary = buildScorecardSummary(finalCandidates);
  const summaryStatementBase = String(shortlist.summaryStatement || fallback.summaryStatement);
  const provisionalVerb = scorecardSummary.provisionalCount === 1 ? "needs" : "need";
  const summaryStatement = scorecardSummary.provisionalCount > 0 && !/gathering evidence|need more evidence|score summary/i.test(summaryStatementBase)
    ? `${summaryStatementBase} ${
        scorecardSummary.decisionReadyCount > 0
          ? `${scorecardSummary.provisionalCount} candidate${scorecardSummary.provisionalCount === 1 ? "" : "s"} still ${provisionalVerb} more evidence, so the score summary below reflects decision-ready profiles first.`
          : "All candidates are still gathering evidence, so the score summary remains provisional."
      }`.trim()
    : summaryStatementBase;

  return {
    rankedCandidates: finalCandidates,
    comparativeInsights: Array.isArray(shortlist.comparativeInsights) && shortlist.comparativeInsights.length
      ? shortlist.comparativeInsights.map(String)
      : fallback.comparativeInsights,
    quickDecision: shortlist.quickDecision && typeof shortlist.quickDecision === "object"
      ? {
          interviewImmediately: Array.isArray(shortlist.quickDecision.interviewImmediately) ? shortlist.quickDecision.interviewImmediately.map(String) : fallback.quickDecision.interviewImmediately,
          considerWithReservations: Array.isArray(shortlist.quickDecision.considerWithReservations) ? shortlist.quickDecision.considerWithReservations.map(String) : fallback.quickDecision.considerWithReservations,
          pass: Array.isArray(shortlist.quickDecision.pass) ? shortlist.quickDecision.pass.map(String) : fallback.quickDecision.pass,
        }
      : fallback.quickDecision,
    summaryStatement,
    scorecardSummary,
    jobId,
    jobTitle,
    candidateCount,
    generatedAt: new Date().toISOString(),
  };
}

if (import.meta.main) {
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const { jobId, jobTitle, jobDescription, applications } = await req.json();

    if (!applications || applications.length < 2) {
      throw new Error("Need at least 2 applicants to generate shortlist");
    }

    const applicantSummaries = buildApplicantSummaries(applications);
    const userPrompt = `Analyze and rank these ${applications.length} candidates for the position of "${jobTitle}".

JOB DESCRIPTION:
${jobDescription || "Not provided"}

CANDIDATES TO COMPARE:
${applicantSummaries.map((candidate) => candidate.summary).join("\n---\n")}

Compare all candidates against each other and provide a ranked shortlist with actionable recommendations. Focus on who would be the best fit for this specific role based on their assessment performance and qualifications.`;

    const systemPrompt = `You are AVA, an expert hiring consultant for HireFlow. Your task is to perform a COMPARATIVE analysis of multiple candidates for a job position and create a ranked shortlist.

IMPORTANT: Be direct, insightful, and focus on what makes each candidate stand out or fall behind compared to others. Look at their assessment data objectively.

You must return a valid JSON response with this EXACT structure:
{
  "rankedCandidates": [
    {
      "rank": 1,
      "candidateName": "Name",
      "aiScore": 85,
      "keyDifferentiator": "One phrase describing what sets them apart",
      "strengths": ["strength 1", "strength 2"],
      "concerns": ["concern 1"],
      "recommendation": "strong_yes" | "yes" | "maybe" | "no",
      "scorecard": {
        "overallScore": 85,
        "confidence": 82,
        "recommendedAction": "advance" | "review" | "reject",
        "dimensionScores": {
          "hardRequirements": 80,
          "roleCompetency": 85,
          "communication": 78,
          "reliability": 84,
          "workStyleFit": 81,
          "evidenceQuality": 76
        },
        "riskFlags": ["Optional risk flag"],
        "rationale": "One concise explanation of the scorecard"
      }
    }
  ],
  "comparativeInsights": [
    "Insight about the candidate pool",
    "What separates top from bottom performers",
    "Common patterns or gaps"
  ],
  "quickDecision": {
    "interviewImmediately": ["Name 1", "Name 2"],
    "considerWithReservations": ["Name 3"],
    "pass": ["Name 4"]
  },
  "summaryStatement": "A 2-3 sentence executive summary of the shortlist analysis",
  "scorecardSummary": {
    "averageScore": 0,
    "highestScore": 0,
    "lowestScore": 0,
    "strongestCategory": "roleCompetency",
    "commonRiskFlags": ["Optional shared risk"]
  }
}

Recommendation values:
- "strong_yes": Exceptional candidate, interview immediately
- "yes": Good fit, should interview
- "maybe": Has potential but concerns exist
- "no": Not recommended for this role`;

    console.log("Calling OpenAI for shortlist analysis...");

    const { data: shortlistData } = await callOpenAIJson<ShortlistResult>({
      apiKey: OPENAI_API_KEY,
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.35,
      maxCompletionTokens: 2800,
      retries: 3,
      validator: (value) => requireJsonKeys(value, ["rankedCandidates", "comparativeInsights", "quickDecision", "summaryStatement"]),
      fallback: () => buildFallbackShortlist(jobTitle, jobDescription || null, applications),
    });

    const shortlist = normalizeShortlist(shortlistData, applications, jobId, jobTitle, jobDescription || null, applications.length);

    console.log("Shortlist analysis complete");

    return new Response(JSON.stringify({
      shortlist,
      jobId,
      jobTitle,
      candidateCount: applications.length,
      generatedAt: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in ai-shortlist:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
}
