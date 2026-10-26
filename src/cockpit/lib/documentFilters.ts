/**
 * The Documents page's filters (the owner, 2026-10-10: "Documents tab also
 * need a filter. A lot of filters"; built from the approved mock-up).
 *
 * One rule for both things on the page: a letter or file to sign (DocRow)
 * and a request for an ID or papers. Each falls in one status:
 *
 *   yours   something waits on you: a letter they signed for you to sign,
 *           an ID or answer they sent for you to check;
 *   theirs  waiting on them: a letter not signed yet, a request not answered
 *           (or asked again);
 *   done    signed by both, on file, approved;
 *   closed  declined, withdrawn, voided, or expired unsigned.
 *
 * Pure: no React, no Supabase (scripts/document_filters.test.mjs).
 */
import type { DocRow } from "../data";

export type FilterStatus = "all" | "yours" | "theirs" | "done" | "closed";
export type FilterKind = "all" | "offers" | "papers" | "files";
export type FilterOrder = "newest" | "oldest" | "due";

export interface DocFilters {
  status: FilterStatus;
  kind: FilterKind;
  /** A job title, or "all". */
  job: string;
  order: FilterOrder;
  search: string;
}

export const NO_FILTERS: Omit<DocFilters, "status"> = { kind: "all", job: "all", order: "newest", search: "" };

export const STATUS_WORDS: Record<FilterStatus, string> = {
  all: "All",
  yours: "Your turn",
  theirs: "Waiting on them",
  done: "Done",
  // Expired letters are filed here too (the twelfth product review: the label
  // did not name them).
  closed: "Closed",
};

export const KIND_WORDS: Record<FilterKind, string> = {
  all: "Everything",
  offers: "Offer letters",
  papers: "ID & papers",
  files: "Files to sign",
};

export const ORDER_WORDS: Record<FilterOrder, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  due: "Due soonest",
};

/** The fields of a request the filters read. */
export interface FilterableRequest {
  status: string;
  document_type: string;
  custom_document_name?: string | null;
  due_date?: string | null;
  created_at: string;
  personName: string;
  jobTitle?: string | null;
}

const when = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
};

/** Where a letter or file stands. */
export function docStatus(row: DocRow, now: number = Date.now()): Exclude<FilterStatus, "all"> {
  if (row.isVoided || row.status === "Declined" || row.status === "Withdrawn" || row.status === "Voided" || row.status === "Expired") return "closed";
  if (row.status === "Signed" || row.status === "Submitted") return "done";
  if (row.candidateSignedAt) return "yours";
  const expires = when(row.expiresAt);
  if (expires !== null && expires < now) return "closed";
  return "theirs";
}

/** Where a request stands. */
export function requestStatus(request: { status: string }): Exclude<FilterStatus, "all"> {
  if (request.status === "submitted" || request.status === "reviewed") return "yours";
  if (request.status === "approved") return "done";
  return "theirs";
}

/** An offer letter, or any other file to sign. */
export function docKind(row: DocRow): "offers" | "files" {
  return (row.type ?? "").toLowerCase().includes("offer") ? "offers" : "files";
}

/** The job a letter belongs to ("" when it has none). */
export function docJob(row: DocRow): string {
  return row.role && row.role !== "Role" ? row.role : "";
}

