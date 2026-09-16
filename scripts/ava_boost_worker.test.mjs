#!/usr/bin/env node
/**
 * MetaAdsClient mock flow tests for Ava Boost — plain assertions, no
 * framework. Drives the SAME two building blocks
 * supabase/functions/ava-boost-worker/index.ts's processOne() uses —
 * nextBoostWorkerAction() (the pure decision function) and
 * createMockMetaAdsClient() (the no-network test double) — through repeated
 * sweeps, updating a plain-object stand-in for a boost_orders row exactly
 * the way processOne's Supabase .update() calls do. This proves the
 * end-to-end algorithm (create -> review -> capture / retry / release) for
 * the three flows the task calls out.
 *
 * ava-boost-worker/index.ts itself cannot be imported under Node (it's a
 * Deno edge function: top-level `serve()`, `https://esm.sh/stripe` import) —
 * its Supabase/Stripe I/O glue is covered by `deno check` instead. This test
 * is the algorithmic proof; a live smoke test once Stripe/Meta credentials
 * exist is a separate step (see knownLimits in the task report).
 *
 * Run with: node scripts/ava_boost_worker.test.mjs
 */
import { nextBoostWorkerAction, boostHoldExpiresAt, BOOST_MAX_AUTO_RETRIES } from "../supabase/functions/_shared/jobBillingPricing.ts";
import { createMockMetaAdsClient } from "../supabase/functions/_shared/metaAdsClient.ts";

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

/** A fake Stripe: just records what would have been captured/canceled. */
function createFakeStripe() {
  const captured = [];
  const canceled = [];
  return {
    captured,
    canceled,
    paymentIntents: {
      async capture(id) {
        captured.push(id);
        return { id, status: "succeeded" };
      },
      async cancel(id) {
        canceled.push(id);
        return { id, status: "canceled" };
      },
    },
  };
}

/**
 * One sweep step over a plain-object order, mirroring processOne()'s
 * branching: ask the pure decision function what to do, then perform that
 * one I/O action against the mock Meta client / fake Stripe and mutate the
 * order in place — exactly what processOne's Supabase .update() does to the
 * real row.
 */
async function sweepOnce(order, metaClient, stripe, now) {
  const action = nextBoostWorkerAction(order, now);

  if (action.kind === "create_campaign") {
    const created = await metaClient.createCampaignAndAd({
      jobId: "job_1", jobTitle: "Line Cook", companyName: "Test Diner",
      latitude: 40.0, longitude: -74.0, radiusMiles: order.radiusMiles ?? 15,
      tierCents: order.tierCents ?? 7900, destinationUrl: "https://hireflownow.com/jobs/job_1",
    });
    order.metaCampaignId = created.campaignId;
    order.metaAdSetId = created.adSetId;
    order.metaAdId = created.adId;
    order.status = "submitted_for_review";
    order.metaReviewStatus = "in_review";
    return action;
  }

  if (action.kind === "poll_review") {
    const review = await metaClient.getReviewStatus(order.metaAdId);
    order.metaReviewStatus = review.reviewStatus;
    return action;
  }

  if (action.kind === "capture") {
    await stripe.paymentIntents.capture(order.stripePaymentIntentId);
    order.status = "captured";
    return action;
  }

  if (action.kind === "retry_creative") {
    const retried = await metaClient.retryCreative({
      jobId: "job_1", jobTitle: "Line Cook", companyName: "Test Diner",
      latitude: 40.0, longitude: -74.0, radiusMiles: order.radiusMiles ?? 15,
      tierCents: order.tierCents ?? 7900, destinationUrl: "https://hireflownow.com/jobs/job_1",
      campaignId: order.metaCampaignId, adSetId: order.metaAdSetId,
    });
    order.metaAdId = retried.adId;
    order.retryCount += 1;
    order.metaReviewStatus = "in_review";
    return action;
  }

  if (action.kind === "release_expired" || action.kind === "release_rejected") {
    if (order.stripePaymentIntentId) await stripe.paymentIntents.cancel(order.stripePaymentIntentId);
    if (order.metaCampaignId) await metaClient.pauseCampaign(order.metaCampaignId);
    order.status = "released";
    return action;
  }

  return action; // noop
}

console.log("-- flow 1: approved on first review -> capture --");
{
  const now = new Date("2026-09-16T12:00:00.000Z");
  const authorizedAt = new Date("2026-09-16T10:00:00.000Z");
  const order = {
    status: "authorized", retryCount: 0, authorizedAt, holdExpiresAt: boostHoldExpiresAt(authorizedAt),
    metaCampaignId: null, metaAdSetId: null, metaAdId: null, metaReviewStatus: null,
    stripePaymentIntentId: "pi_approved_1", radiusMiles: 15, tierCents: 7900,
  };
  const metaClient = createMockMetaAdsClient({ reviewSequence: [{ reviewStatus: "approved" }] });
  const stripe = createFakeStripe();

  // Sweep 1: authorized -> create_campaign -> submitted_for_review
  await sweepOnce(order, metaClient, stripe, now);
  check("after sweep 1, campaign created and order is submitted_for_review", order.status === "submitted_for_review" && order.metaCampaignId != null);

  // Sweep 2: submitted_for_review, review says approved -> poll then capture in the same processOne pass in the real worker;
  // here we model it as two sweeps (poll updates review status, then the next sweep captures) since sweepOnce is one action at a time.
  await sweepOnce(order, metaClient, stripe, now);
  check("poll picks up 'approved'", order.metaReviewStatus === "approved");
  await sweepOnce(order, metaClient, stripe, now);
  check("order is captured", order.status === "captured");
  check("Stripe capture was called exactly once, for the right payment intent", stripe.captured.length === 1 && stripe.captured[0] === "pi_approved_1");
  check("Meta campaign was created exactly once (no duplicate campaigns)", metaClient.calls.createCampaignAndAd === 1);
}

