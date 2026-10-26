/**
 * Adaptive playbook — rule-based follow-ups, rigor recommendation, and reasoning
 * lines keyed off the brief (mirrors AvaFlowPreview prototype).
 */
import type { BriefAnswer, JobBrief, Rigor } from "./types";
import { CS_CHANNEL_CHIPS, CS_INDUSTRY_CHIPS, HOW_TO_APPLY, channelForBrief, industryFromText } from "./customerService.ts";
import { A_COUNTRY, US_STATE_NAMES, isFullyRemoteText, placeSaysHybrid, placeSaysRemote } from "../jobLocation.ts";

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
    // (A hotline's agent or officer answers its calls, as Philippine posts name the phone line: "Hotline Agent / Answer calls on
    // our 24/7 customer hotline", "Hotline Officer / Answer the customer hotline"; the fifteenth review.)
    String.raw`\b(support|chat|phone|call|contact|hotline|help ?desk|service desk|technical support|tech support|it support|live chat|email support|non[- ]?\s?voice|voice) (agent|rep|representative|specialist|advisor|associate|executive|operator|officer)s?\b`,
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
// travel agency's group tours are (the tenth review). A conference or a
// corporate event is the planner's only when the work plans it or books its
// venues, catering or AV, never a hotel's guests ("book hotel rooms for
// corporate events and conferences", "our hotel hosts weddings and
// conferences"); logistics only as the business (in the title, "a logistics
// company"), never "travel logistics", "the logistics of each job" or "our
// logistics team" (the eleventh review).
// The twelfth review: the planner's work is coordinating, managing or
// executing the events too ("Coordinate conferences and corporate events for
// our clients", "Plan and execute corporate events"), an event management
// company is a planner, and venues, catering or AV count after the
// conference as well ("bookings for corporate events and conferences:
// venues, catering and AV"), but an event planner is no planning (the
// eleventh's "planners" had no case behind it, and "Coordinate with event
// planners and handle bookings for our function rooms" is a venue's).
// Logistics in the words is freight again unless the words also name a
// customer or a channel, as the eleventh's all did ("Answer customer calls
// ... coordinate with our logistics team", "Handle airline reservations by
// phone; experience in travel or logistics is a plus"): "Prepare booking
// confirmations and coordinate with the logistics department" is a freight
// desk's.
// The thirteenth review: the twelfth's reverse order and its new verbs made
// a hotel's reservations agent a planner ("Answer guest calls and emails
// about room bookings, conferences and catering", "Coordinate corporate event
// bookings and room blocks with our sales team"). So the reverse order is
// back to its one case, the conference followed by what it books ("bookings
// for corporate events and conferences: venues, catering and AV"); event
// bookings, inquiries or packages are never the planner's; and the event
// rule is skipped when the words name rooms or guests, which only a venue
// books (EVENT_PLANNER, read apart). Logistics in the words is freight only
// by the twelfth's freight words (FREIGHT_LOGISTICS), never travel, transfer
// or a job's own logistics ("handle travel logistics for our tour
// packages"); an event's logistics are the planner's ("Manage logistics for
// corporate events and conferences", "Coordinate event logistics, book
// suppliers and manage event timelines"), as booking a conference's venues is
// ("Book conference venues and catering for our corporate clients").
// The fourteenth review: a planner's post names guests and rooms all the time
// (guest lists, guest registration, RSVPs, hotel room blocks for attendees),
// so skipping the whole event rule on them made every such planner customer
// service ("Event planning for corporate clients: manage guest lists,
// invitations, catering and venue logistics", "Organize corporate events and
// conferences for our clients; book rooms for attendees"). Event planning or
// management and the planner's verbs are back where they were, never
// skipped, but never a team's or experience ("pass corporate event inquiries
// to the event management team", "Event planning experience is a plus"); the
// skip on rooms or guests is left only where a venue's own words say the
// same, venues, catering or AV named with the conference and an event's
// logistics ("Answer guest calls and coordinate event logistics with our
// banquet team"; EVENT_PLANNER). And a freight forwarder's own words are
// freight whoever the words name ("Handle import and export bookings,
// coordinate with customs brokers", "Arrange bookings with forwarders"): the
// thirteenth's freight list missed them.
const BOOKING_TITLE = /\b(reservations?|bookings?)( and bookings?)? (agent|rep|representative|specialist|associate|coordinator|officer)s?\b/;
const EVENT_BOOKED = String.raw`(conferences?(?!\s+(rooms?|halls?|calls?)\b)|corporate events?)(?!\s+(bookings?|inquir\w*|enquir\w*|packages?)\b)`;
const NOT_GUEST_BOOKING = new RegExp(
  String.raw`\b(musicians?|artists?|bands?|djs?|gigs?|performers?|entertainers?|magicians?|singers?|photo shoots?|comedians?|talent (agency|booking|roster)|booking talent|book(ing)? talent|roster|touring|tour dates|book(ing)? (speakers|acts|models|venues|loads|trucks|carriers|shows|festival\w*)|speaking engagements?|bookings? (for|of) (our |their |the )?(models|talent|clients'? (bands|acts))|model(ing|ling)? (agency|bookings?)|freight|cargo|shipping|import\s*(\/|and|&|or)\s*export|forwarders?|customs (brokers?|brokerage|clearance|documents?)|bills? of lading|shipments?|containers?|trucking|truckloads?|(truck|freight) loads?|loads? (with|for|from) (carriers|trucks|drivers|shippers)|load boards?|shippers?|(secure|securing|find|finding) (trucks|capacity)|capacity (with|from) carriers|(negotiat\w*|call|calling|contact\w*|vet|vetting|source|sourcing|dispatch\w*) ((rates|fees) )?(with )?(our |the )?carriers|carriers,? (and )?(negotiat\w*|rates)|give tours|plan(s|ning)? group tours|contract hotels|host stand|greet(ing)? diners|seat(ing)? (diners|guests|people))\b`,
);
// The fifteenth review: putting event planning and the planner's verbs back in NOT_GUEST_BOOKING, where nothing skips them,
// made a hotel's or resort's reservations agent a planner again whenever its words named corporate events or event planning
// ("Handle hotel room reservations and coordinate corporate events with our banquet team", "Handle room reservations, group
// bookings and event planning inquiries for our hotel", "Handle room reservations for our resort and help plan corporate
// events"). They are the planner's work again (PLANNER_WORK; event planning inquiries, services, packages or requests are a
// venue's, as a team's or experience was), skipped only on a venue's own words (VENUE_OWN: our or the hotel or resort, room
// reservations or bookings, a banquet, function rooms, conference facilities: "Respond to guest inquiries about rooms and
// conference facilities. Coordinate conferences with our events team"), never on guests or rooms alone, which the
// fourteenth's planners name ("Event planning for corporate clients: manage guest lists ...", "Organize corporate events and
// conferences for our clients; book rooms for attendees", "Manage conference logistics: speaker travel, hotel rooms and
// catering" stay the planner's).
// The sixteenth review: VENUE_OWN took a planner's words for a venue's, any "the hotel", any "room reservations" and any
// "banquet" ("Plan and coordinate corporate events for our clients: book the hotel, catering and AV", "Organize corporate
// events for our clients and handle room reservations with partner hotels", "liaise with the venue's banquet team"). Only
// the fifteenth's own forms now: our hotel or resort, or the hotel's; room reservations or bookings, but never with, at or
// from (partner) hotels, which a planner makes; our banquet (team), alone or with another team ("our sales and banquet
// teams"); function rooms; conference facilities.
// The seventeenth review: that made a hotel's reservations agent an event planner again on its other words for itself,
// "the banquet team" and "for the hotel" ("Booking Agent / Respond to booking requests for the resort and coordinate
// corporate events with the banquet team", "Reservations Officer / ... manage corporate events and the banquet calendar for
// the hotel"). They are a venue's own too: the banquet team, department, calendar, staff or office, never the venue's
// ("liaise with the venue's banquet team"), and for the hotel or resort (never "for the hotel of their choice"); and a title
// that names a hotel or resort ("Reservations Agent - Hotel") is the venue's. "At the hotel" stays out: a planner books
// "room blocks at the hotel". And with or at "our partner hotels" is a planner's too, as "partner hotels" was.
// The eighteenth review: those two forms are an event agency's too, whose words name its clients ("Plan corporate events for
// our clients and coordinate with the banquet team at each venue", "Organize corporate events for the hotel clients we serve
// as an event agency", "negotiate rates for the hotel or resort they pick" for clients). So they are the venue's own only
// when the words name no clients, as the seventeenth's two cases did (VENUE_OWN_17); the fifteenth's and sixteenth's forms
// stay in VENUE_OWN as they were.
const VENUE_OWN_17 = /(?<!\bvenue'?s )\bthe ([\w-]+ (and|&) )?banquet((\s+(and|&)\s+[\w-]+)?)\s+(team|department|calendar|staff|office)s?\b|\bfor the (hotel|resort)\b(?!\s+of\b)/;
const PLANNER_WORK = new RegExp(
  String.raw`\b((event|conference) (planning|management)(?!\s+(team|department|staff|experience|inquir\w*|enquir\w*|services?|packages?|requests?)\b)|(plan|plans|planning|organi[sz]e|organi[sz]es|organi[sz]ing|produce|producing|coordinate|coordinates|coordinating|manage|manages|managing|execute|executes|executing)( and (execute|executes|executing|run|runs|running|manage|manages|managing|coordinate|coordinates|coordinating|host|hosts|hosting))? (our |the |their )?(clients'? )?${EVENT_BOOKED})\b`,
);
const VENUE_OWN = /\bour (hotel|resort)('s)?\b|\bthe (hotel|resort)'s\b|\broom (reservations?|bookings?)\b(?![^.;\n]{0,40}\b(with|at|from) (partner |the |local |other |our partner )?hotels\b)|\bour ([\w-]+ (and|&) )?banquet\b|\bfunction (rooms?|halls?)\b|\bconference facilit(y|ies)\b/;
// (Venues, catering or AV named with the conference, and an event's logistics, which a venue's own words share: skipped when
// they name rooms or guests, "Answer guest calls and emails about room bookings, conferences and catering", "Answer guest calls
// and coordinate event logistics with our banquet team"; the thirteenth, narrowed to those in the fourteenth.)
const EVENT_PLANNER = new RegExp(
  String.raw`\b((event|conference) logistics|logistics (for|of) (our |the |their )?(clients'? )?${EVENT_BOOKED}|(venues?|catering|caterers?|av|audio[- ]?visual)\b[^.;\n]{0,40}\b${EVENT_BOOKED}|${EVENT_BOOKED}\s*:\s*(venues?|catering|caterers?|av|audio[- ]?visual)|(book|books|booking|source|sources|sourcing) ${EVENT_BOOKED}\s+(venues?|catering|caterers?))\b`,
);
const VENUE_BOOKED = /\b(rooms?|guests?)\b/;
const LOGISTICS_BUSINESS = /\blogistics (compan(y|ies)|firms?|providers?|brokers?|brokerage|business|industry|services|accounts?|clients?)\b|\b(freight|shipping|trucking),? (and|&) logistics\b|\b3pl\b|\bthird[- ]party logistics\b/;
const FREIGHT_LOGISTICS = /\blogistics (partners?|department|team|systems?|providers?)\b|\blogistics or supply chain\b|\bcourier,? (and|&) logistics\b/;
// The people a business books for, as against its own staff or a freight desk's partners.
const BOOKED_FOR = /\b(customers?|clients?|guests?|patients?|callers?|homeowners?|travel+ers?|passengers?|members?)\b/;
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
// (A cosmetic or plastic surgery practice and an IV therapy lounge are clinics that greet "guests": since the sixteenth a
// front desk with guests is a lodging's; the seventeenth review.)
const PATIENT_CONTEXT = /\b(patients?|clinic|dental|dentist|orthodont\w*|medical|doctor'?s?|physician|hospital|optometr\w*|chiropract\w*|physio\w*|physical therapy|urgent care|dermatolog\w*|pediatric\w*|paediatric\w*|ophthalm\w*|podiatr\w*|med ?spa|medical spa|botox|(plastic|cosmetic) surgery|iv (therapy|drips?|hydration)|vet|veterinar\w*|animal hospital|pet owners?)\b/;
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
// (The seventeenth review: "What's in it for you?", with its question mark, as the builder's own setup line reads emoji bullets now.)
// (The eighteenth: "What you'll get to do:" heads the duties, never the perks: "Virtual Assistant / What you'll get to do:\n-
// Answer customer emails and live chats" was no customer service.)
// (Only "to do", the nineteenth review's LOW 2: "What you'll get to enjoy:" and "What you get to enjoy:" head the perks, and
// their "- WFH" bullet made an on-site job remote.)
const BENEFIT_HEADING = String.raw`(benefits?|full benefits|perks?|we offer|what we offer|what you get(?!\s+to\s+do\b)|what you'll get(?!\s+to\s+do\b)|what['’]?s in it for you|compensation|compensation (and|&) benefits|why (join us|work here|work with us))`;
const PERKS = new RegExp(
  [
    // A "Benefits:" heading and the bullets under it.
    // (The next alternative starts at the same place, after the line break, not
    // on it, so this one wins wherever the heading is, not only on the first
    // line: "...at our office.\nBenefits:\n- Discounted dental care"; the eleventh review.)
    // (A heading may end in a question mark: "What's in it for you?", "Why join us?"; the seventeenth.)
    // (Round sixteen's bullets only, the eighteenth review. The seventeenth took any mark as a bullet, so a perks block
    // swallowed every line after it that starts with an emoji, "$", "₱" or "(", the duties included: "Benefits:\n✅ HMO\n📌
    // Responsibilities:\n✅ Answer customer chats and emails" was no customer service, and "Benefits:\n✅ Free meals\n📌
    // Duties:\n✅ Assist shoppers in the store" was. Only the setup-line reader skips an any-mark perks block, SETUP_PERKS.)
    String.raw`(?<=^|\n)[ \t]*([-•*][ \t]*)?${BENEFIT_HEADING}[^\n:.;]{0,30}[:?][ \t]*(\n[ \t]*[-•*·▪◦✓✔➢][^\n]*)+`,
    String.raw`(?<=^|[\n.;])[ \t]*([-•*][ \t]*)?${BENEFIT_HEADING}\b[^.;\n]*`,
    String.raw`(?<=^|[\n.;])[^.;\n]*\b(13th[- ]month|401\(?k\)?)[^.;\n]*`,
    // (An HMO the work is about stays: "verify patients' HMO", "process HMO claims", "coordinate with HMO providers".)
    String.raw`(?<=^|[\n.;])(?![^.;\n]*\b(patients?'?|members?'?|verify\w*|check\w*|process\w*|claims?|accredit\w*|approvals?|loa|providers?|coordinat\w*|billing)\b)[^.;\n]*\bhmo\b[^.;\n]*`,
    String.raw`\b(?=(medical|dental)\b)${ABOUT_A_PLAN}${PLAN}\s+(insurance|benefits?|coverage|plans?|cover|premiums?|reimbursements?|allowances?|subsid(y|ies))\b${PLAN_AS_WORK}`,
    // (A yearly check-up is the employee's, whatever follows: "Free annual medical and dental check-ups";
    // "free dental cleanings for staff" stays the clinic's own service; the eleventh review.)
    String.raw`\b(offer(s|ed|ing)?|enjoy|receive|get|plus|free|paid|full|comprehensive|excellent|great|generous|competitive|eligible for|entitled to|qualify for|company-paid|employer-paid|100% paid)\s+(annual|yearly)\s+${PLAN}\b`,
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
// (Welcoming guests is greeting them, a hotel's check-ins and check-outs are
// the desk's, and walk-ins are walk-ins: "Guest Service Agent / Welcome guests
// at the front desk and handle check-ins and check-outs", "...greet walk-ins";
// the thirteenth review.)
// (The fourteenth: only those. "Walk-ins welcome", "We accept walk-ins daily
// at our Ortigas site" is how a Philippine post invites applicants, so a bare
// walk-in is a walk-in client or customer again and only greeting walk-ins is
// the door; check-ins and check-outs are a hotel's only beside a hotel, a
// front desk, a lobby or a resort, never a holiday rental's remote guest
// support: "Answer guest questions on Airbnb and VRBO, manage check-ins and
// check-outs".)
// (The fifteenth: each narrowed to its evidence instead. A walk-in is one
// before a person or a matter ("walk-in clients", "walk-in inquiries",
// "walk-in and phone inquiries"), never the applicant's ("Open for walk-in!",
// "Walk-in or apply online"), and serving walk-ins is the door like greeting
// them ("Serve walk-ins and handle cash payments", "attend to walk-ins",
// "Accommodate walk-ins and process their applications"), which the
// fourteenth's greet-only form had made customer service again. Check-ins and
// check-outs are the desk's as the thirteenth read them, an inn's, an
// apartelle's or a hostel's too ("Welcome arriving guests, handle check-ins
// and check-outs, and process payments"), except on the line of a holiday
// rental's, Airbnb's or VRBO's, which is the fourteenth's evidence.)
// (The sixteenth: a walk-in query or queue is a matter too ("Answer walk-in queries and process payments", "Manage the
// walk-in queue"), and handling or catering to walk-ins is serving them ("Handle walk-ins and process bills payment",
// "Cater to walk-ins and answer their inquiries"). Never welcoming them: "We welcome walk-ins!" invites applicants. And a
// remote host's guests are a rental's whatever it is called: on Booking.com or Agoda, a vacation home or property, a holiday
// home, a listing, or check-ins in an app or on a platform ("Help gym members with app check-ins and check-outs").)
// One store someone stands in: never an online platform's shop ("our TikTok
// Shop", "our WooCommerce store", "our web store", "the App Store"), a
// partner's or franchisee's stores, or stores in many places ("our store
// locations nationwide", "our stores across the country"), which no one
// stands in (the eleventh review), as "our 50 stores across Texas" is not (the tenth).
// The twelfth review: only those. An app, Play, Google or digital store is
// the word right before the store ("the App Store", "our digital store",
// never "our digital printing shop"); a partner's or franchisee's stores are
// many ("our franchise stores", never "our franchise store in Cebu" or "our
// franchise restaurant in Cubao"); many places are the country or the world
// ("our stores nationwide", "our stores across the country"), never a store
// "throughout the day", "across from SM City", "across Metro Manila" or a
// "store location in SM North".
// The thirteenth review: a country is many places too ("our stores across the
// US", "throughout Australia": the country names jobLocation.ts knows). And a
// phone answered for store locations not placed in a city is no one store's
// phone ("Help customers at our store locations through our hotline";
// AT_THE_STORE only), while helping customers at them is still the floor
// ("Assist customers at our store locations and process payments"; the
// twelfth's were "in SM North", "in Cebu").
// The fourteenth: so is "the U.S." (jobLocation.ts now reads it as the US),
// North America, the Philippines' three island groups and a US state ("our
// stores across North America", "our branches across Luzon, Visayas and
// Mindanao", "our stores throughout Texas"; the tenth's "our 50 stores across
// Texas" was one already). Metro Manila stays one store's (the twelfth).
const ONLINE_PLATFORM = String.raw`(online|web|webstore|e-?commerce|virtual|shopify|etsy|amazon|ebay|lazada|shopee|zalora|tiktok|facebook|fb|instagram|ig|woocommerce|wix|squarespace|bigcommerce|carousell|temu)`;
const ONE_STORE = String.raw`(?!(app|play|google play|digital)\s+(stores?|shops?)\b|(franchise|partner)\s+[\w-]*s\b)(?!\d)((?!${ONLINE_PLATFORM}\b)[\w-]+\s+){0,2}`;
const MANY_STORES = String.raw`(locations?\s+)?(nationwide|countrywide|worldwide)|(across|throughout|all over|around)\s+(the\s+)?(country|nation|world|globe|${A_COUNTRY}|north america|luzon|visayas|mindanao|${US_STATE_NAMES})`;
const NOT_MANY_STORES = String.raw`(?!\s+(${MANY_STORES})\b)`;
const NOT_STORE_LOCATIONS = String.raw`(?!\s+(locations(?!\s+in\b)|${MANY_STORES})\b)`;
const IN_PERSON = new RegExp(
  String.raw`\b(in[- ]store|in[- ]person|on the (shop |sales )?floor|at the (register|counter|till|front counter|gate|branch|airport|front of|host stand)|(service|returns|parts|bakery|airport) counter|(work|working|behind|man|manning|staff|staffing)( at)? the (front |service )?(counter|desk)|(grocery|supermarket|convenience|department) stores?|run the register|ring(ing)? up|walk[- ]in(?=\s+(customers?|clients?|guests?|patients?|visitors?|patrons?|members?|borrowers?|shoppers?|diners?|buyers?|inquir\w*|enquir\w*|quer(y|ies)|queues?|concerns?|transactions?|traffic|and (phone|telephone|call)\w*)\b)|(greet(s|ing)?|assist(s|ing)?|serv(e|es|ing)|attend(s|ing)? to|entertain(s|ing)?|accommodat(e|es|ing)|handl(e|es|ing)|cater(s|ing)? to)\s+(our |the )?walk[- ]ins|face[- ]to[- ]face|in the (hotel )?lobby|theme park|(greet|welcom(e|es|ing))(ing)? (our |the )?(guests|members|visitors|residents|diners|patrons|shoppers|passengers)|(?=check[- ]?ins?(\s*(and|&|\/)\s*check[- ]?outs?|\/outs?))(?<!\b(airbnb|vrbo|rentals?|booking\.com|agoda|vacation (homes?|propert\w*)|holiday homes?|listings?|apps?|platforms?|software|saas|kiosks?)\b[^\n]{0,200})check[- ]?ins?(\s*(and|&|\/)\s*check[- ]?outs?|\/outs?)(?![^\n]{0,200}\b(airbnb|vrbo|rentals?|booking\.com|agoda|vacation (homes?|propert\w*)|holiday homes?|listings?|apps?|platforms?|software|saas|kiosks?)\b)|greet(ing)? (our |the )?customers (as they|when they|at (the|our)|in (the|our))|greet(ing)? (our |the )?customers,? (and )?(process|help them find|ring|direct|check)|check(ing)? (them|guests|members|passengers|visitors|people|residents|hotel guests|gym members|customers|clients) in\b(?! with)|check(ing)?[- ]in (hotel )?(guests|members|passengers|visitors|people|residents|customers|clients|vehicles|cars|bags|luggage)\b(?! with)|check-?in (desk|counter)|(post office|ticket|check-in) counter|(at|in) (our|the) (bank )?branch(es)?|bank branch|bus terminal|box office|sell tickets|check bags|pickup desk|at the service desk|(help|helping|assist|assisting|serve|serving)\s+(our |the )?(customers|shoppers|guests|clients|patrons)\s+(at|in|inside)\s+(our|the)\s+${ONE_STORE}(stores?|shops?|branch(es)?|showrooms?|restaurants?|cafes?|pharmac(y|ies)|counters?|outlets?|malls?|dealerships?|supermarkets?|boutiques?)\b${NOT_MANY_STORES})\b`,
);
// (The twenty-second: check-ins in a product's software, SaaS or kiosk are a feature, never a door: "Help customers with
// check-in/check-out issues in our property management software" was a developer's job.)
// (Helping customers in the store is the floor, the tenth review: "CSR | Retail / Help customers in our store", "Help customers at our cell phone store";
// one store only, the eleventh: "Assist customers in our TikTok Shop", "Help customers at our store locations nationwide through our hotline" are not.)
// A telephone, a voice account or a hotline is a remote channel too ("by telephone", "via voice", "our delivery hotline"; the tenth review).
// (A person's voice is not: "Must have a pleasant voice and pleasing personality"; the eleventh.)
// (Nor phones a store sells: "Sell phones, tablets and accessories", "Help customers choose phones and plans"; the twelfth.)
const REMOTE_CHANNEL = /\b(chats?|e-?mails?|phones?(?!,?\s+(and\s+)?(tablets?|laptops?|accessor\w*|gadgets?|chargers?|plans)\b)|telephones?|(?<!\b(brand|of|pleasant|pleasing|clear|good|great|nice|friendly|warm|calm|strong|soft|loud|speaking|confident|professional|natural|neutral|your|his|her|their)\s)voice(?!\s+of\b)|hotlines?|calls?|tickets?|zendesk|freshdesk|help ?desk|inbox|messages?|whatsapp|messenger|viber|sms|texts?|remote|virtual|online|work from home|wfh)\b/;
// Role nouns of the shop floor, the kitchen, the road, the trades and the gym.
// (A crew is a fast-food or milk-tea counter's: "Customer Service Crew / Take customer orders, serve food"; the thirteenth review.
// Only with no channel, remote or support word in the title and nothing off the floor in the words, since the fourteenth:
// "Chat Support Crew", "Non-Voice Crew", "Customer Care Crew - Night Shift / Answer inbound calls" are support lines; isMainStreet.)
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
// (Nor a store's, a hotel's or a care home's own staff: "Customer Service - Retail Staff", "Front Desk - Hospitality Staff", "Customer Care - Care Staff"; the eleventh review.)
const LINE_WORK_PEOPLE = new RegExp(
  String.raw`^(?!(.*\s)?((insurance|travel|real estate|leasing|booking) agents?|account (executives?|managers?)|(financial|travel) advis[eo]rs?|(retail|pharmacy|hospitality) (associates?|staff|team members?)|care staff)$)((${PEOPLE_QUALIFIER}|${LINE_QUALIFIER})\s+)*(agents?|reps?|representatives?|specialists?|associates?|advisors?|advisers?|officers?|executives?|operators?|staff|team members?)${LEVEL_AFTER}${WANTED}$`,
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
// The venues whose front desk is the door a phone is answered at, as a store's counter is (isCustomerService): a lodging, a
// gym, a salon, a clubhouse or a museum, never an office's, a firm's or a warehouse's (the fifteenth review).
// In the title ("Front Desk Agent - Hotel"), or in the words as the desk's own ("at the front desk of our gym").
const DOOR_VENUE = /\b(hotel|motel|hostel|resort|gym|fitness|salon|(?<!med |medical )spa|barbershop|clubhouse|museum)\b/;
const AT_THE_VENUE_DESK = /\bat the front desk of (our|the|a) ([\w-]+ )?(hotel|motel|hostel|resort|gym|fitness (center|centre|studio)|salon|(?<!med |medical )spa|barbershop|clubhouse|museum)\b/;
// ...or a lodging's own desk title, which names no venue: "Guest Service Agent", "Guest Relations Officer" (the sixteenth).
const GUEST_DESK_TITLE = /\bguest (service|services|relations)\b/;
// A desk's check-ins and check-outs, a lodging's own when the words name it ("at our hotel", "in the lobby"), and a remote
// host's lodgings, whose check-ins are done from home: an Airbnb or VRBO, rentals, vacation or holiday homes (IN_PERSON's
// evidence from the fourteenth and sixteenth reviews; isCustomerService, the seventeenth).
// (The eighteenth: only when the agent's own verb takes them, as all the seventeenth's evidence did ("handle check-ins and
// check-outs"), and never done by phone, video, chat or email. Any mention made a hotel account's guest-services agent an
// on-site desk: "Guest Services Agent / Answer guest calls and emails about reservations, check-in and check-out times and
// billing", "Guest Relations Associate / Handle guest calls about reservations, check-ins and check-outs for our client
// hotels", "Guest Services Agent - Hotel BPO / Handle check-ins and check-outs over the phone for US hotel guests".)
// (The nineteenth: no verb list, which that evidence never needed. Only what it showed is taken out: check-ins as the topic,
// after "about", "regarding", "with" or "on" ("Help users of our hotel booking app with check-ins and check-outs"), or their
// times, procedures, policies, schedules or dates, and check-ins done by phone, video, chat or email, unless in person too.
// The verbs left the most common desk posts customer service: "Front Desk Agent / Responsibilities:\n- Guest check-ins and
// check-outs\n- Answering phone calls", "Facilitate guest check-ins and check-outs", "Check-in and check-out guests". And
// "Handle check-ins and check-outs by phone and in person" is a desk again, its LOW 5.)
// (The twentieth: only "about" or "regarding" before them makes check-ins the topic; "with" and "on" also lead the desk's
// own work, "Assist with guest check-ins", "Coordinate with housekeeping on room status, process check-ins…", and so do
// "check-in and check-out procedures".)
// (The twenty-first: and check-ins "on" a call's, an email's or a question's topic, or handled "over the phone with" the guest,
// within a few words or a list, are a hotel account's calls again, "Handle guest calls on reservations, check-ins and
// check-outs", "Assist hotel guests over the phone with booking changes, check-ins…"; a comma and a verb between never
// count, so "Answer calls on reservations, process check-ins…" is still the desk's. "check-in/check-out", "check in and
// check out" and "check-in/out", the common Philippine spellings, are check-ins too, here and in IN_PERSON.)
// (The twenty-second: no "and" or "or" inside that window but just before the check-ins, so "Answer guest calls on
// reservations and handle check-ins" is the desk's two duties again, as the comment above says; and check-in requests,
// concerns, issues, inquiries, questions, problems or changes are a topic, "Help guests with early check-in/check-out
// requests" is a travel account's calls.)
// (The twenty-third: those topic nouns only after "with" and up to two words, so "Handle guest check-in and check-out
// requests, answer phone calls" is a desk again; and the "over the phone with" window takes the "on" window's shape.)
const DESK_CHECK_INS = /(?<!\b(about|regarding)\s+([\w,'-]+\s+){0,5}|\b(calls?|e-?mails?|inquir\w*|enquir\w*|questions?|concerns?|queries|information|info)[ \t]+on[ \t]+(((?!(and|or|&)\b)[\w'-]+[ \t]+){0,3}((and|or|&)[ \t]+)?|([\w'-]+,?[ \t]+){0,4}[\w'-]+,[ \t]+)|\b(via|by|over|through)[ \t]+(the[ \t]+|our[ \t]+|a[ \t]+)?(phones?|video|chats?|e-?mails?|calls?)([ \t]+(and|or|&)[ \t]+(phones?|video|chats?|e-?mails?|calls?))?[ \t]+with[ \t]+((((?!(and|or|&)\b)[\w'-]+[ \t]+){0,3}((and|or|&)[ \t]+)?)|([\w'-]+,?[ \t]+){0,4}[\w'-]+,[ \t]+)|\bwith[ \t]+([\w'-]+[ \t]+){0,2}(?=check[- ]?ins?(\s*(and|&|\/)\s*check[- ]?outs?|\/outs?)\s+(requests?|concerns?|issues?|inquir\w*|enquir\w*|questions?|problems?|changes?)\b))\bcheck[- ]?ins?(\s*(and|&|\/)\s*check[- ]?outs?|\/outs?)\b(?!\s+(times?|policies|polic(y|ies)|schedules?|dates?)\b)(?![^.;\n]{0,40}\b(via|by|over|through)\s+(the\s+|our\s+|a\s+)?(phones?|video|chats?|e-?mails?|calls?)\b(?!\s+(and|or|&)\s+in[-\s]person\b))/;
const AT_OUR_LODGING = /\b(at|in) (our|the) ([\w-]+ )?(hotel|resort|inn|hostel|motel|lodge|pension( house)?|apartelle|lobby)\b/;
// (The twenty-second: and hotels the agent serves for someone else, "our client hotels", "partner hotels", "US hotels", as an
// Airbnb host's lodgings are: a hotel account's check-ins are not its own door.)
// (The twenty-third: "partner", "US" and "UK" hotels only after "for" or "of": "Experience in US hotels is an advantage" and
// "coordinate room transfers with our partner hotels" are a real desk's.)
// (The twenty-fourth: "partner hotels" anywhere but after "with our/the", and US or UK hotels anywhere but shortly after
// "experience": "for guests staying at US hotels" and "across our partner hotels" are an account's again.)
// (The twenty-fifth: "experience in/with/at…" or "experience working in/for…" only, the applicant's past; a "guest
// experience for US hotels" is a hotel account's.)
// (The twenty-sixth: back to the twenty-fourth's window after "experience", at 45 characters, never after "guest" or
// "customer experience": "experience as a front desk agent in US hotels" is the applicant's past too.)
// (The twenty-seventh: and only with "in/at/from/with/of" or "working for" before the hotels inside it: "10 years of
// experience supporting US hotels" and "No experience needed! … our US hotel partners" are an account's.)
// (The twenty-eighth: never after "no experience", and the hotels must start inside the 45 characters: "a great experience on
// every call while helping travelers with reservations at US hotels" is an account's.)
// (The twenty-ninth: nor after "zero" or "without", nor "experience (is) not…", with up to two words between, "No prior
// experience needed!", "Experience not required!"; and a labelled "Experience:" line keeps its reach to the hotels however
// far they come, "Experience: 1-2 years at a hotel front desk, ideally in US hotels" is the applicant's past.)
// (The thirtieth: within its own sentence only, never past "!" or "?"; "not" turns it off only before required, needed,
// necessary, a must or mandatory, never "not less than 1 year"; and "no", "zero" or "without" reach only words on their own
// line, never a "NO PLACEMENT FEE" or "- No tattoos" line above.)
const REMOTE_HOST = /\b(airbnb|vrbo|rentals?|vacation (homes?|propert\w*)|holiday homes?|client hotels?|hotels we (support|serve)|(?<!\bwith (our |the )?)partner hotels?|(?<!(?<!\b(guest|customer)\s+|\b(no|zero|without)[ \t]+([\w-]+[ \t]+){0,2})\bexperience\b(?!:?\s+(is\s+)?not\s+(required|needed|necessary|a\s+must|mandatory)\b)(?=:[^.;!?\n]{0,120}\b(us|u\.s\.|uk)(-based)? hotel|[^.;\n]{0,45}\b(us|u\.s\.|uk)(-based)? hotel)[^.;\n]{0,45}\b((in|at|from|with|of)\s+|working\s+for\s+)([\w-]+\s+){0,3})\b(us|u\.s\.|uk)(-based)? hotels?( chains?)?)\b/;
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
// (So is a shop on a platform: "our TikTok Shop", "our WooCommerce store", "our web store", "the App Store"; the eleventh.)
// (...when the shop is the business's own: "our Facebook shop", never "post our products on Facebook Marketplace" or
// "download apps from the Play Store", which a store's counter does too; the App Store is only no store anyone stands
// in, ONE_STORE; the twelfth.)
// (The thirteenth review: the twelfth's two cases needed only Marketplace and the Play and App Stores taken out; a TikTok Shop
// or an Instagram shop is the business's whoever's it is: "Process TikTok Shop orders", "Manage the brand's Instagram shop orders".)
const ONLINE_BUSINESS = /\b(shopify|etsy|amazon|ebay|e-?commerce|lazada|shopee|zalora|woocommerce|wix|squarespace|bigcommerce|carousell|temu|web ?shop|web ?stores?|tiktok shop|(facebook|fb|instagram|ig) (shop|store)|mail[- ]order|online (store|shop|business|brand|grocery|groceries|pharmacy|retailer))\b/;
// In the store itself: "in our store", "at our drugstore", "at our pharmacy
// counter", "at our cell phone store"; never "at our 50 stores across Texas",
// which no one stands in (the tenth review), nor an online one or "our stores nationwide" (the eleventh).
const AT_THE_STORE = new RegExp(
  String.raw`\b(in|at|inside|around)\s+(our|the|a)\s+${ONE_STORE}(stores?|shops?|drugstores?|pharmac(y|ies)|restaurants?|cafes?|café|bakery|showroom|dealership|supermarkets?|grocery|branch(es)?|counter|register|outlet|mall|box office|ticket (booth|window|counter))\b${NOT_STORE_LOCATIONS}`,
);
// The floor's own work: shelves, aisles, fitting rooms, the stockroom (the tenth review).
// ...and the counter's: cash, the till, working the POS, bagging, the front
// end, a 24-hour store, serving food, keeping the store clean, pricing items
// (the eleventh: "handle cash and keep the counter clean. Willing to work
// graveyard shift", "Process transactions using our POS system ... night
// shift", "work night shift (24-hour store)" are the store's own night shift,
// not a call centre's).
// The twelfth review: each of those is only the words that showed the store,
// since a call centre's posts say the bare ones too. Cash is the thing handled
// ("handle cash and keep the counter clean"), never "cash on delivery
// concerns" or "cash payment concerns"; the counter is one kept clean, never
// "over the counter items" or "counter-check order details"; the POS is the
// agent's to run ("process transactions using our POS"), never "retailers
// using our POS system"; a cashier is no floor word at all ("Experience as a
// cashier is an advantage"), nor "help customers find the right plan", which
// a phone line says too (the phones a store sells are no channel:
// REMOTE_CHANNEL); the store's own records are no shop to keep; and items
// are priced as a duty ("check customer emails from corporate, and price
// items."), never "price items for our online catalog" or "explain pricing".
// (The fifteenth: a dining area kept clean is the counter's too, "Serve customers, take food orders and keep the dining area
// clean", now that a title with no store part reads these words as well; isCustomerService.)
const STORE_FLOOR = /\b(shelves|aisles?|fitting rooms?|stock ?room|cash registers?|restock\w*|planograms?|price tags|(handl\w*|count\w*|accept\w*|tak\w*) (the )?cash(?=\s*((and|or)\b|[,.;\n]|$))|cash handling|the till|(operat\w*|run|running|man|manning) (the |our |a )?(pos|point[- ]of[- ]sale)|transactions (using|on|with|through) (the |our |a )?(pos|point[- ]of[- ]sale)|bag(ging)? groceries|the front end|24[- ]hours? (store|shop|branch|pharmacy|outlet)|serv(e|ing) food|(keep|keeping|clean|cleaning|tidy|tidying|maintain\w*|open|opening|close|closing) (the|our) (store|shop|counters?|dining (area|room|hall)s?)(?!')|(?<!\b(explain\w*|about|on|our|the|of)\s)pric(e|es|ing) (items|products|merchandise|goods)(?=\s*((and|or)\b|[,.;\n]|$)))\b/;
// The sixteenth review: a title with no store part read STORE_FLOOR's every word, so a support job that names one as a topic
// was the counter ("Troubleshoot customer issues with the front end and back end of our web app", "coordinate restocking with
// our warehouse team", "seat selection (aisle or window)", "Troubleshoot point-of-sale terminals and cash registers for our
// restaurant clients"). Such a title reads only the counter's own duties, the fifteenth's evidence: the agent operating,
// running or handling the register, the till or the POS; bagging groceries; serving food; stocking or keeping the shelves;
// keeping the store, the counter, the aisles or the dining area clean ("Greet customers, take orders and handle the cash
// register", "Assist customers with their purchases, restock shelves and operate the cash register", "Take customer orders
// and serve food", "Serve customers, take food orders and keep the dining area clean"). A store-part title still reads
// STORE_FLOOR (isMainStreet).
// The seventeenth review: that dropped the agent's own cash and floor duties with the topics, so a support title over a
// store's duties was customer service again ("Customer Service Representative / Handle cash, issue receipts and assist
// customers with returns and exchanges", "Customer Service Assistant / Work the tills, process refunds and help shoppers in
// the aisles"). STORE_FLOOR's own duty forms that those cases name are back, and no more: handling, counting, accepting or
// taking the cash (never after "to": "train their staff to take cash"), cash handling, working the till, at the cash
// register, restocking merchandise, products, items or goods (never the sixteenth's "restocked products" or "coordinate
// restocking"). Still never transactions on the POS, which a merchant line handles, nor opening the store ("Help customers
// who cannot open the store app").
const COUNTER_DUTY = /\b((operat\w*|run|running|man|manning|handl\w*) (the |our |a )?(cash registers?|registers?|till|pos|point[- ]of[- ]sale)( (system|machine|terminal)s?)?|bag(ging)? groceries|serv(e|ing) food|((re)?stock\w*|arrang\w*|organi[sz]\w*|keep\w*|tid\w*|fac(e|es|ing)) (the |our )?shelves|shelves (stocked|neat|clean|tidy|organi[sz]ed)|(keep|keeping|clean|cleaning|tidy|tidying) (the|our) (store|shop|counters?|aisles?|dining (area|room|hall)s?)(?!')|(?<!\bto\s)(handl\w*|count\w*|accept\w*|tak\w*) (the )?cash(?=\s*((and|or)\b|[,.;\n]|$))|cash handling|(work\w*|man|manning|run\w*|operat\w*) the tills?|at the cash registers?|restock(s|ing)? (merchandise|products|items|goods))\b/;
// The thirteenth review: that brought the store's own floor back as an
// account wherever its words also named a phone, an email or the night shift
// ("Work as cashier and assist customers with returns. Must be willing to
// work night shift", "Help customers find products, process returns and
// answer the phones", "Serve customers over the counter and answer phone
// inquiries", "Handle cash payments, process returns and answer phone calls.
// Night shift", "Use our POS system to process sales and returns. Graveyard
// shift"), and every call centre's post the twelfth found carried an account
// sign ("customers of a US retailer", "US members", "for a US client",
// "retailers using our POS"). So the eleventh's other floor words are back as
// duties that only keep the bare channel or night shift after the role from
// reading as the account (isMainStreet), never an account sign: a cashier as
// a duty ("work as cashier", "handle cashiering duties", never "experience as
// a cashier"), helping customers find goods or items ("help customers find
// products", "assist shoppers in locating items", never "find solutions",
// "answers" or "the right plan"), the counter (never "counter-check" or
// "over the counter items"), cash payments or the cash drawer (never "cash on
// delivery" or "cash payment concerns"), and using the POS.
// The fourteenth review: only the store's own. Finding products on the
// website or in the online catalog is a phone line's work ("Help customers
// find products on our website over the phone"); the POS is the agent's to
// use, never the merchants' or customers' the line helps ("Help merchants use
// our POS software over the phone"); and counter pickup orders are a topic
// ("Answer calls about counter pickup orders").
const STORE_FLOOR_DUTY = /\b((work|working|act|acting|serve|serving)\s+as\s+(an?\s+)?((backup|relief)\s+)?cashiers?|cashiering\s+(duties|tasks|functions)|(perform\w*|handl\w*|do|does|doing)\s+(the\s+)?cashiering|(help|helping|assist|assisting)\s+(our\s+|the\s+)?(customers|shoppers)\s+((to|in)\s+)?(find|finding|locate|locating|choose|choosing)\s+((the\s+right|their)\s+)?(products?|items?|goods|merchandise|tools|what they need)(?!\s+(on|in|through|from)\s+(our|the)\s+(website|web ?site|app|online|catalog))|(?<![-\w])counters?(?!-|\s+(items?|products?|medicines?|medications?|drugs?|pick-?ups?)\b)|(handl\w*|accept\w*|process\w*|tak\w*|receiv\w*|count\w*)\s+(the\s+)?cash\s+(payments|drawers?)|(?<!\b(merchants?|retailers?|customers?|clients?|businesses|users?|owners?|stores?|restaurants?)\s)(use|uses|using)\s+(the\s+|our\s+|a\s+)?(pos|point[- ]of[- ]sale))\b/;
// A store named in the title that is a client a remote team serves, not where
// the agent stands (the tenth review): a named account ("our retail account",
// "a US retail client"), customers in another country ("Assist US
// customers"), a foreign or Fortune 500 retailer, a BPO site or IT park
// ("Work in our Pasig site"), a pharmacy benefit's members, a chain's
// delivery line, orders from its website, its software.
// The eleventh review: each of these is narrowed to what shows a call centre,
// since a store's own posts say the bare words all the time. A foreign or
// Fortune 500 retailer is the client the team works for ("for a US
// retailer", "customers of a Fortune 500 retailer", "Our client is a US
// retail brand"), never the one hiring ("Join an American retail brand!",
// "Walmart is a Fortune 500 retailer"); a site is where the agent works
// ("Work in our Pasig site"), never "keep the site clean" or a mall; members
// are a plan's or a pharmacy benefit's (their claims, coverage, benefits or
// prescriptions), never "help members with returns"; software is the
// customers' ("customers of our retail POS software", "businesses using our
// accounting software"), never "use our software to look up prices" or
// "operate the POS system"; a chain or a restaurant group counts by its
// hotline; its online orders, app and website no more (a store has them
// too: "prepare online orders for curbside pickup").
// (The words between a country and what it names say what kind, "a US retail
// account", "a US-based healthcare client", never a verb or a joining word, so
// "Join us and help customers" is no US customer.)
const COUNTRY = String.raw`(us|u\.s\.|uk|australian|canadian|american|international|offshore|overseas|foreign)(-based)?`;
const KIND_WORDS = String.raw`((?!(and|or|to|in|at|on|as|for|with|by|from|now|today|help\w*|assist\w*|serv\w*|support\w*|handl\w*|answer\w*|tak\w*|mak\w*|keep\w*|provid\w*|deliver\w*|open\w*|manag\w*)\b)[\w-]+\s+){0,2}`;
const PLAN_MATTERS = String.raw`(claims?|coverage|benefits?|plans?|polic(y|ies)|eligibility|premiums?|deductibles?|enrol+ments?|prescriptions?|refills?|medications?)`;
const STORE_ACCOUNT = new RegExp(
  [
    String.raw`\b${COUNTRY}\s+${KIND_WORDS}(accounts?|clients?|campaigns?|customers|callers|members|patients|consumers|shoppers|subscribers|users|buyers)\b`,
    String.raw`\b(retail|telco|healthcare|banking|financial|insurance|e-?commerce|travel|pharmacy|pharma|consumer|client) (accounts?|campaigns?)\b`,
    String.raw`\b(for|(?<!part )of|serving|supporting|support|on behalf of|(our|the) client(,| is))\s+(an?|the|one of the|our)\s+([\w-]+\s+){0,2}(${COUNTRY}\s+${KIND_WORDS}(retailers?|brands?|compan(y|ies)|chains?|giants?)|fortune 500\s+([\w-]+\s+)?(retailers?|brands?|compan(y|ies)|clients?)|retail giants?)\b`,
    String.raw`\b(work|working|report|reporting|based|stationed|assigned)\s+(in|at|from|to)\s+(our|the)\s+([\w-]+\s+){0,2}(?<!mall\s)site\b`,
    // (...or our site named by its place: "We are hiring for our Makati site!", "Our Ortigas site is hiring!"; the twelfth.)
    String.raw`\bour\s+(?!(web|mall|new|main|own|job|work|construction|online)\b)[\w-]+\s+site\b`,
    // (Customers who shop on our website, orders placed on it, merchants setting up our POS, questions about our software; the twelfth.
    // Nothing in the store, as every rule here: "Help customers in our store and with orders from our website" stays the store.)
    // (Orders placed on it only as the customers' concerns, as the twelfth's were: "Prepare orders placed on our app for curbside
    // pickup" is the store's; the thirteenth.)
    String.raw`\b(shop|shops|shopping|buy|buys|buying) (on|from|through|via) (our|the) (website|web ?site|app|online store)\b|\b(concerns?|questions?|issues?|inquir\w*|enquir\w*|problems?|complaints?) (about|with|on|regarding|for) (their )?orders? placed (on|through|via) (our|the) (website|web ?site|app)\b`,
    String.raw`\b(merchants|retailers|businesses|owners|clients|customers|users)\s+(set up|setting up|install|installing|configure|configuring|troubleshoot|troubleshooting)\s+(our|the|their)\s+([\w-]+\s+){0,2}(software|platforms?|apps?|pos)\b|\b(questions|issues|problems) (about|with|on|regarding) (our|the) ([\w-]+\s+){0,3}software\b`,
    String.raw`\b(it|tech|technology|business) park\b|\b(policyholders?|enrollees?)\b`,
    String.raw`\bmembers?'?(?=[^.;\n]{0,80}\b${PLAN_MATTERS}\b)|\b${PLAN_MATTERS}\b[^.;\n]{0,80}\bmembers?\b`,
    String.raw`\b((restaurant|retail|store|pharmacy|grocery|drugstore|supermarket) (groups?|chains?)|chain of (stores|restaurants|pharmacies|drugstores|supermarkets|shops))('s?)?\s+([\w-]+\s+){0,2}(hotlines?|call cent(er|re)s?|contact cent(er|re)s?)\b`,
    String.raw`\bdelivery orders?\b`,
    String.raw`\bsaas\b|\b(customers|clients|users|businesses|merchants|retailers|stores|restaurants|owners)\s+(of|using|who use|on)\s+(our|the|their)\s+([\w-]+\s+){0,3}(software|platforms?|apps?|pos)\b`,
  ].join("|"),
);
// After the role, where the store part reads as the account, the night shift says so too.
const NIGHT_SHIFT = /\b(night|graveyard)[- ]shifts?\b|\bgraveyard\b/;
// A perk that is how the job is worked stays when the perks are taken out:
// "Perks:\n- Permanent work from home", "What we offer:\n- 100% remote",
// "Benefits:\n- Night shift differential" (the twelfth review: the eleventh's
// bullets rule took them with the plans, so the store-part title and the
// venue rules read those jobs as on site). A negated or training-only remote
// word keeps its "not" or "training", so NOT_REMOTE still takes it out.
// (Only how the job is worked, as the twelfth's were: "Free virtual fitness classes" or "Remote work stipend for corporate
// staff" is no job done from home; the thirteenth review.)
// (Only those, the fourteenth: dropping "virtual" and every allowance lost "100% virtual role" and "WFH allowance", which
// are; virtual classes and a remote work stipend stay out.)
// (The fifteenth: "virtual" only as the role or its setup, as the fourteenth's evidence was: "100% virtual role", "Fully
// virtual team", "Virtual office". Any other "virtual" perk is no job done from home, and it took store, hotel and counter
// jobs off the floor: "HMO with virtual consultations", "Virtual team-building events", "Monthly virtual town halls",
// "Virtual wellness sessions". So the virtual classes need no exception of their own.)
const PERK_REMOTE = String.raw`\b(work from home|work-from-home|wfh|remote(ly)?|home[- ]based|(100%|fully|permanent(ly)?|full-time)\s+virtual(ly)?|virtual(ly)?(?=\s+(role|job|position|setup|set-up|work|office)\b))\b(?!\s+work\s+stipends?\b)`;
const PERK_SETUP = new RegExp(String.raw`(\b(not|no|non|never|isn'?t)[- ]+((a|an|the|fully|100%)\s+)?)?${PERK_REMOTE}(\s+(training|onboarding|orientation))?|${NIGHT_SHIFT.source}`, "g");
const perkSetup = (perks: string) => ` ${(perks.match(PERK_SETUP) ?? []).join(" ")} `;
// Tickets sold at a counter, not support tickets (nor their refunds or exchanges; the tenth review).
// (Nor a store's lottery or raffle tickets: "help customers at our grocery store's customer service desk with returns and lottery tickets"; the twelfth.)
const TICKETS_SOLD = /\b(sell|selling|sold|buy|buying|purchas\w*|issue|issuing|print|printing|scan|scanning)\s+([\w-]+\s+)?tickets?\b|\btickets?\s+(purchases?|sales?|refunds?|exchanges?|counter|booth|window|office)\b|\b(lottery|lotto|raffle) tickets?\b/g;

function isMainStreet(title: string, work = ""): boolean {
  const head = headPhrase(title, work);
  const noun = head.split(/\s+/).pop() ?? "";
  if (MAIN_STREET_HEAD.test(noun) && !TECH_SERVER.test(head)) return true;
  // (A crew, when nothing says it is a support line's; the thirteenth and fourteenth reviews. A customer experience crew's,
  // never any "experience": "Customer Service Crew (No Experience Needed)" is the counter's; the fifteenth.)
  if (/^crews?$/.test(noun) && !/\b(virtual|remote|online|work from home|wfh|chat|e-?mail|phone|voice|call cent(er|re)|non[- ]?voice|support|care|customer experience|cx)\b/.test(title) && !OFF_THE_FLOOR.test(work) && !ONLINE_BUSINESS.test(work) && !REMOTE_WORDS.test(work)) return true;
  // ...or in any part of the title, or either side of a slash, in the singular:
  // "Customer Service Rep - Cashier", "Cashier/Customer Service Rep" (the ninth
  // review; a plural can be the people a support line serves: "Customer
  // Support - Uber Drivers").
  // (...unless the words say the line helps them: "Customer Support - Courier / help couriers with app issues via chat"; the tenth review.)
  // (By a channel, as all of the tenth's were: "Customer Service - Cashier / assist cashiers during busy periods" is the cashier; the eleventh.)
  // (...or by the business's app or platform, which no one stands at: "Help drivers with app issues, payouts and account problems"; the twelfth.)
  // (...helping them with it, in one sentence: "Use our driver app to accept deliveries. Help customers with questions at drop-off" is the driver; the thirteenth.)
  const roleParts = titleParts(title).filter((p) => !p.business);
  const line = roleParts.find((p) => CS_TITLE.test(p.text))?.text;
  const sides = roleParts.flatMap((p) => p.text.split(/\s*\/\s*/));
  const served = (side: string) => !!line && side !== line && !!work && (REMOTE_CHANNEL.test(work) || /\b(help|helping|assist|assisting|support|supporting|answer|answering|respond|responding|reply|replying|resolve|resolving)\b[^.;\n]{0,60}\b(apps?|platforms?|payouts?)\b/.test(work)) && lineServes(side, work, line);
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
  // (The floor's duties keep the bare channel or night shift from reading as the account, never an account sign; the thirteenth review.)
  const bareAccount = !STORE_FLOOR_DUTY.test(work) && (after ? REMOTE_CHANNEL.test(work) || NIGHT_SHIFT.test(work) : /\be-?mails?\b/.test(work));
  const storeAccount = headAt >= 0 && !inTheStore && (STORE_ACCOUNT.test(work) || bareAccount);
  if (storeAt >= 0 && !remoteTitle && !titleChannel && !offTheFloor && !storeAccount) return true;
  // A hotel's, gym's or office's front desk, unless the work is done from home.
  // (...but greeting visitors there is the office's front desk.)
  // (The "office" of a "Front Office" title is the role's own name, not the
  // venue: "Front Office Associate / handle inbound calls for our healthcare
  // account" is a call-centre job; the eleventh review.)
  const venueText = (/\b(greet\w*|welcom\w*|visitors?|walk-?ins?|sign\w* in|(?<!-)mail|deliveries|packages)\b/.test(work) ? `${title} ${work}` : `${title} ${work}`.replace(OFFICE_NOT_VENUE, " ")).replace(/\bfront office\b/g, " ");
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
  // (A perk that is how the job is worked stays: "Perks:\n- Permanent work from home"; the twelfth review.)
  const work = (brief.whatTheyDo ?? "").toLowerCase().replace(PERKS, perkSetup).replace(HOW_TO_APPLY, " ").replace(NOT_REMOTE, " ");
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
  // (An online business in the title is no floor either: "E-commerce Customer Service"; the eleventh review.)
  // (Nor the phone at the entrance or the front desk the words name, as at a store: "Greet customers at the entrance, assist
  // with returns and answer phone inquiries", "Greet members at the front desk, sell memberships and answer phones"; the thirteenth.)
  // (The front desk only when the title names a venue, as the thirteenth's gym did: an office CSR who answers calls and emails
  // and helps walk-in clients at the front desk is still on the phone, "Answer incoming calls and emails from policyholders ...
  // and assist walk-in clients at the front desk of our agency"; the fourteenth.)
  // (The fifteenth: only a lodging's, gym's or salon's front desk, the thirteenth's evidence, in the title or as "at the front
  // desk of our gym". VENUE's office, corporate, real estate, condo, warehouse and factory are where an office CSR helps at the
  // front desk between calls: "Customer Service Representative (Office-Based) / Answer customer calls and emails about their
  // accounts. Assist walk-in clients at the front desk", "Corporate Customer Service Representative".)
  // (The sixteenth: a lodging's own desk titles too, which name no venue: a guest-service title, or a front desk or front
  // office whose words name guests. "Guest Service Agent / Welcome guests at the front desk, handle check-ins and check-outs,
  // answer the phone and process payments", "Front Desk Agent / Greet guests at the front desk, answer phone calls and handle
  // reservations" were customer service since the fourteenth. Never a front desk with clients or visitors, which an office's
  // is: "Front Office Associate / Answer customer calls and emails and assist walk-in clients at the front desk".)
  // (The seventeenth: and a front desk whose words take check-ins and check-outs, which only a lodging's does in person:
  // "Front Desk Associate / Handle check-ins and check-outs, process payments and update bookings on our reservation
  // platform". A clinic's patient check-ins stay the clinic's, clinicWork.)
  const checkIns = DESK_CHECK_INS.test(work);
  const lodgingDesk = GUEST_DESK_TITLE.test(title) || (/\bfront (desk|office)\b/.test(title) && (/\bguests?\b/.test(work) || checkIns));
  // (The seventeenth: a lodging desk's check-ins are the door too, as "at the front desk" is, so a phone word does not take
  // it off the floor: "Guest Relations Officer / Welcome guests, handle check-ins and check-outs and coordinate with
  // housekeeping. Answer phone inquiries", "Guest Service Agent - Pension House / Handle check-ins and check-outs and answer
  // the phone".)
  const hostCheckIns = checkIns && !REMOTE_HOST.test(work);
  // (The twenty-second: a lodging desk that greets or welcomes guests, works in the lobby or in person is at the door too,
  // check-ins or none: "Guest Service Agent / Welcome guests, answer phone calls and process payments" was customer service
  // in every round.)
  // (The twenty-third: never a greeting "on the phone" or "on every call", and never "in person" or "face-to-face" beside an
  // interview, exam, assessment, hiring, screening, orientation, training or application: "Face-to-face interview in
  // Makati" made a phone guest-services job a desk.)
  // (The twenty-fourth: the greeting's "by phone" window stops at a comma, so "Greet and welcome guests, process check-ins…,
  // answer inquiries by phone" is a desk again; and the interview, training or onboarding beside "in person" is read in the
  // same sentence or line, in any wording: "Interview: face to face.", "Training is in person in Makati.")
  // (The twenty-fifth: the chat and email words count as "by phone" only within four words of the guests with no "and"
  // between, "Welcome guests and answer inquiries via phone…" is a desk's; and only an interview's, training's or
  // onboarding's own few words beside "in person", never "We are hiring" or "(training provided)" in the same line.)
  const atTheDoor = /\bat the entrance\b/.test(work) || (/\bat the front desk\b/.test(work) && (DOOR_VENUE.test(title) || AT_THE_VENUE_DESK.test(work) || lodgingDesk)) || (lodgingDesk && (hostCheckIns || /\b(greet\w*|welcom\w*)( and (greet\w*|welcom\w*))? (our |the |arriving |incoming )?guests\b(?![^.;\n,]{0,60}\b(on|over|by) (the |every |each |all )?(phones?|telephones?|calls?)\b)(?!(\s+(?!and\b)[\w-]+){0,4}\s+(on|over|by|via|through|during|when answering) (the |every |each |all |a )?(phones?|telephones?|calls?|chats?|e-?mails?)\b)|\bin the (hotel )?lobby\b|\bwalk[- ]in guests\b|(?<!\b(interviews?|training|exams?|assessments?|screening|orientation|onboarding|nesting)\b[^.;!?\n]{0,25})\b(in[- ]person|face[- ]to[- ]face)\b(?![^.;!?\n]{0,20}\b(interviews?|training|exams?|assessments?|hiring|screening|orientation|onboarding|nesting)\b)/.test(work)));
  const offTheFloor = REMOTE_CHANNEL.test(title) || ONLINE_BUSINESS.test(title) || OFF_THE_FLOOR.test(floorWork) || ONLINE_BUSINESS.test(work) || REMOTE_WORDS.test(work) || (REMOTE_CHANNEL.test(floorWork) && !AT_THE_STORE.test(work) && !atTheDoor);
  // (...or the counter's own duties, which a title with no store part said nothing of: "Customer Service Associate / Greet
  // customers, take orders and handle the cash register", "Customer Service Representative / Take customer orders, prepare
  // drinks and operate the POS"; the fifteenth. Only those duties since the sixteenth, COUNTER_DUTY, never STORE_FLOOR's
  // topics, under the same off-the-floor test.)
  // (...or a lodging's check-ins and check-outs, at its desk or "at our hotel", whatever app or platform its bookings come
  // from: IN_PERSON skips check-ins beside Booking.com, Agoda, an app or a platform, the sixteenth's remote hosts, and
  // Philippine hotel desks name them all the time ("Front Desk Agent / Handle guest check-ins and check-outs and manage
  // reservations from Booking.com and Agoda", "Guest Experience Associate / Handle check-ins and check-outs at our boutique
  // hotel; respond to reviews on booking platforms"); the seventeenth. Never a remote host's, the fourteenth's and sixteenth's
  // evidence, REMOTE_HOST: "Guest Services Agent / Manage check-ins and check-outs for our vacation homes" is still theirs.)
  if ((IN_PERSON.test(`${title} ${work}`) || COUNTER_DUTY.test(work) || (hostCheckIns && (lodgingDesk || AT_OUR_LODGING.test(work)))) && !offTheFloor && !clinicWork) return false;
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
    const dispatch = BOOKS_OWN_STAFF.test(work) && !BOOKED_FOR.test(work) && !REMOTE_CHANNEL.test(work);
    // (At the showroom is in person too: "reservations for our car models and test drives at our showroom"; the tenth review.)
    // (Logistics in the title is freight: "Booking Agent (Logistics)"; in the words, only as the business; the eleventh review.)
    // (...or with no customer and no channel in the words, as a crew's dispatch is: "coordinate with our logistics partners"; the twelfth.)
    // (...by a freight desk's own words only, never "travel logistics" or "coordinate logistics for each shoot"; the thirteenth.)
    const freight = /\blogistics\b/.test(title) || LOGISTICS_BUSINESS.test(work) || (FREIGHT_LOGISTICS.test(work) && !BOOKED_FOR.test(work) && !REMOTE_CHANNEL.test(work));
    // (A planner's conference or corporate event, never where the words name rooms or guests; the thirteenth. Only its venues,
    // catering or AV and its logistics since the fourteenth. Planning and the planner's verbs are skipped only on a venue's own
    // words since the fifteenth: PLANNER_WORK, VENUE_OWN.)
    // (...nor in a title that names a hotel or resort, the seventeenth: VENUE_OWN.)
    // (...nor the seventeenth's own two forms, only where the words name no clients; the eighteenth: VENUE_OWN_17.)
    // (...only the agency's own clients, "for our clients", "for the hotel clients", "clients we serve", as all the
    // eighteenth's were; the nineteenth. A hotel's corporate clients are its guests: "Reservations Agent / Coordinate
    // corporate events with the banquet team and answer calls from corporate clients" was a planner.)
    // (The twentieth: "our corporate clients" are the hotel's guests too; only clients the agency works "for". The
    // twenty-first: and "our clients" except "from our clients", since "Plan corporate events with our clients" is an agency's.)
    const venueOwn17 = VENUE_OWN_17.test(work) && !/\b(for|(?<!\bfrom )our)( [\w-]+){0,2} clients\b|\bclients we serve\b/.test(work);
    const planner = (EVENT_PLANNER.test(`${title} ${work}`) && !VENUE_BOOKED.test(`${title} ${work}`)) || (PLANNER_WORK.test(`${title} ${work}`) && !VENUE_OWN.test(`${title} ${work}`) && !venueOwn17 && !/\b(hotel|resort)\b/.test(title));
    return !NOT_GUEST_BOOKING.test(`${title} ${work}`) && !planner && !freight && !((IN_PERSON.test(work) || AT_THE_STORE.test(work)) && !REMOTE_CHANNEL.test(work)) && !dispatch;
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

// A line or sentence of What they do that is only the remote setup: "Permanent work from home.", "This is a WFH role.",
// "Fully remote." (the fourteenth Phase 4 review's cases; the fifteenth, briefFromForm).
// (The sixteenth: in the forms posts write it in, which still say nothing else: a bullet ("- Permanent WFH", "• Work from
// home", "* 100% WFH"), a label ("Work setup: Permanent WFH", "Setup: WFH", "Work Arrangement: Permanent Work From Home"),
// "This position is fully remote.", "work-from-home", "set-up" and "WFH (Permanent)". The fifteenth's own form had dropped
// them, and since Publish takes remote from the brief those jobs were saved on site, a US one paid in USD.)
// (The seventeenth: after any mark, as posts pasted from Facebook or Jobstreet bullet their lines ("✅ Permanent WFH", "📌 Work
// setup: Permanent WFH", "👉 WFH", "🏠 Work From Home", "> Permanent WFH"), and a "Job Setup:" label. Never after a mark
// that says no: "❌ WFH" in "Work setup:\n✅ Onsite\n❌ WFH".)
// (The eighteenth: a mark after it too, "Permanent WFH 🏠", "Work From Home ✅", never one that says no, a colon or a
// question mark: "WFH ❌", "WFH:", "WFH?".)
// (The nineteenth, its LOW 1: only a mark that says yes or names home, as that evidence's did ("WFH 💯" too). Any other
// mark after it read remote, a "not yet" too: "WFH 🔜", "WFH 👎", "WFH 🙅", "WFH 😢", and "WFH..." before "soon!".)
// (The twentieth: any marks again, as the eighteenth read them, but never a "no", a "not yet", a colon, a question or an
// ellipsis: the eight marks left "Permanent WFH 💻", "‼️ PERMANENT WFH ‼️" and "WORK FROM HOME!!!" on site.)
const ONLY_REMOTE_LINE = /^(?![^a-z0-9]*(❌|✖|✗|✘|❎|🚫|⛔))[^a-z0-9]*((work |job )?(setup|set-up|arrangement|location|mode)\s*[:\-–]\s*)?(this is an? |this (role|position|job) is )?(permanent(ly)? |fully |100% )?(remote|work[- ]from[- ]home|wfh|home[- ]based)( (role|job|position|setup|set-up|work))?( ?\(permanent\))?(?![^a-z0-9]*(❌|✖|✗|✘|❎|🚫|⛔|🔜|👎|🙅|😢|:|\?|\.\.|…))[^a-z0-9]*$/;
// ...and never beside a line that is only another setup, as a post hiring for two lists them ("Work setup options:\n- Onsite\n-
// WFH", "We are hiring for two setups:\n- WFH\n- Onsite (Taguig)", "Work setup: Hybrid\n- WFH"): the sixteenth's bullets read
// those remote, which the fifteenth built on site (the seventeenth review). Only the setup, a place in brackets at most:
// "- Onsite interview in Makati" or "Onsite training" is no other setup.
// (The twenty-first: with the remote line's own tail of marks, so "‼️ ONSITE ‼️" or "- Onsite 🏢" beside "- WFH 💻" is a second
// setup, as the plain lines were.)
const ONLY_ON_SITE_LINE = /^[^a-z0-9]*((work |job )?(setup|set-up|arrangement|location|mode)\s*[:\-–]\s*)?(on[-\s]?site|hybrid|office[-\s]based|in[-\s]office)( (only|setup|set-up|work|role|job|position))?( ?\([^)\n]*\))?(?![^a-z0-9]*(❌|✖|✗|✘|❎|🚫|⛔|🔜|👎|🙅|😢|:|\?|\.\.|…))[^a-z0-9]*$/;
// The setup line's own reading of a perks block: any mark is a bullet, as the setup line's are, so "Benefits:\n✅ HMO\n✅
// WFH" and "We offer:\n👉 HMO from day 1\n👉 WFH" stay perks (the seventeenth review). Only here: the classifier's PERKS
// keeps round sixteen's bullets (the eighteenth).
const SETUP_PERKS = new RegExp(String.raw`(?<=^|\n)[ \t]*([-•*][ \t]*)?${BENEFIT_HEADING}[^\n:.;]{0,30}[:?][ \t]*(\n[ \t]*[^\w\s][^\n]*)+`, "g");
// A heading whose on-site line is the interview or the training, not a second setup (remoteSetupLine; the nineteenth).
// (The twentieth: after a word or two, "Final interview:", "Paid training:", never "After training:"; and "hiring process",
// not "Hiring for:", which lists two setups.)
// (The twenty-first: the hiring's own setup, mode, venue, site, location or steps, and a recruitment, application or selection
// process; never a bare "Hiring now:" or "Hiring CSRs:", which list the job's setups.)
const SEPARATE_HEADING = /^[^a-z0-9]*((?!(after|post|upon|once|until|before)\b)[\w-]+\s+){0,2}(interviews?|training|nesting|(hiring|recruitment|application|selection) (process|set-?up|mode|venue|site|location|steps?)|assessments?|exams?|onboarding|orientation)\b/;
const HIRING_HEADING = /^[^a-z0-9]*((?!(after|post|upon|once|until|before)\b)[\w-]+\s+){0,2}(hiring|recruitment|application|selection) (process|set-?up|mode|venue|site|location|steps?)\b/;
function remoteSetupLine(work: string): boolean {
  const lines: string[] = [];
  const afterBlank: boolean[] = [];
  let blank = false;
  for (const physical of work.toLowerCase().replace(SETUP_PERKS, " ").replace(PERKS, " ").split(/\n/)) { if (!physical.trim()) { blank = true; continue; } physical.split(/(?<=[.!?])\s+/).forEach((piece, k) => { lines.push(piece); afterBlank.push(k === 0 && blank); }); blank = false; }
  // (The eighteenth: another setup counts only under the same heading as the remote line, where a line that ends in ":"
  // starts a new heading. A bullet under "Interview:" or "Training:" is no second setup: "Work setup:\n- Permanent WFH\n
  // Interview:\n- Onsite (Makati)" and "Training:\n- Onsite (2 weeks)\nWork setup:\n- Permanent WFH" were built on site.)
  // (The nineteenth: only an interview, training, nesting, hiring, assessment, exam, onboarding or orientation heading, the
  // eighteenth's evidence, is another heading. Any heading let a WFH line under it undo an on-site setup, so on-site jobs were
  // built and saved remote: "Work setup:\n- Onsite (Makati)\nAfter regularization:\n- WFH", "Option 1:\n- Onsite (Makati)\n
  // Option 2:\n- WFH", and a perk under a heading BENEFIT_HEADING does not know, "What we can offer:\n- HMO\n- WFH".)
  let heading = "";
  // (The twenty-third: a line with its own "Work setup:" label belongs to no heading, and a remote line is set aside only when
  // an on-site line sits under the same hiring heading: a WFH setup after a training or hiring section was built on site.)
  // (The twenty-fourth: hiring headings only (HIRING_HEADING), as the comment says, so a training's own "- Setup: Onsite" is
  // the training's; the label that frees a line needs "work" or "job" and takes "location" and "mode" too; and the headings
  // with an on-site line are read once, so the check is linear: 15,000 lines under one heading took over a second.)
  // (The twenty-fifth: an unbulleted "Setup:", "Set-up:" or "Arrangement:" line belongs to no heading again, as in round 23,
  // so "Training:\n- WFH\nSetup: Onsite" is on site; a bulleted "- Setup: Onsite" stays the section's.)
  // (The twenty-sixth: "bulleted" is what makes a line part of the list there: -, • or *, or the same mark as the line before
  // it (or first under the heading), since Philippine posts bullet with ✅, 👉, ▪️ or ➤: "Training:\n✅ Setup: Onsite" is the
  // training's.)
  // (The twenty-seventh: a line's mark is its first symbol only, "✅ ₱600 daily allowance" is a ✅ line, and it is compared with
  // the nearest marked line since the heading, not the sentence piece before it; and a remote line with its own "Setup:"
  // label is never the hiring's second setup: "Hiring process:\n✅ Onsite (Makati)\n✅ Setup: Permanent WFH" is remote.)
  // (The twenty-eighth: a short unmarked line after a blank line, "PRODUCTION", "JOB DETAILS", ends the list above it like a
  // heading without its colon, so the job's own "✅ Setup: Onsite" after it is the job's.)
  // (The twenty-ninth: never a separator that names the training or the interview, "Nesting", "Interview day". It only ends
  // the list: the lines after it are read as the job's only up to the next marked line, so a "✅ Schedule" before "✅ Setup:
  // Onsite" there still leaves the setup under the training heading, unlike a real "Job details:" heading.)
  // (The thirtieth: a "Label: value" line ends the list again, as round 28 read it, "Location: Makati City" before the job's
  // own "✅ Setup: Onsite"; and a separator never comes straight after a heading line, so "Training:\n\nDuration: 2 weeks" stays
  // the training's. Left: a blank line inside a training's list, then "Duration: 2 weeks", ends that list early.)
  const mark = (line: string) => /^[ \t]*([^\p{L}\p{N}\s])/u.exec(line)?.[1] ?? "";
  let last = "";
  const sep = lines.map((line, i) => afterBlank[i] && i > 0 && !/:\s*$/.test(lines[i - 1]) && !mark(line) && /^[^.,;!?]{1,40}$/.test(line.trim()) && line.trim().split(/\s+/).length <= 4 && !SEPARATE_HEADING.test(line));
  const before = lines.map((line, i) => { const was = last; if (/:\s*$/.test(line)) last = ":"; else if (mark(line)) last = mark(line); else if (sep[i]) last = ""; return was; });
  const listed = (i: number) => /^[ \t]*[-•*]/.test(lines[i]) || (mark(lines[i]) !== "" && (before[i] === ":" || before[i] === mark(lines[i])));
  const under = lines.map((line, i) => (/:\s*$/.test(line) ? (heading = line) : (/^[^a-z0-9]*((work|job) )?(setup|set-up|arrangement)\s*[:\-–]\s*[a-z0-9]/.test(line) && !listed(i)) || /^[^a-z0-9]*(work|job) (setup|set-up|arrangement|location|mode)\s*[:\-–]\s*[a-z0-9]/.test(line) ? "" : heading));
  // (The twenty-second: a remote line under the hiring's own heading is the hiring's too, so "Hiring setup:\n✅ Onsite\n✅
  // WFH" lists two setups, as it did before the twenty-first set its on-site line aside.)
  const onSite = lines.map((line) => ONLY_ON_SITE_LINE.test(line));
  const onSiteUnder = new Set(under.filter((_, j) => onSite[j]));
  const listsTwo = (i: number) => HIRING_HEADING.test(under[i]) && onSiteUnder.has(under[i]) && !/^[^a-z0-9]*((work|job) )?(setup|set-up|arrangement)\s*[:\-–]\s*[a-z0-9]/.test(lines[i]);
  return lines.some((line, i) => ONLY_REMOTE_LINE.test(line) && !listsTwo(i)) && !lines.some((_, i) => onSite[i] && !SEPARATE_HEADING.test(under[i]));
}

/** What the job builder's Type field starts on (AvaCreateJob.tsx). Until the business types in it, its "On-site" is only
 *  this default, which the place, the title and What they do may overrule (briefFromForm). */
export const DEFAULT_JOB_TYPE = "Full-time · On-site";
// The default's own tail once the business has changed only what comes before it: "Part-time · On-site", "Contract ·
// On-site", "Full time · On-site", "Project-based · On-site", or the default retyped (the eighteenth review).
// (The nineteenth: whatever employment wording comes before it, not a closed list of words, so "Regular · On-site",
// "Probationary · On-site", "Full-time / Part-time · On-site", "Part-time (20 hrs/week) · On-site", "Full-time · Night shift
// · On-site", "Temp · On-site" and "PRN · On-site" are the default's place too, as long as what comes before names no place
// (placeSaysRemote) and no in-person word (briefFromForm).)
const DEFAULT_PLACE_TAIL = /\s*·\s*on-site\s*$/;
// A Type that says in person, which names no on-site or remote word: "Full-time · In person", "Part-time · In-store" (the
// eighteenth review's LOW 4).
const TYPE_IN_PERSON = /\bin[-\s]?(person|store)\b/;
// On-site training, onboarding or orientation in a remote title is the training, not the job: "WFH CSR | Onsite training in
// Cebu", "Customer Service Representative - WFH after 2 weeks onsite training" (the sixteenth review's evidence).
// (The eighteenth, the same class: on-site nesting, interviews, hiring, exams and assessments, and training or an interview
// that "is" or ": " on site. "WFH Customer Service Representative (Onsite Interview)", "WFH Chat Support | Onsite Hiring",
// "Work From Home CSR - Onsite Assessment in Ortigas", "WFH CSR (2 weeks onsite nesting)", "WFH CSR - Training is onsite",
// "WFH CSR | Training: Onsite" were built on site and saved is_remote=false. "Onsite during training", "Onsite for the first
// month" and "Onsite equipment pickup" stay on site, as "Onsite 2 weeks then Permanent WFH" does.)
// (The nineteenth: training, an interview or nesting followed by on site with a plain space too, the word order Philippine
// posts use: "WFH CSR (Training Onsite)", "WFH CSR - Training onsite in Makati", "WFH CSR (Interview Onsite)", and a Type
// "Full-time · WFH (training onsite)" were built on site. "Onsite then WFH" and "Onsite for 2 weeks training" stay on site.)
const ON_SITE_TRAINING = /\b(on[-\s]?site|in[-\s]?office|office[-\s]based)\s+(training|onboarding|orientation|nesting|interviews?|hiring|exams?|assessments?)\b|\b(training|interviews?|nesting)(\s+is\s+|\s*:\s*|\s+)(on[-\s]?site|in[-\s]?office)\b/gi;

export function briefFromForm(fields: {
  role: string;
  location: string;
  type: string;
  pay: string;
  start: string;
  work: string;
  workMode?: string;
  /** True once the business has typed in the Type field; false while it holds the builder's default or the voice brief's
   *  (which reads a local role as on-site unless told otherwise: ava-voice-session). Left out (an old draft, another
   *  caller), the Type counts as chosen when its text is not the default. */
  typeChosen?: boolean;
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
  const typeChosen = fields.typeChosen ?? wm.replace(/\s+/g, " ").trim() !== DEFAULT_JOB_TYPE.toLowerCase();
  // (The eighteenth review: the Type is read whole, as the title is. The on-site word was taken out of it before asking
  // whether it says remote, so "Full-time · Onsite (WFH after regularization)", "Full-time · On-site, WFH not available" and
  // "Full-time · Onsite (Remote not available)" were built remote. Only on-site training is taken out, as from a title:
  // "Full-time · WFH (onsite training)" is remote. "Full-time · Onsite then WFH" is on site, as the title rule reads it.)
  const typeBesidesTraining = wm.replace(ON_SITE_TRAINING, " ");
  const typePlace = placeSaysRemote(typeBesidesTraining);
  const titleBesidesTraining = fields.role.replace(ON_SITE_TRAINING, " ");
  // (The eighteenth: any keystroke in Type marked it chosen, so a business that changed "Full-time" to "Part-time" and left
  // the default's "· On-site" had chosen on site: "Work From Home Chat Support Agent" with "Part-time · On-site" was built and
  // saved on site, a US one paid in USD. The business chose the employment word, not the place. So the default's own form,
  // an employment word and "· On-site" (DEFAULT_PLACE_TAIL), is still the default's place, typed or not, and an old draft
  // with no record reads it the same way. A place typed in it decides: "On-site", "On-site only", "Office-based", "Not
  // remote", "Full-time · On-site (Makati)", and "In person" or "In-store", which name no remote word (TYPE_IN_PERSON).)
  // (The nineteenth: any employment wording before the tail, DEFAULT_PLACE_TAIL. "Full-time · Onsite", "Full-time, On-site"
  // and "Full-time - On-site" are typed, not the default's, and still decide.)
  const defaultTail = DEFAULT_PLACE_TAIL.test(wm) && placeSaysRemote(wm.replace(DEFAULT_PLACE_TAIL, "")) === null && !TYPE_IN_PERSON.test(wm);
  const onSiteTypeChosen = typeChosen && !defaultTail && (typePlace === "not_remote" || (typePlace === null && TYPE_IN_PERSON.test(wm)));
  // The Type field ("Full-time · Remote", "Work from home", "WFH") first, then
  // the place: the Type field starts on "Full-time · On-site", and a place
  // written "Remote", "Home-based, Philippines" or "Makati (WFH)" is a remote
  // job whatever it still says (the second and third Phase 7 product audits:
  // those were built on-site, with no connection check). One rule for both,
  // placeSaysRemote (src/lib/jobLocation.ts).
  // (The nineteenth: the Type takes the place field's own hybrid rule, placeSaysHybrid, now that it is read whole: "Full-time ·
  // Remote (occasional onsite)", "Full-time · WFH or Onsite" and "Full-time · On-site / Remote" were the business's on-site
  // choice, decided over the title, where the place field reads them hybrid. On-site training is still the training.)
  if (/\bhybrid\b/.test(wm) || placeSaysHybrid(typeBesidesTraining)) workMode = "hybrid";
  else if (typePlace === "remote") workMode = "remote";
  else if (placeSaysRemote(fields.location) === "remote") workMode = "remote";
  // (A place partly at home is hybrid: "Remote with occasional onsite", "WFH or Onsite (Makati)", never "no hybrid"; the twelfth Phase 4 review.)
  else if (placeSaysHybrid(fields.location)) workMode = "hybrid";
  // (So are words that say so in so many words, in the title or What they do, by Publish's own rule (isFullyRemoteText, as
  // jobFromFlow.ts reads the post): "Permanent work from home", "This is a WFH role", "Work From Home Chat Support Agent", with
  // the Type left on On-site. The fourteenth Phase 4 review: the chat note read What they do and Publish read the AI's rewording
  // of it, so a note said typing was measured on a job saved on site, and the other way round. Now both read this field, and
  // the job gets its connection check. Never a perk, which says how often, not where: "Benefits:\n- Work from home Fridays".)
  // (The fifteenth review: What they do only by a line or sentence that is nothing but the setup, ONLY_REMOTE_LINE. Any other
  // "WFH" in it turned on-site jobs remote, and Publish saved them is_remote with no currency: "Work setup: Onsite. Possible WFH
  // after regularization", "WFH is not available for this role", "WFH: No", "Must have WFH experience", "Help customers who work
  // from home set up their internet". And never a title that says on site too: "CSR (Onsite / WFH)".)
  // (The sixteenth: a title that is home or on site either way, placeSaysHybrid, which was that case's evidence; the
  // fifteenth's test refused any on-site word, so "WFH CSR | Onsite training in Cebu", "WFH Customer Service Representative
  // (Onsite Training)" and "Customer Service Representative - WFH after 2 weeks onsite training" were built on site.)
  // (The seventeenth: that let every other title that says on site and mentions WFH be built remote, saved is_remote with no
  // currency: "CSR - Onsite (WFH after regularization)", "Onsite CSR | WFH after 3 months", "CSR (Onsite) - WFH not
  // available", "CSR | Onsite & WFH". So the fifteenth's test is back, refusing any on-site word in the title, with only the
  // sixteenth's evidence taken out first: on-site training, onboarding or orientation, ON_SITE_TRAINING.)
  // (And the seventeenth, for the whole class: an on-site Type the business chose decides over the title and What they do.
  // "Full-time · On-site only", "Office-based", "Not remote" left such a title remote, so the Type field could not undo
  // it. The title and the words decide only while the Type is the builder's default, DEFAULT_JOB_TYPE, untouched: the
  // field is free text and starts on "Full-time · On-site", so the builder marks a Type the business typed (typeChosen).
  // A chosen Type that names no place ("Full-time", "Part-time") still leaves it to them. The place is not the title or
  // the words: a remote or hybrid place still decides, above, as it did.)
  // (The eighteenth: the title with its on-site training taken out is what both tests read; isFullyRemoteText read the
  // whole title, so "WFH CSR - In-office training" was built on site by its "in-office".)
  else if (
    !onSiteTypeChosen &&
    ((placeSaysRemote(titleBesidesTraining) !== "not_remote" && isFullyRemoteText(fields.location, null, titleBesidesTraining)) ||
      (placeSaysRemote(fields.location) !== "not_remote" && remoteSetupLine(fields.work)))
  )
    workMode = "remote";

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
