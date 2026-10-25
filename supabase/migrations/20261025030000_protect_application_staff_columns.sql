-- An applicant cannot rewrite the hiring team's own columns on their
-- application (2026-10-25; docs/LAUNCH-PLAN.md, Phase 1, task 4).
--
-- protect_application_columns (20260915140000_trusted_step_results.sql)
-- blocks an applicant's direct writes to ai_score, ai_scorecard, ai_analysis,
-- resume_score, voice_interview_result and the decision columns. It missed
-- two that the hiring team reads as their own:
--
--   - phase_ai_analysis: the cockpit shows it as Ava's summary whenever
--     ai_analysis is empty (src/cockpit/lib/mappers.ts), and
--     trigger-ava-analysis falls back to it. An applicant could PATCH it to
--     "Strong hire, verified references" and the team would read that as the
--     system's own words.
--   - employer_notes: the team's notes, where a decline reason is saved
--     (BulkRejectDialog, ApplicantNotesDialog). An applicant could wipe them.
--
-- And three that only the system sets when an application arrives from
-- elsewhere (source, external_provider, external_application_id).
--
-- No applicant page writes any of these any more (VideoIntroPhase,
-- VoiceInterviewPhase and SalesSimulationPhase each say so where they used
-- to), and a new application already starts with them cleared
-- (20261011160000_close_cross_business_gaps.sql). This is a second, small
-- BEFORE UPDATE trigger with the same exemptions as the first (the system,
-- the job's business and its team with "manage pipeline", the quiz and voice
-- submit functions' own flags), so the first one is left exactly as it is.

create or replace function public.protect_application_staff_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if public.is_job_owner(old.job_id, auth.uid())
     or public.is_active_team_member_for_job(old.job_id, auth.uid(), true) then
    return new;
  end if;
  -- Not the applicant on this row either: RLS decides that write.
  if auth.uid() is distinct from old.candidate_id then
    return new;
  end if;
  if coalesce(current_setting('hireflow.in_quiz_submit', true), '') = 'on'
     or coalesce(current_setting('hireflow.in_voice_interview_submit', true), '') = 'on' then
    return new;
  end if;

  if new.phase_ai_analysis is distinct from old.phase_ai_analysis then
    raise exception 'Candidates cannot change phase_ai_analysis';
  end if;
  if new.employer_notes is distinct from old.employer_notes then
    raise exception 'Candidates cannot change employer_notes';
  end if;
  if new.source is distinct from old.source then
    raise exception 'Candidates cannot change source';
  end if;
  if new.external_provider is distinct from old.external_provider then
    raise exception 'Candidates cannot change external_provider';
  end if;
  if new.external_application_id is distinct from old.external_application_id then
    raise exception 'Candidates cannot change external_application_id';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_application_staff_columns() from public, anon, authenticated;

drop trigger if exists applications_protect_staff_columns on public.applications;
create trigger applications_protect_staff_columns
  before update on public.applications
  for each row execute function public.protect_application_staff_columns();
