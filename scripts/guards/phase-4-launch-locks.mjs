/**
 * Phase 4 of docs/LAUNCH-PLAN.md, locked (2026-10-25): Ava for
 * customer-service hiring (docs/CUSTOMER-SERVICE-HIRING.md).
 *
 *   - scenario-packs-client-server-identical: the packs the job builder puts
 *     into a job and the packs the server grades with are one text.
 *   - customer-service-family-exists: the family is detected first, asks its
 *     follow-ups, and both plan generators put the pack into the plan; Publish
 *     saves the questions with their answers and the chat step with its pack;
 *     the server grades with the pack it knows.
 *   - no-gaming-nouns-in-generic-packs: only the gaming pack says player or
 *     game; no pack sells sweepstakes, casinos or cash-outs.
 *   - chat-typing-only-where-it-is-the-jobs-measure: the chat practice's
 *     typing is measured against the job's bar only on a job that is not
 *     on-site and has no typing step, everywhere it is read: Ava's score, the
 *     record and the list, Analytics, and the interview guide's material (the
 *     sixth product review: Analytics and the guide still read an on-site
 *     job's phone typing).
 */

const CLIENT = "src/content/scenarioPacks/packs.ts";
const SERVER = "supabase/functions/_shared/scenarioPacks.ts";

/** The SCENARIO_PACKS object literal as data (it is written as JSON). */
function packsFrom(text) {
  const start = text.indexOf("export const SCENARIO_PACKS: Record<ScenarioPackId, ScenarioPack> = ");
  if (start < 0) return null;
  const open = text.indexOf("{", start);
  const end = text.indexOf("\n};\n", open);
  if (open < 0 || end < 0) return null;
  try {
    return JSON.parse(text.slice(open, end + 2));
  } catch {
    return null;
  }
}

