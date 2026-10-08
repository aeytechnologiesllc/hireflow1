/**
 * interviewAnswer.ts: reading an applicant's answer about an interview, and
 * wording it for the hiring team (candidate-interview-response).
 *
 * Why it exists: the function used to tell the team "picked a time: Thursday,
 * October 8, 1:00 PM" on the server's clock (UTC) with no zone named. The
 * owner had offered 9:00 AM on his own. And whatever a browser sent as
 * "proposedTimes" was stored as it came.
 *
 * Pure and import-free: the function imports it, and
 * scripts/interview_answer.test.mjs runs it under Node.
 */

/** A time zone the runtime knows ("Asia/Manila"), or null. */
export function knownZone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const zone = value.trim();
  if (!zone || zone.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

/** The clock an offered time was picked on, when the wizard recorded it (employer_windows[].zone). */
export function teamZoneOf(windows: unknown): string | null {
  if (!Array.isArray(windows)) return null;
  for (const entry of windows) {
    const zone = knownZone((entry as { zone?: unknown } | null)?.zone);
    if (zone) return zone;
  }
  return null;
}

/**
 * Whose clock a time is written on for the team: their own when it is on
 * file, otherwise the applicant's (said so), otherwise UTC (said so). Never a
 * bare time.
 */
export function clockForTeam(windows: unknown, applicantZone: unknown): { zone: string; whose: "team" | "applicant" | "utc" } {
  const team = teamZoneOf(windows);
  if (team) return { zone: team, whose: "team" };
  const theirs = knownZone(applicantZone);
  if (theirs) return { zone: theirs, whose: "applicant" };
  return { zone: "UTC", whose: "utc" };
}

/** "Thursday, October 8 at 9:00 AM EDT", with "(their clock)" when it is the applicant's. */
export function sayTimeForTeam(iso: string, clock: { zone: string; whose: "team" | "applicant" | "utc" }): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: clock.zone }).format(at);
  const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: clock.zone }).formatToParts(at);
  const piece = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const time = `${piece("hour")}:${piece("minute")} ${piece("dayPeriod")}`.trim();
  const name = clock.whose === "utc" ? "UTC" : piece("timeZoneName");
  return `${day} at ${time}${name ? ` ${name}` : ""}${clock.whose === "applicant" ? " (their clock)" : ""}`;
}

/** The most times an applicant may suggest at once, and the longest note kept. */
export const MAX_SUGGESTED_TIMES = 6;
export const MAX_NOTE_LENGTH = 500;

/**
 * The times an applicant suggested, as they may be stored: real moments, still
 * ahead, no repeats, at most MAX_SUGGESTED_TIMES, soonest first. Anything else
 * a browser sends is dropped.
 */
export function cleanSuggestedTimes(raw: unknown, now: number): { datetime: string }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  for (const entry of raw) {
    const value = (entry as { datetime?: unknown } | null)?.datetime;
    if (typeof value !== "string" || value.length > 40) continue;
    const at = new Date(value).getTime();
    if (Number.isNaN(at) || at <= now) continue;
    seen.add(at);
  }
  return [...seen]
    .sort((a, b) => a - b)
    .slice(0, MAX_SUGGESTED_TIMES)
    .map((at) => ({ datetime: new Date(at).toISOString() }));
}

/** The applicant's note: plain text, trimmed, bounded. Empty is null. */
export function cleanNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    // Control characters become a space (a line break included).
    out += code < 32 || code === 127 ? " " : ch;
  }
  const text = out.replace(/ {2,}/g, " ").trim().slice(0, MAX_NOTE_LENGTH).trim();
  return text || null;
}

/* ── "I can't make it": their availability, in their own words ──────────── */

/** The shortest availability kept ("Any day" is an answer). */
export const MIN_AVAILABILITY_LENGTH = 3;

/**
 * What an applicant wrote when they cannot make the time: which days they
 * are free, and from when to when. Plain text on one line (a line break
 * becomes "; "), trimmed and bounded like a note. Null when there is nothing
 * to keep.
 *
 * The owner, 2026-10-07: "if they cannot make it on that time, don't let them
 * just select times. Let them write a message ... because I don't want them
 * to pick two times and then I can't do those two times. Then we have to do
 * too much back and forth." So the applicant no longer suggests times: they
 * say when they are free and the team sets the time.
 */
export function cleanAvailability(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const oneLine = raw.trim().replace(/\s*[\r\n]+\s*/g, "; ");
  const text = cleanNote(oneLine) ?? "";
  return text.length >= MIN_AVAILABILITY_LENGTH ? text : null;
}

/**
 * What is kept beside an availability message. No times: only the mark that
 * no time had been agreed when they wrote it, so the team's side never reads
 * the row's placeholder time as an appointment (noTimeAgreedYet).
 */
export function availabilityToStore(fromOffer: boolean): { fromOffer: true }[] | null {
  return fromOffer ? [{ fromOffer: true as const }] : null;
}

/** A long message cut for a bell: whole words, with "…" when something was left out. */
export function shortened(text: string, max = 160): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

