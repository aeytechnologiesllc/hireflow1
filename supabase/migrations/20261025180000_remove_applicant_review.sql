-- Removing an applicant, after the Phase 5 review (2026-10-25;
-- docs/LAUNCH-PLAN.md, Phase 5, task 3; first version 20261025170000).
--
-- 1. A team member may remove only an applicant to a job they are assigned
--    to (an empty assignment list means every job), the same rule as every
--    other pipeline action (is_active_team_member_for_job). Before, any
--    teammate who manages applicants could remove one from any of the
--    business's jobs.
-- 2. The answer names the application's documents by id only, never by
--    their stored file address: a business writes that address itself, and
--    remove-applicant once deleted whatever it named, another business's
--    signed copy included. The function now deletes only the copies kept
--    for that document (documents/<document id>/ in the documents bucket).
-- 3. The hiring team's own notifications about the applicant (a link to
--    /applicants/<application id>) go with the application. The applicant's
--    own notifications are part of their account and stay.
-- 4. A file that storage would not delete just now is queued in
--    public.storage_file_trash (exact path, or a folder and a name prefix
--    when the folder could not be listed). document-cleanup, which runs every
--    hour, retries the queue. Before, a failure was only logged, and with the
--    application gone nothing could find the file again.

create table if not exists public.storage_file_trash (
  id uuid primary key default gen_random_uuid(),
  bucket text not null check (bucket in ('videos', 'portfolios', 'resumes', 'voice-interview-recordings', 'documents')),
  path text,
  folder text,
  starts_with text,
  application_id uuid,
  attempts integer not null default 0,
  queued_at timestamptz not null default now(),
  last_tried_at timestamptz,
  constraint storage_file_trash_one_target check ((path is null) <> (folder is null)),
  constraint storage_file_trash_plain_path check (
    coalesce(path, folder) !~ '(^/|\.\.|//)' and length(coalesce(path, folder)) between 3 and 500
    and (starts_with is null or (starts_with !~ '(/|\.\.)' and length(starts_with) <= 200))
  )
);

alter table public.storage_file_trash enable row level security;
revoke all on table public.storage_file_trash from public, anon, authenticated;

create or replace function public.remove_applicant(p_application uuid, p_actor uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_app record;
  v_documents jsonb;
  v_other_refs text;
begin
  if p_application is null or p_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select a.id, a.candidate_id, a.resume_url, a.notes, j.id as job_id, j.employer_id
    into v_app
    from public.applications a
    join public.jobs j on j.id = a.job_id
   where a.id = p_application
     for update of a;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if not (
    p_actor = v_app.employer_id
    or exists (
      select 1 from public.team_members tm
       where tm.user_id = p_actor
         and tm.employer_id = v_app.employer_id
         and tm.status = 'active'
         and tm.can_manage_pipeline is true
         and (array_length(tm.assigned_job_ids, 1) is null or v_app.job_id = any (tm.assigned_job_ids))
    )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', d.id)), '[]'::jsonb)
    into v_documents
    from public.documents d
   where d.application_id = p_application;

  -- What the same person still uses elsewhere: their profile's resume and
  -- portfolio, and their OTHER applications. A file used by any of them is
  -- theirs to keep.
  select coalesce(string_agg(coalesce(o.resume_url, '') || ' ' || coalesce(o.notes, ''), ' '), '')
         || ' ' || coalesce((select coalesce(p.resume_url, '') || ' ' || coalesce(p.portfolio_url, '') from public.profiles p where p.user_id = v_app.candidate_id), '')
    into v_other_refs
    from public.applications o
   where o.candidate_id = v_app.candidate_id
     and o.id <> p_application;

  insert into private.applicant_removals (application_id, job_id, employer_id, candidate_id, removed_by, reason)
  values (p_application, v_app.job_id, v_app.employer_id, v_app.candidate_id, p_actor, left(nullif(trim(p_reason), ''), 500));

  -- The hiring team's notifications about this applicant (owner and team).
  delete from public.notifications n
   where (n.link = '/applicants/' || p_application::text or n.link like '/applicants/' || p_application::text || '?%')
     and (
       n.user_id = v_app.employer_id
       or n.user_id in (select tm.user_id from public.team_members tm where tm.employer_id = v_app.employer_id)
     );

  delete from public.applications where id = p_application;

  return jsonb_build_object(
    'ok', true,
    'application_id', p_application,
    'candidate_id', v_app.candidate_id,
    'documents', v_documents,
    'resume_url', v_app.resume_url,
    'notes', v_app.notes,
    'other_refs', coalesce(v_other_refs, '')
  );
end;
$$;

revoke all on function public.remove_applicant(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.remove_applicant(uuid, uuid, text) to service_role;
