// Pure pricing/entitlement math for the owner's decided pricing (2026-08-27).
// No subscription: posting a job is free, the first 3 applicants per job are
// fully processed free, the job unlocks for $49 at applicant #4 (30 days, 25
// processed applicants included), +$25 per extra pack of 25, voice
// interviews are 10 included per unlocked job then $2 each, and Ava Boost is
// a flat $79/$149/$299 per-job ad spend with its own authorize-then-capture
// lifecycle.
//
// Kept here, isolated from any Supabase/Deno/Stripe wiring, so edge
// functions AND plain Node tests (Node 24+ strips these type annotations
// natively, no build step — same convention as voiceSessionCharge.ts) run
// the exact same arithmetic the SQL entitlement functions in
// 20260916170000_job_billing_schema.sql implement. If these two ever
// disagree, scripts/job_billing_schema.pglite.test.mjs (the SQL side) and
// scripts/job_billing_pricing.test.mjs (this side) are where that would
// show up — keep both green.

export const FREE_APPLICANTS = 3;

export const UNLOCK_PRICE_CENTS = 4900;
export const UNLOCK_INCLUDED_APPLICANTS = 25;
export const UNLOCK_INCLUDED_VOICE_INTERVIEWS = 10;
export const UNLOCK_DURATION_DAYS = 30;

export const PACK_PRICE_CENTS = 2500;
export const PACK_INCLUDED_APPLICANTS = 25;

export const VOICE_OVERAGE_PRICE_CENTS = 200;

/** Cents, matching the boost_orders.tier_cents CHECK constraint. */
export const BOOST_TIERS_CENTS = [7900, 14900, 29900] as const;
export type BoostTierCents = (typeof BOOST_TIERS_CENTS)[number];

export const BOOST_MIN_RADIUS_MILES = 15;
export const BOOST_HOLD_HOURS = 24;
/** One auto-retry of a rejected creative before releasing the hold. */
export const BOOST_MAX_AUTO_RETRIES = 1;

export function isBoostTierCents(value: unknown): value is BoostTierCents {
  return typeof value === "number" && (BOOST_TIERS_CENTS as readonly number[]).includes(value);
}

/**
 * A job's processed-applicant allowance: 3 free, plus 25 for every unlock
 * this job has ever completed (a high-water mark — see the migration's
 * header comment for why an unlock's 30-day window lapsing does not shrink
 * this number), plus 25 for every active applicant pack.
 */
export function computeProcessedAllowance(input: {
  completedUnlockCount: number;
  activePackCount: number;
}): number {
  const unlocks = Math.max(0, Math.trunc(input.completedUnlockCount || 0));
  const packs = Math.max(0, Math.trunc(input.activePackCount || 0));
  return FREE_APPLICANTS + UNLOCK_INCLUDED_APPLICANTS * unlocks + PACK_INCLUDED_APPLICANTS * packs;
}

/** How many of a job's applicants (by arrival order) are sealed right now. */
export function computeSealedCount(input: { applicantCount: number; allowance: number }): number {
  return Math.max(0, Math.trunc(input.applicantCount || 0) - Math.trunc(input.allowance || 0));
}

export function isJobLocked(input: { applicantCount: number; allowance: number }): boolean {
  return computeSealedCount(input) > 0;
}

/**
 * Whether the NEXT voice interview for this job would be a billable ($2)
 * overage rather than one of the 10 included. Unmetered (never billable)
 * until the job has completed its first unlock — see the migration header's
 * "processed vs sealed is a visibility gate, voice is billed for real"
 * distinction.
 */
export function isNextVoiceInterviewBillable(input: {
  completedUnlockCount: number;
  priorSettledInterviewCount: number;
}): boolean {
  const everUnlocked = Math.max(0, Math.trunc(input.completedUnlockCount || 0)) > 0;
  if (!everUnlocked) return false;
  return Math.max(0, Math.trunc(input.priorSettledInterviewCount || 0)) >= UNLOCK_INCLUDED_VOICE_INTERVIEWS;
}

export function unlockExpiresAt(unlockedAt: Date | string, now: Date = new Date()): Date {
  const start = unlockedAt instanceof Date ? unlockedAt : new Date(unlockedAt);
  const base = Number.isFinite(start.getTime()) ? start : now;
  return new Date(base.getTime() + UNLOCK_DURATION_DAYS * 24 * 60 * 60 * 1000);
}

export function boostHoldExpiresAt(authorizedAt: Date | string): Date {
  const start = authorizedAt instanceof Date ? authorizedAt : new Date(authorizedAt);
  return new Date(start.getTime() + BOOST_HOLD_HOURS * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------
// Ava Boost worker state machine — pure decision function. The worker edge
// function (ava-boost-worker) reads this to decide what to actually DO for
// one order; every branch is exercised by
// scripts/job_billing_pricing.test.mjs with no network/Stripe/Meta involved.
// ---------------------------------------------------------------------

export type BoostOrderStatus =
  | "pending_payment"
  | "authorized"
  | "submitted_for_review"
  | "captured"
  | "released"
  | "canceled";

export interface BoostOrderSnapshot {
  status: BoostOrderStatus;
  retryCount: number;
  authorizedAt: string | Date | null;
  holdExpiresAt: string | Date | null;
  metaCampaignId: string | null;
  metaReviewStatus: string | null; // mirrors MetaAdsClient's review status, e.g. "in_review" | "approved" | "rejected" | "active"
}

export type BoostWorkerAction =
  | { kind: "noop" }
  | { kind: "create_campaign" }
  | { kind: "poll_review" }
  | { kind: "capture" }
  | { kind: "retry_creative" }
  | { kind: "release_expired" }
  | { kind: "release_rejected" };

/**
 * One sweep step for one boost_orders row. Deliberately a pure function of
 * (status, retryCount, timestamps, Meta's last-known review status) so the
 * worker's branching can be proven without a real Stripe or Meta call.
 */
export function nextBoostWorkerAction(order: BoostOrderSnapshot, now: Date = new Date()): BoostWorkerAction {
  if (order.status === "captured" || order.status === "released" || order.status === "canceled") {
    return { kind: "noop" };
  }
  if (order.status === "pending_payment") {
    // Nothing to do until the Checkout payment_intent is actually
    // authorized — the webhook moves this to 'authorized'.
    return { kind: "noop" };
  }

  const holdExpires = order.holdExpiresAt
    ? order.holdExpiresAt instanceof Date
      ? order.holdExpiresAt
      : new Date(order.holdExpiresAt)
    : null;
  const holdExpired = holdExpires != null && Number.isFinite(holdExpires.getTime()) && now.getTime() >= holdExpires.getTime();

  if (order.status === "authorized") {
    if (holdExpired) return { kind: "release_expired" };
    return order.metaCampaignId ? { kind: "poll_review" } : { kind: "create_campaign" };
  }

  if (order.status === "submitted_for_review") {
    if (order.metaReviewStatus === "approved" || order.metaReviewStatus === "active") {
      return { kind: "capture" };
    }
    if (order.metaReviewStatus === "rejected") {
      return order.retryCount < BOOST_MAX_AUTO_RETRIES ? { kind: "retry_creative" } : { kind: "release_rejected" };
    }
    if (holdExpired) return { kind: "release_expired" };
    return { kind: "poll_review" };
  }

  return { kind: "noop" };
}
