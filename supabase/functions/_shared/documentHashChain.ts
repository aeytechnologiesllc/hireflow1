/**
 * Server-side v2/v3 hash chain for document signing.
 *
 * Mirrors src/lib/documentHash.ts's `generateVersionedHash` formula exactly,
 * but chains off the *stored* previous-version hash instead of re-fetching
 * or re-decoding the underlying document content (see
 * docs/DOCUMENT-SIGNING.md §2 for why): it works identically for
 * AI-generated and uploaded documents, and still detects any change to the
 * underlying content, because v1_hash itself already covers it.
 *
 * Pure and dependency-free (Web Crypto only, global in both Deno and Node)
 * so it runs unchanged under Deno (the edge function) and under Node (this
 * file's own tests) with no build step.
 */

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 of raw bytes (used for a drawn signature's PNG, and final.pdf). */
export async function sha256HexOfBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * A drawn signature hashes the decoded PNG bytes, never the full data URL —
 * keeps the hash input bounded regardless of image size. A typed signature
 * hashes the trimmed name itself.
 */
export async function signatureHashInput(
  signature: { method: string; value: string },
): Promise<string> {
  if (signature.method === "drawn") {
    const base64 = signature.value.slice(signature.value.indexOf(",") + 1);
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return sha256HexOfBytes(bytes);
  }
  return signature.value.trim();
}

export async function computeV2Hash(params: {
  v1Hash: string;
  signatureValue: string;
  candidateEmail: string;
  timestampUtc: string;
}): Promise<string> {
  const { v1Hash, signatureValue, candidateEmail, timestampUtc } = params;
  return sha256Hex(
    `${v1Hash}|CANDIDATE|${signatureValue}|${candidateEmail}|${timestampUtc}|VERSION:2`,
  );
}

export async function computeV3Hash(params: {
  v2Hash: string;
  signatureValue: string;
  employerEmail: string;
  timestampUtc: string;
}): Promise<string> {
  const { v2Hash, signatureValue, employerEmail, timestampUtc } = params;
  return sha256Hex(
    `${v2Hash}|EMPLOYER|${signatureValue}|${employerEmail}|${timestampUtc}|VERSION:3`,
  );
}

export { sha256Hex };
