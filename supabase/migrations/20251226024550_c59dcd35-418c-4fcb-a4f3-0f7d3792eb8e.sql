-- Enable REPLICA IDENTITY for complete row data during updates
ALTER TABLE public.document_requests REPLICA IDENTITY FULL;

-- Add to realtime publication so subscriptions work
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_requests;