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
   written interview's questions about handling calls, and a note in the
   plan that the practice call is coming (Phase "Later"). Typing is measured
   inside the chat practice (docs/TYPING-IN-CHAT.md) — keep that.
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
   with a plain message when reached and `platform_admins` exempt; the
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
     an applicant session reads none of it.
   - **Applicants stop reading internal job columns** once they have applied
     (`passing_score`, `processing_mode`, `ai_bias_feedback`, step configs):
     same constraint (embedded selects on applications), same kind of fix.
   - **The RLS performance advisor**: 117 `auth_rls_initplan` and 143
     `multiple_permissive_policies` warnings (task 2 above).

---

## Later (not in this loop; recorded so they are not lost)

### Phone practice call

The biggest build and the one that makes the "phone" half real: a simulated
caller in the applicant's browser (the voice stack behind `ava-voice-session`
exists and is gated to `platform_admins`), scored on tone, clarity, handling
and hold/transfer behaviour, with the recording and transcript kept for the
hiring team. Each call costs real money, so it is priced into the $99/job and
$299/mo, and it lands with Stripe.

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
