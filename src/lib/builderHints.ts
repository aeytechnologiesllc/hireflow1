/**
 * Quiet signs in Ava's job builder (src/pages/AvaCreateJob.tsx) that what the
 * business tells her is used. The owner watched a walkthrough on 2026-11-01:
 * "when you're filling out the job, you can't tell if you're just typing it to
 * be typing it, or it's actually going to take all this information when
 * creating a job ... not too crazy ... hints that everything you're saying
 * we're gonna take that when creating a job or skill test."
 *
 * Four places, all words, no new colour:
 *  - the brief card says Ava writes the post and the tests from it (BRIEF_USES_LINE);
 *  - each follow-up question names what its answer shapes (questionShapes);
 *  - "Ava is building from" collects the answers so far as short tags (knownSoFar);
 *  - the plan review says, on a step, which answers shaped it (fromYourAnswers).
 *
 * Only what the code really does with each answer (scripts/builder_hints.test.mjs
 * proves the deterministic ones on the built-in plan):
 *  - cs-industry picks the industry pack (customerService.ts, packIdForBrief): the
 *    skills check's five questions and the practice's six cases. generate-flow is
 *    told the business too.
 *  - cs-channel: a chat practice or an email practice (channelForBrief, the step's
 *    config.channel), and generate-flow is told it for the post.
 *  - remote-internet: the computer check's speed bars (assemble.ts, equipmentBarsForBrief).
 *  - cs-load, cs-hours, cs-sensitive, cs-tools, remote-equipment: read only by the
 *    writer, generate-flow ("Owner follow-up answers"), which writes the job post,
 *    the application and the interview. The built-in plan, used when the writer
 *    is down, reads none of them, so the review names them only on a plan the
 *    writer wrote.
 *  - The place's work mode: typing speed is measured in a remote job's practice
 *    (applyCustomerServicePack) and only a remote job gets the computer check.
 *  - The title, the place and the pay are the job's own fields on its page,
 *    whichever plan wrote the post.
 *
 * Pure: no React, no Supabase.
 */
import { payWords } from "@/lib/jobPost";
import { salaryForJob } from "@/lib/salaryParse";
import { placeNamesNothing, placeSaysHybrid, placeSaysRemote } from "@/lib/jobLocation";

/** Under the brief card's heading. */
export const BRIEF_USES_LINE = "Ava writes your job post and your tests from these answers.";

/** The strip's lead words. */
export const BUILDING_FROM_LABEL = "Ava is building from";

/** The review's lead words on a step. */
export const FROM_YOUR_ANSWERS = "From your answers:";

/** One answer the business gave: the follow-up's id and the chip's words. */
export interface GivenAnswer {
  questionId: string;
  answer: string;
}

/** What the builder knows so far. */
export interface BuilderAnswers {
  role: string;
  location: string;
  pay: string;
  /** The brief's work mode (briefFromForm), the one Publish saves. */
  workMode: "remote" | "hybrid" | "onsite";
  /** The place's country, when it has one (the pay's currency follows it, as on the post). */
  countryCode?: string | null;
  /** The follow-up answers given so far, in the order asked. */
  answers: ReadonlyArray<GivenAnswer>;
}

/** Each follow-up chip in a few words, for the strip and the review. A chip with no entry here shows as it is. */
export const ANSWER_TAGS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "cs-channel": { Chat: "By chat", Email: "By email", "Chat and email": "Chat and email" },
  "cs-industry": {
    "Medical office or clinic": "Medical office",
    "Dental office": "Dental office",
    "Online store": "Online store",
    "Software or app": "Software or app",
    "Home services": "Home services",
    Gaming: "Gaming",
    "Something else": "Any kind of business",
  },
  "cs-load": { "One at a time": "One at a time", "Two or three": "Two or three at once", "Four or more": "Four or more at once" },
  "cs-hours": { Daytime: "Daytime", "Evenings or nights": "Evenings or nights", "Weekends too": "Weekends too", "Rotating shifts": "Rotating shifts" },
  "cs-sensitive": { "Nothing sensitive": "No private details", "Payment details": "Payment details", "Health details": "Health details", "ID documents": "ID documents" },
  "cs-tools": { "Email and a chat box": "Email and a chat box", "A help desk tool": "Help desk tool", "We'll train them": "You'll train them" },
  "remote-internet": { "Basic broadband is fine": "Basic internet", "Reliable, video-call ready": "Reliable internet", "Fast wired connection required": "Fast wired internet" },
  "remote-equipment": { "We provide the computer": "Computer provided", "They use their own computer": "Their own computer", "Own computer + specific specs": "Own computer, set specs" },
};

/** The question ids the builder asks a chat or email agent's business, each with a line and tags (the test holds every chip). */
export const HINTED_QUESTIONS = Object.keys(ANSWER_TAGS);

function short(text: string, max = 40): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** An answer in a few words ("Two or three" is "Two or three at once"); null for a question not hinted here or no answer. */
export function answerTag(questionId: string, answer: string | null | undefined): string | null {
  const words = ANSWER_TAGS[questionId];
  const a = (answer ?? "").trim();
  if (!words || !a) return null;
  return words[a] ?? short(a, 32);
}

