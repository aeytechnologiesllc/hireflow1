#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261025310000_notification_and_message_limits.sql
 * (the Phase 7 security audit, finding 3): one account can no longer flood
 * someone's bell and inbox, dress an applicant's card up as HireFlow's own,
 * or link a card outside HireFlow. The server's own notifications pass
 * untouched. Real roles (anon / authenticated / service_role) and RLS, as
 * live.
 *
 * Run with: node scripts/notification_message_limits.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

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

const BIZ = "10000000-0000-4000-8000-000000000001";
const OTHER_BIZ = "10000000-0000-4000-8000-000000000002";
const ANA = "20000000-0000-4000-8000-000000000001";
const BEN = "20000000-0000-4000-8000-000000000002";
const JOB = "30000000-0000-4000-8000-000000000001";
const APP_ANA = "40000000-0000-4000-8000-000000000001";
const APP_BEN = "40000000-0000-4000-8000-000000000002";

const db = new PGlite();
await db.exec(`
  create schema auth;
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
  alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;

  create type public.notification_type as enum ('message', 'application', 'interview', 'status_update', 'team', 'system', 'integrity');
  create table public.jobs (id uuid primary key, employer_id uuid not null);
  create table public.applications (id uuid primary key, job_id uuid not null, candidate_id uuid not null);
  create table public.document_requests (id uuid primary key default gen_random_uuid(), employer_id uuid, candidate_id uuid);
  create table public.team_members (user_id uuid, employer_id uuid, status text);
  create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null, type public.notification_type not null, title text, message text, link text, is_read boolean default false);
  create table public.messages (id uuid primary key default gen_random_uuid(), sender_id uuid, receiver_id uuid, application_id uuid, content text);

  create or replace function public.is_job_owner(p_job uuid, p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.jobs j where j.id = p_job and j.employer_id = p_user) and p_user = auth.uid() $$;
  create or replace function public.is_active_team_member_for_job(p_job uuid, p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.jobs j join public.team_members tm on tm.employer_id = j.employer_id where j.id = p_job and tm.user_id = p_user and tm.status = 'active') and p_user = auth.uid() $$;

  alter table public.applications enable row level security;
  create policy "own or owner" on public.applications for select using (candidate_id = auth.uid() or public.is_job_owner(job_id, auth.uid()));
  alter table public.document_requests enable row level security;
  create policy "parties" on public.document_requests for select using (employer_id = auth.uid() or candidate_id = auth.uid());
  alter table public.jobs enable row level security;
  create policy "jobs read" on public.jobs for select using (true);
  alter table public.notifications enable row level security;
  create policy "own" on public.notifications for select using (user_id = auth.uid());
  -- As live (20260827211000_lockdown_notification_inserts.sql and later).
  create policy "Related parties can insert notifications" on public.notifications for insert to authenticated with check (
    (auth.uid() = user_id)
    or exists (select 1 from public.applications a where a.candidate_id = notifications.user_id and (public.is_job_owner(a.job_id, auth.uid()) or public.is_active_team_member_for_job(a.job_id, auth.uid())))
    or exists (select 1 from public.document_requests dr where dr.employer_id = auth.uid() and dr.candidate_id = notifications.user_id)
    or exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.candidate_id = auth.uid() and j.employer_id = notifications.user_id)
    or exists (select 1 from public.document_requests dr where dr.candidate_id = auth.uid() and dr.employer_id = notifications.user_id));
  alter table public.messages enable row level security;
  create policy "send as yourself" on public.messages for insert to authenticated with check (sender_id = auth.uid());
  create policy "read yours" on public.messages for select using (sender_id = auth.uid() or receiver_id = auth.uid());

  insert into public.jobs values ('${JOB}', '${BIZ}');
  insert into public.applications values ('${APP_ANA}', '${JOB}', '${ANA}'), ('${APP_BEN}', '${JOB}', '${BEN}');

  -- A server function that writes notifications (like notify_new_message or report_employer).
  create or replace function public.server_bell(p_user uuid, p_n int) returns void language plpgsql security definer set search_path = public as $$
  begin
    for i in 1..p_n loop
      insert into public.notifications (user_id, type, title, message, link) values (p_user, 'system', 'A business was paused', repeat('x', 700), 'https://hireflownow.com/admin');
    end loop;
  end $$;
  grant execute on function public.server_bell(uuid, int) to authenticated;
`);
await db.exec(read("supabase/migrations/20260826211000_edge_function_rate_limiting.sql"));
const migration = read("supabase/migrations/20261025310000_notification_and_message_limits.sql");
await db.exec(migration);
await db.exec(migration);
check("the migration applies, and applies again", true);

