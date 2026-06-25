-- Accountless candidate flow (showcase roles/applications path).
-- Pre-launch: scope INSERT/UPDATE policies to authenticated employers + rate limits.

-- ── Role application codes (public entry — finds the role, not the person) ──
alter table public.roles add column if not exists role_code text unique;

update public.roles
set role_code = 'ROLE-' || upper(substring(md5(id::text || coalesce(title, '')), 1, 6))
where role_code is null;

create or replace function public.generate_role_code()
returns trigger
language plpgsql
as $$
begin
  if new.role_code is null or new.role_code = '' then
    new.role_code := 'ROLE-' || upper(substring(md5(random()::text || clock_timestamp()::text), 1, 6));
  end if;
  return new;
end;
$$;

drop trigger if exists generate_role_code_trigger on public.roles;
create trigger generate_role_code_trigger
  before insert on public.roles
  for each row execute function public.generate_role_code();

-- Application tracking for accountless flow (phone + email + job identifies applicant).
alter table public.applications add column if not exists current_phase text default 'applied';
alter table public.applications add column if not exists applicant_email text;
alter table public.applications add column if not exists applicant_phone text;
alter table public.applications add column if not exists application_answers jsonb default '[]'::jsonb;

create index if not exists applications_role_email_idx
  on public.applications (role_id, lower(applicant_email)) where applicant_email is not null;

-- Demo-open: allow applicants to update their own in-progress application (phase advances).
drop policy if exists "demo update application progress" on public.applications;
create policy "demo update application progress" on public.applications
  for update using (true) with check (true);

-- Demo-open: allow role publish without auth (Create-job pre-auth).
drop policy if exists "demo insert roles" on public.roles;
create policy "demo insert roles" on public.roles
  for insert with check (true);

-- Bump role applicant_count when a new application lands.
create or replace function public.bump_role_applicant_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.roles
  set applicant_count = coalesce(applicant_count, 0) + 1,
      applied = coalesce(applied, 0) + 1,
      last_activity = 'New application'
  where id = new.role_id;
  return new;
end;
$$;

drop trigger if exists bump_role_applicant_count_trigger on public.applications;
create trigger bump_role_applicant_count_trigger
  after insert on public.applications
  for each row execute function public.bump_role_applicant_count();
