/**
 * Server-side prerender for public job pages (/candidate/job/:id).
 *
 * WHY: the app is a client-rendered SPA, so the raw HTML Google first receives has
 * no job title and no JobPosting structured data (it's injected later by JS) — which
 * makes Google for Jobs indexing unreliable. This function bakes the job's <title>,
 * meta description, canonical/OG tags, and the JobPosting JSON-LD into the FIRST HTML
 * response, then lets the same SPA boot and hydrate normally for real users.
 *
 * SAFETY: it fetches the current build's shell from "/" (never itself → no loop), and
 * on ANY error falls back to the plain shell so a real visitor's page never breaks.
 * Served to everyone (no cloaking); short CDN cache so the function runs rarely.
 */
import { buildJobPostingSchema, jobPageTitle, jobMetaDescription, type JobPostingJob } from "../src/lib/jobPostingSchema";

const SUPABASE_URL = "https://yqklrkpptnhubsnijqze.supabase.co";
const SUPABASE_KEY = "sb_publishable_oUcY5Ih_vL5DYIV74AMsug_4Qg4gZRu";
const JOB_FIELDS =
  "id,title,description,responsibilities,requirements,location,job_type,salary_min,salary_max,salary_currency,salary_period,created_at,application_deadline,job_code,location_city,location_region,location_country,location_country_code,latitude,longitude,is_remote,locations,employer_id";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sb(path: string): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
}

// Loosely typed to avoid a hard dependency on @vercel/node types.
export default async function handler(req: any, res: any): Promise<void> {
  const id = String((req.query && req.query.id) || "").trim();
  const host = (req.headers && req.headers.host) || "hireflownow.com";
  const origin = `https://${host}`;

  let shell = "";
  try {
    // Shell = the current build's index.html (correct hashed asset tags). "/" never
    // routes back through this function, so there is no recursion.
    const shellRes = await fetch(`${origin}/`, { headers: { "user-agent": "hireflow-prerender" } });
    shell = shellRes.ok ? await shellRes.text() : "";
    if (!shell || !/[0-9a-f-]{36}|<div id="root"/i.test(shell)) {
      // Couldn't get a usable shell — extremely rare (site down). Bail gracefully.
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(shell || "<!doctype html><meta charset=utf-8><title>HireFlow</title><p>Loading…</p>");
      return;
    }

    let job: JobPostingJob | null = null;
    if (id) {
      const jr = await sb(`jobs?id=eq.${encodeURIComponent(id)}&status=eq.published&select=${JOB_FIELDS}&limit=1`);
      if (jr.ok) {
        const rows = (await jr.json()) as JobPostingJob[];
        job = Array.isArray(rows) && rows[0] ? rows[0] : null;
      }
    }

    // Unknown / unpublished job → serve the plain shell; the SPA handles the state.
    if (!job) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
      res.end(shell);
      return;
    }

    // Employer name + logo strengthen the JobPosting (optional).
    let company: string | null = null;
    let logo: string | null = null;
    const employerId = (job as unknown as { employer_id?: string }).employer_id;
    if (employerId) {
      const pr = await sb(`profiles?user_id=eq.${encodeURIComponent(employerId)}&select=company_name,company_logo&limit=1`);
      if (pr.ok) {
        const p = ((await pr.json()) as Array<{ company_name?: string; company_logo?: string }>)[0];
        if (p) {
          company = p.company_name || null;
          logo = p.company_logo || null;
        }
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
      .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${esc(desc)}" />`);
    out = out.includes("</head>") ? out.replace("</head>", injected + "</head>") : out + injected;

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");
    res.end(out);
  } catch {
    // Any failure → serve the plain shell if we have it, else a minimal loader.
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(shell || "<!doctype html><meta charset=utf-8><title>HireFlow</title><p>Loading…</p>");
  }
}
