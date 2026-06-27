/**
 * Persist an Ava-Engine JobFlow to the REAL ATS `jobs` table.
 *
 * The premium guided create-job flow (AvaCreateJob) used to write to the showcase
 * `roles` table via createShowcaseRole(). That table is gone after the cutover to the
 * full ATS schema, so "Publish role" was broken. This module maps a JobFlow + JobBrief
 * onto the `jobs` row shape the candidate runtime + cockpit actually read:
 *
 *   - jobs.application_questions : ApplicationQuestion[]  (read by CandidateApplicationWizard / ApplicationFormPhase)
 *   - jobs.quiz_questions        : QuizQuestion[]         (read by QuizPhase)
 *   - jobs.workflow_steps        : WorkflowStep[]         (read by CandidateApplicationWizard / ApplyWithCode / getApplicationDisplayState)
 *
 * NOTE: application + quiz are synthetic phases in the candidate runtime (derived from
 * application_questions / quiz_questions), so they are deliberately NOT emitted as
 * workflow_steps. Only the "active" steps (simulation, interview, etc.) go into workflow_steps.
 */
import { supabase } from "@/integrations/supabase/client";
import { rigorToDb } from "@/lib/avaEngine/rigor";
import type {
  JobFlow,
  JobBrief,
  ScreeningPhase,
  QuizConfig,
  VoiceConfig,
  SimulationConfig,
} from "@/lib/avaEngine/types";

/** Matches the QuizQuestion shape read by src/pages/QuizPhase.tsx + written by CreateJob.tsx. */
interface QuizQuestion {
  id: string;
  type: string;
  question: string;
  options: string[];
  correct_answer: string | null;
  fit_context?: string;
  time_limit_seconds: number;
  category: string;
}

/** Matches the ApplicationQuestion shape read by CandidateApplicationWizard / ApplicationFormPhase. */
interface ApplicationQuestion {
  id: string;
  type: string;
  question: string;
  required: boolean;
  placeholder?: string;
}

/** Matches the WorkflowStep shape read across the candidate runtime ({ id, type, title, description, required, config }). */
interface WorkflowStep {
  id: string;
  type: string;
  title: string;
  description: string;
  required: boolean;
  config: Record<string, unknown>;
}

export interface CreateJobFromFlowResult {
  id: string;
  job_code: string;
  title: string;
}

