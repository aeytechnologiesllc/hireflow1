/**
 * shortlist.ts — the hiring team's shortlist, the pure half.
 *
 * The owner, 2026-10-07, on his first live hiring day: "I need you to also
 * add a feature where I can add them as favorites. Maybe do a short list for
 * this particular job. Not favorite, but short list, I guess."
 *
 * A shortlist entry is a private mark on ONE application, so on one job
 * (public.shortlisted_applications, written only by
 * set_applications_shortlisted in
 * supabase/migrations/*_shortlisted_applications.sql). It decides nothing and
 * tells the applicant nothing: no status change, no email, no bell, and they
 * cannot read it.
 *
 * On the list the marked rows carry a small bookmark beside the name and are
 * gathered on the "Shortlist" tab, which cuts across the others: someone on
 * it is still on their own tab (Needs review, Interview…) too. The shortlist
 * is the people still in the running, so the mark does not show on someone
 * who has been declined or blocked (the row in the database stays; if the
 * product ever reopens a declined application, the mark is back with it).
 *
 * Pure and display-only (no React, no Supabase), so
 * scripts/shortlist.test.mjs runs it under plain Node.
 */
import type { ApplicantListRow } from "./applicantList";

/** One entry, as the list reads it (RLS: the job's owner and its team). */
export interface ShortlistEntry {
  application_id: string;
  job_id?: string | null;
  added_by?: string | null;
  created_at?: string | null;
}

/** The columns the list selects. */
export const SHORTLIST_COLUMNS = "application_id, job_id, added_by, created_at";

/** Which applications are marked, by application id. */
export function shortlistIndex(rows: readonly ShortlistEntry[] | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const row of rows ?? []) {
    if (row?.application_id) out.add(row.application_id);
  }
  return out;
}

/**
 * Whether an applicant can be on the shortlist as it is shown: anyone still
 * in the running. Not someone declined (passing on them is how they leave
 * it), and not someone blocked.
 */
export function canShortlist(status: string | null | undefined, blocked = false): boolean {
  return !blocked && (status ?? "") !== "rejected";
}

/** The same input row, marked the same way, comes back as the same object:
 *  the page redraws only rows that changed. */
const marks = new WeakMap<ApplicantListRow, ApplicantListRow>();

/**
 * The list's rows with the shortlist applied: a marked application that can
 * be on it (canShortlist) gets `shortlisted: true`. Everyone else is returned
 * as the same object, so nothing downstream redraws for them. With nobody
 * marked, the input array itself comes back. Run it after markBlocked: it
 * reads the row's `blocked`.
 */
export function markShortlisted(rows: readonly ApplicantListRow[], shortlisted: ReadonlySet<string>): ApplicantListRow[] {
  if (shortlisted.size === 0) return rows as ApplicantListRow[];
  let changed = false;
  const out = rows.map((row) => {
    if (!shortlisted.has(row.id) || !canShortlist(row.status, !!row.blocked)) return row;
    changed = true;
    const hit = marks.get(row);
    if (hit) return hit;
    const made: ApplicantListRow = { ...row, shortlisted: true };
    marks.set(row, made);
    return made;
  });
  return changed ? out : (rows as ApplicantListRow[]);
}

/* ── Words ──────────────────────────────────────────────────────────────── */

/** The button and menu item, by where the applicant stands now. */
export function shortlistActionLabel(on: boolean): string {
  return on ? "Take off shortlist" : "Add to shortlist";
}

/** What the profile's button says: the state it is in, not the action. */
export function shortlistButtonLabel(on: boolean): string {
  return on ? "On your shortlist" : "Add to shortlist";
}

/** The toast after a change. One name, or a count for several at once. */
export function shortlistDoneWords(names: readonly string[], on: boolean): string {
  if (names.length === 1) {
    const who = names[0] || "This applicant";
    return on ? `${who} is on your shortlist` : `${who} is off your shortlist`;
  }
  const n = names.length;
  return on ? `${n} applicants added to your shortlist` : `${n} applicants taken off your shortlist`;
}

/** Said once under the Shortlist tab, and on the profile's button. */
export const SHORTLIST_PRIVATE_LINE = "Only your team sees this. The applicant isn't told.";

/** The Shortlist tab with nobody on it. */
export const SHORTLIST_EMPTY_LINE = "Nobody is on your shortlist yet. Open an applicant and press Add to shortlist, or use the ⋯ menu on their row.";
