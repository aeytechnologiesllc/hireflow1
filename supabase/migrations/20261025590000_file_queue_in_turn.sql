-- A short burst by many throwaway accounts no longer holds up every later
-- removal for weeks (the tenth security review, 2026-10-26, finding 1; a
-- regression of 20261025580000).
--
-- 20261025580000 ranked each person's first note by when it was queued. An
-- account with many notes queued before a real withdrawal's then kept a place
-- ahead of it in every run: after each run its next note became its first,
-- and that note was older too. The review's proof: 200 accounts, each
-- starting and withdrawing 10 applications an hour on the one live job (30
-- folders an hour each), for one hour, then nothing. Every later withdrawal,
-- Delete Account or deleted job waited 31 runs for its first folder, 91 after
-- a three-hour burst (30 runs for every hour of burst), with no upkeep by the
-- accounts after it. And a real note that failed once (a storage hiccup) sat
-- behind every note never tried, so while a flood went on it was never tried
-- again.
-- Now:
-- 1. People take turns. Each run records whom it took
--    (public.storage_file_trash_served, one row for each person and kind of
--    note, written by the pick itself in the same statement, so a turn is
--    recorded exactly when notes are handed out), and a person's first note
--    is ranked by when that person was last served or when the note became
--    due, whichever is later (start-time fair queueing, the review's
--    suggested order). An account served in the last run goes behind
--    everyone who has waited since; a real removal waits about one run for
--    every 200 people (1,000 for exact paths) with notes ahead of it, however
--    many notes they hold. The review's table: after a one-hour, a three-hour
--    or a continuing burst, a real withdrawal's first folder goes in the
--    second run and all three by the fourth; the ninth review's 200 accounts
--    an hour (the same ones or fresh ones every hour), its thousand failing
--    notes and section 14's seventy accounts are as before.
-- 2. A note that failed waits behind every note that is due for an hour a try
--    (up to a day) and half an hour more, so it sits out at least the next run
--    whatever the scheduler's timing; then it takes its turn as a note queued
--    at that time would. Notes that keep failing still never hold up new ones
--    (a thousand accounts' failing notes, then a real withdrawal: both its
--    files within two runs), and a real note that failed once is tried again
--    within a few runs while a flood goes on.
-- 3. A person's record goes a day after their last turn, once they hold
--    nothing in that queue (public.prune_storage_file_trash_served, run daily
--    by pg_cron, as prune_rate_limits is hourly). Dropping it while they still
--    hold a note would rank them by that note's age again, ahead of people who
--    have waited since.
-- The caps are unchanged: 6 folders and 40 exact paths from one person, 200
-- folders and 1,000 exact paths a run. A run that fails after the pick has
-- still given its people their turn: they wait one more round, never for good.
--
-- Each function is its latest repo body with only this change:
--   storage_file_trash_fair_pick   from 20261025580000_file_queue_many_accounts.sql
--                                  (VOLATILE now, since it records whom it took;
--                                  the caps and the per-person numbering unchanged)
-- New: public.storage_file_trash_served and public.prune_storage_file_trash_served().
-- document-cleanup calls the pick as before; only its backlog alert's words
-- change (supabase/functions/document-cleanup).

-- Whom each run took, and when: a person's turn in the removal queue.
-- Folders and exact paths are two queues read by two calls, so each has its
-- own turn (exact). Only the server reads or writes it.
create table if not exists public.storage_file_trash_served (
  exact boolean not null,
  person text not null,
  served_at timestamptz not null default now(),
  primary key (exact, person)
);

comment on table public.storage_file_trash_served is
  'When document-cleanup''s fair pick last took notes of each person (storage_file_trash_fair_pick, the tenth security review): a person''s next turn comes after everyone who has waited since. Service role only; pruned daily.';

alter table public.storage_file_trash_served enable row level security;
revoke all on table public.storage_file_trash_served from public, anon, authenticated;
grant select, insert, update, delete on table public.storage_file_trash_served to service_role;

-- One run's notes for document-cleanup: the folders (p_exact false, up to 200,
-- 6 from one person) or the exact paths (p_exact true, up to 1,000, 40 from
-- one person). A note that failed waits behind every note that is due for an
-- hour a try, up to a day, and half an hour more (the ninth security review:
-- a note that failed every hour sat at the front of every run; the tenth:
-- behind every note never tried, a real one that failed once was never tried
-- again while a flood went on). Then each person's least-tried, oldest note,
-- people in turn: by when they were last served or the note became due,
-- whichever is later (the tenth security review: by the note's age alone, 200
-- accounts' burst queued before a real withdrawal kept a place ahead of it in
-- every run, 30 runs for every hour of burst; by the fewest waiting, the
-- ninth's 200 accounts with one note each kept it out of every run); then
-- everyone's next notes, the people with the fewest notes waiting first (in
-- turn among people with as many), so an account that queued thousands is
-- served after everyone else. The run records whom it took
-- (storage_file_trash_served). Two calls rather than one, so neither answer
-- passes the API's 1,000-row ceiling. Runs with the caller's rights, and only
-- the server may call it.
create or replace function public.storage_file_trash_fair_pick(p_exact boolean)
returns setof public.storage_file_trash
language sql
volatile
set search_path = public, pg_temp
as $$
  with mine as (
    select t.id, t.attempts, t.queued_at, t.last_tried_at,
           coalesce(t.candidate_id::text, t.application_id::text, t.bucket || ':' || coalesce(t.path, t.folder)) as person
      from public.storage_file_trash t
     where (t.path is not null) = coalesce(p_exact, false)
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
      left join public.storage_file_trash_served s on s.exact = coalesce(p_exact, false) and s.person = r.person
     where r.nth <= case when coalesce(p_exact, false) then 40 else 6 end
  ), picked as materialized (
    select p.id, p.person, p.place
      from placed p
     where p.place <= case when coalesce(p_exact, false) then 1000 else 200 end
  ), served as (
    insert into public.storage_file_trash_served (exact, person, served_at)
    select distinct coalesce(p_exact, false), p.person, now()
      from picked p
    on conflict (exact, person) do update set served_at = excluded.served_at
  )
  select t.*
    from picked p
    join public.storage_file_trash t on t.id = p.id
   order by p.place
$$;

revoke all on function public.storage_file_trash_fair_pick(boolean) from public, anon, authenticated;
grant execute on function public.storage_file_trash_fair_pick(boolean) to service_role;

-- A person's turn is kept while they hold a note in that queue, and a day
-- after; then it goes. Run daily by pg_cron; only the server may call it.
create or replace function public.prune_storage_file_trash_served()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.storage_file_trash_served s
   where s.served_at < now() - interval '1 day'
     and not exists (
       select 1
         from public.storage_file_trash t
        where (t.path is not null) = s.exact
          and coalesce(t.candidate_id::text, t.application_id::text, t.bucket || ':' || coalesce(t.path, t.folder)) = s.person
     );
$$;

revoke all on function public.prune_storage_file_trash_served() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'prune-storage-file-trash-served') then
      perform cron.unschedule('prune-storage-file-trash-served');
    end if;
    perform cron.schedule('prune-storage-file-trash-served', '53 4 * * *', 'select public.prune_storage_file_trash_served()');
  end if;
end $$;

-- The API runs a STABLE function in a read-only transaction: it must see the
-- pick as VOLATILE before document-cleanup's next run, or that run's pick
-- fails (and the admins are told). Supabase reloads the API's schema after
-- DDL; this asks for it as well.
notify pgrst, 'reload schema';
