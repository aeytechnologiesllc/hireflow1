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
 * The owner again, 2026-10-09, after his first calls: "this looks a little bit
 * too ... straightforward. Why should we hire you ... I want it to sound more
 * like a human instead of sounding like I'm reading from a paper ... simple
 * English ... we don't want to ask things we have already asked ... unless it
 * raises a question ... give me a button that I could rate all of these
 * answers from 1 to 10 here in the interview guide ... and I could probably
 * write extra notes here as well." So:
 *
 *  - every question is written to be SAID: short sentences, one thing at a
 *    time, "Can you tell me about..." rather than "Tell me about...";
 *  - the plan no longer repeats what the applicant has already answered in
 *    writing. By the call a team lead has been asked about the team they led
 *    and about a sudden change TWICE (the form, then the written interview),
 *    and about splitting a shift between players and leading. Those are
 *    listed in `alreadyAsked`, shown to the owner, and returned to only where
 *    an answer left a question (that is what the personal part is for);
 *  - each answer can be rated 1 to 10 with a note, kept in
 *    public.interview_ratings (the shapes and readers are at the end of this
 *    file; supabase/migrations/*_interview_ratings.sql).
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

/** Something rated once for the whole call, not for one answer. */
export interface GuideMark {
  id: string;
  label: string;
}

export interface InterviewPlan {
  family: "team_lead" | "general";
  /** The half hour, in order. The minutes add up to INTERVIEW_GUIDE_MINUTES. */
  stages: GuideStage[];
  /** Words to say in the first two minutes, as they would be spoken. */
  welcome: string;
  opener: GuideQuestion;
  /** Asked of everyone, in this order. */
  core: GuideQuestion[];
  /** Asked in the last minutes. */
  close: GuideQuestion[];
  /**
   * What this applicant has already answered in writing before the call (on
   * the form and in the written interview), in the owner's words. Not asked
   * again unless an answer left a question. Empty when the plan cannot know.
   */
  alreadyAsked: string[];
  /** Rated 1 to 10 straight after the call, for the call as a whole. */
  marks: GuideMark[];
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

// Said, not read out, and short enough to keep in his head after one look
// (2026-10-09, on the longer first version: "keep the welcoming message very
// small ... so I'm not reading off of here"). It says how long, and that he
// will take notes, which is why he is looking at the screen.
const WELCOME = "Thanks for joining. This will take about half an hour, and I will take a few notes as we talk.";

const OPENER: GuideQuestion = {
  id: "good_candidate",
  question: "To start, what makes you a good candidate for this role?",
  listenFor:
    "An answer about THIS job, with one real example from their own work. They say what they would do here, not only what they are like.",
  redFlag: "A list of good qualities with no example, or an answer that would fit any job at any company.",
};

/** Rated once for the whole call: the one thing no single answer shows. */
const SPEAKING: GuideMark = { id: "speaking", label: "How they speak: clear and easy to understand" };

/**
 * A working team leader for a player-chat team: leads six agents and answers
 * players for most of the shift. Built on the owner's own concerns (constant
 * change and tools that break, leading people, money promises), from angles
 * the form and the written interview have NOT already asked: by the call they
 * have written about the team they led and about a sudden change twice.
 */
const TEAM_LEAD_PLAN: InterviewPlan = {
  family: "team_lead",
  stages: STAGES,
  welcome: WELCOME,
  opener: OPENER,
  core: [
    {
      id: "job_picture",
      question:
        "Let me tell you what this job is really like. You answer players yourself for most of the shift. You also lead six agents. Our tools and rules change often, and some of the tools still have bugs. How does that sound to you?",
      listenFor:
        "Happy to answer players themselves. Calm about change, maybe with a short example of their own. A follow-up to use: \"Which part would be hardest for you?\"",
      redFlag: "Expected to only manage. Annoyed or worried by change. Says nothing would be hard.",
    },
    {
      id: "hard_day",
      question: "Can you tell me about a really hard day at work? What happened, and how did you get through it?",
      listenFor: "One real day. What THEY did, step by step, and how it ended. They stay calm while they tell it.",
      redFlag: "Everything was someone else's fault, or no real story even when you ask twice.",
    },
    {
      id: "disagreement",
      question: "Can you tell me about a time someone on your team did not agree with you? What did you do?",
      listenFor: "They listened first, explained their reason, stayed respectful, and the work still got done.",
      redFlag: "\"That never happens.\" Pulling rank, or still angry about it.",
    },
    {
      id: "weak_agent",
      question: "Let's say one of your agents has been slow and making mistakes for two weeks. What would you do?",
      listenFor:
        "Reads the agent's actual chats first. A private, specific talk. A clear goal and a date to check again. Knows when to bring it to you.",
      redFlag: "Goes straight to replacing the person, or avoids the talk. No follow-up.",
    },
    {
      id: "on_your_own",
      question: "Let's say something goes wrong during your shift, and you cannot reach me. What do you do?",
      listenFor:
        "Keeps players answered and the team calm. Makes the safe choice: no new promise about money. Writes down what happened and tells you as soon as they can.",
      redFlag: "Waits and does nothing, or makes a big decision alone, like promising a payout.",
    },
  ],
  close: [
    {
      id: "set_up",
      question: "Can you tell me about where you work from? What happens if the power or the internet goes out?",
      listenFor:
        "A real backup: a second connection, a power bank or generator, a place to go. A follow-up to use: \"And if you cannot make a shift?\" They should tell you early, before the shift.",
      redFlag: "No backup at all, or \"it never happens\".",
    },
    {
      id: "their_questions",
      question: "What questions do you have for me?",
      listenFor: "Questions about the team, the players, how you measure a good shift, what the first week looks like.",
      redFlag: "No questions at all. Only questions about pay and time off.",
    },
  ],
  alreadyAsked: [
    "The team they led, and one problem they fixed",
    "A sudden change at work, and how they helped others adjust",
    "How they split a shift between answering players and leading",
    "Why they want this job, their hours, and when they can start",
  ],
  marks: [SPEAKING],
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
      question: "Can you tell me about the job you did most recently that is closest to this one? What did a normal day look like?",
      listenFor: "A clear picture of the actual work, in their own words, with details only someone who did it would know.",
      redFlag: "Vague titles and duties with no day-to-day detail, even when you ask twice.",
    },
    {
      id: "hard_day",
      question: "Can you tell me about a really hard day in that job? What happened, and how did you get through it?",
      listenFor: "One real day, what THEY did, and how it ended. Some thought about what they would do differently.",
      redFlag: "A story where everything was someone else's fault, or no story at all.",
    },
    {
      id: "sudden_change",
      question: "Can you tell me about a time the rules, the tools or the plan changed suddenly at work? What did you do first?",
      listenFor: "Calm and practical: they found out what changed, adjusted, and told the people who needed to know.",
      redFlag: "Irritation at change, waiting to be told, or no real example.",
    },
    {
      id: "mistake",
      question: "Can you tell me about a mistake you made at work? How did you find out, and what did you do about it?",
      listenFor: "A real mistake, owned plainly, fixed, and something learned from it.",
      redFlag: "\"I can't think of one\", or a mistake that is really a boast.",
    },
    {
      id: "this_job",
      question: "From what you know so far, which part of this job will be hardest for you?",
      listenFor: "They have thought about the actual job. An honest weak spot and how they would handle it.",
      redFlag: "\"Nothing\", or an answer that shows they have not read what the job is.",
    },
  ],
  close: [
    {
      id: "set_up",
      question: "Can you tell me about the practical side? When can you start, and which hours can you work?",
      listenFor:
        "Clear, and the same as what they wrote on the form. A follow-up to use: \"And if you cannot make a shift?\" They should tell you early.",
      redFlag: "Answers that differ from the form, or no plan at all.",
    },
    {
      id: "their_questions",
      question: "What questions do you have for me?",
      listenFor: "Questions about the work, the team and how you measure doing well.",
      redFlag: "No questions at all. Only questions about pay and time off.",
    },
  ],
  // The plan cannot know what another job's form and tests asked.
  alreadyAsked: [],
  marks: [SPEAKING],
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

// ============================================================================
// Ratings: what the interviewer thought of each answer
// ============================================================================

/** An answer is rated 1 to this. */
export const GUIDE_RATING_MAX = 10;

/** The same limits the database function enforces (save_interview_ratings). */
export const RATING_LIMITS = { answers: 40, note: 2000, question: 400, overallNote: 4000, key: 80 } as const;

export interface GuideRating {
  /** 1 to GUIDE_RATING_MAX, or null when there is only a note. */
  score: number | null;
  note: string;
  /** The question as it was asked, kept with the rating so it still reads after the questions change. */
  question: string;
}

export interface GuideRatings {
  /** By guideQuestionKey or guideMarkKey. */
  answers: Record<string, GuideRating>;
  overallNote: string;
}

export const NO_RATINGS: GuideRatings = { answers: {}, overallNote: "" };

/** What a key may look like: the database refuses anything else. */
export const RATING_KEY = /^[a-z0-9_:.-]{1,80}$/;

/**
 * What a rating is kept under: a plan question's own id, or, for a question
 * written for one applicant (it has no id, and "Write again" replaces it), a
 * short fingerprint of its words (FNV-1a).
 */
export function guideQuestionKey(q: GuideQuestion | PersonalQuestion): string {
  if ("id" in q) return q.id;
  let hash = 0x811c9dc5;
  for (let i = 0; i < q.question.length; i += 1) {
    hash ^= q.question.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `personal:${hash.toString(16).padStart(8, "0")}`;
}

export function guideMarkKey(mark: GuideMark): string {
  return `mark:${mark.id}`;
}

function ratingText(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/**
 * Ratings as stored, made safe to show and to send back: known keys only, a
 * whole-number score in range or none, bounded text. An entry with neither a
 * score nor a note is dropped.
 */
export function readGuideRatings(rawAnswers: unknown, rawOverallNote?: unknown): GuideRatings {
  const answers: Record<string, GuideRating> = {};
  if (rawAnswers && typeof rawAnswers === "object" && !Array.isArray(rawAnswers)) {
    for (const [key, value] of Object.entries(rawAnswers as Record<string, unknown>)) {
      if (!RATING_KEY.test(key) || !value || typeof value !== "object" || Array.isArray(value)) continue;
      const v = value as Record<string, unknown>;
      const n = typeof v.score === "number" && Number.isInteger(v.score) && v.score >= 1 && v.score <= GUIDE_RATING_MAX ? v.score : null;
      const note = ratingText(v.note, RATING_LIMITS.note);
      if (n === null && !note.trim()) continue;
      answers[key] = { score: n, note, question: ratingText(v.question, RATING_LIMITS.question) };
      if (Object.keys(answers).length >= RATING_LIMITS.answers) break;
    }
  }
  return { answers, overallNote: ratingText(rawOverallNote, RATING_LIMITS.overallNote) };
}

/** How many of these have a score, and their average to one decimal (null when none has). */
export function ratingsSummary(ratings: GuideRatings, keys: string[]): { rated: number; of: number; average: number | null } {
  const scores = keys.map((k) => ratings.answers[k]?.score).filter((v): v is number => typeof v === "number");
  const average = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
  return { rated: scores.length, of: keys.length, average };
}

/** The keys of every question the guide shows, in the order it is asked. */
export function guideAnswerKeys(plan: InterviewPlan, personal: PersonalGuide | null): string[] {
  return [plan.opener, ...plan.core, ...(personal?.questions ?? []), ...plan.close].map(guideQuestionKey);
}

/**
 * Ratings kept under a key the guide no longer shows: a personal question
 * that "Write again" replaced, or a question a later plan dropped. They are
 * the owner's own notes, so they are still shown, with the question as asked.
 */
export function earlierRatings(ratings: GuideRatings, plan: InterviewPlan, personal: PersonalGuide | null): GuideRating[] {
  const shown = new Set([...guideAnswerKeys(plan, personal), ...plan.marks.map(guideMarkKey)]);
  return Object.entries(ratings.answers)
    .filter(([key, r]) => !shown.has(key) && r.question.trim().length > 0)
    .map(([, r]) => r);
}

/** The whole guide as plain text, for Copy: the plan, the personal part when there is one, and the interviewer's own ratings and notes. */
export function guideAsText(plan: InterviewPlan, personal: PersonalGuide | null, applicantName: string, ratings: GuideRatings = NO_RATINGS): string {
  const lines: string[] = [];
  const mine = (key: string) => {
    const r = ratings.answers[key];
    if (!r) return;
    if (r.score !== null) lines.push(`   Your rating: ${r.score}/${GUIDE_RATING_MAX}`);
    if (r.note.trim()) lines.push(`   Your notes: ${r.note.trim().replace(/\s*\n\s*/g, " / ")}`);
  };
  const block = (q: GuideQuestion | PersonalQuestion, n: number) => {
    lines.push(`${n}. ${q.question}`);
    if ("quote" in q && q.quote) lines.push(`   Their words: "${q.quote}"`);
    if ("why" in q) lines.push(`   Why ask: ${q.why}`);
    lines.push(`   Listen for: ${q.listenFor}`, `   Red flag: ${q.redFlag}`);
    mine(guideQuestionKey(q));
    lines.push("");
  };
  lines.push(`Interview guide: ${applicantName} (${INTERVIEW_GUIDE_MINUTES} minutes)`, "");
  if (personal && personal.atAGlance.length > 0) {
    lines.push("BEFORE THE CALL", ...personal.atAGlance.map((l) => `- ${l}`), "");
  }
  if (plan.alreadyAsked.length > 0) {
    lines.push("ALREADY ANSWERED IN WRITING, ON THE FORM AND IN THE WRITTEN INTERVIEW (not asked again unless an answer left a question)", ...plan.alreadyAsked.map((l) => `- ${l}`), "");
  }
  lines.push("WELCOME (say something like)", plan.welcome, "", "OPEN WITH");
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
  lines.push(`RIGHT AFTER THE CALL, RATE 1 TO ${GUIDE_RATING_MAX}`);
  for (const mark of plan.marks) {
    lines.push(`- ${mark.label}`);
    mine(guideMarkKey(mark));
  }
  const summary = ratingsSummary(ratings, guideAnswerKeys(plan, personal));
  if (summary.average !== null) lines.push("", `Your average: ${summary.average.toFixed(1)}/${GUIDE_RATING_MAX} (${summary.rated} of ${summary.of} answers rated)`);
  lines.push("", plan.verdict);
  if (ratings.overallNote.trim()) lines.push(`Your overall notes: ${ratings.overallNote.trim()}`);
  return lines.join("\n");
}
