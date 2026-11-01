/** Flow generation — OpenAI via Supabase edge function, with template fallback. */
import { generateTemplateFlow } from "./templateGenerator";
import {
  briefWantsEquipmentCheck,
  buildJobFlow,
  defaultShortlistWeights,
  emptyRubric,
  equipmentCheckPhase,
  RIGOR_SPEC,
  WRITTEN_INTERVIEW_DESCRIPTION,
  WRITTEN_INTERVIEW_TITLE,
} from "./assemble";
import { rigorToLegacy } from "./rigor";
import { detectFamily } from "./playbook";
import { applyCustomerServicePack, channelForBrief, packIdForBrief } from "./customerService";
import { supabase } from "@/integrations/supabase/client";
import type {
  GenerateFlowRequest,
  GenerateFlowResult,
  JobFlow,
  JobPost,
  ScreeningPhase,
} from "./types";

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SB_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

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

  const appQs = take(payload.application, spec.app);
  phases.push({
    id: "ph_app",
    kind: "application",
    order: order++,
    title: "A few quick questions",
    candidateDescription: "Availability, experience, and why this role.",
    rationale: rationales[r++] || "A quick filter for fit.",
    config: { kind: "application", questions: appQs },
    rubric: {
      criteria: appQs.length
        ? appQs.map((q, i) => ({
            id: `app${i}`,
            label: `Answer ${i + 1}`,
            guidance: `Completeness and role-relevance of the response to: ${q}`,
            weightWithinPhase: 1 / appQs.length,
          }))
        : [{ id: "app0", label: "Application", guidance: "Completeness and role-relevance of the answers.", weightWithinPhase: 1 }],
    },
    weight: 0.1,
    scoringMode: "auto",
    countLabel: `${appQs.length} questions`,
    durationLabel: "~3 min",
  });

  const quizItems = take(payload.quiz, spec.quiz);
  phases.push({
    id: "ph_quiz",
    kind: "quiz",
    order: order++,
    title: "Short timed scenarios",
    candidateDescription: "Real situations from a typical day on the job.",
    rationale: rationales[r++] || "Timed judgment under a little pressure.",
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

  // Same placement as the template flow: first workflow step on a remote role
  // (docs/EQUIPMENT-CHECK.md §2). The edge payload carries nothing for it and
  // it consumes no rationale, so the model's rationales stay aligned.
  if (briefWantsEquipmentCheck(req.brief)) {
    phases.push(equipmentCheckPhase(req.brief, order++));
  }

  const sims = take(payload.simulation, spec.simulation);
  if (sims.length) {
    phases.push({
      id: "ph_sim",
      kind: "simulation",
      order: order++,
      title: "Handle a real moment",
      candidateDescription: sims[0].prompt,
      rationale: rationales[r++] || "Practical role-play on your biggest risks.",
      config: {
        kind: "simulation",
        scenarios: sims.map((s, i) => ({ id: `sim${i}`, title: s.title, prompt: s.prompt })),
      },
      rubric: {
        criteria: sims.map((s, i) => ({
          id: `sim${i}`,
          label: s.title,
          guidance: `Did they handle this well: ${s.prompt}`,
          weightWithinPhase: 1 / sims.length,
        })),
      },
      weight: 0.2,
      scoringMode: "auto",
      countLabel: `${sims.length} scenario(s)`,
      durationLabel: "~6 min",
    });
  }

  const voiceQs = take(payload.voiceQuestions, spec.voice);
  const voiceDims = take(payload.voiceDimensions, 4).length
    ? take(payload.voiceDimensions, 4)
    : ["Clarity", "Judgment", "Ownership", "Fit"];
  // Saved as a typed chat interview, like the template's (WRITTEN_INTERVIEW_TITLE in assemble.ts).
  phases.push({
    id: "ph_voice",
    kind: "voice_interview",
    order: order++,
    title: WRITTEN_INTERVIEW_TITLE,
    candidateDescription: WRITTEN_INTERVIEW_DESCRIPTION,
    rationale: rationales[r++] || "Their own words, in writing — clarity, judgment, ownership.",
    config: {
      kind: "voice_interview",
      maxCallLengthSec: spec.callMin * 60,
      questions: voiceQs.map((q, i) => ({ id: `v${i}`, prompt: q })),
      dimensions: voiceDims,
    },
    rubric: {
      criteria: voiceDims.map((d, i) => ({
        id: `vdim${i}`,
        label: d,
        guidance: `Score the written answers on ${d.toLowerCase()}, quoting what they wrote.`,
        weightWithinPhase: 1 / voiceDims.length,
      })),
    },
    weight: 0.35,
    scoringMode: "auto",
    countLabel: `${voiceQs.length} questions`,
    durationLabel: `~${spec.callMin} min`,
  });

  const weights = take(payload.shortlistWeights, 5);
  // A customer-service job gets its industry pack's skills check and chat
  // cases, whatever the model wrote for those two (customerService.ts).
  const finalPhases = detectFamily(req.brief) === "customer_service" ? applyCustomerServicePack(phases, req.brief) : phases;
  const shortlist = {
    topN: spec.topN,
    minCompositeScore: spec.minCompositeScore,
    weights: defaultShortlistWeights(finalPhases),
  };

  return buildJobFlow({
    brief: req.brief,
    rigor: req.rigor,
    jobPost,
    phases: finalPhases,
    shortlist,
    generatedBy: {
      provider: "openai",
      model: "edge-generate-flow",
      promptVersion: "flowgen@1",
    },
  });
}

/** A customer-service job's pack and channel, which generate-flow reads against its own allow-list to write the post and interview for that industry. */
function customerServiceFields(brief: GenerateFlowRequest["brief"]): { customerService?: { pack: string; channel: string } } {
  return detectFamily(brief) === "customer_service" ? { customerService: { pack: packIdForBrief(brief), channel: channelForBrief(brief) } } : {};
}

async function callEdgeFunction(req: GenerateFlowRequest, watch: GenerateWatch = {}): Promise<JobFlow> {
  if (!SB_URL || !SB_KEY) throw new Error("Supabase env not configured");
  // A signed-in employer only: generate-flow (verify_jwt) refuses anonymous calls.
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error("Not signed in — sign in to generate with Ava");
  // One time limit for the whole answer, its streamed parts included: past it the built-in plan stands in
  // (generateJobFlow), and the page leaving (watch.signal) stops it too, which stops the model.
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, watch.timeLimitMs ?? WRITER_TIME_LIMIT_MS);
  const leave = () => controller.abort();
  watch.signal?.addEventListener("abort", leave);
  try {
    const res = await fetch(`${SB_URL}/functions/v1/generate-flow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SB_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        brief: req.brief,
        rigor: rigorToLegacy(req.rigor),
        rigorPlan: req.rigor,
        ...customerServiceFields(req.brief),
        // Each part as it is written (generate-flow's header); an older function ignores it and answers in one piece.
        progress: true,
      }),
      signal: controller.signal,
    });
    if (res.ok && res.body && /ndjson/i.test(res.headers.get("content-type") ?? "")) {
      return edgePayloadToFlow(req, await readPlanParts(res.body, watch, controller.signal));
    }
    const data = (await res.json()) as EdgeFlowPayload & { error?: string };
    if (!res.ok || data.error) {
      throw new Error(data.error ?? `generate-flow ${res.status}`);
    }
    return edgePayloadToFlow(req, data);
  } catch (err) {
    if (timedOut) throw new WriterTookTooLong();
    throw err;
  } finally {
    window.clearTimeout(timeout);
    watch.signal?.removeEventListener("abort", leave);
  }
}

/**
 * How long the builder waits for Ava's writer, the streamed parts included,
 * before the built-in plan stands in (40 s since the Phase 7 product audit:
 * the writer often needs more than the old 18). The build screen says so.
 */
export const WRITER_TIME_LIMIT_MS = 40_000;

/** What the build screen hears while the writer works (src/lib/buildProgress.ts). */
export interface GenerateWatch {
  /** The model has taken the request and is writing. */
  onWriting?: () => void;
  /** One part of the plan is written: generate-flow's key ("jobPost", "application", "voiceQuestions", ...). */
  onPart?: (part: string) => void;
  /** The page left: stop waiting (and the model). */
  signal?: AbortSignal;
  /** For tests: the time limit. */
  timeLimitMs?: number;
}

class WriterTookTooLong extends Error {
  constructor() {
    super("generate-flow took longer than the time limit");
    this.name = "WriterTookTooLong";
  }
}

/** generate-flow's streamed answer: one JSON object a line (its header), the parts as they are written, then the plan. */
async function readPlanParts(body: ReadableStream<Uint8Array>, watch: GenerateWatch, stop: AbortSignal): Promise<EdgeFlowPayload> {
  const reader = body.getReader();
  // The time limit or the page leaving ends the read too, whatever the connection does with the abort.
  const cut = () => void reader.cancel().catch(() => {});
  if (stop.aborted) cut();
  stop.addEventListener("abort", cut);
  try {
    return await readLines(reader, watch);
  } finally {
    stop.removeEventListener("abort", cut);
  }
}

async function readLines(reader: ReadableStreamDefaultReader<Uint8Array>, watch: GenerateWatch): Promise<EdgeFlowPayload> {
  const decoder = new TextDecoder();
  let buf = "";
  let plan: EdgeFlowPayload | null = null;
  const line = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    let msg: { stage?: unknown; part?: unknown; result?: unknown; error?: unknown };
    try {
      msg = JSON.parse(t);
    } catch {
      return;
    }
    if (msg.error) throw new Error(String(msg.error));
    if (msg.stage === "writing") watch.onWriting?.();
    if (typeof msg.part === "string") watch.onPart?.(msg.part);
    if (msg.result && typeof msg.result === "object") plan = msg.result as EdgeFlowPayload;
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      line(buf.slice(0, i));
      buf = buf.slice(i + 1);
    }
  }
  line(buf);
  if (!plan) throw new Error("generate-flow ended without a plan");
  return plan;
}

export async function generateJobFlow(req: GenerateFlowRequest, watch: GenerateWatch = {}): Promise<GenerateFlowResult> {
  try {
    const flow = await callEdgeFunction(req, watch);
    if (!flow.phases?.length) throw new Error("empty flow");
    return { flow, source: "openai" };
  } catch (err) {
    console.warn("[ava-engine] AI generation unavailable — using template fallback.", err);
    return { ...generateTemplateFlow(req), fallback: err instanceof WriterTookTooLong ? "timeout" : "unavailable" };
  }
}

export type { GenerateFlowRequest, GenerateFlowResult };
