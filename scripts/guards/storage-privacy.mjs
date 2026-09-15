/**
 * Storage privacy — portfolios, videos, resumes, message-attachments.
 *
 * `portfolios` was a private bucket sitting behind one leftover public SELECT
 * policy (`bucket_id = 'portfolios'`, no owner check at all) from when the
 * bucket was created — a signed-out anon-key request could download any
 * candidate's work samples. `message-attachments` was the same shape: a
 * public bucket with SELECT/INSERT policies that checked nothing but
 * `bucket_id`. Both are fixed in
 * 20260915100000_private_portfolios_and_attachments.sql. Two ways for that to
 * regress:
 *
 *   1. A later migration re-adds a bucket-wide read policy for one of these
 *      buckets (or `videos`/`resumes`, fixed the same way earlier).
 *   2. Application code calls `.getPublicUrl()` against one of them instead of
 *      minting a short-lived signed URL (candidateMediaUrl.ts).
 */

const FIX_MIGRATION = "20260915100000_private_portfolios_and_attachments.sql";
const PRIVATE_BUCKETS = ["portfolios", "videos", "resumes", "message-attachments"];

function migrationTimestamp(filename) {
  const m = filename.match(/^(\d{14})_/);
  return m ? m[1] : null;
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

export default [
  {
    id: "storage-no-bucket-wide-read-policy-regression",
    why:
      "portfolios and message-attachments were made private by dropping a bucket-wide SELECT " +
      "policy (bucket_id = '<bucket>', no owner check) and replacing it with policies scoped to " +
      "the candidate/participant and the employer/team who should see the file. A later migration " +
      "re-adding that bare policy would silently reopen the bucket to every anon request, exactly " +
      "as it was before this fix — so any migration landing after the fix is checked for it.",
    async run({ walk, read }) {
      const fixTs = migrationTimestamp(FIX_MIGRATION);
      const files = await walk("supabase/migrations", [".sql"]);
      const bad = [];

      for (const rel of files) {
        const name = rel.split("/").pop();
        const ts = migrationTimestamp(name);
        // Only migrations that land AFTER the fix are in scope — the fix's own
        // migration, and everything before it, is allowed to mention these
        // buckets (that's the history this guard exists to keep from repeating).
        if (!ts || !fixTs || ts <= fixTs) continue;

        const text = (await read(rel)) ?? "";
        const policyRe =
          /create\s+policy\s+"[^"]*"\s+on\s+storage\.objects\s+for\s+select[\s\S]*?using\s*\(([\s\S]*?)\)\s*;/gi;
        let m;
        while ((m = policyRe.exec(text))) {
          const using = m[1].replace(/\s+/g, " ").trim().toLowerCase();
          for (const bucket of PRIVATE_BUCKETS) {
            if (using === `bucket_id = '${bucket}'`) {
              bad.push(
                `${rel}:${lineOf(text, m.index)}  bucket-wide SELECT policy for '${bucket}' with no owner check`
              );
            }
          }
        }
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
  {
    id: "storage-no-getPublicUrl-on-private-buckets",
    why:
      "getPublicUrl() returns a permanent, unauthenticated link — the exact shape of the bug this " +
      "fix removes. Once a bucket is private, RLS only protects a viewer who asks for a *signed* " +
      "URL (resolveCandidateMediaUrl in candidateMediaUrl.ts); a getPublicUrl() call against it just " +
      "hands back a dead (or, worse, a cached-and-still-working) public link.",
    async run({ sources }) {
      const files = await sources();
      const fromRe = /\.from\(\s*["'`](videos|portfolios|resumes|message-attachments)["'`]\s*\)/g;
      const bad = [];

      for (const { rel, text } of files) {
        fromRe.lastIndex = 0;
        let m;
        while ((m = fromRe.exec(text))) {
          const window = text.slice(m.index, m.index + 400);
          if (/\.getPublicUrl\(/.test(window)) {
            bad.push(`${rel}:${lineOf(text, m.index)}  getPublicUrl() on private bucket '${m[1]}'`);
          }
        }
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
