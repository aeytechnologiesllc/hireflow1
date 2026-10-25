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
  // A file name may have spaces, accents, commas or "&" ("Scan 2026", "CV, final",
  // "Smith & Co"; a name without a dot is kept whole): a path runs to the next
  // quote, backslash, angle bracket or line end (the fourth and sixth Phase 5
  // reviews). A list of paths splits at ", <their folder>/", and a signed
  // address loses its "?token=…" (the fifth); a percent-encoded one is read
  // both ways.
  const listSplit = new RegExp(`,\\s*(?=${escaped}/)`);
  for (const m of String(notes ?? "").matchAll(new RegExp(`${escaped}/[^"'\\\\<>\\r\\n]{1,400}`, "g"))) {
    for (const piece of m[0].split(listSplit)) {
      // A "#page=2" fragment is no part of a storage name either (keys hold no "#"; the seventh review).
      const path = piece.replace(/\?(token|download|t|X-Amz-[A-Za-z-]+)=[\s\S]*$/, "").replace(/#[\s\S]*$/, "").replace(/[\s,]+$/, "");
      found.add(path);
      if (/%[0-9a-f]{2}/i.test(path)) {
        try {
          found.add(decodeURIComponent(path));
        } catch {
          // not an encoded address after all
        }
      }
    }
  }
  // Only a plain path inside their own folder: never "..", an empty segment
  // or another folder, whatever the notes (partly their own writing) say.
  const safe = (path: string) => path.startsWith(`${candidateId}/`) && !path.includes("..") && !path.includes("//") && !path.endsWith("/");
  // A file another application or the profile still uses stays, however
  // that one stored it: compared with the other references both as written
  // and decoded ("Scan%202026" there is "Scan 2026" here; the seventh review:
  // a shared file was deleted because only this side was decoded).
  let decodedRefs = otherRefs;
  try {
    decodedRefs = decodeURIComponent(otherRefs);
  } catch {
    decodedRefs = otherRefs.replace(/%([0-9a-f]{2})/gi, (all, hex) => {
      try {
        return decodeURIComponent(`%${hex}`);
      } catch {
        return all;
      }
    });
  }
  const usedElsewhere = (path: string) => {
    if (otherRefs.includes(path) || decodedRefs.includes(path)) return true;
    try {
      return otherRefs.includes(encodeURI(path)) || otherRefs.includes(encodeURIComponent(path).replace(/%2F/gi, "/"));
    } catch {
      return false;
    }
  };
  return [...found].filter((path) => safe(path) && !usedElsewhere(path));
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

/** A path the retry queue accepts (storage_file_trash's own check): plain, 3 to 500 characters. */
export function queueablePath(path: unknown): boolean {
  return typeof path === "string" && path.length >= 3 && path.length <= 500 && !path.startsWith("/") && !path.includes("..") && !path.includes("//");
}
