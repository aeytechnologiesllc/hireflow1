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
  const parts = path.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return null;
  return path;
}
