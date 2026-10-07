/**
 * interviewGuide.ts: the one page the owner reads before and during a live
 * interview with an applicant (docs/INTERVIEWS.md, "The interview guide").
 *
 * The owner, 2026-10-07: "make a system inside that could generate important
 * questionnaires for the interview ... maybe I just start with why should we
 * hire you ... I'm more concerned about the thing is constant change, this
 * whole app, AI, there's a lot of bugs ... team leadership."
 *
 * A guide has two parts:
 *
 *  1. THE PLAN, the same for every applicant to a kind of job, so answers can
 *     be compared: how the half hour runs, the opening question, the
 *     questions everyone gets, how to close, and what to mark straight after.
 *     It is written here, by hand, from what the owner said matters. It costs
 *     nothing, needs no AI, and is on screen the moment the guide opens.
 *
 *  2. THE PERSONAL PART, written for one applicant from their own record by
 *     the interview-guide edge function: who they are on paper, three or four
 *     questions only this person should be asked (the promise they made in
 *     the practice chat, a claim worth one concrete example), and facts to
 *     confirm. It is stored in public.interview_guides, which only the job's
 *     hiring team can read: an applicant must never see what they will be
 *     asked or what the interviewer is listening for.
 *
 * This file is the plan, the personal part's shape, and the reader that both
 * the page and the function use on a stored or freshly written personal part.
 * Import-free. supabase/functions/_shared/interviewGuide.ts is the same file
 * byte for byte (scripts/interview_guide.test.mjs fails if they differ).
 */

/** Bump when the personal part's shape or the plan changes in a way an old stored guide cannot satisfy. */
export const INTERVIEW_GUIDE_VERSION = 1;

/** How long the plan is written for. */
export const INTERVIEW_GUIDE_MINUTES = 30;

export interface GuideQuestion {
  /** Stable within a plan: the page keys on it, and the function tells the model what is already asked. */
  id: string;
  /** Read aloud as written. */
  question: string;
  /** What a good answer sounds like. */
  listenFor: string;
  /** What should worry the interviewer. */
  redFlag: string;
}

export interface GuideStage {
  title: string;
  minutes: number;
  /** One line on what this stretch is for. */
  note: string;
}

export interface InterviewPlan {
  family: "team_lead" | "general";
  /** The half hour, in order. The minutes add up to INTERVIEW_GUIDE_MINUTES. */
  stages: GuideStage[];
  /** What to say in the first two minutes. */
  welcome: string;
  opener: GuideQuestion;
  /** Asked of everyone, in this order. */
  core: GuideQuestion[];
  /** Asked in the last minutes. */
  close: GuideQuestion[];
  /** Marked 1 to 5 straight after the call. */
  marks: string[];
  /** The one question to answer for yourself before you hang up. */
  verdict: string;
}

const STAGES: GuideStage[] = [
  { title: "Welcome", minutes: 2, note: "Put them at ease and say how the half hour will go." },
  { title: "Opening question", minutes: 3, note: "Let them talk. Do not interrupt the first answer." },
  { title: "Questions everyone gets", minutes: 15, note: "About three minutes each. Ask for an example every time." },
  { title: "Questions for this person", minutes: 6, note: "From their own results. Ask plainly, without accusing." },
  { title: "Their questions and next steps", minutes: 4, note: "What they ask tells you what they care about." },
];

const WELCOME =
  "Thank them for the time they put into the tests. Say the call is half an hour: you will ask about their experience, there are no trick questions, and they can ask you anything at the end.";

const OPENER: GuideQuestion = {
  id: "why_hire",
  question: "Why should we hire you for this role?",
  listenFor:
    "An answer about THIS job, with one real example from their own work. They name what they would do here, not only what they are like.",
  redFlag: "A list of good qualities with no example, or an answer that would fit any job at any company.",
};

/**
 * A working team leader for a player-chat team: leads six agents and answers
 * players for most of the shift. Built on the owner's own concerns: constant
 * change and tools that break, leading people, and money promises.
 */
