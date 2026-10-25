/**
 * Which files remove-applicant deletes (index.ts), kept apart from the
 * handler so scripts/remove_applicant.test.mjs can run them.
 */

/** A stored file value (a path, or a storage URL) as a path inside `bucket`. */
export function storagePathIn(value: unknown, bucket: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) {
    const marker = `/${bucket}/`;
    const at = v.indexOf(marker);
    if (at < 0) return null;
    try {
      return decodeURIComponent(v.slice(at + marker.length).split("?")[0]) || null;
    } catch {
      return null;
    }
  }
  return v.replace(/^\/+/, "") || null;
}

/**
 * The resume and form files this application points at (paths under the
 * person's own folder) that none of their other applications still uses.
 */
export function resumeFilesToRemove(candidateId: string, resumeUrl: unknown, notes: unknown, otherRefs: string): string[] {
  const found = new Set<string>();
  const own = storagePathIn(resumeUrl, "resumes");
  if (own && own.startsWith(`${candidateId}/`)) found.add(own);
  const escaped = candidateId.replace(/[-]/g, "\\-");
  for (const m of String(notes ?? "").matchAll(new RegExp(`${escaped}/[A-Za-z0-9._\\-/]+`, "g"))) found.add(m[0]);
  // Only a plain path inside their own folder: never "..", an empty segment
  // or another folder, whatever the notes (partly their own writing) say.
  const safe = (path: string) => path.startsWith(`${candidateId}/`) && !path.includes("..") && !path.includes("//") && !path.endsWith("/");
  return [...found].filter((path) => safe(path) && !otherRefs.includes(path));
}

const DOCUMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The application's document ids, from the database's answer: the only thing
 * a document's files are found by (documents/<id>/, the copies the signing
 * function keeps). Never the document's own file address, which the
 * business writes and could point at another business's file.
 */
export function documentIdsOf(documents: unknown): string[] {
  if (!Array.isArray(documents)) return [];
  return [...new Set(documents.map((d) => (d && typeof d === "object" ? (d as { id?: unknown }).id : null)).filter((id): id is string => typeof id === "string" && DOCUMENT_ID.test(id)))];
}
