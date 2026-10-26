-- The file-removal queue holds only files that are there, and one account
-- cannot start applications without end (the eleventh Phase 5 review,
-- 2026-10-25, findings 1, 4 and 7).
--
-- 1. 20261025490000 queued three rows (recordings, video introduction, work
--    samples) for EVERY deleted application, a form never sent included, and
--    nothing limited how often one is started: one throwaway applicant
--    account looping "start an application, withdraw it" added three rows
--    every two requests (906 rows in 2.6 seconds in the review's proof), while
--    document-cleanup clears 200 an hour, oldest first. A real withdrawal's
--    files, Delete Account's recordings and remove-applicant's leftovers then
--    waited behind weeks of empty rows. A deleted application now queues a
--    folder only when storage holds a file there. The upload rules do not
--    tie an upload to a step (an applicant may upload to their own folder at
--    any time), so "only once the form was sent" would not have been enough;
--    storage itself is what says what can exist. When the database cannot
--    look (private.storage_holds answers NULL), it queues as before: a file
--    is never left because the database could not see it.
-- 2. The files sent with the form (the resume and the form's file answers,
--    resumes/<applicant>/<time>…, and their page images) stayed after a
--    withdrawal or a deleted job (finding 4): the names carry no application
--    id, and only remove-applicant and Delete Account removed them. A deleted
--    application now queues the exact paths it lists (its resume_url and the
--    paths in its notes: fileUploads' url, fileUrl and imageUrls, and
--    resumeImageUrls), each only inside the applicant's own folder, a plain
--    path, there in storage, not already queued, and never a file that
--    another application of theirs or their profile still lists (the same
--    rule as remove-applicant). At most 40 a deleted application (a resume and five
--    file questions, each with three page images, is 24).
-- 3. A browser may start at most 10 applications an hour with one business
--    and 20 an hour in all (client_send_allowed's new 'application' kind,
--    counted like messages and bell cards; past it the insert is refused,
--    too_many_applications, and the job page says to wait a little). A real
--    applicant never comes near it; the server's own inserts are not counted.
-- 4. A deleted document request whose link was never saved (the photo went
--    up, then the connection dropped or the tab closed) still sends its
--    folder to document-cleanup when storage holds a file there (finding 7,
--    for a deleted request; a request still open with such a photo is left
--    for later).
-- 5. The queue gets the index its hourly pick reads (fewest tries, oldest
--    first) and one for the exact paths it is asked about.
--
-- Each function is its latest repo body with only this change:
--   applications_queue_voice_recordings  from 20261025490000_application_files_go_with_it.sql
--   document_requests_trash_file         from 20261011195000_document_file_trash.sql
--   client_send_allowed                  from 20261025360000_interview_write_limits.sql
-- New: private.storage_holds, public.applications_start_limit and its trigger.
-- The triggers that call the first two are unchanged (they call them by name).

-- Whether storage holds a file in p_bucket whose name starts with p_prefix
-- (a folder ends with "/"; an exact path is its own prefix). NULL when this
-- function cannot look: storage.objects missing or not readable, or its
-- owner kept out by row-level security. Callers decide what NULL means.
create or replace function private.storage_holds(p_bucket text, p_prefix text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_bucket is null or coalesce(p_prefix, '') = '' then
    return null;
  end if;
  if to_regclass('storage.objects') is null then
    return null;
  end if;
  if not has_table_privilege('storage.objects', 'select')
     or not exists (select 1 from pg_roles r where r.rolname = current_user and (r.rolsuper or r.rolbypassrls)) then
    return null;
  end if;
  return exists (
    select 1 from storage.objects o
     where o.bucket_id = p_bucket
       and o.name like replace(replace(replace(p_prefix, '\', '\\'), '%', '\%'), '_', '\_') || '%'
  );
exception
  when others then
    return null;
end;
$$;

revoke all on function private.storage_holds(text, text) from public, anon, authenticated;

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
  -- queue (the eleventh Phase 5 review).
  begin
    insert into public.storage_file_trash (bucket, folder, starts_with, application_id)
    select t.bucket, t.folder, t.starts_with, old.id
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
        insert into public.storage_file_trash (bucket, path, application_id) values ('resumes', v_path, old.id);
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

CREATE OR REPLACE FUNCTION public.document_requests_trash_file()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- A request whose photo went up but whose link was never saved still has
  -- its folder emptied (the eleventh Phase 5 review, finding 7).
  IF OLD.candidate_id IS NOT NULL
     AND (OLD.file_url IS NOT NULL
          OR coalesce(private.storage_holds('requested-documents', OLD.candidate_id::text || '/' || OLD.id::text || '/'), false)) THEN
    INSERT INTO public.document_file_trash (candidate_id, request_id, file_url)
    VALUES (OLD.candidate_id, OLD.id, OLD.file_url);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.document_requests_trash_file() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.client_send_allowed(p_kind text, p_recipient uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  pair_limit int;
  total_limit int;
  pair jsonb;
  total jsonb;
BEGIN
  IF me IS NULL OR p_recipient IS NULL THEN
    RETURN true;
  END IF;
  IF p_kind = 'notification' THEN
    pair_limit := 30; total_limit := 300;
  ELSIF p_kind = 'message' THEN
    pair_limit := 120; total_limit := 600;
  ELSIF p_kind = 'interview' THEN
    pair_limit := 20; total_limit := 200;
  -- Applications started (the eleventh Phase 5 review): 10 an hour with one
  -- business, 20 an hour in all.
  ELSIF p_kind = 'application' THEN
    pair_limit := 10; total_limit := 20;
  ELSE
    RETURN false;
  END IF;
  pair := public.check_rate_limit('client-' || p_kind || '-pair', me::text || '>' || p_recipient::text, pair_limit, 3600);
  total := public.check_rate_limit('client-' || p_kind || '-total', me::text, total_limit, 3600);
  RETURN coalesce((pair ->> 'allowed')::boolean, true) AND coalesce((total ->> 'allowed')::boolean, true);
END;
$$;

REVOKE ALL ON FUNCTION public.client_send_allowed(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_send_allowed(text, uuid) TO authenticated, service_role;

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
  SELECT j.employer_id INTO business FROM public.jobs j WHERE j.id = NEW.job_id;
  IF NOT public.client_send_allowed('application', coalesce(business, NEW.job_id)) THEN
    RAISE EXCEPTION 'too_many_applications'
      USING ERRCODE = 'check_violation',
            DETAIL = 'You have started a lot of applications in the last hour. Please wait a little and try again.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.applications_start_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS applications_start_limit ON public.applications;
CREATE TRIGGER applications_start_limit
  BEFORE INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.applications_start_limit();

create index if not exists storage_file_trash_pick on public.storage_file_trash (attempts, queued_at);
create index if not exists storage_file_trash_path on public.storage_file_trash (bucket, path) where path is not null;
