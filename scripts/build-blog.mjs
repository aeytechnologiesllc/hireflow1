#!/usr/bin/env node
/**
 * The blog: hireflownow.com/blog (docs/BLOG.md; docs/LAUNCH-PLAN.md, Phase 6).
 *
 * Turns content/blog/*.md into plain HTML pages in the front page's look (no
 * React, nothing to run in the browser but the two small scripts every public
 * page loads), so a search engine reads each article as written:
 *
 *   public/blog/index.html          the list of posts
 *   public/blog/<slug>/index.html   one per post
 *   public/blog-sitemap.xml         every page above, for search engines
 *
 * Run by `npm run build` before Vite copies public/ into dist/. The output is
 * not committed (.gitignore): the Markdown is the source.
 *
 * A post starts with front matter:
 *
 *   ---
 *   title: How to hire customer service agents from the Philippines
 *   description: One or two sentences, at most 160 characters.
 *   date: 2026-10-25
 *   slug: hire-customer-service-agents-philippines
 *   author: HireFlow
 *   updated: 2026-11-02        (optional)
 *   draft: true                (optional: not built, not listed)
 *   ---
 *
 * A post that breaks a rule (a missing field, a slug in use, an h1 in the
 * body, raw HTML, a link that is not a site path or https) stops the build,
 * so a mistake never ships quietly.
 *
 *   node scripts/build-blog.mjs                build into public/
 *   node scripts/build-blog.mjs --check        check every post, write nothing
 */
