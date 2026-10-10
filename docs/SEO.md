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
