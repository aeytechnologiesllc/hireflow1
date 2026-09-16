// The Ava Boost sweep: advances every non-terminal boost_orders row one
// step (create the Meta campaign, poll review, capture on approval,
// auto-retry once on rejection, release the hold on a second rejection or a
// 24h timeout). Pure decision logic lives in
// _shared/jobBillingPricing.ts#nextBoostWorkerAction and is proven with no
// network in scripts/ava_boost_worker.test.mjs; this file is just the thin
// I/O shell around it (Stripe capture/cancel, MetaAdsClient calls, the DB
// update for each transition).
//
// Not wired to a scheduler by this change (no live cron was set up — see
// knownLimits in the task report). Meant to be invoked periodically (every
// few minutes) once deployed, e.g. via Supabase's pg_cron + pg_net calling
// this function's URL, or an external scheduler — either way it must send
// `x-worker-secret: <BOOST_WORKER_SECRET>`; without that env var configured
// this function refuses every request (fails closed, since it moves real
// money holds).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { nextBoostWorkerAction, type BoostOrderSnapshot, type BoostWorkerAction } from "../_shared/jobBillingPricing.ts";
import { createMetaGraphAdsClient, type MetaAdsClient } from "../_shared/metaAdsClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
};

// The raw boost_orders row shape (snake_case, as Postgres returns it) —
// deliberately NOT the same shape as BoostOrderSnapshot (camelCase, the pure
// decision function's input). toSnapshot() below is the one place that maps
// between them, so a column rename only has to be fixed in one spot.
interface BoostOrderRow {
  id: string;
  job_id: string;
  employer_id: string;
  tier_cents: number;
  radius_miles: number;
  status: BoostOrderSnapshot["status"];
  retry_count: number;
  authorized_at: string | null;
  hold_expires_at: string | null;
  stripe_payment_intent_id: string | null;
  meta_campaign_id: string | null;
  meta_ad_set_id: string | null;
  meta_ad_id: string | null;
  meta_creative_id: string | null;
  meta_review_status: string | null;
}

interface JobLocation {
  title: string;
  latitude: number | null;
  longitude: number | null;
}

