-- Repo parity: this view has existed in production (used by the job feed and
-- the job-page prerender) but was never captured in a migration. Definition
-- copied verbatim from pg_get_viewdef on 2026-09-04.
create or replace view public.employer_public_branding as
 select user_id,
    company_name,
    company_logo
   from public.profiles
  where company_name is not null;
