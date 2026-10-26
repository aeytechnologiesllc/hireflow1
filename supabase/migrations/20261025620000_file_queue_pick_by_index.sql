-- document-cleanup's pick of the removal queue reads a run's worth, however
-- big the queue grows, and a removal of two withdrawals' worth goes three at
-- a time after its first turn (the twelfth security review, 2026-10-26,
-- findings 1 and 2).
--
-- storage_file_trash_fair_pick ranked the whole queue on every call: each
-- person's notes numbered and counted, every note placed, each turn's end
-- found (three sorts of every note of that kind). document-cleanup calls it
-- through the API, whose statement timeout is 8 seconds, and a note leaves
-- the queue only once a run has picked it. The review's proof: 1,000 free
-- accounts, each looping "start an application on the one live job, put a
-- tiny file in each of its three folders, withdraw it" at the start limit (10
-- an hour), queue 30,000 folders an hour; at about 700,000 (a day of it) the
-- folder pick took more than 8 seconds on a local PostgreSQL with live's
-- settings (9 to 12 seconds at 750,000 to 1,000,000), so from then on every
-- hourly run's pick was cancelled, whether or not the flood went on. No
-- folder was removed for anyone again (voice recordings, video introductions,
-- work samples and deleted documents' signed copies stayed), and the backlog
-- alert, which runs after the pick, stopped too.
-- Now:
-- 1. Each person's turn is kept in public.storage_file_trash_turns, one row
--    for each person and kind of note, by the queue's own triggers: how many
--    notes they hold, when their first note (the least-tried, oldest) is due,
--    and when a run last took them (storage_file_trash_served, copied by that
--    table's own trigger), so the turn's rank (the later of the last two) is
--    in an index. Every statement that adds, changes or removes notes locks
--    the turns it touches, in one order, before it reads them again, so two
--    at once take turns and never undo each other.
-- 2. A run reads the first 200 people whose turn has come (1,000 for exact
--    paths) from that index, and only their first notes from an index on the
--    queue, then ranks those as before. That is the same notes in the same
--    order as ranking the whole queue (why, below the function), at a cost
--    set by the run's size: on a local PostgreSQL 16 with live's settings,
--    8 to 28 ms from 250,000 to 2,000,000 folder notes, where the old pick
--    took 3.5 s at 250,000, 6.7 s at 500,000 and was cancelled from 750,000
--    on (launch_locks_behaviour section 18 holds a pick at ten times the
--    queue to less than twice as long on PGlite; the old ones took ten times).
-- 3. When fewer than a run's people have a turn that has come, the pick also
--    reads everyone else: the people whose first note failed and waits out
--    its back-off. There are only as many as notes storage refused in the
--    last day (a run tries at most 1,200), never the flood's.
-- document-cleanup's alert for a pick that could not be read now says when
-- it timed out, and how to find the accounts filling the queue.
--
-- The order is otherwise unchanged (the tenth and eleventh security
-- reviews' rules: a note that failed behind every note that is due until its
-- back-off ends; people in turn by when they were last taken or their first
-- note became due, whichever is later, the fewest waiting first among turns
-- that come at once; a person's turn all of their notes when they hold no
-- more than one withdrawal's worth, else their first; a turn whole or not at
-- all; then everyone's next notes, the fewest waiting first; 6 folders and 40
-- exact paths from one person, 200 folders and 1,000 exact paths a run), and
-- so are the record and its prune.
--
-- And the twelfth security review's finding 2 (LOW, a regression of
-- 20261025600000): someone holding more than a withdrawal's worth (a Delete
-- Account with two applications: six folders) gave one note a turn until
-- they were down to three, and each of those turns waited behind everyone
-- who queued since their last one, now up to three folders from each where
-- 20261025590000 took one. 100 new accounts an hour, each holding one
-- withdrawal, from six hours before it: its six folders went in the 4th,
-- 10th, 19th and 32nd runs (the 32nd for the last three; 2/5/8/12/17/22 under
-- 20261025590000). Now someone holding no more than two withdrawals' worth
-- (6 folders, 12 exact paths) who has had a turn since their oldest note was
-- queued takes up to a withdrawal's worth in each later turn (still whole or
-- not at all). That flood: the 4th, then the 10th for three, then the 19th
-- (was the 32nd); under 1,000 new accounts an hour with one folder each, the
-- 1st, the 6th for three, then the 31st (was past the 80th); under 200 new
-- accounts an hour with 30 folders each, the 2nd, the 5th for three, then
-- the 11th (was the 23rd). No row of the tenth, eleventh or twelfth reviews'
-- tables is worse (each is the same or better). The review's two candidates
-- were each worse somewhere: everyone up to three a turn (accounts holding
-- many notes then take three a turn each, and a real withdrawal behind them
-- waited up to three times as long), or up to three after a first turn
-- whatever one holds (the same, after one turn of one). Held to two
-- withdrawals' worth, an account that queues many still gives one a turn.
-- What it costs: a flood of accounts holding exactly two withdrawals' worth
-- now takes up to three of their six in each later turn too, so a real
-- withdrawal queued after their first turns waits longer behind them (1,000
-- accounts with six folders each, taken once three runs before it: the 12th
-- run, was the 6th; 1,000 new such accounts an hour: the 8th, was the 6th).
-- Neither is worse than what the same accounts can do already as accounts
-- holding one withdrawal each (1,000 new ones an hour: the 15th run, under
-- both rules; any flood queued before it: one run for every 200 of its
-- folders, under both).
-- (20261025600000's own comment said such a person "gives one note a turn
-- until they are down to one"; it was down to three, then the rest went
-- together. Corrected there too.)
--
-- Each function is its latest repo body with only these changes:
--   storage_file_trash_fair_pick   from 20261025600000_file_queue_whole_turns.sql
--                                  (reads the turns and each person's first notes
--                                  by index, then ranks them as before; a turn of
--                                  up to a withdrawal's worth for someone holding
--                                  no more than two who has had a turn since their
--                                  oldest note was queued)
-- New: public.storage_file_trash_turns, filled here from the queue as it
-- stands; public.storage_file_trash_turns_sync() and its triggers on
-- storage_file_trash (insert, update, delete, truncate);
-- public.storage_file_trash_served_sync() and its triggers on
-- storage_file_trash_served; the index storage_file_trash_by_person.
-- document-cleanup calls the pick as before; only its alert's words change
-- (supabase/functions/document-cleanup).