const TEAM_LEAD_PLAN: InterviewPlan = {
  family: "team_lead",
  stages: STAGES,
  welcome: WELCOME,
  opener: OPENER,
  core: [
    {
      id: "team_led",
      question:
        "Tell me about the team you led most recently. How many people, what did a normal day look like, and what is one thing you changed that made the team better?",
      listenFor:
        "Numbers, one concrete change and what it led to, and what THEY did rather than \"we\". Day-to-day leading: checking work, coaching, covering gaps.",
      redFlag:
        "No specifics when you ask twice, or only classroom training with nothing about leading people through a normal shift.",
    },
    {
      id: "working_lead",
      question:
        "In this job you answer players yourself for most of the shift, and you lead six people at the same time. Walk me through how you would handle one busy hour.",
      listenFor:
        "They take chats themselves. A practical way to watch the queue and help an agent without dropping their own chats. Clear priorities when everything is urgent.",
      redFlag: "\"I would mostly monitor and manage.\" Nothing about answering players themselves.",
    },
    {
      id: "sudden_change",
      question:
        "Our tools and rules change often, sometimes in the middle of a shift, and parts of the app, including the AI tools, have bugs. Tell me about a time something changed or broke suddenly at work. What did you do in the first ten minutes?",
      listenFor:
        "Calm. They tell the team what to do right now, give players an honest holding answer, report the problem clearly (what happened, when, how to see it again) and follow up.",
      redFlag: "Waits to be told what to do, blames the tools, gets irritated by change, or has no real example.",
    },
    {
      id: "wrong_promise",
      question:
        "A player says one of your agents promised a cash-out would arrive today, and it has not. The agent should not have promised it. What do you say to the player, and what do you say to the agent afterwards?",
      listenFor:
        "Owns the mistake to the player without making a new promise, and says what the real next step is. Coaches the agent in private, about the exact message, and checks it does not happen again.",
      redFlag:
        "Calms the player with a new date or a guarantee. Blames the agent in front of the player. Skips the conversation with the agent.",
    },
    {
      id: "weak_agent",
      question:
        "One of your six agents has been slow and making mistakes for two weeks. What do you do, step by step?",
      listenFor:
        "Reads the agent's actual chats first. A private, specific conversation. A clear target and a date to check again. Knows the point at which they bring it to you.",
      redFlag: "Goes straight to replacing the person, or avoids the conversation. No follow-up.",
    },
  ],
  close: [
    {
      id: "set_up",
      question:
        "Walk me through your set-up for this shift: where you work, what you do if the power or the internet goes out, and what happens if you cannot make a shift.",
      listenFor: "A real backup (a second connection, a power bank or generator, a place to go) and telling you early, before the shift.",
      redFlag: "No backup at all, or \"it never happens\".",
    },
    {
      id: "their_questions",
      question: "What questions do you have for me?",
      listenFor: "Questions about the team, the players, how you measure a good shift, what the first week looks like.",
      redFlag: "No questions at all. Only questions about pay and time off.",
    },
  ],
  marks: [
    "Easy to understand when they speak",
    "A real leadership example, with specifics",
    "Will answer players themselves, not only manage",
    "Calm and practical when things change or break",
    "Honest about money: no promises they cannot keep",
  ],
  verdict: "Would I trust this person alone on a shift with six agents?",
};

