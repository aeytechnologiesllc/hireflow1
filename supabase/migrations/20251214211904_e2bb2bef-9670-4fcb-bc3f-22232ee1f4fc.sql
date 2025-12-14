-- Add workflow-related columns to jobs table
ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS application_questions jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS quiz_questions jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS workflow_steps jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS processing_mode text DEFAULT 'auto',
ADD COLUMN IF NOT EXISTS passing_score integer DEFAULT 60,
ADD COLUMN IF NOT EXISTS require_resume boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS workflow_difficulty text DEFAULT 'medium';

-- Add comment for documentation
COMMENT ON COLUMN public.jobs.application_questions IS 'JSON array of application form questions';
COMMENT ON COLUMN public.jobs.quiz_questions IS 'JSON array of timed quiz questions with time limits and correct answers';
COMMENT ON COLUMN public.jobs.workflow_steps IS 'JSON array of additional workflow steps (typing test, video, simulations, etc.)';
COMMENT ON COLUMN public.jobs.processing_mode IS 'Processing mode: auto or manual';
COMMENT ON COLUMN public.jobs.passing_score IS 'Minimum passing score for quiz (0-100)';
COMMENT ON COLUMN public.jobs.require_resume IS 'Whether resume upload is required';
COMMENT ON COLUMN public.jobs.workflow_difficulty IS 'Workflow difficulty: easy, medium, hard, intense';