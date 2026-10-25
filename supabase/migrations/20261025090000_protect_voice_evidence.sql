-- An applicant cannot forge voice-interview evidence (2026-10-25;
-- docs/LAUNCH-PLAN.md, Phase 1, found by the Pass C review).
--
-- The hiring team's read of an applicant shows "N-minute voice interview", a
-- quote "From the voice interview" and a "Hear it" link
-- (src/cockpit/components/AvasRead.tsx), from voice_interview_transcript and
-- voice_interview_recording_url. protect_application_columns locks the
-- transcript only once voice_interview_result is set, which never happens on
-- a job without the voice step, and neither trigger guarded the recording
-- link. An applicant could write a made-up transcript and a link to any
-- recording, and the team would read them as the real interview.
--
-- protect_application_staff_columns (20261025030000) gains:
--   - voice_interview_transcript: no applicant write at all. The server
--     writes it (ava-voice-tools), and submit_voice_interview_manual_end's
--     own flag is still exempt, as before.
--   - voice_interview_recording_url: an applicant may set it only to a signed
--     link into the voice-interview-recordings bucket, under their own
--     application's folder: exactly what the recorder writes after uploading
--     their own recording (src/hooks/useVideoInterviewRecorder.ts,
--     `${applicationId}/interview-<time>.<ext>`). Anything else is refused.

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
         '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/sign/voice-interview-recordings/'
         || old.id::text || '/interview-[0-9]+\.[a-z0-9]+\?token=[A-Za-z0-9._-]+$'
       )
     ) then
    raise exception 'Candidates can only attach their own recording';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_application_staff_columns() from public, anon, authenticated;
