/**
 * Pure precondition/authorization logic for the document-signing edge
 * function — extracted so every `409`/`403` case in
 * docs/DOCUMENT-SIGNING.md §1 is a table-driven test (see
 * stateMachine.test.ts), not something only exercisable through a live call.
 *
 * No Supabase/Deno/DOM dependency — runs unchanged under Deno (the edge
 * function) and under Node (this file's own tests).
 */

export type DocumentRole = "candidate" | "employer" | null;

export interface TeamMembership {
  userId: string;
  employerId: string;
  status: string;
  canSendDocuments: boolean;
  /** null or [] both mean "every job" — matches this repo's own live
   *  convention, array_length(tm.assigned_job_ids, 1) IS NULL, not a plain
   *  IS NULL check (which is NOT true for '{}'::uuid[]). */
  assignedJobIds: string[] | null;
}

/**
 * Mirrors the RLS policies already on `documents`
 * ("Team members can update documents if permitted",
 * "Employers can update their documents") so the edge function's notion of
 * "employer" never diverges from what RLS already allows to see the row.
 */
export function resolveDocumentRole(params: {
  callerId: string;
  candidateId: string | null;
  employerId: string | null;
  jobId: string | null;
  teamMemberships: TeamMembership[];
}): DocumentRole {
  const { callerId, candidateId, employerId, jobId, teamMemberships } = params;
  if (candidateId && candidateId === callerId) return "candidate";
  if (employerId && employerId === callerId) return "employer";

  const isTeamEmployerSide = teamMemberships.some((tm) =>
    tm.userId === callerId &&
    tm.employerId === employerId &&
    tm.status === "active" &&
    tm.canSendDocuments &&
    (tm.assignedJobIds === null ||
      tm.assignedJobIds.length === 0 ||
      (jobId != null && tm.assignedJobIds.includes(jobId)))
  );
  if (isTeamEmployerSide) return "employer";

  return null;
}

export interface DocumentSigningState {
  status: "pending" | "signed" | "declined";
  candidateSignedAt: string | null;
  employerSignedAt: string | null;
  isLocked: boolean;
  isVoided: boolean;
  expiresAt: string | null;
}

export type PreconditionError =
  | "role_mismatch"
  | "not_pending"
  | "already_signed"
  | "candidate_has_not_signed"
  | "locked"
  | "expired"
  | "voided"
  | "not_your_turn"
  | "consent_required"
  | "review_required"
  | "invalid_signature"
  | "invalid_reason"
  | "candidate_already_signed"
  | "countersign_in_progress";

export type PreconditionResult = { ok: true } | { ok: false; error: PreconditionError };

function isExpired(doc: DocumentSigningState, now: Date): boolean {
  return doc.expiresAt !== null && new Date(doc.expiresAt).getTime() <= now.getTime();
}

/** §1 "sign" (candidate) preconditions, in the order the design lists them. */
export function canSign(
  doc: DocumentSigningState,
  role: DocumentRole,
  now: Date = new Date(),
): PreconditionResult {
  if (role !== "candidate") return { ok: false, error: "role_mismatch" };
  if (doc.isVoided) return { ok: false, error: "voided" };
  if (doc.status !== "pending") return { ok: false, error: "not_pending" };
  if (doc.candidateSignedAt !== null) return { ok: false, error: "already_signed" };
  if (doc.isLocked) return { ok: false, error: "locked" };
  if (isExpired(doc, now)) return { ok: false, error: "expired" };
  return { ok: true };
}

/**
 * §1 "countersign" (employer) preconditions. The
 * `candidateSignedAt !== null` check *is* the signing-order enforcement —
 * an employer cannot countersign before the candidate's signature lands,
 * because this check runs on every call, server-side.
 */
export function canCountersign(
  doc: DocumentSigningState,
  role: DocumentRole,
  now: Date = new Date(),
): PreconditionResult {
  if (role !== "employer") return { ok: false, error: "role_mismatch" };
  if (doc.isVoided) return { ok: false, error: "voided" };
  if (doc.status !== "pending") return { ok: false, error: "not_pending" };
  if (doc.candidateSignedAt === null) return { ok: false, error: "candidate_has_not_signed" };
  if (doc.employerSignedAt !== null) return { ok: false, error: "already_signed" };
  if (doc.isLocked) return { ok: false, error: "locked" };
  if (isExpired(doc, now)) return { ok: false, error: "expired" };
  return { ok: true };
}

/**
 * §1 "decline" — either resolved party, but only while it's actually their
 * turn to act, so a party with nothing left to do can't reopen a finished
 * document by "declining" it.
 */
