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
// It also empties the files queued for removal (storage_file_trash): those
// "Delete their information" could not delete at the time (remove-applicant),
// and a deleted application's recordings, video introduction, work samples
// and the files sent with its form, where storage holds them (a withdrawal,
// Delete Account, a deleted job; the database's own
// applications_queue_voice_recordings trigger), and a deleted document's kept
// copies (documents_queue_files). It takes them fairly: a few from each
// person a run, people in turn (storage_file_trash_fair_pick, which records
// whom each run took), a note that failed only after a back-off; and it
// clears exact paths in bulk. So one account that fills the queue holds up
// only itself (the eighth security review), many accounts hold up nobody for
// good (the ninth), and a burst by many accounts delays a later removal about
// a run for every 200 of them, not for as long as their notes last (the
// tenth). When the queue backs up (a run's worth still waiting, or a note
// waiting over three hours), the platform admins are told once a day.
//
// Called every hour by the database's own scheduler (pg_cron, the
// `document-cleanup` job), never by a browser. The job sends a secret it reads
// from Vault; this asks the database whether it matches
// (document_cleanup_secret_matches, service role only). Without it: 401, and
// nothing is read. The answer is counts only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { isPlainObjectPath } from "../_shared/ownDocumentFile.ts";

/** The identity papers: the same list as ID_PAPER_KINDS in src/lib/documentRequests.ts. */
const DELETED_KINDS = ["government_id", "nbi_clearance", "proof_of_address"];
/** ID_DELETE_HOURS_AFTER_OPENED and ID_DELETE_DAYS_UNOPENED in src/lib/documentRequests.ts. */
const HOURS_AFTER_OPENED = 24;
const DAYS_UNOPENED = 7;
const BUCKET = "requested-documents";
/** The buckets an applicant's removal may leave a file in (storage_file_trash's own check). */
const REMOVAL_BUCKETS = new Set(["videos", "portfolios", "resumes", "voice-interview-recordings", "documents"]);
/**
 * Notes of the removal queue taken each run (every hour): the numbers
 * storage_file_trash_fair_pick takes (20261025560000), at most 6 folders and
 * 40 exact paths from one person. A folder costs a list and a remove; exact
 * paths go in one remove() a bucket.
 */
