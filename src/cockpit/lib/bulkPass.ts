/**
 * bulkPass.ts: passing on several applicants at once, from the bar that shows
 * when applicants are picked on the list (docs/APPLICANTS-LIST.md, "Pass on
 * several at once").
 *
 * The owner, 2026-10-07, with 105 applicants in and "Score Under 50" picked:
 * "you added remove and block at the shortlist, but you didn't give me the
 * option to pass on all of them. So I need to do a bulk pass."
 *
 * A bulk Pass is the single Pass, once per person: the application is
 * declined in the owner's name and the applicant gets the same polite note
 * (src/lib/declineNote.ts). It is not Remove and block: nobody is blocked,
 * and they can apply again. Because every one of them is told by email, it is
 * confirmed once, with the number, the note, and how many of them have not
 * finished the tests yet.
 *
 * Pure: who it applies to, the confirm's words, what is written, and how the
 * outcome is worded. The sending is hooks/useBulkPass.ts.
 */

/** One applicant to pass on. */
export interface PassTarget {
  applicationId: string;
  candidateId: string | null;
  name: string;
  /** The job they applied for: the note names it. */
  jobTitle: string | null;
}

/** What the list knows about a picked row. */
export interface PassableRow {
  id: string;
  candidateId: string | null;
  name: string;
  jobTitle: string | null;
  status: string;
  /** The list's tab for them ("blocked" is never passed on from here). */
  tab: string;
  /** Every test done. */
  finished: boolean;
}

/** The statuses a bulk Pass may change. Never one that moved on to an offer, a hire or a decline. */
export const PASSABLE_STATUSES = ["in_progress", "pending", "reviewing", "interview"] as const;

/**
 * A bulk Pass applies to anyone still being decided on. Not someone already
 * declined or hired, and not someone holding an offer: an offer is taken
 * back on purpose, one person at a time, with its own words.
 */
export function canBulkPass(status: string): boolean {
  return (PASSABLE_STATUSES as readonly string[]).includes(status);
}

export interface BulkPassPlan {
  targets: PassTarget[];
  /** Picked, but left as they are (already declined, hired, holding an offer, or blocked). */
  left: number;
  /** Of the targets, how many have not finished the tests. */
  unfinished: number;
  /** The job the note names: theirs when they all applied for the same one. */
  jobTitle: string | null;
}

/** Who a Pass on the picked rows would reach. */
export function bulkPassPlan(rows: readonly PassableRow[]): BulkPassPlan {
  const seen = new Set<string>();
  const targets: PassTarget[] = [];
  let left = 0;
  let unfinished = 0;
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (row.tab === "blocked" || !canBulkPass(row.status)) {
      left += 1;
      continue;
    }
    targets.push({ applicationId: row.id, candidateId: row.candidateId, name: row.name, jobTitle: row.jobTitle });
    if (!row.finished) unfinished += 1;
  }
  const titles = new Set(targets.map((t) => t.jobTitle ?? ""));
  return { targets, left, unfinished, jobTitle: titles.size === 1 ? targets[0]?.jobTitle ?? null : null };
}

const people = (n: number) => `${n} applicant${n === 1 ? "" : "s"}`;

/** The confirm, in the cockpit's voice. The note itself is shown under it. */
export function bulkPassWords(plan: BulkPassPlan): { title: string; body: string; confirm: string } {
  const n = plan.targets.length;
  const parts: string[] = [];
  if (plan.unfinished > 0) {
    parts.push(
      plan.unfinished === n
        ? `${n === 1 ? "They have" : "None of them has"} finished the tests yet; passing closes ${n === 1 ? "their application" : "their applications"}.`
        : `${plan.unfinished} of them ${plan.unfinished === 1 ? "has" : "have"} not finished the tests yet; passing closes ${plan.unfinished === 1 ? "that application" : "those applications"}.`,
    );
  }
  if (plan.left > 0) {
    parts.push(`${plan.left} other${plan.left === 1 ? "" : "s"} you picked ${plan.left === 1 ? "is" : "are"} left as ${plan.left === 1 ? "it is" : "they are"} (already declined, hired, blocked or holding an offer).`);
  }
  parts.push(`${n === 1 ? "They come" : "They all come"} off your list, and ${n === 1 ? "they get" : "each gets"} this note in your name:`);
  return { title: `Pass on ${people(n)}?`, body: parts.join(" "), confirm: `Pass on ${n}` };
}

/** What a Pass writes on the application: the single Pass's own fields (useCockpitActions().reject). */
export function passUpdate(userId: string | null): { status: "rejected"; rejected_by: string | null; rejected_by_type: "user" } {
  // rejected_by_type: the database allows 'user' | 'team_member' | 'ava'; the
  // signed-in person passing is 'user', as on the single Pass.
  return { status: "rejected", rejected_by: userId, rejected_by_type: "user" };
}

/** After this many failures in a row the run stops: something is wrong on our side, not with one applicant. */
export const BULK_PASS_STOP_AFTER = 3;

export interface BulkPassResult {
  /** How many it set out to pass on. */
  total: number;
  /** Declined now. */
  passed: number;
  /** Of those, how many the note was emailed to. */
  emailed: number;
  /** Had moved on (offered, hired, declined) since they were picked: left as they are. */
  moved: number;
  /** Could not be changed. */
  failed: number;
  /** Stopped early after BULK_PASS_STOP_AFTER failures in a row. */
  stopped: boolean;
}

/** "Passing 7 of 25…": the confirm button's words while it runs. */
export function bulkPassProgressWords(done: number, total: number): string {
  return `Passing ${Math.min(done + 1, total)} of ${total}…`;
}

/** How it went, for the toast. `ok` is false when anyone was left undone by a fault. */
export function bulkPassDoneWords(result: BulkPassResult): { ok: boolean; title: string; description?: string } {
  const { passed, emailed, moved, failed, stopped, total } = result;
  const notes: string[] = [];
  if (passed > 0) {
    const unsent = passed - emailed;
    if (unsent === 0) notes.push(passed === 1 ? "They were sent the note." : "Each was sent the note.");
    else if (emailed === 0) notes.push(`The note could not be emailed${passed === 1 ? "" : " to any of them"}; they will see the decision in their application.`);
    else notes.push(`${emailed} ${emailed === 1 ? "was" : "were"} sent the note; ${unsent} could not be emailed and will see the decision in their application.`);
  }
  if (moved > 0) notes.push(`${moved} had already moved on and ${moved === 1 ? "was" : "were"} left as ${moved === 1 ? "it was" : "they were"}.`);
  if (failed > 0) {
    const undone = total - passed - moved;
    notes.push(stopped ? `It stopped after ${BULK_PASS_STOP_AFTER} failures in a row: ${undone} ${undone === 1 ? "was" : "were"} not changed. Try those again in a minute.` : `${failed} could not be changed. Try ${failed === 1 ? "that one" : "those"} again.`);
  }
  const ok = failed === 0;
  const title = passed === 0 ? (ok ? "Nobody was passed on" : "Couldn't pass on them") : passed === total ? `${people(passed)} passed` : `${passed} of ${total} passed`;
  return { ok, title, description: notes.length > 0 ? notes.join(" ") : undefined };
}
