#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/*_close_cross_business_gaps.sql, the
 * holes the 2026-10-11 overview confirmed live before other businesses join.
 * Against a real Postgres, as the real roles:
 *
 *   1. An applicant cannot give themselves a score, a stage, a later step or
 *      a step result in the INSERT that creates their application. The
 *      server (service role) still can.
 *   2. A business cannot put a document into another business's applicant's
 *      Documents, by application or by recipient; its own still work, and so
 *      does a team member's on an assigned job.
 *   3. A business sees only the videos made for its own job, never the ones
 *      the same applicant recorded for another business.
 *   4. A business cannot read someone else's resume by pointing its own
 *      application at the file.
 *   5. A business cannot add someone to its team; nobody can move a member
 *      row to another account.
 *   6. accept_team_invitation: a business owner, or someone already on
 *      another team, is refused with words that say why; a fresh account
 *      joins.
 *   7. The 'blueprint_paid' switch is gone; two helpers have a fixed
 *      search_path.
 *
 * Run with: node scripts/close_cross_business_gaps.pglite.test.mjs
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

const ZULU = "10000000-0000-4000-8000-000000000001";
const LUCKY = "10000000-0000-4000-8000-000000000002";
const ANA = "20000000-0000-4000-8000-000000000001"; // applied to both businesses
const BEN = "20000000-0000-4000-8000-000000000002"; // applied to Lucky only
const TEAM_Z = "40000000-0000-4000-8000-000000000001"; // on Zulu's team
const FRESH = "40000000-0000-4000-8000-000000000002"; // invited, no business, no team
const JOB_Z = "30000000-0000-4000-8000-00000000000a";
const JOB_L = "30000000-0000-4000-8000-00000000000b";
const APP_ANA_Z = "50000000-0000-4000-8000-000000000001";
const APP_ANA_L = "50000000-0000-4000-8000-000000000002";
const APP_BEN_L = "50000000-0000-4000-8000-000000000003";