export interface CreateJobFromFlowOptions {
  /** "published" (default) or "draft". */
  status?: "published" | "draft";
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function mapEmploymentType(t: JobBrief["employmentType"]): string {
  if (t === "part_time") return "part-time";
  if (t === "contract") return "contract";
  return "full-time";
}

/** rigor (easy|standard|high) -> workflow_difficulty (easy|medium|hard). */
function mapDifficulty(rigor: JobFlow["rigor"]): "easy" | "medium" | "hard" {
  return rigorToDb(rigor);
}

/** Build a non-empty job description from the post (description is NOT NULL). */
function composeDescription(flow: JobFlow, brief: JobBrief): string {
  const { jobPost } = flow;
  const parts: string[] = [];
  if (jobPost.summary?.trim()) parts.push(jobPost.summary.trim());

  if (jobPost.responsibilities?.length) {
    parts.push("What you'll do:\n" + jobPost.responsibilities.map((r) => `• ${r}`).join("\n"));
  }
  if (jobPost.requirements?.length) {
    parts.push("What we're looking for:\n" + jobPost.requirements.map((r) => `• ${r}`).join("\n"));
  }
  if (jobPost.niceToHaves?.length) {
    parts.push("Nice to have:\n" + jobPost.niceToHaves.map((r) => `• ${r}`).join("\n"));
  }

  const composed = parts.join("\n\n").trim();
  if (composed) return composed;
  // Last-resort fallbacks — description must never be empty.
  return (
    brief.whatTheyDo?.trim() ||
    jobPost.title?.trim() ||
    brief.roleTitle?.trim() ||
    "Role details to follow."
  );
}

/** Map the application phase's questions (string[]) to ApplicationQuestion[]. */
function buildApplicationQuestions(phases: ScreeningPhase[]): ApplicationQuestion[] {
  const app = phases.find((p) => p.kind === "application");
  if (!app) return [];
  const questions = (app.config as { questions?: string[] }).questions ?? [];
  return questions
    .filter((q) => typeof q === "string" && q.trim().length > 0)
    .map((q, i) => ({
      id: `aq_${i}_${Math.random().toString(36).slice(2, 7)}`,
      type: "textarea",
      question: q.trim(),
      required: true,
    }));
}

/**
 * Map the quiz phase's items to QuizQuestion[].
 * Engine quiz items are scenario/judgment prompts with no objective answer; the rubric
 * carries the "good answer" guidance. They map to a fit/situational question (no right
 * answer) which QuizPhase treats as a free-text fit question (getQuestionType -> "fit").
 */
function buildQuizQuestions(phases: ScreeningPhase[]): QuizQuestion[] {
  const quiz = phases.find((p) => p.kind === "quiz");
  if (!quiz) return [];
  const cfg = quiz.config as QuizConfig;
  const timeLimit = cfg.timeLimitSec && cfg.items?.length
    ? Math.max(20, Math.round(cfg.timeLimitSec / cfg.items.length))
    : 45;

  const rubricById = new Map(
    (quiz.rubric?.criteria ?? []).map((c) => [c.id, c.guidance]),
  );

  return (cfg.items ?? [])
    .filter((it) => typeof it.scenario === "string" && it.scenario.trim().length > 0)
    .map((it) => ({
      id: it.id || uid("quiz"),
      type: "situational",
      question: it.scenario.trim(),
      options: Array.isArray(it.options) ? it.options : [],
      correct_answer: null,
      fit_context: rubricById.get(it.id) || undefined,
      time_limit_seconds: timeLimit,
      category: "Scenario",
    }));
}

/**
 * Map "active" engine phases to candidate-runtime WorkflowStep[].
 * application + quiz are synthetic phases (covered by application_questions / quiz_questions)
 * and are intentionally excluded here. Each emitted step uses a `type` that has a real
 * candidate runtime + route (see src/utils/getApplicationDisplayState.ts).
 */
function buildWorkflowSteps(phases: ScreeningPhase[]): WorkflowStep[] {
  const steps: WorkflowStep[] = [];

  for (const phase of phases) {
    if (phase.kind === "simulation") {
      const cfg = phase.config as SimulationConfig;
      const scenarios = (cfg.scenarios ?? []).map((s, i) => ({
        id: s.id || `scenario-${i + 1}`,
        customerName: "Customer",
        scenario: `${s.title ? `${s.title}: ` : ""}${s.prompt}`.trim(),
      }));
      steps.push({
        id: uid("step"),
        type: "chat_simulation",
        title: phase.title || "Scenario simulation",
        description: phase.candidateDescription || "Handle a realistic situation.",
        required: true,
        config: scenarios.length ? { scenarios } : {},
      });
    } else if (phase.kind === "voice_interview") {
      const cfg = phase.config as VoiceConfig;
      // Map to chat_interview (text) — universally available runtime; CreateJob upgrades
      // chat_interview -> voice_interview only when the employer has premium voice access.
      steps.push({
        id: uid("step"),
        type: "chat_interview",
        title: phase.title || "Interview with Ava",
        description: phase.candidateDescription || "A short conversation about your experience.",
        required: true,
        config: {
          questions: (cfg.questions ?? []).map((q) => q.prompt),
          dimensions: cfg.dimensions ?? ["Clarity", "Judgment", "Fit"],
        },
      });
    }
    // application / quiz -> synthetic phases (not workflow_steps)
    // coding_test -> no candidate runtime; its signal lives in the job description.
  }

  return steps;
}

/** Short uppercase code fallback if the DB trigger doesn't populate job_code. */
function generateJobCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

/**
 * Persist a generated JobFlow to the real `jobs` table and return the identifiers the
 * AvaCreateJob success screen needs.
 */
export async function createJobFromFlow(
  flow: JobFlow,
  brief: JobBrief,
  opts: CreateJobFromFlowOptions = {},
): Promise<CreateJobFromFlowResult> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw new Error(userErr.message);
  const employerId = userData.user?.id;
  if (!employerId) {
    throw new Error("You must be signed in to publish a role.");
  }

  const title = (flow.jobPost.title || brief.roleTitle || "Untitled role").trim();
  const description = composeDescription(flow, brief);

  const requirements = flow.jobPost.requirements?.length
    ? flow.jobPost.requirements.join("\n")
    : null;
  const responsibilities = flow.jobPost.responsibilities?.length
    ? flow.jobPost.responsibilities.join("\n")
    : null;

  const applicationQuestions = buildApplicationQuestions(flow.phases);
  const quizQuestions = buildQuizQuestions(flow.phases);
  const workflowSteps = buildWorkflowSteps(flow.phases);

  const row = {
    employer_id: employerId,
    title,
    description,
    requirements,
    responsibilities,
    location: brief.location || null,
    job_type: mapEmploymentType(brief.employmentType),
    skills_required: [] as string[],
    status: (opts.status ?? "published") as "published" | "draft",
    application_questions: applicationQuestions as unknown as never,
    quiz_questions: quizQuestions as unknown as never,
    workflow_steps: workflowSteps as unknown as never,
    workflow_difficulty: mapDifficulty(flow.rigor),
    passing_score: flow.shortlist?.minCompositeScore ?? 60,
    processing_mode: "auto",
    require_resume: true,
  };

  const { data, error } = await supabase.from("jobs").insert(row).select("*").single();
  if (error) throw new Error(error.message);

  let jobCode: string | null = (data as { job_code: string | null }).job_code ?? null;
  const jobId = (data as { id: string }).id;

  // job_code is normally set by a DB trigger; if it wasn't, generate + persist one.
  if (!jobCode) {
    jobCode = generateJobCode();
    const { error: updErr } = await supabase
      .from("jobs")
      .update({ job_code: jobCode })
      .eq("id", jobId);
    if (updErr) throw new Error(updErr.message);
  }

  return { id: jobId, job_code: jobCode, title };
}
