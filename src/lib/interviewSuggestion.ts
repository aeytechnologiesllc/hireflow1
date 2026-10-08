/**
 * interviewSuggestion.ts: which interview times suit both sides, for the
 * set-up screen (docs/INTERVIEWS.md, "Setting one up").
 *
 * The owner, 2026-10-07, picking a time for someone twelve hours ahead of
 * him: "can you also make it so I can see the Philippine time as well next
 * to it ... so I can kind of gauge as I'm picking through. And kind of also
 * show me a suggestion always in there, what would be good based on the job.
 * So like, you know, if they're used to it or not. Because it's got to be
 * good for me too."
 *
 * Two readings come out of it:
 *  - whose clock the applicant is on, when their own is not on file: the
 *    place the job is posted for (its country, or the clock its post writes
 *    the shift on);
 *  - which of the team's times to suggest: the ones inside the job's own
 *    shift when the post states one (that is when they would be working, so
 *    the interview shows whether they are up for it), otherwise the ones
 *    that fall in the applicant's waking hours. The team's own hours are
 *    already the times the screen offers.
 *
 * Pure: no React, no Supabase, no date library.
 */

/** A shift as a job post states it, on the clock it was written for. */
export interface JobShift {
  /** IANA zone the times are on ("Asia/Manila"). */
  zone: string;
  /** Minutes after midnight on that clock. An overnight shift ends before it starts. */
  startMinutes: number;
  endMinutes: number;
}

/** How one start time suits the applicant. */
export type SlotFit = "shift" | "good" | "early" | "late" | "night";

/** The clocks a job post may name, most specific first. */
const CLOCK_WORDS: ReadonlyArray<[RegExp, string]> = [
  [/philippines?\s+(?:standard\s+)?time|\bPHT\b|manila\s+time/i, "Asia/Manila"],
  [/india(?:n)?\s+(?:standard\s+)?time|\bIST\b/i, "Asia/Kolkata"],
  [/singapore\s+time|\bSGT\b/i, "Asia/Singapore"],
  [/(?:US\s+)?eastern(?:\s+time)?|\bE[SD]T\b|\bET\b/i, "America/New_York"],
  [/(?:US\s+)?central(?:\s+time)?|\bC[SD]T\b/i, "America/Chicago"],
  [/(?:US\s+)?mountain(?:\s+time)?|\bM[SD]T\b/i, "America/Denver"],
  [/(?:US\s+)?pacific(?:\s+time)?|\bP[SD]T\b/i, "America/Los_Angeles"],
  [/UK\s+time|london\s+time|\bGMT\b|\bBST\b/i, "Europe/London"],
];

/** Countries that keep one clock, by ISO code: where a job is posted for says whose clock its applicants are on. */
const COUNTRY_CLOCK: Readonly<Record<string, string>> = {
  PH: "Asia/Manila",
  SG: "Asia/Singapore",
  MY: "Asia/Kuala_Lumpur",
  TH: "Asia/Bangkok",
  VN: "Asia/Ho_Chi_Minh",
  IN: "Asia/Kolkata",
  PK: "Asia/Karachi",
  BD: "Asia/Dhaka",
  LK: "Asia/Colombo",
  NP: "Asia/Kathmandu",
  JP: "Asia/Tokyo",
  KR: "Asia/Seoul",
  AE: "Asia/Dubai",
  EG: "Africa/Cairo",
  KE: "Africa/Nairobi",
  NG: "Africa/Lagos",
  GH: "Africa/Accra",
  ZA: "Africa/Johannesburg",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  CO: "America/Bogota",
  PE: "America/Lima",
  JM: "America/Jamaica",
  DO: "America/Santo_Domingo",
};

const CLOCK_TIME = String.raw`(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?`;
const SHIFT = new RegExp(`${CLOCK_TIME}\\s*(?:to|until|till|-|\\u2013|\\u2014)\\s*${CLOCK_TIME}\\s*\\(?\\s*([A-Za-z][A-Za-z ]{1,28})`, "gi");

function clockMinutes(hour: string, minute: string | undefined, half: string): number | null {
  const h = Number(hour);
  const m = minute ? Number(minute) : 0;
  if (!(h >= 1 && h <= 12) || !(m >= 0 && m < 60)) return null;
  return ((h % 12) + (half.toLowerCase() === "p" ? 12 : 0)) * 60 + m;
}

function clockNamed(words: string): string | null {
  for (const [pattern, zone] of CLOCK_WORDS) {
    // Only at the start: "3:00 PM to 11:00 PM US Eastern", not a word further on.
    const found = pattern.exec(words);
    if (found && found.index <= 1) return zone;
  }
  return null;
}

/**
 * The shift a job post states ("3:00 AM to 11:00 AM Philippine time"), on
 * the clock it names. The first one in the text: a post leads with its
 * applicants' own clock and may repeat it on others in brackets. Null when
 * the post states none.
 */
export function shiftFromJobText(text: unknown): JobShift | null {
  if (typeof text !== "string" || !text) return null;
  SHIFT.lastIndex = 0;
  for (let found = SHIFT.exec(text); found; found = SHIFT.exec(text)) {
    const start = clockMinutes(found[1], found[2], found[3]);
    const end = clockMinutes(found[4], found[5], found[6]);
    const zone = clockNamed(found[7].trim());
    if (start == null || end == null || !zone || start === end) continue;
    return { zone, startMinutes: start, endMinutes: end };
  }
  return null;
}

/**
 * Whose clock a job's applicants are on, from the job itself: its country
 * when it has one clock, else the clock its post writes the shift on. Used
 * only when the applicant's own clock is not on file. Null when the job
 * does not say.
 */
