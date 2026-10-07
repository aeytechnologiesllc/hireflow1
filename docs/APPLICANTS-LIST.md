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
Shortlist, Needs review, Taking tests now, Part-way, Interview, Declined
(then Blocked, once someone is: section 6).

**Shortlist** is the one tab that is not a place in that table: it is the
hiring team's own picks and cuts across the others (section 7). Someone on it
is still on their own tab and still counted there.

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
- **Sort**: Score high to low (unscored last), Newest, Last active. Ties,
  and the whole unscored block, go by when they applied (newest first), then
  id: keys nothing a live applicant does can move. Only "Last active" reads
  activity, because that is what it asks for. (Until 2026-10-07 a Score tie
  went by the last move; with four in five applicants unscored and a
  heartbeat every two seconds, the default order changed on nearly every
  event.)

An active filter reads as a filled chip with an × (desktop) and as a count on
the Filters button (phone). Below 1440px an unset desktop dropdown shows only
its name ("Flags ⌄"; "Any" says nothing more), so the row fits on one line
beside the sort on a laptop; a set one always shows its value. Under the list: "Showing 25 of 64 · <active
filters in words>" and **Show 25 more**. Search matches name, email and country.

Tab, filters, sort, search and how many are shown live in the URL (replace,
not push; unknown params such as `roleId` and `__preview*` are kept), and the
list's scroll position is restored when coming back from a profile. The page
scrolls inside the shell's `<main class="ck-scroll">`, not the window.

### The list holds still while it is read (2026-10-07)

The owner, with 31 applications in an hour: *"the page is doing this weird
refresh thing … there's too much weird shit going on."* Every heartbeat of a
live applicant re-sorted the list, and every row a re-sort moved replayed its
entrance fade (Chrome restarts a CSS animation on a node React moves), so the
whole list blinked to nothing and faded back in every couple of seconds.

- **The order on screen is held.** It is taken when the list lands, and taken
  again only when he changes the tab, a filter, the sort or the search,
  presses the update bar, or comes back to the page (a new visit, or the page
  hidden for 30 seconds or more: it is taken afresh every 30 seconds while
  hidden, from the moment it is hidden or mounted hidden, and once more on
  the way back; a quick look at another tab returns to exactly the order it
  left). "Show 25 more" draws further down the same
  held order. Between those, each row's own facts (live dot, the one line,
  last active, flags, score, chip) change in place; no row moves, none is
  added, and the tab counts stand still.
- **What would move in THIS list waits in one quiet bar**: "12 new · 5
  moved · Show". *New* is anyone new since the hold who would join this list
  (its tab, filters and search). *Moved* is a held applicant who would change
  place in it: into it, out of it, or to another position in it (the fewest
  rows that would have to move: one score lifting a row past twelve others
  is 1 moved, not 13). A change on another tab moves no row here, so it never
  waits in the bar (the bar once said "5 new" on Interview for five people on
  the form, and Show moved nothing); the tab counts take it in silently the
  next time the list is taken. Show applies everything at once. The bar's
  slot is always there at one height ("Up to date" when nothing waits), so it
  never pushes the list down. It is one button in both states (inert while
  up to date), so Show keeps the keyboard focus, and its words are a polite
  live region. On a phone it sits under the tabs; on a computer at the top
  of the list.
- A held row that no longer matches its tab or filters stays where it is,
  showing its new state, until the update. A deleted applicant leaves at once
  (that moves no one else). When the held list is empty there is nothing to
  keep still, and whoever would join it shows at once (a change elsewhere
  does not retake it).
- The owner's own action on a row from the list (decline, delete, block) can
  show at once through `settle([id])` (`settleApplicantHold`): that row's tab
  counts as it is now and it leaves a list it no longer matches, while
  everyone else stays held. The list settles the rows as he confirms, before
  anything is sent, so a realtime update that lands ahead of the round trip
  shows at once too. A move onto or off Blocked always shows at once
  (only the hiring team blocks anyone; in the owner's words a block is a
  delete), the way a deleted row leaves.
- Rows rise in (`ck-reveal`) only while the list first lands; a row that moves
  on Show, or arrives later, appears without the animation.
- A background refetch never shows the skeleton or moves the scroll: the list
  queries keep their previous rows while a new key loads
  (`placeholderData: keepPreviousData`).
