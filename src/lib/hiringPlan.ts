export interface GuidedJobSetup {
  job_family: string;
  urgency: string;
  must_haves: string;
  deal_breakers: string;
  certifications: string;
  schedule_details: string;
  language_requirements: string;
  work_authorization: string;
  travel_requirement: string;
  compensation_guidance: string;
  portfolio_preference: string;
  customer_facing: boolean;
}

export interface ScreeningPlanSummary {
  phaseCount: number;
  estimatedMinutes: number;
  requiredMaterials: string[];
  stepLabels: string[];
  summary: string;
}

export const DEFAULT_GUIDED_JOB_SETUP: GuidedJobSetup = {
  job_family: "general",
  urgency: "standard",
  must_haves: "",
  deal_breakers: "",
  certifications: "",
  schedule_details: "",
  language_requirements: "",
  work_authorization: "",
  travel_requirement: "",
  compensation_guidance: "",
  portfolio_preference: "auto",
  customer_facing: false,
};

export const JOB_FAMILY_OPTIONS = [
  { value: "operations_admin", label: "Operations / Admin", description: "Organized, process-heavy roles with execution and coordination." },
  { value: "support", label: "Customer Support", description: "High-empathy and communication-focused service roles." },
  { value: "sales", label: "Sales", description: "Pitching, objection handling, and relationship-driven hiring." },
  { value: "creative", label: "Creative", description: "Portfolio-led hiring for design, content, and visual work." },
  { value: "technical", label: "Technical", description: "Engineering, product, data, and systems roles." },
  { value: "field_service", label: "Field Service", description: "On-site, route-based, or hands-on operational work." },
  { value: "retail_hospitality", label: "Retail / Hospitality", description: "Fast-paced, customer-facing shifts and service delivery." },
  { value: "healthcare", label: "Healthcare", description: "Credential-sensitive, trust-heavy, regulated work." },
  { value: "executive", label: "Executive", description: "Strategic leadership roles with higher rigor." },
  { value: "general", label: "General", description: "Use when the role does not fit a specific family yet." },
] as const;

export const URGENCY_OPTIONS = [
  { value: "asap", label: "Urgent", description: "Fill the role fast and keep the plan streamlined." },
  { value: "standard", label: "Standard", description: "Balanced speed and quality for a normal hiring timeline." },
  { value: "high_selectivity", label: "High Selectivity", description: "Prioritize rigor and evidence over speed." },
] as const;

export const WORK_AUTHORIZATION_OPTIONS = [
  { value: "none", label: "No special requirement" },
  { value: "required", label: "Must already be authorized" },
  { value: "sponsorship_available", label: "Sponsorship available" },
] as const;

export const PORTFOLIO_PREFERENCE_OPTIONS = [
  { value: "auto", label: "Let Ava decide" },
  { value: "required", label: "Require portfolio" },
  { value: "not_needed", label: "Do not ask for portfolio" },
] as const;

const STEP_LABELS: Record<string, string> = {
  typing_test: "Typing test",
  video_message: "Video response",
  chat_simulation: "Support simulation",
  sales_simulation: "Sales simulation",
  portfolio_upload: "Portfolio review",
  chat_interview: "Ava interview",
  voice_interview: "Ava voice interview",
};

const STEP_TIME_MINUTES: Record<string, number> = {
  typing_test: 5,
  video_message: 5,
  chat_simulation: 10,
  sales_simulation: 10,
  portfolio_upload: 5,
  chat_interview: 15,
  voice_interview: 15,
};

export function estimateCandidateMinutes(
  workflowSteps: Array<{ type?: string }> | null | undefined,
  quizQuestionsCount: number,
  applicationQuestionsCount = 0,
): number {
  const steps = Array.isArray(workflowSteps) ? workflowSteps : [];
  const quizTime = Math.ceil(quizQuestionsCount * 0.5);
  const applicationBase = applicationQuestionsCount > 0 ? 5 : 3;
  const stepsTime = steps.reduce((total, step) => total + (STEP_TIME_MINUTES[step.type || ""] || 5), 0);
  return applicationBase + quizTime + stepsTime;
}

export function getRequiredMaterials(params: {
  requireResume?: boolean | null;
  applicationQuestions?: Array<{ type?: string; question?: string; id?: string }> | null;
  workflowSteps?: Array<{ type?: string }> | null;
}): string[] {
  const materials = new Set<string>();
  const questions = Array.isArray(params.applicationQuestions) ? params.applicationQuestions : [];
  const steps = Array.isArray(params.workflowSteps) ? params.workflowSteps : [];

  if (params.requireResume !== false) {
    materials.add("resume");
  }

  for (const question of questions) {
    const type = question.type || "";
    const prompt = `${question.question || ""} ${question.id || ""}`.toLowerCase();
    if (type === "file" && (prompt.includes("portfolio") || prompt.includes("work sample"))) {
      materials.add("portfolio samples");
    }
    if (type === "file" && !(prompt.includes("resume") || prompt.includes("cv"))) {
      materials.add("supporting files");
    }
  }

  for (const step of steps) {
    switch (step.type) {
      case "video_message":
        materials.add("camera");
        materials.add("quiet space");
        break;
      case "voice_interview":
        materials.add("microphone");
        materials.add("quiet space");
        break;
      case "portfolio_upload":
        materials.add("portfolio samples");
        break;
      default:
        break;
    }
  }

  return Array.from(materials);
}

export function summarizeScreeningPlan(params: {
  applicationQuestions?: Array<{ id?: string }> | null;
  quizQuestions?: Array<{ id?: string }> | null;
  workflowSteps?: Array<{ type?: string }> | null;
  requireResume?: boolean | null;
}): ScreeningPlanSummary {
  const applicationQuestions = Array.isArray(params.applicationQuestions) ? params.applicationQuestions : [];
  const quizQuestions = Array.isArray(params.quizQuestions) ? params.quizQuestions : [];
  const workflowSteps = Array.isArray(params.workflowSteps) ? params.workflowSteps : [];
  const requiredMaterials = getRequiredMaterials({
    requireResume: params.requireResume,
    applicationQuestions,
    workflowSteps,
  });
  const stepLabels = workflowSteps.map((step) => STEP_LABELS[step.type || ""] || "Additional review");
  const phaseCount = 1 + (quizQuestions.length > 0 ? 1 : 0) + workflowSteps.length;
  const estimatedMinutes = estimateCandidateMinutes(workflowSteps, quizQuestions.length, applicationQuestions.length);

  const summaryParts = [
    `${applicationQuestions.length || "A short"} application`,
    quizQuestions.length > 0 ? `${quizQuestions.length} timed assessment questions` : null,
    workflowSteps.length > 0 ? `${workflowSteps.length} guided evaluation step${workflowSteps.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return {
    phaseCount,
    estimatedMinutes,
    requiredMaterials,
    stepLabels,
    summary: summaryParts.join(" + "),
  };
}
