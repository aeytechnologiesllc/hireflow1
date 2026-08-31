-- Removes the demo data seeded for the internal test account on 2026-08-27.
--
-- The test employer (employer.test@hireflow.dev) had no applicants, so every
-- cockpit screen only ever showed its empty state and the design could not be
-- reviewed. This seeded one job and six applications against existing throwaway
-- QA accounts — no new users were created, and the job carries
-- exclude_from_feed = true so it can never reach /jobs.xml, the sitemap, or
-- Google for Jobs.
--
-- Run this whole file to put the database back exactly as it was.

-- Update, 2026-08-30: verifying the new Dashboard "What needs you today" /
-- interview rows required a real interview in the awaiting-a-pick state, so
-- one more was scheduled through the app's own scheduling wizard against the
-- same seeded job/applicant (Tyrone Baptiste's application) — not a new row
-- outside this seed, so no extra DELETE is needed:
--   interview id     a514a1bb-5e79-4f79-bdda-4163ed349aeb
--   application id   ac890d89-9497-420e-963a-d6ec54603f26
--   scheduled_at     2026-08-30 23:30:00+00 (candidate_response: awaiting_pick)
-- Step 1 below already deletes every interview whose application belongs to
-- this job, so this one is caught by the existing subquery. Scheduling it
-- also advanced that application's status from "reviewing" to "interview" —
-- step 1's cascade to "delete the application entirely" removes that too,
-- so nothing extra to revert there either.

begin;

-- 1. The interview(s), then the applications, then the job.
delete from public.interviews
 where application_id in (
   select id from public.applications
    where job_id = '915cbf28-62ee-4f78-a46f-1be0d40088a6'
 );

delete from public.applications
 where job_id = '915cbf28-62ee-4f78-a46f-1be0d40088a6';

delete from public.jobs
 where id = '915cbf28-62ee-4f78-a46f-1be0d40088a6';

-- 2. Restore the QA accounts' original names, which the seed overwrote.
update public.profiles set full_name = ''                                       where user_id = 'a7a372d0-43f5-4f43-8a43-11eea34a91bc';
update public.profiles set full_name = 'Demo Candidate'                          where user_id = '1858d458-f4de-4d23-9418-53fea581b632';
update public.profiles set full_name = ''                                        where user_id = '9db14314-20bb-4fd0-b483-671db3633918';
update public.profiles set full_name = 'HireFlow E2E Candidate mrlh4ydj'          where user_id = '85153283-2338-4e9c-8fc4-11693bb9766a';
update public.profiles set full_name = 'HireFlow Visible E2E Candidate mrlhnpx6'  where user_id = '4af7873a-fea4-413d-89e7-817da73b4f9a';
update public.profiles set full_name = 'Demo Founder'                             where user_id = 'c6debb4d-9647-47b3-b54b-6ca0afddfe71';

-- `location` was set to 'Atlanta, GA' on all six; it was null before.
update public.profiles set location = null
 where user_id in ('a7a372d0-43f5-4f43-8a43-11eea34a91bc',
                   '1858d458-f4de-4d23-9418-53fea581b632',
                   '9db14314-20bb-4fd0-b483-671db3633918',
                   '85153283-2338-4e9c-8fc4-11693bb9766a',
                   '4af7873a-fea4-413d-89e7-817da73b4f9a',
                   'c6debb4d-9647-47b3-b54b-6ca0afddfe71');


-- 3. The verification candidate added 2026-08-27 (candidate.test@hireflow.dev)
--    and its mid-journey application. The auth user itself must be deleted from
--    the Supabase dashboard (Auth > Users) — SQL here only clears public rows.
delete from public.applications where candidate_id = '3f16c4a5-00dd-4525-9232-4029fffb5cda';
delete from public.user_roles  where user_id      = '3f16c4a5-00dd-4525-9232-4029fffb5cda';
delete from public.profiles    where user_id      = '3f16c4a5-00dd-4525-9232-4029fffb5cda';

commit;

-- NOTE (2026-08-30, verification only — no cleanup row needed):
--   interview 12e0b26b-6b6d-403d-9acf-7b784112608c was moved to a future date and
--   set candidate_response='confirmed' so the live "Add to calendar" button had a
--   confirmed upcoming interview to render on. It belongs to the demo job and is
--   already removed by the job-scoped deletes above. Its original state was
--   scheduled_at 2026-08-28T09:00Z, candidate_response 'pending'.

-- Confirm nothing is left behind:
--   select count(*) from public.jobs where job_code = 'DEMO-SEED-1';         -- 0
--   select count(*) from public.applications where source = 'DEMO-SEED';     -- 0

-- 2026-08-30: verifying the company_name capture fix (sign-up field, the new
-- handle_new_user migration, the Dashboard recovery card, and the publish
-- guards in AvaCreateJob.tsx + CreateJob.tsx) touched two things:

-- (a) employer.test@hireflow.dev (user_id 13e26129-2e6c-4e7b-bb55-deb5ad78f0c4)
--     had company_name = NULL — the exact bug this task fixes, on the shared
--     QA account itself. I used the real Dashboard recovery card to set it to
--     "HireFlow QA Test Garage" and left it that way, since NULL was itself
--     the defect and every future verification screenshot reads better with
--     a real name. Revert only if you want the account back in its old
--     (broken) state:
--       update public.profiles set company_name = null where user_id = '13e26129-2e6c-4e7b-bb55-deb5ad78f0c4';

-- (b) One brand-new throwaway employer created through the real sign-up form
--     to prove the metadata → trigger path (email hireflow.qa.signup.20260830@hireflow.dev,
--     user_id b428c9ba-cfe5-4cb8-9fcf-70da786a599b). Used to prove both publish
--     guards end-to-end; ended with company_name "Edit Path QA Garage" and one
--     published job. Run this block to remove everything but the auth user:

begin;
delete from public.jobs        where id      = 'b1c7544e-fb2b-4263-bd58-08e81a9414ce';
delete from public.user_roles  where user_id = 'b428c9ba-cfe5-4cb8-9fcf-70da786a599b';
delete from public.profiles    where user_id = 'b428c9ba-cfe5-4cb8-9fcf-70da786a599b';
commit;

--     The auth user itself must be deleted from the Supabase dashboard
--     (Auth > Users > hireflow.qa.signup.20260830@hireflow.dev) — SQL here
--     only clears public rows, same as the candidate.test cleanup above.

-- (c) 2026-08-31: after applying the handle_new_user migration I signed up one
--     more throwaway employer straight through the auth API to prove the
--     trigger itself now persists company_name (metadata "  Probe Motors  "
--     landed as "Probe Motors", correctly trimmed).
--       email    hireflow.trigger.probe.20260831@hireflow.dev
--       user_id  cc430367-b19f-4f04-a806-391e2bafdb81
--     Its public.profiles and public.user_roles rows are ALREADY DELETED — no
--     SQL needed here. Only the auth user remains; delete it from the Supabase
--     dashboard (Auth > Users) when convenient.

-- ============================================================================
-- (d) 2026-08-31: FULL END-TO-END RUN (employer sign-up -> published job ->
--     candidate apply -> screening -> employer acts). Everything below was
--     created by that run and is safe to delete. Two throwaway auth users were
--     created through the Supabase auth API with the exact metadata the real
--     sign-up form sends (never by typing a password into a form):
--
--       employer   hireflow.e2e.employer.20260831@hireflow.dev
--                  user_id 96fbe13e-3c20-4bd1-bd5c-3b85010abfca
--                  company_name "Northgate Auto Care"
--       candidate  hireflow.e2e.candidate.20260831@hireflow.dev
--                  user_id a87c6168-18d8-4f83-905e-2ebd2fa03cf3
--
--     Rows created under them are listed in the DELETE block appended at the
--     end of this run (see "(d) cleanup block").

-- ============================================================================
-- (e) 2026-08-31: COMMUNICATIONS AUDIT (what a candidate/employer actually
--     RECEIVES: email, in-app bell, messages, push). NO new auth users were
--     created for this run — it reused the existing employer.test@hireflow.dev
--     (13e26129-2e6c-4e7b-bb55-deb5ad78f0c4) and candidate.test@hireflow.dev
--     (3f16c4a5-00dd-4525-9232-4029fffb5cda) accounts, so nothing needs to be
--     removed from Auth > Users for this block.
--
--     No real email or SMS was sent at any point: RESEND_API_KEY is unset, and
--     the one probe of send-notification-email deliberately used a nonexistent
--     recipient_user_id so that even a configured Resend would have 404'd at
--     the profile lookup before composing anything.
--
--     Rows created by this run (all safe to delete):
--       job          c0a11d17-0000-4000-a000-000000000001  "COMMS AUDIT - Do Not Use"
--                    job_code JOB-FBBF2C, exclude_from_feed = TRUE (never fed
--                    to any aggregator, never sent to the Google Indexing API)
--       application  c0a11d17-0000-4000-a000-000000000002  (candidate.test on
--                    that job) — used to test the reject / "no ghosting" path
--       notifications rows auto-created by the on_application_status_change
--                    trigger + the client insert for that application
--       messages     rows sent between the two test accounts on application
--                    a27f8e3c-fc91-4ce5-aa3d-ebf6661735d4 for the messaging test
--
-- (e) cleanup block
DELETE FROM public.messages
 WHERE application_id = 'a27f8e3c-fc91-4ce5-aa3d-ebf6661735d4'
   AND content LIKE '[COMMS AUDIT]%';
DELETE FROM public.notifications
 WHERE user_id IN ('13e26129-2e6c-4e7b-bb55-deb5ad78f0c4',
                   '3f16c4a5-00dd-4525-9232-4029fffb5cda')
   AND created_at >= '2026-08-31'::date;
DELETE FROM public.applications
 WHERE id = 'c0a11d17-0000-4000-a000-000000000002';
DELETE FROM public.jobs
 WHERE id = 'c0a11d17-0000-4000-a000-000000000001';

-- (d) 2026-08-31: first-run / paywall audit. ONE throwaway employer created via
--     the auth API to observe what a REAL account WITHOUT
--     raw_app_meta_data.subscription_bypass hits (the test accounts have the
--     bypass, which hides every gate). No job, application, interview, message
--     or document was created by this account — only sign-up side effects.
--       email    audit.freshemployer@hireflow.dev
--       user_id  2b4902b8-24d4-4702-b9e1-0e8660fd33a3
--     Side-effect rows written automatically on first load: public.profiles +
--     public.user_roles (via assign_user_role RPC), and get-subscription
--     auto-provisioned public.subscriptions (trial, ends 2026-09-07),
--     public.subscription_usage and one public.voice_credits row (15 min).
--     The trial-expiry lockout was reproduced by rewriting the get-subscription
--     RESPONSE in the browser only — no row was ever mutated to 'expired'.

begin;
delete from public.voice_credits      where user_id = '2b4902b8-24d4-4702-b9e1-0e8660fd33a3';
delete from public.subscription_usage where user_id = '2b4902b8-24d4-4702-b9e1-0e8660fd33a3';
delete from public.subscriptions      where user_id = '2b4902b8-24d4-4702-b9e1-0e8660fd33a3';
delete from public.user_roles         where user_id = '2b4902b8-24d4-4702-b9e1-0e8660fd33a3';
delete from public.profiles           where user_id = '2b4902b8-24d4-4702-b9e1-0e8660fd33a3';
commit;

--     The auth user itself must be deleted from the Supabase dashboard
--     (Auth > Users > audit.freshemployer@hireflow.dev).

-- ─────────────────────────────────────────────────────────────────────────
-- (d) 2026-08-31: SCREENING-ENGINE END-TO-END AUDIT.
--     Proved the Ava scoring pipeline writes ai_score / ai_scorecard /
--     resume_score for real (first non-null resume_score in the database),
--     and that autopilotAction='reject' still never rejects.
--
--     Everything below was created by that audit and is safe to delete.
--     Both jobs were inserted with exclude_from_feed = true and never went
--     near the public feed or the Google Indexing ping.
--
--       job  11111111-e2e0-4aaa-8bbb-000000000001
--            "[E2E ENGINE AUDIT] Lube Technician (do not use)"  (job_code JOB-5AD826)
--       job  11111111-e2e0-4aaa-8bbb-000000000002
--            "[E2E ENGINE AUDIT] Lube Technician - degradation probe (do not use)"
--       app  22222222-e2e0-4aaa-8bbb-000000000001  (scored 85, strong candidate)
--       app  22222222-e2e0-4aaa-8bbb-000000000002  (scored 0, unreadable-resume probe)
--
--     Both applications belong to the existing candidate.test@hireflow.dev
--     user and both jobs to employer.test@hireflow.dev — no new auth users
--     were created, so nothing needs removing from the Auth dashboard.

begin;
delete from public.applications where id in (
  '22222222-e2e0-4aaa-8bbb-000000000001',
  '22222222-e2e0-4aaa-8bbb-000000000002'
);
delete from public.jobs where id in (
  '11111111-e2e0-4aaa-8bbb-000000000001',
  '11111111-e2e0-4aaa-8bbb-000000000002'
);
commit;

--     One storage object was also uploaded, to the private `resumes` bucket
--     (a synthetic 1-page PDF resume for the fictional "Marcus Delaney"):
--       resumes/3f16c4a5-00dd-4525-9232-4029fffb5cda/e2e-engine-audit-marcus-delaney.pdf
--     Delete it from Storage > resumes in the Supabase dashboard, or with:
--       delete from storage.objects
--        where bucket_id = 'resumes'
--          and name = '3f16c4a5-00dd-4525-9232-4029fffb5cda/e2e-engine-audit-marcus-delaney.pdf';
--     Job published by the run (PRIMARY /jobs/create route, typed brief):
--       id 2a3d7db3-c7b3-4906-920e-c40199b63a0d  code JOB-E7126C
--       "Front Desk Receptionist (Part-Time, Onsite)" — Austin, Texas
--       exclude_from_feed was flipped to TRUE immediately after publish (the
--       app never sets it; createJobFromFlow leaves it false), and the
--       google-indexing edge call was blocked at the browser so nothing was
--       ever announced to Google.

-- ---------------------------------------------------------------------------
-- (d) cleanup block — run this to remove EVERYTHING the 2026-08-31 end-to-end
--     run created. Order matters (children first). Nothing here predates the
--     run; no pre-existing row was edited or deleted by it.
--
--     Verified during the run: PATCHing public.subscriptions as the owning user
--     returns 403 (RLS forbids it), so the trial row was NOT modified — the
--     day-8 lockout could not be simulated and nothing was mutated.
-- ---------------------------------------------------------------------------
begin;

-- employer 96fbe13e-3c20-4bd1-bd5c-3b85010abfca (Northgate Auto Care)
-- candidate a87c6168-18d8-4f83-905e-2ebd2fa03cf3 (Priya Raman)

delete from public.interviews
  where id = 'd92d5caf-1a46-4d2b-a13e-1f8c8b9dd1c4';                     -- video interview, Aug 31 2:00pm

delete from public.messages
  where sender_id   in ('96fbe13e-3c20-4bd1-bd5c-3b85010abfca','a87c6168-18d8-4f83-905e-2ebd2fa03cf3')
     or receiver_id in ('96fbe13e-3c20-4bd1-bd5c-3b85010abfca','a87c6168-18d8-4f83-905e-2ebd2fa03cf3');

delete from public.notifications
  where user_id in ('96fbe13e-3c20-4bd1-bd5c-3b85010abfca','a87c6168-18d8-4f83-905e-2ebd2fa03cf3');

delete from public.applications
  where id = '6e4f006d-61fe-470b-a021-23a4f0d3755e';                     -- Priya -> Front Desk Receptionist

delete from public.jobs
  where id = '2a3d7db3-c7b3-4906-920e-c40199b63a0d';                     -- JOB-E7126C

delete from public.voice_credits
  where user_id = '96fbe13e-3c20-4bd1-bd5c-3b85010abfca';                -- 15 trial minutes, auto-provisioned

delete from public.subscriptions
  where id = '03ff6bbc-56b2-4603-916e-5589e6688cfb';                     -- auto-created 7-day trial

delete from public.user_roles
  where user_id in ('96fbe13e-3c20-4bd1-bd5c-3b85010abfca','a87c6168-18d8-4f83-905e-2ebd2fa03cf3');

delete from public.profiles
  where user_id in ('96fbe13e-3c20-4bd1-bd5c-3b85010abfca','a87c6168-18d8-4f83-905e-2ebd2fa03cf3');

commit;

-- Storage: one resume PDF was uploaded to the private `resumes` bucket —
--   object path  a87c6168-18d8-4f83-905e-2ebd2fa03cf3/1788157618774.pdf
-- Delete it from Storage > resumes in the Supabase dashboard.
--
-- Auth users must also be deleted from the dashboard (Auth > Users), same as
-- every other block in this file:
--   hireflow.e2e.employer.20260831@hireflow.dev
--   hireflow.e2e.candidate.20260831@hireflow.dev

-- ---------------------------------------------------------------------------
-- 2026-08-31 — adversarial verification of the "Skills Check is unanswerable"
-- claim. One job + one application, both under the EXISTING test accounts
-- (no new auth users). quiz_questions were copied verbatim from the real
-- published "Grocery Stocker" job so the repro used production-shaped data.
-- The job is exclude_from_feed = true and never reached any job board.
-- ---------------------------------------------------------------------------
begin;
delete from applications where id = '9a11f0aa-0000-4000-a000-000000000002';
delete from jobs         where id = '9a11f0aa-0000-4000-a000-000000000001';
commit;

-- ---------------------------------------------------------------------------
-- 2026-08-31 — adversarial verification of the "three dialogs promise the
-- candidate will be told something and nothing is sent" claim. One draft job
-- + one application under the EXISTING test accounts (no new auth users), used
-- to observe whether advancing a status inserts a notifications row.
-- The job was status='draft', exclude_from_feed=true and never reached any job
-- board. No email or SMS was sent (RESEND_API_KEY is unset on this project —
-- send-notification-email returns {"skipped":true} for every call).
-- ALREADY DELETED during the session, including the two notifications rows the
-- on_application_status_change trigger inserted for the candidate
-- ("Interview Scheduled!" and "Offer Extended!"); the candidate's notification
-- count was verified back at its pre-run baseline of 2. Kept here for the
-- record / in case of a restore.
-- ---------------------------------------------------------------------------
begin;
delete from notifications where user_id = '3f16c4a5-00dd-4525-9232-4029fffb5cda'
  and id in ('4128569b-0eb1-4feb-a431-6e995afc939c','42cfbe23-4f87-4401-9ff2-e2a26b2c68db');
delete from applications where id = 'aaaa1111-9999-4000-a000-0000000000f1';
delete from jobs         where id = 'ae11f111-0000-4000-a000-000000000001';
commit;
-- NOTE: both rows above were already deleted by the verifying agent on
-- 2026-08-31; the block is left here as a record only and is a no-op.

-- ---------------------------------------------------------------------------
-- 2026-08-31 — adversarial verification of the "candidate nav links bounce"
-- claim. One interview row was inserted under the EXISTING test accounts
-- (employer.test -> candidate.test, application 22222222-e2e0-4aaa-8bbb-
-- 000000000002) purely to render the candidate interview card, then DELETED
-- in the same run. Nothing else was created; no email or SMS was sent.
-- ALREADY CLEANED UP — this block is a no-op, kept for the record.
-- ---------------------------------------------------------------------------
begin;
delete from public.interviews where id = '7c0ffee0-0000-4000-a000-0000000000a1';  -- already deleted
commit;

-- ---------------------------------------------------------------------------
-- 2026-08-31 — adversarial verification of the "fresh employer is capped at
-- ONE job and the upgrade button errors" claim. A BRAND-NEW employer account
-- was signed up via the auth API (email confirmation is off, so NO email was
-- sent) so the trial limits could be observed without the test accounts'
-- subscription_bypass masking them. One DRAFT job (exclude_from_feed = true,
-- never published, never in any feed) was inserted to push jobs_created to 1.
-- get-subscription then auto-created the trial subscription + subscription_usage
-- + voice_credits rows for that user, as it does for every new employer.
-- NOT yet cleaned up — delete in this order.
--   account : adv.verify.gap19@hireflow.dev
--   user_id : 2f7633fb-5645-46f3-9b1d-5257607b14cb
--   job_id  : 3c02afff-9f2b-47b9-812a-4cb0a7a2c813  ("ADV VERIFY GAP19 draft")
-- ---------------------------------------------------------------------------
begin;
delete from public.jobs             where id = '3c02afff-9f2b-47b9-812a-4cb0a7a2c813';
delete from public.voice_credits     where user_id = '2f7633fb-5645-46f3-9b1d-5257607b14cb';
delete from public.subscription_usage where user_id = '2f7633fb-5645-46f3-9b1d-5257607b14cb';
delete from public.subscriptions     where user_id = '2f7633fb-5645-46f3-9b1d-5257607b14cb';
delete from public.user_roles        where user_id = '2f7633fb-5645-46f3-9b1d-5257607b14cb';
delete from public.profiles          where user_id = '2f7633fb-5645-46f3-9b1d-5257607b14cb';
commit;
-- Finally, delete the auth user itself (dashboard → Authentication → Users, or
-- the admin API): 2f7633fb-5645-46f3-9b1d-5257607b14cb / adv.verify.gap19@hireflow.dev

-- ---------------------------------------------------------------------------
-- 2026-08-31 — adversarial verification of the "publishing puts the job in the
-- public aggregator feed with no opt-out" claim. NO job was created and NOTHING
-- was published. The only side effect was a single read-only config probe of the
-- google-indexing edge function, called with a non-existent job id and
-- notificationType = URL_DELETED (a *de-indexing* notice for a URL that has
-- never existed — it cannot publish anything). It proved the Google Indexing
-- service account IS configured in prod ("configured":true,"status":"sent").
-- That probe appended ONE append-only audit row:
--   table  : public.google_indexing_notifications
--   reason : 'adversarial_verify_config_probe'
--   job_id : NULL (the fk target 00000000-0000-4000-8000-000000000001 does not
--            exist, so job_id was stored as given / nulled by the fk)
--   employer_id : 13e26129-2e6c-4e7b-bb55-deb5ad78f0c4 (employer.test@hireflow.dev)
-- NOT yet cleaned up.
-- ---------------------------------------------------------------------------
begin;
delete from public.google_indexing_notifications
 where reason = 'adversarial_verify_config_probe';
commit;

-- ---------------------------------------------------------------------------
-- 2026-08-31 — adversarial verification of the "employer is told the Skills
-- Check is Completed while the candidate is stuck on it" claim. One draft job
-- + one application under the EXISTING test accounts (no new auth users),
-- created solely to put an application into the exact state the production
-- backend produces (trigger-ava-analysis writes phase = 'quiz' on a job that
-- has quiz_questions). The job was status='draft', exclude_from_feed=true and
-- never reached any job board. No email or SMS was sent.
-- ALREADY DELETED during the session and verified gone (both selects returned
-- []); this block is a no-op, kept for the record / in case of a restore.
-- ---------------------------------------------------------------------------
begin;
delete from applications where id = '7fa17e57-0000-4000-a000-000000000002';
delete from jobs         where id = '7fa17e57-0000-4000-a000-000000000001';
commit;

-- ---------------------------------------------------------------------------
-- 2026-08-31 — adversarial verification of the "candidate is shown an
-- automated rejection while the DB says 'reviewing'" claim. One published-but-
-- feed-excluded job (processing_mode='auto', passing_score=60,
-- exclude_from_feed=true) + one application, both under the EXISTING test
-- accounts (no new auth users). Created solely to observe what the production
-- trigger-ava-analysis edge function returns to the candidate's browser. The
-- job never reached any job board. No email or SMS was sent.
-- ALREADY DELETED during the session (both DELETEs returned 200 with the row
-- representation); this block is a no-op, kept for the record.
-- ---------------------------------------------------------------------------
begin;
delete from applications where id = '359af4bd-2710-464d-bfe6-7b3e5fa0c03f';
delete from jobs         where id = '7ed98613-74e3-4dcc-9eb1-c56c24520e2e';
commit;

-- ---------------------------------------------------------------------------
-- 2026-08-31 — BLOCKER FIX VERIFICATION (the "unanswerable Skills Check" and
-- "fake rejection + Improvement Blueprint upsell" launch blockers). Two live
-- checks, both under the EXISTING test accounts (candidate.test / employer.test
-- — no new auth users created).
--
-- (1) Blocker 1 proof — took the real quiz on a KNOWN-BROKEN LIVE job. Applied
--     as candidate.test to the real, currently-published "Front Desk Associate"
--     job (id b1c7544e-fb2b-4263-bd58-08e81a9414ce, job_code JOB-61543B — a
--     REAL employer job, exclude_from_feed=false, one of the five live jobs
--     whose 8 quiz questions are all type "situational" with empty options).
--     Answered all 3 application questions + all 8 quiz questions (previously
--     unrenderable — confirmed they now render as free-text boxes) and
--     submitted both phases; the application genuinely advanced to "Handle a
--     real moment" (chat_simulation), proving the fix works on already-broken
--     production data with no migration. DO NOT DELETE THE JOB (it is real,
--     not test data) — only the application + resume this run created:
--       application  ee60548c-3562-4218-aab4-b0fc3d8a812c
--       resume       resumes/3f16c4a5-00dd-4525-9232-4029fffb5cda/1788161706457.png
--
-- (2) Blocker 2 proof — needed a submission that genuinely earns
--     autopilotAction="reject" server-side, so a fresh, obviously-disqualified
--     application was driven through the real ApplicationFormPhase.tsx submit
--     flow (job requires a crane certification the candidate explicitly says
--     they don't have). Confirmed server response: status stayed 'reviewing',
--     rejected_by_type stayed null, ai_score=34, phase_ai_analysis="Ava
--     recommends declining — needs your review...". Candidate-facing screen
--     showed a neutral "Under review — The hiring team will get back to you"
--     with NO rejection screen and NO Improvement Blueprint upsell. Job was
--     created with exclude_from_feed=true and never reached any job board.
--       job          7d672828-d2a3-4f92-b544-b0441dfaa5ae  (JOB-QAB2X1,
--                    "[BLOCKER2 VERIFY PROBE] Licensed Crane Operator")
--       application  15c8d215-7e7c-438b-b90a-00f6e4b27747
--       resume       resumes/3f16c4a5-00dd-4525-9232-4029fffb5cda/1788162207271.png
--
-- ALREADY DELETED during the session (all three REST DELETEs and the storage
-- batch-delete returned 200 with the row/object representation); this block
-- is a no-op, kept for the record.
-- ---------------------------------------------------------------------------
begin;
delete from public.applications where id = 'ee60548c-3562-4218-aab4-b0fc3d8a812c';  -- Front Desk Associate (real job, kept)
delete from public.applications where id = '15c8d215-7e7c-438b-b90a-00f6e4b27747';  -- crane-operator probe
delete from public.jobs         where id = '7d672828-d2a3-4f92-b544-b0441dfaa5ae';  -- crane-operator probe (test-only job)
commit;

delete from storage.objects
 where bucket_id = 'resumes'
   and name in (
     '3f16c4a5-00dd-4525-9232-4029fffb5cda/1788161706457.png',
     '3f16c4a5-00dd-4525-9232-4029fffb5cda/1788162207271.png'
   );

-- ---------------------------------------------------------------------------
-- 2026-08-31  DEEP-PHASE AUDIT (post-quiz-fix rerun)
--   Purpose: the previous audit ran against the BROKEN quiz build, so every
--   screening phase AFTER the quiz had never been exercised. This run drives
--   one candidate through typing test, quiz, chat simulation, chat interview,
--   voice interview, video intro, portfolio and the Daily interview room.
--   Accounts used: EXISTING test accounts only (employer.test@hireflow.dev,
--   candidate.test@hireflow.dev) — no new accounts created.
--   Job carries exclude_from_feed = true and was never published to any board.
--   Rows created (delete block at the bottom of this section):
--     job          dee9dee9-0000-4000-a000-000000000001  (JOB-688F71,
--                  "[DEEPPHASE 0831] Support Specialist - phase probe")
-- ---------------------------------------------------------------------------
--     application  638ac3f3-5b4c-465c-b030-351f4c71dc72  (candidate.test, driven
--                  through every screening phase by the deep-phase audit)
--     resume obj   resumes/3f16c4a5-00dd-4525-9232-4029fffb5cda/1788181229117.png

-- ---------------------------------------------------------------------------
-- 2026-08-31  CANDIDATE-HONESTY AUDIT (post-fix rerun)
--   Purpose: audit what the CANDIDATE is told — that the fake-rejection fix
--   holds in more than one phase, that no AI/Ava/score text leaks to the
--   candidate, and what a passed-over candidate actually experiences given
--   RESEND_API_KEY is unset.
--   Accounts used: EXISTING test accounts only (employer.test@hireflow.dev
--   13e26129-2e6c-4e7b-bb55-deb5ad78f0c4, candidate.test@hireflow.dev
--   3f16c4a5-00dd-4525-9232-4029fffb5cda). NO new accounts created.
--   Job carries exclude_from_feed = true and was never published to any board.
--   Rows created:
--     job          aa11aa11-0831-4bbb-9ccc-000000000001  (JOB-HON831,
--                  "[HONESTY 0831] Bilingual Pharmacy Technician (do not use)")
--     application  aa11aa11-0831-4bbb-9ccc-000000000002  (candidate.test,
--                  deliberately unqualified — no PTCB license, no Spanish;
--                  driven through application form, quiz, typing test and
--                  video intro, then set status='rejected' to verify the
--                  genuine rejection screen still renders)
--     notification  1 row for candidate.test, inserted by the
--                   on_application_status_change DB trigger when the
--                   application above was set to 'rejected'
--     storage objs  resumes/3f16c4a5-00dd-4525-9232-4029fffb5cda/1788184132200.png
--                   resumes/3f16c4a5-00dd-4525-9232-4029fffb5cda/1788184159128.png
--                   videos/3f16c4a5-00dd-4525-9232-4029fffb5cda/aa11aa11-0831-4bbb-9ccc-000000000002-step_hon_video-1788184750006.webm
--   NOT yet deleted — uncomment to remove.
-- ---------------------------------------------------------------------------
-- begin;
-- delete from public.notifications
--  where user_id = '3f16c4a5-00dd-4525-9232-4029fffb5cda'
--    and link = '/applications/aa11aa11-0831-4bbb-9ccc-000000000002';
-- delete from public.applications where id = 'aa11aa11-0831-4bbb-9ccc-000000000002';
-- delete from public.jobs         where id = 'aa11aa11-0831-4bbb-9ccc-000000000001';
-- commit;
--
-- delete from storage.objects
--  where (bucket_id = 'resumes' and name in (
--          '3f16c4a5-00dd-4525-9232-4029fffb5cda/1788184132200.png',
--          '3f16c4a5-00dd-4525-9232-4029fffb5cda/1788184159128.png'))
--     or (bucket_id = 'videos'  and name =
--          '3f16c4a5-00dd-4525-9232-4029fffb5cda/aa11aa11-0831-4bbb-9ccc-000000000002-step_hon_video-1788184750006.webm');

-- ---------------------------------------------------------------------------
-- 2026-08-31  RERUN REGRESSION CHECK (verifies commits 5a82141 + 300802e)
--   Purpose: regression-check the three shipped blocker fixes and the engine
--   redeploy — quiz answerability (all shapes), employer visibility of the
--   recommendation/reason/flags, the false "Critical role-fit concerns" flag,
--   and the anti-auto-reject guard.
--   Accounts used: EXISTING test accounts only (employer.test@hireflow.dev
--   13e26129-2e6c-4e7b-bb55-deb5ad78f0c4, candidate.test@hireflow.dev
--   3f16c4a5-00dd-4525-9232-4029fffb5cda). NO new accounts created.
--   The five real published jobs whose quiz was broken belong to REAL
--   employers, so they were NOT touched: their quiz_questions JSON was cloned
--   verbatim into throwaway jobs under employer.test instead.
--   Every job below carries exclude_from_feed = true and was never published
--   to any board.
--   Rows created:
--     job 44444444-0831-4aaa-8bbb-100000000001  quizclone of Part-Time Mechanic
--     job 44444444-0831-4aaa-8bbb-100000000002  quizclone of Front Desk Receptionist
--     job 44444444-0831-4aaa-8bbb-100000000003  quizclone of Grocery Stocker
--     job 44444444-0831-4aaa-8bbb-100000000004  quizclone of Front Desk Associate
--     job 44444444-0831-4aaa-8bbb-100000000005  quizclone of Solo Cashier
--     job 44444444-0831-4aaa-8bbb-200000000001  Quiz shape probe (MC / situational
--                                               with options / multi_select / no-options)
--     application 44444444-0831-4aaa-8bbb-a00000000001 .. a00000000006
--                                               (candidate.test, one per job above)
-- ---------------------------------------------------------------------------
-- begin;
-- delete from public.applications where id::text like '44444444-0831-4aaa-8bbb-a%';
-- delete from public.jobs         where id::text like '44444444-0831-4aaa-8bbb-%';
-- commit;

-- ---------------------------------------------------------------------------
-- 2026-08-31  DEEP-PHASE AUDIT #2 (post-quiz-fix rerun, every phase after the
--             quiz)
--   Why: the earlier deep-phase run seeded its job with processing_mode =
--   'ava_autopilot', a value the app does not recognise (it only ever compares
--   against 'auto' / 'manual'), so autopilot never ran and that run stalled at
--   the application form. This run uses processing_mode='auto' and drives the
--   typing test, chat simulation, video intro, portfolio, sales simulation,
--   chat interview, voice interview and the Daily interview room.
--   Accounts used: EXISTING bypassed test accounts only
--   (employer.test@hireflow.dev, candidate.test@hireflow.dev). No new accounts.
--   Job carries exclude_from_feed = true and was never pushed to any board.
--   Rows created:
--     job          deadbe11-0831-4b00-9000-000000000001  (JOB-9007C7,
--                  "[DEEPPHASE2 0831] Customer Support Specialist - all-phase
--                  probe (do not use)")
--     application  a4aa57cf-3fd0-4035-a54b-442575b31837  (candidate.test,
--                  driven through every screening phase by this audit)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 2026-08-31  CLEAN FIRST-RUN AUDIT (post-quiz-fix, NO subscription bypass)
--   Purpose: re-run the whole employer->candidate journey from nothing on the
--   fixed build, using a BRAND-NEW employer account that carries no
--   raw_app_meta_data.subscription_bypass, so every plan gate a real paying
--   customer hits is visible (1-job trial cap, Subscribe, AI-analysis quota).
--   Ran entirely against a local dev server (localhost:6177) talking to this
--   production Supabase. Nothing was published to any job board; the job
--   carries exclude_from_feed = true.
--   Accounts created:
--     employer  8e38f97e-6c2d-4c9e-a806-5318f3c4f88c  clean.firstrun.a7@hireflow.dev
--               ("Priya Raman" / "Marlow & Finch Bakery", trial, NO bypass)
--   (job / application / storage-object ids appended below as they are made)
-- ---------------------------------------------------------------------------
--   Rows created by the clean first-run audit:
--     job  f2f81a7d-3c5a-4ec1-884a-b609fe1c1675  (JOB-8BB349,
--          "Bakery Counter Assistant", published, exclude_from_feed = true)

-- ---------------------------------------------------------------------------
-- 2026-08-31  RERUN-B REGRESSION CHECK (quiz fix + employer visibility +
--             risk-flag redeploy + anti-auto-reject guard)
--   Purpose: independently re-verify commits 5a82141 / 300802e and the
--   trigger-ava-analysis + autopilot-batch redeploys. Ran against a local dev
--   server on localhost:7205 talking to this production Supabase. Nothing was
--   published to any board; every job carries exclude_from_feed = true.
--   Accounts used: EXISTING bypassed test accounts only
--   (employer.test@hireflow.dev 13e26129-2e6c-4e7b-bb55-deb5ad78f0c4,
--    candidate.test@hireflow.dev 3f16c4a5-00dd-4525-9232-4029fffb5cda).
--   No new accounts were created.
--   NOTE: a concurrent agent's rows use the 44444444-0831-% prefix; this run
--   deliberately uses its own 55555555-0831-% namespace so the two do not
--   collide.
--
--   Jobs created (all employer.test, published, exclude_from_feed = true):
--     55555555-0831-4aaa-8bbb-100000000001  quizclone of Part-Time Mechanic
--     55555555-0831-4aaa-8bbb-100000000002  quizclone of Front Desk Receptionist
--     55555555-0831-4aaa-8bbb-100000000003  quizclone of Grocery Stocker
--     55555555-0831-4aaa-8bbb-100000000004  quizclone of Front Desk Associate
--     55555555-0831-4aaa-8bbb-100000000005  quizclone of Solo Cashier
--       (quiz_questions copied verbatim from the five real published jobs that
--        were 8-for-8 unanswerable, so the real employers' rows are untouched)
--     55555555-0831-4aaa-8bbb-200000000001  Quiz shape probe (MC / situational
--        +options / multi_select / empty-options / blank-string options /
--        single option)
--   Applications created (all candidate.test):
--     55555555-0831-4bbb-9ccc-100000000001 .. -100000000005
--     55555555-0831-4bbb-9ccc-200000000001
--   (further rows from the live-analysis probes appended below)
--
-- Cleanup:
--   begin;
--   delete from public.applications where id::text like '55555555-0831-4bbb-9ccc-%';
--   delete from public.jobs         where id::text like '55555555-0831-4aaa-8bbb-%';
--   commit;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 2026-08-31  DEEP-PHASE AUDIT #3 (post-quiz-fix rerun; "UI-faithful" configs)
--   Why a third probe job: the earlier deep-phase jobs hand-wrote rich step
--   `config` blobs (scenarios, interview questions, dimensions). The real
--   /jobs/create-legacy UI writes `config: {}` for every step except
--   voice_interview (which gets only language keys) — see addWorkflowStep in
--   src/pages/CreateJob.tsx. A richly-configured probe therefore hides the
--   exact bug class the quiz had (a renderer reading data the creator never
--   writes). This job reproduces the UI's real output byte-for-byte.
--   Accounts used: EXISTING bypassed test accounts only
--     employer.test@hireflow.dev   (13e26129-2e6c-4e7b-bb55-deb5ad78f0c4)
--     candidate.test@hireflow.dev  (3f16c4a5-00dd-4525-9232-4029fffb5cda)
--   No new accounts. Job carries exclude_from_feed = true and was never
--   pushed to any board. Driven against a local dev server (localhost:9412).
--   Rows created:
--     job  beefcafe-0831-4d00-9000-000000000001  (JOB-AB7C02,
--          "[DEEPPHASE3 0831] Client Care Associate - UI-faithful all-phase
--           probe (do not use)")
--     application id appended below once created.
-- ---------------------------------------------------------------------------
-- begin;
--   delete from public.notifications  where application_id in (select id from public.applications where job_id = 'beefcafe-0831-4d00-9000-000000000001');
--   delete from public.interviews     where application_id in (select id from public.applications where job_id = 'beefcafe-0831-4d00-9000-000000000001');
--   delete from public.messages       where application_id in (select id from public.applications where job_id = 'beefcafe-0831-4d00-9000-000000000001');
--   delete from public.applications   where job_id = 'beefcafe-0831-4d00-9000-000000000001';
--   delete from public.jobs           where id = 'beefcafe-0831-4d00-9000-000000000001';
-- commit;
--   DEEP-PHASE AUDIT #3 application row:
--     application  0cda77cb-f48d-40f1-89ab-d750b15024f9  (candidate.test on job
--                  beefcafe-0831-4d00-9000-000000000001; driven through every
--                  screening phase by this audit)

-- ---------------------------------------------------------------------------
-- 2026-08-31  DEEP-PHASE AUDIT #4 (post-quiz-fix rerun; every phase AFTER the
--             quiz, driven end-to-end by one candidate)
--   Why a fourth probe job: the earlier deep-phase jobs all used step type
--   `video_intro`. The real /jobs/create-legacy UI writes `video_message`
--   (see STEP_TYPE_INFO in src/pages/CreateJob.tsx), and it orders steps
--   "regular steps in add-order, then chat_interview, then voice_interview".
--   This job reproduces that exactly, and deliberately places
--   portfolio_upload immediately before video_message to exercise the
--   next-phase hand-off between them.
--   Accounts used: EXISTING bypassed test accounts only (no new accounts)
--     employer.test@hireflow.dev   (13e26129-2e6c-4e7b-bb55-deb5ad78f0c4)
--     candidate.test@hireflow.dev  (3f16c4a5-00dd-4525-9232-4029fffb5cda)
--   Job carries exclude_from_feed = true and was never pushed to any board.
--   Driven against a local dev server (localhost:9733) talking to prod Supabase.
--   Rows created:
--     job  d4d4d4d4-0831-4e00-9000-000000000001  (JOB-DP4831,
--          "[DEEPPHASE4 0831] Member Services Associate - post-quiz phase
--           probe (do not use)")
--     (application + storage object ids appended below as they are made)
-- ---------------------------------------------------------------------------
--   Live-analysis probe rows added by the same run (real trigger-ava-analysis
--   calls against production, to prove the false "Critical role-fit concerns"
--   flag is gone on a clean candidate and still fires on a real conflict):
--     job          55555555-0831-4aaa-8bbb-300000000001  Certified Pharmacy
--                  Technician - risk flag probe   (clean candidate)
--     job          55555555-0831-4aaa-8bbb-300000000002  ... probe B
--                  (deliberately unqualified candidate)
--     application  55555555-0831-4bbb-9ccc-300000000001  (strong, no real gap)
--     application  55555555-0831-4bbb-9ccc-300000000002  (no cert, no Spanish,
--                  no Saturdays, no experience)
--   Both are covered by the same two DELETE statements above.
--   DEEP-PHASE AUDIT #4 rows created:
--     application  d4d4d4d4-0831-4e00-9000-000000000002  (candidate.test on job
--                  d4d4d4d4-0831-4e00-9000-000000000001; driven through the
--                  application form, quiz, typing test, chat simulation,
--                  portfolio upload, video message, sales simulation, chat
--                  interview and voice interview by this audit)
--     storage obj  videos/3f16c4a5-00dd-4525-9232-4029fffb5cda/d4d4d4d4-0831-4e00-9000-000000000002-step_dp4_video-1788186952133.webm
--     storage objs portfolio/… uploaded by the portfolio phase for this
--                  application (see storage.objects filtered by the
--                  application id below)
--   NOT yet deleted — uncomment to remove.
-- ---------------------------------------------------------------------------
-- begin;
--   delete from public.notifications where application_id = 'd4d4d4d4-0831-4e00-9000-000000000002';
--   delete from public.interviews    where application_id = 'd4d4d4d4-0831-4e00-9000-000000000002';
--   delete from public.messages      where application_id = 'd4d4d4d4-0831-4e00-9000-000000000002';
--   delete from public.applications  where id     = 'd4d4d4d4-0831-4e00-9000-000000000002';
--   delete from public.jobs          where id     = 'd4d4d4d4-0831-4e00-9000-000000000001';
-- commit;
--
-- delete from storage.objects
--  where name like '%d4d4d4d4-0831-4e00-9000-000000000002%';
--   Anti-auto-reject guard probe (autopilot path) added by the same run:
--     job          55555555-0831-4aaa-8bbb-300000000003  (processing_mode
--                  'auto', passing_score 90 — the configuration most likely to
--                  make the engine reject on its own)
--     application  55555555-0831-4bbb-9ccc-300000000003  (deliberately terrible
--                  candidate; scored 0, autopilotAction 'reject'; verified the
--                  row stayed status='reviewing' with rejected_by_type NULL
--                  through BOTH trigger-ava-analysis (autopilotDecision:true)
--                  and autopilot-batch)
--   Also covered by the same two DELETE statements above.
--   DEEP-PHASE AUDIT #4, additional row (in-app Daily interview room probe):
--     interview  d4d4d4d4-0831-4e00-9000-000000000003  (on application
--                d4d4d4d4-0831-4e00-9000-000000000002; status 'scheduled',
--                candidate_response 'confirmed' so the interview-rooms
--                function would mint a Daily room. A Daily room named
--                hf-d4d4d4d4-0831-4e00-9000-000000000003 was created in the
--                hireflownow Daily domain by that call and expires on its own.)
--     No email or SMS was sent; the row was created directly, not through the
--     scheduling wizard, so no notification to a real person was triggered.
--   The delete block above already removes this row (delete from
--   public.interviews where application_id = '…0002').
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- ADVERSARIAL VERIFICATION RUN 2026-08-31 — "phase hand-off pre-empted by
-- PhaseAlreadySubmitted" claim. Created against a LOCAL dev server
-- (http://localhost:5733) talking to production Supabase. Employer =
-- employer.test@hireflow.dev (bypassed test account), candidate =
-- candidate.test@hireflow.dev. Nothing real was touched, nothing was emailed,
-- the job carries exclude_from_feed = true and was never published to a feed.
--
--   job          1966ca9d-5e43-4b91-9987-bf3aef3a7288
--                "VERIFY-handoff Typing QA (adversarial verifier)"
--                employer_id 13e26129-2e6c-4e7b-bb55-deb5ad78f0c4,
--                status 'published', exclude_from_feed true,
--                processing_mode 'auto', workflow_steps
--                [step-typing-verify (typing_test), step-video-verify (video_intro)]
--   application  2c587e68-5be9-45a7-9f55-dea3183853a8
--                candidate_id 3f16c4a5-00dd-4525-9232-4029fffb5cda
--                (typing test submitted 3x by the harness; trigger-ava-analysis
--                ran on it and advanced it to step-video-verify)
--
-- To remove:
-- begin;
--   delete from public.applications where id = '2c587e68-5be9-45a7-9f55-dea3183853a8';
--   delete from public.jobs         where id = '1966ca9d-5e43-4b91-9987-bf3aef3a7288';
-- commit;

-- ---------------------------------------------------------------------------
-- 2026-08-31  VOICE-INTERVIEW LAUNCH-BLOCKER FIX — verification probe (event-
-- rename overlay trap + early-start server gate on ava-voice-session)
--   Purpose: (1) prove the reconnected overlay lifts once the client accepts
--   the GA realtime event names (response.output_audio.delta /
--   response.output_audio.done / response.output_audio_transcript.delta)
--   alongside the old ones; (2) exercise the new candidateHasReachedVoiceStep
--   gate in supabase/functions/ava-voice-session/index.ts against a real
--   job/application shape at several phase values (before / at / after the
--   voice_interview step). Created against a LOCAL dev server talking to
--   PRODUCTION Supabase. Employer = employer.test@hireflow.dev (bypassed test
--   account), candidate = candidate.test@hireflow.dev. Nothing was emailed,
--   nothing was published to a board (exclude_from_feed = true), and the job
--   title is flagged "(do not use)".
--
--   job          9a9a9a9a-0831-4f00-9000-000000000001  (JOB-GATEPROBE,
--                "[GATEPROBE 0831] Voice interview early-start gate probe
--                (do not use)"), employer_id
--                13e26129-2e6c-4e7b-bb55-deb5ad78f0c4, status 'published',
--                exclude_from_feed true, workflow_steps = [typing_test
--                step_gate_typing, video_message step_gate_video,
--                voice_interview step_gate_voice]. No quiz.
--   application  9a9a9a9a-0831-4f00-9000-000000000002  candidate_id
--                3f16c4a5-00dd-4525-9232-4029fffb5cda, created with
--                phase='step_gate_typing' (before the voice step). Its phase
--                was then updated in place several times during verification
--                (to 'step_gate_voice', then 'decision', etc.) to exercise
--                the gate at each position — no new application rows were
--                created for that, just UPDATEs to this same row.
--
-- To remove:
-- begin;
--   delete from public.applications where id = '9a9a9a9a-0831-4f00-9000-000000000002';
--   delete from public.jobs         where id = '9a9a9a9a-0831-4f00-9000-000000000001';
-- commit;
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
