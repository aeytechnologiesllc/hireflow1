# The Applicants page: a list, then the profile

Approved by the owner on 2026-10-06 from the mockup in `docs/mockups/`
(`applicants-list-desktop.png`, `-phone.png`, `-filters.png`, and the HTML
they were drawn from). His words: *"when I click on applicants, it only should
show me the applicants. Don't show me the right bar … Just a list of
applicants. I can click through … And then I have to go inside view full
profile to see everything they've submitted … Imagine I have 105 applicants.
It's going to become a nightmare … I can actually filter those out."* Then:
*"I love the proposed layout, build it all the way."*

The mockup is the target. Match its structure, columns, wording and states.
The tokens are the cockpit's own (NIGHT and DAY both); no new colours.

---

## 1. What the page is

`/applicants` is a list and nothing else. No right-hand panel, no "What they
submitted", no Ava's read, no live strip, no 8-per-page pager. Tapping a row
opens `/applicants/:id` (unchanged URL, character for character: server code
and notifications match it).

Header: the page title (one route title per viewport, per the staff shell's
rule) and "N applied" ("· N on the form" when anyone is), the job's name when
one job is shown (wrapping to a second line, never cut), the search box (on
its own row below 1024px). The old page named whoever was on the form while
another tab was open; that was dropped on purpose: they are on Taking tests
now or Part-way with the line "Filling in the form", and the header counts them.

Tabs (each applicant is in exactly one; counts ignore the filters):

| tab | who | precedence |
| --- | --- | --- |
| **Declined** | `status = rejected` | 1 |
| **Interview** | `status in (interview, offered, hired)`; the row's chip says Interview, Offer or Hired | 2 |
| **Needs review** | finished every test (every journey step done or skipped) and not decided: waiting on the hiring team | 3 |
| **Taking tests now** | a live attempt: the record's live state is doing or away (inside the 10-minute rule), or checking (inside the server's 7-minute claim limit: a claim nothing has written to for longer belongs to a request that died, and reads "checking failed, retrying" on Part-way), including someone filling in the form | 4 |
| **Part-way** | everyone else: started, not finished, not live now (left, idle, still on the form but quiet) | 5 |
| **All** | everyone | |

"Finished every test" is NOT a tab: in an auto-mode job everyone who finishes
is waiting on a decision, so it would hold the same people as Needs review.
It is a "Where they are" filter option instead. Tab order on screen: All,
Needs review, Taking tests now, Part-way, Interview, Declined.

Old links keep working: `?tab=applying|started` → Part-way (Taking tests now
when live is not knowable from a link, so Part-way), `?tab=reading` → Part-way,
`?tab=sealed` → All, `?tab=passed` → Declined. `?roleId=` still filters to one
job; a `?roleId=` naming a job that is not in the list (deleted, or one a team
member is not on) says "This job isn't in your list." with "See everyone who
applied", never "Nobody has applied yet." `/applicants?applicationId=<id>`
redirects to `/applicants/<id>`. (The parser is `tabFromParam` /
`parseListState` in `src/cockpit/lib/applicantList.ts`; the old four-bucket
helpers are deleted.)

Filters (desktop: a row of dropdowns; phone: one Filters button with the
active count, opening a bottom sheet with chip groups and "Show N applicants"):

- **Where they are**: Any step, each journey step by title, Finished every test.
- **Score**: Any, 70 and up, 50 and up, Under 50, Not scored yet (each with its count in the sheet).
- **Flags**: Any, No flags, Left the test window, Tried to copy or paste, Any flag.
- **Below the job's bar on**: Any, Skills check, Typing, Connection, Chat practice, Ran on a phone.
  **Typing** is a typing test under its bar or, on a job with no typing step,
  the typing measured in the chat practice under its speed bar or over its
  reply-time bar (docs/TYPING-IN-CHAT.md). **Chat practice** is only the
  chat's own mark under the pass mark.
- **Country**: All, then the countries present, most common first, then Unknown.
- **Applied**: Any time, Today, This week, This month.
- **Job**: only when the employer has more than one job (`?roleId=` is the same filter).
- **Sort**: Score high to low (unscored last), Newest, Last active.

An active filter reads as a filled chip with an × (desktop) and as a count on
the Filters button (phone). Below 1440px an unset desktop dropdown shows only
its name ("Flags ⌄"; "Any" says nothing more), so the row fits on one line
beside the sort on a laptop; a set one always shows its value. Under the list: "Showing 25 of 64 · <active
filters in words>" and **Show 25 more**. Search matches name, email and country.

Tab, filters, sort, search and how many are shown live in the URL (replace,
not push; unknown params such as `roleId` and `__preview*` are kept), and the
list's scroll position is restored when coming back from a profile. The page
scrolls inside the shell's `<main class="ck-scroll">`, not the window.

## 2. One row

Desktop columns: Applicant · Where they are · Last active · Flags · Score · ›

