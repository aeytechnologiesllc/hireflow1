/**
 * Document Hashing Utilities for SHA-256 integrity verification
 * Used for ESIGN Act and UETA compliance
 * Supports explicit document versioning (v1, v2, v3)
 */

export type DocumentVersion = 1 | 2 | 3;

export interface VersionedHashData {
  content: string;
  version: DocumentVersion;
  candidateSignature?: {
    data: string;
    email: string;
    timestamp: string;
  };
  employerSignature?: {
    data: string;
    email: string;
    timestamp: string;
  };
}

/**
 * Generate SHA-256 hash of document content
 */
export async function generateDocumentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Generate versioned document hash based on signing state
 * v1: Draft (unsigned) - just content
 * v2: Candidate signed - content + candidate signature
 * v3: Fully executed - content + both signatures
 */
export async function generateVersionedHash(data: VersionedHashData): Promise<string> {
  let hashInput = data.content;
  
  if (data.version >= 2 && data.candidateSignature) {
    hashInput += `|CANDIDATE|${data.candidateSignature.data}|${data.candidateSignature.email}|${data.candidateSignature.timestamp}`;
  }
  
  if (data.version >= 3 && data.employerSignature) {
    hashInput += `|EMPLOYER|${data.employerSignature.data}|${data.employerSignature.email}|${data.employerSignature.timestamp}`;
  }
  
  hashInput += `|VERSION:${data.version}`;
  
  return generateDocumentHash(hashInput);
}

/**
 * Generate v1 hash (Draft document)
 */
export async function generateV1Hash(content: string): Promise<string> {
  return generateVersionedHash({ content, version: 1 });
}

/**
 * Generate v2 hash (After candidate signature)
 */
export async function generateV2Hash(
  content: string,
  candidateSignature: string,
  candidateEmail: string,
  candidateTimestamp: string
): Promise<string> {
  return generateVersionedHash({
    content,
    version: 2,
    candidateSignature: {
      data: candidateSignature,
      email: candidateEmail,
      timestamp: candidateTimestamp,
    },
  });
}

/**
 * Generate v3 hash (Fully executed - both signatures)
 */
export async function generateV3Hash(
  content: string,
  candidateSignature: string,
  candidateEmail: string,
  candidateTimestamp: string,
  employerSignature: string,
  employerEmail: string,
  employerTimestamp: string
): Promise<string> {
  return generateVersionedHash({
    content,
    version: 3,
    candidateSignature: {
      data: candidateSignature,
      email: candidateEmail,
      timestamp: candidateTimestamp,
    },
    employerSignature: {
      data: employerSignature,
      email: employerEmail,
      timestamp: employerTimestamp,
    },
  });
}

/**
 * Generate hash including signature data (legacy compatibility)
 */
export async function generateSignedDocumentHash(
  content: string,
  signatureData: string | null,
  signerEmail: string,
  timestamp: string
): Promise<string> {
  const combinedContent = `${content}|${signatureData || ''}|${signerEmail}|${timestamp}`;
  return generateDocumentHash(combinedContent);
}

/**
 * Verify document hash matches expected value
 */
export async function verifyDocumentHash(
  content: string,
  expectedHash: string
): Promise<boolean> {
  const actualHash = await generateDocumentHash(content);
  return actualHash === expectedHash;
}

/**
 * Generate hash for fully completed document (both signatures) - legacy
 */
export async function generateCompletedDocumentHash(
  content: string,
  candidateSignature: string | null,
  candidateEmail: string,
  candidateTimestamp: string,
  employerSignature: string | null,
  employerEmail: string,
  employerTimestamp: string
): Promise<string> {
  const combinedContent = [
    content,
    candidateSignature || '',
    candidateEmail,
    candidateTimestamp,
    employerSignature || '',
    employerEmail,
    employerTimestamp
  ].join('|');
  
  return generateDocumentHash(combinedContent);
}

/**
 * Generate hash of the entire audit trail for tamper detection
 */
export async function generateAuditTrailHash(auditEntries: Array<{
  action: string;
  timestamp: string;
  userId?: string;
  hash?: string;
}>): Promise<string> {
  const auditString = auditEntries
    .map(e => `${e.action}|${e.timestamp}|${e.userId || 'system'}|${e.hash || 'none'}`)
    .join('||');
  
  return generateDocumentHash(auditString);
}

/**
 * Get client IP address (best effort)
 */
export async function getClientIP(): Promise<string> {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Get user agent string
 */
export function getUserAgent(): string {
  return navigator.userAgent || 'unknown';
}

/**
 * Get current UTC timestamp in ISO format
 */
export function getUTCTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Format timestamp for display with UTC indicator
 */
export function formatTimestampWithUTC(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return `${date.toUTCString()} (UTC)`;
}
