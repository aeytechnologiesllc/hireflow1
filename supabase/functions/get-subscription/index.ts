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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("User not authenticated");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get subscription
    const { data: subscription, error: subError } = await supabaseClient
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // Calculate actual usage from tables
    const { count: jobsCount } = await supabaseAdmin
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("employer_id", user.id);

    const { data: userJobs } = await supabaseAdmin
      .from("jobs")
      .select("id")
      .eq("employer_id", user.id);
    
    const jobIds = (userJobs || []).map(j => j.id);
    
    let applicantsCount = 0;
    let documentsCount = 0;
    let aiAnalysesCount = 0;
    
    if (jobIds.length > 0) {
      const { count: appCount } = await supabaseAdmin
        .from("applications")
        .select("*", { count: "exact", head: true })
        .in("job_id", jobIds);
      applicantsCount = appCount || 0;

      // Get applications for document count
      const { data: apps } = await supabaseAdmin
        .from("applications")
        .select("id")
        .in("job_id", jobIds);
      
      const appIds = (apps || []).map(a => a.id);
      if (appIds.length > 0) {
        const { count: docCount } = await supabaseAdmin
          .from("documents")
          .select("*", { count: "exact", head: true })
          .in("application_id", appIds);
        documentsCount = docCount || 0;

        // Count AI analyses (applications with ai_score)
        const { count: analysisCount } = await supabaseAdmin
          .from("applications")
          .select("*", { count: "exact", head: true })
          .in("job_id", jobIds)
          .not("ai_score", "is", null);
        aiAnalysesCount = analysisCount || 0;
      }
    }

    const { count: teamCount } = await supabaseAdmin
      .from("team_members")
      .select("*", { count: "exact", head: true })
      .eq("employer_id", user.id)
      .eq("status", "active");

    const usage = {
      jobs_created: jobsCount || 0,
      applicants_received: applicantsCount,
      documents_sent: documentsCount,
      team_members_added: teamCount || 0,
      ai_analyses_used: aiAnalysesCount,
      voice_minutes_used: 0,
    };

    // Get active voice credits (not expired, not voided)
    const { data: voiceCredits } = await supabaseAdmin
      .from("voice_credits")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true });

    // Calculate total voice minutes available
    const totalVoiceMinutes = (voiceCredits || []).reduce(
      (sum, credit) => sum + (credit.minutes_remaining || 0),
      0
    );

    // If no subscription exists, create trial
    if (!subscription) {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 7);

      const { data: newSub } = await supabaseAdmin.from("subscriptions").insert({
        user_id: user.id,
        plan_type: 'trial',
        status: 'trialing',
        trial_start: new Date().toISOString(),
        trial_end: trialEnd.toISOString(),
      }).select().single();

      // Create usage record
      await supabaseAdmin.from("subscription_usage").insert({
        user_id: user.id,
      });

      // Create initial trial voice credits (unlimited for testing, expires with trial)
      await supabaseAdmin.from("voice_credits").insert({
        user_id: user.id,
        source: 'subscription',
        minutes_granted: 9999,
        minutes_remaining: 9999,
        expires_at: trialEnd.toISOString(),
      });

      return new Response(JSON.stringify({
        subscription: newSub,
        usage: { jobs_created: 0, applicants_received: 0, documents_sent: 0, team_members_added: 0, ai_analyses_used: 0, voice_minutes_used: 0 },
        limits: getPlanLimits('trial'),
        voiceCredits: {
          totalMinutesAvailable: 9999,
          credits: [{
            id: 'initial',
            source: 'subscription',
            minutes_remaining: 9999,
            expires_at: trialEnd.toISOString(),
          }],
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if trial expired
    if (subscription.status === 'trialing' && subscription.trial_end) {
      const trialEnd = new Date(subscription.trial_end);
      if (trialEnd < new Date()) {
        await supabaseAdmin.from("subscriptions").update({
          status: 'expired',
        }).eq('user_id', user.id);

        // Void all voice credits when trial expires
        await supabaseAdmin.from("voice_credits").update({
          status: 'voided',
        }).eq('user_id', user.id).eq('status', 'active');

        subscription.status = 'expired';
      }
    }

    return new Response(JSON.stringify({
      subscription,
      usage: usage || { jobs_created: 0, applicants_received: 0, documents_sent: 0, team_members_added: 0, ai_analyses_used: 0, voice_minutes_used: 0 },
      limits: getPlanLimits(subscription.plan_type),
      voiceCredits: {
        totalMinutesAvailable: totalVoiceMinutes,
        credits: (voiceCredits || []).map(c => ({
          id: c.id,
          source: c.source,
          pack_size: c.pack_size,
          minutes_remaining: c.minutes_remaining,
          minutes_granted: c.minutes_granted,
          expires_at: c.expires_at,
          granted_at: c.granted_at,
        })),
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error fetching subscription:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    const isAuthError =
      message.toLowerCase().includes("not authenticated") ||
      message.toLowerCase().includes("no authorization header");

    return new Response(JSON.stringify({ error: message }), {
      status: isAuthError ? 401 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getPlanLimits(planType: string) {
  switch (planType) {
    case 'enterprise':
      return {
        jobs: -1,
        applicants: -1,
        documents: -1,
        teamMembers: -1,
        aiAnalyses: -1,
        voiceMinutes: 150, // Changed from 500 to 150
        hasAdvancedAnalytics: true,
        hasTeamPortal: true,
        hasDocuments: true,
        hasPrioritySupport: true,
        hasVoiceAssistant: true,
        hasVoiceInterviews: true,
      };
    case 'business':
      return {
        jobs: -1,
        applicants: -1,
        documents: -1,
        teamMembers: -1,
        aiAnalyses: -1,
        voiceMinutes: 0,
        hasAdvancedAnalytics: true,
        hasTeamPortal: true,
        hasDocuments: true,
        hasPrioritySupport: true,
        hasVoiceAssistant: false,
        hasVoiceInterviews: false,
      };
    case 'growth':
      return {
        jobs: 3,
        applicants: 50,
        documents: 20,
        teamMembers: 0,
        aiAnalyses: 100,
        voiceMinutes: 0,
        hasAdvancedAnalytics: false,
        hasTeamPortal: false,
        hasDocuments: true,
        hasPrioritySupport: false,
        hasVoiceAssistant: false,
        hasVoiceInterviews: false,
      };
    default: // trial - unlimited for testing
      return {
        jobs: 999,
        applicants: 999,
        documents: 999,
        teamMembers: 999,
        aiAnalyses: 999,
        voiceMinutes: 9999,
        hasAdvancedAnalytics: true,
        hasTeamPortal: true,
        hasDocuments: true,
        hasPrioritySupport: false,
        hasVoiceAssistant: false,
        hasVoiceInterviews: false,
        hasVoiceTrialAccess: true,
      };
  }
}
