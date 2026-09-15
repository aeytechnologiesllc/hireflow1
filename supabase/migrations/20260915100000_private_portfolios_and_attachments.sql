-- Candidate files readable by strangers.
--
-- 1. `portfolios` is a *private* bucket (public = false) but still carries the
--    original "Portfolio files are publicly accessible" SELECT policy from when
--    it was created public (bucket_id = 'portfolios', no auth check at all) —
--    private buckets still consult their RLS policies, so this one policy alone
--    made every candidate work sample downloadable by a signed-out anon-key
--    request. Replace it with the same shape the `videos`/`resumes` buckets
--    already use: the uploading candidate, plus the job owner and any active
--    team member of a job the candidate applied to.
--
-- 2. `message-attachments` is public = true with a bucket-wide SELECT/INSERT
--    (no auth check at all beyond "authenticated"), so any signed-in user could
--    read or overwrite any attachment ever sent. It holds zero files today, so
--    this is a clean cutover: make it private and scope every policy to the
--    object path the app actually uses (`<senderId>/<file>`, referenced from
--    `messages.file_url`).
--
-- Both employer-facing grants above (the portfolios notes match, and the
-- message-attachments file_url match) started out proving only "some row this
-- viewer can already see mentions this path" — not "the person who uploaded
-- this path is who the row says it is". `applications.notes` is candidate-
-- writable and `messages` rows are freely insertable by their own sender, so
-- either one could be used to point a grant at a file its author never
-- uploaded. Both are now additionally bound to
-- `(storage.foldername(objects.name))[1]` — the uploader's own auth uid, the
-- one fact upload-time RLS actually enforced — and every substring match
-- against attacker-influenced text uses `position()`/`right()` instead of
-- `like`, so `%`, `_` and `\` in an object name can't widen the match.
--
-- Idempotent: safe to run once against the live DB as it stands today, and
-- safe to re-run.

-- ---------------------------------------------------------------------------
-- portfolios
-- ---------------------------------------------------------------------------

drop policy if exists "Portfolio files are publicly accessible" on storage.objects;

-- The uploading candidate. PortfolioUploadPhase.tsx uploads to
-- `${candidateId}/${applicationId}-${stepId}-${timestamp}-${i}.${ext}`, so the
-- first folder segment is always the candidate's own auth uid — same rule as
-- "Users can view their own videos".
drop policy if exists "Candidates can view their own portfolio files" on storage.objects;
create policy "Candidates can view their own portfolio files"
on storage.objects for select
to public
using (
  bucket_id = 'portfolios'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- The job owner, and any active team member of that job, once an application
-- actually references the file. There is no dedicated column for it — the path
-- is recorded inside applications.notes (a JSON blob) as a workflow step's
-- `files[].url` / the legacy `portfolioResult.files[].url` — so match it the
-- same way "Employers can view applicant requested documents" and "Employers
-- read applicant resumes" already match document_requests.file_url /
-- applications.resume_url: a substring match against the stored path.
--
-- An earlier version of this policy wrapped the path in literal double quotes
-- (`'%"' || objects.name || '"%'`), matching only the bare-path JSON shape
-- PortfolioUploadPhase.tsx writes today (`"url":"<path>"`). Live data has at
-- least one application whose notes still hold the OLD shape — a full public
-- URL (`.../storage/v1/object/public/portfolios/<uid>/<file>`) — where the
-- character before the path is `/`, not `"`, so the quoted match never fires
-- and the job owner/team lose access to that (and any other legacy) file.
-- Dropping the quotes fixes both shapes and matches the sibling resumes
-- policies' already-proven pattern in this same schema.
--
-- Two more things had to be true, not just "notes mentions this path":
--
-- 1. Path-ownership. `applications.notes` is candidate-writable free text (the
--    candidate's own client submits it), so nothing stopped a candidate from
--    pasting a *stranger's* portfolio object path into their own application's
--    notes and handing their own employer a read on someone else's file — the
--    notes match alone proves "this path appears somewhere in this
--    application", never "this application's candidate is who uploaded it".
--    Storage paths are written as `${candidateId}/...` (see the "Candidates
--    can view their own portfolio files" policy above), so the first folder
--    segment is always the uploader's own auth uid — require it to equal
--    *this application's* candidate_id, the same binding "Users can view
--    their own videos" already relies on for the videos bucket.
--
-- 2. No wildcard injection. `like` treats `%`, `_` and `\` in its pattern as
--    metacharacters. `objects.name` is attacker-influenced (any authenticated
--    candidate picks their own object names under the upload policy above),
--    so a name containing those characters could widen a `like` pattern built
--    from it into matching notes it was never meant to match. `position(...)`
--    does a plain substring search — no pattern, nothing to escape.
drop policy if exists "Employers can view candidate portfolio files" on storage.objects;
create policy "Employers can view candidate portfolio files"
on storage.objects for select
to public
using (
  bucket_id = 'portfolios'
  and exists (
    select 1
    from applications a
    join jobs j on j.id = a.job_id
    left join team_members tm
      on tm.employer_id = j.employer_id
     and tm.user_id = auth.uid()
     and tm.status = 'active'
    where (storage.foldername(objects.name))[1] = a.candidate_id::text
      and position(objects.name in a.notes) > 0
      and (j.employer_id = auth.uid() or tm.id is not null)
  )
);

-- ---------------------------------------------------------------------------
-- message-attachments
-- ---------------------------------------------------------------------------

update storage.buckets set public = false where id = 'message-attachments';

drop policy if exists "Users can view message attachments" on storage.objects;
drop policy if exists "Users can upload message attachments" on storage.objects;
drop policy if exists "Users can delete their message attachments" on storage.objects;

-- Read: the sender or receiver of the message this file is attached to, or an
-- active team member who can already read that message thread — mirrored
-- exactly off the two live SELECT policies on public.messages ("Users can
-- view their own messages": sender_id = auth.uid() or receiver_id =
-- auth.uid(); "Team members can view messages for assigned jobs": an active
-- team member of the application's job, gated by assigned_job_ids the same
-- way). A team member who can already read the thread in the cockpit
-- shouldn't hit a wall on the one attachment inside it.
--
-- (useMessages.ts stores the bare object path in messages.file_url; a message
-- sent before this migration stores a full public URL instead, so a legacy
-- row is matched by exact equality on the bare path OR the full URL ending in
-- "/<path>" — a plain suffix comparison, not a `like` pattern, so nothing in
-- objects.name needs escaping.)
--
-- Just matching file_url isn't enough on its own: nothing stops any
-- authenticated user from inserting a *fake* messages row naming a real
-- attachment path that belongs to someone else (the messages INSERT policy
-- only checks sender_id = auth.uid(), not who actually owns the file) and
-- reading it back through that row. Uploads land at `${senderId}/...` (the
-- INSERT policy below enforces that), so require the object's folder to equal
-- *that message's own* sender_id — a fake row naming a victim's path, sent by
-- someone else, is naming a path whose folder isn't their own sender_id and
-- so never matches.
drop policy if exists "Message participants can view attachments" on storage.objects;
create policy "Message participants can view attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'message-attachments'
  and exists (
    select 1
    from messages m
    left join applications a on a.id = m.application_id
    left join jobs j on j.id = a.job_id
    left join team_members tm
      on tm.employer_id = j.employer_id
     and tm.user_id = auth.uid()
     and tm.status = 'active'
     and (array_length(tm.assigned_job_ids, 1) is null or j.id = any (tm.assigned_job_ids))
    where (
        m.file_url = objects.name
        or right(m.file_url, length(objects.name) + 1) = ('/' || objects.name)
      )
      and (storage.foldername(objects.name))[1] = m.sender_id::text
      and (m.sender_id = auth.uid() or m.receiver_id = auth.uid() or tm.id is not null)
  )
);

-- Upload: into your own folder only. The message row that names the receiver
-- doesn't exist until after the upload succeeds, so ownership of the folder is
-- all an INSERT check can verify — same rule as the `videos`/`portfolios`
-- upload policies.
drop policy if exists "Message participants can upload attachments" on storage.objects;
create policy "Message participants can upload attachments"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'message-attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Delete: the uploader only. An earlier version of this policy matched it the
-- same way SELECT does (sender or receiver of a message naming the path) —
-- mirroring "Users can delete their own messages" on the messages table — but
-- that has the same hole the SELECT fix above closes for reads: a receiver
-- (or anyone who can insert a fake messages row and name themselves as
-- receiver) could delete a file a *different* person uploaded, because
-- nothing tied the delete to who actually owns the object. Folder ownership
-- (`${uploaderId}/...`, enforced at upload time by the INSERT policy below)
-- is the one fact about this object storage RLS can check unconditionally, so
-- delete is scoped to it directly — the same shape as "Candidates can delete
-- their portfolio files" and the other owner-only delete policies in this
-- schema — rather than through the messages table at all.
drop policy if exists "Message participants can delete attachments" on storage.objects;
create policy "Message participants can delete attachments"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'message-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);
