/**
 * Two preview-only seams for a walk-through of a chat agent's hiring, end to
 * end (2026-10-29: the owner asked for a filmed run of two chat jobs and two
 * applications, on the practice screens, with no account).
 *
 *   - `?__previewJob=chat-agent`: the café's Barista job, which every
 *     applicant step page of the default fixtures is parked on, becomes a
 *     dental office's remote chat agent job, built the way Ava builds one
 *     since 2026-10-29: the dental pack's five-question skills check, the
 *     computer and connection check, a typing test, one patient chat (the
 *     pack's own reschedule case) and the written interview. The business is
 *     Bright Smile Dental, as in the `clinic` scenario.
 *   - `?__previewAi=sample`: the three AI calls the screens make with a raw
 *     fetch (generate-flow, ai-chat-simulation, ai-chat-interview) are
 *     answered here, so nothing reaches the live functions: generate-flow
 *     answers as it does when the service is down (the builder uses its
 *     built-in plan), and the patient and the interviewer answer with fixed,
 *     scripted lines, streamed the way the real ones are. They are sample
 *     words, not the model's: a walk-through shows the flow, not the AI.
 *
 * DEV-only, like everything under src/dev-preview (docs/DEV-PREVIEW.md).
 */
import { SCENARIO_PACKS } from "@/content/scenarioPacks/packs";
import type { FixtureRow, FixtureTables } from "./fixtureClient";
import { CANDIDATE_USER_ID, EMPLOYER_USER_ID, JOB_BARISTA_ID, JOB_SERVER_ID, STEP_CHAT_INTERVIEW, STEP_CHAT_SIM, STEP_CONNECTION, STEP_TYPING } from "./ids";

const BUSINESS = "Bright Smile Dental";
const TITLE = "Chat Support Agent";
const SECOND_TITLE = "Billing Email Agent";

