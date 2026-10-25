-- A business can remove an applicant's information from its account
-- (2026-10-25; docs/LAUNCH-PLAN.md, Phase 5, task 3). The Terms ask every
-- business to "act on a request to delete" an applicant's information; until
-- now there was no way to.
--
-- public.remove_applicant(p_application, p_actor, p_reason), called only by
-- the remove-applicant edge function (service role), which has checked who
-- p_actor is from their sign-in:
--   - p_actor must be the job's business owner, or an active team member of
--     that business who may manage applicants (can_manage_pipeline);
--   - the removal is logged in private.applicant_removals (who, when, why;
--     not what was removed);
--   - the application row is deleted, and with it, by the existing cascades,
--     its interviews, documents and document requests (whose files the
--     document_requests_trash_file trigger queues for deletion), test
--     sessions and their events, notes, ratings, views, guides, shortlist
--     entries and typing starts. Messages stay: they are the applicant's
--     conversation too, and lose only their link to the application. Signing
--     audit logs stay (they cannot be deleted, by design) without their
--     document;
--   - it answers with what the edge function must delete from storage: the
--     application's documents' files, and the resume and form files no other
--     application of the same person still uses.
-- The applicant's own account is untouched.

create table if not exists private.applicant_removals (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  job_id uuid,
  employer_id uuid,
  candidate_id uuid,
  removed_by uuid not null,
  reason text,
  removed_at timestamptz not null default now()
);

revoke all on table private.applicant_removals from public, anon, authenticated;

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
    )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'file', d.file_url)), '[]'::jsonb)
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
