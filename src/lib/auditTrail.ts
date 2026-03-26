import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { 
  generateDocumentHash, 
  generateV1Hash, 
  generateV2Hash, 
  generateV3Hash,
  getClientIP, 
  getUserAgent,
  getUTCTimestamp 
} from "./documentHash";

// Standardized audit event types
export type AuditEventType = 
  | 'document_created'
  | 'document_viewed'
  | 'signing_session_started'
  | 'electronic_consent_confirmed'
  | 'candidate_signed'
  | 'employer_review_confirmed'
  | 'employer_countersigned'
  | 'document_completed'
  | 'document_declined'
  | 'document_downloaded'
  | 'document_voided'
  // Legacy event names (for backward compatibility)
  | 'created'
  | 'viewed'
  | 'declined'
  | 'downloaded'
  | 'voided'
  | 'edited';

export interface AuditLogEntry {
  id?: string;
  document_id: string;
  user_id: string | null;
  action: AuditEventType | string;
  created_at?: string;
  details?: Record<string, unknown>;
  signer_name?: string;
  signer_email?: string;
  signer_role?: 'employer' | 'candidate';
  signature_method?: 'drawn' | 'typed' | 'click_to_sign';
  consent_confirmed?: boolean;
  document_hash?: string;
  document_version?: number;
  location_city?: string;
  location_region?: string;
  location_country?: string;
  page_numbers_signed?: string[];
  ip_address?: string;
  user_agent?: string;
  // New fields for enhanced audit trail
  signature_event_id?: string;
  pre_signature_hash?: string;
  post_signature_hash?: string;
  signing_order_position?: number;
  timestamp_utc?: string;
}

export interface GeoLocation {
  ip: string;
  city: string;
  region: string;
  country: string;
  countryCode: string;
}

/**
 * Generate a unique signature event ID
 */
export function generateSignatureEventId(): string {
  return crypto.randomUUID();
}

/**
 * Get geolocation data from IP
 */
export async function getGeolocation(): Promise<GeoLocation> {
  try {
    const ip = await getClientIP();
    const { data, error } = await supabase.functions.invoke('geolocate-ip', {
      body: { ip }
    });
    
    if (error || !data?.success) {
      return {
        ip,
        city: 'Unknown',
        region: 'Unknown',
        country: 'Unknown',
        countryCode: 'XX'
      };
    }
    
    return {
      ip: data.ip || ip,
      city: data.city || 'Unknown',
      region: data.region || 'Unknown',
      country: data.country || 'Unknown',
      countryCode: data.countryCode || 'XX'
    };
  } catch (error) {
    console.error('Failed to get geolocation:', error);
    return {
      ip: 'unknown',
      city: 'Unknown',
      region: 'Unknown',
      country: 'Unknown',
      countryCode: 'XX'
    };
  }
}

/**
 * Create a comprehensive audit log entry with enhanced tracking
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<string | null> {
  try {
    const geo = await getGeolocation();
    const userAgent = getUserAgent();
    const timestampUtc = getUTCTimestamp();
    const signatureEventId = entry.signature_event_id || generateSignatureEventId();
    
    const insertData: TablesInsert<"document_audit_logs"> = {
      document_id: entry.document_id,
      user_id: entry.user_id,
      action: entry.action,
      details: entry.details || {},
      ip_address: geo.ip,
      user_agent: userAgent,
      signer_name: entry.signer_name,
      signer_email: entry.signer_email,
      signer_role: entry.signer_role,
      signature_method: entry.signature_method,
      consent_confirmed: entry.consent_confirmed,
      document_hash: entry.document_hash,
      document_version: entry.document_version || 1,
      location_city: geo.city,
      location_region: geo.region,
      location_country: geo.country,
      page_numbers_signed: entry.page_numbers_signed,
      signature_event_id: signatureEventId,
      pre_signature_hash: entry.pre_signature_hash,
      post_signature_hash: entry.post_signature_hash,
      signing_order_position: entry.signing_order_position,
      timestamp_utc: timestampUtc
    };
    
    const { error } = await supabase
      .from('document_audit_logs')
      .insert([insertData]);
    
    if (error) {
      console.error('Failed to create audit log:', error);
      return null;
    }
    
    return signatureEventId;
  } catch (error) {
    console.error('Error creating audit log:', error);
    return null;
  }
}

/**
 * Log document creation (v1 hash generated)
 */
