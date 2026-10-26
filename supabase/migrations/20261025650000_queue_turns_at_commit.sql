-- A deleted application's files are never left out of the removal queue by a
-- deadlock, and the queues' turns are taken in one order, at commit (the
-- thirteenth security review, 2026-10-26, finding 2 and LOW 1).
--
-- 20261025620000 and 20261025630000 keep each person's turn (and each
-- business's, for the papers) in a table the queues' own statement triggers
-- update. Each trigger locked the turns it touched, in one order, but only
-- for its own statement: a transaction of many statements took them in no
-- order at all. A deleted job deletes its applications one by one, each
-- queueing its applicant's files and locking that applicant's turn; the
-- pick's record of whom it took (an INSERT ... ON CONFLICT DO UPDATE) fired
-- its trigger twice, once for the people it took for the first time and once
-- for the rest, each in order but the two one after the other. The review's
-- proof (p7s13/pg/dl_*.sql): a deleted job's two applications and one run's
-- pick deadlocked, and the loser was the queueing insert inside
-- applications_queue_voice_recordings, whose EXCEPTION WHEN OTHERS caught it,
-- logged "not queued: deadlock detected", and let the delete commit with
-- nothing queued: that applicant's voice recording, video introduction and
-- work samples stayed in storage for good, and no backlog alert could see
-- them. Under the review's bench (six writers and one cleanup caller) about
-- 40% of cleanup runs and 1% of writers deadlocked.
-- Now:
-- 1. A queue's statement triggers only note what changed (whose turn, by how
--    many notes) in private.queue_turn_changes, under the transaction's id,
--    and mark the transaction in private.queue_turn_commits. That row's
--    constraint trigger, DEFERRABLE INITIALLY DEFERRED, runs once, when the
--    transaction commits (public.queue_turns_apply), and brings every turn
--    it touched up to date at once: the removal queue's
--    (storage_file_trash_turns), then the deleted requests'
--    (document_file_trash_turns), then the due ID papers'
--    (document_requests_due_turns), each in order of its key. So every
--    transaction takes the turns' locks in one global order, all at the end:
--    one that is still working holds none of them, and none waits for a turn
--    while it holds one out of order. The work done for each turn is the
--    statement trigger's own, moved as written (private.*_turns_apply) but
--    for how the turns are taken: the trigger made the new ones, then locked
--    them all, then made again any another statement had emptied in between,
--    and a turn emptied and made again between those passes was taken out
--    of order (this round's bench, at commit); now one INSERT ... ON
--    CONFLICT DO UPDATE in order makes or takes each. So
--    the turns are the queue as it stands once the transaction commits, as
--    every other session sees them; inside the transaction they are the
--    turns as they stood before it (nothing reads them there: the picks run
--    in requests of their own). A transaction that rolls back, or a part of
--    one that does, leaves no note behind.
-- 2. The queueing triggers (applications_queue_voice_recordings, both its
--    blocks, and documents_queue_files) never swallow a deadlock, a
--    serialization failure or a lock timeout (40P01, 40001, 55P03): the
--    delete fails, with nothing lost, and is tried again (the browser, the
--    server or Delete Account says it could not). Any other error is still
--    logged and the delete still goes, as before (a removal is never refused
--    for its files' note). The other writers of the two file queues
--    (document_requests_trash_file, document_requests_guard_update,
--    remove-applicant) catch nothing, and document_requests_sweep_strays is
--    redefined in 20261025660000.
-- The truncate paths still clear a queue's turns at once (a truncate is the
-- server's own, never a request's).
--
-- Each function is its latest repo body with only this change:
--   storage_file_trash_turns_sync        from 20261025620000_file_queue_pick_by_index.sql
--                                        (notes the change instead of applying it)
--   storage_file_trash_served_sync       from 20261025620000_file_queue_pick_by_index.sql
--                                        (the same)
--   document_file_trash_turns_sync       from 20261025630000_id_papers_pick_by_index.sql
--                                        (the same)
--   document_requests_due_turns_sync     from 20261025630000_id_papers_pick_by_index.sql
--                                        (the same)
--   document_cleanup_served_sync         from 20261025630000_id_papers_pick_by_index.sql
--                                        (the same)
--   applications_queue_voice_recordings  from 20261025580000_file_queue_many_accounts.sql
--                                        (a deadlock, serialization failure or lock timeout re-raised, in both blocks)
--   documents_queue_files                from 20261025570000_application_stays_on_its_job.sql
--                                        (the same)
-- New: private.queue_turn_changes, private.queue_turn_commits and its
-- constraint trigger queue_turn_commits_apply; public.queue_turns_apply();
-- private.queue_turns_changed(); private.storage_file_trash_turns_apply(),
-- private.document_file_trash_turns_apply() and
-- private.document_requests_due_turns_apply(), each the second half of its
-- queue's statement trigger as it was, its make-and-lock loop one ordered
-- INSERT ... ON CONFLICT DO UPDATE. The statement triggers are unchanged
-- (they call their functions by name); so are the picks, and the turns'
-- tables and what is in them.

-- No note goes in, changes or goes while the triggers change hands.
lock table public.storage_file_trash, public.storage_file_trash_served, public.document_file_trash, public.document_requests, public.document_cleanup_served in share row exclusive mode;

-- What each statement changed in a queue's turns, kept until its transaction
-- commits: whose turn (the removal queue's by kind of note and person; the
-- papers' by business), by how many notes, and how many of those failed.
create table if not exists private.queue_turn_changes (
  txid bigint not null,
  queue text not null check (queue in ('removal', 'deleted', 'due')),
  exact boolean not null default false,
  person text not null,
  d integer not null default 0,
  f integer not null default 0
);

create index if not exists queue_turn_changes_txid on private.queue_turn_changes (txid);

comment on table private.queue_turn_changes is
  'What each statement changed in a queue''s turns (removal: storage_file_trash_turns; deleted: document_file_trash_turns; due: document_requests_due_turns), kept under its transaction''s id until public.queue_turns_apply brings the turns up to date at commit, in one order (the thirteenth security review). Empty but for transactions in flight.';

-- One row for each transaction with changes waiting; its constraint trigger
-- runs public.queue_turns_apply once, at commit.
create table if not exists private.queue_turn_commits (
  txid bigint primary key
);

comment on table private.queue_turn_commits is
  'One row for each transaction with changes to a queue''s turns waiting (private.queue_turn_changes); its deferred constraint trigger applies them once, at commit (the thirteenth security review). Empty but for transactions in flight.';

alter table private.queue_turn_changes enable row level security;
alter table private.queue_turn_commits enable row level security;
revoke all on table private.queue_turn_changes from public, anon, authenticated, service_role;
revoke all on table private.queue_turn_commits from public, anon, authenticated, service_role;

-- Notes one statement's changes to a queue's turns for its transaction's
-- commit (p_exact only for the removal queue; p_delta, p_failed NULL for
-- none). Called by the queues' own statement triggers, which run with their
-- own rights.
create or replace function private.queue_turns_changed(p_queue text, p_exact boolean[], p_person text[], p_delta integer[], p_failed integer[])
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(cardinality(p_person), 0) = 0 then
    return;
  end if;
  insert into private.queue_turn_changes (txid, queue, exact, person, d, f)
  select txid_current(), p_queue, coalesce(k.exact, false), k.person, coalesce(k.d, 0), coalesce(k.f, 0)
    from unnest(p_exact, p_person, p_delta, p_failed) as k (exact, person, d, f);
  insert into private.queue_turn_commits (txid) values (txid_current()) on conflict (txid) do nothing;
end;
$$;

revoke all on function private.queue_turns_changed(text, boolean[], text[], integer[], integer[]) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The removal queue (storage_file_trash).

-- Brings the touched turns of the removal queue up to date, given each
-- touched (kind, person) in order and its count's change: storage_file_trash_turns_sync's
-- second half as 20261025620000 made it, moved here and run at commit, the
-- turns made or taken in one ordered pass.
create or replace function private.storage_file_trash_turns_apply(v_exact boolean[], v_person text[], v_delta integer[])
returns void
language plpgsql
set search_path = public, pg_temp
set plan_cache_mode = force_custom_plan
as $$
begin
  -- Every turn touched, made if new and held, in one pass, in one order: a
  -- turn already there is taken as an update takes it. (The trigger made
  -- them, then locked them, then made again any another statement had
  -- emptied in between: moved here as it was, a turn emptied and made again
  -- between the two passes was taken out of order under this round's bench,
  -- and two commits waited for each other.)
  insert into public.storage_file_trash_turns as s (exact, person)
  select k.exact, k.person from unnest(v_exact, v_person) as k (exact, person) order by k.exact, k.person
  on conflict (exact, person) do update set waiting = s.waiting;

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
end;
$$;

revoke all on function private.storage_file_trash_turns_apply(boolean[], text[], integer[]) from public, anon, authenticated, service_role;

-- Notes each touched person's turn for the transaction's commit: their notes
-- counted in and out (the first note's due time and their last run are read
-- again there, private.storage_file_trash_turns_apply). Taking the turns at
-- commit, every transaction takes them in one order, all at once (the
-- thirteenth security review: taken here, statement by statement, a deleted
-- job's applications took them in no order, and a deadlock with the pick
-- left an application's files out of the queue). Runs with its own rights
-- (the queue's writers are the server, its own triggers and
-- remove-applicant), each statement planned for the people it was given (a
-- plan made for "some" people read every turn).
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
begin
  if tg_op = 'TRUNCATE' then
    delete from public.storage_file_trash_turns;
    -- …and what this transaction had noted for them: the queue is empty now.
    delete from private.queue_turn_changes where txid = txid_current() and queue = 'removal';
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

  -- For the transaction's commit, where every turn it touched is brought up
  -- to date at once, in one order (public.queue_turns_apply).
  perform private.queue_turns_changed('removal', v_exact, v_person, v_delta, null);
  return null;
end;
$$;

revoke all on function public.storage_file_trash_turns_sync() from public, anon, authenticated;

-- Notes each person whose record (storage_file_trash_served) was written,
-- whoever writes it (the pick itself, the daily prune, a statement of the
-- server's), for the transaction's commit, where their turn copies it with
-- the rest (private.storage_file_trash_turns_apply). The pick's own record is
-- an INSERT ... ON CONFLICT DO UPDATE, which fires this twice, the people it
-- took for the first time and the rest: locked here, each in order but one
-- after the other, they were the pick's half of the review's deadlock.
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
  perform private.queue_turns_changed('removal', v_exact, v_person, null, null);
  return null;
end;
$$;

revoke all on function public.storage_file_trash_served_sync() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The files of deleted requests (document_file_trash).

-- Brings the touched turns of the deleted requests' queue up to date, given
-- each touched business in order, its count's change and its failed notes':
-- document_file_trash_turns_sync's second half as 20261025630000 made it,
-- moved here and run at commit, the turns made or taken in one ordered pass.
create or replace function private.document_file_trash_turns_apply(v_person text[], v_delta integer[], v_failed integer[])
returns void
language plpgsql
set search_path = public, pg_temp
set plan_cache_mode = force_custom_plan
as $$
begin
  -- Every turn touched, made if new and held, in one pass, in one order.
  insert into public.document_file_trash_turns as s (person)
  select k.person from unnest(v_person) as k (person) order by k.person
  on conflict (person) do update set waiting = s.waiting;

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
end;
$$;

revoke all on function private.document_file_trash_turns_apply(text[], integer[], integer[]) from public, anon, authenticated, service_role;

-- Notes each touched business's turn for the transaction's commit: its notes
-- counted in and out (and those that failed); its first note and its last
-- run are read again there (private.document_file_trash_turns_apply), with
-- every other turn the transaction touched, in one order.
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
begin
  if tg_op = 'TRUNCATE' then
    delete from public.document_file_trash_turns;
    delete from private.queue_turn_changes where txid = txid_current() and queue = 'deleted';
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

  perform private.queue_turns_changed('deleted', null, v_person, v_delta, v_failed);
  return null;
end;
$$;

revoke all on function public.document_file_trash_turns_sync() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The ID papers still open that are due (document_requests).

-- Brings the touched turns of the due ID papers up to date, given each
-- touched business in order and its count's change:
-- document_requests_due_turns_sync's second half as 20261025630000 made it,
-- moved here and run at commit, the turns made or taken in one ordered pass.
create or replace function private.document_requests_due_turns_apply(v_person text[], v_delta integer[])
returns void
language plpgsql
set search_path = public, pg_temp
set plan_cache_mode = force_custom_plan
as $$
begin
  -- Every turn touched, made if new and held, in one pass, in one order.
  insert into public.document_requests_due_turns as s (person)
  select k.person from unnest(v_person) as k (person) order by k.person
  on conflict (person) do update set on_file = s.on_file;

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
end;
$$;

revoke all on function private.document_requests_due_turns_apply(text[], integer[]) from public, anon, authenticated, service_role;

-- Notes each touched business's turn for the transaction's commit: its ID
-- papers with a file counted in and out; when the first is due and its last
-- run are read again there (private.document_requests_due_turns_apply). A
-- change to a request that is no ID paper with a file, before or after,
-- touches nothing.
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
begin
  if tg_op = 'TRUNCATE' then
    delete from public.document_requests_due_turns;
    delete from private.queue_turn_changes where txid = txid_current() and queue = 'due';
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

  perform private.queue_turns_changed('due', null, v_person, v_delta, null);
  return null;
end;
$$;

revoke all on function public.document_requests_due_turns_sync() from public, anon, authenticated;

-- Notes each business whose record (document_cleanup_served) was written,
-- whoever writes it (the picks, the daily prune, the server), for the
-- transaction's commit, where its turn in that queue copies it with the rest.
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
  perform private.queue_turns_changed('deleted', null, (select array_agg(k.person order by k.person) from unnest(v_queue, v_person) as k (queue, person) where k.queue = 'deleted'), null, null);
  perform private.queue_turns_changed('due', null, (select array_agg(k.person order by k.person) from unnest(v_queue, v_person) as k (queue, person) where k.queue = 'due'), null, null);
  return null;
end;
$$;

revoke all on function public.document_cleanup_served_sync() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- At commit: every turn the transaction touched, brought up to date at once,
-- in one order (the removal queue's by kind of note and person, then the
-- deleted requests' by business, then the due papers' by business), so no
-- two transactions ever wait for each other's turns in a circle. Runs once a
-- transaction, with its own rights; its notes go when it is done.
create or replace function public.queue_turns_apply()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exact boolean[];
  v_person text[];
  v_delta integer[];
  v_failed integer[];
begin
  delete from private.queue_turn_commits where txid = new.txid;
  select array_agg(c.exact order by c.exact, c.person), array_agg(c.person order by c.exact, c.person), array_agg(c.d order by c.exact, c.person)
    into v_exact, v_person, v_delta
    from (select x.exact, x.person, sum(x.d)::int as d
            from private.queue_turn_changes x
           where x.txid = new.txid and x.queue = 'removal'
           group by 1, 2) c;
  if v_exact is not null then
    perform private.storage_file_trash_turns_apply(v_exact, v_person, v_delta);
  end if;
  select array_agg(c.person order by c.person), array_agg(c.d order by c.person), array_agg(c.f order by c.person)
    into v_person, v_delta, v_failed
    from (select x.person, sum(x.d)::int as d, sum(x.f)::int as f
            from private.queue_turn_changes x
           where x.txid = new.txid and x.queue = 'deleted'
           group by 1) c;
  if v_person is not null then
    perform private.document_file_trash_turns_apply(v_person, v_delta, v_failed);
  end if;
  select array_agg(c.person order by c.person), array_agg(c.d order by c.person)
    into v_person, v_delta
    from (select x.person, sum(x.d)::int as d
            from private.queue_turn_changes x
           where x.txid = new.txid and x.queue = 'due'
           group by 1) c;
  if v_person is not null then
    perform private.document_requests_due_turns_apply(v_person, v_delta);
  end if;
  delete from private.queue_turn_changes where txid = new.txid;
  return null;
end;
$$;

revoke all on function public.queue_turns_apply() from public, anon, authenticated;

drop trigger if exists queue_turn_commits_apply on private.queue_turn_commits;
create constraint trigger queue_turn_commits_apply
  after insert on private.queue_turn_commits
  deferrable initially deferred
  for each row execute function public.queue_turns_apply();

-- ---------------------------------------------------------------------------
-- The queueing triggers: a deadlock, a serialization failure or a lock
-- timeout fails the delete (it is tried again with nothing lost), never a
-- quiet "not queued".

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
    -- A deadlock, a serialization failure or a lock timeout fails the
    -- delete, which is tried again with nothing lost (the thirteenth security
    -- review: caught here, a deadlock let the delete go with these folders
    -- never queued, and the files stayed for good). Anything else is logged
    -- and the delete still goes.
    when deadlock_detected or serialization_failure or lock_not_available then
      raise;
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
    -- The same: never a quiet "not queued" for a deadlock, a serialization
    -- failure or a lock timeout (the rate-limit counter above is a row that
    -- two removals of one applicant's applications both update).
    when deadlock_detected or serialization_failure or lock_not_available then
      raise;
    when others then
      raise log 'applications_queue_voice_recordings: form files of % not queued: %', old.id, sqlerrm;
  end;
  return old;
end;
$$;

revoke all on function public.applications_queue_voice_recordings() from public, anon, authenticated;

create or replace function public.documents_queue_files()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    if old.id is not null
       and coalesce(private.storage_holds('documents', 'documents/' || old.id::text || '/'), true) then
      insert into public.storage_file_trash (bucket, folder, starts_with, application_id, candidate_id)
      values ('documents', 'documents/' || old.id::text, '', old.application_id, old.recipient_id);
    end if;
  exception
    -- A deadlock, a serialization failure or a lock timeout fails the
    -- delete, which is tried again with nothing lost (the thirteenth security
    -- review); anything else is logged and the delete still goes.
    when deadlock_detected or serialization_failure or lock_not_available then
      raise;
    when others then
      raise log 'documents_queue_files: the files of document % not queued: %', old.id, sqlerrm;
  end;
  return old;
end;
$$;

revoke all on function public.documents_queue_files() from public, anon, authenticated;
