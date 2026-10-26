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
import { inferCountryCode } from "../jobLocation.ts";

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
const NOT_A_PRODUCT = String.raw`(?!\s+(repairs?|stores?|shops?|cases?|accessor\w*|compan(y|ies)|software|systems?|platforms?|apps?|tools?|solutions?|products?|retail\w*|carriers?|networks?|industry|manufactur\w*|install\w*|technolog\w*|devices?|marketing|campaigns?|newsletters?|blasts?|bots?|and (accessor\w*|tablets?|laptops?|devices?|computers?|cases?))\b)`;
// "No call center experience", "no voice account experience needed", "no phone
// or sales experience", "no phone sales": not a rule about the channel. ("No
// phone calls or sales" is two things, and the rule holds; the ninth review.)
const NOT_A_RULE = String.raw`(?!\s+(((or|and|&|\/)\s*)?\w+\s+){0,3}(experience|background)\b|\s+((?!(or|and|nor)\b)\w+\s+)?(sales|selling|quotas?|cold calling|marketing)\b)`;
// Every channel word, for "only tickets and live chat" (a list goes on).
const ANY_CHANNEL = String.raw`(live chats?|chats?|e-?mails?|tickets?|phones?|calls?|voice|texts?|sms|messages?)`;
// A messaging line is no phone line, whatever it is called: "via our Viber hotline", "our SMS hotline", "through our WhatsApp
// hotline and email" (the fourteenth Phase 4 review; Philippine businesses say "hotline" for those too).
const NOT_WRITTEN_LINE = String.raw`(?!(sms|text|viber|whatsapp|chat|messenger|e-?mail|facebook|fb)\s)`;
// How to apply ("Email your resume to hr@...", "How to apply:", "Interested
// applicants may send their CV", "Apply via email or call us", "Walk-in
// applicants are welcome at our Makati office"), from that phrase on; never a
// duty ("know when to apply discounts", "interested applicants should be
// comfortable handling inbound calls"; the seventh to ninth Phase 4 reviews),
// nor a customer who applies ("help customers apply online for our credit
// card", "customers who apply by phone", "help customers submit an
// application"), nor inquiries the agent handles ("the first point of contact
// for inquiries, complaints and requests"): "for inquiries," is how to apply
// only before a way to reach the business ("For inquiries, email us at …";
// the tenth review). Each part starts after a space or a mark and checks its
// first word before anything else, so a long run of spaces or a huge pasted
// line costs linear time (the tenth review).
// The twelfth review: a CV sent by DM or message ("Interested? DM us your CV
// on Messenger"), and a sentence that is only how to reach the business to
// apply ("Text or call 0917 123 4567 to apply.", "Chat with us to apply."),
// never "help customers apply" or "to apply for a loan".
const CUSTOMER_APPLIES = String.raw`(?<!\b(customers?|clients?|members?|patients?|policyholders?|borrowers?|callers?|users?|people|them|who|that)\s{1,2}(to\s{1,2})?)`;
export const HOW_TO_APPLY = new RegExp(
  String.raw`(?<![^\s,;!\-–(])(how to apply\s*[:\-–]|(interested|qualified) (applicants?|candidates?)\s+(may|can|are (invited|encouraged)|please|kindly|send|email|submit|apply|forward|message|call|text|contact|should (send|email|submit|apply|forward))\b|walk[- ]?in (applicants?|candidates?|interviews?|applications?|hiring)\b|walk[- ]?ins? (are )?(welcome|accepted) (for|to) (interviews?|apply|applications?)\b|walk in for (an |your )?interview\b|(shortlisted|qualified|successful|selected) (candidates?|applicants?) will be (contacted|called|notified|texted|emailed)\b|((please|kindly)\s+)?(?=(send|email|e-mail|submit|forward|mail|upload|attach|drop|dm|pm|message)\s)${CUSTOMER_APPLIES}(send|email|e-mail|submit|forward|mail|upload|attach|drop|dm|pm|message)\s+(us\s+|in\s+)?(((your|their|an?|the)\s+)?((updated|latest|complete|detailed|recent)\s+)?(cv|resume|résumé)s?|(your|an)\s+(application|portfolio))\b|(?<!\b(how|when|where|what|why|whether)\s)to apply\b(?!\s+(discounts?|coupons?|promo\w*|codes?|credits?|refunds?|polic\w*|the|our|their|your|a|an|this|that|these|it|them|fixes|patches|updates|changes|rules|what|troubleshooting|steps|solutions|knowledge|skills|for (a |an |their |your |our )?([\w-]+ )?(refunds?|loans?|credit|accounts?|cards?|warrant\w*|discounts?|benefits?|assistance|insurance|programs?|mortgages?|rewards?|financing|coverage))\b)|(?=apply )${CUSTOMER_APPLIES}(?<!\b(discounts?|promos?|coupons?|codes?|fees?|charges?|rules?|policies|terms|rates?|taxes)\s)apply (now|today|here|by|via|through|at|online|in person)\b|(?=(text|call|message|chat|dm|pm|email|e-mail|contact|whatsapp|viber)\s)${CUSTOMER_APPLIES}(text|call|message|chat|dm|pm|email|e-mail|contact|whatsapp|viber)\s+((or|and|\/)\s+(text|call|message|chat|dm|pm|email|e-mail|whatsapp|viber)\s+)?(with\s+)?(us|me|hr|our (hr|recruit\w*)|\+?\d[\d -]{5,20})[^.;\n!]{0,40}?\bto apply\b(?!\s+(for|to|the|our|their|your|a|an|this|that|these|it|them|discounts?|coupons?|promo\w*|codes?|credits?|refunds?|polic\w*)\b)|for (job |more )?(inquiries|enquiries|questions|info|information|details)\s*,\s*((please|kindly|just|you (can|may))\s+)?(e-?mail|call|contact|message|text|reach|send|visit|dm|pm|ring|whatsapp|viber|chat with)\b)[^.;\n!]*`,
  "g",
);
// "Blended", "omnichannel", "multichannel": the agent works every channel,
// unless the word is about a product or the business ("blended coffees", "a
// multichannel e-commerce brand"; the eighth and ninth reviews), or a
// blended work setup, which is office and home ("Blended work setup: 3 days
// onsite, 2 days WFH"; the tenth).
const MIXED_WORDS = String.raw`\b(blended|omni-?channel|multi-?channel)\b`;
const NOT_MIXED_WORK = String.raw`(?!\s+([\w-]+\s+)?(coffees?|drinks?|beverages?|smoothies?|teas?|juices?|flavou?rs?|fabrics?|yarns?|oils?|wines?|whiske?ys?|brands?|retail\w*|business(es)?|compan(y|ies)|stores?|shops?|sellers?|e-?commerce|marketing|marketplaces?|platforms?|software|tools?|solutions?|products?|learning|famil(y|ies)|courses?|classes?|rates?|setups?|set-ups?|arrangements?|schedules?)\b)`;
// "We don't take calls on weekends", "no calls after 8pm": a rule about when, not whether.
const NOT_WHEN = String.raw`(?!\s+(calls?\s+)?(on|at|after|before|during|over|outside|between)\s+(weekends?|nights?|holidays?|sundays?|saturdays?|hours|business hours|office hours|the weekend|lunch|\d))`;
// A channel handled by someone else: the channel word starts its clause
// ("Phone support is handled by another team"), so "billing calls are handled
// by another team" is not all calls (the sixth Phase 4 review).
// ...and handled by SOMEONE: "all calls are handled from home" or "answered
// within three rings" says how, not who (the seventh).
const elsewhere = (words: string) =>
  new RegExp(String.raw`(^|[.;!?]\s*|\b(all|any)\s+)(${words})( support)?\s+(are|is|will be|gets?|get)\s+(handled|covered|answered|taken|done|managed)\s+(by\s+(another|a separate|a different|our other|other|someone|the|our)\b[\w\s'-]{0,25}?\b(team|center|centre|department|staff|colleagues|agents|office)|elsewhere|separately|in-house)\b|\b(another|a separate|a different|our other) team (handles|takes|answers|covers|does) (the |all |our )?(${words})\b`);
