-- Recovered from the live migration history on 2026-09-16.
-- This migration exists in supabase_migrations.schema_migrations on the live
-- project (yqklrkpptnhubsnijqze) but had no matching file in supabase/migrations.
-- See docs/MIGRATION-HISTORY.md for how this was found and verified.

-- Hireflow employer schema (Deep Jade demo) — Supabase / Postgres 17.
create table if not exists public.employers (
  id          text primary key,
  name        text not null,
  owner_name  text not null
);

create table if not exists public.kpis (
  id                  int  primary key default 1,
  shortlist_ready     int  not null,
  in_pipeline         int  not null,
  open_roles          int  not null,
  time_to_hire_days   int  not null,
  constraint kpis_singleton check (id = 1)
);

create table if not exists public.roles (
  id              text primary key,
  employer_id     text references public.employers(id),
  title           text not null,
  location        text not null,
  pay             text not null,
  status          text not null check (status in ('shortlist','quiz','draft','live','filled','closed')),
  stage_label     text not null,
  applicant_count int  not null default 0,
  applied         int,
  quiz            int,
  interview       int,
  shortlist       int,
  last_activity   text,
  closed_note     text,
  sort_order      int  not null default 0
);

create table if not exists public.candidates (
  id            text primary key,
  name          text not null,
  initials      text not null,
  avatar_color  text not null
);

create table if not exists public.applications (
  id            text primary key,
  candidate_id  text not null references public.candidates(id),
  role_id       text not null references public.roles(id),
  stage         text not null check (stage in ('applied','quiz','interview','shortlist')),
  voice_score   double precision,
  quiz_score    int,
  note          text,
  distance_mi   double precision,
  sort_order    int not null default 0
);

create table if not exists public.candidate_details (
  id                        text primary key references public.candidates(id),
  name                      text not null,
  initials                  text not null,
  avatar_color              text not null,
  role_title                text not null,
  top_match                 boolean not null default false,
  distance_mi               double precision not null,
  voice_score               double precision not null,
  quiz_score                int not null,
  ava_read                  text not null,
  interview_duration_label  text not null,
  interview_questions       jsonb not null,
  application_answers        jsonb not null,
  timeline                  jsonb not null
);

create table if not exists public.activity (
  id          text primary key,
  kind        text not null check (kind in ('pass','interview','apply')),
  text        text not null,
  sub         text not null,
  time        text not null,
  sort_order  int  not null default 0
);

create table if not exists public.onboarding (
  id            int  primary key default 1,
  candidate_name text not null,
  initials      text not null,
  avatar_color  text not null,
  complete      int  not null,
  total         int  not null,
  constraint onboarding_singleton check (id = 1)
);

create table if not exists public.documents (
  id            text primary key,
  section       text not null check (section in ('needs_signature','pending','completed')),
  name          text not null,
  candidate_name text not null,
  initials      text not null,
  avatar_color  text not null,
  status        text not null,
  status_kind   text not null check (status_kind in ('action','pending','done')),
  date          text not null,
  action        text not null,
  sort_order    int  not null default 0
);

create table if not exists public.conversations (
  id            text primary key,
  candidate_id  text references public.candidates(id),
  name          text not null,
  initials      text not null,
  avatar_color  text not null,
  preview       text not null,
  time          text not null,
  unread        boolean not null default false,
  role_title    text not null,
  sort_order    int  not null default 0
);

create table if not exists public.messages (
  id              text primary key,
  conversation_id text not null references public.conversations(id),
  from_role       text not null check (from_role in ('employer','candidate')),
  text            text not null,
  sender          text not null,
  time            text not null,
  sort_order      int  not null default 0
);

create table if not exists public.job_flow_phases (
  n           int  primary key,
  title       text not null,
  sub         text not null,
  meta        jsonb not null,
  icon        text not null check (icon in ('doc','quiz','mic','star')),
  ava_runs    boolean not null default false,
  you_decide  boolean not null default false
);

do $$
declare t text;
begin
  foreach t in array array[
    'employers','kpis','roles','candidates','applications','candidate_details',
    'activity','onboarding','documents','conversations','messages','job_flow_phases'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "public read %1$s" on public.%1$I;', t);
    execute format('create policy "public read %1$s" on public.%1$I for select using (true);', t);
  end loop;
end $$;