export function canDecline(
  doc: DocumentSigningState,
  role: DocumentRole,
  now: Date = new Date(),
): PreconditionResult {
  if (role !== "candidate" && role !== "employer") return { ok: false, error: "role_mismatch" };
  if (doc.isVoided) return { ok: false, error: "voided" };
  if (doc.status !== "pending") return { ok: false, error: "not_pending" };
  if (doc.isLocked) return { ok: false, error: "locked" };
  if (isExpired(doc, now)) return { ok: false, error: "expired" };
  if (role === "candidate" && doc.candidateSignedAt !== null) {
    return { ok: false, error: "not_your_turn" };
  }
  if (role === "employer" && (doc.candidateSignedAt === null || doc.employerSignedAt !== null)) {
    return { ok: false, error: "not_your_turn" };
  }
  return { ok: true };
}

/**
 * §1 (new) "withdraw" — the sender side (employer, or a can_send_documents
 * team member scoped to the job — same `resolveDocumentRole` "employer"
 * bucket as countersign/void) cancels a document before the candidate has
 * signed it. Deliberately does NOT check `isExpired` — unlike sign/
 * countersign/decline, this is an administrative cleanup action, not a step
 * in the signing flow itself, so an employer must be able to withdraw a
 * document that's sat pending long enough to expire.
 *
 * `isLocked` is checked before the plain `status !== "pending"` check so a
 * completed, locked document reports the more accurate "locked" error
 * (matching decline/countersign's own precondition ordering) rather than
 * the generic "not_pending" — locked documents are closed for a different,
 * more specific reason than "declined".
 */
export function canWithdraw(doc: DocumentSigningState, role: DocumentRole): PreconditionResult {
  if (role !== "employer") return { ok: false, error: "role_mismatch" };
  if (doc.isVoided) return { ok: false, error: "voided" };
  if (doc.isLocked) return { ok: false, error: "locked" };
  if (doc.status !== "pending") return { ok: false, error: "not_pending" };
  if (doc.candidateSignedAt !== null) return { ok: false, error: "candidate_already_signed" };
  return { ok: true };
}

/**
 * §1 (new) "void" — the employer side voids a document after the candidate
 * has signed it but before the employer's own countersignature locks it.
 * Once `employerSignedAt` is set (the countersign handler's own reservation
 * — see index.ts's two-phase countersign comment) a void is refused with
 * `countersign_in_progress` rather than racing a concurrent countersign
 * attempt: by construction only one of "void" or "countersign" can ever
 * win that reservation window. A fully completed (`isLocked`) document
 * cannot be voided in this pass — see docs/DOCUMENT-SIGNING.md.
 */
export function canVoid(doc: DocumentSigningState, role: DocumentRole): PreconditionResult {
  if (role !== "employer") return { ok: false, error: "role_mismatch" };
  if (doc.isVoided) return { ok: false, error: "voided" };
  if (doc.isLocked) return { ok: false, error: "locked" };
  if (doc.status !== "pending") return { ok: false, error: "not_pending" };
  if (doc.candidateSignedAt === null) return { ok: false, error: "candidate_has_not_signed" };
  if (doc.employerSignedAt !== null) return { ok: false, error: "countersign_in_progress" };
  return { ok: true };
}

export interface SignaturePayload {
  method?: string;
  value?: string;
  consentAccepted?: boolean;
}

const MAX_DRAWN_SIGNATURE_BYTES = 200 * 1024; // 200 KB — a name-sized squiggle, not a photo.

/** §1: shared typed/drawn signature validation for both sign and countersign. */
export function validateSignaturePayload(signature: SignaturePayload | undefined): PreconditionResult {
  if (!signature || signature.consentAccepted !== true) {
    return { ok: false, error: "consent_required" };
  }
  if (signature.method === "typed") {
    const value = (signature.value ?? "").trim();
    if (value.length < 2 || value.length > 120) return { ok: false, error: "invalid_signature" };
    return { ok: true };
  }
  if (signature.method === "drawn") {
    const value = signature.value ?? "";
    if (!value.startsWith("data:image/png")) return { ok: false, error: "invalid_signature" };
    const base64 = value.slice(value.indexOf(",") + 1);
    // Reject oversized payloads before ever touching the DB or Storage —
    // base64 -> raw byte estimate, no need to actually decode it here.
    const approxBytes = Math.floor((base64.length * 3) / 4);
    if (approxBytes === 0 || approxBytes > MAX_DRAWN_SIGNATURE_BYTES) {
      return { ok: false, error: "invalid_signature" };
    }
    return { ok: true };
  }
  return { ok: false, error: "invalid_signature" };
}

/** §1 countersign-only: the employer must confirm they reviewed the document. */
export function validateReviewConfirmed(reviewConfirmed: unknown): PreconditionResult {
  if (reviewConfirmed !== true) return { ok: false, error: "review_required" };
  return { ok: true };
}

/** §1 decline: reason required, 3-500 chars after trim. */
export function validateDeclineReason(
  reason: unknown,
): { ok: true; value: string } | { ok: false; error: "invalid_reason" } {
  const value = typeof reason === "string" ? reason.trim() : "";
  if (value.length < 3 || value.length > 500) return { ok: false, error: "invalid_reason" };
  return { ok: true, value };
}