export async function logDocumentCreated(
  documentId: string,
  userId: string,
  signerName: string,
  signerEmail: string,
  documentContent: string
): Promise<string> {
  const v1Hash = await generateV1Hash(documentContent);
  
  await createAuditLog({
    document_id: documentId,
    user_id: userId,
    action: 'document_created',
    signer_name: signerName,
    signer_email: signerEmail,
    signer_role: 'employer',
    document_hash: v1Hash,
    document_version: 1,
    details: { 
      event: 'Document created and ready for signing',
      version_state: 'v1_draft',
      hash_algorithm: 'SHA-256'
    }
  });
  
  return v1Hash;
}

/**
 * Log signing session started
 */
export async function logSigningSessionStarted(
  documentId: string,
  userId: string,
  signerName: string,
  signerEmail: string,
  signerRole: 'employer' | 'candidate',
  currentHash: string,
  documentVersion: number
): Promise<string | null> {
  return createAuditLog({
    document_id: documentId,
    user_id: userId,
    action: 'signing_session_started',
    signer_name: signerName,
    signer_email: signerEmail,
    signer_role: signerRole,
    document_hash: currentHash,
    document_version: documentVersion,
    details: { 
      event: 'Signing session initiated',
      session_type: signerRole === 'candidate' ? 'initial_signing' : 'countersigning'
    }
  });
}

/**
 * Log electronic consent confirmed (ESIGN Act compliance)
 */
export async function logElectronicConsentConfirmed(
  documentId: string,
  userId: string,
  signerName: string,
  signerEmail: string,
  signerRole: 'employer' | 'candidate',
  documentVersion: number,
  currentHash: string
): Promise<string | null> {
  return createAuditLog({
    document_id: documentId,
    user_id: userId,
    action: 'electronic_consent_confirmed',
    signer_name: signerName,
    signer_email: signerEmail,
    signer_role: signerRole,
    consent_confirmed: true,
    document_hash: currentHash,
    document_version: documentVersion,
    details: { 
      event: 'Electronic signature consent confirmed',
      consent_statement: 'I acknowledge that I am signing this document electronically and that my electronic signature has the same legal effect as a handwritten signature.',
      esign_act_compliant: true
    }
  });
}

/**
 * Log document viewed
 */
export async function logDocumentViewed(
  documentId: string,
  userId: string,
  signerName: string,
  signerEmail: string,
  signerRole: 'employer' | 'candidate',
  currentHash: string,
  documentVersion?: number
): Promise<void> {
  await createAuditLog({
    document_id: documentId,
    user_id: userId,
    action: 'document_viewed',
    signer_name: signerName,
    signer_email: signerEmail,
    signer_role: signerRole,
    document_hash: currentHash,
    document_version: documentVersion || 1,
    details: { event: 'Document opened for viewing' }
  });
}

/**
 * Log candidate signature (v1 -> v2 transition)
 */
