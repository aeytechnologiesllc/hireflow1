// document-cleanup: deletes identity papers 24 hours after the hiring team
// first opens them (docs/DOCUMENT-REQUESTS.md).
//
// The owner, 2026-10-10: "the best thing is we don't save it ... we delete it
// in 24 hours of the employer receiving the driver license. So that way we
// are not liable for saving those driver license." A government ID, NBI
// clearance or proof of address is deleted from the private bucket:
//
//   - 24 hours after someone on the hiring side first opened it
//     (document_requests.team_opened_at, set by requested-document-url), or
//   - 7 days after it was sent, if nobody on the hiring side ever opened it.
//
// Everything else in that request's own folder (an earlier photo that was
// sent again) goes with it. The request keeps a note of when
// (file_deleted_at), and the deletion is recorded in document_request_events.
// Typed answers and other kinds of files are kept.
//
// Called every hour by the database's own scheduler (pg_cron, the
// `document-cleanup` job), never by a browser. The job sends a secret it reads
// from Vault; this asks the database whether it matches
// (document_cleanup_secret_matches, service role only). Without it: 401, and
// nothing is read. The answer is counts only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";

/** The identity papers: the same list as ID_PAPER_KINDS in src/lib/documentRequests.ts. */
const DELETED_KINDS = ["government_id", "nbi_clearance", "proof_of_address"];
/** ID_DELETE_HOURS_AFTER_OPENED and ID_DELETE_DAYS_UNOPENED in src/lib/documentRequests.ts. */
const HOURS_AFTER_OPENED = 24;
const DAYS_UNOPENED = 7;
const BUCKET = "requested-documents";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const given = req.headers.get("x-cleanup-secret") ?? "";
  if (given.length < 32 || given.length > 256) return json({ error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: matches, error: secretError } = await admin.rpc("document_cleanup_secret_matches", { p_given: given });
  if (secretError || matches !== true) return json({ error: "unauthorized" }, 401);

  const openedBefore = new Date(Date.now() - HOURS_AFTER_OPENED * 3_600_000).toISOString();
  const sentBefore = new Date(Date.now() - DAYS_UNOPENED * 86_400_000).toISOString();
  const base = () =>
    admin
      .from("document_requests")
      .select("id, candidate_id, file_url, status")
      .in("document_type", DELETED_KINDS)
      .not("file_url", "is", null)
      .limit(200);
  const [opened, unopened, neverMarkedSent] = await Promise.all([
    base().lte("team_opened_at", openedBefore),
    base().is("team_opened_at", null).lte("submitted_at", sentBefore),
    // A file put there without being marked sent: counted from the request.
    base().is("team_opened_at", null).is("submitted_at", null).lte("created_at", sentBefore),
  ]);
  const error = opened.error ?? unopened.error ?? neverMarkedSent.error;
  const due = [...(opened.data ?? []), ...(unopened.data ?? []), ...(neverMarkedSent.data ?? [])];
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
    // The request stays as it was (received, approved or asked again), with
    // no file and the day it went. A new file from the applicant clears that
    // and starts its own clock (the database's guard).
    await admin.from("document_requests").update({ file_url: null, file_deleted_at: new Date().toISOString() }).eq("id", request.id);
    await admin.from("document_request_events").insert({ request_id: request.id, user_id: null, action: "deleted" });
    counts.deleted += 1;
  }
  return json({ ok: true, ...counts });
});
