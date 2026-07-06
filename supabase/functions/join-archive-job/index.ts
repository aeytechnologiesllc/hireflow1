/**
 * join-archive-job — when a HireFlow job closes, archive it at JOIN too so it
 * stops being multiposted AND stops counting as a billable active job.
 * Tolerant: if JOIN says it's already archived/gone, we still mark it archived here.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json, requireUser, resolveJoinToken } from "../_shared/joinAccess.ts";
import { changeJobStatus, JoinApiError } from "../_shared/joinClient.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const { userId, admin } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const jobId = String(body?.jobId ?? "").trim();
    if (!jobId) return json({ error: "jobId is required" }, 400);

    const { data: post, error: postError } = await admin
      .from("job_distribution_posts")
      .select("job_id, employer_id, provider_job_id, status")
      .eq("job_id", jobId)
      .eq("provider", "join")
      .maybeSingle();
    if (postError) throw postError;
    if (!post) return json({ configured: true, status: "not_distributed", note: "This job was never sent to JOIN" });
    if (post.employer_id !== userId) return json({ error: "You can only manage your own jobs" }, 403);
    if (!post.provider_job_id) {
      await admin
        .from("job_distribution_posts")
        .update({ status: "archived", archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("job_id", jobId)
        .eq("provider", "join");
      return json({ configured: true, status: "archived", note: "Marked archived (was never created at JOIN)" });
    }

    const tokenInfo = await resolveJoinToken(admin, userId);
    if (!tokenInfo) return json({ configured: false, status: "not_configured" });

    try {
      await changeJobStatus(tokenInfo.token, post.provider_job_id, "ARCHIVED");
    } catch (e) {
      // Already archived / not found at JOIN → treat as archived; real API errors → surface.
      const benign = e instanceof JoinApiError && (e.status === 404 || /archiv/i.test(e.message));
      if (!benign) {
        const message = e instanceof Error ? e.message : String(e);
        await admin
          .from("job_distribution_posts")
          .update({ status: "needs_attention", last_error: `Archive failed: ${message}`, updated_at: new Date().toISOString() })
          .eq("job_id", jobId)
          .eq("provider", "join");
        // 200 with business-state — see join-publish-job note on invoke() and non-2xx bodies.
        return json({ configured: true, status: "needs_attention", error: message });
      }
    }

    await admin
      .from("job_distribution_posts")
      .update({ status: "archived", archived_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
      .eq("job_id", jobId)
      .eq("provider", "join");

    return json({ configured: true, status: "archived" });
  } catch (error) {
    console.error("[join-archive-job]", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, /authenticated|authorization/i.test(message) ? 401 : 400);
  }
});