export function previewChatAgentJob(tables: FixtureTables, spec: string | null): void {
  const flags = (spec ?? "").split(",").map((w) => w.trim());
  if (!flags.includes("chat-agent")) return;
  const pack = SCENARIO_PACKS.medical;
  const theCase = pack.cases.find((c) => c.id === "md-reschedule-rush") ?? pack.cases[0];
  const steps = [
    { id: STEP_CONNECTION, type: "equipment_check", title: "Your computer and connection", config: { minDownloadMbps: 10, minUploadMbps: 3, maxPingMs: 150 } },
    { id: STEP_TYPING, type: "typing_test", title: "Typing speed check" },
    {
      id: STEP_CHAT_SIM,
      type: "chat_simulation",
      title: "Patient chat practice",
      config: { pack: pack.id, minMessages: 4, scenarios: [{ id: theCase.id, customerName: theCase.customerName, scenario: theCase.scenario }] },
    },
    { id: STEP_CHAT_INTERVIEW, type: "chat_interview", title: "Written interview" },
  ];
  const quiz = pack.skills.map((q) => ({ id: q.id, type: q.type, question: q.question, options: q.options, time_limit_seconds: q.time_limit_seconds }));
  const reshape = (job: FixtureRow): FixtureRow =>
    job.id !== JOB_BARISTA_ID
      ? job
      : {
          ...job,
          title: TITLE,
          description:
            "Answer our patients by chat on our website and Facebook page: booking and moving appointments, insurance and billing questions, and passing anything medical to our nurses. You'll work from home with our front-desk team in the US.",
          requirements: "Clear, kind written English. At least a year of chat or email support. A quiet place to work and a steady connection.",
          responsibilities: "Answer patient chats, book and reschedule appointments, explain our fees, and hand medical questions to a nurse.",
          location: "Remote (Philippines)",
          location_city: null,
          location_region: null,
          location_country: "Philippines",
          location_country_code: "PH",
          is_remote: true,
          job_type: "full_time",
          department: "Patient support",
          experience_level: "mid",
          salary_min: 25000,
          salary_max: 30000,
          salary_currency: "PHP",
          salary_period: "month",
          benefits: ["Work from home", "Paid training", "HMO after regularization"],
          skills_required: ["Chat support", "Written English", "Scheduling"],
          job_code: "DENTAL-CHAT",
          application_questions: [
            { id: "aq1", type: "textarea", question: "Tell us about the chat or email support you've done: what kind of customers, and how many chats at once.", required: true },
            { id: "aq2", type: "text", question: "Which hours can you work, in US Central time?", required: true },
            { id: "aq3", type: "text", question: "Do you have a quiet place to work and a backup internet connection?", required: true },
          ],
          quiz_questions: quiz,
          workflow_steps: steps,
          required_wpm: 35,
          processing_mode: "manual",
        };
  // The applicant's second job: the café's Server job becomes the office's billing email agent.
  const reshapeSecond = (job: FixtureRow): FixtureRow =>
    job.id !== JOB_SERVER_ID
      ? job
      : {
          ...job,
          title: SECOND_TITLE,
          description: "Reply to our patients' emails about bills, insurance claims and payment plans within 4 hours, and send anything about treatment to our nurses.",
          location: "Remote (Philippines)",
          location_country: "Philippines",
          location_country_code: "PH",
          is_remote: true,
          job_type: "full_time",
          salary_min: 22000,
          salary_max: 22000,
          salary_currency: "PHP",
          salary_period: "month",
          workflow_steps: [
            { id: "wf-server-connection", type: "equipment_check", title: "Your computer and connection" },
            { id: "wf-server-typing", type: "typing_test", title: "Typing speed check" },
            { id: "wf-server-chatsim", type: "chat_simulation", title: "Patient email practice" },
            { id: "wf-server-chatint", type: "chat_interview", title: "Written interview" },
          ],
        };
  const both = (job: FixtureRow) => reshapeSecond(reshape(job));
  for (const name of ["jobs", "published_jobs_public"] as const) {
    if (tables[name]) tables[name] = (tables[name] ?? []).map(both);
  }
  for (const application of tables.applications ?? []) {
    const title = application.job_id === JOB_BARISTA_ID ? TITLE : application.job_id === JOB_SERVER_ID ? SECOND_TITLE : null;
    if (!title) continue;
    if (application.jobs && typeof application.jobs === "object") application.jobs = both(application.jobs as FixtureRow);
    Object.assign(application, { applied_job_title: title, applied_company_name: BUSINESS, applied_location: "Remote (Philippines)", applied_job_type: "full_time" });
  }
  for (const profile of tables.profiles ?? []) {
    if (profile.user_id === EMPLOYER_USER_ID) Object.assign(profile, { company_name: BUSINESS, company_description: "A family dental office in Austin, Texas." });
    if (profile.user_id === CANDIDATE_USER_ID) {
      Object.assign(profile, {
        job_title: "Chat support agent",
        bio: "Two years answering chats and emails for a US telehealth account.",
        skills: ["Chat support", "Email support", "Scheduling", "Zendesk"],
        location: "Cebu, Philippines",
      });
    }
  }
  if (tables.employer_public_branding) {
    tables.employer_public_branding = tables.employer_public_branding.map((row) => (row.user_id === EMPLOYER_USER_ID ? { ...row, company_name: BUSINESS } : row));
  }
}

/** The patient's side of the sample chat, one line per turn (the pack's reschedule case). */
const PATIENT = [
  "Hi, I have a check-up with Dr. Ana tomorrow at 10 AM but my work shift just moved and I can't come. Can I see her tomorrow afternoon instead? I'm on a 5 minute break.",
  "Ben Reyes, and it's 0917 555 0142.",
  "Thursday at 2 is too late, my tooth has been bugging me. Can't you just squeeze me in with Dr. Ana tomorrow? And please skip the $20 fee, it's not my fault my shift moved.",
  "Ok, Dr. Omar at 4 tomorrow works. Please send the fee thing to the manager.",
  "Thanks, that's really helpful. Have a good day!",
];

