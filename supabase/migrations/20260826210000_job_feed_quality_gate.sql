-- Feed quality gate: a job may only reach public feeds when it carries the fields
-- every aggregator (and Google for Jobs) requires. Test/QA jobs are excluded explicitly.
alter table public.jobs
  add column if not exists exclude_from_feed boolean not null default false;

comment on column public.jobs.exclude_from_feed is
  'True = never emit this job in /jobs.xml or aggregator submissions (QA/demo/internal jobs).';

update public.jobs j
set exclude_from_feed = true
where j.employer_id in (select u.id from auth.users u where u.email = 'zack@yahoo.com');
