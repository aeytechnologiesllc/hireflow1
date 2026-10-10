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
  closed: "Declined or withdrawn",
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
  if (row.isVoided || row.status === "Declined" || row.status === "Withdrawn" || row.status === "Voided") return "closed";
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

/** The line above the list: what the chosen status shows, in plain words. */
export function resultLine(status: FilterStatus, shown: number, filtered: boolean): string {
  if (shown === 0) return filtered ? "Nothing matches these filters." : "Nothing here.";
  const n = shown;
  if (status === "yours") return n === 1 ? "1 thing needs you" : `${n} things need you`;
  if (status === "theirs") return `${n} waiting on them`;
  if (status === "done") return `${n} done`;
  if (status === "closed") return `${n} declined, withdrawn or expired`;
  return filtered ? `${n} ${n === 1 ? "match" : "matches"}` : `${n} in all`;
}
