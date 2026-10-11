-- Follow-up to 20261011180000_business_screens.sql, for team members.
--
--   1. A team member can read their business's Help thread (they could
--      already write to it). Inline in the policy: a function called from a
--      policy runs with the caller's rights, and help_business_of() is not
--      theirs to call.
--   2. my_business_standing() answers for the business the caller hires
--      for (their own, or their team's), so a team member's Hire dialog
--      knows whether the business may ask for ID papers. It still answers
--      only about the caller's own business.
--
-- Re-runnable.

DROP POLICY IF EXISTS "A business reads its own help thread" ON public.help_messages;
CREATE POLICY "A business reads its own help thread"
  ON public.help_messages FOR SELECT TO authenticated
  USING (
    employer_id = auth.uid()
    OR public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
       WHERE tm.user_id = auth.uid() AND tm.employer_id = help_messages.employer_id AND tm.status = 'active'
    )
  );

CREATE OR REPLACE FUNCTION public.my_business_standing()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH biz AS (SELECT coalesce(public.help_business_of(auth.uid()), auth.uid()) AS id)
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE jsonb_build_object(
    'status', public.business_status_of(biz.id),
    'can_request_ids', public.business_status_of(biz.id) = 'approved' OR public.business_has_paid(biz.id),
    'is_admin', public.is_platform_admin()
  ) END
  FROM biz;
$$;
REVOKE ALL ON FUNCTION public.my_business_standing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_business_standing() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
