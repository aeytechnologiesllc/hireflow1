ALTER TABLE public.team_members
ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT true;
