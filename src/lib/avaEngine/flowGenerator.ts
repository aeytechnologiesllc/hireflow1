/** Flow generation — OpenAI via Supabase edge function, with template fallback. */
import { generateTemplateFlow } from "./templateGenerator";
import { buildJobFlow, defaultShortlistWeights, emptyRubric, RIGOR_SPEC } from "./assemble";
import { rigorToLegacy } from "./rigor";
import type {
  GenerateFlowRequest,
  GenerateFlowResult,
  JobFlow,
  JobPost,
  ScreeningPhase,
} from "./types";

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

interface EdgeFlowPayload {
  jobPost?: JobPost;
  application?: string[];
  quiz?: { scenario: string; good: string }[];
  simulation?: { title: string; prompt: string }[];
  voiceQuestions?: string[];
  voiceDimensions?: string[];
  shortlistWeights?: string[];
  phaseRationales?: string[];
  error?: string;
}

function take<T>(arr: T[] | undefined, n: number): T[] {
  return Array.isArray(arr) ? arr.slice(0, n) : [];
}

function edgePayloadToFlow(req: GenerateFlowRequest, payload: EdgeFlowPayload): JobFlow {
  const spec = RIGOR_SPEC[req.rigor];
  const jobPost: JobPost = payload.jobPost ?? {
    title: req.brief.roleTitle,
    summary: req.brief.whatTheyDo,
    responsibilities: [req.brief.whatTheyDo],
    requirements: ["Reliable and job-ready"],
    niceToHaves: [],
  };

  const rationales = payload.phaseRationales ?? [];
  const phases: ScreeningPhase[] = [];
  let order = 0;
  let r = 0;

  phases.push({
    id: "ph_app",
    kind: "application",
    order: order++,
    title: "A few quick questions",
    candidateDescription: "Availability, experience, and why this role.",
    rationale: rationales[r++] ?? "A quick filter for fit.",
    config: { kind: "application", questions: take(payload.application, spec.app) },
    rubric: emptyRubric(),
    weight: 0.1,
    scoringMode: "auto",
    countLabel: `${take(payload.application, spec.app).length} questions`,
    durationLabel: "~3 min",
  });

  const quizItems = take(payload.quiz, spec.quiz);
  phases.push({
    id: "ph_quiz",
    kind: "quiz",
    order: order++,
    title: "Short timed scenarios",
    candidateDescription: "Real situations from a typical day on the job.",
    rationale: rationales[r++] ?? "Timed judgment under a little pressure.",
    config: {
      kind: "quiz",
      timeLimitSec: spec.quizMin * 60,
      items: quizItems.map((q, i) => ({ id: `q${i}`, scenario: q.scenario })),
    },
    rubric: {
      criteria: quizItems.map((q, i) => ({
        id: `q${i}`,
        label: `Scenario ${i + 1}`,
        guidance: q.good,
        weightWithinPhase: quizItems.length ? 1 / quizItems.length : 1,
      })),
    },
    weight: 0.25,
    scoringMode: "auto",
    countLabel: `${quizItems.length} items`,
    durationLabel: `${spec.quizMin} min`,
  });

  const sims = take(payload.simulation, spec.simulation);
  if (sims.length) {
    phases.push({
      id: "ph_sim",
      kind: "simulation",
      order: order++,
      title: "Handle a real moment",
      candidateDescription: sims[0].prompt,
      rationale: rationales[r++] ?? "Practical role-play on your biggest risks.",
      config: {
        kind: "simulation",
        scenarios: sims.map((s, i) => ({ id: `sim${i}`, title: s.title, prompt: s.prompt })),
      },
      rubric: emptyRubric(),
      weight: 0.2,
      scoringMode: "auto",
      countLabel: `${sims.length} scenario(s)`,
      durationLabel: "~6 min",
    });
  }

  const voiceQs = take(payload.voiceQuestions, spec.voice);
  phases.push({
    id: "ph_voice",
    kind: "voice_interview",
    order: order++,
    title: "Answer a few questions out loud",
    candidateDescription: "A short recording about your experience and approach.",
    rationale: rationales[r++] ?? "Strongest signal — clarity, judgment, ownership.",
    config: {
      kind: "voice_interview",
      maxCallLengthSec: spec.callMin * 60,
      questions: voiceQs.map((q, i) => ({ id: `v${i}`, prompt: q })),
      dimensions: take(payload.voiceDimensions, 4).length
        ? take(payload.voiceDimensions, 4)
        : ["Clarity", "Judgment", "Ownership", "Fit"],
    },
    rubric: emptyRubric(),
    weight: 0.35,
    scoringMode: "auto",
    countLabel: `${voiceQs.length} questions`,
    durationLabel: `~${spec.callMin} min`,
  });

  const weights = take(payload.shortlistWeights, 5);
  const shortlist = {
    topN: spec.topN,
    minCompositeScore: spec.minCompositeScore,
    weights: defaultShortlistWeights(phases),
  };

  return buildJobFlow({
    brief: req.brief,
    rigor: req.rigor,
    jobPost,
    phases,
    shortlist,
    generatedBy: {
      provider: "openai",
      model: "edge-generate-flow",
      promptVersion: "flowgen@1",
    },
  });
}

async function callEdgeFunction(req: GenerateFlowRequest): Promise<JobFlow> {
  if (!SB_URL || !SB_KEY) throw new Error("Supabase env not configured");
  const res = await fetch(`${SB_URL}/functions/v1/generate-flow`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
    },
    body: JSON.stringify({
      brief: req.brief,
      rigor: rigorToLegacy(req.rigor),
      rigorPlan: req.rigor,
    }),
  });
  const data = (await res.json()) as EdgeFlowPayload & { error?: string };
  if (!res.ok || data.error) {
    throw new Error(data.error ?? `generate-flow ${res.status}`);
  }
  return edgePayloadToFlow(req, data);
}

export async function generateJobFlow(req: GenerateFlowRequest): Promise<GenerateFlowResult> {
  try {
    const flow = await callEdgeFunction(req);
    if (!flow.phases?.length) throw new Error("empty flow");
    return { flow, source: "openai" };
  } catch (err) {
    console.warn("[ava-engine] AI generation unavailable — using template fallback.", err);
    return generateTemplateFlow(req);
  }
}

export type { GenerateFlowRequest, GenerateFlowResult };
