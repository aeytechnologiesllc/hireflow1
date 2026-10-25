/**
 * Adaptive playbook — rule-based follow-ups, rigor recommendation, and reasoning
 * lines keyed off the brief (mirrors AvaFlowPreview prototype).
 */
import type { BriefAnswer, JobBrief, Rigor } from "./types";
import { CS_CHANNEL_CHIPS, CS_INDUSTRY_CHIPS, HOW_TO_APPLY, channelForBrief, industryFromText } from "./customerService.ts";
import { placeSaysRemote } from "../jobLocation.ts";

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
    String.raw`\bcs (agent|rep|representative|associate|specialist|advisor)s?\b`,
    String.raw`\b(tsr|csa)s?\b`,
    String.raw`\b(l[123]|level [123]|tier [123]) (support|help ?desk)\b`,
    // A virtual receptionist answers calls for businesses; an office's own receptionist is admin.
    String.raw`\b(virtual|remote|online) (receptionist|front desk)s?\b`,
    String.raw`\bfront desk\b`,
    String.raw`\bpatient (coordinator|services?|scheduler|access|liaison)\b`,
    String.raw`\bappointment (scheduler|coordinator)\b`,
    String.raw`\b(answering service|telephone|switchboard) operator\b`,
    // "Customer Advisor" is a call-centre title (a financial advisor is not).
    String.raw`\b(customer|client|member|guest|billing) (advisors?|advisers?)\b`,
  ].join("|"),
);
// A reservations or booking agent takes customers' bookings by phone, email or
// chat; one who books musicians, bands or DJs, freight or models, or greets
// diners at the host stand, does not (the sixth and seventh Phase 4 reviews:
// "Spanish speakers preferred", "this role acts as", "seat changes" are not
// that). Words that are also a guest business's are what is booked, never on
// their own: "book loads", "book models", not "a high call load", "car
// models", "our technicians", "airline carriers" (the ninth review). Carriers
// are a freight broker's when the work deals with them ("negotiate rates with
// carriers", "call carriers", "secure capacity"), never "book flights on major
// carriers"; a model's or a singer's bookings, a show or a speaking slot, and
// an event's catering and conferences are not a customer's either, but a
// travel agency's group tours are (the tenth review).
const BOOKING_TITLE = /\b(reservations?|bookings?)( and bookings?)? (agent|rep|representative|specialist|associate|coordinator|officer)s?\b/;
const NOT_GUEST_BOOKING = new RegExp(
  String.raw`\b(musicians?|artists?|bands?|djs?|gigs?|performers?|entertainers?|magicians?|singers?|photo shoots?|comedians?|talent (agency|booking|roster)|booking talent|book(ing)? talent|roster|touring|tour dates|book(ing)? (speakers|acts|models|venues|loads|trucks|carriers|shows|festival\w*)|speaking engagements?|bookings? (for|of) (our |their |the )?(models|talent|clients'? (bands|acts))|model(ing|ling)? (agency|bookings?)|freight|cargo|shipping|shipments?|containers?|trucking|truckloads?|(truck|freight) loads?|loads? (with|for|from) (carriers|trucks|drivers|shippers)|load boards?|shippers?|logistics|(secure|securing|find|finding) (trucks|capacity)|capacity (with|from) carriers|(negotiat\w*|call|calling|contact\w*|vet|vetting|source|sourcing|dispatch\w*) ((rates|fees) )?(with )?(our |the )?carriers|carriers,? (and )?(negotiat\w*|rates)|give tours|plan(s|ning)? group tours|contract hotels|conferences|corporate events|event planning|host stand|greet(ing)? diners|seat(ing)? (diners|guests|people))\b`,
);
const BOOKS_OWN_STAFF = /\b(schedul\w*|assign\w*|dispatch\w*|coordinat\w*|rout\w*|book\w*)\s+(our |the |their )?([\w-]+\s+)?(crews?|technicians?|techs|drivers|staff|teams?|workers|cleaners|installers|jobs)\b/;
// Selling or collecting by phone is sales, whatever support words the title
// also has ("Outbound CSR", "Telesales CSR", "Voice Account - Sales", "Call
// Center - Collectors"; the tenth review).
const SALES_TITLE = /\b(outbound|telesales|tele-sales|sales|cold[- ]?call\w*|collections?|collectors?|appointment setter|telemarket\w*|lead generation)\b/;
// After-sales and pre-sales service is not selling (the sixth Phase 4 review).
const SERVICE_SALES = /\b(after|pre)[- ]?sales\b/g;
// "Sales & Service" is selling unless the work is answering customers and
// nothing in it sells (the seventh: "Customer Service & Sales Rep / cold call
// leads" is sales; "CSR (Sales & Service) / answer inbound billing calls" is not).
const SALES_AND_SERVICE = /\bsales\s*(&|and|\/)\s*(customer\s+)?(service|support)\b|\b(customer\s+)?(service|support)\s*(&|and|\/)\s*sales\b/;
const SELLING_WORK = /\b(quotas?|upsell\w*|cross-?sell\w*|close deals|closing deals|showroom|commissions?|sales targets?|process sales|make sales)\b/;
// A professional's role noun: customer service only with real support work
// in the description ("Support Engineer — answer customer tickets"), never
// from the title's words alone ("Live Chat Software Developer").
const PROFESSIONAL_HEAD = /^(engineers?|developers?|programmers?|designers?|analysts?|architects?|scientists?|recruiters?|accountants?|bookkeepers?|marketers?|copywriters?|writers?|testers?|consultants?|lawyers?|attorneys?|paralegals?|veterinarians?|therapists?|coaches?|preparers?)$/;
// ...except a support desk's analyst or consultant, who IS its agent ("Help Desk
// Analyst", "Customer Support Consultant"; the sixth Phase 4 review).
const DESK_ANALYST = /\b(((customer|client|player|member) (service|services|support|success|care)|help ?desk|service desk|(technical|tech|it) support|tier[ -]?[123] support) (analyst|consultant)|(l[123]|level [123]|tier [123]) support (engineer|analyst|consultant))s?$/;
// A support title whose people are colleagues, not customers.
// (Unless the work is answering customers by a channel: a game's "Community
// Support Specialist" who answers player tickets is; an admin's "client calls" are not enough.)
const CUSTOMERS_BY_CHANNEL = /\b(customer|player|patient|guest|member|shopper|buyer|user)s?'?\b[^.]{0,30}\b(chats?|calls?|tickets?|e-?mails?|messages?)\b/;
const NON_CUSTOMER_SUPPORT = /\b(hr|human resources|payroll|finance|financial|accounting|accounts payable|logistics|operations|ops|sales|peer|mental health|admin|administrative|office|clinical|field|production|facilities|marketing|engineering|legal|classroom|learning|student|family|child|youth|behavioral|behavioural|community|residential|disability|direct care|personal care|home care) support\b/;
// A clinic's front office is customer service (patients); its clinical
// assistants (vitals, chairside) are not, unless the job is virtual.
const FRONT_DESK = /\b(reception(ist)?|front office|front desk|medical office assistant|office assistant)\b/;
// "Pet owners" are a vet's patients; a pet-friendly office is not a clinic (the sixth Phase 4 review).
const PATIENT_CONTEXT = /\b(patients?|clinic|dental|dentist|orthodont\w*|medical|doctor'?s?|physician|hospital|optometr\w*|chiropract\w*|physio\w*|physical therapy|urgent care|dermatolog\w*|pediatric\w*|paediatric\w*|ophthalm\w*|podiatr\w*|med ?spa|medical spa|botox|vet|veterinar\w*|animal hospital|pet owners?)\b/;
// A benefits line ("Benefits include medical and dental", "HMO") says nothing
// about the work: a line or sentence that starts with it, or one naming HMO or
// 13th-month pay; never across lines (the seventh Phase 4 review), except the
// bullets under a "Benefits:" heading. A plan offered to the employee is taken
// out by itself, wherever it is ("excellent medical and dental plans",
// "medical and dental insurance included", "we offer medical and dental"),
// never the business ("a medical and dental clinic") or a plan the work is
// about ("confirm their dental insurance", "check dental insurance
// eligibility", "their dental benefits"; the ninth). The tenth review: the
// usual US list ("Medical, dental, and vision insurance", "medical, dental
// and optical", "medical and dental reimbursement", "eligible for medical,
// dental and vision") left "dental" behind, so an office, hotel or salon
// front desk read as a clinic's; and a plan that is the work's object stays
// ("handle dental insurance verification", "collect medical insurance
// cards", "knowledge of dental insurance"). Every part is bounded or starts
// at a line or sentence, so a huge pasted line costs linear time.
const PLAN_WORD = String.raw`(medical|dental|vision|optical|eye|life|health|hospitali[sz]ation|prescription|disability|accident|maternity|hmo|401\(?k\)?)`;
const PLAN = String.raw`(medical|dental)((\s*(,|&|\/|\+)\s*(and\s+)?|\s+and\s+|\s+)${PLAN_WORD}){0,8}`;
const ABOUT_A_PLAN = String.raw`(?<!\b(their|his|her|your|its|patients?'?|clients?'?|customers?'?|members?'?|verify|verifying|check|checking|confirm|confirming|explain|explaining|process|processing|bill|billing|submit|submitting|file|filing|handle|handling|enter|entering|collect|collecting|update|updating|prepare|preparing|review|reviewing|obtain|obtaining|run|running|do|doing|about|regarding|knowledge of|understanding of|familiar with|familiarity with|experience (with|in))\s{1,2}([\w']+\s{1,2}){0,2})`;
// What a plan is when the work is about it: "dental insurance verification", "medical insurance cards", "dental insurance experience".
const PLAN_AS_WORK = String.raw`(?!\s+(verif\w*|information|info|cards?|claims?|details|eligibility|questions?|inquir\w*|enquir\w*|forms?|paperwork|billing|authori[sz]\w*|pre-?authori[sz]\w*|processing|records|providers?|compan(y|ies)|carriers?|payers?|experience|knowledge|background|terminology|codes?|coding)\b)`;
const BENEFIT_HEADING = String.raw`(benefits?|full benefits|perks?|we offer|what we offer|what you get|what you'll get|compensation|compensation (and|&) benefits|why (join us|work here|work with us))`;
const PERKS = new RegExp(
  [
    // A "Benefits:" heading and the bullets under it.
    String.raw`(?<=^|\n)[ \t]*([-•*][ \t]*)?${BENEFIT_HEADING}[^\n:.;]{0,30}:[ \t]*(\n[ \t]*[-•*·▪◦✓✔➢][^\n]*)+`,
    String.raw`(^|[\n.;])[ \t]*([-•*][ \t]*)?${BENEFIT_HEADING}\b[^.;\n]*`,
    String.raw`(?<=^|[\n.;])[^.;\n]*\b(13th[- ]month|401\(?k\)?)[^.;\n]*`,
    // (An HMO the work is about stays: "verify patients' HMO", "process HMO claims", "coordinate with HMO providers".)
    String.raw`(?<=^|[\n.;])(?![^.;\n]*\b(patients?'?|members?'?|verify\w*|check\w*|process\w*|claims?|accredit\w*|approvals?|loa|providers?|coordinat\w*|billing)\b)[^.;\n]*\bhmo\b[^.;\n]*`,
    String.raw`\b(?=(medical|dental)\b)${ABOUT_A_PLAN}${PLAN}\s+(insurance|benefits?|coverage|plans?|cover|premiums?|reimbursements?|allowances?|subsid(y|ies))\b${PLAN_AS_WORK}`,
    String.raw`\b(offer(s|ed|ing)?|enjoy|receive|get|plus|free|paid|full|comprehensive|excellent|great|generous|competitive|eligible for|entitled to|qualify for|company-paid|employer-paid|100% paid)\s+([\w-]+\s+){0,2}?${PLAN}\b(?!\s+(services?|care|clinics?|cent(er|re)s?|offices?|practices?|groups?|treatments?|procedures?|records|professionals?|facilit(y|ies)|team|staff|providers?|equipment|supplies|software|industry|field|front|reception\w*|admin\w*|billing|coding|terminology|settings?|environments?|support|experience|knowledge|background|scheduling|secretar\w*|assistants?|receptionists?|cleanings?|check-?ups?|exams?|visits?|appointments?))`,
    String.raw`\b${PLAN}\b(?=\s+(included|provided|offered|from day one|on day one|after \w+|upon \w+|for (you|employees|staff|dependents|your family)|starts?|begins?))`,
    // ...and a line or sentence that is nothing but the plans ("Medical/dental/vision.").
    String.raw`(?<=^|[\n.;:])[ \t]*([-•*][ \t]*)?${PLAN}[ \t]*(?=[.;\n]|$)`,
  ].join("|"),
  "g",
);
// Patient admin roles count only when the work is patients' calls and bookings.
const PATIENT_ADMIN = /\b(medical secretary|scheduling coordinator|((medical|dental|patient) )?schedulers?|patient care coordinator|care coordinator|intake coordinator|appointment setter|(virtual|remote|online) (medical|dental|healthcare|health care) (assistant|receptionist|secretary)|(medical|dental|healthcare) virtual assistant)\b/;
// (Patients and their calls or bookings anywhere in the words, tested apart so a huge pasted line costs linear time; the tenth review.)
const patientCalls = (work: string) => /\bpatients?\b/.test(work) && /\b(calls?|phones?|schedul\w*|book\w*|appointments?|reminders?)\b/.test(work);
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
    String.raw`\binbound (calls?|chats?|support|customer (calls?|chats?|questions?|enquir\w+|inquir\w+|service|support))\b`,
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
// Work done in person, with nothing remote about it: a counter, a gate, a
// branch, a lobby, greeting or checking people in (the sixth Phase 4 review).
// (A clinic's front desk greets and checks in patients and is customer service:
// isCustomerService leaves patient work to the clinic rules below. "Check in
// with customers" is a follow-up, not a desk; the seventh Phase 4 review.)
const IN_PERSON = /\b(in[- ]store|in[- ]person|on the (shop |sales )?floor|at the (register|counter|till|front counter|gate|branch|airport|front of|host stand)|(service|returns|parts|bakery|airport) counter|(work|working|behind|man|manning|staff|staffing)( at)? the (front |service )?(counter|desk)|(grocery|supermarket|convenience|department) stores?|run the register|ring(ing)? up|walk[- ]in|face[- ]to[- ]face|in the (hotel )?lobby|theme park|greet(ing)? (our |the )?(guests|members|visitors|residents|diners|patrons|shoppers|passengers)|greet(ing)? (our |the )?customers (as they|when they|at (the|our)|in (the|our))|greet(ing)? (our |the )?customers,? (and )?(process|help them find|ring|direct|check)|check(ing)? (them|guests|members|passengers|visitors|people|residents|hotel guests|gym members|customers|clients) in\b(?! with)|check(ing)?[- ]in (hotel )?(guests|members|passengers|visitors|people|residents|customers|clients|vehicles|cars|bags|luggage)\b(?! with)|check-?in (desk|counter)|(post office|ticket|check-in) counter|(at|in) (our|the) (bank )?branch(es)?|bank branch|bus terminal|box office|sell tickets|check bags|pickup desk|at the service desk|(help|helping|assist|assisting|serve|serving)\s+(our |the )?(customers|shoppers|guests|clients|patrons)\s+(at|in|inside)\s+(our|the)\s+(?!\d)([\w-]+\s+){0,2}(stores?|shops?|branch(es)?|showrooms?|restaurants?|cafes?|pharmac(y|ies)|counters?|outlets?|malls?|dealerships?|supermarkets?|boutiques?))\b/;
// (Helping customers in the store is the floor, the tenth review: "CSR | Retail / Help customers in our store", "Help customers at our cell phone store".)
// A telephone, a voice account or a hotline is a remote channel too ("by telephone", "via voice", "our delivery hotline"; the tenth review).
const REMOTE_CHANNEL = /\b(chats?|e-?mails?|phones?|telephones?|(?<!\b(brand|of)\s)voice(?!\s+of\b)|hotlines?|calls?|tickets?|zendesk|freshdesk|help ?desk|inbox|messages?|whatsapp|messenger|viber|sms|texts?|remote|virtual|online|work from home|wfh)\b/;
// Role nouns of the shop floor, the kitchen, the road, the trades and the gym.
const MAIN_STREET_HEAD = /^(baristas?|cashiers?|servers?|waiters?|waitress(es)?|waitstaff|bartenders?|cooks?|chefs?|dishwashers?|janitors?|housekeepers?|maids?|cleaners?|drivers?|couriers?|pickers?|packers?|tellers?|plumbers?|electricians?|mechanics?|nurses?|caregivers?|pharmacists?|lifeguards?|instructors?|trainers?|stockers?|merchandisers?|baggers?|bussers?|valets?|porters?|guards?|carpenters?|painters?|landscapers?|gardeners?|phlebotomists?|bellm[ae]n|bellhops?)$/;
// Clerks, attendants and hosts: shop floor unless the role phrase is a support
// one ("Customer Service Clerk", "Live Chat Host") or a clinic's front desk. A
// desk you stand at is a place, not a support role: "Front Desk Clerk" at a
// hotel, "Customer Service Desk Clerk" at a supermarket (the sixth Phase 4 review).
const MAIN_STREET_HEAD_WEAK = /^(clerks?|attendants?|hosts?|hostess(es)?)$/;
const DESK_PLACE = /\b(front|service|information|reception|check-?in) desk\b/;
const MAIN_STREET_PHRASE = /\b((store|retail|shop|sales|warehouse|stock|floor) (associate|assistant|worker|operative)|pharmacy (tech|technician|assistant))\b/;
// An online shop's assistant answers customers from a screen, not a counter.
const ONLINE_SHOP = /\b(online|shopify|etsy|amazon|ebay|e-?commerce|lazada|shopee|web ?shop|virtual|remote)\b/;
const CLINICAL_ASSISTANT = /\b(dental|medical|veterinary|vet|nursing|physical therapy|pt|optometric|ophthalmic|chiropractic) (assistant|aide|technician|tech)\b/;
// Other roles named in the title win over support WORDS in the description
// (an engineer whose service must "support 10k requests", an executive
// assistant who answers the phones), but not over a support title.
const OTHER_ROLE_TITLE = /\b(developer|engineer|programmer|coder|sales|sdr|bdr|account executive|closer|telemarket\w*|cold caller|lead generation|appointment setter|real estate|insurance agent|collections?|aide|designer|accountant|book-?keeper|manager|analyst|tester|qa|writer|copywriter|technician|receptionist|secretary|administrat\w*|admin|executive assistant|personal assistant|legal assistant|office assistant|paralegal|coordinator|marketer|marketing|seo|recruiter|photographer|coach|advisor|adviser|officer|preparer|consultant|veterinarian|vet|doctor|dentist|therapist|lawyer|attorney|tutor|teacher|nutritionist|nurse|nursing|triage|caregiver|clinician)\b/;

// A word that names a role. A part of the title without one is where, when or
// how the job is worked ("Remote", "Makati", "Full Time", "Hiring"), not the role.
const ROLE_WORD = /\b(agents?|reps?|representatives?|csrs?|specialists?|associates?|advisors?|advisers?|officers?|executives?|operators?|coordinators?|assistants?|receptionists?|secretar(y|ies)|support|services?|care|success|desks?|helpdesk|managers?|leads?|leaders?|supervisors?|analysts?|engineers?|developers?|programmers?|designers?|technicians?|tech|clerks?|attendants?|hosts?|hostess(es)?|moderators?|consultants?|admin|administrators?|staff|workers?|recruiters?|accountants?|book-?keepers?|writers?|copywriters?|testers?|marketers?|scientists?|architects?|trainers?|teachers?|tutors?|coaches?|setters?|callers?|telemarketers?|closers?|sdr|bdr|va|interns?|trainees?|aides?|liaisons?|ambassadors?|experts?|heroe?s?|ninjas?|gurus?|champions?|concierges?|schedulers?|directors?|heads?|paralegals?|lawyers?|attorneys?|preparers?|veterinarians?|therapists?|doctors?|dentists?|nurses?|drivers?|cooks?|chefs?|cashiers?|baristas?|servers?|waiters?|waitress(es)?|waitstaff|bartenders?|cleaners?|janitors?|housekeepers?|maids?|couriers?|pickers?|packers?|tellers?|plumbers?|electricians?|mechanics?|caregivers?|pharmacists?|lifeguards?|instructors?|stockers?|merchandisers?|baggers?|bussers?|valets?|porters?|guards?|carpenters?|painters?|landscapers?|gardeners?|phlebotomists?|photographers?|nutritionists?|billers?|coders?|editors?|riders?|bellm[ae]n|bellhops?|auditors?|translators?|illustrators?|animators?|bpo|account)\b/;
// The role words that name a person's role, not an industry or an account
// ("Healthcare Account - CSR", "Financial Services - CSR", "Tech - Customer
// Support Agent": the role is the CSR; the seventh Phase 4 review).
const WEAK_ROLE_WORD = /^(support|services?|care|success|desks?|account|tech|heads?|bpo)$/;
const hasStrongRoleWord = (text: string) => [...text.matchAll(new RegExp(ROLE_WORD.source, "g"))].some((m) => !WEAK_ROLE_WORD.test(m[0]));
// A role noun with nothing to say what kind ("Agent", "Specialist", "Team
// Leader"): the title says it in the next part ("Agent - Customer Service").
// (An analyst or a consultant before the part is one of that department's, not its agent: "Analyst - Customer Support".)
const BARE_ROLE = /^((senior|sr\.?|junior|jr\.?|lead|head|chief|principal)\s+)*(agents?|reps?|representatives?|specialists?|associates?|advisors?|advisers?|officers?|executives?|operators?|coordinators?|assistants?|leads?|leaders?|team leads?|team leaders?|supervisors?|managers?|staff|engineers?|technicians?|heroe?s?|trainees?|interns?)$/;
// A part that is only a channel names the bare role beside it ("Voice - Agents").
const CHANNEL_PART = /^(non[- ]?\s?voice|voice|chat|live chat|e-?mail|phone|inbound|blended|omni-?channel)$/;
// A computer's server is no waiter ("Technical Support - Minecraft Server").
const TECH_SERVER = /\b(game|web|mail|file|cloud|linux|windows|discord|minecraft|database|sql|dedicated|media|private|vps) servers?$/;
// The people a support line hires, with only when, where, how or in what
// language they work around them ("Night Shift Agents", "Bilingual Staff",
// "Level 1 Agents", "Agents Wanted"), never what kind of job ("Admin
// Assistant", "Store Manager", "Network Engineer"; the ninth Phase 4 review).
const LANGUAGE = String.raw`(english|spanish|tagalog|filipino|taglish|cebuano|bisaya|french|german|italian|portuguese|dutch|japanese|korean|mandarin|chinese|cantonese|vietnamese|thai|bahasa|malay|indonesian|hindi|arabic|hebrew|turkish|russian|polish)`;
const PEOPLE_QUALIFIER = String.raw`((night|day|mid|graveyard|evening|morning|weekend|overnight|rotating|shifting|flexible)( shift)?|shifts?|part[- ]?time|full[- ]?time|remote|work[- ]from[- ]home|wfh|home[- ]based|on[- ]?site|hybrid|bilingual|multilingual|trilingual|${LANGUAGE}([- ]speaking)?|native|senior|sr\.?|junior|jr\.?|lead|head|assistant|entry[- ]level|experienced|fresh grad(uate)?s?|new|level [1-3]|tier [1-3]|l[1-3]|voice|non[- ]?voice|inbound|us|uk|\d+)`;
// (A level after the noun is the same person: "Representative II", "Specialist I"; the tenth review.)
const LEVEL_AFTER = String.raw`(\s+(i{1,3}|iv|[1-3]))?`;
const WANTED = String.raw`(\s+(wanted|needed|hiring|now|asap|urgently|immediately))*`;
const LINE_PEOPLE = new RegExp(
  String.raw`^(${PEOPLE_QUALIFIER}\s+)*(agents?|reps?|representatives?|specialists?|associates?|advisors?|advisers?|officers?|executives?|operators?|coordinators?|assistants?|leads?|leaders?|team leads?|team leaders?|supervisors?|managers?|staff|team members?|members?|heroe?s?|people|personnel|trainees?|interns?)${LEVEL_AFTER}${WANTED}$`,
);
// ...or, after the line, its front-line people by what the line's own work is
// about: an industry or an account, a channel or a support function
// ("Customer Service - Billing Specialist", "Call Center - Healthcare Agents",
// "BPO - Healthcare Account Agents", "Member Services - Claims
// Representative", "Customer Service - Email Specialist"; the tenth review),
// never another trade's agent or an account's seller ("Insurance Agent",
// "Travel Agent", "Account Executive", "Account Manager"), a store's or a
// hotel's floor associate ("Retail Associate"), or a clinic's, a lender's or
// a warehouse's own job ("Medical Representative" sells medicines in the
// Philippines; "Mortgage Specialist", "Logistics Officer").
const LINE_QUALIFIER = String.raw`(health ?care|health|telco|telecoms?|telecommunications?|banking|bank|financial|fintech|insurance|retail|pharmacy|hospitality|e-?commerce|travel|airline|utilit(y|ies)|energy|tech|technical|it|gaming|automotive|auto|accounts?|products?|orders?|claims?|billing|retention|escalations?|complaints?|resolution|onboarding|loyalty|subscriptions?|membership|warranty|returns?|refunds?|payments?|cards?|chat|live chat|e-?mail|phone|telephone|blended|omni-?channel|multi-?channel|support|services?|care|customer|client|member|guest|help ?desk|desktop|software|saas|app|australian|canadian|american)`;
const LINE_WORK_PEOPLE = new RegExp(
  String.raw`^(?!(.*\s)?((insurance|travel|real estate|leasing|booking) agents?|account (executives?|managers?)|(financial|travel) advis[eo]rs?|(retail|pharmacy|hospitality) associates?)$)((${PEOPLE_QUALIFIER}|${LINE_QUALIFIER})\s+)*(agents?|reps?|representatives?|specialists?|associates?|advisors?|advisers?|officers?|executives?|operators?|staff|team members?)${LEVEL_AFTER}${WANTED}$`,
);
// ...and after a support desk line, its own analyst, consultant, engineer or
// technician ("Help Desk - Analyst", "Help Desk - Level 1 Analyst", "Customer
// Support - Tier 2 Engineer", "Help Desk - IT Specialist"; the tenth review),
// as DESK_ANALYST reads "Help Desk Analyst". Never before the line ("Analyst -
// Customer Support" is the department's analyst) and never another kind
// ("Help Desk - Network Engineer", "Call Center - Quality Analyst").
const DESK_LINE = /\b((customer|client|player|member) (service|services|support|success|care)|help ?desk|service desk|(technical|tech|it) support|(tier[ -]?[123]|l[123]|level [123]) support)\b/;
const DESK_PEOPLE = new RegExp(
  String.raw`^((l[1-3]|level [1-3]|tier [1-3]|senior|sr\.?|junior|jr\.?|lead|support|technical|tech|it|desktop|help ?desk|service desk|product|application|customer|client)\s+)*(analysts?|consultants?|engineers?|technicians?|specialists?)${LEVEL_AFTER}${WANTED}$`,
);
// A plural of an office or professional job is that job, not the people a line
// serves ("Customer Service - Admin Assistants", "Customer Success - Account
// Executives", "Technical Support - Network Engineers"; the tenth review).
const OFFICE_JOBS = /\b((admin|administrative|office|executive|personal|legal|hr|marketing|accounting|finance|data entry|medical|dental) (assistants|associates|specialists|staff|clerks|officers|coordinators|secretaries)|account (executives|managers)|[\w-]+ (engineers|developers|programmers|designers|architects|analysts))$|\bsales\b|\bcollect\w*/;
// ...or the people it serves: a plural that is not a shop-floor job ("Customer
// Success - Teachers", "Help Desk - Students and Teachers"), a part whose last
// word is no role at all ("Customer Support - Driver Partners"), or people the
// words say the job helps or answers ("Customer Support - Uber Drivers / help
// drivers by chat", "Customer Support - Real Estate Agents / answer calls and
// emails from the agents who use our CRM"). A role named in the singular is
// the job ("Customer Service - Cashier").
function lineServes(part: string, work: string, line: string): boolean {
  const words = part.split(/[\s&,/]+/).filter((w) => w.length > 2 && !/^(and|the|our|for)$/.test(w));
  const last = words[words.length - 1] ?? "";
  if (!ROLE_WORD.test(last) || TECH_SERVER.test(part)) return true;
  // (A call centre, a BPO or a front desk is a workplace, not people served: "Call Center - Recruiters".)
  if (/[^s]s$/.test(last) && !MAIN_STREET_HEAD.test(last) && !/\b((call|contact) cent(er|re)|bpo|front desk)\b/.test(line) && !OFFICE_JOBS.test(part)) return true;
  if (!work) return false;
  return words.some((w) => {
    const named = new RegExp(String.raw`\b${w.replace(/(?<=[a-z]{3})s$/, "").replace(/[^a-z]/g, "")}s?\b`, "g");
    if (!named.test(work)) return false;
    const asCustomers = work.replace(named, "customers");
    return CS_WORK.test(asCustomers) || /\b(help|helping|assist|assisting|support|supporting|serve|serving|answer|answering|reply to|replying to|respond to|responding to)\s+(our |the )?customers\b|\b(e-?mails?|calls?|chats?|messages?|tickets?|questions?|requests?|inquir\w+|enquir\w+) from (our |the )?customers\b/.test(asCustomers);
  });
}

/**
 * The title's role phrase. The title is read in parts, split at " - ", " | ",
 * commas and brackets; a part after "for", "at", "in" or "with" names the
 * business, never the role ("Recruiter - BPO" is a recruiter, "Customer
 * Service Rep for Nurse Staffing Agency" a rep). The role is the first part
 * with a role word in it, so "Remote - Customer Support Agent", "Makati |
 * CSR" and "Hiring for Customer Service Representative" read as the role they
 * name; a bare role noun takes the part after it ("Specialist, Customer
 * Support" is a customer support specialist; the sixth Phase 4 review).
 */
const HIRING = /^\s*((urgent(ly)?|now|immediate(ly)?|we'?re|we are|actively)\s+)*(hiring|looking|seeking|recruiting|wanted|needed)(\s+for)?\s*[:!]?\s*/;

function titleParts(title: string): { text: string; business: boolean }[] {
  const parts: { text: string; business: boolean }[] = [];
  for (const piece of title.replace(HIRING, "").replace(/[()[\]]/g, " | ").split(/\s+[-–—|]\s+|\s*[|,]\s*|\s+[-–—]\s*|\s*[-–—]\s+/)) {
    const [role, ...rest] = piece.split(/\s+(?:for|at|in|with)\s+/);
    if (role.trim()) parts.push({ text: role.trim(), business: false });
    for (const r of rest) if (r.trim()) parts.push({ text: r.trim(), business: true });
  }
  return parts;
}

function headPhrase(title: string, work = ""): string {
  const parts = titleParts(title);
  const roles = parts.filter((p) => !p.business);
  // The first part naming a person's role, so an industry or an account part
  // before it does not hide it ("Healthcare Account - CSR"); then a support
  // line. A support line keeps only the people it hires or serves as its own
  // ("Customer Service - Night Shift Agents"; the eighth review), never
  // another job named beside it ("Customer Service - Cashier", "Call Center -
  // Recruiter", "Help Desk - Network Engineer"; the seventh and ninth reviews).
  const line = roles.findIndex((p) => CS_TITLE.test(p.text));
  type Part = (typeof roles)[number];
  const afterLine = (p: Part) => roles.indexOf(p) > line;
  const lineOwns = (p: Part) =>
    line >= 0 &&
    p !== roles[line] &&
    (LINE_PEOPLE.test(p.text) ||
      (afterLine(p) && (LINE_WORK_PEOPLE.test(p.text) || (DESK_LINE.test(roles[line].text) && DESK_PEOPLE.test(p.text)))) ||
      lineServes(p.text, work, roles[line].text));
  const strong = roles.findIndex((p) => hasStrongRoleWord(p.text) && !lineOwns(p));
  const i = strong >= 0 ? strong : line >= 0 ? line : roles.findIndex((p) => ROLE_WORD.test(p.text));
  if (i < 0) return (parts.find((p) => ROLE_WORD.test(p.text)) ?? roles[0] ?? parts[0])?.text ?? title.trim();
  const head = roles[i].text;
  // (A channel before a bare noun names it too: "Voice - Agents", "Non-Voice - Agents"; the tenth review.)
  const next = roles.slice(i + 1).find((p) => !BARE_ROLE.test(p.text)) ?? roles.slice(0, i).reverse().find((p) => ROLE_WORD.test(p.text) || CHANNEL_PART.test(p.text));
  return BARE_ROLE.test(head) && next ? `${next.text} ${head}` : head;
}

// A store or a venue named as its own part of the title ("Retail - Customer
// Service Associate", "Grocery | Customer Service Clerk"), and the front desk
// of a hotel, gym, salon or spa: work done there, not by chat or phone (the
// seventh Phase 4 review).
const STORE_PART = /^(((retail|grocery|convenience|department|drug|hardware|furniture|clothing|liquor|thrift|toy|book|gift|flower|pet|appliance|electronics?|sporting goods) )?(store|shop|outlet)|retail|grocery|supermarket|pharmacy|drugstore|in-store|restaurant|cafe|café|bakery|showroom|dealership|boutique)$/;
const VENUE = /\b(hotel|motel|hostel|resort|gym|fitness|salon|(?<!med |medical )spa|barbershop|apartments?|condo|clubhouse|front of house|museum|office|law firm|real estate|corporate|plant|factory|warehouse)\b/;
// Where the agent sits or when they work says nothing about whose front desk
// it is: "office hours", "work in our office in Ortigas" (the ninth review).
const OFFICE_NOT_VENUE = /\b(work|working|report|reporting|based|stationed|sit|sitting)\s+(in|at|from|out of)\s+(our|the|an?)\s+([\w']+\s+)?office\b|\boffice[- ](hours|based|setup|set-up|schedule|days?)\b|\b(in|home|back)[- ]office\b/g;
// Remote work in the words: the agent is not at the venue's desk.
const REMOTE_WORDS = /\b(work from home|work-from-home|wfh|remote(ly)?|home[- ]based|virtual(ly)?)\b/;
// ...but not a remote word that is negated or is about the training ("This is
// not a remote position", "no remote work", "onsite only, not remote", "not a
// work from home job", "occasional remote training", "virtual training
// provided"): those say the job is on site (the tenth review). isCustomerService
// takes them out of the words before any rule reads them.
const NOT_REMOTE = /\b(not|no|non|never|isn'?t)[- ]+((a|an|the|fully|100%)\s+)?(remote|work[- ]from[- ]home|wfh|home[- ]based|virtual)\b|\b(remote|virtual|online)(ly)?\s+(training|onboarding|orientation)\b/g;
// Work that is not done at a store's counter: chats, tickets, messages, an
// online shop, inbound calls, a BPO account, working from home (phones and
// emails alone are not: a store answers its phone; the ninth review).
// (An account with words between counts: "a US retail account", "a US-based healthcare account"; the tenth review.)
const OFF_THE_FLOOR = /\b(chats?|live chat|tickets?|zendesk|freshdesk|help ?desk|inbox|messages|messaging|whatsapp|messenger|viber|sms|inbound|bpo|call cent(er|re)|contact cent(er|re)|non[- ]?voice|(voice|blended|us|u\.s\.|uk|australian|canadian|international)(-based)?( [\w-]+){0,2} accounts?)\b/;
// (A mail-order pharmacy or an online grocery is an online business too; the tenth review.)
const ONLINE_BUSINESS = /\b(shopify|etsy|amazon|ebay|e-?commerce|lazada|shopee|web ?shop|mail[- ]order|online (store|shop|business|brand|grocery|groceries|pharmacy|retailer))\b/;
// In the store itself: "in our store", "at our drugstore", "at our pharmacy
// counter", "at our cell phone store"; never "at our 50 stores across Texas",
// which no one stands in (the tenth review).
const AT_THE_STORE = /\b(in|at|inside|around)\s+(our|the|a)\s+(?!\d)([\w-]+\s+){0,2}(stores?|shops?|drugstores?|pharmac(y|ies)|restaurants?|cafes?|café|bakery|showroom|dealership|supermarkets?|grocery|branch(es)?|counter|register|outlet|mall|box office|ticket (booth|window|counter))\b/;
// The floor's own work: shelves, aisles, fitting rooms, the stockroom (the tenth review).
const STORE_FLOOR = /\b(shelves|aisles?|fitting rooms?|stock ?room|cash registers?|restock\w*|planograms?|price tags)\b/;
// A store named in the title that is a client a remote team serves, not where
// the agent stands (the tenth review): a named account ("our retail account",
// "a US retail client"), customers in another country ("Assist US
// customers"), a foreign or Fortune 500 retailer, a BPO site or IT park
// ("Work in our Pasig site"), a pharmacy benefit's members, a chain's
// delivery line, orders from its website, its software.
const STORE_ACCOUNT = /\b((us|u\.s\.|uk|australian|canadian|american|international|offshore|overseas|foreign)(-based)?\s+([\w-]+\s+){0,2}(accounts?|clients?|campaigns?|retailers?|brands?|compan(y|ies)|chains?|giants?|customers|callers|members|patients|consumers|shoppers|subscribers|users|buyers)|(retail|telco|healthcare|banking|financial|insurance|e-?commerce|travel|pharmacy|pharma|consumer|client) (accounts?|campaigns?)|fortune 500\s+([\w-]+\s+)?(retailers?|brands?|compan(y|ies)|clients?)|retail giants?|(our|the) (?!web )([\w-]+ )?site|(it|tech|technology|business) park|members?'?|policyholders?|enrollees?|(restaurant|retail|store|pharmacy|grocery|drugstore|supermarket) (groups?|chains?)|chain of (stores|restaurants|pharmacies|drugstores|supermarkets|shops)|(delivery|online|website|app) orders?|orders? from (our|the) (website|app|site)|(our|the) (website|app)|software|saas|pos system)\b/;
// After the role, where the store part reads as the account, the night shift says so too.
const NIGHT_SHIFT = /\b(night|graveyard)[- ]shifts?\b|\bgraveyard\b/;
// Tickets sold at a counter, not support tickets (nor their refunds or exchanges; the tenth review).
const TICKETS_SOLD = /\b(sell|selling|sold|buy|buying|purchas\w*|issue|issuing|print|printing|scan|scanning)\s+([\w-]+\s+)?tickets?\b|\btickets?\s+(purchases?|sales?|refunds?|exchanges?|counter|booth|window|office)\b/g;

function isMainStreet(title: string, work = ""): boolean {
  const head = headPhrase(title, work);
  const noun = head.split(/\s+/).pop() ?? "";
  if (MAIN_STREET_HEAD.test(noun) && !TECH_SERVER.test(head)) return true;
  // ...or in any part of the title, or either side of a slash, in the singular:
  // "Customer Service Rep - Cashier", "Cashier/Customer Service Rep" (the ninth
  // review; a plural can be the people a support line serves: "Customer
  // Support - Uber Drivers").
  // (...unless the words say the line helps them: "Customer Support - Courier / help couriers with app issues via chat"; the tenth review.)
  const roleParts = titleParts(title).filter((p) => !p.business);
  const line = roleParts.find((p) => CS_TITLE.test(p.text))?.text;
  const sides = roleParts.flatMap((p) => p.text.split(/\s*\/\s*/));
  const served = (side: string) => !!line && side !== line && !!work && lineServes(side, work, line);
  if (sides.some((side) => { const last = side.split(/\s+/).pop() ?? ""; return MAIN_STREET_HEAD.test(last) && !/[^s]s$/.test(last) && !TECH_SERVER.test(side) && !served(side); })) return true;
  const remoteTitle = /\b(virtual|remote|online|work from home|wfh)\b/.test(title);
  // A store named as its own part of the title is where the job is worked,
  // before the role or after it ("Retail - Customer Service Associate",
  // "Customer Service Associate - Retail"), unless the title names a channel
  // ("CSR | Retail", "Chat Support - Retail") or the words say the work is off
  // the floor (chats, tickets, an online shop, inbound calls, from home).
  // With nothing in the words about being in the store, it is the account
  // when the words name a client's signs (STORE_ACCOUNT: "a US retail
  // account", "Assist US customers", "our Pasig site", "members", "our
  // mail-order pharmacy"; the tenth review), or, after the role, any remote
  // channel or the night shift ("Customer Care Representative - Pharmacy /
  // answer calls from members", "... by telephone"; the eighth to tenth
  // reviews), or, before it, a written one ("Shop - Customer Support Agent /
  // answer customer emails"; a store answers its own phone).
  const headAt = roleParts.findIndex((p) => head.includes(p.text) || p.text.includes(head));
  const storeAt = roleParts.findIndex((p) => STORE_PART.test(p.text));
  const titleChannel = /\b(chat|e-?mail|phone|voice|call cent(er|re)|non[- ]?voice|virtual|remote|csr)\b/.test(title);
  const offTheFloor = OFF_THE_FLOOR.test(work) || ONLINE_BUSINESS.test(work) || REMOTE_WORDS.test(work);
  const inTheStore = IN_PERSON.test(work) || AT_THE_STORE.test(work) || STORE_FLOOR.test(work);
  const after = headAt >= 0 && storeAt > headAt;
  const storeAccount = headAt >= 0 && !inTheStore && (STORE_ACCOUNT.test(work) || (after ? REMOTE_CHANNEL.test(work) || NIGHT_SHIFT.test(work) : /\be-?mails?\b/.test(work)));
  if (storeAt >= 0 && !remoteTitle && !titleChannel && !offTheFloor && !storeAccount) return true;
  // A hotel's, gym's or office's front desk, unless the work is done from home.
  // (...but greeting visitors there is the office's front desk.)
  const venueText = /\b(greet\w*|welcom\w*|visitors?|walk-?ins?|sign\w* in|(?<!-)mail|deliveries|packages)\b/.test(work) ? `${title} ${work}` : `${title} ${work}`.replace(OFFICE_NOT_VENUE, " ");
  // (A hotel's front office too: "Hotel Front Office Associate"; the tenth review.)
  if (!remoteTitle && !REMOTE_WORDS.test(work) && /\b(front desk|front office|reception(ist)?)\b/.test(head) && VENUE.test(venueText) && !PATIENT_CONTEXT.test(`${title} ${work}`)) return true;
  if (MAIN_STREET_HEAD_WEAK.test(noun) && !CS_TITLE.test(head.replace(DESK_PLACE, " ")) && !(FRONT_DESK.test(head) && PATIENT_CONTEXT.test(work))) return true;
  if (MAIN_STREET_PHRASE.test(head) && !ONLINE_SHOP.test(title)) return true;
  return CLINICAL_ASSISTANT.test(head) && !/\b(virtual|remote|online)\b/.test(title);
}

function isCustomerService(brief: Pick<JobBrief, "roleTitle" | "whatTheyDo">): boolean {
  const title = (brief.roleTitle ?? "").toLowerCase();
  // (How to apply says nothing about the work: "Send your CV via WhatsApp" is no chat job; the ninth review.)
  // (Nor a remote word that is negated or about the training: "This is not a remote position"; the tenth review.)
  const work = (brief.whatTheyDo ?? "").toLowerCase().replace(PERKS, " ").replace(HOW_TO_APPLY, " ").replace(NOT_REMOTE, " ");
  // The title's role phrase: "Recruiter - BPO" is a recruiter, "Makati | CSR" a CSR.
  const head = headPhrase(title, work);
  const noun = head.split(/\s+/).pop() ?? "";
  if (isMainStreet(title, work)) return false;
  // Support of colleagues keeps its family. Admin and office support does even
  // when it answers customers' calls (the sixth Phase 4 review); payroll, HR,
  // finance or logistics support whose work is customers' calls, emails or
  // tickets (a payroll app's support) is customer service (the seventh).
  const colleagueTitle = title.replace(SERVICE_SALES, " ");
  // (Only business functions a software product serves count; clinical, peer, field,
  // production or facilities support never does; the eighth review.)
  if (NON_CUSTOMER_SUPPORT.test(colleagueTitle) && (!/\b(hr|human resources|payroll|finance|financial|accounting|accounts payable|logistics|operations|ops|sales|marketing|engineering|community) support\b/.test(colleagueTitle) || !CUSTOMERS_BY_CHANNEL.test(work))) return false;
  const clinicWork = PATIENT_CONTEXT.test(`${title} ${work}`) && (FRONT_DESK.test(title) || /\bpatients?\b/.test(`${title} ${work}`));
  // (Answering the phone at a showroom or a box office is still the counter,
  // and selling tickets is no support ticket; the ninth review.)
  const floorWork = work.replace(TICKETS_SOLD, " ");
  const offTheFloor = REMOTE_CHANNEL.test(title) || OFF_THE_FLOOR.test(floorWork) || ONLINE_BUSINESS.test(work) || REMOTE_WORDS.test(work) || (REMOTE_CHANNEL.test(floorWork) && !AT_THE_STORE.test(work));
  if (IN_PERSON.test(`${title} ${work}`) && !offTheFloor && !clinicWork) return false;
  // A clinic's appointment setter books patients; any other is selling.
  if (PATIENT_ADMIN.test(title) && patientCalls(work)) return true;
  if (SALES_TITLE.test(title.replace(SERVICE_SALES, " "))) {
    return SALES_AND_SERVICE.test(title) && CS_WORK.test(work) && !OUTBOUND.test(work) && !SELLING_WORK.test(work);
  }
  // (A tier or level 1 analyst with support work is the desk's: "Tier 1 Analyst / answer customer tickets"; the ninth review.)
  if (PROFESSIONAL_HEAD.test(noun)) return DESK_ANALYST.test(head) || (/\b(support|l[123]|level [123]|tier [123])\b/.test(head) && CS_WORK.test(work));
  if (CS_TITLE.test(head)) return true;
  // "Virtual Assistant - Customer Service": the assistant is the support part's.
  if (/\b(virtual assistant|va)s?$/.test(head) && titleParts(title).some((p) => !p.business && p.text !== head && CS_TITLE.test(p.text.replace(/\b(bpo|call cent(er|re)|contact cent(er|re))\b/g, " ")))) return true;
  // A BPO account named by its channel: "Healthcare Account - Voice", "Non-Voice Account".
  if (/\baccount\b/.test(head) && /\b(non[- ]?\s?voice|voice)\b/.test(title)) return true;
  // A reservations or booking agent is the hotel, airline or appointments kind
  // unless the words say otherwise: what is booked is not a customer's, the
  // work is in person, or it schedules the business's own crews with no
  // customer or channel in the words (the eighth and ninth reviews).
  if (BOOKING_TITLE.test(head)) {
    const dispatch = BOOKS_OWN_STAFF.test(work) && !/\b(customers?|clients?|guests?|patients?|callers?|homeowners?|travel+ers?|passengers?|members?)\b/.test(work) && !REMOTE_CHANNEL.test(work);
    // (At the showroom is in person too: "reservations for our car models and test drives at our showroom"; the tenth review.)
    return !NOT_GUEST_BOOKING.test(`${title} ${work}`) && !((IN_PERSON.test(work) || AT_THE_STORE.test(work)) && !REMOTE_CHANNEL.test(work)) && !dispatch;
  }
  if (OUTBOUND.test(work)) return false;
  if (FRONT_DESK.test(title) && PATIENT_CONTEXT.test(`${title.replace(FRONT_DESK, " ")} ${work}`)) return true;
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
  // The Type field ("Full-time · Remote", "Work from home", "WFH") first, then
  // the place: the Type field starts on "Full-time · On-site", and a place
  // written "Remote", "Home-based, Philippines" or "Makati (WFH)" is a remote
  // job whatever it still says (the second and third Phase 7 product audits:
  // those were built on-site, with no connection check). One rule for both,
  // placeSaysRemote (src/lib/jobLocation.ts).
  if (/\bhybrid\b/.test(wm)) workMode = "hybrid";
  else if (placeSaysRemote(wm.replace(/\bon[-\s]?site\b/g, "")) === "remote") workMode = "remote";
  else if (placeSaysRemote(fields.location) === "remote") workMode = "remote";
  else if (/\bhybrid\b/i.test(fields.location)) workMode = "hybrid";

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