-- No note goes in, changes or goes while the turns are made and filled.
lock table public.storage_file_trash, public.storage_file_trash_served in share row exclusive mode;

-- Each person's notes of one kind, fewest tries and oldest first, as the
-- pick numbers them: a run reads each person's first notes from here. The
-- kind is indexed as a number: "(path is not null) = false" with a known
-- p_exact is planned as "path is null", which no index on the boolean
-- matches, and every person's notes were then read by a scan of the queue.
create index if not exists storage_file_trash_by_person
  on public.storage_file_trash (((path is not null)::int), (coalesce(candidate_id::text, application_id::text, bucket || ':' || coalesce(path, folder))), attempts, queued_at, id);

-- Each person's turn in the removal queue, for each kind of note (folders,
-- exact paths): how many notes they hold, when their first note is due, when
-- a run last took them, and so where their turn ranks. Kept by the queue's
-- own triggers; only the server reads it.
create table if not exists public.storage_file_trash_turns (
  exact boolean not null,
  person text not null,
  waiting integer not null default 0,
  first_due timestamptz,
  served_at timestamptz,
  rank timestamptz generated always as (greatest(served_at, first_due)) stored,
  primary key (exact, person)
);

comment on table public.storage_file_trash_turns is
  'Each person''s turn in the removal queue (storage_file_trash), one row for each person and kind of note: notes waiting, when their first note is due, when a run last took them (storage_file_trash_served), and the turn''s rank, the later of the two. Kept by the queue''s own triggers so document-cleanup''s pick reads a run''s worth by index (the twelfth security review). Service role reads only.';

create index if not exists storage_file_trash_turns_rank on public.storage_file_trash_turns (exact, rank, waiting, person);

alter table public.storage_file_trash_turns enable row level security;
revoke all on table public.storage_file_trash_turns from public, anon, authenticated, service_role;
grant select on table public.storage_file_trash_turns to service_role;

