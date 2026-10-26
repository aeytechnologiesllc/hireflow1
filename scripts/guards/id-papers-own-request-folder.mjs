/**
 * The thirteenth Phase 5 review (2026-10-26), locked.
 *
 *   - id-papers-clock-and-file-fixed: the lines of the two document_requests
 *     guards that decide when an ID is deleted and which file a request holds
 *     are in their latest definitions (the review's weakenings K1 to K9, one
 *     line each, passed every test). Proved by behaviour in
 *     launch_locks_behaviour section 19, which applies every migration; this
 *     is the quick read.
 *   - id-papers-own-request-folder: the service-key code signs or deletes a
 *     requested paper only in its own request's folder (<applicant>/<request>/),
 *     never anywhere in the applicant's folder; a paper sent again has its
 *     earlier file queued by the database, and document-cleanup deletes only
 *     that file while the request is open; the upload dialog removes a photo
 *     whose link was not saved. Proved by scripts/document_cleanup.test.mjs,
 *     scripts/requested_document_url.test.mjs, scripts/document_requests.test.mjs
 *     and launch_locks_behaviour section 20.
 */

import { latestDefinition } from "./phase-7-launch-locks.mjs";

const flat = (s) => (s ?? "").replace(/\s+/g, " ");
/** A TypeScript file without its comments. */
const code = (s) => (s ?? "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

export default [
  {
    id: "id-papers-clock-and-file-fixed",
    why:
      "A business could keep an opened ID for good (team_opened_at set to 2999), move its 7 days, mark a file deleted that " +
      "is still there, repoint its request's file or move it to another applicant, and a request could be inserted already " +
      "opened or carrying another request's photo: nine one-line weakenings of document_requests_guard_update and _insert " +
      "passed every test (the thirteenth Phase 5 review). With two of them another business could open an applicant's ID.",
    run: async ({ read, walk }) => {
      const detail = [];
      const ctx = { read, walk };
      const update = await latestDefinition(ctx, "document_requests_guard_update");
      const body = flat(update?.body);
      const at = (s) => body.indexOf(s);
      const split = at("IF is_applicant THEN");
      // The hiring side: from its ELSE to its status check (a body is read without its comments).
      const hiringEnd = at("IF NEW.status NOT IN ('approved', 'rejected')");
      const hiring = hiringEnd < 0 ? -1 : body.lastIndexOf(" ELSE ", hiringEnd);
      if (!update?.securityDefiner) detail.push(`${update?.rel ?? "supabase/migrations"}: document_requests_guard_update must run with its own rights`);
      // Before the two sides split: who and what, and when, for every client.
      for (const line of ["NEW.application_id := OLD.application_id;", "NEW.employer_id := OLD.employer_id;", "NEW.candidate_id := OLD.candidate_id;", "NEW.document_type := OLD.document_type;", "NEW.created_at := OLD.created_at;", "NEW.file_deleted_at := OLD.file_deleted_at;", "NEW.team_opened_at := OLD.team_opened_at;"]) {
        const i = at(line);
        if (i < 0 || split < 0 || i > split) detail.push(`${update?.rel ?? "supabase/migrations"}: document_requests_guard_update must set ${line.split(" :=")[0]} back for every client, before the two sides split`);
      }
      // A new file starts its own clock.
      if (!body.includes("IF NEW.file_url IS DISTINCT FROM OLD.file_url AND NEW.file_url IS NOT NULL THEN NEW.team_opened_at := NULL; NEW.file_deleted_at := NULL; END IF;"))
        detail.push(`${update?.rel ?? "supabase/migrations"}: document_requests_guard_update must start a new file's clock (team_opened_at and file_deleted_at cleared)`);
      // The hiring side never touches what the applicant sent, or when.
      for (const line of ["NEW.file_url := OLD.file_url;", "NEW.file_name := OLD.file_name;", "NEW.answer_text := OLD.answer_text;", "NEW.submitted_at := OLD.submitted_at;"]) {
        const i = body.indexOf(line, hiring);
        if (hiring < 0 || i < 0 || i > hiringEnd) detail.push(`${update?.rel ?? "supabase/migrations"}: document_requests_guard_update must keep ${line.split(" :=")[0]} on the hiring side`);
      }
      const insert = await latestDefinition(ctx, "document_requests_guard_insert");
      const ins = flat(insert?.body);
      if (!insert?.securityDefiner) detail.push(`${insert?.rel ?? "supabase/migrations"}: document_requests_guard_insert must run with its own rights`);
      for (const line of ["NEW.candidate_id := applicant;", "NEW.employer_id := owner;", "NEW.status := 'pending';", "NEW.file_url := NULL;", "NEW.file_name := NULL;", "NEW.submitted_at := NULL;", "NEW.file_deleted_at := NULL;", "NEW.team_opened_at := NULL;"]) {
        if (!ins.includes(line)) detail.push(`${insert?.rel ?? "supabase/migrations"}: document_requests_guard_insert must set ${line.replace(/;$/, "")} on every new request`);
      }
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "id-papers-own-request-folder",
    why:
      "requested-document-url and document-cleanup took any file in the applicant's folder, which holds every business's " +
      "papers for them, so a request pointing at another request's file would have signed or deleted it; and an ID sent " +
      "again whose browser delete failed stayed until the new copy's own deadline (the thirteenth Phase 5 review).",
    run: async ({ read, walk }) => {
      const detail = [];
      const ctx = { read, walk };
      // The database queues the earlier file of a paper sent again or taken back.
      const update = await latestDefinition(ctx, "document_requests_guard_update");
      const body = flat(update?.body);
      const hiring = body.lastIndexOf(" ELSE ", body.indexOf("IF NEW.status NOT IN ('approved', 'rejected')"));
      const queued = body.indexOf("IF OLD.file_url IS NOT NULL AND NEW.file_url IS DISTINCT FROM OLD.file_url AND coalesce(private.storage_holds('requested-documents', OLD.file_url, p_exact => true), true) THEN IF coalesce((public.check_rate_limit('document-file-replaced', OLD.candidate_id::text, 50, 86400) ->> 'allowed')::boolean, true) THEN INSERT INTO public.document_file_trash (candidate_id, request_id, file_url, employer_id) VALUES (OLD.candidate_id, OLD.id, OLD.file_url, OLD.employer_id); END IF; END IF;");
      if (queued < 0 || hiring < 0 || queued > hiring) detail.push(`${update?.rel ?? "supabase/migrations"}: document_requests_guard_update must queue the earlier file of a paper the applicant sends again or takes back (where storage holds it, at most 50 a day for one applicant, naming the business)`);
      // document-cleanup: the request's own folder, both for a due paper and a queued one; an open request's note takes only its file.
      const fn = code(await read("supabase/functions/document-cleanup/index.ts"));
      if (!/const folder = `\$\{request\.candidate_id\}\/\$\{request\.id\}`;\s*if \(!path\.startsWith\(`\$\{folder\}\/`\) \|\| path\.includes\("\.\."\)\) \{\s*counts\.failed \+= 1;\s*continue;\s*\}/.test(fn))
        detail.push("document-cleanup: a due paper's file must be in that request's own folder (<applicant>/<request>/) before it is deleted");
      if (!/const own = file\.startsWith\(`\$\{folder\}\/`\) && !file\.includes\("\.\."\) \? \[file\] : \[\];/.test(fn) || /startsWith\(`\$\{(?:request|note)\.candidate_id\}\/`\)/.test(fn))
        detail.push("document-cleanup: a queued note's file must be in that request's own folder (<applicant>/<request>/) before it is deleted");
      if (!/if \(linkedNow\.has\(note\.request_id\)\) \{\s*paths = own\.filter\(\(p\) => p !== linkedNow\.get\(note\.request_id\)\);\s*\} else \{/.test(fn) || !/for \(const note of openError \? \[\] : trash\) \{/.test(fn))
        detail.push("document-cleanup: a note whose request is still open must take only its own file, never the folder or the file the request links now, and none may be touched when it cannot tell");
      // The upload dialog: the earlier file only in this request's folder, and a photo whose link was not saved removed.
      const dialog = code(await read("src/components/documents/DocumentUploadDialog.tsx"));
      if (!/previous\.startsWith\(`\$\{user\.id\}\/\$\{request\.id\}\/`\)/.test(dialog)) detail.push("DocumentUploadDialog.tsx: the earlier file it deletes must be in this request's own folder");
      if (!/if \(uploaded && !linked\) void removeUnlinkedUpload\(uploaded, request\.id\);/.test(dialog) || !/if \(readError \|\| data\?\.file_url === path\) return;\s*await supabase\.storage\.from\("requested-documents"\)\.remove\(\[path\]\);/.test(dialog))
        detail.push("DocumentUploadDialog.tsx: a photo that went up but whose link was not saved must be removed again (unless the request links it after all)");
      return { ok: detail.length === 0, detail };
    },
  },
];