async function as(uid, sql, params = []) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); select set_config('request.jwt.claim.role', '${uid ? "authenticated" : "anon"}', false); set role ${uid ? "authenticated" : "anon"};`);
  try {
    const r = await db.query(sql, params);
    return { ok: true, rows: r.rows };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claim.role', '', false);`);
  }
}
const pg = async (sql, params = []) => (await db.query(sql, params)).rows;

console.log("\nWhat an applicant writes to the business\n");
const fake = await as(ANA, `insert into public.notifications (user_id, type, title, message, link) values ($1, 'system', $2, $3, 'https://evil.example/login')`, [BIZ, `HireFlow: your account is suspended ${"!".repeat(300)}`, "x".repeat(54000)]);
check("the insert goes through (the pages never fail on a notification)", fake.ok, show(fake));
const stored = (await pg(`select type::text, link, char_length(title) as t, char_length(message) as m from public.notifications where user_id = $1`, [BIZ]))[0];
check("an applicant's card to a business is never a HireFlow 'system' card", stored?.type === "application", show(stored));
check("…a link outside HireFlow is dropped", stored?.link === null, show(stored));
check("…and the title and message are trimmed (160 / 600)", stored?.t === 160 && stored?.m === 600, show(stored));
for (const [link, kept] of [["//evil.example", false], ["/\\evil.example", false], ["javascript:alert(1)", false], ["/applicants?applicationId=1", true], ["/", true]]) {
  await pg(`delete from public.notifications`);
  await as(ANA, `insert into public.notifications (user_id, type, title, message, link) values ($1, 'application', 'Document received', 'x', $2)`, [BIZ, link]);
  const got = (await pg(`select link from public.notifications`))[0]?.link ?? null;
  check(`link ${JSON.stringify(link)} ${kept ? "is kept" : "is dropped"}`, kept ? got === link : got === null, show(got));
}

console.log("\nWhat the business writes to its applicants\n");
await pg(`delete from public.notifications`);
const biz = await as(BIZ, `insert into public.notifications (user_id, type, title, message, link) values ($1, 'system', 'Documents requested by Acme', 'Please send your ID.', '/my-documents')`, [ANA]);
const bizRow = (await pg(`select type::text, link from public.notifications where user_id = $1`, [ANA]))[0];
check("the business's own 'system' card to its applicant stays as written", biz.ok && bizRow?.type === "system" && bizRow?.link === "/my-documents", show({ biz, bizRow }));
const stranger = await as(OTHER_BIZ, `insert into public.notifications (user_id, type, title, message) values ($1, 'system', 'x', 'y')`, [ANA]);
check("another business still cannot write to someone else's applicant", !stranger.ok, show(stranger));

console.log("\nA flood\n");
await db.exec(`delete from public.notifications; delete from private_rate_limit;`);
const burst = await as(BEN, `insert into public.notifications (user_id, type, title, message, link) select $1, 'application', 'spam', 'spam', '/applicants' from generate_series(1, 500)`, [BIZ]);
const landed = (await pg(`select count(*)::int as n from public.notifications where user_id = $1`, [BIZ]))[0].n;
check("500 cards in one request: 30 land in the business's bell, the rest are quietly not written", burst.ok && landed === 30, show({ burst, landed }));
const self = await as(BEN, `insert into public.notifications (user_id, type, title, message) select $1, 'system', 'note', 'to myself' from generate_series(1, 40)`, [BEN]);
check("a note to yourself is not counted (and stays as written)", self.ok && (await pg(`select count(*)::int as n from public.notifications where user_id = $1 and type = 'system'`, [BEN]))[0].n === 40);
await pg(`delete from public.notifications`);
await as(BEN, `select public.server_bell($1, 50)`, [BIZ]);
const server = await pg(`select type::text, link, char_length(message) as m from public.notifications where user_id = $1`, [BIZ]);
check("the server's own notifications (written inside its functions) pass untouched, however many", server.length === 50 && server.every((r) => r.type === "system" && r.link === "https://hireflownow.com/admin" && r.m === 700), show(server[0]));