-- Keeps each touched person's turn: their notes counted in and out, their
-- first note's due time and their last run read again. The turns it touches
-- are made if new and locked in one order first, then read from the queue,
-- so a statement that changed the same person a moment before is seen, and
-- two statements at once never deadlock. A turn whose person holds nothing
-- goes; a count that says nothing is left while a note is there is counted
-- again. Runs with its own rights (the queue's writers are the server, its
-- own triggers and remove-applicant), each statement planned for the people
-- it was given (a plan made for "some" people read every turn).
create or replace function public.storage_file_trash_turns_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set plan_cache_mode = force_custom_plan
as $$
declare
  v_exact boolean[];
  v_person text[];
  v_delta integer[];
  v_held integer;
begin
  if tg_op = 'TRUNCATE' then
    delete from public.storage_file_trash_turns;
    return null;
  end if;
  if tg_op = 'INSERT' then
    select array_agg(c.exact order by c.exact, c.person), array_agg(c.person order by c.exact, c.person), array_agg(c.d order by c.exact, c.person)
      into v_exact, v_person, v_delta
      from (select (n.path is not null) as exact, coalesce(n.candidate_id::text, n.application_id::text, n.bucket || ':' || coalesce(n.path, n.folder)) as person, count(*)::int as d
              from new_notes n group by 1, 2) c;
  elsif tg_op = 'DELETE' then
    select array_agg(c.exact order by c.exact, c.person), array_agg(c.person order by c.exact, c.person), array_agg(c.d order by c.exact, c.person)
      into v_exact, v_person, v_delta
      from (select (o.path is not null) as exact, coalesce(o.candidate_id::text, o.application_id::text, o.bucket || ':' || coalesce(o.path, o.folder)) as person, -count(*)::int as d
              from old_notes o group by 1, 2) c;
  else
    select array_agg(c.exact order by c.exact, c.person), array_agg(c.person order by c.exact, c.person), array_agg(c.d order by c.exact, c.person)
      into v_exact, v_person, v_delta
      from (select x.exact, x.person, sum(x.d)::int as d
              from (select (n.path is not null) as exact, coalesce(n.candidate_id::text, n.application_id::text, n.bucket || ':' || coalesce(n.path, n.folder)) as person, 1 as d from new_notes n
                    union all
                    select (o.path is not null), coalesce(o.candidate_id::text, o.application_id::text, o.bucket || ':' || coalesce(o.path, o.folder)), -1 from old_notes o) x
             group by 1, 2) c;
  end if;
  if v_exact is null then
    return null;
  end if;

  -- Every turn touched, made if new and locked, in one order. A turn another
  -- statement removed between the two (its person had just been emptied) is
  -- made again, until all are held.
  loop
    insert into public.storage_file_trash_turns (exact, person)
    select k.exact, k.person from unnest(v_exact, v_person) as k (exact, person) order by k.exact, k.person
    on conflict (exact, person) do nothing;
    select count(*) into v_held
      from (select 1
              from public.storage_file_trash_turns s
              join unnest(v_exact, v_person) as k (exact, person) on s.exact = k.exact and s.person = k.person
             order by s.exact, s.person
               for update of s) held;
    exit when v_held = cardinality(v_exact);
  end loop;

  update public.storage_file_trash_turns s
     set waiting = s.waiting + k.d,
         first_due = f.due_at,
         served_at = v.served_at
    from unnest(v_exact, v_person, v_delta) as k (exact, person, d)
    left join lateral (
      select case when t.attempts > 0
                  then coalesce(t.last_tried_at, t.queued_at) + least(t.attempts, 24) * interval '1 hour' + interval '30 minutes'
                  else t.queued_at end as due_at
        from public.storage_file_trash t
       where (t.path is not null)::int = k.exact::int
         and coalesce(t.candidate_id::text, t.application_id::text, t.bucket || ':' || coalesce(t.path, t.folder)) = k.person
       order by t.attempts, t.queued_at, t.id
       limit 1
    ) f on true
    left join public.storage_file_trash_served v on v.exact = k.exact and v.person = k.person
   where s.exact = k.exact and s.person = k.person;
  delete from public.storage_file_trash_turns s
   using unnest(v_exact, v_person) as k (exact, person)
   where s.exact = k.exact and s.person = k.person and s.first_due is null;
  update public.storage_file_trash_turns s
     set waiting = (select count(*)::int
                      from public.storage_file_trash t
                     where (t.path is not null)::int = s.exact::int
                       and coalesce(t.candidate_id::text, t.application_id::text, t.bucket || ':' || coalesce(t.path, t.folder)) = s.person)
    from unnest(v_exact, v_person) as k (exact, person)
   where s.exact = k.exact and s.person = k.person and s.waiting <= 0;
  return null;
