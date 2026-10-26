-- The look for unlinked ID photos costs a run's worth however big storage
-- grows, and is its own call, so it never stops the due ID papers from being
-- deleted; and a business's request is asked for when the database says
-- (the thirteenth security review, 2026-10-26, finding 1 and LOW 2).
--
-- Finding 1 (MEDIUM, a regression of 20261025630000). The due pick
-- (document_requests_due_pick) first ran document_requests_sweep_strays, in
-- the same statement, and the sweep looked for each stale request's files
-- with o.name LIKE <applicant> || '/' || <request> || '/%': a pattern made of
-- the row's own columns, which no index can turn into a range, so each of up
-- to 5,000 requests a run read the whole requested-documents bucket. On a
-- local PostgreSQL 16 with live's settings: 300 such requests took 0.7 s
-- against 10,000 objects, 7 s against 100,000, 14 s against 200,000 and 67 s
-- against 1,000,000; 5,000 requests against 10,000 objects, 10 s. Past the
-- API's 8 seconds the whole due pick was cancelled, and the sweep's mark
-- moves only when it finishes, so every hourly run looked at the same
-- requests and was cancelled again: no ID paper was deleted for anyone. Any
-- signed-in account may upload into its own folder of requested-documents,
-- and a business (a free sign-up) asks 300 papers an hour, so either lever
-- reaches it. Now:
-- 1. The sweep reads each request's own folder as a range of names,
--    <applicant>/<request>/ up to <applicant>/<request>0 in byte order (the
--    index idx_objects_bucket_id_name, (bucket_id, name COLLATE "C"), which
--    storage keeps on storage.objects), and asks whether a file is already
--    queued by the request's id (document_file_trash_by_request, new), so
--    each request costs a few index pages however big the bucket or the
--    queue is. The LIKE stays as the check of each name found.
-- 2. It goes a hundred requests at a time, from where the last run stopped,
--    and stops at 5,000 requests looked at (as before), 1,000 files queued or
--    two seconds spent, the mark set to the last request it finished: a run
--    always moves on, and always ends well inside the API's 8 seconds.
-- 3. It is no longer part of the due pick: document-cleanup calls it on its
--    own (supabase/functions/document-cleanup), after the due papers are
--    deleted and before the files of deleted requests are read, so a slow or
--    failed sweep never stops a due ID from going, and its failure is told
--    to the admins as the sweep's (finding LOW 3: the alert for a due pick
--    that timed out sent them to the due turns, while the sweep was what
--    timed out).
-- 4. Like the queueing triggers (20261025650000), it never swallows a
--    deadlock, a serialization failure or a lock timeout: the sweep fails
--    and its mark stays (nothing was lost when it swallowed one, but the run
--    said "storage could not be read").
--
-- LOW 2. document_requests_guard_insert reset everything a business must not
-- choose on its own request but its id and when it was asked for: a business
-- could insert a request dated seven days back, and the sweep looked at it
-- at once. Only its own empty folder was affected, but a request is asked
-- for when the database says so: from a browser, created_at is now() and the
-- id is the database's own (the app never sends one; the server, with the
-- service role, still may, as its tests do).
--
-- Each function is its latest repo body with only this change:
--   document_requests_sweep_strays   from 20261025630000_id_papers_pick_by_index.sql
--                                    (each request's folder by an index range, a hundred at a
--                                    time, 1,000 files or two seconds a run; transient errors re-raised)
--   document_requests_due_pick       from 20261025630000_id_papers_pick_by_index.sql
--                                    (no sweep before it picks)
--   document_requests_guard_insert   from 20261011130000_id_papers_deleted_after_opening.sql
--                                    (id and created_at the database's)
-- New: the index document_file_trash_by_request. The signatures are unchanged;
-- deploy document-cleanup (which now calls the sweep itself) with this.

-- Whether a file of a request is queued already, by the request: the sweep
-- asks this of each file it finds.
create index if not exists document_file_trash_by_request
  on public.document_file_trash (request_id, file_url);

create or replace function public.document_requests_sweep_strays(p_kinds text[], p_sent_before timestamptz)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_mark public.document_requests_swept%rowtype;
  v_queued integer := 0;
  v_looked integer := 0;
  v_chunk integer;
  v_added integer;
  v_last_created timestamptz;
  v_last_id uuid;
  v_started timestamptz := clock_timestamp();
begin
  if p_kinds is null or p_sent_before is null or to_regclass('storage.objects') is null then
    return 0;
  end if;
  select * into v_mark from public.document_requests_swept where only_row for update;
  if not found then
    return 0;
  end if;
  -- A hundred requests at a time, from the mark, each one's own folder read
  -- as a range of names by storage's (bucket_id, name COLLATE "C") index:
  -- <applicant>/<request>/ up to <applicant>/<request>0, '0' being the byte
  -- after '/' (the thirteenth security review: a LIKE of the row's own
  -- columns read the whole bucket for every request, and past the API's 8
  -- seconds no ID paper was deleted for anyone). Until 5,000 requests are
  -- looked at, 1,000 files queued or two seconds spent; the mark moves to
  -- the last request finished.
  loop
    with looked as materialized (
      select r.id, r.candidate_id, r.employer_id, r.document_type, r.created_at
        from public.document_requests r
       where r.file_url is null
         and r.document_type in ('government_id', 'nbi_clearance', 'proof_of_address')
         and r.created_at <= p_sent_before
         and (r.created_at, r.id) > (v_mark.created_at, v_mark.id)
       order by r.created_at, r.id
       limit 100
    ), queued as (
      insert into public.document_file_trash (candidate_id, request_id, file_url, employer_id)
      select l.candidate_id, l.id, o.name, l.employer_id
        from looked l
       cross join lateral (
         select o.name
           from storage.objects o
          where o.bucket_id = 'requested-documents'
            and (o.name collate "C") >= (l.candidate_id::text || '/' || l.id::text || '/')
            and (o.name collate "C") < (l.candidate_id::text || '/' || l.id::text || '0')
            and o.name like l.candidate_id::text || '/' || l.id::text || '/%'
          order by o.name collate "C"
          limit 100
       ) o
       where l.candidate_id is not null
         and l.document_type = any (p_kinds)
         and not exists (select 1 from public.document_file_trash q where q.request_id = l.id and q.file_url = o.name)
      returning 1
    )
    select (select count(*)::int from looked), (select count(*)::int from queued),
           (select l.created_at from looked l order by l.created_at desc, l.id desc limit 1),
           (select l.id from looked l order by l.created_at desc, l.id desc limit 1)
      into v_chunk, v_added, v_last_created, v_last_id;
    exit when v_chunk = 0;
    v_mark.created_at := v_last_created;
    v_mark.id := v_last_id;
    v_looked := v_looked + v_chunk;
    v_queued := v_queued + v_added;
    exit when v_chunk < 100 or v_looked >= 5000 or v_queued >= 1000 or clock_timestamp() - v_started > interval '2 seconds';
  end loop;
  update public.document_requests_swept w
     set created_at = v_mark.created_at, id = v_mark.id
   where w.only_row;
  return v_queued;
exception
  -- A deadlock, a serialization failure or a lock timeout fails the sweep,
  -- with nothing queued and the mark where it was (the thirteenth security
  -- review: never a quiet "not queued").
  when deadlock_detected or serialization_failure or lock_not_available then
    raise;
  when others then
    -- Storage could not be read (or anything else): nothing is queued and
    -- the mark stays, so these requests are looked at again next run.
    raise log 'document_requests_sweep_strays: %', sqlerrm;
    return null;
end;
$$;

revoke all on function public.document_requests_sweep_strays(text[], timestamptz) from public, anon, authenticated;
grant execute on function public.document_requests_sweep_strays(text[], timestamptz) to service_role;

-- One run's due ID papers for document-cleanup, at most 200: a request of
-- one of p_kinds (document-cleanup's DELETED_KINDS; only the three ID kinds
-- are taken) with a file, opened by the hiring side before p_opened_before
-- (24 hours ago), or never opened and sent before p_sent_before (7 days
-- ago), or never opened, never marked sent and asked for before
-- p_sent_before (a file put there without being marked sent). Each
-- business's longest-due paper first, businesses in turn (by when they were
-- last taken or the paper became due, whichever is later); then the rest,
-- the businesses with the fewest due first, counted up to 201 (the twelfth
-- Phase 5 review: three reads of 200 with no order let one business's
-- thousands of papers, due at the same time, keep a real ID past its 24
-- hours). Only the businesses a run can reach are read (the twelfth security
-- review: ranking every due paper, after reading every request, passes the
-- API's timeout within what a flood of businesses can leave): the first 200
-- whose first paper is due, by the turns' index, and any that rank with the
-- 200th, one paper each; when fewer are due, every one of them, up to 200
-- papers each. It no longer looks for unlinked photos first: that is
-- document_requests_sweep_strays, called on its own (the thirteenth security
-- review: inside this statement, a sweep past the API's timeout stopped every
-- due ID). Nothing without its arguments. The run records whom it took.
-- Runs with the caller's rights, and only the server may call it.
create or replace function public.document_requests_due_pick(p_kinds text[], p_opened_before timestamptz, p_sent_before timestamptz)
returns table (id uuid, candidate_id uuid, file_url text, status text)
language sql
volatile
set search_path = public, pg_temp
as $$
  with first_come as materialized (
    select s.person, s.rank, s.served_at
      from public.document_requests_due_turns s
     where s.rank <= now()
     order by s.rank, s.person
     limit 200
  ), run as materialized (
    select count(*) >= 200 as full,
           (select f.rank from first_come f order by f.rank desc, f.person desc limit 1) as last_rank,
           (select f.person from first_come f order by f.rank desc, f.person desc limit 1) as last_person
      from first_come
  ), people as materialized (
    select f.person, f.served_at from first_come f
    union all
    (select s.person, s.served_at
       from public.document_requests_due_turns s, run
      where run.full and s.rank = run.last_rank and s.person > run.last_person
      order by s.person
      limit 200)
  ), counted as materialized (
    select p.person, p.served_at,
           (select count(*)::int
              from ((select 1 from public.document_requests r
                      where coalesce(r.employer_id, r.candidate_id)::text = p.person
                        and r.file_url is not null and r.team_opened_at is not null
                        and r.document_type in ('government_id', 'nbi_clearance', 'proof_of_address') and r.document_type = any (p_kinds)
                        and r.team_opened_at <= p_opened_before)
                    union all
                    (select 1 from public.document_requests r
                      where coalesce(r.employer_id, r.candidate_id)::text = p.person
                        and r.file_url is not null and r.team_opened_at is null and r.submitted_at is not null
                        and r.document_type in ('government_id', 'nbi_clearance', 'proof_of_address') and r.document_type = any (p_kinds)
                        and r.submitted_at <= p_sent_before)
                    union all
                    (select 1 from public.document_requests r
                      where coalesce(r.employer_id, r.candidate_id)::text = p.person
                        and r.file_url is not null and r.team_opened_at is null and r.submitted_at is null
                        and r.document_type in ('government_id', 'nbi_clearance', 'proof_of_address') and r.document_type = any (p_kinds)
                        and r.created_at <= p_sent_before)
                    limit 201) x) as waiting
      from people p
  ), due as (
    select d.id, d.candidate_id, d.file_url, d.status, d.due_at, p.person, p.served_at, p.waiting
      from counted p
     cross join run
     cross join lateral (
       select x.id, x.candidate_id, x.file_url, x.status, x.due_at
         from ((select r.id, r.candidate_id, r.file_url, r.status, r.team_opened_at + (now() - p_opened_before) as due_at
                  from public.document_requests r
                 where coalesce(r.employer_id, r.candidate_id)::text = p.person
                   and r.file_url is not null and r.team_opened_at is not null
                   and r.document_type in ('government_id', 'nbi_clearance', 'proof_of_address') and r.document_type = any (p_kinds)
                   and r.team_opened_at <= p_opened_before
                 order by r.team_opened_at, r.id
                 limit case when run.full then 1 else 200 end)
               union all
               (select r.id, r.candidate_id, r.file_url, r.status, r.submitted_at + (now() - p_sent_before)
                  from public.document_requests r
                 where coalesce(r.employer_id, r.candidate_id)::text = p.person
                   and r.file_url is not null and r.team_opened_at is null and r.submitted_at is not null
                   and r.document_type in ('government_id', 'nbi_clearance', 'proof_of_address') and r.document_type = any (p_kinds)
                   and r.submitted_at <= p_sent_before
                 order by r.submitted_at, r.id
                 limit case when run.full then 1 else 200 end)
               union all
               (select r.id, r.candidate_id, r.file_url, r.status, r.created_at + (now() - p_sent_before)
                  from public.document_requests r
                 where coalesce(r.employer_id, r.candidate_id)::text = p.person
                   and r.file_url is not null and r.team_opened_at is null and r.submitted_at is null
                   and r.document_type in ('government_id', 'nbi_clearance', 'proof_of_address') and r.document_type = any (p_kinds)
                   and r.created_at <= p_sent_before
                 order by r.created_at, r.id
                 limit case when run.full then 1 else 200 end)) x
        order by x.due_at, x.id
        limit case when run.full then 1 else 200 end
     ) d
  ), ranked as (
    select d.id, d.candidate_id, d.file_url, d.status, d.person, d.served_at, d.due_at, d.waiting,
           row_number() over (partition by d.person order by d.due_at, d.id) as nth
      from due d
  ), placed as (
    select k.id, k.candidate_id, k.file_url, k.status, k.person,
           row_number() over (order by k.nth > 1, case when k.nth = 1 then greatest(k.served_at, k.due_at) end, k.waiting, k.nth, k.due_at, k.id) as place
      from ranked k
  ), picked as materialized (
    select p.id, p.candidate_id, p.file_url, p.status, p.person, p.place
      from placed p
     where p.place <= 200
  ), served as (
    insert into public.document_cleanup_served (queue, person, served_at)
    select distinct 'due', p.person, now()
      from picked p
    on conflict (queue, person) do update set served_at = excluded.served_at
  )
  select p.id, p.candidate_id, p.file_url, p.status::text
    from picked p
   order by p.place
$$;

revoke all on function public.document_requests_due_pick(text[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.document_requests_due_pick(text[], timestamptz, timestamptz) to service_role;

CREATE OR REPLACE FUNCTION public.document_requests_guard_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  applicant uuid;
  owner uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  SELECT a.candidate_id, j.employer_id INTO applicant, owner
    FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
   WHERE a.id = NEW.application_id;
  IF applicant IS NULL OR owner IS NULL THEN
    RAISE EXCEPTION 'request_application_unknown' USING ERRCODE = 'check_violation';
  END IF;
  NEW.candidate_id := applicant;
  -- The insert rules still decide who may ask (the owner, or a team member
  -- allowed to send documents for this job); they are checked on this row.
  NEW.employer_id := owner;
  NEW.status := 'pending';
  NEW.file_url := NULL;
  NEW.file_name := NULL;
  NEW.answer_text := NULL;
  NEW.submitted_at := NULL;
  NEW.reviewed_at := NULL;
  NEW.reviewed_by := NULL;
  NEW.rejection_reason := NULL;
  NEW.candidate_viewed_at := NULL;
  NEW.file_deleted_at := NULL;
  NEW.team_opened_at := NULL;
  -- Its id and when it was asked for are the database's (the thirteenth
  -- security review: a business that dated its request seven days back had
  -- the stray sweep look at it at once, and a 7-day clock counts from here).
  NEW.id := gen_random_uuid();
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
