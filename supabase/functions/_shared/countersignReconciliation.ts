/**
 * Countersign-time reconciliation of the candidate's v1 -> v2 hash step.
 *
 * See docs/DOCUMENT-SIGNING.md's revision log (blocker fix) for the full
 * writeup: protect_document_columns() (20260915150000_*.sql) now blocks a
 * direct client UPDATE of documents.v1_hash once the candidate has signed,
 * and refuses any v1_hash-only change on a pending document. This module is
 * the edge function's own defense-in-depth on top of that DB fence — it
 * independently recomputes v2_hash from data the countersign caller cannot
 * influence, and lets the caller refuse to countersign if it does not match
 * the v2_hash the document row currently carries.
 *
 * Why this is trustworthy even if documents.v1_hash itself were tampered
 * with after the candidate signed: it never reads documents.v1_hash. It
 * reads the v1_hash that was actually used at sign time back out of
 * document_audit_logs' 'candidate_signed' row's pre_signature_hash column —
 * a column document-signing/index.ts's sign() handler already sets to
 * document.v1_hash at the moment of signing, on a table that is completely
 * immutable after insert (prevent_audit_update / prevent_audit_delete,
 * 20251215015158_*.sql — a live, unconditional BEFORE UPDATE/DELETE
 * trigger with no service_role exemption). So pre_signature_hash reflects
 * whatever v1_hash genuinely was at sign time, regardless of what
 * documents.v1_hash reads as now.
 *
 * Pure and dependency-free (only documentHashChain.ts, itself Web-Crypto-
 * only) so it runs unchanged under Deno (the edge function) and under Node
 * (this file's own tests) with no build step — same convention as
 * documentHashChain.ts.
 */
import { computeV2Hash, signatureHashInput } from "./documentHashChain.ts";

export interface CandidateSignatureRecord {
  method: string;
  value: string;
  signerEmail: string;
}

/** Parses documents.candidate_signature_data's stored JSON shape (see
 *  index.ts's sign() handler for exactly what's written) into the fields
 *  needed to recompute v2_hash. Returns null for anything malformed rather
 *  than throwing — the caller treats "can't parse" the same as "missing". */
export function parseCandidateSignatureData(raw: string | null | undefined): CandidateSignatureRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const value = parsed?.signatures?.recipient;
    const method = parsed?.method;
    if (typeof value !== "string" || value.length === 0) return null;
    if (typeof method !== "string" || method.length === 0) return null;
    const signerEmail = typeof parsed?.signerEmail === "string" ? parsed.signerEmail : "";
    return { method, value, signerEmail };
  } catch {
    return null;
  }
}

export interface ReconcileCandidateSignatureChainParams {
  /** documents.v1_hash as it read at the moment the candidate signed —
   *  read back from document_audit_logs' immutable 'candidate_signed'
   *  row, never from the current documents.v1_hash column. */
  v1HashAtSign: string | null | undefined;
  /** The current documents.candidate_signature_data raw JSON string. */
  candidateSignatureDataRaw: string | null | undefined;
  /** documents.candidate_signed_at — the timestampUtc input to v2_hash. */
  candidateSignedAt: string | null | undefined;
  /** The v2_hash this document row currently carries, to check against. */
  storedV2Hash: string | null | undefined;
}

export type ReconcileFailureReason =
  | "missing_pre_signature_hash"
  | "missing_candidate_signed_at"
  | "missing_candidate_signature"
  | "missing_v2_hash"
  | "hash_mismatch";

export type ReconcileCandidateSignatureChainResult =
  | { ok: true; recomputedV2Hash: string }
  | { ok: false; reason: ReconcileFailureReason; recomputedV2Hash?: string };

/** Recomputes v2_hash independently and compares it against the document's
 *  stored v2_hash. `ok: false` means the chain does not reconcile — the
 *  caller must refuse to countersign. */
export async function reconcileCandidateSignatureChain(
  params: ReconcileCandidateSignatureChainParams,
): Promise<ReconcileCandidateSignatureChainResult> {
  const { v1HashAtSign, candidateSignatureDataRaw, candidateSignedAt, storedV2Hash } = params;

  if (!v1HashAtSign) return { ok: false, reason: "missing_pre_signature_hash" };
  if (!candidateSignedAt) return { ok: false, reason: "missing_candidate_signed_at" };
  if (!storedV2Hash) return { ok: false, reason: "missing_v2_hash" };

  const signature = parseCandidateSignatureData(candidateSignatureDataRaw);
  if (!signature) return { ok: false, reason: "missing_candidate_signature" };

  const signatureValue = await signatureHashInput({ method: signature.method, value: signature.value });
  const recomputedV2Hash = await computeV2Hash({
    v1Hash: v1HashAtSign,
    signatureValue,
    candidateEmail: signature.signerEmail,
    timestampUtc: candidateSignedAt,
  });

  if (recomputedV2Hash !== storedV2Hash) {
    return { ok: false, reason: "hash_mismatch", recomputedV2Hash };
  }
  return { ok: true, recomputedV2Hash };
}
