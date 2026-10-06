/** Assemble + convert JobFlow phases to legacy `stages` for showcase apply. */
import type {
  EquipmentCheckConfig,
  JobFlow,
  JobBrief,
  JobPost,
  LegacyFlowStage,
  ScreeningPhase,
  ShortlistConfig,
} from "./types";
import { RIGOR_SPEC } from "./rigor";
import { REMOTE_FOLLOWUPS } from "./playbook";

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * The three bars for the computer and connection check, read off the brief's
 * own "how solid does their home internet need to be?" follow-up (playbook
 * REMOTE_FOLLOWUPS, asked for every remote role). The middle chip is the
 * job-config default in docs/EQUIPMENT-CHECK.md §2; the others step down and
 * up from it. An unanswered or unknown answer gets the default.
 */
const EQUIPMENT_BARS_BY_CHIP: ReadonlyArray<Omit<EquipmentCheckConfig, "kind">> = [
  { minDownloadMbps: 5, minUploadMbps: 2, maxLatencyMs: 300 }, // "Basic broadband is fine"
  { minDownloadMbps: 10, minUploadMbps: 3, maxLatencyMs: 200 }, // "Reliable, video-call ready"
  { minDownloadMbps: 25, minUploadMbps: 10, maxLatencyMs: 100 }, // "Fast wired connection required"
];

export function equipmentBarsForBrief(brief: Pick<JobBrief, "followUps">): EquipmentCheckConfig {
  const internet = REMOTE_FOLLOWUPS.find((f) => f.id === "remote-internet");
  const answer = brief.followUps?.find((f) => f.questionId === "remote-internet")?.answer;
  const chip = internet && answer ? internet.chips.indexOf(answer) : -1;
  const bars = EQUIPMENT_BARS_BY_CHIP[chip === -1 ? (internet?.def ?? 1) : chip] ?? EQUIPMENT_BARS_BY_CHIP[1];
  return { kind: "equipment_check", ...bars };
}

/** A remote role is done from the candidate's own computer, so the check is
 *  worth running; on site the employer's machine is not theirs to test. The
 *  same line the playbook draws for its remote-critical follow-ups. */
export function briefWantsEquipmentCheck(brief: Pick<JobBrief, "workMode">): boolean {
  return brief.workMode === "remote";
}

/**
 * The computer and connection check as an engine phase, built the same way by
 * the template generator and the edge-flow mapper so the two never describe
 * it differently. It is evidence for the shortlist, never a score
 * (docs/EQUIPMENT-CHECK.md rule 3): weight 0, scoringMode "external" (the
 * figures come from our server's clock, not from a judge), and
 * defaultShortlistWeights leaves it out by kind as well. Candidate-facing
 * words here (title, candidateDescription) are stored on the job, so they
 * never name Ava or say AI.
 */
export function equipmentCheckPhase(brief: Pick<JobBrief, "followUps">, order: number): ScreeningPhase {
  return {
    id: "ph_connection",
    kind: "equipment_check",
    order,
    title: "Your computer and connection",
    candidateDescription: "A short speed test on the computer you'll work from.",
    rationale: "Remote work lives or dies on the connection, so I measure it myself on the computer they'll use — no screenshots.",
    config: equipmentBarsForBrief(brief),
    rubric: { criteria: [] },
    weight: 0,
    scoringMode: "external",
    countLabel: "3 checks",
    durationLabel: "~1 min",
  };
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
  // The connection check is excluded by kind, not only by its scoringMode: a
  // Mbps figure is not a 0-100 score, and it must never carry shortlist weight.
  const scorable = phases.filter((p) => p.scoringMode === "auto" && p.kind !== "application" && p.kind !== "equipment_check");
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
