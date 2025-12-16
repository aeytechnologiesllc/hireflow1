-- Add file attachment columns to messages table
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_size INTEGER;

-- Create storage bucket for message attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-attachments', 'message-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for message attachments bucket
CREATE POLICY "Users can upload message attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'message-attachments');

CREATE POLICY "Users can view message attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'message-attachments');

CREATE POLICY "Users can delete their message attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'message-attachments');