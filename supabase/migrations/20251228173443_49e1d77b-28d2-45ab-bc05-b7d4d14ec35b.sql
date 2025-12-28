-- Add resume_score column to store the raw AI resume evaluation score
ALTER TABLE public.applications ADD COLUMN resume_score numeric;