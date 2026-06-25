/**
 * Supabase Edge Function: generate-flow
 * Ava's flow generation brain — OpenAI server-side only.
 *
 * Input: { brief: JobBrief, rigor: easy|medium|hard, rigorPlan?: easy|standard|high }
 * Output: JobFlow content fields (jobPost, application, quiz, simulation, voice, rationales)
 *
 * NOTE (pre-launch): deployed with verify_jwt=false for demo. Gate behind auth + rate-limit before launch.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type RigorKey = "easy" | "medium" | "hard";

const RIGOR: Record<
  RigorKey,
  { app: number; quiz: number; sim: number; voice: number; topN: number; quizMin: number; callMin: number }
> = {
  easy: { app: 2, quiz: 5, sim: 0, voice: 4, topN: 8, quizMin: 6, callMin: 5 },
  medium: { app: 3, quiz: 8, sim: 1, voice: 6, topN: 5, quizMin: 8, callMin: 6 },
  hard: { app: 4, quiz: 12, sim: 2, voice: 8, topN: 3, quizMin: 10, callMin: 8 },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function take<T>(a: unknown, n: number): T[] {
  return Array.isArray(a) ? (a.slice(0, n) as T[]) : [];
}

const CONTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "jobPost",
    "application",
    "quiz",
    "simulation",
    "voiceQuestions",
    "voiceDimensions",
    "shortlistWeights",
    "phaseRationales",
  ],
  properties: {
    jobPost: {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary", "responsibilities", "requirements", "niceToHaves"],
      properties: {
        title: { type: "string" },
        summary: { type: "string" },
        responsibilities: { type: "array", items: { type: "string" } },
        requirements: { type: "array", items: { type: "string" } },
        niceToHaves: { type: "array", items: { type: "string" } },
      },
    },
    application: { type: "array", items: { type: "string" } },
    quiz: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["scenario", "good"],
        properties: { scenario: { type: "string" }, good: { type: "string" } },
      },
    },
    simulation: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "prompt"],
        properties: { title: { type: "string" }, prompt: { type: "string" } },
      },
    },
    voiceQuestions: { type: "array", items: { type: "string" } },
    voiceDimensions: { type: "array", items: { type: "string" } },
    shortlistWeights: { type: "array", items: { type: "string" } },
    phaseRationales: { type: "array", items: { type: "string" } },
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const brief = body?.brief ?? body;
    const rigor: RigorKey = (["easy", "medium", "hard"] as const).includes(body?.rigor)
      ? body.rigor
      : body?.rigorPlan === "easy"
        ? "easy"
        : body?.rigorPlan === "high"
          ? "hard"
          : "medium";
    const spec = RIGOR[rigor];

    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return json({ error: "OPENAI_API_KEY not configured" }, 500);
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1";

    const followUpCtx =
      Array.isArray(brief?.followUps) && brief.followUps.length
        ? brief.followUps.map((f: { question: string; answer: string }) => `${f.question}: ${f.answer}`).join("\n")
        : "";

    const ctx = [
      `Role title: ${brief.roleTitle || brief.title || "(unspecified)"}`,
      brief.employmentType ? `Employment type: ${brief.employmentType}` : "",
      brief.workMode ? `Work mode: ${brief.workMode}` : "",
      brief.location ? `Location: ${brief.location}` : "",
      brief.pay ? `Pay: ${brief.pay}` : "",
      brief.startUrgency ? `Start urgency: ${brief.startUrgency}` : "",
      brief.whatTheyDo || brief.description ? `What the work involves: ${brief.whatTheyDo || brief.description}` : "",
      followUpCtx ? `Owner follow-up answers:\n${followUpCtx}` : "",
      `Screening rigor: ${rigor}`,
    ]
      .filter(Boolean)
      .join("\n");

    const sys =
      "You are Ava, an expert hiring-process designer for small businesses. Given a role brief you design the CONTENT of a complete screening flow. Output ONLY JSON matching the schema. " +
      "Make every question SPECIFIC to this exact role — use the description and follow-up context. " +
      "Scenario quiz questions test real on-the-job judgment (never trivia); each has a one-line 'good' note on what a strong answer shows. " +
      "Voice interview questions are warm and behavioral — candidate-facing prompts with NO mention of AI, bots, or automation. " +
      "jobPost fields are candidate-facing — warm, clear, human language only (no AI/Ava/bot/automated/algorithm). " +
      "phaseRationales are employer-facing first-person Ava notes explaining why each screening phase exists (AI framing OK there). " +
      "For technical/developer roles include practical scenarios; for cash-handling roles include till/de-escalation scenarios; for cleaning roles include trust/reliability scenarios.";

    const userMsg = `${ctx}

Write EXACTLY:
- jobPost: title, summary, responsibilities[], requirements[], niceToHaves[] (candidate-facing, no AI language)
- ${spec.app} short application questions
- ${spec.quiz} scenario quiz items {scenario, good}
- ${spec.sim} simulation scenario(s) {title, prompt} (empty array if rigor is easy)
- ${spec.voice} voice interview spoken questions (candidate will answer out loud)
- voiceDimensions: 3-4 competency dimensions to score the voice interview
- shortlistWeights: 5 ranking factors, most important first
- phaseRationales: one employer-facing Ava rationale per major phase (application, quiz, simulation if any, voice, shortlist)

Tailor everything to: ${brief.roleTitle || brief.title || "this role"}.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userMsg },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "ava_job_flow", strict: true, schema: CONTENT_SCHEMA },
        },
        max_completion_tokens: 12000,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: "openai_error", status: res.status, detail: detail.slice(0, 800) }, 502);
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return json({ error: "empty_completion" }, 502);

    const content = JSON.parse(raw);

    return json({
      jobPost: content.jobPost,
      application: take<string>(content.application, spec.app),
      quiz: take(content.quiz, spec.quiz),
      simulation: take(content.simulation, spec.sim),
      voiceQuestions: take<string>(content.voiceQuestions, spec.voice),
      voiceDimensions: take<string>(content.voiceDimensions, 4),
      shortlistWeights: take<string>(content.shortlistWeights, 5),
      phaseRationales: take<string>(content.phaseRationales, 8),
      generatedBy: { provider: "openai", model, promptVersion: "flowgen@1" },
    });
  } catch (e) {
    return json({ error: "exception", detail: String(e) }, 500);
  }
});
