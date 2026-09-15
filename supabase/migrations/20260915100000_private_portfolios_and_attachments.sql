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
-- same way "Employers can view applicant requested documents" already matches
-- document_requests.file_url: a LIKE match on the stored path, quoted so a
-- shorter path can never accidentally match as a substring of a longer one.
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
    where a.notes like ('%"' || objects.name || '"%')
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

-- Read: only the sender or receiver of the message this file is attached to
-- (useMessages.ts stores the bare object path in messages.file_url).
create policy "Message participants can view attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'message-attachments'
  and exists (
    select 1 from messages m
    where m.file_url = objects.name
      and (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
  )
);

-- Upload: into your own folder only. The message row that names the receiver
-- doesn't exist until after the upload succeeds, so ownership of the folder is
-- all an INSERT check can verify — same rule as the `videos`/`portfolios`
-- upload policies.
create policy "Message participants can upload attachments"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'message-attachments'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Delete: the sender or receiver of the message this file is attached to
-- (mirrors "Users can delete their own messages" on the messages table). The
-- previous policy allowed any authenticated user to delete any attachment —
-- tightened here alongside the read/upload policies rather than left as the
-- one door still standing open on this bucket.
create policy "Message participants can delete attachments"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'message-attachments'
  and exists (
    select 1 from messages m
    where m.file_url = objects.name
      and (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
  )
);
