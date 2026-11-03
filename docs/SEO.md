# The public site and search engines (2026-10-09)

What search engines and phones get from hireflownow.com, and the rules that
keep it right. Proof: `scripts/seo_pages.test.mjs`.

## What the check on 2026-10-09 found

- **Every applicant downloaded the staff side.** The careers page and every
  job page loaded about 1.1 MB of compressed code before the job appeared:
  the hiring team's pages (dashboard, applicants, documents, More) were
  imported up front, and Vite's on-demand page loader had been packed into
  the PDF bundle, so even a page with no PDF fetched 479 KB of PDF code.
  Now the team's pages load on demand (and are fetched as soon as the app
  starts on staff.hireflownow.com, so the team's navigation stays instant),
  and `vite.config.ts` pins the loader and Rollup's CommonJS helpers to the
  React bundle. The front page went from about 1,116 KB to 432 KB.
- **The open role was not in the sitemap.** It still used the Google Jobs
  rule (a company name, a country, a city unless remote). Google Jobs was
  removed on 2026-10-05 and every live job page has been indexable since; the
  owner's worldwide remote role has no country, so it was left out. Now the
  sitemap lists the homepage, Privacy, Terms and every published job whose
  deadline has not passed (not `exclude_from_feed`), under
  `/candidate/job/<id>`.
- **Every page claimed to be the homepage.** The app is one HTML shell whose
  title and canonical were the careers page's, so Privacy, Terms, sign-in and
  any mistyped address all told Google "I am the homepage". Now
  `usePageHead` (`src/components/seo/usePageHead.ts`) gives a page its own
  title and canonical, or keeps it out of search: Privacy and Terms are
  listed under their own addresses; sign-in, "page not found" and "this role
  isn't open" (which is also what any one-word address that is no job's short
  link shows) are `noindex`. Everything is put back when the page is left.
- Stale `keywords` tag removed from the shell.

## Since the landing page (docs/LANDING.md)

- hireflownow.com/ is HireFlow's landing page (`public/landing.html`), with
  its own title, description, canonical, share picture and Organization data.
- The careers page is listed as `/careers`. The app's shell no longer names a
  canonical or `og:url` of its own: every page sets its own, and the shell is
  never "/".
- The sitemap lists `/`, `/careers`, Privacy, Terms and every open job.
- Share pictures: HireFlow's on the landing page; the Zulu Support Team
  careers picture on the careers site and every job link.

## Rules

- Google Jobs stays removed: no JobPosting data (see
  `scripts/guards/google-jobs-removed.mjs`). The job page still has its own
  title, description, canonical and share tags, server-rendered by
  `api/job-prerender.mjs`.
- `api/job-prerender.mjs` takes the app's shell from `/index.html`, never
  from `/`.
- staff.hireflownow.com is `noindex, nofollow` (a header in `vercel.json`).
- A new public page that should be found calls `usePageHead` with its path;
  one that should not passes `noindex`.

## Getting into search engines (2026-11-02)

The owner asked why Google had not listed the site. Checked live that day:
robots.txt lets every crawler in and names both sitemaps; `/sitemap.xml` and
`/blog-sitemap.xml` are valid XML (6 pages, the open jobs, 13 articles); the
front page and every article say `index, follow` with their own canonical and
serve their text in the HTML; Vercel's firewall has no rules of its own. Google
had **only the front page** (`site:hireflownow.com`, already showing the $99
line, so crawled since 2026-11-01) and no article (`site:hireflownow.com/blog`:
nothing). Nothing blocks it: the site is new, few other sites link to it, and
Google was never told about it. Google's sitemap ping was shut down in 2023, so
the only way to ask is **Google Search Console** (the owner's sign-in):

1. Add a URL-prefix property for `https://hireflownow.com/`, method "HTML tag".
2. The tag goes in the `<head>` of `public/landing.html` (the front page), then Verify.
3. Sitemaps: add `sitemap.xml` and `blog-sitemap.xml`.
4. URL Inspection → Request indexing for the front page, `/blog` and each
   article (Google allows about ten a day).

Bing Webmaster Tools can then import the property from Search Console.

Bing, Yandex, Naver and Seznam take **IndexNow**: `node scripts/indexnow.mjs`
sends every page of the public site but the job and careers pages (their ping
went with Google Jobs), using the key served at
`/8f1bfc75cd683af0c7f05fe79664ec51.txt`. Sent on 2026-11-02 (19 pages, 200 OK).
Run it again after publishing an article.
