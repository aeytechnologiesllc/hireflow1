/**
 * Interview calendar invites — a standard `.ics` (RFC 5545 iCalendar) file,
 * generated in the browser and downloaded. No Google/Microsoft OAuth, no
 * consent screen, no token — it works with Google Calendar, Apple Calendar
 * and Outlook alike because they all just import the file.
 *
 * Pure functions only (no DOM, no network) except `downloadIcsFile`, a thin
 * Blob-download wrapper kept here so callers don't each hand-roll one.
 *
 * RFC 5545 details that are easy to get wrong and break real calendar
 * clients, all handled here:
 *  - CRLF line endings (not bare "\n").
 *  - Line "folding" at 75 octets, splitting on UTF-8 byte boundaries.
 *  - Escaping backslash/comma/semicolon/newline inside TEXT values (§3.3.11).
 *  - DTSTART/DTEND/DTSTAMP as UTC ("...Z" form).
 *  - A UID that is stable per interview, so re-downloading after a
 *    reschedule updates the existing calendar entry instead of duplicating
 *    it — paired with a SEQUENCE that increases whenever the interview's
 *    own `updated_at` moves forward.
 */

const PRODID = "-//HireFlow//Interview Scheduling//EN";
const CRLF = "\r\n";
/** RFC 5545 §3.1 — content lines SHOULD NOT exceed this many octets. */
const FOLD_LIMIT_OCTETS = 75;

/** The address every HireFlow-generated invite is organized under. Deliberately
 *  not the employer's personal email — keeps that private and matches the
 *  sender identity already used for HireFlow's notification emails. */
export const HIREFLOW_ORGANIZER_EMAIL = "notifications@hireflownow.com";

// ---------------------------------------------------------------- primitives

/** Escape an iCalendar TEXT value per RFC 5545 §3.3.11. Order matters: the
 *  backslash escape must run first, or it would double-escape the ones just
 *  inserted for comma/semicolon/newline. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** A parameter value wrapped in DQUOTE (e.g. `CN="..."`) may not itself
 *  contain a double quote or a control character — there is no escape for
 *  those inside a quoted-string param, so strip rather than corrupt the file. */
function sanitizeParamValue(value: string): string {
  return value.replace(/["\r\n\t]/g, "").trim();
}

/** Format a Date as a UTC iCalendar DATE-TIME: `YYYYMMDDTHHMMSSZ`. */
export function toIcsUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Fold one logical content line to the 75-octet limit (RFC 5545 §3.1): split
 * on UTF-8 byte boundaries (never inside a multi-byte character), CRLF plus a
 * single leading space before each continuation.
 */
export function foldIcsLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= FOLD_LIMIT_OCTETS) return line;

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let start = 0;
  let first = true;
  while (start < bytes.length) {
    // Continuation lines carry a leading space that itself counts toward the
    // 75-octet budget of that physical line, so they get one fewer octet of
    // real content than the first line does.
    const budget = first ? FOLD_LIMIT_OCTETS : FOLD_LIMIT_OCTETS - 1;
    let end = Math.min(start + budget, bytes.length);
    while (end > start && (bytes[end] & 0xc0) === 0x80) end--; // don't cut a UTF-8 continuation byte
    if (end === start) end = Math.min(start + budget, bytes.length); // pathological fallback, never hit in practice
    chunks.push(decoder.decode(bytes.slice(start, end)));
    start = end;
    first = false;
  }
  return chunks.map((chunk, i) => (i === 0 ? chunk : ` ${chunk}`)).join(CRLF);
}

function contentLine(name: string, value: string): string {
  return foldIcsLine(`${name}:${value}`);
}

// ------------------------------------------------------------------ VEVENT

export interface IcsEventInput {
  /** Stable per real-world event (e.g. `interview-<id>@hireflownow.com`).
   *  Re-downloading with the same UID and a higher `sequence` updates the
   *  calendar's existing entry instead of adding a second one. */
  uid: string;
  /** Revision number — bump whenever the event's own details (time, place)
   *  change. Non-negative integer. */
  sequence: number;
  /** When this particular file was generated. Defaults to now; overridable
   *  for deterministic tests. */
  generatedAt?: Date;
  summary: string;
  description: string;
  location: string;
  start: Date;
  durationMinutes: number;
  organizerName: string;
  organizerEmail: string;
}

/** Build one `VCALENDAR` containing one `VEVENT`. */
export function buildIcsEvent(input: IcsEventInput): string {
  const generatedAt = input.generatedAt ?? new Date();
  const end = new Date(input.start.getTime() + Math.max(1, input.durationMinutes) * 60_000);
  const sequence = Math.max(0, Math.floor(input.sequence));
  const organizerLine = foldIcsLine(
    `ORGANIZER;CN="${sanitizeParamValue(input.organizerName)}":mailto:${input.organizerEmail}`
  );

  // No METHOD:REQUEST here — that method implies attendees are being asked
  // to RSVP (RFC 5546 iTIP), and this file carries no ATTENDEE property. It
  // is a plain downloadable event, so PUBLISH is the correct semantics.
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    contentLine("PRODID", PRODID),
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    contentLine("UID", input.uid),
    contentLine("SEQUENCE", String(sequence)),
    contentLine("DTSTAMP", toIcsUtc(generatedAt)),
    contentLine("DTSTART", toIcsUtc(input.start)),
    contentLine("DTEND", toIcsUtc(end)),
    contentLine("SUMMARY", escapeIcsText(input.summary)),
    contentLine("DESCRIPTION", escapeIcsText(input.description)),
    contentLine("LOCATION", escapeIcsText(input.location)),
    organizerLine,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join(CRLF) + CRLF;
}

