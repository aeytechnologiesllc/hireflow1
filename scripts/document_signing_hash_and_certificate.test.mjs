#!/usr/bin/env node
/**
 * Local test runner for the document-signing hash chain and completion
 * certificate builder — plain assertions, no framework. Imports the real
 * pure functions directly from supabase/functions/_shared/documentHashChain.ts
 * and supabase/functions/_shared/completionCertificateServer.ts (Node 24+
 * strips type annotations natively, no build step).
 *
 * Run with: node scripts/document_signing_hash_and_certificate.test.mjs
 */
import { createHash } from "node:crypto";
import {
  computeV2Hash,
  computeV3Hash,
  sha256HexOfBytes,
  signatureHashInput,
} from "../supabase/functions/_shared/documentHashChain.ts";
import {
  auditTrailHash,
  buildCompletionCertificate,
  COMPLIANCE_STATEMENT,
} from "../supabase/functions/_shared/completionCertificateServer.ts";

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

function nodeSha256Hex(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// computeV2Hash / computeV3Hash — must match src/lib/documentHash.ts's
// generateVersionedHash formula exactly (same wire format, verified against
// Node's own crypto as an independent implementation of SHA-256).
// ---------------------------------------------------------------------------
console.log("\n-- computeV2Hash / computeV3Hash --");

{
  const params = {
    v1Hash: "v1abc",
    signatureValue: "Jane Doe",
    candidateEmail: "jane@example.com",
    timestampUtc: "2026-09-16T00:00:00.000Z",
  };
  const expected = nodeSha256Hex(
    `${params.v1Hash}|CANDIDATE|${params.signatureValue}|${params.candidateEmail}|${params.timestampUtc}|VERSION:2`,
  );
  const actual = await computeV2Hash(params);
  check("v2 hash matches the documented CANDIDATE formula, byte for byte", actual === expected, `${actual} vs ${expected}`);
}

{
  const params = {
    v2Hash: "v2abc",
    signatureValue: "John Employer",
    employerEmail: "john@example.com",
    timestampUtc: "2026-09-16T01:00:00.000Z",
  };
  const expected = nodeSha256Hex(
    `${params.v2Hash}|EMPLOYER|${params.signatureValue}|${params.employerEmail}|${params.timestampUtc}|VERSION:3`,
  );
  const actual = await computeV3Hash(params);
  check("v3 hash matches the documented EMPLOYER formula, byte for byte", actual === expected, `${actual} vs ${expected}`);
}

check(
  "v2 hash is deterministic — same inputs, same output, every time",
  (await computeV2Hash({
    v1Hash: "a",
    signatureValue: "b",
    candidateEmail: "c",
    timestampUtc: "d",
  })) ===
    (await computeV2Hash({
      v1Hash: "a",
      signatureValue: "b",
      candidateEmail: "c",
      timestampUtc: "d",
    })),
);

check(
  "v2 hash changes if the underlying v1_hash changes — content tampering is detected even though v2 never re-reads content directly",
  (await computeV2Hash({ v1Hash: "a", signatureValue: "b", candidateEmail: "c", timestampUtc: "d" })) !==
    (await computeV2Hash({ v1Hash: "TAMPERED", signatureValue: "b", candidateEmail: "c", timestampUtc: "d" })),
);

check(
  "v3 hash chains off v2Hash — a different v2 (e.g. because v1/content changed) produces a different v3",
  (await computeV3Hash({ v2Hash: "x", signatureValue: "e", employerEmail: "f", timestampUtc: "g" })) !==
    (await computeV3Hash({ v2Hash: "y", signatureValue: "e", employerEmail: "f", timestampUtc: "g" })),
);

// ---------------------------------------------------------------------------
// signatureHashInput — typed vs drawn
// ---------------------------------------------------------------------------
console.log("\n-- signatureHashInput --");

check(
  "typed signature hash input is the trimmed value itself",
  (await signatureHashInput({ method: "typed", value: "  Jane Doe  " })) === "Jane Doe",
);

{
  const pngBytes = Buffer.from([1, 2, 3, 4, 5]);
  const dataUrl = `data:image/png;base64,${pngBytes.toString("base64")}`;
  const expected = await sha256HexOfBytes(new Uint8Array(pngBytes));
  const actual = await signatureHashInput({ method: "drawn", value: dataUrl });
  check(
    "drawn signature hash input is the SHA-256 of the decoded PNG bytes, never the data URL itself",
    actual === expected && actual !== dataUrl,
  );
}

// ---------------------------------------------------------------------------
// buildCompletionCertificate
// ---------------------------------------------------------------------------
console.log("\n-- buildCompletionCertificate --");

const auditEntries = [
  { action: "document_created", created_at: "2026-09-01T00:00:00Z", user_id: "emp-1", document_hash: "v1abc" },
  { action: "candidate_signed", created_at: "2026-09-02T00:00:00Z", user_id: "cand-1", document_hash: "v2abc" },
  { action: "employer_countersigned", created_at: "2026-09-03T00:00:00Z", user_id: "emp-1", document_hash: "v3abc" },
];

const cert = await buildCompletionCertificate({
  documentId: "doc-1",
  documentName: "Offer Letter",
  documentType: "offer_letter",
  v1Hash: "v1abc",
  v1Timestamp: "2026-09-01T00:00:00Z",
  v2Hash: "v2abc",
  v3Hash: "v3abc",
  candidateName: "Cand X",
  candidateEmail: "candx@example.com",
  candidateSignedAt: "2026-09-02T00:00:00Z",
  candidateIp: "203.0.113.5",
  employerName: "Emp Y",
  employerEmail: "empy@example.com",
  employerSignedAt: "2026-09-03T00:00:00Z",
  employerReviewConfirmedAt: "2026-09-03T00:00:00Z",
  employerIp: "203.0.113.9",
  finalPdfHash: "finalpdfhash",
  completionTimestampUtc: "2026-09-03T00:00:01Z",
  auditEntries,
  certificateId: "CERT-FIXED-TEST",
});

check("certificate_id round-trips a supplied id (test determinism, not the default generator)", cert.certificate_id === "CERT-FIXED-TEST");
check("version_history.v1 carries the document's own v1 hash/timestamp", cert.version_history.v1?.hash === "v1abc");
check("version_history.v2 hash is the candidate's signature hash", cert.version_history.v2?.hash === "v2abc");
check("version_history.v3 hash is the employer's signature hash", cert.version_history.v3?.hash === "v3abc");
check("candidate_signature.signing_order_position is 1", cert.candidate_signature?.signing_order_position === 1);
check("employer_signature.signing_order_position is 2", cert.employer_signature?.signing_order_position === 2);
check(
  "candidate_signature.ip_address preserves the candidate's OWN sign-time IP, not the employer's later one",
  cert.candidate_signature?.ip_address === "203.0.113.5",
);
check(
  "employer_signature.ip_address is the employer's own IP, independent of the candidate's",
  cert.employer_signature?.ip_address === "203.0.113.9",
);
check("signing_order is always 'candidate_first'", cert.signing_order === "candidate_first");
check(
  "signing_order_verified is true when the candidate genuinely signed before the employer",
  cert.signing_order_verified === true,
);
check("final_document_hash is final_pdf_hash, not a v1/v2/v3 fallback", cert.final_document_hash === "finalpdfhash");
check("audit_entries_count matches the entries actually passed in", cert.audit_entries_count === 3);
check(
  "audit_trail_hash matches the standalone auditTrailHash() helper for the same entries",
  cert.audit_trail_hash === (await auditTrailHash(auditEntries)),
);
check(
  "compliance_statement is reused verbatim from the existing client copy, not redrafted",
  cert.compliance_statement === COMPLIANCE_STATEMENT && cert.compliance_statement.includes("ESIGN Act"),
);

{
  const outOfOrderCert = await buildCompletionCertificate({
    documentId: "doc-2",
    documentName: "Weird",
    documentType: null,
    v1Hash: null,
    v1Timestamp: null,
    v2Hash: "v2",
    v3Hash: "v3",
    candidateName: "C",
    candidateEmail: "c@example.com",
    candidateSignedAt: "2026-09-05T00:00:00Z",
    candidateIp: "1.1.1.1",
    employerName: "E",
    employerEmail: "e@example.com",
    employerSignedAt: "2026-09-04T00:00:00Z", // before the candidate — should never happen given server-enforced order, but the field must reflect reality
    employerReviewConfirmedAt: "2026-09-04T00:00:00Z",
    employerIp: "2.2.2.2",
    finalPdfHash: "f",
    completionTimestampUtc: "2026-09-04T00:00:01Z",
    auditEntries: [],
  });
  check(
    "signing_order_verified is false if the timestamps are ever out of order (defense-in-depth, not just trusted)",
    outOfOrderCert.signing_order_verified === false,
  );
  check("a null v1Hash renders version_history.v1 as null, not a fabricated entry", outOfOrderCert.version_history.v1 === null);
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
