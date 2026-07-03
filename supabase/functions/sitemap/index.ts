// Public sitemap of all published jobs, for Google for Jobs / Indeed organic discovery.
// Proxied on-domain at https://hireflownow.com/sitemap.xml (see vercel.json). Deploy with
// `--no-verify-jwt` so search engines can fetch it without auth.
const SITE = Deno.env.get("PUBLIC_SITE_URL") || "https://hireflownow.com";

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

Deno.serve(async () => {
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/xml; charset=utf-8" };
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
    const now = new Date().toISOString();
    const params = new URLSearchParams({
      status: "eq.published",
      select: "id,created_at,updated_at,application_deadline",
      order: "updated_at.desc",
      limit: "5000",
      or: `(application_deadline.is.null,application_deadline.gt.${now})`,
    });
    const res = await fetch(`${url}/rest/v1/jobs?${params.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const jobs: Array<{ id: string; created_at: string; updated_at?: string | null }> = res.ok ? await res.json() : [];

    const staticUrls = [
      { loc: `${SITE}/`, pri: "1.0" },
      { loc: `${SITE}/candidate`, pri: "0.6" },
    ];

    const urls = [
      ...staticUrls.map((u) => `<url><loc>${xmlEscape(u.loc)}</loc><priority>${u.pri}</priority></url>`),
      ...jobs.map((j) => {
        const changedAt = j.updated_at || j.created_at;
        const lastmod = new Date(changedAt).toISOString();
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