/**
 * What a follow-up's answer shapes, in the line under its chips. An email
 * agent's practice is an email practice (the step's own name), so the words
 * follow the channel already picked.
 */
export function questionShapes(questionId: string, opts: { channel?: string | null } = {}): string | null {
  const practice = opts.channel === "Email" ? "the email practice" : "the chat practice";
  switch (questionId) {
    case "cs-channel":
      return `Shapes ${practice} and the job post`;
    case "cs-industry":
      return `Shapes the skills check and ${practice}`;
    case "cs-load":
      return "Shapes the job post and the interview";
    case "cs-hours":
      return "Shapes the job post";
    case "cs-sensitive":
      return "Shapes the interview and the job post";
    case "cs-tools":
      return "Shapes the job post";
    case "remote-internet":
      return "Shapes the computer check";
    case "remote-equipment":
      return "Shapes the job post";
    default:
      return null;
  }
}

/** The title as typed, in one line. */
export function roleTag(role: string): string | null {
  const t = (role ?? "").trim();
  return t.length > 1 ? short(t) : null;
}

/**
 * Where they work, in a few words: "Remote, United States", "Remote,
 * anywhere", "In person: Austin, TX", "Hybrid: Makati". The work mode is the
 * brief's (the one Publish saves); the words are the business's own.
 */
export function placeTag(location: string, workMode: BuilderAnswers["workMode"]): string | null {
  const t = (location ?? "").trim().replace(/[.,;]+$/, "");
  if (!t) return null;
  if (workMode === "remote") {
    if (placeNamesNothing(t)) return "Remote, anywhere";
    if (placeSaysRemote(t) === "remote") return short(t);
    return short(`Remote, ${t}`);
  }
  if (workMode === "hybrid") return short(placeSaysHybrid(t) ? t : `Hybrid: ${t}`);
  return short(`In person: ${t}`);
}

/** The pay as the post will show it ("USD 18 an hour", by Publish's own rule), else as typed. */
export function payTag(pay: string, opts: { remote: boolean; countryCode?: string | null }): string | null {
  const t = (pay ?? "").trim();
  if (!t) return null;
  const sal = salaryForJob(t, opts.remote, opts.countryCode ?? null);
  const words = payWords({ salary_min: sal.min, salary_max: sal.max, salary_currency: sal.currency, salary_period: sal.period });
  return short(words ?? t, 32);
}

/**
 * The follow-up answers given so far: none on the brief but what was tapped
 * before coming back to it, on the questions every one up to the one showing
 * (its chip as picked, so the strip moves with a tap) and any tapped further
 * on, and from How strict on, all of them.
 */
export function answersGiven(
  followUps: ReadonlyArray<{ id: string; chips: readonly string[]; def: number }>,
  picks: Readonly<Record<string, number>>,
  where: { step: number; questionIndex: number },
): GivenAnswer[] {
  return followUps
    .filter((fu, i) => where.step >= 2 || (where.step === 1 && i <= where.questionIndex) || picks[fu.id] !== undefined)
    .map((fu) => ({ questionId: fu.id, answer: fu.chips[picks[fu.id] ?? fu.def] ?? fu.chips[fu.def] ?? "" }))
    .filter((a) => a.answer);
}

/**
 * The step rail's line under "Follow-ups". It counted taps, so question 5 read
 * "1 of 8" and all eight answered read "4 of 8" (the walkthrough of
 * 2026-11-01). On the questions it is the one showing ("5 of 8"); before or
 * after them, how many were answered: every question reached counts (its chip
 * as picked or as it started, the answer Ava builds from), and so does one
 * tapped. `furthest` is the furthest question shown in this visit, null when
 * none was: a draft opened past the questions had answered them all, since
 * the only way past is through each one.
 */
export function followUpsReceipt(
  followUps: ReadonlyArray<{ id: string }>,
  picks: Readonly<Record<string, number>>,
  where: { step: number; questionIndex: number; furthest: number | null },
): string | null {
  const total = followUps.length;
  if (total === 0) return null;
  if (where.step === 1) return `${Math.min(Math.max(where.questionIndex, 0), total - 1) + 1} of ${total}`;
  if (where.step >= 2 && where.furthest === null) return `${total} of ${total}`;
  const reached = where.furthest ?? -1;
  const answered = followUps.filter((fu, i) => i <= reached || picks[fu.id] !== undefined).length;
  return where.step < 1 && answered === 0 ? null : `${answered} of ${total}`;
}

/** The strip's tags: the title, the place, the pay, then each answer in the order asked. */
export function knownSoFar(a: BuilderAnswers): string[] {
  const tags = [
    roleTag(a.role),
    placeTag(a.location, a.workMode),
    payTag(a.pay, { remote: a.workMode === "remote", countryCode: a.countryCode }),
    ...a.answers.map((x) => answerTag(x.questionId, x.answer)),
  ].filter((t): t is string => !!t);
  return [...new Set(tags)];
}

