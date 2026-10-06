# Short job links: hireflownow.com/team-lead

Owner, 2026-10-06, looking at `hireflownow.com/candidate/apply?code=JOB-C84E85`:
*"I don't get it. Why are link actually has a job code and all of that?
Candidate … it should be more simplified … they could hit the back button or
get confused easily."* Then: *"do it."*

**The link an applicant sees is `hireflownow.com/<slug>`.** No "candidate", no
"?code=". The page the link opens has one job and one Apply button.

`jobs.slug` exists (migration `20261006145832`) and the live job's is
`team-lead`. `published_jobs_public` carries `slug` for logged-out visitors.
The same migration made both public views read-only (they were writable by
anyone with the public key).

---

## 1. Where each link lands

| link | lands on |
| --- | --- |
| `hireflownow.com/<slug>` | that job's page: what the job is and one **Apply** button. Unknown slug: the careers page's honest "this role isn't open" state, never a blank page |
| `hireflownow.com/` | exactly one open job → straight to it (`replace`, so Back does not bounce); several → the careers page listing them, each linking to its short link; none → the careers page's empty state |
| `hireflownow.com/candidate/apply?code=X` (old links already shared) | the job's short link (`replace`) when the job has a slug; the code box only when there is no code or no such job |
| `hireflownow.com/candidate/job/:id` | the short link (`replace`) when the job has a slug; otherwise as today |
| `staff.hireflownow.com/<anything unknown>` | as today (NotFound). The slug route is the CANDIDATES' site only |

The careers page (`src/pages/Index.tsx`) stays the design it is; it simply
stops being in the way when there is only one job.

## 2. Apply, and the Back button

Apply → sign in or sign up (`/candidate/auth`) → straight into the form →
the steps. Rules:

- Every automatic hop uses `navigate(…, { replace: true })`: auth → form, the
  root → the job, an old link → the short link, a finished step → its next
  step when the page moves by itself. A person pressing Back never lands on a
  page that immediately sends them forward again (a loop), on the code box,
  on the sign-in screen while signed in, or on a blank page.
- From any step, Back reaches the applicant's own application page
  (`/applications/:id`) or the job page, both of which explain where they are.
- Pressing Back from the job page leaves the site, which is correct (that is
  where they came from).

Audit every navigate() on this path (JobDetails, CandidateAuth, the auth
callback, ApplyWithCode, CandidateContinue, ApplicationFormPhase, the step
pages' "Start next step" and NextStepCard, CandidateStepGate's redirects)
and prove the Back behaviour with a browser test of the real flow, using the
dev preview's candidate fixtures where a login is needed.

## 3. Every shared link is the short one

