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

// A channel word that names a product or a business, not how the agent works
// ("Phone Repair Store", "Call Center Software", "Chat App"; the fourth and
// fifth Phase 4 reviews).
const NOT_A_PRODUCT = String.raw`(?!\s+(repairs?|stores?|shops?|cases?|accessor\w*|compan(y|ies)|software|systems?|platforms?|apps?|tools?|solutions?|products?|retail\w*|carriers?|networks?|industry|manufactur\w*|install\w*|technolog\w*|devices?|marketing|campaigns?|newsletters?|blasts?|bots?)\b)`;
// "No call center experience", "no voice experience needed", "no phone sales": not a rule about the channel.
const NOT_A_RULE = String.raw`(?!\s+(center |centre )?(experience|background|sales|selling|quotas?|cold calling|marketing)\b)`;
// "We don't take calls on weekends": a rule about when, not whether.
const NOT_WHEN = String.raw`(?!\s+(on|at|after|before|during|over)\s+(weekends?|nights?|holidays?|sundays?|saturdays?|hours|the weekend|lunch))`;
// A channel handled by someone else: the channel word starts its clause
// ("Phone support is handled by another team"), so "billing calls are handled
// by another team" is not all calls (the sixth Phase 4 review).
const elsewhere = (words: string) =>
  new RegExp(String.raw`(^|[.;!?]\s*|\b(all|any)\s+)(${words})( support)?\s+(are|is|will be|gets?|get)\s+(handled|covered|answered|taken|done|managed)\b|\b(another|a separate|a different|our other) team (handles|takes|answers|covers|does) (the |all |our )?(${words})\b`);

/**
 * How they will talk to customers: the business's answer, else its own words, else chat.
 *
 * Read channel by channel. The title's own channel words (in its role parts,
 * not a "for ..." business part, and not a product: "Phone Repair Store Chat
 * Agent" is a chat job) lead; the description adds a channel when the agent
 * does that work ("answer calls", "inbound calls", a list like "phone, email
 * and chat"), and only mentions count when the title names none. A channel is
 * out when the words rule it out ("non-voice", "no emails", "chat only",
 * "phone support is handled by another team" unless they also take calls).
 * Both phone and a written channel is a mix; chat and email, chat; tickets,
 * email. A bare "CSR", a receptionist or an operator with no channel in the
 * words reads as phone (the Philippine meaning of CSR).
 */
