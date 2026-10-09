/**
 * interviewWhen.ts: how soon an interview is, in the words the Interviews
 * page and the menu use (docs/INTERVIEWS.md, "Today, and how soon").
 *
 * The owner, 2026-10-09, with two interviews that afternoon: "it would be
 * nice if the interview tab, let's say it's today, so you should have a one
 * count or two count depending on how many interviews you have today. And
 * also right here where it says 4 p.m. it should be a button that says in 30
 * minutes or now ... so kind of like they know that oh right now is the time
 * to do the interview."
 *
 * Two things, from the same clock:
 *  - a line beside an interview's time: "In 2 h 10 min", "In 30 minutes",
 *    "Now", so the time does not have to be worked out against the clock;
 *  - a count on the Interviews item of the menu: how many agreed interviews
 *    are still ahead (or under way) today.
 *
 * Pure: no React, no Supabase, no clock of its own (`now` is passed in).
 */

/** An interview with no length on record is taken to be this long. */
export const DEFAULT_INTERVIEW_MINUTES = 30;
/** "Now" starts this long before the start time: time to open the room. */
export const NOW_FROM_MS = 5 * 60_000;
/** Inside this, the wait is said in minutes, in full. */
export const SOON_MS = 60 * 60_000;

export type WhenTone = "now" | "soon" | "today" | "later" | "over";

export interface InterviewWhen {
  tone: WhenTone;
  /** "Now", "In 30 minutes", "In 2 h 10 min", "Tomorrow", "In 3 days", "Earlier today". */
  label: string;
}

const dayNumber = (ms: number) => {
  const d = new Date(ms);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
};

/**
 * How soon an interview is, on the reader's own clock. Null when it has no
 * time, or when its day has passed (the page lists those under "Needs
 * attention" with their own words).
 */
export function interviewWhen(at: Date | number | null | undefined, now: number, minutes?: number | null): InterviewWhen | null {
  if (at == null) return null;
  const start = typeof at === "number" ? at : at.getTime();
  if (!Number.isFinite(start)) return null;
  const end = start + Math.max(1, minutes ?? DEFAULT_INTERVIEW_MINUTES) * 60_000;
  const days = dayNumber(start) - dayNumber(now);
  if (days < 0) return null;
  if (now >= end) return { tone: "over", label: "Earlier today" };
  const wait = start - now;
  if (wait <= NOW_FROM_MS) return { tone: "now", label: "Now" };
  if (wait <= SOON_MS) {
    const mins = Math.ceil(wait / 60_000);
    return { tone: "soon", label: `In ${mins} minute${mins === 1 ? "" : "s"}` };
  }
  if (days === 0) {
    const total = Math.round(wait / 60_000);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return { tone: "today", label: m === 0 ? `In ${h} h` : `In ${h} h ${m} min` };
  }
  if (days === 1) return { tone: "later", label: "Tomorrow" };
  return { tone: "later", label: `In ${days} days` };
}

/** What the count needs from a row of public.interviews. */
export interface InterviewRowLike {
  scheduled_at?: string | null;
  status?: string | null;
  candidate_response?: string | null;
  duration_minutes?: number | null;
}

/**
 * How many interviews are still ahead, or under way, today: scheduled, at a
 * time the applicant has agreed to, on today's date, and not yet over. One
 * still waiting for the applicant to pick a time is not an interview today.
 */
export function interviewsLeftToday(rows: readonly InterviewRowLike[] | null | undefined, now: number): number {
  let n = 0;
  for (const row of rows ?? []) {
    if (row?.status !== "scheduled" || row.candidate_response !== "confirmed" || !row.scheduled_at) continue;
    const start = Date.parse(row.scheduled_at);
    if (!Number.isFinite(start)) continue;
    const when = interviewWhen(start, now, row.duration_minutes);
    if (when && dayNumber(start) === dayNumber(now) && when.tone !== "over") n += 1;
  }
  return n;
}
