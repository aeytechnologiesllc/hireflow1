#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/*_business_trust.sql (opening HireFlow
 * to other businesses safely; docs/BUSINESS-TRUST.md): plain assertions
 * against a real Postgres with real anon / authenticated / service_role roles.
 *
 *   0. It applies, and applies again, on top of *_document_requests_safe.sql.
 *   1. The owner's account is an admin and an approved business.
 *   2. ID papers: a new business is refused, an approved one is not; typed
 *      answers (payment email) are fine for a new business; a suspended one
 *      can ask for nothing.
 *   3. Applications: only to a published job of a business not suspended.
 *   4. Suspend closes the business's published jobs (not its drafts), tells
 *      it, and reinstating reopens exactly those jobs.
 *   5. Only an admin can see the businesses or the reports, or change a
 *      standing; an admin cannot suspend their own account.
 *   6. Reports: signed in only, a known reason, not your own job, one open
 *      report per person per job, at most five a day; the admin is told.
 *   7. Nobody writes the new tables directly; a business reads only its
 *      own standing, a reporter only their own reports.
 *
 * Run with: node scripts/business_trust.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}
const show = (v) => JSON.stringify(v);

const ZACK = "10000000-0000-4000-8000-000000000001"; // the owner: admin, approved
const NEWBIZ = "10000000-0000-4000-8000-000000000002"; // a business that just signed up
const BADBIZ = "10000000-0000-4000-8000-000000000003"; // a business that gets suspended
const ANA = "20000000-0000-4000-8000-000000000001";
const BEN = "20000000-0000-4000-8000-000000000002";
const JOB_Z = "30000000-0000-4000-8000-00000000000a";
const JOB_N = "30000000-0000-4000-8000-00000000000b";
const JOB_B = "30000000-0000-4000-8000-00000000000c";
const JOB_B_DRAFT = "30000000-0000-4000-8000-00000000000d";
const JOB_Z_CLOSED = "30000000-0000-4000-8000-00000000000e";
const JOB_N2 = "30000000-0000-4000-8000-00000000000f";
const APP_ANA_Z = "40000000-0000-4000-8000-000000000001";
const APP_ANA_N = "40000000-0000-4000-8000-000000000002";
const APP_ANA_B = "40000000-0000-4000-8000-000000000003";

