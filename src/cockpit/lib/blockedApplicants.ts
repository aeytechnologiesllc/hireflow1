/**
 * blockedApplicants.ts — Remove and block, the pure half.
 *
 * The owner, 2026-10-06, with a live job taking applications as fast as
 * people could type: "give me a nicer, easier way to drop down to delete some
 * of these applicants. And that will just block them too."
 *
 * A block is the employer's (public.blocked_applicants, one row per person,
 * written by block_applicant(s) in
 * supabase/migrations/20261007022249_block_applicants.sql). It refuses a new
 * application from the same account or the same email (Gmail's dots and any
 * +tag ignored). A phone is never refused: shared and mistyped numbers would
 * turn real people away. Instead, anyone on the list who typed a blocked
 * person's phone is FLAGGED here ("Same phone as Maria Santos, blocked"), and
 * the hiring team decides.
 *
 * On the list a blocked person's application that the block closed sits on a
 * "Blocked" tab of its own, off All and every other tab and count. One the
 * block deliberately left open (an interview, an offer or a hire on another
 * job, or a job the person who blocked them cannot decide on) stays on its
 * own tab with the Blocked chip, so the list never hides what is still live.
 * Their applications stay rejected when they are unblocked: unblocking only
 * lets them apply again.
 *
 * Pure and display-only (no React, no Supabase), so
 * scripts/applicant_list.test.mjs runs it under plain Node.
 */
import type { ApplicantListRow, ListTone } from "./applicantList";

/** One block, as the list reads it (RLS: the employer and its team). */
export interface BlockedApplicant {
  candidate_id: string;
  email?: string | null;
  phone?: string | null;
  reason?: string | null;
  blocked_by?: string | null;
  created_at?: string | null;
}

/** The columns the list selects. */
export const BLOCKED_COLUMNS = "candidate_id, email, phone, reason, blocked_by, created_at";

/** The chip a blocked person's row carries. */
export const BLOCKED_CHIP: { label: string; tone: ListTone } = { label: "Blocked", tone: "crit" };

/** What the candidate's page says when a new application is refused (the
 *  database raises exactly these words): src/lib/applicantBlocked.ts. */
export { APPLICANT_BLOCKED_MESSAGE, isApplicantBlockedError } from "@/lib/applicantBlocked";

/** Who is blocked, by candidate id. */
export function blockedIndex(rows: readonly BlockedApplicant[] | null | undefined): Map<string, BlockedApplicant> {
  const out = new Map<string, BlockedApplicant>();
  for (const row of rows ?? []) {
    if (row?.candidate_id) out.set(row.candidate_id, row);
  }
  return out;
}

/* ── Phones ─────────────────────────────────────────────────────────────── */

/**
 * A number someone could actually be reached on. "0000000", "1111111111",
 * "1234567890" and "0123456789" are what people type to get past a required
 * field; flagging everyone who typed one as the same person would be noise.
 */
export function isPlausiblePhone(digits: string | null | undefined): digits is string {
  if (!digits || !/^\d{7,15}$/.test(digits)) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  const tail = digits.slice(-10);
  return !("01234567890123456789".includes(tail) || "98765432109876543210".includes(tail));
}

/** The key two phones share when they are one number: the last ten digits
 *  ("+63 917 123 4567" and "0917 123 4567"), or every digit of a shorter one. */
export function phoneMatchKey(digits: string | null | undefined): string | null {
  if (!isPlausiblePhone(digits)) return null;
  return digits.length >= 10 ? digits.slice(-10) : `=${digits}`;
}

/* ── The list ───────────────────────────────────────────────────────────── */

/** The same input row, marked the same way, comes back as the same object:
 *  the page redraws only rows that changed. */
const marks = new WeakMap<ApplicantListRow, { sig: string; out: ApplicantListRow }>();

function marked(row: ApplicantListRow, sig: string, make: () => ApplicantListRow): ApplicantListRow {
  const hit = marks.get(row);
  if (hit && hit.sig === sig) return hit.out;
  const out = make();
  marks.set(row, { sig, out });
  return out;
}

