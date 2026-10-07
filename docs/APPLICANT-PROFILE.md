# The applicant profile on a desktop: use the whole screen

Approved by the owner on 2026-10-06 ("yes") from `docs/mockups/applicant-profile-desktop-1440.png`,
`-1280.png` and the HTML they were drawn from. His complaint about the old page on a desktop: *"a lot of
space on the side that's being wasted and there's a lot of container feeling and everything is in the
middle looks bad."* The mockup is the target: match its structure, wording and states with the cockpit's
own tokens (NIGHT and DAY). The PHONE layout does not change.

## Layout, from 1200px of content width up

1. **Top line**: Back to applicants (with the list's tab in words, e.g. "· Needs review"), and the pager
   "3 of 64 ‹ ›" on the right (the existing one). After the pager: the **shortlist** button ("Add to
   shortlist", or "On your shortlist" with a filled brass bookmark once they are; one click, no confirm,
   and the applicant is not told: docs/APPLICANTS-LIST.md §7) and the ⋯ menu. The button is not there for
   someone declined or blocked. On a phone it is the bookmark alone, at the end of the sticky header.
2. **Header band, no box**: avatar (live dot when active), name, the status chip, then one meta line:
   job title, country, applied when, and the live line ("Finished every test 40 min ago", "Escalated chat
   practice: away from the test for under a minute"). On the right: "Ava suggests" (the recommendation in
   words, jade when interview/advance, amber when review, crit when decline) and the big score with
   "final score", "so far" or "not scored yet" under it. A hairline under the band.
3. **The journey across the full width**, open (no card): the existing rail with each result under its
   step; dot states as on the list (done, below the bar, on it now, skipped, not reached).
4. **Body: two columns.** Main column (fluid) and a right column `clamp(300px, 26vw, 380px)` that stays
   on screen while the main column scrolls (sticky).
   - **Main**, sections separated by hairlines, not boxes:
     - **Ava's read**: the seal, the summary, then **Why up** and **Why down** side by side (from the
       scorecard's facts), then "What I flagged" (the existing flags list, collapsed after 4).
     - **Tests**: one tile per record entry (skills check, connection, typing if the job has it,
       escalated chat with its typing line, interview, application, and any other step), in a grid
       `repeat(auto-fill, minmax(270px, 1fr))` (3 across on a wide screen, 2 on a laptop). A tile: icon +
       name, "Open ›" (opens the existing record sheet for that step), the headline number, the verdict
       line in its tone, and up to two detail rows. Not-taken and in-progress tiles say so.
     - **In their words**: the two long answers that matter most for the job (for a lead: the team
       they led, and the sudden change; otherwise the first two long answers), quoted, and
       "All N answers ›" (opens the application's record sheet).
     - Everything else the current profile shows that is not listed here (the interview-moment card,
       video, documents, resume, notes, voice interview, anything): it stays, as its own section in the
       main column, in the same open style.
   - **Right**:
     - **Your decision**: one filled card. The primary action for this applicant's state (the existing
       logic: Move to interview / Hire / etc.), then Set up interview and Message side by side, then Pass
       as a quiet text button in the danger tone. Every existing action and dialog keeps working (Let them
       take the next test, decline/hire confirmations, the scheduling wizard).
     - **At a glance**: the job's quick-pick (select / multi-select) answers as label → value rows
       (years in support, leading a team, largest team, works the queue, shifts, hours, can start,
       English, …) with any flagged answer in amber, then phone and email each with Copy (never a tel:
       link).
     - **Integrity**: the count and the plain-words detail (the existing integrity summary).
     - **Timeline**: the existing timeline.

## Under 1200px

Tablet (768-1199): the same sections in ONE full-width column (no narrow centred column), the decision
card after the header; the existing sticky action bar at the bottom stays. Phone (under 768): unchanged.

## Must not regress

Every link, action, dialog and live update the profile has today. `/applicants/:id` unchanged. The
team member's shell (AppSidebar/AppHeader) renders it too. No new colours; no translucent panels.

## As built (2026-10-06)

- Widths: the PAGE's own width decides, not the window's (the team member's shell has a 256px sidebar, the
  cockpit's 216px, so one window leaves each a different page). Under 768px of window (`useIsMobile`) the
  phone layout, untouched (pixel-compared against the previous build). From 900px of page (a 1200 window in
  the cockpit, 1220 in the team member's shell; `DESKTOP_PAGE` in CandidateDetail, measured with a
  ResizeObserver before the first paint) the two columns; between them the one full-width column. The page
  marks which with `data-profile-layout`, and the header splits its suggestion and score onto their own line
  under 820px of page (`data-ckp-head="split"`). The wide rail is drawn only where every step has 88px of
  page; narrower (the team member's shell at a tablet's width), the phone's rail, so no word is ever split.
- The cockpit caps this one route at 1680px (every other page keeps 1240), so a 1920 screen is used as the
  team member's shell (no cap) uses it. The right column is `clamp(316px, 32%, 440px)` of the body: the
  approved 375px on a 1440 laptop, 440px on a 1920 screen, and room for Set up interview and Message side
  by side on one line. The tiles fill at most three across.
- Parts: `ApplicantHeaderBand`, `ApplicantDecisionCard` (the page's own action objects, so the card, the
  phone's bar and the column's sticky bar can never do different things), `ApplicantTestTiles`,
  `ApplicantInTheirWords`, `ApplicantAtAGlance`, `ApplicantIntegrityPanel`, `ProfileSection`; `AvasRead`
  has an `open` variant; `ApplicantTimeline` a `list` layout; the rail a `wide` one. The rules are pure and
  tested in `src/cockpit/lib/applicantProfile.ts` (`testTiles`, `atAGlance`, `contactFacts`,
  `inTheirWords`, `avaSuggests`, `headerLine`, `scorecardWhy`).
- "Why up / Why down" read `ai_scorecard.whyUp` / `whyDown`; a scorecard written before they existed shows
  neither. The header's live line and country come from the list's own row (`listRowFor`), so they say what
  the row said. Back names the list's tab only when the pager came from that list (`applicantList.tab.v1`).
- Back to applicants and the pager stay on screen in the column and desktop layouts too (a sticky top line,
  as the phone has always had; solid ground once the page scrolls under it, nothing at rest).
- The right column: when all of it fits between that top line and the foot of the screen it stays there
  whole (`data-fit="whole"`). When it does not, only the decision card stays (`data-fit="card"`), and At a
  glance, Integrity and the Timeline scroll with the page: nothing sits in a scroll box of its own or is cut
  at the end of the page.
- The column layout's decision card is the one set of buttons on screen: the bar at the foot shows the
  card's own buttons, in the card's words ("Move to interview", "Pass on Nadia"), only once the card has
  scrolled away. A decided applicant's card says "Not moving forward" / "Hired" as a status line, not as a
  box shaped like a button.
- Tests: a tile's details sit at its foot so neighbours line up; the tests not taken are one quiet line under
  the tiles in the rail's words ("Skipped: …", "Not reached yet: …"), not a dashed box each. A test being
  taken shows its flags. The skills check names its must-pass area once ("Missed: Accounts, Security" and
  "Money rules: Missed"). The written interview keeps its length ("Questions 4 in 6:10"). The Application
  tile counts an answer saved before question ids were kept by the question's words, says "Cover letter"
  beside its verdict, and shows a quick pick in a row only when the pick has a short label or is flagged
  (At a glance beside it has them all).
- At a glance stacks a row whose label is a whole question (over 28 characters) or that has more than one
  pick: the label on its own line, the answers under it, so neither breaks mid-phrase.
- The wide rail's Decision says "Waiting on you" (the mockup's words; the card beside it names the actions).
  The phone's rail is unchanged, except that the Declined/Hired pill's ink is now each theme's button ink
  (`--btn-fg`), 4.6:1 on Day's brass where the old fixed ink was 3.4:1.
- At a glance labels: a question's own `label` when the job gives one, else its words up to the question
  mark (never rewritten, so a label cannot misstate the question). The job editor has no label field yet,
  so the live lead job's rows read as its questions until one is added.
- Dev preview: `/applicants/30000000-0000-4000-8000-000000000026` (Nadia, finished, Why up/down),
  `…028` (Kwame, a flagged "20 to 30" hours answer), `…015` (Sam, mid-test), `…027` (Luis, not scored yet),
  `…025` (Ayesha, declined), each with `?__preview=1&__previewRole=employer&__previewScenario=zulu`.

## How the journey rail moves (2026-10-07)

The owner, on the rail at the top of the profile: "make this animation a little bit more smoother and
less annoying and distracting". Approved from a side-by-side of the old motion and this one
("animations go ahead, build it"); he chose the initials riding the line and no pulsing.

What the old walk did, recorded frame by frame on a profile (headless Chromium, fixture data, 1440px):
the initials leaned 11° for a quarter of a second before moving, lunged toward the next gem, **jumped
188px in one frame** when a two-line result appeared under a gem (the result made the band taller, the
rail's own resize observer re-applied the traveller's place with no transition, and that cancelled the
glide in flight), stood still for 230 ms, lunged again, overshot the last gem by 8px and crept back:
1.85 s to rest. Results popping in one by one pushed the page below down by 18 to 25px. Then it never
rested: the line's colours slid for as long as the page was open and snapped from gold back to green
every 8 s (the loop did not join up), and the current gem's halo pulsed. The page is rebuilt for every
person, so the pager replayed all of it each time, and Ava's seal stamped on every open.

Now (`GemRail motion="calm"`, `ck-rail-calm` in cockpit.css, timings in `src/cockpit/lib/gemRail.ts`):

- **The gems always show the record**, from the first frame: labels and results are in place, so no
  text moves and nothing below shifts.
- **Opening a profile is one glide**: the line draws from the first gem to where they are, each gem
  inks as the line reaches it (its delay is the inverse of the glide's easing, not a clock of its own),
  the initials ride the line's end, and one soft ring marks where they land. `cubic-bezier(0.4, 0, 0.2,
  1)`, 140 ms after the page turns, 660 ms to 1.2 s by distance. No lean, no overshoot.
- **Then it is still.** The line is whole and in fixed colours, jade at the first gem and gold at the
  decision, so the colour under the initials says how far along they are. No sliding, no pulsing.
- **The pager turns to a rail already in place** (`entrance="none"`). The pager's navigation carries
  `PAGER_MOVE` in its state, because the cockpit's shell remounts the whole page for every person and
  nothing kept in memory survives the move. A profile opened from the list or a link draws itself.
- **A step they finish while the page is open** is one more glide, the ring arriving with them.
- **A decision made while the page is open** presses the verdict pill in, once. The seal itself no
  longer stamps on open: the initials stand on it by then.
- **Travel is transforms only** (a window that slides, the line counter-sliding inside it), so the line
  and the initials stay locked together while the page is still loading. The opening is CSS started by
  one attribute (`data-entrance`) and removed when it has played; no state walks, so nothing can be left
  half-walked.
- **The resize observer acts only when a gem actually moved** (`measure()` says so). That is the fix
  for the jump, and it applies to the walk too.
- Reduced motion: the rail is simply in place.

The create-job flow and the careers page keep the walk (`motion` defaults to "walk"): the owner approved
this for the profile. Test: `scripts/journey_rail_motion.test.mjs`.