/** The interviewer's side of the sample written interview. */
const INTERVIEWER = [
  "Hi Jordan, thanks for joining. To start, tell me about the chat or email support you've done before: what kind of customers, and what a busy day looked like.",
  "That's helpful. Say a patient writes in upset because we cancelled their appointment an hour before. Walk me through your first two replies.",
  "Good. How do you keep your replies quick and accurate when you're handling three chats at once?",
  "A patient asks you whether a swollen gum is serious. What do you write back?",
  "Last one: why a dental office, and why this job?",
  "Thank you, Jordan. That's everything from me. The hiring team will read your answers and get back to you. You can send the interview now.",
];

function sse(text: string): Response {
  const encoder = new TextEncoder();
  const words = text.split(/(?<=\s)/);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ assessment: { recorded: true } })}\n\n`));
      for (const word of words) {
        await new Promise((resolve) => setTimeout(resolve, 45));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: word } }] })}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * `?__previewAi=sample,writer:<seconds>` (2026-11-01, for timing Ava's build
 * screen without the live writer): generate-flow answers after that many
 * seconds with a sample plan's words (a customer-service job's post, form
 * questions and interview; its skills check and practice come from the pack
 * on the page, as live). Asked for its parts as they are written (the page's
 * `progress: true`), it sends them as the live function does, one line each
 * at the share of the time the writer takes to reach it, then the result.
 * `sample,writer:<seconds>,burst`: as the live writer was seen on 2026-11-01, thinking for most of the time and then
 * sending every part within the last tenth (the build screen shows them one at a time all the same).
 * `sample,hang`: it never answers (the page's own time limit decides).
 * Plain `sample` answers as before: down, so the built-in plan is used.
 */
export function previewWriterSpec(value: string | null): { mode: "down" } | { mode: "writer"; seconds: number; burst?: boolean } | { mode: "hang" } {
  const flags = (value ?? "").split(",").map((w) => w.trim());
  if (flags.includes("hang")) return { mode: "hang" };
  const writer = flags.find((f) => /^writer:\d+(\.\d+)?$/.test(f));
  return writer ? { mode: "writer", seconds: Number(writer.slice(7)), ...(flags.includes("burst") ? { burst: true } : {}) } : { mode: "down" };
}

const SAMPLE_PLAN = {
  jobPost: {
    title: "Chat Support Agent",
    summary: "Answer our customers by chat, kindly and correctly, so every question is settled in one go.",
    responsibilities: ["Answer customer chats on our website", "Follow our refund and booking rules", "Pass anything you cannot settle to the right person with a clear note"],
    requirements: ["Clear, friendly written English", "A quiet place to work and a steady connection", "At least a year of chat or email support"],
    niceToHaves: ["Experience with a help desk tool"],
  },
  application: ["Which hours can you work each week?", "Tell us about a customer you helped by chat.", "Why this job?"],
  quiz: [],
  simulation: [],
  voiceQuestions: [
    "Tell us about a time a customer was upset with you. What did you write first?",
    "How do you keep three chats moving at once?",
    "A customer asks for something our rules do not allow. How do you say no?",
    "How do you check you understood a question before you answer it?",
    "What do you do when you do not know the answer?",
    "What makes a reply clear to someone reading it on a phone?",
  ],
  voiceDimensions: ["Clarity", "Judgment", "Care", "Follow-through"],
  shortlistWeights: ["Skills check", "Chat practice", "Written interview", "Form answers", "Connection"],
  phaseRationales: ["A quick filter for fit.", "", "Their own words, in writing."],
  generatedBy: { provider: "openai", model: "preview-sample-writer", promptVersion: "flowgen-cs@1" },
};

/** The sample writer's answer: the plan's parts at the share of the time the live writer reaches each, then the result. */
function sampleWriter(seconds: number, progress: boolean, signal: AbortSignal | null | undefined, burst = false): Promise<Response> {
  const total = Math.max(0, seconds) * 1000;
  const wait = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  if (!progress) return wait(total).then(() => json(SAMPLE_PLAN));
  const parts: Array<[string, number]> = burst
    ? [
        ["jobPost", 0.9],
        ["application", 0.92],
        ["quiz", 0.92],
        ["simulation", 0.93],
        ["voiceQuestions", 0.96],
        ["voiceDimensions", 0.97],
        ["shortlistWeights", 0.99],
        ["phaseRationales", 1],
      ]
    : [
        ["jobPost", 0.45],
        ["application", 0.55],
        ["quiz", 0.56],
        ["simulation", 0.57],
        ["voiceQuestions", 0.85],
        ["voiceDimensions", 0.88],
        ["shortlistWeights", 0.93],
        ["phaseRationales", 1],
      ];
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const line = (o: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(o)}\n`));
      try {
        line({ stage: "writing" });
        let at = 0;
        for (const [part, share] of parts) {
          await wait(total * share - at);
          at = total * share;
          line({ part });
        }
        line({ result: SAMPLE_PLAN });
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
  return Promise.resolve(new Response(stream, { status: 200, headers: { "Content-Type": "application/x-ndjson" } }));
}

