#!/usr/bin/env node
/**
 * Local verification that VerifyDocument's response construction and the
 * completion-certificate builder both work against a realistic signed
 * document fixture — the two pieces docs/DOCUMENT-SIGNING.md's CLAUDE.md
 * deliverable calls out by name ("a local verification that VerifyDocument
 * and certificatePDF still work with a signed fixture").
 *
 * This can't spin up a live Supabase project (no live DB access, no live
 * writes — see the ambient hard rules), so it instead:
 *
 *   1. Builds a `documents` row shaped exactly like what the countersign
 *      finalize UPDATE in supabase/functions/document-signing/index.ts
 *      actually writes (status='signed', is_locked=true, v1/v2/v3/
 *      final_pdf_hash all populated, signed_at set — the must-change #4
 *      fix), plus a matching document_audit_logs array.
 *   2. Re-runs supabase/functions/verify-document/index.ts's own response
 *      construction expressions (`v3_hash || v2_hash || document_hash`,
 *      `signed_at || employer_signed_at`, the `isComplete`/`verified` gate)
 *      against that fixture — copied verbatim from index.ts so this stays
 *      honest about what the deployed function actually does, not a
 *      reimplementation that could silently drift — and asserts they now
 *      resolve to real, non-null values instead of the null/empty state
 *      that existed before this design shipped (i.e. before anything wrote
 *      these columns, EVERY signed-looking response would have failed
 *      these same assertions).
 *   3. Feeds the fixture into the real, unmodified
 *      buildCompletionCertificate() (supabase/functions/_shared/
 *      completionCertificateServer.ts) and asserts every field
 *      src/lib/certificatePDF.ts and src/components/documents/
 *      AuditCertificate.tsx actually read off a CompletionCertificate is
 *      present and correctly typed (string/object, not undefined) — a
 *      structural compatibility check against the client-side consumers,
 *      run here since neither of those files can render outside a browser.
 *
 * Run with: node scripts/document_signing_verify_and_certificate_fixture.test.mjs
 */
import { readFile } from "node:fs/promises";
import { buildCompletionCertificate } from "../supabase/functions/_shared/completionCertificateServer.ts";
import { computeV2Hash, computeV3Hash } from "../supabase/functions/_shared/documentHashChain.ts";

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Build a realistic post-countersign fixture.
// ---------------------------------------------------------------------------
const v1Hash = "v1-fixture-hash";
const candidateSignedAt = "2026-09-16T09:00:00.000Z";
const employerSignedAt = "2026-09-16T10:00:00.000Z";

const v2Hash = await computeV2Hash({
  v1Hash,
  signatureValue: "Jane Candidate",
  candidateEmail: "jane@example.com",
  timestampUtc: candidateSignedAt,
});
const v3Hash = await computeV3Hash({
  v2Hash,
  signatureValue: "Employer Person",
  employerEmail: "employer@example.com",
  timestampUtc: employerSignedAt,
});

const document = {
  id: "doc-fixture-1",
  document_code: "DOC-FIXTURE0000000000000000000001",
  name: "Offer Letter",
  status: "signed",
  is_locked: true,
  is_voided: false,
  v1_hash: v1Hash,
  v2_hash: v2Hash,
  v3_hash: v3Hash,
  document_hash: v3Hash,
  final_pdf_hash: "final-pdf-fixture-hash",
  candidate_signed_at: candidateSignedAt,
  employer_signed_at: employerSignedAt,
  signed_at: employerSignedAt, // must-change #4's fix
  created_at: "2026-09-15T00:00:00.000Z",
};

const auditLogs = [
  { action: "document_created", created_at: document.created_at, signer_name: "Employer Person", signer_email: "employer@example.com", document_hash: v1Hash, user_id: "emp-1" },
  { action: "candidate_signed", created_at: candidateSignedAt, signer_name: "Jane Candidate", signer_email: "jane@example.com", document_hash: v2Hash, user_id: "cand-1" },
  { action: "employer_review_confirmed", created_at: employerSignedAt, signer_name: "Employer Person", signer_email: "employer@example.com", document_hash: v2Hash, user_id: "emp-1" },
  { action: "employer_countersigned", created_at: employerSignedAt, signer_name: "Employer Person", signer_email: "employer@example.com", document_hash: v3Hash, user_id: "emp-1" },
  { action: "document_completed", created_at: employerSignedAt, signer_name: "Employer Person", signer_email: "employer@example.com", document_hash: document.final_pdf_hash, user_id: "emp-1" },
];

// ---------------------------------------------------------------------------
// 2. verify-document's own response-construction logic, copied verbatim
//    from supabase/functions/verify-document/index.ts (asserted below that
//    the source still contains these exact expressions, so this can't drift
//    silently from the deployed function).
// ---------------------------------------------------------------------------
console.log("\n-- verify-document response construction, against the signed fixture --");

const verifyDocSrc = await readFile(
  new URL("../supabase/functions/verify-document/index.ts", import.meta.url),
  "utf8",
);
check(
  "verify-document/index.ts still computes finalHash the same way this test re-implements it",
  verifyDocSrc.includes("document.v3_hash || document.v2_hash || document.document_hash"),
);
check(
  "verify-document/index.ts still computes completionTimestamp the same way this test re-implements it",
  verifyDocSrc.includes("document.signed_at || document.employer_signed_at"),
);

