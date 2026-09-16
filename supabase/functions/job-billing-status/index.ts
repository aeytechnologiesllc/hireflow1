// One job's billing snapshot for the employer's own applicant list: is it
// locked, how many are sealed, does it have an active unlock, voice
// interview allowance, and its most recent Ava Boost order. Backs
// useJobBilling() (src/hooks/useJobBilling.ts).
//
// Authorization is NOT re-implemented here -- both reads go through the
// user's own JWT (not the service-role admin client), so
// get_job_billing_status()'s own caller check and job_unlocks/
// applicant_packs/boost_orders' RLS policies (job owner or active team
// member only) are what actually decide who sees what. A stranger or an
// unrelated employer gets a thrown "Not authorized" / empty rows, exactly
// as they would querying Postgres directly.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobId } = await req.json();
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

    const { data: statusRows, error: statusError } = await supabaseClient.rpc("get_job_billing_status", {
      p_job_id: jobId,
    });
    if (statusError) throw new Error(statusError.message || "Not authorized to read this job's billing status");
    const status = Array.isArray(statusRows) ? statusRows[0] : statusRows;
    if (!status) throw new Error("Job not found");

    const { data: latestBoost } = await supabaseClient
      .from("boost_orders")
      .select("id, status, tier_cents, radius_miles, reach_estimate_low, reach_estimate_high, captured_at, released_at, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        billingEnabled: status.billing_enabled,
        applicantCount: status.applicant_count,
        processedAllowance: status.processed_allowance,
        sealedCount: status.sealed_count,
        isLocked: status.is_locked,
        unlockCount: status.unlock_count,
        hasActiveUnlock: status.has_active_unlock,
        activeUnlockExpiresAt: status.active_unlock_expires_at,
        packCount: status.pack_count,
        voice: {
          included: status.voice_included_total,
          used: status.voice_used,
          nextIsBillable: status.voice_next_is_billable,
        },
        latestBoostOrder: latestBoost ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("[job-billing-status] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
