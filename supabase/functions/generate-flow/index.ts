/**
 * Supabase Edge Function: generate-flow
 * Ava's flow generation brain — OpenAI server-side only.
 *
 * Input: { brief: JobBrief, rigor: easy|medium|hard, rigorPlan?: easy|standard|high, progress?: true }
 * Output: JobFlow content fields (jobPost, application, quiz, simulation, the
 * written interview (still keyed voiceQuestions/voiceDimensions), rationales)
 *
 * With `progress: true` (Ava's builder since 2026-11-01) the answer is
 * streamed as lines of JSON (application/x-ndjson): {"stage":"writing"} once
 * the model has taken the request, {"part":"<key>"} as each part of the plan
 * is written (_shared/jsonParts.ts), then {"result":{...}} (the same body as
 * without it) or {"error":...}. The builder shows each part as it lands
 * instead of one frozen line, and closing the page stops the model
 * (the stream's cancel aborts the call). Without it, one JSON body, as
 * before, for any page still open on an older build.
 *
 * NOTE (pre-launch): deployed with verify_jwt=false for demo. Gate behind auth + rate-limit before launch.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { budgetUnitsForText, takeDailyAiBudget } from "../_shared/aiBudget.ts";
import { guardAuthenticatedAiCall, guardPublicAiCall } from "../_shared/rateLimit.ts";
import { jobWritingBusiness } from "../_shared/signedIn.ts";
import { scenarioPack } from "../_shared/scenarioPacks.ts";
import { AGE_RULE, blankAgeAsks, textWithoutAgeAsks, withoutAgeAsks } from "../_shared/ageWording.ts";
import { createJsonPartScanner, createSseContentReader } from "../_shared/jsonParts.ts";

const CS_CHANNELS = { chat: "chat", phone: "phone calls", email: "email", mixed: "chat, phone and email" } as const;

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

/** How long the writer thinks before it writes (generate-flow's one model call). */
const WRITER_REASONING_EFFORT = "low";

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

/**
 * The plan's parts as lines of JSON while the model writes them, then the plan
 * (the same body as the one-piece answer) or the error. Cancelled (the page
 * closed, or its own time limit), the model's call is aborted.
 */
