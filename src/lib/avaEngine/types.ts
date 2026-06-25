/** Ava Engine — typed handoffs for guided create-job (Phase 1 MVP). */

export type Rigor = "easy" | "standard" | "high";
export type WorkMode = "onsite" | "hybrid" | "remote";
export type EmploymentType = "full_time" | "part_time" | "contract";

export interface BriefAnswer {
  questionId: string;
  question: string;
  answer: string;
}

export interface JobBrief {
  roleTitle: string;
  location: string;
  workMode: WorkMode;
  employmentType: EmploymentType;
  pay: string;
  startUrgency: "asap" | "few_weeks" | "flexible";
  whatTheyDo: string;
  followUps: BriefAnswer[];
  openings: number;
}

export interface RigorRecommendation {
  recommended: Rigor;
  chosen: Rigor;
  rationale: string;
}

export type PhaseKind =
  | "application"
  | "quiz"
  | "simulation"
  | "typing_test"
  | "coding_test"
  | "voice_interview"
  | "document_request"
  | "trial_shift"
  | "in_person"
  | "background_check"
  | "custom";

export interface JobPost {
  title: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  niceToHaves: string[];
}

export interface ShortlistConfig {
  topN: number;
  minCompositeScore: number;
  weights: Record<string, number>;
  tieBreakPhaseId?: string;
}

export interface ModelStamp {
  provider: string;
  model: string;
  promptVersion: string;
}

export interface QuizConfig {
  kind: "quiz";
  timeLimitSec: number;
  items: { id: string; scenario: string; options?: string[] }[];
}

export interface VoiceConfig {
  kind: "voice_interview";
  maxCallLengthSec: number;
  questions: { id: string; prompt: string }[];
  dimensions: string[];
}

export interface SimulationConfig {
  kind: "simulation";
  scenarios: { id: string; title: string; prompt: string }[];
}

export type PhaseConfig =
  | QuizConfig
  | VoiceConfig
  | SimulationConfig
  | { kind: Exclude<PhaseKind, "quiz" | "voice_interview" | "simulation">; [k: string]: unknown };

export interface PhaseRubric {
  criteria: { id: string; label: string; guidance: string; weightWithinPhase: number }[];
}

export interface ScreeningPhase {
  id: string;
  kind: PhaseKind;
  order: number;
  title: string;
  candidateDescription: string;
  rationale: string;
  config: PhaseConfig;
  rubric: PhaseRubric;
  weight: number;
  passThreshold?: number;
  scoringMode: "auto" | "human" | "external";
  /** UI helpers for the review screen */
  countLabel?: string;
  durationLabel?: string;
}

/** Legacy stages shape — consumed by showcase candidate apply (`flow.stages`). */
export interface LegacyQuizItem {
  scenario: string;
  good: string;
}

export interface LegacyFlowStage {
  kind: string;
  title: string;
  icon: string;
  avaRuns?: boolean;
  youDecide?: boolean;
  applicationQuestions?: string[];
  quiz?: { items: LegacyQuizItem[]; timeLimitMin: number };
  interview?: { questions: string[]; durationMin: number; scored: string[] };
  shortlist?: { topN: number; threshold: number; weights: string[] };
}

export interface JobFlow {
  id: string;
  roleId: string;
  version: number;
  rigor: Rigor;
  jobPost: JobPost;
  phases: ScreeningPhase[];
  shortlist: ShortlistConfig;
  stages: LegacyFlowStage[];
  generatedBy: ModelStamp;
  createdAt: string;
}

export interface GenerateFlowRequest {
  brief: JobBrief;
  rigor: Rigor;
  rigorRecommendation?: RigorRecommendation;
}

export interface GenerateFlowResult {
  flow: JobFlow;
  source: "openai" | "template";
}