`applyLinkFor` (ShareJobCard), the Share Kit (link, QR code, flyer, the
ready-to-paste post), the Dashboard's copy, the Jobs page's Share link, and
anything else that builds `candidateApplyUrl(code)` or `/candidate/job/:id`
for sharing: use `hireflownow.com/<slug>` when the job has a slug, and the
existing link otherwise. The ready-to-paste post must be true: it currently
says "Apply in about 3 minutes — no account needed"; if applying needs an
account and takes longer, say what is true ("It's all online, on your
computer").

## 4. Setting the short link

The job editor (create AND edit) has **Short link**:
`hireflownow.com/` + an input. On create it is suggested from the title
(lowercase, hyphens, trimmed to 40). Plain-words errors: "Use lowercase
letters, numbers and hyphens", "3 to 40 characters", "That name is taken by
another job", "That name is part of the site; pick another". Reserved names
are every top-level path segment the app's routes use (derive the list from
`src/App.tsx` and keep a test that fails when a new top-level route is not
reserved) plus `api`, `assets`, `sitemap.xml`, `jobs.xml`, `adzuna.xml`,
`jooble.xml`, `robots.txt`, `favicon.ico`, `manifest.webmanifest`. Saving
writes `slug` only when it changed (the editor's existing rule).

## 5. Proof

- `scripts/short_job_links.test.mjs`: slug validation and suggestion; the
  reserved list covers every top-level route in App.tsx; root routing
  (0, 1, many open jobs); old-link mapping; the share-link builder.
- A browser test of the real candidate flow showing Back never loops or lands
  on a dead end.
- Looked at rendered: `/team-lead` (390 and 1280, Night and Day), the root
  with one job, the old link forwarding, the editor's Short link field with
  each error.

---

## 6. Built (2026-10-06)

- **The rules** are one file with no imports, `src/lib/jobSlug.ts`: the name
  check and its four messages, the suggestion from a title, the reserved list
  (`ROUTE_SEGMENTS` = every top-level path in `App.tsx`, plus site paths and a
  few held-back words), the root's 0/1/many rule, the old-link mapping and the
  share-link builder. `src/lib/jobLinks.ts` adds the candidates' origin;
  `src/lib/jobSlugAvailability.ts` asks whether a name is free.
- **Route**: `{!isStaffHost() && <Route path="/:slug" element={<JobDetails />} />}`
  in `App.tsx`, above the catch-all. The internal-link guard in
  `scripts/guardrails.mjs` ignores `/:slug` the way it ignores `*`.
- **Job page** (`JobDetails.tsx`, not forked): reads by slug or id; an id link
  or a differently-typed name moves to `/<slug>` with `replace` (candidates'
  host only); a stranger's Apply goes to `/candidate/auth?redirect=/<slug>?apply=1`
  and the return starts the application by itself, replacing each entry. No
  "Back to Apply" for candidates; on a phone the Apply card sits under the
  header. Canonical and `og:url` stay `/candidate/job/:id` (see §7).
- **Root** (`Index.tsx`): one open job → `navigate(path, { replace: true })`;
  several → the careers page, each role linking to its short link.
- **Old links**: `/candidate/apply?code=X` forwards (replace) when the job has
  a slug and shows a spinner, never the code box, meanwhile.
- **Back**: sign-in, the auth callback, a password reset, the step gate's
  refusals, the hop after a sent step (manual mode) and "Start <next step>"
  all replace their entry.
- **Shares**: `applyLinkFor` (ShareJobCard), the Share Kit (it prefers the
  job's own short link whoever opens it), the Jobs page, the publish dialog
  and the Ava publish screen (which claims the free name nearest the title).
  The post and flyer say "It's all online, on your computer."
- **Editor** (`CreateJob.tsx`, create and edit): Short link under the title;
  `slug` is its own column in the edit map, so it is written only when changed;
  a refusal from the unique index shows "That name is taken by another job".

Proof: `node scripts/short_job_links.test.mjs` (CI) and
`node scripts/short_job_links_back_check.mjs` (a browser; not in CI because it
reads the live job).

**Link previews of the short link (built 2026-10-06, after the talent
review):** `vercel.json` sends `/:slug` to `/api/job-prerender?slug=:slug`
only for link-preview and search crawlers (facebookexternalhit, WhatsApp,
Twitterbot, LinkedInBot, TelegramBot, Slackbot, Discordbot, Viber, Googlebot,
bingbot, Applebot, …) and never on `staff.hireflownow.com`; people still get
the app. The prerender looks the job up BY ITS NAME in `published_jobs_public`,
so `hireflownow.com/team-lead` previews as "Chat Support Team Leader (Zulu
Royal & Zulu Rush) — Zulu Support Team". A name that is no open job (a page
of the app, a closed job, a typo) is the plain shell with 200, never a 404.
The canonical and `og:url` stay the long link in both cases (see §7).
`scripts/job_prerender_gone.test.mjs` scenarios 8 to 11. The shell's own
card (`index.html`) now names team leads and the six steps, and no longer
promises "hear back fast". The sitemap edge
function and `api/job-feed.mjs` still list `/candidate/job/:id`, which now
forwards to the short link (the feed's `utm_` query is kept). That is also
why the canonical stays the old link (§7): only that address is prerendered.

---

## 7. After the review (2026-10-06)

What the review found, and what changed:

- **Canonical and `og:url` stay `/candidate/job/:id`**, in the prerender
  (`api/job-prerender.mjs`) and on the page (`JobPageHead.tsx`). Pointing them
  at `/<slug>` sent search and Facebook from the job to the homepage, because
  `/<slug>` is served the plain app shell, whose canonical and `og:url` are
  the homepage. The by-slug prerender now exists, but only for crawlers, and
  it keeps the long link too: move the prerender's canonical, `JobPageHead`
  and the sitemap's `<loc>` to the short link together, in one change.
- **Forgot password while applying keeps the job.** The reset link carries
  `&redirect=` (Supabase's allow-list has `https://hireflownow.com/**`, checked
  read-only) and the same browser keeps a copy for two hours
  (`hf-candidate-reset-redirect`). The new password returns to the job; with
  no job at all, to the person's own home.
- **A signed-in candidate's home is `/applications`** (`getPostAuthRoute`),
  not the job-code box; its empty state says "See open roles" (`/`). The
  code box is still in the menu as Enter Job Code.
- **Apply opens Sign Up** (`&tab=signup`), and the sign-in screen says
  "Applying for" with the job's title instead of "Candidate Portal". The
  address is still `/candidate/auth`: renaming the auth route is its own
  change (links and the reset allow-list depend on it).
- **The job page**: no Job Code row for applicants (the team still sees it);
  no Back-button bar in a stranger's loading skeleton; "See open roles" points
  forward; on a phone, once the Apply card scrolls away, a slim bar with the
  same Apply rises from the bottom. The root hands the one role's row to the
  job page, so it opens without a second load, and its waiting ground follows
  the theme.
- **A name the site cannot open is no short link** (`usableSlug`): the
  database only checks the shape, so a job saved as `dashboard` or `login`
  without the editor keeps its old link everywhere and is never forwarded.
- **The crawlers' prerender refuses those names too** (second review): it
  keeps a pinned copy of `RESERVED_SLUGS` (`api/job-prerender.mjs` takes no
  imports; `scripts/short_job_links.test.mjs` fails when the two differ), so a
  job named `privacy` or `jobs` through the API is never what Googlebot sees
  at `hireflownow.com/privacy`. Not built: a CHECK or trigger on `jobs.slug`
  refusing the list, which would make the editor, the API and the crawler
  follow one rule (a migration; the list would then live in SQL as well).
- **More crawlers get the preview**: Pinterest's own fetcher (`Pinterest/`),
  Search Console's live test (`Google-InspectionTool`), `GoogleOther`,
  Snapchat, Embedly and Iframely.
- **One address, two answers**: `/<slug>` is the job's prerender for
  crawlers and the plain app for people, so every prerender answer for a
  short link says `Vary: User-Agent`. Not proven on Vercel's cache yet; after
  the deploy, check both orders:
  `curl -sI -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0" https://hireflownow.com/team-lead`,
  then at once `curl -s -A "facebookexternalhit/1.1" https://hireflownow.com/team-lead | grep og:title`
  (and `WhatsApp/2.23.20.0 A`, `Slackbot-LinkExpanding 1.0`), noting
  `x-vercel-cache` each time; then the crawler first and the browser second.
  The crawler must always get the job's `og:title` and the browser the app.
  If either leaks, answer every `?slug=` request with
  `Cache-Control: private, no-store` (only crawlers ever get them), or add a
  `headers` rule for `/:slug` with `Vary: User-Agent` in `vercel.json`.
- **Renaming, clearing or deleting a short link warns first.** The field says
  the old link will stop working, Save asks ("Change the job's link?"), and
  the Jobs page's delete text says the link stops working. Nothing forwards
  an old name yet (see below).
- **The editor**: a name the database refused stays marked taken (the
  browser's check cannot see that job, so it used to clear the error); a
  refused suggestion moves on to the next name by itself; the error border
  and focus ring are both red; the placeholder is `your-job-name`, faint and
  italic; the help line spells out the whole link; a suggestion cut at a word
  never ends on a small word ("…-representative", not "…-representative-for").
- **The Share Kit**: Print flyer works (the `noopener` window feature made
  `window.open` return null, so the flyer was never written); the link breaks
  only after its last `/`; "Google has already been told" is gone (and the
  google-jobs-removed guard now refuses it); "It's all online, on your
  computer" is used only for a job with computer steps (`hasComputerSteps`,
  `COMPUTER_STEP_TYPES` in `candidateJourney.ts`), otherwise "Apply here:".
- **Ava's `duplicate_job`** no longer copies `slug` (it is unique, so every
  duplicate of a job with a short link failed). The edge function must be
  redeployed for this to reach production.

Not done, and why:

- **Old names do not forward to the new one.** That needs a
  `job_slug_history` table (a migration). Until it exists, the warnings above
  are the protection.
- **The database does not refuse reserved names.** A CHECK or trigger built
  from `RESERVED_SLUGS` needs a migration; the app already ignores such a
  name (`usableSlug`).

Proof: `node scripts/short_job_links.test.mjs`,
`node scripts/job_prerender_gone.test.mjs`, and the browser check
`node scripts/short_job_links_back_check.mjs`, which now also walks a
password reset (Supabase's auth answered inside the browser), the Sign Up
tab, the job title on the sign-in screen and the phone's Apply bar.
