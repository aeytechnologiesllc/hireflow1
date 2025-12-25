-- Add customizable WPM requirement to jobs table
ALTER TABLE public.jobs 
ADD COLUMN required_wpm integer DEFAULT 40;

-- Add a comment explaining the field
COMMENT ON COLUMN public.jobs.required_wpm IS 'Required words per minute for typing test. Default 40 WPM for standard office work.';