/**
 * An address under /blog that is no guide — /blog/<anything else> (rewritten
 * here by vercel.json, after /blog and /blog/:slug).
 *
 * It used to be rewritten straight to the static /blog/not-found.html, which
 * Vercel serves with 200: a page that exists, as far as a search engine can
 * tell (a "soft 404"; the Phase 7 growth audit, round 2). This passes the
 * same page through with 404. The page is made by scripts/build-blog.mjs, and
 * it is noindex either way.
 *
 * Self-contained plain-JS ESM with ZERO imports (importing from ../src crashes
 * Vercel's runtime at module load; see job-prerender.mjs).
 */

const ORIGIN = "https://hireflownow.com";

/** What is said when the built page itself cannot be read. */
export const FALLBACK_PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex, follow">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Guide not found | HireFlow</title></head>' +
  '<body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem;">' +
  '<h1>That guide is not here</h1><p><a href="/blog">Every guide is on the list.</a></p></body></html>';

const SELF = "hireflow-blog-not-found";

export default async function handler(req, res) {
  let body = "";
  // Its own fetch of /blog/not-found.html, if that page were ever missing,
  // would be rewritten back here: answer it with the plain page, never fetch
  // again (the sixth Phase 6 review).
  const selfCall = String((req.headers && req.headers["user-agent"]) || "") === SELF;
  if (!selfCall) try {
    const reply = await fetch(`${ORIGIN}/blog/not-found.html`, { headers: { "user-agent": SELF } });
    body = reply.ok ? await reply.text() : "";
  } catch {
    body = "";
  }
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex");
  res.setHeader("Cache-Control", "public, s-maxage=300");
  res.end(/<title>Guide not found/.test(body) ? body : FALLBACK_PAGE);
}
