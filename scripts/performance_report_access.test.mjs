#!/usr/bin/env node
/**
 * Local test runner for the ai-generate-performance-report access decision:
 * plain assertions, no framework. Exercises `canAccessPerformanceReport`
 * from supabase/functions/_shared/performanceReportAccess.ts over every
 * caller shape that matters: the candidate (always, free: applicants never
 * pay on HireFlow, 2026-10-11), a total stranger, the job's employer, and an
 * active team member scoped to the job.
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

check("blocks a total stranger (not the candidate, not employer-side)", canAccessPerformanceReport({ isCandidateOwner: false, isEmployerSide: false }) === false);
check("allows the application's own candidate, with no purchase", canAccessPerformanceReport({ isCandidateOwner: true, isEmployerSide: false }) === true);
check("allows the job's employer / a scoped team member", canAccessPerformanceReport({ isCandidateOwner: false, isEmployerSide: true }) === true);
check("a candidate who is also employer-side is allowed", canAccessPerformanceReport({ isCandidateOwner: true, isEmployerSide: true }) === true);

// The decision takes no payment or billing input at all.
check(
  "no payment or billing switch can lock the candidate out",
  canAccessPerformanceReport({ isCandidateOwner: true, isEmployerSide: false, hasPurchasedBlueprint: false, billingEnabled: true }) === true,
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
