/**
 * Ava's job builder makes chat and message agents only (the owner,
 * 2026-10-29: "it's just chat agents"; docs/CUSTOMER-SERVICE-HIRING.md).
 *
 *   - No talking to Ava to make a job: the builder never mounts TalkToAva or
 *     offers "Talk to Ava instead" (it was the platform's own account's only).
 *     This replaces voice-job-required-fields, which guarded that path.
 *   - The kind of job is never asked: CHAT_AGENT_KIND carries "customer
 *     service" in every brief, whatever an older draft answered, so both plan
 *     builders and generate-flow read customer service.
 *   - "How will they talk to your customers?" offers chat and email only, and
 *     no question mentions calls or a phone system.
 */
export default [
  {
    id: "job-builder-chat-agents-only",
    why:
      "The owner took out making a job by voice and every kind of job but chat and message agents (2026-10-29). The builder " +
      "must not mount TalkToAva, must carry CHAT_AGENT_KIND in its brief instead of asking the kind of job, and must offer " +
      "only chat and email.",
    run: async ({ read }) => {
      const detail = [];
      const strip = (t) => (t ?? "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
      const page = strip(await read("src/pages/AvaCreateJob.tsx"));
      if (/TalkToAva|Talk to Ava|usePlatformAdmin|inputMode|voiceConfirm/.test(page)) detail.push("src/pages/AvaCreateJob.tsx: the builder must not offer or mount talking to Ava");
      if (/jobKindFollowUps|jobFamilyFollowUp|detectFamily/.test(page)) detail.push("src/pages/AvaCreateJob.tsx: the builder must not ask the kind of job (or which is closest)");
      if (!/const playbook = PLAYBOOKS\.customer_service;/.test(page)) detail.push("src/pages/AvaCreateJob.tsx: the builder's questions must be the customer-service playbook's");
      if (!/chipAnswersToBriefAnswers\(\[CHAT_AGENT_KIND, \.\.\.defs\], \{ \.\.\.chipAnswers, \[JOB_KIND_ID\]: 0 \}\)/.test(page)) detail.push("src/pages/AvaCreateJob.tsx: every brief must carry CHAT_AGENT_KIND answered as customer service");
      if ((page.match(/briefAnswers\(/g) ?? []).length < 2) detail.push("src/pages/AvaCreateJob.tsx: both the build and the publish must use briefAnswers");
      const playbook = strip(await read("src/lib/avaEngine/playbook.ts"));
      if (!/export const CHAT_AGENT_KIND: FollowUpDef = \{ id: JOB_KIND_ID, question: "What kind of job is it\?", chips: \[\.\.\.JOB_KIND_CHIPS\], def: 0 \};/.test(playbook)) detail.push("src/lib/avaEngine/playbook.ts: CHAT_AGENT_KIND must answer the kind of job as its first chip");
      if (!/JOB_KIND_CHIPS = \["Answering customers by chat or email",/.test(playbook)) detail.push("src/lib/avaEngine/playbook.ts: the kind of job generate-flow reads must name chat and email only");
      const cs = playbook.slice(playbook.indexOf("customer_service: {"), playbook.indexOf("cash: {"));
      if (!/chips: CHAT_AGENT_CHANNEL_CHIPS\.map\(\(\[label\]\) => label\)/.test(cs) || /Besides calls|A phone system|CS_CHANNEL_CHIPS/.test(cs)) detail.push("src/lib/avaEngine/playbook.ts: the customer-service questions must offer chat and email only, with no call or phone-system wording");
      const engine = strip(await read("src/lib/avaEngine/customerService.ts"));
      const offered = engine.slice(engine.indexOf("export const CHAT_AGENT_CHANNEL_CHIPS"), engine.indexOf("];", engine.indexOf("export const CHAT_AGENT_CHANNEL_CHIPS")));
      if (!offered || /phone|mixed|call/i.test(offered)) detail.push("src/lib/avaEngine/customerService.ts: CHAT_AGENT_CHANNEL_CHIPS must offer no phone channel");
      return { ok: detail.length === 0, detail };
    },
  },
];
