#!/usr/bin/env node
/**
 * Local test runner for the job-billing pricing/entitlement math and the Ava
 * Boost worker's state machine — plain assertions, no framework. Imports the
 * real, pure functions in supabase/functions/_shared/jobBillingPricing.ts
 * directly (Node 24+ strips the type annotations natively, no build step).
 *
 * This is the Node-side twin of scripts/job_billing_schema.pglite.test.mjs's
 * SQL entitlement functions — same numbers, proven two ways.
 *
 * Run with: node scripts/job_billing_pricing.test.mjs
 */
import {
  FREE_APPLICANTS,
  UNLOCK_PRICE_CENTS,
  PACK_PRICE_CENTS,
  VOICE_OVERAGE_PRICE_CENTS,
  BOOST_TIERS_CENTS,
  BOOST_MIN_RADIUS_MILES,
  isBoostTierCents,
  computeProcessedAllowance,
  computeSealedCount,
  isJobLocked,
  isNextVoiceInterviewBillable,
  unlockExpiresAt,
  boostHoldExpiresAt,
  nextBoostWorkerAction,
  UNLOCK_DURATION_DAYS,
  BOOST_HOLD_HOURS,
  BOOST_MAX_AUTO_RETRIES,
} from "../supabase/functions/_shared/jobBillingPricing.ts";

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

console.log("-- decided price points (owner, 2026-08-27) --");
check("unlock is $49.00", UNLOCK_PRICE_CENTS === 4900);
check("pack is $25.00", PACK_PRICE_CENTS === 2500);
check("voice overage is $2.00", VOICE_OVERAGE_PRICE_CENTS === 200);
check("boost tiers are $79/$149/$299", JSON.stringify(BOOST_TIERS_CENTS) === JSON.stringify([7900, 14900, 29900]));
check("boost radius floor is >= 15 miles (Employment special ad category)", BOOST_MIN_RADIUS_MILES === 15);
check("isBoostTierCents accepts 7900/14900/29900", [7900, 14900, 29900].every(isBoostTierCents));
check("isBoostTierCents rejects an arbitrary amount", !isBoostTierCents(5000) && !isBoostTierCents("7900"));

console.log("\n-- processed allowance (high-water mark) --");
check("no unlock, no packs -> 3 free", computeProcessedAllowance({ completedUnlockCount: 0, activePackCount: 0 }) === 3);
check("1 unlock -> 3 + 25 = 28", computeProcessedAllowance({ completedUnlockCount: 1, activePackCount: 0 }) === 28);
check("1 unlock + 2 packs -> 3 + 25 + 50 = 78", computeProcessedAllowance({ completedUnlockCount: 1, activePackCount: 2 }) === 78);
check("2 unlocks (re-unlocked once) -> 3 + 50 = 53", computeProcessedAllowance({ completedUnlockCount: 2, activePackCount: 0 }) === 53);
check("negative/garbage inputs floor at zero, never go negative", computeProcessedAllowance({ completedUnlockCount: -5, activePackCount: -1 }) === 3);

console.log("\n-- sealed count / lock state --");
check("3 applicants, never unlocked -> 0 sealed, not locked", computeSealedCount({ applicantCount: 3, allowance: 3 }) === 0 && !isJobLocked({ applicantCount: 3, allowance: 3 }));
check("4 applicants, never unlocked -> 1 sealed, locked", computeSealedCount({ applicantCount: 4, allowance: 3 }) === 1 && isJobLocked({ applicantCount: 4, allowance: 3 }));
check(
  "the example from the spec: locked job shows '7 more waiting'",
  computeSealedCount({ applicantCount: 10, allowance: 3 }) === 7,
);
check("applicant count never negative-seals", computeSealedCount({ applicantCount: 0, allowance: 28 }) === 0);

console.log("\n-- voice interview billability --");
check("never unlocked -> unmetered even after 50 prior interviews", !isNextVoiceInterviewBillable({ completedUnlockCount: 0, priorSettledInterviewCount: 50 }));
check("unlocked, interview #1 (0 prior) -> included", !isNextVoiceInterviewBillable({ completedUnlockCount: 1, priorSettledInterviewCount: 0 }));
check("unlocked, interview #10 (9 prior) -> still included", !isNextVoiceInterviewBillable({ completedUnlockCount: 1, priorSettledInterviewCount: 9 }));
check("unlocked, interview #11 (10 prior) -> billable", isNextVoiceInterviewBillable({ completedUnlockCount: 1, priorSettledInterviewCount: 10 }));
check("unlocked, interview #12 (11 prior) -> still billable", isNextVoiceInterviewBillable({ completedUnlockCount: 1, priorSettledInterviewCount: 11 }));

