/**
 * Removed job pages must stop looking alive to Google (2026-09-16).
 *
 * api/job-prerender.mjs used to answer a deleted/closed job with 200 and the
 * homepage's `index, follow` (a soft 404), and cached live job pages for 10
 * minutes plus a 24-hour stale window, so Google kept reading the old
 * JobPosting right after URL_DELETED sent it to recrawl.
 * Behavior is proven in scripts/job_prerender_gone.test.mjs; this guard keeps
 * the shape from quietly drifting back.
 */
export default [
  {
    id: "job-prerender-removed-jobs-are-gone",
    why:
      "api/job-prerender.mjs must answer a removed, closed or expired job with 404 and a single " +
      "noindex tag, and keep live job pages on a short edge cache. Otherwise Google keeps indexing " +
      "dead listings. scripts/job_prerender_gone.test.mjs proves the behavior.",
    async run({ read }) {
      const src = (await read("api/job-prerender.mjs")) ?? "";
      const bad = [];
      if (!/res\.statusCode\s*=\s*404/.test(src)) bad.push("no 404 for a removed/closed job");
      if (!/function withRobots\(/.test(src)) bad.push("lost withRobots() (single robots tag)");
      if (/stale-while-revalidate=86400/.test(src)) bad.push("24-hour stale window is back on job pages");
      if (/s-maxage=600/.test(src)) bad.push("10-minute edge cache is back on job pages");
      if (!/let gone\b/.test(src)) bad.push("lost the `gone` flag that keeps Supabase errors from reading as removed");
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
