-- The applicant side, from the final gap check (2026-10-11).
--
-- 1. "Withdraw application" deleted the application outright, whatever its
--    stage: a hired or offered applicant's application went with its signed
--    offer letter, the business's notes, interviews and papers, and a declined
--    applicant could withdraw and apply again with a clean slate. An applicant
--    may now withdraw only before any decision (still filling in, or in
--    review), and never once a document of theirs is signed. The app offers
--    Withdraw only then.
-- 2. A job past its application deadline leaves published_jobs_public, so
--    /open-jobs, the careers pages and /careers stop showing Apply for it.
--    The rest of the view is unchanged from 20261011170000.

-- 1 ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Candidates can delete their own applications" ON public.applications;
CREATE POLICY "Candidates can delete their own applications" ON public.applications
  FOR DELETE
  USING (
    auth.uid() = candidate_id
    AND status::text IN ('in_progress', 'pending', 'reviewing')
    AND NOT EXISTS (
      SELECT 1 FROM public.documents d
       WHERE d.application_id = applications.id
         AND (d.candidate_signed_at IS NOT NULL OR d.status::text IN ('signed', 'declined'))
    )
  );

-- 2 ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.published_jobs_public AS
SELECT j.id,
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
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', (q.value ->> 'id'::text), 'type', (q.value ->> 'type'::text), 'question', (q.value ->> 'question'::text), 'required', (q.value -> 'required'::text), 'placeholder', (q.value ->> 'placeholder'::text), 'time_limit_seconds', (q.value -> 'time_limit_seconds'::text), 'category', (q.value ->> 'category'::text)))) AS jsonb_agg
           FROM jsonb_array_elements(COALESCE(j.application_questions, '[]'::jsonb)) q(value)), '[]'::jsonb) AS application_questions,
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', (q.value ->> 'id'::text), 'type', (q.value ->> 'type'::text), 'question', (q.value ->> 'question'::text), 'options', (q.value -> 'options'::text), 'time_limit_seconds', (q.value -> 'time_limit_seconds'::text), 'category', (q.value ->> 'category'::text)))) AS jsonb_agg
           FROM jsonb_array_elements(COALESCE(j.quiz_questions, '[]'::jsonb)) q(value)), '[]'::jsonb) AS quiz_questions,
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', (s.value ->> 'id'::text), 'type', (s.value ->> 'type'::text), 'title', (s.value ->> 'title'::text), 'description', (s.value ->> 'description'::text), 'required', (s.value -> 'required'::text)))) AS jsonb_agg
           FROM jsonb_array_elements(COALESCE(j.workflow_steps, '[]'::jsonb)) s(value)), '[]'::jsonb) AS workflow_steps,
    j.exclude_from_feed,
    j.benefits,
    j.slug,
    ( SELECT bp.slug FROM public.business_pages bp WHERE bp.employer_id = j.employer_id) AS business_slug,
    j.root_link
   FROM public.jobs j
  WHERE j.status = 'published'::job_status AND (NOT j.exclude_from_feed OR j.employer_id = auth.uid())
    -- business_standing read directly: a function called in a view runs with
    -- the caller's rights, and business_status_of() is not anyone's to call.
    AND (NOT EXISTS (SELECT 1 FROM public.business_standing s WHERE s.employer_id = j.employer_id AND s.status = 'suspended')
         OR j.employer_id = auth.uid())
    -- A job past its application deadline is closed to applicants (the job
    -- page, its link preview, the sitemap and the feeds already said so; the
    -- careers pages and Open jobs still showed Apply).
    AND (j.application_deadline IS NULL OR j.application_deadline > now() OR j.employer_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.published_jobs_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.published_jobs_public TO anon, authenticated;
