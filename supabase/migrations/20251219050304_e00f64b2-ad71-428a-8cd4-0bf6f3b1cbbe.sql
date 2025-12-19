-- Create function to check application deadline before insert
CREATE OR REPLACE FUNCTION public.check_application_deadline()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if job has a deadline and if it has passed
  IF EXISTS (
    SELECT 1 FROM public.jobs 
    WHERE id = NEW.job_id 
    AND application_deadline IS NOT NULL 
    AND application_deadline < NOW()
  ) THEN
    RAISE EXCEPTION 'Application deadline has passed for this job';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to enforce application deadline
DROP TRIGGER IF EXISTS enforce_application_deadline ON public.applications;
CREATE TRIGGER enforce_application_deadline
BEFORE INSERT ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.check_application_deadline();