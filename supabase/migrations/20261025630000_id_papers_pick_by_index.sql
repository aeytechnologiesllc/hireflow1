-- document-cleanup's two picks of ID papers read a run's worth, however many
-- papers wait (the twelfth security review, 2026-10-26, finding 1, its check
-- of the twelfth Phase 5 round's picks).
--
-- document_file_trash_fair_pick (the files of deleted requests) and
-- document_requests_due_pick (the ID papers still open that are due) rank
-- every row on every call, as storage_file_trash_fair_pick did: each
-- business's rows numbered and counted, then every row placed (two sorts of
-- every row; the due pick also reads every request ever made to find the
-- ones that are due). The review measured that shape past the API's
-- 8-second timeout at about 750,000 to 1,000,000 rows on a local PostgreSQL
-- with live's settings, and a row leaves either only once a run has picked it.
-- How many a flood can leave: a business asks at most 300 papers an hour
-- (document_requests_limit) and each note needs a file storage holds, so one
-- business can leave 7,200 notes (or due papers) a day while a run takes 200
-- an hour, 4,800 a day, for everyone together. One business at its limit
-- already grows either queue by 2,400 a day for as long as it keeps going
-- (a year: about 880,000); a hundred businesses, each a free sign-up that
-- confirmed an email and put a job live, reach 700,000 in a day. Sign-up has
-- no Turnstile yet, so both can reach the timeout, and then no ID paper of a
-- deleted request (or none that is due) is deleted for anyone again.
-- Now each business's turn is kept in a table the queue's own triggers keep,
-- as 20261025620000 does for the main queue:
-- 1. public.document_file_trash_turns: for each business (or applicant, for a
--    note queued before 20261025610000), how many notes it holds, how many of
--    them failed, its first note (fewest tries, oldest) and when that is due,
--    and when a run last took it (document_cleanup_served, 'deleted'), so its
--    turn's rank is in an index. A run reads the first 200 businesses whose
--    turn has come, one note each; when fewer have a turn that has come it
--    reads every business, and of each its notes up to the 200th never tried
--    (all of them, when it holds fewer). The same notes in the same order as
--    ranking every note.
-- 2. public.document_requests_due_turns: for each business, how many ID
--    papers (the three kinds DELETED_KINDS names) it holds with a file, when
--    the first of them is due (24 hours after the hiring side opened it, or
--    168 after it was sent or, never marked sent, asked for: document-
--    cleanup's own cutoffs), and when a run last took it ('due'). A run reads
--    the first 200 businesses whose first paper is due, by that index, and
--    any that rank with the 200th, and each one's due papers from three
--    indexes (opened, sent, asked), the earliest first. Two changes, both
--    where no real business is: the fewest due first is counted up to 201
--    (two businesses each holding more than 200 due papers are as many, and
--    the earlier first paper goes first), and only the three ID kinds are
--    taken (p_kinds narrows them; document-cleanup passes those three).
-- Every statement that changes notes, papers or the record locks the turns
-- it touches, in one order, before it reads them again.
-- 3. (Asked of this round by the thirteenth Phase 5 review, finding 2.) An ID
--    photo an open request never linked (its link save and the upload
--    dialog's removal both failed) is found seven days after the request was
--    asked for: each run, before it picks, the due pick looks at up to 5,000
--    ID requests with no link that are that old, from where the last run
--    stopped (document_requests_sweep_strays, document_requests_swept), and
--    queues each file in such a request's own folder in document_file_trash,
--    as 20261025640000 queues a file sent again, so document-cleanup deletes
--    that file alone in the business's turn. Each request is looked at once.
--
-- Each function is its latest repo body with only this change:
--   document_file_trash_fair_pick   from 20261025610000_id_papers_leave_on_time.sql
--   document_requests_due_pick      from 20261025610000_id_papers_leave_on_time.sql
--                                   (each reads the turns, then only the rows they
--                                   name, by index, and ranks them as before)
-- New: public.document_file_trash_turns and public.document_requests_due_turns,
-- filled here from the tables as they stand; public.document_requests_swept
-- and public.document_requests_sweep_strays(text[], timestamptz), with the
-- index document_requests_unlinked; their trigger functions
-- public.document_file_trash_turns_sync(), public.document_requests_due_turns_sync()
-- and public.document_cleanup_served_sync(), with their triggers; the indexes
-- document_file_trash_by_business and document_requests_due_opened,
-- document_requests_due_sent and document_requests_due_asked.
-- The signatures and the columns both picks answer with are unchanged, and
-- document-cleanup calls them as before; prune_document_cleanup_served is
-- unchanged.

-- Nothing goes in, changes or goes while the turns are made and filled.
lock table public.document_file_trash, public.document_requests, public.document_cleanup_served in share row exclusive mode;

-- ---------------------------------------------------------------------------
-- The files of deleted requests.

-- Each business's notes, fewest tries and oldest first, as the pick numbers them.
create index if not exists document_file_trash_by_business
  on public.document_file_trash ((coalesce(employer_id, candidate_id)::text), attempts, queued_at, id);

create table if not exists public.document_file_trash_turns (
  person text primary key,
  waiting integer not null default 0,
  failed integer not null default 0,
  first_id uuid,
  first_attempts integer,
  first_queued_at timestamptz,
  first_due timestamptz,
  served_at timestamptz,
  rank timestamptz generated always as (greatest(served_at, first_due)) stored
);

comment on table public.document_file_trash_turns is
  'Each business''s turn in the deleted requests'' queue (document_file_trash): notes waiting, how many failed, its first note and when that is due, when a run last took it (document_cleanup_served, ''deleted''), and the turn''s rank. Kept by the queue''s own triggers so document_file_trash_fair_pick reads a run''s worth by index (the twelfth security review). Service role reads only.';

create index if not exists document_file_trash_turns_rank
  on public.document_file_trash_turns (rank, waiting, first_attempts, first_queued_at, first_id);

alter table public.document_file_trash_turns enable row level security;
revoke all on table public.document_file_trash_turns from public, anon, authenticated, service_role;
grant select on table public.document_file_trash_turns to service_role;

-- Keeps each touched business's turn: its notes counted in and out (and
-- those that failed), its first note and its last run read again, after the
-- turns it touches are made if new and locked in one order. A turn whose
-- business holds nothing goes; a count that says nothing is left while a
-- note is there is counted again.
create or replace function public.document_file_trash_turns_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set plan_cache_mode = force_custom_plan
as $$
declare
  v_person text[];
  v_delta integer[];
  v_failed integer[];
  v_held integer;
begin
  if tg_op = 'TRUNCATE' then
    delete from public.document_file_trash_turns;
    return null;
  end if;
  if tg_op = 'INSERT' then
    select array_agg(c.person order by c.person), array_agg(c.d order by c.person), array_agg(c.f order by c.person)
      into v_person, v_delta, v_failed
      from (select coalesce(n.employer_id, n.candidate_id)::text as person, count(*)::int as d, (count(*) filter (where n.attempts > 0))::int as f
              from new_notes n group by 1) c;
  elsif tg_op = 'DELETE' then
    select array_agg(c.person order by c.person), array_agg(c.d order by c.person), array_agg(c.f order by c.person)
      into v_person, v_delta, v_failed
      from (select coalesce(o.employer_id, o.candidate_id)::text as person, -count(*)::int as d, -(count(*) filter (where o.attempts > 0))::int as f
              from old_notes o group by 1) c;
  else
    select array_agg(c.person order by c.person), array_agg(c.d order by c.person), array_agg(c.f order by c.person)
      into v_person, v_delta, v_failed
      from (select x.person, sum(x.d)::int as d, sum(x.f)::int as f
              from (select coalesce(n.employer_id, n.candidate_id)::text as person, 1 as d, case when n.attempts > 0 then 1 else 0 end as f from new_notes n
                    union all
                    select coalesce(o.employer_id, o.candidate_id)::text, -1, case when o.attempts > 0 then -1 else 0 end from old_notes o) x
             group by 1) c;
  end if;
  if v_person is null then
    return null;
  end if;

  loop
    insert into public.document_file_trash_turns (person)
    select k.person from unnest(v_person) as k (person) order by k.person
    on conflict (person) do nothing;
    select count(*) into v_held
      from (select 1
              from public.document_file_trash_turns s
              join unnest(v_person) as k (person) on s.person = k.person
             order by s.person
               for update of s) held;
    exit when v_held = cardinality(v_person);
  end loop;

  update public.document_file_trash_turns s
     set waiting = s.waiting + k.d,
         failed = s.failed + k.f,
         first_id = f.id,
         first_attempts = f.attempts,
         first_queued_at = f.queued_at,
         first_due = f.due_at,
         served_at = v.served_at
    from unnest(v_person, v_delta, v_failed) as k (person, d, f)
    left join lateral (
      select t.id, t.attempts, t.queued_at,
             case when t.attempts > 0
                  then coalesce(t.last_tried_at, t.queued_at) + least(t.attempts, 24) * interval '1 hour' + interval '30 minutes'
                  else t.queued_at end as due_at
        from public.document_file_trash t
       where coalesce(t.employer_id, t.candidate_id)::text = k.person
       order by t.attempts, t.queued_at, t.id
       limit 1
    ) f on true
    left join public.document_cleanup_served v on v.queue = 'deleted' and v.person = k.person
   where s.person = k.person;
  delete from public.document_file_trash_turns s
   using unnest(v_person) as k (person)
   where s.person = k.person and s.first_due is null;
  update public.document_file_trash_turns s
     set waiting = c.waiting, failed = c.failed
    from unnest(v_person) as k (person)
    cross join lateral (
      select count(*)::int as waiting, (count(*) filter (where t.attempts > 0))::int as failed
        from public.document_file_trash t
       where coalesce(t.employer_id, t.candidate_id)::text = k.person
    ) c
   where s.person = k.person and (s.waiting <= 0 or s.failed < 0);
  return null;
end;
$$;

revoke all on function public.document_file_trash_turns_sync() from public, anon, authenticated;

drop trigger if exists document_file_trash_turns_insert on public.document_file_trash;
create trigger document_file_trash_turns_insert
  after insert on public.document_file_trash
  referencing new table as new_notes
  for each statement execute function public.document_file_trash_turns_sync();
drop trigger if exists document_file_trash_turns_update on public.document_file_trash;
create trigger document_file_trash_turns_update
  after update on public.document_file_trash
  referencing old table as old_notes new table as new_notes
  for each statement execute function public.document_file_trash_turns_sync();
drop trigger if exists document_file_trash_turns_delete on public.document_file_trash;
create trigger document_file_trash_turns_delete
  after delete on public.document_file_trash
  referencing old table as old_notes
  for each statement execute function public.document_file_trash_turns_sync();
drop trigger if exists document_file_trash_turns_truncate on public.document_file_trash;
create trigger document_file_trash_turns_truncate
  after truncate on public.document_file_trash
  for each statement execute function public.document_file_trash_turns_sync();

-- ---------------------------------------------------------------------------
-- The ID papers still open that are due.

-- Each business's ID papers with a file, by the time their clock counts from:
-- opened by the hiring side; else sent; else, never marked sent, asked for.
create index if not exists document_requests_due_opened
  on public.document_requests ((coalesce(employer_id, candidate_id)::text), team_opened_at, id)
  where file_url is not null and team_opened_at is not null
    and document_type in ('government_id', 'nbi_clearance', 'proof_of_address');
create index if not exists document_requests_due_sent
  on public.document_requests ((coalesce(employer_id, candidate_id)::text), submitted_at, id)
  where file_url is not null and team_opened_at is null and submitted_at is not null
    and document_type in ('government_id', 'nbi_clearance', 'proof_of_address');
create index if not exists document_requests_due_asked
  on public.document_requests ((coalesce(employer_id, candidate_id)::text), created_at, id)
  where file_url is not null and team_opened_at is null and submitted_at is null
    and document_type in ('government_id', 'nbi_clearance', 'proof_of_address');

create table if not exists public.document_requests_due_turns (
  person text primary key,
  on_file integer not null default 0,
  first_due timestamptz,
  served_at timestamptz,
  rank timestamptz generated always as (greatest(served_at, first_due)) stored
);

comment on table public.document_requests_due_turns is
  'Each business''s turn among the ID papers document-cleanup deletes on time: how many it holds with a file (the three ID kinds), when the first of them is due (24 hours after the hiring side opened it, or 168 after it was sent or asked for), when a run last took it (document_cleanup_served, ''due''), and the turn''s rank. Kept by document_requests'' own triggers so document_requests_due_pick reads a run''s worth by index (the twelfth security review). Service role reads only.';

create index if not exists document_requests_due_turns_rank on public.document_requests_due_turns (rank, person);

alter table public.document_requests_due_turns enable row level security;
revoke all on table public.document_requests_due_turns from public, anon, authenticated, service_role;
grant select on table public.document_requests_due_turns to service_role;

-- Keeps each touched business's turn: its ID papers with a file counted in
-- and out, when the first is due and its last run read again, after the
-- turns it touches are made if new and locked in one order. A change to a
-- request that is no ID paper with a file, before or after, touches nothing.
create or replace function public.document_requests_due_turns_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set plan_cache_mode = force_custom_plan
as $$
declare
  v_person text[];
  v_delta integer[];
  v_held integer;
begin
  if tg_op = 'TRUNCATE' then
    delete from public.document_requests_due_turns;
    return null;
  end if;
  if tg_op = 'INSERT' then
    select array_agg(c.person order by c.person), array_agg(c.d order by c.person) into v_person, v_delta
      from (select coalesce(n.employer_id, n.candidate_id)::text as person, count(*)::int as d
              from new_requests n
             where n.file_url is not null and n.document_type in ('government_id', 'nbi_clearance', 'proof_of_address')
             group by 1) c;
  elsif tg_op = 'DELETE' then
    select array_agg(c.person order by c.person), array_agg(c.d order by c.person) into v_person, v_delta
      from (select coalesce(o.employer_id, o.candidate_id)::text as person, -count(*)::int as d
              from old_requests o
             where o.file_url is not null and o.document_type in ('government_id', 'nbi_clearance', 'proof_of_address')
             group by 1) c;
  else
    select array_agg(c.person order by c.person), array_agg(c.d order by c.person) into v_person, v_delta
      from (select x.person, sum(x.d)::int as d
              from (select coalesce(n.employer_id, n.candidate_id)::text as person, 1 as d
                      from new_requests n
                     where n.file_url is not null and n.document_type in ('government_id', 'nbi_clearance', 'proof_of_address')
                    union all
                    select coalesce(o.employer_id, o.candidate_id)::text, -1
                      from old_requests o
                     where o.file_url is not null and o.document_type in ('government_id', 'nbi_clearance', 'proof_of_address')) x
             group by 1) c;
  end if;
  if v_person is null then
    return null;
  end if;

  loop
    insert into public.document_requests_due_turns (person)
    select k.person from unnest(v_person) as k (person) order by k.person
    on conflict (person) do nothing;
    select count(*) into v_held
      from (select 1
              from public.document_requests_due_turns s
              join unnest(v_person) as k (person) on s.person = k.person
             order by s.person
               for update of s) held;
    exit when v_held = cardinality(v_person);
  end loop;

  update public.document_requests_due_turns s
     set on_file = s.on_file + k.d,
         first_due = least(
           (select r.team_opened_at + interval '24 hours'
              from public.document_requests r
             where coalesce(r.employer_id, r.candidate_id)::text = k.person
               and r.file_url is not null and r.team_opened_at is not null
               and r.document_type in ('government_id', 'nbi_clearance', 'proof_of_address')
             order by r.team_opened_at, r.id limit 1),
           (select r.submitted_at + interval '168 hours'
              from public.document_requests r
             where coalesce(r.employer_id, r.candidate_id)::text = k.person
               and r.file_url is not null and r.team_opened_at is null and r.submitted_at is not null
               and r.document_type in ('government_id', 'nbi_clearance', 'proof_of_address')
             order by r.submitted_at, r.id limit 1),
           (select r.created_at + interval '168 hours'
              from public.document_requests r
             where coalesce(r.employer_id, r.candidate_id)::text = k.person
               and r.file_url is not null and r.team_opened_at is null and r.submitted_at is null
               and r.document_type in ('government_id', 'nbi_clearance', 'proof_of_address')
             order by r.created_at, r.id limit 1)),
         served_at = v.served_at
    from unnest(v_person, v_delta) as k (person, d)
    left join public.document_cleanup_served v on v.queue = 'due' and v.person = k.person
   where s.person = k.person;
  delete from public.document_requests_due_turns s
   using unnest(v_person) as k (person)
   where s.person = k.person and s.first_due is null;
  update public.document_requests_due_turns s
     set on_file = (select count(*)::int
                      from public.document_requests r
                     where coalesce(r.employer_id, r.candidate_id)::text = s.person
                       and r.file_url is not null
                       and r.document_type in ('government_id', 'nbi_clearance', 'proof_of_address'))
    from unnest(v_person) as k (person)
   where s.person = k.person and s.on_file <= 0;
  return null;
end;
$$;

revoke all on function public.document_requests_due_turns_sync() from public, anon, authenticated;

drop trigger if exists document_requests_due_turns_insert on public.document_requests;
create trigger document_requests_due_turns_insert
  after insert on public.document_requests
  referencing new table as new_requests
  for each statement execute function public.document_requests_due_turns_sync();
drop trigger if exists document_requests_due_turns_update on public.document_requests;
create trigger document_requests_due_turns_update
  after update on public.document_requests
  referencing old table as old_requests new table as new_requests
  for each statement execute function public.document_requests_due_turns_sync();
drop trigger if exists document_requests_due_turns_delete on public.document_requests;
create trigger document_requests_due_turns_delete
  after delete on public.document_requests
  referencing old table as old_requests
  for each statement execute function public.document_requests_due_turns_sync();
drop trigger if exists document_requests_due_turns_truncate on public.document_requests;
create trigger document_requests_due_turns_truncate
  after truncate on public.document_requests
  for each statement execute function public.document_requests_due_turns_sync();

-- ---------------------------------------------------------------------------
-- When a run last took each business, copied into its turn in each queue,
-- whoever writes it (the picks, the daily prune, the server). The turns are
-- locked in the same order as their queues' triggers lock them.
create or replace function public.document_cleanup_served_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set plan_cache_mode = force_custom_plan
as $$
declare
  v_queue text[];
  v_person text[];
begin
  if tg_op = 'TRUNCATE' then
    update public.document_file_trash_turns set served_at = null where served_at is not null;
    update public.document_requests_due_turns set served_at = null where served_at is not null;
    return null;
  end if;
  if tg_op = 'INSERT' then
    select array_agg(c.queue order by c.queue, c.person), array_agg(c.person order by c.queue, c.person) into v_queue, v_person
      from (select distinct n.queue, n.person from new_served n) c;
  elsif tg_op = 'DELETE' then
    select array_agg(c.queue order by c.queue, c.person), array_agg(c.person order by c.queue, c.person) into v_queue, v_person
      from (select distinct o.queue, o.person from old_served o) c;
  else
    select array_agg(c.queue order by c.queue, c.person), array_agg(c.person order by c.queue, c.person) into v_queue, v_person
      from (select n.queue, n.person from new_served n union select o.queue, o.person from old_served o) c;
  end if;
  if v_queue is null then
    return null;
  end if;
  perform 1
     from public.document_file_trash_turns s
     join unnest(v_queue, v_person) as k (queue, person) on k.queue = 'deleted' and s.person = k.person
    order by s.person
      for update of s;
  update public.document_file_trash_turns s
     set served_at = v.served_at
    from unnest(v_queue, v_person) as k (queue, person)
    left join public.document_cleanup_served v on v.queue = k.queue and v.person = k.person
   where k.queue = 'deleted' and s.person = k.person and s.served_at is distinct from v.served_at;
  perform 1
     from public.document_requests_due_turns s
     join unnest(v_queue, v_person) as k (queue, person) on k.queue = 'due' and s.person = k.person
    order by s.person
      for update of s;
  update public.document_requests_due_turns s
     set served_at = v.served_at
    from unnest(v_queue, v_person) as k (queue, person)
    left join public.document_cleanup_served v on v.queue = k.queue and v.person = k.person
   where k.queue = 'due' and s.person = k.person and s.served_at is distinct from v.served_at;
  return null;
end;
$$;

revoke all on function public.document_cleanup_served_sync() from public, anon, authenticated;

drop trigger if exists document_cleanup_served_insert on public.document_cleanup_served;
create trigger document_cleanup_served_insert
  after insert on public.document_cleanup_served
  referencing new table as new_served
  for each statement execute function public.document_cleanup_served_sync();
drop trigger if exists document_cleanup_served_update on public.document_cleanup_served;
create trigger document_cleanup_served_update
  after update on public.document_cleanup_served
  referencing old table as old_served new table as new_served
  for each statement execute function public.document_cleanup_served_sync();
drop trigger if exists document_cleanup_served_delete on public.document_cleanup_served;
create trigger document_cleanup_served_delete
  after delete on public.document_cleanup_served
  referencing old table as old_served
  for each statement execute function public.document_cleanup_served_sync();
drop trigger if exists document_cleanup_served_truncate on public.document_cleanup_served;
create trigger document_cleanup_served_truncate
  after truncate on public.document_cleanup_served
  for each statement execute function public.document_cleanup_served_sync();

-- ---------------------------------------------------------------------------
-- The turns of the tables as they stand (empty or nearly live today; written
-- for any size): one pass over each, then each business's first row by index.
insert into public.document_file_trash_turns (person, waiting, failed, first_id, first_attempts, first_queued_at, first_due, served_at)
select k.person, k.waiting, k.failed, f.id, f.attempts, f.queued_at, f.due_at, v.served_at
  from (select coalesce(t.employer_id, t.candidate_id)::text as person, count(*)::int as waiting, (count(*) filter (where t.attempts > 0))::int as failed
          from public.document_file_trash t
         group by 1) k
  cross join lateral (
    select t.id, t.attempts, t.queued_at,
           case when t.attempts > 0
                then coalesce(t.last_tried_at, t.queued_at) + least(t.attempts, 24) * interval '1 hour' + interval '30 minutes'
                else t.queued_at end as due_at
      from public.document_file_trash t
     where coalesce(t.employer_id, t.candidate_id)::text = k.person
     order by t.attempts, t.queued_at, t.id
     limit 1
  ) f
  left join public.document_cleanup_served v on v.queue = 'deleted' and v.person = k.person
on conflict (person) do update set waiting = excluded.waiting, failed = excluded.failed, first_id = excluded.first_id,
  first_attempts = excluded.first_attempts, first_queued_at = excluded.first_queued_at, first_due = excluded.first_due, served_at = excluded.served_at;

insert into public.document_requests_due_turns (person, on_file, first_due, served_at)
select k.person, k.on_file, k.first_due, v.served_at
  from (select coalesce(r.employer_id, r.candidate_id)::text as person, count(*)::int as on_file,
               least(min(r.team_opened_at) + interval '24 hours',
                     min(r.submitted_at) filter (where r.team_opened_at is null) + interval '168 hours',
                     min(r.created_at) filter (where r.team_opened_at is null and r.submitted_at is null) + interval '168 hours') as first_due
          from public.document_requests r
         where r.file_url is not null and r.document_type in ('government_id', 'nbi_clearance', 'proof_of_address')
         group by 1) k
  left join public.document_cleanup_served v on v.queue = 'due' and v.person = k.person
on conflict (person) do update set on_file = excluded.on_file, first_due = excluded.first_due, served_at = excluded.served_at;

-- ---------------------------------------------------------------------------
-- One run's notes of deleted requests for document-cleanup, at most 200. A
-- note that failed waits behind every note that is due for an hour a try, up
-- to a day, and half an hour more. Then each business's least-tried, oldest
-- note, businesses in turn: by when they were last taken or the note became
-- due, whichever is later; then everyone's next notes, the businesses with
-- the fewest waiting first, so a business that queued thousands is served
-- after everyone else. A note without a business (queued before this) counts
-- as its applicant's. Only the businesses a run can reach are read (the
-- twelfth security review: ranking every note passes the API's timeout well
-- within what a flood of businesses can queue): the first 200 whose turn has
-- come, one note each, by the turns' index; every business, and of each its
-- notes up to the 200th never tried, only when fewer have a turn that has
-- come. The run records whom it took (document_cleanup_served). Runs with
-- the caller's rights, and only the server may call it.
create or replace function public.document_file_trash_fair_pick()
returns setof public.document_file_trash
language sql
volatile
set search_path = public, pg_temp
as $$
  with come as materialized (
    select s.person, s.waiting, s.failed, s.served_at
      from public.document_file_trash_turns s
     where s.rank <= now()
     order by s.rank, s.waiting, s.first_attempts, s.first_queued_at, s.first_id
     limit 200
  ), run as materialized (
    select count(*) >= 200 as full from come
  ), people as materialized (
    select c.person, c.waiting, c.failed, c.served_at from come c
    union all
    select s.person, s.waiting, s.failed, s.served_at
      from public.document_file_trash_turns s, run
     where s.rank > now() and not run.full
  ), mine as (
    select n.note, n.id, n.attempts, n.queued_at, n.last_tried_at, p.person, p.waiting, p.served_at, n.nth
      from people p
     cross join run
     cross join lateral (
       select t as note, t.id, t.attempts, t.queued_at, t.last_tried_at,
              row_number() over (order by t.attempts, t.queued_at, t.id) as nth
         from public.document_file_trash t
        where coalesce(t.employer_id, t.candidate_id)::text = p.person
        order by t.attempts, t.queued_at, t.id
        limit case when run.full then 1 when p.waiting - p.failed >= 200 then 200 else p.waiting end
     ) n
  ), ranked as (
    select m.note, m.id, m.attempts, m.queued_at, m.person, m.served_at,
           case when m.attempts > 0
                then coalesce(m.last_tried_at, m.queued_at) + least(m.attempts, 24) * interval '1 hour' + interval '30 minutes'
                else m.queued_at end as due_at,
           m.nth, m.waiting
      from mine m
  ), placed as (
    select r.note, r.id, r.person,
           row_number() over (order by r.due_at > now(), r.nth > 1, case when r.nth = 1 then greatest(r.served_at, r.due_at) end, r.waiting, r.nth, r.attempts, r.queued_at, r.id) as place
      from ranked r
  ), picked as materialized (
    select p.note, p.id, p.person, p.place
      from placed p
     where p.place <= 200
  ), served as (
    insert into public.document_cleanup_served (queue, person, served_at)
    select distinct 'deleted', p.person, now()
      from picked p
    on conflict (queue, person) do update set served_at = excluded.served_at
  )
  select (p.note).*
    from picked p
   order by p.place
