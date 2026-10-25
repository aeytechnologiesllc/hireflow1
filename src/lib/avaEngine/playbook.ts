/**
 * Adaptive playbook — rule-based follow-ups, rigor recommendation, and reasoning
 * lines keyed off the brief (mirrors AvaFlowPreview prototype).
 */
import type { BriefAnswer, JobBrief, Rigor } from "./types";
import { CS_CHANNEL_CHIPS, CS_INDUSTRY_CHIPS, channelForBrief, industryFromText } from "./customerService.ts";

export type Family = "customer_service" | "cash" | "cleaner" | "admin" | "developer" | "general";

export interface FollowUpDef {
  id: string;
  question: string;
  chips: string[];
  def: number;
}

// Remote-critical follow-ups. For remote roles, reliable internet + the right
// computer/equipment are the make-or-break factors, so Ava asks about them up front.
export const REMOTE_FOLLOWUPS: FollowUpDef[] = [
  {
    id: "remote-internet",
    question: "This role is remote — how solid does their home internet need to be?",
    chips: ["Basic broadband is fine", "Reliable, video-call ready", "Fast wired connection required"],
    def: 1,
  },
  {
    id: "remote-equipment",
    question: "What computer or equipment will they work on?",
    chips: ["We provide the computer", "They use their own computer", "Own computer + specific specs"],
    def: 0,
  },
];

/** Append the remote-critical follow-ups (internet + equipment) for remote roles. */
export function withRemoteFollowUps(defs: FollowUpDef[], workMode?: string): FollowUpDef[] {
  return workMode === "remote" ? [...defs, ...REMOTE_FOLLOWUPS] : defs;
}

export interface Playbook {
  label: string;
  /** The brief, when given, lets a follow-up start on the answer the business's own words point to. */
  followUps: (answers: Record<string, number>, brief?: Pick<JobBrief, "roleTitle" | "whatTheyDo">) => FollowUpDef[];
  reasoning: string[];
  rigor: { recommended: Rigor; rationale: string };
}

/**
 * Customer service, chat and phone, for any business (the niche: CLAUDE.md,
 * "Positioning"; docs/CUSTOMER-SERVICE-HIRING.md). This is only Ava's first
 * guess: the business confirms it with one click ("What kind of job is it?",
 * jobKindFollowUp below), so a wrong guess costs a click, not a wrong test.
 *
 * Read from the job's TITLE, where the role is named ("Customer service
 * representative", "Chat support agent", a clinic's front desk), or from a
 * description that says the job IS answering customers by chat, phone or
 * email. The role is the title's last word (its head noun, before any "for
 * ...", "at ...", " - ..." or brackets): "Online Store Chat Agent" is an
 * agent, "Delivery Driver" a driver, "Customer Service Cashier" a cashier.
 * Shop-floor, kitchen, trade, clinical, in-person, outbound-sales and office
 * roles keep their own family (the Phase 4 reviews, 2026-10-25).
 */
