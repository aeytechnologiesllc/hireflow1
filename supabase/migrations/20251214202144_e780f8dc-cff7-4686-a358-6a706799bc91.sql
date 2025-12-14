-- Add audit trail and workflow fields to documents table
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS declined_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS decline_reason text,
ADD COLUMN IF NOT EXISTS signature_data text,
ADD COLUMN IF NOT EXISTS ip_address text,
ADD COLUMN IF NOT EXISTS user_agent text,
ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS reminder_sent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS viewed_at timestamp with time zone;

-- Create document_audit_logs table for full audit trail
CREATE TABLE IF NOT EXISTS public.document_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on audit logs
ALTER TABLE public.document_audit_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for audit logs - employers and recipients can view
CREATE POLICY "Users can view audit logs for their documents"
ON public.document_audit_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_audit_logs.document_id
    AND (d.sender_id = auth.uid() OR d.recipient_id = auth.uid())
  )
);

-- Create policy for inserting audit logs (via service role or trigger)
CREATE POLICY "System can insert audit logs"
ON public.document_audit_logs
FOR INSERT
WITH CHECK (true);

-- Create document templates table
CREATE TABLE IF NOT EXISTS public.document_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employer_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  template_type text NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on templates
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for templates
CREATE POLICY "Employers can manage their templates"
ON public.document_templates
FOR ALL
USING (auth.uid() = employer_id)
WITH CHECK (auth.uid() = employer_id);

-- Update documents table RLS to allow employers to create documents
CREATE POLICY "Employers can create documents"
ON public.documents
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.id = documents.application_id
    AND j.employer_id = auth.uid()
  )
);

-- Update documents table RLS to allow employers to update documents
CREATE POLICY "Employers can update their documents"
ON public.documents
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.id = documents.application_id
    AND j.employer_id = auth.uid()
  )
);

-- Allow candidates to update document status (for signing/declining)
CREATE POLICY "Candidates can update document status"
ON public.documents
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM applications a
    WHERE a.id = documents.application_id
    AND a.candidate_id = auth.uid()
  )
);

-- Create trigger for updating timestamps
CREATE TRIGGER update_document_templates_updated_at
BEFORE UPDATE ON public.document_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();