/**
 * The list's rows with the blocks applied:
 *  - a blocked person's application that is closed (rejected, as the block
 *    leaves it) moves to the Blocked tab with the Blocked chip;
 *  - one the block left open keeps its own tab and gets the Blocked chip;
 *  - anyone else who typed a blocked person's phone is flagged
 *    (`sameBlockedPhoneAs`), never moved.
 * A blocked person's phone is the one on the block, and the one on any of
 * their own rows (typed after the block was made, or only in the form's
 * draft). Everyone else is returned as the same object, so nothing
 * downstream redraws for them. With nobody blocked, the input array itself
 * comes back.
 */
export function markBlocked(rows: readonly ApplicantListRow[], blocked: ReadonlyMap<string, BlockedApplicant>): ApplicantListRow[] {
  if (blocked.size === 0) return rows as ApplicantListRow[];

  // Whose phone is whose: the block's, and their own rows'.
  const names = new Map<string, string>();
  for (const row of rows) if (row.candidateId && blocked.has(row.candidateId) && !names.has(row.candidateId)) names.set(row.candidateId, row.name);
  const phones = new Map<string, string>();
  const addPhone = (digits: string | null | undefined, candidateId: string) => {
    const key = phoneMatchKey(digits);
    if (key && !phones.has(key)) phones.set(key, candidateId);
  };
  for (const [candidateId, block] of blocked) addPhone(block.phone, candidateId);
  for (const row of rows) if (row.candidateId && blocked.has(row.candidateId)) addPhone(row.phone, row.candidateId);

  let changed = false;
  const out = rows.map((row) => {
    if (row.candidateId && blocked.has(row.candidateId)) {
      changed = true;
      const closed = row.status === "rejected";
      return marked(row, closed ? "blocked:closed" : "blocked:open", () => ({
        ...row,
        tab: closed ? ("blocked" as const) : row.tab,
        chip: BLOCKED_CHIP,
        blocked: true,
        sameBlockedPhoneAs: null,
      }));
    }
    const key = phones.size > 0 ? phoneMatchKey(row.phone) : null;
    const owner = key ? phones.get(key) : undefined;
    if (!owner) return row;
    changed = true;
    const name = names.get(owner) ?? "someone you blocked";
    return marked(row, `phone:${name}`, () => ({ ...row, sameBlockedPhoneAs: name }));
  });
  return changed ? out : (rows as ApplicantListRow[]);
}

/* ── Words ──────────────────────────────────────────────────────────────── */

/** A first name for a dialog's title ("Remove and block Maria?"). */
export function firstNameOf(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first || first.includes("@")) return name?.trim() || "this applicant";
  return first;
}

/** The confirm's words, one person or many (the bulk bar). What it promises
 *  is exactly what the database does: the account and the email are refused,
 *  a phone is only flagged, and their other open applications to these jobs
 *  close too. */
export function blockConfirmWords(names: readonly string[]): { title: string; body: string; confirm: string } {
  if (names.length === 1) {
    const who = names[0] || "this applicant";
    return {
      title: `Remove and block ${who}?`,
      body:
        "They won't be emailed. They leave your list, along with any other open application of theirs to your jobs, and they can't apply again with this account or email. Anyone who applies with the same phone is flagged. You can undo this in Blocked.",
      confirm: "Remove and block",
    };
  }
  const n = names.length;
  return {
    title: `Remove and block ${n} applicants?`,
    body:
      "They won't be emailed. They leave your list, along with any other open applications of theirs to your jobs, and they can't apply again with the same account or email. Anyone who applies with one of their phones is flagged. You can undo this in Blocked.",
    confirm: `Remove and block ${n}`,
  };
}

/** The unblock confirm: their application stays declined, said plainly. */
export function unblockConfirmWords(name: string): { title: string; body: string; confirm: string } {
  const who = name || "this applicant";
  return {
    title: `Unblock ${who}?`,
    body: "They'll be able to apply to your jobs again. Their application stays declined, and they won't be told either way.",
    confirm: "Unblock",
  };
}

/** The flag's words on a row whose phone is a blocked person's. */
export function samePhoneWords(name: string): { chip: string; title: string } {
  return { chip: "Blocked phone", title: `Same phone as ${name}, whom you blocked. Open the ⋯ menu to remove and block them too.` };
}
