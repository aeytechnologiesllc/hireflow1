// Public sitemap of all published jobs, for Google for Jobs / Indeed organic discovery.
// Proxied on-domain at https://hireflownow.com/sitemap.xml (see vercel.json). Deploy with
// `--no-verify-jwt` so search engines can fetch it without auth.
const SITE = Deno.env.get("PUBLIC_SITE_URL") || "https://hireflownow.com";

Deno.serve(async () => {
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/xml; charset=utf-8" };
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
    const res = await fetch(`${url}/rest/v1/jobs?status=eq.published&select=id,created_at&order=created_at.desc&limit=5000`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const jobs: Array<{ id: string; created_at: string }> = res.ok ? await res.json() : [];

    const staticUrls = [
      { loc: `${SITE}/`, pri: "1.0" },
      { loc: `${SITE}/candidate`, pri: "0.6" },
    ];

    const urls = [
      ...staticUrls.map((u) => `<url><loc>${u.loc}</loc><priority>${u.pri}</priority></url>`),
      ...jobs.map((j) => {
        const lastmod = new Date(j.created_at).toISOString().slice(0, 10);
        return `<url><loc>${SITE}/candidate/job/${j.id}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`;
      }),
    ].join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
    return new Response(xml, { headers: { ...cors, "Cache-Control": "public, max-age=3600" } });
  } catch (_e) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`;
    return new Response(xml, { status: 200, headers: cors });
  }
});
