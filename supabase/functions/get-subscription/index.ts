/**
 * get-subscription — what the hiring side's screens need to know about the
 * account (pricing v9, 2026-10-31; docs/BILLING.md):
 *
 *   - teamAccess: whether a team member's membership still stands;
 *   - billing: the business's billing as public.billing_state reports it
 *     (billingEnabled, exempt, plan "unlimited" | "pay_per_job",
 *     freeJobAvailable, Unlimited's status and period end, hasCustomer, and
 *     each job's pass: kind, end, time left; a teammate only for the jobs
 *     they are on). While billing is off it says only that, so no screen
 *     shows a price or a plan. For the business owner it also carries
 *     `payments` (public.billing_history, 2026-11-01): Settings -> Billing's
 *     payment history and the confirmation's amount; a teammate gets none.
 *
 * An applicant gets neither (billing never shows to applicants). The old
 * answer's trial row, usage counts, plan limits and the 120-minute voice
 * grant are gone: nothing read them, and voice stays for platform_admins
 * only (ava-voice-session). This function no longer reads
 * subscription_bypass: platform_admins is billing's only exemption.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TeamAccess = {
  isTeamMember: boolean;
  status: "active" | "revoked" | "none";
  reason: "revoked" | null;
  employerId: string | null;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) throw new Error("Missing bearer token");

    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      auth: { persistSession: false },
    });
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) throw new Error("User not authenticated");

    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { persistSession: false },
    });

    const { data: roleRows, error: roleError } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    if (roleError) console.error("Error fetching roles:", roleError);
    const roles = new Set((roleRows || []).map((row: { role: string }) => row.role));
    const isCandidateOnly = roles.size > 0 && roles.has("candidate") && !roles.has("employer") && !roles.has("team_member");
    const isTeamMemberRole = roles.has("team_member") && !roles.has("employer");

    let teamAccess: TeamAccess = { isTeamMember: false, status: "none", reason: null, employerId: null };

    // An applicant: nothing about billing, ever.
    if (isCandidateOnly) return json({ teamAccess, billing: null });

    let ownerId = user.id;
    if (isTeamMemberRole) {
      const { data: active, error: membershipError } = await admin
        .from("team_members")
        .select("employer_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (membershipError) {
        console.error("Error fetching team membership:", membershipError);
      } else if (active?.employer_id) {
        ownerId = active.employer_id;
        teamAccess = { isTeamMember: true, status: "active", reason: null, employerId: active.employer_id };
      } else {
        const { data: latest, error: latestError } = await admin
          .from("team_members")
          .select("employer_id, status")
          .eq("user_id", user.id)
          .order("joined_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestError) console.error("Error fetching latest team membership:", latestError);
        teamAccess = { isTeamMember: true, status: "revoked", reason: "revoked", employerId: latest?.employer_id ?? null };
        return json({ teamAccess, billing: null });
      }
    }

    // The business's billing, by the same rules the publish check uses. A
    // teammate sees the days of the jobs they are on only (p_viewer).
    const { data: billing, error: billingError } = await admin.rpc("billing_state", { p_owner: ownerId, p_viewer: user.id });
    if (billingError) {
      // Unknown is treated as off by the page: no price, no plan, nothing gated.
      console.error("Error reading billing state:", billingError.message);
      return json({ teamAccess, billing: null });
    }
    if (!billing) return json({ teamAccess, billing: null });

    // The owner's payment history (2026-11-01; public.billing_history): the
    // business owner's only, never a teammate's (they never see an amount),
    // and nothing while billing is off or for the exempt account. Null when it
    // could not be read (the page says so), [] when there is none.
    let payments: unknown = null;
    const state = billing as { billingEnabled?: unknown; exempt?: unknown };
    if (!isTeamMemberRole && ownerId === user.id && state.billingEnabled === true && state.exempt !== true) {
      const { data: history, error: historyError } = await admin.rpc("billing_history", { p_owner: ownerId });
      if (historyError) console.error("Error reading payment history:", historyError.message);
      else payments = Array.isArray(history) ? history : [];
    }
    return json({ teamAccess, billing: { ...(billing as Record<string, unknown>), payments } });
  } catch (error: unknown) {
    console.error("Error in get-subscription:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const isAuthError = message.toLowerCase().includes("not authenticated") || message.toLowerCase().includes("no authorization header");
    return json({ error: message }, isAuthError ? 401 : 500);
  }
});