end;
$$;

revoke all on function public.storage_file_trash_turns_sync() from public, anon, authenticated;

drop trigger if exists storage_file_trash_turns_insert on public.storage_file_trash;
create trigger storage_file_trash_turns_insert
  after insert on public.storage_file_trash
  referencing new table as new_notes
  for each statement execute function public.storage_file_trash_turns_sync();
drop trigger if exists storage_file_trash_turns_update on public.storage_file_trash;
create trigger storage_file_trash_turns_update
  after update on public.storage_file_trash
  referencing old table as old_notes new table as new_notes
  for each statement execute function public.storage_file_trash_turns_sync();
drop trigger if exists storage_file_trash_turns_delete on public.storage_file_trash;
create trigger storage_file_trash_turns_delete
  after delete on public.storage_file_trash
  referencing old table as old_notes
  for each statement execute function public.storage_file_trash_turns_sync();
drop trigger if exists storage_file_trash_turns_truncate on public.storage_file_trash;
create trigger storage_file_trash_turns_truncate
  after truncate on public.storage_file_trash
  for each statement execute function public.storage_file_trash_turns_sync();

-- Copies when a run last took each person (storage_file_trash_served) into
-- their turn, whoever writes it: the pick itself, the daily prune, or a
-- statement of the server's. The turns it touches are locked in the same
-- order as the queue's trigger locks them, then read again.
create or replace function public.storage_file_trash_served_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set plan_cache_mode = force_custom_plan
as $$
declare
  v_exact boolean[];
  v_person text[];
begin
  if tg_op = 'TRUNCATE' then
    update public.storage_file_trash_turns set served_at = null where served_at is not null;
    return null;
  end if;
  if tg_op = 'INSERT' then
    select array_agg(c.exact order by c.exact, c.person), array_agg(c.person order by c.exact, c.person) into v_exact, v_person
      from (select distinct n.exact, n.person from new_served n) c;
  elsif tg_op = 'DELETE' then
    select array_agg(c.exact order by c.exact, c.person), array_agg(c.person order by c.exact, c.person) into v_exact, v_person
      from (select distinct o.exact, o.person from old_served o) c;
  else
    select array_agg(c.exact order by c.exact, c.person), array_agg(c.person order by c.exact, c.person) into v_exact, v_person
      from (select n.exact, n.person from new_served n union select o.exact, o.person from old_served o) c;
  end if;
  if v_exact is null then
    return null;
  end if;
  perform 1
     from public.storage_file_trash_turns s
     join unnest(v_exact, v_person) as k (exact, person) on s.exact = k.exact and s.person = k.person
    order by s.exact, s.person
      for update of s;
  update public.storage_file_trash_turns s
     set served_at = v.served_at
    from unnest(v_exact, v_person) as k (exact, person)
    left join public.storage_file_trash_served v on v.exact = k.exact and v.person = k.person
   where s.exact = k.exact and s.person = k.person and s.served_at is distinct from v.served_at;
  return null;
end;
$$;

revoke all on function public.storage_file_trash_served_sync() from public, anon, authenticated;

drop trigger if exists storage_file_trash_served_insert on public.storage_file_trash_served;
create trigger storage_file_trash_served_insert
  after insert on public.storage_file_trash_served
  referencing new table as new_served
  for each statement execute function public.storage_file_trash_served_sync();
drop trigger if exists storage_file_trash_served_update on public.storage_file_trash_served;
create trigger storage_file_trash_served_update
  after update on public.storage_file_trash_served
  referencing old table as old_served new table as new_served
  for each statement execute function public.storage_file_trash_served_sync();
drop trigger if exists storage_file_trash_served_delete on public.storage_file_trash_served;
create trigger storage_file_trash_served_delete
  after delete on public.storage_file_trash_served
  referencing old table as old_served
  for each statement execute function public.storage_file_trash_served_sync();
drop trigger if exists storage_file_trash_served_truncate on public.storage_file_trash_served;
create trigger storage_file_trash_served_truncate
  after truncate on public.storage_file_trash_served
  for each statement execute function public.storage_file_trash_served_sync();

