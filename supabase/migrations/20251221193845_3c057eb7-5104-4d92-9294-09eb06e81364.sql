-- Create document_packages table
CREATE TABLE public.document_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  employer_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Hiring Package',
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create trigger for status validation
CREATE OR REPLACE FUNCTION public.validate_package_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'sent', 'partially_completed', 'completed') THEN
    RAISE EXCEPTION 'Invalid package status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_package_status_trigger
BEFORE INSERT OR UPDATE ON public.document_packages
FOR EACH ROW EXECUTE FUNCTION public.validate_package_status();

-- Add package_id to documents table
ALTER TABLE public.documents ADD COLUMN package_id UUID REFERENCES public.document_packages(id) ON DELETE SET NULL;

-- Add package_id to document_requests table
ALTER TABLE public.document_requests ADD COLUMN package_id UUID REFERENCES public.document_packages(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.document_packages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for document_packages
CREATE POLICY "Employers can create packages for their jobs"
ON public.document_packages
FOR INSERT
WITH CHECK (
  auth.uid() = employer_id AND
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.id = document_packages.application_id
    AND j.employer_id = auth.uid()
  )
);

CREATE POLICY "Employers can view packages for their jobs"
ON public.document_packages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.id = document_packages.application_id
    AND j.employer_id = auth.uid()
  )
);

CREATE POLICY "Employers can update packages for their jobs"
ON public.document_packages
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.id = document_packages.application_id
    AND j.employer_id = auth.uid()
  )
);

CREATE POLICY "Employers can delete packages for their jobs"
ON public.document_packages
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.id = document_packages.application_id
    AND j.employer_id = auth.uid()
  )
);

CREATE POLICY "Candidates can view their packages"
ON public.document_packages
FOR SELECT
USING (auth.uid() = candidate_id);

CREATE POLICY "Team members can create packages if permitted"
ON public.document_packages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN team_members tm ON tm.employer_id = j.employer_id
    WHERE a.id = document_packages.application_id
    AND tm.user_id = auth.uid()
    AND tm.status = 'active'
    AND tm.can_send_documents = true
    AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);

CREATE POLICY "Team members can view packages for assigned jobs"
ON public.document_packages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN team_members tm ON tm.employer_id = j.employer_id
    WHERE a.id = document_packages.application_id
    AND tm.user_id = auth.uid()
    AND tm.status = 'active'
    AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);

CREATE POLICY "Team members can update packages if permitted"
ON public.document_packages
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN team_members tm ON tm.employer_id = j.employer_id
    WHERE a.id = document_packages.application_id
    AND tm.user_id = auth.uid()
    AND tm.status = 'active'
    AND tm.can_send_documents = true
    AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);

-- Create updated_at trigger
CREATE TRIGGER update_document_packages_updated_at
BEFORE UPDATE ON public.document_packages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for document_packages
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_packages;