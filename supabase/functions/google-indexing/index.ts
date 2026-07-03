import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  notifyGoogleIndexing,
  type GoogleIndexingNotificationType,
} from "../_shared/googleIndexing.ts";

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
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  employerId: string,
) {
  if (employerId === userId) return true;

  const { data: member, error: memberError } = await supabaseAdmin
    .from("team_members")
    .select("id")
    .eq("user_id", userId)
    .eq("employer_id", employerId)
    .eq("status", "active")
    .maybeSingle();

  if (memberError) throw memberError;
  return !!member;
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
    if (!(await canAccessEmployer(supabaseAdmin, user.id, employerId))) {
      throw new Error("You do not have access to this job.");
    }
    return {
      user,
      job: { id: jobId, employer_id: employerId, status: "deleted" },
      supabaseAdmin,
    };
  }

  if (!(await canAccessEmployer(supabaseAdmin, user.id, job.employer_id))) {
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
