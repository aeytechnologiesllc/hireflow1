import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  notifyGoogleIndexing,
  type GoogleIndexingNotificationType,
} from "../_shared/googleIndexing.ts";
import { isScopedTeamMemberFromRpc } from "../_shared/teamMemberRpcAccess.ts";
import { canDeleteMissingJobAsTeamMemberFromMembership } from "../_shared/deletedJobTeamMemberAccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isNotificationType(value: unknown): value is GoogleIndexingNotificationType {
  return value === "URL_UPDATED" || value === "URL_DELETED";
}

async function canAccessEmployer(
  supabaseUser: SupabaseClient<any, any, any>,
  userId: string,
  employerId: string,
  jobId: string,
) {
  if (employerId === userId) return true;

  // Team-member access must be scoped to THIS job the same way the live
  // RLS policy on `applications` scopes it ("Team members can view
  // applications for assigned jobs" -> is_active_team_member_for_job),
  // whose definition requires assigned_job_ids to be null (whole-employer
  // access) OR contain this job's id. A plain team_members row check
  // (user_id + employer_id + active) would let a team member scoped to
  // job A fire indexing pings for job B just by sharing an employer --
  // call the same SECURITY DEFINER function the applications RLS policy
  // uses, via the caller's own JWT (so its p_user_id = auth.uid() check
  // passes), instead of re-implementing the scoping rule here. When the
  // job row no longer exists (the hard-deleted-job fallback below), the
  // RPC's own join against `jobs` can never match, so this alone always
  // denies a non-owner there -- see canDeleteMissingJobAsTeamMember below
  // for the fallback that fixes that case for legitimate deleters.
  const teamMemberRpc = await supabaseUser.rpc(
    "is_active_team_member_for_job",
    { p_job_id: jobId, p_user_id: userId },
  );

  if (teamMemberRpc.error) {
    // Fail closed: an RPC error must never be treated as access granted.
    console.error("[google-indexing] is_active_team_member_for_job RPC error:", teamMemberRpc.error);
  }

  return isScopedTeamMemberFromRpc(teamMemberRpc);
}

// canAccessEmployer's RPC-based check can never grant access once the job
// row is gone (its query joins against `jobs`, so EXISTS never matches for
// a non-owner). But a team member with can_delete_jobs=true, scoped to this
// job, legitimately deleted it themselves via the live RLS policy "Team
// members can delete assigned jobs if permitted" (jobs DELETE, requires
// can_delete_jobs = true AND (assigned_job_ids IS NULL OR jobId =
// ANY(assigned_job_ids))) -- by the time this URL_DELETED ping runs, that
// same delete has already removed the only row the RPC could have joined
// against. Re-check the *same* condition the RLS policy used, directly
// against team_members (which still has the row), instead of leaving every
// non-owner denied here. Uses the service-role client (not RLS) but filters
// on user_id = the authenticated caller and employerId, both already
// established as trustworthy by the caller above, so this can't be used to
// read or match another user's membership row.
async function canDeleteMissingJobAsTeamMember(
  supabaseAdmin: SupabaseClient<any, any, any>,
  userId: string,
  employerId: string,
  jobId: string,
) {
  const { data: membership, error } = await supabaseAdmin
    .from("team_members")
    .select("can_delete_jobs, assigned_job_ids")
    .eq("employer_id", employerId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    // Fail closed: a lookup error must never be treated as access granted.
    console.error("[google-indexing] team_members fallback lookup error:", error);
    return false;
  }

  return canDeleteMissingJobAsTeamMemberFromMembership(membership, jobId);
}

async function getAuthorizedJob(
  req: Request,
  jobId: string,
  notificationType: GoogleIndexingNotificationType,
  fallbackEmployerId?: string | null,
) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("No authorization header");

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) throw new Error("User not authenticated");

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("id, employer_id, status")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw jobError;

  if (!job) {
    const employerId = String(fallbackEmployerId ?? "").trim();
    if (notificationType !== "URL_DELETED" || !employerId) {
      throw new Error("Job not found.");
    }
    const hasAccess =
      (await canAccessEmployer(supabaseUser, user.id, employerId, jobId)) ||
      (await canDeleteMissingJobAsTeamMember(supabaseAdmin, user.id, employerId, jobId));
    if (!hasAccess) {
      throw new Error("You do not have access to this job.");
    }
    return {
      user,
      job: { id: jobId, employer_id: employerId, status: "deleted" },
      supabaseAdmin,
    };
  }

  if (!(await canAccessEmployer(supabaseUser, user.id, job.employer_id, job.id))) {
    throw new Error("You do not have access to this job.");
  }

  return { user, job, supabaseAdmin };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const jobId = String(body?.jobId ?? "").trim();
    const employerId = typeof body?.employerId === "string" ? body.employerId : null;
    const notificationType = body?.notificationType;
    const reason = typeof body?.reason === "string" ? body.reason : "job_status_change";

    if (!jobId) return json({ error: "Missing jobId." }, 400);
    if (!isNotificationType(notificationType)) {
      return json({ error: "notificationType must be URL_UPDATED or URL_DELETED." }, 400);
    }

    const { user, job, supabaseAdmin } = await getAuthorizedJob(req, jobId, notificationType, employerId);

    if (notificationType === "URL_UPDATED" && job.status !== "published") {
      return json({
        ok: true,
        configured: false,
        status: "skipped",
        notificationType,
        reason: "Only published jobs are submitted as URL_UPDATED.",
      });
    }

    const result = await notifyGoogleIndexing({
      supabaseAdmin,
      job,
      notificationType,
      requestedBy: user.id,
      reason,
    });

    return json(result, result.ok ? 200 : 502);
  } catch (error: unknown) {
    console.error("[google-indexing]", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /authenticated|authorization|No authorization/i.test(message)
      ? 401
      : /access|not found/i.test(message)
        ? 403
        : 400;
    return json({ error: message }, status);
  }
});