- **Applicant**: avatar initials (a live dot when active in the last 2
  minutes), name, the status chip (Needs review, Interview, Offer, Hired,
  Declined), then "Country · applied 2 h ago" (Started 2 h ago while on the
  form). Applied is `created_at`, when they pressed Apply: the same moment the
  profile's header and timeline show (the form's own end would make the two
  disagree). The line wraps after "Country ·" rather than cutting the age off.
- **Where they are**: the journey strip, one dot per journey step of THAT
  applicant's job (Application, Skills check if any, each workflow step,
  Decision), joined by a line. Under it, one line.
- **Last active**: "Active now" (jade) within 2 minutes; "Active 6 min ago"
  (jade only while the attempt is live: doing, away, or checking inside the
  claim limit);
  "Last active 20 h ago" (also for someone who walked away, as on the
  mockup: the line beside it already says "Left at …"); "Done 2 days ago";
  "Decided Mon"; "Interview Thu 3 PM" when one is booked. No column records
  when a decision was made, so "Decided" reads `applications.updated_at`
  (a decision is a staff write); that is its only use on the list.
- **Flags**: shield + "3 flags" in amber, or "None". The tooltip lists them
  ("Left the window 3 times · 1 copy").
- **Score**: `ai_score` as a big Fraunces number over "/100": jade at 70+,
  brass 50–69, ink under 50. "so far" under it when
  `ai_scorecard.decisionState = needs_more_evidence`. "—" and "not scored yet"
  when `ai_score` is null. Never a quiz percentage standing in for it.

Phone: a card per applicant (name, country · applied, score on the right; the
strip full width; the line plus flags under it), exactly as the mockup.

### Dot states: decided by the RECORD, never by position

`buildAssessmentRecord(app, { sessions, now })` is the one reader; the full
profile uses the same call, so the list and the profile always agree.

| dot | when (entry for that step) |
| --- | --- |
| done (jade, check) | `status = done`, tone not amber |
| done, below the bar (brass, check) | `status = done`, tone amber |
| on it now (ring) | `status = in_progress`; if no entry is in progress and every real step is done or skipped, the Decision dot; a decided applicant's Decision dot is done |
| skipped (dashed ring) | not done and before the applicant's position: "No result on file" (for example a step the job gained after they passed it) |
| not reached (empty) | everything else, including "Not taken" by someone decided before reaching it |

The legend under the list on desktop names the five. "Not reached" and the
unlit line are `--ink-3` at 75%: at least 3:1 on the card in both themes.

### The one line

One rule, `journeyLineRuns` in `src/cockpit/lib/applicantProfile.ts`: the
list's row and the profile's rail summary both call it with the same record,
so they say the same words.

From the record's live status when there is a live or recently live attempt:
"Typing test · step 4 of 7 · live", "Skills check · question 6 of 10 · step 2
of 7 · live", "Typing test · checking the answers · step 4 of 7", "… · step 4
of 7 · checking failed, retrying" (amber; also a claim past the 7-minute
limit), "Left at chat practice, reply 3" (amber), "Away from the test for 3
min", "Filling in the form · 3 of 11 answered · live", "Away from the form for
2 min" (the form is not a test), "Left the form at 3 of 11". Otherwise:
"Finished every test" (+ " · Ava suggests: decline" in amber, or " · Ava
suggests: interview" in jade, from `ai_scorecard.recommendedAction`), "Moved
to interview", "Declined", "Computer and connection · step 3 of 7 · not
started" (theirs to take now), "Player chat practice · step 5 of 7 · not
opened yet" (parked: what they took is in and the next test waits on the
hiring team, so the step gate will not let them in), "Filling in the form".
When the line wraps, the " · " stays at the end of the line it closes.

## 3. Data, cheaply, for hundreds

One slim load per job, filtered and sorted in the browser, 25 drawn at a time:

1. Jobs from `useEmployerJobs` (already loaded); attach each job to its rows on
   the client. No `jobs!inner(*)` embed (it repeats a 17 KB job per row).
2. `applications` by `job_id`, only the columns the record builder reads
   (`id, job_id, candidate_id, status, phase, created_at, updated_at, notes,
   ai_score, ai_scorecard, resume_url, voice_interview_result`), paged past
   PostgREST's 1,000-row cap.
3. `profiles` (`user_id, full_name, email, avatar_url`) in chunks of 150 ids.
4. EVERY attempt for those jobs (not only open ones: open-only loading makes
   flag counts and last-active wrong), without `grading`, `context` or `draft`,
   paged past 1,000 rows; plus `draft` for application-form attempts only (the
   country of someone still on the form lives there).
5. The staff reopen markers for those applications.

The existing `['applications','employer',uid]` query is NOT changed: the
profile, Dashboard, Jobs counts, Messages and Analytics read it.

