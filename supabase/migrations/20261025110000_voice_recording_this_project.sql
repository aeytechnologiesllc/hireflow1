-- The voice-interview recording link must point into THIS project's storage
-- (2026-10-25; docs/LAUNCH-PLAN.md, Phase 1, found by the second Pass C review).
--
-- 20261025090000_protect_voice_evidence.sql let an applicant set
-- voice_interview_recording_url only to a signed link into a
-- voice-interview-recordings bucket under their own application's folder,
-- but it matched any "<anything>.supabase.co" host. An applicant could make
-- a Supabase project of their own with a bucket of that name, upload any
-- audio under their application's id, and save that link; the hiring team's
-- "Hear it" would play it as the real interview. The host is now this
-- project's own (yqklrkpptnhubsnijqze, the address the site's client uses:
-- src/integrations/supabase/client.ts). Everything else is unchanged.

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
  if new.voice_interview_transcript is distinct from old.voice_interview_transcript then
    raise exception 'Candidates cannot change voice_interview_transcript';
  end if;
  if new.voice_interview_recording_url is distinct from old.voice_interview_recording_url
     and (
       new.voice_interview_recording_url is null
       or new.voice_interview_recording_url !~ (
         '^https://yqklrkpptnhubsnijqze\.supabase\.co/storage/v1/object/sign/voice-interview-recordings/'
         || old.id::text || '/interview-[0-9]+\.[a-z0-9]+\?token=[A-Za-z0-9._-]+$'
       )
     ) then
    raise exception 'Candidates can only attach their own recording';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_application_staff_columns() from public, anon, authenticated;
