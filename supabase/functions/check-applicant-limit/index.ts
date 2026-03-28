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
    const { employerId, jobId } = await req.json();

    if (!employerId) {
      return new Response(
        JSON.stringify({ error: "employerId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[check-applicant-limit] Checking limit for employer:", employerId);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get employer's subscription
    const { data: subscription } = await supabaseAdmin
      .from("subscriptions")
      .select("plan_type, status, trial_end")
      .eq("user_id", employerId)
      .maybeSingle();

    const hasActiveSubscriptionAccess =
      !subscription ||
      subscription.status === "active" ||
      (subscription.status === "trialing" &&
        (!subscription.trial_end || new Date(subscription.trial_end) > new Date()));

    if (!hasActiveSubscriptionAccess) {
      console.log("[check-applicant-limit] Employer subscription inactive, blocking application", {
        employerId,
        status: subscription?.status,
      });
      return new Response(
        JSON.stringify({
          limitReached: true,
          message: "This employer is not currently accepting new applications. Please try again later or contact the employer."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get plan limits
    const planType = subscription?.plan_type || 'trial';
    const applicantLimits: Record<string, number> = {
      trial: 15,
      growth: 50,
      business: -1, // unlimited
      enterprise: -1, // unlimited
    };
    const limit = applicantLimits[planType] ?? 15;

    // If unlimited, return immediately
    if (limit === -1) {
      console.log("[check-applicant-limit] Unlimited applicants for plan:", planType);
      return new Response(
        JSON.stringify({ limitReached: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all jobs owned by this employer
    const { data: employerJobs } = await supabaseAdmin
      .from("jobs")
      .select("id")
      .eq("employer_id", employerId);

    const jobIds = (employerJobs || []).map((j: any) => j.id);

    if (jobIds.length === 0) {
      console.log("[check-applicant-limit] No jobs found, allowing application");
      return new Response(
        JSON.stringify({ limitReached: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Count current applicants across all employer's jobs
    const { count: applicantsCount } = await supabaseAdmin
      .from("applications")
      .select("*", { count: "exact", head: true })
      .in("job_id", jobIds);

    const currentCount = applicantsCount || 0;

    if (currentCount >= limit) {
      console.log(`[check-applicant-limit] Limit reached: ${currentCount}/${limit}`);
      return new Response(
        JSON.stringify({ 
          limitReached: true, 
          message: `This employer is not currently accepting new applications. Please try again later or contact the employer.`
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[check-applicant-limit] Within limit: ${currentCount}/${limit}`);
    return new Response(
      JSON.stringify({ limitReached: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[check-applicant-limit] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
