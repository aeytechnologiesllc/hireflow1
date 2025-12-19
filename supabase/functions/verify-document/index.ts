import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerificationResponse {
  documentCode: string;
  documentName: string;
  status: string;
  completionTimestamp: string | null;
  finalHash: string | null;
  signingOrder: string;
  signers: {
    name: string;
    role: string;
    signedAt: string | null;
  }[];
  verified: boolean;
  errorMessage?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
        JSON.stringify({
          documentCode,
          documentName: 'Unknown',
          status: 'not_found',
          completionTimestamp: null,
          finalHash: null,
          signingOrder: 'unknown',
          signers: [],
          verified: false,
          errorMessage: 'Document not found'
        } as VerificationResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch audit logs for signer information
    const { data: auditLogs } = await supabase
      .from('document_audit_logs')
      .select('*')
      .eq('document_id', document.id)
      .in('action', ['candidate_signed', 'employer_countersigned'])
      .order('created_at', { ascending: true });

    // Build signers list
    const signers = [];
    
    const candidateLog = auditLogs?.find((log: any) => log.action === 'candidate_signed');
    if (candidateLog || document.candidate_signed_at) {
      signers.push({
        name: candidateLog?.signer_name || 'Candidate',
        role: 'candidate',
        signedAt: document.candidate_signed_at
      });
    }

    const employerLog = auditLogs?.find((log: any) => log.action === 'employer_countersigned');
    if (employerLog || document.employer_signed_at) {
      signers.push({
        name: employerLog?.signer_name || 'Employer',
        role: 'employer',
        signedAt: document.employer_signed_at
      });
    }

    // Determine final hash
    const finalHash = document.v3_hash || document.v2_hash || document.document_hash;

    // Verify integrity (simple check - document has expected data)
    const isComplete = document.status === 'signed';
    const hasRequiredHashes = isComplete ? !!finalHash : true;
    const verified = hasRequiredHashes && !document.is_voided;

    const response: VerificationResponse = {
      documentCode: document.document_code,
      documentName: document.name,
      status: document.status,
      completionTimestamp: document.signed_at || document.employer_signed_at,
      finalHash,
      signingOrder: document.signing_order || 'candidate_first',
      signers,
      verified,
      errorMessage: verified ? undefined : 'Document integrity could not be verified'
    };

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
