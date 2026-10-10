/**
 * interviewReminders.ts: when an interview reminder is due
 * (docs/INTERVIEWS.md, "Reminders"; the sender is
 * supabase/functions/interview-reminders).
 *
 * The owner, 2026-10-09, after his first week of interviews (one no-show,
 * nobody reminded on either side): an email to the applicant the day before
 * and an hour before.
 *
 * Two reminders, each sent once:
 *
 *   - "day": between 24 and 22 hours before the start;
 *   - "hour": between 60 and 10 minutes before the start.
 *
 * The windows are wide on purpose. The sender looks every five minutes; if it
 * misses a look or an hour of looks, the reminder still goes when it next
 * looks, and never after it has stopped being useful (a "tomorrow" email 20
 * hours before, or an "in an hour" email as the call starts).
 *
 * Only for a time both sides have agreed (`candidate_response` "confirmed").
 * An offered time nobody booked, a time the applicant said they cannot make,
 * a cancelled or finished interview: no reminder.
 *
 * And not straight after the booking: someone who booked 50 minutes ahead has
 * just been sent "Your interview is confirmed". A reminder waits until the
 * interview has been left alone for half an hour. A time agreed less than a
 * day ahead (six hours ahead, say) gets no day-before one at all: the
 * database marks it as not needed when the time is agreed
 * (interviews_reminder_bookkeeping), and the hour-before one still goes.
 *
 * The day-before one says "today" or "tomorrow" on the applicant's own clock
 * (dayWord), not the server's.
 *
 * No imports: plain Node loads this file for
 * scripts/interview_reminders.test.mjs.
 */

export type ReminderKind = "day" | "hour";

/** Minutes before the start: later than `from`, no later than `to`. */
export const REMINDER_WINDOWS: Readonly<Record<ReminderKind, { from: number; to: number }>> = {
  day: { from: 22 * 60, to: 24 * 60 },
  hour: { from: 10, to: 60 },
};

/** How long an interview must have been left unchanged before a reminder goes. */
export const REMINDER_QUIET_MINUTES = 30;

/** How far ahead the sender needs to look to find everything that could be due. */
export const REMINDER_LOOKAHEAD_MINUTES = REMINDER_WINDOWS.day.to + 5;

export interface ReminderInterview {
  status?: unknown;
  candidate_response?: unknown;
  scheduled_at?: unknown;
  updated_at?: unknown;
  reminder_day_sent_at?: unknown;
  reminder_hour_sent_at?: unknown;
}

const time = (value: unknown): number | null => {
  if (typeof value !== "string" || !value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/** The reminder this interview is due right now, or null. Never both: the hour one is checked first. */
export function reminderDue(interview: ReminderInterview, now: Date): ReminderKind | null {
  if (interview.status !== "scheduled" || interview.candidate_response !== "confirmed") return null;
  const start = time(interview.scheduled_at);
  if (start === null) return null;
  const changed = time(interview.updated_at);
  if (changed !== null && now.getTime() - changed < REMINDER_QUIET_MINUTES * 60_000) return null;
  const minutesLeft = (start - now.getTime()) / 60_000;
  for (const kind of ["hour", "day"] as const) {
    const window = REMINDER_WINDOWS[kind];
    const sent = kind === "hour" ? interview.reminder_hour_sent_at : interview.reminder_day_sent_at;
    if (minutesLeft > window.from && minutesLeft <= window.to && !sent) return kind;
  }
  return null;
}

/**
 * "today" or "tomorrow", as the applicant would say it: the start's calendar
 * date against today's, both on `zone` (their own clock when it is on file).
 * The day-before reminder goes 22 to 24 hours ahead, so an interview at
 * 11:30 PM is reminded at about 12:30 AM the same day: "today", not
 * "tomorrow". Null for any other day, or a zone that cannot be read.
 */
export function dayWord(start: Date, now: Date, zone: string): "today" | "tomorrow" | null {
  let dateOn: (at: Date) => string;
  try {
    const format = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
    dateOn = (at) => format.format(at);
  } catch {
    return null;
  }
  const startDay = dateOn(start);
  if (startDay === dateOn(now)) return "today";
  // A day later on that clock. Noon-to-noon, so a daylight-saving change in between still lands on the next date.
  const todayNoon = new Date(`${dateOn(now)}T12:00:00Z`);
  const tomorrow = new Date(todayNoon.getTime() + 24 * 60 * 60_000).toISOString().slice(0, 10);
  return startDay === tomorrow ? "tomorrow" : null;
}

/** The column that records a reminder as sent. */
export function reminderColumn(kind: ReminderKind): "reminder_day_sent_at" | "reminder_hour_sent_at" {
  return kind === "hour" ? "reminder_hour_sent_at" : "reminder_day_sent_at";
}

/** One request to send-notification-email. */
export interface ReminderEmail {
  type: "interview_reminder";
  recipient_user_id: string;
  data: Record<string, string>;
}

/** The reminder email for one applicant, on their own clock. Null when there is nobody to send it to or no time to say. */
export function reminderEmail(input: {
  kind: ReminderKind;
  candidateId: string | null | undefined;
  jobTitle: string;
  companyName: string | null | undefined;
  applicationId: string | null | undefined;
  /** The time on the applicant's own clock, zone named (interviewTimes.applicantEmailTime). */
  applicantTime: { date: string; time: string };
  /** "30 minutes", or "" (interviewAnswer.lengthWords). */
  length: string;
  /** How to join (interviewAnswer.joinNoteFor). */
  joinNote: string;
  /** "video call" (interviewAnswer.interviewKindPhrase). */
  interviewKind: string;
  /** For the day-before one: "today" or "tomorrow" on the applicant's clock (dayWord). */
  dayWord?: "today" | "tomorrow" | null;
}): ReminderEmail | null {
  if (!input.candidateId || !input.applicantTime.date || !input.applicantTime.time) return null;
  const company = (input.companyName ?? "").trim();
  return {
    type: "interview_reminder",
    recipient_user_id: input.candidateId,
    data: {
      reminder: input.kind,
      job_title: input.jobTitle,
      interview_date: input.applicantTime.date,
      interview_time: input.applicantTime.time,
      ...(input.kind === "day" && input.dayWord ? { day_word: input.dayWord } : {}),
      ...(input.length ? { interview_length: input.length } : {}),
      ...(input.joinNote ? { join_note: input.joinNote } : {}),
      ...(input.interviewKind ? { interview_kind: input.interviewKind } : {}),
      ...(company ? { company_name: company } : {}),
      ...(input.applicationId ? { application_id: input.applicationId } : {}),
    },
  };
}
