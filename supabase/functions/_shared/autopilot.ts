export type RecommendedAction = "advance" | "review" | "reject";
export type AutopilotAction = "advance" | "reject" | "defer";
export type AvaDecisionState = "ready_for_decision" | "needs_more_evidence";

export interface AvaScorecard {
  overallScore: number;
  confidence: number;
  recommendedAction: RecommendedAction;
  hardRequirementStatus: "met" | "mixed" | "at_risk";
  dimensionScores: {
    hard_requirements: number;
    role_competency: number;
    communication: number;
    execution_reliability: number;
    work_style_fit: number;
    evidence_quality: number;
  };
  riskFlags: string[];
  rationale: string;
  evidenceRefs: string[];
  evidenceFingerprint: string;
  evidenceFloorMet: boolean;
  pendingHighSignalPhases: string[];
  completedHighSignalPhases: string[];
  autopilotAction: AutopilotAction;
  decisionState: AvaDecisionState;
  hardRejectReason: string | null;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function averageOf(values: Array<number | null | undefined>, fallback: number) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numbers.length === 0) return fallback;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
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

export function inferJobFamily(title: string | null | undefined, description: string | null | undefined) {
  const haystack = `${title || ""} ${description || ""}`.toLowerCase();
  if (haystack.match(/support|customer service|customer success|help desk/)) return "support";
  if (haystack.match(/sales|account executive|business development|closer/)) return "sales";
  if (haystack.match(/designer|creative|illustrator|animator|photographer|videographer|brand/)) return "creative";
  if (haystack.match(/engineer|developer|software|data|technical|devops|product/)) return "technical";
  if (haystack.match(/admin|operations|coordinator|assistant|scheduler/)) return "operations_admin";
  if (haystack.match(/retail|hospitality|restaurant|server|barista|store/)) return "retail_hospitality";
  if (haystack.match(/nurse|healthcare|medical|clinic|therapist/)) return "healthcare";
  if (haystack.match(/field|installer|technician|maintenance|route/)) return "field_service";
  if (haystack.match(/chief|vp|vice president|director|head of|executive/)) return "executive";
  return "general";
}

function formatNaturalList(items: string[]) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function isEntryLevelRole(experienceLevel: string | null | undefined, title: string | null | undefined) {
  const haystack = `${experienceLevel || ""} ${title || ""}`.toLowerCase();
  return /entry|junior|intern|trainee|associate/.test(haystack);
}

function normalizeForFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForFingerprint(entry));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeForFingerprint(record[key]);
        return acc;
      }, {});
  }

  return value;
}

export function buildEvidenceFingerprint(snapshot: Record<string, unknown>) {
  return JSON.stringify(normalizeForFingerprint(snapshot));
}

