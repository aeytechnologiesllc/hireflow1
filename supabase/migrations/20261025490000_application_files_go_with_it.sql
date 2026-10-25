-- A deleted application's own files go with it (the tenth Phase 5 review,
-- 2026-10-25). 20261025460000 queued only its spoken-interview recordings, and
-- only when the row already named one: a withdrawal ("removes your
-- application for good") left the video introduction and the work samples,
-- kept under the applicant's folder by the application's id
-- (videos/<applicant>/<application>-…, portfolios/<applicant>/<application>-…,
-- the same names remove-applicant deletes), and a recording uploaded before
-- its link was saved was never queued. Every deleted application now queues
-- all three; document-cleanup empties each and drops the note once storage
-- holds nothing there.

create or replace function public.applications_queue_voice_recordings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    insert into public.storage_file_trash (bucket, folder, starts_with, application_id) values
      ('voice-interview-recordings', old.id::text, '', old.id),
      ('videos', old.candidate_id::text, old.id::text || '-', old.id),
      ('portfolios', old.candidate_id::text, old.id::text || '-', old.id);
  exception
    when others then
      raise log 'applications_queue_voice_recordings: % not queued: %', old.id, sqlerrm;
  end;
  return old;
end;
$$;

revoke all on function public.applications_queue_voice_recordings() from public, anon, authenticated;