import { readFileSync, readdirSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SITE = "https://hireflownow.com";
export const SIGNUP = "https://staff.hireflownow.com/auth?mode=signup";
const SHARE_IMAGE = `${SITE}/share/hireflow.jpg`;
// The page counter's own shape for a page name (WORD_SLUG_RE in
// supabase/functions/_shared/telemetry.ts): words, or a number between
// hyphens, starting with a word ("screening-150-applicants"). A long slug in
// any other shape could be counted as "/blog/<redacted>" (the second Phase 6
// review), so every slug keeps to it.
const SLUG = /^[a-z]+(?:-(?:[a-z]+|[0-9]+))+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FIELDS = ["title", "description", "date", "slug", "author"];
// Every key a post may have: a misspelt one ("darft: true") stops the build
// rather than publishing a draft (the Phase 6 review).
const KNOWN_KEYS = new Set([...FIELDS, "updated", "draft"]);
// The longest campaign tag the sign-up page keeps (src/lib/signupSource.ts, carry-source.js).
const MAX_SLUG = 60;

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inside <script type="application/ld+json">: no "</script>" can close it early. */
function jsonLd(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

/** "2026-10-25" → "October 25, 2026", read as a calendar date (no time zone shift). */
export function longDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function realDate(iso) {
  if (!DATE.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** The front matter (key: value lines between two "---") and the body. */
export function parsePost(source, file = "post") {
  const text = String(source).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${file}: no front matter (start the file with ---)`);
  const meta = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim()) continue;
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!kv) throw new Error(`${file}: front matter line is not "key: value": ${JSON.stringify(line)}`);
    if (!KNOWN_KEYS.has(kv[1])) throw new Error(`${file}: unknown front matter key "${kv[1]}" (known: ${[...KNOWN_KEYS].join(", ")})`);
    // A key given twice ("draft: true" then "draft: false") is a mistake, never "the last one wins".
    if (Object.hasOwn(meta, kv[1])) throw new Error(`${file}: front matter key "${kv[1]}" is given twice`);
    let value = kv[2].trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    // No control character or noncharacter in a title or a description (it makes feed.xml invalid XML).
    if (/[\u0000-\u001F\u007F-\u009F\u2028\u2029\uFFFE\uFFFF\uFDD0-\uFDEF]/.test(value)) throw new Error(`${file}: "${kv[1]}" has a control character`);
    meta[kv[1]] = value;
  }
  for (const key of FIELDS) {
    if (!meta[key]) throw new Error(`${file}: front matter needs "${key}"`);
  }
  if (!SLUG.test(meta.slug) || meta.slug.length > MAX_SLUG) throw new Error(`${file}: slug "${meta.slug}" must be lowercase words and hyphens, at most ${MAX_SLUG} characters`);
  if (!realDate(meta.date)) throw new Error(`${file}: date "${meta.date}" must be a real YYYY-MM-DD`);
  if (Object.hasOwn(meta, "updated") && (!realDate(meta.updated) || meta.updated < meta.date)) throw new Error(`${file}: updated "${meta.updated}" must be a real YYYY-MM-DD, not before the date`);
  // An empty "draft:" is a mistake, never "published" (the second Phase 6 review).
  if (Object.hasOwn(meta, "draft") && meta.draft !== "true" && meta.draft !== "false") throw new Error(`${file}: draft must be true or false`);
  // A published post cannot be dated ahead; a draft may be (it is never built).
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (meta.draft !== "true" && (meta.date > tomorrow || (meta.updated && meta.updated > tomorrow))) throw new Error(`${file}: a date in the future`);
  if (meta.title.length > 90) throw new Error(`${file}: title is ${meta.title.length} characters (90 at most)`);
  if (meta.description.length < 50 || meta.description.length > 160) throw new Error(`${file}: description is ${meta.description.length} characters (50 to 160)`);
  const body = m[2].trim();
  if (!body) throw new Error(`${file}: the post has no text`);
  return {
    title: meta.title,
    description: meta.description,
    date: meta.date,
    updated: meta.updated || null,
    slug: meta.slug,
    author: meta.author,
    draft: meta.draft === "true",
    body,
  };
}

/** A link a post may make: a page on this site, a fragment, https, or mail. */
export function allowedHref(href) {
  const h = String(href ?? "").trim();
  if (/^#[a-z0-9-]+$/i.test(h)) return true;
  if (/^\/(?!\/)[^\s\\]*$/.test(h)) return true;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(h)) return true;
  // "https:evil.com" parses, but opens as a broken path on this site (the second Phase 6 review).
  if (!/^https:\/\/[^/\\]/i.test(h)) return false;
  try {
    const u = new URL(h);
    // "https://hireflownow.com@evil.example/" reads as this site and opens another (the third Phase 6 review).
    return u.protocol === "https:" && !!u.hostname && !u.username && !u.password;
  } catch {
    return false;
  }
}

function headingId(text, used) {
  const base = text.toLowerCase().replace(/&[a-z#0-9]+;/g, "").replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "section";
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}

/** The post's Markdown as HTML: no raw HTML, no h1, links checked, h2/h3 with ids. */
export function renderMarkdown(markdown, file = "post") {
  const used = new Set();
  const md = new Marked({ gfm: true, breaks: false, async: false });
  md.use({
    renderer: {
      html(token) {
        throw new Error(`${file}: raw HTML is not allowed in a post (${JSON.stringify(String(token.text).trim().slice(0, 40))})`);
      },
      heading(token) {
        if (token.depth === 1) throw new Error(`${file}: no "# " heading in the body (the title is the page's only h1); start sections with "## "`);
        const inner = this.parser.parseInline(token.tokens);
        if (token.depth > 3) return `<h4>${inner}</h4>\n`;
        return `<h${token.depth} id="${headingId(inner, used)}">${inner}</h${token.depth}>\n`;
      },
      link(token) {
        // A bare "www.example.com" in the text becomes an http:// link.
        if (/^http:\/\/www\./i.test(token.href) && token.raw === token.text) throw new Error(`${file}: "${token.text}" is a bare web address; write it as a link, [${token.text}](https://${token.text})`);
        if (!allowedHref(token.href)) throw new Error(`${file}: link "${token.href}" must be a site path ("/open-jobs"), https or mailto`);
        const inner = this.parser.parseInline(token.tokens);
        const external = /^https:\/\//i.test(token.href) && !/^https:\/\/(staff\.)?hireflownow\.com(\/|$)/i.test(token.href);
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
        return `<a href="${escapeHtml(token.href)}"${title}${external ? ' rel="noopener"' : ""}>${inner}</a>`;
      },
      image(token) {
        throw new Error(`${file}: images are not supported yet (${JSON.stringify(token.href)})`);
      },
    },
  });
  try {
    return md.parse(markdown);
  } catch (error) {
    // The library adds "Please report this to …marked" to every error; these are the post's.
    throw new Error(String(error?.message ?? error).replace(/\s*Please report this to https:\/\/github\.com\/markedjs\/marked\.?\s*/i, "").trim());
  }
}

export function wordCount(markdown) {
  return String(markdown).replace(/[#>*_`[\]()|-]/g, " ").split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
}

/** Every post in content/blog, checked, newest first; drafts left out unless asked for. */
export function loadPosts(dir = path.join(ROOT, "content", "blog"), { includeDrafts = false } = {}) {
  if (!existsSync(dir)) return [];
  const posts = [];
  const slugs = new Map();
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
    const post = parsePost(readFileSync(path.join(dir, name), "utf8"), name);
    if (slugs.has(post.slug)) throw new Error(`${name}: slug "${post.slug}" is already used by ${slugs.get(post.slug)}`);
    slugs.set(post.slug, name);
    post.file = name;
    post.html = renderMarkdown(post.body, name);
    post.minutes = Math.max(1, Math.round(wordCount(post.body) / 220));
    if (includeDrafts || !post.draft) posts.push(post);
  }
  // A link to another guide must reach a published one (never a draft, never
  // a typo), however it is written: with a #part or ?query, as a full
  // hireflownow.com address, or in capitals (the second Phase 6 review).
  const published = new Set(posts.filter((p) => !p.draft).map((p) => p.slug));
  for (const post of posts.filter((p) => !p.draft)) {
    for (const m of post.html.matchAll(/href="([^"]*)"/g)) {
      const slug = guideSlugOf(m[1].replace(/&amp;/g, "&"));
      if (slug !== null && !published.has(slug)) throw new Error(`${post.file}: links to ${m[1]}, which is not a published guide (guides are at /blog/<slug>, in lower case)`);
    }
  }
  return posts.sort((a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : a.date < b.date ? 1 : -1));
}

/**
 * The guide a link points to ("/blog/<slug>", "https://hireflownow.com/blog/<slug>#x"):
 * its slug as written, "" for the list itself, or null for any other page.
 */
export function guideSlugOf(href) {
  let url;
  try {
    url = new URL(href, `${SITE}/`);
  } catch {
    return null;
  }
  // "hireflownow.com." is the same site; "/%62log/" is "/blog/" (the third Phase 6 review).
  if (!/^(www\.)?hireflownow\.com\.?$/i.test(url.hostname)) return null;
  let path = url.pathname.replace(/\/$/, "");
  try {
    path = decodeURIComponent(path);
  } catch {
    // a broken escape is no guide's address; read it as written
  }
  if (!/^\/blog(\/|$)/i.test(path)) return null;
  if (path === "/blog" || path === "/blog/feed.xml") return null;
  // "/Blog/..." or "/blog/a/b" is no guide's address (addresses are case-sensitive): return it as written.
  return path.startsWith("/blog/") ? path.slice("/blog/".length) : path.slice(1);
}

/** The sign-up button's address, tagged with the page it was pressed on. */
export function ctaHref(campaign, medium = "article") {
  return `${SIGNUP}&utm_source=blog&utm_medium=${encodeURIComponent(medium)}&utm_campaign=${encodeURIComponent(campaign)}`;
}

const MARK =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#14120E"/><rect x="0.5" y="0.5" width="63" height="63" rx="13.5" fill="none" stroke="rgba(224,185,106,0.28)"/><path d="M13 46 L25 19 L37 39 L51 17" fill="none" stroke="#E0B96A" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* The front page's two worlds (public/landing.html): the night for the bar
   and the title, the morning's ivory paper for the reading, one brass accent. */
const STYLE = `
  :root {
    color-scheme: light;
    --night: #05070B; --night-ink: #F4F0E6; --night-ink-2: rgba(244, 240, 230, 0.72); --night-line: rgba(244, 240, 230, 0.16);
    --gold: #E8C37E;
    --paper: #F6F1E6; --ink: #101613; --ink-2: rgba(16, 22, 19, 0.74); --ink-3: rgba(16, 22, 19, 0.6); --line: rgba(16, 22, 19, 0.14);
    --brass: #8A6420; --brass-dark: #74531A;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { background: var(--paper); color: var(--ink); font: 400 18px/1.7 "Geist", system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
  a { color: var(--brass); text-underline-offset: 3px; }
  a:hover { color: var(--brass-dark); }
  .bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px clamp(16px, 4vw, 48px); padding-top: calc(14px + env(safe-area-inset-top, 0px)); background: var(--night); color: var(--night-ink); border-bottom: 1px solid var(--night-line); }
  .brand { display: inline-flex; align-items: center; gap: 10px; font: 600 17px/1 "Geist", sans-serif; letter-spacing: -0.01em; color: inherit; text-decoration: none; }
  .brand:hover { color: inherit; }
  .brand svg { width: 26px; height: 26px; flex: none; display: block; }
  .bar nav { display: inline-flex; align-items: center; gap: 18px; white-space: nowrap; }
  .bar nav a.plain { color: var(--night-ink-2); font-size: 14px; text-decoration: none; }
  .bar nav a.plain:hover { color: var(--night-ink); }
  .btn { display: inline-flex; align-items: center; font: 600 15px/1 "Geist", system-ui, sans-serif; text-decoration: none; border-radius: 10px; padding: 14px 20px; white-space: nowrap; }
  .bar .btn { background: var(--night-ink); color: #0A0D12; padding: 11px 15px; font-size: 14px; }
  .bar .btn:hover { background: #fff; color: #0A0D12; }
  @media (max-width: 560px) { .bar nav { gap: 12px; } .bar nav a.plain.wide { display: none; } .bar .btn { padding: 10px 12px; font-size: 13.5px; } }
  .head { background: var(--night); color: var(--night-ink); padding: clamp(40px, 8vw, 88px) 16px clamp(36px, 6vw, 64px); }
  .head > div { max-width: 720px; margin: 0 auto; }
  .crumbs { margin: 0 0 18px; font-size: 13px; letter-spacing: 0.16em; text-transform: uppercase; }
  .crumbs a { color: var(--gold); text-decoration: none; }
  h1 { margin: 0; font: 700 clamp(32px, 5.4vw, 52px)/1.06 "Geist", system-ui, sans-serif; letter-spacing: -0.035em; text-wrap: balance; }
  .dek { margin: 18px 0 0; font-size: clamp(17px, 2vw, 20px); line-height: 1.55; color: var(--night-ink-2); text-wrap: pretty; }
  .meta { margin: 22px 0 0; font-size: 14px; color: var(--night-ink-2); }
  main { padding: clamp(32px, 6vw, 64px) 16px 24px; }
  .body, .list, .more, .end { max-width: 720px; margin: 0 auto; }
  .body h2 { font: 700 clamp(24px, 3vw, 30px)/1.2 "Geist", sans-serif; letter-spacing: -0.02em; margin: 1.9em 0 0.5em; }
  .body h3 { font: 600 20px/1.3 "Geist", sans-serif; margin: 1.6em 0 0.4em; }
  .body h4 { font: 600 18px/1.4 "Geist", sans-serif; margin: 1.4em 0 0.3em; }
  .body p, .body ul, .body ol, .body blockquote, .body table, .body pre { margin: 0 0 1.1em; }
  .body ul, .body ol { padding-left: 1.3em; }
  .body li { margin: 0.3em 0; }
  .body blockquote { margin-left: 0; padding: 4px 0 4px 18px; border-left: 3px solid var(--brass); color: var(--ink-2); }
  .body code { font: 500 0.88em/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; background: rgba(16, 22, 19, 0.06); padding: 2px 5px; border-radius: 5px; }
  .body pre { background: #101613; color: #F4F0E6; padding: 16px 18px; border-radius: 10px; overflow-x: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
  .body pre code { background: none; padding: 0; color: inherit; }
  .body table { width: 100%; border-collapse: collapse; font-size: 16px; display: block; overflow-x: auto; }
  .body th, .body td { text-align: left; padding: 9px 12px 9px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  .body hr { border: 0; border-top: 1px solid var(--line); margin: 2em 0; }
  .end { margin-top: 48px; padding: 28px clamp(20px, 4vw, 32px); border-radius: 16px; background: #EFE7D6; border: 1px solid var(--line); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px 28px; }
  .end h2 { margin: 0 0 6px; font: 700 22px/1.25 "Geist", sans-serif; letter-spacing: -0.02em; }
  .end p { margin: 0; font-size: 16px; color: var(--ink-2); max-width: 40ch; }
  .end .go { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 8px; }
  .end .btn { background: var(--brass); color: #FBF7EE; }
  .end .btn:hover { background: var(--brass-dark); color: #FBF7EE; }
  .end small { font-size: 13px; color: var(--ink-3); }
  .more { margin-top: 56px; }
  .more h2, .list h2 { font: 600 13px/1 "Geist", sans-serif; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-3); margin: 0 0 8px; }
  .card { display: block; padding: 22px 0; border-bottom: 1px solid var(--line); text-decoration: none; color: inherit; }
  .card:hover { color: inherit; }
  .card:hover b { color: var(--brass); }
  .card b { display: block; font: 600 21px/1.3 "Geist", sans-serif; letter-spacing: -0.015em; }
  .card span { display: block; margin-top: 6px; font-size: 16px; color: var(--ink-2); }
  .card small { display: block; margin-top: 8px; font-size: 13.5px; color: var(--ink-3); }
  footer { padding: 40px 16px calc(40px + env(safe-area-inset-bottom, 0px)); }
  .foot { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 22px; font-size: 13.5px; color: var(--ink-3); }
  .foot a { color: inherit; text-decoration: none; }
  .foot a:hover { color: var(--ink); text-decoration: underline; }
  .legal { margin: 14px 0 0; text-align: center; font-size: 12.5px; color: var(--ink-3); }
`;

function head({ title, description, canonical, type, extraMeta = "", graph, campaign = "blog" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#05070B">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="HireFlow">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${SHARE_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="HireFlow: hire customer service agents while you sleep">
${extraMeta}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${SHARE_IMAGE}">
<link rel="alternate" type="application/rss+xml" title="HireFlow guides" href="${SITE}/blog/feed.xml">
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=7">
<link rel="alternate icon" href="/favicon.ico?v=7" sizes="any">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=7">
<script type="application/ld+json">${jsonLd({ "@context": "https://schema.org", "@graph": graph })}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap">
<script src="/beacon.js" defer></script>
<script src="/carry-source.js" defer></script>
<style>${STYLE}</style>
</head>
<body>
<header class="bar">
  <a class="brand" href="/">${MARK}HireFlow</a>
  <nav aria-label="Main"><a class="plain" href="/blog">Guides</a><a class="plain wide" href="/open-jobs">Open jobs</a><a class="btn" href="${ctaHref(campaign, "bar")}">Post a job free</a></nav>
</header>
`;
}

function foot() {
  const year = new Date().getUTCFullYear();
  return `<footer>
  <nav class="foot" aria-label="More"><a href="/">HireFlow</a><a href="/blog">Guides</a><a href="/open-jobs">Open jobs</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="https://staff.hireflownow.com/auth">Team sign in</a></nav>
  <p class="legal">© ${year} Southern Digital Technologies LLC</p>
</footer>
</body>
</html>
`;
}

const ORG = { "@type": "Organization", "@id": `${SITE}/#org`, name: "HireFlow", legalName: "Southern Digital Technologies LLC", url: `${SITE}/`, logo: `${SITE}/icon-512.png` };

function authorOf(post) {
  return post.author === "HireFlow" ? { "@id": `${SITE}/#org` } : { "@type": "Person", name: post.author };
}

function card(post) {
  return `<a class="card" href="/blog/${post.slug}"><b>${escapeHtml(post.title)}</b><span>${escapeHtml(post.description)}</span><small><time datetime="${post.date}">${longDate(post.date)}</time> · ${post.minutes} min read</small></a>`;
}

function endBlock(campaign, medium = "article") {
  return `<aside class="end" aria-label="Post a job">
  <div><h2>Hiring a customer service agent?</h2><p>Post the role and share its link tonight. By morning your applicants have handled a realistic customer conversation, been scored and ranked.</p></div>
  <span class="go"><a class="btn" href="${ctaHref(campaign, medium)}">Post your first job free</a><small>First job free. No card.</small></span>
</aside>`;
}

export function postPage(post, all) {
  const canonical = `${SITE}/blog/${post.slug}`;
  const modified = post.updated || post.date;
  // The next three guides after this one in the list, round the end: every
  // guide is linked from three others (with one date for all, the first three
  // were linked from every page and the rest from none; the Phase 6 review).
  const at = all.findIndex((p) => p.slug === post.slug);
  const others = [1, 2, 3].map((k) => all[(at + k) % all.length]).filter((p, i, list) => p && p.slug !== post.slug && list.indexOf(p) === i);
  const graph = [
    ORG,
    {
      "@type": "BlogPosting",
      "@id": `${canonical}#article`,
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      dateModified: modified,
      author: authorOf(post),
      publisher: { "@id": `${SITE}/#org` },
      mainEntityOfPage: canonical,
      image: SHARE_IMAGE,
      inLanguage: "en",
      wordCount: wordCount(post.body),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "HireFlow", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE}/blog` },
        { "@type": "ListItem", position: 3, name: post.title, item: canonical },
      ],
    },
  ];
  const extraMeta = `<meta property="article:published_time" content="${post.date}">\n<meta property="article:modified_time" content="${modified}">\n`;
  return (
    head({ title: `${post.title} | HireFlow`, description: post.description, canonical, type: "article", extraMeta, graph, campaign: post.slug }) +
    `<div class="head"><div>
  <p class="crumbs"><a href="/blog">Guides</a></p>
  <h1>${escapeHtml(post.title)}</h1>
  <p class="dek">${escapeHtml(post.description)}</p>
  <p class="meta">By ${escapeHtml(post.author)} · <time datetime="${post.date}">${longDate(post.date)}</time>${post.updated ? ` · updated <time datetime="${post.updated}">${longDate(post.updated)}</time>` : ""} · ${post.minutes} min read</p>
</div></div>
<main>
<article class="body">
${post.html}</article>
${endBlock(post.slug)}
${others.length ? `<section class="more" aria-label="More guides"><h2>More guides</h2>${others.map(card).join("")}</section>` : ""}
</main>
` +
    foot()
  );
}

export function indexPage(posts) {
  const canonical = `${SITE}/blog`;
  const description = "Plain guides to hiring chat and phone customer service agents: the job post, what to test, how to screen and what not to ask.";
  const graph = [
    ORG,
    {
      "@type": "Blog",
      "@id": `${canonical}#blog`,
      name: "HireFlow guides",
      description,
      url: canonical,
      publisher: { "@id": `${SITE}/#org` },
      inLanguage: "en",
      blogPost: posts.map((p) => ({ "@type": "BlogPosting", headline: p.title, url: `${SITE}/blog/${p.slug}`, datePublished: p.date })),
    },
  ];
  return (
    head({ title: "Guides to hiring customer service agents | HireFlow", description, canonical, type: "website", graph, campaign: "blog-index" }) +
    `<div class="head"><div>
  <p class="crumbs"><a href="/">HireFlow</a></p>
  <h1>Guides to hiring customer service agents</h1>
  <p class="dek">${escapeHtml(description)}</p>
</div></div>
<main>
<section class="list" aria-label="Every guide">${posts.length ? posts.map(card).join("") : "<p>The first guides are on their way.</p>"}</section>
${endBlock("blog-index", "list")}
</main>
` +
    foot()
  );
}

/**
 * What an address under /blog that is not a guide shows (vercel.json sends
 * every other /blog/... here): a plain page, noindex, back to the list.
 * Without it the app's own page shell answered, which search engines read as
 * a page that exists.
 */
export function notFoundPage(posts) {
  const canonical = `${SITE}/blog`;
  return (
    head({
      title: "Guide not found | HireFlow",
      description: "That guide is not here. Every guide to hiring customer service agents is on the list.",
      canonical,
      type: "website",
      extraMeta: '<meta name="robots" content="noindex, follow">\n',
      graph: [ORG],
      campaign: "blog-not-found",
    })
      .replace('<meta name="robots" content="index, follow, max-image-preview:large">\n', "")
      // No canonical and no og:url: it is no page of its own (the Phase 6 review: they pointed at /blog).
      .replace(`<link rel="canonical" href="${canonical}">\n`, "")
      .replace(`<meta property="og:url" content="${canonical}">\n`, "") +
    `<div class="head"><div>
  <p class="crumbs"><a href="/blog">Guides</a></p>
  <h1>That guide is not here</h1>
  <p class="dek">It may have moved, or the address may have a typo. The latest guides are below; <a href="/blog" style="color: var(--gold)">every guide is on the list</a>.</p>
</div></div>
<main>
<section class="list" aria-label="Latest guides">${posts.slice(0, 5).map(card).join("")}</section>
</main>
` +
    foot()
  );
}

export function sitemap(posts) {
  const latest = posts.reduce((max, p) => ((p.updated || p.date) > max ? p.updated || p.date : max), "");
  const urls = [
    { loc: `${SITE}/blog`, lastmod: latest },
    ...posts.map((p) => ({ loc: `${SITE}/blog/${p.slug}`, lastmod: p.updated || p.date })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
}

export function feed(posts) {
  const xml = (s) => escapeHtml(s);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>HireFlow guides</title>
  <link>${SITE}/blog</link>
  <atom:link href="${SITE}/blog/feed.xml" rel="self" type="application/rss+xml"/>
  <description>Guides to hiring chat and phone customer service agents.</description>
  <language>en</language>
${posts
  .slice(0, 20)
  .map(
    (p) => `  <item>
    <title>${xml(p.title)}</title>
    <link>${SITE}/blog/${p.slug}</link>
    <guid isPermaLink="true">${SITE}/blog/${p.slug}</guid>
    <pubDate>${new Date(`${p.date}T00:00:00Z`).toUTCString()}</pubDate>
    <description>${xml(p.description)}</description>
  </item>`,
  )
  .join("\n")}
</channel>
</rss>
`;
}

/** Writes every page; returns the paths written (relative to the output root). */
export function buildBlog({ contentDir = path.join(ROOT, "content", "blog"), outDir = path.join(ROOT, "public") } = {}) {
  const posts = loadPosts(contentDir);
  const blogDir = path.join(outDir, "blog");
  rmSync(blogDir, { recursive: true, force: true });
  mkdirSync(blogDir, { recursive: true });
  const written = [];
  const write = (rel, text) => {
    const file = path.join(outDir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
    written.push(rel);
  };
  write("blog/index.html", indexPage(posts));
  for (const post of posts) write(`blog/${post.slug}/index.html`, postPage(post, posts));
  write("blog/feed.xml", feed(posts));
  write("blog/not-found.html", notFoundPage(posts));
  write("blog-sitemap.xml", sitemap(posts));
  return { posts, written };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes("--check")) {
      const all = loadPosts(undefined, { includeDrafts: true });
      console.log(`blog: ${all.length} posts checked (${all.filter((p) => p.draft).length} drafts).`);
    } else {
      const { posts, written } = buildBlog();
      console.log(`blog: ${posts.length} posts, ${written.length} files written to public/.`);
    }
  } catch (error) {
    console.error(`blog: ${error.message}`);
    process.exit(1);
  }
}
