-- Fix function search path for validate_package_status
CREATE OR REPLACE FUNCTION public.validate_package_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'sent', 'partially_completed', 'completed') THEN
    RAISE EXCEPTION 'Invalid package status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;