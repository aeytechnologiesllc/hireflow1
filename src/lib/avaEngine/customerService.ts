/**
 * Customer-service hiring (docs/CUSTOMER-SERVICE-HIRING.md; docs/LAUNCH-PLAN.md,
 * Phase 4): which industry pack and channel a brief points to, and the pack
 * applied to a built plan.
 *
 * The plan a customer-service job gets: the application, a five-question
 * skills check with right answers (the pack's), the computer and connection
 * check for a remote role, one customer chat (one of the pack's six cases,
 * picked per applicant by the server), and the written interview. Both
 * generators run their plan through applyCustomerServicePack, so the AI and
 * the built-in plan can never ask a business's applicants different things
 * for the same job.
 */
// Relative, with the extension, so plain Node (scripts/job_benefits_mapping.test.mjs) can load playbook.ts too.
import { SCENARIO_PACKS, type ScenarioPack, type ScenarioPackId } from "../../content/scenarioPacks/packs.ts";
import type { JobBrief, QuizConfig, ScreeningPhase, SimulationConfig, VoiceConfig } from "./types";
import { bankForFamily } from "./questionBanks.ts";

/** The "What kind of business is it?" chips, in order, and the pack each picks. */
export const CS_INDUSTRY_CHIPS: ReadonlyArray<readonly [string, ScenarioPackId]> = [
  ["Medical or dental office", "medical"],
  ["Online store", "store"],
  ["Software or app", "software"],
  ["Home services", "home_services"],
  ["Gaming", "gaming"],
  ["Something else", "general"],
];

/** The "How will they talk to your customers?" chips, in order. */
export const CS_CHANNEL_CHIPS = ["Chat", "Phone", "Email", "A mix of these"] as const;
export type CsChannel = "chat" | "phone" | "email" | "mixed";
const CHANNELS: readonly CsChannel[] = ["chat", "phone", "email", "mixed"];

/** The industry the business's own words point to, before they answer the chip. */
export function industryFromText(text: string): ScenarioPackId {
  const s = text.toLowerCase();
  if (/\b(dental|dentist|orthodont|clinic|medical|doctor|patients?|health ?care|hospital|physio|chiropract|optometr|pharmac|therap)/.test(s)) return "medical";
  if (/\b(shopify|online (store|shop)|e-?commerce|web ?shop|etsy|amazon seller|orders? (status|tracking)|returns? and refunds?)/.test(s)) return "store";
  if (/\b(software|saas|apps?\b|subscriptions?|platform|log ?in|technical support|tech support|it support|help ?desk)/.test(s)) return "software";
  if (/\b(plumb|electric|hvac|cleaning (company|service|business)|pest|repairs?\b|handyman|roof|landscap|movers|moving company|locksmith|home services?)/.test(s)) return "home_services";
  // A game company says so: not "team player" or "bring your A game" (the Phase 4 review).
  if (/\b(game (studio|company|developer|publisher|app)|gaming (company|studio|platform)|video games?|mobile games?|online games?|our games?\b|in-game|esports|player support)/.test(s)) return "gaming";
  return "general";
}

function answerTo(brief: Pick<JobBrief, "followUps">, questionId: string): string | null {
  return brief.followUps?.find((f) => f.questionId === questionId)?.answer ?? null;
}

/** The pack for this brief: the business's answer to "What kind of business is it?", else its own words. */
export function packIdForBrief(brief: Pick<JobBrief, "followUps" | "roleTitle" | "whatTheyDo">): ScenarioPackId {
  const chosen = answerTo(brief, "cs-industry");
  const byChip = CS_INDUSTRY_CHIPS.find(([label]) => label === chosen)?.[1];
  return byChip ?? industryFromText(`${brief.roleTitle ?? ""} ${brief.whatTheyDo ?? ""}`);
}

