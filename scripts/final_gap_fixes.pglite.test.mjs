#!/usr/bin/env node
/**
 * The final gap check's database fixes (2026-10-11), in PGlite:
 *   supabase/migrations/*_team_members_work.sql and *_final_gap_fixes.sql.
 *
 *   - teammates are unlimited while billing is off;
 *   - a team member marks their own welcome done;
 *   - an applicant's reply to someone who left the team reaches the owner;
 *   - an applicant's bell names the business, whoever on its team wrote;
 *   - turning someone down cancels their interview still to come;
 *   - deleting an account that sent a document no longer fails;
 *   - nobody takes the name HireFlow or another business's name;
 *   - a team member limited to some jobs can create one and read it back.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    passed++;
    console.log(`  ok  - ${name}`);
  } else {
    failed++;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
};
const show = (v) => JSON.stringify(v);
async function migration(suffix) {
  const names = (await readdir(MIGRATIONS)).filter((n) => new RegExp(`^\\d+_${suffix}\\.sql$`).test(n));
  return names.length === 1 ? readFile(path.join(MIGRATIONS, names[0]), "utf8") : null;
}

const OWNER = "10000000-0000-4000-8000-000000000001"; // Lucky Star Support
const RIVAL = "10000000-0000-4000-8000-000000000002"; // another business
const TESS = "40000000-0000-4000-8000-000000000001"; // on Lucky's team, limited to one job
const GONE = "40000000-0000-4000-8000-000000000002"; // was on Lucky's team
const ANA = "20000000-0000-4000-8000-000000000001"; // applied to Lucky
const NEWBIE = "10000000-0000-4000-8000-000000000003"; // a new sign-up
const JOB = "30000000-0000-4000-8000-00000000000a";
const APP = "50000000-0000-4000-8000-000000000001";

const db = new PGlite();
await db.exec(`
  create schema auth;
  create schema private;
  create schema storage;
  create table auth.users (id uuid primary key, email text);
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create or replace function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant anon to postgres; grant authenticated to postgres; grant service_role to postgres;
  grant usage on schema auth, private to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant execute on function auth.role() to anon, authenticated, service_role;
  alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  create or replace function private.has_subscription_bypass_for_user(target_user_id uuid) returns boolean language sql stable as $$ select false $$;
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;

  create table public.app_settings (key text primary key, value jsonb);
  insert into public.app_settings values ('billing_enabled', 'false');
  create table public.subscriptions (user_id uuid, status text, plan_type text, trial_end timestamptz);
  create table public.profiles (user_id uuid primary key, full_name text, company_name text);
  create table public.user_roles (user_id uuid, role text);
  create table public.platform_admins (user_id uuid primary key);
  create table public.jobs (id uuid primary key default gen_random_uuid(), employer_id uuid not null, title text, status text default 'draft');
  create table public.applications (id uuid primary key default gen_random_uuid(), job_id uuid references public.jobs(id), candidate_id uuid, status text default 'pending');
  create table public.interviews (id uuid primary key default gen_random_uuid(), application_id uuid, status text not null default 'scheduled', scheduled_at timestamptz not null);
  create table public.team_members (id uuid primary key default gen_random_uuid(), user_id uuid, employer_id uuid, status text, can_message_candidates boolean default true,
    can_create_jobs boolean default false, assigned_job_ids uuid[], onboarding_completed boolean default false, updated_at timestamptz);
  create table public.messages (id uuid primary key default gen_random_uuid(), sender_id uuid, receiver_id uuid, application_id uuid, content text, file_name text, is_read boolean default false, created_at timestamptz default now());
  create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid, type text, title text, message text, link text, is_read boolean default false);
  create table public.documents (id uuid primary key default gen_random_uuid(), application_id uuid, sender_id uuid references auth.users(id), recipient_id uuid references auth.users(id), name text);
  create table public.document_templates (id uuid primary key default gen_random_uuid(), employer_id uuid references auth.users(id), name text);
  create table public.employer_reports (id uuid primary key default gen_random_uuid(), employer_id uuid, reporter_id uuid, status text default 'open');
  create or replace function public.business_status_of(p uuid) returns text language sql stable as $$ select 'approved' $$;
  create or replace function public.business_pause(a uuid, b text, c uuid) returns void language sql as $$ select $$;
  create or replace function public.is_job_owner(p_job_id uuid, p_user_id uuid) returns boolean language sql stable security definer as $$
    select exists (select 1 from public.jobs where id = p_job_id and employer_id = p_user_id) $$;

  alter table public.messages enable row level security;
  create policy "own" on public.messages for select using (auth.uid() in (sender_id, receiver_id));
  -- As live: applicant to the job's owner, or the owner to their applicant.
  create policy "Counterparties can send messages" on public.messages for insert with check (auth.uid() = sender_id and (
    exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.candidate_id = auth.uid() and j.employer_id = messages.receiver_id and (messages.application_id is null or messages.application_id = a.id))
    or exists (select 1 from public.applications a where a.candidate_id = messages.receiver_id and public.is_job_owner(a.job_id, auth.uid()) and (messages.application_id is null or messages.application_id = a.id))));
  alter table public.team_members enable row level security;
  create policy "owner" on public.team_members for all using (auth.uid() = employer_id);
  create policy "self read" on public.team_members for select using (auth.uid() = user_id);
  alter table public.jobs enable row level security;
  create policy "owner jobs" on public.jobs for all using (employer_id = auth.uid()) with check (employer_id = auth.uid());
  -- As live: anyone reads a published job.
  create policy "published" on public.jobs for select using (status = 'published');
  -- As live: team members read their assigned jobs and may create jobs.
  create policy "Team members can view assigned jobs" on public.jobs for select using (exists (select 1 from public.team_members tm where tm.user_id = auth.uid() and tm.employer_id = jobs.employer_id and tm.status = 'active' and (array_length(tm.assigned_job_ids, 1) is null or jobs.id = any (tm.assigned_job_ids))));
  create policy "Team members can create jobs if permitted" on public.jobs for insert with check (exists (select 1 from public.team_members tm where tm.user_id = auth.uid() and tm.status = 'active' and tm.employer_id = jobs.employer_id and tm.can_create_jobs = true));
  create policy "Team members can view interview recordings" on storage.objects for select using (false);

  insert into auth.users values ('${OWNER}', 'maria@lucky.example'), ('${RIVAL}', 'rico@rival.example'), ('${TESS}', 'tess@x.example'), ('${GONE}', 'gil@x.example'), ('${ANA}', 'ana@x.example'), ('${NEWBIE}', 'new@x.example');
  insert into public.user_roles values ('${OWNER}', 'employer'), ('${RIVAL}', 'employer'), ('${TESS}', 'team_member'), ('${GONE}', 'team_member'), ('${ANA}', 'candidate');
  insert into public.profiles values ('${OWNER}', 'Maria', 'Lucky Star Support'), ('${RIVAL}', 'Rico', 'Zulu Support Team'), ('${TESS}', 'Tess', 'Old Biz Of Tess'), ('${GONE}', 'Gil', null), ('${ANA}', 'Ana Reyes', null);
  insert into public.jobs (id, employer_id, title, status) values ('${JOB}', '${OWNER}', 'Chat agent', 'published');
  insert into public.applications (id, job_id, candidate_id, status) values ('${APP}', '${JOB}', '${ANA}', 'interview');
  insert into public.team_members (user_id, employer_id, status, can_create_jobs, assigned_job_ids) values ('${TESS}', '${OWNER}', 'active', true, array['${JOB}']::uuid[]), ('${GONE}', '${OWNER}', 'revoked', false, null);
  insert into public.subscriptions values ('${OWNER}', 'trialing', 'trial', null);
`);

const team = await migration("team_members_work");
const reply = await migration("applicants_reply_to_team");
const fixes = await migration("final_gap_fixes");
check("the migrations are there, once each", !!team && !!reply && !!fixes);
let applied = true;
try {
  await db.exec(reply);
  await db.exec(team);
  await db.exec(team);
  await db.exec(fixes);
  await db.exec(fixes);
} catch (err) {
  applied = false;
  console.log(err.message);
}
check("they apply, and apply again", applied);
// As live: the bell for a new message.
await db.exec(`create trigger on_message_created_notify after insert on public.messages for each row execute function public.notify_new_message();`);

async function as(uid, role, q, params = []) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); select set_config('request.jwt.claim.role', '${role}', false); set role ${role};`);
  try {
    return { ok: true, rows: (await db.query(q, params)).rows };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claim.role', '', false);`);
  }
}
const pg = (q, p = []) => db.query(q, p).then((r) => r.rows);

// Teammates ────────────────────────────────────────────────────────────────
const limitOff = (await pg(`select public.team_member_limit_for_user($1) as n`, [OWNER]))[0].n;
check("billing off: unlimited teammates, even on a trial", limitOff === -1, show(limitOff));
const noRow = (await pg(`select public.team_member_limit_for_user($1) as n`, [NEWBIE]))[0].n;
check("…and with no subscription row at all", noRow === -1, show(noRow));
await pg(`update public.app_settings set value = 'true' where key = 'billing_enabled'`);
const limitOn = (await pg(`select public.team_member_limit_for_user($1) as n`, [OWNER]))[0].n;
check("billing on: the plans decide again (a trial gets 1)", limitOn === 1, show(limitOn));
await pg(`update public.app_settings set value = 'false' where key = 'billing_enabled'`);

// The welcome ───────────────────────────────────────────────────────────────
const direct = await as(TESS, "authenticated", `update public.team_members set onboarding_completed = true where user_id = $1 returning id`, [TESS]);
check("a team member can't update their row directly (why the welcome came back)", !direct.ok || direct.rows.length === 0, show(direct));
const done = await as(TESS, "authenticated", `select public.mark_team_welcome_done()`);
const tessRow = (await pg(`select onboarding_completed from public.team_members where user_id = $1`, [TESS]))[0];
check("mark_team_welcome_done() marks their own welcome done", done.ok && tessRow.onboarding_completed === true, show(done));
const gilRow = (await pg(`select onboarding_completed from public.team_members where user_id = $1`, [GONE]))[0];
check("…and no one else's", gilRow.onboarding_completed === false);

// Replies after someone left ───────────────────────────────────────────────────
const toTess = await as(ANA, "authenticated", `insert into public.messages (sender_id, receiver_id, application_id, content) values ($1, $2, $3, 'Hi Tess') returning receiver_id`, [ANA, TESS, APP]);
check("an applicant replies to a team member on the team: it reaches them", toTess.ok && toTess.rows[0].receiver_id === TESS, show(toTess));
const toGil = await as(ANA, "authenticated", `insert into public.messages (sender_id, receiver_id, application_id, content) values ($1, $2, $3, 'Hi Gil?') returning receiver_id`, [ANA, GONE, APP]);
check("…to someone who left the team: it reaches the owner instead (it used to be refused)", toGil.ok && toGil.rows[0].receiver_id === OWNER, show(toGil));
const toRival = await as(ANA, "authenticated", `insert into public.messages (sender_id, receiver_id, application_id, content) values ($1, $2, $3, 'Hi?') returning receiver_id`, [ANA, RIVAL, APP]);
check("…to another business she never applied to: still refused", !toRival.ok, show(toRival));

// The applicant's bell ─────────────────────────────────────────────────────────
await pg(`delete from public.notifications`);
await pg(`insert into public.messages (sender_id, receiver_id, application_id, content) values ($1, $2, $3, 'Your interview is set')`, [TESS, ANA, APP]);
const bell = await pg(`select title from public.notifications where user_id = $1`, [ANA]);
check("a team member's message: the applicant's bell names the business", bell.length === 1 && bell[0].title === "New message from Lucky Star Support", show(bell));

// Interviews on a decline ────────────────────────────────────────────────────
await pg(`insert into public.interviews (application_id, status, scheduled_at) values ($1, 'scheduled', now() + interval '1 day'), ($1, 'completed', now() - interval '3 days'), ($1, 'scheduled', now() - interval '5 days')`, [APP]);
await pg(`update public.applications set status = 'reviewing' where id = $1`, [APP]);
const still = (await pg(`select count(*)::int n from public.interviews where application_id = $1 and status = 'scheduled'`, [APP]))[0].n;
check("moving them elsewhere leaves interviews alone", still === 2);
await pg(`update public.applications set status = 'rejected' where id = $1`, [APP]);
const after = await pg(`select status, scheduled_at > now() as future from public.interviews where application_id = $1 order by scheduled_at`, [APP]);
check("turning them down cancels the interview still to come", after.find((i) => i.future)?.status === "cancelled", show(after));
check("…and leaves past ones as they were (completed, an old no-show)", after.filter((i) => !i.future).map((i) => i.status).sort().join(",") === "completed,scheduled", show(after));

// Deleting an account ──────────────────────────────────────────────────────────
await pg(`insert into public.documents (application_id, sender_id, recipient_id, name) values ($1, $2, $3, 'Offer letter')`, [APP, TESS, ANA]);
await pg(`insert into public.document_templates (employer_id, name) values ($1, 'My NDA')`, [OWNER]);
let deletedSender = true;
try {
  await pg(`delete from auth.users where id = $1`, [TESS]);
} catch (err) {
  deletedSender = false;
  console.log(err.message);
}
const doc = (await pg(`select sender_id, recipient_id from public.documents`))[0];
check("an account that sent a document can be deleted (it used to be refused)", deletedSender);
check("…the document stays with its application, sender unknown", doc && doc.sender_id === null && doc.recipient_id === ANA, show(doc));
await pg(`delete from auth.users where id = $1`, [ANA]);
const doc2 = (await pg(`select recipient_id from public.documents`))[0];
check("an applicant who received one can be deleted too", doc2 && doc2.recipient_id === null, show(doc2));

// Business names ───────────────────────────────────────────────────────────────
const asHireflow = await as(NEWBIE, "authenticated", `insert into public.profiles (user_id, full_name, company_name) values ($1, 'X', 'HireFlow Support')`, [NEWBIE]);
check("nobody calls their business HireFlow", !asHireflow.ok && /kept for HireFlow/.test(asHireflow.error), show(asHireflow));
const copy = await as(NEWBIE, "authenticated", `insert into public.profiles (user_id, full_name, company_name) values ($1, 'X', 'lucky-star  SUPPORT!')`, [NEWBIE]);
check("…or another business's name, however it's spelled", !copy.ok && /already uses that name/.test(copy.error), show(copy));
const own = await as(NEWBIE, "authenticated", `insert into public.profiles (user_id, full_name, company_name) values ($1, 'X', 'Lucky Strike Diner') returning company_name`, [NEWBIE]);
check("a different name is fine", own.ok, show(own));
const recase = await as(OWNER, "authenticated", `update public.profiles set company_name = 'LUCKY STAR SUPPORT' where user_id = $1 returning company_name`, [OWNER]);
check("a business can re-type its own name", recase.ok, show(recase));
const taken = await as(null, "anon", `select public.business_name_taken('Zulu Support Team') as a, public.business_name_taken('hireflow') as b, public.business_name_taken('Brand New Co') as c`);
check("the sign-up screen can ask first", taken.ok && taken.rows[0].a === true && taken.rows[0].b === true && taken.rows[0].c === false, show(taken));
const applicant = await pg(`insert into public.profiles (user_id, full_name, company_name) values ('${GONE}', 'Gil', null) on conflict (user_id) do update set company_name = null returning user_id`);
check("an applicant with no business name is untouched", applicant.length === 1);

// A team member creating a job ──────────────────────────────────────────────────
await pg(`insert into auth.users values ('${TESS}', 'tess@x.example')`);
await pg(`insert into public.team_members (user_id, employer_id, status, can_create_jobs, assigned_job_ids) values ('${TESS}', '${OWNER}', 'active', true, array['${JOB}']::uuid[])`);
const made = await as(TESS, "authenticated", `insert into public.jobs (employer_id, title, status, created_by) values ($1, 'Night shift', 'draft', $2) returning id, created_by`, [OWNER, RIVAL]);
check("a team member limited to one job creates another and reads it back (it used to be refused)", made.ok && !!made.rows[0]?.id, show(made));
check("…recorded as made by them, whatever the request said", made.ok && made.rows[0].created_by === TESS, show(made));
const list = (await pg(`select assigned_job_ids from public.team_members where user_id = $1 and status = 'active'`, [TESS]))[0];
check("…and the new job joins their list", made.ok && list.assigned_job_ids.includes(made.rows[0].id), show(list));
const others = await as(RIVAL, "authenticated", `select id from public.jobs where id = $1`, [made.rows?.[0]?.id ?? JOB]);
check("another business doesn't see Lucky's new draft", others.ok && others.rows.length === 0, show(others));

// Papers outliving their request ─────────────────────────────────────────────────
const trashSql = await migration("document_file_trash");
check("the trash migration is there, once", !!trashSql);
if (trashSql) {
  const APP2 = "50000000-0000-4000-8000-000000000002";
  await db.exec(`
    insert into public.applications (id, job_id, candidate_id, status) values ('${APP2}', '${JOB}', '${NEWBIE}', 'hired');
    create table public.document_requests (id uuid primary key default gen_random_uuid(), application_id uuid references public.applications(id) on delete cascade, candidate_id uuid, file_url text);
    insert into public.document_requests (application_id, candidate_id, file_url) values
      ('${APP2}', '${NEWBIE}', '${NEWBIE}/r1/id-front.jpg'),
      ('${APP2}', '${NEWBIE}', null);
  `);
  await db.exec(trashSql);
  await db.exec(trashSql);
  await pg(`delete from public.applications where id = $1`, [APP2]);
  const trash = await pg(`select candidate_id, file_url from public.document_file_trash`);
  check("deleting an application (as a job or account deletion does) notes its ID photo for the cleanup", trash.length === 1 && trash[0].file_url === `${NEWBIE}/r1/id-front.jpg`, show(trash));
  const peek = await as(NEWBIE, "authenticated", `select * from public.document_file_trash`);
  check("…and nobody but the cleanup can read that note", !peek.ok, show(peek));
}

console.log(`\nfinal gap fixes (pglite): ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
