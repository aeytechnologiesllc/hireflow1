/**
 * applicantNotes.ts: the hiring team's own notes on an applicant, and each
 * person's "I have looked at this one" mark
 * (supabase/migrations/*_applicant_notes_and_views.sql).
 *
 * The owner, 2026-10-08, going through 124 applicants: "is there a way you
 * can cleanly allow me to add some notes ... I like him or he did something
 * really good. That's why I picked him ... just a simple note that I can
 * also access. Also ... sometimes I forget which one I've already clicked on
 * and reviewed ... maybe they change after I've clicked on it once."
 *
 * Both are private to the team and tell the applicant nothing.
 *
 * Pure: no React, no Supabase.
 */
import type { ApplicantListRow } from "./applicantList";

/** One note, as the page reads it. */
export interface ApplicantNote {
  id: string;
  application_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export const NOTE_COLUMNS = "id, application_id, author_id, body, created_at";
/** The longest note kept: the database's own limit. */
export const NOTE_MAX = 2000;

export const NOTES_PRIVATE_LINE = "Only your team sees these. The applicant never does.";

/**
 * A note as it may be sent: white space off both ends, at most two line
 * breaks in a row, no control characters but a line break. Null when there
 * is nothing left, or it is too long (the box stops at NOTE_MAX anyway).
 */
export function cleanNoteBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let out = "";
  for (const ch of raw.replace(/\r\n?/g, "\n")) {
    const code = ch.codePointAt(0) ?? 0;
    out += ch === "\n" ? "\n" : code < 32 || code === 127 ? " " : ch;
  }
  const text = out
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text || text.length > NOTE_MAX) return null;
  return text;
}

/** What the list shows about an applicant's notes: how many, and the newest. */
export interface NoteSummary {
  count: number;
  latest: string;
}

/** The notes by application: newest first. */
export function notesByApplication(notes: readonly ApplicantNote[] | null | undefined): Map<string, ApplicantNote[]> {
  const out = new Map<string, ApplicantNote[]>();
  for (const note of notes ?? []) {
    if (!note?.application_id || typeof note.body !== "string") continue;
    const list = out.get(note.application_id);
    if (list) list.push(note);
    else out.set(note.application_id, [note]);
  }
  for (const list of out.values()) list.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return out;
}

/** One "viewed" mark: when this person last opened that applicant's page. */
export interface ApplicantView {
  application_id: string;
  viewed_at: string;
}

export const VIEW_COLUMNS = "application_id, viewed_at";

/** The marks by application. */
export function viewsIndex(views: readonly ApplicantView[] | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const view of views ?? []) {
    if (view?.application_id && typeof view.viewed_at === "string") out.set(view.application_id, view.viewed_at);
  }
  return out;
}

/**
 * Has the reader looked at this applicant since the applicant last did
 * anything? Someone looked at halfway through, who has since finished their
 * tests, is new again: they need looking at once more.
 */
export function seenSince(viewedAt: string | null | undefined, lastActiveAt: string | null | undefined): boolean {
  if (!viewedAt) return false;
  const viewed = new Date(viewedAt).getTime();
  if (Number.isNaN(viewed)) return false;
  const active = lastActiveAt ? new Date(lastActiveAt).getTime() : NaN;
  return Number.isNaN(active) || viewed >= active;
}

/** The chip a "Needs review" row wears once its reader has looked at it. */
export const VIEWED_CHIP = { label: "Viewed", tone: "muted" } as const;

/**
 * The list's rows with each reader's own marks on them: `viewed` (they have
 * opened this applicant since the applicant last did anything) and `note`
 * (the team's notes). A "Needs review" row that has been looked at wears
 * "Viewed" instead: it still needs a decision and stays on its tab, but the
 * reader can tell which ones they have already opened.
 */
export function markSeenAndNoted(
  rows: readonly ApplicantListRow[],
  views: ReadonlyMap<string, string>,
  notes: ReadonlyMap<string, readonly ApplicantNote[]>,
): ApplicantListRow[] {
  if (views.size === 0 && notes.size === 0) return rows as ApplicantListRow[];
  return rows.map((row) => {
    const viewed = seenSince(views.get(row.id), row.lastActiveAt);
    const list = notes.get(row.id);
    const note: NoteSummary | null = list && list.length > 0 ? { count: list.length, latest: list[0].body } : null;
    if (!viewed && !note) return row;
    return {
      ...row,
      ...(viewed ? { viewed: true } : {}),
      ...(note ? { note } : {}),
      ...(viewed && row.chip?.label === "Needs review" ? { chip: { ...VIEWED_CHIP } } : {}),
    };
  });
}

/** "today at 9:14 AM", "yesterday at 4:02 PM", "Oct 6 at 11:30 AM" (with the year once it is another year). */
export function noteWhen(iso: string | null | undefined, now: Date, timeZone?: string): string {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return "";
  const zone = timeZone ? { timeZone } : {};
  const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", ...zone }).format(d);
  const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, ...zone }).formatToParts(at);
  const piece = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const clock = `${piece("hour")}:${piece("minute")} ${piece("dayPeriod")}`;
  const apart = Math.round((Date.parse(`${dayOf(now)}T00:00:00Z`) - Date.parse(`${dayOf(at)}T00:00:00Z`)) / 86_400_000);
  if (apart === 0) return `today at ${clock}`;
  if (apart === 1) return `yesterday at ${clock}`;
  const sameYear = dayOf(now).slice(0, 4) === dayOf(at).slice(0, 4);
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), ...zone }).format(at);
  return `${day} at ${clock}`;
}

/** Who wrote it, for the reader: "You", or "A teammate". */
export function noteAuthorWords(authorId: string | null | undefined, readerId: string | null | undefined): string {
  return authorId && readerId && authorId === readerId ? "You" : "A teammate";
}

/** The list's tooltip for a noted applicant. */
export function noteTitle(note: NoteSummary): string {
  const first = note.latest.length > 180 ? `${note.latest.slice(0, 177).trimEnd()}...` : note.latest;
  return note.count > 1 ? `${first} (and ${note.count - 1} more ${note.count === 2 ? "note" : "notes"})` : first;
}
