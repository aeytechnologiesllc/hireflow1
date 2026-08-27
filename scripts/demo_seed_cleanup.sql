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

begin;

-- 1. The interview, then the applications, then the job.
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

-- Confirm nothing is left behind:
--   select count(*) from public.jobs where job_code = 'DEMO-SEED-1';         -- 0
--   select count(*) from public.applications where source = 'DEMO-SEED';     -- 0