- Only the rows that changed redraw. The row builder hands back the very same
  row object while it says the same thing (even after a refetch rebuilds every
  record), and the page draws each row through one memoised item
  (`ApplicantListItem`) with one callbacks object for its lifetime; a row's ⋯
  menu builds its items only while it is open. During a flood every realtime
  event renders the page, and redrawing 300 rows each time was a long
  main-thread task per heartbeat.
- A phone card does not change height when its facts change in place: the
  score always keeps the room for "so far", and the foot (the line and the
  flags) is always two lines tall, never more.
- A row's ⋯ menu closes when its row moves under it (a row above deleted or
  blocked, the list taken afresh) rather than sit beside someone else.

The rule lives in `src/cockpit/lib/applicantList.ts` (`holdApplicantList`,
`heldListView`, `listUpdates`, `settleApplicantHold`) and
`useHeldApplicantList` in `src/cockpit/hooks/useApplicantList.ts`; the bar is
`src/cockpit/components/ListUpdatesBar.tsx`. Guarded by
`scripts/guards/cockpit-live-applicants.mjs` (wave 5).

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
- The list holds still: a heartbeat changes neither the Score nor the Newest
  order; a burst of 50 updates (heartbeats and score landings) and 20 new
  applicants, through the real live sync, row builder and held view, moves no
  row and no tab count on Score, Last active, Newest or a tab, until Show,
  which then draws the live order with all 20 new; a row drawn after the
  first paint has no `ck-reveal` (section 11 and 12 of
  `scripts/applicant_list.test.mjs`).
- Existing checks that pinned the right-hand panel are rewritten in the same
  change, never deleted without a replacement.
- Dev preview has ~12 fixture applicants covering every state above; the list
  and the profile are looked at rendered at 390 and 1280, in NIGHT and DAY,
  and inside the team member's shell too.

## 6. Remove and block (2026-10-07)

The owner, with a live job taking applications as fast as people could type:
*"give me a nicer, easier way to drop down to delete some of these
applicants. And that will just block them too."* Pass stays the polite way
out (it emails the candidate); Remove and block is the other one: silent, and
it sticks.

**Pass is a plain confirm (2026-10-07).** It used to ask "Why, in a line? Only
you see this." The owner read that as having to explain himself: *"just ask me
for confirmation and send them whatever they need … I shouldn't have to tell
them why … we don't want to depress them, we want to keep them encouraged."*
The dialog (the profile's and this list's, one set of words:
`passDialogWords` and `DeclineNotePreview` in ApplicantDecisionDialogs) now
shows the note they will get, word for word, with Cancel and Pass. The note is
`src/lib/declineNote.ts` (copied to `supabase/functions/_shared/` for the
email; `scripts/decline_note.test.mjs` keeps the two identical): thanks for
the work they put in, "not the right fit for this role at the moment", and
welcome to apply again. No reason is asked for or sent. (The private reason
went to `applications.employer_notes`, which no screen in the cockpit shows.)

