/**
 * The twelfth Phase 5 review (2026-10-26), locked.
 *
 *   - id-papers-leave-on-time: one business and one applicant account cannot
 *     keep other people's ID papers in storage. A deleted request queues only
 *     a file storage holds, naming its business; an applicant links only
 *     their own upload for that request; a business asks at most 50 papers
 *     of one application and 300 an hour; document-cleanup reads the files of
 *     deleted requests and the due ID papers only through their fair picks
 *     (service role only, businesses in turn, 200 a run), and tells the
 *     admins once a day when either backs up (20261025610000).
 *   - delete-account-says-what-stays: Delete Account's confirm says what
 *     stays (the signing record, as proof; a few technical records), and
 *     delete-account empties every bucket it promises and no longer tries to
 *     delete the signing record, which the database refuses.
 *
 * Both are proved by behaviour too: launch_locks_behaviour sections 16 and
 * 17, scripts/document_cleanup.test.mjs, scripts/delete_account.test.mjs and
 * scripts/legal_pages.test.mjs.
 */

import { grantsToBrowser, latestDefinition, migrationTexts, triggerProblems } from "./phase-7-launch-locks.mjs";

const flat = (s) => (s ?? "").replace(/\s+/g, " ");
/** A TypeScript file without its comments. */
const code = (s) => (s ?? "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

export default [
  {
    id: "id-papers-leave-on-time",
    why:
      "One business and one applicant account could keep every deleted request's ID papers in storage for weeks (the " +
      "twelfth Phase 5 review: 5,000 requests in one insert, file_url PATCHed to a made-up path with no upload, one " +
      "withdrawal, and a real ID removed through Delete their information was first read in run 26 of a queue read 200 " +
      "a run with no order). A deleted request queues only a file storage holds; an applicant links only their own " +
      "upload for that request; a business asks at most 50 papers of one application and 300 an hour; document-cleanup " +
      "reads the deleted requests' files and the due ID papers only through their fair picks, businesses in turn, and " +
      "the admins are told when either backs up.",
    run: async ({ read, walk }) => {
      const detail = [];
      const ctx = { read, walk };
      // 1. The queue's trigger: every deleted request, for each row, with its
      // own rights, a note only where storage holds the link's file or
      // something in the request's folder, naming the business, of any kind
      // (the review's S6: only the three ID kinds left a named paper for good).
      detail.push(...(await triggerProblems(ctx, { name: "document_requests_trash_file", table: "document_requests", timing: "AFTER", event: "DELETE", fn: "document_requests_trash_file" })));
      const trash = await latestDefinition(ctx, "document_requests_trash_file");
      const trashBody = flat(trash?.body);
      if (!trash?.securityDefiner) detail.push(`${trash?.alteredIn ?? trash?.rel ?? "supabase/migrations"}: document_requests_trash_file must run with its own rights (a browser's delete cannot write document_file_trash)`);
      if (!trashBody.includes("IF OLD.candidate_id IS NOT NULL AND coalesce( private.storage_holds('requested-documents', OLD.candidate_id::text || '/' || OLD.id::text || '/') OR (OLD.file_url IS NOT NULL AND private.storage_holds('requested-documents', OLD.file_url, p_exact => true)), OLD.file_url IS NOT NULL) THEN INSERT INTO public.document_file_trash (candidate_id, request_id, file_url, employer_id) VALUES (OLD.candidate_id, OLD.id, OLD.file_url, OLD.employer_id); END IF; RETURN NULL;")) {
        detail.push(`${trash?.rel ?? "supabase/migrations"}: document_requests_trash_file must queue a deleted request only where storage holds its link's file or something in its folder (or cannot say), naming its business (employer_id)`);
      }
      if (/document_type|\bfalse\s+and\b|\band\s+false\b/i.test(trashBody)) detail.push(`${trash?.rel}: document_requests_trash_file must queue every kind of paper (a named one is kept only until its application goes), and nothing may switch it off`);
      // 2. The applicant's link: their own upload for that request.
      const guard = await latestDefinition(ctx, "document_requests_guard_update");
      const guardBody = flat(guard?.body);
      if (!guardBody.includes("AND (NEW.file_url !~ ('^' || OLD.candidate_id::text || '/' || OLD.id::text || '/[^/]+$') OR length(NEW.file_url) > 300 OR NEW.file_url LIKE '%..%' OR NEW.file_url ~ '[%\\\\\\x01-\\x1f\\x7f]' OR right(NEW.file_url, 2) = '/.' OR NOT coalesce(private.storage_holds('requested-documents', NEW.file_url, p_exact => true), true)) THEN RAISE EXCEPTION 'request_file_not_yours'")) {
        detail.push(`${guard?.rel ?? "supabase/migrations"}: document_requests_guard_update must let an applicant link only their own upload for that request (<their id>/<request id>/<a plain name>, held by storage under exactly that name)`);
      }
      // 3. How much a business may ask.
      detail.push(...(await triggerProblems(ctx, { name: "document_requests_limit", table: "document_requests", timing: "BEFORE", event: "INSERT", fn: "document_requests_limit" })));
      const limit = await latestDefinition(ctx, "document_requests_limit");
      const limitBody = flat(limit?.body);
      if (!limit?.securityDefiner || !limitBody.includes("SELECT j.employer_id INTO business FROM public.applications a JOIN public.jobs j ON j.id = a.job_id WHERE a.id = NEW.application_id;") || !/IF asked >= 50 THEN RAISE EXCEPTION 'too_many_requests_on_application'/.test(limitBody) || !limitBody.includes("IF NOT coalesce((public.check_rate_limit('document-requests', coalesce(business, NEW.application_id)::text, 300, 3600) ->> 'allowed')::boolean, true) THEN RAISE EXCEPTION 'too_many_document_requests'")) {
        detail.push(`${limit?.rel ?? "supabase/migrations"}: document_requests_limit must refuse a 51st request on one application and a business's 301st in an hour (its business read from the application's job)`);
      }
      if (/\bor\s*\(*\s*true\b|\bif\s+false\b|\bfalse\s+and\b/i.test(limitBody)) detail.push(`${limit?.rel}: document_requests_limit's checks are switched off`);
      // 4. The picks: service role only, with the caller's rights.
      for (const [fn, args] of [["document_file_trash_fair_pick", ""], ["document_requests_due_pick", "text\\[\\], timestamptz, timestamptz"]]) {
        const def = await latestDefinition(ctx, fn);
        if (!def) {
          detail.push(`supabase/migrations: no ${fn} (20261025610000)`);
          continue;
        }
        if (def.securityDefiner) detail.push(`${def.alteredIn ?? def.rel}: ${fn} must run with the caller's rights (only the server may read the queue)`);
        const sql = (await read(def.rel)) ?? "";
        if (!new RegExp(`revoke all on function public\\.${fn}\\(${args}\\) from public, anon, authenticated;`, "i").test(sql) || !new RegExp(`grant execute on function public\\.${fn}\\(${args}\\) to service_role;`, "i").test(sql)) detail.push(`${def.rel}: ${fn} must be the service role's only`);
        for (const rel of await grantsToBrowser(ctx, fn)) detail.push(`${rel}: ${fn} granted to a browser role`);
        const body = flat(def.body);
        if (!/row_number\(\) over \(partition by \w\.person order by/i.test(body) || !/case when \w\.nth = 1 then greatest\(s\.served_at, \w\.due_at\) end, \w\.waiting, \w\.nth/i.test(body) || !/where p\.place <= 200 \)/i.test(body) || !/on conflict \(queue, person\) do update set served_at = excluded\.served_at/i.test(body)) {
          detail.push(`${def.rel}: ${fn} must take each business's first paper in turn (by when it was last taken or became due, whichever is later), then the fewest waiting first, 200 a run, and record whom it took`);
        }
        if (!/coalesce\(\w\.employer_id, \w\.candidate_id\)::text as person/i.test(body)) detail.push(`${def.rel}: ${fn} must take papers by the business that asked (a flood is always one business's; applicant accounts cost nothing)`);
        if (/\bwhere false\b|\blimit 0\b|place <= 0\b/i.test(body)) detail.push(`${def.rel}: ${fn} is narrowed to nothing`);
      }
      const due = flat((await latestDefinition(ctx, "document_requests_due_pick"))?.body);
      if (!due.includes("where r.file_url is not null and r.document_type = any (p_kinds) and (r.team_opened_at <= p_opened_before or (r.team_opened_at is null and r.submitted_at <= p_sent_before) or (r.team_opened_at is null and r.submitted_at is null and r.created_at <= p_sent_before))")) {
        detail.push("supabase/migrations: document_requests_due_pick must take only the papers of the given kinds with a file, opened before the first cutoff, or never opened and sent (or, never marked sent, asked for) before the second");
      }
      const trashPick = flat((await latestDefinition(ctx, "document_file_trash_fair_pick"))?.body);
      if (!trashPick.includes("case when m.attempts > 0 then coalesce(m.last_tried_at, m.queued_at) + least(m.attempts, 24) * interval '1 hour' + interval '30 minutes' else m.queued_at end as due_at") || !/order by r\.due_at > now\(\), r\.nth > 1/i.test(trashPick)) {
        detail.push("supabase/migrations: document_file_trash_fair_pick must put a note that failed behind every note that is due until its back-off (an hour a try, up to a day, and half an hour more) ends");
      }
      // Whom each run took is the server's own record.
      const texts = await migrationTexts(ctx);
      const all = flat(texts.map((t) => t.sql).join("\n"));
      if (!/alter table public\.document_cleanup_served enable row level security;/i.test(all) || !/revoke all on table public\.document_cleanup_served from public, anon, authenticated;/i.test(all)) detail.push("supabase/migrations: public.document_cleanup_served must have row-level security on and nothing for public, anon or authenticated");
      for (const { rel, sql } of texts) {
        const one = flat(sql);
        for (const m of one.matchAll(/\bgrant\s+[^;]*?\bon\s+(?:table\s+)?([^;]*?)\s+to\s+([^;]*);/gi)) {
          if (/(?:^|[\s,"])(?:"?public"?\s*\.\s*)?"?document_cleanup_served"?(?:$|[\s,"])/i.test(m[1]) && /(?:^|[\s,"])(anon|authenticated|public)(?:$|[\s,"])/i.test(m[2])) detail.push(`${rel}: public.document_cleanup_served granted to a browser role`);
        }
        if (/\bdocument_cleanup_served\b[^;]*\b(?:disable|no force) row level security\b|\bcreate policy\b[^;]*\bon\s+(?:"?public"?\s*\.\s*)?"?document_cleanup_served"?\b/i.test(one)) detail.push(`${rel}: public.document_cleanup_served opened to a browser`);
      }
      const prune = await latestDefinition(ctx, "prune_document_cleanup_served");
      if (!prune?.securityDefiner || (await grantsToBrowser(ctx, "prune_document_cleanup_served")).length || !/revoke all on function public\.prune_document_cleanup_served\(\) from public, anon, authenticated;/i.test((await read(prune?.rel ?? "")) ?? "")) detail.push(`${prune?.rel ?? "supabase/migrations"}: prune_document_cleanup_served must be the server's only`);
      const scheduledAt = all.search(/perform cron\.schedule\('prune-document-cleanup-served', '\d{1,2} \d{1,2} \* \* \*', 'select public\.prune_document_cleanup_served\(\)'\);(?![\s\S]*cron\.schedule\('prune-document-cleanup-served')/i);
      const unscheduledAt = Math.max(-1, ...[...all.matchAll(/cron\.unschedule\('prune-document-cleanup-served'\)/gi)].map((m) => m.index));
      if (scheduledAt < 0 || unscheduledAt > scheduledAt) detail.push("supabase/migrations: prune_document_cleanup_served must run daily (pg_cron, prune-document-cleanup-served), and no later migration may unschedule it");
      // 5. document-cleanup reads both only through the picks, with its own
      // kinds and cutoffs, backs off a note that failed, and tells the admins.
      const fn = code(await read("supabase/functions/document-cleanup/index.ts"));
      if (!/admin\.rpc\("document_requests_due_pick", \{\s*p_kinds: DELETED_KINDS,\s*p_opened_before: openedBefore,\s*p_sent_before: sentBefore,\s*\}\)/.test(fn) || !/const DELETED_KINDS = \["government_id", "nbi_clearance", "proof_of_address"\];/.test(fn)) detail.push("document-cleanup: the due ID papers must be read through document_requests_due_pick, with DELETED_KINDS and the 24-hour and 7-day cutoffs");
      if (/from\("document_requests"\)\s*\.select\(/.test(fn)) detail.push("document-cleanup: reads the ID papers straight from document_requests, not through the fair pick");
      if (!/admin\.rpc\("document_file_trash_fair_pick"\)/.test(fn) || /from\("document_file_trash"\)\s*\.select\("[^"]*\b(?:file_url|request_id)\b/.test(fn)) detail.push("document-cleanup: the files of deleted requests must be read only through document_file_trash_fair_pick");
      if (!/\.from\("document_file_trash"\)\.update\(\{ attempts: tries \+ 1, last_tried_at: orphanTriedAt \}\)/.test(fn)) detail.push("document-cleanup: a note of a deleted request that storage refused must have its tries counted (it waits out a back-off)");
      if (!/await tell\("deleted-requests-backlog", "Files of deleted requests are backing up",/.test(fn) || !/await tell\("due-backlog", "ID papers are waiting past their time",/.test(fn)) detail.push("document-cleanup: the admins must be told once a day when the deleted requests' files or the due ID papers back up");
      // 6. The request screen says the limits plainly.
      const hook = (await read("src/cockpit/hooks/useApplicantRequests.ts")) ?? "";
      if (!/throw new Error\(requestLimitMessage\(error\.message\) \?\?/.test(hook)) detail.push("useApplicantRequests.ts: the request screen must say the database's limits in plain words (requestLimitMessage)");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "delete-account-says-what-stays",
    why:
      "Delete Account's confirm said every bit of data is deleted, while the signing record (with its IP address and " +
      "place) stays as proof and delete-account's own purge of it failed and logged an error for everyone who had signed " +
      "(the twelfth Phase 5 review). The confirm says what stays, the function no longer tries, and it still empties " +
      "every bucket the Privacy Policy promises (the review's T3 and T4 passed every test).",
    run: async ({ read }) => {
      const detail = [];
      const settings = (await read("src/pages/Settings.tsx")) ?? "";
      if (/All your data/.test(settings) || !/deleteWords\.kept\.map\(/.test(settings) || !/\{deleteWords\.deleted\}/.test(settings)) detail.push("Settings.tsx: Delete Account's confirm must say what goes and what stays (deleteAccountWords), never \"All your data\"");
      const words = (await read("src/content/deleteAccount.ts")) ?? "";
      if (!/kept as proof of the signature/.test(words)) detail.push("src/content/deleteAccount.ts: the confirm must say the signing record stays, as proof");
      const fn = code(await read("supabase/functions/delete-account/index.ts"));
      const ops = (fn.match(/const deleteOperations = \[([\s\S]*?)\] as const;/) ?? [])[1] ?? "";
      const buckets = (fn.match(/const storageBuckets = \[([\s\S]*?)\] as const;/) ?? [])[1] ?? "";
      if (!ops || /document_audit_logs/.test(ops)) detail.push("delete-account: must not try to delete the signing record (document_audit_logs): the database refuses it, and the policy says it stays");
      for (const bucket of ["avatars", "resumes", "portfolios", "videos", "message-attachments", "documents", "requested-documents"]) {
        if (!buckets.includes(`'${bucket}'`)) detail.push(`delete-account: no longer empties ${bucket} (the Privacy Policy says your files are deleted with the account)`);
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
];
