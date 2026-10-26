-- One account's uploads hold up only its own removals (the eighth security
-- review, 2026-10-25, finding 1).
--
-- 20261025540000 kept the round-11 flood to 20 applications an hour, but a
-- deleted application now queues up to 43 rows (three folders and 40 exact
-- paths), each needing only a file that is there, and the upload rules let an
-- applicant put a file in their own folders at any time. The review's proof:
-- one throwaway account, 20 applications in an hour, 860 rows from 860 tiny
-- uploads, while document-cleanup cleared 200 notes an hour, oldest first and
-- one remove() a path. Every real withdrawal, Delete Account and
-- remove-applicant leftover queued after it waited days. The review's three
-- suggestions, together (1 and 2: a fair pick, bulk removal, a cap a day),
-- and one thing the tests it asked for found (4):
--
-- 1. Each queue row names the person it is for (candidate_id), so
--    document-cleanup can take notes fairly: storage_file_trash_fair_pick
--    gives one run's notes in rounds, one from each person, then a second
--    from each, and so on, the people with the fewest notes waiting first,
--    and never more than 6 folders or 40 exact paths from one person in a
--    run. A run takes up to 200 folders and 1,000 exact paths (one remove()
--    a bucket now clears them; supabase/functions/document-cleanup). One
--    account's backlog then waits behind everyone else's, never in front.
--    Rows queued before this (no candidate_id) count as their application's.
-- 2. A deleted application queues at most 200 exact paths a day for one
--    applicant (the rate-limit table's own counter, 'file-queue-paths', a UTC
--    day). A real applicant never comes near it: a full form lists 24, and
--    Delete Account empties the applicant's own folders itself. Past it the
--    three folders are still queued, so a real withdrawal never queues
--    nothing; the 40 a deleted application is unchanged.
-- 3. The pick is the server's only (service role), with the caller's rights.
-- 4. "10 applications an hour with one business" was 10 with one job: the
--    start limit runs with the applicant's own rights (so only a browser's
--    insert is counted), and an applicant cannot read a job's row before
--    applying to it, so the business it looked up was always NULL and the
--    job's id stood in for it. Ten on each of a business's jobs went through
--    (the review's own S7 weakening changed nothing a test saw; the case its
--    finding 3 asked for, a second job of the same business, found it). It
--    now reads the business from published_jobs_public, which every visitor
--    may read; a job not listed there keeps its own id, as before.
--
-- Each function is its latest repo body with only this change:
--   applications_queue_voice_recordings  from 20261025540000_file_queue_only_what_is_there.sql
--   applications_start_limit             from 20261025540000_file_queue_only_what_is_there.sql
-- New: the candidate_id column and public.storage_file_trash_fair_pick.
-- The triggers that call the functions are unchanged (they call them by name).

alter table public.storage_file_trash add column if not exists candidate_id uuid;
comment on column public.storage_file_trash.candidate_id is
  'The applicant whose files these are, for document-cleanup''s fair pick (storage_file_trash_fair_pick; the eighth security review). NULL on notes queued before 20261025560000 and on remove-applicant''s own, which count as their application''s.';

create or replace function public.applications_queue_voice_recordings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_notes jsonb;
  v_paths text[];
  v_path text;
