#!/usr/bin/env node
/**
 * Local test runner for src/lib/billingVisibility.ts's computeBillingVisibleIds
 * — plain assertions, no framework, same style as scripts/step_gate.test.mjs.
 *
 * This is a regression test for a review finding: the employer applicant
 * list (src/cockpit/pages/Applicants.tsx) rendered every candidate's full
 * card regardless of a locked job's paid allowance, so the $49 unlock / $25
 * pack paywall was purely decorative — an employer got full value (every
 * name, score, Ava analysis) without ever paying. Fixed by filtering the
 * list through computeBillingVisibleIds before it reaches the tab split,
 * counts, and pagination. This file proves the pure allowance/arrival-order
 * math in isolation; scripts/job_billing_schema.pglite.test.mjs proves the
 * server-side processedAllowance/sealedCount numbers this reads.
 *
 * Run with: node scripts/billing_visibility.test.mjs
 */
import assert from "node:assert/strict";
import { computeBillingVisibleIds } from "../src/lib/billingVisibility.ts";

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

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
