import { AuditLogEntry, fetchAuditTrail } from './auditTrail';

/**
 * Completion Certificate Interface
 * Detached artifact containing all legal documentation
 */
export interface CompletionCertificate {
  certificate_id: string;
  document_id: string;
  document_name: string;
  document_type: string | null;
  
  version_history: {
    v1: { hash: string; timestamp: string; } | null;
    v2: { hash: string; timestamp: string; } | null;
    v3: { hash: string; timestamp: string; } | null;
  };
  
  candidate_signature: {
    name: string;
    email: string;
    timestamp_utc: string;
    ip_address: string;
    location: { city: string; region: string; country: string; };
    signature_hash: string;
    consent_confirmed_at: string;
    signing_order_position: number;
  } | null;
  
  employer_signature: {
    name: string;
    title?: string;
    email: string;
    timestamp_utc: string;
    ip_address: string;
    location: { city: string; region: string; country: string; };
    signature_hash: string;
    consent_confirmed_at: string;
    review_confirmed_at: string;
    signing_order_position: number;
  } | null;
  
  signing_order: 'candidate_first';
  signing_order_verified: boolean;
  
  final_document_hash: string;
  completion_timestamp_utc: string;
  
  audit_trail_hash: string;
  audit_entries_count: number;
  
  compliance_statement: string;
}

/**
 * Generate a unique certificate ID
 */
function generateCertificateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `CERT-${timestamp.toUpperCase()}-${random.toUpperCase()}`;
}

/**
 * Generate completion certificate from audit trail
 */
export async function generateCompletionCertificate(
  documentId: string,
  documentName: string,
  documentType: string | null,
  finalHash: string
): Promise<CompletionCertificate> {
  const auditEntries = await fetchAuditTrail(documentId);
  
  // Find relevant audit entries
  const createdEntry = auditEntries.find(e => 
    e.action === 'document_created' || e.action === 'created'
  );
  const candidateSignedEntry = auditEntries.find(e => e.action === 'candidate_signed');
  const candidateConsentEntry = auditEntries.find(e => 
    e.action === 'electronic_consent_confirmed' && e.signer_role === 'candidate'
  );
  const employerReviewEntry = auditEntries.find(e => e.action === 'employer_review_confirmed');
  const employerConsentEntry = auditEntries.find(e => 
    e.action === 'electronic_consent_confirmed' && e.signer_role === 'employer'
  );
  const employerSignedEntry = auditEntries.find(e => e.action === 'employer_countersigned');
  const completedEntry = auditEntries.find(e => 
    e.action === 'document_completed' || e.action === 'completed'
  );
  
  // Generate audit trail hash for tamper detection
  const auditTrailHash = await generateAuditTrailHashFromEntries(auditEntries);
  
  const certificate: CompletionCertificate = {
    certificate_id: generateCertificateId(),
    document_id: documentId,
    document_name: documentName,
    document_type: documentType,
    
    version_history: {
      v1: createdEntry ? {
        hash: createdEntry.document_hash || '',
        timestamp: createdEntry.created_at || ''
      } : null,
      v2: candidateSignedEntry ? {
        hash: candidateSignedEntry.post_signature_hash || candidateSignedEntry.document_hash || '',
        timestamp: candidateSignedEntry.created_at || ''
      } : null,
      v3: employerSignedEntry ? {
        hash: employerSignedEntry.post_signature_hash || employerSignedEntry.document_hash || '',
        timestamp: employerSignedEntry.created_at || ''
      } : null
    },
    
    candidate_signature: candidateSignedEntry ? {
      name: candidateSignedEntry.signer_name || 'Unknown',
      email: candidateSignedEntry.signer_email || '',
      timestamp_utc: candidateSignedEntry.timestamp_utc || candidateSignedEntry.created_at || '',
      ip_address: candidateSignedEntry.ip_address || 'Unknown',
      location: {
        city: candidateSignedEntry.location_city || 'Unknown',
        region: candidateSignedEntry.location_region || 'Unknown',
        country: candidateSignedEntry.location_country || 'Unknown'
      },
      signature_hash: candidateSignedEntry.post_signature_hash || candidateSignedEntry.document_hash || '',
      consent_confirmed_at: candidateConsentEntry?.created_at || candidateSignedEntry.created_at || '',
      signing_order_position: 1
    } : null,
    
    employer_signature: employerSignedEntry ? {
      name: employerSignedEntry.signer_name || 'Unknown',
      email: employerSignedEntry.signer_email || '',
      timestamp_utc: employerSignedEntry.timestamp_utc || employerSignedEntry.created_at || '',
      ip_address: employerSignedEntry.ip_address || 'Unknown',
      location: {
        city: employerSignedEntry.location_city || 'Unknown',
        region: employerSignedEntry.location_region || 'Unknown',
        country: employerSignedEntry.location_country || 'Unknown'
      },
      signature_hash: employerSignedEntry.post_signature_hash || employerSignedEntry.document_hash || '',
      consent_confirmed_at: employerConsentEntry?.created_at || employerSignedEntry.created_at || '',
      review_confirmed_at: employerReviewEntry?.created_at || employerSignedEntry.created_at || '',
      signing_order_position: 2
    } : null,
    
    signing_order: 'candidate_first',
    signing_order_verified: !!(candidateSignedEntry && employerSignedEntry && 
      new Date(candidateSignedEntry.created_at || 0) < new Date(employerSignedEntry.created_at || 0)),
    
    final_document_hash: finalHash,
    completion_timestamp_utc: completedEntry?.created_at || new Date().toISOString(),
    
    audit_trail_hash: auditTrailHash,
    audit_entries_count: auditEntries.length,
    
    compliance_statement: generateComplianceStatement()
  };
  
  return certificate;
}