/**
 * Had the two sides agreed a time before this answer? Not while the applicant
 * was still choosing among offered times, and not while a suggestion made
 * from that state is still unanswered (the `fromOffer` mark on it).
 */
export function noTimeAgreedYet(candidateResponse: unknown, proposedTimes: unknown): boolean {
  if (candidateResponse === "awaiting_pick") return true;
  if (candidateResponse !== "reschedule_requested") return false;
  return Array.isArray(proposedTimes) && proposedTimes.some((t) => (t as { fromOffer?: unknown } | null)?.fromOffer === true);
}

/** The suggestion as stored: each time marked when no time had been agreed, so the team's answer can tell. */
export function suggestionToStore(times: readonly { datetime: string }[], fromOffer: boolean): { datetime: string; fromOffer?: true }[] {
  return times.map((t) => (fromOffer ? { datetime: t.datetime, fromOffer: true as const } : { datetime: t.datetime }));
}

/** What the team's bell says about an answer. */
export function teamNoticeFor(
  kind: "confirmed" | "picked" | "moved" | "suggested" | "countered" | "availability",
  who: { name: string; jobTitle: string },
  detail: { when?: string; count?: number; availability?: string; clockGap?: string } = {},
): { title: string; message: string } {
  const { name, jobTitle } = who;
  const count = detail.count ?? 0;
  const times = count === 1 ? "one other time" : `${count} other times`;
  if (kind === "confirmed") return { title: "Interview confirmed", message: `${name} confirmed their interview for ${jobTitle}${detail.when ? `: ${detail.when}` : ""}.` };
  if (kind === "picked") return { title: "Interview time picked", message: `${name} picked a time for their interview for ${jobTitle}: ${detail.when}.` };
  if (kind === "moved") return { title: "Interview moved", message: `${name} moved their interview for ${jobTitle} to ${detail.when}.` };
  if (kind === "availability") {
    // They cannot make the time and wrote when they are free. The team sets the new time.
    const theirs = detail.availability ? ` They are free: "${shortened(detail.availability)}"${detail.clockGap ? ` (their clock, ${detail.clockGap})` : ""}.` : "";
    return {
      title: "Can't make the interview time",
      message: `${name} can't make ${detail.when ? detail.when : "the interview time"} for ${jobTitle}.${theirs} Open Interviews to set a new time.`,
    };
  }
  if (kind === "countered") return { title: "Other interview times suggested", message: `${name} can't make the times you offered for ${jobTitle} and suggested ${times}. Open Interviews to answer.` };
  return { title: "Another interview time asked for", message: `${name} asked to move their interview for ${jobTitle} and suggested ${times}. Open Interviews to answer.` };
}

/* ── When a time becomes agreed: the two emails ─────────────────────────── */

/** "30 minutes", "1 hour", "1 hour 30 minutes"; nothing when the length is not known. */
export function lengthWords(minutes: unknown): string {
  const n = typeof minutes === "number" && Number.isFinite(minutes) ? Math.round(minutes) : 0;
  if (n <= 0 || n > 24 * 60) return "";
  const hours = Math.floor(n / 60);
  const rest = n % 60;
  return [hours ? `${hours} hour${hours === 1 ? "" : "s"}` : "", rest ? `${rest} minutes` : ""].filter(Boolean).join(" ");
}

/**
 * How the applicant joins, in one line for their confirmation email. The
 * link itself is never put in the email (the owner chose that on
 * 2026-10-07): one meeting link serves every interview. The Join button on
 * the application page opens two hours before the start for a link of the
 * team's own, fifteen minutes before for the built-in room. The same two
 * numbers as the page: JOIN_OPENS_MINUTES_LINK and JOIN_OPENS_MINUTES_ROOM
 * in src/lib/candidateInterview.ts (scripts/interview_answer.test.mjs fails
 * if they drift apart).
 */
export const EMAIL_JOIN_OPENS_MINUTES_LINK = 120;
export const EMAIL_JOIN_OPENS_MINUTES_ROOM = 15;
export function joinNoteFor(interview: { meeting_provider?: unknown; meeting_link?: unknown; interview_type?: unknown }): string {
  const type = typeof interview.interview_type === "string" ? interview.interview_type : "video";
  if (type === "phone") return "This is a phone call. The hiring team will be in touch with the details.";
  if (type === "in_person" || type === "in-person" || type === "onsite") return "This is in person. The hiring team will be in touch with the details.";
  const hasRoom = interview.meeting_provider === "daily";
  const hasLink = typeof interview.meeting_link === "string" && interview.meeting_link.trim().length > 0;
  if (hasRoom) return `This is a video call. The Join button is on your application page and opens ${EMAIL_JOIN_OPENS_MINUTES_ROOM} minutes before the start.`;
  if (hasLink) return `This is a video call. The Join button is on your application page and opens ${EMAIL_JOIN_OPENS_MINUTES_LINK / 60} hours before the start.`;
  return "This is a video call. The hiring team will send you how to join.";
}

/**
 * What kind of interview it is, inside a sentence: "video call", "phone
 * call", "meeting in person". The same words as the applicant's page
 * (interviewKindPhrase in src/lib/candidateInterview.ts;
 * scripts/interview_answer.test.mjs fails if they drift apart).
 */
