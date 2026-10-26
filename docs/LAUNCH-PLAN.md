# Launch plan: HireFlow for customer-service hiring

Written 2026-10-24 from a full audit of the repo and the live project. This is
the working plan. Whoever picks it up (a later session, or a fresh agent)
starts here: read **Rules**, read **Known facts**, read the **Progress log**
at the bottom, then continue the first phase that is not closed.

The owner's instructions, in their words (2026-10-24):

> "Every phase, I want you to spend a detailed amount of time. Even when
> you're done, go back and do it again. Check again, look for any gaps you may
> miss, any words that got left out, any security holes that you thought you
> covered but didn't. Operate in a loop on each phase. Do this autonomously,
> everything. Do thorough testing, and once testing works, lock it down so it
> doesn't break later. Operate in a loop autonomously for as many hours as it
> takes."

What HireFlow is becoming: the hiring app for **customer-service agents, chat
and phone, for any kind of business** (the owner's example: a doctor's
office). It was proven on the owner's own hire in October 2026 (see Known
facts). Not a sweepstakes pitch; not main-street roles like barista.

---

## Rules

These are rules, not suggestions. They apply to every phase.

### The loop

Every phase runs these passes, in order. A phase is closed only when a full
Pass C finds nothing new.

- **Pass A — Build.** Do the phase's tasks. Small commits, one concern each,
  in this repo's commit style (a plain sentence saying what changed for whom).
