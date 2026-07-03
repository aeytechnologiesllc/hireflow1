-- Google Indexing API notification attempts for job URLs.
-- This is intentionally append-only so we can debug whether a publish/close/delete
-- was sent, skipped because credentials are not configured, or rejected by Google.
create table if not exists public.google_indexing_notifications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  employer_id uuid references auth.users(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  notification_type text not null check (notification_type in ('URL_UPDATED', 'URL_DELETED')),
  url text not null,
  status text not null check (status in ('sent', 'skipped', 'error')),
  error_message text,
  google_response jsonb,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.google_indexing_notifications enable row level security;

create index if not exists idx_google_indexing_notifications_job_created
  on public.google_indexing_notifications (job_id, created_at desc);

create index if not exists idx_google_indexing_notifications_employer_created
  on public.google_indexing_notifications (employer_id, created_at desc);

drop policy if exists "Employers can view Google indexing attempts" on public.google_indexing_notifications;
create policy "Employers can view Google indexing attempts"
  on public.google_indexing_notifications
  for select
  to authenticated
  using (
    employer_id = (select auth.uid())
    or exists (
      select 1
      from public.team_members tm
      where tm.user_id = (select auth.uid())
        and tm.employer_id = google_indexing_notifications.employer_id
        and tm.status = 'active'
    )
  );
