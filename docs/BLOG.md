# The blog (hireflownow.com/blog, 2026-10-25)

Guides for businesses hiring customer service agents, chat and phone
(docs/LAUNCH-PLAN.md, Phase 6). Plain HTML pages in the front page's look,
built from Markdown, so a search engine reads each article as written and a
phone loads it fast.

## Writing a post

Add `content/blog/<slug>.md`:

```
---
title: How to hire customer service agents from the Philippines
description: One plain sentence, 50 to 160 characters, for the search result.
date: 2026-10-25
slug: how-to-hire-customer-service-agents-from-the-philippines
author: HireFlow
updated: 2026-11-02        (optional; shown, and used by the sitemap)
draft: true                (optional; not built, not listed)
---

## First section

Text...
```

The build stops on a post that breaks a rule, so a mistake never ships
quietly: an unknown front-matter key (a misspelt "draft" would otherwise
publish the draft), a control character in a field, a link to a guide that is
not published (a draft or a typo), a date in the future, a slug over 60
characters (the longest campaign tag sign-up keeps), a missing field, a slug that is not lowercase-and-hyphens or is used
twice, a date that is not a real day, a description outside 50-160
characters, a `# ` heading in the body (the title is the page's only h1),
raw HTML, an image (not supported yet), or a link that is not a site path,
`https://` or `mailto:`. The file name must be the slug
(`scripts/build_blog.test.mjs` checks the real posts).

Check a post without building: `node scripts/build-blog.mjs --check`.

Style for posts (the owner's positioning, CLAUDE.md): customer service agents
for any business, chat and phone; plain words for second-language readers;
no made-up numbers or studies; no sweepstakes, casino or shop-floor
examples; no price but the free first job; HireFlow named at most twice; the
page adds its own sign-up box, so a post has no call to action of its own.
Anything about the law says it is general information, not legal advice, and
links the law's text.

## What the build writes

`scripts/build-blog.mjs`, run by `npm run build` before Vite copies
`public/` into `dist/` (so every Vercel deploy builds it):

- `public/blog/<slug>/index.html` for each post: title, description,
  canonical (`https://hireflownow.com/blog/<slug>`), Open Graph and Twitter
  tags (the site's share picture), `article:published_time`,
  `BlogPosting` and `BreadcrumbList` structured data, `beacon.js` (the
  cookieless page counter, so `/blog/...` paths land in `page_view_daily`)
  and `carry-source.js`, the post, a closing "Post your first job free"
  button tagged `utm_source=blog&utm_medium=article&utm_campaign=<slug>`, and
  three more guides;
- `public/blog/index.html`, the list, newest first (`Blog` data; its button
  is tagged `blog-index`, the top bar's `bar`);
- `public/blog/feed.xml` (RSS) and `public/blog-sitemap.xml` (listed in
  `public/robots.txt` as a second `Sitemap:`).

These files are not committed (`.gitignore`): the Markdown is the source.
No page runs an inline script, so the Content-Security-Policy needs nothing
new. The Markdown library is `marked`, pinned to an exact version.

Each post links the next three guides in the list (round the end), so every
guide is linked from three others. The list's button is tagged
`utm_medium=list`, the top bar's `bar`, a post's `article`.

The repository is public: a draft is not on the site, but anyone can read it
on GitHub. Keep anything private out of a draft until it is meant to be read.

## Routing

- `vercel.json` sends `/blog` to `/blog/index.html` and `/blog/<slug>` to
  `/blog/<slug>/index.html`, before the crawler-only `/:slug` job rule and
  the app's catch-all. Any other address under `/blog` (a draft, a typo) gets
  `/blog/not-found.html`, a plain page marked noindex that lists the guides;
  before, the app's page shell answered, which search engines read as a page
  that exists (seen live 2026-10-25). No `cleanUrls` (the prerender functions fetch
  `/index.html`).
- `blog` and `blog-sitemap.xml` are reserved short-link names in
  `src/lib/jobSlug.ts` and its crawler copy in `api/job-prerender.mjs`, so no
  job can take them.
- The front page links **Guides** in its top bar (on wider screens; the
  phone bar keeps Jobs, Sign in and the button) and its footer.

## Locks

- Guards (`scripts/guards/phase-6-launch-locks.mjs`): `blog-slug-reserved`,
  `blog-pages-have-cta-and-tags`.
- Test: `scripts/build_blog.test.mjs` (the build on fixture posts, then every
  real post against the rules).

## The first posts

Drafted 2026-10-25 for the owner to add their own experience to. Posts 1-3
of the plan wait for the owner's read (`draft: true`): how to hire from the
Philippines, what a remote agent costs (the owner's real figure), and the
owner's own team-lead hire (their details).
