-- 2026-09-15: Remove leftover synthetic QA/verification data from production.
--
-- Scope: ONLY jobs whose title carries an explicit test marker ("(do not use)",
-- "Do Not Use", "[GATEPROBE", "[REGRESSION", "[DEEPPHASE", "[RERUN", "[HONESTY",
-- "[RAIL VERIFY", "ADV VERIFY", "COMMS AUDIT", "[E2E ENGINE AUDIT",
-- "VERIFY-handoff"), plus the rows that hang off them. Every id is pinned
-- below (no pattern deletes) and each was confirmed synthetic on 2026-09-15:
--   * every job belongs to an internal test account (employer.test@hireflow.dev
--     or adv.verify.gap19@hireflow.dev) and is documented as an audit/probe row
--     in scripts/demo_seed_cleanup.sql;
--   * every application belongs to candidate.test@hireflow.dev;
--   * the 4 notifications went only to employer.test / candidate.test;
--   * the 2 google_indexing_notifications rows are ping logs for the
--     [GATEPROBE] job URL.
-- NOT touched: unmarked jobs under test accounts (Grocery Stocker, Solo Cashier,
-- Part-Time Mechanic (Oil Change & Maintenance), Remote Personal Assistant,
-- Front Desk Associate, Front Desk Receptionist, Bakery Counter Assistant,
-- Part-Time Mechanic DEMO-SEED, Junior DevOps Engineer), "[E2E TEST] Production
-- Candidate Review QA" (kept as July E2E evidence), and all auth users/profiles.
--
-- Pre-delete backup of every row: ~/hireflow-backups/test-data-cleanup-2026-09-15.json
-- Storage files (SQL deletes are blocked by storage.protect_objects_delete, so
-- they are removed through the Storage API, not here):
--   videos/3f16c4a5-00dd-4525-9232-4029fffb5cda/aa11aa11-0831-4bbb-9ccc-000000000002-step_hon_video-1788184750006.webm
--   videos/3f16c4a5-00dd-4525-9232-4029fffb5cda/d4d4d4d4-0831-4e00-9000-000000000002-step_dp4_video-1788186952133.webm
--   portfolios/3f16c4a5-00dd-4525-9232-4029fffb5cda/d4d4d4d4-0831-4e00-9000-000000000002-step_dp4_portfolio-1788186878699-0.png
--   resumes/3f16c4a5-00dd-4525-9232-4029fffb5cda/1788181229117.png
--   resumes/3f16c4a5-00dd-4525-9232-4029fffb5cda/1788184159128.png
--   resumes/3f16c4a5-00dd-4525-9232-4029fffb5cda/1788184132200.png
--   resumes/3f16c4a5-00dd-4525-9232-4029fffb5cda/e2e-engine-audit-marcus-delaney.pdf

begin;

