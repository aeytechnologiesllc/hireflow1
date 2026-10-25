# Analytics

One page, `src/cockpit/pages/Analytics.tsx`, for the hiring team: what
happened to everyone who started an application. Its numbers come from
`src/cockpit/lib/analyticsView.ts`; its look and motion from
`src/cockpit/analytics.css` and
`src/cockpit/components/analytics/AnalyticsMotion.tsx`.

## Why it was rebuilt (2026-10-08)

The owner, about the page before this one (four tiles, three bar charts and
a line saying "Interviewed by Ava: 0" while Ava had held 78 written
interviews): "this is the worst analytics and the ugliest analytics I've ever
seen. I want to see some premiumness, nice animation, number rolling,
something ... I need to see your best work on the mock-up." A mock-up built
from his own week's totals was approved, then built here on live numbers.

## What is on it, top to bottom

1. **The headline.** How many started, in rolling digits; one sentence (how
   many finished every test, how many of them reached the job's pass mark,
   how many are waiting for a decision); applications by day. Beside it:
   **Waiting for you** with a button to the Applicants list on Needs review,
   **Finished every test** with its share, and **Time Ava spent with them**.
2. **How far they got.** A stream as thick as the people still in it at each
   step of this job, thinning to a bright core: the ones who finished. Each
   step says how many have not got past it yet; the biggest drop is marked.
   On a phone the same steps are rows. Under it: what became of the
   finishers (waiting for you, declined, moved to interview).
3. **How good they are.** The final scores of the finishers in tens, the
   middle score, how many reached the job's pass mark, the top and the
   average, and Ava's own advice on them (worth a closer look, or decline).
4. **Test by test.** Each test the job has, under the job's name for it: the
   skills check average, the middle typing speed and reply time from the chat
   practice (with the job's own bar marked, and red when worse than it), the
   chat practice and written interview averages. The two typing meters are
   there only where the chat's typing is the job's measure, as Ava's score
   reads it: not on an on-site or hybrid job (`is_remote = false`: its
   practice may be done on a phone), and not on a job that still has a typing
   step, whose typing meter is the typing test's own (its middle speed against
   the bar stored with each result). They are left out rather than shown without a bar, because a speed
   on this page reads as a measure either way (the sixth product review: the
   dental office's phone typists showed "0 of 3 reached it" in red; guard
   `chat-typing-only-where-it-is-the-jobs-measure`).
5. **What holds them back.** Ava's "why down" lines on the finishers, ranked
   by how many people carry each. The figures that make a line one person's
   own are taken out (`reasonLabel`), a person counts once per mark, and one
   plain sentence names the most common.
6. **When they apply.** Hour of the day on the applicants' own clock when the
   job says where it is posted for (`zoneFromJob`, the same reading the
   interview time picker uses), with the reader's clock under it.
7. **Ava did this for you.** Applications scored, skills checks marked, chat
   practices run, interviews held, replies sent.