console.log("\n-- unlock / boost hold expiry math --");
{
  const start = new Date("2026-09-16T00:00:00.000Z");
  const expires = unlockExpiresAt(start);
  check(`unlock window is exactly ${UNLOCK_DURATION_DAYS} days`, expires.getTime() - start.getTime() === UNLOCK_DURATION_DAYS * 24 * 60 * 60 * 1000);
}
{
  const start = new Date("2026-09-16T00:00:00.000Z");
  const expires = boostHoldExpiresAt(start);
  check(`boost hold expires in exactly ${BOOST_HOLD_HOURS}h`, expires.getTime() - start.getTime() === BOOST_HOLD_HOURS * 60 * 60 * 1000);
}

console.log("\n-- Ava Boost worker state machine --");
{
  const now = new Date("2026-09-16T12:00:00.000Z");
  const authorizedAt = new Date("2026-09-16T00:00:00.000Z"); // 12h ago, hold not expired (24h)
  const holdExpiresAt = boostHoldExpiresAt(authorizedAt);

  check(
    "pending_payment: no action until the webhook authorizes the hold",
    nextBoostWorkerAction({ status: "pending_payment", retryCount: 0, authorizedAt: null, holdExpiresAt: null, metaCampaignId: null, metaReviewStatus: null }, now).kind === "noop",
  );
  check(
    "authorized, no campaign yet, hold not expired -> create_campaign",
    nextBoostWorkerAction({ status: "authorized", retryCount: 0, authorizedAt, holdExpiresAt, metaCampaignId: null, metaReviewStatus: null }, now).kind === "create_campaign",
  );
  check(
    "authorized, campaign already created -> poll_review (don't recreate it)",
    nextBoostWorkerAction({ status: "authorized", retryCount: 0, authorizedAt, holdExpiresAt, metaCampaignId: "camp_1", metaReviewStatus: null }, now).kind === "poll_review",
  );
  check(
    "submitted_for_review, still in_review, hold not expired -> keep polling",
    nextBoostWorkerAction({ status: "submitted_for_review", retryCount: 0, authorizedAt, holdExpiresAt, metaCampaignId: "camp_1", metaReviewStatus: "in_review" }, now).kind === "poll_review",
  );
  check(
    "submitted_for_review, approved -> capture",
    nextBoostWorkerAction({ status: "submitted_for_review", retryCount: 0, authorizedAt, holdExpiresAt, metaCampaignId: "camp_1", metaReviewStatus: "approved" }, now).kind === "capture",
  );
  check(
    "submitted_for_review, active (already serving) -> capture",
    nextBoostWorkerAction({ status: "submitted_for_review", retryCount: 0, authorizedAt, holdExpiresAt, metaCampaignId: "camp_1", metaReviewStatus: "active" }, now).kind === "capture",
  );
  check(
    `submitted_for_review, rejected, retryCount 0 < ${BOOST_MAX_AUTO_RETRIES} -> retry_creative (auto-retry once)`,
    nextBoostWorkerAction({ status: "submitted_for_review", retryCount: 0, authorizedAt, holdExpiresAt, metaCampaignId: "camp_1", metaReviewStatus: "rejected" }, now).kind === "retry_creative",
  );
  check(
    "submitted_for_review, rejected again after the one retry -> release_rejected",
    nextBoostWorkerAction({ status: "submitted_for_review", retryCount: BOOST_MAX_AUTO_RETRIES, authorizedAt, holdExpiresAt, metaCampaignId: "camp_1", metaReviewStatus: "rejected" }, now).kind === "release_rejected",
  );

  const longAgo = new Date("2026-09-14T00:00:00.000Z"); // 60h ago -> hold long expired
  const longAgoHoldExpires = boostHoldExpiresAt(longAgo);
  check(
    "authorized but not live within 24h -> release_expired",
    nextBoostWorkerAction({ status: "authorized", retryCount: 0, authorizedAt: longAgo, holdExpiresAt: longAgoHoldExpires, metaCampaignId: null, metaReviewStatus: null }, now).kind === "release_expired",
  );
  check(
    "still submitted_for_review but 24h passed with no verdict -> release_expired",
    nextBoostWorkerAction({ status: "submitted_for_review", retryCount: 0, authorizedAt: longAgo, holdExpiresAt: longAgoHoldExpires, metaCampaignId: "camp_1", metaReviewStatus: "in_review" }, now).kind === "release_expired",
  );

  for (const terminal of ["captured", "released", "canceled"]) {
    check(
      `terminal status '${terminal}' -> noop (worker never touches a settled order again)`,
      nextBoostWorkerAction({ status: terminal, retryCount: 0, authorizedAt, holdExpiresAt, metaCampaignId: "camp_1", metaReviewStatus: "approved" }, now).kind === "noop",
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
