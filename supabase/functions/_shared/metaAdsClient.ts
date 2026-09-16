// MetaAdsClient — the boundary between Ava Boost's worker logic (see
// jobBillingPricing.ts's nextBoostWorkerAction, and ava-boost-worker/index.ts)
// and the real Meta Marketing API. Two implementations:
//
//   - createMetaGraphAdsClient(): the real one, HTTP calls to
//     graph.facebook.com using META_ACCESS_TOKEN / META_AD_ACCOUNT_ID /
//     META_PAGE_ID. This is what runs in production once the owner supplies
//     those three secrets — see envOrSecretsNeeded in the task report.
//   - createMockMetaAdsClient(script): a deterministic, no-network stand-in
//     used by every automated test (scripts/ava_boost_worker.test.mjs) — the
//     sandbox this was built in cannot reach graph.facebook.com or hold real
//     Meta credentials, so the mock is what actually proves the worker's
//     create -> review -> capture/retry/release flow end to end. The real
//     client's HTTP shape is written against the documented Marketing API
//     and should be smoke-tested live once credentials exist
//     (see knownLimits in the task report).
//
// Employment special ad category compliance (US law: the Meta Marketing API
// itself enforces most of this, but the request must ask for it correctly):
//   - special_ad_categories: ["EMPLOYMENT"] on every campaign this client
//     creates — never omitted.
//   - geo targeting radius is never allowed below BOOST_MIN_RADIUS_MILES
//     (15mi) — narrower radius targeting is exactly the kind of
//     fine-grained geographic exclusion the employment category exists to
//     prevent.
//   - no age/gender targeting fields are ever sent. Meta's own API silently
//     ignores or rejects them for EMPLOYMENT campaigns; this client never
//     constructs them in the first place, so there's nothing to strip.

import { BOOST_MIN_RADIUS_MILES } from "./jobBillingPricing.ts";

export type MetaReviewStatus = "in_review" | "approved" | "rejected" | "active" | "unknown";

export interface MetaReachEstimateInput {
  latitude: number;
  longitude: number;
  radiusMiles: number;
}

export interface MetaReachEstimate {
  low: number;
  high: number;
}

export interface MetaCampaignInput {
  jobId: string;
  jobTitle: string;
  companyName: string;
  latitude: number;
  longitude: number;
  radiusMiles: number;
  tierCents: number;
  destinationUrl: string;
}

export interface MetaCampaignResult {
  campaignId: string;
  adSetId: string;
  adId: string;
  creativeId: string;
}

export interface MetaReviewResult {
  // Named reviewStatus, not status: this is Meta's AD review verdict, never
  // a HireFlow application/candidate status — keeping the field name
  // distinct avoids reading like the one that always needs a human's
  // rejected_by/rejected_by_type stamp (see the guardrails.mjs
  // "ava-never-auto-rejects" guard; this is a completely different object).
  reviewStatus: MetaReviewStatus;
  rejectionReason?: string;
}

export interface MetaAdsClient {
  /** Returns null when a reach estimate genuinely cannot be computed (e.g. no location). Never throws for a routine "no data yet" response. */
  estimateReach(input: MetaReachEstimateInput): Promise<MetaReachEstimate | null>;
  createCampaignAndAd(input: MetaCampaignInput): Promise<MetaCampaignResult>;
  getReviewStatus(adId: string): Promise<MetaReviewResult>;
  /** Resubmits a new creative under the same ad set after a rejection. */
  retryCreative(input: MetaCampaignInput & { campaignId: string; adSetId: string }): Promise<MetaCampaignResult>;
  /** Best-effort pause; used when we release a hold after a rejection/timeout so spend never continues unattended. */
  pauseCampaign(campaignId: string): Promise<void>;
}

/** True when the three Meta secrets are all present — callers use this to hide Boost UI/reach estimates rather than surface a broken feature. */
export function hasMetaCredentials(env: { get(key: string): string | undefined }): boolean {
  return Boolean(env.get("META_ACCESS_TOKEN") && env.get("META_AD_ACCOUNT_ID") && env.get("META_PAGE_ID"));
}

// Verify live once META_* credentials exist: Meta ships a new major Graph
// API version roughly every few months and retires old ones on a rolling
// schedule, so this is a best-effort current pin, not a guarantee — bump it
// if Meta has moved on by the time this deploys.
const GRAPH_VERSION = "v23.0";

class MetaGraphAdsClient implements MetaAdsClient {
  // Plain fields + an explicit assignment, not TS constructor-parameter
  // shorthand: Node's type-stripping runtime (used to run this file
  // directly from scripts/*.test.mjs, no build step) only erases type
  // annotations — it does not support parameter-property syntax, which
  // generates real field-assignment code, not just types.
  private readonly accessToken: string;
  private readonly adAccountId: string;
  private readonly pageId: string;

  constructor(accessToken: string, adAccountId: string, pageId: string) {
    this.accessToken = accessToken;
    this.adAccountId = adAccountId;
    this.pageId = pageId;
  }

