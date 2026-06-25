-- Ava Engine Phase 1 — persist generated JobFlow on showcase roles.
-- Safe additive migration: does not truncate or overwrite existing rows.

alter table public.roles add column if not exists flow jsonb;
alter table public.roles add column if not exists rigor text;
alter table public.roles add column if not exists openings int default 1;
alter table public.roles add column if not exists description text;
alter table public.roles add column if not exists employment_type text;
alter table public.roles add column if not exists work_mode text;
alter table public.roles add column if not exists schedule text;
alter table public.roles add column if not exists start_urgency text;
alter table public.roles add column if not exists traits text[];

comment on column public.roles.flow is 'Full JobFlow JSON (phases + legacy stages for candidate apply)';
comment on column public.roles.rigor is 'Screening rigor: easy | standard | high';

-- Demo-open update so employers can edit published flows pre-auth (strip before launch).
drop policy if exists "demo update roles" on public.roles;
create policy "demo update roles" on public.roles
  for update using (true) with check (true);
