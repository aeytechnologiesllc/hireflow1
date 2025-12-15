-- Enable real-time for applications table to sync AVA voice actions with dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE public.applications;