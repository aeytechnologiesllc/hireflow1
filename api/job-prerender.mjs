/**
 * Server-side prerender for public job pages (/candidate/job/:id), and for a
 * job's short link (hireflownow.com/<slug>) when a link-preview crawler asks.
 *
 * WHY: the app is a client-rendered SPA, so the raw HTML a link preview (WhatsApp,
 * Facebook, X, iMessage) or a search engine first receives has no job title. This
 * function bakes the job <title>, meta description, canonical and the OG/twitter
 * tags into the FIRST HTML response; the same SPA then boots and hydrates normally
 * for real users.
 *
 * It used to add schema.org JobPosting JSON-LD for Google for Jobs and to mark a
 * page noindex whenever that markup was incomplete (a worldwide remote role has no
 * country, so its page was hidden from search entirely). Google Jobs was removed on
 * 2026-10-05 (owner: "remove google jobs"): no JobPosting data, and a live job page
 * is simply indexable. Removed, closed and expired jobs still answer 404 + noindex.
 *
 * DELIBERATELY self-contained plain-JS ESM (.mjs, ZERO imports): the previous .ts
 * version importing from ../src crashed Vercel's runtime at module load
 * (FUNCTION_INVOCATION_FAILED — "type":"module" ESM resolution), which 500'd the
 * live job pages. Keep this file dependency-free.
 *
 * THE SHORT LINK (docs/SHORT-JOB-LINKS.md §6-7): vercel.json sends a crawler's
 * request for /<slug> (Facebook, Messenger, WhatsApp, X, LinkedIn, Telegram,
 * Slack, Discord, Viber, Google, Bing, Apple, Pinterest, Snapchat, Embedly,
 * Iframely) here as ?slug=, so a shared
 * hireflownow.com/team-lead previews as the job ("Chat Support Team Leader
 * …"), not as the careers site's generic card. People are never sent here
 * for /<slug>: they get the app, which opens the job itself. A name that is
 * no open job (a page of the app such as /applications, a closed job, a
 * typo) answers the plain shell with 200, exactly what a person gets, never
 * a 404: only an id link can say for certain that a listing is gone.
 *
 * SAFETY: fetches the current build's shell from "/" (never itself → no loop);
 * on ANY error serves the plain shell so a visitor's page never breaks.
 */

const SUPABASE_URL = "https://yqklrkpptnhubsnijqze.supabase.co";
const SUPABASE_KEY = "sb_publishable_oUcY5Ih_vL5DYIV74AMsug_4Qg4gZRu";
const ORIGIN = "https://hireflownow.com";
const JOB_FIELDS =
  "id,title,description,responsibilities,requirements,location,job_type,salary_min,salary_max,salary_currency,salary_period,created_at,application_deadline,job_code,location_city,location_region,location_country,location_country_code,latitude,longitude,is_remote,locations,employer_id,benefits";

/** A short link's name: the database's own CHECK (jobs_slug_format). */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/**
 * Names the site itself uses: a pinned copy of src/lib/jobSlug.ts
 * RESERVED_SLUGS (this file takes no imports; scripts/short_job_links.test.mjs
 * fails when the two differ). The editor refuses these, but the database
 * checks only the shape, so a job named "privacy" or "jobs" through the API
 * would otherwise show crawlers (Googlebot included) that job's title, with a
 * canonical to the job, at hireflownow.com/privacy. Never looked up.
 */
const RESERVED_SLUGS = new Set([
  "__preview", "about", "admin", "adzuna.xml", "analytics", "api", "applicants", "applications",
  "apply", "assets", "auth", "ava-preview", "candidate", "careers", "contact", "dashboard",
  "developer", "documents", "favicon.ico", "flow-lab", "help", "home", "index.html", "interviews",
  "job", "jobs", "jobs.xml", "join-team", "jooble.xml", "landing-assets", "login", "logout",
  "manifest.webmanifest", "marketing-demo", "media", "messages", "more", "my-documents",
  "notifications", "oauth", "preview", "privacy", "profile", "register", "robots.txt",
  "screenshots", "search", "settings", "signin", "signup", "site.webmanifest", "sitemap.xml",
  "staff", "support", "team", "team-portal", "terms", "verify"
]);

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jobPageTitle(job, company) {
  const base = (job.title || "").trim() || "Job opening";
  return company ? `${base} — ${company}` : `${base} — Zulu Support Team`;
}

