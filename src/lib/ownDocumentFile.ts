/**
 * An uploaded document's file, only from this project's own `documents`
 * bucket (Phase 7 security review, round 2, H2).
 *
 * An uploaded PDF's address lives in the document's body, which the sender
 * writes. At countersign the server fetched that address as given and burned
 * the applicant's signature into whatever came back, so a business could
 * show the applicant one PDF and countersign another: swap the file at the
 * same storage path after they signed, or point the address at its own
 * server and answer the browser and the server differently. Now the server
 * reads the file from storage itself, by its path in this project's
 * `documents` bucket only, and compares it with the hash the sender fixed
 * when it was sent (v1_hash); the viewer frames only such an address.
 *
 * Import-free: Deno and plain Node both load it (scripts/own_document_file.test.mjs).
 */

/**
 * The object path in this project's `documents` bucket that `url` names
 * (a signed, public or authenticated storage address on `projectUrl`'s
 * origin), or null for anything else.
 */
export function ownDocumentsPath(url: unknown, projectUrl: string): string | null {
  if (typeof url !== "string" || !url.trim() || !projectUrl) return null;
  let parsed: URL;
  let project: URL;
  try {
    parsed = new URL(url.trim());
    project = new URL(projectUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.origin !== project.origin) return null;
  const match = parsed.pathname.match(/^\/storage\/v1\/object\/(?:sign|public|authenticated)\/documents\/(.+)$/);
  if (!match) return null;
  let path: string;
  try {
    path = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return isPlainObjectPath(path) ? path : null;
}

/**
 * A storage object path whose every part is a plain name: never "." or "..",
 * and nothing a later fetch turns into one or into another folder: a "%"
 * (a URL reads "%2e%2e" as ".."; the fifth security review: a double-encoded
 * "%252e%252e" passed the one decode above, kept the sender's folder at the
 * front and was downloaded, with the service key, from another one), a
 * backslash (read as "/"), or a tab, newline or other control character
 * (dropped). Storage refuses all of these in a file's name anyway, so no real
 * upload is turned away.
 */
export function isPlainObjectPath(path: string): boolean {
  if (typeof path !== "string" || !path || path.length > 1024) return false;
  if (/[%\\\u0000-\u001f\u007f]/.test(path)) return false;
  return path.split("/").every((p) => p !== "" && p !== "." && p !== "..");
}
