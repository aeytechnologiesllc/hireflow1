#!/usr/bin/env node
/**
 * Local test runner for the document-signing edge function's authorization
 * decisions — plain assertions, no framework. Imports the real pure
 * functions in supabase/functions/document-signing/stateMachine.ts directly
 * (Node 24+ strips the type annotations natively, no build step), same
 * pattern as scripts/score_aggregation.test.mjs / scripts/step_gate.test.mjs.
 *
 * Covers every 409/403 case docs/DOCUMENT-SIGNING.md §1 lists for
 * sign/countersign/decline, the signature/decline-reason payload
 * validators, and role resolution — including the empty-assigned-job-ids
 * team-member case the must-change fix in protect_document_columns()
 * addresses (array_length(...,1) IS NULL semantics, not a plain IS NULL).
 *
 * Run with: node scripts/document_signing_state_machine.test.mjs
 */
import {
  canCountersign,
  canDecline,
  canSign,
  canVoid,
  canWithdraw,
  resolveDocumentRole,
  validateDeclineReason,
  validateReviewConfirmed,
  validateSignaturePayload,
} from "../supabase/functions/document-signing/stateMachine.ts";

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

const NOW = new Date("2026-09-16T12:00:00.000Z");

function doc(overrides = {}) {
  return {
    status: "pending",
    candidateSignedAt: null,
    employerSignedAt: null,
    isLocked: false,
    isVoided: false,
    expiresAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveDocumentRole
// ---------------------------------------------------------------------------
console.log("\n-- resolveDocumentRole --");

check(
  "the application's candidate resolves to 'candidate'",
  resolveDocumentRole({
    callerId: "cand-1",
    candidateId: "cand-1",
    employerId: "emp-1",
    jobId: "job-1",
    teamMemberships: [],
  }) === "candidate",
);

check(
  "the job's employer resolves to 'employer'",
  resolveDocumentRole({
    callerId: "emp-1",
    candidateId: "cand-1",
    employerId: "emp-1",
    jobId: "job-1",
    teamMemberships: [],
  }) === "employer",
);

check(
  "an unrelated caller resolves to null",
  resolveDocumentRole({
    callerId: "stranger",
    candidateId: "cand-1",
    employerId: "emp-1",
    jobId: "job-1",
    teamMemberships: [],
  }) === null,
);

check(
  "an active team member with assignedJobIds=null (every job) resolves to 'employer'",
  resolveDocumentRole({
    callerId: "tm-1",
    candidateId: "cand-1",
    employerId: "emp-1",
    jobId: "job-1",
    teamMemberships: [
      { userId: "tm-1", employerId: "emp-1", status: "active", canSendDocuments: true, assignedJobIds: null },
    ],
  }) === "employer",
);

// The must-change fix: array_length(assigned_job_ids, 1) IS NULL is ALSO
// true for '{}'::uuid[], not only a genuine NULL — so an empty array must
// resolve the same way null does (every job), matching the live RLS policy
// and public.is_active_team_member_for_job()'s own convention.
check(
  "an active team member with assignedJobIds=[] (also 'every job', per array_length(...,1) IS NULL) resolves to 'employer'",
  resolveDocumentRole({
    callerId: "tm-2",
    candidateId: "cand-1",
    employerId: "emp-1",
    jobId: "job-1",
    teamMemberships: [
      { userId: "tm-2", employerId: "emp-1", status: "active", canSendDocuments: true, assignedJobIds: [] },
    ],
  }) === "employer",
);

check(
  "a team member scoped to OTHER jobs only resolves to null for this job",
  resolveDocumentRole({
    callerId: "tm-3",
    candidateId: "cand-1",
    employerId: "emp-1",
    jobId: "job-1",
    teamMemberships: [
      {
        userId: "tm-3",
        employerId: "emp-1",
        status: "active",
        canSendDocuments: true,
        assignedJobIds: ["job-99"],
      },
    ],
  }) === null,
);

check(
  "an inactive team member never resolves to 'employer'",
  resolveDocumentRole({
    callerId: "tm-4",
    candidateId: "cand-1",
    employerId: "emp-1",
    jobId: "job-1",
    teamMemberships: [
      { userId: "tm-4", employerId: "emp-1", status: "removed", canSendDocuments: true, assignedJobIds: null },
    ],
  }) === null,
);

check(
  "a team member without can_send_documents never resolves to 'employer'",
  resolveDocumentRole({
    callerId: "tm-5",
    candidateId: "cand-1",
    employerId: "emp-1",
    jobId: "job-1",
    teamMemberships: [
      { userId: "tm-5", employerId: "emp-1", status: "active", canSendDocuments: false, assignedJobIds: null },
    ],
  }) === null,
);

// ---------------------------------------------------------------------------
// canSign
// ---------------------------------------------------------------------------
console.log("\n-- canSign --");

check("candidate can sign a fresh pending document", canSign(doc(), "candidate", NOW).ok === true);
check(
  "employer cannot sign (role_mismatch)",
  canSign(doc(), "employer", NOW).error === "role_mismatch",
);
check(
  "null role cannot sign (role_mismatch)",
  canSign(doc(), null, NOW).error === "role_mismatch",
);
check(
  "already-signed candidate cannot sign again (already_signed)",
  canSign(doc({ candidateSignedAt: "2026-09-01T00:00:00Z" }), "candidate", NOW).error === "already_signed",
);
check(
  "a signed document cannot be signed (not_pending)",
  canSign(doc({ status: "signed" }), "candidate", NOW).error === "not_pending",
);
check(
  "a declined document cannot be signed (not_pending)",
  canSign(doc({ status: "declined" }), "candidate", NOW).error === "not_pending",
);
check(
  "a locked document cannot be signed (locked)",
  canSign(doc({ isLocked: true }), "candidate", NOW).error === "locked",
);
check(
  "an expired document cannot be signed (expired)",
  canSign(doc({ expiresAt: "2026-09-01T00:00:00Z" }), "candidate", NOW).error === "expired",
);
check(
  "a not-yet-expired document can still be signed",
  canSign(doc({ expiresAt: "2026-10-01T00:00:00Z" }), "candidate", NOW).ok === true,
);
check(
  "a voided document cannot be signed (voided), even if otherwise pending",
  canSign(doc({ isVoided: true }), "candidate", NOW).error === "voided",
);

// ---------------------------------------------------------------------------
// canCountersign — signing-order enforcement lives here
// ---------------------------------------------------------------------------
console.log("\n-- canCountersign --");

check(
  "employer cannot countersign before the candidate has signed (candidate_has_not_signed)",
  canCountersign(doc(), "employer", NOW).error === "candidate_has_not_signed",
);
check(
  "employer CAN countersign once the candidate has signed",
  canCountersign(doc({ candidateSignedAt: "2026-09-01T00:00:00Z" }), "employer", NOW).ok === true,
);
check(
  "candidate cannot countersign (role_mismatch) — countersign is employer-only",
  canCountersign(doc({ candidateSignedAt: "2026-09-01T00:00:00Z" }), "candidate", NOW).error === "role_mismatch",
);
check(
  "already-countersigned document cannot be countersigned again (already_signed)",
  canCountersign(
    doc({ candidateSignedAt: "2026-09-01T00:00:00Z", employerSignedAt: "2026-09-02T00:00:00Z" }),
    "employer",
    NOW,
  ).error === "already_signed",
);
check(
  "a locked document cannot be countersigned (locked)",
  canCountersign(doc({ candidateSignedAt: "2026-09-01T00:00:00Z", isLocked: true }), "employer", NOW).error ===
    "locked",
);
check(
  "an expired document cannot be countersigned (expired)",
  canCountersign(
    doc({ candidateSignedAt: "2026-09-01T00:00:00Z", expiresAt: "2026-09-10T00:00:00Z" }),
    "employer",
    NOW,
  ).error === "expired",
);
check(
  "a voided document cannot be countersigned (voided)",
  canCountersign(
    doc({ candidateSignedAt: "2026-09-01T00:00:00Z", isVoided: true }),
    "employer",
    NOW,
  ).error === "voided",
);

// ---------------------------------------------------------------------------
// canDecline — "only while it's actually their turn to act"
// ---------------------------------------------------------------------------
console.log("\n-- canDecline --");

check("candidate can decline before signing", canDecline(doc(), "candidate", NOW).ok === true);
check(
  "candidate cannot decline after they've already signed (not_your_turn)",
  canDecline(doc({ candidateSignedAt: "2026-09-01T00:00:00Z" }), "candidate", NOW).error === "not_your_turn",
);
check(
  "employer cannot decline before the candidate has signed (not_your_turn — that's a void, out of scope here)",
  canDecline(doc(), "employer", NOW).error === "not_your_turn",
);
check(
  "employer CAN decline while reviewing the candidate's signature",
  canDecline(doc({ candidateSignedAt: "2026-09-01T00:00:00Z" }), "employer", NOW).ok === true,
);
check(
  "employer cannot decline after they've already countersigned (not_your_turn)",
  canDecline(
    doc({ candidateSignedAt: "2026-09-01T00:00:00Z", employerSignedAt: "2026-09-02T00:00:00Z" }),
    "employer",
    NOW,
  ).error === "not_your_turn",
);
check(
  "a signed document cannot be declined by either party (not_pending)",
  canDecline(doc({ status: "signed" }), "candidate", NOW).error === "not_pending",
);

// ---------------------------------------------------------------------------
// canWithdraw — the sender cancels before the candidate signs
// ---------------------------------------------------------------------------
console.log("\n-- canWithdraw --");

check("employer can withdraw a fresh pending document", canWithdraw(doc(), "employer").ok === true);
check(
  "candidate cannot withdraw (role_mismatch) — withdraw is employer-only",
  canWithdraw(doc(), "candidate").error === "role_mismatch",
);
check(
  "null role cannot withdraw (role_mismatch)",
  canWithdraw(doc(), null).error === "role_mismatch",
);
check(
  "a document the candidate already signed cannot be withdrawn (candidate_already_signed) — that's a void",
  canWithdraw(doc({ candidateSignedAt: "2026-09-01T00:00:00Z" }), "employer").error === "candidate_already_signed",
);
check(
  "a signed document cannot be withdrawn (not_pending)",
  canWithdraw(doc({ status: "signed" }), "employer").error === "not_pending",
);
check(
  "a declined document cannot be withdrawn (not_pending)",
  canWithdraw(doc({ status: "declined" }), "employer").error === "not_pending",
);
check(
  "a locked document cannot be withdrawn (locked) — reported before the generic not_pending",
  canWithdraw(doc({ status: "signed", isLocked: true }), "employer").error === "locked",
);
check(
  "an already-voided document cannot be withdrawn again (voided)",
  canWithdraw(doc({ isVoided: true }), "employer").error === "voided",
);
check(
  "withdraw is NOT blocked by expiry — it's an administrative cancel, not a step in the signing flow",
  canWithdraw(doc({ expiresAt: "2026-01-01T00:00:00Z" }), "employer").ok === true,
);

// ---------------------------------------------------------------------------
// canVoid — the employer cancels after the candidate signed, before
// countersigning
// ---------------------------------------------------------------------------
console.log("\n-- canVoid --");

check(
  "employer can void a document the candidate has signed",
  canVoid(doc({ candidateSignedAt: "2026-09-01T00:00:00Z" }), "employer").ok === true,
);
check(
  "candidate cannot void (role_mismatch) — void is employer-only",
  canVoid(doc({ candidateSignedAt: "2026-09-01T00:00:00Z" }), "candidate").error === "role_mismatch",
);
check(
  "a document the candidate hasn't signed yet cannot be voided (candidate_has_not_signed) — that's a withdraw",
  canVoid(doc(), "employer").error === "candidate_has_not_signed",
);
check(
  "a fully countersigned, locked document cannot be voided (locked) — completed documents are out of scope for this pass",
  canVoid(doc({ candidateSignedAt: "2026-09-01T00:00:00Z", employerSignedAt: "2026-09-02T00:00:00Z", status: "signed", isLocked: true }), "employer")
    .error === "locked",
);
check(
  "a document mid-countersign (employer_signed_at reserved, not yet finalized) cannot be voided (countersign_in_progress)",
  canVoid(doc({ candidateSignedAt: "2026-09-01T00:00:00Z", employerSignedAt: "2026-09-02T00:00:01Z" }), "employer").error ===
    "countersign_in_progress",
);
check(
  "a declined document cannot be voided (not_pending)",
  canVoid(doc({ status: "declined", candidateSignedAt: "2026-09-01T00:00:00Z" }), "employer").error === "not_pending",
);
check(
  "an already-voided document cannot be voided again (voided)",
  canVoid(doc({ candidateSignedAt: "2026-09-01T00:00:00Z", isVoided: true }), "employer").error === "voided",
);
check(
  "void is NOT blocked by expiry — it's an administrative cancel, not a step in the signing flow",
  canVoid(doc({ candidateSignedAt: "2026-09-01T00:00:00Z", expiresAt: "2026-01-01T00:00:00Z" }), "employer").ok === true,
);

// ---------------------------------------------------------------------------
// validateSignaturePayload
// ---------------------------------------------------------------------------
console.log("\n-- validateSignaturePayload --");

check(
  "missing consent is rejected regardless of signature shape",
  validateSignaturePayload({ method: "typed", value: "Jane Doe" }).error === "consent_required",
);
check(
  "a valid typed signature is accepted",
  validateSignaturePayload({ method: "typed", value: "Jane Doe", consentAccepted: true }).ok === true,
);
check(
  "a 1-character typed signature is rejected (below the 2-char floor)",
  validateSignaturePayload({ method: "typed", value: "J", consentAccepted: true }).error === "invalid_signature",
);
check(
  "a typed signature over 120 chars is rejected",
  validateSignaturePayload({ method: "typed", value: "x".repeat(121), consentAccepted: true }).error ===
    "invalid_signature",
);
check(
  "whitespace-only typed signature is rejected (trims to empty)",
  validateSignaturePayload({ method: "typed", value: "   ", consentAccepted: true }).error === "invalid_signature",
);
check(
  "a valid small drawn PNG is accepted",
  validateSignaturePayload({
    method: "drawn",
    value: `data:image/png;base64,${Buffer.alloc(100, 1).toString("base64")}`,
    consentAccepted: true,
  }).ok === true,
);
check(
  "a drawn signature over 200KB decoded is rejected",
  validateSignaturePayload({
    method: "drawn",
    value: `data:image/png;base64,${Buffer.alloc(300 * 1024, 1).toString("base64")}`,
    consentAccepted: true,
  }).error === "invalid_signature",
);
check(
  "a drawn signature that isn't actually a PNG data URL is rejected",
  validateSignaturePayload({
    method: "drawn",
    value: "data:image/jpeg;base64,AAAA",
    consentAccepted: true,
  }).error === "invalid_signature",
);
check(
  "an unknown method is rejected",
  validateSignaturePayload({ method: "voice", value: "x", consentAccepted: true }).error === "invalid_signature",
);

// ---------------------------------------------------------------------------
// validateReviewConfirmed / validateDeclineReason
// ---------------------------------------------------------------------------
console.log("\n-- validateReviewConfirmed / validateDeclineReason --");

check("reviewConfirmed=true passes", validateReviewConfirmed(true).ok === true);
check("reviewConfirmed missing fails (review_required)", validateReviewConfirmed(undefined).error === "review_required");
check("reviewConfirmed='true' (string) fails — must be the boolean true", validateReviewConfirmed("true").error === "review_required");

check("a 3-char decline reason passes (floor)", validateDeclineReason("bad").ok === true);
check("a 2-char decline reason fails (below floor)", validateDeclineReason("no").ok === false);
check("a 501-char decline reason fails (above ceiling)", validateDeclineReason("x".repeat(501)).ok === false);
check("a decline reason is trimmed before length-checked", validateDeclineReason("  ok reason  ").value === "ok reason");
check("a missing decline reason fails", validateDeclineReason(undefined).ok === false);

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