function jobMetaDescription(job) {
  const raw = (job.description || job.responsibilities || job.requirements || job.title || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (raw.length <= 155) return raw;
  return raw.slice(0, 152).trimEnd() + "…";
}

/** Replace every robots meta tag in the page with a single one. */
function withRobots(html, content) {
  const tag = `<meta name="robots" content="${content}" />`;
  const stripped = html.replace(/<meta\s+name="robots"[^>]*>\s*/gi, "");
  return stripped.includes("</head>") ? stripped.replace("</head>", tag + "</head>") : stripped + tag;
}

function sb(path) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
}

export default async function handler(req, res) {
  const id = String((req.query && req.query.id) || "").trim();
  // A short link, when the request came in as /<slug> (vercel.json). An id
  // wins if both are somehow given.
  const slug = id ? "" : String((req.query && req.query.slug) || "").trim().toLowerCase();
  const origin = ORIGIN;

  let shell = "";
  try {
    const shellRes = await fetch(`${origin}/`, { headers: { "user-agent": "hireflow-prerender" } });
    shell = shellRes.ok ? await shellRes.text() : "";
    if (!shell || !/<div id="root"/i.test(shell)) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(shell || '<!doctype html><meta charset="utf-8"><title>Zulu Support Team</title><p>Loading…</p>');
      return;
    }

    let job = null;
    if (slug) {
      // The short link: the same public view, looked up by its name.
      let lookupFailed = false;
      if (SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug)) {
        const jr = await sb(`published_jobs_public?slug=eq.${encodeURIComponent(slug)}&select=${JOB_FIELDS}&limit=1`);
        lookupFailed = !jr.ok;
        if (jr.ok) {
          const rows = await jr.json();
          job = Array.isArray(rows) && rows[0] ? rows[0] : null;
          if (job?.application_deadline && new Date(job.application_deadline).getTime() < Date.now()) {
            job = null;
          }
        }
      }
      if (!job) {
        // Not an open job's name (a page of the app, a closed job, a typo),
        // or the lookup failed: the plain shell, as a person gets it.
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        // A failed lookup is never kept: the next crawl may find the job.
        res.setHeader("Cache-Control", lookupFailed ? "no-store" : "public, s-maxage=60, stale-while-revalidate=60");
        // /<slug> answers crawlers and people differently (vercel.json): a
        // cache must never hand one the other's page.
        res.setHeader("Vary", "User-Agent");
        res.end(shell);
        return;
      }
    }

    // `gone` means we KNOW there is no live listing: a malformed id, no row in
    // published_jobs_public (closed, deleted, never existed), or past its
    // deadline. A Supabase error is deliberately not "gone" — a hiccup must
    // never tell Google that a real, open job was removed.
    let gone = !job && !(id && /^[0-9a-f][0-9a-f-]{10,40}$/i.test(id));
    if (!job && !gone) {
      const jr = await sb(`published_jobs_public?id=eq.${encodeURIComponent(id)}&select=${JOB_FIELDS}&limit=1`);
      if (jr.ok) {
        const rows = await jr.json();
        job = Array.isArray(rows) && rows[0] ? rows[0] : null;
        if (job?.application_deadline && new Date(job.application_deadline).getTime() < Date.now()) {
          job = null;
        }
        gone = !job;
      }
    }

    if (!job) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      if (gone) {
        // A removed listing used to answer 200 with the homepage's title and
        // `index, follow` — a "soft 404" that kept the dead URL in Google. Answer
        // 404 + noindex instead. The body is still the SPA shell, so a person on
        // an old link gets the app's own "no longer available" screen.
        res.statusCode = 404;
        res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=60");
        res.end(withRobots(shell, "noindex,follow"));
      } else {
        res.statusCode = 200;
        res.setHeader("Cache-Control", "no-store");
        res.end(shell);
      }
      return;
    }

    let company = null;
    if (job.employer_id) {
      try {
        // employer_public_branding = safe public view (name+logo only); raw profiles are RLS-locked.
        const pr = await sb(`employer_public_branding?user_id=eq.${encodeURIComponent(job.employer_id)}&select=company_name&limit=1`);
        if (pr.ok) {
          const p = (await pr.json())[0];
          if (p) company = p.company_name || null;
        }
      } catch {
        /* profile lookup is optional */
      }
    }

    const title = jobPageTitle(job, company);
    const desc = jobMetaDescription(job);
    // One address for the job everywhere, also when this page was asked for
    // by its short link (docs/SHORT-JOB-LINKS.md §7): the sitemap and the
    // page's own head (JobPageHead.tsx) still name /candidate/job/:id, which
    // is prerendered for every visitor, while /<slug> is prerendered only for
    // crawlers and is the plain shell (canonical = the homepage) for anyone
    // else. Pointing here at /<slug> would give search two canonicals for one
    // job. All three move to the short link together, in one change.
    const url = `${origin}/candidate/job/${job.id}`;

    const injected =
      // The shell's plain description is stripped below, so replace it with the
      // job's own — otherwise the page ships with none at all.
      `<meta name="description" content="${esc(desc)}" />` +
      `<meta property="og:type" content="website" />` +
      `<meta property="og:title" content="${esc(title)}" />` +
      `<meta property="og:description" content="${esc(desc)}" />` +
      `<meta property="og:url" content="${esc(url)}" />` +
      // twitter:* needs its own title and description. The shell's defaults
      // describe an "AI-powered hiring platform" to an employer audience, and
      // anything preferring twitter:* over og:* — X among them — was serving
      // that to candidates with no job title in it at all.
      `<meta name="twitter:card" content="summary" />` +
      `<meta name="twitter:title" content="${esc(title)}" />` +
      `<meta name="twitter:description" content="${esc(desc)}" />` +
      `<link rel="canonical" href="${esc(url)}" />`;

    let out = shell
      .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`)
      .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${esc(desc)}" />`)
      // Drop the shell's default canonical (and any og:title/description) so the
      // job page carries EXACTLY ONE canonical — conflicting canonicals can make
      // Google index the homepage instead of the job.
      .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, "")
      .replace(/<meta\s+property="og:(title|description|url)"[^>]*>\s*/gi, "")
      // The shell's twitter:* and plain description were being left in place, so
      // a prerendered job page still shipped the employer marketing line — and a
      // duplicated twitter:card alongside the one injected above.
      .replace(/<meta\s+name="(twitter:(card|title|description|image)|description)"[^>]*>\s*/gi, "");
    out = out.includes("</head>") ? out.replace("</head>", injected + "</head>") : out + injected;
    // Exactly one robots tag: the shell ships `index, follow`, and appending a
    // second, contradictory noindex tag left the outcome up to the crawler. A job
    // that reaches this line is published and not past its deadline.
    out = withRobots(out, "index, follow");

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // Short on purpose: a closed job must stop looking live within minutes. A
    // 10-minute cache plus a 24-hour stale window kept handing crawlers the old
    // page (seen live 2026-09-16 on a just-deleted test job).
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=60");
    // The short link's page is the crawlers' answer only (people get the app
    // at the same address): never one cache entry for both.
    if (slug) res.setHeader("Vary", "User-Agent");
    res.end(out);
  } catch {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(shell || '<!doctype html><meta charset="utf-8"><title>Zulu Support Team</title><p>Loading…</p>');
  }
}
