/**
 * Server-side head for the public pages that are the app's own: Open jobs,
 * the Privacy Policy and the Terms (vercel.json rewrites /open-jobs, /privacy
 * and /terms here, with ?page=).
 *
 * WHY: the app is a client-rendered SPA, so before its scripts run these
 * pages carried the shell's title ("HireFlow"), its description ("Apply for
 * jobs online…") and no canonical (the Phase 7 growth audit, round 2). Link
 * previews and crawlers that do not run scripts read that. This bakes each
 * page's own title, description and canonical into the first response, the
 * same words the page sets once it runs (usePageHead). The SPA then boots as
 * usual.
 *
 * DELIBERATELY self-contained plain-JS ESM with ZERO imports, like
 * api/careers-prerender.mjs. On ANY error it serves the plain shell.
 */

const ORIGIN = "https://hireflownow.com";

/** Keep in step with each page's usePageHead (OpenJobs.tsx, LegalPage.tsx with
 *  src/content/legal.ts; scripts/page_prerender.test.mjs compares them). The
 *  legal pages carry no company name in the title on purpose (the owner,
 *  2026-10-09; LegalPage.tsx). */
export const PAGES = {
  "open-jobs": {
    title: "Open jobs — HireFlow",
    description: "Jobs from businesses hiring on HireFlow, newest first. Apply from your phone or computer; it's free.",
    path: "/open-jobs",
    image: true,
  },
  privacy: {
    title: "Privacy Policy",
    description: "This policy says what information this site collects, why, who sees it, and what you can do about it.",
    path: "/privacy",
  },
  terms: {
    title: "Terms and Conditions",
    description:
      "These terms are the agreement between you and Southern Digital Technologies LLC (\"we\"), the company that runs hireflownow.com, for using it and the hiring tools on it (\"this site\").",
    path: "/terms",
  },
};

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function inject(shell, page) {
  const url = `${ORIGIN}${page.path}`;
  const image = `${ORIGIN}/share/hireflow.jpg`;
  // The legal pages show no brand (the owner, 2026-10-09): no picture either.
  const picture = page.image
    ? `<meta property="og:image" content="${esc(image)}" />` +
      `<meta property="og:image:width" content="1200" />` +
      `<meta property="og:image:height" content="630" />` +
      `<meta name="twitter:card" content="summary_large_image" />` +
      `<meta name="twitter:image" content="${esc(image)}" />`
    : `<meta name="twitter:card" content="summary" />`;
  const tags =
    `<meta name="description" content="${esc(page.description)}" />` +
    `<meta property="og:type" content="website" />` +
    `<meta property="og:title" content="${esc(page.title)}" />` +
    `<meta property="og:description" content="${esc(page.description)}" />` +
    `<meta property="og:url" content="${esc(url)}" />` +
    picture +
    `<meta name="twitter:title" content="${esc(page.title)}" />` +
    `<meta name="twitter:description" content="${esc(page.description)}" />` +
    `<link rel="canonical" href="${esc(url)}" />`;
  let out = shell
    .replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${esc(page.title)}</title>`)
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, "")
    .replace(/<meta\s+property="og:(title|description|url|type|site_name|image(:[a-z]+)?)"[^>]*>\s*/gi, "")
    .replace(/<meta\s+name="(twitter:(card|title|description|image)|description)"[^>]*>\s*/gi, "");
  out = out.includes("</head>") ? out.replace("</head>", () => tags + "</head>") : out + tags;
  return out;
}

export default async function handler(req, res) {
  const key = String((req.query && req.query.page) || "");
  const page = Object.prototype.hasOwnProperty.call(PAGES, key) ? PAGES[key] : null;
  let shell = "";
  try {
    const shellRes = await fetch(`${ORIGIN}/index.html`, { headers: { "user-agent": "hireflow-prerender" } });
    shell = shellRes.ok ? await shellRes.text() : "";
    if (!shell || !/<div id="root"/i.test(shell)) throw new Error("no shell");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.end(page ? inject(shell, page) : shell);
  } catch {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(shell || '<!doctype html><meta charset="utf-8"><title>HireFlow</title><p>Loading…</p>');
  }
}
