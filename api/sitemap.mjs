/**
 * HireFlow sitemap — /sitemap.xml (rewritten here).
 *
 * The list itself is made by the Supabase edge function `sitemap` (every
 * business's careers page with a live job, every live job). It used to be
 * served straight from there, but Supabase serves edge-function replies as
 * text/plain with a sandboxing CSP, whatever the function says, so search
 * engines got a plain-text "sitemap". This passes the same XML through with
 * the right type and a cache. If the function can't answer, it serves the
 * fixed pages, never an error page.
 *
 * Self-contained plain-JS ESM with ZERO imports (importing from ../src crashes
 * Vercel's runtime at module load; see job-prerender.mjs).
 */

const SITEMAP_FUNCTION = "https://yqklrkpptnhubsnijqze.supabase.co/functions/v1/sitemap";
const ORIGIN = "https://hireflownow.com";
const FIXED = [
  ["/", "1.0"],
  ["/careers", "0.7"],
  ["/open-jobs", "0.7"],
  ["/privacy", "0.3"],
  ["/terms", "0.3"],
];

export function fallbackSitemap() {
  const urls = FIXED.map(([path, priority]) => `<url><loc>${ORIGIN}${path}</loc><priority>${priority}</priority></url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

export default async function handler(req, res) {
  let body = "";
  let fresh = false;
  try {
    const reply = await fetch(SITEMAP_FUNCTION, { headers: { "user-agent": "hireflow-sitemap" } });
    body = reply.ok ? await reply.text() : "";
    fresh = /<urlset[\s>]/.test(body);
  } catch {
    fresh = false;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  // An hour at the edge when it's the real list; a minute when it's the fallback.
  res.setHeader("Cache-Control", fresh ? "public, s-maxage=3600, stale-while-revalidate=86400" : "public, s-maxage=60");
  res.end(fresh ? body : fallbackSitemap());
}