**Live without refreshing**: the new keys sit under the `['applications']` and
`['assessment-sessions']` prefixes, so the shell's one live sync covers them.
An UPDATE is merged into the cached list in place (the realtime payload of
`applications` is the full row; for `assessment_sessions` merge only the
columns the list holds). The list is refetched only on an INSERT, a DELETE, an
id it does not hold, or the reconnect catch-up: a live applicant's heartbeat
every 5–30 s must not re-download the list. For the same reason the two big
lists are not refetched on a window focus or a quick remount (Back from a
profile, a phone back from the background): their staleTime is five minutes,
and a reconnect or the sync's catch-up heals a missed event. The 30-second
clock keeps "Active now" and "Left" ageing without events; on a tick only the
records of people in a test right now are rebuilt (an `active` attempt not
yet quiet for ten minutes), never the decided or anyone who left long ago.
No page opens its own channel.

The same sync refetches one applicant's own attempts (the open profile's
`['assessment-sessions','application',id]`, with context, grading and draft)
only when one of THEIR attempts changed, or on the catch-up; never for
another applicant's heartbeat. Booked interviews have a third channel of
their own on `public.interviews` that refreshes `['interviews']`, so
"Interview Thu 3 PM" follows a slot the candidate picked or a teammate's
cancellation (guarded by `scripts/guards/cockpit-live-applicants.mjs`).

A failed attempts or hand-backs load costs the live details, never the list:
the rows are built from the applications alone and a line under the filters
says "Test progress, flags and last active didn't load … Try again". Only the
jobs or the applications failing shows the error card. On the older demo
("showcase") schema there is no applications table of this shape: the page
says so instead of "Nobody has applied yet."

**Country**: there is no country column. It comes from the job's own form
answer to a question that asks where they are (text matches country, city,
where you will work or live, location), from `notes.applicationAnswers`, or
the form attempt's draft while they are still on the form. A question naming
a country or city is read first and its answer is taken as typed; a looser
one ("Your location", "Where will you work from?") counts only when its answer
names a country, and an answer that is not a place ("Yes", "N/A") is passed
over for the next one. Normalise free text to a country name
(`recogniseCountry` / `normaliseCountry`), in this order:

1. A US state or Canadian province after a city ("Atlanta, GA", "Austin,
   Texas", "Regina, SK") → United States / Canada. Two letters that are a
   state are never read as a region code (GA is not Gabon, CA not Canada).
   Georgia stays the country.
2. A country by name or alias, the last comma part first ("Manila,
   Philippines"), matched against the region names from
   `Intl.DisplayNames(['en'], { type: 'region' })` case- and accent-blind. A
   two-letter region code only as the last part ("Cebu, PH") or the whole
   answer ("PH").
3. The last comma part only, within two edits, for names of 6+ letters whose
   first letter agrees ("PHILLIPINES" and "Phillipines" → Philippines;
   "Siberia" is not Liberia, a city part is never fuzzy-matched, two countries
   equally close is no match).
4. A country among the words of an answer with no comma ("Manila
   Philippines", "Lagos Nigeria"): exactly one country found, or none.

Otherwise keep the last comma part in title case. No answer → Unknown.

**Last active**: the newest `last_activity_at` of any attempt; else the newest
completedAt among the record's entries; else `created_at`. Never
`applications.updated_at` (staff actions and Ava's analysis move it).

## 4. The full profile gains what the list loses

`/applicants/:id` already has the record list, the actions and Ava's read.
It gains:

- The journey rail with the same dot rule as the list (entry status, not
  index), so a step added after they passed it reads "Skipped", not
  "Completed".
- **Set up interview**: the scheduling wizard and the "moved to interviews,
  propose times?" moment move here from the list page, so the Interviews
  page's "Schedule an interview" still lands somewhere that works.
- The timeline (applied → each move), if the list page had it and the profile
  does not. A voice interview's moment is the transcript's last turn (the
  voice tools write no completedAt), and a result for a step the job no
  longer lists keeps its moment too.
- Under the rail, the list row's own line (journeyLineRuns, above).
- A pager "3 of 64 ‹ ›" over the list's current order (tab, filters, sort),
  carried from the list in `sessionStorage`; absent when opened from a link.
- On a phone, the action bar shows at most three buttons; the rest go behind
  "More". They share one height (the first, the decision on screen, gets the
  larger share of the width); from md up every button is 36px tall.
- The "Needs review" pill follows the tab's rule (finished, not decided).

## 5. Proof

- `scripts/applicant_list.test.mjs`: tab partition for every status/state
  (each applicant in exactly one tab), dot states from prod-shaped rows
  (Candidate 1: connection check skipped, typing/chat/interview below the bar,
  6 flags; CANDIDATE 2: on the skills check, 5 flags from a superseded
  attempt), the one line, last active, score words, filters, sort, search,
  country normalisation, URL state round-trip and old-link mapping.
- The live sync: an UPDATE merges in place with no refetch; an INSERT
  refetches; an open profile refetches only for its own applicant's attempts;
  interview changes refresh `['interviews']` on their own channel
  (`scripts/applicant_list.test.mjs`, `scripts/employer_live_sync.test.mjs`).
- Existing checks that pinned the right-hand panel are rewritten in the same
  change, never deleted without a replacement.
- Dev preview has ~12 fixture applicants covering every state above; the list
  and the profile are looked at rendered at 390 and 1280, in NIGHT and DAY,
  and inside the team member's shell too.
