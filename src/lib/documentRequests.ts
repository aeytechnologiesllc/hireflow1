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
 * papers are deleted on their own a set number of days after the team approves
 * them (the document-cleanup function), so nobody is left holding copies of IDs.
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
  /** A file is deleted this many days after it is approved. Null: kept. */
  deleteAfterDays: number | null;
}

/** Days after approval before an identity paper is deleted. */
export const ID_KEEP_DAYS = 30;

export const REQUEST_KINDS: readonly RequestKind[] = [
  {
    key: "government_id",
    label: "Government ID",
    ask: "A clear photo of your passport, PhilSys national ID, UMID or driver's license. Both sides if it has two.",
    answer: "file",
    deleteAfterDays: ID_KEEP_DAYS,
  },
  {
    key: "nbi_clearance",
    label: "NBI clearance",
    ask: "A photo or PDF of your NBI clearance.",
    answer: "file",
    deleteAfterDays: ID_KEEP_DAYS,
  },
  {
    key: "proof_of_address",
    label: "Proof of address",
    ask: "A recent bill or bank statement with your name and address on it.",
    answer: "file",
    deleteAfterDays: ID_KEEP_DAYS,
  },
  {
    key: "tin",
    label: "TIN",
    ask: "Your Tax Identification Number.",
    answer: "text",
    deleteAfterDays: null,
  },
  {
    key: "payment_email",
    label: "Payment email",
    ask: "The email you use on Wise or PayPal, so we can pay you there.",
    answer: "text",
    deleteAfterDays: null,
  },
] as const;

/** Anything the team names itself: always a file, kept. */
export const CUSTOM_KIND: RequestKind = { key: "custom", label: "Something else", ask: "", answer: "file", deleteAfterDays: null };

/** The kinds whose approved files are deleted (the cleanup function keeps the same list). */
export const DELETED_AFTER_APPROVAL: readonly string[] = REQUEST_KINDS.filter((k) => k.deleteAfterDays !== null).map((k) => k.key);

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

/** "Deleted on November 13" for an identity paper, from the day it was approved. */
export function deletesOn(kindKey: string, approvedAt: string | null | undefined): Date | null {
  const kind = requestKind(kindKey);
  if (kind.deleteAfterDays === null || !approvedAt) return null;
  const at = new Date(approvedAt);
  if (Number.isNaN(at.getTime())) return null;
  return new Date(at.getTime() + kind.deleteAfterDays * 86_400_000);
}

export const DUE_CHOICES = [3, 5, 7] as const;
