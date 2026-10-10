/**
 * documentRequests.ts: what the hiring team can ask an applicant for, and how
 * each answer is given and kept (docs/DOCUMENT-REQUESTS.md).
 *
 * The owner, 2026-10-10: "how do I ask them for things like their driver
 * license or a government ID? And banking information for salary ... and have
 * it encrypted in some way?" The list is Philippines-first (where his
 * applicants are). Bank account numbers are deliberately not on it: the
 * applicant gives the email they use on Wise or PayPal and is paid there, so
 * no bank details are ever stored here.
 *
 * Some answers are a file (a photo or a PDF, kept in the private
 * `requested-documents` bucket), some are a short typed answer. Identity
 * papers are deleted on their own 24 hours after the team first opens them,
 * or 7 days after they are sent if nobody does (the owner, 2026-10-10: "we
 * take it, we pass it to the employer, and then we delete it within 24
 * hours"; the document-cleanup function), so nobody is left holding IDs.
 *
 * Pure: no React, no Supabase. The Deno side keeps its own copy of the kinds
 * it deletes (supabase/functions/document-cleanup); scripts/document_requests.test.mjs
 * fails if they drift apart.
 */

export type RequestAnswer = "file" | "text";

export interface RequestKind {
  /** Stored in document_requests.document_type. */
  key: string;
  /** What the hiring team picks, and the applicant sees as the title. */
  label: string;
  /** One line to the applicant on what to send. */
  ask: string;
  answer: RequestAnswer;
  /** An identity paper: deleted 24 hours after the team first opens it. */
  idPaper: boolean;
}

/** Hours after the hiring team first opens an identity paper before it is deleted. */
export const ID_DELETE_HOURS_AFTER_OPENED = 24;
/** Days after it is sent before an identity paper nobody opened is deleted. */
export const ID_DELETE_DAYS_UNOPENED = 7;

export const REQUEST_KINDS: readonly RequestKind[] = [
  {
    key: "government_id",
    label: "Government ID",
    ask: "A clear photo of your passport, PhilSys national ID, UMID or driver's license. Both sides if it has two.",
    answer: "file",
    idPaper: true,
  },
  {
    key: "nbi_clearance",
    label: "NBI clearance",
    ask: "A photo or PDF of your NBI clearance.",
    answer: "file",
    idPaper: true,
  },
  {
    key: "proof_of_address",
    label: "Proof of address",
    ask: "A recent bill or bank statement with your name and address on it.",
    answer: "file",
    idPaper: true,
  },
  {
    key: "tin",
    label: "TIN",
    ask: "Your Tax Identification Number.",
    answer: "text",
    idPaper: false,
  },
  {
    key: "payment_email",
    label: "Payment email",
    ask: "The email you use on Wise or PayPal, so we can pay you there.",
    answer: "text",
    idPaper: false,
  },
] as const;

/** Anything the team names itself: always a file, kept. */
export const CUSTOM_KIND: RequestKind = { key: "custom", label: "Something else", ask: "", answer: "file", idPaper: false };

/** The identity papers, deleted after they are seen (the cleanup function keeps the same list). */
export const ID_PAPER_KINDS: readonly string[] = REQUEST_KINDS.filter((k) => k.idPaper).map((k) => k.key);

/** The promise, said the same way on every screen, email and the privacy page. */
export function idDeletionPromise(team: string): string {
  return `HireFlow deletes it ${ID_DELETE_HOURS_AFTER_OPENED} hours after ${team} first opens it, and after ${ID_DELETE_DAYS_UNOPENED} days if they never do.`;
}

/** Older requests (the first request screens) used these keys; they read and behave as files. */
const LEGACY_LABELS: Record<string, string> = {
  drivers_license: "Driver's license",
  ssn_card: "Social Security card",
  passport: "Passport",
  work_authorization: "Work authorization",
  tax_form: "Tax form",
  id_card: "Government ID",
  bank_details: "Bank details",
  custom: "Document",
};

export function requestKind(key: string | null | undefined): RequestKind {
  const known = REQUEST_KINDS.find((k) => k.key === key);
  if (known) return known;
  return { ...CUSTOM_KIND, key: key ?? "custom", label: LEGACY_LABELS[key ?? ""] ?? "Document" };
}

/** The title of one request: the name the team typed, or the kind's own. */
export function requestTitle(request: { document_type: string; custom_document_name?: string | null }): string {
  const typed = (request.custom_document_name ?? "").trim();
  return typed || requestKind(request.document_type).label;
}

