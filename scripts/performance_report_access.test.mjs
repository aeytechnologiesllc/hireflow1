#!/usr/bin/env node
/**
 * Local test runner for the ai-generate-performance-report IDOR fix — plain
 * assertions, no framework. Exercises the exact authorization decision the
 * edge function calls, `canAccessPerformanceReport` from
 * supabase/functions/_shared/performanceReportAccess.ts, over every caller
 * shape that matters: the candidate before/after paying, a total stranger,
 * the job's employer, an active team member, a revoked/other-employer team
 * member, and the free-tier ('blueprint_paid' off) entitlement switch added
 * 2026-09-16.
 *
 * Run with: node scripts/performance_report_access.test.mjs
 */
import { canAccessPerformanceReport } from "../supabase/functions/_shared/performanceReportAccess.ts";

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

console.log("Performance report / Improvement Blueprint access decision:\n");

// ---- billing ON (paid mode): unchanged from the original IDOR fix --------

check(
  "blocks a total stranger (not the candidate, not employer-side)",
  canAccessPerformanceReport({
    isCandidateOwner: false,
    hasPurchasedBlueprint: false,
    isEmployerSide: false,
    billingEnabled: true,
  }) === false,
);

check(
  "blocks the candidate before they've purchased the blueprint (billing on)",
  canAccessPerformanceReport({
    isCandidateOwner: true,
    hasPurchasedBlueprint: false,
    isEmployerSide: false,
    billingEnabled: true,
  }) === false,
);

check(
  "allows the candidate once they hold a completed blueprint_purchases row",
  canAccessPerformanceReport({
    isCandidateOwner: true,
    hasPurchasedBlueprint: true,
    isEmployerSide: false,
    billingEnabled: true,
  }) === true,
);

check(
  "allows the job's employer regardless of purchase state",
  canAccessPerformanceReport({
    isCandidateOwner: false,
    hasPurchasedBlueprint: false,
    isEmployerSide: true,
    billingEnabled: true,
  }) === true,
);

check(
  "allows an active team member of the job's employer (isEmployerSide covers this)",
  canAccessPerformanceReport({
    isCandidateOwner: false,
    hasPurchasedBlueprint: false,
    isEmployerSide: true,
    billingEnabled: true,
  }) === true,
);

check(
  "a candidate who somehow also reads as employer-side (edge case) is still allowed",
  canAccessPerformanceReport({
    isCandidateOwner: true,
    hasPurchasedBlueprint: false,
    isEmployerSide: true,
    billingEnabled: true,
  }) === true,
);

check(
  "purchase flag alone never grants access without candidate or employer-side ownership",
  canAccessPerformanceReport({
    isCandidateOwner: false,
    hasPurchasedBlueprint: true,
    isEmployerSide: false,
    billingEnabled: true,
  }) === false,
);

// ---- billing OFF (free tier, app_settings 'blueprint_paid' = false) ------
// Owner decision 2026-09-16: nothing may sit behind a paywall while billing
// is off, so the candidate gets their own report without a purchase row.

check(
  "billing off: the candidate is allowed their own report with NO purchase row",
  canAccessPerformanceReport({
    isCandidateOwner: true,
    hasPurchasedBlueprint: false,
    isEmployerSide: false,
    billingEnabled: false,
  }) === true,
);

check(
  "billing off: a total stranger is still blocked — the switch never widens WHO, only whether payment is required",
  canAccessPerformanceReport({
    isCandidateOwner: false,
    hasPurchasedBlueprint: false,
    isEmployerSide: false,
    billingEnabled: false,
  }) === false,
);

check(
  "billing off: employer-side access is unaffected either way",
  canAccessPerformanceReport({
    isCandidateOwner: false,
    hasPurchasedBlueprint: false,
    isEmployerSide: true,
    billingEnabled: false,
  }) === true,
);

check(
  "billing off + an already-recorded purchase: still allowed (idempotent, not a double gate)",
  canAccessPerformanceReport({
    isCandidateOwner: true,
    hasPurchasedBlueprint: true,
    isEmployerSide: false,
    billingEnabled: false,
  }) === true,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