/** How they will talk to customers: the business's answer, else its own words, else chat. */
export function channelForBrief(brief: Pick<JobBrief, "followUps" | "roleTitle" | "whatTheyDo">): CsChannel {
  const chosen = answerTo(brief, "cs-channel");
  const index = CS_CHANNEL_CHIPS.findIndex((label) => label === chosen);
  if (index >= 0) return CHANNELS[index];
  const title = (brief.roleTitle ?? "").toLowerCase();
  const work = (brief.whatTheyDo ?? "").toLowerCase();
  const s = `${title} ${work}`;
  // "Voice and non-voice": both.
  if (/\bvoice\s*(and|&|\/|or)\s*non[- ]?\s?voice\b|\bnon[- ]?\s?voice\s*(and|&|\/|or)\s*voice\b/.test(s)) return "mixed";
  // Phones ruled out: "non-voice", "chat only", "no phone calls", "without
  // calls", "phone calls are not required", "we don't do phone support",
  // "phone support is handled by another team" (the Phase 4 reviews).
  const noPhone = /\b(non[- ]?\s?voice|chat only|email only|written only|no (phones?|calls?|voice)|without (phone )?calls|never on the phone|not (on the )?phones?|phone calls? (are|is) not (required|needed|part)|(don'?t|do not|doesn'?t|does not|won'?t|will not) (do |offer |handle |take |answer )?(any )?(phones?|calls?|voice)( support)?)\b|\b(phones?|calls?|voice)( support)?\b[^.]{0,30}\b(handled by|another team|elsewhere|someone else|separate team)\b/;
  // Written channels ruled out: "no chats or emails".
  const noWritten = /\bno (chats?|e-?mails?|messages?)( or (chats?|e-?mails?|messages?))?\b|\b(chats?|e-?mails?)( support)?\b[^.]{0,30}\b(handled by|another team|elsewhere|someone else|separate team)\b/;
  // A list of channels with phones in it ("phone, email and chat", "calls and
  // emails", "SMS and phone"); not what customers own or are billed for
  // ("their phone and email accounts", "calls and texts on their plan").
  const LIST = String.raw`(\s*(,|&|\band\b|\/|\+|\bor\b)\s*(and\s+)?)`;
  const WRITTEN = String.raw`(live chats?|chats?|e-?mails?|texts?|sms|messages?)`;
  const PHONE = String.raw`(phones?|calls?|voice)`;
  const list = new RegExp(
    String.raw`\b(${PHONE}(${LIST}${WRITTEN})+|${WRITTEN}(${LIST}(${WRITTEN}|${PHONE}))*${LIST}${PHONE})\b(?!\s+(accounts?|numbers?|settings|plans?|apps?|devices?|bills?|lines?|on (their|your|the|our) (plan|bill|account|phone)))`,
  );
  const phoneWords = /\b(phone (support|agent|rep|csr|calls?)|voice (agent|csr|support|account)|(customer|client|patient|inbound|outbound|incoming) calls?|calls? (from|with) (our |the )?(customers|clients|patients)|call cent(er|re)|answer(ing)? (the )?phones?|(on|at|over) the phones?|(by|via|over) (tele)?phone|on the phone|telephone|\d+\+? calls|bpo)\b/;
  // Texts count as chat when they are the channel ("by text", "SMS support"), not a topic ("texts on their plan").
  const writtenIn = (text: string) => ({
    chat: /\b(chats?|live chat|messages|messaging|messenger|whatsapp)\b|\b(by|via|over) (text|sms)\b|\b(text|sms) (support|messages? from)\b/.test(text),
    email: /\b(e-?mails?)\b/.test(text),
  });
  const writtenChannel = (text: string): CsChannel => (writtenIn(text).email && !writtenIn(text).chat ? "email" : "chat");

  // The title's own channel, read from its role phrase: a channel word right
  // before a role noun ("Chat Agent", "Phone Support", "Email CSR"). A product
  // or business word is not ("Phone Repair Store Chat Agent" is a chat job,
  // "Call Center Software Support" answers by email; the fourth and fifth
  // Phase 4 reviews).
  const ROLE = String.raw`(support|agent|rep|representative|csr|specialist|associate|operator|officer|advisor|moderator|executive|team|account)s?`;
  const titleWritten = new RegExp(String.raw`\b(chat|live chat|e-?mail|text|sms|ticket|written|non[- ]?\s?voice)[- ]${ROLE}\b|\bnon[- ]?\s?voice\b|\b${ROLE}\s*[(\-–—]\s*(chat|e-?mail|non[- ]?\s?voice)\b`).test(title);
  const titlePhone = new RegExp(String.raw`\b(phone|voice|telephone|calls?|inbound)[- ]${ROLE}\b|\bcall cent(er|re) (agent|rep|representative|csr|specialist|associate|operator|advisor)s?\b|\b${ROLE}\s*[(\-–—]\s*(phone|voice)\b`).test(title.replace(/\bnon[- ]?\s?voice\b/g, " "));
  // "Phone & Email Support Rep", "Phone and Chat Support Agent": both, in the title.
  if ((titleWritten && titlePhone) || list.test(title)) return "mixed";
  if (titleWritten) return list.test(work) && !noPhone.test(s) ? "mixed" : writtenChannel(`${title} ${work}`);
  if (titlePhone) {
    const written = (writtenIn(work).chat || writtenIn(work).email) && !noWritten.test(work);
    return (list.test(s) || written) && !noPhone.test(s) && !noWritten.test(work) ? "mixed" : "phone";
  }

  // The title says nothing about the channel (a bare "CSR" included): the
  // description does. A bare "CSR" with no channel in its words reads as
  // phone (the Philippine meaning); with words, the words decide.
  if (noPhone.test(s)) return writtenChannel(s);
  if (list.test(s) && !noWritten.test(work)) return "mixed";
  // Phone words in the description (a title's "call center" names the business, not the channel).
  const phone = phoneWords.test(work);
  const { chat, email } = writtenIn(s);
  const written = (chat || email) && !noWritten.test(work);
  if (phone && written) return "mixed";
  if (phone) return "phone";
  if (/\bcsr\b/.test(title) && !written) return "phone";
  if (email && !chat) return "email";
  return "chat";
}

export function packForBrief(brief: Pick<JobBrief, "followUps" | "roleTitle" | "whatTheyDo">): ScenarioPack {
  return SCENARIO_PACKS[packIdForBrief(brief)];
}

export const CS_SKILLS_TITLE = "Skills check";
export const CS_SKILLS_DESCRIPTION = "Five short questions about real situations in this work.";
export const CS_CHAT_TITLE = "Customer chat practice";
export const CS_CHAT_DESCRIPTION = "Answer one realistic customer chat, the way you would on the job.";

/**
 * The plan with the pack in it: the skills check becomes the pack's five
 * questions (with their right answers, which the jobs table moves to the
 * server on save), and the chat practice serves the pack's six cases, tagged
 * with the pack so the server grades with its word for the other person and
 * its note on what good looks like. A plan without a chat practice gets one,
 * after the connection check and before the interview. Words shown to
 * applicants never name Ava or say AI.
 */
export function applyCustomerServicePack(phases: ScreeningPhase[], brief: JobBrief): ScreeningPhase[] {
  const pack = packForBrief(brief);
  const channel = channelForBrief(brief);
  const out = phases.map((p) => ({ ...p }));

  const quizIndex = out.findIndex((p) => p.kind === "quiz");
  const quizSeconds = pack.skills.reduce((sum, q) => sum + q.time_limit_seconds, 0);
  const quiz: ScreeningPhase = {
    ...(quizIndex >= 0 ? out[quizIndex] : { id: "ph_quiz", order: 1, weight: 0.25, scoringMode: "auto" as const }),
    kind: "quiz",
    title: CS_SKILLS_TITLE,
    candidateDescription: CS_SKILLS_DESCRIPTION,
    rationale: `Five situations from ${pack.business}, each with one right answer, written so a careful second-language reader can answer in time.`,
    config: {
      kind: "quiz",
      timeLimitSec: quizSeconds,
      items: pack.skills.map((q) => ({
        id: q.id,
        scenario: q.question,
        options: [...q.options],
        correctAnswer: q.correct_answer,
        category: q.category,
        timeLimitSec: q.time_limit_seconds,
      })),
    } satisfies QuizConfig,
    rubric: {
      criteria: pack.skills.map((q) => ({
        id: q.id,
        label: q.category.replace(/_/g, " "),
        guidance: "One right answer, marked on the server.",
        weightWithinPhase: 1 / pack.skills.length,
      })),
    },
    countLabel: `${pack.skills.length} questions`,
    durationLabel: `${Math.max(1, Math.round(quizSeconds / 60))} min`,
  };
  if (quizIndex >= 0) out[quizIndex] = quiz;
  else out.splice(Math.min(1, out.length), 0, quiz);

  const chat: ScreeningPhase = {
    id: "ph_sim",
    kind: "simulation",
    order: 0,
    title: CS_CHAT_TITLE,
    candidateDescription: CS_CHAT_DESCRIPTION,
    rationale:
      channel === "phone" || channel === "mixed"
        ? `One real ${pack.counterpart} conversation from ${pack.business}, typed, with typing speed measured as they reply. A practice call is coming; until then the written interview asks how they handle calls.`
        : `One real ${pack.counterpart} chat from ${pack.business}, with typing speed and reply time measured as they write.`,
    config: {
      kind: "simulation",
      pack: pack.id,
      counterpart: pack.counterpart,
      channel,
      scenarios: pack.cases.map((c) => ({ id: c.id, title: "", prompt: c.scenario, customerName: c.customerName })),
    } satisfies SimulationConfig,
    rubric: {
      criteria: [
        { id: "sim_handling", label: "Handling the chat", guidance: pack.evaluatorNote, weightWithinPhase: 1 },
      ],
    },
    weight: 0.2,
    scoringMode: "auto",
    countLabel: "1 chat",
    durationLabel: "~8 min",
  };
  const simIndex = out.findIndex((p) => p.kind === "simulation");
  if (simIndex >= 0) out[simIndex] = { ...chat, id: out[simIndex].id };
  else {
    const interview = out.findIndex((p) => p.kind === "voice_interview");
    out.splice(interview >= 0 ? interview : out.length, 0, chat);
  }

  // The written interview: never empty (a model that returned no questions
  // gets the customer-service bank's), and a phone job's always starts with
  // the two questions about calls, in place of its last two, until the
  // practice call exists.
  const interviewIndex = out.findIndex((p) => p.kind === "voice_interview");
  if (interviewIndex >= 0) {
    const interview = out[interviewIndex];
    const cfg = interview.config as VoiceConfig;
    let questions = (cfg.questions ?? []).filter((q) => q && typeof q.prompt === "string" && q.prompt.trim() && !/^vphone\d$/.test(q.id));
    if (questions.length === 0) {
      questions = bankForFamily("customer_service").interview.slice(0, 6).map((prompt, i) => ({ id: `v${i}`, prompt }));
    }
    if (channel === "phone" || channel === "mixed") {
      // Each call question unless one of the model's own already asks the
      // same thing ABOUT A CALL (an angry caller; putting someone on hold or
      // passing them on: not "transferable skills" or "hold yourself
      // accountable", the third Phase 4 review), and always at least one of
      // the model's own (the second).
      // Read sentence by sentence (the fourth Phase 4 review: "Have you used a
      // phone system? Tell us about an upset customer by email." is neither),
      // and a sentence with the one after it ("A patient is shouting. They are
      // on the phone."); "Mr." and "Dr." end no sentence (the fifth).
      const sentences = (prompt: string) => {
        const parts = prompt.split(/(?<!\b(?:Mr|Mrs|Ms|Dr|St|No|vs|etc))(?<=[.?!])\s+/);
        return parts.map((part, i) => (i + 1 < parts.length ? `${part} ${parts[i + 1]}` : part));
      };
      const onCall = (sentence: string) => /\b(calls?|callers?|phones?|on the line)\b/i.test(sentence) && !/\bby (e-?mail|chat)\b/i.test(sentence);
      const asksAngryCaller = (prompt: string) =>
        sentences(prompt).some((x) => onCall(x) && /\b(angry|upset|furious|irate|rude|abusive|shout\w*|yell\w*|scream\w*|swear\w*|talk\w* over)\b/i.test(x));
      const asksHoldOrTransfer = (prompt: string) =>
        sentences(prompt).some(
          (x) =>
            /\b(put|putting|place|placing|keep|keeping)\s+(\w+\s+){0,2}on hold\b(?!\s+times?)/i.test(x) ||
            (onCall(x) && /\b(on hold(?!\s+times?)|transfer(s|red|ring)? (the |a |their )?(call|caller|them|it)|pass\w* (them|the call|the caller|it) (on|to))\b/i.test(x)),
        );
      const prompts = questions.map((q) => q.prompt);
      // In the pack's own word: "a patient is angry" at a clinic (the fifth Phase 4 review).
      const noun = pack.counterpart;
      const inPackWords = (text: string) => (noun === "customer" ? text : text.replace(/\bcustomer\b/g, noun));
      const phone = PHONE_INTERVIEW_QUESTIONS.map((prompt, i) => ({ id: `vphone${i}`, prompt: inPackWords(prompt) })).filter((_q, i) =>
        i === 0 ? !prompts.some(asksAngryCaller) : !prompts.some(asksHoldOrTransfer),
      );
      const keep = questions.length > 0 ? Math.max(1, questions.length - phone.length) : 0;
      questions = [...phone, ...questions.slice(0, keep)];
    }
    out[interviewIndex] = { ...interview, config: { ...cfg, questions } satisfies VoiceConfig, countLabel: `${questions.length} questions` };
  }

  return out.map((p, order) => ({ ...p, order }));
}

/** Asked in a phone job's written interview (applyCustomerServicePack). */
export const PHONE_INTERVIEW_QUESTIONS = [
  "On a call, a customer is angry and keeps talking over you. Write what you would say first, word for word, and what you would do next.",
  "You need to put a caller on hold to check something. What do you tell them before, and when you come back?",
] as const;