function toSnapshot(order: BoostOrderRow, reviewStatusOverride?: string | null): BoostOrderSnapshot {
  return {
    status: order.status,
    retryCount: order.retry_count,
    authorizedAt: order.authorized_at,
    holdExpiresAt: order.hold_expires_at,
    metaCampaignId: order.meta_campaign_id,
    metaReviewStatus: reviewStatusOverride !== undefined ? reviewStatusOverride : order.meta_review_status,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const workerSecret = Deno.env.get("BOOST_WORKER_SECRET");
  if (!workerSecret || req.headers.get("x-worker-secret") !== workerSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const metaClient = createMetaGraphAdsClient(Deno.env);
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2023-10-16" });

  if (!metaClient) {
    return new Response(JSON.stringify({ error: "Meta credentials are not configured" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { data: orders, error } = await supabaseAdmin
      .from("boost_orders")
      .select(
        "id, job_id, employer_id, tier_cents, radius_miles, status, retry_count, authorized_at, hold_expires_at, stripe_payment_intent_id, meta_campaign_id, meta_ad_set_id, meta_ad_id, meta_creative_id, meta_review_status",
      )
      .in("status", ["authorized", "submitted_for_review"])
      .limit(50);
    if (error) throw new Error(error.message);

    const results: Array<{ id: string; action: string; ok: boolean; error?: string }> = [];
    for (const order of (orders ?? []) as BoostOrderRow[]) {
      try {
        const action = await processOne(order, supabaseAdmin, metaClient, stripe);
        results.push({ id: order.id, action: action.kind, ok: true });
      } catch (e) {
        console.error(`[ava-boost-worker] order ${order.id} failed:`, e);
        results.push({ id: order.id, action: "error", ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[ava-boost-worker] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function fetchJobAndCompanyName(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  jobId: string,
  employerId: string,
): Promise<{ job: JobLocation | null; companyName: string }> {
  const jobRes = await supabaseAdmin.from("jobs").select("title, latitude, longitude").eq("id", jobId).maybeSingle();
  const profileRes = await supabaseAdmin.from("profiles").select("company_name").eq("user_id", employerId).maybeSingle();
  const job = (jobRes.data ?? null) as JobLocation | null;
  const companyName = ((profileRes.data as { company_name?: string } | null)?.company_name) || "This employer";
  return { job, companyName };
}

async function processOne(
  order: BoostOrderRow,
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  metaClient: MetaAdsClient,
  stripe: Stripe,
): Promise<BoostWorkerAction> {
  const now = new Date();
  let action = nextBoostWorkerAction(toSnapshot(order), now);

  if (action.kind === "create_campaign") {
    const { job, companyName } = await fetchJobAndCompanyName(supabaseAdmin, order.job_id, order.employer_id);
    if (!job || job.latitude == null || job.longitude == null) {
      throw new Error("Job has no location; cannot create the campaign");
    }
    const destinationUrl = `${Deno.env.get("APP_BASE_URL") || "https://hireflownow.com"}/jobs/${order.job_id}`;
    const created = await metaClient.createCampaignAndAd({
      jobId: order.job_id,
      jobTitle: job.title,
      companyName,
      latitude: job.latitude,
      longitude: job.longitude,
      radiusMiles: order.radius_miles,
      tierCents: order.tier_cents,
      destinationUrl,
    });
    await supabaseAdmin
      .from("boost_orders")
      .update({
        meta_campaign_id: created.campaignId,
        meta_ad_set_id: created.adSetId,
        meta_ad_id: created.adId,
        meta_creative_id: created.creativeId,
        status: "submitted_for_review",
        meta_review_status: "in_review",
      })
      .eq("id", order.id);
    return action;
  }

  if (action.kind === "poll_review") {
    if (!order.meta_ad_id) throw new Error("No meta_ad_id to poll");
    const review = await metaClient.getReviewStatus(order.meta_ad_id);
    await supabaseAdmin
      .from("boost_orders")
      .update({ meta_review_status: review.reviewStatus, meta_rejection_reason: review.rejectionReason ?? null })
      .eq("id", order.id);
    // React immediately to what we just learned, rather than waiting for
    // the next sweep to notice the updated review status.
    action = nextBoostWorkerAction(toSnapshot(order, review.reviewStatus), now);
    if (action.kind === "poll_review" || action.kind === "create_campaign") return action; // nothing further to do this pass
  }

  if (action.kind === "capture") {
    if (!order.stripe_payment_intent_id) throw new Error("No payment intent to capture");
    await stripe.paymentIntents.capture(order.stripe_payment_intent_id);
    await supabaseAdmin
      .from("boost_orders")
      .update({ status: "captured", captured_at: now.toISOString() })
      .eq("id", order.id);
    return action;
  }

  if (action.kind === "retry_creative") {
    if (!order.meta_campaign_id || !order.meta_ad_set_id) throw new Error("Nothing to retry — no campaign yet");
    const { job, companyName } = await fetchJobAndCompanyName(supabaseAdmin, order.job_id, order.employer_id);
    if (!job || job.latitude == null || job.longitude == null) throw new Error("Job has no location; cannot retry");
    const destinationUrl = `${Deno.env.get("APP_BASE_URL") || "https://hireflownow.com"}/jobs/${order.job_id}`;
    const retried = await metaClient.retryCreative({
      jobId: order.job_id,
      jobTitle: job.title,
      companyName,
      latitude: job.latitude,
      longitude: job.longitude,
      radiusMiles: order.radius_miles,
      tierCents: order.tier_cents,
      destinationUrl,
      campaignId: order.meta_campaign_id,
      adSetId: order.meta_ad_set_id,
    });
    await supabaseAdmin
      .from("boost_orders")
      .update({
        meta_ad_id: retried.adId,
        meta_creative_id: retried.creativeId,
        retry_count: order.retry_count + 1,
        meta_review_status: "in_review",
        meta_rejection_reason: null,
      })
      .eq("id", order.id);
    return action;
  }

  if (action.kind === "release_expired" || action.kind === "release_rejected") {
    if (order.stripe_payment_intent_id) {
      await stripe.paymentIntents.cancel(order.stripe_payment_intent_id).catch((e: unknown) => {
        // Already captured/canceled on Stripe's side is not fatal here —
        // the DB row is the source of truth for what HireFlow believes
        // happened; log and continue so the row still gets marked released.
        console.error(`[ava-boost-worker] cancel payment_intent failed for order ${order.id}:`, e);
      });
    }
    if (order.meta_campaign_id) {
      await metaClient.pauseCampaign(order.meta_campaign_id).catch((e: unknown) => {
        console.error(`[ava-boost-worker] pauseCampaign failed for order ${order.id}:`, e);
      });
    }
    await supabaseAdmin
      .from("boost_orders")
      .update({ status: "released", released_at: now.toISOString() })
      .eq("id", order.id);
    return action;
  }

  return action; // noop
}