// --------------------------------------------------------- HireFlow composers

export type InterviewKind = "video" | "phone" | "in-person" | "in_person" | string | null | undefined;

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** SEQUENCE derived from the interview row's own `updated_at`, which the
 *  database bumps on every UPDATE (including a reschedule). Epoch seconds is
 *  already a monotonically increasing integer, so no extra column is needed
 *  to satisfy "same UID, higher SEQUENCE" after a reschedule. */
export function sequenceFromUpdatedAt(updatedAt: Date | string): number {
  return Math.max(0, Math.floor(toDate(updatedAt).getTime() / 1000));
}

export function buildInterviewUid(interviewId: string): string {
  return `interview-${interviewId}@hireflownow.com`;
}

/** Where the event points and the one line describing how to get there —
 *  shared between the employer and candidate copy so the two files never
 *  disagree about the meeting mechanics. Never invents an address or a call-in
 *  number that HireFlow was never given. */
function meetingDetails(
  type: InterviewKind,
  joinUrl: string | null | undefined,
  externalMeetingLink: string | null | undefined
): { location: string; note: string } {
  const kind = (type || "").toLowerCase();
  const link = joinUrl || externalMeetingLink || null;

  if (kind === "phone") {
    return { location: "Phone call", note: "This is a phone interview." };
  }
  if (kind === "in-person" || kind === "in_person") {
    return { location: "In person", note: "This is an in-person interview." };
  }
  // Video (including an unset/legacy type, since video is the product default).
  if (link) {
    return { location: link, note: `Video call — join from here: ${link}` };
  }
  return {
    location: "Video call",
    note: "This is a video interview. The join link will be shared closer to the time.",
  };
}

export interface EmployerInterviewInviteInput {
  interviewId: string;
  scheduledAt: string | Date;
  durationMinutes: number | null;
  /** Interview row's `updated_at` — drives SEQUENCE. */
  updatedAt: string | Date;
  interviewType: InterviewKind;
  /** In-app (Daily) room URL, when this is a HireFlow video call. */
  joinUrl?: string | null;
  /** A legacy externally-set meeting link (Zoom/Meet pasted in at scheduling time). */
  externalMeetingLink?: string | null;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  notes?: string | null;
  generatedAt?: Date;
}

/** The employer's own "add to calendar" file for a confirmed interview. */
export function buildEmployerInterviewIcs(input: EmployerInterviewInviteInput): string {
  const { location, note } = meetingDetails(input.interviewType, input.joinUrl, input.externalMeetingLink);
  const description = [
    `Interview with ${input.candidateName} for ${input.jobTitle}.`,
    note,
    ...(input.notes?.trim() ? [`Notes: ${input.notes.trim()}`] : []),
    "Scheduled through HireFlow.",
  ].join("\n\n");

  return buildIcsEvent({
    uid: buildInterviewUid(input.interviewId),
    sequence: sequenceFromUpdatedAt(input.updatedAt),
    generatedAt: input.generatedAt,
    summary: `Interview: ${input.candidateName} — ${input.jobTitle}`,
    description,
    location,
    start: toDate(input.scheduledAt),
    durationMinutes: input.durationMinutes ?? 30,
    organizerName: input.companyName,
    organizerEmail: HIREFLOW_ORGANIZER_EMAIL,
  });
}

export interface CandidateInterviewInviteInput {
  interviewId: string;
  scheduledAt: string | Date;
  durationMinutes: number | null;
  /** Interview row's `updated_at` — drives SEQUENCE. */
  updatedAt: string | Date;
  interviewType: InterviewKind;
  /** In-app (Daily) room URL, when this is a HireFlow video call. */
  joinUrl?: string | null;
  /** A legacy externally-set meeting link (Zoom/Meet pasted in at scheduling time). */
  externalMeetingLink?: string | null;
  jobTitle: string;
  companyName: string;
  generatedAt?: Date;
}

/**
 * The candidate's own "add to calendar" file. Deliberately never mentions
 * AI, Ava, scoring, or automation — candidate-facing copy stays plainly
 * about the interview and the company, same rule as the rest of the
 * candidate journey.
 */
export function buildCandidateInterviewIcs(input: CandidateInterviewInviteInput): string {
  const { location, note } = meetingDetails(input.interviewType, input.joinUrl, input.externalMeetingLink);
  const description = [
    `Your interview for ${input.jobTitle} at ${input.companyName}.`,
    note,
    "Sent by HireFlow on behalf of the hiring team.",
  ].join("\n\n");

  return buildIcsEvent({
    uid: buildInterviewUid(input.interviewId),
    sequence: sequenceFromUpdatedAt(input.updatedAt),
    generatedAt: input.generatedAt,
    summary: `Interview — ${input.companyName}`,
    description,
    location,
    start: toDate(input.scheduledAt),
    durationMinutes: input.durationMinutes ?? 30,
    organizerName: input.companyName,
    organizerEmail: HIREFLOW_ORGANIZER_EMAIL,
  });
}

// -------------------------------------------------------------- browser I/O

/** A short, filesystem-safe stem for the downloaded filename. */
export function icsFileStem(label: string): string {
  const slug = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics left by NFKD
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || "interview";
}

/** Trigger a browser download of an `.ics` file. The only non-pure export in
 *  this module — kept here so every call site shares one implementation. */
export function downloadIcsFile(filenameStem: string, icsContent: string): void {
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filenameStem}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Give the browser a moment to pick up the blob before revoking it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
