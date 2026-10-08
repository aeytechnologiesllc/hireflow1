/**
 * teamInterviewStatus.ts: what the hiring team is told about an applicant's
 * live interview on the applicant's own page.
 *
 * The owner, 2026-10-08, minutes after inviting his first finalists: "I just
 * set him up for an interview, but it didn't change here. It still says set
 * up interview. Can you see if that one went through?" It had gone through.
 * The page read no interview at all, so "Set up interview" stayed the big
 * button, as if nothing had happened.
 *
 * Pure: no React, no Supabase, no date library.
 */

/** The interview fields this reading needs (a row of public.interviews). */
export interface TeamInterviewLike {
  status?: string | null;
  candidate_response?: string | null;
  scheduled_at?: string | null;
  duration_minutes?: number | null;
  employer_windows?: unknown;
}

export interface TeamInterviewStatus {
  /**
   * "offered": one time is on offer and not booked. "offered-several": an
   * older offer of several times, none picked. "booked": a time is agreed.
   * "to-confirm": a time was set outright and they have not confirmed.
   * "cant-make": they wrote when they are free and the team has not set a
   * new time. "passed": the offered time went by unbooked.
   */
  state: "offered" | "offered-several" | "booked" | "to-confirm" | "cant-make" | "passed";
  title: string;
  detail: string;
  /**
   * What the page's interview button should now be: "change" the time of an
   * interview that stands, "set-new" after they said they cannot make it, or
   * "set-up" when there is nothing live to keep.
   */
  action: "change" | "set-new" | "set-up";
}

/** How long after its end a booked interview still counts as live (the applicant's side uses the same hour). */
const GRACE_MINUTES = 60;

function sayWhen(at: Date, timeZone?: string): string {
  const zone = timeZone ? { timeZone } : {};
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", ...zone }).format(at);
  const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, ...zone }).formatToParts(at);
  const piece = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${day} at ${piece("hour")}:${piece("minute")} ${piece("dayPeriod")}`;
}

function sayTheirs(at: Date, zone: string): string {
  try {
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: zone }).format(at);
    const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: zone }).formatToParts(at);
    const piece = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${weekday} ${piece("hour")}:${piece("minute")} ${piece("dayPeriod")}`;
  } catch {
    return "";
  }
}

/**
 * The status of an applicant's live interview, or null when they have none
 * (never set up, cancelled, or over). `teamZone` is only for tests: the
 * reader's own clock otherwise. `theirZone` adds the applicant's own time
 * when it differs.
 */
export function teamInterviewStatus(
  interview: TeamInterviewLike | null | undefined,
  now: Date,
  options: { firstName?: string | null; theirZone?: string | null; teamZone?: string } = {},
): TeamInterviewStatus | null {
  if (!interview || interview.status !== "scheduled") return null;
  const name = options.firstName?.trim() || "";
  const they = name || "They";
  const at = interview.scheduled_at ? new Date(interview.scheduled_at) : null;
  const known = !!at && !Number.isNaN(at.getTime());
  const when = known ? sayWhen(at as Date, options.teamZone) : "";
  const theirs = known && options.theirZone ? sayTheirs(at as Date, options.theirZone) : "";
  // Their own time is said only when it reads differently from the team's.
  const mine = known ? sayTheirs(at as Date, options.teamZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone) : "";
  const both = theirs && theirs !== mine ? `${when} (${theirs} for ${name || "them"})` : when;
  const ahead = known && (at as Date).getTime() > now.getTime();
  const response = interview.candidate_response ?? "pending";

  if (response === "reschedule_requested") {
    return {
      state: "cant-make",
      title: `${they} can't make it`,
      detail: `${name ? `${name} wrote` : "They wrote"} when they are free. Set a new time and they are asked to book it.`,
      action: "set-new",
    };
  }
  if (response === "awaiting_pick") {
    const offered = Array.isArray(interview.employer_windows) ? interview.employer_windows : [];
    const open = offered.filter((w) => {
      const start = new Date(String((w as { start?: unknown } | null)?.start ?? "")).getTime();
      return !Number.isNaN(start) && start > now.getTime();
    });
    if (open.length === 0) {
      return { state: "passed", title: "The offered time passed", detail: `${they === "They" ? "They" : name} did not book it. Set up a new time.`, action: "set-up" };
    }
    if (offered.length > 1) {
      return { state: "offered-several", title: "Interview times offered", detail: `${open.length === 1 ? "One time is" : `${open.length} times are`} still open. Not picked yet.`, action: "change" };
    }
    const start = new Date(String((open[0] as { start?: unknown }).start));
    const offeredTheirs = options.theirZone ? sayTheirs(start, options.theirZone) : "";
    const offeredMine = sayTheirs(start, options.teamZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
    const offeredWhen = sayWhen(start, options.teamZone);
    return {
      state: "offered",
      title: "Interview offered",
      detail: `${offeredTheirs && offeredTheirs !== offeredMine ? `${offeredWhen} (${offeredTheirs} for ${name || "them"})` : offeredWhen}. Not booked yet: you are told when ${name || "they"} ${name ? "books" : "book"} it.`,
      action: "change",
    };
  }
  if (response === "confirmed") {
    if (!known) return null;
    const minutes = typeof interview.duration_minutes === "number" && interview.duration_minutes > 0 ? interview.duration_minutes : 30;
    if ((at as Date).getTime() + (minutes + GRACE_MINUTES) * 60_000 <= now.getTime()) return null;
    return { state: "booked", title: "Interview booked", detail: `${both}. ${name || "They"} booked it.`, action: "change" };
  }
  // A time set outright, waiting for them to confirm.
  if (!ahead) return null;
  return { state: "to-confirm", title: "Interview set", detail: `${both}. Waiting for ${name || "them"} to confirm.`, action: "change" };
}
