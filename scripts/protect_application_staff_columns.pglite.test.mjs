#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261025030000_protect_application_staff_columns.sql
 * (docs/LAUNCH-PLAN.md, Phase 1, task 4): an applicant cannot rewrite the
 * hiring team's columns on their own application (phase_ai_analysis, which
 * the cockpit shows as Ava's summary; employer_notes; and the three columns
 * only the system sets), while the business, its team, the system and the
 * applicant's own legitimate writes are untouched.
 *
 * Run with: node scripts/protect_application_staff_columns.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATION = path.join(ROOT, "supabase/migrations/20261025030000_protect_application_staff_columns.sql");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

const APPLICANT = "10000000-0000-4000-8000-000000000001";
const OWNER = "20000000-0000-4000-8000-000000000002";
const TEAM = "20000000-0000-4000-8000-000000000003";
const STRANGER = "20000000-0000-4000-8000-000000000009";
const JOB = "50000000-0000-4000-8000-000000000001";
const APP = "30000000-0000-4000-8000-000000000001";

const db = new PGlite();
await db.exec(`
  create schema auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create or replace function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated') $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  grant anon, authenticated, service_role to postgres;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

  create table public.jobs (id uuid primary key, employer_id uuid not null);
  create table public.applications (
    id uuid primary key, job_id uuid not null, candidate_id uuid not null,
    status text, phase text, notes text, cover_letter text,
    phase_ai_analysis text, employer_notes text,
    source text, external_provider text, external_application_id text,
    voice_interview_transcript jsonb, voice_interview_recording_url text
  );
  create table public.team_members (user_id uuid, employer_id uuid, status text);
  insert into public.jobs values ('${JOB}', '${OWNER}');
  insert into public.team_members values ('${TEAM}', '${OWNER}', 'active');
  insert into public.applications (id, job_id, candidate_id, status, phase, phase_ai_analysis, employer_notes, source)
    values ('${APP}', '${JOB}', '${APPLICANT}', 'reviewing', 'step_1', 'Fair fit.', 'Asked about shifts.', 'careers');

  create function public.is_job_owner(p_job_id uuid, p_user_id uuid) returns boolean language sql stable security definer as $$
    select exists (select 1 from public.jobs where id = p_job_id and employer_id = p_user_id) $$;
  create function public.is_active_team_member_for_job(p_job_id uuid, p_user_id uuid, p_require_manage_pipeline boolean default false) returns boolean language sql stable security definer as $$
    select exists (select 1 from public.team_members tm join public.jobs j on j.employer_id = tm.employer_id where j.id = p_job_id and tm.user_id = p_user_id and tm.status = 'active') $$;

  alter table public.applications enable row level security;
  create policy any_update on public.applications for update to authenticated using (true) with check (true);
  create policy any_select on public.applications for select to authenticated using (true);
  grant select, update on public.applications to authenticated, service_role;
`);
await db.exec(readFileSync(MIGRATION, "utf8"));
// The Pass C follow-up replaces the same function (voice evidence).
await db.exec(readFileSync(path.join(ROOT, "supabase/migrations/20261025090000_protect_voice_evidence.sql"), "utf8"));