export function zoneFromJob(job: { countryCode?: unknown; text?: unknown } | null | undefined): string | null {
  const code = typeof job?.countryCode === "string" ? job.countryCode.trim().toUpperCase() : "";
  if (code && COUNTRY_CLOCK[code]) return COUNTRY_CLOCK[code];
  return shiftFromJobText(job?.text)?.zone ?? null;
}

/** Minutes after midnight that `at` is on the clock of `zone`; NaN for a zone the runtime does not know. */
export function minutesOfDayIn(at: Date, zone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const minute = Number(parts.find((p) => p.type === "minute")?.value);
    return hour * 60 + minute;
  } catch {
    return NaN;
  }
}

/** Does an interview of `minutes` starting at `at` sit wholly inside the shift? */
export function insideShift(at: Date, minutes: number, shift: JobShift): boolean {
  const start = minutesOfDayIn(at, shift.zone);
  if (Number.isNaN(start)) return false;
  const length = minutes > 0 ? minutes : 0;
  // Measured from the shift's start, so a shift that runs past midnight works too.
  const day = 24 * 60;
  const shiftLength = (((shift.endMinutes - shift.startMinutes) % day) + day) % day;
  const into = (((start - shift.startMinutes) % day) + day) % day;
  return into + length <= shiftLength;
}

/**
 * How a start time suits the applicant: inside the job's shift, or by their
 * own clock: "good" from 7:00 AM up to a 9:30 PM start, "early" the hour
 * before, "late" until midnight, "night" from midnight to 6:00 AM.
 */
export function slotFit(at: Date, minutes: number, theirZone: string, shift: JobShift | null): SlotFit {
  if (shift && insideShift(at, minutes, shift)) return "shift";
  const theirs = minutesOfDayIn(at, theirZone);
  if (Number.isNaN(theirs)) return "good";
  if (theirs < 6 * 60) return "night";
  if (theirs < 7 * 60) return "early";
  if (theirs <= 21 * 60 + 30) return "good";
  return "late";
}

/** "HH:mm" on `day`, as a moment on this machine's clock. */
function atClock(day: Date, clock: string): Date {
  const [hours, minutes] = clock.split(":").map(Number);
  const at = new Date(day);
  at.setHours(hours, minutes, 0, 0);
  return at;
}

export interface TimeSuggestion {
  /**
   * "shift": times inside the job's shift. "waking": times in the
   * applicant's waking hours. "none": no time of this day suits them.
   */
  kind: "shift" | "waking" | "none";
  /** Runs of suggested start times, each from its first to its last ("HH:mm", the team's clock). */
  spans: { from: string; to: string }[];
  /** Every suggested start time. */
  slots: string[];
}

/**
 * What to suggest among `slots` (the start times still on offer for `day`,
 * in order, on the team's clock). The job's shift wins when any time falls
 * inside it; otherwise the applicant's waking hours.
 */
export function suggestTimes(day: Date, slots: readonly string[], minutes: number, theirZone: string | null, shift: JobShift | null): TimeSuggestion {
  if (!theirZone || slots.length === 0) return { kind: "none", spans: [], slots: [] };
  const fits = slots.map((slot) => slotFit(atClock(day, slot), minutes, theirZone, shift));
  const want: SlotFit = fits.includes("shift") ? "shift" : "good";
  const chosen = slots.filter((_, index) => fits[index] === want);
  if (chosen.length === 0) return { kind: "none", spans: [], slots: [] };
  const spans: { from: string; to: string }[] = [];
  slots.forEach((slot, index) => {
    if (fits[index] !== want) return;
    const last = spans[spans.length - 1];
    // The same run when the time before it on the list was suggested too.
    if (last && index > 0 && fits[index - 1] === want) last.to = slot;
    else spans.push({ from: slot, to: slot });
  });
  return { kind: want === "shift" ? "shift" : "waking", spans, slots: chosen };
}

/** "13:30" as people say it: "1:30 PM". */
export function sayClock(clock: string): string {
  const [h, m] = clock.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** The clock time alone on the clock of `zone`: "3:00 AM". */
function clockIn(at: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(at);
  const piece = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${piece("hour")}:${piece("minute")} ${piece("dayPeriod")}`;
}

/**
 * The suggestion in words, for the team: the headline ("3:00 PM to 8:00
 * PM") and why ("That is 3:00 AM to 8:00 AM for Ana, inside this job's
 * shift ..."). Empty strings when there is nothing to say.
 */
export function suggestionWords(
  suggestion: TimeSuggestion,
  day: Date,
  theirZone: string | null,
  firstName: string,
): { headline: string; why: string } {
  const name = firstName || "them";
  if (!theirZone) return { headline: "", why: "" };
  if (suggestion.kind === "none") {
    return { headline: "", why: `No time left on this day falls in ${name === "them" ? "their" : `${name}'s`} waking hours. Their own time is beside each of yours.` };
  }
  const mine = (span: { from: string; to: string }) => (span.from === span.to ? sayClock(span.from) : `${sayClock(span.from)} to ${sayClock(span.to)}`);
  const theirs = (span: { from: string; to: string }) =>
    span.from === span.to ? clockIn(atClock(day, span.from), theirZone) : `${clockIn(atClock(day, span.from), theirZone)} to ${clockIn(atClock(day, span.to), theirZone)}`;
  const headline = suggestion.spans.map(mine).join(" or ");
  const forThem = suggestion.spans.map(theirs).join(" or ");
  if (suggestion.kind === "shift") {
    return {
      headline,
      why: `That is ${forThem} for ${name}, inside this job's shift: you see them at the hours they would work.`,
    };
  }
  return { headline, why: `That is ${forThem} for ${name}: waking hours for you both.` };
}
