/**
 * candidateInterview.ts: what an applicant is told about a live interview with
 * the hiring team. One reading, used by the applications list, the
 * application page and the pop-up, so the three never disagree
 * (docs/INTERVIEWS.md, "What the applicant sees").
 *
 * The owner, 2026-10-07, testing as an applicant after offering times: "make
 * it very clear when the interview is scheduled ... I've already proposed
 * some times, but here it keeps saying Chat Support Team Leader blah blah".
 * The list showed a small chip beside the test still to take, and the times
 * were a click away behind the row.
 *
 * Pure: no React, no Supabase.
 */

export interface OfferedWindow {
  start: string;
  durationMinutes: number;
}

/** The interview fields this reading needs (a row of public.interviews). */
export interface CandidateInterviewLike {
  status?: string | null;
  candidate_response?: string | null;
  scheduled_at?: string | null;
  duration_minutes?: number | null;
  interview_type?: string | null;
  employer_windows?: unknown;
  meeting_provider?: string | null;
  meeting_link?: string | null;
}

/**
 * How long after its end a confirmed interview still counts as live: someone
 * running late must still find the way in. (The built-in room closes an hour
 * after the end too: supabase/functions/interview-rooms.)
 */
export const JOIN_GRACE_MINUTES = 60;
/** How long before the start the way in opens: a link of the team's own. */
export const JOIN_OPENS_MINUTES_LINK = 120;
/** …and the built-in room, which is itself shut until then. */
export const JOIN_OPENS_MINUTES_ROOM = 15;

/** When a confirmed interview stops being live: its end, plus the grace. Null with no time on it. */
export function interviewLiveUntil(interview: CandidateInterviewLike | null | undefined): Date | null {
  const start = interview?.scheduled_at ? new Date(interview.scheduled_at).getTime() : NaN;
  if (Number.isNaN(start)) return null;
  const minutes = typeof interview?.duration_minutes === "number" && interview.duration_minutes > 0 ? interview.duration_minutes : 30;
  return new Date(start + (minutes + JOIN_GRACE_MINUTES) * 60_000);
}

/**
 * Where the applicant stands:
 *  - "pick": the team offered a time (one, since 2026-10-07; several before)
 *    and it is not booked yet;
 *  - "confirm": the team set one time and asks them to confirm it;
 *  - "waiting": they said they cannot make it and wrote when they are free;
 *    the team has not set a new time yet;
 *  - "confirmed": a time is agreed.
 *
 * The owner, 2026-10-07: "I wanna just give them one time for the interview,
 * not two ... if they cannot make it on that time, don't let them just select
 * times. Let them write a message ... and then I get to schedule it." So the
 * applicant books the one time or writes their availability: no time pickers
 * on their side, and no back and forth over times nobody can do.
 */
export type CandidateInterviewStage = "pick" | "confirm" | "waiting" | "confirmed";

/** The times the team offered, as stored (employer_windows). Anything malformed is left out. */
export function offeredWindows(raw: unknown): OfferedWindow[] {
  if (!Array.isArray(raw)) return [];
  const out: OfferedWindow[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const start = (entry as { start?: unknown }).start;
    if (typeof start !== "string" || Number.isNaN(new Date(start).getTime())) continue;
    const minutes = (entry as { durationMinutes?: unknown }).durationMinutes;
    out.push({ start, durationMinutes: typeof minutes === "number" && minutes > 0 ? minutes : 30 });
  }
  return out;
}

/** The offered times that have not passed. */
export function openWindows(windows: readonly OfferedWindow[], now: Date): OfferedWindow[] {
  const at = now.getTime();
  return windows.filter((w) => new Date(w.start).getTime() > at);
}

/** Their stage, or null when there is nothing live to tell them (no interview, cancelled, or over). */
export function candidateInterviewStage(interview: CandidateInterviewLike | null | undefined, now: Date): CandidateInterviewStage | null {
  if (!interview || interview.status !== "scheduled") return null;
  const response = interview.candidate_response ?? "pending";
  if (response === "awaiting_pick") return "pick";
  if (response === "reschedule_requested") return "waiting";
  const at = interview.scheduled_at ? new Date(interview.scheduled_at).getTime() : NaN;
  if (response === "confirmed") {
    // A confirmed interview stays live through its length and an hour after:
    // the way in must not vanish at the very minute it starts. (It did,
    // until 2026-10-07: someone a minute late found no interview at all.)
    const until = interviewLiveUntil(interview);
    return until && until.getTime() > now.getTime() ? "confirmed" : null;
  }
  // A time that has passed is no longer something to confirm.
  if (!(at > now.getTime())) return null;
  return "confirm";
}