export function interviewKindPhrase(type: unknown): string {
  if (type === "phone") return "phone call";
  if (type === "in_person" || type === "in-person" || type === "onsite") return "meeting in person";
  return "video call";
}

/** How a time became agreed, from the applicant's side. */
export type AgreedChange = "picked" | "moved" | "confirmed";

/** One request to send-notification-email. */
export interface AgreedEmail {
  type: "interview_confirmed" | "interview_time_picked";
  recipient_user_id: string;
  data: Record<string, string>;
}

/**
 * The two emails for a time that has just become agreed: the applicant's
 * confirmation (their own clock, how to join) and the hiring team's notice
 * (the team's clock). Either is left out when there is nobody to send it to.
 * Until 2026-10-07 neither existed: the applicant saw it only in the app and
 * the team got only a bell.
 */
export function agreedTimeEmails(input: {
  change: AgreedChange;
  candidateId: string | null | undefined;
  employerId: string | null | undefined;
  candidateName: string;
  jobTitle: string;
  companyName: string | null | undefined;
  applicationId: string | null | undefined;
  /** The time on the applicant's own clock, zone named (interviewTimes.applicantEmailTime). */
  applicantTime: { date: string; time: string };
  /** The time on the team's clock (sayTimeForTeam). */
  teamWhen: string;
  minutes: unknown;
  interview: { meeting_provider?: unknown; meeting_link?: unknown; interview_type?: unknown };
}): AgreedEmail[] {
  const out: AgreedEmail[] = [];
  const length = lengthWords(input.minutes);
  const company = (input.companyName ?? "").trim();
  if (input.candidateId && input.applicantTime.date && input.applicantTime.time) {
    out.push({
      type: "interview_confirmed",
      recipient_user_id: input.candidateId,
      data: {
        job_title: input.jobTitle,
        interview_date: input.applicantTime.date,
        interview_time: input.applicantTime.time,
        join_note: joinNoteFor(input.interview),
        // What it is, so the email can say what to expect.
        interview_kind: interviewKindPhrase(input.interview.interview_type),
        ...(length ? { interview_length: length } : {}),
        ...(company ? { company_name: company } : {}),
        ...(input.applicationId ? { application_id: input.applicationId } : {}),
      },
    });
  }
  if (input.employerId && input.teamWhen) {
    out.push({
      type: "interview_time_picked",
      recipient_user_id: input.employerId,
      data: {
        candidate_name: input.candidateName,
        job_title: input.jobTitle,
        interview_when: input.teamWhen,
        interview_change: input.change,
        ...(length ? { interview_length: length } : {}),
      },
    });
  }
  return out;
}

/* ── One time, one applicant ────────────────────────────────────────────── */

/** A live, booked interview of the same hiring team (another applicant's). */
export interface BookedInterview {
  scheduled_at: string;
  duration_minutes?: number | null;
}

/**
 * Which of the offered times are no longer free: the ones that overlap an
 * interview another applicant of the same team has already booked. First to
 * book gets it. Before 2026-10-07 nothing checked: the owner was about to
 * offer the same few times to nine applicants, and any two of them could
 * have booked the same slot.
 *
 * Two interviews overlap when each starts before the other ends. Returns the
 * `start` strings exactly as offered, so a caller can compare them as given.
 */
export function takenWindowStarts(windows: unknown, booked: readonly BookedInterview[], defaultMinutes = 30): string[] {
  if (!Array.isArray(windows) || booked.length === 0) return [];
  const others = booked
    .map((b) => {
      const start = new Date(b.scheduled_at).getTime();
      const minutes = typeof b.duration_minutes === "number" && b.duration_minutes > 0 ? b.duration_minutes : defaultMinutes;
      return { start, end: start + minutes * 60_000 };
    })
    .filter((b) => !Number.isNaN(b.start));
  const taken: string[] = [];
  for (const entry of windows) {
    const startText = (entry as { start?: unknown } | null)?.start;
    if (typeof startText !== "string") continue;
    const start = new Date(startText).getTime();
    if (Number.isNaN(start)) continue;
    const raw = (entry as { durationMinutes?: unknown }).durationMinutes;
    const minutes = typeof raw === "number" && raw > 0 ? raw : defaultMinutes;
    const end = start + minutes * 60_000;
    if (others.some((other) => start < other.end && other.start < end)) taken.push(startText);
  }
  return taken;
}

/** The span to look for other bookings in: every offered time, with room either side for a long interview. */
export function bookingSearchSpan(windows: unknown, padMinutes = 240): { from: string; to: string } | null {
  if (!Array.isArray(windows)) return null;
  const starts = windows
    .map((entry) => new Date(String((entry as { start?: unknown } | null)?.start ?? "")).getTime())
    .filter((t) => !Number.isNaN(t));
  if (starts.length === 0) return null;
  return {
    from: new Date(Math.min(...starts) - padMinutes * 60_000).toISOString(),
    to: new Date(Math.max(...starts) + padMinutes * 60_000).toISOString(),
  };
}
