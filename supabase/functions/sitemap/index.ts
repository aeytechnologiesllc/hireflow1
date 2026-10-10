// The public sitemap: the pages search engines should list, and every open job.
// Proxied on-domain at https://hireflownow.com/sitemap.xml (see vercel.json). Deploy
// with `--no-verify-jwt` so search engines can fetch it without auth.
//
// Every published job whose deadline has not passed is listed under its job page
// (/candidate/job/<id>, the page's own canonical), unless it carries the
// exclude_from_feed flag that QA/demo jobs carry. Until 2026-10-09 a job was listed
// only when its page carried Google Jobs markup (a real company name, a country,
// and a city unless remote). Google Jobs was removed on 2026-10-05 (owner: "remove
// google jobs") and every live job page has been indexable since, but the sitemap
// kept the old rule, so the owner's one open role (worldwide remote, no country)
// was left out of it (SEO check, 2026-10-09).
const SITE = Deno.env.get("PUBLIC_SITE_URL") || "https://hireflownow.com";

/** Pages that are not jobs, in the order they matter. */
const STATIC_PAGES: Array<{ path: string; priority: string }> = [
  { path: "/", priority: "1.0" },
  { path: "/careers", priority: "0.7" },
  { path: "/privacy", priority: "0.3" },
  { path: "/terms", priority: "0.3" },
];

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface SitemapJob {
  id: string;
  created_at: string;
  updated_at?: string | null;
  application_deadline?: string | null;
  exclude_from_feed?: boolean | null;
}

Deno.serve(async () => {
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/xml; charset=utf-8" };
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const params = new URLSearchParams({
      status: "eq.published",
      exclude_from_feed: "eq.false",
      select: "id,created_at,updated_at,application_deadline,exclude_from_feed",
      order: "updated_at.desc",
      limit: "5000",
      or: `(application_deadline.is.null,application_deadline.gt.${now})`,
    });
    const res = await fetch(`${url}/rest/v1/jobs?${params.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const jobs: SitemapJob[] = res.ok ? await res.json() : [];
    const openJobs = jobs.filter((job) => {
      if (job.exclude_from_feed) return false;
      return !(job.application_deadline && new Date(job.application_deadline).getTime() < nowMs);
    });

    const urls = [
      ...STATIC_PAGES.map((p) => `<url><loc>${xmlEscape(`${SITE}${p.path}`)}</loc><priority>${p.priority}</priority></url>`),
      ...openJobs.map((j) => {
        const lastmod = new Date(j.updated_at || j.created_at).toISOString();
        const loc = `${SITE}/candidate/job/${j.id}`;
        return `<url><loc>${xmlEscape(loc)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`;
      }),
    ].join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
    return new Response(xml, { headers: { ...cors, "Cache-Control": "public, max-age=3600" } });
  } catch (_e) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`;
    return new Response(xml, { status: 200, headers: cors });
  }
});
