/**
 * What an applicant was shown, as the signing function checks it (the third
 * Phase 7 security review, 2026-10-25).
 *
 * The sender's browser chose v1_hash, and an uploaded file stayed in the
 * sender's own folder, where they may delete and upload again. So a business
 * could show the applicant one file, swap in another after they signed, set
 * v1 to the second, and countersign: the final PDF carried the applicant's
 * signature on a file they never saw, and /verify vouched for it.
 *
 * Now, when the applicant signs, the server hashes what is being signed (the
 * written letter's text, or the uploaded file's bytes), refuses unless the
 * applicant's own screen hashed the same thing, makes that hash v1, keeps
 * the letter exactly as shown, and copies an uploaded file to a path only
 * the server writes. The countersign reads only that copy, and checks a
 * written letter against v1 again.
 *
 * Pure (Web Crypto only) so it runs in Deno and in Node's tests.
 */

/** v1 of a written document: the same formula as the browser's
 *  generateV1Hash (src/lib/documentHash.ts): sha256 of `${content}|VERSION:1`. */
export async function writtenDocumentHash(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${content}|VERSION:1`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Where the server keeps the uploaded file the applicant signed: under
 *  documents/<id>/, which no business's own folder (<their id>/) can reach. */
export function sealedOriginalPath(documentId: string): string {
  return `documents/${documentId}/original.pdf`;
}

/** The applicant's screen and the server agree on what is being signed. */
export function shownMatches(viewedHash: unknown, serverHash: string): boolean {
  return typeof viewedHash === "string" && /^[0-9a-f]{64}$/i.test(viewedHash) && viewedHash.toLowerCase() === serverHash.toLowerCase();
}
