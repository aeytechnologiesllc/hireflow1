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
}

/**
 * Where the applicant stands:
 *  - "pick": the team offered times and none is chosen yet;
 *  - "confirm": the team set one time and asks them to confirm it;
 *  - "waiting": they asked for other times and the team has not answered;
 *  - "confirmed": a time is agreed.
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
  // A time that has passed is no longer something to confirm or to join.
  const at = interview.scheduled_at ? new Date(interview.scheduled_at).getTime() : NaN;
  if (!(at > now.getTime())) return null;
  return response === "confirmed" ? "confirmed" : "confirm";
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
  /** The short chip on the applications list. */
  chip: string;
  title: string;
  body: string;
  /** The button that opens it. */
  action: string;
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
    const open = openWindows(offeredWindows(interview.employer_windows), options.now).length;
    if (open === 0) {
      return {
        stage,
        theirMove: true,
        chip: "Reply needed",
        title: "You're invited to an interview",
        body: `The times ${team === "The hiring team" ? "the hiring team" : team} offered have passed. Tell them what works for you.`,
        action: "Suggest times",
      };
    }
    return {
      stage,
      theirMove: true,
      chip: "Pick your time",
      title: "You're invited to an interview",
      body: `${team} offered ${open === 1 ? "one time" : `${open} times`}. ${open === 1 ? "Take it, or suggest another." : "Pick the one that works for you."}`,
      action: "Pick your time",
    };
  }
  if (stage === "confirm") {
    return {
      stage,
      theirMove: true,
      chip: "Confirm interview",
      title: "You're invited to an interview",
      body: `${team} set it for ${when}. Confirm it, or ask for another time.`,
      action: "Confirm or change",
    };
  }
  if (stage === "waiting") {
    return {
      stage,
      theirMove: false,
      chip: "Awaiting reply",
      title: "You asked for another interview time",
      body: `${team === "The hiring team" ? "The hiring team has" : `${team} has`} your times and will reply. Nothing to do for now.`,
      action: "View",
    };
  }
  return {
    stage,
    theirMove: false,
    chip: "Interview confirmed",
    title: "Your interview is confirmed",
    body: `${when}. Open it for how to join and to add it to your calendar.`,
    action: "View details",
  };
}
