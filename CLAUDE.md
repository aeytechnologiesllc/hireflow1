# HireFlow - Project Reference

> **Current work: [`docs/LAUNCH-PLAN.md`](docs/LAUNCH-PLAN.md).** Seven
> phases toward the customer-service-hiring launch, with the owner's rules
> for how each phase is done (build → verify → re-check → lock down → ship,
> autonomously, until a re-check finds nothing). Read its Rules, Known facts
> and Progress log before starting anything, then continue the first phase
> that is not closed.
> **The 2026-10-25 session stopped mid-loop** (weekly credits): its top
> Progress-log entry ("HANDOFF") lists the work in flight (two agent
> worktrees and three reviews) and how to pick each up. Start there.

> ⚠️ The project ref below is load-bearing. It was previously wrong here
> (`kcotpxlggfvgclwksmhl`), and that wrong value was copied into a database
> trigger, silently breaking every push notification. Verify before changing.

## Hosting & Infrastructure

| Service | Details |
|---------|---------|
| **Frontend Hosting** | Vercel |
| **Live URL** | https://hireflownow.com |
| **Vercel Project** | aeytechnologiesllc-8936s-projects/hireflow1 |
| **GitHub Repo** | https://github.com/aeytechnologiesllc/hireflow1 |
| **Branch** | main |

## Supabase

| Item | Value |
|------|-------|
| **Project ID** | yqklrkpptnhubsnijqze |
| **Project URL** | https://yqklrkpptnhubsnijqze.supabase.co |
| **Dashboard** | https://supabase.com/dashboard/project/yqklrkpptnhubsnijqze |
| **Edge Functions** | https://supabase.com/dashboard/project/yqklrkpptnhubsnijqze/functions |
| **Database Migrations** | see supabase/migrations (all applied) |
| **Edge Functions Deployed** | see supabase/functions |

## Auth Providers

| Provider | Status |
|----------|--------|
| **Email/Password** | Enabled (Supabase Auth) |
| **Google OAuth** | **Disabled** at Supabase (`external_google_enabled=false`, checked 2026-09-04). The UI hides every Google button behind `VITE_GOOGLE_AUTH_ENABLED`. To turn it on: add the Google client ID + secret under Authentication → Providers → Google in the Supabase dashboard, then set the Vercel flag. |

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS + shadcn/ui
- **Backend:** Supabase (PostgreSQL + Edge Functions + Auth + Storage)
- **Payments:** Stripe (not yet configured on new project)
- **Voice/AI:** ElevenLabs TTS, OpenAI (via Edge Functions)

## Environment Variables (Vercel Production)

- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_GOOGLE_CLIENT_ID`

## Branding / App Icon

The app icon is **the logo's own mark**: the brass rising line `#E0B96A` on the ink tile `#14120E`, the same mark as `Wordmark.tsx` and the front page's bar (recoloured 2026-10-25 when the owner locked the colours; it was the jade line on a dark jade tile, chosen 2026-10-11).

**The colours are locked (owner, 2026-10-25): ink and ivory with a brass accent.** No green anywhere. The front page stays dark; the app follows the device (Day: ink on ivory; Night: ivory on ink). The action colour is `--action` (ink by day, ivory at night; it was `--jade`); brass is Ava's verdict, the score and anything that costs money, never a plain button. Guards `no-jade-tokens-left` (which also reads the edge functions' emails, the signing certificate and the improvement report, since 2026-10-25) and `brass-only-for-ava-score-money` hold it. Every size is made by `node scripts/make-app-icons.mjs`; docs in [`BRANDING.md`](BRANDING.md). **Do NOT revive the old dark-tile orb icon** (removed 2026-06-30) — see the "DO NOT REVIVE" section in BRANDING.md. Direction 5 (brass flow) is kept as a backup at `branding/backup-icon-flow.png`.

## The October 2026 hiring run was the owner's own (noted 2026-10-24)

The spike in the live data (about 1,400 page views on 2026-10-07; 154 of the
155 applications between 2026-10-05 and 2026-10-10; 2 hires) was the owner
hiring a real support team lead for their own business through a Philippines
job board. It went very well. The app was being built and fixed live during
that run, so that period's data (accounts confirmed instantly, no
confirmation emails) shows the settings of the time, not today's: check live
settings directly. The quiet since is not lost traction; no outside business
has been invited yet. The landing's "153 applied, 71 finished, 3 worth a
call" are from this run.

## Positioning (owner, 2026-10-24)

HireFlow's niche is **hiring customer service agents, chat and phone, for any
kind of business** (the owner's example: a doctor's office). Ava should build
the tests to fit the business and the channel. Not a sweepstakes pitch, and
not main-street roles like barista or cashier. The owner doesn't want the
green look; blue doesn't feel right to them either.

## Distribution & billing state (updated 2026-09-16, first set 2026-09-04)

