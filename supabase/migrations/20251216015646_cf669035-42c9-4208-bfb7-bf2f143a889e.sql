-- Allow invitees to mark invitations as accepted
CREATE POLICY "Invitees can accept their invitations"
ON public.team_invitations
FOR UPDATE
TO authenticated
USING (
  status = 'pending'::invitation_status
)
WITH CHECK (
  status = 'accepted'::invitation_status
);