/** Any other job: the same shape, with questions that fit most roles. */
const GENERAL_PLAN: InterviewPlan = {
  family: "general",
  stages: STAGES,
  welcome: WELCOME,
  opener: OPENER,
  core: [
    {
      id: "recent_work",
      question: "Tell me about the job you did most recently that is closest to this one. What did a normal day look like?",
      listenFor: "A clear picture of the actual work, in their own words, with details only someone who did it would know.",
      redFlag: "Vague titles and duties with no day-to-day detail, even when you ask twice.",
    },
    {
      id: "hard_moment",
      question: "Tell me about the hardest situation you handled in that job. What happened, and what did you do?",
      listenFor: "One real situation, what THEY did, and how it ended. Some thought about what they would do differently.",
      redFlag: "A story where everything was someone else's fault, or no story at all.",
    },
    {
      id: "sudden_change",
      question: "Tell me about a time the rules, the tools or the plan changed suddenly at work. What did you do first?",
      listenFor: "Calm and practical: they found out what changed, adjusted, and told the people who needed to know.",
      redFlag: "Irritation at change, waiting to be told, or no real example.",
    },
    {
      id: "mistake",
      question: "Tell me about a mistake you made at work. How did you find out, and what did you do about it?",
      listenFor: "A real mistake, owned plainly, fixed, and something learned from it.",
      redFlag: "\"I can't think of one\", or a mistake that is really a boast.",
    },
    {
      id: "this_job",
      question: "From what you know so far, what do you think will be the hardest part of this job for you?",
      listenFor: "They have thought about the actual job. An honest weak spot and how they would handle it.",
      redFlag: "\"Nothing\", or an answer that shows they have not read what the job is.",
    },
  ],
  close: [
    {
      id: "set_up",
      question: "Walk me through the practical side: when you can start, the hours you can work, and what happens if you cannot make a shift.",
      listenFor: "Clear, consistent with what they wrote on the form, and telling you early when something comes up.",
      redFlag: "Answers that differ from the form, or no plan at all.",
    },
    {
      id: "their_questions",
      question: "What questions do you have for me?",
      listenFor: "Questions about the work, the team and how you measure doing well.",
      redFlag: "No questions at all. Only questions about pay and time off.",
    },
  ],
  marks: [
    "Easy to understand when they speak",
    "Real examples from their own work",
    "Calm and practical when things change",
    "Owns mistakes and learns from them",
    "Understands what this job actually is",
  ],
  verdict: "Would I trust this person to do this job without me watching?",
};

/** The plan for a job family ("team_lead" from the scorer's own inferJobFamily; anything else is general). */
export function interviewPlanFor(family: string | null | undefined): InterviewPlan {
  return family === "team_lead" ? TEAM_LEAD_PLAN : GENERAL_PLAN;
}

/** Every question the plan already asks, so the personal part does not repeat one. */
export function planQuestions(plan: InterviewPlan): string[] {
  return [plan.opener, ...plan.core, ...plan.close].map((q) => q.question);
}

// ============================================================================
// The personal part
// ============================================================================

/** Where in the applicant's record a personal question comes from. */
export const GUIDE_SOURCES = ["application", "skills_check", "chat_practice", "written_interview", "integrity", "connection"] as const;
export type GuideSource = (typeof GUIDE_SOURCES)[number];

/** How a source is named to the owner. */
export const GUIDE_SOURCE_LABELS: Record<GuideSource, string> = {
  application: "Their application",
  skills_check: "Skills check",
  chat_practice: "Chat practice",
  written_interview: "Written interview",
  integrity: "How they took the tests",
  connection: "Computer and connection",
};

export interface PersonalQuestion {
  question: string;
  /** For the owner only: what in the record prompts it. */
  why: string;
  listenFor: string;
  redFlag: string;
  source: GuideSource;
  /** The applicant's own words the question is about, when there are some. */
  quote: string | null;
}

export interface PersonalGuide {
  version: number;
  /** Who this is on paper, in a few short lines. */
  atAGlance: string[];
  questions: PersonalQuestion[];
  /** Facts to confirm in passing. */
  confirm: string[];
}

export const GUIDE_LIMITS = {
  atAGlance: 4,
  questions: 4,
  minQuestions: 2,
  confirm: 4,
  line: 220,
  question: 320,
  quote: 240,
} as const;

function plainText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  // One plain line: no line breaks, no control characters, no markup brackets.
  let flat = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    const unsafe = code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029 || ch === "<" || ch === ">";
    flat += unsafe ? " " : ch;
  }
  flat = flat.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

