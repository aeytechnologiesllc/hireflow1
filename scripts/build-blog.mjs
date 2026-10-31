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
  // The closing "---" stands alone on its line: "---draft: true" is not a
  // close (it used to be, and the file built as published; the fifth Phase 6
  // review).
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n([\s\S]*))?$/.exec(text);
  if (!m) throw new Error(`${file}: no front matter (start the file with ---)`);
  m[2] = m[2] ?? "";
  // A front-matter key written after the close ("draft: true" and another
  // "---" under it) would build as a heading in a published post.
  if (/^(title|description|date|draft|slug|updated|author|tags):\s*\S[^\n]*\n(-{3,}|={3,})[ \t]*$/im.test(m[2])) {
    throw new Error(`${file}: a front matter line is written after the closing --- (move it above it)`);
  }
  // A "draft:" line anywhere below the close, in any case, with or without a
  // rule under it: the writer meant it as front matter, and the post would
  // go out (the sixth Phase 6 review: a blank line before the rule, no rule,
  // or "Draft: true" all published).
  if (/^[ \t]*draft[ \t]*:/im.test(m[2])) {
    throw new Error(`${file}: a "draft:" line is below the closing --- (move it into the front matter above it)`);
  }
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
    // …nor the repository's own copy of a guide (the repo is public, so a
    // link to content/blog/<draft>.md on GitHub showed a draft; the sixth
    // Phase 6 review). No guide needs to link its source.
    if (/(?:github\.com|githubusercontent\.com)\/aeytechnologiesllc\/hireflow1\b[^"\s<]*content\/blog/i.test(post.html)) {
      throw new Error(`${post.file}: links to the guides' source on GitHub (a draft can be read there): link the published guide instead`);
    }
    // …and an address written as plain text names no draft either ("hireflownow.com/blog/<draft>").
    // The feed is no guide (the eighth review: "hireflownow.com/blog/feed.xml" failed the build).
    for (const m of post.html.matchAll(/\b(?:https?:\/\/)?(?:www\.|staff\.)?hireflownow\.com\/blog\/([a-z0-9-]+)(?![a-z0-9-]|\.xml\b)/gi)) {
      if (!published.has(m[1].toLowerCase())) throw new Error(`${post.file}: names hireflownow.com/blog/${m[1]}, which is not a published guide`);
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
  // The staff host serves the blog too (the fifth review: a draft linked through it built).
  if (!/^(www\.|staff\.)?hireflownow\.com\.?$/i.test(url.hostname)) return null;
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

// The logo's own mark: the jade rising line on the deep green tile (scripts/make-app-icons.mjs).
const MARK =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#0C2A21"/><rect x="0.5" y="0.5" width="63" height="63" rx="13.5" fill="none" stroke="rgba(63,206,151,0.28)"/><path d="M13 46 L25 19 L37 39 L51 17" fill="none" stroke="#3FCE97" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// The big stamp's own drawings (public/landing.html, #heroStart): the mark's line in a ring, the arrow, and the postmark.
const STAMP_LINE =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F3EFE2" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 18 L9 7 L14 15 L20 6"/></svg>';
const STAMP_ARROW =
  '<svg class="arr" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F3EFE2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>';
const POSTMARK =
  '<svg viewBox="0 0 120 78" aria-hidden="true"><circle cx="86" cy="39" r="38" fill="none" stroke="rgba(29,51,41,.5)" stroke-width="1.4"/><circle cx="86" cy="39" r="33" fill="none" stroke="rgba(29,51,41,.28)" stroke-width="1"/><path d="M0 28 q6 -4 12 0 t12 0 t12 0 t9 0 M0 39 q6 -4 12 0 t12 0 t12 0 t9 0 M0 50 q6 -4 12 0 t12 0 t12 0 t9 0" fill="none" stroke="rgba(29,51,41,.42)" stroke-width="1.3"/></svg>';
// The front page's fonts, at its exact address, so a visitor who came from it has them already.
export const FONTS_CSS = "https://fonts.googleapis.com/css2?family=Besley:ital,wght@0,500..800;1,500..600&family=Courier+Prime&family=Schibsted+Grotesk:wght@400..700&display=swap";

/* The front page's look, "The Desk" (public/landing.html, docs/LANDING.md): the
   sage desk with its warm wash from the window side, the same pinned bar, and
   the guide on a sheet of the desk's warm paper, about 65-70 characters a line.
   Besley for headings, Schibsted Grotesk for reading, Courier Prime for the
   small typed details; the ink greens for text, the jade for links and the
   stamp. Nothing moves but a small lift under a mouse, and nothing follows it;
   no blur, no animation, so an old phone scrolls a long guide easily. */
const STYLE = `
  :root {
    color-scheme: light;
    --desk: #C6CFBE; --desk-deep: #B5C0AB;
    --paper: #F5F0E5; --paper-2: #F0EBDE; --paper-3: #EEE8D9;
    --ink: #1D3329; --ink-2: #304238; --ink-3: #4E6056; --line: rgba(29, 51, 41, 0.14);
    --action: #0F6B4F; --action-deep: #0B5440;
    --serif: "Besley", Georgia, serif;
    --sans: "Schibsted Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif;
    --type: "Courier Prime", "Courier New", monospace;
    --barh: 60px;
    --sheet: 0 0 0 .5px rgba(29, 51, 41, .10), -.5px 1px 1.5px rgba(22, 40, 31, .2), -8px 14px 30px -14px rgba(22, 40, 31, .32);
    --card: 0 0 0 .5px rgba(29, 51, 41, .10), -.5px 1px 1.5px rgba(22, 40, 31, .22), -4px 7px 14px -6px rgba(22, 40, 31, .24);
    --card-up: 0 0 0 .5px rgba(29, 51, 41, .11), -1px 2px 3px rgba(22, 40, 31, .2), -8px 14px 24px -8px rgba(22, 40, 31, .3);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  html { background: var(--desk); scroll-padding-top: calc(var(--barh) + 16px); -webkit-text-size-adjust: 100%; -webkit-tap-highlight-color: transparent; }
  body { min-height: 100vh; display: flex; flex-direction: column; color: var(--ink); font: 400 17px/1.6 var(--sans); -webkit-font-smoothing: antialiased; overflow-wrap: break-word;
    background: linear-gradient(242deg, rgba(240, 225, 190, .62) 0, rgba(240, 225, 190, .3) 380px, rgba(240, 225, 190, 0) 860px) no-repeat, var(--desk); }
  ::selection { background: #D6E8DC; color: var(--ink); }
  a { color: var(--action); }
  a:focus-visible { outline: 2px solid var(--action); outline-offset: 3px; border-radius: 2px; }

  /* the bar: the front page's, pinned the whole way down, in the desk's own sage */
  .bar { position: -webkit-sticky; position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 16px; height: var(--barh);
    padding: 0 max(48px, env(safe-area-inset-right, 0px)) 0 max(56px, env(safe-area-inset-left, 0px)); background: rgba(198, 207, 190, .97); box-shadow: 0 1px 0 rgba(29, 51, 41, .1); }
  .logo { display: inline-flex; align-items: center; gap: 11px; font: 600 23px/1 var(--serif); letter-spacing: -.01em; color: var(--ink); text-decoration: none; }
  .logo svg { width: 32px; height: 32px; flex: none; display: block; border-radius: 8px; box-shadow: -1px 3px 6px -1px rgba(12, 42, 33, .4); }
  .navr { display: flex; align-items: center; gap: 28px; font: 500 15px/1 var(--sans); white-space: nowrap; }
  .navr a { color: var(--ink-2); text-decoration: none; }
  .navr .short { display: none; }
  /* "Post a job": the small stamp */
  .navr .post { position: relative; display: inline-block; transform: rotate(1.4deg); transition: transform .3s cubic-bezier(.2, .8, .2, 1);
    filter: drop-shadow(0 1px .6px rgba(20, 38, 30, .26)) drop-shadow(-1px 4px 5px rgba(20, 38, 30, .14)); }
  .navr .post span { --r: 2.6px; position: relative; display: block; padding: 10px 17px; background: #EFE9DA; color: var(--action-deep); font-weight: 650;
    -webkit-mask: radial-gradient(var(--r), #0000 97%, #000) round calc(-1.5 * var(--r)) calc(-1.5 * var(--r)) / calc(3 * var(--r)) calc(3 * var(--r)), linear-gradient(#000 0 0) no-repeat 50% / calc(100% - 3 * var(--r)) calc(100% - 3 * var(--r));
            mask: radial-gradient(var(--r), #0000 97%, #000) round calc(-1.5 * var(--r)) calc(-1.5 * var(--r)) / calc(3 * var(--r)) calc(3 * var(--r)), linear-gradient(#000 0 0) no-repeat 50% / calc(100% - 3 * var(--r)) calc(100% - 3 * var(--r)); }
  .navr .post span::before { content: ""; position: absolute; inset: 6px; border: 1px solid rgba(15, 107, 79, .32); pointer-events: none; }
  .navr .post:active { transform: translateY(1px) scale(.97); transition-duration: .07s; }

  main { flex: 1 0 auto; width: 100%; padding: 40px 16px 80px; }

  /* the guide: one sheet of paper on the desk */
  .sheet { max-width: 740px; margin: 0 auto; padding: 52px 72px 60px; border-radius: 2px; box-shadow: var(--sheet);
    background: linear-gradient(168deg, rgba(255, 255, 255, .5), rgba(255, 255, 255, 0) 520px) no-repeat, var(--paper); }
  .crumbs { margin: 0 0 20px; font: 400 15px/1.3 var(--type); }
  .crumbs a { text-decoration: none; }
  .crumbs a span { display: inline-block; margin-right: 6px; }
  h1 { margin: 0; font: 650 clamp(31px, 4.4vw, 44px)/1.1 var(--serif); letter-spacing: -.022em; color: var(--ink); text-wrap: balance; }
  .dek { margin: 16px 0 0; font-size: clamp(18px, 1.9vw, 20px); line-height: 1.5; color: var(--ink-2); text-wrap: pretty; }
  .meta { margin: 24px 0 0; padding-bottom: 22px; border-bottom: 1px dashed rgba(29, 51, 41, .3); font: 400 14.5px/1.5 var(--type); color: var(--ink-3); }
  .meta span { white-space: nowrap; }
  .body { margin-top: 32px; font-size: 18px; line-height: 1.7; color: var(--ink-2); }
  .body > :first-child { margin-top: 0; }
  .body h2 { margin: 1.85em 0 .5em; font: 650 clamp(24px, 2.6vw, 28px)/1.2 var(--serif); letter-spacing: -.016em; color: var(--ink); }
  .body h3 { margin: 1.6em 0 .4em; font: 600 21px/1.3 var(--serif); letter-spacing: -.01em; color: var(--ink); }
  .body h4 { margin: 1.4em 0 .3em; font: 650 17px/1.4 var(--sans); color: var(--ink); }
  .body p, .body ul, .body ol, .body blockquote, .body table, .body pre { margin: 0 0 1.1em; }
  .body ul, .body ol { padding-left: 1.35em; }
  .body li { margin: .35em 0; padding-left: .15em; }
  .body li::marker { color: var(--action); }
  .body ol > li::marker { font-family: var(--serif); font-weight: 650; }
  .body strong { font-weight: 650; color: var(--ink); }
  .body a { text-decoration-thickness: 1px; text-decoration-color: rgba(15, 107, 79, .45); text-underline-offset: 3px; }
  /* a customer's message: a slip of paper, in the front page's italic */
  .body blockquote { margin-left: 0; margin-right: 0; padding: 14px 20px 14px 18px; background: var(--paper-3); border-left: 2px solid rgba(15, 107, 79, .55); border-radius: 0 2px 2px 0;
    font: italic 500 18px/1.55 var(--serif); color: var(--ink); }
  .body blockquote p { margin: 0 0 .6em; }
  .body blockquote > :last-child { margin-bottom: 0; }
  .body code { font: 400 .93em/1.4 var(--type); background: rgba(29, 51, 41, .06); padding: 1px 5px; border-radius: 3px; }
  /* a template to copy: typed on a card */
  .body pre { padding: 20px 22px; background: var(--paper-3); box-shadow: inset 0 0 0 1px rgba(29, 51, 41, .1); border-radius: 2px; overflow-x: auto; white-space: pre-wrap; overflow-wrap: anywhere;
    font: 400 14px/1.6 var(--type); color: var(--ink); }
  .body pre code { background: none; padding: 0; font: inherit; }
  /* on a wide sheet the card reaches into the margin, so a template's typed lines keep their own breaks */
  @media (min-width: 900px) { .body pre { margin-left: -40px; margin-right: -40px; padding: 22px 24px; } }
  .body table { width: 100%; border-collapse: collapse; font-size: 16px; line-height: 1.5; display: block; overflow-x: auto; }
  .body th { text-align: left; font-weight: 650; color: var(--ink); padding: 8px 16px 8px 0; border-bottom: 1.5px solid rgba(29, 51, 41, .3); vertical-align: bottom; }
  .body td { padding: 10px 16px 10px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  .body hr { border: 0; border-top: 1px dashed rgba(29, 51, 41, .3); margin: 2em 0; }

  /* the sign-up card: a second sheet, with the front page's stamp and postmark */
  .end { max-width: 740px; margin: 36px auto 0; padding: 36px 72px 38px; border-radius: 2px; box-shadow: var(--sheet);
    background: linear-gradient(155deg, rgba(255, 255, 255, .34), rgba(255, 255, 255, 0) 42%) no-repeat, var(--paper-2); }
  .end h2 { margin: 0; font: 650 clamp(24px, 2.8vw, 29px)/1.18 var(--serif); letter-spacing: -.018em; color: var(--ink); }
  .end p { margin: 10px 0 0; max-width: 36em; font-size: 17px; line-height: 1.55; color: var(--ink-2); }
  .cta-row { margin-top: 26px; display: flex; align-items: center; }
  .stamp { position: relative; display: inline-block; flex: none; text-decoration: none; transform: rotate(-1.4deg); transition: transform .3s cubic-bezier(.2, .8, .2, 1);
    filter: drop-shadow(0 1px 1px rgba(20, 38, 30, .28)) drop-shadow(-2px 6px 7px rgba(20, 38, 30, .16)); }
  .stamp:focus-visible { outline: 2px dashed rgba(15, 107, 79, .75); outline-offset: 7px; border-radius: 3px; }
  .stamp .face { --r: 4px; position: relative; display: flex; align-items: center; gap: 14px; padding: 20px 26px 20px 22px; background: var(--action); color: #F3EFE2;
    -webkit-mask: radial-gradient(var(--r), #0000 97%, #000) round calc(-1.5 * var(--r)) calc(-1.5 * var(--r)) / calc(3 * var(--r)) calc(3 * var(--r)), linear-gradient(#000 0 0) no-repeat 50% / calc(100% - 3 * var(--r)) calc(100% - 3 * var(--r));
            mask: radial-gradient(var(--r), #0000 97%, #000) round calc(-1.5 * var(--r)) calc(-1.5 * var(--r)) / calc(3 * var(--r)) calc(3 * var(--r)), linear-gradient(#000 0 0) no-repeat 50% / calc(100% - 3 * var(--r)) calc(100% - 3 * var(--r));
    transition: background .2s; }
  .stamp .face::before { content: ""; position: absolute; inset: 9px; border: 1px solid rgba(243, 239, 226, .38); pointer-events: none; }
  .stamp .mk { width: 26px; height: 26px; border-radius: 50%; border: 1.3px solid rgba(243, 239, 226, .6); display: grid; place-items: center; flex: none; }
  .stamp .mk svg { display: block; }
  .stamp .lbl { font: 600 19px/1.2 var(--serif); letter-spacing: -.005em; white-space: nowrap; }
  .stamp .arr { flex: none; transition: transform .3s; }
  .stamp:active { transform: rotate(0deg) translateY(1px) scale(.985); transition-duration: .07s; }
  .pmark { position: relative; margin-left: -22px; z-index: 2; width: 126px; height: 78px; flex: none; }
  .pmark svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .pmark .t { position: absolute; left: 52px; top: 29px; width: 68px; text-align: center; font: 650 13px/1.2 var(--sans); color: var(--ink); transform: rotate(-8deg); white-space: nowrap; }

  /* the list: each guide a letter on the desk */
  .top { max-width: 1040px; margin: 4px auto 34px; }
  .top h1 { max-width: 15em; font-size: clamp(36px, 5vw, 58px); line-height: 1.02; letter-spacing: -.028em; }
  .top .dek { max-width: 34em; }
  .top .crumbs a, .top .dek a { color: var(--action-deep); }
  .list { max-width: 1040px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 22px; }
  .list > p { margin: 0; color: var(--ink-2); }
  .list + .end { max-width: 1040px; margin-top: 48px; }
  .card { display: flex; flex-direction: column; padding: 24px 26px 20px; border-radius: 2px; box-shadow: var(--card); color: inherit; text-decoration: none;
    background: linear-gradient(162deg, rgba(255, 255, 255, .42), rgba(255, 255, 255, 0) 46%) no-repeat, var(--paper); transition: transform .3s cubic-bezier(.2, .8, .2, 1), box-shadow .3s; }
  .card b { font: 650 21px/1.25 var(--serif); letter-spacing: -.012em; color: var(--ink); transition: color .2s; }
  .card span { margin-top: 8px; font-size: 15.5px; line-height: 1.5; color: var(--ink-2); }
  .card small { margin-top: auto; padding-top: 16px; font: 400 13.5px/1.4 var(--type); color: var(--ink-3); }
  .more { max-width: 1040px; margin: 56px auto 0; }
  .more h2 { display: flex; align-items: center; gap: 14px; margin: 0 0 18px; font: 400 15px/1.2 var(--type); color: var(--ink-2); }
  .more h2::after { content: ""; flex: 1; border-top: 1px dashed rgba(29, 51, 41, .3); }
  .more .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 290px), 1fr)); gap: 22px; }

  /* the footer: a darker band of the same sage */
  footer { background: var(--desk-deep); color: var(--ink); }
  footer .lp { max-width: 1240px; margin: 0 auto; padding: 40px 56px calc(44px + env(safe-area-inset-bottom, 0px)); display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 24px 56px; }
  footer .about { margin: 0; font-size: 15.5px; line-height: 1.55; color: var(--ink-2); max-width: 40em; }
  footer .about b { color: var(--ink); }
  .foot { display: flex; flex-wrap: wrap; gap: 10px 24px; align-content: start; justify-content: flex-end; font-size: 15px; font-weight: 500; }
  .foot a { color: var(--ink); text-decoration: none; }
  .legal { grid-column: 1 / -1; margin: 0; padding-top: 18px; border-top: 1px solid rgba(29, 51, 41, .2); font-size: 13px; color: var(--ink-2); }

  /* the list's sign-up card spans the list: its words on the left, the stamp on the right */
  @media (min-width: 1000px) {
    .list + .end { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 48px; align-items: center; padding: 36px 52px 38px 48px; }
    .list + .end .cta-row { grid-column: 2; grid-row: 1 / span 2; margin-top: 0; }
  }

  /* tiny hovers, only where there is a mouse */
  @media (hover: hover) and (pointer: fine) {
    .navr a:hover { color: var(--ink); }
    .navr .post:hover { transform: rotate(0) translateY(-1px); }
    .navr .post:hover span { color: var(--action-deep); }
    .body a:hover, .crumbs a:hover, .dek a:hover { color: var(--action-deep); text-decoration: underline; text-decoration-color: currentColor; }
    .stamp:hover { transform: rotate(0deg) translateY(-2px); }
    .stamp:hover .arr { transform: translateX(3px); }
    .card:hover { transform: translateY(-2px); box-shadow: var(--card-up); }
    .card:hover b { color: var(--action-deep); }
    .foot a:hover { text-decoration: underline; text-underline-offset: 4px; }
  }

  /* a phone, and a tablet held upright */
  @media (max-width: 899px) {
    :root { --barh: 50px; }
    body { font-size: 16.5px; }
    .bar { padding: 0 max(16px, env(safe-area-inset-right, 0px)) 0 max(16px, env(safe-area-inset-left, 0px)); }
    .logo { font-size: 20px; gap: 9px; }
    .logo svg { width: 28px; height: 28px; border-radius: 7px; }
    .navr { gap: 16px; font-size: 14px; }
    .navr .guides, .navr .long { display: none; }
    .navr .short { display: inline; }
    .navr .post span { padding: 8px 12px; }
    .navr .post span::before { inset: 5px; }
    main { padding: 18px 12px 56px; }
    .sheet { padding: 28px 20px 34px; }
    .meta { margin-top: 20px; padding-bottom: 18px; font-size: 14px; }
    .body { margin-top: 26px; font-size: 17px; line-height: 1.68; }
    .body blockquote { padding: 12px 16px 12px 14px; font-size: 17px; }
    .body pre { margin-left: -10px; margin-right: -10px; padding: 14px 12px; font-size: 13.5px; }
    .body table { font-size: 15px; }
    .end { margin-top: 22px; padding: 26px 20px 28px; }
    .end p { font-size: 16px; }
    .cta-row { margin-top: 22px; }
    .stamp .face { padding: 15px 14px 15px 13px; gap: 9px; }
    .stamp .lbl { font-size: 16.5px; }
    .stamp .mk { width: 22px; height: 22px; }
    .stamp .mk svg { width: 13px; height: 13px; }
    .stamp .arr { width: 16px; height: 16px; }
    /* the postmark's box is its drawing (no scaled overhang), so it never widens the page */
    .pmark { margin-left: -22px; width: 84px; height: 55px; }
    .pmark .t { left: 35px; top: 20px; width: 50px; font-size: 10.5px; }
    .top { margin: 14px 4px 24px; }
    .list, .more .cards { gap: 14px; }
    .list + .end { margin-top: 32px; }
    .card { padding: 20px 20px 18px; }
    .card b { font-size: 19.5px; }
    .more { margin-top: 40px; }
    footer .lp { grid-template-columns: minmax(0, 1fr); padding: 36px 16px calc(40px + env(safe-area-inset-bottom, 0px)); }
    .foot { justify-content: flex-start; }
  }
  /* a small phone: the bar keeps to one line, the stamp and its postmark to the card */
  @media (max-width: 380px) {
    .logo { font-size: 18px; gap: 8px; }
    .navr { gap: 12px; font-size: 13.5px; }
    .navr .post span { padding: 8px 10px; }
    .sheet { padding: 24px 18px 30px; }
    .end { padding: 24px 18px 26px; }
    .stamp .face { padding: 14px 17px 14px 12px; gap: 8px; }
    .stamp .lbl { font-size: 15.5px; }
    .stamp .mk { width: 21px; height: 21px; }
    .stamp .arr { display: none; }
  }
  @media (max-width: 340px) {
    .bar { padding: 0 12px; }
    .logo { font-size: 16px; gap: 7px; }
    .logo svg { width: 24px; height: 24px; border-radius: 6px; }
    .navr { gap: 10px; font-size: 12.5px; }
    .navr .post span { padding: 7px 8px; }
    .navr .post span::before { inset: 4px; }
    main { padding-left: 8px; padding-right: 8px; }
    .stamp .face { padding: 13px 15px 13px 10px; gap: 7px; }
    .stamp .lbl { font-size: 14px; }
    .stamp .mk { width: 19px; height: 19px; }
    .stamp .mk svg { width: 11px; height: 11px; }
    .pmark { margin-left: -20px; width: 74px; height: 48px; }
    .pmark .t { left: 31px; top: 17px; width: 44px; font-size: 9.5px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .navr .post, .stamp, .stamp .arr, .card, .card b { transition: none; }
  }
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
<meta name="theme-color" content="#C6CFBE">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="HireFlow">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${SHARE_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="HireFlow: hundreds apply, three land on your desk">
${extraMeta}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${SHARE_IMAGE}">
<link rel="alternate" type="application/rss+xml" title="HireFlow guides" href="${SITE}/blog/feed.xml">
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=8">
<link rel="alternate icon" href="/favicon.ico?v=8" sizes="any">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=8">
<script type="application/ld+json">${jsonLd({ "@context": "https://schema.org", "@graph": graph })}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<script src="/blog-fonts.js" defer></script>
<noscript><link rel="stylesheet" href="${FONTS_CSS}"></noscript>
<script src="/beacon.js" defer></script>
<script src="/carry-source.js" defer></script>
<style>${STYLE}</style>
</head>
<body>
<header class="bar">
  <a class="logo" href="/">${MARK}HireFlow</a>
  <nav class="navr" aria-label="Main"><a class="guides" href="/blog">Guides</a><a href="/open-jobs"><span class="long">Looking for a job?</span><span class="short">Jobs</span></a><a href="https://staff.hireflownow.com/auth">Sign in</a><a class="post" href="${ctaHref(campaign, "bar")}"><span>Post a job</span></a></nav>
</header>
`;
}

function foot() {
  const year = new Date().getUTCFullYear();
  return `<footer>
  <div class="lp">
    <p class="about"><b>About.</b> HireFlow is made by Southern Digital Technologies LLC.</p>
    <nav class="foot" aria-label="More"><a href="/">HireFlow</a><a href="/open-jobs">Open jobs</a><a href="/blog">Guides</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="https://staff.hireflownow.com/auth">Team sign in</a></nav>
    <p class="legal">© ${year} Southern Digital Technologies LLC</p>
  </div>
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

/** The sign-up card: the front page's green postage stamp, with its "No card." postmark. */
function endBlock(campaign, medium = "article") {
  return `<aside class="end" aria-label="Post a job">
  <h2>Hiring a customer service agent?</h2>
  <p>Post the role and share its link. Every applicant handles a realistic customer conversation, and Ava scores and ranks them, with her reasons.</p>
  <div class="cta-row"><a class="stamp" href="${ctaHref(campaign, medium)}"><span class="face"><span class="mk">${STAMP_LINE}</span><span class="lbl">Post your first job free</span>${STAMP_ARROW}</span></a><span class="pmark">${POSTMARK}<span class="t">No card.</span></span></div>
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
    `<main>
<article class="sheet">
  <p class="crumbs"><a href="/blog"><span aria-hidden="true">←</span>Guides</a></p>
  <h1>${escapeHtml(post.title)}</h1>
  <p class="dek">${escapeHtml(post.description)}</p>
  <p class="meta"><span>By ${escapeHtml(post.author)}</span> · <span><time datetime="${post.date}">${longDate(post.date)}</time></span>${post.updated ? ` · <span>updated <time datetime="${post.updated}">${longDate(post.updated)}</time></span>` : ""} · <span>${post.minutes} min read</span></p>
  <div class="body">
${post.html}</div>
</article>
${endBlock(post.slug)}
${others.length ? `<section class="more" aria-label="More guides"><h2>More guides</h2><div class="cards">${others.map(card).join("")}</div></section>` : ""}
</main>
` +
    foot()
  );
}

export function indexPage(posts) {
  const canonical = `${SITE}/blog`;
  const description = "Plain guides to hiring chat and email customer service agents: the job post, what to test, how to screen and what not to ask.";
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
    `<main>
<header class="top">
  <p class="crumbs"><a href="/"><span aria-hidden="true">←</span>HireFlow</a></p>
  <h1>Guides to hiring customer service agents</h1>
  <p class="dek">${escapeHtml(description)}</p>
</header>
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
      .replace(`<meta property="og:url" content="${canonical}">\n`, "")
      // No page counter: a mistyped address is no guide visit (the third
      // growth review and the sixth Phase 6 review).
      .replace('<script src="/beacon.js" defer></script>\n', "") +
    `<main>
<header class="top">
  <p class="crumbs"><a href="/blog"><span aria-hidden="true">←</span>Guides</a></p>
  <h1>That guide is not here</h1>
  <p class="dek">It may have moved, or the address may have a typo. The latest guides are below; <a href="/blog">every guide is on the list</a>.</p>
</header>
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
  <description>Guides to hiring chat and email customer service agents.</description>
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
