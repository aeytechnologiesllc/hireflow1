-- C3: public.published_jobs_public is a SECURITY DEFINER view (jobs itself
-- has RLS with no anon SELECT policy at all, so the view exists precisely to
-- bypass that for the public job pages/feeds) that returned EVERY published
-- job with no exception for exclude_from_feed — the flag that marks a job as
-- internal/QA/demo-only (see 20260826210000_job_feed_quality_gate.sql: "True
-- = never emit this job in /jobs.xml or aggregator submissions"). Verified
-- live on 2026-09-15: all 40 currently-published jobs on this project carry
-- exclude_from_feed = true, and every one belongs to a known internal
-- account (employer.test@hireflow.dev, zack@yahoo.com, or an e2e/QA-signup
-- fixture) — none are real customer postings. exclude_from_feed is never set
-- by any product flow; it is only ever written by direct SQL against these
-- known test accounts. So today, a stranger who opened /candidate/job/:id
-- for any live job id — or looked it up by job_code through ApplyWithCode —
-- got the full internal QA posting (description, application questions,
-- quiz questions, workflow steps), and api/job-prerender.mjs served Google a
-- JobPosting block for it too, even though the feed/sitemap gates already
-- correctly hid it from /jobs.xml and the sitemap.
--
-- Column audit (every current consumer read before writing this):
--   src/pages/JobDetails.tsx (select *), src/pages/ApplyWithCode.tsx
--   (explicit list incl. application_questions/quiz_questions/workflow_steps
--   for the pre-apply time/materials estimate), src/hooks/useApplications.ts
--   (employer_id only), src/cockpit/data/showcaseSource.ts (id only),
--   api/job-feed.mjs and api/job-prerender.mjs (their own JOB_FIELDS lists).
--   Every column already returned by this view is read by at least one of
--   these — none is dropped here. application_questions/quiz_questions/
--   workflow_steps were already safe: the jsonb_build_object below allow-
--   lists only id/type/question/required/placeholder/time_limit_seconds/
--   category/options/title/description, never selecting the raw row's
--   `correct_answer` (an option index for multiple_choice, or the literal
--   correct option text) or `fit_context` (the situational grading rubric) —
--   confirmed against live quiz_questions data, including that a
--   multiple_choice question's `options` is a flat array of choice strings
--   with no per-option correctness flag hiding inside it. (A further move of
--   answer keys off this table entirely is already in flight elsewhere per
--   the project brief; not duplicated here.) employer_id stays: job-feed,
--   job-prerender, JobDetails and jobFromFlow.ts's fetchEmployerCompanyName
--   all join it against employer_public_branding for the company name/logo.
--
-- FIX: add one row-level condition. A row is visible when it is NOT
-- exclude_from_feed, OR the caller IS the job's own employer
-- (auth.uid() = employer_id):
--   * a real employer's normal published job (exclude_from_feed is always
--     false for anything created through the product) still loads for every
--     stranger on /job/:id and by job code, unchanged;
--   * the owning employer can still open their own excluded/QA job while
--     signed in — src/pages/JobDetails.tsx's "test your own posting" flow
--     (commit cb2b547) reads this exact view for every viewer with no
--     separate authenticated path, so the exception has to live here;
--   * every other viewer — signed out, or signed in as anyone else,
--     including that same employer's own team members — can no longer read
--     an internal QA/test job at all, closing the exposure above. (Team-
--     member access to an excluded job isn't extended here: exclude_from_feed
--     is only ever set on the handful of known internal QA accounts today,
--     none of which are team-managed, and the task this migration answers
--     names only the owning employer's own authenticated path.)
--
-- SECURITY DEFINER is kept, deliberately not switched to security_invoker:
-- public.jobs has row_security enabled with no SELECT policy that admits
-- `anon` at all (only owner/team-member/applied-candidate/developer, every
-- one keyed off auth.uid()). An invoker view would enforce jobs' own RLS on
-- top of this view's WHERE clause, so anon would get zero rows and every
-- public job page, the job-code lookup, the JSON feeds and the prerenderer
-- would break outright. Bypassing jobs' RLS here is the intended shape of
-- this view; this migration narrows what the bypass exposes rather than
-- removing it.
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
  j.exclude_from_feed
from public.jobs j
where j.status = 'published'::job_status
  and (not j.exclude_from_feed or j.employer_id = auth.uid());

grant select on public.published_jobs_public to anon, authenticated;

-- public.employer_public_branding reviewed too (same task). It already
-- exposes only 3 of profiles' ~25 columns — user_id, company_name,
-- company_logo — never email, phone, resume_url, linkedin_url,
-- company_address, bio, skills or experience_years. Every consumer
-- (src/pages/JobDetails.tsx, src/lib/jobFromFlow.ts, src/pages/
-- Applications.tsx, src/pages/CandidateApplicationDetail.tsx,
-- api/job-prerender.mjs, api/job-feed.mjs, supabase/functions/sitemap) reads
-- a subset of exactly those 3. Live check: 0 non-employer profiles carry a
-- non-null company_name today, so the `company_name is not null` row filter
-- is not admitting anything unintended in practice. No column or row change
-- needed; recreated verbatim here only so both public views this task
-- reviewed are captured together in one migration.
create or replace view public.employer_public_branding as
select user_id, company_name, company_logo
from public.profiles
where company_name is not null;

grant select on public.employer_public_branding to anon, authenticated;
