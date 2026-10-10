-- ============================================================================
-- The signing record: the hiring team sees everything, the applicant never
-- sees the team's IP, device or location (2026-10-11). docs/DOCUMENT-SIGNING.md.
-- ============================================================================
-- The owner, asking that signing record location, IP and device details:
-- "the employer will see all of the applicant detail stuff, but the
-- applicant, when they see the signature, they don't get to see device
-- fingerprinting, IP addresses of the employer."
--
-- Until now "Users can view audit logs for their documents" let the
-- applicant (the document's recipient) read every row of a document's
-- record, the team's IP address, browser and email included, straight from
-- the table. This keeps who may read the record as it was and changes what
-- they read:
--
--   1. The private columns (ip_address, user_agent, location_*, details,
--      signer_email) can no longer be selected from a client at all.
--   2. public.document_audit_log(p_document_id) returns the record to the
--      same two people as before (the sender and the recipient): the sender
--      (the hiring team) gets every column of every row; the recipient (the
--      applicant) gets every column of their own rows and, for the team's
--      rows, only what happened and when (no IP, device, location, email).
--
-- The signing function (service role) and inserts from the app are not
-- affected. Re-runnable.
-- ============================================================================

SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- 1. no private column from a client --------------------------------------------------
REVOKE SELECT ON public.document_audit_logs FROM anon, authenticated;
GRANT SELECT (
  id, document_id, user_id, action, created_at, signer_name, signer_role,
  signature_method, consent_confirmed, document_hash, document_version,
  page_numbers_signed, signature_event_id, pre_signature_hash,
  post_signature_hash, signing_order_position, timestamp_utc
) ON public.document_audit_logs TO authenticated;

-- 2. the record, each side its own view ------------------------------------------------
CREATE OR REPLACE FUNCTION public.document_audit_log(p_document_id uuid)
RETURNS SETOF public.document_audit_logs
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  sender uuid;
  recipient uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT d.sender_id, d.recipient_id INTO sender, recipient FROM public.documents d WHERE d.id = p_document_id;
  IF sender IS DISTINCT FROM me AND recipient IS DISTINCT FROM me THEN
    -- Not theirs: nothing, as the table's own rule answered before.
    RETURN;
  END IF;
  IF sender = me THEN
    RETURN QUERY SELECT * FROM public.document_audit_logs l WHERE l.document_id = p_document_id ORDER BY l.created_at;
    RETURN;
  END IF;
  -- The applicant: their own rows whole; the team's rows without where,
  -- what device, or which address they came from.
  RETURN QUERY
  SELECT l.id, l.document_id, l.user_id, l.action,
         CASE WHEN l.user_id = me THEN l.details ELSE '{}'::jsonb END,
         CASE WHEN l.user_id = me THEN l.ip_address ELSE NULL END,
         CASE WHEN l.user_id = me THEN l.user_agent ELSE NULL END,
         l.created_at, l.signer_name,
         CASE WHEN l.user_id = me THEN l.signer_email ELSE NULL END,
         l.signer_role, l.signature_method, l.consent_confirmed, l.document_hash, l.document_version,
         CASE WHEN l.user_id = me THEN l.location_city ELSE NULL END,
         CASE WHEN l.user_id = me THEN l.location_region ELSE NULL END,
         CASE WHEN l.user_id = me THEN l.location_country ELSE NULL END,
         l.page_numbers_signed, l.signature_event_id, l.pre_signature_hash, l.post_signature_hash,
         l.signing_order_position, l.timestamp_utc
    FROM public.document_audit_logs l
   WHERE l.document_id = p_document_id
   ORDER BY l.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.document_audit_log(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_audit_log(uuid) TO authenticated, service_role;

RESET lock_timeout;
RESET statement_timeout;

NOTIFY pgrst, 'reload schema';
