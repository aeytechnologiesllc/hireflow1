import { supabase } from "@/integrations/supabase/client";

/**
 * Candidate media privacy — video introductions and portfolio work samples.
 *
 * The `videos` and `portfolios` buckets were created public, so every candidate
 * video intro sat at a permanent, unauthenticated URL: a recording of someone's
 * face and voice, made to apply for a job, readable by anyone who ever saw the
 * link and never expiring. Storage RLS policies were written for these buckets,
 * but a public bucket serves objects straight from the CDN and never consults
 * them, so those policies were decorative.
 *
 * This is the same treatment the `resumes` bucket already had (see
 * resumeSignedUrl.ts, written when that bucket was made private): store the
 * path, mint a short-lived signed URL at view time, and let storage RLS decide
 * who is allowed — the candidate who owns it, or the employer whose job they
 * applied to.
 *
 * Legacy rows hold full public URLs rather than bare paths, so the path is
 * recovered from either shape. Signing failures fall back to the stored value,
 * so a viewer degrades to the old behaviour instead of showing a broken player.
 */

export type CandidateMediaBucket = "videos" | "portfolios";

/** Pull the storage path within `bucket` out of a stored value. */
export function candidateMediaPath(
  bucket: CandidateMediaBucket,
  stored: string | null | undefined
): string | null {
  if (!stored || typeof stored !== "string") return null;
  const trimmed = stored.trim();
  if (!trimmed) return null;
  // Full URL form: …/<bucket>/<path>[?query] — covers both the public and the
  // signed URL shapes, since both carry the bucket name in the path.
  const match = trimmed.match(new RegExp(`/${bucket}/(.+?)(?:\\?|$)`));
  if (match) return decodeURIComponent(match[1]);
  // Already a bare path.
  if (!/^https?:\/\//i.test(trimmed)) return trimmed.replace(/^\/+/, "");
  // A URL somewhere else entirely (an external portfolio link a candidate
  // pasted, for instance) — leave it alone.
  return null;
}

/**
 * Resolve a stored candidate-media value to a viewable, short-lived signed URL.
 * Ten minutes by default: long enough to watch a sixty-second intro without the
 * link going stale mid-playback, short enough that a copied URL is not a leak.
 */
export async function resolveCandidateMediaUrl(
  bucket: CandidateMediaBucket,
  stored: string | null | undefined,
  ttlSeconds = 600
): Promise<string | null> {
  if (!stored) return null;
  const path = candidateMediaPath(bucket, stored);
  if (!path) return stored;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) {
    console.error(`Failed to sign ${bucket} URL:`, error);
    return stored;
  }
  return data.signedUrl;
}

/** Sign several at once, preserving order. Unsignable entries keep their value. */
export async function resolveCandidateMediaUrls(
  bucket: CandidateMediaBucket,
  stored: Array<string | null | undefined>,
  ttlSeconds = 600
): Promise<Array<string | null>> {
  return Promise.all(stored.map((s) => resolveCandidateMediaUrl(bucket, s, ttlSeconds)));
}
