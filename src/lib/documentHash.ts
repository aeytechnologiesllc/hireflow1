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

/**
 * Signing context interface - captures all information at the exact moment of signing
 */
export interface SigningContext {
  ip: string;
  userAgent: string;
  timestamp: string;
  geolocation?: {
    city: string;
    region: string;
    country: string;
  };
  connectionWarning?: string; // VPN/proxy detection - informational only
}

/**
 * Known VPN/Hosting provider ASN names and patterns
 * This is informational only - does NOT block signing
 */
const VPN_HOSTING_PATTERNS = [
  'cloudflare', 'amazon', 'aws', 'google cloud', 'azure', 'digitalocean',
  'linode', 'vultr', 'ovh', 'hetzner', 'nordvpn', 'expressvpn', 'surfshark',
  'private internet access', 'mullvad', 'protonvpn', 'cyberghost',
  'ipvanish', 'tunnelbear', 'windscribe', 'hotspot shield'
];

/**
 * Check if geolocation data suggests VPN/proxy usage
 * Returns warning message if detected, undefined otherwise
 */
function detectVpnOrProxy(geoData: { org?: string; isp?: string; hosting?: boolean; proxy?: boolean }): string | undefined {
  // Check explicit flags first
  if (geoData.proxy === true || geoData.hosting === true) {
    return 'Connection may be using a VPN or proxy';
  }
  
  // Check ISP/org name for known patterns
  const orgLower = (geoData.org || '').toLowerCase();
  const ispLower = (geoData.isp || '').toLowerCase();
  
  for (const pattern of VPN_HOSTING_PATTERNS) {
    if (orgLower.includes(pattern) || ispLower.includes(pattern)) {
      return 'Connection may be using a VPN or proxy';
    }
  }
  
  return undefined;
}

/**
 * Capture complete signing context synchronously at the moment of signature
 * This MUST be called immediately before database updates during signing
 * IP address is captured at the exact moment of electronic consent/signature
 */
export async function captureSigningContext(): Promise<SigningContext> {
  const timestamp = getUTCTimestamp();
  const userAgent = getUserAgent();
  
  // Capture IP address synchronously - this is critical for compliance
  let ip = 'IP unavailable at time of signing';
  let geolocation: SigningContext['geolocation'] = undefined;
  let connectionWarning: string | undefined = undefined;
  
  try {
    // Attempt to get IP and geolocation from our edge function
    const response = await Promise.race([
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/geolocate-ip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({}),
      }),
      new Promise<Response>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      )
    ]);
    
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.ip) {
        ip = data.ip;
        if (data.city && data.city !== 'Unknown') {
          geolocation = {
            city: data.city,
            region: data.region || 'Unknown',
            country: data.country || 'Unknown',
          };
        }
        
        // Check for VPN/proxy usage (informational only)
        connectionWarning = detectVpnOrProxy({
          org: data.org,
          isp: data.isp,
          hosting: data.hosting,
          proxy: data.proxy,
        });
      }
    }
  } catch (error) {
    console.error('Failed to capture IP at signing:', error);
    // Fallback to ipify
    try {
      const fallbackResponse = await Promise.race([
        fetch('https://api.ipify.org?format=json'),
        new Promise<Response>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 3000)
        )
      ]);
      const fallbackData = await fallbackResponse.json();
      if (fallbackData.ip) {
        ip = fallbackData.ip;
      }
    } catch {
      // IP remains "IP unavailable at time of signing"
    }
  }
  
  return {
    ip,
    userAgent,
    timestamp,
    geolocation,
    connectionWarning,
  };
}

/**
 * Format IP address for display - explicitly shows if unavailable
 */
export function formatIPAddress(ip: string | null | undefined): string {
  if (!ip || ip === 'unknown' || ip === '') {
    return 'IP unavailable at time of signing';
  }
  return ip;
}