/** How a confirmed interview is joined, and from when. */
export interface JoinPlan {
  /** "room": the built-in video room. "link": a link of the team's own. "none": nothing to open (a phone call, in person, or not set up). */
  how: "room" | "link" | "none";
  /** When the way in opens. */
  opensAt: Date | null;
  /** How long before the start that is, in words ("2 hours", "15 minutes"). */
  leadWords: string;
  /** Open now. */
  open: boolean;
}

/**
 * The way into a confirmed interview. A link of the team's own opens two
 * hours before the start (the owner: "it will be available a couple hours
 * before"); the built-in room fifteen minutes before, which is when the room
 * itself opens. Both stay open until the interview stops being live.
 */
export function joinPlan(interview: CandidateInterviewLike | null | undefined, now: Date): JoinPlan {
  const hasRoom = interview?.meeting_provider === "daily";
  const hasLink = !hasRoom && typeof interview?.meeting_link === "string" && interview.meeting_link.trim().length > 0;
  const how: JoinPlan["how"] = hasRoom ? "room" : hasLink ? "link" : "none";
  const start = interview?.scheduled_at ? new Date(interview.scheduled_at).getTime() : NaN;
  if (how === "none" || Number.isNaN(start)) return { how, opensAt: null, leadWords: "", open: false };
  const lead: number = how === "room" ? JOIN_OPENS_MINUTES_ROOM : JOIN_OPENS_MINUTES_LINK;
  const opensAt = new Date(start - lead * 60_000);
  const until = interviewLiveUntil(interview);
  const t = now.getTime();
  return {
    how,
    opensAt,
    leadWords: lead >= 120 && lead % 60 === 0 ? `${lead / 60} hours` : `${lead} minutes`,
    open: t >= opensAt.getTime() && !!until && t < until.getTime(),
  };
}

/** "Thursday, October 8 at 9:00 PM", on the reader's own clock unless a zone is given. */
export function interviewWhen(at: string | Date, timeZone?: string): string {
  const date = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", ...(timeZone ? { timeZone } : {}) }).format(date);
  // Some runtimes put a narrow no-break space before AM/PM: written as a plain space.
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) })
    .format(date)
    .replace(/\s+/g, " ");
  return `${day} at ${time}`;
}

/** "Video call", "Phone call", "In person": how the conversation happens. */
export function interviewKindWords(type: string | null | undefined): string {
  if (type === "phone") return "Phone call";
  if (type === "in_person" || type === "in-person" || type === "onsite") return "In person";
  return "Video call";
}

export interface CandidateInterviewWords {
  stage: CandidateInterviewStage;
  /** True when the next move is the applicant's. */
  theirMove: boolean;
  /**
   * They have just been chosen and have not answered yet: the moment to
   * celebrate (the owner: "You have been selected for an interview. Boom,
   * boom, shabam.").
   */
  selected: boolean;
  /** The short chip on the applications list. */
  chip: string;
  /** The small line above the title ("Congratulations"). */
  eyebrow: string;
  title: string;
  body: string;
  /**
   * The same ask without the team's name, for where the name has just been
   * said ("They offered 2 times. Pick the one that works for you.").
   */
  ask: string;
  /** The button that opens it. */
  action: string;
}

/** What an applicant who has just been chosen is told, everywhere. */
export const SELECTED_TITLE = "You've been selected for an interview";
/** The one way to answer "I can't make it": say when they are free, in words. */
export const TELL_AVAILABILITY = "Tell them when you're free";

/**
 * Has this applicant a live interview with the team? While they have, the
 * interview is all their application shows: no step still to take, no test
 * (the owner: "they should not even be seeing the skill test or anything
 * else because they have already been selected for an interview").
 */
export function hasLiveInterview(interview: CandidateInterviewLike | null | undefined, now: Date): boolean {
  return candidateInterviewStage(interview, now) != null;
}

/**
 * The words for one interview. `company` is the employer's public name when it
 * is on file; `timeZone` is only for tests (the reader's own clock otherwise).
 */