create temp table cleanup_jobs (id uuid primary key) on commit drop;
insert into cleanup_jobs (id) values
  ('55555555-0831-4aaa-8bbb-100000000001'),  -- [RERUN-B 0831] quizclone of Part-Time Mechanic (Oil Change & Maintenance) (do not use)
  ('55555555-0831-4aaa-8bbb-100000000004'),  -- [RERUN-B 0831] quizclone of Front Desk Associate (do not use)
  ('beefcafe-0831-4d00-9000-000000000001'),  -- [DEEPPHASE3 0831] Client Care Associate - UI-faithful all-phase probe (do not use)
  ('3c02afff-9f2b-47b9-812a-4cb0a7a2c813'),  -- ADV VERIFY GAP19 draft (do not use)
  ('11111111-e2e0-4aaa-8bbb-000000000001'),  -- [E2E ENGINE AUDIT] Lube Technician (do not use)
  ('9a9a9a9a-0831-4f00-9000-000000000001'),  -- [GATEPROBE 0831] Voice interview early-start gate probe (do not use)
  ('11111111-e2e0-4aaa-8bbb-000000000002'),  -- [E2E ENGINE AUDIT] Lube Technician - degradation probe (do not use)
  ('deadbe11-0831-4b00-9000-000000000001'),  -- [DEEPPHASE2 0831] Customer Support Specialist - all-phase probe (do not use)
  ('55555555-0831-4aaa-8bbb-200000000001'),  -- [RERUN-B 0831] Quiz shape probe - MC / situational+opts / multiselect / no-opts / blank-opts /
  ('44444444-0831-4aaa-8bbb-100000000004'),  -- [RERUN 0831] quizclone of Front Desk Associate (do not use)
  ('a0d17e51-0000-4000-b000-000000000001'),  -- [HONESTY AUDIT 0831] Diesel Fleet Mechanic (do not use)
  ('44444444-0831-4aaa-8bbb-100000000002'),  -- [RERUN 0831] quizclone of Front Desk Receptionist (Part-Time, Onsite) (do not use)
  ('c0a11d17-0000-4000-a000-000000000001'),  -- COMMS AUDIT - Do Not Use
  ('44444444-0831-4aaa-8bbb-100000000003'),  -- [RERUN 0831] quizclone of Grocery Stocker (do not use)
  ('7fa17e57-0000-4000-a000-000000000001'),  -- [RAIL VERIFY 0831] Lube Technician (do not use)
  ('55555555-0831-4aaa-8bbb-100000000005'),  -- [RERUN-B 0831] quizclone of Solo Cashier – Daytime, Onsite (do not use)
  ('1966ca9d-5e43-4b91-9987-bf3aef3a7288'),  -- VERIFY-handoff Typing QA (adversarial verifier)
  ('44444444-0831-4aaa-8bbb-100000000005'),  -- [RERUN 0831] quizclone of Solo Cashier – Daytime, Onsite (do not use)
  ('33333333-0831-4aaa-8bbb-100000000002'),  -- [REGRESSION 0831] clone of Front Desk Receptionist (Part-Time, Onsite) (2a3d7db3-c7b3-4906-920e
  ('44444444-0831-4aaa-8bbb-200000000001'),  -- [RERUN 0831] Quiz shape probe - MC / situational+opts / multiselect / no-opts (do not use)
  ('33333333-0831-4aaa-8bbb-100000000005'),  -- [REGRESSION 0831] clone of Solo Cashier – Daytime, Onsite (c4c97dd7-4e1d-419e-93a5-1368e4670306
  ('33333333-0831-4aaa-8bbb-100000000001'),  -- [REGRESSION 0831] clone of Part-Time Mechanic (Oil Change & Maintenance) (00b1d2ca-c78f-4a54-bb
  ('33333333-0831-4aaa-8bbb-100000000003'),  -- [REGRESSION 0831] clone of Grocery Stocker (4bcc9233-556d-4329-b83e-0eb8a2eb80be) (do not use)
  ('55555555-0831-4aaa-8bbb-300000000003'),  -- [RERUN-B 0831] Certified Pharmacy Technician - AUTOPILOT auto-reject guard probe (do not use)
  ('55555555-0831-4aaa-8bbb-300000000002'),  -- [RERUN-B 0831] Certified Pharmacy Technician - risk flag probe B (do not use)
  ('33333333-0831-4aaa-8bbb-000000000001'),  -- [REGRESSION 0831] Quiz Shapes Probe (do not use)
  ('33333333-0831-4aaa-8bbb-100000000004'),  -- [REGRESSION 0831] clone of Front Desk Associate (b1c7544e-fb2b-4263-bd58-08e81a9414ce) (do not
  ('55555555-0831-4aaa-8bbb-100000000003'),  -- [RERUN-B 0831] quizclone of Grocery Stocker (do not use)
  ('d4d4d4d4-0831-4e00-9000-000000000001'),  -- [DEEPPHASE4 0831] Member Services Associate - post-quiz phase probe (do not use)
  ('dee9dee9-0000-4000-a000-000000000001'),  -- [DEEPPHASE 0831] Support Specialist - phase probe (do not use)
  ('55555555-0831-4aaa-8bbb-100000000002'),  -- [RERUN-B 0831] quizclone of Front Desk Receptionist (Part-Time, Onsite) (do not use)
  ('55555555-0831-4aaa-8bbb-300000000001'),  -- [RERUN-B 0831] Certified Pharmacy Technician - risk flag probe (do not use)
  ('44444444-0831-4aaa-8bbb-100000000001'),  -- [RERUN 0831] quizclone of Part-Time Mechanic (Oil Change & Maintenance) (do not use)
  ('aa11aa11-0831-4bbb-9ccc-000000000001');  -- [HONESTY 0831] Bilingual Pharmacy Technician (do not use)

create temp table cleanup_apps (id uuid primary key) on commit drop;
insert into cleanup_apps (id) values
  ('44444444-0831-4aaa-8bbb-000000000001'),
  ('aa11aa11-0831-4bbb-9ccc-000000000002'),
  ('0cda77cb-f48d-40f1-89ab-d750b15024f9'),
  ('55555555-0831-4bbb-9ccc-300000000002'),
  ('9a9a9a9a-0831-4f00-9000-000000000002'),
  ('a0d17e51-0000-4000-b000-00000000a001'),
  ('44444444-0831-4aaa-8bbb-a00000000001'),
  ('44444444-0831-4aaa-8bbb-a00000000002'),
  ('44444444-0831-4aaa-8bbb-a00000000003'),
  ('44444444-0831-4aaa-8bbb-a00000000004'),
  ('44444444-0831-4aaa-8bbb-a00000000005'),
  ('44444444-0831-4aaa-8bbb-a00000000006'),
  ('d4d4d4d4-0831-4e00-9000-000000000002'),
  ('44444444-0831-4aaa-8bbb-100000000003'),
  ('44444444-0831-4aaa-8bbb-100000000004'),
  ('44444444-0831-4aaa-8bbb-100000000001'),
  ('44444444-0831-4aaa-8bbb-100000000002'),
  ('44444444-0831-4aaa-8bbb-100000000005'),
  ('c0a11d17-0000-4000-a000-000000000002'),
  ('22222222-e2e0-4aaa-8bbb-000000000001'),
  ('a4aa57cf-3fd0-4035-a54b-442575b31837'),
  ('22222222-e2e0-4aaa-8bbb-000000000002'),
  ('55555555-0831-4bbb-9ccc-300000000001'),
  ('638ac3f3-5b4c-465c-b030-351f4c71dc72'),
  ('55555555-0831-4bbb-9ccc-100000000001'),
  ('55555555-0831-4bbb-9ccc-100000000002'),
  ('55555555-0831-4bbb-9ccc-100000000003'),
  ('55555555-0831-4bbb-9ccc-100000000004'),
  ('55555555-0831-4bbb-9ccc-100000000005'),
  ('55555555-0831-4bbb-9ccc-200000000001'),
  ('55555555-0831-4bbb-9ccc-300000000003'),
  ('2c587e68-5be9-45a7-9f55-dea3183853a8');

-- Safety rails: abort the whole transaction if anything differs from what was
-- confirmed on 2026-09-15.
do $$
declare n int;
begin
  select count(*) into n from public.jobs where id in (select id from cleanup_jobs);
  if n <> 34 then raise exception 'expected 34 jobs, found %', n; end if;

  select count(*) into n from public.applications where id in (select id from cleanup_apps);
  if n <> 32 then raise exception 'expected 32 applications, found %', n; end if;

  select count(*) into n from public.jobs j left join auth.users u on u.id = j.employer_id
   where j.id in (select id from cleanup_jobs)
     and coalesce(u.email, '') not in ('employer.test@hireflow.dev', 'adv.verify.gap19@hireflow.dev');
  if n > 0 then raise exception '% target job(s) belong to a non-test employer', n; end if;

  select count(*) into n from public.jobs
   where id in (select id from cleanup_jobs) and title !~* 'do not use|\[GATEPROBE|\[REGRESSION|\[DEEPPHASE|VERIFY-handoff|\[RERUN|\[HONESTY|\[RAIL VERIFY|ADV VERIFY|COMMS AUDIT|\[E2E ENGINE AUDIT';
  if n > 0 then raise exception '% target job(s) have no test marker in the title', n; end if;

  select count(*) into n from public.applications
   where job_id in (select id from cleanup_jobs) and id not in (select id from cleanup_apps);
  if n > 0 then raise exception '% application(s) on target jobs were not reviewed', n; end if;

  select count(*) into n from public.applications a left join auth.users u on u.id = a.candidate_id
   where a.id in (select id from cleanup_apps) and coalesce(u.email, '') <> 'candidate.test@hireflow.dev';
  if n > 0 then raise exception '% target application(s) belong to a non-test candidate', n; end if;
end $$;

-- Children first.
delete from public.notifications where id in (
  'fa62a820-beea-432d-9c6d-ba77ad7b28ce',
  '1e1a8caf-1339-461c-9c5f-e722d6eaae61',
  'df5ace08-2d02-4976-b2ee-8157ebf47dc1',
  '314cbc70-b474-4739-99f9-21b8827c4c27'
);

delete from public.google_indexing_notifications where id in (
  '30440655-fd3f-4bb5-8a6b-0d8cf98dc0f4',
  'b24d01f3-393d-491a-9520-6861965eb6b8'
);

delete from public.interviews        where application_id in (select id from cleanup_apps);
delete from public.messages          where application_id in (select id from cleanup_apps);
delete from public.document_requests where application_id in (select id from cleanup_apps);
delete from public.document_packages where application_id in (select id from cleanup_apps);
delete from public.documents         where application_id in (select id from cleanup_apps);
delete from public.applications      where id in (select id from cleanup_apps);
delete from public.jobs              where id in (select id from cleanup_jobs);

commit;

-- Verify afterwards (both should return 0):
--   select count(*) from public.jobs where title ~* 'do not use|\[GATEPROBE|\[REGRESSION|\[DEEPPHASE|VERIFY-handoff|\[RERUN|\[HONESTY|\[RAIL VERIFY|ADV VERIFY|COMMS AUDIT|\[E2E ENGINE AUDIT';
--   select count(*) from public.applications a where not exists (select 1 from public.jobs j where j.id = a.job_id);
