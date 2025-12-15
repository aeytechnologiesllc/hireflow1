-- Add 'team_member' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'team_member';

-- Update team_invitations table with new columns for permissions
ALTER TABLE public.team_invitations 
ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS invitee_name TEXT,
ADD COLUMN IF NOT EXISTS department TEXT,
ADD COLUMN IF NOT EXISTS permission_level TEXT DEFAULT 'limited',
ADD COLUMN IF NOT EXISTS can_create_jobs BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_delete_jobs BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS can_message_candidates BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS can_manage_pipeline BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS can_schedule_interviews BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS can_send_documents BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS assigned_job_ids UUID[] DEFAULT '{}';

-- Create function to generate invite code
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := 'TEAM-' || UPPER(SUBSTRING(md5(random()::text), 1, 8));
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for auto-generating invite code
DROP TRIGGER IF EXISTS generate_team_invite_code ON public.team_invitations;
CREATE TRIGGER generate_team_invite_code
BEFORE INSERT ON public.team_invitations
FOR EACH ROW
EXECUTE FUNCTION public.generate_invite_code();

-- Create team_members table for accepted invitations
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitation_id UUID REFERENCES public.team_invitations(id) ON DELETE SET NULL,
  name TEXT,
  email TEXT NOT NULL,
  department TEXT,
  permission_level TEXT DEFAULT 'limited',
  can_create_jobs BOOLEAN DEFAULT false,
  can_delete_jobs BOOLEAN DEFAULT false,
  can_message_candidates BOOLEAN DEFAULT true,
  can_manage_pipeline BOOLEAN DEFAULT true,
  can_schedule_interviews BOOLEAN DEFAULT true,
  can_send_documents BOOLEAN DEFAULT true,
  assigned_job_ids UUID[] DEFAULT '{}',
  status TEXT DEFAULT 'active',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, employer_id)
);

-- Enable RLS on team_members
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- RLS policies for team_members
CREATE POLICY "Employers can view their team members"
ON public.team_members
FOR SELECT
USING (auth.uid() = employer_id);

CREATE POLICY "Employers can create team members"
ON public.team_members
FOR INSERT
WITH CHECK (auth.uid() = employer_id);

CREATE POLICY "Employers can update their team members"
ON public.team_members
FOR UPDATE
USING (auth.uid() = employer_id);

CREATE POLICY "Employers can delete their team members"
ON public.team_members
FOR DELETE
USING (auth.uid() = employer_id);

CREATE POLICY "Team members can view their own record"
ON public.team_members
FOR SELECT
USING (auth.uid() = user_id);

-- Create function to check if user is a team member of an employer
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid, _employer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members
    WHERE user_id = _user_id
      AND employer_id = _employer_id
      AND status = 'active'
  )
$$;

-- Create function to get team member permissions
CREATE OR REPLACE FUNCTION public.get_team_member_permissions(_user_id uuid, _employer_id uuid)
RETURNS TABLE (
  permission_level TEXT,
  can_create_jobs BOOLEAN,
  can_delete_jobs BOOLEAN,
  can_message_candidates BOOLEAN,
  can_manage_pipeline BOOLEAN,
  can_schedule_interviews BOOLEAN,
  can_send_documents BOOLEAN,
  assigned_job_ids UUID[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    tm.permission_level,
    tm.can_create_jobs,
    tm.can_delete_jobs,
    tm.can_message_candidates,
    tm.can_manage_pipeline,
    tm.can_schedule_interviews,
    tm.can_send_documents,
    tm.assigned_job_ids
  FROM public.team_members tm
  WHERE tm.user_id = _user_id
    AND tm.employer_id = _employer_id
    AND tm.status = 'active'
$$;

-- Update trigger for team_members
CREATE TRIGGER update_team_members_updated_at
BEFORE UPDATE ON public.team_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add RLS policy for team members to view jobs they're assigned to
CREATE POLICY "Team members can view assigned jobs"
ON public.jobs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.employer_id = jobs.employer_id
      AND tm.status = 'active'
      AND (
        array_length(tm.assigned_job_ids, 1) IS NULL 
        OR jobs.id = ANY(tm.assigned_job_ids)
      )
  )
);

-- Add RLS policy for team members to view applications for their assigned jobs
CREATE POLICY "Team members can view applications for assigned jobs"
ON public.applications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    JOIN public.team_members tm ON tm.employer_id = j.employer_id
    WHERE j.id = applications.job_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND (
        array_length(tm.assigned_job_ids, 1) IS NULL 
        OR j.id = ANY(tm.assigned_job_ids)
      )
  )
);

-- Add RLS policy for team members to update applications (if they have pipeline permission)
CREATE POLICY "Team members can update applications if permitted"
ON public.applications
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    JOIN public.team_members tm ON tm.employer_id = j.employer_id
    WHERE j.id = applications.job_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.can_manage_pipeline = true
      AND (
        array_length(tm.assigned_job_ids, 1) IS NULL 
        OR j.id = ANY(tm.assigned_job_ids)
      )
  )
);