const FOLDER_NOTES_PER_RUN = 200;
const PATH_NOTES_PER_RUN = 1000;
/** Storage takes at most 1,000 names in one remove(). */
const REMOVE_BATCH = 1000;
/** Notes deleted (or marked tried) in one request: their ids go in the address. */
const IDS_PER_REQUEST = 100;
/** A batch storage refuses is tried one path at a time; this many refused in a row is storage itself refusing. */
const REFUSED_IN_A_ROW = 3;
/** A note never tried after this long means the queue is backed up (each person's are taken oldest first, every hour). */
const BACKLOG_HOURS = 3;

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
  // A failed read skips this hour's ID papers, never the queues below (the
  // second Phase 5 review: it returned before them).
  if (error) console.error("[document-cleanup] could not read requests:", error.message);

  // A failed read is told as a failed read, never counted as a failed delete
  // (the eighth review: it also sent "could not delete 1 ID file", which used
  // up that alert for the day).
  const counts = { due: error ? 0 : due.length, deleted: 0, failed: 0 };
  for (const request of error ? [] : due) {
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

  // Files whose request is gone (its job, application or business was
  // deleted): the database noted them (document_file_trash, 20261011195000);
  // the file and its folder go now, then the note.
  const { data: trash, error: trashError } = await admin.from("document_file_trash").select("id, candidate_id, request_id, file_url").limit(200);
  if (trashError) console.error("[document-cleanup] could not read the trash:", trashError.message);
  let orphans = 0;
  let orphansFailed = 0;
  for (const note of trash ?? []) {
    const folder = `${note.candidate_id}/${note.request_id}`;
    const file = String(note.file_url ?? "");
    const own = file.startsWith(`${note.candidate_id}/`) && !file.includes("..") ? [file] : [];
    const { data: listed } = await admin.storage.from(BUCKET).list(folder, { limit: 100 });
    const paths = [...new Set([...own, ...(listed ?? []).filter((f) => f.name).map((f) => `${folder}/${f.name}`)])];
    if (paths.length > 0) {
      const { error: removeError } = await admin.storage.from(BUCKET).remove(paths);
      if (removeError) {
        orphansFailed += 1;
        console.error(`[document-cleanup] could not delete the file of deleted request ${note.request_id}:`, removeError.message);
        continue;
      }
    }
    await admin.from("document_file_trash").delete().eq("id", note.id);
    orphans += 1;
  }
  // Files an applicant's removal could not delete at the time
  // (remove-applicant; storage_file_trash, 20261025180000), a deleted
  // application's own files and a deleted document's kept copies: an exact
  // file, or a folder whose names start with a prefix. Tried again every hour
  // until storage takes them; the note goes once they are gone.
  // Taken fairly (storage_file_trash_fair_pick, 20261025560000,
  // 20261025580000 and 20261025590000): a few from each person a run, each
  // person's oldest note first, people in turn (by when the pick last took
  // them, which it records itself), then the people with the fewest waiting
  // first; a note that failed waits out a back-off behind every note that is
  // due. The eighth security review: one account's 860 notes an hour, taken
  // 200 a run oldest first, held every real withdrawal up for days. The
  // ninth: by the fewest waiting alone, many accounts with one note each (or
  // one note each that failed every hour) kept a real withdrawal out of every
  // run. The tenth: by each note's age, 200 accounts' one-hour burst kept a
  // place ahead of every later withdrawal for 30 runs. Folders and exact
  // paths are read apart, so neither answer passes the API's 1,000-row
  // ceiling.
  type Note = { id: string; bucket: string; path: string | null; folder: string | null; starts_with: string | null; attempts: number | null };
  const [folderPick, exactPick] = await Promise.all([
    admin.rpc("storage_file_trash_fair_pick", { p_exact: false }),
    admin.rpc("storage_file_trash_fair_pick", { p_exact: true }),
  ]);
  const leftoverError = folderPick.error ?? exactPick.error;
  if (leftoverError) console.error("[document-cleanup] could not read the removal queue:", leftoverError.message);
  const leftovers: Note[] = [...((folderPick.data ?? []) as Note[]), ...((exactPick.data ?? []) as Note[])];
  const done: string[] = [];
  const failed: { note: Note; why: string }[] = [];
  const dropped: string[] = [];
  // Only a plain path, in one of the buckets a removal uses: never one that
  // starts with "/" or holds "..", "//", "%", a backslash, a control
  // character or a "." part (isPlainObjectPath: a service-key request reads
  // "%2e%2e" as a step out of the folder).
  const plain = (p: unknown) => typeof p === "string" && p.length >= 3 && !p.startsWith("/") && !p.includes("..") && !p.includes("//") && isPlainObjectPath(p);
  const exact = new Map<string, Note[]>();
  for (const note of leftovers) {
    const bucket = String(note.bucket);
    if (!REMOVAL_BUCKETS.has(bucket) || !(note.path ? plain(note.path) : plain(note.folder))) {
      // Never sent to storage, so it would fail every hour for good: the note
      // goes, logged once (the ninth security review: a thousand accounts'
      // "<uid>/." notes, retried every hour, held the front of every run).
      // Storage refuses such a name in an upload, so no file is left by it.
      console.error(`[document-cleanup] dropped a removal note that is not a plain path (${note.id}, ${bucket})`);
      dropped.push(note.id);
      continue;
    }
    if (note.path) {
      exact.set(bucket, [...(exact.get(bucket) ?? []), note]);
      continue;
    }
    // A folder: what it holds under the prefix, then one remove.
    const prefix = String(note.starts_with ?? "");
    let failure: string | null = null;
    let paths: string[] = [];
    const { data: listed, error: listError } = await admin.storage.from(bucket).list(String(note.folder), { limit: 1000, ...(prefix ? { search: prefix } : {}) });
    if (listError) failure = listError.message;
    else paths = (listed ?? []).filter((f) => f.name && f.name.startsWith(prefix)).map((f) => `${note.folder}/${f.name}`);
    if (!failure && paths.length > 0) {
      const { error: removeError } = await admin.storage.from(bucket).remove(paths);
      if (removeError) failure = removeError.message;
    }
    if (failure) failed.push({ note, why: failure });
    else done.push(note.id);
  }
  // Exact paths in bulk: one remove() a bucket for up to 1,000 (the eighth
  // security review: one call a path could not keep up). A batch storage
  // refuses is tried again one path at a time, so a path it will not take
  // never keeps the others; three refused in a row is storage itself
  // refusing, and the rest of that batch waits for the next hour.
  for (const [bucket, notes] of exact) {
    for (let i = 0; i < notes.length; i += REMOVE_BATCH) {
      const batch = notes.slice(i, i + REMOVE_BATCH);
      const { error: batchError } = await admin.storage.from(bucket).remove(batch.map((n) => String(n.path)));
      if (!batchError) {
        done.push(...batch.map((n) => n.id));
        continue;
      }
      let refusedInARow = 0;
      for (const note of batch) {
        if (refusedInARow >= REFUSED_IN_A_ROW) {
          failed.push({ note, why: batchError.message });
          continue;
        }
        const { error: oneError } = await admin.storage.from(bucket).remove([String(note.path)]);
        if (oneError) {
          refusedInARow += 1;
          failed.push({ note, why: oneError.message });
        } else {
          refusedInARow = 0;
          done.push(note.id);
        }
      }
    }
  }
  // The notes whose files are gone go, a hundred a request.
  for (let i = 0; i < done.length; i += IDS_PER_REQUEST) {
    const { error: dropError } = await admin.from("storage_file_trash").delete().in("id", done.slice(i, i + IDS_PER_REQUEST));
    if (dropError) console.error("[document-cleanup] could not drop the notes of files already gone (they are tried again next hour):", dropError.message);
  }
  // …and the notes that are not a plain path.
  for (let i = 0; i < dropped.length; i += IDS_PER_REQUEST) {
    const { error: dropError } = await admin.from("storage_file_trash").delete().in("id", dropped.slice(i, i + IDS_PER_REQUEST));
    if (dropError) console.error("[document-cleanup] could not drop the removal notes that are not a plain path:", dropError.message);
  }
  // Each one that failed is tried again next hour, after every note never
  // tried: its tries go up by one (notes grouped by the tries they had).
  const byTries = new Map<number, string[]>();
  failed.forEach(({ note, why }, n) => {
    const tries = Number(note.attempts ?? 0);
    if (n < 20) console.error(`[document-cleanup] removal note ${note.id} (${note.bucket}) failed again, attempt ${tries + 1}:`, why);
    byTries.set(tries, [...(byTries.get(tries) ?? []), note.id]);
  });
  if (failed.length > 20) console.error(`[document-cleanup] …and ${failed.length - 20} more removal notes failed again`);
  const triedAt = new Date().toISOString();
  for (const [tries, ids] of byTries) {
    for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) {
      await admin.from("storage_file_trash").update({ attempts: tries + 1, last_tried_at: triedAt }).in("id", ids.slice(i, i + IDS_PER_REQUEST));
    }
  }
  const leftoversRemoved = done.length;
  const leftoversFailed = failed.length;
  const leftoversDropped = dropped.length;
  // What is still waiting, never tried, after this run: the queue is backed
  // up when a whole run's worth of folders or of exact paths is, or when one
  // note has waited more than BACKLOG_HOURS (the eleventh Phase 5 review: one
  // account looping "start an application, withdraw it" filled the queue far
  // faster than it cleared, every real removal waited behind it, and nobody
  // was told, since only failures were). Since the fair pick, an account
  // filling it waits behind everyone else, and this tells the admins it is
  // there, and how to see whether it is one account or many (the tenth
  // security review: "one candidate_id on many rows" described only one).
  let leftoversWaiting: number | null = null;
  let backedUp = false;
  let oldestWaiting: string | null = null;
  if (!leftoverError) {
    const waiting = (exactPaths: boolean) => {
      const q = admin.from("storage_file_trash").select("id", { count: "exact", head: true }).eq("attempts", 0);
      return exactPaths ? q.not("path", "is", null) : q.is("path", null);
    };
    const [folders, paths] = await Promise.all([waiting(false), waiting(true)]);
    const { data: oldest, error: oldestError } = await admin.from("storage_file_trash").select("queued_at").eq("attempts", 0).order("queued_at", { ascending: true }).limit(1);
    const countError = folders.error ?? paths.error ?? oldestError;
    if (countError) console.error("[document-cleanup] could not count the removal queue:", countError.message);
    else {
      leftoversWaiting = (folders.count ?? 0) + (paths.count ?? 0);
      backedUp = (folders.count ?? 0) >= FOLDER_NOTES_PER_RUN || (paths.count ?? 0) >= PATH_NOTES_PER_RUN;
      oldestWaiting = typeof oldest?.[0]?.queued_at === "string" ? oldest[0].queued_at : null;
    }
  }
  // A failed read of the ID papers still answers as a failure (after the
  // queues ran), so a lasting error shows in the scheduler's history instead
  // of quietly stopping the 24-hour deletion (the third Phase 5 review).
  // The scheduler's history only shows the request was sent, so the platform
  // admins are told in the app, once a day for each kind: when the requests
  // could not be read (the fourth Phase 5 review: no ID is deleted at all),
  // and when files could not be deleted (the fifth: an ID past 24 hours, or a
  // file of a deleted request; the sixth keeps the two apart, so one never
  // hides the other).
  // "Told today" is the server's own record (claim_daily_alert,
  // 20261025400000), never a card in a bell: anyone may write a card to
  // themself, and an applicant to HireFlow's own job may write one to its
  // owner, so a card with the same title switched these alerts off (the
  // seventh and eighth Phase 5 reviews).
  const { data: admins } = await admin.from("platform_admins").select("user_id");
  const adminIds = (admins ?? []).map((a: { user_id: string }) => a.user_id);
  const tell = async (key: string, title: string, message: string) => {
    if (adminIds.length === 0) return;
    const { data: first, error: claimError } = await admin.rpc("claim_daily_alert", { p_alert: `cleanup:${key}` });
    if (claimError) {
      console.error(`[document-cleanup] could not record the "${key}" alert:`, claimError.message);
      return;
    }
    if (first !== true) return;
    for (const id of adminIds) {
      await admin.from("notifications").insert({ user_id: id, type: "system", title, message, is_read: false });
    }
  };
  // Each failure is told on its own: a failed read never hides a failed
  // delete, and files left in the retry queue are told too (the seventh
  // review). A list that could not be read is told as well (the eighth: the
  // two retry queues' reads were only logged).
  // Each list's read failure on its own day's alert, so a brief failure of one
  // queue never hides a later "no ID is deleted" (the ninth review: one key
  // for all three did).
  if (error) {
    await tell("read-requests", "ID papers are not being deleted", `document-cleanup could not read the ID-paper requests (${String(error.message ?? error).slice(0, 160)}): no ID is deleted until it can. It tries again every hour.`);
  }
  if (trashError) {
    await tell("read-trash", "Files of deleted requests are not being deleted", `document-cleanup could not read the files of deleted requests (${String(trashError.message).slice(0, 160)}). It tries again every hour.`);
  }
  if (leftoverError) {
    await tell("read-leftovers", "Files queued for removal are not being deleted", `document-cleanup could not read the files queued for removal (from "Delete their information", a withdrawal, Delete Account or a deleted job; storage_file_trash) (${String(leftoverError.message).slice(0, 160)}). It tries again every hour.`);
  }
  const unread = [error, trashError, leftoverError].filter(Boolean);
  if (counts.failed > 0 || orphansFailed > 0) {
    const parts = [
      counts.failed > 0 ? `${counts.failed} ID file${counts.failed === 1 ? "" : "s"} past 24 hours` : "",
      orphansFailed > 0 ? `${orphansFailed} file${orphansFailed === 1 ? "" : "s"} of deleted requests` : "",
    ].filter(Boolean);
    await tell("delete", "ID papers were not deleted on time", `document-cleanup could not delete ${parts.join(" and ")} (see its logs). It tries again on every run.`);
  }
  if (leftoversFailed > 0) {
    await tell("leftovers", "Files queued for removal are not all deleted", `document-cleanup could not delete ${leftoversFailed} file${leftoversFailed === 1 ? "" : "s"} queued for removal (from "Delete their information", a withdrawal, Delete Account or a deleted job; see its logs). It tries again every hour.`);
  }
  const waitedTooLong = oldestWaiting !== null && Date.now() - Date.parse(oldestWaiting) > BACKLOG_HOURS * 3_600_000;
  if (leftoversWaiting !== null && (backedUp || waitedTooLong)) {
    await tell("backlog", "Files queued for removal are backing up", `${leftoversWaiting} file${leftoversWaiting === 1 ? " is" : "s are"} waiting in the removal queue (from "Delete their information", a withdrawal, Delete Account or a deleted job; storage_file_trash)${oldestWaiting ? `, the oldest since ${oldestWaiting.slice(0, 16).replace("T", " ")} UTC` : ""}. document-cleanup deletes up to ${FOLDER_NOTES_PER_RUN.toLocaleString("en-US")} folders and ${PATH_NOTES_PER_RUN.toLocaleString("en-US")} files an hour, a few from each person in turn, so each file of a real removal waits about an hour for every ${FOLDER_NOTES_PER_RUN.toLocaleString("en-US")} people with files ahead of it. To see who fills it, count storage_file_trash's rows by candidate_id: one account is one candidate_id with many rows; many throwaway accounts are many candidate_ids with a few rows each.`);
  }
  if (unread.length > 0) return json({ error: "read_failed", ...counts, orphans, orphansFailed, leftoversRemoved, leftoversFailed, leftoversDropped, leftoversWaiting }, 500);
  return json({ ok: counts.failed === 0 && orphansFailed === 0 && leftoversFailed === 0, ...counts, orphans, orphansFailed, leftoversRemoved, leftoversFailed, leftoversDropped, leftoversWaiting });
});
