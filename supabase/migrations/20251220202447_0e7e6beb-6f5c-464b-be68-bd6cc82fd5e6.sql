-- Create document_requests table
CREATE TABLE public.document_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  employer_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  
  -- Request details
  document_type TEXT NOT NULL,
  custom_document_name TEXT,
  description TEXT,
  is_required BOOLEAN NOT NULL DEFAULT true,
  due_date TIMESTAMP WITH TIME ZONE,
  
  -- Response
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'approved', 'rejected')),
  file_url TEXT,
  file_name TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE,
  
  -- Review
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID,
  rejection_reason TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_document_requests_application_id ON public.document_requests(application_id);
CREATE INDEX idx_document_requests_candidate_id ON public.document_requests(candidate_id);
CREATE INDEX idx_document_requests_employer_id ON public.document_requests(employer_id);
CREATE INDEX idx_document_requests_status ON public.document_requests(status);

-- Enable RLS
ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Employers can view document requests for their jobs
CREATE POLICY "Employers can view document requests for their jobs"
ON public.document_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.id = document_requests.application_id
    AND j.employer_id = auth.uid()
  )
);

-- Employers can create document requests for their job applicants
CREATE POLICY "Employers can create document requests"
ON public.document_requests FOR INSERT
WITH CHECK (
  auth.uid() = employer_id AND
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.id = document_requests.application_id
    AND j.employer_id = auth.uid()
  )
);

-- Employers can update document requests (approve/reject)
CREATE POLICY "Employers can update document requests"
ON public.document_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.id = document_requests.application_id
    AND j.employer_id = auth.uid()
  )
);

-- Employers can delete document requests
CREATE POLICY "Employers can delete document requests"
ON public.document_requests FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.id = document_requests.application_id
    AND j.employer_id = auth.uid()
  )
);

-- Candidates can view their own document requests
CREATE POLICY "Candidates can view their own document requests"
ON public.document_requests FOR SELECT
USING (auth.uid() = candidate_id);

-- Candidates can update their own document requests (upload file)
CREATE POLICY "Candidates can update their own document requests"
ON public.document_requests FOR UPDATE
USING (auth.uid() = candidate_id)
WITH CHECK (auth.uid() = candidate_id);

-- Team members can view document requests for assigned jobs
CREATE POLICY "Team members can view document requests for assigned jobs"
ON public.document_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN team_members tm ON tm.employer_id = j.employer_id
    WHERE a.id = document_requests.application_id
    AND tm.user_id = auth.uid()
    AND tm.status = 'active'
    AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);

-- Team members can create document requests if permitted
CREATE POLICY "Team members can create document requests if permitted"
ON public.document_requests FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN team_members tm ON tm.employer_id = j.employer_id
    WHERE a.id = document_requests.application_id
    AND tm.user_id = auth.uid()
    AND tm.status = 'active'
    AND tm.can_send_documents = true
    AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);

-- Team members can update document requests if permitted
CREATE POLICY "Team members can update document requests if permitted"
ON public.document_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN team_members tm ON tm.employer_id = j.employer_id
    WHERE a.id = document_requests.application_id
    AND tm.user_id = auth.uid()
    AND tm.status = 'active'
    AND tm.can_send_documents = true
    AND (array_length(tm.assigned_job_ids, 1) IS NULL OR j.id = ANY(tm.assigned_job_ids))
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_document_requests_updated_at
BEFORE UPDATE ON public.document_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for requested documents (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('requested-documents', 'requested-documents', false);

-- Storage policies for requested-documents bucket

-- Candidates can upload to their own folder
CREATE POLICY "Candidates can upload requested documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'requested-documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Candidates can view their own uploaded documents
CREATE POLICY "Candidates can view their requested documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'requested-documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Candidates can update their own documents
CREATE POLICY "Candidates can update their requested documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'requested-documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Candidates can delete their own documents
CREATE POLICY "Candidates can delete their requested documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'requested-documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Employers can view documents for their applicants
CREATE POLICY "Employers can view applicant requested documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'requested-documents' AND
  EXISTS (
    SELECT 1 FROM document_requests dr
    JOIN applications a ON a.id = dr.application_id
    JOIN jobs j ON j.id = a.job_id
    WHERE dr.file_url LIKE '%' || name || '%'
    AND j.employer_id = auth.uid()
  )
);