$$;

-- Why that is enough: a turn ranks at the later of the business's last run
-- and its first note's due time, so one that ranks at or before now() has
-- its first note due, and every such first note comes before any other note
-- (first notes that are due, by rank, the fewest waiting, then the note: the
-- index's own order). So when 200 are found they are the run. When fewer
-- are, a business's notes past its 200th never tried cannot be reached:
-- notes never tried come first in its numbering and are all due, so 199 of
-- its own come before them.

revoke all on function public.document_file_trash_fair_pick() from public, anon, authenticated;
grant execute on function public.document_file_trash_fair_pick() to service_role;

-- An ID photo an open request never linked: the applicant's upload went up,
-- but saving its link failed and so did the upload dialog's own removal, so
-- nothing on a timer found it (the thirteenth Phase 5 review's finding 2;
-- docs/DOCUMENT-REQUESTS.md). Seven days after such a request was asked for,
-- the sweep below queues each file storage holds in its own folder,
-- <applicant>/<request>/, in document_file_trash, naming the business, as a
-- file sent again is queued (20261025640000): document_file_trash_fair_pick
-- takes it in the business's turn, and document-cleanup deletes only that
-- file, never the folder or a file the request links by then. Each request is
-- looked at once, in the order they were asked for, at most 5,000 a run, from
-- where the last run stopped (document_requests_swept), so the work is a
-- run's worth however many requests there are. A file uploaded after its
-- request was looked at, still unlinked, waits for the request's own end (its
-- application's deletion). When storage cannot be read, nothing is queued
-- and the mark stays where it was.
create table if not exists public.document_requests_swept (
  only_row boolean primary key default true check (only_row),
  created_at timestamptz not null default '-infinity',
  id uuid not null default '00000000-0000-0000-0000-000000000000'
);

comment on table public.document_requests_swept is
  'How far document_requests_sweep_strays has looked at ID requests with no link, by when they were asked for (the twelfth security round, for the thirteenth Phase 5 review''s finding 2). One row; the server''s only.';

insert into public.document_requests_swept default values on conflict do nothing;

alter table public.document_requests_swept enable row level security;
revoke all on table public.document_requests_swept from public, anon, authenticated, service_role;

-- The ID requests with no link, by when they were asked for: the sweep's order.
create index if not exists document_requests_unlinked
  on public.document_requests (created_at, id)
  where file_url is null
    and document_type in ('government_id', 'nbi_clearance', 'proof_of_address');

create or replace function public.document_requests_sweep_strays(p_kinds text[], p_sent_before timestamptz)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_mark public.document_requests_swept%rowtype;
  v_queued integer;
begin
  if p_kinds is null or p_sent_before is null or to_regclass('storage.objects') is null then
    return 0;
  end if;
  select * into v_mark from public.document_requests_swept where only_row for update;
  if not found then
    return 0;
  end if;
  with looked as materialized (
    select r.id, r.candidate_id, r.employer_id, r.document_type, r.created_at
      from public.document_requests r
     where r.file_url is null
       and r.document_type in ('government_id', 'nbi_clearance', 'proof_of_address')
       and r.created_at <= p_sent_before
       and (r.created_at, r.id) > (v_mark.created_at, v_mark.id)
     order by r.created_at, r.id
     limit 5000
  ), mark as (
    update public.document_requests_swept w
       set created_at = m.created_at, id = m.id
      from (select l.created_at, l.id from looked l order by l.created_at desc, l.id desc limit 1) m
     where w.only_row
  ), queued as (
    insert into public.document_file_trash (candidate_id, request_id, file_url, employer_id)
    select l.candidate_id, l.id, o.name, l.employer_id
      from looked l
     cross join lateral (
       select o.name
         from storage.objects o
        where o.bucket_id = 'requested-documents'
          and o.name like l.candidate_id::text || '/' || l.id::text || '/%'
        order by o.name
        limit 100
     ) o
     where l.candidate_id is not null
       and l.document_type = any (p_kinds)
       and not exists (select 1 from public.document_file_trash q where q.request_id = l.id and q.file_url = o.name)
    returning 1
  )
  select count(*)::int into v_queued from queued;
  return v_queued;
exception
  when others then
    -- Storage could not be read (or anything else): nothing is queued and
    -- the mark stays, so these requests are looked at again next run; the
    -- due papers are picked all the same.
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
-- papers each. Before it picks, it queues the files of ID requests with no
-- link that were asked for before p_sent_before (document_requests_sweep_strays,
-- above). Nothing without its arguments. The run records whom it took.
-- Runs with the caller's rights, and only the server may call it.
create or replace function public.document_requests_due_pick(p_kinds text[], p_opened_before timestamptz, p_sent_before timestamptz)
returns table (id uuid, candidate_id uuid, file_url text, status text)
language sql
volatile
set search_path = public, pg_temp
as $$
  with strays as materialized (
    select public.document_requests_sweep_strays(p_kinds, p_sent_before) as queued
  ), first_come as materialized (
    select s.person, s.rank, s.served_at
      from public.document_requests_due_turns s
     where s.rank <= now()
     order by s.rank, s.person
     limit 200
  ), run as materialized (
    select count(*) >= 200 as full,
           (select f.rank from first_come f order by f.rank desc, f.person desc limit 1) as last_rank,
           (select f.person from first_come f order by f.rank desc, f.person desc limit 1) as last_person,
           (select s.queued from strays s) as strays_queued
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

-- Why that is enough: a business's turn ranks at the later of its last run
-- and when its first paper is due, so one that ranks at or before now() has
-- a paper due, and every such first paper comes before any other paper. The
-- index orders by rank only, so up to 200 more who rank with the 200th are
-- read too, and the fewest due decides among them: those who rank together
-- are the businesses one run took (at most 200), unless their papers fell due
-- at the very same moment. When fewer than 200 are due, every business with
-- a paper due is read, and of each no more than a run can take.

revoke all on function public.document_requests_due_pick(text[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.document_requests_due_pick(text[], timestamptz, timestamptz) to service_role;

-- The API must see the turns before document-cleanup's next run. Supabase
-- reloads the API's schema after DDL; this asks for it as well.
notify pgrst, 'reload schema';
