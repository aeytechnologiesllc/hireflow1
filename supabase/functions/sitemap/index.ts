// Public sitemap of all published jobs, for Google for Jobs / Indeed organic discovery.
// Proxied on-domain at https://hireflownow.com/sitemap.xml (see vercel.json). Deploy with
// `--no-verify-jwt` so search engines can fetch it without auth.
const SITE = Deno.env.get("PUBLIC_SITE_URL") || "https://hireflownow.com";
const COUNTRY_TEXT_HINTS: Array<[RegExp, string]> = [
  [/\b(united states|u\.s\.a\.?|usa|us)\b/i, "US"],
  [/\bcanada\b/i, "CA"],
  [/\bpakistan\b/i, "PK"],
  [/\bunited kingdom\b|\buk\b|\bgreat britain\b/i, "GB"],
  [/\bindia\b/i, "IN"],
  [/\baustralia\b/i, "AU"],
  [/\bunited arab emirates\b|\buae\b/i, "AE"],
  [/\bgermany\b/i, "DE"],
  [/\bfrance\b/i, "FR"],
  [/\bspain\b/i, "ES"],
  [/\bitaly\b/i, "IT"],
  [/\bnetherlands\b/i, "NL"],
  [/\bireland\b/i, "IE"],
];
const US_STATE_HINT = /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b/i;
const US_STATE_NAME_HINT = /,\s*(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i;

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function inferCountryCode(locationText?: string | null): string | null {
  const text = (locationText ?? "").trim();
  if (!text) return null;
  for (const [pattern, code] of COUNTRY_TEXT_HINTS) {
    if (pattern.test(text)) return code;
  }
  if (US_STATE_HINT.test(text) || US_STATE_NAME_HINT.test(text)) return "US";
  return null;
}

interface SitemapJob {
  id: string;
  created_at: string;
  updated_at?: string | null;
  location?: string | null;
  location_country?: string | null;
  location_country_code?: string | null;
}

function hasGoogleLocationSignal(job: SitemapJob) {
  return !!(job.location_country_code || job.location_country || inferCountryCode(job.location));
}

Deno.serve(async () => {
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/xml; charset=utf-8" };
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
    const now = new Date().toISOString();
    const params = new URLSearchParams({
      status: "eq.published",
      select: "id,created_at,updated_at,application_deadline,location,location_country,location_country_code",
      order: "updated_at.desc",
      limit: "5000",
      or: `(application_deadline.is.null,application_deadline.gt.${now})`,
    });
    const res = await fetch(`${url}/rest/v1/jobs?${params.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const jobs: SitemapJob[] = res.ok ? await res.json() : [];
    const googleReadyJobs = jobs.filter(hasGoogleLocationSignal);

    const staticUrls = [
      { loc: `${SITE}/`, pri: "1.0" },
      { loc: `${SITE}/candidate`, pri: "0.6" },
    ];

    const urls = [
      ...staticUrls.map((u) => `<url><loc>${xmlEscape(u.loc)}</loc><priority>${u.pri}</priority></url>`),
      ...googleReadyJobs.map((j) => {
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
