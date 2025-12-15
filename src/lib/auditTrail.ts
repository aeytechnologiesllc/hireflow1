import { supabase } from "@/integrations/supabase/client";
import { generateDocumentHash, generateSignedDocumentHash, getClientIP, getUserAgent } from "./documentHash";

export interface AuditLogEntry {
  id?: string;
  document_id: string;
  user_id: string | null;
  action: string;
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
}

export interface GeoLocation {
  ip: string;
  city: string;
  region: string;
  country: string;
  countryCode: string;
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
 * Create a comprehensive audit log entry
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const geo = await getGeolocation();
    const userAgent = getUserAgent();
    
    const insertData: Record<string, unknown> = {
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
      page_numbers_signed: entry.page_numbers_signed
    };
    
    const { error } = await supabase
      .from('document_audit_logs')
      .insert([insertData] as any);
    
    if (error) {
      console.error('Failed to create audit log:', error);
    }
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
}

/**
 * Log document creation
 */
export async function logDocumentCreated(
  documentId: string,
  userId: string,
  signerName: string,
  signerEmail: string,
  documentContent: string
): Promise<string> {
  const hash = await generateDocumentHash(documentContent);
  
  await createAuditLog({
    document_id: documentId,
    user_id: userId,
    action: 'created',
    signer_name: signerName,
    signer_email: signerEmail,
    signer_role: 'employer',
    document_hash: hash,
    document_version: 1,
    details: { event: 'Document created and ready for signing' }
  });
  
  return hash;
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
  currentHash: string
): Promise<void> {
  await createAuditLog({
    document_id: documentId,
    user_id: userId,
    action: 'viewed',
    signer_name: signerName,
    signer_email: signerEmail,
    signer_role: signerRole,
    document_hash: currentHash,
    details: { event: 'Document opened for viewing' }
  });
}

/**
 * Log document signed
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
  const hash = await generateSignedDocumentHash(
    documentContent,
    signatureData,
    signerEmail,
    new Date().toISOString()
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
    page_numbers_signed: ['1'], // Default to page 1 for single-page docs
    details: { 
      event: signerRole === 'candidate' ? 'Candidate signed document' : 'Employer countersigned document',
      signature_applied: true
    }
  });
  
  return hash;
}

/**
 * Log document completed (fully signed by both parties)
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
    action: 'completed',
    signer_name: signerName,
    signer_email: signerEmail,
    signer_role: 'employer',
    document_hash: finalHash,
    details: { 
      event: 'Document fully executed - all signatures collected',
      final_hash: finalHash
    }
  });
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
    action: 'declined',
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
    action: 'downloaded',
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
    action: 'voided',
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
  
  // Map the data to our interface type
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
    user_agent: item.user_agent
  }));
}
