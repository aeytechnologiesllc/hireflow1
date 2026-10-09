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
   chat practice and written interview averages.
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