async function migration(pattern) {
  const names = (await readdir(MIGRATIONS)).filter((n) => pattern.test(n));
  return names.length === 1 ? readFile(path.join(MIGRATIONS, names[0]), "utf8") : null;
}

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create schema storage;
    create table auth.users (id uuid primary key, email text);
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant anon to postgres; grant authenticated to postgres; grant service_role to postgres;
    grant usage on schema auth, storage to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant execute on function auth.role() to anon, authenticated, service_role;
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

    create type public.app_role as enum ('employer', 'candidate', 'team_member', 'developer');
    create type public.application_status as enum ('pending', 'in_progress', 'reviewing', 'interview', 'offered', 'hired', 'rejected');
    create table public.user_roles (user_id uuid, role public.app_role);
    create or replace function public.has_role(_user_id uuid, _role public.app_role) returns boolean language sql stable security definer as $$
      select (_user_id = auth.uid() or auth.role() = 'service_role') and exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;
    create table public.jobs (id uuid primary key, employer_id uuid, title text);
    -- applications, every column live (2026-10-11).
    create table public.applications (
      id uuid primary key default gen_random_uuid(), job_id uuid not null, candidate_id uuid not null,
      status public.application_status not null default 'pending', cover_letter text, resume_url text, ai_analysis text, ai_score numeric,
      notes text, phase text default 'application', phase_ai_analysis text, created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(), employer_notes text, voice_interview_result jsonb, voice_interview_language text default 'en',
      voice_interview_duration integer default 10, voice_interview_recording_url text, voice_interview_language_rule text default 'soft',
      voice_interview_video_enabled boolean default true, voice_interview_transcript jsonb, rejected_by uuid, rejected_by_type text,
      resume_score numeric, source text not null default 'hireflow', external_provider text, external_application_id text, ai_scorecard jsonb
    );
    alter table public.applications enable row level security;
    create policy "Candidates can create applications" on public.applications for insert to authenticated
      with check (auth.uid() = candidate_id and public.has_role(auth.uid(), 'candidate'::public.app_role));
    create policy "Candidates read their own" on public.applications for select to authenticated using (auth.uid() = candidate_id);
    create policy "Employers update applications to their jobs" on public.applications for update to authenticated
      using (exists (select 1 from public.jobs j where j.id = job_id and j.employer_id = auth.uid()));
    create policy "Employers read applications to their jobs" on public.applications for select to authenticated
      using (exists (select 1 from public.jobs j where j.id = job_id and j.employer_id = auth.uid()));

    create table public.team_members (
      id uuid primary key default gen_random_uuid(), user_id uuid, employer_id uuid, invitation_id uuid, name text, email text, department text,
      permission_level text, can_create_jobs boolean, can_delete_jobs boolean, can_message_candidates boolean, can_manage_pipeline boolean,
      can_schedule_interviews boolean, can_send_documents boolean, assigned_job_ids uuid[], status text, onboarding_completed boolean,
      revoked_at timestamptz, updated_at timestamptz, unique (user_id, employer_id)
    );
    alter table public.team_members enable row level security;
    -- As live before this migration.
    create policy "Employers can create team members" on public.team_members for insert to public with check (auth.uid() = employer_id);
    create policy "Employers can update their team members" on public.team_members for update to public using (auth.uid() = employer_id);
    create policy "Employers can view their team members" on public.team_members for select to public using (auth.uid() = employer_id);
    create policy "Team members can view their own record" on public.team_members for select to public using (auth.uid() = user_id);
    create table public.team_invitations (
      id uuid primary key default gen_random_uuid(), inviter_id uuid, invite_code text, invitee_email text, invitee_name text, department text,
      permission_level text, can_create_jobs boolean, can_delete_jobs boolean, can_message_candidates boolean, can_manage_pipeline boolean,
      can_schedule_interviews boolean, can_send_documents boolean, assigned_job_ids uuid[], status text, expires_at timestamptz
    );

    create or replace function public.is_job_owner(p_job_id uuid, p_user_id uuid) returns boolean language sql stable security definer as $$
      select (p_user_id = auth.uid() or auth.role() = 'service_role') and exists (select 1 from public.jobs where id = p_job_id and employer_id = p_user_id) $$;
    -- As live (2026-10-11).
    create or replace function public.is_active_team_member_for_job(p_job_id uuid, p_user_id uuid, p_require_manage_pipeline boolean default false,
      p_require_create_jobs boolean default false, p_require_delete_jobs boolean default false) returns boolean language sql stable security definer as $$
      select (p_user_id = auth.uid() or auth.role() = 'service_role') and exists (
        select 1 from public.jobs j join public.team_members tm on tm.employer_id = j.employer_id
        where j.id = p_job_id and tm.user_id = p_user_id and tm.status = 'active'
          and (not p_require_manage_pipeline or tm.can_manage_pipeline = true)
          and (not p_require_create_jobs or tm.can_create_jobs = true)
          and (not p_require_delete_jobs or tm.can_delete_jobs = true)
          and (array_length(tm.assigned_job_ids, 1) is null or j.id = any (tm.assigned_job_ids))) $$;
    create or replace function public.can_create_document_workflows_for_user(target_user_id uuid) returns boolean language sql stable as $$ select true $$;
    create policy "Team members can view applications for assigned jobs" on public.applications for select to authenticated
      using (public.is_active_team_member_for_job(job_id, auth.uid()));

    create table public.documents (
      id uuid primary key default gen_random_uuid(), application_id uuid, name text, sender_id uuid, recipient_id uuid, status text default 'pending'
    );
    alter table public.documents enable row level security;
    -- As live before this migration (the hole: the second branch).
    create policy "Employers can create documents" on public.documents for insert to authenticated with check (
      public.can_create_document_workflows_for_user(auth.uid()) and (
        (application_id is not null and exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.id = documents.application_id and j.employer_id = auth.uid()))
        or (sender_id = auth.uid() and public.has_role(auth.uid(), 'employer'::public.app_role))));

    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
    create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
      select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    create or replace function storage.filename(name text) returns text language sql immutable as $$
      select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
    grant execute on function storage.foldername(text), storage.filename(text) to anon, authenticated, service_role;
    -- As live before this migration.
    create policy "Employers can view candidate videos" on storage.objects for select to authenticated using (
      bucket_id = 'videos' and exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id
        where j.employer_id = auth.uid() and a.candidate_id::text = (storage.foldername(objects.name))[1]));
    create policy "Employers can view submitted resumes" on storage.objects for select to authenticated using (
      bucket_id = 'resumes' and exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id
        left join public.team_members tm on tm.employer_id = j.employer_id and tm.user_id = auth.uid() and tm.status = 'active'
        where a.resume_url = objects.name and (j.employer_id = auth.uid() or tm.id is not null)));
    create policy "Employers read applicant resumes" on storage.objects for select to authenticated using (
      bucket_id = 'resumes' and exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id
        where j.employer_id = auth.uid() and a.resume_url like ('%/resumes/' || objects.name)));

    create table public.app_settings (key text primary key, value jsonb);
    insert into public.app_settings values ('billing_enabled', 'false'), ('blueprint_paid', 'false'), ('boost_enabled', 'false');
    create or replace function public.business_pages_touch() returns trigger language plpgsql as $$ begin return new; end; $$;
    create or replace function public.slugify_business(p_name text) returns text language sql immutable as $$ select lower(p_name) $$;

    insert into auth.users values ('${ZULU}', 'zack@yahoo.com'), ('${LUCKY}', 'maria@x.example'), ('${ANA}', 'ana@x.example'),
      ('${BEN}', 'ben@x.example'), ('${TEAM_Z}', 'tess@x.example'), ('${FRESH}', 'fresh@x.example');
    insert into public.user_roles values ('${ZULU}', 'employer'), ('${LUCKY}', 'employer'), ('${ANA}', 'candidate'), ('${BEN}', 'candidate'), ('${TEAM_Z}', 'team_member');
    insert into public.jobs values ('${JOB_Z}', '${ZULU}', 'Team lead'), ('${JOB_L}', '${LUCKY}', 'Team lead');
    insert into public.applications (id, job_id, candidate_id, status, resume_url) values
      ('${APP_ANA_Z}', '${JOB_Z}', '${ANA}', 'pending', '${ANA}/cv.pdf'),
      ('${APP_ANA_L}', '${JOB_L}', '${ANA}', 'pending', '${ANA}/cv.pdf'),
      ('${APP_BEN_L}', '${JOB_L}', '${BEN}', 'pending', '${BEN}/resume.pdf');
    insert into public.team_members (user_id, employer_id, status, can_send_documents, can_manage_pipeline, assigned_job_ids)
      values ('${TEAM_Z}', '${ZULU}', 'active', true, false, null);
    insert into storage.objects (bucket_id, name) values
      ('videos', '${ANA}/${APP_ANA_Z}-intro-1.webm'),
      ('videos', '${ANA}/${APP_ANA_L}-intro-2.webm'),
      ('resumes', '${ANA}/cv.pdf'),
      ('resumes', '${BEN}/resume.pdf');
    insert into public.team_invitations (inviter_id, invite_code, invitee_email, status, expires_at, can_send_documents) values
      ('${LUCKY}', 'code-owner', 'zack@yahoo.com', 'pending', now() + interval '7 days', true),
      ('${LUCKY}', 'code-teamed', 'tess@x.example', 'pending', now() + interval '7 days', true),
      ('${LUCKY}', 'code-fresh', 'fresh@x.example', 'pending', now() + interval '7 days', true);
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
  return { db, as };
}

