-- Enable realtime for interviews table
ALTER PUBLICATION supabase_realtime ADD TABLE public.interviews;

-- Set REPLICA IDENTITY FULL to get old/new row data in realtime events
ALTER TABLE public.interviews REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;