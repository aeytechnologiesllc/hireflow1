/**
 * Adaptive playbook — rule-based follow-ups, rigor recommendation, and reasoning
 * lines keyed off the brief (mirrors AvaFlowPreview prototype).
 */
import type { BriefAnswer, JobBrief, Rigor } from "./types";

export type Family = "cash" | "cleaner" | "admin" | "developer" | "general";

export interface FollowUpDef {
  id: string;
  question: string;
  chips: string[];
  def: number;
}

export interface Playbook {
  label: string;
  followUps: (answers: Record<string, number>) => FollowUpDef[];
  reasoning: string[];
  rigor: { recommended: Rigor; rationale: string };
}

export function detectFamily(brief: Pick<JobBrief, "roleTitle" | "whatTheyDo" | "employmentType">): Family {
  const s = `${brief.roleTitle} ${brief.employmentType} ${brief.whatTheyDo}`.toLowerCase();
  if (/clean|janitor|housekeep|custodi|maid|porter/.test(s)) return "cleaner";
  if (/develop|engineer|programmer|coder|software|frontend|front-end|back-?end|full-?stack|web dev|data scientist/.test(s))
    return "developer";
  if (/admin|secretar|reception|assistant|office|clerk|book-?keep|schedul|coordinat|data entry/.test(s)) return "admin";
  if (/manager|cashier|finance|account|teller|retail|server|barista|caf[eé]|waiter|waitress|host|sales|store|bank|restaurant|bartender/.test(s))
    return "cash";
  return "general";
}

export const PLAYBOOKS: Record<Family, Playbook> = {
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
        "They'll handle the till and deposits, lead a team, and own open/close — a mishire here is expensive. A practical simulation plus a structured voice interview protects you.",
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
        "This is a trust-and-reliability hire more than a technical one. A light screen plus a short voice interview confirms dependability — without scaring off good, busy applicants.",
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
    followUps: (a) => {
      const remote = a["dev-setup"] ?? 2;
      return [
        { id: "dev-stack", question: "What's the core stack?", chips: ["Frontend", "Backend", "Full-stack", "Mobile"], def: 2 },
        { id: "dev-setup", question: "What's the work setup?", chips: ["On-site", "Hybrid", "Fully remote"], def: 2 },
        {
          id: "dev-test",
          question: remote === 2 ? "Remote role — open to a short practical code test?" : "Open to a short practical code test?",
          chips: ["Yes — take-home", "Yes — live pairing", "Portfolio only"],
          def: 0,
        },
      ];
    },
    reasoning: [
      "Reading the role and the stack",
      "Weighing skills, ways of working & remote setup",
      "Choosing a fair, practical screen",
      "Setting up a real code test, not trivia",
      "Building the scorecard",
      "Preparing your shortlist criteria",
    ],
    rigor: {
      recommended: "high",
      rationale:
        "Skill claims are easy to inflate. A short practical code test plus a structured voice interview gives you real signal before you spend live interview time.",
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
  };
}
