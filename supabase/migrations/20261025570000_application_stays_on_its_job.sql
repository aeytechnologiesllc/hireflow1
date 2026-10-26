-- An application stays on the job it was sent to, and a deleted document
-- takes its kept copies with it (the eighth security review, 2026-10-25,
-- finding 2).
--
-- 1. 20261025550000 left a business only "Delete their information" to
--    delete one application, but there was another door: move it to a
--    throwaway job of its own (update applications set job_id = …, allowed
--    because protect_application_columns and
--    protect_application_staff_columns return early for the job's owner and
--    a teammate who manages applicants, and the two UPDATE policies have no
--    WITH CHECK), then delete that job. The application went by cascade with
--    no row in private.applicant_removals, and with it an applicant's
--    document already signed by them, which they could not have withdrawn.
--    No screen ever changes an application's job, and no server code does
--    either; now nobody but the server (service_role, or the database's own
--    session with no request behind it) can (application_job_fixed). A
--    business that deletes a whole job still deletes its applications, by
--    design.
-- 2. A deleted document's kept copies (documents/<id>/: the original the
--    applicant signed, the signed PDF) stayed in storage with nothing
--    pointing at them whenever the row went some other way than
--    remove-applicant: a deleted job, a deleted business account, an
--    application's cascade. documents_queue_files queues that folder for
--    document-cleanup on every delete, where storage holds a file there (or
--    cannot say), with its own rights, and it never fails the delete.
--
-- New: public.applications_stay_on_their_job and its trigger,
-- public.documents_queue_files and its trigger. No existing function is
-- redefined.

create or replace function public.applications_stay_on_their_job()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.job_id is distinct from old.job_id
     and coalesce(auth.role(), '') <> 'service_role'
     and (coalesce(auth.role(), '') <> '' or current_user in ('anon', 'authenticated')) then
    raise exception 'application_job_fixed'
      using errcode = 'check_violation',
            detail = 'An application stays on the job it was sent to.';
  end if;
  return new;
end;
$$;

revoke all on function public.applications_stay_on_their_job() from public, anon, authenticated;

drop trigger if exists applications_stay_on_their_job on public.applications;
create trigger applications_stay_on_their_job
  before update on public.applications
  for each row execute function public.applications_stay_on_their_job();

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
    when others then
      raise log 'documents_queue_files: the files of document % not queued: %', old.id, sqlerrm;
  end;
  return old;
end;
$$;

revoke all on function public.documents_queue_files() from public, anon, authenticated;

drop trigger if exists documents_queue_files on public.documents;
create trigger documents_queue_files
  after delete on public.documents
  for each row execute function public.documents_queue_files();
