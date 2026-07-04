/**
 * Server-side prerender for public job pages (/candidate/job/:id).
 *
 * WHY: the app is a client-rendered SPA, so the raw HTML Google first receives has
 * no job title and no JobPosting structured data — unreliable Google for Jobs
 * indexing. This function bakes the job <title>, meta description, canonical/OG
 * tags, and the JobPosting JSON-LD into the FIRST HTML response; the same SPA
 * then boots and hydrates normally for real users.
 *
 * DELIBERATELY self-contained plain-JS ESM (.mjs, ZERO imports): the previous .ts
 * version importing from ../src crashed Vercel's runtime at module load
 * (FUNCTION_INVOCATION_FAILED — "type":"module" ESM resolution), which 500'd the
 * live job pages. Keep this file dependency-free. The schema logic mirrors
 * src/lib/jobPostingSchema.ts (client-side counterpart) — update both together.
 *
 * SAFETY: fetches the current build's shell from "/" (never itself → no loop);
 * on ANY error serves the plain shell so a visitor's page never breaks.
 */

const SUPABASE_URL = "https://yqklrkpptnhubsnijqze.supabase.co";
const SUPABASE_KEY = "sb_publishable_oUcY5Ih_vL5DYIV74AMsug_4Qg4gZRu";
const JOB_FIELDS =
  "id,title,description,responsibilities,requirements,location,job_type,salary_min,salary_max,salary_currency,salary_period,created_at,application_deadline,job_code,location_city,location_region,location_country,location_country_code,latitude,longitude,is_remote,locations,employer_id";

const EMP_TYPE = {
  "full-time": "FULL_TIME",
  full_time: "FULL_TIME",
  "part-time": "PART_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  contractor: "CONTRACTOR",
  temporary: "TEMPORARY",
  temp: "TEMPORARY",
  internship: "INTERN",
};

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function placeOf(p) {
  const address = { "@type": "PostalAddress" };
  if (p.city) address.addressLocality = p.city;
  if (p.region) address.addressRegion = p.region;
  if (p.countryCode) address.addressCountry = p.countryCode;
  else if (p.country) address.addressCountry = p.country;
  const place = { "@type": "Place", address };
  if (p.lat != null && p.lon != null) {
    place.geo = { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lon };
  }
  return place;
}

function buildJobPostingSchema(job, { company, logo, origin }) {
  const url = `${origin}/candidate/job/${job.id}`;
  const loc = (job.location ?? "").trim();
  const isRemote = job.is_remote ?? (/remote/i.test(loc) || /remote/i.test(job.job_type ?? ""));

  const primary = {
    city: job.location_city,
    region: job.location_region,
    country: job.location_country,
    countryCode: job.location_country_code,
    lat: job.latitude,
    lon: job.longitude,
  };
  const hasStructured = !!(primary.city || primary.countryCode || primary.country);
  const allPlaces = [primary, ...(Array.isArray(job.locations) ? job.locations : [])].filter(
    (p) => p && (p.city || p.countryCode || p.country),
  );

  const descHtml =
    [
      job.description ? `<p>${job.description}</p>` : "",
      job.responsibilities ? `<h3>What you'll do</h3><p>${job.responsibilities}</p>` : "",
      job.requirements ? `<h3>What we're looking for</h3><p>${job.requirements}</p>` : "",
    ]
      .filter(Boolean)
      .join("") || `<p>${job.title}</p>`;

  const empType = EMP_TYPE[(job.job_type ?? "").toLowerCase()] ?? "FULL_TIME";
  const validThrough = job.application_deadline
    ? new Date(job.application_deadline)
    : new Date(new Date(job.created_at).getTime() + 60 * 86400000);

  const data = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: descHtml,
    datePosted: isoDate(new Date(job.created_at)),
    validThrough: isoDate(validThrough),
    employmentType: empType,
    directApply: true,
    url,
    identifier: { "@type": "PropertyValue", name: company || "HireFlow", value: job.job_code || job.id },
    hiringOrganization: {
      "@type": "Organization",
      name: company || "Confidential",
      ...(logo ? { logo } : {}),
    },
  };

  if (isRemote) {
    data.jobLocationType = "TELECOMMUTE";
    const reqName = primary.country || primary.countryCode;
    if (reqName) data.applicantLocationRequirements = { "@type": "Country", name: reqName };
    if (hasStructured) data.jobLocation = placeOf(primary);
  } else if (allPlaces.length > 0) {
    data.jobLocation = allPlaces.length === 1 ? placeOf(allPlaces[0]) : allPlaces.map(placeOf);
  } else if (loc) {
    data.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: loc } };
  }

  if (job.salary_min != null || job.salary_max != null) {
    const period = (job.salary_period || "").toUpperCase();
    const unitText = ["HOUR", "DAY", "WEEK", "MONTH", "YEAR"].includes(period)
      ? period
      : (job.salary_max ?? job.salary_min ?? 0) > 2000
        ? "YEAR"
        : "HOUR";
    data.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.salary_currency || "USD",
      value: {
        "@type": "QuantitativeValue",
        ...(job.salary_min != null ? { minValue: job.salary_min } : {}),
        ...(job.salary_max != null ? { maxValue: job.salary_max } : {}),
        unitText,
      },
    };
  }

  return data;
}