export default [
  {
    id: "scenario-packs-client-server-identical",
    why:
      "The job builder copies a pack's questions and cases into a new job (src/content/scenarioPacks/packs.ts); the " +
      "server grades the chat with that pack's word for the other person and its note (supabase/functions/_shared/" +
      "scenarioPacks.ts), read by the step's pack id, never from the step's text. Two copies that drift would grade " +
      "a chat against a note its cases were not written for. They must be the same file, byte for byte.",
    run: async ({ read }) => {
      const client = await read(CLIENT);
      const server = await read(SERVER);
      if (client == null || server == null) return { ok: false, detail: [`${client == null ? CLIENT : SERVER} is missing`] };
      if (client !== server) return { ok: false, detail: [`${CLIENT} and ${SERVER} differ: copy one over the other`] };
      if (/^\s*import\s/m.test(client)) return { ok: false, detail: [`${CLIENT}: no imports, so one text runs in the browser and in Deno`] };
      return { ok: true };
    },
  },
  {
    id: "customer-service-family-exists",
    why:
      "HireFlow's niche is hiring customer service agents, chat and email, for any business (CLAUDE.md, Positioning). " +
      "A brief that says so must get the customer_service family (checked before every other), its follow-ups, its " +
      "industry pack's keyed skills check and chat cases in BOTH plan generators, saved by Publish with the answers " +
      "(moved to the server by strip_quiz_answer_keys) and the step's pack, and graded by the server with the pack it knows.",
    run: async ({ read }) => {
      const detail = [];
      const playbook = (await read("src/lib/avaEngine/playbook.ts")) ?? "";
      const body = /export function detectFamily\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(playbook)?.[1] ?? "";
      const firstReturn = /return "(\w+)";/.exec(body)?.[1];
      if (firstReturn !== "customer_service") detail.push(`playbook.ts: detectFamily must check customer service first (first return is "${firstReturn}")`);
      if (!/\n  customer_service: \{\n    label: "customer service",/.test(playbook)) detail.push("playbook.ts: PLAYBOOKS has no customer_service entry");
      for (const id of ["cs-channel", "cs-industry", "cs-load", "cs-hours", "cs-sensitive", "cs-tools"]) {
        if (!playbook.includes(`id: "${id}"`)) detail.push(`playbook.ts: the ${id} follow-up is gone`);
      }
      for (const file of ["src/lib/avaEngine/templateGenerator.ts", "src/lib/avaEngine/flowGenerator.ts"]) {
        const src = (await read(file)) ?? "";
        if (!/detectFamily\([^)]*\) === "customer_service" \? applyCustomerServicePack\(/.test(src)) detail.push(`${file}: does not put the industry pack into a customer-service plan`);
      }
      const jobFromFlow = (await read("src/lib/jobFromFlow.ts")) ?? "";
      if (!/type: "multiple_choice",[\s\S]{0,120}correct_answer: it\.correctAnswer/.test(jobFromFlow)) detail.push("jobFromFlow.ts: a pack question is no longer saved as multiple choice with its answer");
      if (!/\{ pack: cfg\.pack[ ,]/.test(jobFromFlow) || !/channel: cfg\.channel/.test(jobFromFlow)) detail.push("jobFromFlow.ts: the chat step no longer carries its pack and channel");
      const prompts = (await read("supabase/functions/ai-chat-simulation/prompts.ts")) ?? "";
      if (!/What the \(\?:team leader\|agent\) knows/.test(prompts)) detail.push("prompts.ts: splitBrief no longer reads \"What the agent knows\"");
      const fn = (await read("supabase/functions/ai-chat-simulation/index.ts")) ?? "";
      if (!/scenarioPack\(practiceJob\.step\?\.pack\)/.test(fn)) detail.push("ai-chat-simulation: does not grade with the step's pack");
      const labels = (await read("supabase/functions/_shared/reviewText.ts")) ?? "";
      const packs = packsFrom((await read(CLIENT)) ?? "") ?? {};
      for (const pack of Object.values(packs)) {
        const label = String(pack.counterpart ?? "").toUpperCase();
        if (label && !new RegExp(`\\b${label}\\b`).test(/const SPEAKER_LABEL = ([^\n]*)/.exec(labels)?.[1] ?? "")) {
          detail.push(`reviewText.ts: SPEAKER_LABEL does not neutralise ${label}, the ${pack.id} pack's label (an applicant could forge that side's line)`);
        }
      }
      if (!Object.keys(packs).length) detail.push(`${CLIENT}: SCENARIO_PACKS cannot be read`);
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "no-gaming-nouns-in-generic-packs",
    why:
      "\"player\" is a gaming word (the owner's own business, and the gaming pack). A dental office's or an online " +
      "store's applicants must never read it, and no pack may sell sweepstakes, casinos, gambling or cash-outs " +
      "(the owner: no sweepstakes pitch).",
    run: async ({ read }) => {
      const detail = [];
      const packs = packsFrom((await read(CLIENT)) ?? "");
      if (!packs) return { ok: false, detail: [`${CLIENT}: SCENARIO_PACKS cannot be read`] };
      for (const [id, pack] of Object.entries(packs)) {
        const text = JSON.stringify(pack);
        if (/sweepstake|casino|gambl|cash-?outs?\b|winnings/i.test(text)) detail.push(`${id}: sweepstakes, casino, gambling or cash-out wording`);
        if (id !== "gaming" && /\bplayers?\b|\bgames?\b|\bgaming\b|in-game/i.test(text)) detail.push(`${id}: says ${/\bplayers?\b|\bgames?\b|\bgaming\b|in-game/i.exec(text)[0]} (only the gaming pack may)`);
        if (id !== "gaming" && pack.counterpart === "player") detail.push(`${id}: its counterpart is "player"`);
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "chat-typing-only-where-it-is-the-jobs-measure",
    why:
      "An on-site job's chat practice may be taken on a phone (nothing of it is computer-only), and a phone's typing " +
      "read against a computer keyboard's bar fails the applicant for the phone; a job that still has a typing step " +
      "reads typing from that test. So the chat's typing is no measure on either, everywhere: Ava's score " +
      "(chatTypingThisJob, chatTypingForJob), the record and the list (chatTypingOf's jobMeasure), Analytics' " +
      "typing and reply-time meters, and what the interview guide's writer is given (the sixth product review: " +
      "Analytics showed the dental office's receptionists '0 of 3 reached it' in the warning colour).",
    run: async ({ read, walk }) => {
      const detail = [];
      const noComments = (t) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      // Ava's score: one reading of the chat's typing, null on an on-site job.
      const scorer = noComments((await read("supabase/functions/trigger-ava-analysis/index.ts")) ?? "");
      if (!/const chatTypingThisJob = job\?\.is_remote === false \? null : \(chatSimulation\?\.typing \?\? null\);/.test(scorer)) detail.push("trigger-ava-analysis: chatTypingThisJob must be null on an on-site job (job.is_remote === false)");
      if (!/const chatTypingInUse = chatTypingForJob\(workflowSteps, chatTypingThisJob\);/.test(scorer)) detail.push("trigger-ava-analysis: chatTypingInUse must come from chatTypingThisJob through chatTypingForJob (no chat typing on a job with a typing step)");
      if ((scorer.match(/chatSimulation\??\.typing\b/g) ?? []).length !== 1) detail.push("trigger-ava-analysis: the chat's typing is read somewhere other than chatTypingThisJob");
      // The staff screens: every reading says whether it is the job's measure
      // (chatTypingOf's second argument; left out, it reads as the measure).
      for (const rel of await walk("src", [".ts", ".tsx"])) {
        if (rel.startsWith("src/dev-preview/")) continue;
        const text = noComments((await read(rel)) ?? "");
        for (const m of text.matchAll(/\bchatTypingOf\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
          if (/^value: unknown, jobMeasure/.test(m[1])) continue; // the definition
          if (!/,/.test(m[1])) detail.push(`${rel}: chatTypingOf(${m[1]}) does not say whether the chat's typing is the job's measure`);
        }
      }
      const record = noComments((await read("src/cockpit/lib/assessmentRecord.ts")) ?? "");
      if (!/const onSite = \(ctx\.app\.jobs as \{ is_remote\?: unknown \} \| null \| undefined\)\?\.is_remote === false;/.test(record) || !/chatTypingOf\(r\?\.typing, !jobHasTypingStep && !onSite\)/.test(record)) detail.push("assessmentRecord.ts: the chat practice's typing must be the job's measure only with no typing step and not on-site");
      const view = noComments((await read("src/cockpit/lib/analyticsView.ts")) ?? "");
      if (!/const chatTypingCounts = !jobHasTypingStep && input\.onSite !== true;/.test(view) || !/chatTypingOf\(sim\.typing, chatTypingCounts\)/.test(view) || !/if \(typing\?\.jobMeasure\) \{/.test(view)) detail.push("analyticsView.ts: the typing and reply-time meters must count only a job with no typing step that is not on-site");
      const page = noComments((await read("src/cockpit/pages/Analytics.tsx")) ?? "");
      if (!/onSite: job \? job\.is_remote === false : null,/.test(page)) detail.push("Analytics.tsx: the page must say whether the job is on-site (onSite from job.is_remote)");
      const guide = noComments((await read("supabase/functions/interview-guide/guideMaterial.ts")) ?? "");
      const guideFn = noComments((await read("supabase/functions/interview-guide/index.ts")) ?? "");
      if (!/const typing = chatTypingIsTheJobsMeasure\(record\) \? asRecord\(chat\.typing\) : null;/.test(guide) || (guide.match(/chat\.typing\b/g) ?? []).length !== 1 || !/return record\.onSite !== true && record\.typingStep !== true;/.test(guide)) detail.push("interview-guide/guideMaterial.ts: the writer must be given the chat's typing only where it is the job's measure");
      if (!/onSite: \(jobRow as \{ is_remote\?: unknown \}\)\.is_remote === false,/.test(guideFn) || !/typingStep: jobHasTypingStep\(/.test(guideFn) || !/\bis_remote\b/.test(/const JOB_COLUMNS =\s*"([^"]*)"/.exec(guideFn)?.[1] ?? "")) detail.push("interview-guide/index.ts: the guide's record must say whether the job is on-site and has a typing step (is_remote in JOB_COLUMNS)");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
];