const sql = await migration(/_close_cross_business_gaps\.sql$/);
check("the migration file exists exactly once", !!sql);
if (!sql) process.exit(1);

const { db, as } = await setup();

// Before: the holes are real in this copy of the live rules.
{
  const doc = await as(LUCKY, "authenticated", `insert into public.documents (application_id, name, sender_id) values ($1, 'Offer', $2)`, [APP_ANA_Z, LUCKY]);
  check("before: Lucky could put a document into Zulu's applicant's Documents", doc.ok, show(doc));
  const vids = await as(LUCKY, "authenticated", `select name from storage.objects where bucket_id = 'videos' order by name`);
  check("before: Lucky could see Ana's video made for Zulu", vids.ok && vids.rows.length === 2, show(vids));
  await db.exec(`delete from public.documents`);
}

await db.exec(sql);
check("the migration applies", true);

// 1. Applications start clean ------------------------------------------------
{
  await db.exec(`insert into public.jobs values ('30000000-0000-4000-8000-00000000000c', '${ZULU}', 'Night agent')`);
  const ins = await as(BEN, "authenticated", `
    insert into public.applications (job_id, candidate_id, status, phase, ai_score, ai_scorecard, ai_analysis, notes, resume_score,
      employer_notes, voice_interview_result, rejected_by, rejected_by_type, source, external_provider, cover_letter, resume_url, created_at)
    values ('30000000-0000-4000-8000-00000000000c', $1, 'hired', 'review', 100, '{"overall":100}', 'Perfect', '{"quizResult":{"score":100}}', 99,
      'Hire now', '{"overall_score":100}', $2, 'employer', 'indeed', 'indeed', 'Hello', $3, now() - interval '1 year')`, [BEN, ZULU, `${BEN}/night.pdf`]);
  check("an applicant can still apply", ins.ok, show(ins));
  const row = (await db.query(`select * from public.applications where job_id = '30000000-0000-4000-8000-00000000000c' and candidate_id = '${BEN}'`)).rows[0];
  check("…starting in progress at the application step, whatever they sent", row?.status === "in_progress" && row?.phase === "application", show(row && { status: row.status, phase: row.phase }));
  check(
    "…with no score, scorecard, analysis, step results, notes, voice result or decision of their own",
    row && [row.ai_score, row.ai_scorecard, row.ai_analysis, row.notes, row.resume_score, row.employer_notes, row.voice_interview_result, row.rejected_by, row.rejected_by_type, row.external_provider].every((v) => v === null),
    show(row),
  );
  check("…as a HireFlow application dated now", row?.source === "hireflow" && Date.now() - new Date(row.created_at).getTime() < 60_000, show(row && { source: row.source, created_at: row.created_at }));
  check("…keeping what is theirs to say: the cover letter and their resume", row?.cover_letter === "Hello" && row?.resume_url === `${BEN}/night.pdf`);
  const forOther = await as(BEN, "authenticated", `insert into public.applications (job_id, candidate_id) values ($1, $2)`, [JOB_Z, ANA]);
  check("nobody can apply as someone else (unchanged)", !forOther.ok);
  const server = await as(null, "service_role", `insert into public.applications (job_id, candidate_id, status, phase, ai_score) values ($1, $2, 'reviewing', 'quiz', 70) returning status, phase, ai_score`, [JOB_Z, BEN]);
  check("the server (service role) still writes what it decides", server.ok && server.rows[0]?.status === "reviewing" && server.rows[0]?.phase === "quiz" && Number(server.rows[0]?.ai_score) === 70, show(server));
}

