/**
 * HireFlow job feed — /jobs.xml (rewritten to /api/job-feed).
 *
 * Standard aggregator XML feed ("Indeed-style" <source><job> format) of every
 * PUBLISHED job, each under its REAL employer's company name. This makes
 * HireFlow its own job source: aggregators that accept feeds self-serve
 * (Adzuna, Jooble, Talent.com, Careerjet, …) ingest this URL and list our jobs
 * for free; every click lands on hireflownow.com/candidate/job/:id (which is
 * prerendered for bots) and applications flow into Ava's screening.
 *
 * DELIBERATELY self-contained plain-JS ESM (.mjs, ZERO imports) — same hard
 * lesson as job-prerender.mjs: importing from ../src crashes Vercel's runtime
 * at module load. Keep this file dependency-free.
 */

const SUPABASE_URL = "https://yqklrkpptnhubsnijqze.supabase.co";
const SUPABASE_KEY = "sb_publishable_oUcY5Ih_vL5DYIV74AMsug_4Qg4gZRu";
const ORIGIN = "https://hireflownow.com";

const JOB_FIELDS =
  "id,title,description,responsibilities,requirements,location,job_type,salary_min,salary_max,salary_currency,salary_period,created_at,job_code,location_city,location_region,location_country,location_country_code,is_remote,employer_id";

async function sb(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/** CDATA-safe: a literal "]]>" inside content would break the XML. */
function cdata(s) {
  return `<![CDATA[${String(s ?? "").replaceAll("]]>", "]]&gt;")}]]>`;
}

function textBlock(job) {
  const parts = [];
  if (job.description) parts.push(job.description);
  if (job.responsibilities) parts.push(`What you'll do:\n${job.responsibilities}`);
  if (job.requirements) parts.push(`What we're looking for:\n${job.requirements}`);
  return parts.join("\n\n") || job.title || "";
}

function salaryText(job) {
  const cur = job.salary_currency || "USD";
  const per = (job.salary_period || "").toLowerCase();
  const perText = ["hour", "day", "week", "month", "year"].includes(per) ? ` per ${per}` : "";
  if (job.salary_min && job.salary_max) return `${cur} ${job.salary_min} - ${job.salary_max}${perText}`;
  if (job.salary_min) return `${cur} ${job.salary_min}+${perText}`;
  if (job.salary_max) return `up to ${cur} ${job.salary_max}${perText}`;
  return "";
}

function jobTypeText(t) {
  const s = (t || "").toLowerCase();
  if (s.includes("full")) return "fulltime";
  if (s.includes("part")) return "parttime";
  if (s.includes("contract")) return "contract";
  if (s.includes("intern")) return "internship";
  if (s.includes("temp")) return "temporary";
  return "fulltime";
}

export default async function handler(req, res) {
  try {
    const jobs =
      (await sb(`jobs?status=eq.published&select=${encodeURIComponent(JOB_FIELDS)}&order=created_at.desc&limit=1000`)) ?? [];

    // Company names per employer (one query for all).
    const employerIds = [...new Set(jobs.map((j) => j.employer_id).filter(Boolean))];
    const companies = new Map();
    if (employerIds.length > 0) {
      const list = employerIds.map((id) => `"${id}"`).join(",");
      const profiles = await sb(`profiles?user_id=in.(${encodeURIComponent(list)})&select=user_id,company_name`);
      for (const p of profiles ?? []) {
        if (p.company_name) companies.set(p.user_id, p.company_name);
      }
    }

    const items = jobs.map((job) => {
      const city = job.location_city || (job.location ? job.location.split(",")[0].trim() : "");
      const state = job.location_region || "";
      const country = job.location_country_code || job.location_country || "US";
      const company = companies.get(job.employer_id) || "Private employer";
      const url = `${ORIGIN}/candidate/job/${job.id}?utm_source=jobfeed&utm_medium=organic`;
      const salary = salaryText(job);
      return [
        "  <job>",
        `    <title>${cdata(job.title)}</title>`,
        `    <date>${cdata(new Date(job.created_at).toUTCString())}</date>`,
        `    <referencenumber>${cdata(job.job_code || job.id)}</referencenumber>`,
        `    <url>${cdata(url)}</url>`,
        `    <company>${cdata(company)}</company>`,
        `    <city>${cdata(city)}</city>`,
        `    <state>${cdata(state)}</state>`,
        `    <country>${cdata(country)}</country>`,
        `    <description>${cdata(textBlock(job))}</description>`,
        salary ? `    <salary>${cdata(salary)}</salary>` : null,
        `    <jobtype>${cdata(jobTypeText(job.job_type))}</jobtype>`,
        job.is_remote ? `    <remote>${cdata("yes")}</remote>` : null,
        "  </job>",
      ]
        .filter(Boolean)
        .join("\n");
    });

    const xml = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      "<source>",
      `  <publisher>${cdata("HireFlow")}</publisher>`,
      `  <publisherurl>${cdata(ORIGIN)}</publisherurl>`,
      `  <lastBuildDate>${cdata(new Date().toUTCString())}</lastBuildDate>`,
      ...items,
      "</source>",
      "",
    ].join("\n");

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    // Cache at the edge for 15 min; aggregators poll on their own schedule anyway.
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
    res.status(200).send(xml);
  } catch (e) {
    // Never break the URL for a crawler — serve an empty valid feed on error.
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res
      .status(200)
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<source><publisher>HireFlow</publisher><publisherurl>${ORIGIN}</publisherurl></source>\n`);
  }
}
