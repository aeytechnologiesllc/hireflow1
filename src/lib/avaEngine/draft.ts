import type { JobBrief, JobFlow, Rigor } from "./types";

/**
 * The job builder's unfinished work (src/pages/AvaCreateJob.tsx), kept on this
 * browser for its account. The owner, 2026-11-01: "this job should be saved
 * up, so if they ... exit this back out, the job should be saved up one day so
 * they can continue or restart." It was kept only for the tab it was made in
 * (a sessionStorage mark), and every "New job" button threw it away, so
 * closing the tab or going back to Jobs lost the work. Now every change is
 * saved with its time, under the account, for a week (DRAFT_KEEP_MS), and the
 * builder offers "Continue where you left off" or "Start over"
 * (draftWorthOffering, draftResumeWords). A job already saved as a draft in
 * the database (the payment step's) is in Jobs, "Finish & publish".
 */

/** Before 2026-11-01: one draft for the browser, no account, no time. Read once, as the account's, then removed. */
const LEGACY_DRAFT_KEY = "ava-create-job-draft-v1";
const DRAFT_KEY_PREFIX = "ava-create-job-draft-v2:";

/** How long unfinished work is kept: a week (at least a day was asked for). */
export const DRAFT_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

export interface AvaCreateDraft {
  briefFields: {
    role: string;
    location: string;
    type: string;
    pay: string;
    start: string;
    work: string;
    openings: number;
    /** Whether the business picked where (Remote, Hybrid, On-site) itself (briefFromForm); an older draft has none. */
    typeChosen?: boolean;
    /** The where the business picked, read by briefFromForm as its chosen work mode (src/lib/briefPicks.ts withSetup). */
    workMode?: string;
    /** "At our office" was picked under Where they'll work (src/lib/briefPicks.ts); an older draft has none. */
    atOffice?: boolean;
  };
  chipAnswers: Record<string, number>;
  rigor: Rigor;
  rigorTouched: boolean;
  flow: JobFlow | null;
  /** The builder's step when it was left (AvaCreateJob's restoredStep); an older draft has none. */
  step?: number;
  /** The question showing when it was left on the questions; an older draft has none. */
  questionIndex?: number;
  /** The review's renames, order and removals, card by card; an older draft has none. */
  reviewEdits?: { id: string; title: string; candidate: string }[];
  /** The business's own words under Something else and Set your own hours (src/lib/ownAnswers.ts); an older draft has none. */
  ownWords?: { business?: string; businessPack?: import("../../content/scenarioPacks/packs").ScenarioPackId | null; hours?: string };
  /** When it was last saved (ms since 1970); a legacy draft has none. */
  savedAt?: number;
}

function keyFor(userId: string): string {
  return `${DRAFT_KEY_PREFIX}${userId}`;
}

function read(key: string): AvaCreateDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as AvaCreateDraft;
    return draft && typeof draft === "object" && draft.briefFields && typeof draft.briefFields === "object" ? draft : null;
  } catch {
    return null;
  }
}

/**
 * This account's unfinished work on this browser, while it is under a week
 * old; older work is removed. A draft from before accounts were kept apart is
 * taken as this account's once (it was made on this browser), then removed.
 */
export function loadDraft(userId: string | null | undefined, now: number = Date.now()): AvaCreateDraft | null {
  if (!userId) return null;
  const own = read(keyFor(userId));
  if (own) {
    if (typeof own.savedAt === "number" && now - own.savedAt <= DRAFT_KEEP_MS) return own;
    clearDraft(userId);
    return null;
  }
  // (Left in place until this account's own is saved over it or cleared: clearDraft removes both.)
  return read(LEGACY_DRAFT_KEY);
}

/**
 * Where a draft opens: the plan review when it has a plan, a question step as
 * it was, How strict when it was left while the plan was being built (the
 * build is never started on its own), else the job details. Never the
 * published screen.
 */
export function draftOpeningStep(draft: { step?: number; flow: JobFlow | null } | null | undefined): number {
  const at = draft?.step;
  if (typeof at !== "number") return 0;
  if (at >= 3 && draft?.flow) return 4;
  if (at === 3) return 2;
  if (at === 1 || at === 2) return at;
  return 0;
}

/** Saves this account's work with the time it was saved. */
export function saveDraft(draft: AvaCreateDraft, userId: string | null | undefined, now: number = Date.now()): void {
  if (!userId) return;
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify({ ...draft, savedAt: now }));
  } catch {
    /* quota / private mode */
  }
}

/** Drops this account's work (published, saved to Jobs, or Start over). */
export function clearDraft(userId: string | null | undefined): void {
  try {
    if (userId) localStorage.removeItem(keyFor(userId));
    localStorage.removeItem(LEGACY_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/** Worth offering back: something the business typed, picked or had built (an untouched brief is not). */
export function draftWorthOffering(draft: AvaCreateDraft | null | undefined): draft is AvaCreateDraft {
  if (!draft) return false;
  const f = draft.briefFields;
  return !!(f.role?.trim() || f.work?.trim() || f.pay?.trim() || draft.flow || Object.keys(draft.chipAnswers ?? {}).length || draft.ownWords?.business?.trim() || draft.ownWords?.hours?.trim());
}

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago"; "earlier" with no time. */
export function savedAgo(savedAt: number | null | undefined, now: number = Date.now()): string {
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return "earlier";
  const mins = Math.max(0, Math.floor((now - savedAt) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} ${mins === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** Where a draft picks up, in words: the step it will open on (AvaCreateJob's restoredStep). */
export function draftPlaceWords(step: number, questionIndex?: number | null, questions?: number | null): string {
  if (step === 4) return "your hiring plan";
  if (step === 2) return "How strict";
  if (step === 1) return questions && typeof questionIndex === "number" ? `question ${Math.min(questionIndex, questions - 1) + 1} of ${questions}` : "the questions";
  return "the job details";
}

/** The offer's words: the job's title (or "Your new job"), where it picks up, and when it was saved. */
export function draftResumeWords(draft: AvaCreateDraft, opening: { step: number; questions?: number | null }, now: number = Date.now()): { title: string; detail: string } {
  const title = draft.briefFields.role?.trim() || "Your new job";
  return { title, detail: `Saved ${savedAgo(draft.savedAt, now)}. It opens at ${draftPlaceWords(opening.step, draft.questionIndex, opening.questions)}.` };
}

export function draftFromBrief(brief: JobBrief, partial?: Partial<AvaCreateDraft>): AvaCreateDraft {
  return {
    briefFields: {
      role: brief.roleTitle,
      location: brief.location,
      type: brief.employmentType.replace("_", " "),
      pay: brief.pay,
      start: brief.startUrgency.replace("_", " "),
      work: brief.whatTheyDo,
      openings: brief.openings,
    },
    chipAnswers: {},
    rigor: "standard",
    rigorTouched: false,
    flow: null,
    ...partial,
  };
}
