/**
 * What the signing record (SignedDocumentViewer's audit trail, and the audit
 * trail it exports) says about a document's state and its final hash.
 *
 * The eighth product review, on the seventh's audit trail:
 *  - its "Final Hash" cell showed the hash of the applicant's signature
 *    (v2_hash, and document_hash, which document-signing sets with it; a void
 *    clears neither) on a document waiting for the countersign or voided,
 *    and the card under it then said there was no final hash. The final hash
 *    is made when the team countersigns (v3), so only a finished, unvoided
 *    document has one: "None" when it was voided or withdrawn, "Pending"
 *    while it is still being signed;
 *  - a document withdrawn before the applicant signed read "Withdrawn" in
 *    the phase badge, "Voided" in the Status cell and "Voided before it was
 *    finished" in the card. One word now, as everywhere else; and one not
 *    signed by its date reads "Expired", not "Signing in Progress".
 */

export interface RecordDocument {
  status: string | null;
  is_voided?: boolean | null;
  candidate_signed_at?: string | null;
  expires_at?: string | null;
  v3_hash?: string | null;
  v2_hash?: string | null;
  document_hash?: string | null;
}

export type RecordState = "done" | "voided" | "withdrawn" | "declined" | "expired" | "waiting" | "pending";

/**
 * Voided after the applicant signed; withdrawn before (document-signing's
 * void and withdraw); expired when its date passed before they signed. Signed
 * in time, it waits for the team whatever the date (the date is theirs).
 */
export function recordState(doc: RecordDocument, now = new Date()): RecordState {
  if (doc.is_voided) return doc.candidate_signed_at ? "voided" : "withdrawn";
  if (doc.status === "signed") return "done";
  if (doc.status === "declined") return "declined";
  if (doc.candidate_signed_at) return "waiting";
  if (doc.expires_at && new Date(doc.expires_at).getTime() <= now.getTime()) return "expired";
  return "pending";
}

/** Closed without being finished: no final hash will ever be made. */
export function recordClosedUnfinished(state: RecordState): state is "voided" | "withdrawn" | "declined" | "expired" {
  return state === "voided" || state === "withdrawn" || state === "declined" || state === "expired";
}

const STATUS_LABEL: Record<RecordState, string> = {
  done: "Fully Executed",
  voided: "Voided",
  withdrawn: "Withdrawn",
  declined: "Declined",
  expired: "Expired",
  waiting: "Waiting for countersign",
  pending: "Pending Signatures",
};

/** The Status cell. */
export function recordStatusLabel(doc: RecordDocument, now = new Date()): string {
  return STATUS_LABEL[recordState(doc, now)];
}

/** The final hash, for a finished, unvoided document only; null otherwise. */
export function recordFinalHash(doc: RecordDocument): string | null {
  if (recordState(doc) !== "done") return null;
  return doc.v3_hash || doc.v2_hash || doc.document_hash || null;
}

/** The "Final Hash" cell: the hash, "None" (closed unfinished), or "Pending". */
export function recordFinalHashCell(doc: RecordDocument, now = new Date()): string {
  if (recordClosedUnfinished(recordState(doc, now))) return "None";
  return recordFinalHash(doc) ?? "Pending";
}
