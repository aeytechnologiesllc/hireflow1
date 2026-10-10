# HireFlow's front page (2026-10-09)

hireflownow.com/ is HireFlow's own landing page: `public/landing.html`, one
static file with its own look (near-black, ivory, one gold; Instrument Serif
and Geist), not the app's. Proof: `scripts/landing_page.test.mjs`.

The owner, 2026-10-09: "the landing is on hireflownow.com"; not
sweepstakes-only ("a very niche market"), but with sweepstakes as the
highlight; and "make sure I still have the job application open".

## How it is served

`middleware.js` (Vercel Routing Middleware, matcher `/` only) rewrites
hireflownow.com/ to `/landing.html`. A rewrite in `vercel.json` cannot do it:
Vercel serves a file that exists before applying rewrites, and `/` is the
app's own `index.html` (a try in June 2026 fell back to an iframe).
staff.hireflownow.com/ is left alone, so the hiring team still goes straight
to sign-in or the dashboard. No dependency: `@vercel/functions`' `rewrite()`
and `next()` are the two response headers the file sets itself.

## What did not move (the applicants' side)

- Job pages and short links (`/candidate/job/<id>`, `/team-lead`), sign-in
  (`/candidate/auth`), `/applications` and every step: unchanged.
- The careers page (open roles) moved from `/` to `/careers`
  (`CAREERS_PATH`, `src/lib/hosts.ts`). With one open role it still opens
  that role's page. "/" inside the app goes to `/careers` on the applicants'
  site, and every "See open roles" link, sign-out, "page not found" and
  "this role isn't open" points there.
- The landing has "Looking for a job?" in its bar (just "Jobs" on a phone)
  and "Open jobs" in its footer, both to `/careers`. Someone already signed
  in on the site (an applicant) sees "My applications" instead.
- A shared job link shows the Zulu Support Team careers picture
  (`public/share/zulu-careers.jpg`), never HireFlow's: the shell's
  `og:image`, and the job page's server render
  (`api/job-prerender.mjs`). The landing's own picture is
  `public/share/hireflow.jpg`.

## The page

One night, told in six scenes on a turning Earth (the version 7 mock-up the
owner saw on 2026-10-09): you post the role at 9 pm, she applies from Cebu,
takes a real customer chat test, is scored, and in the morning there are
three to call. One gesture moves one scene; the last section scrolls like
any page. The Earth is drawn only while something moves; nothing loops.

- Words: "Hire chat agents while you sleep", for any team hiring remote chat
  agents and team leaders. The sweepstakes highlight is its own band:
  "Made by an operator, for operators" (cash-outs, redemptions, ID checks,
  angry players).
- The three numbers are real, from the owner's own role, as of 2026-10-09:
  153 applied in its first four days, 71 finished the written interview,
  3 were worth a call (`interviews`). The mock-up's 141 / 56 hours / 16 were
  not backed by the data. The story's people (Maria, Jun, Ana) are an
  illustration, and the page says so.
- The bar's button is **Sign in** (staff.hireflownow.com/auth). On
  2026-10-10 the owner could not find a way to sign in: "Get early access"
  had taken that place, and there is no early-access offer, so it and its
  wording are gone. The opening's main button is "Watch one night". When
  pricing ships, the pricing section and its "Post your first job" button
  come in here.

Source of the Earth: a hand-drawn land outline (half a degree a cell),
inlined as base64. To edit the page, edit `public/landing.html` directly.