8. **People looking at your role** (the site's cookieless page counter) and
   **How fast it moves** (the middle time from pressing Apply to the last
   test, and how many finished within a day and inside two hours).

## Rules

- **It counts what the Applicants list counts.** The page reads
  `useApplicantList()` (the list's own rows, and the applications and
  attempts they were built from) and makes no query of its own. A step is
  done when the list's dot says so; "waiting for you" is the list's Needs
  review tab; "finished" is the list's `finished`. The two pages cannot
  disagree, and the page is live the same way the list is.
- **Nothing is estimated.** A section with nothing to count is left out. A
  funnel only narrows. There are no industry averages and no benchmark.
- **Totals only.** `analyticsView.ts` never reads a name, an email, a phone
  or an answer.
- **One job at a time**, the busiest first; an account with applicants on
  several jobs gets a picker, because each job has its own steps.
- **The old states are kept**: the loading skeleton, the error card with a
  retry (never a page of zeros for a failed load), and, before anyone has
  applied, the visits card and the link to share.

## Motion

- Numbers roll: one column per digit, each settling to its own width
  (`RollingNumber`). When a number changes while the page is open, the
  columns roll on from where they are.
- Each section plays once, the first time enough of it is on screen
  (`Reveal`): it rises in, its numbers roll, its bars grow, the stream and
  the day line are drawn left to right. A light follows the pointer across a
  card.
- Every style draws the finished picture by default; `.an-reveal` holds the
  start of the motion and `.in` releases it. `prefers-reduced-motion` gets
  the finished picture at once.
- Both themes: every colour is one of the app's own tokens.

Proof: `scripts/analytics_view.test.mjs` (where each number comes from, the
rules above, and the wiring). In the preview:
`/analytics?__preview=1&__previewScenario=zulu`.

## Where new businesses come from (2026-10-25)

Before the marketing push the front page was not counted at all (`beacon.js`
had been taken off `public/landing.html` on 2026-10-04 and never put back),
and an account kept no trace of how its owner arrived. Now:

1. **The front page counts again**: `public/landing.html` loads
   `/beacon.js`, so `/` appears in `page_view_daily` with its `utm_source`
   and referring host.
2. **It passes its source on**: `public/carry-source.js` adds the visitor's
   `utm_source`, `utm_medium`, `utm_campaign` and the bare host of the site
   they came from (`ref`) to every link to `staff.hireflownow.com/auth`.
   No cookie, no storage, only short plain values, nothing under Do Not
   Track or Global Privacy Control.
3. **The account keeps it**: on sign-up, `src/lib/signupSource.ts` reads
   those tags from the page's own address and `useAuth`'s `signUp` stores
   them as `signup_source` in the account's metadata.
4. **The staff site counts its sign-up page** (`/auth`, which sign-in shares)
   and nothing else, so the funnel is front page → sign-up page → accounts.
   `page_view_daily` keeps no host, so the "sign-up page" number also holds
   visits to `hireflownow.com/auth` (the same page on the main address,
   counted since before 2026-10-25, including a 121-view day on 2026-10-04).

The platform admin reads it all on **Admin → Growth** (`admin_growth(p_days)`,
`supabase/migrations/20261025080000_admin_growth.sql`, now
`20261025520000_growth_front_page_not_staff.sql`): front-page visits by source,
sign-up page visits, new accounts by role and source, and (since the growth
audit's second round) every kind of public page — front page, guides, Open
jobs, job pages, business careers pages, apply-with-a-code — with its top
sources, plus campaigns by name (source, medium, campaign) for visits and
for new accounts. Visits from the staff host (the hiring team's own clicks,
and anyone going back from the sign-up page) are left out of the front page's
sources, the page kinds and campaigns
(`20261025520000_growth_front_page_not_staff.sql`).

**How a visit is counted** (the growth reviews, rounds 3 to 6):

- A visit is counted with its tags, or the site that sent it, once: on the
  page it arrived on. A page opened from another of HireFlow's pages, and
  every later page in the app, is the same visit moving on: it names
  HireFlow's own host and no tags (`public/beacon.js`).
- The visitor's tags, or the site that sent them (`ref`), ride on to the
  next page and to both sign-ups: the front page, the guides and Open jobs
  (`carry-source.js`), the app's own pages (`withVisitorTags`,
  `src/lib/hiringLink.ts`: Open jobs, careers pages and `/careers`, a job's
  Apply to the applicant sign-up, the staff sign-up's "← hireflownow.com").
  So applicants have a source too, and only a source tag rides along.
- "Hiring? Post a job free" is a new way in, counted when it lands on the
  front page whatever channel the visitor brought: its link carries a mark,
  `hiring_link=1`, that nothing carries on and the counter takes off the
  address, and only a visitor's first hiring link has it: never one on a
  page opened from the front page itself (the visitor was counted there, so
  Open jobs' "Post a job free" after the front page is not a new visit, and
  it takes back only the visitor's own tags, never its own source as a
  campaign), nor one after their tags already name a hiring link. From a
  guide, the staff sign-up or a new tab, the first one still counts.
  Applicants' "Sign in" links on public pages carry the channel as Apply
  does.
- The short ways in (`hireflownow.com/youtube`…) match in any capitals in
  vercel.json (`shortWaySource`, `src/lib/shortWays.ts`).
- Channel names (`growth_source_name`, now
  `20261025510000_growth_google_is_search.sql`): each app or site is its
  channel; "google" is Google search only (the Google app, Google Go,
  google.<tld>), Gmail and Gmail Go are "gmail", and every other Google app
  or site is its own package or host.

**Tag every link you post**, so each channel shows by name:

| Where | Link |
|---|---|
| YouTube video description | `https://hireflownow.com/?utm_source=youtube&utm_campaign=<video>` |
| Quora answer | `https://hireflownow.com/?utm_source=quora&utm_campaign=<topic>` |
| Facebook / LinkedIn post | `https://hireflownow.com/?utm_source=facebook&utm_campaign=<post>` |
| A blog post's button | `https://staff.hireflownow.com/auth?mode=signup&utm_source=blog&utm_campaign=<slug>` |

An untagged visit shows the site it came from (`www.quora.com`), or
"direct" when the browser sent none (an app, a bookmark, a typed address).
Accounts made before 2026-10-25 show as "unknown", and so did every
applicant account until the sixth growth review (Apply carried nothing).

The same query by hand:

```sql
select coalesce(raw_user_meta_data #>> '{signup_source,utm_source}',
                raw_user_meta_data #>> '{signup_source,ref}', 'unknown') as source,
       count(*)
  from auth.users u join public.user_roles r on r.user_id = u.id and r.role = 'employer'
 where u.created_at > now() - interval '30 days'
 group by 1 order by 2 desc;
```
