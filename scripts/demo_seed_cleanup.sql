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