export function installPreviewSampleAi(supabaseUrl: string, enabled: boolean, writer: ReturnType<typeof previewWriterSpec> = { mode: "down" }): void {
  if (!enabled) return;
  const base = `${supabaseUrl}/functions/v1/`;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(base)) return realFetch(input, init);
    const name = url.slice(base.length).split("?")[0];
    let body: { mode?: string; messages?: unknown[] } = {};
    try {
      body = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
    } catch {
      body = {};
    }
    const replies = Array.isArray(body.messages) ? body.messages.filter((m) => (m as { role?: string })?.role === "user").length : 0;
    if (name === "generate-flow") {
      if (writer.mode === "hang") {
        return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      }
      if (writer.mode === "writer") return sampleWriter(writer.seconds, (body as { progress?: unknown }).progress === true, init?.signal, writer.burst);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return json({ error: "Sample preview: the built-in plan is used." }, 503);
    }
    if (name === "ai-chat-simulation") {
      if (body.mode === "evaluate") return json({ success: true });
      // The agent's message just sent is not yet in the history: one more reply than it holds.
      const turn = body.mode === "start" ? 0 : Math.min(PATIENT.length - 1, replies + 1);
      return sse(PATIENT[turn]);
    }
    if (name === "ai-chat-interview") {
      if (body.mode === "submit") return json({ success: true });
      const turn = body.mode === "start" ? 0 : Math.min(INTERVIEWER.length - 1, replies + 1);
      return sse(INTERVIEWER[turn]);
    }
    return realFetch(input, init);
  };
}

/** The typing test's passage in the sample walk-through: a support agent's own kind of writing. */
const TYPING_PASSAGE =
  "Thank you for writing to us. I can see your appointment on Tuesday at ten in the morning. I have moved it to Thursday at two in the afternoon, and you will get a reminder the day before. If anything changes, just reply to this message and we will help you right away.";

type SampleInvoke = { data: unknown; error: null };

/**
 * `?__previewAi=sample`: the typing test's server calls (submit-typing-test:
 * start, complete, submit), answered here so the step can be taken offline.
 * The real server picks the passage and grades it; here the passage is fixed
 * and the result is not graded.
 */
export function previewSampleInvoke(name: string, options: { body?: unknown } | undefined, enabled: boolean): SampleInvoke | null {
  if (!enabled || name !== "submit-typing-test") return null;
  const action = (options?.body as { action?: unknown } | undefined)?.action;
  if (action === "start") return { data: { targetText: TYPING_PASSAGE }, error: null };
  return { data: { success: true }, error: null };
}
