// "Reach about N people near you" — shown before an Ava Boost purchase.
// Returns { available: false } (200, not an error) whenever a real estimate
// cannot be produced -- Meta credentials missing, boost disabled, or Meta's
// own estimate endpoint has nothing yet -- so the UI can simply hide the
// number instead of showing a broken or fabricated one. Never invents a
// number: NO-FABRICATED-PROOF applies here exactly as it does to testimonials
// and ratings elsewhere in the app.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getBillingFlags } from "../_shared/billingFlags.ts";
import { BOOST_MIN_RADIUS_MILES } from "../_shared/jobBillingPricing.ts";
import { createMetaGraphAdsClient } from "../_shared/metaAdsClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobId, radiusMiles } = await req.json();
    if (!jobId || typeof jobId !== "string") {
      return new Response(JSON.stringify({ error: "jobId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("User not authenticated");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const billing = await getBillingFlags(supabaseAdmin);
    const metaClient = createMetaGraphAdsClient(Deno.env);
    if (!billing.boostEnabled || !metaClient) {
      return new Response(JSON.stringify({ available: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job } = await supabaseAdmin
      .from("jobs")
      .select("id, employer_id, latitude, longitude")
      .eq("id", jobId)
      .maybeSingle();
    if (!job || job.employer_id !== user.id || job.latitude == null || job.longitude == null) {
      return new Response(JSON.stringify({ available: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const radius = Math.max(BOOST_MIN_RADIUS_MILES, Number(radiusMiles) || BOOST_MIN_RADIUS_MILES);
    const estimate = await metaClient.estimateReach({ latitude: job.latitude, longitude: job.longitude, radiusMiles: radius });
    if (!estimate) {
      return new Response(JSON.stringify({ available: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ available: true, low: estimate.low, high: estimate.high, radiusMiles: radius }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("[ava-boost-reach-estimate] Error:", error);
    // A failed estimate is never fatal to the purchase flow -- hide the
    // number, don't error the dialog out.
    return new Response(JSON.stringify({ available: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
