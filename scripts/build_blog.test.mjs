#!/usr/bin/env node
/**
 * scripts/build-blog.mjs on fixture posts (docs/BLOG.md; docs/LAUNCH-PLAN.md,
 * Phase 6): what a page carries (title, description, canonical, Open Graph,
 * Article data, the page counter, the tagged sign-up button), what the build
 * refuses (a missing field, raw HTML, an h1, a link that is not a site path
 * or https, a slug used twice), drafts left out, the sitemap and the feed;
 * then the real posts in content/blog.
 *
 * Run with: node scripts/build_blog.test.mjs
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as B from "./build-blog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}
const throws = (fn, pattern) => {
  try {
    fn();
    return false;
  } catch (e) {
    return pattern.test(String(e.message));
  }
};

const post = (fields, body = "## A section\n\nSome words here, enough of them to read.\n") =>
  `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\n${body}`;
const GOOD = {
  title: `Hiring "chat" agents & phone agents`,
  description: "A plain guide to hiring chat and phone agents, from the job post to the first call.",
  date: "2026-10-20",
  slug: "hiring-chat-and-phone-agents",
  author: "HireFlow",
};

console.log("\nFront matter and body rules\n");
const parsed = B.parsePost(post(GOOD));
check("a good post is read: title, description, date, slug, author", parsed.title === GOOD.title && parsed.slug === GOOD.slug && parsed.draft === false && parsed.updated === null);
for (const key of ["title", "description", "date", "slug", "author"]) {
  const { [key]: _gone, ...rest } = GOOD;
  check(`refused without "${key}"`, throws(() => B.parsePost(post(rest), "x.md"), new RegExp(`needs "${key}"`)));
}
check("refused: a slug with capitals or spaces", throws(() => B.parsePost(post({ ...GOOD, slug: "Hiring Agents" })), /slug/));
check("refused: a date that is not a real day", throws(() => B.parsePost(post({ ...GOOD, date: "2026-02-30" })), /date/));
check("refused: an update before the date", throws(() => B.parsePost(post({ ...GOOD, updated: "2026-10-01" })), /updated/));
check("refused: a description too short or too long for a search result", throws(() => B.parsePost(post({ ...GOOD, description: "Too short." })), /description/) && throws(() => B.parsePost(post({ ...GOOD, description: "x".repeat(161) })), /description/));
check("refused: no front matter", throws(() => B.parsePost("# Just text"), /front matter/));
check("refused: raw HTML in the body", throws(() => B.renderMarkdown("Hello <script>alert(1)</script>"), /raw HTML/) && throws(() => B.renderMarkdown("<div>x</div>"), /raw HTML/));
check("refused: an h1 in the body (the title is the page's only h1)", throws(() => B.renderMarkdown("# Second title"), /no "# " heading/));
check("refused: a javascript: link, a protocol-relative link, plain http", throws(() => B.renderMarkdown("[x](javascript:alert(1))"), /link/) && throws(() => B.renderMarkdown("[x](//evil.example)"), /link/) && throws(() => B.renderMarkdown("[x](http://example.com)"), /link/));
check("refused: an image (not supported yet)", throws(() => B.renderMarkdown("![a](/x.png)"), /images/));
const html = B.renderMarkdown("## First part\n\nGo to [open jobs](/open-jobs) or [the law](https://library.laborlaw.ph/republic-act-no-10911/).\n\n## First part\n\n| a | b |\n|---|---|\n| 1 | 2 |\n");
check("site paths and https links are kept; an outside link opens with rel=noopener", html.includes('<a href="/open-jobs">open jobs</a>') && html.includes('href="https://library.laborlaw.ph/republic-act-no-10911/" rel="noopener"'));
check("h2 headings get ids, each unique", /<h2 id="first-part">/.test(html) && /<h2 id="first-part-2">/.test(html));
check("tables come out as tables", /<table>/.test(html));

console.log("\nA built site from fixtures\n");
const work = mkdtempSync(path.join(tmpdir(), "blog-test-"));
const content = path.join(work, "content");
const out = path.join(work, "public");
mkdirSync(content);
writeFileSync(path.join(content, "a.md"), post(GOOD));
writeFileSync(path.join(content, "b.md"), post({ ...GOOD, title: "An older guide", slug: "an-older-guide", date: "2026-09-01", updated: "2026-10-02" }));
writeFileSync(path.join(content, "c.md"), post({ ...GOOD, title: "Not ready", slug: "not-ready", draft: "true" }));
const built = B.buildBlog({ contentDir: content, outDir: out });
check("drafts are not built", built.posts.length === 2 && !existsSync(path.join(out, "blog", "not-ready")));
const page = readFileSync(path.join(out, "blog", GOOD.slug, "index.html"), "utf8");
const index = readFileSync(path.join(out, "blog", "index.html"), "utf8");
check("the title is escaped, once in <title>, once as the h1", page.includes("<title>Hiring &quot;chat&quot; agents &amp; phone agents | HireFlow</title>") && (page.match(/<h1>/g) ?? []).length === 1);
check("description, canonical and robots", page.includes(`<meta name="description" content="${GOOD.description}">`) && page.includes(`<link rel="canonical" href="https://hireflownow.com/blog/${GOOD.slug}">`) && /<meta name="robots" content="index, follow/.test(page));
check("Open Graph and Twitter tags", page.includes('<meta property="og:type" content="article">') && page.includes(`<meta property="og:url" content="https://hireflownow.com/blog/${GOOD.slug}">`) && page.includes('<meta property="og:image" content="https://hireflownow.com/share/hireflow.jpg">') && page.includes('<meta name="twitter:card" content="summary_large_image">') && page.includes('<meta property="article:published_time" content="2026-10-20">'));
const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(page)[1]);
const article = ld["@graph"].find((n) => n["@type"] === "BlogPosting");
check("Article data: headline, dates, publisher, the page it is about", article?.headline === GOOD.title && article.datePublished === "2026-10-20" && article.dateModified === "2026-10-20" && article.publisher?.["@id"] === "https://hireflownow.com/#org" && article.mainEntityOfPage === `https://hireflownow.com/blog/${GOOD.slug}`);
check("…and a breadcrumb back to Guides", ld["@graph"].some((n) => n["@type"] === "BreadcrumbList" && n.itemListElement?.[1]?.item === "https://hireflownow.com/blog"));
check("the page counter and the source carrier load; no inline script runs (CSP)", page.includes('<script src="/beacon.js" defer></script>') && page.includes('<script src="/carry-source.js" defer></script>') && !/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/.test(page) && !/\son[a-z]+="/.test(page));
check("the closing button: Post your first job free, tagged with the post", page.includes(`href="https://staff.hireflownow.com/auth?mode=signup&amp;utm_source=blog&amp;utm_medium=article&amp;utm_campaign=${GOOD.slug}"`) || page.includes(`href="https://staff.hireflownow.com/auth?mode=signup&utm_source=blog&utm_medium=article&utm_campaign=${GOOD.slug}"`));
check("…and it says Post your first job free", />Post your first job free</.test(page));
check("the other guides are linked from each post", page.includes('href="/blog/an-older-guide"'));
check("the list shows both, newest first, never the draft", index.indexOf(`/blog/${GOOD.slug}`) < index.indexOf("/blog/an-older-guide") && !index.includes("not-ready"));
check("the list is its own page: canonical /blog and Blog data", index.includes('<link rel="canonical" href="https://hireflownow.com/blog">') && /"@type":"Blog"/.test(index));
const sitemap = readFileSync(path.join(out, "blog-sitemap.xml"), "utf8");
check("the sitemap lists /blog and both posts, with last-changed dates", sitemap.includes("<loc>https://hireflownow.com/blog</loc><lastmod>2026-10-20</lastmod>") && sitemap.includes(`<loc>https://hireflownow.com/blog/${GOOD.slug}</loc><lastmod>2026-10-20</lastmod>`) && sitemap.includes("<loc>https://hireflownow.com/blog/an-older-guide</loc><lastmod>2026-10-02</lastmod>") && !sitemap.includes("not-ready"));
const feed = readFileSync(path.join(out, "blog", "feed.xml"), "utf8");
check("an RSS feed of the posts", feed.includes(`<link>https://hireflownow.com/blog/${GOOD.slug}</link>`) && feed.includes("<title>Hiring &quot;chat&quot; agents &amp; phone agents</title>"));
const missing = readFileSync(path.join(out, "blog", "not-found.html"), "utf8");
check("an address under /blog that is no guide gets a plain page that search engines skip (noindex), with the list", /<meta name="robots" content="noindex, follow">/.test(missing) && !/content="index, follow/.test(missing) && missing.includes(`href="/blog/${GOOD.slug}"`) && /That guide is not here/.test(missing));
writeFileSync(path.join(content, "d.md"), post({ ...GOOD, title: "Same slug" }));
check("two posts with one slug stop the build", throws(() => B.loadPosts(content), /already used/));
rmSync(work, { recursive: true, force: true });

console.log("\nThe real posts (content/blog)\n");
const dir = path.join(ROOT, "content", "blog");
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
let all = [];
try {
  all = B.loadPosts(dir, { includeDrafts: true });
} catch (e) {
  check("every post passes the build's rules", false, e.message);
}
check("every post passes the build's rules", all.length === files.length && files.length > 0, `${all.length} of ${files.length}`);
// A draft waits for the owner (their figures, their story): it must parse, and
// is checked in full once it is published.
for (const p of all.filter((x) => !x.draft)) {
  const words = B.wordCount(p.body);
  check(`${p.slug}: its file is named for its slug, ${words} words (600 to 2,000)`, p.file === `${p.slug}.md` && words >= 600 && words <= 2000);
  const text = p.body;
  check(`${p.slug}: no sweepstakes, casino or shop-floor examples; no emoji; no exclamation marks`, !/\b(sweepstake|casino|gambl|barista|cashier)/i.test(text) && !/\p{Extended_Pictographic}/u.test(text) && !/!(?!\[)/.test(text.replace(/!\[[^\]]*\]/g, "")));
  check(`${p.slug}: no made-up evidence ("studies show", "statistics", "survey")`, !/\b(studies show|research shows|statistics show|according to (a|one) (study|survey))\b/i.test(text));
  check(`${p.slug}: no price but the free first job`, !/\$\s?\d|₱\s?\d|\bper month\b/i.test(text.replace(/₱50,000 to ₱500,000|₱50,000|₱500,000/g, "")) || p.slug === "what-you-cannot-ask-filipino-applicants");
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
