-- A spoken-interview recording goes with its application (the ninth Phase 5
-- review, 2026-10-25). The files are kept under the application's id
-- (voice-interview-recordings/<id>/), not the applicant's, so Delete Account
-- and a withdrawal left them for ever, though the Privacy Policy says the
-- files go with the account. Deleting an application now queues its
-- recordings in storage_file_trash, which document-cleanup deletes within the
-- hour (a row deleted by a cascade, as Delete Account does, fires this too).
create or replace function public.applications_queue_voice_recordings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.voice_interview_recording_url is not null or old.voice_interview_result is not null then
    begin
      insert into public.storage_file_trash (bucket, folder, starts_with, application_id)
      values ('voice-interview-recordings', old.id::text, '', old.id);
    exception
      when others then
        raise log 'applications_queue_voice_recordings: % not queued: %', old.id, sqlerrm;
    end;
  end if;
  return old;
end;
$$;

revoke all on function public.applications_queue_voice_recordings() from public, anon, authenticated;

drop trigger if exists applications_queue_voice_recordings on public.applications;
create trigger applications_queue_voice_recordings
  after delete on public.applications
  for each row execute function public.applications_queue_voice_recordings();