function jobPageTitle(job, company) {
  const base = (job.title || "").trim() || "Job opening";
  return company ? `${base} — ${company}` : `${base} — HireFlow`;
}

function jobMetaDescription(job) {
  const raw = (job.description || job.responsibilities || job.requirements || job.title || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (raw.length <= 155) return raw;
  return raw.slice(0, 152).trimEnd() + "…";
}

function sb(path) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
}

export default async function handler(req, res) {
  const id = String((req.query && req.query.id) || "").trim();
  const host = (req.headers && req.headers.host) || "hireflownow.com";
  const origin = `https://${host}`;

  let shell = "";
  try {
    const shellRes = await fetch(`${origin}/`, { headers: { "user-agent": "hireflow-prerender" } });
    shell = shellRes.ok ? await shellRes.text() : "";
    if (!shell || !/<div id="root"/i.test(shell)) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(shell || '<!doctype html><meta charset="utf-8"><title>HireFlow</title><p>Loading…</p>');
      return;
    }

    let job = null;
    if (id && /^[0-9a-f][0-9a-f-]{10,40}$/i.test(id)) {
      const jr = await sb(`jobs?id=eq.${encodeURIComponent(id)}&status=eq.published&select=${JOB_FIELDS}&limit=1`);
      if (jr.ok) {
        const rows = await jr.json();
        job = Array.isArray(rows) && rows[0] ? rows[0] : null;
      }
    }

    if (!job) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
      res.end(shell);
      return;
    }

    let company = null;
    let logo = null;
    if (job.employer_id) {
      try {
        const pr = await sb(`profiles?user_id=eq.${encodeURIComponent(job.employer_id)}&select=company_name,company_logo&limit=1`);
        if (pr.ok) {
          const p = (await pr.json())[0];
          if (p) {
            company = p.company_name || null;
            logo = p.company_logo || null;
          }
        }
      } catch {
        /* profile lookup is optional */
      }
    }

    const schema = buildJobPostingSchema(job, { company, logo, origin });
    const title = jobPageTitle(job, company);
    const desc = jobMetaDescription(job);
    const url = `${origin}/candidate/job/${job.id}`;
    const jsonLd = JSON.stringify(schema).replace(/</g, "\\u003c");

    const injected =
      `<meta property="og:type" content="website" />` +
      `<meta property="og:title" content="${esc(title)}" />` +
      `<meta property="og:description" content="${esc(desc)}" />` +
      `<meta property="og:url" content="${esc(url)}" />` +
      `<meta name="twitter:card" content="summary" />` +
      `<link rel="canonical" href="${esc(url)}" />` +
      `<script type="application/ld+json" data-jobposting="server">${jsonLd}</script>`;

    let out = shell
      .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`)
      .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${esc(desc)}" />`)
      // Drop the shell's default canonical (and any og:title/description) so the
      // job page carries EXACTLY ONE canonical — conflicting canonicals can make
      // Google index the homepage instead of the job.
      .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, "")
      .replace(/<meta\s+property="og:(title|description|url)"[^>]*>\s*/gi, "");
    out = out.includes("</head>") ? out.replace("</head>", injected + "</head>") : out + injected;

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");
    res.end(out);
  } catch {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(shell || '<!doctype html><meta charset="utf-8"><title>HireFlow</title><p>Loading…</p>');
  }
}
