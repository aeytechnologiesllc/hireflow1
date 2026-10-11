/**
 * Server-side head for a business's careers page: hireflownow.com/c/<slug>,
 * and hireflownow.com/careers (the home business, the one that runs HireFlow).
 *
 * WHY: the app is a client-rendered SPA, so the first HTML a link preview
 * (WhatsApp, Facebook, Messenger, X, LinkedIn) or a search engine receives is
 * the shell's. Opening HireFlow to other businesses (docs/BUSINESS-TRUST.md,
 * 2026-10-11), the shell says only "HireFlow"; this bakes the business's own
 * name, a line about its open roles and the careers picture into the first
 * response, for people and crawlers alike. The SPA then boots as usual.
 *
 * DELIBERATELY self-contained plain-JS ESM with ZERO imports, like
 * api/job-prerender.mjs (a .ts version importing ../src once crashed Vercel's
 * runtime at module load). On ANY error it serves the plain shell, so a
 * visitor's page never breaks. Reads only public views with the publishable
 * key: business_pages, employer_public_branding, published_jobs_public.
 */

const SUPABASE_URL = "https://yqklrkpptnhubsnijqze.supabase.co";
const SUPABASE_KEY = "sb_publishable_oUcY5Ih_vL5DYIV74AMsug_4Qg4gZRu";
const ORIGIN = "https://hireflownow.com";
/** business_pages.slug's own CHECK. */
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sb(path) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
}

async function firstRow(path) {
  const r = await sb(path);
  if (!r.ok) throw new Error(`lookup ${r.status}`);
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/** "Night shift chat agent and 2 more" from the open roles' titles. */
export function rolesLine(titles) {
  const list = (titles || []).map((t) => String(t || "").trim()).filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list[0]} and ${list.length - 1} more`;
}

export function careersHead({ company, titles, home, slug }) {
  const name = String(company || "").trim() || "HireFlow";
  const roles = rolesLine(titles);
  const title = `${name} — Careers`;
  const description = home
    ? "Remote chat support jobs with the Zulu Support Team, including team leads. All online: a few questions, a skills check, a computer check, a typing test, a chat practice and a written interview."
    : roles
      ? `Open roles at ${name}: ${roles}. Apply online, from your phone or computer.`
      : `Careers at ${name}. Apply online, from your phone or computer.`;
  const url = home ? `${ORIGIN}/careers` : `${ORIGIN}/c/${slug}`;
  const image = home ? `${ORIGIN}/share/zulu-careers.jpg` : `${ORIGIN}/share/careers.jpg`;
  return { title, description, url, image };
}

function inject(shell, head) {
  const tags =
    `<meta name="description" content="${esc(head.description)}" />` +
    `<meta property="og:type" content="website" />` +
    `<meta property="og:title" content="${esc(head.title)}" />` +
    `<meta property="og:description" content="${esc(head.description)}" />` +
    `<meta property="og:url" content="${esc(head.url)}" />` +
    `<meta property="og:image" content="${esc(head.image)}" />` +
    `<meta property="og:image:width" content="1200" />` +
    `<meta property="og:image:height" content="630" />` +
    `<meta name="twitter:card" content="summary_large_image" />` +
    `<meta name="twitter:title" content="${esc(head.title)}" />` +
    `<meta name="twitter:description" content="${esc(head.description)}" />` +
    `<meta name="twitter:image" content="${esc(head.image)}" />` +
    `<link rel="canonical" href="${esc(head.url)}" />`;
  let out = shell
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(head.title)}</title>`)
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, "")
    .replace(/<meta\s+property="og:(title|description|url|type|site_name|image(:[a-z]+)?)"[^>]*>\s*/gi, "")
    .replace(/<meta\s+name="(twitter:(card|title|description|image)|description)"[^>]*>\s*/gi, "");
  out = out.includes("</head>") ? out.replace("</head>", tags + "</head>") : out + tags;
  return out;
}

export default async function handler(req, res) {
  const home = String((req.query && req.query.home) || "") === "1";
  const slug = home ? "" : String((req.query && req.query.slug) || "").trim().toLowerCase();
  let shell = "";
  try {
    const shellRes = await fetch(`${ORIGIN}/index.html`, { headers: { "user-agent": "hireflow-prerender" } });
    shell = shellRes.ok ? await shellRes.text() : "";
    if (!shell || !/<div id="root"/i.test(shell)) throw new Error("no shell");

    const page = home
      ? await firstRow("business_pages?home_alias=eq.true&select=employer_id,slug&limit=1")
      : SLUG_RE.test(slug) && slug.length <= 60
        ? await firstRow(`business_pages?slug=eq.${encodeURIComponent(slug)}&select=employer_id,slug&limit=1`)
        : null;
    if (!page) {
      // No such business: the plain shell (the app says so), never cached for long.
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=60");
      res.end(shell);
      return;
    }
    const [brand, jobsRes] = await Promise.all([
      firstRow(`employer_public_branding?user_id=eq.${encodeURIComponent(page.employer_id)}&select=company_name&limit=1`).catch(() => null),
      sb(`published_jobs_public?employer_id=eq.${encodeURIComponent(page.employer_id)}&select=title&order=created_at.desc&limit=20`),
    ]);
    const jobs = jobsRes.ok ? await jobsRes.json() : [];
    const head = careersHead({ company: brand?.company_name, titles: (jobs || []).map((j) => j.title), home, slug: page.slug });

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=60");
    res.end(inject(shell, head));
  } catch {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(shell || '<!doctype html><meta charset="utf-8"><title>HireFlow</title><p>Loading…</p>');
  }
}