- **Where**: the ⋯ on every row and phone card (Open profile, Select, Pass or
  Take back offer, Remove and block; Unblock on a blocked one), the profile's
  ⋯ beside the pager (the phone's More), and the bulk bar. Menus and dialogs
  are portalled to `<body>`.
- **Picking several**: on the table a checkbox sits over each avatar (on hover,
  and on every row once one is picked; shift-click picks a range) with "all on
  this page" in the header. On cards, **Select** beside the count starts a
  mode where a tap picks instead of opening. One bar at the foot: "N
  selected", Select all on this page, Clear, **Remove and block N**. Escape
  lets go. A pick lasts while its applicant is on this list, drawn or not: Show
  pushing a picked row past the 25 drawn does not drop it.
- **The confirm**: "Remove and block <name>? They won't be emailed. They
  leave your list, along with any other open application of theirs to your
  jobs, and they can't apply again with this account or email. If someone
  applies with the same phone, I'll flag them. You can undo this in Blocked."
  with an optional reason only the team sees.
- **The list**: a blocked person's application that the block closed is on
  the **Blocked** tab only (last, shown only when someone is blocked), off
  All, off every other tab, off every count and the header's "N applied". One
  the block deliberately left open (an interview, offer or hire on another
  job, or a job the person who blocked them cannot decide on) stays on its own
  tab with the Blocked chip, and its ⋯ offers Unblock: the list never hides
  what is still live. A block or an unblock shows at once: a move onto or off
  Blocked never waits in the update bar (`followsLive`), and the clicked rows
  read as rejected on the click (the staff hook patches the cached rows; the
  live sync then merges the server's own).
- **A phone is flagged, never refused**: anyone on the list whose form phone
  (their answers, or the form's draft while they are on it) is a blocked
  person's (the block's phone, or one on their own rows; the last 10 digits
  agree, made-up numbers like 1234567890 ignored) carries a "Blocked phone"
  chip naming who. The ⋯ menu's Remove and block is one tap away.
- **Unblock** lets them apply again. Their application **stays declined**,
  and the dialog, the toast and the Blocked tab all say so.
- **The candidate** is told nothing: no email (blocking never goes through
  `useUpdateApplication`, whose status write is what sends the rejection
  email), no bell and no push (`notify_application_status_change` skips while
  `block_applicant` runs); a form they were filling in closes as "blocked",
  not "submitted". A new application to this employer from the same account
  or the same email (Gmail's dots, googlemail.com and any +tag ignored) is
  refused with "We can't take an application from this account.", which the
  job page shows as it is. A phone never refuses: it is typed by the
  applicant and unchecked, and a shared or mistyped number would turn a real
  person away.

The database half is `supabase/migrations/20261007022249_block_applicants.sql`
(`blocked_applicants`, read-only to staff and written only by
`block_applicant(s)` and `unblock_applicant`; the
`applications_refuse_blocked` guard). Applying it takes one lock on
`applications`, the trigger's creation, as its last statement, under a
3-second `lock_timeout`; a re-run takes none. The client half is
`lib/blockedApplicants.ts`, `hooks/useApplicantBlocks.ts`,
`components/ApplicantRowMenu.tsx` and `components/ApplicantBulkBar.tsx`.
Proof: `scripts/block_applicants.pglite.test.mjs` (who may call, nobody
writing the table directly, the guard by id and by email with Gmail aliases,
a phone never refused, the phone taken from another of their applications,
an unrelated employer untouched, unblock, no bell, no push, the form closed
as blocked, no email path, the locks the migration takes) and section B of
`scripts/applicant_list.test.mjs` (the closed are off every tab and count and
leave a held list at once, an interview the block left open stays, the phone
flag).

## 7. Shortlist (2026-10-07)

The owner, on his first live hiring day, 62 applicants in: *"I need you to
also add a feature where I can add them as favorites. Maybe do a short list
for this particular job. Not favorite, but short list, I guess."*

A shortlist entry is a private mark on one application, so on one job. It
decides nothing and tells the applicant nothing: no status change, no email,
no bell, and they cannot read it.

- **Adding and taking off** is one click, with no confirm: "Add to shortlist"
  / "Take off shortlist" in a row's ⋯ menu; "Add to shortlist" on the bar that
  appears when several are picked ("Take off shortlist" on the Shortlist tab);
  and a button on the profile's top line beside the pager, which reads "On
  your shortlist" once they are (on a phone, the bookmark alone, in the
  header). Taking someone off shows a toast with **Undo**.
- **On the list** a marked row carries a small brass bookmark beside the name
  (table row and phone card; "On your shortlist" to a screen reader). The
  **Shortlist** tab, second after All, gathers them, with a count. It follows
  the job in view like every other count, which is what makes it "for this
  particular job": with one job chosen it is that job's shortlist.
- **Who can be on it**: anyone still in the running (`canShortlist`). Not
  someone declined, and not someone blocked: the menu item and the profile's
  button are not offered, and a mark made earlier stops showing. So passing
  on someone takes them off the shortlist, with nothing to clean up. (The row
  in the database stays; nothing reads it for a declined application.)
- **The held list** (section 1): marking someone moves no row. His own click
  is settled first, so taking someone off while on the Shortlist tab removes
  that row at once and Undo puts it back where it was; a teammate's change
  waits in the update bar like any other. The Shortlist count is never held:
  it is always who is marked now.
- **Teammates**: the job's owner and its active team members all see the same
  shortlist; a team member limited to some jobs sees those jobs' only. Adding
  and taking off needs the right to manage the job's pipeline (the people who
  may decide on the applicant). A mark writes nothing to the application, so
  no realtime event comes for it: an open page picks up a teammate's change
  within a minute (the query's own clock), on refocus, or when opened.

**"Shortlist" means one thing now.** Until this, the staff screens used the
word for the pipeline stage `reviewing`, which every applicant reaches by
sending the form: the Jobs page said "Applied → shortlist 65%" with 40 of 62
people in it on day one, and the advance button for someone still on the form
said "Move to Shortlist" (and told the applicant they had moved on). Those
now read "Applied → in review", "In review" on the dashboard's funnel, and
"Move to Review" / "Move Maria into review?". The internal keys
(`stats.shortlist`, the `"Shortlist"` candidate stage in `mappers.ts`) are
unchanged; only the words on screen moved.

The database half is `supabase/migrations/*_shortlisted_applications.sql`:
`shortlisted_applications` (one row per marked application, with its job;
RLS: the job's owner and active team read, nobody else, and nobody writes it
directly) and `set_applications_shortlisted(ids, on)` (SECURITY DEFINER; the
job's owner or a pipeline team member; up to 200 at a time; anything the
caller may not decide on comes back under `skipped`). It is a table of its
own, not a column on `applications`, because an applicant can read their own
application row. Applying it takes two locks on existing tables, the foreign
keys to `applications` and `jobs`, as its last statements, under a 3-second
`lock_timeout`; a re-run takes none. The client half is `lib/shortlist.ts`,
`hooks/useShortlist.ts`, `components/ApplicantRowMenu.tsx`,
`components/ApplicantBulkBar.tsx`, `components/ApplicantRow.tsx` and the
profile's top line in `pages/CandidateDetail.tsx`. Proof:
`scripts/shortlist.pglite.test.mjs` (who may change it, the job taken from
the application, nobody writing the table directly, who can read it and that
the applicant cannot, per job, the cascade, the locks) and
`scripts/shortlist.test.mjs` (who can be on it, the tab and its counts per
job, the held list, the words, the one meaning, the wiring).

## 8. Pass on several at once (2026-10-07)

The owner, with 105 applicants in and "Score Under 50" picked: "you added
remove and block at the shortlist, but you didn't give me the option to pass
on all of them. So I need to do a bulk pass. And make these smaller buttons."

The bar that shows when applicants are picked now reads **Shortlist, Pass N,
Remove and block N**, a size down from the page's own buttons (32px, 12.5px;
three across in one row on a phone, where Remove and block reads "Block N").

**What a bulk Pass is.** The single Pass, once per person: the application is
declined in the owner's name and the applicant gets the same polite note
(`src/lib/declineNote.ts`). Nobody is blocked; they can apply again. It is not
a quieter Remove and block.

**Who it reaches** (`src/cockpit/lib/bulkPass.ts`, `bulkPassPlan`): everyone
picked who is still being decided on (`in_progress`, `pending`, `reviewing`,
`interview`). Not someone already declined or hired, not someone on the
Blocked tab, and not someone holding an offer: an offer is taken back on
purpose, one person at a time. With one person picked it is the ordinary Pass
dialog, word for word.

**One confirm**, because every one of them is told by email: the number, how
many of them have not finished the tests yet (passing closes those
applications), how many picked are left as they are, and the note itself.

**How it is sent** (`src/cockpit/hooks/useBulkPass.ts`): one person at a time,
in order. The application is declined, then the note is emailed and waited
for, then the next. So everyone handled so far is fully handled, the notes
leave at a pace the mail service accepts, and the outcome can say truthfully
how many were emailed. It does not go through `useUpdateApplication`, whose
email is sent without waiting (two dozen would leave in one burst). It writes
the single Pass's own fields (`passUpdate`) and only where the status is still
one a Pass may change, so someone who moved to an offer or a hire since they
were picked is left alone and counted as "had already moved on". After three
failures in a row it stops and says so. The confirm button counts while it
runs ("Passing 7 of 25…").

The email itself is the `status_rejected` kind, which only the job's owner or
a team member who may manage the pipeline can set off
(docs/NOTIFICATION-EMAILS.md).

Proof: `scripts/bulk_pass.test.mjs`, and a walk-through in the dev preview
(fifteen picked: twelve passed and each sent the note, three left as they
were, the Declined tab's count moved by twelve).
