/** Deterministic template generator — guaranteed fallback when OpenAI / edge fn unavailable. */
import { detectFamily } from "./playbook";
import { bankForFamily } from "./questionBanks";
import { buildJobFlow, defaultShortlistWeights, emptyRubric, RIGOR_SPEC } from "./assemble";
import type { GenerateFlowRequest, GenerateFlowResult, JobPost, ScreeningPhase } from "./types";

function take<T>(arr: T[], n: number): T[] {
  return arr.slice(0, Math.min(n, arr.length));
}

function buildJobPost(brief: GenerateFlowRequest["brief"]): JobPost {
  const title = brief.roleTitle;
  return {
    title,
    summary: `${brief.whatTheyDo} ${brief.location ? `· ${brief.location}` : ""} · ${brief.pay}`.trim(),
    responsibilities: [
      brief.whatTheyDo,
      `Work mode: ${brief.workMode.replace("_", "-")}`,
      `Start: ${brief.startUrgency.replace("_", " ")}`,
    ],
    requirements: [
      "Reliable attendance and clear communication",
      brief.followUps.length ? `Key context: ${brief.followUps.map((f) => f.answer).join("; ")}` : "Relevant experience welcome",
    ],
    niceToHaves: [`Openings: ${brief.openings}`],
  };
}

function buildPhases(brief: GenerateFlowRequest["brief"], rigor: GenerateFlowRequest["rigor"]): ScreeningPhase[] {
  const family = detectFamily(brief);
  const bank = bankForFamily(family);
  const spec = RIGOR_SPEC[rigor];
  const phases: ScreeningPhase[] = [];
  let order = 0;

  const appId = `ph_app`;
  phases.push({
    id: appId,
    kind: "application",
    order: order++,
    title: "A few quick questions",
    candidateDescription: "Availability, relevant experience, and why this role.",
    rationale: "Short enough that good people finish, sharp enough to filter.",
    config: { kind: "application", questions: take(bank.application, spec.app) },
    rubric: emptyRubric(),
    weight: 0.1,
    scoringMode: "auto",
    countLabel: `${spec.app} questions`,
    durationLabel: "~3 min",
  });

  phases.push({
    id: "ph_quiz",
    kind: "quiz",
    order: order++,
    title: "Short timed scenarios",
    candidateDescription: "Real situations from a typical day on the job.",
    rationale: "Timed, so I see judgment under a little pressure — like a real shift.",
    config: {
      kind: "quiz",
      timeLimitSec: spec.quizMin * 60,
      items: take(bank.quiz, spec.quiz).map((q, i) => ({
        id: `q${i}`,
        scenario: q.scenario,
      })),
    },
    rubric: {
      criteria: take(bank.quiz, spec.quiz).map((q, i) => ({
        id: `q${i}`,
        label: `Scenario ${i + 1}`,
        guidance: q.good,
        weightWithinPhase: 1 / spec.quiz,
      })),
    },
    weight: 0.25,
    scoringMode: "auto",
    countLabel: `${spec.quiz} items`,
    durationLabel: `${spec.quizMin} min`,
  });

  if (spec.simulation > 0 && bank.simulation.length) {
    phases.push({
      id: "ph_sim",
      kind: "simulation",
      order: order++,
      title: "Handle a real moment",
      candidateDescription: bank.simulation[0].prompt,
      rationale: "A practical role-play graded on judgment — your biggest day-to-day risks.",
      config: {
        kind: "simulation",
        scenarios: take(bank.simulation, spec.simulation).map((s, i) => ({
          id: `sim${i}`,
          title: s.title,
          prompt: s.prompt,
        })),
      },
      rubric: emptyRubric(),
      weight: 0.2,
      scoringMode: "auto",
      countLabel: `${Math.min(spec.simulation, bank.simulation.length)} scenario(s)`,
      durationLabel: "~6 min",
    });
  }

  if (family === "developer") {
    phases.push({
      id: "ph_code",
      kind: "coding_test",
      order: order++,
      title: "A short practical task",
      candidateDescription: "Build one focused feature and explain a tradeoff.",
      rationale: "Real code beats buzzwords — this is the signal that predicts the job.",
      config: { kind: "coding_test", format: "take_home" },
      rubric: emptyRubric(),
      weight: 0.3,
      scoringMode: "auto",
      countLabel: "1 task",
      durationLabel: "~45 min",
    });
  }

  phases.push({
    id: "ph_voice",
    kind: "voice_interview",
    order: order++,
    title: "Answer a few questions out loud",
    candidateDescription: "A short, friendly set of questions you answer out loud about your experience and approach.",
    rationale: "The strongest signal — clarity, judgment, and ownership; hardest to fake.",
    config: {
      kind: "voice_interview",
      maxCallLengthSec: spec.callMin * 60,
      questions: take(bank.interview, spec.voice).map((q, i) => ({ id: `v${i}`, prompt: q })),
      dimensions: ["Clarity", "Judgment", "Ownership", "Fit"],
    },
    rubric: emptyRubric(),
    weight: 0.35,
    scoringMode: "auto",
    countLabel: `${spec.voice} questions`,
    durationLabel: `~${spec.callMin} min`,
  });

  return phases;
}

export function generateTemplateFlow(req: GenerateFlowRequest): GenerateFlowResult {
  const phases = buildPhases(req.brief, req.rigor);
  const shortlist = {
    topN: RIGOR_SPEC[req.rigor].topN,
    minCompositeScore: RIGOR_SPEC[req.rigor].minCompositeScore,
    weights: defaultShortlistWeights(phases),
  };
  const flow = buildJobFlow({
    brief: req.brief,
    rigor: req.rigor,
    jobPost: buildJobPost(req.brief),
    phases,
    shortlist,
    generatedBy: { provider: "template", model: "playbook@1", promptVersion: "flowgen-template@1" },
  });
  return { flow, source: "template" };
}
