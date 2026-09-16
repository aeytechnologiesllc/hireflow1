import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { guardPublicAiCall } from '../_shared/rateLimit.ts';
import { isPartyToDocument } from '../_shared/documentParties.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Public shape: what a "verify this certificate" page genuinely needs.
// Signer names are only added when the caller proves (via Authorization
// header) that they are a party to this specific document — see
// resolveAuthorizedUserId below and ../_shared/documentParties.ts.
interface VerificationResponse {
  documentName: string;
  status: string;
  completionTimestamp: string | null;
  finalHash: string | null;
  verified: boolean;
  errorMessage?: string;
  /** True once an employer has withdrawn (pre-signature) or voided
   *  (post-signature, pre-countersignature) this document — status alone
   *  stays 'pending' either way, so the UI must check this separately to
   *  report the real reason verification failed instead of implying the
   *  document may have been tampered with. */
  isVoided?: boolean;
  signers?: {
    name: string;
    role: string;
    signedAt: string | null;
  }[];
}

function notFoundResponse(): VerificationResponse {
  return {
    documentName: 'Unknown',
    status: 'not_found',
    completionTimestamp: null,
    finalHash: null,
    verified: false,
    errorMessage: 'Document not found',
  };
}

/** The caller's user id, only if they sent a valid Authorization header. Never throws. */
async function resolveAuthorizedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  if (!authHeader || !anonKey || !url) return null;

  try {
    const supabaseUser = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabaseUser.auth.getUser();
    return user?.id ?? null;
  } catch (_e) {
    return null;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // This endpoint has no login requirement (anyone with a document code can
    // check a certificate), so it's brute-forceable by guessing codes. Cap it
    // per IP the same way every other public function in this project does.
    const limited = await guardPublicAiCall(req, 'verify-document', corsHeaders, 30, 3600);
    if (limited) return limited;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { documentCode } = await req.json();

    if (!documentCode) {
      return new Response(
        JSON.stringify({ error: 'Document code is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[verify-document] Verifying document: ${documentCode}`);

    // Fetch document by code
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('document_code', documentCode)
      .single();

    if (docError || !document) {
      console.log(`[verify-document] Document not found: ${documentCode}`);
      return new Response(
        JSON.stringify(notFoundResponse()),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine final hash
    const finalHash = document.v3_hash || document.v2_hash || document.document_hash;

    // Verify integrity (simple check - document has expected data)
    const isComplete = document.status === 'signed';
    const hasRequiredHashes = isComplete ? !!finalHash : true;
    const verified = hasRequiredHashes && !document.is_voided;

    // Report a voided document truthfully — it was cancelled by the
    // employer, not tampered with. Withdrawn (candidate never signed) and
    // voided (candidate signed, employer didn't countersign) get distinct,
    // honest copy rather than one generic "could not be verified".
    const voidedMessage = document.is_voided
      ? document.candidate_signed_at
        ? 'This document was voided by the employer after it was signed, before it was countersigned.'
        : 'This document was withdrawn by the employer before it was signed.'
      : undefined;

    const response: VerificationResponse = {
      documentName: document.name,
      status: document.status,
      completionTimestamp: document.signed_at || document.employer_signed_at,
      finalHash,
      verified,
      isVoided: !!document.is_voided,
      errorMessage: verified ? undefined : voidedMessage ?? 'Document integrity could not be verified',
    };

    // Signer names are only ever handed out to a caller who is actually a
    // party to this document (sender, recipient, the candidate on its
    // application, or that application's job owner) — never to an anonymous
    // certificate-code guesser.
    const authorizedUserId = await resolveAuthorizedUserId(req);
    const isParty = authorizedUserId
      ? await isPartyToDocument(document, authorizedUserId, async (applicationId) => {
          const { data: application } = await supabase
            .from('applications')
            .select('candidate_id, jobs(employer_id)')
            .eq('id', applicationId)
            .single();
          if (!application) return null;
          const job = (application as any).jobs;
          const employerId = Array.isArray(job) ? job[0]?.employer_id : job?.employer_id;
          return { candidateId: application.candidate_id ?? null, employerId: employerId ?? null };
        })
      : false;
    if (isParty) {
      const { data: auditLogs } = await supabase
        .from('document_audit_logs')
        .select('*')
        .eq('document_id', document.id)
        .in('action', ['candidate_signed', 'employer_countersigned'])
        .order('created_at', { ascending: true });

      const signers: VerificationResponse['signers'] = [];

      const candidateLog = auditLogs?.find((log: any) => log.action === 'candidate_signed');
      if (candidateLog || document.candidate_signed_at) {
        signers.push({
          name: candidateLog?.signer_name || 'Candidate',
          role: 'candidate',
          signedAt: document.candidate_signed_at,
        });
      }

      const employerLog = auditLogs?.find((log: any) => log.action === 'employer_countersigned');
      if (employerLog || document.employer_signed_at) {
        signers.push({
          name: employerLog?.signer_name || 'Employer',
          role: 'employer',
          signedAt: document.employer_signed_at,
        });
      }

      response.signers = signers;
    }

    console.log(`[verify-document] Verification complete: ${documentCode}, verified: ${verified}`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[verify-document] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        verified: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
