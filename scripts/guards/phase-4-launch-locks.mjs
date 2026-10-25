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
      "HireFlow's niche is hiring customer service agents, chat and phone, for any business (CLAUDE.md, Positioning). " +
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
      if (!/\{ pack: cfg\.pack \}/.test(jobFromFlow)) detail.push("jobFromFlow.ts: the chat step no longer carries its pack");
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
];
