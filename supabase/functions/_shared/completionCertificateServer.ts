/**
 * Server-side completion certificate builder for the document-signing edge
 * function's `countersign` finalize step.
 *
 * Produces exactly the same `CompletionCertificate` shape
 * src/lib/completionCertificate.ts's `generateCompletionCertificate`
 * already builds client-side by scanning `document_audit_logs` after the
 * fact (that function and its shape are unchanged by this design — see
 * docs/DOCUMENT-SIGNING.md §3). The difference here is only *how* the
 * fields are sourced: the server has the real signature/hash data in hand
 * directly from the request it just authorized, instead of re-deriving it
 * by re-reading rows it just wrote.
 *
 * Pure and dependency-free (Web Crypto only) so it runs unchanged under
 * Deno and is directly testable under Node with no build step.
 */

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface CertificateAuditEntry {
  action: string;
  created_at: string;
  user_id: string | null;
  document_hash: string | null;
}

/** Verbatim port of completionCertificate.ts's generateAuditTrailHashFromEntries. */
export async function auditTrailHash(entries: CertificateAuditEntry[]): Promise<string> {
  const auditString = entries
    .map((e) => `${e.action}|${e.created_at}|${e.user_id || "system"}|${e.document_hash || "none"}`)
    .join("||");
  return sha256Hex(auditString);
}

export function generateCertificateId(random: () => number = Math.random): string {
  const timestamp = Date.now().toString(36);
  const rand = random().toString(36).substring(2, 8);
  return `CERT-${timestamp.toUpperCase()}-${rand.toUpperCase()}`;
}

// Verbatim from src/lib/completionCertificate.ts's generateComplianceStatement
// — this is legal/compliance boilerplate that already exists in the product;
// this pass reuses it unchanged rather than drafting new legal language.
export const COMPLIANCE_STATEMENT =
  "This document was electronically signed and verified in compliance with the U.S. ESIGN Act and applicable state laws. All parties have consented to conduct this transaction electronically and have acknowledged that their electronic signatures carry the same legal weight as handwritten signatures under the Electronic Signatures in Global and National Commerce Act (15 U.S.C. § 7001 et seq.) and the Uniform Electronic Transactions Act (UETA). The integrity of this document is protected by SHA-256 cryptographic hashes, and all signature events have been recorded in a tamper-evident audit trail. This certificate serves as a legally binding record of the signing process and may be used as evidence in any legal proceeding.";

export interface SignerLocation {
  city: string;
  region: string;
  country: string;
}

export interface CompletionCertificate {
  certificate_id: string;
  document_id: string;
  document_name: string;
  document_type: string | null;
  version_history: {
    v1: { hash: string; timestamp: string } | null;
    v2: { hash: string; timestamp: string } | null;
    v3: { hash: string; timestamp: string } | null;
  };
  candidate_signature: {
    name: string;
    email: string;
    timestamp_utc: string;
    ip_address: string;
    location: SignerLocation;
    signature_hash: string;
    consent_confirmed_at: string;
    signing_order_position: number;
  } | null;
  employer_signature: {
    name: string;
    email: string;
    timestamp_utc: string;
    ip_address: string;
    location: SignerLocation;
    signature_hash: string;
    consent_confirmed_at: string;
    review_confirmed_at: string;
    signing_order_position: number;
  } | null;
  signing_order: "candidate_first";
  signing_order_verified: boolean;
  final_document_hash: string;
  completion_timestamp_utc: string;
  audit_trail_hash: string;
  audit_entries_count: number;
  compliance_statement: string;
}

const UNKNOWN_LOCATION: SignerLocation = { city: "Unknown", region: "Unknown", country: "Unknown" };

export interface BuildCertificateParams {
  documentId: string;
  documentName: string;
  documentType: string | null;
  v1Hash: string | null;
  v1Timestamp: string | null;
  v2Hash: string;
  v3Hash: string;
  candidateName: string;
  candidateEmail: string;
  candidateSignedAt: string;
  candidateIp: string;
  candidateLocation?: SignerLocation;
  employerName: string;
  employerEmail: string;
  employerSignedAt: string;
  employerReviewConfirmedAt: string;
  employerIp: string;
  employerLocation?: SignerLocation;
  finalPdfHash: string;
  completionTimestampUtc: string;
  auditEntries: CertificateAuditEntry[];
  certificateId?: string;
}

export async function buildCompletionCertificate(
  params: BuildCertificateParams,
): Promise<CompletionCertificate> {
  const trailHash = await auditTrailHash(params.auditEntries);
  const signingOrderVerified =
    new Date(params.candidateSignedAt).getTime() < new Date(params.employerSignedAt).getTime();

  return {
    certificate_id: params.certificateId ?? generateCertificateId(),
    document_id: params.documentId,
    document_name: params.documentName,
    document_type: params.documentType,
    version_history: {
      v1: params.v1Hash ? { hash: params.v1Hash, timestamp: params.v1Timestamp ?? "" } : null,
      v2: { hash: params.v2Hash, timestamp: params.candidateSignedAt },
      v3: { hash: params.v3Hash, timestamp: params.employerSignedAt },
    },
    candidate_signature: {
      name: params.candidateName,
      email: params.candidateEmail,
      timestamp_utc: params.candidateSignedAt,
      ip_address: params.candidateIp,
      location: params.candidateLocation ?? UNKNOWN_LOCATION,
      signature_hash: params.v2Hash,
      consent_confirmed_at: params.candidateSignedAt,
      signing_order_position: 1,
    },
    employer_signature: {
      name: params.employerName,
      email: params.employerEmail,
      timestamp_utc: params.employerSignedAt,
      ip_address: params.employerIp,
      location: params.employerLocation ?? UNKNOWN_LOCATION,
      signature_hash: params.v3Hash,
      consent_confirmed_at: params.employerSignedAt,
      review_confirmed_at: params.employerReviewConfirmedAt,
      signing_order_position: 2,
    },
    signing_order: "candidate_first",
    signing_order_verified: signingOrderVerified,
    final_document_hash: params.finalPdfHash,
    completion_timestamp_utc: params.completionTimestampUtc,
    audit_trail_hash: trailHash,
    audit_entries_count: params.auditEntries.length,
    compliance_statement: COMPLIANCE_STATEMENT,
  };
}