function normal(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

/** Every word of the search appears in the name or the document's title. */
export function searchMatches(search: string, ...fields: (string | null | undefined)[]): boolean {
  const words = normal(search).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const hay = normal(fields.filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
}

function docPasses(row: DocRow, f: Omit<DocFilters, "status">): boolean {
  if (f.kind === "papers") return false;
  if (f.kind !== "all" && docKind(row) !== f.kind) return false;
  if (f.job !== "all" && docJob(row) !== f.job) return false;
  return searchMatches(f.search, row.title, row.candidate);
}

function requestPasses(request: FilterableRequest, title: string, f: Omit<DocFilters, "status">): boolean {
  if (f.kind !== "all" && f.kind !== "papers") return false;
  if (f.job !== "all" && (request.jobTitle ?? "") !== f.job) return false;
  return searchMatches(f.search, request.personName, title);
}

export interface FilterResult<R> {
  docs: DocRow[];
  requests: R[];
  /** How many of each status the other filters leave, for the counts on the status row. */
  counts: Record<FilterStatus, number>;
}

/**
 * Applies the filters. `titleOf` names a request ("Government ID"). The
 * counts on the status row follow every other filter, so "Your turn 3" is
 * what pressing it would show.
 */
export function applyDocFilters<R extends FilterableRequest>(
  docs: DocRow[],
  requests: R[],
  filters: DocFilters,
  titleOf: (request: R) => string,
  now: number = Date.now(),
): FilterResult<R> {
  const { status, ...rest } = filters;
  const docsLeft = docs.filter((row) => docPasses(row, rest));
  const requestsLeft = requests.filter((request) => requestPasses(request, titleOf(request), rest));
  const counts: Record<FilterStatus, number> = { all: 0, yours: 0, theirs: 0, done: 0, closed: 0 };
  for (const row of docsLeft) counts[docStatus(row, now)] += 1;
  for (const request of requestsLeft) counts[requestStatus(request)] += 1;
  counts.all = docsLeft.length + requestsLeft.length;

  const docSort = (a: DocRow, b: DocRow) => sortValue(a.createdAt, a.expiresAt, b.createdAt, b.expiresAt, filters.order);
  const requestSort = (a: R, b: R) => sortValue(a.created_at, a.due_date, b.created_at, b.due_date, filters.order);
  return {
    docs: docsLeft.filter((row) => status === "all" || docStatus(row, now) === status).sort(docSort),
    requests: requestsLeft.filter((request) => status === "all" || requestStatus(request) === status).sort(requestSort),
    counts,
  };
}

function sortValue(aMade: string | null | undefined, aDue: string | null | undefined, bMade: string | null | undefined, bDue: string | null | undefined, order: FilterOrder): number {
  if (order === "due") {
    const ad = when(aDue);
    const bd = when(bDue);
    if (ad !== null && bd !== null && ad !== bd) return ad - bd;
    if (ad !== null && bd === null) return -1;
    if (ad === null && bd !== null) return 1;
  }
  const am = when(aMade) ?? 0;
  const bm = when(bMade) ?? 0;
  return order === "oldest" ? am - bm : bm - am;
}

/** Ready means nobody is waiting on it: it is signed, or it is on file. */
export function isReady(row: Pick<DocRow, "status">): boolean {
  return row.status === "Signed" || row.status === "Submitted";
}

/** "1 was", "2 were". */
function counted(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The fields of a row the drawer's line and the "replaced" rule read. */
export type CaptionRow = Pick<DocRow, "status"> & Partial<Pick<DocRow, "id" | "type" | "applicationId" | "createdAt" | "candidateSignedAt">>;

/**
 * The later offer letter that replaced this one, or null. Only an offer
 * letter that closed unfinished (expired, or declined) is replaced: by a
 * later offer letter on the same application that is signed or still
 * waiting. One that also expired, or was declined, withdrawn or voided,
 * replaces nothing: that person still has no letter.
 *
 * The eleventh product review: the Documents line kept asking for a new
 * letter after one had been sent and signed ("1 of 2 ready · 1 expired
 * before it was signed — send a new one if you still need it."), and nothing
 * removes a row, so it asked for good. A file to sign is never replaced this
 * way: two files sent to one person are usually two different papers.
 */
export function laterLetter<R extends CaptionRow>(row: CaptionRow, rows: R[]): R | null {
  if (row.status !== "Expired" && row.status !== "Declined") return null;
  const isLetter = (r: CaptionRow) => docKind(r as DocRow) === "offers";
  const made = when(row.createdAt);
  if (!row.applicationId || made === null || !isLetter(row)) return null;
  const later = rows.filter(
    (other) =>
      other !== row &&
      other.applicationId === row.applicationId &&
      isLetter(other) &&
      (isReady(other) || other.status === "Pending") &&
      (when(other.createdAt) ?? -Infinity) > made,
  );
  return later.sort((a, b) => (when(b.createdAt) ?? 0) - (when(a.createdAt) ?? 0))[0] ?? null;
}

/**
 * The line beside the meter ("0 of 1 ready · …"). "Done" only when every
 * row is signed or on file. The tenth product review: the line knew only
 * waiting, declined and done, so a letter past its date and never signed
 * read "Everything in here is done." (and a withdrawn or voided one already
 * did). A closed one is said as what it is.
 *
 * The eleventh product review: an expired or declined letter that a later
 * letter replaced (laterLetter) asks for nothing ("1 was replaced by a newer
 * letter."), and "send a new one" is said only to someone who can send one
 * (`canSend`: the owner, or a teammate with "Send documents"), one letter
 * for each person.
 */
export function drawerCaption(rows: CaptionRow[], { canSend }: { canSend: boolean }): string {
  const replaced = new Set(rows.filter((r) => laterLetter(r, rows) !== null));
  const count = (status: DocRow["status"]) => rows.filter((r) => r.status === status && !replaced.has(r)).length;
  const pending = count("Pending");
  if (pending > 0) return `I\u2019m still waiting on ${counted(pending, "signature", "signatures")}.`;
  // Declined after the applicant signed, it was the team's own decline on its
  // turn: not something that "came back" (the thirteenth product review).
  const declined = rows.filter((r) => r.status === "Declined" && !replaced.has(r) && !r.candidateSignedAt).length;
  const youDeclined = rows.filter((r) => r.status === "Declined" && !replaced.has(r) && !!r.candidateSignedAt).length;
  if (declined > 0) return `${declined} came back declined — worth another look.`;
  if (rows.every(isReady)) return "Everything in here is done.";
  const expired = count("Expired");
  const withdrawn = count("Withdrawn");
  const voided = count("Voided");
  const parts = [
    expired > 0 ? counted(expired, "expired before it was signed", "expired before they were signed") : null,
    replaced.size > 0 ? counted(replaced.size, "was replaced by a newer letter", "were replaced by newer letters") : null,
    withdrawn > 0 ? counted(withdrawn, "was withdrawn", "were withdrawn") : null,
    voided > 0 ? counted(voided, "was voided", "were voided") : null,
    youDeclined > 0 ? `${youDeclined} you declined` : null,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return `${counted(rows.filter((r) => !isReady(r)).length, "is", "are")} not finished.`;
  const line = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  // Nothing can move the date once it has passed: a new letter is the way on,
  // one for each person (two expired letters to one person need one new one).
  // A replaced letter needs nothing, so it never stops the ask for the people
  // whose letter only expired (the twelfth product review: "1 expired … and 1
  // was replaced" dropped the ask Ana still needed).
  const onlyExpiredNeedsAct = expired > 0 && withdrawn === 0 && voided === 0 && youDeclined === 0;
  if (onlyExpiredNeedsAct && canSend) {
    const people = new Set(rows.filter((r) => r.status === "Expired" && !replaced.has(r)).map((r, i) => r.applicationId ?? r.id ?? `row ${i}`)).size;
    // Beside a replaced letter, say which one wants a new copy (the thirteenth
    // product review: it read as if the replaced letter did).
    const which = replaced.size > 0 ? (people === 1 ? " for the one that expired" : " for the ones that expired") : "";
    return `${line} — ${people === 1 ? `send a new one${which} if you still need it` : `send new ones${which} if you still need them`}.`;
  }
  return `${line}.`;
}

/** The line above the list: what the chosen status shows, in plain words. */
export function resultLine(status: FilterStatus, shown: number, filtered: boolean): string {
  if (shown === 0) return filtered ? "Nothing matches these filters." : "Nothing here.";
  const n = shown;
  if (status === "yours") return n === 1 ? "1 thing needs you" : `${n} things need you`;
  if (status === "theirs") return `${n} waiting on them`;
  if (status === "done") return `${n} done`;
  if (status === "closed") return `${n} declined, withdrawn, voided or expired`;
  return filtered ? `${n} ${n === 1 ? "match" : "matches"}` : `${n} in all`;
}