begin
  -- The three folders kept by the application's id, each only when storage
  -- holds something there (or cannot say): an unsent form leaves nothing to
  -- queue (the eleventh Phase 5 review). Each names its applicant, for
  -- document-cleanup's fair pick (the eighth security review).
  begin
    insert into public.storage_file_trash (bucket, folder, starts_with, application_id, candidate_id)
    select t.bucket, t.folder, t.starts_with, old.id, old.candidate_id
      from (values
        ('voice-interview-recordings', old.id::text, ''),
        ('videos', old.candidate_id::text, old.id::text || '-'),
        ('portfolios', old.candidate_id::text, old.id::text || '-')
      ) as t (bucket, folder, starts_with)
     where t.folder is not null
       and coalesce(private.storage_holds(t.bucket, t.folder || '/' || t.starts_with), true);
  exception
    when others then
      raise log 'applications_queue_voice_recordings: % not queued: %', old.id, sqlerrm;
  end;

  -- The files sent with the form: the exact paths the application lists, in
  -- the applicant's own folder, plain, there in storage, not listed by
  -- another application of theirs or their profile (the eleventh Phase 5
  -- review, finding 4: a withdrawal or a deleted job left them).
  begin
    if old.candidate_id is not null then
      begin
        v_notes := case when old.notes is null or old.notes !~ '^\s*\{' then null else old.notes::jsonb end;
      exception
        when others then
          v_notes := null;
      end;
      select coalesce(array_agg(distinct listed.p), '{}')
        into v_paths
        from (
          select old.resume_url as p
          union all select x #>> '{}' from jsonb_path_query(v_notes, 'lax $.fileUploads.*.url') x where jsonb_typeof(x) = 'string'
          union all select x #>> '{}' from jsonb_path_query(v_notes, 'lax $.fileUploads.*.fileUrl') x where jsonb_typeof(x) = 'string'
          union all select x #>> '{}' from jsonb_path_query(v_notes, 'lax $.fileUploads.*.imageUrls[*]') x where jsonb_typeof(x) = 'string'
          union all select x #>> '{}' from jsonb_path_query(v_notes, 'lax $.resumeImageUrls[*]') x where jsonb_typeof(x) = 'string'
        ) listed
       where listed.p is not null
         and length(listed.p) between 38 and 500
         and left(listed.p, 37) = old.candidate_id::text || '/'
         and listed.p !~ '[%\\\x01-\x1f\x7f]'
         and listed.p not like '%..%'
         and listed.p not like '%//%'
         and right(listed.p, 1) <> '/';
      foreach v_path in array v_paths[1:40] loop
        continue when exists (
          select 1 from public.applications o
           where o.candidate_id = old.candidate_id and o.id <> old.id
             and (o.resume_url = v_path or strpos(coalesce(o.notes, ''), v_path) > 0)
        );
        continue when exists (
          select 1 from public.profiles pr
           where pr.user_id = old.candidate_id
             and (strpos(coalesce(pr.resume_url, ''), v_path) > 0 or strpos(coalesce(pr.portfolio_url, ''), v_path) > 0)
        );
        continue when exists (select 1 from public.storage_file_trash q where q.bucket = 'resumes' and q.path = v_path);
        continue when not coalesce(private.storage_holds('resumes', v_path), true);
        -- At most 200 exact paths a day for one applicant (the eighth security
        -- review: one account's uploads queued 800 an hour); the folders above
        -- are queued whatever this says.
        exit when not coalesce((public.check_rate_limit('file-queue-paths', old.candidate_id::text, 200, 86400) ->> 'allowed')::boolean, true);
        insert into public.storage_file_trash (bucket, path, application_id, candidate_id) values ('resumes', v_path, old.id, old.candidate_id);
      end loop;
    end if;
  exception
    when others then
      raise log 'applications_queue_voice_recordings: form files of % not queued: %', old.id, sqlerrm;
  end;
  return old;
end;
$$;

revoke all on function public.applications_queue_voice_recordings() from public, anon, authenticated;

-- Runs with the writer's own rights (SECURITY INVOKER), like the bell and
-- message limits: only an application started from a browser is counted.
CREATE OR REPLACE FUNCTION public.applications_start_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  business uuid;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  -- The job's business, from the listing every visitor may read: the jobs
  -- row itself is hidden from an applicant until they have applied (the
  -- eighth security review: the limit was per job, not per business). A
  -- listing that cannot be read never stops an application: the job's own
  -- id stands in, as before.
  BEGIN
    SELECT p.employer_id INTO business FROM public.published_jobs_public p WHERE p.id = NEW.job_id;
  EXCEPTION
    WHEN others THEN
      business := NULL;
  END;
  IF NOT public.client_send_allowed('application', coalesce(business, NEW.job_id)) THEN
    RAISE EXCEPTION 'too_many_applications'
      USING ERRCODE = 'check_violation',
            DETAIL = 'You have started a lot of applications in the last hour. Please wait a little and try again.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.applications_start_limit() FROM PUBLIC, anon, authenticated;

-- One run's notes for document-cleanup: the folders (p_exact false, up to 200,
-- 6 from one person) or the exact paths (p_exact true, up to 1,000, 40 from
-- one person). In rounds: each person's least-tried, oldest note first, then
-- each person's second, and so on; in each round the people with the fewest
-- notes waiting come first, so an account that queued thousands is served
-- after everyone else. Two calls rather than one, so neither answer passes
-- the API's 1,000-row ceiling. Runs with the caller's rights, and only the
-- server may call it.
create or replace function public.storage_file_trash_fair_pick(p_exact boolean)
returns setof public.storage_file_trash
language sql
stable
set search_path = public, pg_temp
as $$
  with mine as (
    select t.id, t.attempts, t.queued_at,
           coalesce(t.candidate_id::text, t.application_id::text, t.bucket || ':' || coalesce(t.path, t.folder)) as person
      from public.storage_file_trash t
     where (t.path is not null) = coalesce(p_exact, false)
  ), ranked as (
    select m.id, m.attempts, m.queued_at,
           row_number() over (partition by m.person order by m.attempts, m.queued_at, m.id) as nth,
           count(*) over (partition by m.person) as waiting
      from mine m
  )
  select t.*
    from ranked r
    join public.storage_file_trash t on t.id = r.id
   where r.nth <= case when coalesce(p_exact, false) then 40 else 6 end
   order by r.nth, r.waiting, r.attempts, r.queued_at, r.id
   limit case when coalesce(p_exact, false) then 1000 else 200 end
$$;

revoke all on function public.storage_file_trash_fair_pick(boolean) from public, anon, authenticated;
grant execute on function public.storage_file_trash_fair_pick(boolean) to service_role;
