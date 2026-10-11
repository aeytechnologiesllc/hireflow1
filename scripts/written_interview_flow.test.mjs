#!/usr/bin/env node
/**
 * Every new job's interview step is a WRITTEN interview (2026-10-11).
 *
 * Voice interviews are off for every business (AvaCreateJob's
 * hasVoiceInterviews is false), so the create flow saves the plan's interview
 * as a typed chat_interview step. But both plan generators titled it "Answer a
 * few questions out loud", jobFromFlow.ts saved that title onto the typed
 * step, and the applicant read it in their journey (titleFor in
 * candidateJourney.ts shows a stored title as it is). The owner's review card
 * said "VOICE INTERVIEW", and the playbook and the generate-flow prompt
 * promised a voice interview too.
 *
 * This runs the real code, not a copy of it:
 *   - the template plan (generateTemplateFlow) for every rigor and role family;
 *   - the AI plan (generateJobFlow) with the edge function answered by a
 *     stand-in, and with it failing (the template fallback);
 *   - createJobFromFlow, the function the Publish button calls, against a
 *     stand-in database, reading the workflow_steps it writes to `jobs`;
 *   - a plan saved in this browser before the change (old voice title), which
 *     must still be saved as a written interview.
 * Plus the words around it: the review card, the playbook, the prompt.
 *
 * Run with: node scripts/written_interview_flow.test.mjs
 */
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");

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

/* ── The real modules, bundled with the database and the geocoder stood in ── */

