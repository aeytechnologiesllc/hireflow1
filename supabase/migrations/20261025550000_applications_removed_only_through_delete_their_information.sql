-- A business removes an application only through "Delete their information"
-- (the eleventh Phase 5 review, 2026-10-25, finding 3).
--
-- Two old policies still let the job's owner, and a teammate who manages
-- applicants, delete an application straight through the API
-- (supabase.from('applications').delete() from a browser console). That
-- skipped public.remove_applicant: no row in private.applicant_removals (who
-- did it, and why), the team's bell cards and a last application's block
-- left behind, and the signed copies (documents/<id>/, which carry the
-- applicant's signature, address and device) and the form's files left in
-- storage with nothing pointing at them. No screen uses them: the app's last
-- caller, the unused useDeleteApplication hook, is gone in the same change.
--
-- Unchanged: the applicant's own withdrawal ("Candidates can delete their
-- own applications", 20261011197000), a deleted job's or account's cascade
-- (a foreign key's cascade is not checked against these policies), and
-- remove-applicant (remove_applicant runs with its own rights).
--
-- Both were last made by 20260715014000_break_jobs_applications_rls_recursion.sql
-- (first by 20251218190307); no later migration touches them.

DROP POLICY IF EXISTS "Employers can delete applications to their jobs" ON public.applications;
DROP POLICY IF EXISTS "Team members can delete applications if permitted" ON public.applications;
