-- The signing record, for the whole hiring side (2026-10-11, the final gap
-- check).
--
-- document_audit_log() gave the full record only to the person who sent the
-- document. A document a team member sent was invisible to the business's
-- owner (and a document the owner sent, to the team member who handles it).
-- Now the hiring side is the sender, the job's owner, or an active team
-- member who may send documents for that job: they read every column. The
-- applicant's view is unchanged (their own rows whole; the team's rows
-- without IP, device, place or email), and anyone else reads nothing.

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
  owner uuid;
  job uuid;
  hiring_side boolean;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not_signed_in' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT d.sender_id, d.recipient_id, j.employer_id, j.id INTO sender, recipient, owner, job
    FROM public.documents d
    LEFT JOIN public.applications a ON a.id = d.application_id
    LEFT JOIN public.jobs j ON j.id = a.job_id
   WHERE d.id = p_document_id;
  hiring_side := me = sender OR me = owner OR EXISTS (
    SELECT 1 FROM public.team_members tm
     WHERE tm.user_id = me AND tm.employer_id = owner AND tm.status = 'active' AND tm.can_send_documents = true
       AND (array_length(tm.assigned_job_ids, 1) IS NULL OR job = ANY (tm.assigned_job_ids))
  );
  IF NOT coalesce(hiring_side, false) AND recipient IS DISTINCT FROM me THEN
    -- Not theirs: nothing, as the table's own rule answered before.
    RETURN;
  END IF;
  IF coalesce(hiring_side, false) THEN
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
