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
import vm from "node:vm";
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
// The fifth review: two ways a draft built as published.
{
  const front = (extra) => `---\ntitle: T\ndescription: D\ndate: 2026-10-01\nslug: t\nauthor: A${extra}`;
  check("refused: a close written \"---draft: true\" (it is no close)", throws(() => B.parsePost(`${front("")}\n---draft: true\nBody text.`, "x.md"), /front matter|key: value/));
  check("refused: \"draft: true\" written after the closing --- with another --- under it", throws(() => B.parsePost(`${front("")}\n---\ndraft: true\n---\nBody text.`, "x.md"), /after the closing/));
  check("a link through the staff host is read as a guide link (a draft linked that way is refused)", B.guideSlugOf("https://staff.hireflownow.com/blog/some-draft") === "some-draft");
  check("a body that only mentions a draft is fine", B.parsePost(post(GOOD, "We keep every draft: true to life.\n\nMore text here.")).draft === false);
}
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
check("refused: a link with a user part ('https://hireflownow.com@evil.example/' opens evil.example)", throws(() => B.renderMarkdown("[x](https://hireflownow.com@evil.example/)"), /link/));
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
check("the font loads without holding the first paint: from /blog-fonts.js, with a <noscript> stylesheet, and no stylesheet link outside it", page.includes('<script src="/blog-fonts.js" defer></script>') && /<noscript><link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com/.test(page) && !/(^|[^>])<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com/m.test(page.replace(/<noscript>[\s\S]*?<\/noscript>/g, "")));
check("the page counter and the source carrier load; no inline script runs (CSP)", page.includes('<script src="/beacon.js" defer></script>') && page.includes('<script src="/carry-source.js" defer></script>') && !/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/.test(page) && !/\son[a-z]+="/.test(page));
// The ninth growth review: a guide passes on the front page's count (seen=1)
// along its own links, so front page → Guides → a guide → Open jobs → "Post a
// job free" is not a second visit. Run carry-source.js on the built page's
// own links, answering each selector as a browser would.
{
  const hrefs = [...page.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  const matches = (selector, href) =>
    selector.split(/,\s*/).some((one) => {
      const m = /^a\[href(\^|\*)?="([^"]*)"\]$/.exec(one.trim());
      return !!m && (m[1] === "^" ? href.startsWith(m[2]) : m[1] === "*" ? href.includes(m[2]) : href === m[2]);
    });
  const anchors = hrefs.map((raw) => ({ raw, href: new URL(raw, `https://hireflownow.com/blog/${GOOD.slug}`).toString() }));
  const search = "?utm_source=youtube&utm_campaign=v1&seen=1";
  vm.runInNewContext(readFileSync(path.join(ROOT, "public/carry-source.js"), "utf8"), {
    window: { location: { search, pathname: `/blog/${GOOD.slug}`, hostname: "hireflownow.com", href: `https://hireflownow.com/blog/${GOOD.slug}${search}` } },
    navigator: { doNotTrack: null, globalPrivacyControl: false },
    document: { referrer: "https://hireflownow.com/blog?utm_source=youtube&utm_campaign=v1&seen=1", querySelectorAll: (sel) => anchors.filter((a) => matches(sel, a.raw)) },
    URL, URLSearchParams, Array, Object,
  });
  const onward = anchors.filter((a) => /^\/($|blog|open-jobs)/.test(a.raw));
  const signups = anchors.filter((a) => a.raw.includes("staff.hireflownow.com"));
  check("the guide's own links onward (the logo, Guides, Open jobs, the other guides) pass on the front page's count; its sign-up buttons never get it", onward.length >= 5 && onward.every((a) => a.href.endsWith("&seen=1")) && signups.length >= 2 && signups.every((a) => !a.href.includes("seen")) && anchors.filter((a) => /^\/(privacy|terms)$/.test(a.raw)).every((a) => !a.href.includes("seen")), JSON.stringify(anchors.map((a) => a.href)));
  check("…and beacon.js loads before carry-source.js (which reads its count)", page.indexOf('<script src="/beacon.js" defer></script>') < page.indexOf('<script src="/carry-source.js" defer></script>'));
}
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
check("…and no page counter: a mistyped address is no guide visit (the third growth review)", !/beacon\.js/.test(missing) && /carry-source\.js/.test(missing));
check("a post's top-bar button carries the post too (it said only 'bar')", page.includes(`utm_medium=bar&amp;utm_campaign=${GOOD.slug}`) || page.includes(`utm_medium=bar&utm_campaign=${GOOD.slug}`));
check("the not-found page shows the latest guides and links the full list (it said 'every guide' and showed five)", /The latest guides are below/.test(missing) && /aria-label="Latest guides"/.test(missing) && missing.includes('href="/blog"'));
check("the feed dates a post at the start of its day, never hours ahead", feed.includes(`<pubDate>${new Date("2026-10-20T00:00:00Z").toUTCString()}</pubDate>`));
check("the list and the top bar are tagged as the list and the bar, not as an article", index.includes("utm_medium=list&amp;utm_campaign=blog-index") || index.includes("utm_medium=list&utm_campaign=blog-index"));
writeFileSync(path.join(content, "d.md"), post({ ...GOOD, title: "Same slug" }));
check("two posts with one slug stop the build", throws(() => B.loadPosts(content), /already used/));
rmSync(path.join(content, "d.md"));
writeFileSync(path.join(content, "e.md"), post({ ...GOOD, title: "Links to a draft", slug: "links-to-a-draft" }, "## A\n\nSee [this](/blog/not-ready) for more words here.\n"));
check("a link to a draft or a missing guide stops the build", throws(() => B.loadPosts(content), /not a published guide/));
// The sixth Phase 6 review: draft markers below the front matter, and the GitHub copy of a draft.
for (const [what, top] of [["a blank line before the rule", "draft: true\n\n---\n\n"], ["no rule under it", "draft: true\n\n"], ["a capital D", "Draft: true\n---\n\n"]]) {
  check(`a "draft:" line below the front matter stops the build (${what})`, throws(() => B.parsePost(post(GOOD, `${top}## A section\n\nSome words here, enough of them to read.\n`), "x.md"), /draft:|after the closing ---/i));
}
check("…while the word draft in a sentence is fine", B.parsePost(post(GOOD, "## A section\n\nWrite a draft: then send it to the team.\n"), "x.md").draft === false);
rmSync(path.join(content, "e.md"));
writeFileSync(path.join(content, "g.md"), post({ ...GOOD, title: "Links its source", slug: "links-its-source" }, "## A\n\nSee [the source](https://github.com/aeytechnologiesllc/hireflow1/blob/main/content/blog/not-ready.md) for more words here.\n"));
check("a link to a guide's source on GitHub stops the build (a draft can be read there)", throws(() => B.loadPosts(content), /source on GitHub/));
rmSync(path.join(content, "g.md"));
// The second Phase 6 review: a #part, a ?query, a full address or capitals got past the check.
for (const link of ["/blog/not-ready#intro", "/blog/not-ready?x=1", "https://hireflownow.com/blog/not-ready", "https://www.hireflownow.com/blog/not-ready", "/blog/typo#a", "/Blog/an-older-guide", "/BLOG", "/%62log/not-ready", "https://hireflownow.com./blog/not-ready"]) {
  writeFileSync(path.join(content, "e.md"), post({ ...GOOD, title: "Links", slug: "links-to-a-draft" }, `## A\n\nSee [this](${link}) for more words here.\n`));
  check(`a link to no published guide stops the build: ${link}`, throws(() => B.loadPosts(content), /not a published guide/));
  rmSync(path.join(content, "e.md"));
}
writeFileSync(path.join(content, "e.md"), post({ ...GOOD, title: "Links", slug: "links-to-a-guide" }, "## A\n\nSee [this](/blog/an-older-guide#a), [the list](/blog), [the feed](/blog/feed.xml), [the feed again](https://hireflownow.com/blog/feed.xml) (hireflownow.com/blog/feed.xml) and [that](https://hireflownow.com/blog/an-older-guide?x=1).\n"));
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
  // The cost guide is about an agent's pay (the owner's real figure); no post names a HireFlow price.
  check(`${p.slug}: no price but the free first job (the law's own fines and the cost guide's pay aside)`, !/\$\s?\d|₱\s?\d|\d[\d,.]*\s*(\/|a|per)\s*(mo|month)\b/i.test(p.body.replace(/₱50,000 to ₱500,000|₱50,000|₱500,000/g, "").replace(p.slug === "what-a-remote-support-agent-really-costs" ? /\$500 a month/g : /$^/g, "")));
  check(`${p.slug}: under the HireFlow byline, never "our own" team, agents or hire (the team lead was hired for the owner's own business)`, !/HireFlow's own team|\bour own (support )?(team|agents|staff|hire)\b/i.test(p.body + p.description));
}
{
  const age = all.find((p) => p.slug === "what-you-cannot-ask-filipino-applicants");
  check("the age guide says HireFlow takes only people 18 and over, as its own rule, and why (RA 9231's night hours)", !!age && /does not send on an application that answers "No"/.test(age.body) && /That is HireFlow's own rule/.test(age.body) && /Republic Act No\. 9231/.test(age.body) && /10 p\.m\. and 6 a\.m\./.test(age.body));
  check("…never recommends an age floor to the reader as lawful (the third review: 'an age limit above 18 is a different matter' implied it)", !!age && !/age limit above 18 is a different matter/i.test(age.body) && !/many employers ask one yes-or-no question/i.test(age.body));
  for (const p of all) check(`${p.slug}: never casts HireFlow's 18-or-older question as doubtful ("ask your lawyer whether ... 18 or older")`, !/turning away a "No"/.test(p.body) && !/ask your lawyer whether[^.]*18 or older/i.test(p.body) );
  // The fourth review: the law's words are "age or birth date", never "an exact age" (which would read as if a bracket question were outside it).
  for (const p of all) check(`${p.slug}: says "age or birth date" as the law does, never "an exact age"`, !/\ban exact age\b/i.test(p.body));
  // The fifth review: no post may tell a business "never ask for age" or to
  // leave age out of "the application" while HireFlow's own form asks every
  // applicant "Are you 18 or older?" (BLOG.md: never make a business doubt
  // what HireFlow does). Posts say what not to ask: a birth date, an age in
  // years or a bracket, an age preference.
  for (const p of all) check(`${p.slug}: never "never ask for age" or "leave age … out of the application" beside HireFlow's own 18+ question`, !/\bnever ask (for |about )?(age|an applicant's age)\b|\bnothing asks for age\b|\bleave age and birth date out of the (post and the )?application\b|\btakes applications from people 18 and over\b/i.test(p.body));
  for (const p of all) check(`${p.slug}: "a person makes every decision" names the built-in 18-or-older check`, !/makes every decision/.test(p.body) || /18 or older\?" question every application starts with, a person on your team makes every decision/.test(p.body));
  // …and never says a person makes every decision: on an auto-mode job Ava moves strong applicants on by itself (the eighth review).
  for (const p of all) check(`${p.slug}: says a person makes every decline and hire, and what Ava does alone`, !/makes every decision/.test(p.body) && (!/a person on your team makes every decline/.test(p.body) || /18 or older\?" question every application starts with, a person on your team makes every decline and every hire; Ava can only move a strong applicant on to the next step\./.test(p.body)));
  for (const p of all) check(`${p.slug}: no "every applicant goes through the same steps" (Ava holds weaker ones back)`, !/Every applicant goes through the same steps/.test(p.body));
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