export async function logCandidateSigned(
  documentId: string,
  userId: string,
  signerName: string,
  signerEmail: string,
  signatureMethod: 'drawn' | 'typed' | 'click_to_sign',
  documentContent: string,
  signatureData: string,
  preSignatureHash: string
): Promise<{ hash: string; eventId: string | null }> {
  const timestamp = getUTCTimestamp();
  const v2Hash = await generateV2Hash(documentContent, signatureData, signerEmail, timestamp);
  
  const eventId = await createAuditLog({
    document_id: documentId,
    user_id: userId,
    action: 'candidate_signed',
    signer_name: signerName,
    signer_email: signerEmail,
    signer_role: 'candidate',
    signature_method: signatureMethod,
    consent_confirmed: true,
    document_hash: v2Hash,
    document_version: 2,
    pre_signature_hash: preSignatureHash,
    post_signature_hash: v2Hash,
    signing_order_position: 1,
    page_numbers_signed: ['1'],
    details: { 
      event: 'Candidate signed document',
      version_transition: 'v1 -> v2',
      signature_applied: true,
      timestamp_utc: timestamp
    }
  });
  
  return { hash: v2Hash, eventId };
}

/**
 * Log employer review confirmed (before countersigning)
 */
export async function logEmployerReviewConfirmed(
  documentId: string,
  userId: string,
  signerName: string,
  signerEmail: string,
  v2Hash: string
): Promise<string | null> {
  return createAuditLog({
    document_id: documentId,
    user_id: userId,
    action: 'employer_review_confirmed',
    signer_name: signerName,
    signer_email: signerEmail,
    signer_role: 'employer',
    document_hash: v2Hash,
    document_version: 2,
    details: { 
      event: 'Employer confirmed review of document and candidate signature',
      review_statement: 'I have reviewed the document and the candidate signature before countersigning.',
      candidate_signature_verified: true
    }
  });
}

/**
 * Log employer countersignature (v2 -> v3 transition)
 */
export async function logEmployerCountersigned(
  documentId: string,
  userId: string,
  signerName: string,
  signerEmail: string,
  signatureMethod: 'drawn' | 'typed' | 'click_to_sign',
  documentContent: string,
  candidateSignatureData: string,
  candidateEmail: string,
  candidateTimestamp: string,
  employerSignatureData: string,
  preSignatureHash: string
): Promise<{ hash: string; eventId: string | null }> {
  const timestamp = getUTCTimestamp();
  const v3Hash = await generateV3Hash(
    documentContent,
    candidateSignatureData,
    candidateEmail,
    candidateTimestamp,
    employerSignatureData,
    signerEmail,
    timestamp
  );
  
  const eventId = await createAuditLog({
    document_id: documentId,
    user_id: userId,
    action: 'employer_countersigned',
    signer_name: signerName,
    signer_email: signerEmail,
    signer_role: 'employer',
    signature_method: signatureMethod,
    consent_confirmed: true,
    document_hash: v3Hash,
    document_version: 3,
    pre_signature_hash: preSignatureHash,
    post_signature_hash: v3Hash,
    signing_order_position: 2,
    page_numbers_signed: ['1'],
    details: { 
      event: 'Employer countersigned document',
      version_transition: 'v2 -> v3',
      signature_applied: true,
      timestamp_utc: timestamp
    }
  });
  
  return { hash: v3Hash, eventId };
}

/**
 * Log document completed and locked (final state)
 */
export async function logDocumentCompleted(
  documentId: string,
  userId: string,
  signerName: string,
  signerEmail: string,
  finalHash: string
): Promise<void> {
  await createAuditLog({
    document_id: documentId,
    user_id: userId,
    action: 'document_completed',
    signer_name: signerName,
    signer_email: signerEmail,
    signer_role: 'employer',
    document_hash: finalHash,
    document_version: 3,
    details: { 
      event: 'Document fully executed - all signatures collected',
      version_state: 'v3_fully_executed',
      final_hash: finalHash,
      is_locked: true,
      hash_algorithm: 'SHA-256'
    }
  });
}

/**
 * Log document signed (legacy - backward compatible)
 */