// 2. Documents only for your own applicants -----------------------------------
{
  const cross = await as(LUCKY, "authenticated", `insert into public.documents (application_id, name, sender_id) values ($1, 'Offer letter', $2)`, [APP_ANA_Z, LUCKY]);
  check("Lucky cannot put a document on Zulu's application", !cross.ok, show(cross));
  const byRecipient = await as(LUCKY, "authenticated", `insert into public.documents (application_id, name, sender_id, recipient_id) values (null, 'Offer letter', $1, $2)`, [LUCKY, ANA]);
  check("…nor address one to Zulu's applicant with no application", !byRecipient.ok, show(byRecipient));
  const wrongPerson = await as(ZULU, "authenticated", `insert into public.documents (application_id, name, sender_id, recipient_id) values ($1, 'Offer letter', $2, $3)`, [APP_ANA_Z, ZULU, BEN]);
  check("…nor tie Zulu's own application to a different person", !wrongPerson.ok, show(wrongPerson));
  const own = await as(ZULU, "authenticated", `insert into public.documents (application_id, name, sender_id, recipient_id) values ($1, 'Offer letter', $2, $3)`, [APP_ANA_Z, ZULU, ANA]);
  check("Zulu still sends its own applicant an offer letter", own.ok, show(own));
  const loose = await as(ZULU, "authenticated", `insert into public.documents (application_id, name, sender_id, recipient_id) values (null, 'Template', $1, null)`, [ZULU]);
  check("…and can still upload a file with no applicant yet", loose.ok, show(loose));
  const team = await as(TEAM_Z, "authenticated", `insert into public.documents (application_id, name, sender_id) values ($1, 'NDA', $2)`, [APP_ANA_Z, TEAM_Z]);
  check("Zulu's team member (documents on) can send on Zulu's job", team.ok, show(team));
  const teamCross = await as(TEAM_Z, "authenticated", `insert into public.documents (application_id, name, sender_id) values ($1, 'NDA', $2)`, [APP_BEN_L, TEAM_Z]);
  check("…but not on Lucky's", !teamCross.ok, show(teamCross));
  const teamLoose = await as(TEAM_Z, "authenticated", `insert into public.documents (application_id, name, sender_id, recipient_id) values (null, 'NDA', $1, $2)`, [TEAM_Z, BEN]);
  check("…and cannot address a loose document to anyone", !teamLoose.ok, show(teamLoose));
}

// 3. Videos ---------------------------------------------------------------------
{
  const lucky = await as(LUCKY, "authenticated", `select name from storage.objects where bucket_id = 'videos' order by name`);
  check("Lucky sees only Ana's video made for Lucky", lucky.ok && show(lucky.rows.map((r) => r.name)) === show([`${ANA}/${APP_ANA_L}-intro-2.webm`]), show(lucky));
  const zulu = await as(ZULU, "authenticated", `select name from storage.objects where bucket_id = 'videos' order by name`);
  check("Zulu sees only Ana's video made for Zulu", zulu.ok && show(zulu.rows.map((r) => r.name)) === show([`${ANA}/${APP_ANA_Z}-intro-1.webm`]), show(zulu));
  const team = await as(TEAM_Z, "authenticated", `select name from storage.objects where bucket_id = 'videos'`);
  check("Zulu's team member sees Zulu's, not Lucky's", team.ok && team.rows.length === 1 && team.rows[0].name.includes(APP_ANA_Z), show(team));
  const stranger = await as(BEN, "authenticated", `select name from storage.objects where bucket_id = 'videos'`);
  check("another applicant sees none", stranger.ok && stranger.rows.length === 0, show(stranger));
}

