-- Recovered from the live migration history on 2026-09-16.
-- This migration exists in supabase_migrations.schema_migrations on the live
-- project (yqklrkpptnhubsnijqze) but had no matching file in supabase/migrations.
-- See docs/MIGRATION-HISTORY.md for how this was found and verified.
-- NOTE: applied 23 seconds before 20260625062755_hireflow1_auth_bootstrap.sql,
-- which re-does most of the same setup in a slightly different form. Both are
-- recovered as-applied; do not deduplicate them — this file reflects exactly
-- what ran, including its own "sourced from _repo/..." comment below.

-- Minimal auth core for hireflow1, sourced from _repo/supabase/migrations:
-- 20251214183024_d6bca30d-17a4-42ed-8763-75d537c5ca92.sql
-- 20251215054759_9630c0f8-f061-45b6-ba3a-b9c35c97f6c5.sql
-- 20260104033645_6a744c8b-a43c-4199-9efb-e9f716534229.sql
-- 20260214215715_fbc808c2-942c-416d-87d3-0ec4a38625f2.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('employer', 'candidate');
  END IF;
END $$;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'team_member';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'developer';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'invitation_status') THEN
    CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'declined', 'expired');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  company_name TEXT,
  company_logo TEXT,
  company_description TEXT,
  resume_url TEXT,
  linkedin_url TEXT,
  portfolio_url TEXT,
  skills TEXT[],
  experience_years INTEGER,
  location TEXT,
  bio TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  invitee_email TEXT NOT NULL,
  status public.invitation_status DEFAULT 'pending' NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  invite_code TEXT UNIQUE,
  invitee_name TEXT,
  department TEXT,
  permission_level TEXT DEFAULT 'limited',
  can_create_jobs BOOLEAN DEFAULT false,
  can_delete_jobs BOOLEAN DEFAULT false,
  can_message_candidates BOOLEAN DEFAULT true,
  can_manage_pipeline BOOLEAN DEFAULT true,
  can_schedule_interviews BOOLEAN DEFAULT true,
  can_send_documents BOOLEAN DEFAULT true,
  assigned_job_ids UUID[] DEFAULT '{}'
);

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

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.assign_user_role(p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (
      auth.uid(),
      CASE WHEN p_role = 'employer' THEN 'employer'::public.app_role
           ELSE 'candidate'::public.app_role
      END
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_team_members_updated_at ON public.team_members;
CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Users can view their own profile') THEN
    CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Users can update their own profile') THEN
    CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Authenticated users can view all profiles') THEN
    CREATE POLICY "Authenticated users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' AND policyname='Users can view their own role') THEN
    CREATE POLICY "Users can view their own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_invitations' AND policyname='Inviters can view their invitations') THEN
    CREATE POLICY "Inviters can view their invitations" ON public.team_invitations FOR SELECT USING (auth.uid() = inviter_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_members' AND policyname='Employers can view their team members') THEN
    CREATE POLICY "Employers can view their team members" ON public.team_members FOR SELECT USING (auth.uid() = employer_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_members' AND policyname='Employers can create team members') THEN
    CREATE POLICY "Employers can create team members" ON public.team_members FOR INSERT WITH CHECK (auth.uid() = employer_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_members' AND policyname='Employers can update their team members') THEN
    CREATE POLICY "Employers can update their team members" ON public.team_members FOR UPDATE USING (auth.uid() = employer_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_members' AND policyname='Employers can delete their team members') THEN
    CREATE POLICY "Employers can delete their team members" ON public.team_members FOR DELETE USING (auth.uid() = employer_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_members' AND policyname='Team members can view their own record') THEN
    CREATE POLICY "Team members can view their own record" ON public.team_members FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.assign_user_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_member_permissions(uuid, uuid) TO authenticated;