console.log("\n-- flow 2: rejected once, auto-retried, then approved -> capture --");
{
  const now = new Date("2026-09-16T12:00:00.000Z");
  const authorizedAt = new Date("2026-09-16T10:00:00.000Z");
  const order = {
    status: "authorized", retryCount: 0, authorizedAt, holdExpiresAt: boostHoldExpiresAt(authorizedAt),
    metaCampaignId: null, metaAdSetId: null, metaAdId: null, metaReviewStatus: null,
    stripePaymentIntentId: "pi_retry_1", radiusMiles: 15, tierCents: 14900,
  };
  const metaClient = createMockMetaAdsClient({ reviewSequence: [{ reviewStatus: "rejected", rejectionReason: "policy" }, { reviewStatus: "approved" }] });
  const stripe = createFakeStripe();

  await sweepOnce(order, metaClient, stripe, now); // create_campaign
  await sweepOnce(order, metaClient, stripe, now); // poll -> rejected
  check("review comes back rejected", order.metaReviewStatus === "rejected");
  await sweepOnce(order, metaClient, stripe, now); // retry_creative (retryCount 0 < BOOST_MAX_AUTO_RETRIES)
  check("exactly one auto-retry happened", order.retryCount === 1 && order.retryCount <= BOOST_MAX_AUTO_RETRIES);
  check("creative was resubmitted under the SAME campaign/ad set (not a new campaign)", metaClient.calls.createCampaignAndAd === 1 && metaClient.calls.retryCreative === 1);
  await sweepOnce(order, metaClient, stripe, now); // poll -> approved
  check("second review comes back approved", order.metaReviewStatus === "approved");
  await sweepOnce(order, metaClient, stripe, now); // capture
  check("order is captured after the retry succeeds", order.status === "captured");
  check("the hold was captured, never released, for this flow", stripe.captured.length === 1 && stripe.canceled.length === 0);
}

console.log("\n-- flow 3: rejected twice -> released, hold never captured --");
{
  const now = new Date("2026-09-16T12:00:00.000Z");
  const authorizedAt = new Date("2026-09-16T10:00:00.000Z");
  const order = {
    status: "authorized", retryCount: 0, authorizedAt, holdExpiresAt: boostHoldExpiresAt(authorizedAt),
    metaCampaignId: null, metaAdSetId: null, metaAdId: null, metaReviewStatus: null,
    stripePaymentIntentId: "pi_double_reject", radiusMiles: 15, tierCents: 29900,
  };
  const metaClient = createMockMetaAdsClient({ reviewSequence: [{ reviewStatus: "rejected" }, { reviewStatus: "rejected" }] });
  const stripe = createFakeStripe();

  await sweepOnce(order, metaClient, stripe, now); // create_campaign
  await sweepOnce(order, metaClient, stripe, now); // poll -> rejected
  await sweepOnce(order, metaClient, stripe, now); // retry_creative
  check("one retry attempted", order.retryCount === 1);
  await sweepOnce(order, metaClient, stripe, now); // poll -> rejected again
  check("second review also comes back rejected", order.metaReviewStatus === "rejected");
  await sweepOnce(order, metaClient, stripe, now); // release_rejected
  check("order is released after the second rejection", order.status === "released");
  check("Stripe hold was canceled, never captured", stripe.canceled.length === 1 && stripe.canceled[0] === "pi_double_reject" && stripe.captured.length === 0);
  check("Meta campaign was paused on release", metaClient.calls.pauseCampaign === 1);
}

console.log("\n-- flow 4: still in review after 24h -> released on timeout, no verdict needed --");
{
  const authorizedAt = new Date("2026-09-14T00:00:00.000Z"); // long ago
  const holdExpiresAt = boostHoldExpiresAt(authorizedAt);
  const now = new Date("2026-09-16T12:00:00.000Z"); // > 24h later
  const order = {
    status: "authorized", retryCount: 0, authorizedAt, holdExpiresAt,
    metaCampaignId: "camp_already_created", metaAdSetId: "adset_1", metaAdId: "ad_1", metaReviewStatus: "in_review",
    stripePaymentIntentId: "pi_timeout", radiusMiles: 15, tierCents: 7900,
  };
  const metaClient = createMockMetaAdsClient({ reviewSequence: [{ reviewStatus: "in_review" }] });
  const stripe = createFakeStripe();

  await sweepOnce(order, metaClient, stripe, now);
  check("released immediately on a 24h timeout, without ever polling review status", order.status === "released" && metaClient.calls.getReviewStatus === 0);
  check("hold canceled on timeout release", stripe.canceled.length === 1 && stripe.canceled[0] === "pi_timeout");
}

console.log("\n-- terminal orders are never touched again --");
{
  const now = new Date("2026-09-16T12:00:00.000Z");
  for (const status of ["captured", "released", "canceled"]) {
    const order = {
      status, retryCount: 0, authorizedAt: new Date(), holdExpiresAt: new Date(Date.now() + 999999),
      metaCampaignId: "camp_x", metaAdSetId: "adset_x", metaAdId: "ad_x", metaReviewStatus: "approved",
      stripePaymentIntentId: "pi_terminal", radiusMiles: 15, tierCents: 7900,
    };
    const metaClient = createMockMetaAdsClient();
    const stripe = createFakeStripe();
    await sweepOnce(order, metaClient, stripe, now);
    check(`a '${status}' order triggers zero Meta/Stripe calls`, metaClient.calls.getReviewStatus === 0 && metaClient.calls.createCampaignAndAd === 0 && stripe.captured.length === 0 && stripe.canceled.length === 0);
  }
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