export async function logDocumentSigned(
  documentId: string,
  userId: string,
  signerName: string,
  signerEmail: string,
  signerRole: 'employer' | 'candidate',
  signatureMethod: 'drawn' | 'typed' | 'click_to_sign',
  consentConfirmed: boolean,
  documentContent: string,
  signatureData: string,
  documentVersion: number
): Promise<string> {
  const hash = await generateDocumentHash(
    `${documentContent}|${signatureData}|${signerEmail}|${getUTCTimestamp()}`
  );
  
  await createAuditLog({
    document_id: documentId,
    user_id: userId,
    action: signerRole === 'candidate' ? 'candidate_signed' : 'employer_countersigned',
    signer_name: signerName,
    signer_email: signerEmail,
    signer_role: signerRole,
    signature_method: signatureMethod,
    consent_confirmed: consentConfirmed,
    document_hash: hash,
    document_version: documentVersion,
    signing_order_position: signerRole === 'candidate' ? 1 : 2,
    page_numbers_signed: ['1'],
    details: { 
      event: signerRole === 'candidate' ? 'Candidate signed document' : 'Employer countersigned document',
      signature_applied: true
    }
  });
  
  return hash;
}

/**
 * Log document declined
 */
export async function logDocumentDeclined(
  documentId: string,
  userId: string,
  signerName: string,
  signerEmail: string,
  signerRole: 'employer' | 'candidate',
  declineReason: string,
  currentHash: string
): Promise<void> {
  await createAuditLog({
    document_id: documentId,
    user_id: userId,
    action: 'document_declined',
    signer_name: signerName,
    signer_email: signerEmail,
    signer_role: signerRole,
    document_hash: currentHash,
    details: { 
      event: 'Document declined',
      decline_reason: declineReason
    }
  });
}

/**
 * Log document downloaded
 */
export async function logDocumentDownloaded(
  documentId: string,
  userId: string,
  signerName: string,
  signerEmail: string,
  signerRole: 'employer' | 'candidate',
  documentHash: string
): Promise<void> {
  await createAuditLog({
    document_id: documentId,
    user_id: userId,
    action: 'document_downloaded',
    signer_name: signerName,
    signer_email: signerEmail,
    signer_role: signerRole,
    document_hash: documentHash,
    details: { 
      event: 'Document downloaded as PDF',
      format: 'PDF'
    }
  });
}

/**
 * Log document voided
 */
export async function logDocumentVoided(
  documentId: string,
  userId: string,
  signerName: string,
  signerEmail: string,
  voidReason: string,
  currentHash: string
): Promise<void> {
  await createAuditLog({
    document_id: documentId,
    user_id: userId,
    action: 'document_voided',
    signer_name: signerName,
    signer_email: signerEmail,
    signer_role: 'employer',
    document_hash: currentHash,
    details: { 
      event: 'Document voided',
      void_reason: voidReason
    }
  });
}

/**
 * Fetch audit trail for a document
 */
export async function fetchAuditTrail(documentId: string): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from('document_audit_logs')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('Failed to fetch audit trail:', error);
    return [];
  }
  
  return (data || []).map(item => ({
    id: item.id,
    document_id: item.document_id,
    user_id: item.user_id,
    action: item.action,
    created_at: item.created_at,
    details: item.details as Record<string, unknown> | undefined,
    signer_name: item.signer_name,
    signer_email: item.signer_email,
    signer_role: item.signer_role as 'employer' | 'candidate' | undefined,
    signature_method: item.signature_method as 'drawn' | 'typed' | 'click_to_sign' | undefined,
    consent_confirmed: item.consent_confirmed,
    document_hash: item.document_hash,
    document_version: item.document_version,
    location_city: item.location_city,
    location_region: item.location_region,
    location_country: item.location_country,
    page_numbers_signed: item.page_numbers_signed,
    ip_address: item.ip_address,
    user_agent: item.user_agent,
    signature_event_id: item.signature_event_id,
    pre_signature_hash: item.pre_signature_hash,
    post_signature_hash: item.post_signature_hash,
    signing_order_position: item.signing_order_position,
    timestamp_utc: item.timestamp_utc
  }));
}
