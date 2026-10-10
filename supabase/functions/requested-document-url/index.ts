/**
 * requested-document-url: a five-minute link to the file an applicant sent
 * for a document request (docs/DOCUMENT-REQUESTS.md).
 *
 *   POST { requestId }  ->  { signedUrl, fileName, expiresIn }
 *
 * The files live in the private `requested-documents` bucket, each in its
 * applicant's own folder. Since 2026-10-10 the hiring team can open one ONLY
 * through here (the employers' storage rule was dropped), so every opening is
 * checked and recorded in document_request_events.
 *
 * Who may ask: the applicant who sent it, or the job's owner or an active
 * team member scoped to that job, decided by the same SECURITY DEFINER
 * functions the applications RLS uses, called with the CALLER's own JWT. An
 * RPC error denies.
 *
 * What is signed: only that request's own file_url, and only when it sits in
 * that applicant's folder (the database's guard already refuses anything
 * else; this checks again). A deleted file (an identity paper removed after
 * approval) answers 410.
 *
 * verify_jwt = true (config.toml), plus auth.getUser() here.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { guardAuthenticatedAiCall } from "../_shared/rateLimit.ts";
import { isScopedTeamMemberFromRpc } from "../_shared/teamMemberRpcAccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "requested-documents";
const LINK_SECONDS = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** True when a stored path is a file in this applicant's own folder. */
function inOwnFolder(path: unknown, candidateId: string): path is string {
  return typeof path === "string" && path.startsWith(`${candidateId}/`) && !path.includes("..") && path.length <= 1024;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error("[requested-document-url] Supabase env vars missing");
      return jsonResponse({ error: "Server not configured" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization header" }, 401);
    const asCaller = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await asCaller.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const limited = await guardAuthenticatedAiCall("requested-document-url", user.id, corsHeaders, 300, 3600);
    if (limited) return limited;

    let body: { requestId?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }
    const requestId = body?.requestId;
    if (typeof requestId !== "string" || !UUID_RE.test(requestId)) return jsonResponse({ error: "requestId is required" }, 400);

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: request, error: requestError } = await admin
      .from("document_requests")
      .select("id, application_id, candidate_id, file_url, file_name, file_deleted_at, applications(job_id)")
      .eq("id", requestId)
      .maybeSingle();
    if (requestError || !request) return jsonResponse({ error: "Request not found" }, 404);

    const jobId = (Array.isArray(request.applications) ? request.applications[0] : request.applications)?.job_id as string | undefined;
    let allowed = user.id === request.candidate_id;
    if (!allowed && jobId) {
      const [ownerRpc, teamRpc] = await Promise.all([
        asCaller.rpc("is_job_owner", { p_job_id: jobId, p_user_id: user.id }),
        asCaller.rpc("is_active_team_member_for_job", { p_job_id: jobId, p_user_id: user.id }),
      ]);
      allowed = isScopedTeamMemberFromRpc(ownerRpc) || isScopedTeamMemberFromRpc(teamRpc);
    }
    if (!allowed) {
      console.warn("[requested-document-url] refused", { requesterId: user.id, requestId });
      return jsonResponse({ error: "You do not have access to this file" }, 403);
    }

    if (request.file_deleted_at) return jsonResponse({ error: "This file was deleted after it was approved" }, 410);
    if (!inOwnFolder(request.file_url, request.candidate_id)) return jsonResponse({ error: "Nothing has been sent for this request" }, 404);

    const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(request.file_url, LINK_SECONDS);
    if (signError || !signed?.signedUrl) {
      console.error("[requested-document-url] could not sign", { requestId, error: signError });
      return jsonResponse({ error: "That file could not be opened" }, 404);
    }

    // The record of who opened it. A failed write must not hide the file from
    // the person allowed to see it, so it is logged and the link still goes.
    const { error: logError } = await admin.from("document_request_events").insert({ request_id: request.id, user_id: user.id, action: "opened" });
    if (logError) console.error("[requested-document-url] could not record the opening", { requestId, error: logError.message });

    return jsonResponse({ signedUrl: signed.signedUrl, fileName: request.file_name ?? "", expiresIn: LINK_SECONDS });
  } catch (error) {
    console.error("[requested-document-url] Unhandled error:", error instanceof Error ? error.message : "unknown");
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