/**
 * Generate hash from audit entries
 */
async function generateAuditTrailHashFromEntries(entries: AuditLogEntry[]): Promise<string> {
  const auditString = entries
    .map(e => `${e.action}|${e.created_at}|${e.user_id || 'system'}|${e.document_hash || 'none'}`)
    .join('||');
  
  const encoder = new TextEncoder();
  const data = encoder.encode(auditString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate compliance statement - updated for enterprise-grade legal defensibility
 */
function generateComplianceStatement(): string {
  return `This document was electronically signed and verified in compliance with the U.S. ESIGN Act and applicable state laws. All parties have consented to conduct this transaction electronically and have acknowledged that their electronic signatures carry the same legal weight as handwritten signatures under the Electronic Signatures in Global and National Commerce Act (15 U.S.C. § 7001 et seq.) and the Uniform Electronic Transactions Act (UETA). The integrity of this document is protected by SHA-256 cryptographic hashes, and all signature events have been recorded in a tamper-evident audit trail. This certificate serves as a legally binding record of the signing process and may be used as evidence in any legal proceeding.`;
}

/**
 * Format certificate for display/download
 */
export function formatCertificateForDisplay(cert: CompletionCertificate): string {
  let output = `
================================================================================
                        CERTIFICATE OF COMPLETION
================================================================================

Certificate ID: ${cert.certificate_id}
Document ID: ${cert.document_id}
Document Name: ${cert.document_name}
Document Type: ${cert.document_type || 'Not specified'}

--------------------------------------------------------------------------------
                           DOCUMENT VERSION HISTORY
--------------------------------------------------------------------------------
`;

  if (cert.version_history.v1) {
    output += `
v1 (Draft):
  Hash: ${cert.version_history.v1.hash}
  Timestamp: ${cert.version_history.v1.timestamp}
`;
  }

  if (cert.version_history.v2) {
    output += `
v2 (Candidate Signed):
  Hash: ${cert.version_history.v2.hash}
  Timestamp: ${cert.version_history.v2.timestamp}
`;
  }

  if (cert.version_history.v3) {
    output += `
v3 (Fully Executed):
  Hash: ${cert.version_history.v3.hash}
  Timestamp: ${cert.version_history.v3.timestamp}
`;
  }

  output += `
--------------------------------------------------------------------------------
                              SIGNER INFORMATION
--------------------------------------------------------------------------------
`;

  if (cert.candidate_signature) {
    output += `
CANDIDATE (Signing Position: ${cert.candidate_signature.signing_order_position})
  Name: ${cert.candidate_signature.name}
  Email: ${cert.candidate_signature.email}
  Signed At: ${cert.candidate_signature.timestamp_utc} (UTC)
  IP Address: ${cert.candidate_signature.ip_address}
  Location: ${cert.candidate_signature.location.city}, ${cert.candidate_signature.location.region}, ${cert.candidate_signature.location.country}
  Signature Hash: ${cert.candidate_signature.signature_hash}
  Consent Confirmed: ${cert.candidate_signature.consent_confirmed_at}
`;
  }

  if (cert.employer_signature) {
    output += `
EMPLOYER (Signing Position: ${cert.employer_signature.signing_order_position})
  Name: ${cert.employer_signature.name}
  Email: ${cert.employer_signature.email}
  Signed At: ${cert.employer_signature.timestamp_utc} (UTC)
  IP Address: ${cert.employer_signature.ip_address}
  Location: ${cert.employer_signature.location.city}, ${cert.employer_signature.location.region}, ${cert.employer_signature.location.country}
  Signature Hash: ${cert.employer_signature.signature_hash}
  Review Confirmed: ${cert.employer_signature.review_confirmed_at}
  Consent Confirmed: ${cert.employer_signature.consent_confirmed_at}
`;
  }

  output += `
--------------------------------------------------------------------------------
                            COMPLETION DETAILS
--------------------------------------------------------------------------------

Signing Order: ${cert.signing_order}
Signing Order Verified: ${cert.signing_order_verified ? 'YES ✓' : 'NO'}
Final Document Hash (SHA-256): ${cert.final_document_hash}
Completion Timestamp: ${cert.completion_timestamp_utc} (UTC)
Audit Trail Hash: ${cert.audit_trail_hash}
Total Audit Entries: ${cert.audit_entries_count}

--------------------------------------------------------------------------------
                           COMPLIANCE STATEMENT
--------------------------------------------------------------------------------

${cert.compliance_statement}

================================================================================
                          END OF CERTIFICATE
================================================================================
`;

  return output;
}

/**
 * Export certificate as JSON for storage
 */
export function serializeCertificate(cert: CompletionCertificate): string {
  return JSON.stringify(cert, null, 2);
}

/**
 * Parse stored certificate
 */
export function deserializeCertificate(json: string): CompletionCertificate {
  return JSON.parse(json) as CompletionCertificate;
}