export const ANSWER_MAX = 120;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** What is wrong with a typed answer, in words the applicant can act on, or null. */
export function answerProblem(kindKey: string, value: string): string | null {
  const text = (value ?? "").trim();
  if (!text) return "Type your answer first.";
  if (text.length > ANSWER_MAX) return `Keep it under ${ANSWER_MAX} characters.`;
  if (kindKey === "payment_email" && !EMAIL_RE.test(text)) return "Type the email address you use on Wise or PayPal.";
  if (kindKey === "tin") {
    const digits = text.replace(/\D/g, "");
    if (!/^[\d\s-]+$/.test(text) || digits.length < 9 || digits.length > 14) return "Type your TIN as numbers, like 123-456-789-000.";
  }
  return null;
}

/** A typed answer as it is shown to the team once it is in: a TIN shows its last digits only. */
export function shownAnswer(kindKey: string, value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  if (kindKey === "tin") {
    const digits = text.replace(/\D/g, "");
    return `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
  }
  return text;
}

export type RequestStatus = "pending" | "submitted" | "reviewed" | "approved" | "rejected";

/** Where a request stands, in the team's words and in the applicant's. */
export function statusWords(status: string, side: "team" | "applicant"): string {
  if (status === "approved") return side === "team" ? "Approved" : "Approved";
  if (status === "submitted" || status === "reviewed") return side === "team" ? "Received" : "Sent, waiting for review";
  if (status === "rejected") return side === "team" ? "Asked again" : "Please send it again";
  return side === "team" ? "Waiting for them" : "To send";
}

export interface IdDeletion {
  /** When HireFlow deletes the file (or did). */
  at: Date;
  /** Whether the hiring team has opened it (the 24-hour clock), or it waits on the 7 days. */
  opened: boolean;
  deleted: boolean;
}

/**
 * When an identity paper's file goes: 24 hours after the team first opened
 * it, or 7 days after it was sent. Null for anything else, or with no file.
 */
export function idDeletion(request: {
  document_type: string;
  file_url?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
  team_opened_at?: string | null;
  file_deleted_at?: string | null;
}): IdDeletion | null {
  if (!requestKind(request.document_type).idPaper) return null;
  const when = (value: string | null | undefined) => {
    const d = value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  };
  const deleted = when(request.file_deleted_at);
  if (deleted && !request.file_url) return { at: deleted, opened: !!request.team_opened_at, deleted: true };
  if (!request.file_url) return null;
  const opened = when(request.team_opened_at);
  if (opened) return { at: new Date(opened.getTime() + ID_DELETE_HOURS_AFTER_OPENED * 3_600_000), opened: true, deleted: false };
  const sent = when(request.submitted_at) ?? when(request.created_at);
  if (!sent) return null;
  return { at: new Date(sent.getTime() + ID_DELETE_DAYS_UNOPENED * 86_400_000), opened: false, deleted: false };
}

/** "23 h", "45 min", "6 days": how long until a moment, rounded up. */
export function timeLeft(at: Date, now: Date = new Date()): string {
  const ms = Math.max(0, at.getTime() - now.getTime());
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.ceil(ms / 3_600_000);
  if (hours < 48) return `${hours} h`;
  return `${Math.ceil(ms / 86_400_000)} days`;
}

export const DUE_CHOICES = [3, 5, 7] as const;

/* ── What the welcome and documents emails list ─────────────────────────── */
// The same lines as supabase/functions/_shared/welcomeTodo.ts, which builds
// the real email; the Hire dialog shows them as its preview, word for word
// (scripts/document_requests.test.mjs holds the two together).

export const SIGN_OFFER_LINE = "Sign your offer letter";

const TODO_LINES: Record<string, string> = {
  government_id: "Send a photo of your government ID",
  nbi_clearance: "Send your NBI clearance",
  proof_of_address: "Send a proof of address",
  tin: "Type your TIN",
  payment_email: "Type the email you use on Wise or PayPal",
};

const TODO_OLDER: Record<string, string> = {
  drivers_license: "driver's license",
  ssn_card: "Social Security card",
  passport: "passport",
  work_authorization: "work authorization",
  tax_form: "tax form",
  id_card: "government ID",
  bank_details: "bank details",
};

/** One request as a line of the email ("Send your NBI clearance"). */
export function todoLine(kindKey: string, customName?: string | null): string {
  const named = (customName ?? "").replace(/\s+/g, " ").trim().slice(0, 80).trim();
  if (named) return `Send: ${named}`;
  return TODO_LINES[kindKey] ?? `Send your ${TODO_OLDER[kindKey] ?? "document"}`;
}
