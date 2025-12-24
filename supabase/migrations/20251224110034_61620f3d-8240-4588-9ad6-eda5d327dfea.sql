-- Enable REPLICA IDENTITY FULL on applications table for complete real-time update data
ALTER TABLE public.applications REPLICA IDENTITY FULL;