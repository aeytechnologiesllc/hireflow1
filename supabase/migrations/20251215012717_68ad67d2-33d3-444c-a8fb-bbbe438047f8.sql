-- Enable realtime for documents table
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;

-- Set replica identity to full for complete row data
ALTER TABLE public.documents REPLICA IDENTITY FULL;

-- Also allow the system to insert notifications (for document notifications)
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications" 
ON public.notifications 
FOR INSERT 
WITH CHECK (true);