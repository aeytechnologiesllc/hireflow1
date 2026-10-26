-- Many throwaway accounts cannot keep a real removal out of document-cleanup's
-- runs (the ninth security review, 2026-10-25, finding 1; a regression of
-- 20261025560000).
--
-- 20261025560000 took the queue in rounds, the people with the fewest notes
-- waiting first, and only then by tries. The review's two proofs:
--   A. A thousand accounts, each with one note that can never be removed:
--      "<uid>/." passed the trigger's path checks (it refused "..", "//", a
--      trailing "/", "%", a backslash and control characters, never a "."
--      part), and storage_holds said it was there because "<uid>/.x" was (an
--      exact path was checked as a prefix). document-cleanup refuses such a
--      path every hour and kept the note, so each person's one note sat at
--      the front of every exact-path run (one waiting, the fewest), ahead of
--      every real withdrawal with two files or more, for good.
--   B. 200 accounts each withdrawing one application an hour with one file in
--      its videos folder: one note each, the fewest waiting, so a real
--      withdrawal's three folders were in no folder run while they kept it up.
-- Now:
-- 1. The trigger refuses a "." part as it refuses "..", the rule
--    isPlainObjectPath holds document-cleanup to, and checks an exact path by
--    its exact name (private.storage_holds(…, p_exact => true)), so it queues
--    only a file that is there under that name.
-- 2. The pick puts a note that has failed after every note never tried: a
--    person whose one note keeps failing never sits at the front of every
--    run (before 20261025560000 the queue was read fewest tries first, "so
--    notes that keep failing never hold up new ones").
-- 3. Each person's oldest note comes first, oldest first across people; then
--    everyone's next notes, as before the people with the fewest waiting
--    first (in turn among people with as many). A real withdrawal's oldest
--    note then waits only for the notes queued before it (B: one of its
--    folders a run, all three in three runs, however many accounts queue
--    after it), and its other notes still come ahead of every account
--    holding more (section 14's seventy accounts: all of it in the next
--    run). The reviewer's "every round by age" passed B but not the seventy;
--    "every round by the fewest waiting" passed the seventy but not B. No
--    note never tried waits for good: each run takes a person's oldest note
--    or 200 (1,000) notes queued before it. Many accounts can still delay
--    one (a flood bigger than a run goes first where it was queued first);
--    signing up costs nothing until Turnstile is set up (an owner input).
--    The caps are unchanged: 6 folders and 40 exact paths from one person,
--    200 folders and 1,000 exact paths a run.
-- document-cleanup drops a note whose path is not plain instead of retrying it
-- every hour (supabase/functions/document-cleanup).
--
-- Each function is its latest repo body with only this change:
--   private.storage_holds                 from 20261025540000_file_queue_only_what_is_there.sql
--                                         (a third argument, p_exact; the two-argument one is dropped,
--                                         and every caller that passes two keeps the prefix check)
--   applications_queue_voice_recordings   from 20261025560000_file_queue_fair_and_bounded.sql
--   storage_file_trash_fair_pick          from 20261025560000_file_queue_fair_and_bounded.sql
-- The triggers that call the queue function are unchanged (they call it by
-- name), and so are the other callers of storage_holds (documents_queue_files,
-- document_requests_trash_file), which pass two arguments.

-- Whether storage holds a file in p_bucket whose name starts with p_prefix
-- (a folder ends with "/"), or with p_exact a file named exactly p_prefix (the
-- ninth security review: an exact path checked as a prefix let "<uid>/." be
-- there because "<uid>/.x" was). NULL when this function cannot look:
-- storage.objects missing or not readable, or its owner kept out by
-- row-level security. Callers decide what NULL means.
drop function if exists private.storage_holds(text, text);

create or replace function private.storage_holds(p_bucket text, p_prefix text, p_exact boolean default false)
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
  if coalesce(p_exact, false) then
    return exists (select 1 from storage.objects o where o.bucket_id = p_bucket and o.name = p_prefix);
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

revoke all on function private.storage_holds(text, text, boolean) from public, anon, authenticated;

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
  -- review, finding 4: a withdrawal or a deleted job left them). Plain is
  -- isPlainObjectPath's rule, which document-cleanup holds every note to: no
  -- "." part either (the ninth security review: "<uid>/." was queued and
  -- refused every hour, for good).
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
         and listed.p !~ '(^|/)\.(/|$)'
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
        -- A file of exactly that name (the ninth security review: as a
        -- prefix, any longer name made it "there").
        continue when not coalesce(private.storage_holds('resumes', v_path, p_exact => true), true);
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

-- One run's notes for document-cleanup: the folders (p_exact false, up to 200,
-- 6 from one person) or the exact paths (p_exact true, up to 1,000, 40 from
-- one person). Every note never tried comes before any that has failed (the
-- ninth security review: a note that failed every hour sat at the front of
-- every run). Then each person's least-tried, oldest note, oldest first
-- across people, so a note waits only for those queued before it, however
-- many accounts queue after it (the ninth security review: by the fewest
-- waiting, 200 accounts with one note each kept a three-folder withdrawal
-- out of every run); then everyone's next notes, the people with the fewest
-- notes waiting first (in turn among people with as many), so an account that
-- queued thousands is served after everyone else. Two calls rather than one, so neither answer
-- passes the API's 1,000-row ceiling. Runs with the caller's rights, and only
-- the server may call it.
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
   order by (r.attempts > 0), r.nth > 1, case when r.nth = 1 then r.queued_at end, r.waiting, r.nth, r.attempts, r.queued_at, r.id
   limit case when coalesce(p_exact, false) then 1000 else 200 end
$$;

revoke all on function public.storage_file_trash_fair_pick(boolean) from public, anon, authenticated;
grant execute on function public.storage_file_trash_fair_pick(boolean) to service_role;