  private async graph<T>(path: string, init: RequestInit & { params?: Record<string, string> } = {}): Promise<T> {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
    for (const [k, v] of Object.entries(init.params ?? {})) url.searchParams.set(k, v);
    url.searchParams.set("access_token", this.accessToken);

    const res = await fetch(url.toString(), {
      method: init.method ?? "GET",
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
      body: init.body,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = (json as any)?.error?.message || `Meta Graph API error (${res.status})`;
      throw new Error(message);
    }
    return json as T;
  }

  async estimateReach(input: MetaReachEstimateInput): Promise<MetaReachEstimate | null> {
    const radius = Math.max(BOOST_MIN_RADIUS_MILES, input.radiusMiles);
    const targeting = {
      geo_locations: {
        custom_locations: [{ latitude: input.latitude, longitude: input.longitude, radius, distance_unit: "mile" }],
      },
      publisher_platforms: ["facebook", "instagram"],
    };
    try {
      // NOTE (verify live once META_* credentials exist): Meta's reach-
      // estimate surface has taken more than one shape across API versions
      // (an act-level /reachestimate, and an ad-set-level /delivery_estimate
      // with a low/high MAU range) and this sandbox has no live Meta account
      // to confirm which is current. Tries /reachestimate first (the
      // currently-documented act-level endpoint) and reads whichever
      // plausible response shape is present; returns null — never a
      // fabricated number — if neither matches, so the dialog simply hides
      // the estimate rather than showing something wrong.
      const result = await this.graph<{
        data?: { users?: number; estimate_mau_lower_bound?: number; estimate_mau_upper_bound?: number } | Array<{ estimate_mau_lower_bound?: number; estimate_mau_upper_bound?: number }>;
        users?: number;
        estimate_mau_lower_bound?: number;
        estimate_mau_upper_bound?: number;
      }>(`act_${this.adAccountId}/reachestimate`, {
        params: { targeting_spec: JSON.stringify(targeting), optimize_for: "REACH" },
      });

      const row = Array.isArray(result.data) ? result.data[0] : (result.data ?? result);
      if (row && "estimate_mau_lower_bound" in row && row.estimate_mau_lower_bound != null && row.estimate_mau_upper_bound != null) {
        return { low: row.estimate_mau_lower_bound, high: row.estimate_mau_upper_bound };
      }
      const users = (row as { users?: number } | undefined)?.users;
      if (typeof users === "number" && users > 0) {
        // A single-point estimate: show a narrow, honest band around it
        // rather than a bare (falsely precise) integer.
        return { low: Math.round(users * 0.85), high: Math.round(users * 1.15) };
      }
      return null;
    } catch {
      // A reach estimate is a nice-to-have shown before purchase, never a
      // gate — if Meta can't compute one, hide the number rather than block
      // the purchase flow.
      return null;
    }
  }

  async createCampaignAndAd(input: MetaCampaignInput): Promise<MetaCampaignResult> {
    const campaign = await this.graph<{ id: string }>(`act_${this.adAccountId}/campaigns`, {
      method: "POST",
      body: JSON.stringify({
        name: `HireFlow Ava Boost — ${input.jobTitle} (${input.jobId})`,
        objective: "OUTCOME_TRAFFIC",
        special_ad_categories: ["EMPLOYMENT"],
        status: "PAUSED",
      }),
    });

    const radius = Math.max(BOOST_MIN_RADIUS_MILES, input.radiusMiles);
    const dailyBudgetCents = Math.max(100, Math.round(input.tierCents / 7)); // spread the flat spend across a ~1 week flight
    const adSet = await this.graph<{ id: string }>(`act_${this.adAccountId}/adsets`, {
      method: "POST",
      body: JSON.stringify({
        name: `Ava Boost adset — ${input.jobId}`,
        campaign_id: campaign.id,
        daily_budget: dailyBudgetCents,
        billing_event: "IMPRESSIONS",
        optimization_goal: "LINK_CLICKS",
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        // Employment special ad category: broad geo radius only, no
        // age/gender targeting fields at all.
        targeting: {
          geo_locations: {
            custom_locations: [{ latitude: input.latitude, longitude: input.longitude, radius, distance_unit: "mile" }],
          },
          publisher_platforms: ["facebook", "instagram"],
        },
        status: "PAUSED",
      }),
    });

    const creative = await this.graph<{ id: string }>(`act_${this.adAccountId}/adcreatives`, {
      method: "POST",
      body: JSON.stringify({
        name: `Ava Boost creative — ${input.jobId}`,
        object_story_spec: {
          page_id: this.pageId,
          link_data: {
            link: input.destinationUrl,
            message: `${input.companyName} is hiring: ${input.jobTitle}. Apply in minutes.`,
            call_to_action: { type: "APPLY_NOW", value: { link: input.destinationUrl } },
          },
        },
      }),
    });

    const ad = await this.graph<{ id: string }>(`act_${this.adAccountId}/ads`, {
      method: "POST",
      body: JSON.stringify({
        name: `Ava Boost ad — ${input.jobId}`,
        adset_id: adSet.id,
        creative: { creative_id: creative.id },
        status: "PAUSED",
      }),
    });

    // Everything is created PAUSED, then flipped active in one call so a
    // partial failure above never leaves a live, unreviewed ad spending.
    await this.graph(`${ad.id}`, { method: "POST", body: JSON.stringify({ status: "ACTIVE" }) });

    return { campaignId: campaign.id, adSetId: adSet.id, adId: ad.id, creativeId: creative.id };
  }

  async getReviewStatus(adId: string): Promise<MetaReviewResult> {
    const ad = await this.graph<{
      effective_status?: string;
      ad_review_feedback?: unknown;
    }>(adId, { params: { fields: "effective_status,ad_review_feedback" } });

    switch (ad.effective_status) {
      case "ACTIVE":
        return { reviewStatus: "active" };
      case "PENDING_REVIEW":
      case "IN_PROCESS":
        return { reviewStatus: "in_review" };
      case "DISAPPROVED":
        return {
          reviewStatus: "rejected",
          rejectionReason: typeof ad.ad_review_feedback === "string" ? ad.ad_review_feedback : JSON.stringify(ad.ad_review_feedback ?? {}),
        };
      case "PAUSED":
        // Meta approved it but it's sitting paused — from this client's
        // perspective that's a pass; the worker will flip it active on capture.
        return { reviewStatus: "approved" };
      default:
        return { reviewStatus: "unknown" };
    }
  }

  async retryCreative(input: MetaCampaignInput & { campaignId: string; adSetId: string }): Promise<MetaCampaignResult> {
    const creative = await this.graph<{ id: string }>(`act_${this.adAccountId}/adcreatives`, {
      method: "POST",
      body: JSON.stringify({
        name: `Ava Boost creative (retry) — ${input.jobId}`,
        object_story_spec: {
          page_id: this.pageId,
          link_data: {
            link: input.destinationUrl,
            message: `Now hiring: ${input.jobTitle} at ${input.companyName}. Apply in minutes — no resume required.`,
            call_to_action: { type: "APPLY_NOW", value: { link: input.destinationUrl } },
          },
        },
      }),
    });
    const ad = await this.graph<{ id: string }>(`act_${this.adAccountId}/ads`, {
      method: "POST",
      body: JSON.stringify({
        name: `Ava Boost ad (retry) — ${input.jobId}`,
        adset_id: input.adSetId,
        creative: { creative_id: creative.id },
        status: "ACTIVE",
      }),
    });
    return { campaignId: input.campaignId, adSetId: input.adSetId, adId: ad.id, creativeId: creative.id };
  }

  async pauseCampaign(campaignId: string): Promise<void> {
    await this.graph(`${campaignId}`, { method: "POST", body: JSON.stringify({ status: "PAUSED" }) });
  }
}

export function createMetaGraphAdsClient(env: { get(key: string): string | undefined }): MetaAdsClient | null {
  const token = env.get("META_ACCESS_TOKEN");
  const adAccountId = env.get("META_AD_ACCOUNT_ID");
  const pageId = env.get("META_PAGE_ID");
  if (!token || !adAccountId || !pageId) return null;
  return new MetaGraphAdsClient(token, adAccountId, pageId);
}

// ---------------------------------------------------------------------
// Mock, for tests. No network. `script` lets a test dictate the outcome
// deterministically per call (e.g. "reject once, then approve").
// ---------------------------------------------------------------------

export interface MockMetaAdsScript {
  reach?: MetaReachEstimate | null;
  /** Queue of review results returned by successive getReviewStatus calls; the last one repeats once exhausted. */
  reviewSequence?: MetaReviewResult[];
}

export function createMockMetaAdsClient(script: MockMetaAdsScript = {}): MetaAdsClient & { calls: Record<string, number> } {
  let campaignN = 0;
  let reviewCallIndex = 0;
  const calls: Record<string, number> = {
    estimateReach: 0,
    createCampaignAndAd: 0,
    getReviewStatus: 0,
    retryCreative: 0,
    pauseCampaign: 0,
  };
  const reviewSequence = script.reviewSequence ?? [{ reviewStatus: "approved" as const }];

  return {
    calls,
    async estimateReach() {
      calls.estimateReach += 1;
      return script.reach === undefined ? { low: 4200, high: 9800 } : script.reach;
    },
    async createCampaignAndAd() {
      calls.createCampaignAndAd += 1;
      campaignN += 1;
      return {
        campaignId: `mock_campaign_${campaignN}`,
        adSetId: `mock_adset_${campaignN}`,
        adId: `mock_ad_${campaignN}`,
        creativeId: `mock_creative_${campaignN}`,
      };
    },
    async getReviewStatus() {
      calls.getReviewStatus += 1;
      const result = reviewSequence[Math.min(reviewCallIndex, reviewSequence.length - 1)];
      reviewCallIndex += 1;
      return result;
    },
    async retryCreative(input) {
      calls.retryCreative += 1;
      campaignN += 1;
      return {
        campaignId: input.campaignId,
        adSetId: input.adSetId,
        adId: `mock_ad_${campaignN}`,
        creativeId: `mock_creative_${campaignN}`,
      };
    },
    async pauseCampaign() {
      calls.pauseCampaign += 1;
    },
  };
}