// 4. Resumes --------------------------------------------------------------------
{
  const fine = await as(ZULU, "authenticated", `select name from storage.objects where bucket_id = 'resumes'`);
  check("Zulu reads its own applicant's resume", fine.ok && show(fine.rows.map((r) => r.name)) === show([`${ANA}/cv.pdf`]), show(fine));
  const point = await as(ZULU, "authenticated", `update public.applications set resume_url = $1 where id = $2`, [`${BEN}/resume.pdf`, APP_ANA_Z]);
  check("(Zulu can edit its own application's resume link, as before)", point.ok, show(point));
  const steal = await as(ZULU, "authenticated", `select name from storage.objects where bucket_id = 'resumes' and name = $1`, [`${BEN}/resume.pdf`]);
  check("…but pointing it at Ben's resume does not open Ben's file", steal.ok && steal.rows.length === 0, show(steal));
  const team = await as(TEAM_Z, "authenticated", `select name from storage.objects where bucket_id = 'resumes'`);
  check("Zulu's team member can't read it that way either", team.ok && team.rows.length === 0, show(team));
  await db.exec(`update public.applications set resume_url = '${ANA}/cv.pdf' where id = '${APP_ANA_Z}'`);
  const back = await as(TEAM_Z, "authenticated", `select name from storage.objects where bucket_id = 'resumes'`);
  check("Zulu's team member reads Zulu's applicant's own resume", back.ok && back.rows.length === 1, show(back));
  const oldPolicy = (await db.query(`select count(*)::int n from pg_policies where policyname = 'Employers read applicant resumes'`)).rows[0].n;
  check("the older URL-matching resume rule is gone", oldPolicy === 0);
}

// 5. Team members ---------------------------------------------------------------
{
  const add = await as(LUCKY, "authenticated", `insert into public.team_members (user_id, employer_id, status, can_send_documents) values ($1, $2, 'active', true)`, [FRESH, LUCKY]);
  check("a business cannot add someone to its team without an invitation", !add.ok, show(add));
  const move = await as(ZULU, "authenticated", `update public.team_members set user_id = $1 where user_id = $2`, [FRESH, TEAM_Z]);
  check("a member row cannot be moved to another account", !move.ok && /cannot be changed/.test(move.error), show(move));
  const perms = await as(ZULU, "authenticated", `update public.team_members set can_manage_pipeline = true where user_id = $1 returning can_manage_pipeline`, [TEAM_Z]);
  check("the business can still change its member's permissions", perms.ok && perms.rows[0]?.can_manage_pipeline === true, show(perms));
}

// 6. One business per account --------------------------------------------------
{
  const owner = await as(ZULU, "authenticated", `select public.accept_team_invitation('code-owner') as r`);
  check("a business owner can't join another business's team", !owner.ok && /runs its own hiring/.test(owner.error), show(owner));
  const teamed = await as(TEAM_Z, "authenticated", `select public.accept_team_invitation('code-teamed') as r`);
  check("someone on Zulu's team can't also join Lucky's", !teamed.ok && /already on another hiring team/.test(teamed.error), show(teamed));
  const fresh = await as(FRESH, "authenticated", `select public.accept_team_invitation('code-fresh') as r`);
  check("a fresh account joins", fresh.ok && fresh.rows[0]?.r === LUCKY, show(fresh));
  const row = (await db.query(`select status, employer_id from public.team_members where user_id = '${FRESH}'`)).rows;
  check("…as an active member of Lucky's team", row.length === 1 && row[0].status === "active" && row[0].employer_id === LUCKY, show(row));
}

// 7. Housekeeping -------------------------------------------------------------
{
  const paid = (await db.query(`select count(*)::int n from public.app_settings where key = 'blueprint_paid'`)).rows[0].n;
  check("the 'blueprint_paid' switch is gone (applicants never pay)", paid === 0);
  const others = (await db.query(`select count(*)::int n from public.app_settings where key in ('billing_enabled', 'boost_enabled')`)).rows[0].n;
  check("…and nothing else in app_settings was touched", others === 2);
  const paths = (await db.query(`select proname, proconfig from pg_proc where proname in ('business_pages_touch', 'slugify_business') order by proname`)).rows;
  check("both helpers have a fixed search_path", paths.length === 2 && paths.every((p) => show(p.proconfig).includes("search_path")), show(paths));
}

console.log(`\nclose cross-business gaps: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
