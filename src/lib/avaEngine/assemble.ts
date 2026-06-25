/** Assemble + convert JobFlow phases to legacy `stages` for showcase apply. */
import type {
  JobFlow,
  JobBrief,
  JobPost,
  LegacyFlowStage,
  ScreeningPhase,
  ShortlistConfig,
} from "./types";
import { RIGOR_SPEC } from "./rigor";

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function phasesToLegacyStages(phases: ScreeningPhase[], shortlist: ShortlistConfig): LegacyFlowStage[] {
  const stages: LegacyFlowStage[] = [];

  for (const phase of phases) {
    if (phase.kind === "application") {
      const questions = (phase.config as { questions?: string[] }).questions ?? [];
      stages.push({
        kind: "application",
        title: phase.title,
        icon: "doc",
        applicationQuestions: questions,
      });
    } else if (phase.kind === "quiz") {
      const cfg = phase.config as { timeLimitSec?: number; items?: { scenario: string; good?: string }[] };
      const items = (cfg.items ?? []).map((i) => ({ scenario: i.scenario, good: i.good ?? "" }));
      stages.push({
        kind: "quiz",
        title: phase.title,
        icon: "quiz",
        quiz: { items, timeLimitMin: Math.ceil((cfg.timeLimitSec ?? 600) / 60) },
      });
    } else if (phase.kind === "voice_interview") {
      const cfg = phase.config as {
        maxCallLengthSec?: number;
        questions?: { prompt: string }[];
        dimensions?: string[];
      };
      stages.push({
        kind: "interview",
        title: phase.title,
        icon: "mic",
        avaRuns: true,
        interview: {
          questions: (cfg.questions ?? []).map((q) => q.prompt),
          durationMin: Math.ceil((cfg.maxCallLengthSec ?? 480) / 60),
          scored: cfg.dimensions ?? ["Clarity", "Judgment", "Fit"],
        },
      });
    } else if (phase.kind === "simulation") {
      // Candidate runtime for simulation is Phase 2 — store as quiz-like placeholder in stages
      const cfg = phase.config as { scenarios?: { title: string; prompt: string }[] };
      const items = (cfg.scenarios ?? []).map((s) => ({
        scenario: `${s.title}: ${s.prompt}`,
        good: "Practical judgment and communication.",
      }));
      if (items.length) {
        stages.push({
          kind: "quiz",
          title: phase.title,
          icon: "quiz",
          quiz: { items, timeLimitMin: 6 },
        });
      }
    } else if (phase.kind === "coding_test") {
      stages.push({
        kind: "quiz",
        title: phase.title,
        icon: "quiz",
        quiz: {
          items: [{ scenario: (phase.candidateDescription || phase.title).slice(0, 500), good: "Code quality and reasoning." }],
          timeLimitMin: 45,
        },
      });
    }
  }

  stages.push({
    kind: "shortlist",
    title: "Shortlist",
    icon: "star",
    youDecide: true,
    shortlist: {
      topN: shortlist.topN,
      threshold: shortlist.minCompositeScore / 10,
      weights: Object.keys(shortlist.weights),
    },
  });

  return stages;
}

export function buildJobFlow(params: {
  brief: JobBrief;
  rigor: JobFlow["rigor"];
  jobPost: JobPost;
  phases: ScreeningPhase[];
  shortlist: ShortlistConfig;
  generatedBy: JobFlow["generatedBy"];
  roleId?: string;
}): JobFlow {
  const stages = phasesToLegacyStages(params.phases, params.shortlist);
  return {
    id: uid("flow"),
    roleId: params.roleId ?? "",
    version: 1,
    rigor: params.rigor,
    jobPost: params.jobPost,
    phases: params.phases,
    shortlist: params.shortlist,
    stages,
    generatedBy: params.generatedBy,
    createdAt: new Date().toISOString(),
  };
}

export function defaultShortlistWeights(phases: ScreeningPhase[]): Record<string, number> {
  const weights: Record<string, number> = {};
  const scorable = phases.filter((p) => p.scoringMode === "auto" && p.kind !== "application");
  const voice = scorable.find((p) => p.kind === "voice_interview");
  const rest = scorable.filter((p) => p.kind !== "voice_interview");
  if (voice) weights[voice.id] = 0.4;
  const each = rest.length ? 0.6 / rest.length : 0;
  rest.forEach((p) => {
    weights[p.id] = each;
  });
  return weights;
}

export function emptyRubric(): ScreeningPhase["rubric"] {
  return { criteria: [] };
}

export { RIGOR_SPEC };
