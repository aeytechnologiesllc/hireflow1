/**
 * Document Hashing Utilities for SHA-256 integrity verification
 * Used for ESIGN Act and UETA compliance
 */

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
 * Generate hash including signature data
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
 * Generate hash for fully completed document (both signatures)
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