console.log("\nMessages\n");
await pg(`delete from private_rate_limit`);
const long = await as(ANA, `insert into public.messages (sender_id, receiver_id, application_id, content) values ($1, $2, $3, $4)`, [ANA, BIZ, APP_ANA, "x".repeat(10001)]);
check("a message over 10,000 characters is refused", !long.ok && /message_too_long/.test(long.error), show(long));
const okLong = await as(ANA, `insert into public.messages (sender_id, receiver_id, application_id, content) values ($1, $2, $3, $4)`, [ANA, BIZ, APP_ANA, "x".repeat(10000)]);
check("…10,000 is fine", okLong.ok, show(okLong));
let refusedAt = null;
for (let i = 2; i <= 125; i += 1) {
  const r = await as(ANA, `insert into public.messages (sender_id, receiver_id, application_id, content) values ($1, $2, $3, 'hello')`, [ANA, BIZ, APP_ANA]);
  if (!r.ok) {
    refusedAt = { i, error: r.error };
    break;
  }
}
check("the 121st message in an hour to one person is refused, saying so", refusedAt?.i === 121 && /too_many_messages/.test(refusedAt.error), show(refusedAt));
const toOther = await as(ANA, `insert into public.messages (sender_id, receiver_id, application_id, content) values ($1, $2, $3, 'hi')`, [ANA, OTHER_BIZ, APP_ANA]);
check("…while a message to someone else still goes", toOther.ok, show(toOther));

console.log("\nThe database's own time (20261025370000)\n");
await db.exec(`alter table public.notifications add column if not exists created_at timestamptz default now();`);
await db.exec(readFileSync(path.join(ROOT, "supabase/migrations/20261025370000_notifications_server_time.sql"), "utf8"));
await db.exec(`delete from public.notifications; delete from private_rate_limit;`);
await as(ANA, `insert into public.notifications (user_id, type, title, message, created_at) values ($1, 'system', 'ID papers were not deleted on time', 'x', '2099-01-01')`, [ANA]);
const dated = (await pg(`select created_at from public.notifications where user_id = $1`, [ANA]))[0];
check("a card someone writes to themself carries the database's time, never 2099", dated && new Date(dated.created_at).getFullYear() < 2099, JSON.stringify(dated));

console.log("\nInterviews (20261025360000)\n");
await db.exec(`create table public.interviews (id uuid primary key default gen_random_uuid(), application_id uuid, scheduled_at timestamptz, status text default 'scheduled', candidate_response text, duration_minutes int, proposed_times jsonb, employer_windows jsonb);
  grant select, insert, update on public.interviews to authenticated;`);
await db.exec(readFileSync(path.join(ROOT, "supabase/migrations/20261025360000_interview_write_limits.sql"), "utf8"));
await db.exec(`delete from private_rate_limit`);
const yearLong = await as(BIZ, `insert into public.interviews (application_id, scheduled_at, duration_minutes) values ($1, now() + interval '1 day', 525600) returning duration_minutes`, [APP_ANA]);
const longRow = (await pg(`select duration_minutes from public.interviews limit 1`))[0];
check("an interview lasts at most 240 minutes (a year was accepted)", yearLong.ok && longRow.duration_minutes === 240, JSON.stringify({ yearLong, longRow }));
let interviewRefused = null;
for (let i = 2; i <= 25; i += 1) {
  const res = await as(BIZ, `insert into public.interviews (application_id, scheduled_at, duration_minutes) values ($1, now() + interval '1 day', 30)`, [APP_ANA]);
  if (!res.ok) { interviewRefused = { i, error: res.error }; break; }
}
check("the 21st interview write in an hour for one applicant is refused, saying so", interviewRefused?.i === 21 && /too_many_interview_changes/.test(interviewRefused.error), JSON.stringify(interviewRefused));
const otherApplicant = await as(BIZ, `insert into public.interviews (application_id, scheduled_at, duration_minutes) values ($1, now() + interval '1 day', 30)`, [APP_BEN]);
check("…while another applicant can still be invited", otherApplicant.ok, otherApplicant.error);
const kinds = (await as(ANA, `select public.client_send_allowed('message', $1) as m`, [BIZ]));
check("messages and notifications keep their own counts", kinds.ok && kinds.rows[0].m === true, JSON.stringify(kinds));

console.log("\nWho may call the counter\n");
const anon = await as(null, `select public.client_send_allowed('message', $1)`, [BIZ]);
check("someone not signed in cannot call it", !anon.ok, show(anon));
const unknownKind = await as(ANA, `select public.client_send_allowed('anything', $1) as ok`, [BIZ]);
check("an unknown kind is never allowed", unknownKind.ok && unknownKind.rows[0].ok === false, show(unknownKind));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
