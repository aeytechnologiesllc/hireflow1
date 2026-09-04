// Public sitemap of all published jobs, for Google for Jobs / Indeed organic discovery.
// Proxied on-domain at https://hireflownow.com/sitemap.xml (see vercel.json). Deploy with
// `--no-verify-jwt` so search engines can fetch it without auth.
//
// A job is listed here ONLY when its page will carry JobPosting markup — the same
// conditions api/job-prerender.mjs applies before it serves a page as indexable
// (real company name, city, country, unexpired deadline) plus the exclude_from_feed
// flag QA/demo jobs carry. Listing a page that is served noindex tells Google the
// site does not know its own content, so the two gates must never disagree.
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

/** US state names + postal abbreviations (lower-case). A state is never a city. */
const US_STATE_TOKENS = new Set<string>([
  ..."al ak az ar ca co ct de fl ga hi ia id il in ks ky la ma md me mi mn mo ms mt nc nd ne nh nj nm nv ny oh ok or pa ri sc sd tn tx ut va vt wa wi wv wy dc".split(" "),
  ..."alabama alaska arizona arkansas california colorado connecticut delaware florida georgia hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada ohio oklahoma oregon pennsylvania tennessee texas utah vermont virginia washington wisconsin wyoming".split(" "),
  "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota",
  "rhode island", "south carolina", "south dakota", "west virginia", "district of columbia",
]);

/** Country names and codes (lower-case) that must never be mistaken for a city. */
const COUNTRY_TOKENS = new Set<string>([
  "united states", "united states of america", "usa", "us", "u.s.", "u.s.a.", "america",
  "united kingdom", "uk", "u.k.", "great britain", "britain", "england", "scotland", "wales", "northern ireland", "gb",
  "canada", "ca", "pakistan", "pk", "india", "in", "australia", "au", "new zealand", "nz",
  "united arab emirates", "uae", "ae", "saudi arabia", "sa", "qatar", "qa", "kuwait", "kw", "bahrain", "bh", "oman", "om",
  "germany", "de", "france", "fr", "spain", "es", "italy", "it", "netherlands", "the netherlands", "nl",
  "ireland", "ie", "belgium", "be", "portugal", "pt", "sweden", "se", "norway", "no", "denmark", "dk",
  "finland", "fi", "switzerland", "ch", "austria", "at", "poland", "pl",
  "mexico", "mx", "brazil", "br", "argentina", "ar", "colombia", "co", "chile", "cl",
  "philippines", "ph", "indonesia", "id", "malaysia", "my", "singapore", "sg", "thailand", "th", "vietnam", "vn",
  "bangladesh", "bd", "sri lanka", "lk", "nepal", "np", "china", "cn", "japan", "jp", "south korea", "korea", "kr",
  "nigeria", "ng", "kenya", "ke", "south africa", "za", "egypt", "eg", "ghana", "gh", "morocco", "ma",
  "turkey", "türkiye", "tr", "israel", "il", "remote",
]);

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
  application_deadline?: string | null;
  location?: string | null;
  location_city?: string | null;
  location_country?: string | null;
  location_country_code?: string | null;
  employer_id?: string | null;
  exclude_from_feed?: boolean | null;
}

interface BrandingRow {
  user_id: string | null;
  company_name: string | null;
}

function hasCountry(job: SitemapJob) {
  return !!(job.location_country_code || job.location_country || inferCountryCode(job.location));
}

/** Same rule as api/job-feed.mjs: a country, a state or "Remote" is not a city. */
function isCityToken(token: string, job: SitemapJob) {
  const t = token.trim();
  const lower = t.toLowerCase();
  if (!t) return false;
  if (COUNTRY_TOKENS.has(lower)) return false;
  if (job.location_country && lower === job.location_country.trim().toLowerCase()) return false;
  if (job.location_country_code && lower === job.location_country_code.trim().toLowerCase()) return false;
  if (US_STATE_TOKENS.has(lower)) return false;
  return true;
}

/** A stored city, or the text before the first comma when that text is really a city. */
function cityOf(job: SitemapJob): string {
  const stored = (job.location_city ?? "").trim();
  if (stored) return stored;
  const loc = (job.location ?? "").trim();
  if (!loc || /^remote$/i.test(loc) || !loc.includes(",")) return "";
  const first = loc.split(",")[0].replace(/^remote\b[\s—–\-:|]*/i, "").trim();
  return isCityToken(first, job) ? first : "";
}

async function fetchCompanyNames(url: string, key: string, employerIds: string[]) {
  const companies = new Map<string, string>();
  if (employerIds.length === 0) return companies;
  // employer_public_branding = public view (name + logo only), readable with any key.
  const params = new URLSearchParams({
    select: "user_id,company_name",
    user_id: `in.(${employerIds.join(",")})`,
  });
  const res = await fetch(`${url}/rest/v1/employer_public_branding?${params.toString()}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return companies;
  const rows: BrandingRow[] = await res.json();
  for (const row of rows) {
    const name = (row.company_name ?? "").trim();
    if (row.user_id && name) companies.set(row.user_id, name);
  }
  return companies;
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
      select: "id,created_at,updated_at,application_deadline,location,location_city,location_country,location_country_code,employer_id,exclude_from_feed",
      order: "updated_at.desc",
      limit: "5000",
      or: `(application_deadline.is.null,application_deadline.gt.${now})`,
    });
    const res = await fetch(`${url}/rest/v1/jobs?${params.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const jobs: SitemapJob[] = res.ok ? await res.json() : [];

    const employerIds = [...new Set(jobs.map((j) => j.employer_id).filter((id): id is string => !!id))];
    const companies = await fetchCompanyNames(url, key, employerIds);

    // Mirror of the prerender's `indexable` gate — a page listed here is a page
    // that will actually carry JobPosting markup when Google fetches it.
    const indexableJobs = jobs.filter((job) => {
      if (job.exclude_from_feed) return false;
      if (job.application_deadline && new Date(job.application_deadline).getTime() < nowMs) return false;
      if (!job.employer_id || !companies.get(job.employer_id)) return false;
      if (!cityOf(job)) return false;
      return hasCountry(job);
    });

    const staticUrls = [
      { loc: `${SITE}/`, pri: "1.0" },
      { loc: `${SITE}/candidate`, pri: "0.6" },
    ];

    const urls = [
      ...staticUrls.map((u) => `<url><loc>${xmlEscape(u.loc)}</loc><priority>${u.pri}</priority></url>`),
      ...indexableJobs.map((j) => {
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
