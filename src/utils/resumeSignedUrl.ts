import { supabase } from "@/integrations/supabase/client";

/**
 * Resume privacy: the `resumes` bucket is private. Stored resume values are
 * either a legacy public URL (…/object/public/resumes/<path>) or a bare storage
 * path; either way we mint a short-lived SIGNED URL at view time so the file is
 * never world-readable. Authorization is enforced by storage RLS (owner, or the
 * employer who owns the job the resume was submitted to).
 */

/** Pull the storage path within the `resumes` bucket out of a stored value. */
export function resumeStoragePath(stored: string | null | undefined): string | null {
  if (!stored || typeof stored !== "string") return null;
  const trimmed = stored.trim();
  if (!trimmed) return null;
  // Full URL form: …/resumes/<path>[?query]
  const match = trimmed.match(/\/resumes\/(.+?)(?:\?|$)/);
  if (match) return decodeURIComponent(match[1]);
  // Already a bare path (no scheme/host) — use as-is.
  if (!/^https?:\/\//i.test(trimmed)) return trimmed.replace(/^\/+/, "");
  // A URL that isn't in the resumes bucket (e.g. an external answer link).
  return null;
}

/**
 * Resolve a stored resume value to a viewable, short-lived signed URL.
 * Falls back to the original value if it isn't a resumes-bucket object or if
 * signing fails, so the viewer never hard-breaks.
 */
export async function resolveResumeUrl(
  stored: string | null | undefined,
  ttlSeconds = 300,
): Promise<string | null> {
  if (!stored) return null;
  const path = resumeStoragePath(stored);
  if (!path) return stored;
  const { data, error } = await supabase.storage.from("resumes").createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) return stored;
  return data.signedUrl;
}