-- The turns of the queue as it stands (empty live today; written for any
-- size): one pass over the queue, then each person's first note by index.
insert into public.storage_file_trash_turns (exact, person, waiting, first_due, served_at)
select k.exact, k.person, k.waiting, f.due_at, v.served_at
  from (select (t.path is not null) as exact, coalesce(t.candidate_id::text, t.application_id::text, t.bucket || ':' || coalesce(t.path, t.folder)) as person, count(*)::int as waiting
          from public.storage_file_trash t
         group by 1, 2) k
  cross join lateral (
    select case when t.attempts > 0
                then coalesce(t.last_tried_at, t.queued_at) + least(t.attempts, 24) * interval '1 hour' + interval '30 minutes'
                else t.queued_at end as due_at
      from public.storage_file_trash t
     where (t.path is not null)::int = k.exact::int
       and coalesce(t.candidate_id::text, t.application_id::text, t.bucket || ':' || coalesce(t.path, t.folder)) = k.person
     order by t.attempts, t.queued_at, t.id
     limit 1
  ) f
  left join public.storage_file_trash_served v on v.exact = k.exact and v.person = k.person
on conflict (exact, person) do update set waiting = excluded.waiting, first_due = excluded.first_due, served_at = excluded.served_at;

-- One run's notes for document-cleanup: the folders (p_exact false, up to 200,
-- 6 from one person) or the exact paths (p_exact true, up to 1,000, 40 from
-- one person). A note that failed waits behind every note that is due for an
-- hour a try, up to a day, and half an hour more (the ninth security review:
-- a note that failed every hour sat at the front of every run; the tenth:
-- behind every note never tried, a real one that failed once was never tried
-- again while a flood went on). Then each person's turn: their least-tried,
-- oldest note, or all of their notes when they hold no more than one
-- withdrawal's worth (3 folders, 6 exact paths; the eleventh security review:
-- one note a turn, a real withdrawal's later folders each waited behind every
-- account that joined the queue since, longer each time), or up to one
-- withdrawal's worth when they hold no more than two and have had a turn
-- since their oldest note was queued (the twelfth security review, finding 2:
-- a Delete Account with two applications gave one a turn, each turn behind
-- everyone who queued since), taken whole or not at all; people in turn, by when they were last served or their first note
-- became due, whichever is later (the tenth security review: by the note's
-- age, 200 accounts' burst queued before a real withdrawal kept a place ahead
-- of it in every run, 30 runs for every hour of burst; by the fewest waiting,
-- the ninth's 200 accounts with one note each kept it out of every run), the
-- fewest waiting first among people whose turn comes at the same time; then
-- everyone's next notes, the people with the fewest notes waiting first (in
-- turn among people with as many), so an account that queued thousands is
-- served after everyone else. Only the people a run can reach are read (the
-- twelfth security review: ranking the whole queue passed the API's 8-second
-- timeout at about 700,000 notes, and then no run ever emptied it): the first
-- 200 (1,000) whose turn has come, by the turns' index, and only their first
-- notes, by the queue's; everyone else as well only when fewer have a turn
-- that has come. The run records whom it took (storage_file_trash_served).
-- Two calls rather than one, so neither answer passes the API's 1,000-row
-- ceiling. Runs with the caller's rights, and only the server may call it.
create or replace function public.storage_file_trash_fair_pick(p_exact boolean)
returns setof public.storage_file_trash
language sql
volatile
set search_path = public, pg_temp
as $$
  with come as materialized (
    select s.person, s.waiting, s.served_at
      from public.storage_file_trash_turns s
     where s.exact = coalesce(p_exact, false) and s.rank <= now()
     order by s.rank, s.waiting, s.person
     limit case when coalesce(p_exact, false) then 1000 else 200 end
  ), run as materialized (
    select count(*) >= case when coalesce(p_exact, false) then 1000 else 200 end as full from come
  ), people as materialized (
    select c.person, c.waiting, c.served_at from come c
    union all
    select s.person, s.waiting, s.served_at
      from public.storage_file_trash_turns s, run
     where s.exact = coalesce(p_exact, false) and s.rank > now() and not run.full
  ), mine as (
    select n.note, n.id, n.attempts, n.queued_at, n.last_tried_at, p.person, p.waiting, p.served_at, n.nth
      from people p
     cross join run
     cross join lateral (
       select t as note, t.id, t.attempts, t.queued_at, t.last_tried_at,
              row_number() over (order by t.attempts, t.queued_at, t.id) as nth
         from public.storage_file_trash t
        where (t.path is not null)::int = coalesce(p_exact, false)::int
          and coalesce(t.candidate_id::text, t.application_id::text, t.bucket || ':' || coalesce(t.path, t.folder)) = p.person
        order by t.attempts, t.queued_at, t.id
        limit case when not run.full then (case when coalesce(p_exact, false) then 40 else 6 end)
                   when p.waiting <= case when coalesce(p_exact, false) then 12 else 6 end then p.waiting
                   else 1 end
     ) n
  ), ranked as (
    select m.note, m.id, m.attempts, m.queued_at, m.person, m.served_at,
           case when m.attempts > 0
                then coalesce(m.last_tried_at, m.queued_at) + least(m.attempts, 24) * interval '1 hour' + interval '30 minutes'
                else m.queued_at end as due_at,
           m.nth, m.waiting
      from mine m
  ), turned as (
    select r.note, r.id, r.attempts, r.queued_at, r.person, r.served_at, r.due_at, r.nth, r.waiting,
           r.due_at > now() as held,
           (r.nth = 1 or r.waiting <= case when coalesce(p_exact, false) then 6 else 3 end
            or (r.waiting <= case when coalesce(p_exact, false) then 12 else 6 end
                and r.nth <= case when coalesce(p_exact, false) then 6 else 3 end
                and r.served_at >= min(r.queued_at) over (partition by r.person))) as in_turn,
           first_value(r.due_at) over (partition by r.person order by r.nth) as first_due
      from ranked r
  ), placed as (
    select r.note, r.id, r.person, r.held, r.in_turn,
           row_number() over (order by r.held, not r.in_turn, case when r.in_turn then greatest(r.served_at, r.first_due) end, r.waiting, case when r.in_turn then r.person end, r.nth, r.attempts, r.queued_at, r.id) as place
      from turned r
     where r.nth <= case when coalesce(p_exact, false) then 40 else 6 end
  ), whole as (
    select p.note, p.id, p.person, p.place,
           case when p.in_turn then max(p.place) over (partition by p.person, p.held, p.in_turn) else p.place end as turn_ends
      from placed p
  ), picked as materialized (
    select w.note, w.id, w.person, w.place
      from whole w
     where w.turn_ends <= case when coalesce(p_exact, false) then 1000 else 200 end
  ), served as (
    insert into public.storage_file_trash_served (exact, person, served_at)
    select distinct coalesce(p_exact, false), p.person, now()
      from picked p
    on conflict (exact, person) do update set served_at = excluded.served_at
  )
  select (p.note).*
    from picked p
   order by p.place
