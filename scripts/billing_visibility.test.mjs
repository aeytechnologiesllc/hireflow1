#!/usr/bin/env node
/**
 * Local test runner for src/lib/billingVisibility.ts — plain assertions, no
 * framework, same style as scripts/step_gate.test.mjs.
 *
 * Two generations of the same review finding, both covered here:
 *
 *   1. computeBillingVisibleIds: the employer applicant list
 *      (src/cockpit/pages/Applicants.tsx) rendered every candidate's full
 *      card regardless of a locked job's paid allowance, so the $49 unlock /
 *      $25 pack paywall was purely decorative. Fixed by filtering the list
 *      through this before it reaches the tab split, counts, and pagination.
 *   2. redactSealedApplication(s): that first fix only ever filtered ONE
 *      component's already-fully-populated rendered array — the raw rows
 *      (name, AI score, Ava's analysis, resume) were still sitting in the
 *      network response and query cache regardless, and other pages
 *      (the dashboard activity feed, Messages, Interviews, the
 *      /applicants/:id detail route) reached the same data with no gate at
 *      all. This redacts the DATA itself, at the two hooks that fetch raw
 *      `applications` rows (useEmployerApplications, useActivityFeed), so
 *      every consumer of that data inherits the gate for free.
 *
 * This file proves the pure allowance/arrival-order and redaction math in
 * isolation; scripts/job_billing_schema.pglite.test.mjs proves the
 * server-side processedAllowance/sealedCount/get_employer_sealed_application_ids
 * numbers both of these read.
 *
 * Run with: node scripts/billing_visibility.test.mjs
 */
import assert from "node:assert/strict";
import {
  computeBillingVisibleIds,
  redactSealedApplication,
  redactSealedApplications,
  SEALED_APPLICANT_NAME,
} from "../src/lib/billingVisibility.ts";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
  }
}

const FIVE = [
  { id: "a1", createdAt: "2026-09-01T00:00:00Z" },
  { id: "a2", createdAt: "2026-09-02T00:00:00Z" },
  { id: "a3", createdAt: "2026-09-03T00:00:00Z" },
  { id: "a4", createdAt: "2026-09-04T00:00:00Z" },
  { id: "a5", createdAt: "2026-09-05T00:00:00Z" },
];

console.log("\n-- billing off: never hides anything, regardless of lock state --");
test("billingEnabled: false returns null even when isLocked is true", () => {
  const result = computeBillingVisibleIds(FIVE, { billingEnabled: false, isLocked: true, processedAllowance: 3 });
  assert.equal(result, null);
});
test("no billing snapshot at all (undefined) returns null", () => {
  assert.equal(computeBillingVisibleIds(FIVE, undefined), null);
});
test("null billing snapshot returns null", () => {
  assert.equal(computeBillingVisibleIds(FIVE, null), null);
});

console.log("\n-- billing on, job not locked: nothing to seal --");
test("isLocked: false returns null even though there are more applicants than the allowance", () => {
  // Pathological input (allowance says 3 but isLocked false) — isLocked is
  // still the authority, since it is what the server actually computed from
  // the same numbers server-side.
  const result = computeBillingVisibleIds(FIVE, { billingEnabled: true, isLocked: false, processedAllowance: 3 });
  assert.equal(result, null);
});

console.log("\n-- billing on, job locked: the actual paywall --");
test("keeps exactly `processedAllowance` ids, earliest arrivals first", () => {
  const result = computeBillingVisibleIds(FIVE, { billingEnabled: true, isLocked: true, processedAllowance: 3 });
  assert.deepEqual([...result].sort(), ["a1", "a2", "a3"]);
  assert.equal(result.size, 3);
});
test("out-of-order input is still sorted by arrival before slicing", () => {
  const shuffled = [FIVE[3], FIVE[0], FIVE[4], FIVE[2], FIVE[1]]; // a4, a1, a5, a3, a2
  const result = computeBillingVisibleIds(shuffled, { billingEnabled: true, isLocked: true, processedAllowance: 3 });
  assert.deepEqual([...result].sort(), ["a1", "a2", "a3"]);
});
test("the free-3 baseline: first unlock's allowance (3 + 25) keeps everyone when there are only 5", () => {
  const result = computeBillingVisibleIds(FIVE, { billingEnabled: true, isLocked: true, processedAllowance: 28 });
  assert.equal(result.size, 5);
});
test("allowance of 0 hides everyone (defensive: never negative-slices)", () => {
  const result = computeBillingVisibleIds(FIVE, { billingEnabled: true, isLocked: true, processedAllowance: -5 });
  assert.equal(result.size, 0);
});
test("empty applicant list with a locked job returns an empty (not null) set", () => {
  const result = computeBillingVisibleIds([], { billingEnabled: true, isLocked: true, processedAllowance: 3 });
  assert.notEqual(result, null);
  assert.equal(result.size, 0);
});
test("missing created_at (empty string) sorts first, never pushed out ahead of a real timestamp", () => {
  const withMissing = [
    { id: "no-date", createdAt: "" },
    ...FIVE,
  ];
  const result = computeBillingVisibleIds(withMissing, { billingEnabled: true, isLocked: true, processedAllowance: 1 });
  assert.deepEqual([...result], ["no-date"]);
});

console.log("\n-- redactSealedApplication: the actual data-level close of the paywall bypass --");
console.log("   (a prior fix only filtered one component's rendered array; the raw rows were");
console.log("   still fully populated in the network response and query cache regardless of");
console.log("   which page reached them — see the migration comment on");
console.log("   get_employer_sealed_application_ids() for the full finding this closes)");

