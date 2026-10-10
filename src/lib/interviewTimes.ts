/**
 * interviewTimes.ts: an interview's time, written for the person reading it.
 *
 * The hiring team picks times on their own clock and the applicant reads them
 * on theirs. The interview emails used to print the team's clock with no zone
 * at all: an owner on US Eastern offering "8:00 PM" to an applicant in Manila,
 * twelve hours ahead, sent a time that reads as the applicant's evening and is
 * their morning. (Their application page was always right: the browser shows
 * the stored instant on its own clock.)
 *
 * So every time that leaves for an applicant is written on the APPLICANT'S
 * clock and names the zone. We know their zone from the computer and
 * connection check, which records the browser's own
 * (notes.equipmentCheckResult.device.timezone). With none on file the time is
 * written on the team's clock and says so. Never a bare time.
 *
 * Pure (Intl only): the scheduling wizard, the reschedule dialogs, the
 * Interviews page and scripts/interview_times.test.mjs read the same words.
 */

/** An IANA zone this runtime knows ("Asia/Manila"), or null. */
export function knownTimeZone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const zone = value.trim();
  if (zone.length === 0 || zone.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

/** The applicant's own zone, from their application's notes; null when the connection check has not recorded one. */
export function applicantTimeZone(notes: unknown): string | null {
  let parsed: unknown = notes;
  if (typeof notes === "string") {
    try {
      parsed = JSON.parse(notes);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const check = (parsed as Record<string, unknown>).equipmentCheckResult;
  if (!check || typeof check !== "object") return null;
  const device = (check as Record<string, unknown>).device;
  if (!device || typeof device !== "object") return null;
  return knownTimeZone((device as Record<string, unknown>).timezone);
}

/** This browser's own zone, or "UTC" when it will not say. */
export function localTimeZone(): string {
  try {
    return knownTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? "UTC";
  } catch {
    return "UTC";
  }
}

function parts(at: Date, zone: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", { timeZone: zone, ...options }).formatToParts(at)) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  return out;
}

/** Minutes east of UTC that `zone` is at `at` (Manila: 480; New York in summer: -240). */
export function zoneOffsetMinutes(at: Date, zone: string): number {
  const p = parts(at, zone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((wall - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** "Manila" from "Asia/Manila"; "New York" from "America/New_York". */
export function zonePlace(zone: string): string {
  const last = zone.split("/").pop() ?? zone;
  return last.replace(/_/g, " ");
}

/** The zone's own name at `at` ("Philippine Standard Time"); a place and an offset when the runtime has no name for it. */
export function zoneName(at: Date, zone: string): string {
  const name = parts(at, zone, { timeZoneName: "long" }).timeZoneName ?? "";
  if (name && !/^(GMT|UTC)[+-]/.test(name)) return name;
  const offset = zoneOffsetMinutes(at, zone);
  const sign = offset < 0 ? "-" : "+";
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  return `${zonePlace(zone)} time (UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""})`;
}

export interface WrittenTime {
  /** "Friday, October 9, 2026" */
  date: string;
  /** "Friday, October 9" */
  day: string;
  /** "Fri" */
  weekdayShort: string;
  /** "8:00 AM" */
  clock: string;
  /** "Philippine Standard Time" */
  zoneName: string;
}

/** `at` on the clock of `zone`, in words. */
export function writeTime(at: Date, zone: string): WrittenTime {
  const p = parts(at, zone, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const weekdayShort = parts(at, zone, { weekday: "short" }).weekday ?? "";
  return {
    date: `${p.weekday}, ${p.month} ${p.day}, ${p.year}`,
    day: `${p.weekday}, ${p.month} ${p.day}`,
    weekdayShort,
    // Built from the parts: newer runtimes put a narrow no-break space before AM/PM.
    clock: `${p.hour}:${p.minute} ${p.dayPeriod}`,
    zoneName: zoneName(at, zone),
  };
}

export interface ApplicantEmailTime {
  /** "Friday, October 9, 2026" */
  date: string;
  /** "8:00 AM Philippine Standard Time": always with the zone. */
  time: string;
  /** "Friday, October 9 · 8:00 AM Philippine Standard Time" */
  line: string;
  /** "Friday, October 9, 2026 at 8:00 AM Philippine Standard Time" */
  dateAndTime: string;
  /** False when the applicant's zone is not on file and the team's clock was used. */
  onApplicantClock: boolean;
}

/**
 * What an email to the applicant says for `at`: their own clock when their
 * zone is on file, else the team's, and the zone's name either way.
 */
export function applicantEmailTime(at: Date, applicantZone: string | null, teamZone: string): ApplicantEmailTime {
  const theirs = knownTimeZone(applicantZone);
  const zone = theirs ?? knownTimeZone(teamZone) ?? "UTC";
  const w = writeTime(at, zone);
  const time = `${w.clock} ${w.zoneName}`;
  return {
    date: w.date,
    time,
    line: `${w.day} · ${time}`,
    dateAndTime: `${w.date} at ${time}`,
    onApplicantClock: theirs != null,
  };
}

/** The short form the scheduling screens show beside the team's own time: "Fri 8:00 AM". */
export function shortTimeIn(at: Date, zone: string): string {
  const w = writeTime(at, zone);
  return `${w.weekdayShort} ${w.clock}`;
}

/** "12 hours ahead of you", "3 hours 30 minutes behind you", "on the same clock as you". */
export function clockGapWords(at: Date, applicantZone: string, teamZone: string): string {
  const gap = zoneOffsetMinutes(at, applicantZone) - zoneOffsetMinutes(at, teamZone);
  if (gap === 0) return "on the same clock as you";
  const hours = Math.floor(Math.abs(gap) / 60);
  const minutes = Math.abs(gap) % 60;
  const amount = [
    hours ? `${hours} hour${hours === 1 ? "" : "s"}` : "",
    minutes ? `${minutes} minutes` : "",
  ].filter(Boolean).join(" ");
  return `${amount} ${gap > 0 ? "ahead of" : "behind"} you`;
}

/**
 * What the owner is told about the invitation email after setting up an
 * interview. "Sent" only when the mail service took it: until 2026-10-07 a
 * failed lookup sent nothing and the screen still read as if all was well.
 */
export function inviteEmailWords(
  status: "sent" | "skipped" | "failed" | null | undefined,
  who: { email?: string | null; firstName: string; exactTime: boolean },
): string {
  const name = who.firstName || "them";
  if (status === "sent") {
    const to = who.email || name;
    return who.exactTime ? `Email sent to ${to} with the date and time` : `Email sent to ${to} with the time to book`;
  }
  if (status === "skipped") {
    return `No email went out: ${name} has these emails turned off. They will see it when they open their application. Message them so they know to look.`;
  }
  return `The invitation email could not be sent. ${name === "them" ? "They" : name} will see it when they open their application. Message them so they know to look.`;
}

/**
 * An interview time can never be one that has already passed (the owner,
 * 2026-10-09). The screens check before saving and say this; the database
 * refuses it too (interviews_refuse_past_time), for a screen left open
 * overnight or a suggested time accepted days later.
 */
export const PASSED_TIME_WORDS = "That time has already passed. Choose a later one.";

/** Whether `at` can still be set as an interview time. */
export function timeStillAhead(at: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!at) return false;
  const ms = (at instanceof Date ? at : new Date(at)).getTime();
  return !Number.isNaN(ms) && ms > now.getTime();
}

/** The database's refusal of a passed time (interviews_refuse_past_time), from any Supabase error. */
export function isPassedTimeError(error: unknown): boolean {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error ?? "");
  return message.includes("interview_time_passed");
}