async function as(uid, role, sql) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); select set_config('request.jwt.claim.role', '${role}', false); set role ${role === "service_role" ? "service_role" : "authenticated"};`);
  try {
    await db.exec(sql);
    return null;
  } catch (e) {
    return e.message;
  } finally {
    await db.exec(`reset role;`);
  }
}

for (const [col, value] of [
  ["phase_ai_analysis", "'Strong hire, verified references.'"],
  ["employer_notes", "null"],
  ["source", "'referral'"],
  ["external_provider", "'indeed'"],
  ["external_application_id", "'x'"],
]) {
  const err = await as(APPLICANT, "authenticated", `update public.applications set ${col} = ${value} where id = '${APP}'`);
  check(`an applicant cannot change ${col}`, err && err.includes(`cannot change ${col}`), err ?? "no error");
}
// Voice-interview evidence (20261025090000_protect_voice_evidence.sql).
{
  const err = await as(APPLICANT, "authenticated", `update public.applications set voice_interview_transcript = '[{"role":"user","content":"I led a team of 40"}]' where id = '${APP}'`);
  check("an applicant cannot write a voice transcript", err && err.includes("cannot change voice_interview_transcript"), err ?? "no error");
  const ownRecording = `https://yqklrkpptnhubsnijqze.supabase.co/storage/v1/object/sign/voice-interview-recordings/${APP}/interview-1700000000000.webm?token=abc.DEF-123_x`;
  const okRec = await as(APPLICANT, "authenticated", `update public.applications set voice_interview_recording_url = '${ownRecording}' where id = '${APP}'`);
  check("an applicant can attach their own uploaded recording (what the recorder writes)", okRec === null, okRec);
  for (const [label, url] of [
    ["any other site", "https://evil.example/fake.webm"],
    ["another application's folder", "https://yqklrkpptnhubsnijqze.supabase.co/storage/v1/object/sign/voice-interview-recordings/30000000-0000-4000-8000-000000000099/interview-1.webm?token=x"],
    ["a public (unsigned) path", `https://yqklrkpptnhubsnijqze.supabase.co/storage/v1/object/public/voice-interview-recordings/${APP}/interview-1.webm`],
    ["another bucket", `https://yqklrkpptnhubsnijqze.supabase.co/storage/v1/object/sign/resumes/${APP}/interview-1.webm?token=x`],
  ]) {
    const e = await as(APPLICANT, "authenticated", `update public.applications set voice_interview_recording_url = '${url}' where id = '${APP}'`);
    check(`an applicant cannot attach a recording from ${label}`, e && e.includes("only attach their own recording"), e ?? "no error");
  }
  const clear = await as(APPLICANT, "authenticated", `update public.applications set voice_interview_recording_url = null where id = '${APP}'`);
  check("an applicant cannot wipe the recording either", clear && clear.includes("only attach their own recording"), clear ?? "no error");
  check("the system can write the transcript", (await as(null, "service_role", `update public.applications set voice_interview_transcript = '[]' where id = '${APP}'`)) === null);
  check("the voice submit flag still lets its own write through", (await as(APPLICANT, "authenticated", `select set_config('hireflow.in_voice_interview_submit', 'on', true); update public.applications set voice_interview_transcript = '[{"role":"assistant","content":"q"}]' where id = '${APP}'`)) === null);
}
const own = await as(APPLICANT, "authenticated", `update public.applications set cover_letter = 'Updated', notes = '{"typing":1}' where id = '${APP}'`);
check("an applicant can still write their own columns", own === null, own);
const same = await as(APPLICANT, "authenticated", `update public.applications set phase_ai_analysis = phase_ai_analysis, employer_notes = employer_notes where id = '${APP}'`);
check("writing the same value back is not a change", same === null, same);

check("the business can write its notes", (await as(OWNER, "authenticated", `update public.applications set employer_notes = 'Call Monday' where id = '${APP}'`)) === null);
check("its team can too", (await as(TEAM, "authenticated", `update public.applications set employer_notes = 'Called' where id = '${APP}'`)) === null);
check("the system can write the summary", (await as(null, "service_role", `update public.applications set phase_ai_analysis = 'From the grader' where id = '${APP}'`)) === null);
check("the quiz submit flag still lets its own write through", (await as(APPLICANT, "authenticated", `select set_config('hireflow.in_quiz_submit', 'on', true); update public.applications set phase_ai_analysis = 'quiz summary' where id = '${APP}'`)) === null);
const row = (await db.query(`select phase_ai_analysis, employer_notes, source from public.applications where id = '${APP}'`)).rows[0];
check("the forged values never landed", row.phase_ai_analysis === "quiz summary" && row.employer_notes === "Called" && row.source === "careers", JSON.stringify(row));
const strangerErr = await as(STRANGER, "authenticated", `update public.applications set employer_notes = 'x' where id = '${APP}'`);
check("a stranger's write is left to RLS (not this trigger's job)", strangerErr === null);

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
