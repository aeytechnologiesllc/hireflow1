#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/*_document_requests_safe.sql
 * ("Request documents", docs/DOCUMENT-REQUESTS.md): plain assertions against
 * a real Postgres with the live document_requests policies (read from
 * production on 2026-10-10) and the live storage rules for the
 * `requested-documents` bucket, not a text match.
 *
 * The owner, 2026-10-10: "how do I ask them for things like their driver
 * license or a government ID? ... and have it encrypted in some way?" Before
 * this, the table let an applicant rewrite any column of their own request
 * and point it at someone else's file, and let an employer name any
 * applicant. This proves:
 *
 *   0. The migration applies twice; the columns and the log table are there.
 *   1. A new request from the hiring side is always pending and empty, for
 *      the applicant on that application, filed under the job's owner, even
 *      when the row sent says otherwise. Nobody asks on a job that is not
 *      theirs; a team member only with "can send documents".
 *   2. The applicant sends: a file in their own folder or a typed answer, and
 *      the time it was sent is the database's. They cannot approve it,
 *      rename what was asked, move it, point it at another folder, or write
 *      more than 120 characters. Nobody else's request is theirs to touch.
 *   3. The hiring side approves or asks again, only once something is sent,
 *      and never changes what the applicant sent. Once approved, the
 *      applicant can no longer change it. After "ask again" they can send it
 *      again.
 *   4. The service role (the cleanup function) can delete a file's link.
 *   5. The log of openings: nobody writes it from a client; the owner and the
 *      applicant read it; another applicant or employer does not.
 *   6. Storage: the employers' LIKE rule is gone (they open files only
 *      through requested-document-url); the applicant's own-folder rules
 *      stay, and an employer reads no file straight from the bucket.
 *
 * anon / authenticated / service_role are real, separate roles, so RLS and
 * GRANT/REVOKE are genuinely in force.
 *
 * Run with: node scripts/document_requests.pglite.test.mjs
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

const OWNER = "10000000-0000-4000-8000-000000000001";
const OTHER_EMP = "10000000-0000-4000-8000-000000000002";
const TEAM = "10000000-0000-4000-8000-0000000000a1"; // may send documents
const TEAM_NO = "10000000-0000-4000-8000-0000000000a2"; // may not
const ANA = "20000000-0000-4000-8000-000000000001";
const BEN = "20000000-0000-4000-8000-000000000002";
const JOB = "30000000-0000-4000-8000-00000000000a";
const JOB_X = "30000000-0000-4000-8000-0000000000aa";
const APP_ANA = "40000000-0000-4000-8000-000000000001";
const APP_BEN_X = "40000000-0000-4000-8000-000000000002";