export function candidateInterviewWords(
  interview: CandidateInterviewLike | null | undefined,
  options: { company?: string | null; now: Date; timeZone?: string },
): CandidateInterviewWords | null {
  const stage = candidateInterviewStage(interview, options.now);
  if (!interview || !stage) return null;
  const team = options.company?.trim() || "The hiring team";
  const when = interview.scheduled_at ? interviewWhen(interview.scheduled_at, options.timeZone) : "";

  if (stage === "pick") {
    const offered = offeredWindows(interview.employer_windows);
    const stillOpen = openWindows(offered, options.now);
    const open = stillOpen.length;
    if (open === 0) {
      const passed = offered.length === 1 ? "time" : "times";
      const have = offered.length === 1 ? "has" : "have";
      return {
        stage,
        theirMove: true,
        selected: true,
        chip: "Reply needed",
        eyebrow: "Congratulations",
        title: SELECTED_TITLE,
        body: `The ${passed} ${team === "The hiring team" ? "the hiring team" : team} offered ${have} passed. Tell them when you are free.`,
        ask: `The ${passed} they offered ${have} passed. Tell them when you are free.`,
        action: TELL_AVAILABILITY,
      };
    }
    if (open === 1) {
      // One time: said outright, wherever this is read.
      const offeredWhen = interviewWhen(stillOpen[0].start, options.timeZone);
      return {
        stage,
        theirMove: true,
        selected: true,
        chip: "Book your time",
        eyebrow: "Congratulations",
        title: SELECTED_TITLE,
        body: `${team} would like to meet you on ${offeredWhen}. Book it, or tell them when you are free.`,
        ask: `They would like to meet you on ${offeredWhen}. Book it, or tell them when you are free.`,
        action: "See your time",
      };
    }
    return {
      stage,
      theirMove: true,
      selected: true,
      chip: "Pick your time",
      eyebrow: "Congratulations",
      title: SELECTED_TITLE,
      body: `${team} offered ${open} times. Pick the one that works for you.`,
      ask: `They offered ${open} times. Pick the one that works for you.`,
      action: "Pick your time",
    };
  }
  if (stage === "confirm") {
    return {
      stage,
      theirMove: true,
      selected: true,
      chip: "Confirm interview",
      eyebrow: "Congratulations",
      title: SELECTED_TITLE,
      body: `${team} set it for ${when}. Confirm it, or tell them when you are free.`,
      ask: `They set it for ${when}. Confirm it, or tell them when you are free.`,
      action: "Confirm or change",
    };
  }
  if (stage === "waiting") {
    return {
      stage,
      theirMove: false,
      selected: false,
      chip: "Awaiting reply",
      eyebrow: "Your interview",
      title: "You asked for another interview time",
      body: `${team === "The hiring team" ? "The hiring team has" : `${team} has`} your message and will set a new time. Nothing to do for now.`,
      ask: "They have your message and will set a new time. Nothing to do for now.",
      action: "View",
    };
  }
  return {
    stage,
    theirMove: false,
    selected: false,
    chip: "Interview confirmed",
    eyebrow: "You're booked",
    title: "Your interview is confirmed",
    body: `${when}. Open it for how to join and to add it to your calendar.`,
    ask: `${when}. Open it for how to join and to add it to your calendar.`,
    action: "View details",
  };
}

/* ── The ticket's own words ─────────────────────────────────────────────── */

/** The date as a ticket stub shows it: "SUN", "11", "OCT". On the reader's own clock unless a zone is given. */
export function ticketDate(at: string | Date, timeZone?: string): { weekday: string; day: string; month: string } | null {
  const date = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(date.getTime())) return null;
  const zone = timeZone ? { timeZone } : {};
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...options, ...zone }).format(date);
  return { weekday: part({ weekday: "short" }).toUpperCase(), day: part({ day: "numeric" }), month: part({ month: "short" }).toUpperCase() };
}

/** "9:00 AM": the clock time alone, with a plain space before AM/PM. */
export function clockTime(at: string | Date, timeZone?: string): string {
  const date = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(date).replace(/\s+/g, " ");
}

/**
 * When the way in opens, said shortly for the Join button: "today at 7:00 AM",
 * "tomorrow at 7:00 AM", "Sun at 7:00 AM" within the week, "Sun, Oct 18 at
 * 7:00 AM" beyond it.
 */
export function joinOpensWords(opensAt: Date | null | undefined, now: Date, timeZone?: string): string {
  if (!opensAt || Number.isNaN(opensAt.getTime())) return "";
  const zone = timeZone ? { timeZone } : {};
  // The calendar day each falls on, on the reader's clock.
  const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", ...zone }).format(d);
  const daysApart = Math.round((Date.parse(`${dayOf(opensAt)}T00:00:00Z`) - Date.parse(`${dayOf(now)}T00:00:00Z`)) / 86_400_000);
  const time = clockTime(opensAt, timeZone);
  if (daysApart === 0) return `today at ${time}`;
  if (daysApart === 1) return `tomorrow at ${time}`;
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", ...zone }).format(opensAt);
  if (daysApart > 1 && daysApart < 7) return `${weekday} at ${time}`;
  const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...zone }).format(opensAt);
  return `${weekday}, ${monthDay} at ${time}`;
}
