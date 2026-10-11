#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/*_applicants_reply_to_team.sql: an
 * applicant can answer a team member who may message applicants on the job
 * they applied to, and still no one else (another business's team, a team
 * member without the permission or not on that job, a stranger). The owner
 * stays reachable as before.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => (ok ? (passed++, console.log(`  ok  - ${name}`)) : (failed++, console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`)));
const show = (v) => JSON.stringify(v);

const OWNER = "10000000-0000-4000-8000-000000000001";
const OTHER_OWNER = "10000000-0000-4000-8000-000000000002";
const TESS = "40000000-0000-4000-8000-000000000001"; // Owner's team, may message, all jobs
const MUTE = "40000000-0000-4000-8000-000000000002"; // Owner's team, may NOT message
const NARROW = "40000000-0000-4000-8000-000000000003"; // Owner's team, only on job B
const RIVAL = "40000000-0000-4000-8000-000000000004"; // the other business's team
const ANA = "20000000-0000-4000-8000-000000000001";
const STRANGER = "20000000-0000-4000-8000-000000000002";
const JOB_A = "30000000-0000-4000-8000-00000000000a";
const JOB_B = "30000000-0000-4000-8000-00000000000b";
const JOB_X = "30000000-0000-4000-8000-00000000000c";
const APP_A = "50000000-0000-4000-8000-000000000001";

const names = (await readdir(path.join(ROOT, "supabase/migrations"))).filter((n) => /_applicants_reply_to_team\.sql$/.test(n));
check("the migration exists once", names.length === 1);
const db = new PGlite();
await db.exec(`
  create schema auth;
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant anon to postgres; grant authenticated to postgres; grant service_role to postgres;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
  create table public.jobs (id uuid primary key, employer_id uuid);
  create table public.applications (id uuid primary key, job_id uuid, candidate_id uuid);
  create table public.team_members (id uuid primary key default gen_random_uuid(), user_id uuid, employer_id uuid, status text, can_message_candidates boolean, assigned_job_ids uuid[]);
  alter table public.team_members enable row level security;
  create policy "Team members can view their own record" on public.team_members for select using (auth.uid() = user_id);
  create table public.messages (id uuid primary key default gen_random_uuid(), sender_id uuid, receiver_id uuid, application_id uuid, content text);
  alter table public.messages enable row level security;
  create or replace function public.is_job_owner(p_job_id uuid, p_user_id uuid) returns boolean language sql stable security definer as $$
    select exists (select 1 from public.jobs where id = p_job_id and employer_id = p_user_id) $$;
  -- As live (2026-10-11).
  create policy "Counterparties can send messages" on public.messages for insert to authenticated with check (
    (auth.uid() = sender_id) and ((exists (select 1 from applications a join jobs j on j.id = a.job_id
      where a.candidate_id = auth.uid() and j.employer_id = messages.receiver_id and (messages.application_id is null or messages.application_id = a.id)))
    or (exists (select 1 from applications a where a.candidate_id = messages.receiver_id and is_job_owner(a.job_id, auth.uid())
      and (messages.application_id is null or messages.application_id = a.id)))));
  insert into public.jobs values ('${JOB_A}', '${OWNER}'), ('${JOB_B}', '${OWNER}'), ('${JOB_X}', '${OTHER_OWNER}');
  insert into public.applications values ('${APP_A}', '${JOB_A}', '${ANA}');
  insert into public.team_members (user_id, employer_id, status, can_message_candidates, assigned_job_ids) values
    ('${TESS}', '${OWNER}', 'active', true, null),
    ('${MUTE}', '${OWNER}', 'active', false, null),
    ('${NARROW}', '${OWNER}', 'active', true, array['${JOB_B}']::uuid[]),
    ('${RIVAL}', '${OTHER_OWNER}', 'active', true, null);
`);
async function as(uid, sql, params = []) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try {
    await db.query(sql, params);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const send = (from, to, app = APP_A) => as(from, `insert into public.messages (sender_id, receiver_id, application_id, content) values ($1, $2, $3, 'hi')`, [from, to, app]);

const before = await send(ANA, TESS);
check("before: Ana could not answer the team member", !before.ok, show(before));
await db.exec(await readFile(path.join(ROOT, "supabase/migrations", names[0]), "utf8"));
await db.exec(await readFile(path.join(ROOT, "supabase/migrations", names[0]), "utf8"));
check("the migration applies, and applies again", true);

check("Ana answers the team member who may message applicants", (await send(ANA, TESS)).ok);
check("…with no application named too", (await send(ANA, TESS, null)).ok);
check("Ana still writes to the owner", (await send(ANA, OWNER)).ok);
check("not to a team member without the permission", !(await send(ANA, MUTE)).ok);
check("not to a team member who is not on her job", !(await send(ANA, NARROW)).ok);
check("not to another business's team", !(await send(ANA, RIVAL)).ok);
check("not to another applicant", !(await send(ANA, STRANGER)).ok);
check("not as someone else", !(await as(ANA, `insert into public.messages (sender_id, receiver_id, application_id, content) values ($1, $2, $3, 'x')`, [STRANGER, TESS, APP_A])).ok);
check("a stranger cannot write to the team member", !(await send(STRANGER, TESS, null)).ok);
check("the check answers only about the caller", (await db.query(`select public.applicant_can_message_team_member($1, null) v`, [TESS])).rows[0].v === false);

console.log(`\napplicants reply to the team (pglite): ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
