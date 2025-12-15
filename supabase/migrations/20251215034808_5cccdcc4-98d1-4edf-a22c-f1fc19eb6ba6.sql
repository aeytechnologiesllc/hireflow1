-- Allow users to delete their own messages (for conversation deletion)
CREATE POLICY "Users can delete their own messages" 
ON public.messages 
FOR DELETE 
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);