function tagFor(a: BuilderAnswers, questionId: string): string | null {
  return answerTag(questionId, a.answers.find((x) => x.questionId === questionId)?.answer);
}

/**
 * The answers that shaped one step of the plan, for the review's "From your
 * answers:" line; empty when none did (the line is left out). `step` is the
 * engine's kind ("quiz", "simulation", "equipment_check", "voice_interview")
 * or "job-post". `writtenByAva`: the writer wrote the post and the interview
 * (the plan's generatedBy.provider is "openai"); the built-in plan reads no
 * follow-up answer for them.
 */
export function fromYourAnswers(step: string, a: BuilderAnswers, opts: { writtenByAva: boolean }): string[] {
  const remote = a.workMode === "remote";
  const pick = (...tags: (string | null)[]) => [...new Set(tags.filter((t): t is string => !!t))].slice(0, 3);
  switch (step) {
    case "quiz":
      return pick(tagFor(a, "cs-industry"));
    case "simulation":
      // The pack's cases, chat or email, and typing speed measured only in a remote job.
      return pick(tagFor(a, "cs-industry"), tagFor(a, "cs-channel"), remote ? placeTag(a.location, a.workMode) : null);
    case "equipment_check":
      return remote ? pick(placeTag(a.location, a.workMode), tagFor(a, "remote-internet")) : [];
    case "voice_interview":
      return opts.writtenByAva ? pick(tagFor(a, "cs-load"), tagFor(a, "cs-sensitive")) : [];
    case "job-post":
      return opts.writtenByAva
        ? pick(tagFor(a, "cs-industry"), tagFor(a, "cs-channel"), tagFor(a, "cs-hours"))
        : pick(roleTag(a.role), placeTag(a.location, a.workMode), payTag(a.pay, { remote, countryCode: a.countryCode }));
    default:
      return [];
  }
}

/* ── How long applicants spend (the run-through of 2026-10-31) ─────────────
 * Each card on the plan had its own minutes and nobody added them up, while
 * the total is what decides how many finish; and the How strict cards said
 * only "Balanced screen for most jobs". Both read the plan's own time lines
 * (the steps' durationLabel), so the words follow the plan Ava would build. */

/** The minutes a step's time line names ("~8 min", "8 min"); null when it names none ("Public", "—"). */
export function minutesIn(label: string | null | undefined): number | null {
  const m = /(\d+(?:\.\d+)?)\s*min\b/i.exec(label ?? "");
  return m ? Number(m[1]) : null;
}

/** About how long the applicant's steps take together; null when no step names its time. */
export function applicantMinutes(labels: readonly (string | null | undefined)[]): number | null {
  const each = labels.map(minutesIn).filter((n): n is number => n != null);
  return each.length ? Math.max(1, Math.round(each.reduce((sum, n) => sum + n, 0))) : null;
}

/** The plan review's line over the steps: how many, and how long all together. */
export function applicantTimeLine(steps: number, minutes: number | null): string | null {
  if (steps <= 0) return null;
  const count = `${steps} ${steps === 1 ? "step" : "steps"} for applicants`;
  return minutes ? `${count}, about ${minutes} minutes in all.` : `${count}.`;
}

/** The part of a plan step the How strict cards read. */
export interface PlanStepShape {
  kind: string;
  config?: unknown;
  durationLabel?: string;
}

/**
 * What one How strict choice builds, read off the plan it would make: the
 * form's and the interview's questions (what the choice changes), the steps
 * every choice keeps, and the applicant's minutes. "3 form questions and a
 * 6-question written interview, with the skills check and the chat practice."
 */
export function rigorPlanWords(phases: readonly PlanStepShape[]): { line: string; minutes: number | null } {
  const count = (kind: string, key: string) => {
    const cfg = phases.find((p) => p.kind === kind)?.config as Record<string, unknown> | undefined;
    const list = cfg?.[key];
    return Array.isArray(list) ? list.length : 0;
  };
  const form = count("application", "questions");
  const interview = count("voice_interview", "questions");
  const practice = phases.find((p) => p.kind === "simulation");
  const kept = [
    phases.some((p) => p.kind === "quiz") ? "the skills check" : null,
    practice ? `the ${(practice.config as { channel?: unknown } | undefined)?.channel === "email" ? "email" : "chat"} practice` : null,
  ].filter((w): w is string => !!w);
  const asks = [
    form > 0 ? `${form} form ${form === 1 ? "question" : "questions"}` : null,
    interview > 0 ? `${/^(8|11|18)$/.test(String(interview)) ? "an" : "a"} ${interview}-question written interview` : null,
  ].filter((w): w is string => !!w);
  const head = asks.join(" and ");
  const tail = kept.length ? `${head ? ", with " : "With "}${kept.join(" and ")}` : "";
  const line = `${head ? head.charAt(0).toUpperCase() + head.slice(1) : ""}${tail}.`;
  return { line, minutes: applicantMinutes(phases.map((p) => p.durationLabel)) };
}
