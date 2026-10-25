/**
 * remove-applicant — a business removes an applicant's information from its
 * account (2026-10-25; docs/LAUNCH-PLAN.md, Phase 5, task 3; the Terms ask
 * every business to act on a request to delete it).
 *
 *   POST { applicationId, reason? }  ->  { ok: true, removedFiles }
 *
 * Who is asking comes from their sign-in, never the request. The database
 * (public.remove_applicant, service role only) decides whether they may (the
 * job's business owner, or a team member who manages applicants), logs it,
 * and deletes the application and everything that hangs off it. This
 * function then deletes the files the database cannot: the application's
 * video and portfolio uploads, its voice recordings, its documents and their
 * signed copies, and the resume and form files no other application of the
 * same person still uses. Requested ID papers are queued for deletion by the
 * database itself (document_requests_trash_file). The applicant's own
 * account is untouched.
 *
 * Only files this function can tie to the applicant are deleted: their own
 * folders, the application's own recordings, and the copies kept for each of
 * its documents (documents/<document id>/). Never a path the business wrote
 * itself (a document's file address): that once let one business delete
 * another's signed copy (the Phase 5 review). A file storage will not delete
 * now is queued in storage_file_trash, which document-cleanup retries every
 * hour (20261025180000).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { requireSignedInUser } from "../_shared/signedInUser.ts";
import { documentIdsOf, resumeFilesToRemove } from "./files.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Storage = ReturnType<typeof createClient>["storage"];

/** A file, or a folder and name prefix, that storage would not delete yet. */
type Leftover = { bucket: string; path?: string; folder?: string; starts_with?: string };

async function removeAll(storage: Storage, bucket: string, paths: string[], leftovers: Leftover[]): Promise<number> {
  const unique = [...new Set(paths.filter(Boolean))];
  let removed = 0;
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const { data, error } = await storage.from(bucket).remove(batch);
    if (error) {
      console.warn(`[remove-applicant] ${bucket}: ${error.message}`);
      leftovers.push(...batch.map((path) => ({ bucket, path })));
      continue;
    }
    removed += data?.length ?? 0;
  }
  return removed;
}

async function listNames(storage: Storage, bucket: string, folder: string, startsWith: string, leftovers: Leftover[]): Promise<string[]> {
  const { data, error } = await storage.from(bucket).list(folder, { limit: 1000, ...(startsWith ? { search: startsWith } : {}) });
  if (error) {
    console.warn(`[remove-applicant] could not list ${bucket}/${folder}: ${error.message}`);
    leftovers.push({ bucket, folder, ...(startsWith ? { starts_with: startsWith } : {}) });
    return [];
  }
  return (data ?? []).map((o) => o.name).filter((name) => typeof name === "string" && name.startsWith(startsWith)).map((name) => `${folder}/${name}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const caller = await requireSignedInUser(req, corsHeaders);
  if (caller.refusal) return caller.refusal;

  let body: { applicationId?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "That request could not be read.", code: "bad_request" }, 400);
  }
  const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
  if (!UUID.test(applicationId)) return json({ error: "That applicant could not be found.", code: "not_found" }, 404);
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : null;

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });

  const { data, error } = await admin.rpc("remove_applicant", { p_application: applicationId, p_actor: caller.userId, p_reason: reason });
  if (error) {
    console.error("[remove-applicant] database refused:", error.message);
    return json({ error: "The applicant could not be removed just now. Try again in a moment.", code: "failed" }, 500);
  }
  const result = (data ?? {}) as Record<string, unknown>;
  if (result.ok !== true) {
    const why = String(result.reason ?? "failed");
    if (why === "not_allowed") return json({ error: "Only the business owner, or a teammate who manages applicants, can remove an applicant.", code: why }, 403);
    if (why === "not_found") return json({ error: "That applicant could not be found. They may have been removed already.", code: why }, 404);
    if (why === "not_signed_in") return json({ error: "Please sign in again.", code: why }, 401);
    return json({ error: "The applicant could not be removed just now. Try again in a moment.", code: "failed" }, 500);
  }

  // The application is gone; the files follow, as far as storage allows. A
  // file that cannot be deleted now is queued for the hourly retry, never a
  // reason to undo.
  const candidateId = String(result.candidate_id ?? "");
  const storage = admin.storage;
  const leftovers: Leftover[] = [];
  let removedFiles = 0;
  try {
    if (UUID.test(candidateId)) {
      removedFiles += await removeAll(storage, "videos", await listNames(storage, "videos", candidateId, `${applicationId}-`, leftovers), leftovers);
      removedFiles += await removeAll(storage, "portfolios", await listNames(storage, "portfolios", candidateId, `${applicationId}-`, leftovers), leftovers);
      removedFiles += await removeAll(storage, "resumes", resumeFilesToRemove(candidateId, result.resume_url, result.notes, String(result.other_refs ?? "")), leftovers);
    }
    removedFiles += await removeAll(storage, "voice-interview-recordings", await listNames(storage, "voice-interview-recordings", applicationId, "", leftovers), leftovers);
    const documents = Array.isArray(result.documents) ? (result.documents as Array<{ id?: unknown }>) : [];
    const documentFiles: string[] = [];
    for (const id of documentIdsOf(documents)) documentFiles.push(...(await listNames(storage, "documents", `documents/${id}`, "", leftovers)));
    removedFiles += await removeAll(storage, "documents", documentFiles, leftovers);
  } catch (e) {
    console.warn("[remove-applicant] some files were not removed:", e instanceof Error ? e.message : String(e));
  }

  let filesQueued = 0;
  if (leftovers.length > 0) {
    const { error: queueError } = await admin.from("storage_file_trash").insert(leftovers.map((l) => ({ ...l, application_id: applicationId })));
    if (queueError) console.error(`[remove-applicant] could not queue ${leftovers.length} files for the retry:`, queueError.message);
    else filesQueued = leftovers.length;
  }

  return json({ ok: true, removedFiles, filesQueued });
});