const CUSTOMER_WORD = String.raw`(customer|client|patient|caller|player|guest|member|buyer|shopper|user|visitor)s?'?`;
const CS_TITLE = new RegExp(
  [
    String.raw`\b(customer|client|guest|member|player) (services?|supports?|care|success|experience|happiness|relations)\b`,
    // "patient care" is nursing work; a patient services desk is customer service.
    String.raw`\bpatient (services?|experience|support) (agent|rep|representative|specialist|coordinator|advisor|associate)\b`,
    String.raw`\b(support|chat|phone|call|contact|help ?desk|service desk|technical support|tech support|it support|live chat|email support|non[- ]?\s?voice|voice) (agent|rep|representative|specialist|advisor|associate|executive|operator|officer)s?\b`,
    String.raw`\b(technical|tech|it|help ?desk) support technician\b`,
    // A support manager or lead of customers, not of operations or facilities.
    String.raw`\b(customer|client|chat|technical|tech|it|product|player|member) support (team )?(manager|lead|supervisor|team lead)s?\b`,
    String.raw`^\s*((senior|sr\.?|junior|jr\.?|remote|global|regional|night|day|associate|assistant|bilingual|lead)\s+)*support (team )?(manager|lead|supervisor|team lead)\b`,
    String.raw`\b(chat|email|phone|voice|technical|tech|player|tier[ -]?[123]) support\b`,
    // The Philippine BPO words: a voice or non-voice account, a BPO agent.
    String.raw`\b(non[- ]?\s?voice|voice) (account|csr|support)\b`,
    String.raw`\bbpo\b`,
    String.raw`\blive chat\b`,
    String.raw`\b(call|contact) cent(er|re)\b`,
    String.raw`\b(help|service) ?desk\b`,
    String.raw`\bcsr\b`,
    String.raw`\bfront desk\b`,
    String.raw`\bpatient (coordinator|services?|scheduler|access|liaison)\b`,
    String.raw`\bappointment (scheduler|coordinator)\b`,
    String.raw`\b(answering service|telephone) operator\b`,
  ].join("|"),
);
// A support title whose people are colleagues, not customers.
const NON_CUSTOMER_SUPPORT = /\b(hr|human resources|payroll|finance|financial|accounting|accounts payable|logistics|operations|ops|sales|peer|mental health|admin|administrative|office|clinical|field|production|facilities|marketing|engineering|legal|classroom|learning|student|family|child|youth|behavioral|behavioural|community|residential|disability|direct care|personal care|home care) support\b/;
// A clinic's front office is customer service (patients); its clinical
// assistants (vitals, chairside) are not, unless the job is virtual.
const FRONT_DESK = /\b(reception(ist)?|front office|front desk|medical office assistant|office assistant)\b/;
const PATIENT_CONTEXT = /\b(patients?|clinic|dental|dentist|orthodont|medical|doctor'?s?|physician|hospital|optometr|chiropract|physio)\b/;
// Patient admin roles count only when the work is patients' calls and bookings.
const PATIENT_ADMIN = /\b(medical secretary|scheduling coordinator|patient care coordinator|care coordinator|intake coordinator|appointment setter|(virtual|remote|online) (medical|dental|healthcare|health care) (assistant|receptionist|secretary)|(medical|dental|healthcare) virtual assistant)\b/;
const PATIENT_CALLS = /\bpatients?\b[\s\S]*\b(calls?|phones?|schedul\w*|book\w*|appointments?|reminders?)\b|\b(calls?|phones?|schedul\w*|book\w*|appointments?|reminders?)\b[\s\S]*\bpatients?\b/;
// The work itself is answering customers: a verb, a customer word, a channel;
// helping customers by a channel; incoming or inbound calls; answering chats;
// staffing a live chat or help desk; "customer service for / by ...". Never a
// bare mention ("live chat widget"), never "answer customer questions" alone
// (a teller or a waiter does that), never outbound calling.
const CS_WORK = new RegExp(
  [
    String.raw`\b(answer|answering|handle|handling|respond to|responding to|reply to|replying to|take|taking|field|fielding|manage|managing)\b[^.]{0,25}\b${CUSTOMER_WORD}\b[^.]{0,20}\b(chats?|calls?|phones?|e-?mails?|messages?|tickets?|enquir(y|ies)|inquir(y|ies))\b`,
    String.raw`\b(answer|answering|help|helping|assist|assisting|support|supporting|serve|serving|respond to|reply to)\b[^.]{0,25}\b${CUSTOMER_WORD}\b[^.]{0,30}\b(by|via|over|through|on|in|using)\s+(live chat|chat|chats|phone|phones|calls?|e-?mails?|tickets?|messages?|messenger|whatsapp|our website|the website)\b`,
    String.raw`\bchat(ting)? with (our |the )?(customers|clients|patients|visitors|shoppers|users|players|guests)\b`,
    String.raw`\b(answer|answering|handle|handling|take|taking|field|fielding)\b[^.]{0,15}\b(incoming|inbound)\b[^.]{0,10}\b(calls?|chats?|messages?)\b`,
    String.raw`\binbound (calls?|chats?|customer|support)\b`,
    String.raw`\b(answer|answering|handle|handling|reply to|replying to|respond to|responding to)\b[^.]{0,20}\b(live )?chats?\b`,
    String.raw`\b(work|working|staff|staffing|man|manning|cover|covering|run|running)\b[^.]{0,15}\b(live chat|help ?desk|support (inbox|queue|chat)|chat support)\b`,
    String.raw`\bcalls from (our |the )?(customers|clients|patients|players|guests)\b`,
    String.raw`\b(customer|client) (service|support) (agent|rep|representative|team|role|desk)\b`,
    // "customer service for an online store", "customer support by chat": the job itself, not a quality of it.
    String.raw`\b(customer|client) (service|support) (for|on behalf of) (our|an?|the|my|their)\b`,
    String.raw`\b(customer|client) (service|support) (by|via|over|through|on) (chat|phone|email|calls)\b`,
  ].join("|"),
);
// At a clinic, answering the phones IS the front desk.
const CLINIC_PHONES = /\banswer(ing)? (the )?(phones?|calls)\b/;
// Calling out to sell or to book demos is sales, whatever the title.
const OUTBOUND = /\b(cold[- ]?call\w*|outbound (calls?|calling|sales|dial\w*)|lead generation|telemarket\w*|door[- ]to[- ]door|book(ing)? (demos|sales meetings))\b/;
// Work done in person, with nothing remote about it.
const IN_PERSON = /\b(in[- ]store|in[- ]person|on the (shop |sales )?floor|at the (register|counter|till|front counter)|returns counter|walk[- ]in|face[- ]to[- ]face)\b/;
const REMOTE_CHANNEL = /\b(chats?|e-?mails?|phones?|calls?|remote|virtual|online|work from home|wfh)\b/;
// Role nouns of the shop floor, the kitchen, the road, the trades and the gym.
const MAIN_STREET_HEAD = /^(baristas?|cashiers?|servers?|waiters?|waitress(es)?|waitstaff|bartenders?|cooks?|chefs?|dishwashers?|janitors?|housekeepers?|maids?|cleaners?|drivers?|couriers?|pickers?|packers?|clerks?|tellers?|plumbers?|electricians?|mechanics?|nurses?|caregivers?|pharmacists?|lifeguards?|attendants?|instructors?|trainers?|stockers?|merchandisers?|baggers?|bussers?|hosts?|hostess(es)?|valets?|porters?|guards?|carpenters?|painters?|landscapers?|gardeners?|phlebotomists?)$/;
const MAIN_STREET_PHRASE = /\b((store|retail|shop|sales|warehouse|stock|floor) (associate|assistant|worker|operative)|pharmacy (tech|technician|assistant))\b/;
const CLINICAL_ASSISTANT = /\b(dental|medical|veterinary|vet|nursing|physical therapy|pt|optometric|ophthalmic|chiropractic) (assistant|aide|technician|tech)\b/;
// Other roles named in the title win over support WORDS in the description
// (an engineer whose service must "support 10k requests", an executive
// assistant who answers the phones), but not over a support title.
const OTHER_ROLE_TITLE = /\b(developer|engineer|programmer|coder|sales|sdr|bdr|account executive|closer|telemarket\w*|cold caller|lead generation|appointment setter|real estate|insurance agent|collections?|aide|designer|accountant|book-?keeper|manager|analyst|tester|qa|writer|copywriter|technician|receptionist|secretary|administrat\w*|admin|executive assistant|personal assistant|legal assistant|office assistant|paralegal|coordinator|marketer|recruiter|photographer)\b/;

/** The title's role phrase: before " for ...", " at ...", " - ...", brackets or a comma. */
function headPhrase(title: string): string {
  return title
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .split(/\s+[-–—|]\s+|,|\s+(?:for|at|in|with)\s+/)[0]
    .trim();
}

function isMainStreet(title: string): boolean {
  const head = headPhrase(title);
  const noun = head.split(/\s+/).pop() ?? "";
  if (MAIN_STREET_HEAD.test(noun)) return true;
  if (MAIN_STREET_PHRASE.test(head)) return true;
  return CLINICAL_ASSISTANT.test(head) && !/\b(virtual|remote|online)\b/.test(title);
}

function isCustomerService(brief: Pick<JobBrief, "roleTitle" | "whatTheyDo">): boolean {
  const title = (brief.roleTitle ?? "").toLowerCase();
  const work = (brief.whatTheyDo ?? "").toLowerCase();
  if (isMainStreet(title)) return false;
  if (NON_CUSTOMER_SUPPORT.test(title)) return false;
  if (IN_PERSON.test(`${title} ${work}`) && !REMOTE_CHANNEL.test(`${title} ${work}`)) return false;
  if (CS_TITLE.test(title)) return true;
  if (OUTBOUND.test(work)) return false;
  if (FRONT_DESK.test(title) && PATIENT_CONTEXT.test(`${title.replace(FRONT_DESK, " ")} ${work}`)) return true;
  if (PATIENT_ADMIN.test(title) && PATIENT_CALLS.test(work)) return true;
  if (/\bsupport\b/.test(title) && CS_WORK.test(work)) return true;
  if (OTHER_ROLE_TITLE.test(title)) return false;
  return CS_WORK.test(work) || (CLINIC_PHONES.test(work) && PATIENT_CONTEXT.test(work));
}

/** The families other than customer service, from the words (detectFamily). */
function otherFamily(brief: Pick<JobBrief, "roleTitle" | "whatTheyDo" | "employmentType">): Family {
  const s = `${brief.roleTitle} ${brief.employmentType} ${brief.whatTheyDo}`.toLowerCase();
  if (/clean|janitor|housekeep|custodi|maid|porter/.test(s)) return "cleaner";
  if (/develop|engineer|programmer|coder|software|frontend|front-end|back-?end|full-?stack|web dev|data scientist/.test(s))
    return "developer";
  if (/admin|secretar|reception|assistant|office|clerk|book-?keep|schedul|coordinat|data entry/.test(s)) return "admin";
  if (/manager|cashier|finance|account|teller|retail|server|barista|caf[eé]|waiter|waitress|host|sales|store|bank|restaurant|bartender/.test(s))
    return "cash";
  return "general";
}

/**
 * The first question Ava asks for every job: what kind of job it is, starting
 * on her guess from the business's words. One click puts a wrong guess right
 * (the fourth Phase 4 review: four rounds of word rules still misread some
 * titles, both ways). The answer travels in the brief's follow-ups, so both
 * plan builders read it through detectFamily.
 */
export const JOB_KIND_ID = "job-kind";
export const JOB_KIND_CHIPS = ["Answering customers by chat, phone or email", "Another kind of job"] as const;

export function jobKindFollowUp(brief: Pick<JobBrief, "roleTitle" | "whatTheyDo">): FollowUpDef {
  return { id: JOB_KIND_ID, question: "What kind of job is it?", chips: [...JOB_KIND_CHIPS], def: isCustomerService(brief) ? 0 : 1 };
}

export function detectFamily(brief: Pick<JobBrief, "roleTitle" | "whatTheyDo" | "employmentType"> & { followUps?: JobBrief["followUps"] }): Family {
  const kind = (brief.followUps ?? []).find((f) => f?.questionId === JOB_KIND_ID)?.answer;
  if (kind === JOB_KIND_CHIPS[0]) return "customer_service";
  if (kind === JOB_KIND_CHIPS[1]) return otherFamily(brief);
  return isCustomerService(brief) ? "customer_service" : otherFamily(brief);
}

export const PLAYBOOKS: Record<Family, Playbook> = {
  customer_service: {
    label: "customer service",
    followUps: (a, brief) => {
      // The channel starts on what the business's own words say ("Phone CSR", "inbound calls"), like the industry.
      const channelDefault = Math.max(0, ["chat", "phone", "email", "mixed"].indexOf(channelForBrief({ roleTitle: brief?.roleTitle ?? "", whatTheyDo: brief?.whatTheyDo ?? "", followUps: [] })));
      const channel = a["cs-channel"] ?? channelDefault;
      const industryDefault = CS_INDUSTRY_CHIPS.findIndex(([, id]) => id === industryFromText(`${brief?.roleTitle ?? ""} ${brief?.whatTheyDo ?? ""}`));
      const industry = a["cs-industry"] ?? industryDefault;
      const phone = channel === 1;
      // Phone, or a mix with phones in it: the agent takes calls too.
      const takesCalls = channel === 1 || channel === 3;
      return [
        { id: "cs-channel", question: "How will they talk to your customers?", chips: [...CS_CHANNEL_CHIPS], def: channelDefault },
        { id: "cs-industry", question: "What kind of business is it?", chips: CS_INDUSTRY_CHIPS.map(([label]) => label), def: industryDefault },
        {
          id: "cs-load",
          question: takesCalls ? "Besides calls, how many chats or messages at once?" : "How many chats or messages at once?",
          chips: ["One at a time", "Two or three", "Four or more"],
          def: 1,
        },
        { id: "cs-hours", question: "When will they work?", chips: ["Daytime", "Evenings or nights", "Weekends too", "Rotating shifts"], def: 0 },
        {
          id: "cs-sensitive",
          question: "What private details will they see?",
          chips: ["Nothing sensitive", "Payment details", "Health details", "ID documents"],
          def: CS_INDUSTRY_CHIPS[industry]?.[1] === "medical" ? 2 : CS_INDUSTRY_CHIPS[industry]?.[1] === "store" ? 1 : 0,
        },
        { id: "cs-tools", question: "What will they work in?", chips: ["Email and a chat box", "A help desk tool", "A phone system", "We'll train them"], def: phone ? 2 : 3 },
      ];
    },
    reasoning: [
      "Reading the role and who they'll talk to",
      "Matching real situations from your kind of business",
      "Choosing a skills check with clear right answers",
      "Picking the chat practice they'll face",
      "Writing the interview",
      "Building the scorecard",
    ],
    rigor: {
      recommended: "standard",
      rationale:
        "They speak for your business all day. A five-question skills check, one real customer chat and a short written interview show how they write, think and calm someone down, without a long test that loses good applicants.",
    },
  },
  cash: {
    label: "front-of-house / cash-handling",
    followUps: (a) => {
      const team = a["cash-team"] ?? 1;
      const teamLabel = ["", "your 2–4 person team", "your 5–10 person team", "a 10+ person team"][team] || "the team";
      return [
        { id: "cash-team", question: "Will this person manage a team?", chips: ["Solo for now", "2–4 staff", "5–10 staff", "10+ staff"], def: 1 },
        { id: "cash-money", question: "Do they handle cash, the till, or daily deposits?", chips: ["No money handling", "Light register use", "Full till + deposits"], def: 2 },
        {
          id: "cash-pressure",
          question: team >= 1 ? `Leading ${teamLabel}, how busy do shifts get?` : "How busy does a typical shift get?",
          chips: ["Calm & steady", "Steady with rushes", "High-volume, fast"],
          def: 2,
        },
      ];
    },
    reasoning: [
      "Reading the role and the day-to-day",
      "Weighing responsibility — cash, team, pressure",
      "Choosing the right screening steps",
      "Writing practical, on-the-floor scenarios",
      "Building the scorecard",
      "Preparing your shortlist criteria",
    ],
    rigor: {
      recommended: "high",
      rationale:
        "They'll handle the till and deposits, lead a team, and own open/close — a mishire here is expensive. A practical simulation plus a structured written interview protects you.",
    },
  },
  cleaner: {
    label: "cleaning / trust-based",
    followUps: (a) => {
      const access = a["cln-access"] ?? 2;
      return [
        { id: "cln-solo", question: "Will they mostly work on their own?", chips: ["Always solo", "Solo + occasional crew", "Part of a crew"], def: 0 },
        { id: "cln-access", question: "Will they have keys or access to private spaces?", chips: ["Public areas only", "Offices after hours", "Clients' homes / private"], def: 2 },
        {
          id: "cln-schedule",
          question: access >= 1 ? "Trust matters here — what hours is this?" : "What hours does this run?",
          chips: ["Daytime", "Evenings", "Early mornings", "Overnight"],
          def: 0,
        },
      ];
    },
    reasoning: [
      "Reading the role and the spaces involved",
      "Weighing trust, reliability & lone working",
      "Choosing a light-but-honest screen",
      "Writing real on-the-job scenarios",
      "Building the scorecard",
      "Preparing your shortlist criteria",
    ],
    rigor: {
      recommended: "standard",
      rationale:
        "This is a trust-and-reliability hire more than a technical one. A light screen plus a short written interview confirms dependability — without scaring off good, busy applicants.",
    },
  },
  admin: {
    label: "office / administrative",
    followUps: (a) => {
      const rec = a["adm-records"] ?? 2;
      return [
        { id: "adm-sched", question: "How much scheduling & calendar ownership?", chips: ["Light", "A few calendars", "Owns all scheduling"], def: 1 },
        { id: "adm-records", question: "Will they handle confidential records?", chips: ["No", "Some sensitive info", "Highly confidential"], def: 2 },
        {
          id: "adm-tools",
          question: rec >= 2 ? "Given the sensitive data, which tools will they live in?" : "Which tools will they live in?",
          chips: ["Email & docs", "Spreadsheets + CRM", "Full office suite + booking"],
          def: 1,
        },
      ];
    },
    reasoning: [
      "Reading the role and the day-to-day",
      "Weighing organization & confidentiality",
      "Choosing a focused, fair screen",
      "Writing real inbox & calendar scenarios",
      "Building the scorecard",
      "Preparing your shortlist criteria",
    ],
    rigor: {
      recommended: "standard",
      rationale:
        "They'll own scheduling and sensitive records. A focused screen on organization and discretion is enough — no need to over-test a support role.",
    },
  },
  developer: {
    label: "software / technical",
    // No code-test question: no applicant screen runs one (templateGenerator.ts).
    followUps: () => [
      { id: "dev-stack", question: "What's the core stack?", chips: ["Frontend", "Backend", "Full-stack", "Mobile"], def: 2 },
      { id: "dev-setup", question: "What's the work setup?", chips: ["On-site", "Hybrid", "Fully remote"], def: 2 },
    ],
    reasoning: [
      "Reading the role and the stack",
      "Weighing skills, ways of working & remote setup",
      "Choosing a fair screen",
      "Writing questions about real work, not trivia",
      "Building the scorecard",
      "Preparing your shortlist criteria",
    ],
    rigor: {
      recommended: "high",
      rationale:
        "Skill claims are easy to inflate. A structured written interview about work they have really shipped gives you signal before you spend live interview time.",
    },
  },
  general: {
    label: "this role",
    followUps: () => [
      { id: "gen-team", question: "Will this person manage a team?", chips: ["Solo for now", "2–4 staff", "5+ staff"], def: 0 },
      { id: "gen-cust", question: "Is the role customer-facing?", chips: ["Behind the scenes", "Some customer contact", "Front-line"], def: 1 },
      { id: "gen-pressure", question: "How busy does a typical shift get?", chips: ["Calm & steady", "Steady with rushes", "High-volume, fast"], def: 1 },
    ],
    reasoning: [
      "Reading the role and the day-to-day",
      "Weighing what this role really needs",
      "Choosing the right screening steps",
      "Writing practical, role-specific scenarios",
      "Building the scorecard",
      "Preparing your shortlist criteria",
    ],
    rigor: {
      recommended: "standard",
      rationale: "A balanced screen fits most roles — enough signal to rank well without over-testing good applicants.",
    },
  },
};

export function chipAnswersToBriefAnswers(
  followUps: FollowUpDef[],
  chipIndex: Record<string, number>,
): BriefAnswer[] {
  return followUps.map((fu) => {
    const idx = chipIndex[fu.id] ?? fu.def;
    const chip = fu.chips[idx] ?? fu.chips[fu.def] ?? "";
    return { questionId: fu.id, question: fu.question, answer: chip };
  });
}

export function briefFromForm(fields: {
  role: string;
  location: string;
  type: string;
  pay: string;
  start: string;
  work: string;
  workMode?: string;
  openings?: number;
  followUps?: BriefAnswer[];
  benefits?: string[];
}): JobBrief {
  const typeLower = fields.type.toLowerCase();
  let employmentType: JobBrief["employmentType"] = "full_time";
  if (typeLower.includes("part")) employmentType = "part_time";
  else if (typeLower.includes("contract")) employmentType = "contract";

  let workMode: JobBrief["workMode"] = "onsite";
  const wm = (fields.workMode ?? fields.type).toLowerCase();
  if (wm.includes("remote") && !wm.includes("hybrid")) workMode = "remote";
  else if (wm.includes("hybrid")) workMode = "hybrid";

  let startUrgency: JobBrief["startUrgency"] = "few_weeks";
  const st = fields.start.toLowerCase();
  if (st.includes("asap") || st.includes("immediately") || st.includes("now")) startUrgency = "asap";
  else if (st.includes("flex")) startUrgency = "flexible";

  return {
    roleTitle: fields.role.trim(),
    location: fields.location.trim(),
    workMode,
    employmentType,
    pay: fields.pay.trim(),
    startUrgency,
    whatTheyDo: fields.work.trim(),
    followUps: fields.followUps ?? [],
    openings: fields.openings ?? 1,
    benefits: fields.benefits ?? [],
  };
}
