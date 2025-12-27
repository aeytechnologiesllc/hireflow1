-- Fix overly permissive profile SELECT policy
-- The current "Authenticated users can view all profiles" policy allows ANY authenticated user to see ALL profiles
-- This exposes PII (email, phone, etc.) to everyone

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;

-- Create a more restrictive policy that allows:
-- 1. Users can view their own profile
-- 2. Employers can view profiles of candidates who applied to their jobs
-- 3. Team members can view profiles of candidates for their assigned jobs
CREATE POLICY "Employers can view applicant profiles" 
ON public.profiles 
FOR SELECT 
USING (
  -- User is viewing their own profile
  auth.uid() = user_id
  OR
  -- User is an employer viewing a candidate who applied to their jobs
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.candidate_id = profiles.user_id
    AND j.employer_id = auth.uid()
  )
  OR
  -- User is a team member viewing a candidate for their assigned jobs
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN team_members tm ON tm.employer_id = j.employer_id
    WHERE a.candidate_id = profiles.user_id
    AND tm.user_id = auth.uid()
    AND tm.status = 'active'
    AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);

-- Drop the redundant "Users can view their own profile" policy since it's now included above
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;