- **Free tier is fully open** while Stripe is off: trials never expire, no job or applicant caps, voice is off for every business but the platform's own account (2026-10-11; get-subscription still reports a 120-minute grant, unused) (migration `20260904110000_free_tier_open`, further relaxed by the recovered `20260627131622_relax_job_limit_billing_deferred`). Nothing may sit behind a paywall or show a price as due while billing is off. Re-gate when the pay-per-job model ships.
- **Google Indexing API / IndexNow were removed on 2026-10-05** (87f7628, "Google Jobs is removed"): nothing fires on publish/close any more. The job feeds (`jobs.xml`, `adzuna.xml`, `jooble.xml`) only list a job that has a country (`api/job-feed.mjs`), so Zulu's worldwide-remote job (no country) is in none of them (checked 2026-10-11). The sitemap is served by `api/sitemap.mjs` (proxying the `sitemap` edge function) so it goes out as XML.
- **Email is on**: `RESEND_API_KEY` has been set since 2026-10-04 (checked with `supabase secrets list` on 2026-10-21), so `send-notification-email` sends from `notifications@hireflownow.com` / `no-reply@hireflownow.com`; the owner confirmed staff receive emails. An older line here said it was unset, and a session repeated it to the owner as a launch blocker. Supabase Auth's own emails (password reset, magic link) go through Resend SMTP too (`smtp.resend.com`, from `hiring@hireflownow.com`); their sender name was "Zulu Support Team" for every business and applicant until the owner had it changed to **"HireFlow"** on 2026-10-24. Email confirmation is off (`mailer_autoconfirm: true`).
- **Models**: all OpenAI calls run on `gpt-5.6-luna` (cheap) / `gpt-5.6-terra` (scoring), voice on `gpt-realtime-2.1` + `gpt-live-transcribe`. GPT-5 models reject non-default `temperature`; the shared helpers strip it. See `docs/MODEL-DEADLINES.md`.
- **Stripe**: no key is set and no checkout exists: the old checkout/webhook functions were deleted from Supabase on 2026-10-11. Billing is built new (pricing v9: free first job, $99/job, $299/mo), with the owner's account exempt through `platform_admins`, never `home_alias`. The owner adds the Stripe keys himself, last.

## Security posture (as of 2026-09-16)

Live safety work already shipped — do not weaken any of it without a specific
reason and a re-verification pass: step gate on the candidate flow; input
sanitizers; private storage (`resumes`, `videos`, `portfolios`, `interviews` —
none are public buckets any more); quiz server-side grading plus
`protect_application_columns`/`protect_document_columns` triggers that block a
client from forging scored or signed columns; team invitation RPCs; forgery
lockdown on public-facing insert/update policies; in-app + push notification
triggers; document signing with a hash chain and audit log (`document-signing`
function, `protect_document_columns` trigger — this one is unconditional, not
gated by a flag); RPC caller checks (`has_role`, subscription/limit lookups,
`is_job_owner`, `is_active_team_member_for_job`) that only ever answer about
the calling user; `voice_session_log`-based voice-minute charging; and access
scoping on the performance report and dossier views.

**Phase 1 of docs/LAUNCH-PLAN.md (live 2026-10-25).** Do not weaken any of
these either; each has a guard or a test that CI runs:
- Stored links open only in-app paths or http(s) addresses: `src/lib/safeLink.ts`
  at every href / `<Link to>` / `window.open` / iframe src fed by data, the
  same rule in the database (`20261025010000_safe_links.sql`), guard
  `stored-links-are-filtered`. Redirect params use `inAppPath` too.
- A Content-Security-Policy, **report-only** for now (`scripts/csp.mjs` writes
  it into `vercel.json`; reports land in `client_error_events` with release
  `csp`). Enforce with `node scripts/csp.mjs --write --enforce` once real
  traffic reports nothing that should be allowed. Editing an inline script in
  `index.html` or `public/landing.html` needs `node scripts/csp.mjs --write`.
- trigger-ava-analysis: `force` is the hiring team's only; an applicant's
  reply is the move only; applicant text is fenced in scoring prompts.
- Practice turns (chat, interview, sales) only for a signed-in applicant's own
  application; job-writing AI needs sign-in; rate limits count by
  CF-Connecting-IP; every OpenAI call takes from a daily ceiling
  (`app_settings.ai_daily_call_cap`, 10,000; usage in `private.ai_daily_usage`).
- Applicants cannot write `phase_ai_analysis`, `employer_notes`, the
  source columns or the voice transcript, and may set the recording link only
  to their own upload in this project's storage
  (`20261025090000_protect_voice_evidence.sql`, `20261025110000_voice_recording_this_project.sql`); an
  applicant's reply from trigger-ava-analysis never carries the team's
  message or a "recommend decline"; notification emails go to the sign-in account's address;
  `profiles.email` is read-only to the API.
