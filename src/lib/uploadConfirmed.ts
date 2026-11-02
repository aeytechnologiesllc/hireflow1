/**
 * uploadConfirmed.ts — a storage upload a slow connection cannot turn into a
 * false "failed".
 *
 * Live, 2026-11-02 (the second Zulu hiring run, applicants in the
 * Philippines): every profile upload of the afternoon, resumes and photos of
 * 263 to 450 KB, answered 504 after 60 seconds, and every one of the files was
 * saved; storage's own log has the upload finishing up to six minutes later.
 * The page said "Failed to upload", so people sent the same file again (one
 * applicant three times).
 *
 * So an upload whose error a refusal never is (the gateway gave up waiting,
 * or the connection dropped) is looked for: the same name in the same folder,
 * every few seconds for up to two minutes, and found there it is a success.
 * A refusal (any 4xx: too big, wrong type, not allowed) is never looked for,
 * and the paths this is used with are new each time (a timestamp in the
 * name), so an older file can never be taken for this one.
 *
 * Pure apart from the bucket handed in: scripts/upload_confirmed.test.mjs
 * runs it in Node against a stand-in bucket.
 */

/** The two calls of a Supabase storage bucket this needs. */
export interface UploadBucket {
  upload(path: string, body: File | Blob, options?: { upsert?: boolean; contentType?: string }): Promise<{ data: unknown; error: unknown }>;
  list(path?: string, options?: { search?: string; limit?: number }): Promise<{ data: { name: string }[] | null; error: unknown }>;
}

/** How long a timed-out upload is looked for, and how often. */
export const LANDING_WAIT_MS = 120_000;
export const LANDING_LOOK_EVERY_MS = 5_000;

/** An upload error that may hide a saved file: a 5xx, a dropped connection,
 *  an answer that was not storage's (the gateway's HTML). Never a 4xx. */
export function mayHaveLanded(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: unknown; statusCode?: unknown; message?: unknown; name?: unknown };
  const status = Number(e.status ?? e.statusCode);
  if (Number.isFinite(status) && status >= 400 && status < 500) return false;
  if (Number.isFinite(status) && status >= 500) return true;
  return e.name === "StorageUnknownError" || /time ?out|timed out|gateway|upstream|failed to fetch|network|load failed/i.test(String(e.message ?? ""));
}

/**
 * Upload, and when the answer is a timeout rather than a refusal, wait for
 * the file to land before saying anything. `onWaiting` is called once, when
 * the looking starts, so the page can say "Still saving".
 */
export async function uploadConfirmed(
  bucket: UploadBucket,
  path: string,
  body: File | Blob,
  options?: { upsert?: boolean; contentType?: string },
  wait: { onWaiting?: () => void; totalMs?: number; everyMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<{ data: unknown; error: unknown; landedLate?: boolean }> {
  const first = await bucket.upload(path, body, options);
  if (!first.error || !mayHaveLanded(first.error)) return first;
  wait.onWaiting?.();
  const slash = path.lastIndexOf("/");
  const folder = slash >= 0 ? path.slice(0, slash) : "";
  const name = path.slice(slash + 1);
  const sleep = wait.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const every = wait.everyMs ?? LANDING_LOOK_EVERY_MS;
  const looks = Math.max(1, Math.ceil((wait.totalMs ?? LANDING_WAIT_MS) / every));
  for (let i = 0; i < looks; i += 1) {
    const { data } = await bucket.list(folder, { search: name, limit: 10 });
    if (data?.some((o) => o.name === name)) return { data: { path }, error: null, landedLate: true };
    await sleep(every);
  }
  return first;
}

/** What the page says while it waits. */
export const STILL_SAVING_WORDS = "Still saving your file. Your connection is slow, so this can take a minute: keep this page open.";
