-- Enable REPLICA IDENTITY FULL on applications table for complete realtime payloads
ALTER TABLE public.applications REPLICA IDENTITY FULL;