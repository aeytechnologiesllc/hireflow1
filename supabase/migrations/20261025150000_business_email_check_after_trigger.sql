-- The business email check, sixth review round (2026-10-25; docs/LAUNCH-PLAN.md,
-- Phase 2, task 4; found by the sixth Pass C review).
--
-- The publish check ran BEFORE INSERT OR UPDATE OF status. Postgres does not
-- fire a column trigger when ANOTHER trigger changes that column, so a later
-- BEFORE UPDATE trigger that set status to 'published' (a scheduled publish,
-- say) would put a job live on an ordinary edit with no check. It now runs
-- AFTER INSERT OR UPDATE on every row, on the row exactly as it was written;
-- a refusal still undoes the whole statement, with the same message and HINT.

create or replace function public.jobs_publish_needs_email_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from 'published'::job_status then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status = 'published'::job_status then
    return null;
  end if;
  -- The system's own writes, and a platform admin's (reopening a paused
  -- business's jobs), are not the business publishing.
  if auth.role() = 'service_role' or public.is_platform_admin() then
    return null;
  end if;
  if not public.business_email_verified(new.employer_id) then
    raise exception 'Confirm your email to put this job live: press Publish in the job editor and we''ll send a code to your sign-in address.'
      using errcode = 'check_violation', hint = 'email_not_verified';
  end if;
  return null;
end;
$$;

revoke all on function public.jobs_publish_needs_email_check() from public, anon, authenticated;

drop trigger if exists jobs_publish_needs_email_check on public.jobs;
create trigger jobs_publish_needs_email_check
  after insert or update on public.jobs
  for each row execute function public.jobs_publish_needs_email_check();
