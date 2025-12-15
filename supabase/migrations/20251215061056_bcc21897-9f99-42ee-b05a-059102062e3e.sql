-- Add INSERT policy for user_roles table to allow users to insert team_member role for themselves
CREATE POLICY "Users can insert team_member role for themselves" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND role = 'team_member'::app_role);