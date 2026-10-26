-- A real withdrawal's files go together in its turn, so a stream of new
-- throwaway accounts no longer makes each of its later files wait longer than
-- the one before (the eleventh security review, 2026-10-26, finding 1; a
-- regression of 20261025590000).
--
-- The body below is storage_file_trash_fair_pick from
-- 20261025590000_file_queue_in_turn.sql with only this change.
--
-- 20261025590000 took one note from each person a turn and ranked a person's
-- next turn by when the last one was. A person new to the queue is ranked by
-- when their note was queued. So once a real withdrawal's first folder was
-- taken, its other two waited behind every account that had queued anything
-- since, and while new accounts joined faster than a run took them, each wait
-- was longer than the one before. The review's proof: 200 new accounts an
-- hour, each starting and withdrawing 10 applications an hour on the one live
-- job (30 folders), from an hour before a real withdrawal: its folders went in
-- the 2nd, 5th and 11th runs (the 4th, 11th and 25th after three hours of it,
-- the 7th, 20th and 46th after six); 1,000 new accounts an hour with one
-- folder each, from the withdrawal on: the 1st, 6th and 31st.
-- Now a person's turn is their first note, or all of their notes when they
-- hold no more than one withdrawal's worth (3 folders, 6 exact paths), and a
-- turn is taken whole or not at all: when a run's 200 folders (1,000 exact
-- paths) would end inside one, it waits for the next run, where nobody who
-- waited less comes before it. Anyone holding more still gives one note a
-- turn, so an account that queues many gets no more than before. The order is
-- otherwise as it was (the review's suggested order, pick_sm, with
-- 20261025590000's "the fewest waiting first" kept before the person among
-- people whose turn comes at the same time). The review's floods, and the
-- tenth's, now finish a real withdrawal in one run: the first above in the
-- 2nd (the 4th and 7th after three and six hours of it, the runs its first
-- folder went in before), the second in the 1st; 1,000 accounts with 6
-- folders each queued before it, in the 6th (was the 6th, 11th and 16th). Where more withdrawals were queued before it
-- than a run takes, it waits for them: 1,000 new accounts an hour, one
-- withdrawal each (3 folders), from an hour before it: all three in the 15th
-- run, where its first went in the 6th and its third after the 80th.
-- A person holding more than a withdrawal's worth (a Delete Account with two
-- applications or more) still gives one note a turn until they are down to
-- one, and each of those turns waits behind the people who joined since.
-- The caps are unchanged (6 folders and 40 exact paths from one person, 200
-- folders and 1,000 exact paths a run; a run now takes up to 2 folders or 5
-- exact paths fewer when the next turn would not fit), and so are the
-- back-off, the record and its prune.
--
-- Each function is its latest repo body with only this change:
--   storage_file_trash_fair_pick   from 20261025590000_file_queue_in_turn.sql
-- document-cleanup calls the pick as before; only its backlog alert's words
-- change (supabase/functions/document-cleanup).

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
-- account that joined the queue since, longer each time), taken whole or not
-- at all; people in turn, by when they were last served or their first note
-- became due, whichever is later (the tenth security review: by the note's
-- age, 200 accounts' burst queued before a real withdrawal kept a place ahead
-- of it in every run, 30 runs for every hour of burst; by the fewest waiting,
-- the ninth's 200 accounts with one note each kept it out of every run), the
-- fewest waiting first among people whose turn comes at the same time; then
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
  ), turned as (
    select r.id, r.attempts, r.queued_at, r.person, r.due_at, r.nth, r.waiting,
           r.due_at > now() as held,
           (r.nth = 1 or r.waiting <= case when coalesce(p_exact, false) then 6 else 3 end) as in_turn,
           first_value(r.due_at) over (partition by r.person order by r.nth) as first_due
      from ranked r
  ), placed as (
    select r.id, r.person, r.held, r.in_turn,
           row_number() over (order by r.held, not r.in_turn, case when r.in_turn then greatest(s.served_at, r.first_due) end, r.waiting, case when r.in_turn then r.person end, r.nth, r.attempts, r.queued_at, r.id) as place
      from turned r
      left join public.storage_file_trash_served s on s.exact = coalesce(p_exact, false) and s.person = r.person
     where r.nth <= case when coalesce(p_exact, false) then 40 else 6 end
  ), whole as (
    select p.id, p.person, p.place,
           case when p.in_turn then max(p.place) over (partition by p.person, p.held, p.in_turn) else p.place end as turn_ends
      from placed p
  ), picked as materialized (
    select w.id, w.person, w.place
      from whole w
     where w.turn_ends <= case when coalesce(p_exact, false) then 1000 else 200 end
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
