-- 2026-09-16: Clear ALL remaining synthetic QA/test data from production (owner: "you can clear those remaining unmarked jobs, that's fine").
-- After the 2026-09-15 marker cleanup, every job left in production belonged to an internal test account; this removes the rest.
-- Every id is pinned; the script aborts if any job belongs to a non-test employer or any application to a non-test candidate.
-- Backup of every affected row: ~/hireflow-backups/test-data-cleanup-2026-09-16.json
-- Jobs removed:
--   4bcc9233-556d-4329-b83e-0eb8a2eb80be  Grocery Stocker
--   00b1d2ca-c78f-4a54-bbd5-539f53aa3de3  Part-Time Mechanic (Oil Change & Maintenance)
--   c4c97dd7-4e1d-419e-93a5-1368e4670306  Solo Cashier – Daytime, Onsite
--   984f71e5-e2f3-476c-a501-d009acba5be9  Remote Personal Assistant
--   cca940b8-251b-467f-8eb5-33c8879a7371  Junior DevOps Engineer (Remote, Pakistan)
--   3f593322-b141-4074-82eb-b3ead7dd38ac  [E2E TEST] Production Candidate Review QA
--   915cbf28-62ee-4f78-a46f-1be0d40088a6  Part-Time Mechanic
--   b1c7544e-fb2b-4263-bd58-08e81a9414ce  Front Desk Associate
--   2a3d7db3-c7b3-4906-920e-c40199b63a0d  Front Desk Receptionist (Part-Time, Onsite)
--   f2f81a7d-3c5a-4ec1-884a-b609fe1c1675  Bakery Counter Assistant
-- Auth users, profiles and roles are NOT touched.

begin;
create temp table cj (id uuid primary key) on commit drop;
insert into cj values
  ('4bcc9233-556d-4329-b83e-0eb8a2eb80be'),
  ('00b1d2ca-c78f-4a54-bbd5-539f53aa3de3'),
  ('c4c97dd7-4e1d-419e-93a5-1368e4670306'),
  ('984f71e5-e2f3-476c-a501-d009acba5be9'),
  ('cca940b8-251b-467f-8eb5-33c8879a7371'),
  ('3f593322-b141-4074-82eb-b3ead7dd38ac'),
  ('915cbf28-62ee-4f78-a46f-1be0d40088a6'),
  ('b1c7544e-fb2b-4263-bd58-08e81a9414ce'),
  ('2a3d7db3-c7b3-4906-920e-c40199b63a0d'),
  ('f2f81a7d-3c5a-4ec1-884a-b609fe1c1675');
create temp table ca (id uuid primary key) on commit drop;
insert into ca values
  ('6e4f006d-61fe-470b-a021-23a4f0d3755e'),
  ('0fa8e02a-307b-4172-adcc-793fd2a37b37'),
  ('0dbd93cf-431b-4527-a1c0-4ecf27a58058'),
  ('f6b5442c-db5f-4be9-8901-9fbaa502d4bd'),
  ('52b58340-72c8-4697-8a53-2aa60824edbe'),
  ('4e1616bf-4a94-4cf0-a71d-cfaeae6d3724'),
  ('253b7195-531b-4b8c-9a0e-3e3510636cda'),
  ('39c41535-0319-43b7-b84a-e0c2415ba635'),
  ('fac4eb99-1b19-4516-978c-1f29f6b01116'),
  ('0dc605b1-5510-4ceb-9af5-62cbfc87bf30'),
  ('0c28e735-b62a-4d0b-b6c7-b0aacf91ce68'),
  ('a27f8e3c-fc91-4ce5-aa3d-ebf6661735d4'),
  ('ac890d89-9497-420e-963a-d6ec54603f26');

do $$
declare n int;
begin
  select count(*) into n from public.jobs where id in (select id from cj);
  if n <> 10 then raise exception 'expected 10 jobs, found %', n; end if;
  select count(*) into n from public.applications where job_id in (select id from cj);
  if n <> 13 then raise exception 'expected 13 applications on target jobs, found % (new data since backup?)', n; end if;
  select count(*) into n from public.jobs j left join auth.users u on u.id = j.employer_id
   where j.id in (select id from cj) and coalesce(u.email,'') not in ('zack@yahoo.com', 'hireflow.e2e.employer.mrlh4ydj@example.com', 'employer.test@hireflow.dev', 'hireflow.qa.signup.20260830@hireflow.dev', 'hireflow.e2e.employer.20260831@hireflow.dev', 'clean.firstrun.a7@hireflow.dev');
  if n > 0 then raise exception '% job(s) belong to a non-test employer', n; end if;
  select count(*) into n from public.applications a left join auth.users u on u.id = a.candidate_id
   where a.id in (select id from ca) and coalesce(u.email,'') not in ('demo.candidate.8548@hireflow.app', 'hireflow.e2e.candidate.mrlh4ydj@example.com', 'hireflow.e2e.candidate.visible.mrlhnpx6@example.com', 'p0verify1782695613970@hireflow.test', 'candidate.test@hireflow.dev', 'welcome.demo.1782571655@hireflow.dev', 'authdiag_178255971625864@hireflow.dev', 'hireflow.e2e.candidate.20260831@hireflow.dev', 'qa.candidate.hf.sep15@mailinator.com');
  if n > 0 then raise exception '% application(s) belong to a non-test candidate', n; end if;
  select count(*) into n from public.jobs where id not in (select id from cj);
  if n > 0 then raise exception '% job(s) exist that were not reviewed — stop', n; end if;
end $$;

delete from public.notifications where id in (
  '71ded094-e834-4066-86e4-16f4c5a612c4',
  '66016dd0-493e-43bd-a2f6-db85f183e978',
  '75ed89dd-493a-4daf-b946-4087cc1400e3',
  '594010e8-4671-4f9d-807f-517c7bd46c35',
  'cfe0a4f4-751b-4800-b56d-baa2b98cd5df',
  '38d5e021-91e1-460d-8eeb-3306c9621c3a',
  '179a506a-2352-41b4-bf48-c03dfa5824fb',
  'dd4e1164-d7e8-44c5-ad2b-ecb98d6e04d1'
);
delete from public.google_indexing_notifications where job_id in (select id from cj);
delete from public.voice_session_log where application_id in (select id from ca);
delete from public.quiz_attempt_ledger where job_id in (select id from cj);
delete from public.messages where application_id in (select id from ca);
delete from public.interviews where application_id in (select id from ca);
delete from public.document_requests where application_id in (select id from ca);
delete from public.document_packages where application_id in (select id from ca);
delete from public.documents where application_id in (select id from ca);
delete from public.applications where id in (select id from ca);
delete from public.jobs where id in (select id from cj);
commit;

-- Verify (both 0):
--   select count(*) from public.jobs;
--   select count(*) from public.applications;