async function migration(suffix) {
  const names = (await readdir(MIGRATIONS)).filter((n) => new RegExp(`^\\d+_${suffix}\\.sql$`).test(n));
  return names.length === 1 ? readFile(path.join(MIGRATIONS, names[0]), "utf8") : null;
}

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text, created_at timestamptz default now(), last_sign_in_at timestamptz);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant anon to postgres; grant authenticated to postgres; grant service_role to postgres;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant execute on function auth.role() to anon, authenticated, service_role;
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

    create type public.job_status as enum ('draft', 'published', 'closed', 'archived');
    create type public.notification_type as enum ('message', 'application', 'interview', 'status_update', 'team', 'system');
    create table public.profiles (user_id uuid primary key, full_name text, company_name text);
    create table public.user_roles (user_id uuid, role text);
    create table public.jobs (id uuid primary key, employer_id uuid not null, title text not null, status public.job_status not null default 'draft');
    create table public.applications (id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id), candidate_id uuid not null, status text default 'in_progress');
    create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null, type public.notification_type not null, title text, message text, link text, is_read boolean default false, created_at timestamptz default now());
    create table public.team_members (user_id uuid, employer_id uuid, status text, can_send_documents boolean, assigned_job_ids uuid[]);
    alter table public.jobs enable row level security;
    alter table public.applications enable row level security;
    alter table public.notifications enable row level security;
    create policy "jobs read" on public.jobs for select using (true);
    create policy "jobs owner write" on public.jobs for update using (employer_id = auth.uid());
    create policy "apply" on public.applications for insert with check (auth.uid() = candidate_id);
    create policy "read own apps" on public.applications for select using (auth.uid() = candidate_id);
    -- As live: a job's owner reads the applications to their jobs.
    create policy "owner reads apps" on public.applications for select using (exists (select 1 from public.jobs j where j.id = applications.job_id and j.employer_id = auth.uid()));
    create policy "own notes" on public.notifications for select using (user_id = auth.uid());

    create table public.document_requests (
      id uuid primary key default gen_random_uuid(),
      application_id uuid not null references public.applications(id) on delete cascade,
      employer_id uuid not null, candidate_id uuid not null, document_type text not null,
      custom_document_name text, description text, is_required boolean not null default true, due_date timestamptz,
      status text not null default 'pending', file_url text, file_name text, submitted_at timestamptz,
      reviewed_at timestamptz, reviewed_by uuid, rejection_reason text,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      package_id uuid, candidate_viewed_at timestamptz
    );
    alter table public.document_requests enable row level security;
    create policy "owner asks" on public.document_requests for insert
      with check (auth.uid() = employer_id and exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.id = document_requests.application_id and j.employer_id = auth.uid()));
    -- As live: the owner reads their requests (an insert's RETURNING needs it).
    create policy "owner reads" on public.document_requests for select using (employer_id = auth.uid());
    create schema storage;
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  `);
  await db.exec(`
    insert into auth.users (id, email) values ('${ZACK}', 'zack@yahoo.com'), ('${NEWBIZ}', 'new@biz.example'), ('${BADBIZ}', 'bad@biz.example'), ('${ANA}', 'ana@example.com'), ('${BEN}', 'ben@example.com');
    insert into public.user_roles values ('${ZACK}', 'employer'), ('${NEWBIZ}', 'employer'), ('${BADBIZ}', 'employer'), ('${ANA}', 'candidate'), ('${BEN}', 'candidate');
    insert into public.profiles values ('${ZACK}', 'Zack', 'Zulu Support Team'), ('${NEWBIZ}', 'Nina', 'New Biz'), ('${BADBIZ}', 'Bob', 'Bad Biz'), ('${ANA}', 'Ana Reyes', null), ('${BEN}', 'Ben Cruz', null);
    insert into public.jobs values
      ('${JOB_Z}', '${ZACK}', 'Chat support', 'published'),
      ('${JOB_Z_CLOSED}', '${ZACK}', 'Old role', 'closed'),
      ('${JOB_N}', '${NEWBIZ}', 'Night shift agent', 'published'),
      ('${JOB_B}', '${BADBIZ}', 'Easy money from home', 'published'),
      ('${JOB_B_DRAFT}', '${BADBIZ}', 'Draft role', 'draft'),
      ('${JOB_N2}', '${NEWBIZ}', 'Day shift agent', 'published');
    insert into public.applications (id, job_id, candidate_id) values ('${APP_ANA_Z}', '${JOB_Z}', '${ANA}'), ('${APP_ANA_N}', '${JOB_N}', '${ANA}'), ('${APP_ANA_B}', '${JOB_B}', '${ANA}');
  `);

  async function as(uid, role, sql, params = []) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
    await db.exec(`select set_config('request.jwt.claim.role', '${role}', false);`);
    await db.exec(`set role ${role};`);
    try {
      const r = await db.query(sql, params);
      return { ok: true, rows: r.rows };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      await db.exec(`reset role;`);
      await db.exec(`select set_config('request.jwt.claim.sub', '', false);`);
      await db.exec(`select set_config('request.jwt.claim.role', '', false);`);
    }
  }
  const pg = (sql, params = []) => db.query(sql, params).then((r) => r.rows);
  return { db, as, pg };
}

async function main() {
  const safe = await migration("document_requests_safe");
  const trust = await migration("business_trust");
  check("the migration file is there, once", !!trust && !!safe);
  if (!trust || !safe) return;
  const { db, as, pg } = await setup();

  // 0 ──────────────────────────────────────────────────────────────────
  let applied = true;
  try {
    await db.exec(safe);
    await db.exec(trust);
    await db.exec(trust);
  } catch (e) {
    applied = false;
    console.log(e.message);
  }
  check("0. it applies, and applies again", applied);

  // 1 ──────────────────────────────────────────────────────────────────
  const zackSees = await as(ZACK, "authenticated", `select public.my_business_standing() as s`);
  check("1. the owner is an admin and an approved business, who may ask for IDs", zackSees.rows?.[0]?.s?.is_admin === true && zackSees.rows[0].s.status === "approved" && zackSees.rows[0].s.can_request_ids === true, show(zackSees));
  const newSees = await as(NEWBIZ, "authenticated", `select public.my_business_standing() as s`);
  check("1. a new business is new, not an admin, and may not ask for IDs yet", newSees.rows?.[0]?.s?.status === "new" && newSees.rows[0].s.is_admin === false && newSees.rows[0].s.can_request_ids === false, show(newSees));

  // 2 ──────────────────────────────────────────────────────────────────
  const ask = (uid, app, kind) => as(uid, "authenticated", `insert into public.document_requests (application_id, employer_id, candidate_id, document_type) values ($1, $2, $3, $4) returning id`, [app, uid, ANA, kind]);
  const newId = await ask(NEWBIZ, APP_ANA_N, "government_id");
  check("2. a new business cannot ask for a government ID", !newId.ok && /id_requests_need_approval/.test(newId.error), show(newId));
  const newNbi = await ask(NEWBIZ, APP_ANA_N, "nbi_clearance");
  const newAddr = await ask(NEWBIZ, APP_ANA_N, "proof_of_address");
  check("2. …nor an NBI clearance or proof of address", !newNbi.ok && !newAddr.ok, show([newNbi, newAddr]));
  const newPay = await ask(NEWBIZ, APP_ANA_N, "payment_email");
  check("2. …but can ask for the payment email (no ID paper)", newPay.ok, show(newPay));
  const zackId = await ask(ZACK, APP_ANA_Z, "government_id");
  check("2. the approved owner asks for a government ID as before", zackId.ok, show(zackId));

  // 3 ──────────────────────────────────────────────────────────────────
  const applyTo = (job) => as(BEN, "authenticated", `insert into public.applications (job_id, candidate_id) values ($1, $2) returning id`, [job, BEN]);
  check("3. anyone can still apply to a published job", (await applyTo(JOB_Z)).ok);
  const toClosed = await applyTo(JOB_Z_CLOSED);
  check("3. nobody can apply to a closed job", !toClosed.ok && /job_not_open/.test(toClosed.error), show(toClosed));
  const toDraft = await applyTo(JOB_B_DRAFT);
  check("3. …or a draft", !toDraft.ok && /job_not_open/.test(toDraft.error), show(toDraft));

  // 5 (refusals first) ──────────────────────────────────────────────────
  const strangerList = await as(NEWBIZ, "authenticated", `select * from public.admin_businesses()`);
  check("5. a business cannot see the list of businesses", !strangerList.ok && /admins_only/.test(strangerList.error), show(strangerList));
  const strangerSet = await as(BADBIZ, "authenticated", `select public.admin_set_business_status($1, 'approved')`, [BADBIZ]);
  check("5. …nor approve itself", !strangerSet.ok && /admins_only/.test(strangerSet.error), show(strangerSet));
  const applicantReports = await as(ANA, "authenticated", `select * from public.admin_reports()`);
  check("5. an applicant cannot read the reports", !applicantReports.ok && /admins_only/.test(applicantReports.error));
  const anonList = await as(null, "anon", `select * from public.admin_businesses()`);
  check("5. nor can anyone signed out", !anonList.ok);
  const selfSuspend = await as(ZACK, "authenticated", `select public.admin_set_business_status($1, 'suspended', 'test')`, [ZACK]);
  check("5. an admin cannot suspend their own account", !selfSuspend.ok && /cannot_suspend_yourself/.test(selfSuspend.error), show(selfSuspend));
  const notBiz = await as(ZACK, "authenticated", `select public.admin_set_business_status($1, 'approved')`, [ANA]);
  check("5. an applicant is not a business to approve", !notBiz.ok && /not_a_business/.test(notBiz.error));

  // 6 ──────────────────────────────────────────────────────────────────
  const anonReport = await as(null, "anon", `select public.report_employer($1, 'fake_job', 'x')`, [JOB_B]);
  check("6. reporting needs a sign-in", !anonReport.ok, show(anonReport));
  const badReason = await as(ANA, "authenticated", `select public.report_employer($1, 'i_dont_like_them', 'x')`, [JOB_B]);
  check("6. only a known reason", !badReason.ok && /report_reason_unknown/.test(badReason.error));
  const ownJob = await as(BADBIZ, "authenticated", `select public.report_employer($1, 'fake_job', 'x')`, [JOB_B]);
  check("6. nobody reports their own job", !ownJob.ok && /report_own_job/.test(ownJob.error));
  const r1 = await as(ANA, "authenticated", `select public.report_employer($1, 'asked_for_money', 'They asked me to pay 500 pesos for training.') as id`, [JOB_B]);
  check("6. an applicant reports a job that asked for money", r1.ok && !!r1.rows[0].id, show(r1));
  const r2 = await as(ANA, "authenticated", `select public.report_employer($1, 'suspicious_documents', 'And for my bank PIN.') as id`, [JOB_B]);
  check("6. a second report on the same job adds to the first", r2.ok && r2.rows[0].id === r1.rows[0].id, show(r2));
  const rows = await pg(`select reason, details from public.employer_reports`);
  check("…with both details kept", rows.length === 1 && /500 pesos[\s\S]*bank PIN/.test(rows[0].details), show(rows));
  const told = await pg(`select title from public.notifications where user_id = $1`, [ZACK]);
  check("6. the admin is told in their bell", told.some((n) => n.title === "A job was reported"), show(told));
  for (const job of [JOB_Z, JOB_N, JOB_N2, JOB_Z_CLOSED, JOB_B_DRAFT]) await as(BEN, "authenticated", `select public.report_employer($1, 'other', 'spam')`, [job]);
  const sixth = await as(BEN, "authenticated", `select public.report_employer($1, 'other', 'spam')`, [JOB_B]);
  const fifth = (await pg(`select count(*)::int as n from public.employer_reports where reporter_id = $1`, [BEN]))[0].n;
  check("6. at most five reports a day from one person", fifth === 5 && !sixth.ok && /report_too_many/.test(sixth.error), show({ fifth, sixth }));
  const anaReads = await as(ANA, "authenticated", `select id from public.employer_reports`);
  check("7. a reporter reads only their own reports", anaReads.ok && anaReads.rows.length === 1, show(anaReads));
  const bizReads = await as(BADBIZ, "authenticated", `select id from public.employer_reports`);
  check("7. the reported business cannot read who reported it", bizReads.ok && bizReads.rows.length === 0, show(bizReads));
  const directReport = await as(ANA, "authenticated", `insert into public.employer_reports (employer_id, reporter_id, reason) values ($1, $2, 'other')`, [BADBIZ, ANA]);
  check("7. nobody writes a report except through report_employer", !directReport.ok);
  const zackReports = await as(ZACK, "authenticated", `select reason, company_name, job_title, reporter_name from public.admin_reports()`);
  check("5. the admin reads the reports, with names", zackReports.ok && zackReports.rows.some((r) => r.company_name === "Bad Biz" && r.job_title === "Easy money from home" && r.reporter_name === "Ana Reyes"), show(zackReports.rows?.slice(0, 2)));

  // 4 ──────────────────────────────────────────────────────────────────
  const list = await as(ZACK, "authenticated", `select company_name, status, jobs_live, open_reports from public.admin_businesses()`);
  const badOpen = (await pg(`select count(*)::int as n from public.employer_reports where employer_id = $1 and status = 'open'`, [BADBIZ]))[0].n;
  check("5. the admin sees every business with its jobs and reports", list.ok && list.rows.length === 3 && badOpen > 0 && list.rows.find((r) => r.company_name === "Bad Biz")?.open_reports === badOpen && list.rows.find((r) => r.company_name === "Zulu Support Team")?.status === "approved", show(list.rows));
  const suspend = await as(ZACK, "authenticated", `select public.admin_set_business_status($1, 'suspended', 'Asked applicants for money')`, [BADBIZ]);
  check("4. the admin suspends a business", suspend.ok, show(suspend));
  const jobsNow = await pg(`select id, status::text from public.jobs where employer_id = $1 order by id`, [BADBIZ]);
  check("4. its published job is closed; its draft stays a draft", jobsNow.find((j) => j.id === JOB_B)?.status === "closed" && jobsNow.find((j) => j.id === JOB_B_DRAFT)?.status === "draft", show(jobsNow));
  const applyBad = await as(BEN, "authenticated", `insert into public.applications (job_id, candidate_id) values ($1, $2)`, [JOB_B, BEN]);
  check("4. nobody can apply to it", !applyBad.ok && /job_not_open/.test(applyBad.error));
  const badAsks = await ask(BADBIZ, APP_ANA_B, "payment_email");
  check("4. a suspended business can ask for nothing at all", !badAsks.ok && /business_suspended/.test(badAsks.error), show(badAsks));
  const bizTold = await pg(`select title from public.notifications where user_id = $1`, [BADBIZ]);
  check("4. it is told its account is paused", bizTold.some((n) => n.title === "Your account is paused"));
  const ownStanding = await as(BADBIZ, "authenticated", `select status, reason from public.business_standing`);
  check("7. a business reads its own standing, and only its own", ownStanding.ok && ownStanding.rows.length === 1 && ownStanding.rows[0].status === "suspended", show(ownStanding));
  const writeStanding = await as(BADBIZ, "authenticated", `update public.business_standing set status = 'approved' where employer_id = $1 returning status`, [BADBIZ]);
  check("7. nobody changes a standing directly", !writeStanding.ok || writeStanding.rows.length === 0, show(writeStanding));
  const reinstate = await as(ZACK, "authenticated", `select public.admin_set_business_status($1, 'approved')`, [BADBIZ]);
  const jobsAfter = await pg(`select id, status::text from public.jobs where employer_id = $1 order by id`, [BADBIZ]);
  check("4. reinstating reopens exactly the jobs the suspension closed", reinstate.ok && jobsAfter.find((j) => j.id === JOB_B)?.status === "published" && jobsAfter.find((j) => j.id === JOB_B_DRAFT)?.status === "draft", show(jobsAfter));
  const approvedAsks = await ask(BADBIZ, APP_ANA_B, "government_id");
  check("4. once approved, it may ask for an ID", approvedAsks.ok, show(approvedAsks));
  const close = await as(ZACK, "authenticated", `select public.admin_close_report($1)`, [r1.rows[0].id]);
  const closed = (await pg(`select status from public.employer_reports where id = $1`, [r1.rows[0].id]))[0];
  check("5. the admin closes a report", close.ok && closed.status === "closed");
  const adminTable = await as(ANA, "authenticated", `select * from public.platform_admins`);
  check("7. nobody reads or writes the admin list from a client", !adminTable.ok);
  const helper = await as(ANA, "authenticated", `select public.business_status_of($1)`, [BADBIZ]);
  check("7. the internal standing check is not callable from a client", !helper.ok);
}

await main();
console.log(`\nbusiness trust (pglite): ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