- New passwords need 8 characters (sign-in still accepts older shorter ones);
  deleting an account asks for the password; the platform admin can turn on
  an authenticator app in Settings, after which admin tools need the code.
- Everything reachable without sign-in is listed in docs/BACKEND-SCHEMA.md
  ("Reachable without sign-in"), guarded by `public-functions-allow-list`.
- (Phase 7, task 6; live since 2026-10-25, migration
  `application_evaluations` 20261025101542, the 109 scored applications moved
  with an exact fingerprint match.) The hiring team's evaluation (`ai_score`,
  `ai_analysis`, `ai_scorecard`, `phase_ai_analysis`, `employer_notes`)
  lives in `application_evaluations`, which the applicant cannot read;
  writers keep writing `applications`, and `zz_applications_evaluation_*`
  triggers (after the protect triggers) move each value and leave the row
  NULL (`20261025235000_application_evaluations.sql`). Read it from
  `applications_staff_list` or an `application_evaluations(...)` embed with
  `withEvaluation`; guard `staff-evaluation-columns`, proof
  `scripts/application_evaluations.pglite.test.mjs`. Ava's scorecard is not
  in `notes` (`notes.avaScorecard` moved into `ai_scorecard`), and the
  applicant's voice interview and improvement report never carry the score
  or report.