function fakeApp(overrides = {}) {
  return {
    id: "app-1",
    job_id: "job-1",
    candidate_id: "cand-1",
    status: "pending",
    ai_analysis: "Strong candidate, 5 years experience.",
    ai_score: 88,
    ai_scorecard: { recommendedAction: "advance" },
    phase_ai_analysis: "Great quiz answers.",
    resume_score: 90,
    resume_url: "https://example.com/resume.pdf",
    cover_letter: "Dear hiring manager...",
    notes: JSON.stringify({ quiz: { score: 92 } }),
    voice_interview_recording_url: "https://example.com/rec.mp4",
    voice_interview_transcript: [{ speaker: "candidate", text: "Hello" }],
    voice_interview_result: { overallScore: 91 },
    employer_notes: "Employer's own note — must survive redaction.",
    profiles: {
      full_name: "Jane Doe",
      email: "jane@example.com",
      avatar_url: "https://example.com/avatar.png",
      resume_url: "https://example.com/profile-resume.pdf",
      phone: "555-1234",
      linkedin_url: "https://linkedin.com/in/janedoe",
      portfolio_url: "https://janedoe.dev",
      bio: "Senior engineer with a decade of experience.",
      skills: ["React", "Postgres"],
      job_title: "Senior Engineer",
    },
    ...overrides,
  };
}

test("blanks the AI score, Ava's analysis/scorecard, resume, cover letter, and voice artifacts", () => {
  const redacted = redactSealedApplication(fakeApp());
  assert.equal(redacted.ai_analysis, null);
  assert.equal(redacted.ai_score, null);
  assert.equal(redacted.ai_scorecard, null);
  assert.equal(redacted.phase_ai_analysis, null);
  assert.equal(redacted.resume_score, null);
  assert.equal(redacted.resume_url, null);
  assert.equal(redacted.cover_letter, null);
  assert.equal(redacted.voice_interview_recording_url, null);
  assert.equal(redacted.voice_interview_transcript, null);
  assert.equal(redacted.voice_interview_result, null);
});
test("blanks notes — the shared JSON blob a quiz score can also hide in (extractQuizScore reads notes.quiz.score)", () => {
  const redacted = redactSealedApplication(fakeApp());
  assert.equal(redacted.notes, null);
});
test("replaces the candidate's identity with the fixed placeholder, never real name/email/contact/resume", () => {
  const redacted = redactSealedApplication(fakeApp());
  assert.equal(redacted.profiles.full_name, SEALED_APPLICANT_NAME);
  assert.equal(redacted.profiles.email, "");
  assert.equal(redacted.profiles.avatar_url, null);
  assert.equal(redacted.profiles.resume_url, null);
  assert.equal(redacted.profiles.phone, null);
  assert.equal(redacted.profiles.linkedin_url, null);
  assert.equal(redacted.profiles.portfolio_url, null);
  assert.equal(redacted.profiles.bio, null);
  assert.deepEqual(redacted.profiles.skills, null);
});
test("never Ava/AI wording in the placeholder name (candidates never see it, but neither should this string imply AI)", () => {
  assert.ok(!/ava|ai\b/i.test(SEALED_APPLICANT_NAME));
});
test("leaves the row's own identity/status/mutation fields alone — advance/hire/reject must keep working", () => {
  const redacted = redactSealedApplication(fakeApp());
  assert.equal(redacted.id, "app-1");
  assert.equal(redacted.job_id, "job-1");
  assert.equal(redacted.candidate_id, "cand-1");
  assert.equal(redacted.status, "pending");
});
test("leaves the employer's OWN notes about the candidate untouched — that's their content, not the candidate's", () => {
  const redacted = redactSealedApplication(fakeApp());
  assert.equal(redacted.employer_notes, "Employer's own note — must survive redaction.");
});
test("a null profile (no joined candidate row) stays null, not a thrown error", () => {
  const redacted = redactSealedApplication(fakeApp({ profiles: null }));
  assert.equal(redacted.profiles, null);
});
test("other profile fields not named in the redaction list (e.g. job_title) pass through untouched", () => {
  const redacted = redactSealedApplication(fakeApp());
  assert.equal(redacted.profiles.job_title, "Senior Engineer");
});

console.log("\n-- redactSealedApplications: applies the above by id, leaves everything else untouched --");
test("redacts only rows whose id is in the sealed set; others are the exact same reference (no-op)", () => {
  const sealed = fakeApp({ id: "sealed-1" });
  const visible = fakeApp({ id: "visible-1" });
  const result = redactSealedApplications([sealed, visible], new Set(["sealed-1"]));
  assert.equal(result[0].profiles.full_name, SEALED_APPLICANT_NAME);
  assert.equal(result[1], visible); // untouched: same object reference
  assert.equal(result[1].profiles.full_name, "Jane Doe");
});
test("a null/undefined sealed-id set is a total no-op (billing off / not yet loaded) — same references back", () => {
  const apps = [fakeApp({ id: "a" }), fakeApp({ id: "b" })];
  assert.equal(redactSealedApplications(apps, null), apps);
  assert.equal(redactSealedApplications(apps, undefined), apps);
});
test("an empty sealed-id set is also a total no-op", () => {
  const apps = [fakeApp({ id: "a" })];
  assert.equal(redactSealedApplications(apps, new Set()), apps);
});
test("every id in the sealed set gets redacted, not just the first match", () => {
  const apps = [fakeApp({ id: "a" }), fakeApp({ id: "b" }), fakeApp({ id: "c" })];
  const result = redactSealedApplications(apps, new Set(["a", "c"]));
  assert.equal(result[0].profiles.full_name, SEALED_APPLICANT_NAME);
  assert.equal(result[1].profiles.full_name, "Jane Doe");
  assert.equal(result[2].profiles.full_name, SEALED_APPLICANT_NAME);
});

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
