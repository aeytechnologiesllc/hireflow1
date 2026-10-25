/**
 * Whose turn a document sent to an applicant is, from the applicant's side.
 * One rule for the letter's own screen (ApplicantDocumentSheet), My
 * Documents' sections and the sidebar's badge, so the three never disagree.
 *
 * The eighth product review: My Documents' "To sign" still held letters the
 * applicant had already signed ("Sent to the employer"), and a letter whose
 * sign-by date had passed stayed under "To sign — 1 waiting on you" with
 * "Read and sign", counted in the badge too, though signing it only answers
 * "This document has expired." Only "yours" is waiting on them.
 */

export type ApplicantDocumentState = "yours" | "theirs" | "done" | "declined" | "withdrawn" | "expired";

export interface ApplicantDocumentFacts {
  status: string | null;
  candidate_signed_at: string | null;
  is_voided: boolean | null;
  expires_at: string | null;
}

export function applicantDocumentState(doc: ApplicantDocumentFacts, now = new Date()): ApplicantDocumentState {
  if (doc.is_voided) return "withdrawn";
  if (doc.status === "declined") return "declined";
  if (doc.status === "signed") return "done";
  // Signed in time: the team's turn, whatever the date says now (the sign-by
  // date is the applicant's; document-signing's signedInTime).
  if (doc.candidate_signed_at) return "theirs";
  if (doc.expires_at && new Date(doc.expires_at).getTime() <= now.getTime()) return "expired";
  return "yours";
}

/** Waiting on the applicant: theirs to read and sign, and still in time. */
export function waitingOnApplicant(doc: ApplicantDocumentFacts, now = new Date()): boolean {
  return applicantDocumentState(doc, now) === "yours";
}
