-- Add DELETE policy for team_invitations so inviters can delete their own invitations
CREATE POLICY "Inviters can delete their invitations"
ON public.team_invitations
FOR DELETE
USING (auth.uid() = inviter_id);