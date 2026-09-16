-- public.published_jobs_public dropped jobs.benefits entirely, even though it
-- is plain employer-authored posting text — the same kind of content as
-- description/responsibilities/requirements, which this view already exposes
-- to anon/authenticated in full. It carries no candidate PII, no answer key,
-- no internal scoring signal (unlike quiz_questions/application_questions,
-- which this view deliberately redacts down to non-sensitive keys) — it is
-- literally "free shift drinks, health insurance, flexible schedule", written
-- by the employer for a stranger to read on the job page. src/pages/
-- JobDetails.tsx (~line 667) already has a Benefits section gated on
-- `job.benefits`, and it could never render because the view never returned
-- the column (confirmed live 2026-09-16: view definition selects everything
-- from jobs EXCEPT benefits, while jobs.benefits is a real text[] column
-- every one of CreateJob.tsx / GuestJobCreator.tsx already writes to).
--
-- Postgres only allows CREATE OR REPLACE VIEW to APPEND new output columns —
-- reordering, renaming or removing any existing one requires DROP + CREATE
-- (which would need re-granting and could momentarily break readers). So
-- this migration is byte-for-byte supabase/migrations/
-- 20260915130000_public_views_tighten.sql's published_jobs_public
-- definition — same column list and order, same jsonb_build_object redaction
-- for application_questions/quiz_questions/workflow_steps, same WHERE
-- (status = 'published' AND (NOT exclude_from_feed OR employer_id =
-- auth.uid())), same SECURITY DEFINER posture, same grants — with exactly
-- one addition: `j.benefits` appended as the LAST selected column. Nothing
-- else about the view changes. employer_public_branding (defined in the
-- same prior migration) is untouched here; this migration only replaces
-- published_jobs_public.
--
-- Consumers updated alongside this migration to read the new column:
-- src/pages/JobDetails.tsx (already had the Benefits section, now gets real
-- data), src/pages/ApplyWithCode.tsx (adds benefits to its explicit select +
-- a compact Benefits line in the pre-apply job summary), and
-- api/job-prerender.mjs (adds benefits to JOB_FIELDS and emits schema.org
-- jobBenefits in the JobPosting JSON-LD when present).
create or replace view public.published_jobs_public as
select
  j.id,
  j.employer_id,
  j.title,
  j.description,
  j.responsibilities,
  j.requirements,
  j.location,
  j.job_type,
  j.experience_level,
  j.department,
  j.skills_required,
  j.salary_min,
  j.salary_max,
  j.salary_currency,
  j.salary_period,
  j.created_at,
  j.application_deadline,
  j.job_code,
  j.location_city,
  j.location_region,
  j.location_country,
  j.location_country_code,
  j.latitude,
  j.longitude,
  j.is_remote,
  j.locations,
  j.require_resume,
  coalesce(
    (
      select jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', q.value ->> 'id',
            'type', q.value ->> 'type',
            'question', q.value ->> 'question',
            'required', q.value -> 'required',
            'placeholder', q.value ->> 'placeholder',
            'time_limit_seconds', q.value -> 'time_limit_seconds',
            'category', q.value ->> 'category'
          )
        )
      )
      from jsonb_array_elements(coalesce(j.application_questions, '[]'::jsonb)) q(value)
    ),
    '[]'::jsonb
  ) as application_questions,
  coalesce(
    (
      select jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', q.value ->> 'id',
            'type', q.value ->> 'type',
            'question', q.value ->> 'question',
            'options', q.value -> 'options',
            'time_limit_seconds', q.value -> 'time_limit_seconds',
            'category', q.value ->> 'category'
          )
        )
      )
      from jsonb_array_elements(coalesce(j.quiz_questions, '[]'::jsonb)) q(value)
    ),
    '[]'::jsonb
  ) as quiz_questions,
  coalesce(
    (
      select jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', s.value ->> 'id',
            'type', s.value ->> 'type',
            'title', s.value ->> 'title',
            'description', s.value ->> 'description',
            'required', s.value -> 'required'
          )
        )
      )
      from jsonb_array_elements(coalesce(j.workflow_steps, '[]'::jsonb)) s(value)
    ),
    '[]'::jsonb
  ) as workflow_steps,
  j.exclude_from_feed,
  j.benefits
from public.jobs j
where j.status = 'published'::job_status
  and (not j.exclude_from_feed or j.employer_id = auth.uid());

grant select on public.published_jobs_public to anon, authenticated;
