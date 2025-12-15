-- Add employer_notes column for internal team notes about applicants
ALTER TABLE public.applications 
ADD COLUMN employer_notes text DEFAULT NULL;

-- Allow employers to update employer_notes (existing policy already allows this via "Employers can update applications to their jobs")