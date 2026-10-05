/**
 * applicant-file-url — a short-lived signed link to one file an applicant
 * attached to their application, for the hiring team.
 *
 *   POST { applicationId, path }  ->  { signedUrl, path, expiresIn }
 *
 * The files live in the private `resumes` bucket (ApplicationFormPhase.tsx
 * uploads them under the candidate's own user id), and its storage policies
 * let the job owner read only the file named in applications.resume_url. The
 * other uploads listed in notes.fileUploads, and every file for a team
 * member, could not be opened by staff at all.
 *
 * Who may ask: the job's owner, or an active team member scoped to that job,
 * decided by the same SECURITY DEFINER functions the applications RLS uses
 * (is_job_owner / is_active_team_member_for_job), called with the CALLER's
 * own JWT so the functions' `p_user_id = auth.uid()` check holds. Any RPC
 * error denies (isScopedTeamMemberFromRpc's fail-closed rule). The candidate
 * is not served here: their own files are already readable to them.
 *
 * What may be signed: only a path that application lists AND that sits in
 * its candidate's own upload folder (filePaths.ts), so this can never sign an
 * arbitrary object in the bucket, nor another person's file a candidate
 * wrote into their own notes. The link lasts five minutes.
 * verify_jwt = true (config.toml), plus auth.getUser() here.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { guardAuthenticatedAiCall } from "../_shared/rateLimit.ts";
import { isScopedTeamMemberFromRpc } from "../_shared/teamMemberRpcAccess.ts";
import { APPLICANT_FILES_BUCKET, authorizeApplicantFilePath, canReadApplicantFiles } from "./filePaths.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LINK_SECONDS = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error("[applicant-file-url] Supabase env vars missing");
      return jsonResponse({ error: "Server not configured" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Opening files is cheap, but a list of paths is not something to walk
    // through at speed; generous for a person, a wall for a script.
    const limited = await guardAuthenticatedAiCall("applicant-file-url", user.id, corsHeaders, 600, 3600);
    if (limited) return limited;

    let body: { applicationId?: unknown; path?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }
    const applicationId = body?.applicationId;
    if (typeof applicationId !== "string" || !UUID_RE.test(applicationId)) {
      return jsonResponse({ error: "applicationId is required" }, 400);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: application, error: appError } = await admin
      .from("applications")
      .select("id, job_id, candidate_id, notes, resume_url")
      .eq("id", applicationId)
      .maybeSingle();
    if (appError || !application) {
      return jsonResponse({ error: "Application not found" }, 404);
    }

    // Staff on THIS job only, by the functions the applications RLS uses,
    // called as the caller. An RPC error denies.
    const [ownerRpc, teamMemberRpc] = await Promise.all([
      supabaseUserClient.rpc("is_job_owner", { p_job_id: application.job_id, p_user_id: user.id }),
      supabaseUserClient.rpc("is_active_team_member_for_job", { p_job_id: application.job_id, p_user_id: user.id }),
    ]);
    if (ownerRpc.error) console.error("[applicant-file-url] is_job_owner RPC error:", ownerRpc.error);
    if (teamMemberRpc.error) console.error("[applicant-file-url] is_active_team_member_for_job RPC error:", teamMemberRpc.error);
    const allowed = canReadApplicantFiles({
      // The same fail-closed mapping for both: only `true` without an error grants.
      isJobOwner: isScopedTeamMemberFromRpc(ownerRpc),
      isScopedTeamMember: isScopedTeamMemberFromRpc(teamMemberRpc),
    });
    if (!allowed) {
      console.warn("[applicant-file-url] refused", { requesterId: user.id, applicationId });
      return jsonResponse({ error: "You do not have access to this applicant's files" }, 403);
    }

    const decision = authorizeApplicantFilePath(body?.path, application);
    if (!decision.ok) {
      return decision.reason === "invalid_path"
        ? jsonResponse({ error: "A file path is required" }, 400)
        : jsonResponse({ error: "That file is not part of this application" }, 404);
    }

    const { data: signed, error: signError } = await admin.storage
      .from(APPLICANT_FILES_BUCKET)
      .createSignedUrl(decision.path, LINK_SECONDS);
    if (signError || !signed?.signedUrl) {
      console.error("[applicant-file-url] could not sign", { applicationId, path: decision.path, error: signError });
      return jsonResponse({ error: "That file could not be opened" }, 404);
    }

    return jsonResponse({ signedUrl: signed.signedUrl, path: decision.path, expiresIn: LINK_SECONDS });
  } catch (error) {
    console.error("[applicant-file-url] Unhandled error:", error);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