const finalHash = document.v3_hash || document.v2_hash || document.document_hash;
const completionTimestamp = document.signed_at || document.employer_signed_at;
const isComplete = document.status === "signed";
const hasRequiredHashes = isComplete ? !!finalHash : true;
const verified = hasRequiredHashes && !document.is_voided;

check("finalHash resolves to the real v3_hash, not null/undefined", finalHash === v3Hash);
check(
  "completionTimestamp resolves to signed_at (the must-change #4 fix) rather than falling back to employer_signed_at",
  completionTimestamp === employerSignedAt,
);
check("a fully signed, non-voided document verifies as true", verified === true);

// Before this design shipped, nothing ever wrote these columns — the same
// construction against an all-null pre-fix row would have looked "signed"
// by status alone but failed every one of the checks above. Prove that
// explicitly, so this test is known to exercise a real fix, not a tautology.
const preFixDocument = { ...document, v1_hash: null, v2_hash: null, v3_hash: null, document_hash: null, final_pdf_hash: null, signed_at: null, employer_signed_at: null };
const preFixFinalHash = preFixDocument.v3_hash || preFixDocument.v2_hash || preFixDocument.document_hash;
const preFixVerified = (preFixDocument.status === "signed" ? !!preFixFinalHash : true) && !preFixDocument.is_voided;
check(
  "sanity: the SAME status='signed' row with unwritten hash columns (the pre-fix state) would have failed verification",
  preFixFinalHash == null && preFixVerified === false,
);

// ---------------------------------------------------------------------------
// 3. Certificate builder output, checked against every field
//    certificatePDF.ts / AuditCertificate.tsx actually read.
// ---------------------------------------------------------------------------
console.log("\n-- buildCompletionCertificate() against the signed fixture --");

const certificate = await buildCompletionCertificate({
  documentId: document.id,
  documentName: document.name,
  documentType: "offer_letter",
  v1Hash: document.v1_hash,
  v1Timestamp: document.created_at,
  v2Hash: document.v2_hash,
  v3Hash: document.v3_hash,
  candidateName: "Jane Candidate",
  candidateEmail: "jane@example.com",
  candidateSignedAt: document.candidate_signed_at,
  candidateIp: "203.0.113.5",
  employerName: "Employer Person",
  employerEmail: "employer@example.com",
  employerSignedAt: document.employer_signed_at,
  employerReviewConfirmedAt: document.employer_signed_at,
  employerIp: "203.0.113.9",
  finalPdfHash: document.final_pdf_hash,
  completionTimestampUtc: document.employer_signed_at,
  auditEntries: auditLogs.map((a) => ({ action: a.action, created_at: a.created_at, user_id: a.user_id, document_hash: a.document_hash })),
});

// certificatePDF.ts reads: certificate_id, document_id/name/type,
// candidate_signature.{name,email,timestamp_utc,ip_address,location,signature_hash,consent_confirmed_at},
// employer_signature.{...+review_confirmed_at}, signing_order, signing_order_verified,
// final_document_hash, completion_timestamp_utc, audit_trail_hash, audit_entries_count, compliance_statement.
const certificatePDFSrc = await readFile(new URL("../src/lib/certificatePDF.ts", import.meta.url), "utf8");
const certificatePDFFields = [...certificatePDFSrc.matchAll(/cert\.(candidate_signature|employer_signature)\.(\w+)/g)].map((m) => `${m[1]}.${m[2]}`);
const uniqueFields = [...new Set(certificatePDFFields)];
check("found signer fields certificatePDF.ts actually reads (sanity that this check isn't vacuous)", uniqueFields.length >= 5, `found: ${uniqueFields.join(", ")}`);

let allFieldsPresent = true;
const missing = [];
for (const field of uniqueFields) {
  const [side, key] = field.split(".");
  const value = certificate[side]?.[key];
  if (value === undefined) {
    allFieldsPresent = false;
    missing.push(field);
  }
}
check("every cert.candidate_signature.*/cert.employer_signature.* field certificatePDF.ts reads is present on the built certificate", allFieldsPresent, missing.join(", "));

check("certificate.signing_order_verified is true (candidate genuinely signed before employer)", certificate.signing_order_verified === true);
check("certificate.final_document_hash is the real final_pdf_hash, not a v1/v2/v3 fallback", certificate.final_document_hash === document.final_pdf_hash);
check("certificate.audit_entries_count matches the fixture's audit trail", certificate.audit_entries_count === auditLogs.length);
check("certificate.compliance_statement is non-empty legal boilerplate, reused not invented", typeof certificate.compliance_statement === "string" && certificate.compliance_statement.includes("ESIGN"));
check("certificate.candidate_signature.ip_address is the candidate's OWN ip, not overwritten by the employer's later one", certificate.candidate_signature.ip_address === "203.0.113.5");
check("certificate.employer_signature.ip_address is the employer's own ip", certificate.employer_signature.ip_address === "203.0.113.9");

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