function plainList(value: unknown, limit: number, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const line = plainText(item, max);
    if (line && !out.includes(line)) out.push(line);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * A personal part as stored or as the model wrote it, made safe to show:
 * known keys only, plain single lines of bounded length, a known source, at
 * most GUIDE_LIMITS.questions questions. `quoteAllowed` decides whether a
 * quote is really the applicant's own words (the function checks it against
 * the record; the page passes nothing and keeps what was stored). Returns null
 * when there are not enough usable questions to be a guide at all.
 */
export function readPersonalGuide(raw: unknown, quoteAllowed?: (quote: string) => boolean): PersonalGuide | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const questions: PersonalQuestion[] = [];
  for (const item of Array.isArray(r.questions) ? r.questions : []) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const q = item as Record<string, unknown>;
    const question = plainText(q.question, GUIDE_LIMITS.question);
    const why = plainText(q.why, GUIDE_LIMITS.line);
    const listenFor = plainText(q.listenFor, GUIDE_LIMITS.line);
    const redFlag = plainText(q.redFlag, GUIDE_LIMITS.line);
    const source = (GUIDE_SOURCES as readonly string[]).includes(String(q.source)) ? (q.source as GuideSource) : null;
    if (!question || !why || !listenFor || !redFlag || !source) continue;
    if (questions.some((existing) => existing.question === question)) continue;
    const quote = plainText(q.quote, GUIDE_LIMITS.quote);
    questions.push({
      question,
      why,
      listenFor,
      redFlag,
      source,
      quote: quote && (quoteAllowed ? quoteAllowed(quote) : true) ? quote : null,
    });
    if (questions.length >= GUIDE_LIMITS.questions) break;
  }
  if (questions.length < GUIDE_LIMITS.minQuestions) return null;
  return {
    version: INTERVIEW_GUIDE_VERSION,
    atAGlance: plainList(r.atAGlance, GUIDE_LIMITS.atAGlance, GUIDE_LIMITS.line),
    questions,
    confirm: plainList(r.confirm, GUIDE_LIMITS.confirm, GUIDE_LIMITS.line),
  };
}

/** The whole guide as plain text, for Copy: the plan and, when there is one, the personal part. */
export function guideAsText(plan: InterviewPlan, personal: PersonalGuide | null, applicantName: string): string {
  const lines: string[] = [];
  const block = (q: GuideQuestion | PersonalQuestion, n: number) => {
    lines.push(`${n}. ${q.question}`);
    if ("quote" in q && q.quote) lines.push(`   Their words: "${q.quote}"`);
    if ("why" in q) lines.push(`   Why ask: ${q.why}`);
    lines.push(`   Listen for: ${q.listenFor}`, `   Red flag: ${q.redFlag}`, "");
  };
  lines.push(`Interview guide: ${applicantName} (${INTERVIEW_GUIDE_MINUTES} minutes)`, "");
  if (personal && personal.atAGlance.length > 0) {
    lines.push("BEFORE THE CALL", ...personal.atAGlance.map((l) => `- ${l}`), "");
  }
  lines.push("WELCOME", plan.welcome, "", "OPEN WITH");
  let n = 1;
  block(plan.opener, n++);
  lines.push("ASK EVERYONE");
  for (const q of plan.core) block(q, n++);
  if (personal) {
    lines.push(`ASK ${applicantName.toUpperCase()}`);
    for (const q of personal.questions) block(q, n++);
  }
  lines.push("BEFORE YOU FINISH");
  for (const q of plan.close) block(q, n++);
  if (personal && personal.confirm.length > 0) {
    lines.push("CONFIRM IN PASSING", ...personal.confirm.map((l) => `- ${l}`), "");
  }
  lines.push("RIGHT AFTER THE CALL, MARK EACH 1 TO 5", ...plan.marks.map((m) => `[ ] ${m}`), "", plan.verdict);
  return lines.join("\n");
}