- **Pass B — Verify.** All of the following, locally, and every one must pass:
  `npm run build` · `npm run typecheck:ratchet` · `node scripts/guardrails.mjs`
  · every `scripts/*.test.mjs` and `scripts/*pglite*.mjs` (run with plain
  `node`; macOS has no `timeout` command, so do not copy CI's wrapper) ·
  `node scripts/deno_check_functions.mjs` for any edge function touched.
  Then look at it: run `npm run dev` and open the screens in the dev preview
  (`/__preview`, docs/DEV-PREVIEW.md; add fixtures for any new screen or
  state so it can be reviewed), on a phone-width viewport as well as desktop.
- **Pass C — Re-check (the "do it again" pass).** Start over as if you had not
  written it:
  1. Re-read the whole diff of the phase line by line.
  2. Re-ask the phase's original question (the audit finding, the owner's
     ask) and try to break the fix: attack it the way the finding described,
     from each role (anonymous, applicant, business owner, team member, a
     *different* business).
  3. Proofread every user-facing string you added or changed: spelling,
     missing words, leftover old wording ("player", "Zulu", "staff", "AI",
     "Ava" where candidates can see it), wrong business name, wrong tense.
  4. Walk the surrounding flow end to end, not just the changed screen
     (the step before and the step after).
  5. Spawn one fresh reviewer (a subagent with no conclusions in its prompt,
     only the diff and this phase's checklist) and act on what it finds.
  If anything turns up, fix it, then run Pass C again from step 1. The phase
  closes on a Pass C that finds nothing.
- **Pass D — Lock down.** Make the fix unable to silently regress:
  - a guard under `scripts/guards/<name>.mjs` (one file per shipped fix; it
    must fail on the old code and pass on the fix — `scripts/guards/README.md`);
  - a test: `scripts/<name>.test.mjs` for logic, `scripts/<name>.pglite.test.mjs`
    for anything in SQL (policies, triggers, RPCs) — the PGlite tests replay the
    migrations, so a policy that is not in a migration is not tested;
  - docs: update the doc that describes the area (docs/*.md), and CLAUDE.md
    where a fact there changed. Never leave a doc saying something the code no
    longer does.
- **Pass E — Ship and verify live.** `git fetch origin && git status -sb`
  first (other sessions push to main from other folders). Push to `main`;
  CI must be green (`gh run list`); then open the live site in the browser and
  confirm the change is there (public pages; staff pages via the owner's
  account only if the owner has said so). For database changes: apply, then re-run
  the proving query against the live database.
- **Close-out.** Write the Progress log entry (below): what landed (commits,
  migrations), how each item was verified, what Pass C found and fixed, what
  is still open and why. Then re-read the *next* phase before starting it.

### Autonomy

The owner has authorised autonomous work: branches, commits, pushes to
`main` (which deploys), database migrations, edge-function deploys and
Supabase settings changes, without asking first, as long as every rule here
is kept. Stop and ask only for:

- anything that needs something only the owner has (listed under **Owner
  inputs** in each phase: legal entity name, Turnstile keys, Stripe keys, a
  lawyer's review, an OpenAI spending cap set in the OpenAI dashboard);
- deleting or rewriting real user data, changing a real user's email or
  password, or any setting that could lock real users out (for example
  turning on global email confirmation, which would affect applicants);
- creating accounts or submitting forms on the live site. Test on the local
  dev server, the dev preview and PGlite. For a live end-to-end run (a real
  sign-up, a real job, a real application) ask the owner to do it at phase
  close-out; it takes the owner minutes;
- anything to do with money.

If one item blocks for more than two honest attempts, log it under "Open" in
the phase's log entry with what was tried, and move on. Do not loop on a
single stuck item for hours; the loop is for the phase, not the item.

**Models.** The owner picks this session's model himself in the app's model
menu (a session may not re-price its own turns); the owner uses a high-reasoning
model for planning and review and a building model for the phases. Pick the
model for helpers yourself: cheap models for wide read-only sweeps, the
session's own model for anything that designs or writes code. Note in each
Progress log entry which model did the phase.

**Session start.** Besides `git fetch`, read `git log` since the last Progress
log entry: another session may have landed work without logging it.
Reconcile the log before continuing. If the dev server logs "Invalid hook
call" from framer-motion or a page shows "Something went wrong" only in
dev, the Vite dependency cache is stale: `rm -rf node_modules/.vite` and
restart; it is not an app bug.

**Owner interruptions.** When the owner changes a decision mid-phase, update
the plan first (the phase's text and the log), then the code, so the plan
never lags what was built.

### Repo rules that already exist (keep them)

- Before touching the clone: `git fetch origin && git status -sb`.
- Migrations: new file in `supabase/migrations/` named
  `YYYYMMDDHHMMSS_<name>.sql`. Apply through the Management API or
  `apply_migration`, **one at a time, 2 seconds apart, stop on the first
  failure**. Never run `npx supabase db push` blind (docs/MIGRATION-HISTORY.md:
  38 repo files carry a different version than the live record). Record the
  applied version in docs/MIGRATION-HISTORY.md.
- Edge functions: imports pinned to exact versions (the guard
  `edge-function-pinned-imports` enforces it). `deno check` before deploy.
  Deploy one function at a time with `npx supabase functions deploy <name>`.
- Never redeploy the 15 deleted Stripe/boost/blueprint/voice-credit functions.
- Never weaken anything listed under "Security posture" in CLAUDE.md.
- Candidates never see the words "AI" or "Ava" (README). Keep copy plain.
- Never ask an applicant for date of birth or age beyond the built-in
  "18 or older?" (Philippines RA 10911).
- No business approval step (owner: "I don't want the headache").
- Nothing behind a paywall and no price shown as due while billing is off.
- Voice stays off for every business except `platform_admins`.
- A function called inside a view runs with the caller's rights; read tables
  directly in public views.
- `send-notification-email` never takes a recipient or signer from the
  request (docs/NOTIFICATION-EMAILS.md).

### Definition of done, for everything

- Pass B all green locally, CI green, verified on the live site.
- Each fix has a guard or a test that fails without it.
- Docs and CLAUDE.md match the code.
- The Progress log entry is written.
- A Pass C ran after the last change and found nothing.

---

## Known facts (2026-10-24; re-check before trusting a number)

- **Live data:** 181 accounts (163 candidates, 15 business accounts, 1
  platform admin), 1 job (the owner's, published), 155 applications, 2 hires.
- **The October run was the owner's own hire.** ~1,400 page views on
  2026-10-07, 154 applications in one week, posted on a Philippines job
  board; it went very well. The app was being fixed live during it, so that
  period's data reflects the settings of the time. Quiet since is not lost
  traction: no outside business has been invited yet. The landing's "153
  applied, 71 finished, 3 worth a call" are from this run.
- **Auth email:** goes through Resend SMTP (`smtp.resend.com`, from
  `hiring@hireflownow.com`). Sender name changed from "Zulu Support Team" to
  **HireFlow** on 2026-10-24. Templates are neutral. Email confirmation is off
  (`mailer_autoconfirm: true`), password minimum 6, no CAPTCHA, no MFA.
  Reset links are allowed back to both hosts.
- **Product emails** (`send-notification-email`): hiring-team emails from
  "HireFlow <notifications@hireflownow.com>"; applicant emails from the
  business by name `<no-reply@hireflownow.com>`.
- **Checks on this clone, 2026-10-24:** build OK, typecheck 0 errors, 187
  guards pass, 142/142 tests pass, CI green on main.
- **Billing:** off (`app_settings.billing_enabled=false`). Every plan a new
  business lands on allows unlimited jobs. No Stripe code in the repo; the
  `@stripe/*` packages are installed but unused. Old $49-unlock schema still
  exists with 0 rows.
- **Security (verified live):** the notification-link hole below is real; all
  341 live notification links are clean in-app links today. The "anyone can
  upload" storage policy and the "public read" policies exist only in old
  migration files, **not** on the live database; a database rebuilt from the
  repo would get them.
- **Analytics:** `public/beacon.js` (cookieless page counter →
  `page_view_daily`) was removed from `public/landing.html` in commit
  1424cb46 and never put back, so the front page is not counted; sign-ups
  record no source; ~94% of recorded views have no referrer or UTM.
- **Ava's job builder** has role families cash / cleaner / admin / developer /
  general (`src/lib/avaEngine/playbook.ts`); no customer-service family; no
  phone test; every built job ends with a written interview that requires a
  computer (`src/lib/deviceGate.ts`), which is right for agents.
- **Chat practice** grading and one applicant message still say "player"
  (`supabase/functions/ai-chat-simulation/prompts.ts`, `index.ts:380`);
  the Zulu team-lead interview script leaks into other businesses' support
  team-lead jobs (`src/lib/interviewGuide.ts:146-196`).
- **Landing** (`public/landing.html`, served at `/` by `middleware.js`):
  pitched at sweepstakes chat agents; no sticky sign-up; ends without a CTA;
  three different logo marks across landing, favicon and sign-up; sign-up page
  says "STAFF SIGN IN"; no page counter.
- **Legal pages** (`src/content/legal.ts`) name no company and no contact;
  applicant sign-up shows no privacy notice or consent.

---

## Phase 1 — Security holes (first; nothing else ships before this closes)

**Goal:** no path by which one account can reach another's data or run up
the owner's costs. Ranked by the 2026-10-24 audit; each item names what the
audit found, where, and what "fixed" means.

### Tasks

1. **Notification links (high, confirmed).** `notifications.link` is unfiltered
   and rendered by `<Link to>` in `src/pages/Notifications.tsx` (a
   `javascript:` link renders as a plain `<a>`); policy "Related parties can
   insert notifications" lets an applicant insert one for a business owner,
   and a business for its applicants. Fix, all three:
   - a check constraint (or BEFORE trigger) on `notifications`: `link` is NULL
     or matches `^/[^/\\]` (an in-app path; `_shared/pushLink.ts` already has
     this rule for push, reuse it in SQL and TS). Safe to add: all 341 live
     rows pass;
   - the same filter in the UI before rendering (`Notifications.tsx`,
     `src/cockpit/lib/integrityCards.ts`, `src/cockpit/pages/Applicants.tsx`),
     and `src/cockpit/pages/Messages.tsx:282-292, 476` where a raw `file_url`
     becomes an href;
   - a Content-Security-Policy header in `vercel.json` for both hosts.
     Roll it out in two steps so it cannot break a live applicant mid-test:
     first `Content-Security-Policy-Report-Only` with `report-uri` pointing
     at the `client-errors` function for at least 24 hours of real traffic,
     then enforce once the report is clean. Build the allow-list from the
     network tab, not from memory: the Supabase project URL (REST, auth,
     realtime websocket, storage), Daily's iframe and media (`frame-src`,
     `connect-src`), the ffmpeg wasm and PDF workers (`worker-src blob:`,
     `'wasm-unsafe-eval'`), Google Fonts, the web-push service worker, and
     the landing's own inline script and style (hash them; do not reach
     for `'unsafe-inline'` on scripts). Verify every dev-preview screen and
     every candidate phase page under the enforced policy with zero
     console violations.
2. **Applicants can re-run and steer their AI score (medium, confirmed).**
   `supabase/functions/trigger-ava-analysis/index.ts`: `force:true` from an
   applicant bypasses reuse (:892) and the already-rejected check (:2037); no
   rate limit; the response returns score and scorecard (:2097-2104);
   applicant text is pasted into the prompt unfenced (:965-978). Fix: ignore
   `force`/autopilot flags unless the caller is the job's owner, a team member
   with manage-pipeline, or the service role; one analysis per application
   unless staff asks; per-application rate limit via `private_rate_limit`;
   return nothing but `{ok}` to applicants; wrap applicant-written text in a
   delimited block the prompt says is data, never instructions.
3. **Open AI endpoints (medium; the bypass is a suspicion to confirm first).**
   `ai-generate-job-content` and `ai-generate-workflow` need no sign-in;
   `ai-chat-interview`, `ai-chat-simulation`, `ai-sales-simulation` accept a
   caller-supplied scenario and full history with no size limit. The only
   control, `_shared/rateLimit.ts` `guardPublicAiCall`, keys on the first
   `X-Forwarded-For` entry and fails open. Confirm with one request whether a
   spoofed `X-Forwarded-For` resets the limit, then: key on
   `cf-connecting-ip` (`_shared/bestEffortIp.ts` already documents it as the
   trustworthy one); cap request body and message-history sizes; require a
   real application (and its step) for interview/simulation turns; add a
   platform-wide daily OpenAI budget (a counter in a private table; over
   budget → 503 with a plain "try again tomorrow" for non-admins).
4. **Applicants can read staff-only evaluation and rewrite parts of it
   (medium, confirmed).** "Candidates can view their own applications"
   returns every column (`ai_score`, `ai_analysis`, `ai_scorecard`,
   `notes.avaScorecard`, `employer_notes`); `protect_application_columns`
   (`20260915140000_trusted_step_results.sql:238`) does not block
   `phase_ai_analysis` or `employer_notes`, and the cockpit shows
   `phase_ai_analysis` as Ava's summary when `ai_analysis` is empty
   (`src/cockpit/lib/mappers.ts:311-317`). Fix: (a) add every staff-only
   column to the trigger's blocked list for anon/authenticated candidates;
   (b) stop candidates reading them — measure first: list every candidate-side
   read of `applications` (hooks and pages); the likely design is a
   `security_invoker` view for candidates that omits staff columns and strips
   `avaScorecard` from `notes`, with candidate hooks moved to it and the
   candidate SELECT policy on the base table narrowed. Prove with a PGlite
   test that a candidate session cannot read any of those columns.
5. **Notification email address is user-editable (medium, confirmed).**
   "Users can update their own profile" allows every column;
   `send-notification-email` sends to `profiles.email` (`index.ts:1096`) and
   `document-signing` records it as the signer's email (`:263-268`). Fix:
   send to `auth.users.email` (the function has the service key), make
   `profiles.email` read-only for clients (trigger resets it), and keep it in
   sync from `auth.users` (on email change).
6. **Old wide-open policies still in migration files (not live).**
   `20260617140407_interview_storage_policy_fix.sql:6-8` ("demo upload
   interview audio", INSERT on `storage.objects` WITH CHECK (true), and "demo
   read interview bucket"); `20260617092255_hireflow_schema.sql:142-152`
   ("public read applications/documents/messages"); `20260617132840_pipeline_actions.sql:13-23`;
   `20260617125729_public_apply_flow.sql:19`. Add one migration that drops all
   of them unconditionally (`drop policy if exists`), so a rebuilt database
   can never come up open. Then prove: `select … from pg_policies where
   qual='true' or with_check='true'` on PGlite after replay shows only the
   two intended public reads (`app_settings`, `business_pages`).
7. **Low, do them anyway.** Minimum password length 8 in `src/pages/Auth.tsx`,
   `src/pages/CandidateAuth.tsx` and Supabase (`password_min_length`;
   existing users unaffected). `delete-account` requires a fresh sign-in or
   the password. MFA (TOTP) for `platform_admins`: enrolment in Settings for
   admins, and `is_platform_admin()` requires `aal2`. Applicants should not
   read the full `jobs` row once applied (`passing_score`, `processing_mode`,
   `ai_bias_feedback`, step configs): narrow the candidate SELECT on `jobs` to
   the columns `published_jobs_public` exposes plus what the step pages need
   (list them first). `employer_public_branding` lists every business with a
   company name, including those with no live job: limit it to businesses
   with a published job. Revoke `anon` EXECUTE on the SECURITY DEFINER RPCs
   the advisor flagged that have no anonymous caller (`get_job_quiz_keys`,
   `grant_quiz_retake`, `has_role`, `can_*`, `assign_user_role`); keep
   `business_name_taken`, `get_team_invitation_by_code`, `get_billing_flags`
   only if the sign-up/invite pages call them signed out (check).
8. **Re-run the Supabase security advisor** after the migrations and clear
   what it still flags where it is right.
9. **Inventory of what is reachable without sign-in.** List every edge
   function with `verify_jwt = false` in `supabase/config.toml` and every
   `api/*.mjs` route, with one line each on why it is public and what
   limits it. Put the list in docs/BACKEND-SCHEMA.md and lock it with a
   guard: a new public function must be added to the allow-list in the
   guard, with its reason, or the build fails.
10. **Profiles.** Check the "Employers can view applicant profiles" policy
    and `can_view_applicant_profile`: a business must only read the
    profiles (phone, email, address) of people who applied to its own jobs,
    and an applicant must not read other applicants or any business owner's
    personal row. Prove it in PGlite.

### Verification (Pass B specifics)

- PGlite tests for 1, 4, 5, 6, 7 (policies and triggers) as each role.
- For 1: a unit test that the SQL rule and the TS rule accept the same links
  (fixtures: `/applicants/x`, `/c/a/b`; reject `javascript:…`, `//evil`,
  `https://…`, `data:…`, `\\evil`).
- For 2 and 3: `scripts/notification_access.test.mjs` is the pattern (run the
  real function against a stand-in world); do the same for
  `trigger-ava-analysis` and `rateLimit`.
- CSP: zero violations in the console across every dev-preview screen and
  the candidate phase pages.
- Live: the proving SQL from each item against production after applying.

### Pass C specifics for this phase

- For each item, attempt the attack again against the local stack as every
  role, including "a different business".
- Grep for any other place a user-supplied URL reaches `href`, `to`, `src`,
  `window.open` or `location` (`git grep -n "href={" src | grep -v http` is a
  start; also `dangerouslySetInnerHTML`, which has a guard).
- Grep for any other RPC or policy that takes a `user_id`/`employer_id`
  argument and acts on it without comparing to `auth.uid()`.
- Re-read docs/TRUSTED-RESULTS.md and docs/NOTIFICATION-EMAILS.md against
  the new code.

### Lock-down (Pass D)

- Guards: `notification-links-are-in-app`, `csp-header-present`,
  `ava-analysis-ignores-client-force`, `rate-limit-keys-on-cf-ip`,
  `profiles-email-read-only`, `no-true-policies-in-migrations` (fails if any
  migration adds a `USING (true)`/`WITH CHECK (true)` policy on a table
  outside an allow-list).
- Tests as above. Update docs/TRUSTED-RESULTS.md, docs/NOTIFICATION-EMAILS.md,
  docs/BACKEND-SCHEMA.md, CLAUDE.md "Security posture".

### Owner inputs

- Ask the owner to set a monthly spending cap in the OpenAI dashboard (we cannot).
- The owner's admin login email is in the public repo (`20261011100000_business_trust.sql:429`,
  `docs/BUSINESS-TRUST.md:55`); suggest a separate admin email + MFA. The owner's
  call; log the suggestion.

---

## Phase 2 — Quick fixes before any outside business arrives

**Goal:** no leftover Zulu wording in front of other businesses; every
visitor and sign-up is counted and attributed; a business proves its email
before its job goes live; the share step is not OnlineJobs.ph-only.

### Tasks

1. **"Player" → the right word.** `supabase/functions/ai-chat-simulation/prompts.ts`
   (rubric meanings, `speakerLabels`, `focusLabels`) and `index.ts:380`
   ("Reply to the player…"); `src/components/candidate/TestRulesCard.tsx`;
   `src/pages/CandidateApplicationDetail.tsx:799` ("Start Player chat
   practice"). Make the counterpart noun a property of the job (default
   "customer"; "player" only for the owner's own gaming jobs; "patient" and
   "caller" become available in Phase 4). `src/pages/Index.tsx` is Zulu's own
   `/careers` page and keeps its wording.
2. **Zulu interview script leak.** `src/lib/interviewGuide.ts:146-196, 269-272`
   gives any business's support team-lead job the script about "players" and
   tools that "still have bugs". Use the general plan unless the job belongs
   to the home business.
3. **Count the landing and attribute sign-ups.** Put
   `<script src="/beacon.js" defer>` back in `public/landing.html`; carry
   `utm_*` and the referrer onto both sign-up links on the landing; pass them
   through `src/pages/Auth.tsx` → `src/hooks/useAuth.tsx` into `signUp`
   metadata (`raw_user_meta_data`, no schema change); add a "where sign-ups
   came from" query to docs/ANALYTICS.md and a card on the admin screen.
   Turn the beacon on for `staff.` too for sign-up pages only.
4. **Business email check before publishing.** Keep applicants frictionless
   (`mailer_autoconfirm` stays on). For businesses: a 6-digit code sent
   through `send-notification-email` (a new system-only kind; recipient is
   the caller's own `auth.users.email`), an RPC that checks it and stamps
   `profiles.email_verified_at`, and the publish path (the jobs UPDATE policy
   that sets `status='published'`, and `published_jobs_public`) requires the
   stamp; `platform_admins` exempt. Backfill the stamp for the 15 existing
   business accounts that have already published or signed in since
   2026-10-01. The ask appears at "Publish", not at sign-up.
5. **Bot check on sign-up.** Supabase supports Cloudflare Turnstile natively
   (`security_captcha_enabled` + a site key in the client). Needs the owner's
   Turnstile keys (owner input). Until then: Supabase's auth rate limits are
   the only control; note it in the log.
6. **Share step.** `src/cockpit/components/journey/GuideStages.tsx:19, 121-127`
   points only at OnlineJobs.ph. Offer: copy link, Facebook, LinkedIn, Indeed,
   plus OnlineJobs.ph for Philippines hiring; each link carries UTM tags.
7. **Small leftovers from the audit:** "manage billing" wording
   (`src/cockpit/pages/Team.tsx:282`); "in your feed" (`src/cockpit/pages/Jobs.tsx:664`);
   the `/candidate/continue` page reads dropped showcase tables
   (`src/lib/showcaseApply.ts:157-176`) — fix or remove; the "practical task"
   phase shown for developer jobs then silently dropped
   (`src/lib/jobFromFlow.ts:333`); `/flow-lab` and `/ava-preview` are public
   and indexable (`src/App.tsx:305, 317`) — gate or `noindex`; "Connect Google
   Calendar" shows when the server keys are not set
   (`InterviewSchedulingWizard.tsx:1785-1831`) — hide unless configured;
   `api/job-feed.mjs` should let a remote job that names an applicant country
   through the feed.

### Verification

- Dev preview: chat practice start screen, the applicant message on an empty
  send, the hiring-team's view of a graded chat, the share step, the publish
  button for a business without the stamp (shows the code screen) and with it.
- PGlite: publish refused without the stamp, allowed with it, admins exempt;
  the code RPC rejects wrong/expired codes and rate-limits attempts.
- `node scripts/notification_access.test.mjs` extended for the new email kind.
- Live: `page_view_daily` gains rows for `/` within minutes of deploy; a
  tagged link to the landing records its `utm_source`.

### Pass C specifics

- `git grep -n -i "player"` across `src` and `supabase/functions`, excluding
  `src/pages/Index.tsx`, the Zulu docs and tests; justify every remaining hit.
- `git grep -n -i "zulu"` the same way.
- Read every string in the share step and the email-code screen out loud.
- Confirm no applicant path got a new step or prompt by accident.

### Lock-down

- Guards: `landing-has-beacon`, `signup-carries-utm`, `publish-requires-verified-email`,
  `no-player-wording-outside-home-business`, `showcase-tables-not-read`.
- Tests for the email-code RPCs (PGlite) and the counterpart-noun helper.
- docs/ANALYTICS.md, docs/BUSINESS-TRUST.md, docs/JOB-COPY.md updated.

### Owner inputs

- Cloudflare Turnstile site key + secret (free; the owner creates them). Ask at
  the start of Phase 1 so they are ready here.

---

## Phase 3 — Look and landing page

**Goal:** one brand, one colour direction, a front page that sells
customer-service hiring to any business and sends every visitor to one
button, and an applicants list whose "where they are" column reads at a
glance.

**Colour: LOCKED by the owner on 2026-10-24 ("lock it"): ink and ivory,
brass accent — "paper and brass".** The
landing is already black, ivory and brass; the owner likes it. The green the owner
dislikes is the *app*: the jade action colour (`--jade`, `--primary`,
`--hf-green`, `--ck-jade`), the jade "aurora" layer and the green-tinted
backdrop on the sign-up page. Real screens were recoloured on 2026-10-24
and shown to the owner (`design/mockups/2026-10-24-colour-and-rail/`): brass as
the action colour, and "ink and ivory" with brass kept as an accent.

The locked direction: **Ink and ivory, brass accent.** Actions are
monochrome (ink buttons on ivory paper by day, ivory buttons on near-black
at night, which is what the landing's own "Start hiring free" button already
is); **brass is reserved** for Ava's seal, the sealed score, "hired", and
anything that costs money (the cockpit's existing rule, `cockpit.css:194`).
No jade anywhere; no new accent colour. Reasons: it matches the landing
without reading "casino" the way gold-on-black does inside a daily tool, it
is calm for all-day use, and it keeps brass meaningful.

Which theme when: the **landing stays dark** (it is a marketing page; its
black, ivory and gold do not change). The **sign-up page stays dark** too,
in the ink-and-ivory tokens, because it is the bridge from the landing.
Once signed in, the **app follows the device's light/dark setting** (most
desktops by day → Day/paper; phones at night → Night), and the existing
toggle overrides it and is remembered per account. The applicant side
follows the same rule. The mock-ups in
`design/mockups/2026-10-24-colour-and-rail/` are the reference.

The brass mark exists at `branding/backup-icon-flow.png` ("Direction 5");
update BRANDING.md, whose "DO NOT REVIVE" section is about the old orb icon,
not brass.

**"Where they are" column (decided 2026-10-24: Option C).** The applicants
list (`src/cockpit/pages/Applicants.tsx`, `src/cockpit/lib/applicantList.ts`)
draws an 11-dot dashed rail per row; the owner: "I don't like how these
weird dots appear." Replace it with four milestones, Applied → Tested →
Interview → Hired, as small solid dots on a line, the current one larger and
bright, with the step detail ("Testing · 8 of 11", "Offer made", "Declined")
in small text under the current milestone. Reference:
`design/mockups/2026-10-24-colour-and-rail/where-they-are-options.html`,
Option C. Map every real application state onto the four milestones
(including declined, withdrawn, waiting on computer, offer made, no-show)
and show the mapping in docs/APPLICANTS-LIST.md.

### Tasks

1. **One logo.** Pick the mark (brass line on dark tile), regenerate every
   size with `node scripts/make-app-icons.mjs`, use it on the landing (the
   ivory "H" tile goes), the favicon, the manifest, the share image
   (`public/share/hireflow.jpg`), the sign-up page (the "A" seal stays Ava's
   badge-scale mark only), and `Wordmark.tsx`.
2. **Colour tokens.** `src/index.css` (`--jade*`, `--primary`, `--ring`,
   `--accent`, `--success`, `--sidebar-*`, `--ck-jade`, `--hf-green`,
   `--seal-disc`, `--slab*` in both the Day block and the Night block at
   ~:219), `src/styles/candidate-jade.css`, `src/cockpit/cockpit.css` (the
   gem ramp `--gem-*` at ~:724, the aurora layer at ~:385, the focus ring at
   ~:450), `tailwind.config.ts`; the landing's `--gold` stays. Rename the
   tokens to what they now mean (`--jade` → `--action`), keep the mapping
   in one place, and re-check contrast (WCAG AA) on every token pair in both
   themes. The `design-tokens` guards in `scripts/guardrails.mjs` must keep
   passing or be updated with the new names. The app follows the device's
   light/dark setting by default; the toggle overrides and is remembered.
3. **Landing rewrite** (`public/landing.html`; docs/LANDING.md):
   - headline: "Hire customer service agents while you sleep."; subhead for
     chat and phone, any business;
   - keep the "one night" story; replace the casino payout chat with an
     everyday one (a patient rescheduling, or an order that is late);
   - replace the sweepstakes section with "Built for any team that answers
     customers": medical and dental, online stores, software, home services,
     gaming;
   - proof: "We used it ourselves: 153 applied in 4 days, 71 finished, 3 worth
     a call, 1 hired" (true; keep the "Maria, Jun and Ana are not real
     applicants" line);
   - one CTA, "Post your first job free", in a top bar that stays pinned for
     the whole page, as the hero's main button (the video second), and again
     at the end instead of "Watch it again";
   - "First job free. No card." under the button; no prices while billing is
     off;
   - footer: Open jobs, Privacy, Terms, Contact (the address from Phase 5),
     About (one paragraph), Team sign in;
   - structured data: `Organization` with `sameAs`, plus `SoftwareApplication`;
   - fonts non-blocking; the headline must not start hidden; drop the ~5 MB of
     unused videos from `public/`;
   - the page is a single HTML file; keep it so (it serves fast), and keep the
     byte-for-byte parity test `scripts/landing_page.test.mjs` updated.
4. **Sign-up page** (`src/pages/Auth.tsx` ~:900-1000): in sign-up mode the
   eyebrow says "Start hiring", the tab title "HireFlow", not "Staff";
   "Hiring, handled by Ava." stays (businesses may see Ava's name; applicants
   may not).
5. **Share image for other businesses' jobs.** `api/job-prerender.mjs` and
   `api/careers-prerender.mjs` send an image that says "Remote jobs… Work from
   home"; make it neutral (the business name and job title drawn onto the
   brass card, or the plain HireFlow card).
6. **Links back to sign-up with UTM:** the `/c/<business>` footer "Hiring
   with HireFlow" becomes a link; "Hiring? Post a job free" on the job page
   and the "application finished" screen; the flyer in the Share Kit gets the
   URL.
7. **Vercel:** `www` redirect 307 → 308 (domain settings; owner may need to
   click), confirm `hireflow1.vercel.app` keeps canonical to hireflownow.com.
8. **"Where they are" → Option C** as described above, in both themes, on
   desktop and at phone width (the owner reviews on a phone); the tooltip
   that named the step goes, since the step is now written under the rail.

### Verification

- Screenshots of the landing at 375, 768, 1280 wide, light and dark; the
  pinned bar never covers content; Lighthouse ≥ 90 performance on mobile.
- Paste the landing and a `/c/…` job link into a share-preview checker (or
  fetch with the Facebook/WhatsApp/LinkedIn/Googlebot user agents as
  `scripts/seo_pages.test.mjs` does) and confirm title, description, image.
- Dev preview: every cockpit and candidate screen in the new colours, both
  themes; a fresh reviewer looks for any jade left over
  (`git grep -n -i "3FCE97\|0F6B4F\|4FBF95\|67E3AF\|jade\|mint"`), and for
  brass used on anything that is not Ava, a score, "hired" or money.
- Applicants list: every application state in the fixtures renders a
  sensible milestone; none falls through to a blank.
- `scripts/landing_page.test.mjs`, `scripts/seo_pages.test.mjs`,
  `scripts/careers_prerender.test.mjs` updated and passing.

### Pass C specifics

- Read the whole landing copy aloud once, then once more backwards sentence
  by sentence (catches missing words).
- Every link on the landing: click it; it lands where its text says.
- Confirm no "sweepstakes", "casino", "player", "Zulu" remains on the landing
  or in its share tags.
- Confirm the three numbers are still the real ones.

### Lock-down

- Guards: `one-logo-mark`, `landing-single-cta-pinned`, `no-jade-tokens-left`,
  `brass-only-for-ava-score-money`, `share-image-neutral-for-other-businesses`,
  `applicant-rail-is-four-milestones`.
- BRANDING.md, docs/LANDING.md, docs/SEO.md updated.

### Owner inputs

- Colour: locked ("lock it", 2026-10-24). Nothing further needed.
- The Vercel `www` 308 change if it needs the owner's click.

---

## Phase 4 — Ava for customer-service hiring

**Goal:** a business that types "chat agent for a dental office" or "phone
support for an online store" gets the right questions, the right tests and
the right grading, with vetted scenarios per industry.

### Tasks

1. **A `customer_service` role family** in `src/lib/avaEngine/playbook.ts`
   (`detectFamily` + `PLAYBOOKS`): detected from chat/phone/support/customer
   service/help desk/front desk/receptionist-for-patients wording. Follow-ups
   Ava asks: channel (chat, phone, email, mixed), industry (medical/dental,
   online store, software, home services, gaming, other), how many chats or
   calls at once, shift and time zone, sensitive data (medical, payment,
   identity), tools they will use. Remote follow-ups still apply.
2. **The flow it builds** (`templateGenerator.ts`, `assemble.ts`,
   `generate-flow` edge function prompt at `supabase/functions/generate-flow/index.ts:141`):
   application → skills check (5 questions from an industry bank) → computer
   and connection check → chat practice (an escalated case from the industry
   pack) → written interview. For a phone channel today: the same, with the
   written interview's questions about handling calls. The plan promises no
   practice call: one is still "Later", and the builder said "A practice call
   is coming" until review 12, as if this flow had one. Typing is measured
   inside the chat practice (docs/TYPING-IN-CHAT.md), for a remote job only
   (round 5): keep that.
3. **Industry scenario packs**, written and reviewed the way
   docs/ZULU-SKILLS-CHECK.md was (three independent readers: ambiguity,
   second-language reader under a timer, hiring manager), one pack each:
   medical/dental (rescheduling, insurance question, verifying who is asking
   before sharing anything, when to say "call emergency services"), online
   store (refund, late order, wrong item), software (login, billing, data
   loss fear), home services (booking, no-show, angry customer), gaming (the
   existing Zulu cases, generalised). Each pack: 5 skills-check questions
   with keys, 6 chat cases with the "leader knows" brief where relevant, the
   counterpart noun (customer / patient / caller / player), and a short
   evaluator note on what "good" is in that industry. Store packs in
   `src/content/scenarioPacks/` and mirror the server copy in
   `supabase/functions/_shared/` (the server grades; the guard keeps them
   identical).
4. **Grading per industry** (`supabase/functions/ai-chat-simulation/prompts.ts`):
   the rubric text uses the pack's noun and note; the `support_agent` rubric
   is the default, `team_lead` when the role leads others.
5. **Question banks** (`questionBanks.ts`): customer-service interview
   questions (clarity, judgment, ownership, fit) that do not assume gaming.
6. **Job copy** (`ai-generate-job-content`): the job post Ava writes for a
   customer-service role reads right for the industry (no "players").
7. **Interview guide** (`src/lib/interviewGuide.ts`): a customer-service
   guide per channel, replacing the Zulu-only script found in Phase 2.
8. **Dev-preview fixtures:** add a medical-office chat-agent job and a
   phone-support job so every new screen can be reviewed.

### Verification

- Unit tests: `detectFamily` on 30 real-looking briefs (dental receptionist,
  "chat support for our Shopify store", "phone CSR", "help desk tier 1",
  and non-matches like barista); the built flow for each channel/industry
  has the expected steps; every pack validates (keys exist, 5 questions,
  6 cases, nouns set).
- `node scripts/chat_simulation_grading.test.mjs` and
  `scripts/lead_practice_grading.test.mjs` extended with a medical and a
  store case.
- Dev preview: run the job builder end to end for a dental office and for an
  online store; read every screen Ava shows; then open the candidate side
  for the built job.
- Live: no behaviour change for the owner's existing job (its stored steps
  are untouched).

### Pass C specifics

- Read every scenario as the applicant would, on a phone, under time: is any
  case ambiguous, culturally specific, or unanswerable without company
  knowledge the brief does not give?
- Check no candidate-facing text says "AI" or "Ava".
- Check the home business's job still grades with "player".

### Lock-down

- Guards: `scenario-packs-client-server-identical`, `customer-service-family-exists`,
  `no-gaming-nouns-in-generic-packs`.
- Tests as above. New doc `docs/CUSTOMER-SERVICE-HIRING.md` (what Ava asks,
  what she builds, the packs and their review history), and update
  docs/JOB-COPY.md, docs/INTERVIEWS.md.

### Owner inputs

- None required. Optional: the owner's review of the medical and store packs (they
  know what a good agent sounds like).

---

## Phase 5 — Legal pages, consent, and cost guardrails

**Goal:** the site names who runs it and how to reach them; applicants are
told what happens to their data before they hand over an ID; nobody can run
up the owner's AI bill while billing is off.

### Tasks

1. **Legal pages** (`src/content/legal.ts`, docs/LEGAL-PAGES.md): the
   company's legal name and jurisdiction, a contact email, a data-protection
   contact (the Philippines Data Privacy Act expects one), retention
   (IDs deleted 24 hours after first opened — the doc says 30 days and is
   wrong), the cookieless page counter and the sign-up source tag from
   Phase 2, sub-processors (Supabase, Vercel, OpenAI, Resend, Daily), what
   businesses must do with applicant data (a short data-processing addendum
   businesses accept at sign-up), how to ask for deletion or a copy.
2. **Consent where data is collected:** a one-line privacy notice with a
   link on applicant sign-up (`src/pages/CandidateAuth.tsx` ~:937-998) and
   on the application form; the employer sign-up checkbox links Privacy as
   well as Terms (`src/pages/Auth.tsx:978`).
3. **Delete / export an applicant's data from the business side** (the Terms
   promise it): an action on the applicant page that removes the business's
   copy (files, notes, documents) and logs it; plus the existing
   `delete-account` for the applicant's own account.
4. **Cost guardrails, not a paywall** (nothing may be gated while billing is
   off): a per-business daily AI budget (scores, chat turns, job writing)
   with a plain message when reached (HireFlow's own business on its own,
   larger day since Phase 7, `ai_platform_business_daily_call_cap`); the
   platform-wide budget from Phase 1; alerts to the owner (email through the
   system-only kind) at 80% and 100%. The "first job free, then pay" gate
   ships with Stripe, not here.
5. **Remove the dead "showcase" and old-billing leftovers** the audit listed,
   where Phase 2 did not already.

### Verification

- Render each legal page in the dev preview and read it in full; every
  placeholder gone; dates right.
- PGlite: the delete-applicant action removes exactly that business's rows
  and nothing of another business's; the budget counter blocks at the cap
  and resets at midnight (project time zone documented).
- `scripts/legal_pages.test.mjs` updated.

### Pass C specifics

- Search for "TBD", "[", "lorem", "Zulu", "we may", blank entity names.
- Check the 24-hour ID deletion claim against the code
  (`document-cleanup`) and the doc, and make all three agree.

### Lock-down

- Guards: `legal-pages-name-entity-and-contact`, `applicant-signup-shows-privacy-notice`,
  `ai-budget-enforced`.
- docs/LEGAL-PAGES.md, docs/DOCUMENT-REQUESTS.md updated.

### Owner inputs (ask at the start of Phase 1 so they are ready)

- Legal entity: **Southern Digital Technologies LLC** (owner, 2026-10-24,
  "that's the main one"). Still needed: its state of registration (for the
  governing-law clause) and a contact email for legal and privacy (can be an
  alias such as privacy@hireflownow.com).
- A lawyer's review of the finished pages (recommended; log that it was
  recommended).

---

## Phase 6 — Blog

**Goal:** crawlable, fast articles at hireflownow.com/blog that bring
customer-service hiring searches to the sign-up button.

### Tasks

1. **Build pipeline:** `scripts/build-blog.mjs` run as `prebuild` turns
   `content/blog/*.md` (front matter: title, description, date, slug, author)
   into `public/blog/<slug>/index.html` plus `public/blog/index.html`, in the
   landing's style (plain HTML, no React), each with title, description,
   canonical, Open Graph tags, `Article` structured data, `beacon.js`, and a
   closing "Post your first job free" tagged `utm_source=blog&utm_campaign=<slug>`.
   Needs a small Markdown library (`marked`), pinned.
2. **Routing safety:** add `blog` to the reserved short-link names in
   `src/lib/jobSlug.ts` and `api/job-prerender.mjs`; confirm `/blog` with a
   crawler user agent is not caught by the crawler-only job rewrite in
   `vercel.json`; do not enable Vercel `cleanUrls` (the prerender functions
   fetch `/index.html`).
3. **Discovery:** the build writes `public/blog-sitemap.xml`; add a second
   `Sitemap:` line to `public/robots.txt`; "Guides" link in the landing's top
   bar and footer; latest three posts on the landing (optional).
4. **First posts (drafts for the owner to add their experience to):**
   1. How to hire customer service agents from the Philippines
   2. What a remote support agent really costs (use the real $500/month)
   3. How we hired a team lead from 153 applicants in 4 days (the owner's
      own story; the owner supplies the details)
   4. Five chat tests to give before you hire a support agent
   5. Phone agent vs. chat agent: which does your business need?
   6. Hiring a front-desk agent for a medical or dental office
   7. A copy-paste customer service job post template
   8. Screening 150 applicants without reading 150 résumés
   9. What you can't ask Filipino applicants (age, birth date; RA 10911)
   10. Spotting fake or AI-written applications
5. **Pace after launch:** one or two posts a week, each linked from the
   YouTube descriptions and Quora answers.

### Verification

- `npm run build` produces the pages; each validates (HTML, structured data
  via a validator fetch); `/blog` and one post fetched live with Googlebot and
  Facebook user agents show the right tags; `page_view_daily` records
  `/blog/...` paths.

### Pass C specifics

- Proofread every post twice; check every claim against a source or the
  owner; no "AI" jargon aimed at applicants; links work; dates right.

### Lock-down

- Guards: `blog-slug-reserved`, `blog-pages-have-cta-and-tags`.
- Test: the build script on a fixture post. New doc `docs/BLOG.md`.

### Owner inputs

- The owner's details for post 3; their read of posts 1–3 before they go live.

---

## Phase 7 — Final audit loop

**Goal:** a fresh, full pass over everything before the marketing push.

1. Re-run the three audits from 2026-10-24 (security; product completeness
   as a brand-new business and as an applicant on a phone; growth/SEO) with
   fresh reviewer subagents that are given the goals, not the previous
   findings. Fix what they find, re-run until a round finds nothing.
2. Re-run the Supabase security and performance advisors; clear the
   `auth_rls_initplan` and `multiple_permissive_policies` warnings where
   cheap (wrap `auth.uid()` in `(select auth.uid())`; merge duplicate
   permissive policies).
3. `npm audit`: upgrade `zod` (breaking: 3 → 4; run every test) and
   `react-router-dom`, `source-map-js`; clear the rest where upgrades are
   safe.
4. Reconcile docs: every doc in `docs/` read once against the code; CLAUDE.md
   "Still Needs Setup" rewritten to the truth.
5. Ask the owner for the one live end-to-end run: sign up a new business,
   verify email, post a customer-service job, apply from a phone, finish the
   chat practice, get the email.
6. **Carried from Phase 1 (decided there, built here):**
   - **Enforce the CSP.** Read `client_error_events where release = 'csp'`
     (real traffic since 2026-10-25); allow anything legitimate in
     `scripts/csp.mjs`; then `node scripts/csp.mjs --write --enforce`, ship,
     and re-check every screen on the live site.
   - **Applicants stop reading staff columns of their own application**
     (`ai_score`, `ai_analysis`, `ai_scorecard`, `phase_ai_analysis`,
     `employer_notes`, `notes.avaScorecard`). Their pages read the row live
     (realtime works only on tables, not views), so the fix is moving the
     evaluation into a staff-only table (`application_evaluations`, one row
     per application, RLS for the business and its team), writing it from
     trigger-ava-analysis and the graders, and moving every cockpit read to
     it. Writes are already blocked (Phase 1 task 4). Prove with PGlite that
     an applicant session reads none of it. *(Built on a branch 2026-10-25,
     not shipped: see the Progress log. `notes.avaScorecard` moved into
     `ai_scorecard` too, after the branch's review.)*
   - **Applicants stop reading internal job columns** once they have applied
     (`passing_score`, `processing_mode`, `ai_bias_feedback`, step configs):
     same constraint (embedded selects on applications), same kind of fix.
     *(Reviewed 2026-10-25, deferred to "Later": the applicant's own step
     pages read `processing_mode` and `passing_score` (15 pages: auto-mode
     moving on, the pass mark), and the step configs are what those pages
     render, so hiding them means reworking every step page for little gain;
     `ai_bias_feedback` is a note on the post's own wording. No score of
     theirs or the team's view is among them.)*
   - **The RLS performance advisor**: 117 `auth_rls_initplan` and 143
     `multiple_permissive_policies` warnings (task 2 above). *(Deferred to
     "Later" 2026-10-25: at 155 applications the rewrite saves nothing
     measurable, and re-making 117 policies at launch is the kind of change
     that can lock real users out. Do it as one self-checking migration
     (each rewritten expression, with `(select auth.uid())` read back as
     `auth.uid()`, must equal the old one) when traffic makes it matter.)*

---

## Later (not in this loop; recorded so they are not lost)

### Phone practice call

The biggest build and the one that makes the "phone" half real: a simulated
caller in the applicant's browser (the voice stack behind `ava-voice-session`
exists and is gated to `platform_admins`), scored on tone, clarity, handling
and hold/transfer behaviour, with the recording and transcript kept for the
hiring team. Each call costs real money, so it is priced into the $99/job and
$299/mo, and it lands with Stripe.

### The sales practice records its turns (deferred 2026-10-25)

The Phase 7 security audit found the sales practice's grade forgeable: its
turns are never stored, so the grader reads the transcript the page sends,
both sides written by the applicant. Fixed for now in
`submit-sales-simulation`: only one of the step's own cases is graded, the
applicant's words are fenced, the job title and name come from the
database, and every sales grade is marked `transcriptSource: "browser"`, so
the scorer flags it and keeps the card on "review" (never trusted). The real
fix is the chat practice's machinery (record each turn in
`ai-sales-simulation` through `_shared/assessmentSession.ts`, resume on
reload, grade the stored turns), a large change for a step no live job has
and Ava's builder never adds. Do it before a business that sells hires
with it.

### Internal job columns and the RLS performance rewrite (deferred 2026-10-25)

See Phase 7, task 6: hiding `passing_score`, `processing_mode` and
`ai_bias_feedback` from applicants needs the applicant step pages reworked;
the 117-policy `(select auth.uid())` rewrite waits for traffic that makes it
worth the risk.

### Stripe (order of work from the 2026-10-24 audit)

1. Pricing details (owner): what $99 buys (days, applicants, re-opening),
   whether $299/mo is unlimited, what "free first job" means (published, not
   drafted).
2. Schema: Stripe customer per business, paid-jobs table, handled-events
   table, subscription state on `subscriptions`; retire the $49-unlock/pack/
   boost tables.
3. One entitlement check at publish/re-open (replaces `job_limit_for_user`),
   `platform_admins` the only exemption (never `home_alias`, never
   `subscription_bypass`).
4. Checkout function (one-time per job + subscription), success/cancel pages.
5. Webhook function: signature check, idempotency, checkout completed,
   subscription changes, invoice paid/failed, refunds.
6. Rewrite `get-subscription` and `useSubscription` for the new model
   (drop the trial row and the 120-minute voice grant).
7. Paywall screens: pricing on the landing, "upgrade to publish", billing in
   Settings.
8. Customer portal; invoices/receipts (Stripe-hosted); Stripe Tax; cancel/
   refund/failed-payment rules with a grace period; delete-account cancels
   the subscription; Terms updated; full test-mode run with replayed
   webhooks.
9. Philippines businesses: Stripe does not onboard PH merchants as far as we
   know and may not offer GCash/Maya; if PH businesses will pay, PayMongo or
   Xendit is the alternative, and an accountant should say whether the 2025
   PH VAT on foreign digital services applies. The owner adds the Stripe keys
   himself, last.

### Marketing push

Only after Phase 2's tracking is live and Phase 3's landing is up: YouTube
(the explainer in `video/` has never been rendered; it needs the owner's
Mac), Quora, directories, the blog. Use tagged links everywhere
(`?utm_source=youtube&utm_campaign=v1`).

---

## Progress log

Newest first. One entry per phase close-out, plus an entry whenever a
session stops mid-phase (say exactly where).

### 2026-10-26 (morning) — the owner said "keep looping"; product down to one-line fixes

Same session and way of working. The owner was asked whether the
classifier and age-filter loops should stop at a lower bar and answered
**"Keep looping"**: they run until a round finds nothing. Since 89d7fe41,
all live (CI and Vercel green, every migration md5-checked first, every
reached function deployed):

- **Security rounds 8–9** (43ad2eff, 1d4b389b; migrations recorded in
  docs/MIGRATION-HISTORY.md §4 through `file_queue_many_accounts`
  20261026044158): one account's uploads hold up only its own removals, an
  application stays on its job, many throwaway accounts cannot hold up a
  removal for good, and a document's files are found by its id only, with
  a test that fails on every weakening. **Round 10** (`sec10_report.md`)
  found one LOW-MEDIUM regression (a 200-account burst delays later
  removals about 30 runs per hour of burst); fixed by dd06765e (people
  take turns in the queue; `file_queue_in_turn` live 20261026060935,
  document-cleanup deployed, its next hourly run answered `ok`). **Round
  11** (`sec11_report.md`) found one LOW regression (a stream of new
  accounts makes a withdrawal's later folders wait longer each time) with
  a validated fix; fixed by 6c30ecd4 (a withdrawal's files go together in
  its turn; `file_queue_whole_turns` live 20261026130943, document-cleanup
  deployed). **Round 12** (`sec12_report.md`) found one MEDIUM (every run
  ranks the whole queue, so about 700,000 notes, a day of 1,000 free
  accounts, push the pick past the API's 8-second limit and the queue never
  empties again; round 11's extra sort lowered that size) and one LOW;
  **its fixer is running** (`r12_security_fix_brief.md`: a run's cost
  independent of the queue's size, with a timing check).
- **Phase 5 round 12** (`p5r12_report.md`) found one MEDIUM (one business
  and one throwaway applicant can flood the requested-papers removal queue,
  `document_file_trash`, which is read with no fair order, so a real ID
  outlives its 24 hours / 7 days), one LOW-MEDIUM (twelve weakenings no test
  catches) and three wording LOWs; none a regression. Fixed by 91b8e8b3
  (`id_papers_leave_on_time` live 20261026141250; document-cleanup and
  delete-account deployed, the next hourly run answered `ok`): a deleted
  request queues only a file storage holds, an applicant links only their
  own upload, 50 requests per application and 300 an hour per business,
  both papers queues read fairly by business, Delete Account and the
  Privacy Policy say what stays. **Round 13** (`p5r13_report.md`) found
  one LOW-MEDIUM (the rules that decide when an ID is deleted are tested
  only against old definitions: nine weakenings pass everything) and one
  LOW (an ID photo whose link was never saved is not deleted on time);
  nothing found on the live rules; fixed by d003e785
  (`id_paper_sent_again_is_queued` live 20261026161233; document-cleanup
  and requested-document-url deployed first, as the order needs): the
  rules held against their latest definitions (K1–K9 each fail a check),
  only a request's own folder is signed or deleted, a paper sent again
  queues its earlier copy. Left for after the security fixer's picks: an
  ID photo on a still-open request whose link save and the dialog's own
  removal both failed has no timer yet.
- **Product rounds 11–18** (2e4f3fbc, bbf8df0e, daac81e4, 841fe05e,
  3b3ca704, 90840167, cc7d54c4, 71048f2b): the documents flows for the
  owner and both kinds of teammate. A teammate who cannot send or review
  is never shown a button that does nothing or told it is their turn; the
  team's own decline is never quoted as the applicant's; a phone shows an
  applicant's papers above the score only while one waits for review,
  below it otherwise. Rounds 14–19 found only LOWs in the flows touched.
  **Product round 20 found no regression and nothing MEDIUM or worse: the
  product track is closed** (6fd0a5ec, plus 81ffeed7 for what it showed:
  "Interview", not "Interviewed", in both dialogs, and a check that reads
  the phone's own prompt). Known limits it listed, left on purpose: on a
  375×667 phone the "Propose times" prompt lands behind the decision bar
  after Move to Interview (as before round 18; "Set up interview" is the
  bar's filled button); the empty papers card suggests an NBI clearance and
  Wise or PayPal to every business, as the request list itself does (the
  owner's Philippines-first list, 2026-10-10).
- **Phase 4 round 17** (cc57adc3): the Type field decides over the title,
  a client's country is never the job's. **Round 18** (`p4r18_report.md`)
  found two HIGH regressions (a typed employment word made the default's
  "On-site" a choice; "check-in and check-out" as a call topic became a
  front desk) and validated patches; earlier probes 158 of 6,975 (the probe
  set grew), none newly failing. Fixed by 98a40caf (front end only; the
  first fixer hung on a shell command before changing anything and was
  restarted): round 17's rules cut back to their evidence, 61 new checks,
  earlier probes unchanged at 158 of 6,975. **Round 19**
  (`p4r19_report.md`) found six HIGH and two MEDIUM regressions (a
  country written after the client words was dropped, so "US company -
  Makati" saved as the US and USD; hotlines with written duties read
  mixed; either-way Types read on site; hotel check-in bullets read as
  customer service), each with a validated fix; fixed by 7022b369.
  **Round 20** (`p4r20_report.md`) found two HIGH and three MEDIUM
  regressions of round 19's narrowings, with a validated four-line patch,
  taken as it is in 10ed2430 (each case a check both ways). **Round 21**
  (`p4r21_report.md`) found two HIGH and two MEDIUM regressions of round
  20 and one old gap, with a validated four-hunk patch, taken as it is in
  88f9dd9c. **Round 22** (`p4r22_report.md`) found four HIGH (hotel and
  travel accounts read as in-person desks through round 21's spellings,
  and the reverse; a WFH line under the hiring's heading), with a
  validated patch, taken as it is in 223ccbf4. **Rounds 23 and 24**
  (`p4r23_report.md`, `p4r24_report.md`) each found three HIGH in the
  last round's narrowings (a WFH setup after a training section built on
  site; an in-person interview made a phone job a desk; front desks read
  as customer service), each fixed by the reviewer's validated patch
  (f6cbeef3, 0656e133; the second also made the setup check linear: 15,000
  lines under one heading took 1.3 s on every keystroke). **Round 25 is
  running** (`p4r25_brief.md`).
- **Phase 6 rounds 12–13** (cfe849c1, 7516beeb). **Round 14**
  (`p6r14_report.md`) found one MEDIUM regression (an HR desk's hold or
  callback excused a call about a job); fixed by 66fc652e (the six
  functions that import the filter deployed). **Round 15**
  (`p6r15_report.md`) found one HIGH regression (a quote that names the
  customer only inside it, "Are you a Medicare member? Are you 65 or
  older?", was dropped, and three practice cases with it) and four LOWs;
  fixed by 5104f206 (six functions deployed). **Round 16**
  (`p6r16_report.md`) found two MEDIUM (customer lines still dropped when
  the customer is named in the sentence before the quote; and, never
  caught by any round, the Philippine self-introduction template "My name
  is ___, ___ years old") and four smaller; fixed by 57925031 (six
  functions deployed). **Round 17** (`p6r17_report.md`) found two MEDIUM
  regressions against all three earlier rounds (a customer's own message
  giving their age read as a self-introduction; one customer named before
  the quote excused an age question to the applicant) and smaller ones;
  fixed by a8032927 (round 16's readings reverted or narrowed to their own
  evidence; six functions deployed). **Round 18 is running**
  (`p6r18_brief.md`).
- 4f97fe25: the dev server's dependency scan reads `index.html` only
  (design mock-ups import "three", which the app does not install, and the
  failed scan made a cold dev server too slow for the smoke test).

### 2026-10-26 (small hours) — security, product and growth converging; the classifier and age filter still looping

Same session (Opus 5.5), same way of working as the entry below. Every
commit here is live: CI and Vercel green, migrations applied one at a time
after the live body's md5 matched its source file, every reached function
deployed and answering. Since 65134bfa:

- **Security round 7** (a44a56d3): no regression, nothing MEDIUM or worse.
  Its three rules no test proved are now in
  `launch_locks_behaviour.pglite.test.mjs` (a clean insert, every form path
  shape, the resume's own folder; all 10 plain-path weakenings caught), and
  ai-analyze-portfolio holds its service-key downloads to the plain-path
  rule. **Security round 8 is running** (`sec8_brief.md`).
- **Product rounds 8–10** (e8e2b1af, a4b832a5, 49de2769): a letter the
  applicant signed in time can be countersigned after its date; every time
  on the signing record is true UTC; the audit trail's hash and status words
  are honest; a declined document opens with its reason, an expired letter
  reads Expired and is never "done" or asked to be signed at hire; a voided
  signed PDF still opens what was signed; Signed PDF only when both signed.
  Round 9 found no regression, round 10 one LOW. **Product round 11 is
  running** (`product11_brief.md`, scoped to 49de2769's flows).
- **Growth rounds 8–9** (2129371c, 5a008910): "already counted on the front
  page" is now a fact carried page to page (`seen=1`), not guessed from the
  referrer; checked live. **Round 10 found no regression of MEDIUM or
  worse**; its two LOWs are written in docs/ANALYTICS.md as known limits
  (d1e6c240). The reviewers' growth harness reached the live site through
  redirects in every round from 6 to 10 (page loads only, nothing written);
  `review-materials/HARNESS_NOTE.md` says what to change before any further
  growth round.
- **Phase 5 round 11** (5cca1c6a, e6a40987; migrations
  `file_queue_only_what_is_there` 20261026005714 and
  `applications_removed_only_through_delete_their_information`
  20261026005721): the file queue holds only what storage has (an
  applicant could flood it with start-and-withdraw loops), an account may
  start 20 applications an hour, a business deletes an application only
  through Delete their information, the team sign-up shows the agreement,
  and every rule the reviewer found unproven is proved.
- **Phase 4 rounds 14–16** (a9ba546e, 9e6df1ca, 1f5159c5, d1004efd) and
  **Phase 6 rounds 10–11** (c90c0ca2, 8d3dc720): each round fixed the last
  one's regressions, mostly from the reviewer's own validated patches, and
  each review found a few new ones. Publish now saves `is_remote` as
  exactly the builder's work mode. Earlier-probe failures for the classifier
  fell 211 → 165 → 117 → 116 → 116 with no new ones; the age filter's
  `known` list in its test records what each round chose to leave.
  **Phase 4 round 17 and Phase 6 round 12 are running.**

**For the owner:** these two loops may not reach a round that finds
nothing, because every round's narrowing opens a new edge case in a
regex classifier over free text. A stopping rule to consider: a phase
closes when a round finds no regression of MEDIUM or worse on common
input, and every LOW is fixed or written down as a known limit with its
reason (the rule growth round 10 already met).

### 2026-10-25 (evening) — the loop picked up from the HANDOFF: round 6 fixed, round 7 under way

A new session (Opus 5.5) picked up the HANDOFF entry below the same
evening and kept its way of working: fix jobs in agent worktrees with a
brief file each (`.claude/handoff/2026-10-25/review-materials/*_fix_brief.md`),
fresh read-only reviewers with a brief and no conclusions (`*_brief.md`,
reports `*_report.md` beside them), the full suite before every push, one
migration at a time after comparing the live body's md5, every reached
function deployed. Agent worktrees were cut from origin/main, not local
HEAD: merge with `git diff <its merge-base> <its commit> | git apply -3`.

**Shipped, in order (all live, CI and Vercel green):**
- e0ddb5ae: Phase 6 round 8 age filter (the HANDOFF's in-flight job 2). 8
  functions deployed.
- fe4ae1ad + eb6d62e4: growth round 6 (all five findings, four LOWs).
  Migrations `growth_google_is_search` (live 20261025221613) and
  `growth_front_page_not_staff` (20261025221619). Checked live: `/YouTube`
  in capitals lands tagged, sign-up links carry the tags.
- 84844d01: product round 6 (the "kept until you delete it" wording, on-site
  typing out of Analytics and the interview guide, the letter's worker type
  in the open, Hybrid, "Where", hourly pay, the signing footer and the
  applicant's audit trail). interview-guide deployed. `/terms` checked live.
- bceb48be: Phase 4 round 13 (58 of 59 report cases; the 50 known probe
  failures unchanged). Front end only.
- 9bc418f7 + 5393d6f1: security round 6 findings 2 and 3. The plain-path
  rule in applicant-file-url and requested-document-url (both deployed);
  `plain_file_paths` (live 20261025224159; the three live bodies matched
  their source files first, no stored row breaks it); the behaviour proof
  `scripts/launch_locks_behaviour.pglite.test.mjs` (every migration, then
  each lock as anon / authenticated / service role; all 22 of the
  reviewer's weakenings and 18 more fail it) and hardened guard readers.
- 0b33bb9c: Phase 6 round 9 age filter (three regressions of round 8 fixed:
  "70-year-old patients", "aged 21-35 in Cebu", the employer's own HMO
  dependents; the rule in every prompt that writes about an applicant).
  965 checks; 58 of 58 weakenings caught; 0 real lines newly dropped. 12
  functions deployed.
- e415c849: product round 7 (the applicant's audit trail says Voided /
  Waiting for countersign and "Verified" only when finished; My Documents'
  "To sign" holds only open papers; the pay row on a phone; "Where" without
  a stray "in"/"at"). Looked at in the dev preview at 375 and 1280 px.
- 2c5053bd: growth round 7 (a hiring link on a page opened from another
  HireFlow page carries no mark, so a front-page visitor is not counted
  again from Open jobs; applicants' "Sign in" links carry the channel; the
  Admin → Growth note).

**Reviews this session:** Phase 6 round 9 (3 MEDIUM regressions → fixed),
Phase 4 round 13 (2 HIGH → fixed) and round 14 (4 HIGH regressions of
round 13: walk-ins, the front desk, "US-based … account" places saving a
Makati job as US/USD, booking-titled planners → **fix job in flight**,
brief `p4r14_fix_brief.md`), product round 7 (LOWs only → fixed), growth
round 7 (1 MEDIUM regression → fixed).

**In flight when this entry was written:** the Phase 4 round 14 fix job;
security round 7 (`sec7_brief.md`, on 9bc418f7 and everything security
touched since 43f38221); Phase 6 round 10 (`p6r10_brief.md`); product
round 8, growth round 8, Phase 5 round 11 (a whole-phase re-check). If a
`*_report.md` for one of these is missing, it did not finish: run its
brief again.

**Left on purpose:** a hybrid job made with the builder's Type field opens
its letter on "In person" (hybrid is saved only as not remote; the business
picks Hybrid in step 1); an in-app forward on a job page still records two
job-page views.

**Noticed:** `client_error_events` has no CSP report at all yet (release
`csp`). With almost no traffic that proves little, so the policy stays
report-only.

**Still the owner's:** everything in the HANDOFF's list, plus the offer
letter's default worker type for a remote hire in the business's own
country (the letter now shows "Working as" openly; the default is still
"Independent contractor").

### 2026-10-25 (1:15 PM EDT) — HANDOFF: the session stopped mid-loop (the account's weekly credits ran out)

**Read this first, then the entry below it.** Everything up to and including
round 5 is live. Three pieces of work were in flight when the session
stopped. Pick each one up as described here.

**Live state when it stopped**
- App: Vercel production is 43f38221 (READY), checked in a browser (the blog's
  new wording; `/jobs.xml` parses, 0 jobs because the one live job has no
  country).
- Database: every repo migration through `20261025490000` is applied. Live
  versions are in docs/MIGRATION-HISTORY.md §4.
- Edge functions: everything touched through 43f38221 is deployed.
  `interview-reminders` goes out with the handoff commit (it leaves
  interviews changed in the last 30 minutes out of its query; the fifth
  security review's leftover).
- `main` has no uncommitted work after the handoff commit. The review
  materials (briefs, reports, probe scripts) are copied, not committed, to
  `.claude/handoff/2026-10-25/review-materials/` (gitignored, about 70 MB,
  on the owner's Mac). The session's scratch folder under /private/tmp will
  not survive a restart.
- Helper scripts are now in the repo: `scripts/ops/` (full suite, apply one
  migration, deploy functions, which functions a change reaches, smoke
  checks; see its README).

**Phase status:** Phase 1 is closed. Phases 2–7 are built and live, and
each is still in its Pass C loop: no entry records any of them closed. The
latest rounds:
- security review 5;
- product review 5;
- growth review 5;
- Phase 4 review 12;
- Phase 5 review 10;
- Phase 6 review 8.

Every one of those rounds' findings is fixed and live, except the two fix
jobs below.

**The whole plan, in one place** (the phases above hold the detail):
- **Why:** launch HireFlow for its niche, hiring customer-service agents (chat
  and phone) for any kind of business, safe and honest before outside
  businesses are invited. Stripe and marketing are out of scope; billing
  stays off and nothing may be paywalled.
- **How:** seven phases. Each one runs build → verify (the full suite plus a
  look in the app) → a fresh re-check by reviewers who get a brief and no
  conclusions → lock-down (a guard or test for every fix) → ship and check
  live. Then the re-check runs again, until a round finds nothing. The
  owner's rule: work autonomously and don't stop until it is done.
- **Phases and what is left:**
  1. **Security holes:** closed.
  2. **Quick fixes before outside businesses** ("player" wording, the Zulu
     script, landing counting, the business email check, bot check, share
     step): built and live. Turnstile waits on the owner's keys. Its
     re-checks now run inside the security, product and growth reviews.
  3. **Look and landing** (ink, ivory and brass, no green; one logo; the
     landing rewrite): built and live. The www → apex 308 is the owner's.
  4. **Ava for customer-service hiring** (the classifier, channel, packs,
     grading, question banks, interview guide): built and live. Round 12's
     fixes are ready in their worktree (below). After they ship, run review
     round 13. The classifier has needed many rounds: keep the "undo before
     you add" rule in its briefs.
  5. **Legal, consent, cost guardrails** (the legal pages, the privacy line at
     sign-up and on the form, "Delete their information", per-business AI
     budgets): built and live. Review 10's fixes are live. Run review 11.
     The owner's inputs are still missing (the LLC's state, a privacy email).
  6. **Blog** (the build pipeline, the no-age guide, the posts): built and
     live. The blog part of review 8 is live; its age-filter part is in
     flight (below). Then run review 9.
  7. **Final audit loop:** the security, product and growth reviews, round
     after round. Round 5's fixes are live; round 6 is in flight (below).
     Also left: enforce the Content-Security-Policy after a day of clean
     reports (`node scripts/csp.mjs --write --enforce`).

**In flight 1: Phase 4, round 12 fixes. SHIPPED with this commit (rebased onto
b2043a30 in its worktree; the full suite passed there). What follows is kept
for the record.** Next for Phase 4: run review round 13 on it (copy
`review-materials/p4r12_brief.md`, point it at this commit, and keep the
"undo before you add" rule). Commits 121f6b8c (the fixes), then 2732b34e
and c4c82c44 (HANDOFF.md). Results:
- all 48 report cases pass, and so do 84/84 of every listed case;
- the earlier probes have the same 50 old failures and 0 new;
- customer_service_hiring has 1755 checks and remote_from_location 105, all
  passing; guards and tsc pass.

Its HANDOFF.md says what it narrowed back and why. One LOW is left: "Customer
Service - Hospitality Staff" answering hotel guests' calls and emails. To
ship:
1. Bring it over with
   `git -C .claude/worktrees/agent-ac0b35b8fa3d25d86 diff bd5c5e98 121f6b8c > p && git apply -3 p`.
   Leave out HANDOFF.md.
2. Run `scripts/offer_letter.test.mjs` (it imports `placeSaysRemote`) and
   then `scripts/ops/fullsuite.sh`.
3. Commit and push. It is front end only, so there are no functions to
   deploy.
4. Update the stale line in this plan that says the plan promises a
   practice call. The builder no longer does.

The original instructions follow.

**In flight 1 (original instructions): Phase 4, round 12 fixes (the job classifier and place reader).**
- Worktree: `.claude/worktrees/agent-ac0b35b8fa3d25d86`, branch
  `worktree-agent-ac0b35b8fa3d25d86`, cut from bd5c5e98. It was told to commit
  its work in progress and write `HANDOFF.md` at its root before the credits
  ran out.
- Brief: `review-materials/p4r12_fix_brief.md`. Report:
  `review-materials/p4r12_report.md`. Cases and probes:
  `review-materials/r15/`, with earlier probes in r7–r14.
- Two items were added by message after the brief, both in
  `src/lib/avaEngine/customerService.ts` around line 310:
  - the builder still tells the business that typing speed is measured for
    an on-site job (it is not, since round 5);
  - for a US dental office it says "written so a careful second-language
    reader can answer in time" and "A practice call is coming", as if a step
    were promised.
- To finish:
  1. Read `git -C <worktree> log` and `diff`, and its HANDOFF.md.
  2. Run the tests the brief lists, plus `check_report.mjs` and `reg.mjs`.
  3. Finish what is left.
  4. Bring it to main with `git -C <worktree> diff bd5c5e98 HEAD > p && git apply -3 p`.
     Main has moved to 43f38221 since. `src/cockpit/lib/offerLetter.ts` now
     imports `placeSaysRemote` from `src/lib/jobLocation.ts`, so run
     `scripts/offer_letter.test.mjs` after the merge.
- If the worktree is empty or broken, start the brief again in a new
  worktree, with the brief's paths changed to the handoff folder.

**In flight 2: Phase 6, round 8 fixes (the age filter). DONE in the worktree at
about 1:55 PM, NOT merged or deployed.** Branch `worktree-agent-a07c1ca3f90e54023`.
Commits: f3f0f394 (work in progress), d6db4de2 (HANDOFF.md), and **dfb491c0
(final)**. Results:
- `scripts/age_wording.test.mjs` went from 669 to 838 checks, all passing,
  and 126 of the 169 new checks fail on the old module.
- Over 12,906 real lines in the repo, the new filter drops 0 lines the old
  one kept.
- Every related test, the 226 guards and the Deno check pass.

What it changed:
- caller identity checks, "Medicare starts at 65", "parent or guardian",
  dependents and the like are kept;
- "a 25-year-old" in a hiring sentence, "We hire students aged 18-24" and the
  plain forms of finding 4 are dropped;
- the grader remarks of finding 5 are dropped;
- a new `APPLICANT_AGE_RULE` goes into ai-analyze's and trigger-ava-analysis's
  prompts (text only) and into ai-shortlist (imported);
- "CEO at age 22" is gone from ai-analyze.

What it left is in its HANDOFF.md: "young team" is still dropped on
purpose, and a few rare wordings pass.

To ship:
1. `git -C .claude/worktrees/agent-a07c1ca3f90e54023 diff bd5c5e98 dfb491c0 -- . ':!HANDOFF.md' > p && git apply -3 p`.
   Main changed trigger-ava-analysis and ai-analyze after bd5c5e98, so
   resolve any conflict by keeping both changes.
2. Run `scripts/age_wording.test.mjs`, `ava_analysis_applicant_limits`,
   `lead_scoring_scenarios` and then `scripts/ops/fullsuite.sh`.
3. Deploy every function `node scripts/ops/deps.mjs supabase/functions/_shared/ageWording.ts supabase/functions/ai-analyze/index.ts supabase/functions/trigger-ava-analysis/index.ts supabase/functions/ai-shortlist/index.ts`
   names.
4. Commit and push.
5. Then run Phase 6 review 9 (copy `review-materials/p6r8_brief.md`).

The earlier state follows.

**In flight 2 (earlier state): Phase 6, round 8 fixes (the age filter). STILL RUNNING at 1:30 PM.**
It committed work in progress (f3f0f394, "partial, tests not yet added") and
d6db4de2 (HANDOFF.md). It then kept working, with uncommitted changes to
ageWording.ts, its test, ai-analyze, ai-shortlist and trigger-ava-analysis.
If the session ended before it finished, read its HANDOFF.md and
`git -C .claude/worktrees/agent-a07c1ca3f90e54023 diff`, and finish from
there.
- Worktree: `.claude/worktrees/agent-a07c1ca3f90e54023`, branch
  `worktree-agent-a07c1ca3f90e54023`, cut from bd5c5e98. The same
  instructions apply: committed work in progress plus HANDOFF.md.
- Brief: `review-materials/age8_fix_brief.md`. Report:
  `review-materials/p6r8_report.md`. Probes: `review-materials/p6r8/`.
- The must-fix part is that ordinary medical, insurance and tax
  customer-service text is dropped: a caller's identity check ("please
  confirm your date of birth"), "Medicare starts at age 65", "Are you a
  parent or guardian?", dependents.
- It may also add the no-age prompt rule to trigger-ava-analysis,
  ai-analyze, generate-applicant-dossier and ai-shortlist. Main changed
  trigger-ava-analysis and ai-analyze in 43f38221 (the fence rule, on-site
  typing), so merge with `git apply -3` and re-run
  `scripts/ava_analysis_applicant_limits.test.mjs` and
  `scripts/lead_scoring_scenarios.test.mjs`.

**Round 6 security and product reviews: DONE (about 1:50 PM).** Reports:
`review-materials/sec6_report.md` and `review-materials/product6_report.md`.
To fix, most severe first:
- **Security 1, MEDIUM, regression from 43f38221: a fake listing in every
  feed.**
  - What happens: `sendXml` stripped XML-illegal characters from the finished
    feed after `cdata()` had escaped `]]>`. A control character inside
    `]]>` then rebuilt the terminator, so a business could inject its own
    `<job>` into jobs.xml, adzuna.xml and jooble.xml.
  - **Fixed in the handoff's last commit:** the characters are stripped from
    each value inside `cdata()` before escaping. See that commit's test.
- **Security 2, MEDIUM: the plain-path rule is missing from two functions.**
  - `applicant-file-url` (`filePaths.ts`) and `requested-document-url`
    (`inOwnFolder`) accept a stored `%2e%2e`.
  - Call `isPlainObjectPath` in both.
  - Also refuse `%` in the database rules for resume_url, form files and
    request files (`applications_applicant_write_rules`,
    `applications_insert_resume_own_file`, the document-request file rule).
    Compare each live body's md5 with its migration first.
- **Security 3: the guards miss natural weakenings.**
  - The file-queue trigger:
    - `WHEN (false)`;
    - another table;
    - FOR EACH STATEMENT;
    - ENABLE REPLICA;
    - SECURITY INVOKER;
    - an early `return old`.
  - `remove_applicant`: granted without `public.` or `ON ROUTINE`.
  - `ai_budget_take`: an early `return true`, or a raised cap.
  - Phase-7 guards: bodies quoted `$function$` instead of `$$`, and
    `SECURITY DEFINER` written after the body.

  Better than more regexes: one PGlite test that applies every migration
  that touches these functions, in order, then exercises them as anon or
  authenticated. The reviewer's harness is `review-materials/p7s6/`
  (`weaken.mjs`, `queue_weaken.pglite.mjs`).
- **Product 1, MEDIUM, regression: the new wording promises a deletion the
  business cannot do.** The Terms and the request screen say a named paper
  is "kept until you delete it". But a request can be deleted only before
  anything is uploaded (the live policy), and after that only "Delete their
  information" (the whole application) removes it. Either:
  - add a "Delete this file" for a received request, which needs an edge
    function that removes the file and logs it; or
  - reword it to "kept until the application or the account is deleted".

  Rewording is the quick fix.
- **Product 2, MEDIUM: Analytics still measures on-site phone typing.**
  `src/cockpit/lib/analyticsView.ts` (~391) reads the chat typing with no
  on-site check. `Analytics.tsx` (~193) has `job.is_remote`; pass it in and
  skip on-site rows. The interview guide does the same (`guideMaterial.ts`
  ~172, LOW).
- **Product 3, plausible: a remote US hire's letter defaults to
  "Independent contractor … your own taxes".** The letter should default to
  employee when the job's country is the business's own, or at least show the
  worker type outside the collapsed terms. The owner may want a word on this.
- **Product LOWs:**
  - an hourly range job's letter starts on "a month" (`OfferLetterDialog.tsx`
    ~285);
  - "Where" can read "In person, at On-site - Makati" or "at Texas" (strip
    the work-mode words; treat a US state like a country);
  - the applicant's PDF footer is an empty strip, and an applicant who
    signed cannot see the audit trail until the countersign;
  - a hybrid letter drops the word hybrid.

**In flight 3: round 6 reviews of 43f38221. The growth review is DONE**
(`review-materials/growth6_report.md`); security and product were still
running at 1:30 PM. The growth findings to fix:
1. **Medium, regression:** the staff sign-up's new "← hireflownow.com" link
   (`src/pages/Auth.tsx` ~597) drops the visitor's tags. Wrap it in
   `withVisitorTags`, or carry the tags.
2. **Medium, regression:** the `hiring_link` exception in `public/beacon.js`
   (~118) counts too much and too little.
   - Too much: carry-source.js copies `job_page/hiring_link` onto the front
     page's own links, so one "Post a job free" click counted 4 campaign
     visits.
   - Too little: a visitor who arrived tagged gets a link that no longer
     says `hiring_link`.

   Count a hiring link once: on landing from another page of the site, and
   only the first time.
3. **Medium, old:** every applicant account shows as "unknown". Apply goes to
   `/candidate/auth?redirect=…&tab=signup` with no tags
   (`src/pages/JobDetails.tsx` ~278), and the candidate sign-up reads only
   its own address.
4. **Medium-low:** "google" is still not search only.
   `20261025480000_growth_app_sources.sql` line 27 matches every `com.google.*`
   app (Gmail Go, Messages, Drive, Chat, Meet, YouTube Music) and
   sites.google.com / news.google.com. Name only the search app and
   `www.google.*` / `google.*` hosts as google.
5. **Low-medium:** `/YouTube` typed with capitals forwards from inside the app
   (`JobDetails.tsx` ~67), so the front page drops the tags. Do the forward
   case-insensitively in vercel.json, or carry the tags.

The LOW items are in the report.

The original instructions follow.

**In flight 3 (original instructions): round 6 reviews of 43f38221 (security, product, growth).**
- Briefs: `review-materials/sec6_brief.md`, `product6_brief.md` and
  `growth6_brief.md`. Each saves its report to the old scratch folder.
- If a `*6_report.md` is not in the handoff folder, the review did not
  finish. Run the brief again with its save path changed to the handoff
  folder.

**Then the loop goes on:**
1. Ship the two fix jobs: run `scripts/ops/fullsuite.sh`, deploy what
   `scripts/ops/deps.mjs` names, commit and push.
2. Run Phase 4 review 13 and Phase 6 review 9 on what shipped. Copy the
   shape of `p4r12_brief.md` and `p6r8_brief.md`.
3. Fix whatever the round 6 reviews find.
4. Close each phase on a Pass C that finds nothing.

Every review brief since round 5 tells the reviewer to report every
regression and anything MEDIUM or worse, and at most five real LOW items, so
the rounds converge. Keep that.

**How this session worked (keep doing it)**
- Run the full suite before every push.
- Migrations:
  - apply them one at a time, 3 seconds apart, by name;
  - stop at the first failure;
  - before replacing a function, compare the live body's md5
    (whitespace stripped) with the repo's;
  - record the live version in MIGRATION-HISTORY §4 and in this log.
- Add every new migration to `NOT_THE_CHECK` in
  `scripts/business_email_check.pglite.test.mjs`, with its reason.
- Deploy every function a change reaches.
- End commits with "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>".
- Never use a bare `git stash`.
- Since 2026-10-25, Vercel's automatic bot check answers plain requests to
  hireflownow.com with 403 (`x-vercel-mitigated: challenge`).
  staff.hireflownow.com and the Supabase functions are not affected.
  - Check the site in a browser, and don't poll it.
  - Use Vercel's deployment list for build state.
  - Pausing the check (`vercel firewall system-mitigations pause`) is the
    owner's decision.
- Big parallel fixes went to agents in their own worktrees; their commits were
  brought over with `git diff`/`git apply`. Fresh reviewers got a brief file
  and no conclusions.

**Still the owner's to give or decide:**
- the LLC's state of registration and a legal/privacy contact email;
- Turnstile keys;
- the www → apex redirect as 308;
- an OpenAI spending cap;
- Google for Jobs;
- a lawyer's read of the offer letter's trial and notice terms;
- whether to pause Vercel's bot check;
- whether the landing's "153 applied, 71 finished, 3 worth a call" stands
  (live rows: 155 applications, 2 hires).

**Old worktrees:** those from earlier rounds (`agent-a1459f6b…`, `a298cd82…`,
`a3ecb7a5…`, `a9a2c6f6…`, `affd8ddb…`) are merged. They can be removed with
`git worktree remove`.

### 2026-10-25 (small hours) — round 5 of security, product and growth; Phase 5 round 10; Phase 6 round 8; Phase 4 round 12

Six fresh reviewers read bd5c5e98 (live). No reviewer made a request to the
live site: Vercel's automatic bot check was answering every non-browser
request to the apex with a challenge, so live checks went through the browser
pane only. Fixed:

- **Security, round 5** (1 confirmed containment bypass, the rest low):
  - A document's file address double-encoded (`%252e%252e`) passed the
    one decode, kept the sender's folder at the front, and was downloaded with
    the service key from another folder. Every stored path must now be plain:
    no `%`, backslash or control character, no dot segment
    (`isPlainObjectPath`). The resume reader holds a resume to the same rule.
    The document wizard names an upload with plain letters only (an accented
    name failed to upload).
  - Each function's fence word differed, so ai-analyze's rule named a
    marker trigger-ava-analysis's content never used. The rule now names every
    fence in what it scores (`fenceTokensIn`; a word an applicant manages to
    add would only fence more).
  - One business's control character made every XML feed invalid: every feed
    now goes out XML-safe (`xmlSafe` in `sendXml`).
  - Left: reminders crowded by interviews changed in the last 30 minutes
    (plausible only, as before).
- **Product, round 5:**
  - On an on-site job, the chat practice's typing (taken on a phone) still
    marked the applicant in Ava's scorecard, the team-lead blend and the
    shortfalls. All three now skip it.
  - A job with no currency is never read out as USD: not in the written
    interview's pay answer, the spoken interview's context, or the offer
    letter. The letter starts on no currency, takes the job's own even for a
    range, and asks for one before it can go.
  - The letter's "Where" is a place someone goes to, never "Work from home"
    or a bare country, and the business can type it.
  - On an uploaded PDF, the applicant sees the finished copies and the audit
    trail only once it is signed. "Before you sign" and the PDF-only message
    are said to the right person, and on Android the opened file carries the
    document's name.
  - A hybrid job is saved as not remote, as it is built.
  - Left: /login, /signin and /signup go to the business door, which points a
    job seeker to their own portal and hands over an applicant who signs in
    there. The unlinked /jobs/create-legacy still starts on USD.
- **Phase 5, round 10:**
  - A deleted application queues its recordings, video introduction and work
    samples every time, with the function's own rights
    (`application_files_go_with_it`, live as 20261025165914). Before, a
    withdrawal ("removes your application for good") left the video and work
    samples, and a recording uploaded before its link was saved was never
    queued.
  - The guards now catch the weakenings the reviewer's harness found:
    - the business branch's own `return false`, and its card claim;
    - `GRANT ALL` and plain `CREATE FUNCTION` remakes;
    - `ALTER FUNCTION … SECURITY DEFINER` on the limit triggers;
    - `ALTER TABLE IF EXISTS … DISABLE TRIGGER`;
    - a trigger remade on another table;
    - `or (true)`.

    A new check holds the file-queue trigger (each of 12 weakenings was tried
    and caught). Its test now deletes as the applicant, so it fails without
    SECURITY DEFINER.
  - The Privacy Policy no longer says typing-test starts stay after Delete
    Account (they go with the applications).
  - The Terms and the request screen say only the three ID choices are deleted
    after opening, and warn when an ID is named under "Something else".
  - The cleanup alerts say "files queued for removal" and name every source.
  - Left: a spoken-interview session is one budget unit whatever its length
    (voice is HireFlow's own only, bounded by the step's minutes and its own
    6,000 a day).
- **Phase 6, round 8 (blog part):**
  - The guides no longer say a person makes "every decision": on an
    auto-mode job Ava moves strong applicants on by itself. They now say a
    person makes every decline and every hire.
  - A guide may name its own feed.
  - The 404 page's plain fallback is never cached.
  - Left: the GitHub-source link rule can be got around through jsdelivr
    (the repo is public anyway). The launch figures need the owner's word: live
    rows show 155 applications and 2 hires.
- **Growth, round 5:**
  - App referrers (Gmail, YouTube, Facebook, Instagram, LinkedIn, TikTok,
    WhatsApp, Telegram) are named as their channel (`growth_app_sources`,
    live as 20261025165906), and "google" is search only.
  - A link with its own source keeps it as the campaign when the visitor's
    tags carry none, and a hiring link from inside the site still counts.
  - Open jobs and careers pages carry the visitor's tags onto a job.
  - A short way in typed at a job's address goes where the short way does.
  - The staff sign-in links back to the front page.

### 2026-10-25 (late night) — round 4 of security, product and growth; Phase 5 round 9; Phase 6 round 7; Phase 4 round 11

Six fresh reviewers read 84688c10 (live). Fixed:

- **Security, round 4** (2 medium, the rest low): a business could change a
  letter while the applicant read it, and the screen showed the new one in
  place, so the "what was shown" hash covered it: a sent document's content
  is now fixed for every browser (`security_round4`, live as 20261025155540) and the letter
  screen keeps the letter as it opened, warning if it ever differs. Word and
  text uploads were signed blind and never countersigned: signing takes PDFs
  only (the wizard, the viewer and the signing function). The kept copy is
  named by its own hash, so racing signs cannot overwrite it, and both sides
  view that copy after the applicant signs (`original`). The fence markers
  carry a word made when the function starts, so no look-alike closes them.
  An applicant's new application keeps a resume link only from their own
  folder, the backfill takes plain paths only, and an application with no
  notes yet takes notes again once it has moved on. Left: a departed
  teammate's uploaded, unsigned document cannot be signed after their
  account is deleted (0 live); reminders crowded by interviews changed in the
  last 30 minutes (plausible only).
- **Product, round 4:** any "office" in the place made a remote job on-site
  ("Remote (home office required)", "Remote, US office hours"); "Work at
  home", "Telework", "Virtual" are remote, "Not WFH" is not. Edit job has a
  "Done from home (remote)" switch beside the place, which a place that says
  so sets as it is typed: remote work never flips unseen. No USD is guessed
  anywhere (feeds print pay only with its currency, the offer letter and
  Edit job leave it to the business). Lists show a remote job's own place
  ("Remote (US only)"). A phone can open an uploaded PDF in its own tab, and
  the viewer no longer says signatures were applied before anyone signed.
  The on-site offer letter names the job's place. "US Account", "US Shift"
  and ", or" no longer pick a country.
- **Growth, round 4:** short addresses a video can say
  (hireflownow.com/youtube, /tiktok, /facebook, /instagram, /linkedin) land on
  the front page tagged, and a business's guesses (/signup, /login, /pricing)
  reach the right page; those names are reserved for jobs. Open jobs, job
  pages and careers pages carry the visitor's channel on, the referring site
  as the source with the page kept as the campaign. A move inside the site
  counts no campaign visit again. Admin → Growth names each channel once
  ("facebook" for its tag and its four hosts; `growth_sources`, live as 20261025155516).
- **Phase 5, round 9:** a spoken-interview recording goes with its
  application, so Delete Account and a withdrawal remove it
  (`voice_recordings_go_with_application`, live as 20261025155532); a refused AI call gives
  its units back and the two business cards are told apart; the admins'
  alerts count units (`phase5_review9`, live as 20261025155525); each cleanup list's read
  failure has its own alert; the Privacy Policy names Daily, the spoken
  interview's AI, the papers kept by their own name and the minutes record;
  the guards catch a later DROP FUNCTION CASCADE, a disabled or replica-only
  trigger, an AFTER INSERT remake, a browser grant and an "or true". Left: a
  PDF's pages are not counted by the budget (only the work-sample review sends
  PDFs, ten a day per application), and no business is told when the whole
  platform's day is used (the admins are).
- **Phase 6, round 7** (fixed in its own session, merged; severity tied to
  what the AI writes under its no-age rule): the age filter keeps a medical
  front desk recording a caller's age, customers described as people, women
  or loan applicants of an age, a product's age limit, the business's own age
  and grader remarks about the work; it now drops "over the age of 21",
  combined form labels ("Sex, age, civil status"), DOB asks, pregnancy,
  marital and childcare questions, "fresh graduate", "legal age", birth-year
  limits and grader remarks on an applicant's age or family; a quiz step's
  own questions and a lead's quoted evidence are filtered. 669 checks; over
  10,596 real strings it drops nothing the old filter kept. Left: the written
  interviewer's streamed questions (the prompt forbids them; filtering the
  stream would make the record differ from what the applicant saw).
- **Phase 4, round 11** (fixed in its own session, merged): online shops
  (TikTok Shop, Facebook shops, WooCommerce, Zalora) and a chain's
  nationwide line are customer service again; a store part is a call-centre
  account only on real evidence (a foreign client, a site the agent works
  at, a plan's members, the customers' software, a hotline); "Front Office"
  titles are no venue; conferences rule out a reservations agent only when
  the work plans them; the benefits bullets go wherever the heading sits;
  "Join us" no longer reads as the US. 43 of 43 report cases, 1658 checks,
  every earlier probe unchanged.

### 2026-10-25 (night) — Phase 7 security, product and growth, round 3; Phase 5 round 8; Phase 6 round 6; Phase 4 round 10

Six fresh reviewers read 3344aa6b (live). Fixed:

- **Security, round 3** (1 high, 4 medium, the rest low):
  - *High:* the sender's browser still chose v1, and an uploaded file stayed
    in the sender's own folder, so a business could show one file and
    countersign another. Now, when the applicant signs, the server hashes
    what is being signed (the letter's text, or the file's bytes), refuses
    unless the applicant's screen hashed the same (`viewedHash`; the file is
    framed from the very bytes it hashed), makes that v1, writes the letter
    back exactly as shown, and copies an uploaded file to
    `documents/<id>/original.pdf`, which only the server writes; the
    countersign reads only that copy and checks a letter against v1 again
    (`_shared/documentShown.ts`). An uploaded PDF sent without a hash can
    now be countersigned.
  - *Medium:* an applicant's resume link must be a file in their own
    folder (300 characters, no line breaks) and locks with the answers, as
    do the form's file answers (`security_round3`, live as 20261025150114); the resume
    name and the form's question text are fenced and capped in both scoring
    prompts, and the server backfills a resume only from the applicant's
    own folder. The ID-deletion alerts could still be silenced by an
    applicant to HireFlow's own job: "told today" is the server's own
    record now (`daily_alert_claims`, live as 20261025150051). Interview reminders are
    looked for in each reminder's own window, so not-yet-due rows never
    fill the pick.
  - *Low:* the feed cleaner turned an entity-encoded `javascript:` link
    into markup (only the tags it keeps become "<" now); delete-account
    reads every list a page at a time and stops if the hand-over cannot be
    read; a browser's document is sent now, by the signed-in account
    (created_at and sender_id); near-copies of the fence marker are
    removed; a big file costs the AI budget by its size.
  - Left: HireFlow certifies the email a signer signed up with, and email
    confirmation is off (the owner's call; Turnstile and confirmation are
    owner inputs).
- **Phase 5, round 8:** the business's "AI day used" card tells a new
  business that confirming its email gives the full day, and neither card
  counts "calls" (`phase5_review8`, live as 20261025150059); a withdrawal note goes with
  the account (`withdrawals_go_with_account`, live as 20261025150106); a failed read is
  told as a failed read, the two retry queues' reads are told too; the
  Privacy Policy says the spoken interview records the camera, that the
  applicant sees the result some steps keep, that work samples go to the AI,
  what the removal and withdrawal notes are, and no longer that applicants
  can turn emails off; the Terms' pause rule names a document to sign; the
  report's refusal no longer says "your answers are saved"; a shared file
  named with an accent survives a stray "%" elsewhere; the removal guard
  reads no comments, and new guards hold the business card, the alert
  record and the limit triggers against a later DROP.
- **Product, round 3** (2 high from round 2's own fixes): remote work is
  read from the place and the Type field the way businesses write it
  ("Home-based, Philippines", "Philippines (Remote)", "Makati (WFH)",
  "Anywhere", "WFH"), one rule for the builder and Edit job
  (`placeSaysRemote`), and Edit job keeps a job remote when only its city
  changes; a remote job's place picks no currency (it showed PHP); "Laguna
  Beach, CA" is in the US and "New Mexico" is no Mexico; an on-site job's
  chat typing is no bar in the team's record either; the certificate,
  audit export and signature PDFs in the app say how the document was
  signed (no ESIGN/UETA claim) in ink and brass, and the guards read PDF
  colours and those claims; Edit job says Publish Job, not Save; the
  withdraw dialog and its refusal match the 30-day rule; an on-site offer
  letter says where the work is; the business sign-in fields carry
  autocomplete. Left for the owner: the offer letter's trial and notice
  terms for an employee (a lawyer's read), paste on the application form
  (blocked on purpose), phone jobs tested by chat.
- **Growth, round 3:** a visitor's tags, or the site that sent them, ride
  on through the logo, the guides and Open jobs; an untagged visitor's
  referring site is the source of the sign-up, the page's own campaign
  kept; sign-up tidies a tag as the counter does ("Spring Sale" is
  "spring-sale"); the team's own "see your job" clicks carry the staff site
  as referrer and stay out of the counts; the 404 page counts nothing;
  Open jobs keeps HireFlow's site name in its first HTML; the Admin note
  says what "unknown" covers.
- **Phase 6, round 6** (the age filter fixed in its own session, merged):
  494 checks; age limits, birth-year, marital and family questions and
  options are dropped, ordinary customer-service text about older customers,
  score targets, product age limits and "24/7" is kept; the written
  interview's grader, the workflow's prompts, scenarios and quiz keys and the
  interview guide are filtered too. The build refuses a "draft:" line below
  the front matter however it is written, and a link to a guide's source on
  GitHub; the 404 function never calls itself; one guide says "tries to
  paste".
- **Phase 4, round 10** (6 high regressions from round 9, fixed in its own
  session and merged): a store part in the title is a call-centre account
  when the words show a client ("a US retail account", night shift, a
  hotline); a support line keeps its qualified front-line people ("Billing
  Specialist", "Healthcare Account Agents", "Representative II", "Help Desk
  - Analyst"); the usual US benefits list no longer leaves "dental" behind,
  and a plan the work is about stays; "inbound only" means phone only when
  no written channel is named; telephone experience reads as phone; the
  how-to-apply filter keeps real duties and now also drops walk-in and
  shortlist lines; a negated remote word, freight brokers' and models'
  bookings and in-store help read right; the filters are linear (90 KB in
  10 ms, it was 4.4 s). 52 of 52 report cases, 1601 checks; the 13,500-title
  support-line sweep reads 11,667 as customer service (6,819 before).

### 2026-10-25 (evening) — Phase 7 security review, round 2; Phase 5 round 7; Phase 6 round 5; staff columns round 3; growth round 2

- **Security, round 2** (a fresh reviewer; 4 high, 10 medium, ~15 low). Fixed:
  - *High:* a business could insert a document already "signed" and /verify
    vouched for it: a browser's document now starts pending and unsigned,
    with a database-made code (`documents_start_unsigned`, live as 20261025140322). The
    countersign burned the applicant's signature into whatever its address
    served: it now reads the sender's own upload from the documents bucket
    and refuses one that does not hash to v1; the signing view frames only
    such a file. /verify says verified only for a document signed by both
    and finalized. Any test could be skipped through complete-video-intro:
    it now refuses every step that is not a video step. One AI budget unit
    paid for a prompt of any size: units are now one per 40,000 characters
    plus one per file or image (a normal call is still one).
  - *Medium:* an applicant may now move their status only from in_progress
    to pending, rewrite answers only while the form is theirs, and re-apply
    to a job they withdrew from only after 30 days; nobody but the applicant
    points resume_url at a file (`applicant_writes_round2`, live as 20261025140330).
    Applicant text is fenced everywhere in Ava's prompts (name, email, phone,
    file answers, ai-analyze's cross-reference block). Interview writes are
    counted (20 an hour to one applicant, 200 in all) and last 5–240 minutes;
    reminders pick the soonest still owed (`interview_write_limits`, live as 20261025140338).
  - *Low:* the feed cleaner turns an unclosed tag into text; jooble's job id
    is letters and digits only; the prerendered pages take a business's "$`"
    as text; delete-account hands over only the business's own chats; the
    applicant and the team have separate report allowances.
  - Left, with reasons: step verdicts in notes (chatInterviewResult's
    recommendation and concerns, portfolioResult.aiAnalysis) and
    voice_interview_result stay applicant-readable: moving them into the
    staff table means moving every reader, as the evaluation move did (next
    round of staff columns). Many throwaway accounts can still drain AI days
    and the shared email-code ceiling, and Supabase Auth's email limit is 30
    an hour for the whole project: Turnstile (the owner's keys) and the
    Resend plan (the owner's account) decide those. Email confirmation stays
    off (the owner's call), so HireFlow can be made to mail an address
    someone signed up with.
- **Phase 5, round 7:** ID-deletion alerts could be switched off with a
  self-written card dated 2099: a browser's card now carries the database's
  time (`notifications_server_time`, live as 20261025140346) and document-cleanup reads only
  the admins' bells, tells each failure apart and tells leftover files too.
  The improvement report and the portfolio show the server's own words on a
  refusal. remove-applicant compares shared files decoded both ways and
  drops "#" fragments. The Terms, Help and Privacy Policy say the new pause
  rule and the video introduction. The budget and removal guards read block
  comments and the latest definitions.
- **Phase 6, round 5:** the no-age filter rewritten: an age is the
  applicant's unless it is attached to the person it describes (patients
  aged 65, a 70-year-old caller); numbers near "applicants", answer options
  and metrics are no ages; the reviewer's ~130 wordings are in the test (374
  checks). Rationales keep their positions; the practice prompt, step titles
  and the written interviewer carry the rule. Posts no longer say "never ask
  for age" beside HireFlow's own 18+ question; the fake-applications guide
  says what HireFlow notes during tests; two draft tricks fail the build.
- **Staff columns, round 3:** nothing exposed or lost; no leftover scores live
  (0 resume scores, scorecards in notes or scored reports). The test now
  has Supabase's default grants (it passed without the REVOKE before); the
  guard refuses an upsert into applications in a migration or a split chain.
- **Growth, round 2** (a fresh reviewer, read-only): the front page's one
  explaining line is hidden only below 520 px tall (it was at 700, every
  laptop); the flyer prints "hireflownow.com", not a tagged address in
  capitals; campaign tags ride on to the blog and Open jobs and a visitor's
  tags replace the whole set; the business sign-up headline names the job.
  Admin → Growth shows every kind of public page with its sources, and
  campaigns by name, for visits and new accounts (`admin_growth_channels`,
  live as 20261025140402); the hiring team's own clicks from the staff host are left out.
  A missing guide answers 404 (`api/blog-not-found.mjs`; it was a 200
  "soft 404"), guides paint before their font arrives, and /open-jobs,
  /privacy and /terms carry their own title, description and canonical
  before scripts run (`api/page-prerender.mjs`). docs/DISTRIBUTION.md no
  longer says Google for Jobs is working. Left for the owner: a public way to
  reach HireFlow before sign-up and the LLC's details (owner inputs), Google
  for Jobs for local businesses, the "chat and phone" claim, the name shared
  with other "HireFlow" products, "Gaming" in the front page's list.
- **Product, round 2** (a fresh reviewer; 1 high, 4 medium, 9 low; nothing
  blocking). Fixed:
  - *High:* a remote job built with the Type field left on "On-site" and
    "Remote" as its place went live on-site, with no connection check: the
    place now decides, "Manila, Philippines" has a country, and Edit job no
    longer re-decides remote work from the description ("our dental office"
    made a remote job on-site on save).
  - *Medium:* on-site jobs are not held to a typing bar a phone cannot meet;
    a business is told in the app when its day's AI budget is reached
    (`ai_budget_tell_business`, live as 20261025140354); applicants are told their form
    answers save as they type and the team can read them (the welcome screen
    said only what they submit is shared; the Privacy Policy says it too);
    the form no longer warns "That's been noted" or shows "1 thing flagged"
    for switching away, since nobody is told.
  - *Low:* every email button and link, the signing certificate and the
    improvement report are ink and brass, not green, and the no-green guard
    now reads the edge functions' emails and PDFs; Settings' interview
    switch says what it does and Phase Updates shows only to the account
    with the voice interview; Edit job opens on "Job basics" with only what
    it saves, and the passing score says it moves nobody; the offer letter
    takes full or part time from the job and drops "remote" wording on
    on-site jobs; the certificate says how the document was signed and links
    /verify/<its code> instead of claiming ESIGN compliance; the Privacy
    Policy no longer says applicants can turn emails off in Settings;
    applicant buttons say "Start the chat practice", never "Start Chat Sim"
    or "Start Handle a rush-hour order"; the applicant sign-in and sign-up
    fields carry autocomplete. Guard `product-audit-round-2-holds`.
- **Phase 4, round 9** (fixed in its own session, merged here): a support
  line keeps only its own people; stores, clinics, booking agents, call
  centre experience, how-to-apply text, blended channels, call questions,
  office front desks and stores selling phones read right again (146 new
  checks, 1472 in all; 4610 of 4660 regression cases, the 50 left are old
  gaps or conflicts between earlier rounds, listed in the session's report).

### 2026-10-25 (late afternoon) — Phase 7 security audit, round 1; Phase 4 round 8; Phase 5 round 6; Phase 6 round 4; growth audit

- **Phase 4, Pass C round 8** (5665992d): no private-use colon forgery in
  reviewer text; title, booking and phone readings fixed.
- **Phase 5, Pass C round 6** (fb881f53): file names kept whole, an explicit
  document permission, plainer alerts; migration `phase5_review6`.
- **Staff columns, second review** (a7f0dfc6): saved reports and the resume
  score no longer carry Ava's score; migration
  `applicant_reports_without_scores` cleared the old ones live.
- **Phase 6, Pass C round 4** (5b0d09ee): the law's own words ("age or birth
  date"), RA 7610 Section 12-A, the employer note; the no-age filter reads
  one sentence at a time and covers every field the writers return.
- **Growth audit** (c635c925): both sign-up pages no longer pull the PDF and
  charts code; the business sign-up's link preview is the business one;
  tagged links on /open-jobs; the sitemap leaves out a paused business's jobs.
- **Phase 7, task 1: the security audit, round 1.** A fresh reviewer replayed
  every migration into a local copy and read every function a browser can
  call. Two high, four medium, a dozen low. Fixed, applied and deployed (each probed live in a rolled-back transaction or against the deployed function):
  - *High:* three throwaway accounts could pause any business (apply, report,
    repeat). Reports now count only from people the business was in touch
    with (`reports_need_contact`, 20261025114715).
  - *High:* one applicant could black out AI for a business or the platform.
    The portfolio review checks the step first and is limited; Ava's scoring
    from an applicant is capped by the day and fingerprinted on the stored
    phase; performance reports, 6 a day per application for the team and 6 for the applicant; HireFlow's own jobs
    have their own day (`ai_budget_own_jobs`, 20261025121138).
  - *Medium:* notification and message floods (`notification_and_message_limits`,
    20261025121142); an applicant's call on a manual-mode job is scoring only;
    the sales grade checks its case, fences the applicant's words and is
    never trusted while its turns are not recorded (recording them: "Later");
    the voice session reads only the applicant's own resume.
  - *Low, fixed:* invite codes are 'TEAM-' and 96 random bits, always made
    by the server (`team_invite_codes_stronger`); every page says
    X-Frame-Options SAMEORIGIN; the blueprint PDF is for a signed-in account,
    20 an hour; the geocode lookup is limited to 60 an hour per connection;
    a late video no longer moves a decided applicant back to reviewing.
  - *Low, left as they are:* no account holds the "developer" role and only
    the server can grant one (the authenticator-app gap is latent);
    connection-test's downloads are the measurement itself and need a
    signed-in account; the typing speed is the browser's own reading (a
    hand-made 300 WPM shows as such to the team); geolocate-ip's free
    provider has no HTTPS; the public branding list and a deleted
    applicant's signed copies are by design for now. The many-accounts
    budget drain needs Turnstile (the owner's keys).
- **Phase 7, task 1: the product audit (a new business, an applicant on a
  phone), fixed:**
  - Pay on the public job page: pesos (PHP, ₱) and the Philippines are
    known, one figure is the pay itself ("from" only when the text says so),
    cents kept (jobs.salary_min/max numeric, `salary_keeps_cents`,
    20261025123012; the public jobs view rebuilt from its own definition,
    dry-run live first), a missing period follows the currency's habit, the
    "m" of "monthly" is never a million, and no currency is guessed (USD was).
  - Phone-only applicants can finish on-site jobs: an on-site job puts
    nothing on a computer unless its business added a connection check (its
    work is on the business's computer); a remote job's page says before
    Apply that the tests are done on a computer.
  - Builder posts print each list once; the fallback post is whole
    sentences (no "Key context", "Work mode", "Openings"); the writer gets
    40 s, not 18; the review step says when the post is a plain draft.
  - The email after the form says what is left when more steps follow.
  - The skills-check answers have their own chunk: no applicant page
    downloads them (the job page did, through a chunk shared with the dialog).
  - The old editor's claims (auto-reject, quiz counts, a missing menu), the
    offer letter's remote defaults on an on-site job, the ID note's payment
    line, Back from a legal page (opened the owner's job), the "yes or no by
    email" promise on every business's behalf, and the wording nits.
  - Left, with reasons: the per-business AI cap (2,000 a day, maybe 60-100
    finished applicants; raising it is a cost decision for the owner); the
    landing's story and "chat and phone" claim (owner inputs already);
    an address field for in-person interviews and a preview of the pack's
    questions in the builder (features for a later round); every business in
    one industry sharing the pack's five questions (by design for now); the
    resume PDF turned into images on a phone; the location lookup's provider
    (OpenStreetMap's Nominatim) now refuses our server (403), so jobs fall
    back to the typed place; a keyed geocoder is an owner choice.

### 2026-10-25 (afternoon) — staff columns shipped; Phase 4 round 7; Phase 5 round 5; Phase 6 round 3; npm

- **Phase 7, task 6 shipped:** the staff-columns branch's fresh review found
  the applicant's voice interview carrying Ava's report and score, the
  scorecard copied into the applicant-readable notes, the improvement report
  built from them, a backup that outlived deletion, and a rerun that could
  wipe values; all fixed (cdc3de7a, b2e88abc). Applied live (migration
  `application_evaluations`, 20261025101542) with the eight functions and
  the front end back to back. Checked live: the 109 scored applications'
  fingerprint identical before and after, nothing left on `applications`,
  notes without `avaScorecard`, a rolled-back probe as a real applicant
  (reads nothing, write refused) and owner (reads their own only), the API
  serving the embed. Backup dropped (`drop_evaluation_move_backup`).
- **Phase 4, Pass C round 7** found nine regressions from round 6 (clinic
  check-ins read as in-person, a benefits line erasing pasted lists, "Sales
  & Service" titles, reservations agents, phone rules overriding phone
  titles, "calls for", Back from the voice confirm step stuck on
  "building"); fixed in a14ee8ba with 95 new checks (91 fail on the old
  code). Every case both reviews listed runs as expected except ~37 rare
  wordings ranked LOW.
- **Phase 5, Pass C round 5** (89c0836a): a hiring business with a job live
  keeps the full AI day after changing its sign-in address; separate alert
  keys; cleanup alerts on failed ID deletions; path reading stops at "?",
  "&" and commas; document AI refusals in plain words. Migration
  `phase5_review5` (20261025103724), probed live.
- **Phase 6, Pass C round 3** (3c4a6755): the age guide states HireFlow's
  18+ rule as its own, with its reason, never as the law's approval; the
  no-age filter catches the common ad wordings, keeps identity checks and
  score targets, and covers every field the writers return; the owner's
  real $500/month is back in the cost draft.
- **npm:** DOMPurify 3.4.17, markdown-it, source-map-js and zod 4 (the last
  high advisory); left: Tiptap 3, React Router 7, Tailwind 4 (majors, each
  low risk here, documented in 34ce7302).

### 2026-10-25 (midday) — Phase 4 rounds 5–6; Phase 5 rounds 3–4; Phase 6 rounds 1–2; staff columns built

- **Phase 4, Pass C round 5** (936ea681): the guess reads the title's role
  phrase ("Recruiter - BPO" is a recruiter); a voice brief asks the kind of
  job before building; call questions in the pack's word ("a patient is
  angry"); more look-alike labels folded. **Round 6** found three
  regressions from it (phone titles read as chat, "Remote - Customer Support
  Agent" and reversed titles not guessed, the voice confirm step dropping the
  voice session) plus 6 more groups; fixed in 47ff0529: titles read in parts,
  the channel read channel by channel, the voice session kept through the
  confirm step and the screening level following the answer, help desk
  analysts, after-sales agents, customer advisors and clinic words in;
  pet-friendly offices, band bookers, counter and gate work and admin support
  out; "Dr." ends no sentence; native digits with colon-like marks, uncased
  labels and spaced-out labels neutralised. 141 new checks (127 fail on the
  old code). ai-chat-simulation, ai-chat-interview and interview-guide
  redeployed. Round 7 running, ranked by how common the wording is (the guess
  is one click's default).
- **Phase 5, Pass C rounds 3–4** (aacb8521, c88399bc): the help reply bell
  rang only the owner again (a regression from round 2's migration; the test
  now replays every Help migration in order); document AI for hiring accounts
  only; a smaller AI day for a new business (300) until it confirms its
  sign-in email (a job status was no test: "closed" without publishing got
  the full 2,000). Migrations phase5_review3 (20261025083800) and
  phase5_review4 (20261025085354), checked live in rolled-back probes. Round 5
  running.
- **Phase 6, Pass C rounds 1–2** (d725d9de, 569bff95): the team-lead hire is
  the owner's own business, never "HireFlow's own team"; the build refuses
  more (misspelt or repeated keys, an empty `draft:`, links to unpublished
  guides however written, slugs the page counter hides, "https:x.com",
  noncharacters); a future-dated draft no longer breaks deploys; every button
  carries its page and a visitor's own campaign tags win. The age guide told
  businesses to doubt the 18-or-older rule HireFlow enforces on every job: it
  now says HireFlow requires it and why (RA 9231, no work 10 p.m.-6 a.m.
  under 18), and every "a person makes every decision" names that check. The
  three job writers now drop age, birth-date and marital-status questions and
  age limits (`_shared/ageWording.ts`, test `age_wording.test.mjs`); deployed.
  The cost draft's "$500 a month" is the owner's real figure (this plan,
  docs/OFFER-LETTER.md); it was taken out by mistake and put back. Round 3
  running.
- **Phase 7, task 6 (staff columns), built on a branch, not shipped:** the
  worker's branch moves the five hiring-team columns into
  `application_evaluations`; merged with main, full suite green (216 guards,
  166 tests); a private backup of the moved values added (dropped after the
  live check). Fresh review running; ships only after it, migration first,
  then the eight functions and the front end together.
### 2026-10-25 (late morning) — Phase 7, task 6 built on a branch, NOT shipped

- Model: Opus 5.5 (a helper session in its own worktree).
- **Built, not shipped:** branch `worktree-agent-ad7a09ee48bb6021d`
  (from 085abab1; main merged in at 918e42e6 with no conflicts, and the
  migration renumbered to 20261025235000 because main had taken
  20261025230000). Nothing pushed, no migration applied, no function
  deployed. "Applicants stop reading staff columns of
  their own application": `ai_score`, `ai_analysis`, `ai_scorecard`,
  `phase_ai_analysis` and `employer_notes` move to
  `application_evaluations` (migration
  `20261025235000_application_evaluations.sql`: table with the
  business/team/developer read rules of `applications`, a direct
  `employer_notes` update for the owner and pipeline teammates, six
  per-column `zz_` triggers that fire after the protect triggers, backfill
  without touching `updated_at`, `applications_staff_list` reading the five
  from it, realtime publication). Every reader moved: eight edge functions
  through `_shared/applicationEvaluation.ts`, the interview guide, analytics,
  the update hook, the staff shell's live sync (a sixth channel; applications
  events lose the five before merging), the form page's "reconsidered" rule
  (now the journey's own `isRetakeOpen`), the three live-check scripts, the
  dev preview's stand-in database.
- **Verified locally:** PGlite proof (78 checks: applicant reads none of the
  five from `applications`, the staff view or the new table; owner, assigned
  teammate and developer read them; unassigned teammate, another business and
  anon do not; each column's write lands and leaves `applications` NULL, a
  clear clears it, an applicant's write never lands; backfill; cascade;
  trigger order; second run safe); guard `staff-evaluation-columns` fails on
  the pre-move tree naming every moved reader (and
  `staff_evaluation_columns_guard.test.mjs`); `dev_preview_evaluations.test.mjs`;
  build, typecheck 0, all guards, every test, `deno check` of every function;
  the dev preview's Applicants list, profile (Ava's read and flags), dashboard
  and interview guide (lead plan from the embedded scorecard) looked at.
- **To ship (order matters):** apply the migration first, then deploy
  trigger-ava-analysis, autopilot-batch, ai-shortlist, ava-voice-tools,
  ava-voice-session, generate-applicant-dossier,
  ai-generate-performance-report and get-subscription, and push the front
  end, all at once. Between the migration and the deploys the old functions
  read NULL scores (autopilot-batch would force a re-score of every
  application); before the migration the new code's embeds fail.
- **Resolved after the branch's review (the next entry up):** the
  scorecard left notes, the voice interview and the improvement report no
  longer carry the score or report. What this entry first left open:
  `notes.avaScorecard` / `avaAnalysisMeta` were
  still in the applicant-readable `notes` (not part of this task); the
  applicant's improvement report still feeds the team's score and Ava's
  report into its prompt (its returned `overallScore` no longer carries the
  score for an applicant; older reports cached in notes still do); the voice
  interview's brief to the realtime model still includes the earlier score
  (voice is admin-only); a dossier an applicant requests themselves is built
  without the evaluation (no screen offers it to them).

### 2026-10-25 (morning) — Phase 6 built and live; Phase 5 round 2; Phase 4 round 4

- **Phase 6, built and live (docs/BLOG.md):** scripts/build-blog.mjs turns
  content/blog/*.md into plain pages in the front page's look, run by `npm
  run build`; /blog, seven guides and three drafts for the owner (cost per
  agent, the owner's team-lead hire, hiring from the Philippines); RSS feed
  and blog-sitemap.xml (in robots.txt); "Guides" in the front page's bar and
  footer; `blog` reserved. Checked live with Googlebot, facebookexternalhit
  and a plain browser (title, canonical, Open Graph, tagged button). Found
  live and fixed: an unknown /blog address answered with the app's shell
  (now a noindex "guide not found" page), and the page counter redacted every
  guide's address as a token (words joined by hyphens are kept now; proved
  live). Guards `blog-slug-reserved`, `blog-pages-have-cta-and-tags`; test
  `build_blog.test.mjs`. Fresh review of the phase running.
- **Phase 5, Pass C round 2** (13 findings, 44b1b17d): job-writing AI was
  open to any account, applicants' included, each on its own daily budget
  (now hiring accounts only, billed to the business, 40 an hour per
  account); Contact us moved to /contact (/help is staff-only on the staff
  host) and answers link there; deleting a blocked applicant's last
  application removes the block; the per-application practice cap answers
  with the calm reply; the rate-limit table keeps two days and is pruned
  hourly (it was never pruned); an empty chat reply never calls the model;
  file removal steps fail on their own; the day's limit says "later today or
  tomorrow"; the guard reads the live budget definition and counts direct
  OpenAI requests; the legal pages no longer send privacy questions to
  Messages and say the company forwards deletion requests to the business.
  Migrations rate_limit_prune (20261025074755) and
  remove_applicant_help_review2 (20261025074829), verified live.
- **Phase 4, Pass C round 4** (a9e3c4a1, 977c064a): Ava now asks "What kind
  of job is it?" first, starting on her guess, so a wrong guess costs one
  click (four rounds of word rules still misread titles both ways); the
  guess reads the title's role noun; the channel guess lets the title lead;
  reviewer text keeps only plain characters (a closed rule, after four
  rounds of look-alike colons). A CI failure from a route list was fixed in
  the same push; from now on the full suite runs before every push.

### 2026-10-25 (early morning) — Phase 4 round 3; Phase 5 Pass C round 1

- **Phase 4, Pass C round 3** (8 findings, all fixed, c1839ab8): role nouns
  only for main-street titles ("Online Store Chat Agent" is support), a
  customer word in the work (admin, sales and clinical roles that answer
  phones keep their family), support managers need a customer-side prefix,
  technician only after technical/IT support, channel lists with phones are
  "mixed" and mixed jobs get the call questions and phone guide, "customer
  service" stays the name of the work in a pack's guide, more colon
  look-alikes / digits / "No. 4" / small capitals, call-question duplicates
  need a call. Functions redeployed.
- **Phase 5, Pass C round 1** (fresh reviewer, 14 findings):
  1. **Security, fixed first and live:** remove-applicant deleted whatever a
     document's file address named, so a business could have deleted another
     business's signed copy. Now documents are found by id only; a teammate
     only on assigned jobs; the team's notifications about the applicant go;
     refused files queue for the hourly retry; blocked applicants can be
     deleted (remove_applicant_review, live 20261025070115; no removal had
     run before the fix). f860be36.
  2. Budget accounting: scoring from trigger-ava-analysis now names the
     application; job-bias bills the checked job; every chat-practice turn
     bills the applicant's business (empty replies refused); voice sessions
     name their business; the guard reads nested generics, refuses
     `business: null`, direct budget takes and raw OpenAI calls; a call the
     platform refuses gives the business its unit back; 200 practice turns
     per application per day.
  3. Refusals: "come back in a few hours" for the day's limit (chat,
     interview, sales); sales grading stays open instead of "not graded";
     a refused portfolio analysis records no made-up 60.
  4. Legal: the contact sections sent privacy requests to the hiring team.
     Applicants now have **Contact us** (their own Help thread with the
     company); the policy covers sign-up tags for every account.
  Left as designed, with the reason: the quiz attempt count stays after a
  removal (re-applying is not a way to retake the skills check); the
  business's own uploaded original stays in its folder (other documents may
  share it); one person with many free accounts can still use up one
  business's day (the per-application cap raises that to ten applications;
  email confirmation and Turnstile are the later fix).

### 2026-10-25 (night) — Phase 4 reviewed and fixed; Phase 5 built

- **Phase 4, Pass C round 1** (fresh reviewer on 90b63ad6, 12 findings):
  detection read barista/cashier/cleaner ads that ask for "great customer
  service" as customer-service jobs (now title-first, role-defining work
  only); the support interview guide reached any "support" job (now only a
  job whose chat step has a pack; the phone version reads the stored
  channel); "team player" picked the gaming pack; the channel chip always
  started on Chat; a phone job could get one call question; the owner's
  "player" overrode a pack's word; generate-flow's allow-list; the applicant
  page did not split pack cases; employer-note grammar and a false claim; three
  pack conflicts. Transcript labels now resist look-alikes. Commit 78ab7b73,
  functions redeployed. Round 2 running on it.
- **Phase 5, built** (branch merged after its suite): the legal pages name
  Southern Digital Technologies LLC and say a hiring account keeps its
  campaign tags (LEGAL-PAGES.md's 30-day line fixed: IDs go 24 hours after
  first opened); consent notices on both sign-ups and the application form;
  a daily AI budget per business (2,000 calls; team members count against
  their business; platform admins exempt; in-app alerts to the owner, not
  email, since the error alerts already work that way) wired into every
  OpenAI call; "Delete their information" (remove-applicant +
  remove_applicant, logged; messages and the signing audit stay).
- **Deferred, with the reason:** removing the dead "showcase" schema mode
  (threaded through dozens of files; dead in production; a large refactor
  for little gain) goes to the final audit. The developer area's Stripe
  dashboard link is admin-only and shows no price.
- **Owner inputs still open:** the LLC's state of registration (governing
  law) and a contact email for legal and privacy; www → apex 308; Turnstile
  keys; OpenAI spending cap (later).

### 2026-10-25 (evening) — Pass C round 6; Phase 4 built

- **Pass C round 6** (fresh reviewer on the round-5 fixes and all Phase 3
  commits): the publish check was BEFORE ... UPDATE OF status, and Postgres
  does not fire a column trigger when another trigger sets the column; it is
  now AFTER INSERT OR UPDATE on every row (business_email_check_after_trigger,
  live 20261025045451, verified live in rolled-back transactions). The
  email-check test replays EVERY later migration except a reasoned skip list
  and refuses a back-dated file. Feed country reading capped at 300
  characters (a 27 KB location took 1.5 s) with more real strings fixed. The
  boot marker is removed once the app draws. The colour guards now read
  comma hsl(), oklch(), named greens, Tailwind green classes and
  tailwind.config.ts (they found real greens: admin charts, unused glows).
  Commit 829d2faf.
- **Phase 4, built (docs/CUSTOMER-SERVICE-HIRING.md):** a `customer_service`
  family checked first, six follow-ups (channel, industry, load, hours,
  private details, tools), six industry packs (medical, store, software,
  home services, gaming, general) of five keyed questions and six chat cases
  each, written by one writer per pack and read by three independent
  reviewers (ambiguity, second-language reader under a timer, hiring
  manager), merged by an editor. Both plan generators put the pack in;
  Publish saves the answers (moved to the server by the trigger) and the
  step's pack; the server grades with the pack's word ("patient") and note,
  against "What the agent knows". Interview guides for customer-service jobs,
  chat and phone. A "clinic" preview scenario. Day's --ck-brass-bright made
  readable (the builder's chips were pale brass on paper).

### 2026-10-25 (later) — Pass C rounds 3–5 on Phase 2; Phase 3's look built

- **Pass C round 3** (on the round-2 fixes): the code now goes only to the
  address the database recorded it for (never looked up again); the inbox
  and overall limits hold under a burst (advisory locks); ten an hour and
  twenty a day per inbox with the real wait; a Google sign-in passes only
  while its Google address is the sign-in address; a platform admin's own
  writes are not refused (business_email_check_round3, live).
- **Pass C round 4:** no security hole; wording, a stray staged file in a
  commit (re-committed as 15bf8fd0) and feed words fixed.
- **Pass C round 5** (on 15bf8fd0): the guard read SQL text and could be got
  round (quoted names, `'select true'` bodies, grants on all functions, a
  disabled or re-made trigger, an always-true is_platform_admin, required
  lines inside a `/* */` comment, locks taken after the counts). Fixed two
  ways: `business_email_check.pglite.test.mjs` now replays every later
  migration that touches the check and asserts what the database does, so
  each of those fails it (proven one by one); and the guard reads all the
  reported forms (proven one by one). The feed's country reading was
  rewritten (no-US, non-US, "US excluded" rule a country out; "except
  weekends" does not; "US & Canada clients", "for a US company", "US
  patients" are who they serve, not where; a time zone alone keeps its
  country) with a 33-string table both copies must answer the same. The
  per-IP refusal gives the real wait.
- **Phase 3, built:** one logo (brass line on the ink tile, icons `?v=7`);
  the front page rewritten (one button, "Post your first job free", pinned;
  any team that answers customers; Southern Digital Technologies LLC in the
  structured data); neutral share pictures; sign-up says "Start hiring";
  hiring links on careers and job pages; four milestones on the applicants
  list. **Colour:** no jade anywhere. Tokens renamed for what they mean
  (`--jade` → `--action`, `--hf-green` → `--hf-action`, `--gem-jade…` →
  `--gem-1..4`, `candidate-jade.css` → `candidate-theme.css`); ink and ivory
  with brass for Ava, the score and money. The app follows the device
  (Day/Night) and the toggle overrides; sign-up holds Night. Every text pair
  passes WCAG AA in both themes (`scripts/theme_contrast.test.mjs`, 52
  pairs; Day brass darkened to #84601F to clear 4.5). Guards:
  `no-jade-tokens-left`, `brass-only-for-ava-score-money`,
  `every-css-variable-is-defined` (it found the gem rail asking for
  `--gem-teal` after the rename, and an undefined `--ck-text`). Dark panels
  (video, calls, Ava's strip) use `--slab-action` so nothing goes ink on ink
  by day.
- **Owner inputs still open:** www → apex as a 308 (a Vercel domain
  setting; today it is a 307); Turnstile keys; OpenAI spending cap (later);
  a contact address for the legal pages (Phase 5). Note: hireflow1.vercel.app
  is an older, separate project; this app's own vercel.app address
  (hireflow1-iota.vercel.app) already points search engines to
  hireflownow.com.
- **Open:** a fresh Pass C reviewer on the round-5 fixes and the Phase 3
  commits together; Lighthouse and share-preview checks; then Phases 4–7.

### 2026-10-25 — Phase 1 closed; Phase 2 built, shipped, two Pass C rounds; Phase 3 begun

- Model: Opus 5.5 (the owner switched to it for the autonomous run).
- **Phase 1 (security), live.** Commits 08ed6e34 … d44a9eb3. Migrations
  (live versions in docs/MIGRATION-HISTORY.md §4): safe_links,
  ai_daily_budget, protect_application_staff_columns,
  profiles_email_from_account, drop_leftover_open_policies,
  platform_admin_two_step, revoke_unneeded_function_access,
  protect_voice_evidence, voice_recording_this_project. Auth
  password_min_length 8. CSP live report-only on both hosts; reports reach
  client_error_events. The planned guards that are tests instead
  (csp-header-present, ava-analysis-ignores-client-force,
  rate-limit-keys-on-cf-ip, profiles-email-read-only) run in CI on every push.
- **Phase 2, live.** The front page is counted and attributed (verified: a
  tagged visit landed in page_view_daily and the sign-up links carried the
  tag; the test row was deleted); Admin → Growth (admin_growth,
  admin_growth_one_role); "player" is a property of the business
  (business_pages.home_alias), never guessed from text; the team-lead
  interview script defaults to the general one; the share step lists
  Facebook, LinkedIn, Indeed, OnlineJobs.ph with tagged links;
  /candidate/continue sends live applicants to sign in; the developer code
  task that never reached applicants is gone; /ava-preview and /flow-lab are
  noindex (verified live); the Google Calendar card shows only when the
  server has its keys (it has none today, so it is hidden); a remote job may
  name its one country in its location text for the feed; "manage billing"
  and "in your feed" are gone; a business confirms its email with a 6-digit
  code at its first Publish (business_email_check + hardening; the 15
  existing businesses were stamped). Verified live: the owner publishes as
  before; a business without the stamp is refused with the code prompt (in a
  rolled-back transaction); the code maker works and refuses a second within
  a minute; nothing was left behind.
- **Pass C round 1** (fresh reviewer on 7aabae2e..d2ccd088, 11 findings):
  recording link accepted any Supabase project; "team player" switched on
  the owner's word; interview guide and scoring labels said "player"; the
  owner's focus labels said "customer"; an unknown business got the owner's
  script; sales turns were served for a closed step; prompt versions not
  bumped; in-progress chat word, growth label and double count; stale voice
  doc. All fixed. Kept as is, with the reason: a "busy" (grading/failed)
  attempt still serves turns from the request's history (an applicant on an
  active step can already do the same within the per-IP rate limit and the
  daily AI ceiling; refusing would break a turn racing a submit).
- **Pass C round 2** (fresh reviewer on d44a9eb3..1e526eb1, 12 findings): the
  email stamp was not tied to the address (fixed: email_verified_for, codes
  bound to the address they went to); the code email could flood an inbox
  and carried the account's own name (fixed: businesses only, per-account
  lock, five an hour per inbox however written, 300 an hour in all, ten an
  hour per IP, no name in the email); a sign-up typo was a dead end (fixed:
  Help link); the Google card checked only the site's key (fixed: server
  status); guards too narrow (fixed: latest-definition checks, proven to fail
  on a weakened copy); screen wording, paste and countdown (fixed); share
  hint invisible on phones (fixed); tests that did not run the code branch
  (fixed: the real function now runs it against stand-ins); stale docs
  (fixed: NOTIFICATION-EMAILS, BUSINESS-TRUST, BACKEND-SCHEMA,
  TRUSTED-RESULTS, App.tsx); "manage billing"/"in your feed" (fixed); feed
  country from text ruled-out countries and "US" (fixed); the word swap
  changed the business's own case text (fixed; chat-sim-eval-6). Not taken:
  the PGlite test keeps its stand-in schema (as every PGlite test here
  does); the landing page's "player" copy is Phase 3's rewrite.
- **Found by our own probe:** a request body over about 1 MB never reaches a
  function: Supabase's gateway holds it until a 504. The function never
  runs, so it costs nothing; noted in practiceTurnGuard.ts.
- **Phase 3 begun:** "where they are" is four milestones (Option C) on the
  applicants list, the phone card and the first-hire guide, with a guard.
- **Open:** Pass C round 3 on the round-2 fixes; then the rest of Phase 3.
  Turnstile (needs the owner's keys); CSP enforce and the
  application_evaluations split (Phase 7); OpenAI spending cap (the owner,
  later); `npx eslint .` reports 154 old errors (not in CI; none new).

### 2026-10-24 (later) — Plan re-reviewed; mock-ups; two decisions

- Model: Fable 5.1, high reasoning (the owner switched it for the review).
- Re-review added: CSP rolls out report-only first; an allow-list guard for
  everything reachable without sign-in; a profiles-visibility proof; model
  and session-start rules; the "where they are" column; a clearer colour
  section (the landing is already brass; the green is the app).
- Mock-ups shown on real screens (sign-up, dashboard, candidate interview
  card, applicants list) in `design/mockups/2026-10-24-colour-and-rail/`.
- Decided: "where they are" = Option C (four milestones). Owner: "Milestone
  looks a lot better."
- Decided (later the same evening, "lock it"): colour = ink and ivory with
  brass as the accent; landing and sign-up stay dark; the app follows the
  device setting with the toggle to override (see Phase 3).
- Owner inputs received: legal entity Southern Digital Technologies LLC;
  OpenAI cap later; Turnstile fine.
- Nothing in the product changed. Phase 1 not started.

### 2026-10-24 — Plan written; Phase 0 (audit) closed

- Audit of repo + live project (security, product/billing, growth/SEO).
  Findings folded into the phases above.
- Changed live: Supabase Auth SMTP sender name "Zulu Support Team" → "HireFlow".
- Changed in repo: CLAUDE.md (October run, positioning, auth email facts);
  this plan.
- Verified: build, typecheck, guards, 142 tests, CI green; all 341 live
  notification links clean; the two scary migration-file policies are not
  live.
- Open: everything in Phases 1–7.
- Owner answers (2026-10-24, later the same day): OpenAI spending cap —
  "later", not a blocker; Turnstile — fine (free), the owner will create the keys
  when Phase 2 asks; legal entity — Southern Digital Technologies LLC;
  colour — the owner wants to see the real app screens recoloured before Phase 3
  starts (mock-up sent the same day; decision pending).