export function channelForBrief(brief: Pick<JobBrief, "followUps" | "roleTitle" | "whatTheyDo">): CsChannel {
  const chosen = answerTo(brief, "cs-channel");
  const index = CS_CHANNEL_CHIPS.findIndex((label) => label === chosen);
  if (index >= 0) return CHANNELS[index];
  const title = (brief.roleTitle ?? "").toLowerCase();
  const work = (brief.whatTheyDo ?? "").toLowerCase();
  const s = `${title} ${work}`;
  // "Voice and non-voice": both.
  if (/\bvoice\s*(and|&|\/|or)\s*non[- ]?\s?voice\b|\bnon[- ]?\s?voice\s*(and|&|\/|or)\s*voice\b/.test(s)) return "mixed";

  // The title's channel words, in its role parts only ("Chat CSR - for a call center" is chat).
  const titleRole = title
    .replace(/[()[\]]/g, " | ")
    .split(/\s+[-–—|]\s+|\s*[|,]\s*|\s+[-–—]\s*|\s*[-–—]\s+/)
    .map((part) => part.split(/\s+(?:for|at|in|with)\s+/)[0])
    .join(" | ");
  const titleNoVoice = titleRole.replace(/\bnon[- ]?\s?voice\b/g, " ");
  const tChat = new RegExp(String.raw`\b(chats?|live chat|text|sms|messaging)\b${NOT_A_PRODUCT}`).test(titleRole);
  // "Non-voice", "written": a written channel, which one the description says.
  const tWritten = /\bnon[- ]?\s?voice\b|\bwritten\b/.test(titleRole);
  const tEmail = new RegExp(String.raw`\b(e-?mails?|tickets?|ticketing)\b${NOT_A_PRODUCT}`).test(titleRole);
  const tPhone =
    new RegExp(String.raw`(?<!\b(mobile|cell|cellular|smart)\s)\b(phones?|voice|telephone|calls?(?!\s+cent(er|re))|answering service|switchboard)\b${NOT_A_PRODUCT}|\bcall cent(er|re) (agent|rep|representative|csr|specialist|associate|operator|advisor)s?\b`).test(titleNoVoice) ||
    (/\binbound\b/.test(titleNoVoice) && !tChat && !tEmail && !tWritten);

  // Ruled out. "Chat only" rules out phone and email; "email and chat only" only phone.
  const only = (words: string) => new RegExp(String.raw`(?<!\b(and|&|or|,)\s)\b(${words}) only\b|\bonly (${words})\b|\bstrictly (${words})\b|\bpure (${words})\b`);
  const PHONE = String.raw`phones?|calls?|voice|phone calls?`;
  const CHAT = String.raw`chats?|live chat`;
  const EMAIL = String.raw`e-?mails?|tickets?`;
  const no = (words: string) =>
    new RegExp(String.raw`\b(no|without( any)?)\s+(${words})\b${NOT_A_RULE}|\b(don'?t|do not|doesn'?t|does not|won'?t|will not|never)\s+(do |offer |handle |take |answer |make |need to )?(any )?(${words})( support)?\b${NOT_WHEN}|\b(${words})( support)? (are|is) not (required|needed|part)`);
  const onlyWritten = only(`${CHAT}|${EMAIL}|written|text|non[- ]?\s?voice|chat and email|email and chat`).test(s);
  const strongNoPhone =
    /\bnon[- ]?\s?voice\b|\bnever on the phone|\bnot (on the )?phones?\b|\bwithout (phone )?calls\b/.test(s) || no(PHONE).test(s) || onlyWritten;
  const onlyPhone = only(PHONE).test(s);
  const noChat = no(CHAT).test(work) || onlyPhone || (only(EMAIL).test(s) && !only(CHAT).test(s));
  const noEmail = no(`e-?mails?`).test(work) || onlyPhone || (only(CHAT).test(s) && !only(EMAIL).test(s));

  // What the description says the agent does on each channel.
  const LIST = String.raw`(\s*(,|&|\band\b|\/|\+|\bor\b)\s*(and\s+)?)`;
  const WRITTEN = String.raw`(live chats?|chats?|e-?mails?|texts?|sms|messages?|tickets?)`;
  const PHONEW = String.raw`(phones?|calls?|voice)`;
  // A list of channels with phones in it ("phone, email and chat", "calls and
  // emails"); not what customers own or are billed for ("their phone and email
  // accounts", "calls and texts on their plan").
  const list = new RegExp(
    String.raw`\b(${PHONEW}(${LIST}${WRITTEN})+|${WRITTEN}(${LIST}(${WRITTEN}|${PHONEW}))*${LIST}${PHONEW})\b(?!\s+(accounts?|numbers?|settings|plans?|apps?|devices?|bills?|lines?|on (their|your|the|our) (plan|bill|account|phone)))`,
  ).test(work);
  const phoneWork = new RegExp(
    String.raw`\b(answer|answering|take|taking|handle|handling|field|fielding|make|making|receive|receiving|return|returning|place|placing)\b((?!e-?mails?|chats?|messages?|tickets?|texts?)[^.;]){0,25}\b(calls?|phones?)\b${NOT_A_PRODUCT}|\b(inbound|incoming) (customer |client |patient )?(calls?|voice)\b|\b(on|at|over) the (phones?|line)\b|\bon the phone\b|\b(by|via|over) (tele)?phone\b|\bcalls? (from|with) (our |the )?(customers|clients|patients|callers|guests|members|players)\b|\b(customer|client|patient|guest|member|player|caller) calls?\b|\b\d+\+? calls\b|\b(phone|calls?)\s+(too|as well|also)\b|\b(some|occasional|also|plus|light) (phones?|calls?|phone calls)\b|\bphone[- ]based\b|\bpick(ing)? up the phones?\b|\b(customers|clients|patients|callers|people) (phone|call|ring) (us|in)\b`,
  ).test(work);
  const phoneMention = new RegExp(String.raw`\b(phone (support|agent|rep|csr|calls?)|voice (agent|csr|support|account)|outbound calls?|telephone|bpo)\b|\bcall cent(er|re)\b${NOT_A_PRODUCT}`).test(work);
  const chatIn = /\b(chats?|live chat|messages|messaging|messenger|whatsapp)\b|\b(by|via|over) (text|sms)\b|\b(text|sms) (support|messages? from)\b/.test(work);
  const emailIn = new RegExp(String.raw`\b(e-?mails?)\b(?!\s+(accounts?|address(es)?|settings))${NOT_A_PRODUCT}|\b(answer|answering|resolve|resolving|respond to|responding to|reply to|replying to|handle|handling|work|working)\b[^.;]{0,25}\btickets?\b|\btickets? only\b|\bonly tickets\b|\bticket(ing)? support\b|\bsupport tickets\b|\bzendesk\b|\bfreshdesk\b`).test(work);

  const titleNames = tChat || tEmail || tPhone || tWritten;
  const phoneOut = strongNoPhone || ((elsewhere(PHONE).test(work)) && !phoneWork);
  const chatOut = noChat || (elsewhere(CHAT).test(work) && !/\b(answer|answering|reply to|replying to|respond to|responding to|handle|handling)\b[^.;]{0,20}\bchats?\b/.test(work));
  const emailOut = noEmail || (elsewhere(`e-?mails?|email`).test(work) && !/\b(answer|answering|reply to|replying to|respond to|responding to|handle|handling)\b[^.;]{0,20}\be-?mails?\b/.test(work));
  // With a channel in the title, the description adds one only by the agent's work or a list.
  const phone = !phoneOut && (tPhone || phoneWork || list || onlyPhone || (!titleNames && phoneMention));
  // A title that only says "non-voice" leaves chat or email to the description.
  const titleSays = tChat || tEmail || tPhone;
  const chat = !chatOut && (tChat || (chatIn && (!titleSays || list || /\b(answer|answering|reply to|replying to|respond to|responding to|handle|handling)\b[^.;]{0,20}\b(live )?chats?\b/.test(work))));
  const email = !emailOut && (tEmail || (emailIn && (!titleSays || list || /\b(answer|answering|reply to|replying to|respond to|responding to|handle|handling)\b[^.;]{0,25}\b(e-?mails?|tickets?)\b/.test(work))));

  // A list names a written channel even when it is only "text" or "SMS".
  const written = chat || email || (list && !chatOut) || (tWritten && !chatOut);
  if (phone && written) return "mixed";
  if (phone) return "phone";
  if (chat) return "chat";
  if (email) return "email";
  if (written) return "chat";
  // Nothing named: a bare "CSR", a receptionist or an operator takes calls; anything else, chat.
  if (!phoneOut && /\b(csr|receptionist|operator)s?\b/.test(title) && !strongNoPhone) return "phone";
  // Phones ruled out with no written channel named ("No calls, only tickets" names one): chat.
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
      // and a statement with the one before it ("A patient is shouting. They
      // are on the phone."), unless either names a written channel or the
      // second is a question of its own ("...upset with you. How many calls a
      // day did you take?"; the sixth). "Mr." and "Dr." end no sentence.
      const WRITTEN_CHANNEL = /\b(chats?|live chat|e-?mails?|messages?|texts?|sms|tickets?)\b/i;
      const sentences = (prompt: string) => {
        const parts = prompt.split(/(?<=[.?!])(?<!\b(?:Mr|Mrs|Ms|Dr|St|No|vs|etc)\.)\s+/);
        const pairs = parts.slice(1).map((part, i) => [parts[i], part]).filter(([a, b]) => !/\?\s*$/.test(b) && !WRITTEN_CHANNEL.test(a) && !WRITTEN_CHANNEL.test(b));
        return [...parts, ...pairs.map(([a, b]) => `${a} ${b}`)];
      };
      const onCall = (sentence: string) => /\b(calls?|callers?|phones?|on the line)\b/i.test(sentence) && !/\bby (e-?mail|chat)\b/i.test(sentence);
      const asksAngryCaller = (prompt: string) =>
        sentences(prompt).some((x) => onCall(x) && /\b(angry|upset|furious|irate|rude|abusive|shout\w*|yell\w*|scream\w*|swear\w*|talk\w* over)\b/i.test(x));
      // On hold is a person on hold ("put a caller on hold", "put patients on
      // hold"), or on a call; never a project, a ticket or a feeling (the sixth).
      const PERSON = String.raw`(them|him|her|someone|somebody|anyone|people|callers?|customers?|patients?|players?|guests?|members?|clients?|users?|shoppers?|buyers?)`;
      const putOnHold = new RegExp(String.raw`\b(put|putting|place|placing|keep|keeping)\s+((a|an|the|their|our|your|some|any|every)\s+)?(\w+\s+)?${PERSON}\s+on hold\b(?!\s+times?)`, "i");
      const asksHoldOrTransfer = (prompt: string) =>
        sentences(prompt).some(
          (x) =>
            putOnHold.test(x) ||
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
