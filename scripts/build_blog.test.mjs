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
// The Phase 6 review.
check("refused: a misspelt key ('darft: true' would have published a draft)", throws(() => B.parsePost(post({ ...GOOD, darft: "true" })), /unknown front matter key "darft"/) && throws(() => B.parsePost(post({ ...GOOD, drafts: "true" })), /unknown front matter key/));
check("refused: a control character in the title (feed.xml would be invalid)", throws(() => B.parsePost(post({ ...GOOD, title: "Hiring\u000B agents" })), /control character/));
check("refused: a slug longer than the sign-up page keeps as a campaign tag (60)", throws(() => B.parsePost(post({ ...GOOD, slug: "a".repeat(30) + "-" + "b".repeat(30) })), /at most 60/));
check("refused: a date in the future", throws(() => B.parsePost(post({ ...GOOD, date: "2099-01-01" })), /future/));
// The second Phase 6 review.
check("a draft may be dated ahead (it is never built); a published post may not", B.parsePost(post({ ...GOOD, date: "2099-01-01", draft: "true" })).draft === true && throws(() => B.parsePost(post({ ...GOOD, date: "2099-01-01", draft: "false" })), /future/));
check("refused: an empty 'draft:' (it published the draft)", throws(() => B.parsePost(post({ ...GOOD, draft: "" })), /draft must be true or false/));
check("refused: a key given twice ('draft: true' then 'draft: false')", throws(() => B.parsePost(`---\ntitle: ${GOOD.title}\ndescription: ${GOOD.description}\ndate: ${GOOD.date}\nslug: ${GOOD.slug}\nauthor: HireFlow\ndraft: true\ndraft: false\n---\n\nWords.\n`), /given twice/));
check("refused: U+FFFE or U+FFFF in a title (feed.xml would not parse)", throws(() => B.parsePost(post({ ...GOOD, title: "Hiring\uFFFF agents" })), /control character/) && throws(() => B.parsePost(post({ ...GOOD, title: "Hiring\uFFFE agents" })), /control character/));
check("refused: 'updated: soon' says what is wrong with it (not 'a date in the future')", throws(() => B.parsePost(post({ ...GOOD, updated: "soon" })), /updated "soon" must be a real YYYY-MM-DD/));
check("refused: a slug the page counter would hide ('5-chat-tests', 'top10-questions')", throws(() => B.parsePost(post({ ...GOOD, slug: "5-chat-tests-to-give" })), /slug/) && throws(() => B.parsePost(post({ ...GOOD, slug: "top10-questions-for-agents" })), /slug/) && B.parsePost(post({ ...GOOD, slug: "screening-150-applicants" })).slug === "screening-150-applicants");
{
  const telemetry = readFileSync(path.join(ROOT, "supabase/functions/_shared/telemetry.ts"), "utf8");
  const counter = /const WORD_SLUG_RE = (\/.*\/);/.exec(telemetry)?.[1];
  const build = /const SLUG = (\/.*\/);/.exec(readFileSync(path.join(ROOT, "scripts/build-blog.mjs"), "utf8"))?.[1];
  check("the build's slug rule is the page counter's (WORD_SLUG_RE)", !!counter && counter === build, `${counter} vs ${build}`);
}
check("refused: 'https:evil.com' (it opens as a broken path here)", throws(() => B.renderMarkdown("[x](https:evil.com)"), /link/));
check("refused: a bare www address, with a message that says how to write it", throws(() => B.renderMarkdown("Go to www.example.com for more."), /bare web address/));
check("a refusal reads as the post's own problem, never 'Please report this to …marked'", (() => { try { B.renderMarkdown("<b>x</b>", "x.md"); return false; } catch (e) { return !/Please report this/.test(e.message) && /raw HTML/.test(e.message); } })());
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
check("the not-found page has no canonical and no og:url of its own", !/rel="canonical"/.test(missing) && !/og:url/.test(missing));
check("a post's top-bar button carries the post too (it said only 'bar')", page.includes(`utm_medium=bar&amp;utm_campaign=${GOOD.slug}`) || page.includes(`utm_medium=bar&utm_campaign=${GOOD.slug}`));
check("the not-found page shows the latest guides and links the full list (it said 'every guide' and showed five)", /The latest guides are below/.test(missing) && /aria-label="Latest guides"/.test(missing) && missing.includes('href="/blog"'));
check("the feed dates a post at the start of its day, never hours ahead", feed.includes(`<pubDate>${new Date("2026-10-20T00:00:00Z").toUTCString()}</pubDate>`));
check("the list and the top bar are tagged as the list and the bar, not as an article", index.includes("utm_medium=list&amp;utm_campaign=blog-index") || index.includes("utm_medium=list&utm_campaign=blog-index"));
writeFileSync(path.join(content, "d.md"), post({ ...GOOD, title: "Same slug" }));
check("two posts with one slug stop the build", throws(() => B.loadPosts(content), /already used/));
rmSync(path.join(content, "d.md"));
writeFileSync(path.join(content, "e.md"), post({ ...GOOD, title: "Links to a draft", slug: "links-to-a-draft" }, "## A\n\nSee [this](/blog/not-ready) for more words here.\n"));
check("a link to a draft or a missing guide stops the build", throws(() => B.loadPosts(content), /not a published guide/));
rmSync(path.join(content, "e.md"));
// The second Phase 6 review: a #part, a ?query, a full address or capitals got past the check.
for (const link of ["/blog/not-ready#intro", "/blog/not-ready?x=1", "https://hireflownow.com/blog/not-ready", "https://www.hireflownow.com/blog/not-ready", "/blog/typo#a", "/Blog/an-older-guide", "/BLOG"]) {
  writeFileSync(path.join(content, "e.md"), post({ ...GOOD, title: "Links", slug: "links-to-a-draft" }, `## A\n\nSee [this](${link}) for more words here.\n`));
  check(`a link to no published guide stops the build: ${link}`, throws(() => B.loadPosts(content), /not a published guide/));
  rmSync(path.join(content, "e.md"));
}
writeFileSync(path.join(content, "e.md"), post({ ...GOOD, title: "Links", slug: "links-to-a-guide" }, "## A\n\nSee [this](/blog/an-older-guide#a), [the list](/blog), [the feed](/blog/feed.xml) and [that](https://hireflownow.com/blog/an-older-guide?x=1).\n"));
check("…while a real guide, the list and the feed, written any of those ways, build", (() => { try { B.loadPosts(content); return true; } catch { return false; } })());
rmSync(path.join(content, "e.md"));
{
  for (const n of ["f", "g", "h"]) writeFileSync(path.join(content, `${n}.md`), post({ ...GOOD, title: `Guide ${n}`, slug: `guide-${n}` }));
  const many = B.loadPosts(content);
  const linkedFrom = new Map(many.map((p) => [p.slug, 0]));
  for (const p of many) for (const m of B.postPage(p, many).matchAll(/class="card" href="\/blog\/([^"]+)"/g)) linkedFrom.set(m[1], linkedFrom.get(m[1]) + 1);
  check("every guide is linked from three others (not the same three everywhere)", [...linkedFrom.values()].every((n) => n === 3), JSON.stringify([...linkedFrom]));
}
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
  // The team-lead hire was the owner's own business, not "HireFlow's own team" (the Phase 6 review).
  check(`${p.slug}: the team-lead hire is the owner's own business, never "HireFlow's own team"`, !/HireFlow's own team|\bour own (support )?(team|agents|staff)\b/i.test(text));
  check(`${p.slug}: no made-up evidence ("studies show", "statistics", "survey")`, !/\b(studies show|research shows|statistics show|according to (a|one) (study|survey))\b/i.test(text));
}
// Drafts too: the repository is public, so a draft is read before the owner publishes it (the second Phase 6 review).
for (const p of all) {
  check(`${p.slug}: no price but the free first job (the law's own fines aside)`, !/\$\s?\d|₱\s?\d|\d[\d,.]*\s*(\/|a|per)\s*(mo|month)\b/i.test(p.body.replace(/₱50,000 to ₱500,000|₱50,000|₱500,000/g, "")));
  check(`${p.slug}: under the HireFlow byline, never "our own" team or agents (the team lead was hired for the owner's own business)`, !/HireFlow's own team|\bour own (support )?(team|agents|staff)\b/i.test(p.body));
}
{
  const age = all.find((p) => p.slug === "what-you-cannot-ask-filipino-applicants");
  check("the age guide says HireFlow requires 18 or older on every job, and why (RA 9231's night hours), and never tells a business to doubt it", !!age && /does not take an application that answers "No"/.test(age.body) && /Republic Act No\. 9231/.test(age.body) && /10 p\.m\. and 6 a\.m\./.test(age.body) && !/turning away a "No"/.test(age.body) && !/ask your lawyer whether[^.]*18 or older/i.test(age.body));
  for (const p of all) check(`${p.slug}: "a person makes every decision" names the built-in 18-or-older check`, !/makes every decision/.test(p.body) || /18 or older\?" question every application starts with, a person on your team makes every decision/.test(p.body));
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
