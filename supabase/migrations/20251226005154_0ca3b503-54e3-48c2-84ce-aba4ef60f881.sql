-- Add rejected_by tracking columns to applications table
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS rejected_by uuid,
ADD COLUMN IF NOT EXISTS rejected_by_type text;

-- Add constraint for rejected_by_type values
ALTER TABLE public.applications
ADD CONSTRAINT check_rejected_by_type 
CHECK (rejected_by_type IS NULL OR rejected_by_type IN ('user', 'team_member', 'ava'));

-- Add comment for documentation
COMMENT ON COLUMN public.applications.rejected_by IS 'UUID of user who rejected the application (null for Ava rejections)';
COMMENT ON COLUMN public.applications.rejected_by_type IS 'Type of rejection: user, team_member, or ava';