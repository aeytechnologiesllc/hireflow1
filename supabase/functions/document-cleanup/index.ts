// document-cleanup: deletes identity papers 30 days after they are approved
// (docs/DOCUMENT-REQUESTS.md).
//
// The owner, 2026-10-10, on asking applicants for an ID: "have it encrypted in
// some way". The files are private and opened only through
// requested-document-url; this makes sure nobody is left holding copies of
// IDs: once a government ID, NBI clearance or proof of address has been
// approved for 30 days, its file is deleted from the private bucket, the
// request keeps a note of when (file_deleted_at), and the deletion is recorded
// in document_request_events. Typed answers and other files are kept.
//
// Two more, so no stray copy of an ID is left: everything else in that
// request's own folder (an earlier photo that was sent again) goes with it,
// and an ID the team asked for again that was never re-sent is removed 30 days
// after they asked (the request stays open, with no file).
//
// Called once a day by the database's own scheduler (pg_cron, the
// `document-cleanup` job), never by a browser. The job sends a secret it reads
// from Vault; this asks the database whether it matches
// (document_cleanup_secret_matches, service role only). Without it: 401, and
// nothing is read. The answer is counts only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";

/** The kinds deleted after approval: the same list as src/lib/documentRequests.ts (DELETED_AFTER_APPROVAL). */
const DELETED_KINDS = ["government_id", "nbi_clearance", "proof_of_address"];
/** Days after approval: ID_KEEP_DAYS in src/lib/documentRequests.ts. */
const KEEP_DAYS = 30;
const BUCKET = "requested-documents";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const given = req.headers.get("x-cleanup-secret") ?? "";
  if (given.length < 32 || given.length > 256) return json({ error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: matches, error: secretError } = await admin.rpc("document_cleanup_secret_matches", { p_given: given });
  if (secretError || matches !== true) return json({ error: "unauthorized" }, 401);

  const before = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  const { data: due, error } = await admin
    .from("document_requests")
    .select("id, candidate_id, file_url, status")
    .in("document_type", DELETED_KINDS)
    .in("status", ["approved", "rejected"])
    .not("file_url", "is", null)
    .is("file_deleted_at", null)
    .lte("reviewed_at", before)
    .limit(200);
  if (error) {
    console.error("[document-cleanup] could not read requests:", error.message);
    return json({ error: "read_failed" }, 500);
  }

  const counts = { due: due?.length ?? 0, deleted: 0, failed: 0 };
  for (const request of due ?? []) {
    const path = String(request.file_url);
    // Only ever a file in that applicant's own folder.
    if (!path.startsWith(`${request.candidate_id}/`) || path.includes("..")) {
      counts.failed += 1;
      continue;
    }
    // The file, and anything else left in this request's folder.
    const folder = `${request.candidate_id}/${request.id}`;
    const { data: listed } = await admin.storage.from(BUCKET).list(folder, { limit: 100 });
    const paths = [...new Set([path, ...(listed ?? []).filter((f) => f.name).map((f) => `${folder}/${f.name}`)])];
    const { error: removeError } = await admin.storage.from(BUCKET).remove(paths);
    if (removeError) {
      counts.failed += 1;
      console.error(`[document-cleanup] could not delete the file of request ${request.id}:`, removeError.message);
      continue;
    }
    // Approved: closed, with the day it was deleted. Asked again: still open,
    // so a new file can come in and be opened as usual.
    const update = request.status === "approved" ? { file_url: null, file_deleted_at: new Date().toISOString() } : { file_url: null };
    await admin.from("document_requests").update(update).eq("id", request.id);
    await admin.from("document_request_events").insert({ request_id: request.id, user_id: null, action: "deleted" });
    counts.deleted += 1;
  }
  return json({ ok: true, ...counts });
});
