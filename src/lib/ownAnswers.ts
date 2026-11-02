/**
 * The business's own words on two of Ava's questions (src/pages/AvaCreateJob.tsx;
 * the owner's live run of 2026-11-01):
 *
 *  - "What kind of business is it?" → Something else: "you should be able to
 *    define what it is and Ava should be able to pick a category from that".
 *    The words pick the closest scenario pack (src/lib/businessKind.ts), or the
 *    business picks one itself; the brief then answers with that pack's own
 *    chip, so both plan builders and generate-flow use its skills check and
 *    cases (packIdForBrief), and the words go to the writer as their own
 *    answer ("What does your business do?").
 *  - "When will they work?" → Set your own hours: "pick or define your own
 *    timings ... easy, but also very customizable". The words are the answer
 *    the writer reads, and the job post says them (withOwnHoursInPost).
 *
 * Pure: no React, no Supabase (scripts/own_answers.test.mjs).
 */
import type { ScenarioPackId } from "@/content/scenarioPacks/packs";
import { CS_INDUSTRY_CHIPS } from "@/lib/avaEngine/customerService";
import type { BriefAnswer, JobPost } from "@/lib/avaEngine/types";
import { businessKindFromWords } from "@/lib/businessKind";

/** The industry chip that opens the business's own words. */
export const SOMETHING_ELSE = "Something else";
/** The hours chip that opens the business's own hours. */
export const OWN_HOURS_CHIP = "Set your own hours";
/** "Weekends too", a switch beside the hours picks (the business's own hours say their own days). */
export const WEEKENDS_LABEL = "Weekends too";
/** The answer the writer gets when the weekends switch is on. */
export const WEEKENDS_ID = "cs-weekends";
export const WEEKENDS_QUESTION = "Do they work weekends?";
export const WEEKENDS_ANSWER = "Yes, weekends too";
/** The answer the writer gets with the business's own words. */
export const BUSINESS_WORDS_ID = "cs-business";
export const BUSINESS_WORDS_QUESTION = "What does your business do?";
/** The longest a business's own words are kept. */
export const OWN_WORDS_MAX = 160;

export interface OwnWords {
  /** "Tell Ava what your business does", under Something else. */
  business?: string;
  /** The pack the business picked itself ("Change"); wins over the words. */
  businessPack?: ScenarioPackId | null;
  /** "Set your own hours", under When will they work. */
  hours?: string;
  /** The "Weekends too" switch under When will they work (not with the business's own hours). */
  weekends?: boolean;
}

function clean(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, OWN_WORDS_MAX);
}

/** The pack Something else stands for: the business's own pick, else its words' closest, else none (the general pack). */
export function ownBusinessPack(own: OwnWords | null | undefined): ScenarioPackId | null {
  if (own?.businessPack) return own.businessPack;
  const words = clean(own?.business);
  return words ? businessKindFromWords(words).pack : null;
}

/** The industry chip a pack is answered with (the general pack's is Something else). */
export function chipForPack(pack: ScenarioPackId): string {
  return CS_INDUSTRY_CHIPS.find(([, id]) => id === pack)?.[0] ?? SOMETHING_ELSE;
}

/**
 * The brief's answers with the business's own words in: Something else
 * answered as its pack's chip, followed by the words themselves; Set your own
 * hours answered with the hours as written (left out while empty, so the
 * writer is never told "Set your own hours"); any other pick followed, with
 * the weekends switch on, by "Do they work weekends?".
 */
export function withOwnWords(answers: readonly BriefAnswer[], own: OwnWords | null | undefined): BriefAnswer[] {
  const business = clean(own?.business);
  const hours = clean(own?.hours);
  const out: BriefAnswer[] = [];
  for (const a of answers) {
    if (a.questionId === BUSINESS_WORDS_ID || a.questionId === WEEKENDS_ID) continue;
    if (a.questionId === "cs-industry" && a.answer === SOMETHING_ELSE) {
      const pack = ownBusinessPack(own);
      out.push(pack ? { ...a, answer: chipForPack(pack) } : a);
      if (business) out.push({ questionId: BUSINESS_WORDS_ID, question: BUSINESS_WORDS_QUESTION, answer: business });
      continue;
    }
    if (a.questionId === "cs-hours" && a.answer === OWN_HOURS_CHIP) {
      if (hours) out.push({ ...a, answer: hours });
      continue;
    }
    out.push(a);
    if (a.questionId === "cs-hours" && own?.weekends) out.push({ questionId: WEEKENDS_ID, question: WEEKENDS_QUESTION, answer: WEEKENDS_ANSWER });
  }
  return out;
}

/**
 * The answers as the builder's hints show them (src/lib/builderHints.ts): the
 * business's words in place of "Something else" and "Set your own hours", and
 * "Weekends too" beside any other hours pick while its switch is on.
 */
export function givenWithOwnWords<T extends { questionId: string; answer: string }>(given: readonly T[], own: OwnWords | null | undefined): T[] {
  const business = clean(own?.business);
  const hours = clean(own?.hours);
  return given.flatMap((g): T[] => {
    if (g.questionId === "cs-industry" && g.answer === SOMETHING_ELSE && business) return [{ ...g, answer: business }];
    if (g.questionId === "cs-hours" && g.answer === OWN_HOURS_CHIP) return hours ? [{ ...g, answer: hours }] : [];
    if (g.questionId === "cs-hours" && own?.weekends) return [g, { ...g, answer: WEEKENDS_LABEL }];
    return [g];
  });
}

/** The business's own hours, as the brief carries them; null when it picked one of the four. */
export function ownHoursIn(answers: readonly BriefAnswer[] | null | undefined, chips: readonly string[]): string | null {
  const a = answers?.find((x) => x.questionId === "cs-hours")?.answer?.trim();
  return a && !chips.includes(a) ? a : null;
}

function plain(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * The job post with the business's own hours in it: "Hours: Mon–Fri, 9am–5pm
 * Manila time." after the summary, unless the post already says them word for
 * word. Both plans: the writer is told them, and the built-in plan reads no
 * follow-up answer, so they would otherwise be missing from its post.
 */
export function withOwnHoursInPost(post: JobPost, hours: string | null | undefined): JobPost {
  const line = ownHoursLine(hours);
  if (!line) return post;
  const all = plain([post.summary, ...(post.responsibilities ?? []), ...(post.requirements ?? []), ...(post.niceToHaves ?? [])].join(" "));
  if (all.includes(plain(ownHoursText(hours)))) return post;
  return { ...post, summary: post.summary?.trim() ? `${post.summary.trim()}\n\n${line}` : line };
}

function ownHoursText(hours: string | null | undefined): string {
  return clean(hours).replace(/[.;,\s]+$/, "");
}

/** The post's line for the business's own hours ("Hours: Mon–Fri, 9am–5pm Manila time."), null while empty. */
export function ownHoursLine(hours: string | null | undefined): string | null {
  const h = ownHoursText(hours);
  return h ? `Hours: ${h}.` : null;
}