const STUBS = {
  "@/integrations/supabase/client": "export const supabase = new Proxy({}, { get: (_t, key) => globalThis.__fakeSupabase[key] });",
  // No network: a place the geocoder "misses", so the text fallback is used.
  "@/lib/geocode": "export async function geocodePlace() { return { ok: false }; } export function formatPlace() { return ''; }",
};
const bundle = await build({
  stdin: {
    contents:
      'export { generateTemplateFlow } from "./src/lib/avaEngine/templateGenerator.ts";\n' +
      'export { generateJobFlow } from "./src/lib/avaEngine/flowGenerator.ts";\n' +
      'export { PLAYBOOKS, briefFromForm } from "./src/lib/avaEngine/playbook.ts";\n' +
      'export { WRITTEN_INTERVIEW_TITLE, WRITTEN_INTERVIEW_DESCRIPTION } from "./src/lib/avaEngine/assemble.ts";\n' +
      'export { buildWorkflowSteps, createJobFromFlow } from "./src/lib/jobFromFlow.ts";\n' +
      'export { titleFor } from "./src/lib/candidateJourney.ts";\n' +
      'export { glyphForKind } from "./src/components/glyphForKind.ts";\n',
    resolveDir: ROOT,
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"production"',
    "import.meta.env": JSON.stringify({ VITE_SUPABASE_URL: "https://stand-in.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "public-key", DEV: false }),
  },
  logLevel: "silent",
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
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

globalThis.window = globalThis;
// Words an applicant must never read on a step where they type.
const SPOKEN = /out loud|spoken|speak|voice|record|call\b/i;
// …and words that give the machine away (candidateJourney.ts MACHINE_WORDS).
const MACHINE = /\b(ava|a\.?i\.?|artificial intelligence|bot|automated|algorithm)\b/i;

/** A stand-in for the parts of the Supabase client this path touches. */
function fakeSupabase() {
  const inserted = [];
  const chain = (result) => {
    const c = {
      select: () => c,
      eq: () => c,
      in: () => c,
      update: () => c,
      maybeSingle: async () => result,
      single: async () => result,
      then: (resolve) => resolve(result),
    };
    return c;
  };
  return {
    inserted,
    auth: {
      getUser: async () => ({ data: { user: { id: "owner-1" } }, error: null }),
      getSession: async () => ({ data: { session: { access_token: "signed-in" } } }),
    },
    from: (table) => {
      if (table === "team_members") return chain({ data: null, error: null });
      if (table === "jobs") {
        return {
          insert: (row) => {
            inserted.push(row);
            return chain({ data: { id: "job-1", job_code: "ABC123" }, error: null });
          },
          update: () => chain({ data: null, error: null }),
        };
      }
      return chain({ data: null, error: null });
    },
  };
}

const FORM = {
  onsite: { role: "Store Manager", location: "Springfield, IL", type: "Full-time · On-site", pay: "$22/hr", start: "ASAP", work: "Run the till and lead the team" },
  remote: { role: "Chat Support Agent", location: "Remote (worldwide)", type: "Full-time", workMode: "Remote", pay: "$6/hr", start: "Within a few weeks", work: "Answer players in live chat" },
  developer: { role: "Frontend Developer", location: "Remote (worldwide)", type: "Contract", workMode: "Remote", pay: "$40/hr", start: "Flexible", work: "Build React screens for our app" },
};

function interviewPhase(flow) {
  return flow.phases.find((p) => p.kind === "voice_interview");
}

/* ── 1. The template plan: every rigor, every kind of role ─────────────── */
console.log("-- the template plan (the fallback every business can get) --");
for (const [label, form] of Object.entries(FORM)) {
  for (const rigor of ["easy", "standard", "high"]) {
    const brief = M.briefFromForm(form);
    const { flow } = M.generateTemplateFlow({ brief, rigor });
    const phase = interviewPhase(flow);
    check(`${label} / ${rigor}: the interview step is titled "Written interview"`, phase?.title === "Written interview", phase?.title);
    check(
      `${label} / ${rigor}: its description never asks them to speak, and never names the machine`,
      !!phase && !SPOKEN.test(phase.candidateDescription) && !MACHINE.test(phase.candidateDescription),
      phase?.candidateDescription,
    );
    check(`${label} / ${rigor}: the employer's note does not promise a voice interview`, !!phase && !/voice|spoken|out loud/i.test(phase.rationale), phase?.rationale);
  }
}

/* ── 2. The AI plan, and its fallback ──────────────────────────────────── */
console.log("\n-- the AI plan (generate-flow), answered by a stand-in --");
{
  globalThis.__fakeSupabase = fakeSupabase();
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        jobPost: { title: "Chat Support Agent", summary: "Help players in live chat.", responsibilities: ["Reply fast"], requirements: ["Clear writing"], niceToHaves: [] },
        application: ["Which hours can you work?", "Why this role?", "Your chat experience?"],
        quiz: [{ scenario: "A player is angry about a payout.", good: "Calm, clear, owns the next step." }],
        simulation: [{ title: "Angry player", prompt: "A player says the game cheated them." }],
        voiceQuestions: ["Tell me about a hard chat you turned around.", "How do you keep up with many chats at once?"],
        voiceDimensions: ["Clarity", "Empathy", "Ownership"],
        shortlistWeights: ["Writing", "Judgment", "Speed", "Reliability", "Fit"],
        phaseRationales: ["Quick filter.", "Judgment under pressure.", "A real moment.", "Their own words.", "Ranking."],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  const brief = M.briefFromForm(FORM.remote);
  const { flow, source } = await M.generateJobFlow({ brief, rigor: "standard" });
  check("the stand-in answered (not the fallback)", source === "openai", source);
  const phase = interviewPhase(flow);
  check('the AI plan\'s interview step is titled "Written interview"', phase?.title === "Written interview", phase?.title);
  check("its description is the written one", phase?.candidateDescription === M.WRITTEN_INTERVIEW_DESCRIPTION, phase?.candidateDescription);
  check("its scoring guidance reads written answers, not spoken ones", !!phase && phase.rubric.criteria.every((c) => !/spoken|transcript/i.test(c.guidance)), JSON.stringify(phase?.rubric.criteria.map((c) => c.guidance)));

  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  // generateJobFlow says it fell back (console.warn, with the whole stack): expected here.
  const warn = console.warn;
  console.warn = () => {};
  const fallback = await M.generateJobFlow({ brief, rigor: "high" }).finally(() => {
    console.warn = warn;
  });
  check("with generate-flow down, the fallback plan is written too", fallback.source === "template" && interviewPhase(fallback.flow)?.title === "Written interview");
}

/* ── 3. What Publish writes to `jobs` ──────────────────────────────────── */
console.log("\n-- createJobFromFlow: the row the Publish button writes --");
for (const [label, form] of Object.entries(FORM)) {
  const fake = fakeSupabase();
  globalThis.__fakeSupabase = fake;
  const brief = M.briefFromForm(form);
  const { flow } = M.generateTemplateFlow({ brief, rigor: "standard" });
  // AvaCreateJob passes hasVoiceInterviews, which is false for every business.
  const created = await M.createJobFromFlow(flow, brief, { status: "published", voiceInterview: false });
  const row = fake.inserted[0];
  const steps = Array.isArray(row?.workflow_steps) ? row.workflow_steps : [];
  const interview = steps.find((s) => s.type === "chat_interview");
  check(`${label}: the job was written`, created?.id === "job-1" && !!row);
  check(`${label}: the interview is saved as a typed chat_interview step`, !!interview && !steps.some((s) => s.type === "voice_interview"), JSON.stringify(steps.map((s) => s.type)));
  check(`${label}: saved as "Written interview"`, interview?.title === "Written interview", interview?.title);
  check(`${label}: its saved description never asks them to speak`, !!interview && !SPOKEN.test(interview.description), interview?.description);
  check(`${label}: the applicant's journey shows "Written interview"`, M.titleFor("chat_interview", interview?.title) === "Written interview");
}

/* ── 4. A plan saved before the change ─────────────────────────────────── */
console.log("\n-- a plan saved in this browser before 2026-10-11 --");
{
  const brief = M.briefFromForm(FORM.onsite);
  const { flow } = M.generateTemplateFlow({ brief, rigor: "standard" });
  const old = flow.phases.map((p) =>
    p.kind === "voice_interview"
      ? { ...p, title: "Answer a few questions out loud", candidateDescription: "A short, friendly set of questions you answer out loud about your experience and approach." }
      : p,
  );
  const steps = M.buildWorkflowSteps(old, false);
  const interview = steps.find((s) => s.type === "chat_interview");
  check('its old spoken title is saved as "Written interview"', interview?.title === "Written interview", interview?.title);
  check("…and its old spoken description as the written one", interview?.description === M.WRITTEN_INTERVIEW_DESCRIPTION, interview?.description);
  const renamed = M.buildWorkflowSteps(flow.phases.map((p) => (p.kind === "voice_interview" ? { ...p, title: "A few questions about you" } : p)), false);
  check("a title the owner wrote on the card is kept", renamed.find((s) => s.type === "chat_interview")?.title === "A few questions about you");
}

/* ── 5. The words around it ────────────────────────────────────────────── */
console.log("\n-- the review card, the playbook and the prompt --");
{
  const ava = await read("src/pages/AvaCreateJob.tsx");
  check("the review card's kind line says written interview", /voice_interview:\s*"written interview"/.test(ava) && /kind: KIND_LABEL\[p\.kind\] \?\? p\.kind\.replace/.test(ava));
  check("…with a chat icon, not a mic", /voice_interview:\s*\{\s*icon:\s*MessageSquareText/.test(ava) && !/voice_interview:\s*\{\s*icon:\s*Mic\b/.test(ava));
  check("new jobs are published with voice off", /const hasVoiceInterviews = false;/.test(ava) && /createJobFromFlow\(edited, brief, \{ status: "published", voiceInterview: hasVoiceInterviews \}\)/.test(ava));
  check("the card's mark is the chat one (the same as a chat_interview step's)", M.glyphForKind("written interview") === M.glyphForKind("chat_interview") && M.glyphForKind("written interview") !== M.glyphForKind("voice interview"));

  for (const [family, book] of Object.entries(M.PLAYBOOKS)) {
    check(`playbook (${family}): its reason never promises a voice interview`, !/voice|spoken|out loud/i.test(book.rigor.rationale), book.rigor.rationale);
  }

  const prompt = await read("supabase/functions/generate-flow/index.ts");
  check("generate-flow asks for written interview questions", /written interview questions/.test(prompt) && /WRITTEN interview the candidate answers by typing/.test(prompt));
  check("…and never for spoken ones", !/spoken questions|answer out loud|Voice interview questions/.test(prompt));
}

console.log(`\nwritten interview flow: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