**Phase 2 of docs/LAUNCH-PLAN.md (2026-10-25).** Guards in
`scripts/guards/phase-2-launch-locks.mjs`:
- "player" is the owner's own gaming customers. It is a property of the
  business (`business_pages.home_alias`, `_shared/homeBusiness.ts` →
  `_shared/counterpart.ts`), never guessed from a job's text; every other
  business, and not knowing, reads "customer" (a customer-service job built
  from Phase 4's gaming pack says "player" too: docs/CUSTOMER-SERVICE-HIRING.md). Same for the team-lead
  interview script (`interviewPlanFor`: the owner's only when
  `homeBusiness === true`). Guard `no-player-wording-outside-home-business`.
- A business confirms its sign-in email with a 6-digit code before its first
  job goes live (`20261025100000_business_email_check.sql`, trigger
  `jobs_publish_needs_email_check`, HINT `email_not_verified`; the code is
  `send-notification-email`'s `business_email_code` kind, to the signed-in
  caller only). Applicants are never asked. A Google sign-in passes while its
  Google address is still the sign-in address; platform admins pass. The
  stamp is for an address and lapses when the sign-in address changes. Guard `publish-requires-verified-email`.
- The front page counts visits and carries campaign tags to sign-up; a new
  account keeps `signup_source`; Admin → Growth reads `admin_growth()`.
  Guards `landing-has-beacon`, `signup-carries-utm`. Since the sixth growth
  review (docs/ANALYTICS.md, "How a visit is counted"): applicants' accounts
  carry a source too (Apply carries the job page's tags); a hiring link
  counts once, by its `hiring_link=1` mark, never by its medium; a move
  inside the site names HireFlow's own host and no tags; the short ways in
  match any capitals; "google" is search only. Since the ninth: "the front
  page already counted this visitor" is a fact carried as `seen=1`
  (beacon.js's `__hfBeacon.counted` → carry-source.js → the guides →
  `withVisitorTags`), never guessed from the referrer, never on a sign-up
  link; a hiring link that is no way in takes back only the visitor's own
  tags. Guards
  `hiring-link-counts-once`, `accounts-carry-their-channel`,
  `growth-google-is-search`, `short-ways-any-capitals`.

**Phase 5 of docs/LAUNCH-PLAN.md (2026-10-25).** Guards in
`scripts/guards/phase-5-launch-locks.mjs`:
- Every OpenAI call names its business (`business:`), and takes from that
  business's daily AI budget (`ai_business_daily_call_cap`, 2,000) as well as
  the platform's; HireFlow's own business counts against its own day
  (6,000; Phase 7 below); the owner is told in the
  app at 80%/100% and when a business hits its cap. A cost guard, never a
  paywall. Guard `ai-budget-enforced`.
- The legal pages name **Southern Digital Technologies LLC**; the contact
  email and governing-law state are still owner inputs. Both sign-ups, the
  team-member sign-up (`JoinTeam.tsx`, the same agreement as the business's,
  since the eleventh Phase 5 review) and the application form link the
  Privacy Policy. Guards
  `legal-pages-name-entity-and-contact`, `applicant-signup-shows-privacy-notice`.
- "Delete their information" (⋯ menu) deletes one application and its files
  through `remove-applicant` → `remove_applicant` (service role only, logged).
  It is a business's only way: the two old browser delete policies on
  `applications` are dropped (`20261025550000`; only the applicant's own
  withdrawal is left; a deleted job's cascade is unaffected), and nobody but
  the server changes an application's job (`applications_stay_on_their_job`,
  `application_job_fixed`, `20261025570000`): moving one to a throwaway job
  and deleting that job was a way round it (the eighth security review).
  A document's files are found by its id only (`documents/<id>/`), never by
  its file address (a business writes that; the first version would have
  deleted another business's signed copy); a teammate only on jobs they are
  assigned to; files storage refuses are queued in `storage_file_trash` and
  retried hourly by `document-cleanup`. Guard `applicant-data-can-be-removed`.
- (The eleventh Phase 5 review, `20261025540000`.) A deleted application
  queues only what storage holds for it (`private.storage_holds`; NULL,
  "cannot say", queues as before): its recordings, video introduction and
  work samples, and the resume and form files it lists (never one another
  application of theirs or their profile lists). A browser starts at most 10
  applications an hour with one business and 20 in all
  (`applications_start_limit`, `client_send_allowed('application', …)`,
  `too_many_applications`): one account looping "start, withdraw" had buried
  every real removal. document-cleanup tells the admins once a day when the
  queue backs up (`cleanup:backlog`: a run's worth of folders or of exact
  paths still waiting, or one over three hours). A deleted request whose
  photo went up without its link saved still queues its folder.
- (The eighth security review, `20261025560000`, `20261025570000`.) One
  account's uploads hold up only its own removals: each queue row names its
  applicant (`storage_file_trash.candidate_id`); document-cleanup reads the
  queue only through `storage_file_trash_fair_pick` (service role only), in
  rounds, a few from each person a run (6 folders, 40 exact paths), the people
  with the fewest waiting first, up to 200 folders and 1,000 exact paths a
  run, and clears exact paths in one `remove()` a bucket (a refused batch is
  tried one path at a time; three refused in a row stops it). A deleted
  application queues at most 200 exact paths a day for one applicant
  (`check_rate_limit('file-queue-paths', …, 200, 86400)`; the three folders
  always). The start limit's "10 with one business" was 10 with one job (an
  applicant cannot read the jobs row before applying); it reads the business
  from `published_jobs_public` now. A deleted document queues its kept copies
  (`documents/<id>/`, `documents_queue_files`, AFTER DELETE, SECURITY
  DEFINER) however the row goes. Guards `file-queue-fair-and-bounded`,
  `applications-stay-on-their-job`; launch_locks_behaviour sections 1, 9, 11,
  13 and 14, `scripts/document_cleanup.test.mjs`.
- (The ninth security review, `20261025580000`.) Many throwaway accounts hold
  up nobody's removal for good. The pick puts every note never tried before
  any that failed, then each person's oldest note, oldest first across
  people, then everyone's next notes, the people with the fewest waiting
  first (caps unchanged; the tenth review changed the first two, below).
  By the fewest waiting alone, a thousand accounts'
  `<uid>/.` notes, refused every hour, held the front of every exact-path
  run, and 200 accounts with one note each an hour kept a three-folder
  withdrawal out of every folder run. The trigger queues no `.` part (the
  `isPlainObjectPath` rule) and an exact path only where storage holds that
  exact name (`private.storage_holds(…, p_exact => true)`; as a prefix,
  `<uid>/.` was "there" because `<uid>/.x` was); document-cleanup drops a
  note that is not a plain path (logged once) instead of retrying it. A
  document's files by its id only now has a proof for documents_queue_files
  too (section 13: an address naming another business's upload). Guards
  `file-queue-fair-and-bounded`, `applicant-data-can-be-removed`;
  launch_locks_behaviour sections 13 and 15, `scripts/document_cleanup.test.mjs`.
- (The tenth security review, `20261025590000`.) People take turns in the
  removal queue. Ranked by each note's age, 200 accounts' one-hour burst
  (10 applications an hour each on the one live job, 30 folders) queued
  before a real withdrawal kept a place ahead of it in every run: 31 runs
  for its first folder, 30 more for every further hour of burst, with no
  upkeep after it. Each run now records whom it took
  (`storage_file_trash_served`, one row for each person and kind of note,
  written by `storage_file_trash_fair_pick` itself in the same statement, so
  the pick is VOLATILE; service role only), and a person's first note is
  ranked by when they were last taken or it became due, whichever is later.
  A note that failed waits behind every note that is due for an hour a try
  (up to a day) and half an hour more, then takes its turn (behind every
  note never tried, a real one that failed once was never tried again while
  a flood went on). A person's record goes a day after their last turn, once
  they hold nothing in that queue (`prune_storage_file_trash_served`, daily,
  pg_cron); dropping it while they hold a note would rank them by its age
  again. The bursts (one hour, three, going on) now give a real withdrawal a
  folder in the second run and all three by the fourth. document-cleanup's
  backlog alert says how to tell one account from many (rows by
  `candidate_id`). Guard `file-queue-fair-and-bounded`; launch_locks_behaviour
  section 15, `scripts/document_cleanup.test.mjs`.
- (The eleventh security review, `20261025600000`.) A withdrawal goes
  together. One note a turn, a real withdrawal's later folders each waited
  behind every account that had joined the queue since its last turn, so a
  stream of new accounts made each wait longer than the one before: 200 new
  accounts an hour with 30 folders each, from an hour before it, took its
  folders in the 2nd, 5th and 11th runs (the 7th, 20th and 46th after six
  hours of it); 1,000 new accounts an hour with one folder each, in the 1st,
  6th and 31st. A person's turn is now all of their notes when they hold no
  more than one withdrawal's worth (3 folders, 6 exact paths), else their
  first note, and a turn is taken whole or not at all (a run that would end
  inside one ends up to 2 folders or 5 exact paths short, and the turn comes
  first in the next run; split, its last folders went behind everyone who
  had queued since). Both floods now take a real withdrawal all in one run,
  within two; 1,000 accounts with 6 folders each queued before it, in the
  6th (was the 6th, 11th and 16th). document-cleanup's backlog alert counts
  up to three folders from each person queued before a real withdrawal.
  Left until Turnstile is set up (an owner input): many accounts still delay
  a real removal, never keep it out. A withdrawal waits for everyone queued
  before it to have one turn, about a run for every 66 people (165 for exact
  paths) however many notes they hold, and never for an account that queues
  after it (1,000 new accounts an hour, one withdrawal each, from an hour
  before it: all three in the 15th run, where one note a turn took its first
  in the 6th and its third after the 80th). A person holding more than a
  withdrawal's worth (a Delete Account with two applications, or with
  signed papers) gives one note a turn until they are down to one, and each
  of those turns waits behind everyone who joined since, as before (six
  folders under 1,000 new accounts an hour: the 1st, 6th and 31st runs, the
  rest after the 80th). Guard `file-queue-fair-and-bounded`;
  launch_locks_behaviour section 15, `scripts/document_cleanup.test.mjs`.
- The way to reach the company is **Contact us** (an applicant's own Help
  thread at `/contact`, `20261025200000_help_for_applicants.sql`; `/help` is
  staff-only on the staff host) or Help (a hiring team); Messages reach the
  hiring business, so the legal pages never send a privacy request there.
- When a day's AI budget is reached, applicants are told to come back later
  today or tomorrow (`wait: "long"`, `aiUnavailableExtra`), never "a couple
  of minutes"; a refused step stays open (chat, interview, sales), and a
  refused portfolio analysis records no score. Practice turns are also capped
  at 200 per application per day, all practices together (the same calm
  answer); the rate-limit table keeps two days and is pruned hourly
  (`20261025210000`). A call the platform budget refuses gives the business
  its unit back (`20261025190000_ai_budget_count_only_taken.sql`).
- Job-writing AI (generate-flow, ai-generate-job-content,
  ai-generate-workflow) is for a hiring account only (`jobWritingBusiness`:
  a business owner, or a teammate allowed to create jobs), billed to its
  business, at most 40 calls an hour per account (all three together) and 15
  per connection for each; document AI (ai-generate-document,
  ai-analyze-document-fields) is for a business owner or a teammate who may
  send documents (`hiringBusiness`). Until a business confirms its sign-in
  email with the 6-digit code (`business_email_verified`), and while it has no
  job live, it gets 300 AI calls a day, not 2,000
  (`ai_new_business_daily_call_cap`, `20261025240000`, `20261025250000`): with
  email confirmation off and no Turnstile yet, any sign-up is a business; a
  job saved as closed is no test, a live job is (only a confirmed business can
  publish one, so changing the sign-in address later keeps the full day).

**Phase 7 security audit, round 1 (2026-10-25).** Guards in
`scripts/guards/phase-7-launch-locks.mjs`:
- Reports pause a business only from people it has been in touch with
  (`business_has_contacted`); three that merely applied leave it open and
  ring the admins once. Guard `reports-pause-needs-contact`.
- HireFlow's own jobs have their own AI day
  (`ai_platform_business_daily_call_cap`, 6,000 of the platform's 10,000;
  `20261025300000_ai_budget_own_jobs.sql`): they were uncounted, so one
  open job's applicants could take everyone's day. Guard
  `own-jobs-have-their-own-ai-day`.
- An applicant's AI steps are checked before anything is spent: the
  portfolio review needs the step open (`stepOpenForResult` in
  `_shared/trustedResults.ts`: not offered/hired/rejected, reached, not
  already handed in) and is limited to 6 an hour per account and 10 a day per
  application; Ava's scoring from an applicant's call, 20 an hour and 40 a
  day per application, fingerprinted on the stored phase; performance
  reports, 6 a day per application for the team and 6 for the applicant. On a manual-mode job an applicant's call
  is scoring only (no move, no preview). Guard
  `portfolio-review-checks-before-spending`; `scripts/ava_analysis_applicant_limits.test.mjs`.
- What a signed-in account writes into someone else's bell or inbox is
  bounded (`20261025310000_notification_and_message_limits.sql`): cards
  160/600 characters, in-app links only, an applicant's card never "system",
  30 an hour to one person and 300 in all (past that quietly not written);
  messages 10,000 characters, 120 an hour to one person and 600 in all
  (refused). The server's own notifications are untouched. Guard
  `client-notifications-and-messages-limited`.
- The sales practice is graded only on one of its step's own cases, with
  the applicant's words fenced; its turns are not recorded yet, so every
  sales grade says `transcriptSource: "browser"` and the scorer never
  trusts it (no live job has a sales step; Ava's builder never adds one).
  Guard `sales-grading-own-case`.
- ava-voice-session reads the resume only through `_shared/resume.ts`
  (the applicant's own file). Guard `voice-session-reads-only-own-resume`.
- (Round 2.) A document a browser inserts starts pending and unsigned with
  a database-made code (`20261025340000_documents_start_unsigned.sql`); the
  countersign reads the sender's own upload from the documents bucket and
  refuses one that does not hash to v1 (`_shared/ownDocumentFile.ts`); the
  signing view frames only such a file; /verify says verified only for a
  document signed by both and finalized. complete-video-intro takes only a
  video step. AI budget units grow with the prompt (one per 40,000
  characters, plus one per file or image; `budgetUnitsFor`).
- (Round 2.) From their own session an applicant moves status only from
  in_progress to pending, rewrites answers only while the form is theirs,
  and re-applies to a job they withdrew from after 30 days; only they set
  resume_url (`20261025350000_applicant_writes_round2.sql`). Interview
  writes count against the writer (20 an hour to one applicant, 200 in all)
  and last 5–240 minutes (`20261025360000`). A browser's notification gets
  the database's time (`20261025370000`). Applicant text is fenced in every
  scoring prompt, ai-analyze included.
- (Round 5.) A storage path read with the service key must be plain: no
  `%`, backslash, control character or dot segment (`isPlainObjectPath` in
  `_shared/ownDocumentFile.ts`, for documents and resumes; a double-encoded
  `%252e%252e` reached another folder). The fence rule names every fence word
  in the text it goes with (`withApplicantTextRule(prompt, text)`: each
  function makes its own word). Every XML feed goes out through `sendXml`,
  which drops XML-illegal characters. A deleted application (withdrawal,
  Delete Account, a deleted job) queues its recordings, video
  introduction and work samples in `storage_file_trash`
  (`20261025490000`, SECURITY DEFINER; since `20261025540000` only where
  storage holds them, with the form's files too).
- (Round 3.) What an applicant signs is what they were shown: at signing
  the server hashes the letter's text or the uploaded file's bytes, refuses
  unless the applicant's screen hashed the same (`viewedHash`), makes that
  v1, and keeps an uploaded file at `documents/<id>/original.pdf`, which only
  the server writes; the countersign uses only that copy
  (`_shared/documentShown.ts`). A browser's document is sent now, by the
  signed-in account. An applicant's resume link is a file in their own
  folder and locks with the answers (`20261025430000_security_round3.sql`).
  The server's "told today" alerts are its own record, never a card in a
  bell (`claim_daily_alert`, `20261025400000`). Guards
  `alerts-reach-the-right-people`; `scripts/own_document_file.test.mjs`.
- (Round 4.) A sent document's letter, file, name, type and v1 are fixed for
  every browser (`20261025470000_security_round4.sql`): a change is a new
  document. Signing takes PDFs only; the kept copy is
  `documents/<id>/original-<v1>.pdf`, which both sides view after the
  applicant signs (document-signing `original`; after a void too, the only
  action besides `view` a voided document answers: the tenth product
  review; the team's side is the owner or a teammate with Send documents,
  `resolveDocumentRole`, and any other teammate is told so: the eleventh).
  The prompt fence's markers
  carry a word made when the function starts (`_shared/promptFence.ts`).
- (Rounds 6–7.) Every function that reads or signs a stored file with the
  service key holds the path to `isPlainObjectPath` (applicant-file-url,
  requested-document-url, ai-analyze-portfolio, document-signing, the resume
  reader), and the database refuses `%`, backslash and control characters in
  `resume_url`, the form's file paths and a request's `file_url`
  (`20261025500000_plain_file_paths.sql`). Guard
  `service-key-signers-use-plain-paths`. The launch locks are proved by
  behaviour, not only by regexes: `scripts/launch_locks_behaviour.pglite.test.mjs`
  replays every migration, then exercises the file queue, remove_applicant,
  the AI budget, the bell and inbox limits, reports, invite codes, the plain
  paths and a clean insert as anon / authenticated / service role. A new lock
  belongs in it. (Round 8.) Every weakening the eighth review tried of
  sections 9-13 fails a test there, not only a guard, and its loops are
  bounded (a budget that stops counting fails section 12; it used to hang
  until CI's timeout).

**Trusted-results foundation is built AND live-enforced.** The
`recordStepResult` path and the `public.trusted_result_enforcement` table
(one boolean flag per self-reported step type: `chatInterviewResult`,
`chatSimulationResult`, `phase`, `portfolioResult`, `salesSimulationResult`,
`typingTestResult`, `videoIntroResult`, `voiceInterviewResult`) exist, and as
re-verified live on 2026-09-16 **all 8 flags are `enforced = true`**. The 7
`enforce_*` migrations (repo files at
`supabase/migrations/20260916150100`–`150700_enforce_*.sql`) plus
`enforce_phase_lock` (which flips `phase`, the 8th flag — repo file
`supabase/migrations/20260916180000_enforce_phase_lock.sql`) are all applied
to production, under Management-API-restamped versions
`20260916183325`–`20260916184013`; see `docs/MIGRATION-HISTORY.md` section 2
for the version mapping. `protected_trusted_result_notes_subset` now refuses
a direct client write to any of those 8 `notes` keys — confirmed for the
voice case via `pg_get_functiondef` on the live
`submit_voice_interview_manual_end()`, which no longer writes
`voice_interview_transcript`/`phase_ai_analysis` directly (the post-migration
body). A prior version of this section, and of
`docs/MIGRATION-HISTORY.md`, claimed the opposite (`enforced = false`,
"never applied") — that claim was already false when it was written, six
minutes after these migrations actually ran; re-run the query above yourself
before trusting either this line or that one, per
`docs/MIGRATION-HISTORY.md`'s "Keeping this file honest across sessions."

**Notification emails are caller-checked (live since 2026-10-07).**
`send-notification-email` works out who is asking and decides who may set off
each kind of email, and looks up who signs it and who is named in it
(`supabase/functions/_shared/notificationAccess.ts`,
`docs/NOTIFICATION-EMAILS.md`). Before that, anyone holding the site's public
key could have any template ("You've got the job" included) sent to any user
id, signed with any name: the gateway lets the public key through even with
`verify_jwt = true`. Never add a kind of email that takes its recipient or
its signer from the request. `scripts/notification_access.test.mjs` runs the
real function against a stand-in world and fails if a rule is weakened.
One edge function calling another presents the project's secret key in the
**`apikey` header with no `Authorization` header** (seen live 2026-10-07):
a check that reads only `Authorization` refuses every function-to-function
call, which is what the first version of this lock did for five hours.

**Every account has a `profiles` row (re-checked live 2026-10-11).** On
2026-09-16 one account had none and the self-healing
`public.reconcile_orphaned_profiles()`
(`supabase/migrations/20260831190000_reconcile_orphaned_profiles.sql`) was
never applied; `select count(*) from auth.users u left join public.profiles p
on p.user_id=u.id where p.user_id is null` now returns 0. Re-run it before
trusting this line; see `docs/MIGRATION-HISTORY.md` section 3a.

**Before other businesses join (2026-10-11 overview, 3e62305 + f2cdb7f).**
Applications start clean on INSERT (no self-set score, stage or result);
documents, videos and resumes are reachable only by the applicant's own
business; team members join only by invitation and an account belongs to
one business; voice is off for everyone but `platform_admins`; a suspended
business cannot publish and its jobs leave `published_jobs_public`;
applicant emails come from the job's business by name. The 15 old
Stripe/boost/blueprint/voice-credit edge functions were DELETED from
Supabase (they would have woken with the old prices the moment a Stripe key
was set) — never redeploy them; billing gets built new, with new secret
names. A function called inside a view runs with the caller's rights: read
tables directly in `published_jobs_public` (a rehearsal caught
`business_status_of()` refusing every visitor).

**Never ask for date of birth or age on an application (2026-10-11).**
Every application starts with the built-in "Are you 18 or older?"
(`src/lib/ageCheck.ts`; never stored in a job's own questions), and the
database refuses to send one that answered "No" (`applications_refuse_under_18`).
The owner asked for date of birth; most applicants are in the Philippines,
where RA 10911 Section 5(a) makes it unlawful to "require the declaration of
age or birth date during the application process". The exact date comes after
the hire, from the ID asked for with "Ask for ID or papers".

**No business approval (the owner, 2026-10-11: "I don't want the
headache").** Every business is open from sign-up, ID papers included; three
reports from three different people it has been in touch with (a message
from it or its team, papers asked for, an interview) pause one by itself
(`20261011190000_open_by_default_report_pause.sql`, narrowed by
`20261025290000_reports_need_contact.sql`; docs/BUSINESS-TRUST.md).
No TIN check: no law requires one. Don't bring back an approval step.
New businesses get one-time guided tips (`src/cockpit/tips`, table
`ui_tips_seen`; accounts made from 2026-10-11 08:00 UTC, never
`platform_admins`). hireflownow.com/open-jobs lists every business's live
jobs; the front page's "Looking for a job?" goes there, `/careers` stays Zulu's.

See `docs/ARCHITECTURE.md` and `docs/BACKEND-SCHEMA.md` for the current live
schema, and `docs/MIGRATION-HISTORY.md` for how migration history was
reconciled with the live database on 2026-09-16 — including the full reverse
check (every one of the 144 repo migration files, diffed by name against the
complete, freshly-queried live table, not a search scoped to one category)
that found **82** such files, not 20 and not 7, split into three different
situations: **1** never applied with a real live consequence (the
orphaned-profile fix — the `enforce_*`/`enforce_phase_lock` migrations are
now confirmed applied, see "Security posture" above), **2** never applied
that would fail outright if run today (target dropped showcase tables), and
**79** applied untracked (10 by hand against the current schema, 69 that
predate `schema_migrations` tracking entirely and are this project's
original foundational migrations).

## Before touching this clone

Run `git fetch origin && git status -sb` first. Other sessions push to `main` from other folders; on 2026-09-04 this clone was 43 commits behind and an audit nearly fixed bugs that were already fixed upstream.

## Applying migrations through the Management API

When applying migrations directly through the Supabase Management API (rather
than `npx supabase db push`), pause **at least 2 seconds** between applies and
**stop immediately** if one fails — do not continue to the next migration.
Also note: the Management API stamps each migration's live `version` with the
time it was called, which can differ from the version encoded in the repo file
name that was pushed. Diff repo files against `supabase_migrations.schema_migrations`
by migration **name**, not by version — see `docs/MIGRATION-HISTORY.md`.

## Local Development

```bash
cd hireflow1
npm install
npm run dev
# Runs on http://localhost:8080
```

## Deploying Changes

Push to `main` branch on GitHub — Vercel auto-deploys.

```bash
git add .
git commit -m "your message"
git push origin main
```

## Supabase CLI Commands

```bash
# Link (already done)
npx supabase link --project-ref yqklrkpptnhubsnijqze

# Push database migrations
# DO NOT run this blind: db push matches by version, and 38 repo migrations
# are stamped with a different version than the one recorded live (see
# docs/MIGRATION-HISTORY.md, "Same migration, different version stamp").
# A blind push will re-apply those 38 against production and write a
# duplicate schema_migrations row. Reconcile against
# docs/MIGRATION-HISTORY.md first.
npx supabase db push

# Deploy all edge functions
npx supabase functions deploy

# Deploy a single edge function
npx supabase functions deploy <function-name>
```

## Edge function imports are pinned (2026-10-07)

Every edge function imports the Supabase client by exact version
(`https://esm.sh/@supabase/supabase-js@2.117.2`), and
`scripts/guards/edge-function-pinned-imports.mjs` fails on any remote import
in `supabase/functions` without a full x.y.z version. On 2026-10-07 a deploy
was blocked outright: functions imported the floating `@2`, and a release
published six minutes earlier could not be served by esm.sh ("Failed to bundle
the function ... Module not found"). To move to a newer release: change
`SUPABASE_JS` in that guard, replace the version in the imports that carry
the old one, run `node scripts/deno_check_functions.mjs`, and commit
`deno.lock` with it. A function only picks a new version up when it is next
deployed, so pinning changed nothing that is live. Eleven functions
deliberately stay on older pins (2.45.0, 2.49.1; listed in the guard): move
one only with that function's own tests.

## Still Needs Setup (updated 2026-10-25)

- [ ] Stripe live keys — billing is built new with pricing v9 and lands last; nothing is gated while it is off (see "Distribution & billing state").
- [ ] Owner inputs for the legal pages: the LLC's state of registration (governing law) and a contact email for legal and privacy (docs/LAUNCH-PLAN.md, Phase 5). Until then the pages send people to Contact us / Help in the account.
- [ ] www → apex redirect: change it from 307 to 308 in Vercel's domain settings (owner).
- [ ] Turnstile keys for the sign-up forms (owner), and an OpenAI spending cap (owner, later).
- [ ] Enforce the Content-Security-Policy after a day of real traffic reports nothing that should be allowed (docs/LAUNCH-PLAN.md, Phase 7; reporting was proven live 2026-10-25).

Done since the 2026-09-16 list: the owner's own job is live with 155 real applications (the feeds list a job only when it has a country); push notifications need no OneSignal keys any more (Web Push with the site's own key pair, `20261021220000_web_push.sql`; no `ONESIGNAL_*` secret is set, checked 2026-10-25).

Already configured and working, despite older notes here: `OPENAI_API_KEY`
(every AI feature — job writing, scoring, chat/voice interviews, documents,
portfolio analysis — runs live on `gpt-5.6-luna`/`gpt-5.6-terra`/
`gpt-realtime-2.1`, see `docs/MODEL-DEADLINES.md`). `ELEVENLABS_API_KEY` is
only used by the `/marketing-demo` page — no candidate or employer flow depends
on it, so it is not a launch blocker either way.
