-- Remove demo-era public mutation policies. The production flow uses the real
-- authenticated ATS tables and Edge Functions, not public writes to showcase data.

DROP POLICY IF EXISTS "demo update application progress" ON public.applications;

DO $$
BEGIN
  IF to_regclass('public.roles') IS NOT NULL THEN
    DROP POLICY IF EXISTS "demo insert roles" ON public.roles;
    DROP POLICY IF EXISTS "demo update roles" ON public.roles;
  END IF;
END $$;