// deno-lint-ignore no-explicit-any
function partsResponse(upstreamBody: ReadableStream<Uint8Array>, upstream: AbortController, planFrom: (content: any) => unknown): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      let content = "";
      const scanner = createJsonPartScanner((part) => send({ part }));
      const sse = createSseContentReader((text) => {
        content += text;
        scanner.push(text);
      });
      try {
        send({ stage: "writing" });
        const reader = upstreamBody.getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          sse.push(decoder.decode(value, { stream: true }));
        }
        sse.end();
        if (!content) send({ error: "empty_completion" });
        else send({ result: planFrom(JSON.parse(content)) });
      } catch (e) {
        send({ error: "exception", detail: String(e).slice(0, 300) });
      }
      controller.close();
    },
    cancel() {
      upstream.abort();
    },
  });
  return new Response(stream, { status: 200, headers: { ...CORS, "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    // Require an authenticated employer — blocks anonymous abuse of the OpenAI key.
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const SB_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!token || !SB_URL || !SERVICE_KEY) return json({ error: "unauthorized" }, 401);
    const { data: { user }, error: authErr } = await createClient(SB_URL, SERVICE_KEY).auth.getUser(token);
    if (authErr || !user) return json({ error: "unauthorized" }, 401);
    // A hiring account only, billed to its business, at most 40 job-writing
    // calls an hour per account (the second Phase 5 review: any account,
    // applicants' included, could spend here, each with its own daily budget).
    const business = await jobWritingBusiness(user.id);
    if (!business) return json({ error: "not_a_business" }, 403);
    // By connection first, like the other two job writers (the third Phase 5
    // review), so a request the connection limit refuses never uses up one
    // of the account's 40 (the fourth).
    const perConnection = await guardPublicAiCall(req, "generate-flow", CORS, 15, 3600);
    if (perConnection) return perConnection;
    const perAccount = await guardAuthenticatedAiCall("job-writing", user.id, CORS, 40, 3600);
    if (perAccount) return perAccount;

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
    // Today's platform-wide AI budget (fails open; _shared/aiBudget.ts). The
    // page falls back to its built-in plan on any error.
    // The asking business pays from its own daily AI budget, then the platform's (_shared/aiBudget.ts).
    // By the size of what the page sent (_shared/aiBudget.ts budgetUnitsForText).
    if (!(await takeDailyAiBudget(budgetUnitsForText(JSON.stringify(brief ?? {}).length), business))) return json({ error: "ai_unavailable", reason: "budget_reached" }, 503);
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-5.6-luna";

    const followUpCtx =
      Array.isArray(brief?.followUps) && brief.followUps.length
        ? brief.followUps.map((f: { question: string; answer: string }) => `${f.question}: ${f.answer}`).join("\n")
        : "";

    // A customer-service job (docs/CUSTOMER-SERVICE-HIRING.md): the page says
    // which industry pack and channel; only known values are used. The skills
    // check and chat cases come from the pack on the page, so the model writes
    // the post, the application and the interview for that industry.
    const csPack = scenarioPack(body?.customerService?.pack);
    const channelAsked = body?.customerService?.channel;
    const csChannel = typeof channelAsked === "string" && Object.hasOwn(CS_CHANNELS, channelAsked) ? CS_CHANNELS[channelAsked as keyof typeof CS_CHANNELS] : null;
    const csCtx = csPack
      ? `Customer service role: a front-line agent for ${csPack.business}, answering by ${csChannel ?? "chat"}. ` +
        `Call the person they help a "${csPack.counterpart}" everywhere.`
      : "";

    const ctx = [
      `Role title: ${brief.roleTitle || brief.title || "(unspecified)"}`,
      csCtx,
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
      // The interview is written, not spoken: voice interviews are off for every
      // business, and the step is saved as a typed chat interview. The output
      // keys keep their old names (voiceQuestions, voiceDimensions) because the
      // app reads them by those names (src/lib/avaEngine/flowGenerator.ts).
      "Interview questions are for a WRITTEN interview the candidate answers by typing — warm and behavioral, one thing at a time, never asking them to speak, record or call — candidate-facing prompts with NO mention of AI, bots, or automation. " +
      "jobPost fields are candidate-facing — warm, clear, human language only (no AI/Ava/bot/automated/algorithm). " +
      "phaseRationales are employer-facing first-person Ava notes explaining why each screening phase exists (AI framing OK there). " +
      "For technical/developer roles include practical scenarios; for cash-handling roles include till/de-escalation scenarios; for cleaning roles include trust/reliability scenarios. " +
      "For a customer service role: write for any country (no country-specific laws, apps or holidays), in plain English a second-language applicant reads easily; use the counterpart word you are given and never 'player' unless that is the word; for phone work, include interview questions about handling calls. " +
      AGE_RULE;

    // A customer-service job's skills check and practice cases are its pack's, put in on the page whatever is written
    // here (src/lib/avaEngine/customerService.ts applyCustomerServicePack), so they are not asked for: the writer
    // spends its time on the post, the form and the interview, which are used (2026-11-01: the wait was the
    // owner's complaint, and those two parts were written only to be thrown away).
    const quizAsk = csPack
      ? "quiz: an empty array (this job's skills check comes from its own scenario pack)"
      : `${spec.quiz} scenario quiz items {scenario, good}`;
    const simAsk = csPack
      ? "simulation: an empty array (its practice cases come from the same pack)"
      : `${spec.sim} simulation scenario(s) {title, prompt} (empty array if rigor is easy)`;

    const userMsg = `${ctx}

Write EXACTLY:
- jobPost: title, summary, responsibilities[], requirements[], niceToHaves[] (candidate-facing, no AI language)
- ${spec.app} short application questions
- ${quizAsk}
- ${simAsk}
- voiceQuestions: ${spec.voice} written interview questions (the candidate types each answer; never ask them to speak or record)
- voiceDimensions: 3-4 competency dimensions to score the written interview answers
- shortlistWeights: 5 ranking factors, most important first
- phaseRationales: one employer-facing Ava rationale per major phase (application, quiz, simulation if any, written interview, shortlist)

Tailor everything to: ${brief.roleTitle || brief.title || "this role"}.`;

    // The builder asks for the plan's parts as they are written (see the top of this file).
    const wantsParts = body?.progress === true;
    const upstream = new AbortController();
    // Little thinking before writing: the plan took 21-24 s, most of it the model thinking before its first part, then
    // every part at once (the owner's live run of 2026-11-01: "it just gets stuck on one, and then it just jumps").
    // A model that takes no reasoning_effort refuses it with a 400 naming it, and is asked again without.
    const askModel = (withEffort: boolean) =>
      fetch("https://api.openai.com/v1/chat/completions", {
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
          ...(withEffort ? { reasoning_effort: WRITER_REASONING_EFFORT } : {}),
          ...(wantsParts ? { stream: true } : {}),
        }),
        signal: upstream.signal,
      });
    let res = await askModel(true);
    if (res.status === 400 && /reasoning_effort/.test(await res.clone().text())) res = await askModel(false);

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: "openai_error", status: res.status, detail: detail.slice(0, 800) }, 502);
    }

    // deno-lint-ignore no-explicit-any
    const planFrom = (content: any) => {
      // No age, birth date or marital status, whatever the model wrote (_shared/ageWording.ts).
      const jobPost = content.jobPost && typeof content.jobPost === "object"
        ? {
            ...content.jobPost,
            // A title that was only an age phrase ("Young Professionals Wanted") falls back to the role's own.
            // Never the unfiltered title back (the fifth Phase 6 review).
            title: textWithoutAgeAsks(content.jobPost.title) || brief.roleTitle || brief.title || "Customer Service Agent",
            summary: textWithoutAgeAsks(content.jobPost.summary),
            requirements: withoutAgeAsks(content.jobPost.requirements),
            niceToHaves: withoutAgeAsks(content.jobPost.niceToHaves),
            responsibilities: withoutAgeAsks(content.jobPost.responsibilities),
          }
        : content.jobPost;
      return {
        jobPost,
        application: take<string>(withoutAgeAsks(content.application), spec.app),
        quiz: take(withoutAgeAsks(content.quiz, (q: { scenario?: unknown; good?: unknown }) => `${q?.scenario ?? ""} ${q?.good ?? ""}`), spec.quiz),
        // The practice's prompt becomes the applicant's brief on jobs outside customer service (the fifth review).
        simulation: take(withoutAgeAsks(content.simulation, (s: { title?: unknown; prompt?: unknown }) => `${s?.title ?? ""}. ${s?.prompt ?? ""}`), spec.sim),
        voiceQuestions: take<string>(withoutAgeAsks(content.voiceQuestions), spec.voice),
        // Ranking factors and notes too: an age factor would rank applicants by age (the fourth Phase 6 review).
        voiceDimensions: take<string>(withoutAgeAsks(content.voiceDimensions), 4),
        shortlistWeights: take<string>(withoutAgeAsks(content.shortlistWeights), 5),
        // Read by position (the note of the step at the same index): an age note
        // is emptied in place, never dropped, or every later step shows the
        // next one's note (the fifth review).
        phaseRationales: take<string>(blankAgeAsks(content.phaseRationales) as string[], 8),
        generatedBy: { provider: "openai", model, promptVersion: csPack ? "flowgen-cs@1" : "flowgen@1" },
      };
    };

    if (wantsParts && res.body) return partsResponse(res.body, upstream, planFrom);

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return json({ error: "empty_completion" }, 502);
    return json(planFrom(JSON.parse(raw)));
  } catch (e) {
    return json({ error: "exception", detail: String(e) }, 500);
  }
});
