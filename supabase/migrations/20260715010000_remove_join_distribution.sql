-- HireFlow no longer uses automatic JOIN/API job distribution.
-- Keep manual copy/share posting only and remove the token/distribution tables
-- created for the abandoned integration path.

DROP TABLE IF EXISTS public.job_distribution_posts CASCADE;
DROP TABLE IF EXISTS public.employer_integrations CASCADE;