async function migrationFile() {
  const names = (await readdir(MIGRATIONS)).filter((n) => /^\d+_document_requests_safe\.sql$/.test(n));
  return names.length === 1 ? path.join(MIGRATIONS, names[0]) : null;
}

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create or replace function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
    $$;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant anon to postgres;
    grant authenticated to postgres;
    grant service_role to postgres;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant execute on function auth.role() to anon, authenticated, service_role;
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

    create table public.jobs (id uuid primary key, employer_id uuid not null, title text not null);
    create table public.applications (id uuid primary key, job_id uuid not null references public.jobs(id), candidate_id uuid not null, status text default 'offered');
    create table public.team_members (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null, employer_id uuid not null,
      status text default 'active',
      can_send_documents boolean default false,
      assigned_job_ids uuid[] default '{}'
    );
    -- Live: a plan check (Zack's account is unlimited). Here: the caller is
    -- the employer, or active on their team.
    create or replace function public.can_create_document_workflows_for_user(target_user_id uuid) returns boolean
      language sql stable security definer set search_path = public as $$
      select target_user_id = auth.uid()
          or auth.role() = 'service_role'
          or exists (select 1 from public.team_members tm where tm.user_id = auth.uid() and tm.employer_id = target_user_id and tm.status = 'active')
    $$;
    create or replace function public.update_updated_at_column() returns trigger language plpgsql as $$
    begin new.updated_at := now(); return new; end; $$;

    -- document_requests as it is live (2026-10-10).
    create table public.document_requests (
      id uuid primary key default gen_random_uuid(),
      application_id uuid not null references public.applications(id) on delete cascade,
      employer_id uuid not null,
      candidate_id uuid not null,
      document_type text not null,
      custom_document_name text,
      description text,
      is_required boolean not null default true,
      due_date timestamptz,
      status text not null default 'pending' check (status = any (array['pending','submitted','reviewed','approved','rejected'])),
      file_url text,
      file_name text,
      submitted_at timestamptz,
      reviewed_at timestamptz,
      reviewed_by uuid,
      rejection_reason text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      package_id uuid,
      candidate_viewed_at timestamptz
    );
    alter table public.document_requests enable row level security;
    create trigger update_document_requests_updated_at before update on public.document_requests for each row execute function public.update_updated_at_column();
    create policy "Employers can view document requests for their jobs" on public.document_requests for select
      using (exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.id = document_requests.application_id and j.employer_id = auth.uid()));
    create policy "Employers can update document requests" on public.document_requests for update
      using (exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.id = document_requests.application_id and j.employer_id = auth.uid()));
    create policy "Employers can delete document requests" on public.document_requests for delete
      using (exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.id = document_requests.application_id and j.employer_id = auth.uid()));
    create policy "Candidates can view their own document requests" on public.document_requests for select using (auth.uid() = candidate_id);
    create policy "Candidates can update their own document requests" on public.document_requests for update using (auth.uid() = candidate_id) with check (auth.uid() = candidate_id);
    create policy "Team members can view document requests for assigned jobs" on public.document_requests for select
      using (exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id join public.team_members tm on tm.employer_id = j.employer_id
        where a.id = document_requests.application_id and tm.user_id = auth.uid() and tm.status = 'active' and (array_length(tm.assigned_job_ids, 1) is null or j.id = any (tm.assigned_job_ids))));
    create policy "Team members can update document requests if permitted" on public.document_requests for update
      using (exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id join public.team_members tm on tm.employer_id = j.employer_id
        where a.id = document_requests.application_id and tm.user_id = auth.uid() and tm.status = 'active' and tm.can_send_documents = true and (array_length(tm.assigned_job_ids, 1) is null or j.id = any (tm.assigned_job_ids))));
    create policy "Employers can create document requests" on public.document_requests for insert
      with check ((auth.uid() = employer_id) and public.can_create_document_workflows_for_user(auth.uid())
        and exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.id = document_requests.application_id and j.employer_id = auth.uid()));
    create policy "Team members can create document requests if permitted" on public.document_requests for insert
      with check (exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id join public.team_members tm on tm.employer_id = j.employer_id
        where a.id = document_requests.application_id and tm.user_id = auth.uid() and tm.status = 'active' and tm.can_send_documents = true
          and public.can_create_document_workflows_for_user(j.employer_id) and (array_length(tm.assigned_job_ids, 1) is null or j.id = any (tm.assigned_job_ids))));

    -- storage.objects, with the live rules for this bucket.
    create schema storage;
    grant usage on schema storage to anon, authenticated, service_role;
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null);
    grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
    alter table storage.objects enable row level security;
    create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    grant execute on function storage.foldername(text) to anon, authenticated, service_role;
    create policy "Candidates can upload requested documents" on storage.objects for insert
      with check (bucket_id = 'requested-documents' and (auth.uid())::text = (storage.foldername(name))[1]);
    create policy "Candidates can view their requested documents" on storage.objects for select
      using (bucket_id = 'requested-documents' and (auth.uid())::text = (storage.foldername(name))[1]);
    create policy "Candidates can update their requested documents" on storage.objects for update
      using (bucket_id = 'requested-documents' and (auth.uid())::text = (storage.foldername(name))[1]);
    create policy "Candidates can delete their requested documents" on storage.objects for delete
      using (bucket_id = 'requested-documents' and (auth.uid())::text = (storage.foldername(name))[1]);
    create policy "Employers can view applicant requested documents" on storage.objects for select
      using (bucket_id = 'requested-documents' and exists (select 1 from public.document_requests dr join public.applications a on a.id = dr.application_id join public.jobs j on j.id = a.job_id
        where dr.file_url like ('%' || objects.name || '%') and j.employer_id = auth.uid()));
  `);
  await db.exec(`
    insert into auth.users (id) values ('${OWNER}'), ('${OTHER_EMP}'), ('${TEAM}'), ('${TEAM_NO}'), ('${ANA}'), ('${BEN}');
    insert into public.jobs values ('${JOB}', '${OWNER}', 'Chat support'), ('${JOB_X}', '${OTHER_EMP}', 'Other');
    insert into public.applications (id, job_id, candidate_id) values ('${APP_ANA}', '${JOB}', '${ANA}'), ('${APP_BEN_X}', '${JOB_X}', '${BEN}');
    insert into public.team_members (user_id, employer_id, can_send_documents) values ('${TEAM}', '${OWNER}', true), ('${TEAM_NO}', '${OWNER}', false);
    insert into storage.objects (bucket_id, name) values ('requested-documents', '${ANA}/r1/id.jpg'), ('requested-documents', '${BEN}/r9/id.jpg');
  `);

  async function as(uid, role, sql, params = []) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
    await db.exec(`select set_config('request.jwt.claim.role', '${role}', false);`);
    await db.exec(`set role ${role};`);
    try {
      const r = await db.query(sql, params);
      return { ok: true, rows: r.rows };
    } catch (e) {
      return { ok: false, error: e.message, code: e.code };
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
  const file = await migrationFile();
  check("the migration file is there, once", !!file);
  if (!file) return;
  const sql = await readFile(file, "utf8");
  const { db, as, pg } = await setup();

  // 0 ──────────────────────────────────────────────────────────────────────
  let applied = true;
  try {
    await db.exec(sql);
    await db.exec(sql);
  } catch (e) {
    applied = false;
    console.log(e.message);
  }
  check("0. it applies, and applies again", applied);
  const cols = (await pg(`select column_name from information_schema.columns where table_name = 'document_requests'`)).map((r) => r.column_name);
  check("0. answer_text and file_deleted_at exist", cols.includes("answer_text") && cols.includes("file_deleted_at"));
  check("0. the log table exists, with RLS on", (await pg(`select relrowsecurity from pg_class where oid = 'public.document_request_events'::regclass`))[0]?.relrowsecurity === true);

  // 1 ──────────────────────────────────────────────────────────────────────
  const forged = await as(
    OWNER,
    "authenticated",
    `insert into public.document_requests (application_id, employer_id, candidate_id, document_type, status, file_url, answer_text, reviewed_at, rejection_reason)
     values ($1, $2, $3, 'government_id', 'approved', '${BEN}/r9/id.jpg', 'x', now(), 'no') returning *`,
    [APP_ANA, OWNER, BEN],
  );
  const r1 = forged.rows?.[0];
  check("1. the owner asks on their own job", forged.ok, forged.error);
  check(
    "1. …and the row is for the application's applicant, pending and empty, whatever was sent",
    r1 && r1.candidate_id === ANA && r1.status === "pending" && r1.file_url === null && r1.answer_text === null && r1.reviewed_at === null && r1.rejection_reason === null,
    show(r1),
  );
  const elsewhere = await as(OWNER, "authenticated", `insert into public.document_requests (application_id, employer_id, candidate_id, document_type) values ($1, $2, $3, 'tin')`, [APP_BEN_X, OWNER, BEN]);
  check("1. nobody asks on a job that is not theirs", !elsewhere.ok, show(elsewhere));
  const byTeam = await as(TEAM, "authenticated", `insert into public.document_requests (application_id, employer_id, candidate_id, document_type) values ($1, $2, $3, 'payment_email') returning employer_id, candidate_id`, [APP_ANA, TEAM, ANA]);
  check("1. a team member who may send documents can ask, filed under the job's owner", byTeam.ok && byTeam.rows[0].employer_id === OWNER && byTeam.rows[0].candidate_id === ANA, show(byTeam));
  const byTeamNo = await as(TEAM_NO, "authenticated", `insert into public.document_requests (application_id, employer_id, candidate_id, document_type) values ($1, $2, $3, 'tin')`, [APP_ANA, OWNER, ANA]);
  check("1. a team member who may not, cannot", !byTeamNo.ok, show(byTeamNo));
  const byApplicant = await as(ANA, "authenticated", `insert into public.document_requests (application_id, employer_id, candidate_id, document_type) values ($1, $2, $3, 'tin')`, [APP_ANA, OWNER, ANA]);
  check("1. an applicant cannot make a request", !byApplicant.ok, show(byApplicant));
  const byAnon = await as(null, "anon", `insert into public.document_requests (application_id, employer_id, candidate_id, document_type) values ($1, $2, $3, 'tin')`, [APP_ANA, OWNER, ANA]);
  check("1. nor can anyone signed out", !byAnon.ok);

  const idReq = r1.id;
  const payReq = byTeam.rows ? (await pg(`select id from public.document_requests where document_type = 'payment_email'`))[0].id : null;

  // 2 ──────────────────────────────────────────────────────────────────────
  const tooEarly = await as(OWNER, "authenticated", `update public.document_requests set status = 'approved' where id = $1`, [idReq]);
  check("3. the hiring side cannot approve what has not been sent", !tooEarly.ok && /request_not_received/.test(tooEarly.error), show(tooEarly));

  const selfApprove = await as(ANA, "authenticated", `update public.document_requests set status = 'approved' where id = $1`, [idReq]);
  check("2. the applicant cannot approve their own", !selfApprove.ok && /request_status_not_yours/.test(selfApprove.error), show(selfApprove));
  const otherFolder = await as(ANA, "authenticated", `update public.document_requests set file_url = $2, status = 'submitted' where id = $1`, [idReq, `${BEN}/r9/id.jpg`]);
  check("2. …nor point it at someone else's folder", !otherFolder.ok && /request_file_not_yours/.test(otherFolder.error), show(otherFolder));
  const dotdot = await as(ANA, "authenticated", `update public.document_requests set file_url = $2, status = 'submitted' where id = $1`, [idReq, `${ANA}/../${BEN}/r9/id.jpg`]);
  check("2. …nor climb out of their folder", !dotdot.ok && /request_file_not_yours/.test(dotdot.error), show(dotdot));
  const longAnswer = await as(ANA, "authenticated", `update public.document_requests set answer_text = $2, status = 'submitted' where id = $1`, [payReq, "a".repeat(121)]);
  check("2. …nor type more than 120 characters", !longAnswer.ok, show(longAnswer));

  const sent = await as(
    ANA,
    "authenticated",
    `update public.document_requests
        set file_url = $2, file_name = 'id.jpg', status = 'submitted', submitted_at = '2001-01-01',
            document_type = 'custom', description = 'changed', candidate_id = $3, employer_id = $3, reviewed_at = now(), rejection_reason = 'x', file_deleted_at = now()
      where id = $1 returning *`,
    [idReq, `${ANA}/${idReq}/id.jpg`, BEN],
  );
  const s1 = sent.rows?.[0];
  check("2. the applicant sends a file in their own folder", sent.ok && s1?.status === "submitted" && s1?.file_url === `${ANA}/${idReq}/id.jpg`, show(sent));
  check("2. …the time sent is the database's, not theirs", s1 && new Date(s1.submitted_at).getFullYear() > 2001, show(s1?.submitted_at));
  check(
    "2. …and what was asked, who it is between and the review stay as they were",
    s1 && s1.document_type === "government_id" && s1.description === null && s1.candidate_id === ANA && s1.employer_id === OWNER && s1.reviewed_at === null && s1.rejection_reason === null && s1.file_deleted_at === null,
    show(s1),
  );
  const typed = await as(ANA, "authenticated", `update public.document_requests set answer_text = 'ana@example.com', status = 'submitted' where id = $1 returning status, answer_text`, [payReq]);
  check("2. the applicant sends a typed answer", typed.ok && typed.rows[0]?.answer_text === "ana@example.com" && typed.rows[0]?.status === "submitted", show(typed));
  const benTouches = await as(BEN, "authenticated", `update public.document_requests set file_url = null where id = $1 returning id`, [idReq]);
  check("2. another applicant changes nothing of theirs", benTouches.ok && benTouches.rows.length === 0, show(benTouches));
  const benReads = await as(BEN, "authenticated", `select id from public.document_requests`);
  check("2. …and reads none of it", benReads.ok && benReads.rows.length === 0, show(benReads));

  // 3 ──────────────────────────────────────────────────────────────────────
  const approve = await as(OWNER, "authenticated", `update public.document_requests set status = 'approved', file_url = 'x/y', answer_text = 'z', reviewed_by = $2 where id = $1 returning *`, [idReq, BEN]);
  const a1 = approve.rows?.[0];
  check("3. the owner approves what was sent", approve.ok && a1?.status === "approved" && a1?.reviewed_at !== null && a1?.reviewed_by === OWNER, show(approve));
  check("3. …and cannot change what the applicant sent", a1 && a1.file_url === `${ANA}/${idReq}/id.jpg` && a1.answer_text === null, show(a1));
  const afterApprove = await as(ANA, "authenticated", `update public.document_requests set file_url = $2, status = 'submitted' where id = $1`, [idReq, `${ANA}/${idReq}/other.jpg`]);
  check("3. once approved, the applicant cannot change it", !afterApprove.ok && /request_already_approved/.test(afterApprove.error), show(afterApprove));

  const askAgain = await as(TEAM, "authenticated", `update public.document_requests set status = 'rejected', rejection_reason = 'Not on Wise' where id = $1 returning status, reviewed_by`, [payReq]);
  check("3. a team member allowed to send documents asks again", askAgain.ok && askAgain.rows[0]?.status === "rejected" && askAgain.rows[0]?.reviewed_by === TEAM, show(askAgain));
  const askTeamNo = await as(TEAM_NO, "authenticated", `update public.document_requests set status = 'approved' where id = $1 returning id`, [payReq]);
  check("3. a team member who may not, changes nothing", askTeamNo.ok && askTeamNo.rows.length === 0, show(askTeamNo));
  const resend = await as(ANA, "authenticated", `update public.document_requests set answer_text = 'ana.wise@example.com', status = 'submitted' where id = $1 returning status, rejection_reason, answer_text`, [payReq]);
  check("3. after \"ask again\" the applicant sends it again", resend.ok && resend.rows[0]?.status === "submitted" && resend.rows[0]?.answer_text === "ana.wise@example.com", show(resend));
  const otherEmp = await as(OTHER_EMP, "authenticated", `update public.document_requests set status = 'approved' where id = $1 returning id`, [payReq]);
  check("3. another employer changes nothing", otherEmp.ok && otherEmp.rows.length === 0, show(otherEmp));

  // 4 ──────────────────────────────────────────────────────────────────────
  const cleanup = await as(null, "service_role", `update public.document_requests set file_url = null, file_deleted_at = now() where id = $1 returning file_url, file_deleted_at`, [idReq]);
  check("4. the cleanup function (service role) deletes the file's link", cleanup.ok && cleanup.rows[0]?.file_url === null && cleanup.rows[0]?.file_deleted_at !== null, show(cleanup));

  // 5 ──────────────────────────────────────────────────────────────────────
  await pg(`insert into public.document_request_events (request_id, user_id, action) values ($1, $2, 'opened')`, [idReq, OWNER]);
  const writeLog = await as(OWNER, "authenticated", `insert into public.document_request_events (request_id, user_id, action) values ($1, $2, 'opened')`, [idReq, OWNER]);
  check("5. nobody writes the log from a client", !writeLog.ok, show(writeLog));
  const ownerLog = await as(OWNER, "authenticated", `select action from public.document_request_events`);
  const anaLog = await as(ANA, "authenticated", `select action from public.document_request_events`);
  const benLog = await as(BEN, "authenticated", `select action from public.document_request_events`);
  const otherLog = await as(OTHER_EMP, "authenticated", `select action from public.document_request_events`);
  check("5. the owner and the applicant read it", ownerLog.rows?.length === 1 && anaLog.rows?.length === 1, show([ownerLog, anaLog]));
  check("5. another applicant or employer does not", benLog.ok && benLog.rows.length === 0 && otherLog.ok && otherLog.rows.length === 0, show([benLog, otherLog]));
  const anonLog = await as(null, "anon", `select action from public.document_request_events`);
  check("5. nor does anyone signed out", !anonLog.ok || anonLog.rows.length === 0);

  // 6 ──────────────────────────────────────────────────────────────────────
  const rules = (await pg(`select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'`)).map((r) => r.policyname);
  check("6. the employers' storage rule is gone", !rules.includes("Employers can view applicant requested documents"), show(rules));
  check("6. the applicant's four own-folder rules stay", ["upload", "view their", "update their", "delete their"].every((w) => rules.some((r) => r.startsWith("Candidates can") && r.includes(w))), show(rules));
  const ownerFiles = await as(OWNER, "authenticated", `select name from storage.objects`);
  check("6. an employer reads no file straight from the bucket", ownerFiles.ok && ownerFiles.rows.length === 0, show(ownerFiles));
  const anaFiles = await as(ANA, "authenticated", `select name from storage.objects`);
  check("6. the applicant reads their own, and only their own", anaFiles.ok && anaFiles.rows.length === 1 && anaFiles.rows[0].name.startsWith(ANA), show(anaFiles));
}

await main();
console.log(`\ndocument requests (pglite): ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