// What the agent is asked to have done before, never a duty: "Must have experience replying to emails", "Experience in
// answering chats", "proficient in handling email support" (the eighteenth review). Bounded by its clause.
const QUALIFIED_IN = /\b(experience[ds]?|background|proficien(t|cy)|skilled|familiar(ity)?|knowledge)\s+((in|with|at|of|on)\s+)?(answering|replying|responding|handling|managing|writing)\b[^.;,\n]*/g;
// A customer duty that names no channel, in its own part of a list ("Answer customer inquiries", "Handle customer
// concerns", "Assist subscribers with load, billing and network concerns", "Assist customers with their orders"): a hotline
// title's phone (the eighteenth review). Never one whose part names a channel: "Handle customer concerns via email and
// chat", "Answer customer chat inquiries", "Reply to customer emails". Each part is bounded, so a huge pasted line costs
// linear time.
const CHANNEL_NAMED = String.raw`(live chats?|chats?|e-?mails?|tickets?|messages?|sms|texts?|viber|whatsapp|messenger|facebook|fb|social media|phones?|calls?|voice|hotlines?|telephone)`;
const DUTY_VERB = String.raw`(answer|answers|answering|handle|handles|handling|(respond|responds|responding|reply|replies|replying|attend|attends|attending) to|address|addresses|addressing|assist|assists|assisting|resolve|resolves|resolving|help|helps|helping|entertain|entertains|entertaining)`;
const DUTY_OBJECT = String.raw`(inquir(y|ies)|enquir(y|ies)|concerns?|questions?|complaints?|issues?|requests?|quer(y|ies)|customers?|clients?|callers?|subscribers?|members?|cardholders?|policyholders?|guests?|patients?|users?|shoppers?|buyers?|players?)`;
const UNTIED_DUTY = new RegExp(String.raw`\b${DUTY_VERB}\s+((?!${CHANNEL_NAMED}\b)[\w'-]+,?\s+){0,5}?${DUTY_OBJECT}\b(?!((?!\s(and|then|also|or|while)\s+${DUTY_VERB}\b)[^.;\n]){0,80}?\b${CHANNEL_NAMED}\b)`);

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
  const title = (brief.roleTitle ?? "").toLowerCase().replace(/\bon[- ]call\b/g, " ").replace(/\b(brand|tone of) voice\b/g, " ");
  const rawWork = (brief.whatTheyDo ?? "").toLowerCase();
  // How to apply ("send your CV by email or call us") and a voice that is not
  // a channel ("brand voice", "on-call") say nothing about the job's channel
  // (the seventh Phase 4 review).
  const work = rawWork.replace(HOW_TO_APPLY, " ").replace(/\b(brand|tone of) voice\b|\bvoice of the customer\b/g, " ");
  const s = `${title} ${work}`;

  // The title's channel words, in its role parts only ("Chat CSR - for a call center" is chat).
  const titleRole = title
    .replace(/[()[\]]/g, " | ")
    .split(/\s+[-–—|]\s+|\s*[|,]\s*|\s+[-–—]\s*|\s*[-–—]\s+/)
    .map((part) => part.split(/\s+(?:for|at|in|with)\s+/)[0])
    .join(" | ");
  // "Voice and non-voice", a blended or omnichannel account or agent: both.
  const mixedWords = new RegExp(MIXED_WORDS).test(titleRole) || new RegExp(MIXED_WORDS + NOT_MIXED_WORK).test(work);
  if (mixedWords && !/\bnon[- ]?\s?voice\b/.test(s)) return "mixed";
  if (/\bvoice\s*(and|&|\/|or)\s*non[- ]?\s?voice\b|\bnon[- ]?\s?voice\s*(and|&|\/|or)\s*voice\b/.test(s)) return "mixed";
  const titleNoVoice = titleRole.replace(/\bnon[- ]?\s?voice\b/g, " ");
  const tChat = new RegExp(String.raw`\b(chats?|live chat|text|sms|messaging)\b${NOT_A_PRODUCT}`).test(titleRole);
  // "Non-voice", "written": a written channel, which one the description says.
  const tWritten = /\bnon[- ]?\s?voice\b|\bwritten\b/.test(titleRole);
  const tEmail = new RegExp(String.raw`\b(e-?mails?|tickets?|ticketing)\b${NOT_A_PRODUCT}`).test(titleRole);
  const tPhone =
    new RegExp(String.raw`(?<!\b(mobile|cell|cellular|smart)\s)\b(phones?|voice|telephone|calls?(?!\s+cent(er|re))|answering service|switchboard|hotlines?)\b${NOT_A_PRODUCT}`).test(titleNoVoice) ||
    // "Call Center Customer Service Representative", "Customer Service - Call Center", "Contact Center Agent".
    (!tChat && !tEmail && !tWritten && new RegExp(String.raw`\b(call|contact) cent(er|re)\b${NOT_A_PRODUCT}`).test(titleRole)) ||
    (/\binbound\b/.test(titleNoVoice) && !tChat && !tEmail && !tWritten);
  // The title's only phone word is its hotline ("Hotline Agent", "Customer Care Hotline Officer"), which a Philippine business
  // also calls its SMS or Viber line (titlePhone below).
  const tOnlyHotline = tPhone && /\bhotlines?\b/.test(titleNoVoice) && !/(?<!\b(mobile|cell|cellular|smart)\s)\b(phones?|voice|telephone|calls?|answering service|switchboard|inbound)\b/.test(titleNoVoice);

  // Ruled out. "Chat only" rules out phone and email; "email and chat only" only phone.
  // ("Only tickets and live chat" is both, not tickets only; the ninth review.)
  const only = (words: string) => new RegExp(String.raw`(?<!(\b(and|&|or)\s|[,/]\s?))\b(${words}) only\b|\bonly (${words})(\s*(,|&|and|\/|or)\s*(${words}))*\b(?!\s*(,|&|and|\/|or)\s*${ANY_CHANNEL}\b)|\bstrictly (${words})\b(?!\s*(and|&|,|\/)\s)|\bpurely? (${words})\b(?!\s*(and|&|,|\/)\s)`);
  const PHONE = String.raw`phones?|calls?|voice|phone calls?`;
  const CHAT = String.raw`chats?|live chat`;
  const EMAIL = String.raw`e-?mails?|tickets?`;
  // A rule names its verb ("we don't take calls", "you won't need to make or
  // take calls"): "never call a customer by their first name" is no rule (the seventh).
  const no = (words: string) =>
    new RegExp(String.raw`\b(no|without( any)?)\s+(${words})\b${NOT_A_RULE}${NOT_WHEN}|\b(don'?t|do not|doesn'?t|does not|won'?t|will not|never)\s+((need|have) to\s+)?(do|offer|handle|take|answer|make|pick up|make or take|take or make)\s+(any\s+)?(the\s+)?(${words})( support)?\b${NOT_WHEN}|\bno need to (take|answer|make|pick up)( or (take|answer|make))?\s+(any\s+)?(the\s+)?(${words})\b|\b(does not|doesn'?t|will not|won'?t) (involve|include|require)\s+(any\s+)?(${words})\b${NOT_A_RULE}|\b(${words})( support)? (are|is|isn'?t|aren'?t) not (required|needed|part)\b|\b(${words})( support)? (isn'?t|aren'?t) (required|needed|part)\b`);
  const onlyWritten = only(`${CHAT}|${EMAIL}|written|text|non[- ]?\s?voice|chat and email|email and chat`).test(s);
  // Hard rules ("non-voice", "chat only") always rule phones out; a "no calls"
  // or "won't need to make calls" gives way to the agent's own phone work
  // ("You won't need to make calls. You will answer incoming calls.").
  const hardNoPhone = /\bnon[- ]?\s?voice\b|\bnon[- ]?phone\b|\bnever on the phone|\bnot (on the )?phones?\b|\bwithout (phone )?calls\b/.test(s) || onlyWritten;
  const softNoPhone = no(PHONE).test(s);
  const strongNoPhone = hardNoPhone || softNoPhone;
  // "Inbound only" is about which way the calls or chats go, not the channel:
  // it rules nothing out ("Chat Support Agent / Inbound only, no outbound
  // sales" is chat), and it is phone only when nothing written is named
  // ("Inbound only, no sales"; the ninth and tenth reviews).
  const onlyPhone = only(`${PHONE}|inbound calls?`).test(s);
  const inboundOnly = only("inbound").test(s);
  const noChat = no(CHAT).test(work) || onlyPhone || (only(EMAIL).test(s) && !only(CHAT).test(s));
  const noEmail = no(`e-?mails?`).test(work) || onlyPhone || (only(CHAT).test(s) && !only(EMAIL).test(s));

  // What the description says the agent does on each channel.
  const LIST = String.raw`(\s*(,|&|\band\b|\/|\+|\bor\b)\s*(and\s+)?)`;
  const WRITTEN = String.raw`(live chats?|chats?|e-?mails?|texts?|sms|messages?|tickets?)`;
  const PHONEW = String.raw`(phones?|calls?|voice)`;
  // (Voicemails in a list are the phone's: "Respond to emails, chats and voicemails"; the fourteenth review, since the
  // thirteenth's verb-only rule for voicemails read them as nothing there.)
  // (Only after a written channel, as the fourteenth's evidence was, and never their transcriptions: "Turn customer voicemails
  // and emails into tickets in Zendesk", "Voicemail and email transcripts are reviewed by our QA team", "Handle customer emails,
  // chats, and voicemail transcriptions" name no calls; the fifteenth.)
  const PHONE_AFTER = String.raw`(phones?|calls?|voice ?mails?(?!\s+transcri\w*)|voice)`;
  // A list of channels with phones in it ("phone, email and chat", "calls and
  // emails"); not what customers own or are billed for ("their phone and email
  // accounts", "calls and texts on their plan").
  const list = new RegExp(
    String.raw`\b(${PHONEW}(${LIST}${WRITTEN})+|${WRITTEN}(${LIST}(${WRITTEN}|${PHONE_AFTER}))*${LIST}${PHONE_AFTER})\b(?!\s+(accounts?|numbers?|settings|plans?|apps?|devices?|bills?|lines?|on (their|your|the|our) (plan|bill|account|phone)))`,
  ).test(work);
  // The work the agent does, with what they will NOT do taken out ("no need to
  // take calls", "you won't need to make calls", "you will never have to pick
  // up the phone"; the seventh Phase 4 review).
  // Only a rule about a channel: "work without supervision and handle inbound
  // calls" keeps its calls, and a rule stays on its own line ("Can work without
  // supervision\nHandle inbound calls"; the eighth and ninth reviews).
  const positiveWork = work.replace(/\b(no need to|(won'?t|will not|don'?t|do not|doesn'?t|does not) (need|have) to|never (need|have) to|never|without)[ \t]+((?!and\b|but\b)[\w']+[ \t]+){0,5}(calls?|phones?|phone calls?|chats?|e-?mails?|voice)\b[^.;,\n]*/g, " ");
  // The calls are what the verb works on: "answer customer calls", "take 60
  // calls", never phones a preposition points to ("making returns for their
  // phones", "requests for call backs", "orders for replacement phones"; the
  // ninth review). Phone orders or inquiries are work when a verb takes them
  // ("take phone orders"), not a topic ("answer emails about phone orders").
  const phoneWork = new RegExp(
    String.raw`\b(answer|answering|take|taking|handle|handling|field|fielding|make(?!\s+sure)|making(?!\s+sure)|receive|receiving|return|returning|place|placing)\b((?!e-?mails?|chats?|messages?|tickets?|texts?|\b(for|about|regarding|on|with|to|into|from)\b)[^.;\n]){0,25}\b(calls?(?!\s+for\s+(patience|excellent|strong|good|great|someone|people|skills?|experience|attention))|phones|the phones?)\b${NOT_A_PRODUCT}|\b(answer|answering|take|taking|handle|handling|field|fielding|process|processing|receive|receiving|manage|managing|respond to|responding to|reply to|replying to)\s+((?!e-?mails?\b|chats?\b|messages?\b|tickets?\b|texts?\b|about\b|regarding\b|for\b|on\b|of\b)[\w-]+\s+){0,2}(?<!\b(mobile|cell|cellular|smart)\s)phone\s+(inquir\w*|enquir\w*|orders?|requests?|questions?|bookings?|reservations?|and walk-?in)\b|\b(help|helping|assist|assisting|serve|serving|support|supporting)\s+callers\b|\b(from|with|of) (our |the )?callers\b|\b(who|that)\s+(call|phone|ring)( us)?( in)?\b|\b(inbound|incoming) (customer |client |patient )?(calls?|voice)\b|\b(on|at|over) the (phones?|line)\b|\bon the phone\b|\b(by|via|over|through|thru) (tele)?phones?( calls?)?\b${NOT_A_PRODUCT}|\bcalls? (from|with) (our |the )?(customers|clients|patients|callers|guests|members|players)\b|\b(customer|client|patient|guest|member|player|caller) calls?\b|\b\d+\+? calls\b|\b(phone|calls?)\s+(too|as well|also)\b|\b(some|occasional|also|plus|light) (phones?|calls?(?!\s+for\b)|phone calls)\b|\bphone[- ]based\b|\bpick(ing)? up the phones?\b|\b(customers|clients|patients|callers|people) (phone|call|ring) (us|in)\b` +
      // ...and calls the verb reaches through "to" or a number, or customers on calls ("answer and
      // respond to calls", "handle up to sixty calls a day", "take care of customers on calls", "calls
      // are answered within 3 rings", "make sure every call is logged"; the tenth review), but not the
      // calls someone else took that the agent follows up on ("Follow up on calls from the sales team"; the eleventh).
      // (Only "on" calls: following up via, over or through calls is the agent's own calling; the twelfth.)
      // (Missed calls and voicemails are the agent's to return: "Follow up on missed calls and voicemails from customers"; the twelfth.)
      // (...when a verb returns or follows them up, never a bare mention: "no more missed calls or voicemails for our customers",
      // "Turn customer voicemails into tickets"; the thirteenth. A hotline is the phone line, as Philippine posts say it: "Answer the
      // customer hotline", "Man the hotline", "through our hotline and email"; the thirteenth. Never a messaging line, the fourteenth:
      // "via our Viber hotline", "our SMS hotline", "through our WhatsApp hotline and email" are written; NOT_WRITTEN_LINE.
      // Its name may take two words or "24/7": "Answer the customer care hotline and emails", "Answer the 24/7 hotline"; the fifteenth.
      // Or three, "Answer our 24/7 customer service hotline"; the sixteenth. And a voicemail the agent handles or manages is
      // returned too, at the head of a list as well: "Handle voicemails and emails from customers", "Manage voicemails, emails
      // and live chats"; the sixteenth, since the fifteenth read a voicemail only after a written channel. Never transcriptions,
      // as there.)
      String.raw`|\b(respond|responding|reply|replying|attend|attending|tend|tending|listen|listening)\s+to\s+((the|all|our|incoming|inbound|customer|client|patient|every|their)\s+){0,2}calls\b|\b(up to|over|about|around|at least)?\s*(\d+\+?|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|a hundred|hundreds of|dozens of)\s+((inbound|incoming|customer|phone)\s+)?calls\b|(?<!\bfollow(s|ed|ing)?[- ]up\s)\bon (customer |client |live |phone |inbound |incoming )?calls\b|\b(during|over|through|thru|via) (customer |client |live |phone |inbound |incoming )?calls\b|\bcalls? (are|is|get|gets) (answered|picked up|returned)\b(?!\s+(by|elsewhere|separately|in-house)\b)|\b(every|each) (customer |inbound |incoming )?call\b|\b(return|returns|returning|check|checks|checking|follow(s|ed|ing)?[- ]up on|respond to|responding to|listen to|listening to|answer|answering|call back|calling back|handle|handles|handling|manage|manages|managing)\s+((the|all|any|our|their|customer|client|patient)\s+){0,2}(missed calls|voice ?mails?)\b(?!\s+transcri\w*)|\b(answer|answering|man|manning|staff|staffing|handle|handling|cover|covering|take|taking|monitor|monitoring)\s+(the\s+|our\s+)?(${NOT_WRITTEN_LINE}([\w-]+|24\/7)\s+){0,3}hotlines?\b|\b(on|through|thru|via|by|over)\s+(the\s+|our\s+)?(${NOT_WRITTEN_LINE}([\w-]+|24\/7)\s+){0,3}hotlines?\b`,
  ).test(positiveWork);
  const phoneMention = new RegExp(String.raw`\b(phone (support|agent|rep|csr|calls?)|voice (agent|csr|support|account)|outbound calls?|telephone|bpo)\b${NOT_A_RULE}|\bcall cent(er|re)\b${NOT_A_PRODUCT}${NOT_A_RULE}`).test(work);
  // Call-centre, BPO or phone support experience, asked for or not ("no call
  // center experience required", "with or without BPO experience"), is a phone
  // job's word (the eighth review), unless a written channel is in the words
  // ("Reply to customer emails and chats. No call center experience required."
  // is a chat job; the ninth).
  // ("Telephone customer service experience", "telephone sales or service experience", "experience
  // working in a contact center"; the tenth review.)
  const phoneExperience = /\b(call cent(er|re)|contact cent(er|re)|bpo|voice( account)?|(tele)?phone( support)?)\s+((\w+\s+){0,3})(experience|background)\b|\b(experience|background)\s+(working\s+)?(in|at|with|from)\s+(an?\s+|the\s+)?((call|contact) cent(er|re)|bpo)\b/.test(work);
  // A voice account is phone work whatever else the words rule out ("Voice account. No calls and no sales quotas").
  const voiceAccount = /\b(voice (account|campaign|queue)|inbound voice)\b(?!\s+(\w+\s+)?(experience|background))/.test(s) && !/\bnon[- ]?\s?voice\b/.test(s);
  // (Intercom is a chat tool: "support customers via Intercom"; the tenth review.
  // A door's or a building's intercom is not: "Answer phones and the intercom"; the eleventh.
  // Only those: Intercom in a list of tools is the chat tool wherever it stands, "via email and
  // Intercom", "Use Zendesk and Intercom", "Tools: Intercom, Zendesk", never the door's "intercom calls"
  // or "intercom buzzes"; the twelfth.)
  // (The thirteenth review: only in a list with a written channel or a help-desk tool, as all the twelfth's were; a door's
  // intercom is beside the phones: "Answer phones and intercom, schedule appointments", "Answer phones, intercom and greet guests".)
  // (Messages a receptionist takes are phone messages: "Answer phones, take messages and schedule appointments"; the twelfth.)
  const HELP_TOOL = String.raw`(e-?mails?|live chat|chats?|tickets?|zendesk|freshdesk|slack)`;
  const chatIn = new RegExp(String.raw`\b(chats?|live chat|messaging|messenger|whatsapp)\b|(?<!\b(take|takes|taking|took|leave|leaves|leaving|relay|relays|relaying)\s)\bmessages\b|\b(via|in|on|through|thru|using|with) intercom\b|\bintercom (chats?|messages?|inbox|tickets?|conversations?|messenger)\b|\b${HELP_TOOL}\s*(,|&|\/|\band\b|\bor\b)\s*(and\s+)?intercom\b|\bintercom\s*(,|&|\/|\band\b|\bor\b)\s*(and\s+)?${HELP_TOOL}\b|\b(by|via|over) (text|sms)\b|\b(text|sms) (support|messages? from)\b`).test(work);
  const emailIn = new RegExp(String.raw`\b(e-?mails?)\b(?!\s+(accounts?|address(es)?|settings))${NOT_A_PRODUCT}|\b(answer|answering|resolve|resolving|respond to|responding to|reply to|replying to|handle|handling|work|working)\b[^.;]{0,25}\btickets?\b|\btickets? only\b|\bonly tickets\b|\bticket(ing)? support\b|\bsupport tickets\b|\bzendesk\b|\bfreshdesk\b`).test(work);

  // A hotline that is the title's only phone word is the phone line unless the words name only written channels: then they
  // decide, as for a bare CSR. "Hotline Officer / Reply to SMS and Viber messages from customers", "Hotline Agent / Answer
  // customer messages on our Viber hotline", "Hotline Representative / Respond to customer chats and emails" and "Hotline Agent
  // - Non-Voice / Handle customer concerns via email and chat" are written (the sixteenth review: the title's hotline, the
  // thirteenth's, led over them). "Hotline Agent / Answer calls on our 24/7 customer hotline", "Hotline Agent / Answer the
  // customer hotline and reply to emails" and a "Hotline Agent" with no words are still the phone.
  // (The seventeenth: only the agent's own written replies, as all the sixteenth's were, by the verbs the chat and email
  // tests below read. Any written word let the hotline go: "Proficient in MS Office and email", "Experience in chat support is a
  // plus", "Prepare reports and email summaries to supervisors", "send updates to customers via SMS", "Document every
  // interaction in Zendesk" were email or chat jobs.)
  // (The eighteenth: within its own part of a list, so "Answer customer inquiries, log tickets and escalate complaints" is no
  // written reply; never a qualification, QUALIFIED_IN; and only when every customer duty names a written channel: a duty
  // that names none is the hotline's own, UNTIED_DUTY, so the phone stays and the written reply is added beside it. "Answer
  // customer inquiries and reply to emails", "Handle inbound customer inquiries and reply to emails", "Answer product
  // inquiries and handle email escalations" and "Handle customer inquiries; also reply to emails and Facebook messages" are
  // a mix (hotlineReply, below), and "Handle customer concerns. Must have experience replying to emails" the phone; each
  // dropped the phone.)
  const dutyWork = positiveWork.replace(QUALIFIED_IN, " ");
  const writtenReply = /\b(answer|answering|reply|replying|respond|responding|handle|handling)\b( to)?[^.;,\n]{0,25}\b(live chats?|chats?|e-?mails?|tickets?|messages|sms|texts|viber|whatsapp|messenger)\b/.test(dutyWork);
  const titlePhone = tPhone && !(tOnlyHotline && writtenReply && !UNTIED_DUTY.test(dutyWork) && !phoneWork && !list);
  const titleNames = tChat || tEmail || titlePhone || tWritten;
  const phoneOut = hardNoPhone || ((softNoPhone || elsewhere(PHONE).test(work)) && !phoneWork && !voiceAccount);
  const chatOut = noChat || (elsewhere(CHAT).test(work) && !/\b(answer|answering|reply to|replying to|respond to|responding to|handle|handling)\b[^.;]{0,20}\bchats?\b/.test(work));
  const emailOut = noEmail || (elsewhere(`e-?mails?|email`).test(work) && !/\b(answer|answering|reply to|replying to|respond to|responding to|handle|handling)\b[^.;]{0,20}\be-?mails?\b/.test(work));
  // With a channel in the title, the description adds one only by the agent's work or a list.
  const phone = !phoneOut && (titlePhone || phoneWork || list || onlyPhone || (!titleNames && (phoneMention || ((phoneExperience || inboundOnly) && !chatIn && !emailIn))));
  // A title that only says "non-voice" leaves chat or email to the description.
  const titleSays = tChat || tEmail || titlePhone;
  // (By the agent's work, never a qualification: "Must have experience replying to emails" adds no email; the eighteenth.)
  const workDone = work.replace(QUALIFIED_IN, " ");
  const chat = !chatOut && (tChat || (chatIn && (!titleSays || list || /\b(answer|answering|reply to|replying to|respond to|responding to|handle|handling)\b[^.;]{0,20}\b(live )?chats?\b/.test(workDone))));
  const email = !emailOut && (tEmail || (emailIn && (!titleSays || list || /\b(answer|answering|reply to|replying to|respond to|responding to|handle|handling)\b[^.;]{0,25}\b(e-?mails?|tickets?)\b/.test(workDone))));

  // A list names a written channel even when it is only "text" or "SMS".
  // (...and a hotline that keeps its phone beside a written reply adds that reply, whichever channel it names: "24/7 Hotline
  // Agent / Assist customers with their orders. Reply to messages on Facebook as backup" is a mix; the eighteenth.)
  const hotlineReply = tOnlyHotline && titlePhone && writtenReply;
  const written = chat || email || (list && !chatOut) || (tWritten && !chatOut) || (hotlineReply && !(chatOut && emailOut));
  if (phone && written) return "mixed";
  if (phone) return "phone";
  if (chat) return "chat";
  if (email) return "email";
  if (written) return "chat";
  // Nothing named: a bare "CSR", a receptionist or an operator takes calls; anything else, chat.
  if (!phoneOut && /\b(csr|receptionist|operator|front desk|scheduler|patient (services?|access) (rep|representative|coordinator|specialist))s?\b/.test(title) && !strongNoPhone) return "phone";
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
// Where most applicants read English as their first language: no note about second-language readers.
const ENGLISH_FIRST = new Set(["US", "GB", "CA", "AU", "NZ", "IE"]);
// The note for a job that is not remote: its typing is not counted (assessmentRecord, trigger-ava-analysis).
// (The rule only, never "this one's": the AI plan's post can still say remote where the brief did not; the fourteenth review.)
const NOT_TIMED = " Typing speed counts only for a remote job, since an on-site job's chat may be done on a phone.";

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
  // What the plan's notes tell the business is only what this job gets (the
  // fifth product review, a US dental office hiring a receptionist on site):
  // typing is timed only for a remote job (an on-site job's chat may be done
  // on a phone, and neither trigger-ava-analysis nor assessmentRecord counts
  // its typing); second-language readers are named only where the applicants
  // will be (a remote job, or a place outside the English-first countries);
  // and no step is promised that this flow does not build (no practice call:
  // the written interview's call questions are what a phone job gets).
  // Remote is the brief's work mode, which Publish saves as is_remote
  // (jobFromFlow.ts) and trigger-ava-analysis reads: the Type field, the
  // place, or the title or What they do saying so in so many words
  // ("Permanent work from home" with the Type left on On-site; briefFromForm,
  // by Publish's own rule). The thirteenth Phase 4 review read What they do
  // here; the fourteenth found the AI plan's post rewords it, so a note said
  // typing was measured on a job Publish saved on site.
  // (The fifteenth: What they do counts only by a line that is nothing but the setup (briefFromForm). Publish now saves
  // is_remote as this work mode on both plans (jobFromFlow.ts) and never reads the post's words, so the note and the saved job
  // agree; the sixteenth review found this comment still said otherwise. NOT_TIMED states the rule only, as before.)
  const remote = brief.workMode === "remote";
  const country = inferCountryCode(brief.location);
  const secondLanguage = remote || (!!country && !ENGLISH_FIRST.has(country));
  const hasInterview = out.some((p) => p.kind === "voice_interview");

  const quizIndex = out.findIndex((p) => p.kind === "quiz");
  const quizSeconds = pack.skills.reduce((sum, q) => sum + q.time_limit_seconds, 0);
  const quiz: ScreeningPhase = {
    ...(quizIndex >= 0 ? out[quizIndex] : { id: "ph_quiz", order: 1, weight: 0.25, scoringMode: "auto" as const }),
    kind: "quiz",
    title: CS_SKILLS_TITLE,
    candidateDescription: CS_SKILLS_DESCRIPTION,
    rationale: `Five situations from ${pack.business}, each with one right answer, ${secondLanguage ? "written so a careful second-language reader can answer in time" : "in plain words, with time to read each one"}.`,
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
        ? `One real ${pack.counterpart} conversation from ${pack.business}, typed${remote ? ", with typing speed measured as they reply" : ""}.${hasInterview ? " The written interview asks how they handle calls." : ""}${remote ? "" : NOT_TIMED}`
        : `One real ${pack.counterpart} chat from ${pack.business}${remote ? ", with typing speed and reply time measured as they write" : ""}.${remote ? "" : NOT_TIMED}`,
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
      // and a sentence with the one before it, unless either names a written
      // channel: a call set up first and then a question about it ("You're on
      // the phone with a customer. How do you handle it if they start
      // yelling?"; the seventh), or a statement after it ("A patient is
      // shouting. They are on the phone."); never an upset line followed by a
      // question about something else ("...upset with you. How many calls a
      // day did you take?"; the sixth). "Mr." and "Dr." end no sentence.
      const WRITTEN_CHANNEL = /\b(chats?|live chat|e-?mails?|messages?|texts?|sms|tickets?)\b/i;
      const onCall = (sentence: string) => /\b(calls?|callers?|phones?|on the line)\b/i.test(sentence) && !/\bby (e-?mail|chat)\b/i.test(sentence);
      // A question pairs with the call before it only when it is about that
      // caller ("...if they start yelling?", "...calm down an irate customer?"),
      // never about a coworker, a manager or a project (the eighth review); a
      // caller asking for a manager is still the caller ("...shouting and asked
      // for your manager?"; the ninth).
      const CALLER = /\b(they|them|their|he|she|him|her|(a|an|the|this|that|your|our)\s+([\w-]+\s+)?(caller|customer|patient|player|person|guest|member|client|shopper|buyer|user))\b/i;
      const ASKS_FOR_A_BOSS = /\b(ask\w*|demand\w*|want\w*|request\w*|insist\w*|speak(ing)?|talk(ing)?|transfer\w*|escalat\w*|pass\w*|hand\w*|check(ing)?|get(ting)?)\s+((them|it|the call|the caller|over|on)\s+)*((for|to|with)\s+)?((a|an|the|your|their|his|her|our)\s+)?(manager|supervisor|boss|team ?lead(er)?)\b/gi;
      // (A sentence whose subject is the customer is about the customer, whatever else it names: "A customer
      // says the training video you sent was useless and gets angry"; the tenth review.)
      const CUSTOMER_SUBJECT = /^\s*(a|an|the|this|that|your|our)\s+([\w-]+\s+)?(caller|customer|patient|player|guest|member|client|shopper|buyer|user)s?\b/i;
      const aboutColleague = (sentence: string) => !CUSTOMER_SUBJECT.test(sentence) && /\b(coworker|co-worker|colleague|manager|boss|supervisor|team ?mate|team ?lead(er)?|project|training)\b/i.test(sentence.replace(ASKS_FOR_A_BOSS, " "));
      // A question pairs only with a call set up as a statement ("You take calls all day."), never with
      // another question ("How many calls a day did you handle? How would you handle a rude customer?"),
      // and never about someone in person ("...an angry customer in our store?", "...walked into the
      // office?"; the tenth review).
      const IN_PERSON_Q = /\b(in person|face[- ]to[- ]face|walk\w*\s+(in|into|up to)|at the (counter|desk|front desk|register)|in (our|the) (store|shop|office|clinic|lobby|branch|restaurant|waiting room))\b/i;
      const sentences = (prompt: string) => {
        const parts = prompt.split(/(?<=[.?!])(?<!\b(?:Mr|Mrs|Ms|Dr|St|No|vs|etc)\.)\s+/);
        const pairs = parts
          .slice(1)
          .map((part, i) => [parts[i], part])
          .filter(([a, b]) => !WRITTEN_CHANNEL.test(a) && !WRITTEN_CHANNEL.test(b) && !aboutColleague(b) && !IN_PERSON_Q.test(b) && (!/\?\s*$/.test(b) || (!/\?\s*$/.test(a) && onCall(a) && CALLER.test(b))));
        return [...parts, ...pairs.map(([a, b]) => `${a} ${b}`)];
      };
      // (Frustrated, aggressive or difficult callers are angry ones too: "Tell me about a time you handled a difficult caller"; the twelfth review.)
      // (...frustrated or aggressive only of the other person, "a frustrated caller", "a caller who becomes aggressive", "A customer
      // on the line is frustrated", never the agent's own: "How do you keep from getting frustrated on busy call days?", "...calls
      // when you are frustrated"; the thirteenth.)
      // (...and the other person's frustration as a noun, a frustrating call, a caller being aggressive or getting more and more
      // frustrated: "How do you handle frustrating calls?", "a caller's frustration on the phone", "customer frustration over the
      // phone", "A caller is being aggressive on the phone", "How do you de-escalate frustration on a call?"; the fourteenth. The
      // agent's own still is not: "the frustration of back-to-back calls".)
      // (Each only as its evidence was, the fifteenth: a frustrating call, never "frustrating" as a verb, "How do you keep calls
      // short without frustrating customers?"; de-escalating frustration or theirs, never "the frustration you feel after a long
      // call", the agent's own.)
      // (The sixteenth: frustrating callers are frustrating calls, "How do you handle frustrating callers?", and so is the
      // frustration of a caller, "How would you de-escalate the frustration of a caller who has been on hold for an hour?",
      // never the agent's, "the frustration you feel". "Frustrating customers" stays out: it is the verb as often as not.)
      // (The seventeenth: never the verb after without, avoid, never or not, as the fifteenth's "frustrating customers" was: "How do
      // you keep calls short without frustrating callers?", "What do you do to avoid frustrating callers with long holds?".)
      const OTHERS_TEMPER = /\b(frustrated|aggressive) (callers?|customers?|patients?)\b|(?<!\b(without|avoid|avoiding|never|not)\s)\bfrustrating (calls?|callers?)\b|\b(callers?|customers?|patients?)(['’]s?)? frustration\b|\bde-?escalat\w*\s+((the|their|that)\s+)?frustration\b(?!\s+(you|i|we)\b)|\b(callers?|customers?|patients?|calls?|they|he|she)\b((?!\b(you|i|we)\b)[^.?!]){0,30}?\b(is|are|was|were|gets?|got|getting|becomes?|became|becoming|turns?|turned|seems?|sounds?)\s+((being|very|really|so|quite|increasingly|already|more and more|more)\s+){0,2}(frustrated|aggressive)\b/i;
      const asksAngryCaller = (prompt: string) =>
        sentences(prompt).some((x) => onCall(x) && (OTHERS_TEMPER.test(x) || /\b(angry|upset|furious|irate|rude|abusive|difficult (callers?|customers?|patients?|calls?)|shout\w*|yell\w*|scream\w*|swear\w*|talk\w* over)\b/i.test(x)));
      // On hold is a person on hold ("put a caller on hold", "put patients on
      // hold"), or on a call; never a project, a ticket or a feeling (the sixth).
      const PERSON = String.raw`(them|him|her|someone|somebody|anyone|people|callers?|customers?|patients?|players?|guests?|members?|clients?|users?|shoppers?|buyers?)`;
      const putOnHold = new RegExp(String.raw`\b(put|putting|place|placing|keep|keeping)\s+((a|an|the|their|our|your|some|any|every)\s+)?(\w+\s+)?${PERSON}\s+on hold\b(?!\s+times?)`, "i");
      const asksHoldOrTransfer = (prompt: string) =>
        sentences(prompt).some(
          (x) =>
            putOnHold.test(x) ||
            // (...or escalating it: "How would you escalate a call to your supervisor?"; the twelfth review.)
            (onCall(x) && /\b(on hold(?!\s+times?)|(transfer(s|red|ring)?|escalat(e|es|ed|ing)) (the |a |their )?(call|caller|them|it)|pass\w* (them|the call|the caller|it) (on|to))\b/i.test(x)),
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