$$;

-- Why the first 200 people whose turn has come are enough (1,000 for exact
-- paths). A turn ranks at the later of the person's last run and their first
-- note's due time, so a turn that ranks at or before now() has its first note
-- due: it is in the run's first part (turns that are due, by rank, the fewest
-- waiting, then the person: the index's own order), and every turn there
-- takes at least one place. So when 200 such people are found, every other
-- note (another person's turn, anyone's next notes, a note that waits out
-- its back-off) has a place past 200, and of these people only their turns
-- can be taken: their first note, or all of them when they hold no more than
-- a withdrawal's worth, or up to one withdrawal's worth of them when they
-- hold no more than two (all of those are read, to see when the oldest was
-- queued). When fewer are found, the pick reads everyone with
-- notes of that kind (the rest have a turn that ranks after now(): their
-- first note failed and waits out its back-off), and up to 6 (40) notes of
-- each, as the old pick numbered them. When a run last took each person is
-- read from their turn (a copy of storage_file_trash_served, kept by its
-- trigger), and each note is carried whole to the answer, so nothing is
-- joined against the whole record or the whole queue.

revoke all on function public.storage_file_trash_fair_pick(boolean) from public, anon, authenticated;
grant execute on function public.storage_file_trash_fair_pick(boolean) to service_role;

-- The API must see the turns before document-cleanup's next run. Supabase
-- reloads the API's schema after DDL; this asks for it as well.
notify pgrst, 'reload schema';
