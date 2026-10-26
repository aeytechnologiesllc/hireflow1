-- One business and one applicant account can no longer keep other people's
-- ID papers in storage for weeks (the twelfth Phase 5 review, 2026-10-26,
-- finding 1, and its PLAUSIBLE item).
--
-- document_file_trash holds the files of deleted document requests (a
-- withdrawal, Delete their information, Delete Account, a deleted job), and
-- that is where a real applicant's government ID waits once its application
-- is gone. document-cleanup read it 200 a run, with no order, and one
-- withdrawal could fill it with thousands of notes without uploading
-- anything. The review's proof: a business asked one throwaway applicant for
-- 5,000 papers in one request, the applicant PATCHed file_url to a made-up
-- path in their own folder on all of them and withdrew; a real ID removed
-- through Delete their information afterwards was first read in run 26 (101
-- after 20,000), and nothing told the admins. Rounds 8 to 10 of the security
-- review made storage_file_trash fair; this queue, the one with the IDs, was
-- not touched. The same shape held for the still-open ID papers that are
-- due (three reads of 200, no order).
-- Now:
-- 1. A deleted request leaves a note only for a file storage holds: its link
--    (a file of exactly that name) or anything in its own folder
--    (private.storage_holds, as file_queue_only_what_is_there does for the
--    main queue). When the database cannot look (NULL), it queues as before
--    when the request had a link: a file is never left because the database
--    could not see it. Each note names the business that asked
--    (employer_id), for the fair pick below.
-- 2. An applicant sets a request's link only to their own upload for that
--    request: <their id>/<request id>/<one plain name>, a file storage holds
--    under exactly that name in requested-documents (DocumentUploadDialog
--    uploads there; nobody but the applicant may write in their folder). It
--    was any plain path in their folder, with no upload.
-- 3. A business makes at most 50 requests on one application and 300 an
--    hour across its team (document_requests_limit, BEFORE INSERT; refused
--    with too_many_requests_on_application / too_many_document_requests,
--    which the request screen says plainly). A real business asks for a
--    handful of papers when it hires; nothing limited it before.
-- 4. document-cleanup reads the queue through document_file_trash_fair_pick
--    and the due ID papers through document_requests_due_pick (service role
--    only, each run records whom it took in document_cleanup_served, as
--    storage_file_trash_fair_pick does): each business's oldest note first,
--    businesses in turn (by when the pick last took them or the note became
--    due, whichever is later), then everyone's next notes, the businesses
--    with the fewest waiting first; 200 a run. A business, not an applicant:
--    every request is filed under the job's owner, so a flood is always one
--    business's (applicant accounts cost nothing; a business confirms its
--    email and puts a job live before anyone can apply), and it holds up
--    only its own papers. No cap per business: a real business
--    deleting a job with many hires still has all of it taken when nobody
--    else is waiting. A note that failed waits out a back-off (an hour a try,
--    up to a day, and half an hour more), so it never holds the front of the
--    run. The admins are told once a day when either backs up
--    (claim_daily_alert; supabase/functions/document-cleanup).
-- 5. A business's record goes a day after its last turn once it holds
--    nothing in that queue (prune_document_cleanup_served, daily by pg_cron).
-- Left, as for the main queue until Turnstile is set up (an owner input):
-- many confirmed businesses can still delay one, about a run for every 200
-- of them with papers ahead of it.
--
-- Each function is its latest repo body with only this change:
--   document_requests_trash_file     from 20261025540000_file_queue_only_what_is_there.sql
--                                    (storage_holds checks; the note names its business)
--   document_requests_guard_update   from 20261025500000_plain_file_paths.sql
--                                    (the applicant's file_url check only)
-- New: document_file_trash's employer_id, attempts and last_tried_at;
-- public.document_requests_limit and its trigger; public.document_cleanup_served;
-- public.document_file_trash_fair_pick(); public.document_requests_due_pick(text[],
-- timestamptz, timestamptz); public.prune_document_cleanup_served() and its schedule.
-- The triggers that call the two redefined functions are unchanged (they call
-- them by name).

alter table public.document_file_trash
  add column if not exists employer_id uuid,
  add column if not exists attempts integer not null default 0,
  add column if not exists last_tried_at timestamptz;

CREATE OR REPLACE FUNCTION public.document_requests_trash_file()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- A request whose photo went up but whose link was never saved still has
  -- its folder emptied (the eleventh Phase 5 review, finding 7). Only a file
  -- storage holds is queued: the link's own file, or anything in the
  -- request's folder (the twelfth Phase 5 review: a link set with no upload
  -- queued a note for nothing, 5,000 from one withdrawal). When storage
  -- cannot be read, a request with a link is queued as before. The note
  -- names the business that asked, for document-cleanup's fair pick.
  IF OLD.candidate_id IS NOT NULL
     AND coalesce(
           private.storage_holds('requested-documents', OLD.candidate_id::text || '/' || OLD.id::text || '/')
           OR (OLD.file_url IS NOT NULL AND private.storage_holds('requested-documents', OLD.file_url, p_exact => true)),
           OLD.file_url IS NOT NULL) THEN
    INSERT INTO public.document_file_trash (candidate_id, request_id, file_url, employer_id)
    VALUES (OLD.candidate_id, OLD.id, OLD.file_url, OLD.employer_id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.document_requests_trash_file() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.document_requests_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  is_applicant boolean := auth.uid() IS NOT NULL AND auth.uid() = OLD.candidate_id;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Who it is between, what was asked, and when: never from a client.
  NEW.application_id := OLD.application_id;
  NEW.employer_id := OLD.employer_id;
  NEW.candidate_id := OLD.candidate_id;
  NEW.document_type := OLD.document_type;
  NEW.package_id := OLD.package_id;
  NEW.created_at := OLD.created_at;
  NEW.file_deleted_at := OLD.file_deleted_at;
  NEW.team_opened_at := OLD.team_opened_at;

  IF is_applicant THEN
    -- The applicant: their answer, nothing else.
    NEW.custom_document_name := OLD.custom_document_name;
    NEW.description := OLD.description;
    NEW.is_required := OLD.is_required;
    NEW.due_date := OLD.due_date;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.rejection_reason := OLD.rejection_reason;
    IF OLD.status = 'approved'
       AND (NEW.file_url IS DISTINCT FROM OLD.file_url OR NEW.answer_text IS DISTINCT FROM OLD.answer_text OR NEW.status IS DISTINCT FROM OLD.status) THEN
      RAISE EXCEPTION 'request_already_approved' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'submitted' THEN
      RAISE EXCEPTION 'request_status_not_yours' USING ERRCODE = 'check_violation';
    END IF;
    -- Their own upload for this request: <their id>/<request id>/<one name>,
    -- every part a plain name (no "%", backslash, control character or "."
    -- part: the sixth security review, requested-document-url signs this path
    -- with the service key, and "%2e%2e" is ".." there), and a file storage
    -- holds under exactly that name (the twelfth Phase 5 review: any path in
    -- their folder, with no upload, let one account fill the deleted
    -- requests' queue with thousands of notes). Storage cannot be read: the
    -- path rule alone, so a real upload is never turned away.
    IF NEW.file_url IS DISTINCT FROM OLD.file_url AND NEW.file_url IS NOT NULL
       AND (NEW.file_url !~ ('^' || OLD.candidate_id::text || '/' || OLD.id::text || '/[^/]+$')
            OR length(NEW.file_url) > 300
            OR NEW.file_url LIKE '%..%'
            OR NEW.file_url ~ '[%\\\x01-\x1f\x7f]'
            OR right(NEW.file_url, 2) = '/.'
            OR NOT coalesce(private.storage_holds('requested-documents', NEW.file_url, p_exact => true), true)) THEN
      RAISE EXCEPTION 'request_file_not_yours' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'submitted'
       AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.file_url IS DISTINCT FROM OLD.file_url OR NEW.answer_text IS DISTINCT FROM OLD.answer_text) THEN
      NEW.submitted_at := now();
    ELSE
      NEW.submitted_at := OLD.submitted_at;
    END IF;
    -- A new file starts its own clock: not yet opened, not deleted.
    IF NEW.file_url IS DISTINCT FROM OLD.file_url AND NEW.file_url IS NOT NULL THEN
      NEW.team_opened_at := NULL;
      NEW.file_deleted_at := NULL;
    END IF;
  ELSE
    -- The hiring side: approve or ask again. What the applicant sent is theirs.
    NEW.file_url := OLD.file_url;
    NEW.file_name := OLD.file_name;
    NEW.answer_text := OLD.answer_text;
    NEW.submitted_at := OLD.submitted_at;
    NEW.candidate_viewed_at := OLD.candidate_viewed_at;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status NOT IN ('approved', 'rejected') OR OLD.status NOT IN ('submitted', 'reviewed') THEN
        RAISE EXCEPTION 'request_not_received' USING ERRCODE = 'check_violation';
      END IF;
      NEW.reviewed_at := now();
      NEW.reviewed_by := auth.uid();
      IF NEW.status = 'approved' THEN
        NEW.rejection_reason := NULL;
      END IF;
    ELSE
      NEW.reviewed_at := OLD.reviewed_at;
      NEW.reviewed_by := OLD.reviewed_by;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- A business asks one application for at most 50 papers, and its team for
-- at most 300 an hour in all (the twelfth Phase 5 review: nothing limited
-- either, and 5,000 went in one request). A real business asks for a handful
-- when it hires. The business is read from the application's job, never
-- from the row (whatever order the insert triggers run in). Past either, the
-- insert is refused and nothing goes in; a refused insert counts nothing.
-- The server's own inserts (none today) are not counted.
CREATE OR REPLACE FUNCTION public.document_requests_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  business uuid;
  asked integer;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  SELECT j.employer_id INTO business
    FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
   WHERE a.id = NEW.application_id;
  -- One application's requests are counted one insert at a time, so two at
  -- once cannot both pass the last free place.
  PERFORM pg_advisory_xact_lock(hashtextextended('document_requests_limit:' || coalesce(NEW.application_id::text, ''), 0));
  SELECT count(*) INTO asked FROM public.document_requests r WHERE r.application_id = NEW.application_id;
  IF asked >= 50 THEN
    RAISE EXCEPTION 'too_many_requests_on_application'
      USING ERRCODE = 'check_violation',
            DETAIL = 'This application already has 50 requests, the most one can have.';
  END IF;
  IF NOT coalesce((public.check_rate_limit('document-requests', coalesce(business, NEW.application_id)::text, 300, 3600) ->> 'allowed')::boolean, true) THEN
    RAISE EXCEPTION 'too_many_document_requests'
      USING ERRCODE = 'check_violation',
            DETAIL = 'Your team has sent 300 requests in the last hour. Please wait a little and try again.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.document_requests_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS document_requests_limit ON public.document_requests;
CREATE TRIGGER document_requests_limit
  BEFORE INSERT ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.document_requests_limit();

-- Whom each run took, and when: a business's turn in the deleted requests'
-- queue ('deleted') and among the due ID papers ('due'). Only the server reads
-- or writes it.
create table if not exists public.document_cleanup_served (
  queue text not null check (queue in ('deleted', 'due')),
  person text not null,
  served_at timestamptz not null default now(),
  primary key (queue, person)
);

comment on table public.document_cleanup_served is
  'When document-cleanup''s picks last took the papers of each business (document_file_trash_fair_pick, document_requests_due_pick; the twelfth Phase 5 review): a business''s next turn comes after everyone who has waited since. Service role only; pruned daily.';

alter table public.document_cleanup_served enable row level security;
revoke all on table public.document_cleanup_served from public, anon, authenticated;
grant select, insert, update, delete on table public.document_cleanup_served to service_role;

-- One run's notes of deleted requests for document-cleanup, at most 200. A
-- note that failed waits behind every note that is due for an hour a try, up
-- to a day, and half an hour more. Then each business's least-tried, oldest
-- note, businesses in turn: by when they were last taken or the note became
-- due, whichever is later; then everyone's next notes, the businesses with
-- the fewest waiting first, so a business that queued thousands is served
-- after everyone else. A note without a business (queued before this) counts
-- as its applicant's. The run records whom it took (document_cleanup_served).
-- Runs with the caller's rights, and only the server may call it.
create or replace function public.document_file_trash_fair_pick()
returns setof public.document_file_trash
language sql
volatile
set search_path = public, pg_temp
as $$
  with mine as (
    select t.id, t.attempts, t.queued_at, t.last_tried_at,
           coalesce(t.employer_id, t.candidate_id)::text as person
      from public.document_file_trash t
  ), ranked as (
    select m.id, m.attempts, m.queued_at, m.person,
           case when m.attempts > 0
                then coalesce(m.last_tried_at, m.queued_at) + least(m.attempts, 24) * interval '1 hour' + interval '30 minutes'
                else m.queued_at end as due_at,
           row_number() over (partition by m.person order by m.attempts, m.queued_at, m.id) as nth,
           count(*) over (partition by m.person) as waiting
      from mine m
  ), placed as (
    select r.id, r.person,
           row_number() over (order by r.due_at > now(), r.nth > 1, case when r.nth = 1 then greatest(s.served_at, r.due_at) end, r.waiting, r.nth, r.attempts, r.queued_at, r.id) as place
      from ranked r
      left join public.document_cleanup_served s on s.queue = 'deleted' and s.person = r.person
  ), picked as materialized (
    select p.id, p.person, p.place
      from placed p
     where p.place <= 200
  ), served as (
    insert into public.document_cleanup_served (queue, person, served_at)
    select distinct 'deleted', p.person, now()
      from picked p
    on conflict (queue, person) do update set served_at = excluded.served_at
  )
  select t.*
    from picked p
    join public.document_file_trash t on t.id = p.id
   order by p.place
$$;

revoke all on function public.document_file_trash_fair_pick() from public, anon, authenticated;
grant execute on function public.document_file_trash_fair_pick() to service_role;

-- One run's due ID papers for document-cleanup, at most 200: a request of one
-- of p_kinds (document-cleanup's DELETED_KINDS) with a file, opened by the
-- hiring side before p_opened_before (24 hours ago), or never opened and sent
-- before p_sent_before (7 days ago), or never opened, never marked sent and
-- asked for before p_sent_before (a file put there without being marked sent).
-- Each business's longest-due paper first, businesses in turn (by when they
-- were last taken or the paper became due, whichever is later); then the
-- rest, the businesses with the fewest due first (the twelfth Phase 5
-- review: three reads of 200 with no order let one business's thousands of
-- papers, due at the same time, keep a real ID past its 24 hours). Nothing
-- without its arguments. The run records whom it took. Runs with the
-- caller's rights, and only the server may call it.
create or replace function public.document_requests_due_pick(p_kinds text[], p_opened_before timestamptz, p_sent_before timestamptz)
returns table (id uuid, candidate_id uuid, file_url text, status text)
language sql
volatile
set search_path = public, pg_temp
as $$
  with due as (
    select r.id, coalesce(r.employer_id, r.candidate_id)::text as person,
           case
             when r.team_opened_at is not null then r.team_opened_at + (now() - p_opened_before)
             when r.submitted_at is not null then r.submitted_at + (now() - p_sent_before)
             else r.created_at + (now() - p_sent_before)
           end as due_at
      from public.document_requests r
     where r.file_url is not null
       and r.document_type = any (p_kinds)
       and (r.team_opened_at <= p_opened_before
            or (r.team_opened_at is null and r.submitted_at <= p_sent_before)
            or (r.team_opened_at is null and r.submitted_at is null and r.created_at <= p_sent_before))
  ), ranked as (
    select d.id, d.person, d.due_at,
           row_number() over (partition by d.person order by d.due_at, d.id) as nth,
           count(*) over (partition by d.person) as waiting
      from due d
  ), placed as (
    select k.id, k.person,
           row_number() over (order by k.nth > 1, case when k.nth = 1 then greatest(s.served_at, k.due_at) end, k.waiting, k.nth, k.due_at, k.id) as place
      from ranked k
      left join public.document_cleanup_served s on s.queue = 'due' and s.person = k.person
  ), picked as materialized (
    select p.id, p.person, p.place
      from placed p
     where p.place <= 200
  ), served as (
    insert into public.document_cleanup_served (queue, person, served_at)
    select distinct 'due', p.person, now()
      from picked p
    on conflict (queue, person) do update set served_at = excluded.served_at
  )
  select r.id, r.candidate_id, r.file_url, r.status::text
    from picked p
    join public.document_requests r on r.id = p.id
   order by p.place
$$;

revoke all on function public.document_requests_due_pick(text[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.document_requests_due_pick(text[], timestamptz, timestamptz) to service_role;

-- A business's turn is kept while it holds a note in that queue (a deleted
-- request's note, or a request with a file), and a day after; then it goes.
-- Run daily by pg_cron; only the server may call it.
create or replace function public.prune_document_cleanup_served()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.document_cleanup_served s
   where s.served_at < now() - interval '1 day'
     and not (s.queue = 'deleted' and exists (
       select 1 from public.document_file_trash t where coalesce(t.employer_id, t.candidate_id)::text = s.person))
     and not (s.queue = 'due' and exists (
       select 1 from public.document_requests r where r.file_url is not null and coalesce(r.employer_id, r.candidate_id)::text = s.person));
$$;

revoke all on function public.prune_document_cleanup_served() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'prune-document-cleanup-served') then
      perform cron.unschedule('prune-document-cleanup-served');
    end if;
    perform cron.schedule('prune-document-cleanup-served', '47 4 * * *', 'select public.prune_document_cleanup_served()');
  end if;
end $$;

-- The API must see the two picks before document-cleanup's next run, or that
-- run's reads fail (and the admins are told). Supabase reloads the API's
-- schema after DDL; this asks for it as well.
notify pgrst, 'reload schema';