export function buildAvaScorecard(params: {
  finalScore: number | null;
  passingScore: number;
  quizScore: number | null;
  quizConfigured: boolean;
  typingTest?: Record<string, any> | null;
  voiceScore: number | null;
  portfolioScore: number | null;
  chatSimulationScore: number | null;
  salesSimulationScore: number | null;
  chatInterviewScore: number | null;
  videoIntroScore: number | null;
  videoIntroSubmitted: boolean;
  analysisText: string;
  resumeUnavailable: boolean;
  resumeTextUsed: boolean;
  resumeImageCount: number;
  applicationAnswerCount: number;
  coverLetterProvided: boolean;
  workflowSteps: any[];
  jobTitle?: string | null;
  jobDescription?: string | null;
  jobSkillsRequired?: string[] | null;
  experienceLevel?: string | null;
  evidenceFingerprint: string;
}) {
  const {
    finalScore,
    passingScore,
    quizScore,
    quizConfigured,
    typingTest,
    voiceScore,
    portfolioScore,
    chatSimulationScore,
    salesSimulationScore,
    chatInterviewScore,
    videoIntroScore,
    videoIntroSubmitted,
    analysisText,
    resumeUnavailable,
    resumeTextUsed,
    resumeImageCount,
    applicationAnswerCount,
    coverLetterProvided,
    workflowSteps,
    jobTitle,
    jobDescription,
    jobSkillsRequired,
    experienceLevel,
    evidenceFingerprint,
  } = params;

  const safeScore = clampPercent(finalScore ?? 0);
  const family = inferJobFamily(jobTitle, jobDescription);
  const entryLevel = isEntryLevelRole(experienceLevel, jobTitle);
  const riskFlags: string[] = [];
  const evidenceRefs: string[] = [];

  if (!resumeUnavailable) {
    evidenceRefs.push("resume");
    if (resumeTextUsed) evidenceRefs.push("resume_text");
    if (resumeImageCount > 0) evidenceRefs.push(`resume_images:${resumeImageCount}`);
  }
  if (applicationAnswerCount > 0) evidenceRefs.push(`application_answers:${applicationAnswerCount}`);
  if (coverLetterProvided) evidenceRefs.push("cover_letter");
  if (typeof quizScore === "number") evidenceRefs.push(`quiz:${quizScore}`);
  if (typingTest?.wpm) evidenceRefs.push(`typing:${typingTest.wpm}wpm`);
  if (typeof voiceScore === "number") evidenceRefs.push(`voice:${voiceScore}`);
  if (typeof portfolioScore === "number") evidenceRefs.push(`portfolio:${portfolioScore}`);
  if (typeof chatSimulationScore === "number") evidenceRefs.push(`chat_simulation:${chatSimulationScore}`);
  if (typeof salesSimulationScore === "number") evidenceRefs.push(`sales_simulation:${salesSimulationScore}`);
  if (typeof chatInterviewScore === "number") evidenceRefs.push(`chat_interview:${chatInterviewScore}`);
  if (typeof videoIntroScore === "number") evidenceRefs.push(`video_intro:${videoIntroScore}`);
  else if (videoIntroSubmitted) evidenceRefs.push("video_intro_submitted");
  if (Array.isArray(workflowSteps) && workflowSteps.length > 0) evidenceRefs.push(`workflow_steps:${workflowSteps.length}`);

  if (resumeUnavailable) riskFlags.push("Resume could not be analyzed");
  if (safeScore < passingScore) riskFlags.push("Overall score is below the passing threshold");
  if (/WRONG_RESUME/i.test(analysisText)) riskFlags.push("Resume may not belong to this candidate or role");
  if (/INVALID_DOCUMENT/i.test(analysisText)) riskFlags.push("Uploaded file did not behave like a valid resume");
  if (/SUSPICIOUS/i.test(analysisText)) riskFlags.push("Resume details need manual verification");
  if (/MISMATCH|LIKELY_FABRICATED/i.test(analysisText)) riskFlags.push("Profile authenticity needs review");
  if (/Missing Critical Skills|Poor Match|Not Recommended/i.test(analysisText)) riskFlags.push("Critical role-fit concerns were flagged");
  if (/LIKELY_AI_GENERATED/i.test(analysisText)) riskFlags.push("Application content may be overly templated");
  if (Array.isArray(jobSkillsRequired) && jobSkillsRequired.length > 0 && /Missing Critical Skills/i.test(analysisText)) {
    riskFlags.push("Required skill alignment needs a closer look");
  }
  if (/deal[- ]?breaker|non[- ]?negotiable|cannot work|required schedule/i.test(analysisText)) {
    riskFlags.push("A stated non-negotiable or deal-breaker appears to conflict with the application");
  }

  const familyPrimarySignals: Record<string, Array<number | null | undefined>> = {
    support: [chatSimulationScore, voiceScore, chatInterviewScore, quizScore],
    sales: [salesSimulationScore, voiceScore, chatInterviewScore, quizScore],
    creative: [portfolioScore, videoIntroScore, chatInterviewScore, safeScore],
    technical: [quizScore, chatInterviewScore, safeScore],
    operations_admin: [typingTest?.score as number | undefined, typingTest?.accuracy ? Math.round(typingTest.accuracy) : undefined, quizScore, safeScore],
    field_service: [quizScore, voiceScore, safeScore],
    retail_hospitality: [videoIntroScore, voiceScore, chatInterviewScore, safeScore],
    healthcare: [voiceScore, quizScore, safeScore],
    executive: [videoIntroScore, chatInterviewScore, voiceScore, safeScore],
    general: [quizScore, voiceScore, chatInterviewScore, safeScore],
  };

  const primarySignalAverage = averageOf(familyPrimarySignals[family] || familyPrimarySignals.general, safeScore);
  const workflowTypes = Array.isArray(workflowSteps)
    ? workflowSteps.map((step: any) => String(step?.type || "").toLowerCase()).filter(Boolean)
    : [];
  const pendingHighSignalPhases: string[] = [];
  const completedHighSignalPhases: string[] = [];

  const registerHighSignal = (label: string, score: number | null | undefined, configured: boolean, treatAsSubmitted = false) => {
    if (!configured) return;
    if (typeof score === "number" || treatAsSubmitted) {
      completedHighSignalPhases.push(label);
    } else {
      pendingHighSignalPhases.push(label);
    }
  };

  registerHighSignal("quiz", quizScore, quizConfigured);
  registerHighSignal("chat simulation", chatSimulationScore, workflowTypes.includes("chat_simulation"));
  registerHighSignal("sales simulation", salesSimulationScore, workflowTypes.includes("sales_simulation"));
  registerHighSignal("chat interview", chatInterviewScore, workflowTypes.includes("chat_interview"));
  registerHighSignal("Ava interview", voiceScore, workflowTypes.includes("voice_interview"));
  registerHighSignal("typing test", typingTest?.score, workflowTypes.includes("typing_test"));
  registerHighSignal("portfolio review", portfolioScore, workflowTypes.includes("portfolio_upload"));
  registerHighSignal(
    "video response",
    videoIntroScore,
    workflowTypes.includes("video_intro") || workflowTypes.includes("video_message"),
    videoIntroSubmitted,
  );

  const hardRequirements = clampPercent(
    weightedAverage(
      [
        { value: safeScore, weight: 0.45 },
        { value: quizScore, weight: 0.25 },
        { value: primarySignalAverage, weight: 0.2 },
        { value: portfolioScore, weight: family === "creative" ? 0.1 : 0.05 },
      ],
      safeScore,
    ) - (riskFlags.some((flag) => flag.includes("Critical role-fit")) ? 10 : 0),
  );
  const roleCompetency = clampPercent(
    weightedAverage(
      [
        { value: safeScore, weight: 0.35 },
        { value: primarySignalAverage, weight: 0.35 },
        { value: quizScore, weight: family === "technical" ? 0.2 : 0.1 },
        { value: salesSimulationScore, weight: family === "sales" ? 0.2 : 0.05 },
        { value: chatSimulationScore, weight: family === "support" ? 0.2 : 0.05 },
        { value: portfolioScore, weight: family === "creative" ? 0.2 : 0.05 },
      ],
      safeScore,
    ),
  );
  const communication = clampPercent(
    weightedAverage(
      [
        { value: voiceScore, weight: 0.35 },
        { value: videoIntroScore, weight: 0.2 },
        { value: chatSimulationScore, weight: family === "support" ? 0.2 : 0.1 },
        { value: salesSimulationScore, weight: family === "sales" ? 0.2 : 0.1 },
        { value: chatInterviewScore, weight: 0.2 },
        { value: safeScore - 4, weight: 0.05 },
      ],
      safeScore - 4,
    ),
  );
  const executionReliability = clampPercent(
    weightedAverage(
      [
        { value: safeScore, weight: 0.3 },
        { value: quizScore, weight: 0.25 },
        { value: typingTest?.score as number | undefined, weight: family === "operations_admin" ? 0.25 : 0.1 },
        { value: typingTest?.accuracy ? Math.round(typingTest.accuracy) : undefined, weight: 0.15 },
        { value: chatInterviewScore, weight: 0.1 },
      ],
      safeScore,
    ),
  );
  const workStyleFit = clampPercent(
    weightedAverage(
      [
        { value: safeScore, weight: 0.35 },
        { value: chatSimulationScore, weight: 0.15 },
        { value: voiceScore, weight: 0.15 },
        { value: chatInterviewScore, weight: 0.2 },
        { value: videoIntroScore, weight: 0.15 },
      ],
      safeScore,
    ),
  );

  const completedSignalCount = completedHighSignalPhases.length;
  const evidenceQuality = clampPercent(
    30 +
      evidenceRefs.length * 6 +
      completedSignalCount * 10 +
      (applicationAnswerCount >= 4 ? 6 : applicationAnswerCount > 0 ? 3 : 0) +
      (resumeTextUsed ? 8 : 0) +
      (resumeImageCount > 0 ? 5 : 0) -
      (resumeUnavailable ? 10 : 0),
  );

  const confidence = clampPercent(
    35 +
      completedSignalCount * 12 +
      (applicationAnswerCount >= 4 ? 8 : applicationAnswerCount > 0 ? 4 : 0) +
      (resumeTextUsed ? 10 : 0) +
      (resumeImageCount > 0 ? 5 : 0) +
      (coverLetterProvided ? 3 : 0) -
      (riskFlags.some((flag) => flag.toLowerCase().includes("authenticity")) ? 10 : 0) -
      (resumeUnavailable ? 8 : 0),
  );

  const hardRejectReason =
    riskFlags.find((flag) => flag.includes("A stated non-negotiable")) ||
    riskFlags.find((flag) => flag.includes("Resume may not belong")) ||
    riskFlags.find((flag) => flag.includes("Profile authenticity")) ||
    riskFlags.find((flag) => flag.includes("Critical role-fit")) ||
    null;

  const evidenceFloorMet =
    pendingHighSignalPhases.length === 0 ||
    completedHighSignalPhases.length > 0 ||
    !!hardRejectReason;

  const hardRequirementStatus: AvaScorecard["hardRequirementStatus"] = hardRejectReason
    ? "at_risk"
    : safeScore >= passingScore
      ? "met"
      : "mixed";

  let recommendedAction: RecommendedAction = "reject";
  const advanceBuffer = entryLevel ? 6 : 10;
  const reviewFloor = entryLevel ? Math.max(42, passingScore - 12) : Math.max(45, passingScore - 8);

  if (hardRejectReason) {
    recommendedAction = "reject";
  } else if (!evidenceFloorMet) {
    recommendedAction = "review";
  } else if (safeScore >= passingScore + advanceBuffer && confidence >= 62 && hardRequirementStatus !== "at_risk") {
    recommendedAction = "advance";
  } else if (safeScore >= reviewFloor || primarySignalAverage >= passingScore) {
    recommendedAction = "review";
  }

  let autopilotAction: AutopilotAction = "reject";
  if (hardRejectReason) {
    autopilotAction = "reject";
  } else if (!evidenceFloorMet) {
    autopilotAction = "defer";
  } else {
    autopilotAction = safeScore >= passingScore ? "advance" : "reject";
  }

  const decisionState: AvaDecisionState = evidenceFloorMet ? "ready_for_decision" : "needs_more_evidence";
  const pendingPhaseLabel = pendingHighSignalPhases.length > 0
    ? formatNaturalList(Array.from(new Set(pendingHighSignalPhases)))
    : null;
  const rationale =
    hardRejectReason
      ? `${hardRejectReason}. Ava recommends stopping here based on the evidence already collected.`
      : !evidenceFloorMet
        ? pendingPhaseLabel
          ? `Ava needs more evidence before a final reject or advance recommendation. Pending signals: ${pendingPhaseLabel}.`
          : "Ava needs more evidence before making a final reject or advance recommendation."
        : recommendedAction === "advance"
          ? `Strong ${family.replace(/_/g, " ")} evidence and confidence support moving this candidate forward.`
          : recommendedAction === "review"
            ? `Signals are mixed for this ${family.replace(/_/g, " ")} role, so a human should review the evidence collected so far.`
            : "Available evidence is below the role threshold, so Ava recommends rejection.";

  return {
    overallScore: safeScore,
    confidence,
    recommendedAction,
    hardRequirementStatus,
    dimensionScores: {
      hard_requirements: hardRequirements,
      role_competency: roleCompetency,
      communication,
      execution_reliability: executionReliability,
      work_style_fit: workStyleFit,
      evidence_quality: evidenceQuality,
    },
    riskFlags: Array.from(new Set(riskFlags)),
    rationale,
    evidenceRefs,
    evidenceFingerprint,
    evidenceFloorMet,
    pendingHighSignalPhases: Array.from(new Set(pendingHighSignalPhases)),
    completedHighSignalPhases: Array.from(new Set(completedHighSignalPhases)),
    autopilotAction,
    decisionState,
    hardRejectReason,
  };
}

export function resolveAutopilotAction(
  score: number | null,
  passingScore: number,
  scorecard?: Pick<AvaScorecard, "autopilotAction" | "decisionState" | "recommendedAction"> | null,
): AutopilotAction {
  if (scorecard?.autopilotAction) {
    return scorecard.autopilotAction;
  }

  if (scorecard?.decisionState === "needs_more_evidence") {
    return "defer";
  }

  if (score !== null) {
    return score >= passingScore ? "advance" : "reject";
  }

  if (scorecard?.recommendedAction === "advance") {
    return "advance";
  }

  return "reject";
}
