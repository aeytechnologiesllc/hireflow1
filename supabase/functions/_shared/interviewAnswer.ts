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
  kind: "confirmed" | "picked" | "moved" | "suggested" | "countered",
  who: { name: string; jobTitle: string },
  detail: { when?: string; count?: number } = {},
): { title: string; message: string } {
  const { name, jobTitle } = who;
  const count = detail.count ?? 0;
  const times = count === 1 ? "one other time" : `${count} other times`;
  if (kind === "confirmed") return { title: "Interview confirmed", message: `${name} confirmed their interview for ${jobTitle}${detail.when ? `: ${detail.when}` : ""}.` };
  if (kind === "picked") return { title: "Interview time picked", message: `${name} picked a time for their interview for ${jobTitle}: ${detail.when}.` };
  if (kind === "moved") return { title: "Interview moved", message: `${name} moved their interview for ${jobTitle} to ${detail.when}.` };
  if (kind === "countered") return { title: "Other interview times suggested", message: `${name} can't make the times you offered for ${jobTitle} and suggested ${times}. Open Interviews to answer.` };
  return { title: "Another interview time asked for", message: `${name} asked to move their interview for ${jobTitle} and suggested ${times}. Open Interviews to answer.` };
}
