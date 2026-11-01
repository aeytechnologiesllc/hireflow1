#!/usr/bin/env node
/**
 * "Building your hiring plan", honest and shorter (the owner's live run of
 * 2026-11-01: "when it was creating the job, it felt like it almost got stuck
 * because it was there for a very long time and the last process").
 *
 * What was wrong: the build screen walked six timed lines in four seconds and
 * held the last, "Building the scorecard", until the writer's whole plan came
 * back (up to the 40 s limit); its stuck notice came at 25 s, before that
 * limit, and stayed up even once the plan came; and for a customer-service
 * job the writer was asked for eight skills questions and a practice case
 * that the page then replaced with the scenario pack's.
 *
 * Holds:
 *  1. _shared/jsonParts.ts reads a streamed answer and names each top-level
 *     part of the plan the moment its value closes, however the text is cut.
 *  2. The real generate-flow (bundled, its database and OpenAI stood in, no
 *     network): asked with `progress: true` it streams {"stage"}, a
 *     {"part"} for each part, then {"result"} (age words filtered as before);
 *     without it, one JSON body as before; a customer-service job asks for
 *     no quiz and no practice case; the page closing aborts the model's call.
 *  3. The page's call (flowGenerator.ts): each part reaches the screen, an
 *     older one-piece answer still works, past the time limit the built-in
 *     plan stands in and says why, and an error line does too.
 *  4. src/lib/buildProgress.ts: the parts the screen lists and their states.
 *  5. The page: the build starts once on arriving, stops on leaving, the
 *     stuck notice waits past the writer's limit, a plan that comes while it
 *     shows still opens.
 *
 * Run with: node scripts/generate_flow_parts.test.mjs
 */
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const load = async (contents, extra = {}) => {
  const out = await build({ stdin: { contents, resolveDir: ROOT, loader: "ts" }, bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent", alias: { "@": path.join(ROOT, "src") }, ...extra });
  return import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
};

const PLAN = {
  jobPost: { title: "Chat Support Agent", summary: "Help our customers {fast} and \"kindly\": \\ no AI talk.", responsibilities: ["Answer chats"], requirements: ["Clear writing", "Must be 25 years old or younger"], niceToHaves: [] },
  application: ["Which hours can you work?", "What is your age?", "Why this job?"],
  quiz: [],
  simulation: [],
  voiceQuestions: ["Tell us about a hard chat.", "How do you stay calm?", "Why this job?", "A mistake you fixed?", "How do you write clearly?", "What does great service look like?"],
  voiceDimensions: ["Clarity", "Judgment", "Care", "Follow-through"],
  shortlistWeights: ["a", "b", "c", "d", "e"],
  phaseRationales: ["r1", "r2", "r3", "r4"],
};
const KEYS = Object.keys(PLAN);

// 1. The part scanner.
const J = await load('export * from "./supabase/functions/_shared/jsonParts.ts";');
{
  const text = JSON.stringify(PLAN, null, 1);
  let rand = 7;
  const next = () => (rand = (rand * 1103515245 + 12345) % 2147483648);
  let allRight = true;
  for (let round = 0; round < 200; round++) {
    const seen = [];
    const scanner = J.createJsonPartScanner((k) => seen.push(k));
    for (let i = 0; i < text.length; ) {
      const n = 1 + (next() % 9);
      scanner.push(text.slice(i, i + n));
      i += n;
    }
    if (JSON.stringify(seen) !== JSON.stringify(KEYS)) {
      allRight = false;
      console.log("   ", JSON.stringify(seen));
      break;
    }
  }
  check("each part is named once, in order, however the text is cut (200 random cuts; braces, quotes and escapes in the words)", allRight);
  const at = [];
  const s2 = J.createJsonPartScanner((k) => at.push(k));
  const t2 = JSON.stringify({ jobPost: { title: "x" }, application: ["a"] });
  s2.push(t2.slice(0, t2.indexOf('"application"')));
  check("a part is named when its value closes, before the next arrives", JSON.stringify(at) === '["jobPost"]');
  const prim = [];
  const s3 = J.createJsonPartScanner((k) => prim.push(k));
  s3.push('{"a": "x}y", "b": 12, "c": true}');
  check("strings, numbers and words close a part too", JSON.stringify(prim) === '["a","b","c"]');

  const got = [];
  const sse = J.createSseContentReader((t) => got.push(t));
  const events = ["jobPost", "app", "lication"].map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join("") + ": keep-alive\n\ndata: [DONE]\n\n";
  for (let i = 0; i < events.length; i += 5) sse.push(events.slice(i, i + 5));
  sse.end();
  check("the stream reader hands on the content, a line cut across chunks included, keep-alives skipped", got.join("") === "jobPostapplication");
}

// 2. The real generate-flow, its world stood in.
const STUB_SHARED = {
  "../_shared/aiBudget.ts": "export const budgetUnitsForText = () => 1; export async function takeDailyAiBudget() { return true; }",
  "../_shared/rateLimit.ts": "export async function guardPublicAiCall() { return null; } export async function guardAuthenticatedAiCall() { return null; }",
  "../_shared/signedIn.ts": "export async function jobWritingBusiness() { return 'business-1'; }",
};
const ENV = { SUPABASE_URL: "http://database.stand-in", SUPABASE_SERVICE_ROLE_KEY: "service-key", OPENAI_API_KEY: "sk-stand-in" };
globalThis.Deno = { env: { get: (key) => ENV[key] }, serve: (handler) => { globalThis.__fn = handler; } };
await load('import "./supabase/functions/generate-flow/index.ts";', {
  plugins: [
    {
      name: "world",
      setup(b) {
        b.onResolve({ filter: /^https:\/\// }, (args) => {
          if (/esm\.sh\/@supabase\/supabase-js@/.test(args.path)) return { path: "supabase", namespace: "stub" };
          throw new Error(`no stand-in for ${args.path}`);
        });
        b.onResolve({ filter: /^\.\.\/_shared\/(aiBudget|rateLimit|signedIn)\.ts$/ }, (args) => ({ path: args.path, namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
          contents: STUB_SHARED[args.path] ?? "export const createClient = () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner-1' } }, error: null }) } });",
          loader: "js",
        }));
      },
    },
  ],
});
{
  const fn = globalThis.__fn;
  check("the function is loaded", typeof fn === "function");
  const openai = { bodies: [], signals: [] };
  const content = JSON.stringify(PLAN);
  globalThis.fetch = async (url, init) => {
    openai.bodies.push(JSON.parse(init.body));
    openai.signals.push(init.signal);
    const body = JSON.parse(init.body);
    if (!body.stream) return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    const enc = new TextEncoder();
    let i = 0;
    return new Response(
      new ReadableStream({
        async pull(controller) {
          if (init.signal?.aborted) return controller.error(new Error("aborted"));
          if (i >= content.length) {
            controller.enqueue(enc.encode("data: [DONE]\n\n"));
            return controller.close();
          }
          const piece = content.slice(i, i + 37);
          i += 37;
          await new Promise((r) => setTimeout(r, 1));
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`));
        },
      }),
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );
  };
  const brief = { roleTitle: "Chat Support Agent", workMode: "remote", whatTheyDo: "Answer chats.", followUps: [{ question: "What kind of business is it?", answer: "Home services" }] };
  const ask = (extra) => fn(new Request("http://fn/generate-flow", { method: "POST", headers: { Authorization: "Bearer signed-in", "Content-Type": "application/json" }, body: JSON.stringify({ brief, rigor: "medium", customerService: { pack: "home_services", channel: "chat" }, ...extra }) }));

  const res = await ask({ progress: true });
  check("asked for its parts: a stream of JSON lines", res.status === 200 && /application\/x-ndjson/.test(res.headers.get("content-type") ?? ""), res.headers.get("content-type"));
  const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
  check("…\"writing\" first, then each part in order, then the plan", lines[0]?.stage === "writing" && JSON.stringify(lines.slice(1, -1).map((l) => l.part)) === JSON.stringify(KEYS) && !!lines.at(-1)?.result, JSON.stringify(lines.map((l) => Object.keys(l)[0])));
  const plan = lines.at(-1).result;
  check("…the plan filtered as the one-piece answer is (no age question, no age requirement)", plan.application.length === 2 && !plan.application.some((q) => /age/i.test(q)) && !plan.jobPost.requirements.some((r) => /years old/i.test(r)) && plan.generatedBy?.provider === "openai");
  check("…and the model was asked to stream", openai.bodies.at(-1)?.stream === true);
  const prompt = openai.bodies.at(-1)?.messages?.[1]?.content ?? "";
  check("a customer-service job asks for no quiz and no practice case (the pack's are used): shorter to write", /- quiz: an empty array \(this job's skills check comes from its own scenario pack\)/.test(prompt) && /- simulation: an empty array/.test(prompt) && !/scenario quiz items/.test(prompt) && /written interview questions/.test(prompt) && /short application questions/.test(prompt));
  check("…and the follow-up answers are still in it", /Owner follow-up answers:\nWhat kind of business is it\?: Home services/.test(prompt));

  const one = await ask({});
  const body = await one.json();
  check("without progress: one JSON body, as before, and no stream asked of the model", one.status === 200 && /application\/json/.test(one.headers.get("content-type") ?? "") && body.application?.length === 2 && openai.bodies.at(-1)?.stream === undefined);

  const csLess = await fn(new Request("http://fn/generate-flow", { method: "POST", headers: { Authorization: "Bearer signed-in" }, body: JSON.stringify({ brief, rigor: "medium" }) }));
  await csLess.json();
  check("any other job is asked for its quiz and practice as before", /- 8 scenario quiz items \{scenario, good\}/.test(openai.bodies.at(-1)?.messages?.[1]?.content ?? "") && /- 1 simulation scenario\(s\)/.test(openai.bodies.at(-1)?.messages?.[1]?.content ?? ""));

  const cut = await ask({ progress: true });
  const reader = cut.body.getReader();
  await reader.read();
  await reader.cancel();
  await new Promise((r) => setTimeout(r, 5));
  check("the page closing (the stream cancelled) aborts the model's call", openai.signals.at(-1)?.aborted === true);
}

// 3. The page's call.
const STUBS = {
  "@/integrations/supabase/client": "export const supabase = { auth: { getSession: async () => ({ data: { session: { access_token: 'signed-in' } } }) } };",
};
const F = await load(
  'export { generateJobFlow, WRITER_TIME_LIMIT_MS } from "./src/lib/avaEngine/flowGenerator.ts";\nexport { briefFromForm, CHAT_AGENT_KIND } from "./src/lib/avaEngine/playbook.ts";\nexport * from "./src/lib/buildProgress.ts";\n',
  {
    alias: {},
    define: { "import.meta.env": JSON.stringify({ VITE_SUPABASE_URL: "https://stand-in.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "public-key", DEV: false }) },
    plugins: [
      {
        name: "aliases",
        setup(b) {
          b.onResolve({ filter: /^@\// }, async (args) => {
            if (args.path in STUBS) return { path: args.path, namespace: "stub" };
            const base = path.join(ROOT, "src", args.path.slice(2));
            for (const suffix of [".ts", ".tsx", "/index.ts"]) {
              const r = await b.resolve(base + suffix, { kind: args.kind, resolveDir: ROOT });
              if (!r.errors.length) return { path: r.path };
            }
            throw new Error(`cannot resolve ${args.path}`);
          });
          b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: STUBS[args.path], loader: "js" }));
        },
      },
    ],
  },
);
globalThis.window = globalThis;
const realWarn = console.warn;
console.warn = () => {}; // the fallbacks below are expected; their warnings are noise here
{
  const brief = F.briefFromForm({ role: "Chat Support Agent", location: "Remote, United States", type: "Full-time · Remote", typeChosen: false, pay: "$18 an hour", start: "Within a few weeks", work: "Answer chats.", followUps: [{ questionId: "job-kind", question: "What kind of job is it?", answer: "Answering customers by chat or email" }, { questionId: "cs-industry", question: "What kind of business is it?", answer: "Home services" }] });
  const ndjson = (lines, { endless = false } = {}) =>
    new Response(
      new ReadableStream({
        async start(c) {
          const enc = new TextEncoder();
          for (const l of lines) {
            c.enqueue(enc.encode(`${JSON.stringify(l)}\n`));
            await new Promise((r) => setTimeout(r, 2));
          }
          if (!endless) c.close();
        },
      }),
      { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
    );
  let sent = null;
  globalThis.fetch = async (_u, init) => {
    sent = JSON.parse(init.body);
    return ndjson([{ stage: "writing" }, ...KEYS.map((part) => ({ part })), { result: PLAN }]);
  };
  const parts = [];
  let writing = false;
  const r = await F.generateJobFlow({ brief, rigor: "standard" }, { onPart: (p) => parts.push(p), onWriting: () => (writing = true) });
  check("the page asks for parts, and each reaches the screen in order", sent?.progress === true && writing && JSON.stringify(parts) === JSON.stringify(KEYS));
  check("…and the writer's plan is used, with the pack's skills check and practice", r.source === "openai" && !r.fallback && r.flow.phases.find((p) => p.kind === "quiz").config.items.length === 5 && r.flow.phases.find((p) => p.kind === "simulation").config.pack === "home_services");

  globalThis.fetch = async () => new Response(JSON.stringify(PLAN), { status: 200, headers: { "Content-Type": "application/json" } });
  const old = await F.generateJobFlow({ brief, rigor: "standard" });
  check("an older function's one-piece answer still works", old.source === "openai");

  globalThis.fetch = async (_u, init) => {
    const res = ndjson([{ stage: "writing" }, { part: "jobPost" }], { endless: true });
    init.signal.addEventListener("abort", () => res.body.cancel().catch(() => {}));
    return res;
  };
  const t0 = Date.now();
  const slow = await F.generateJobFlow({ brief, rigor: "standard" }, { timeLimitMs: 200 });
  check("past the time limit (parts and all), the built-in plan stands in and says why", slow.source === "template" && slow.fallback === "timeout" && Date.now() - t0 < 2000, `${slow.source} ${slow.fallback} ${Date.now() - t0}ms`);
  check("the limit is 40 s, as before", F.WRITER_TIME_LIMIT_MS === 40_000);

  globalThis.fetch = async () => ndjson([{ stage: "writing" }, { error: "openai_error" }]);
  const broke = await F.generateJobFlow({ brief, rigor: "standard" });
  check("an error line: the built-in plan, \"unavailable\"", broke.source === "template" && broke.fallback === "unavailable");
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "ai_unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  check("a refusal: the same", (await F.generateJobFlow({ brief, rigor: "standard" })).fallback === "unavailable");

  const stop = new AbortController();
  globalThis.fetch = async (_u, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  setTimeout(() => stop.abort(), 20);
  const left = await F.generateJobFlow({ brief, rigor: "standard" }, { signal: stop.signal, timeLimitMs: 5000 });
  check("the page leaving stops the wait at once", left.source === "template" && left.fallback === "unavailable");

  // 4. The screen's parts.
  const P = F.buildPartsFor(brief);
  check("a remote home-services chat job: the pack's three, then the writer's four", JSON.stringify(P.map((p) => `${p.id}:${p.from}`)) === JSON.stringify(["skills:pack", "practice:pack", "connection:pack", "post:writer", "form:writer", "interview:writer", "scorecard:writer"]));
  check("…named from the pack: \"5 questions from home services situations\", \"6 customer chats to pick from\"", P[0].detail === "5 questions from home services situations" && P[1].label === "Chat practice" && P[1].detail === "6 customer chats to pick from", `${P[0].detail} / ${P[1].detail}`);
  const onsiteEmail = F.buildPartsFor({ ...brief, workMode: "onsite", followUps: [...brief.followUps, { questionId: "cs-channel", question: "How will they talk to your customers?", answer: "Email" }] });
  check("on site: no computer check; by email: the email practice", !onsiteEmail.some((p) => p.id === "connection") && onsiteEmail[1].label === "Email practice" && /emails to pick from$/.test(onsiteEmail[1].detail));
  const S = (arrived, finished = null) => F.buildPartStates(P, { arrived: new Set(arrived), finished });
  const st0 = S([]);
  check("at the start: the pack's ready, the post being written, the rest waiting", st0.skills === "ready" && st0.connection === "ready" && st0.post === "writing" && st0.form === "waiting" && st0.scorecard === "waiting");
  const st1 = S(["jobPost", "application", "quiz", "simulation"]);
  check("as parts land, each is ready and the next is being written", st1.post === "ready" && st1.form === "ready" && st1.interview === "writing" && st1.scorecard === "waiting");
  check("the interview waits for its questions and its dimensions", S(["jobPost", "application", "voiceQuestions"]).interview === "writing" && S(["jobPost", "application", "voiceQuestions", "voiceDimensions"]).interview === "ready");
  check("the plan back: all ready; the built-in plan: the writer's four are its first draft", Object.values(S([], "openai")).every((s) => s === "ready") && S(["jobPost"], "template").post === "draft" && S([], "template").skills === "ready");
  check("the wait line comes after 6 s and names the limit; the draft line says why", F.writerWaitLine(5000, 40000) === null && /still writing \(12 s\)\. If it takes more than 40 seconds, I'll use a ready-made first draft/.test(F.writerWaitLine(12400, 40000)) && /took more than 40 seconds/.test(F.draftLine("timeout", 40000)) && /isn't available right now/.test(F.draftLine("unavailable", 40000)));
}

console.warn = realWarn;

// 5. The page.
{
  const page = read("src/pages/AvaCreateJob.tsx");
  const shared = read("src/components/ava/createFlow/shared.tsx");
  check("no timed lines for show: the build screen lists the plan's parts and their states", /parts=\{buildParts\}/.test(page) && /states=\{buildStates\}/.test(page) && !/reasoning=\{playbook\.reasoning\}/.test(page) && !/setTimeout\(tick, 750\)/.test(shared) && /data-build-part=\{part\.id\}/.test(shared));
  check("the build starts once on arriving (never again because an answer changed under it) and leaving stops it", /if \(step === 3\) \{\s*advanceBuildRef\.current = false;\s*void runGenerationRef\.current\(\);\s*\} else \{\s*genRunRef\.current \+= 1;\s*genStopRef\.current\?\.abort\(\);/.test(page) && /\}, \[step\]\);/.test(page));
  check("only the latest build's answer is used", /if \(genRunRef\.current !== run\) return;/.test(page));
  check("the stuck notice waits past the writer's own limit (it came at 25 s, before the 40 s one)", /setBuildStuck\(true\), WRITER_TIME_LIMIT_MS \+ 15000\)/.test(page) && !/setBuildStuck\(true\), 25000\)/.test(page));
  check("a plan that comes while it shows still opens", /step === 3 && buildStuck && flow && !generating && !advanceBuildRef\.current/.test(page));
  check("the review says why when the built-in plan stood in", /genFallback === "timeout" \?/.test(page) && /data-review-first-draft/.test(page));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
