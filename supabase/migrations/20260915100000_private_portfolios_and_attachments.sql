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
-- Those two bindings only hold if the row doing the binding — an
-- application's candidate_id, a message's sender_id/file_url — can itself be
-- trusted. Neither could be: the live UPDATE policies on `applications`
-- (employer/team) and `messages` (receiver, read-status) carry no
-- `with_check` at all, so anyone who can UPDATE a row they already have some
-- foothold on (their own job's application; a message they received, even
-- one they sent to themselves) could rewrite candidate_id/sender_id/file_url
-- to a victim's and walk straight through the notes/file_url match above.
-- `applications.candidate_id` is now pinned immutable by trigger (nothing
-- legitimate ever changes it after insert); `messages` UPDATE is now
-- restricted at the grant level to the one column the app ever touches,
-- `is_read`.
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

-- The job owner, and any active team member *assigned to that job* (mirrors
-- is_active_team_member_for_job(), which the live "Team members can view
-- applications for assigned jobs" policy on public.applications uses: active
-- status AND (assigned_job_ids is null == unrestricted, OR this job is in
-- it)), once an application actually references the file. There is no
-- dedicated column for it — the path is recorded inside applications.notes (a
-- JSON blob) as a workflow step's `files[].url` / the legacy
-- `portfolioResult.files[].url` — so match it the same way "Employers can
-- view applicant requested documents" and "Employers read applicant resumes"
-- already match document_requests.file_url / applications.resume_url: a
-- substring match against the stored path.
--
-- An earlier version of this policy's team-member join checked only
-- employer_id + status = 'active', with no assigned_job_ids gate — unlike the
-- sibling message-attachments SELECT policy below (which already has it) and
-- unlike is_active_team_member_for_job() itself. That let a team member
-- assigned only to job2 read a portfolio file submitted with job1's
-- application, even though that same team member cannot see application_1
-- through the applications table at all. Assignment to the job is exactly
-- what the rest of the app treats as "a real relationship" for a team
-- member, so the gate is required here too.
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
     and (array_length(tm.assigned_job_ids, 1) is null or j.id = any (tm.assigned_job_ids))
    where (storage.foldername(objects.name))[1] = a.candidate_id::text
      and position(objects.name in a.notes) > 0
      and (j.employer_id = auth.uid() or tm.id is not null)
  )
);

-- ---------------------------------------------------------------------------
-- public.applications: pin candidate_id so it can never change after insert.
-- ---------------------------------------------------------------------------
--
-- The candidate_id binding on "Employers can view candidate portfolio files"
-- above only holds if applications.candidate_id can be trusted — and as
-- written it cannot be. Neither "Employers can update applications to their
-- jobs" (using is_job_owner(job_id, auth.uid())) nor "Team members can
-- update applications if permitted" (using
-- is_active_team_member_for_job(job_id, auth.uid(), true)) carries a
-- with_check clause (confirmed live via Supabase MCP against pg_policies —
-- both show with_check: null), so Postgres reuses each policy's USING
-- clause as its WITH CHECK, which says nothing about candidate_id or notes.
-- That lets any employer UPDATE candidate_id on an application to one of
-- their own jobs to a victim candidate's uid, then paste the victim's real
-- portfolio path into that same row's notes — satisfying the SELECT policy
-- above with data the employer forged, with no legitimate application from
-- that candidate involved anywhere.
--
-- No legitimate write anywhere — not "Candidates can create applications"
-- (the only place candidate_id is ever set), not the employer/team UPDATE
-- paths above, not linkGuestApplications (which links a different column,
-- linked_user_id), not any edge function (trigger-ava-analysis,
-- ava-voice-tools, autopilot-batch — all searched) — ever changes
-- candidate_id after insert. Pinning it unconditionally, for every role,
-- changes no real behavior: an employer can still edit their own
-- application's `notes` (ava-voice-tools legitimately does, logging voice-
-- interview notes as the employer's own authenticated session), but can
-- never make that application claim a candidate it doesn't have, so the
-- storage policy's `(storage.foldername(objects.name))[1] =
-- a.candidate_id::text` check stays bound to the row's real, original
-- candidate no matter what its notes say.
--
-- A plain RLS WITH CHECK cannot see OLD.candidate_id, so this needs a
-- trigger rather than a policy clause.
create or replace function public.applications_pin_candidate_id()
returns trigger
language plpgsql
as $$
begin
  if new.candidate_id is distinct from old.candidate_id then
    raise exception 'applications.candidate_id cannot be changed after the application is created';
  end if;
  return new;
end;
$$;

drop trigger if exists applications_pin_candidate_id on public.applications;
create trigger applications_pin_candidate_id
  before update on public.applications
  for each row
  execute function public.applications_pin_candidate_id();

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

-- ---------------------------------------------------------------------------
-- public.messages: UPDATE is restricted to is_read only.
-- ---------------------------------------------------------------------------
--
-- The SELECT policy above trusts messages.sender_id and messages.file_url to
-- name who uploaded an attachment. Neither is protected: "Receivers can
-- update message read status" only gates on `auth.uid() = receiver_id`
-- (confirmed live via Supabase MCP against pg_policies — with_check: null),
-- so Postgres reuses that USING clause as the WITH CHECK too, which says
-- nothing about sender_id or file_url. "Users can send messages" lets anyone
-- insert a message to themselves (sender_id = receiver_id = their own uid),
-- so any authenticated user can: insert a self-message, then UPDATE that
-- same row's sender_id to a victim's uid and file_url to the victim's real,
-- already-uploaded attachment path while receiver_id stays their own —
-- satisfying every check in the SELECT policy above (folder(name)[1] =
-- m.sender_id, and m.receiver_id = auth.uid()) with data they just forged.
--
-- The app only ever updates one column of messages, anywhere — grepped
-- across src/ and every supabase/functions/*/index.ts: exactly one call
-- site, useMessages.ts's `.update({ is_read: true })`, marking a thread
-- read. Restricting the UPDATE privilege itself to that column is a hard,
-- RLS-independent backstop: even a future policy bug can never again let
-- anyone rewrite sender_id, receiver_id, application_id or file_url through
-- an UPDATE, because the connecting role lacks the grant to touch those
-- columns at all, regardless of what any USING/WITH CHECK clause allows.
revoke update on public.messages from authenticated, anon;
grant update (is_read) on public.messages to authenticated, anon;
