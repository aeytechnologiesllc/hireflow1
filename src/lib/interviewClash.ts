/**
 * interviewClash.ts: does a time the team is about to offer run into another
 * interview of theirs?
 *
 * The owner gives each applicant one time (2026-10-07). Offer the same time
 * to two people and only one can have it: the second finds it taken and has
 * to write back. So the set-up screen and the "set a new time" box say so
 * before the time is sent (docs/INTERVIEWS.md, "One time, one applicant").
 *
 * Pure: no React, no Supabase.
 */

export interface BusyInterview {
  id: string;
  /** Who it is with, for the wording. */
  name: string;
  start: string | Date | null;
  minutes: number | null;
  /** True when that applicant has booked it; false when it is only offered. */
  booked: boolean;
}

/** The interview a new one at `start` would overlap: a booked one first, else one only offered. Null when free. */
export function clashAt(start: Date, minutes: number, others: readonly BusyInterview[], exceptId?: string | null): BusyInterview | null {
  const from = start.getTime();
  if (Number.isNaN(from)) return null;
  const to = from + (minutes > 0 ? minutes : 30) * 60_000;
  let offered: BusyInterview | null = null;
  for (const other of others) {
    if (exceptId && other.id === exceptId) continue;
    const otherFrom = other.start ? new Date(other.start).getTime() : NaN;
    if (Number.isNaN(otherFrom)) continue;
    const otherTo = otherFrom + ((other.minutes ?? 0) > 0 ? (other.minutes as number) : 30) * 60_000;
    // Each starts before the other ends. Back to back is not a clash.
    if (!(from < otherTo && otherFrom < to)) continue;
    if (other.booked) return other;
    offered = offered ?? other;
  }
  return offered;
}

/** What the team is told about it, in one line. */
export function clashWords(clash: BusyInterview | null): string {
  if (!clash) return "";
  const who = clash.name.trim().split(/\s+/)[0] || "someone else";
  return clash.booked
    ? `You already have an interview with ${who} at this time.`
    : `You offered this time to ${who} as well. Whoever books first gets it.`;
}
