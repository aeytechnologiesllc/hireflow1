#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261025100000_business_email_check.sql
 * (docs/LAUNCH-PLAN.md, Phase 2, task 4): a business proves its email with a
 * 6-digit code before its first job goes live; applicants are never asked.
 *
 *   - the code: only the system makes one, at most one a minute and five an
 *     hour; five wrong tries or 15 minutes end it; the right one stamps
 *     profiles.email_verified_at;
 *   - nobody stamps themself through the API;
 *   - a job goes to "published" only for a business that passed (or signed
 *     in with Google, or is a platform admin), from any status, by any
 *     write; the system's own writes and edits to a live job pass;
 *   - the businesses that existed before were stamped.
 * Plus supabase/functions/_shared/businessEmailCode.ts (the email's words
 * and what each answer means).
 *
 * Run with: node scripts/business_email_check.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
// EVERY migration from the check onward is applied in order, except the ones
// listed in NOT_THE_CHECK with the reason, so a later file that weakens the
// rule fails the checks below however its SQL is written (quoted or spaced
// names, 'select true' bodies, grants on all functions, a disabled or re-made
// trigger, a trigger that changes status itself: the fifth and sixth Pass C
// reviews). A new migration is applied here by default: if it needs more of
// the schema than the stub below has, this test fails until the stub is
// extended or the file is added to NOT_THE_CHECK with its reason.
const NOT_THE_CHECK = {
  "20261025110000_voice_recording_this_project.sql": "voice interview evidence (applications), nothing of the check",
  "20261025120000_admin_growth_one_role.sql": "the admin growth report, read-only",
  "20261025160000_ai_business_budget.sql": "the AI budget (its own private tables and ai_budget_take), nothing of jobs or profiles",
  "20261025170000_remove_applicant.sql": "deletes applications for their business on request; no job, profile or email-check object",
};
const LATER = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith(".sql") && name >= "20261025100000_business_email_check.sql")
  .sort()
  .filter((name) => !(name in NOT_THE_CHECK));
// One comment-aware pass (whichever of /* or -- starts first wins), for the
// earlier-file check below.
const withoutComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, " ");
const EARLIER_TOUCH = /\b(issue_business_email_code|verify_business_email_code|business_email_verified|jobs_publish_needs_email_check|profiles_email_verified_from_server|business_email_code|email_verified_(at|for))\b/i;
const EARLIER = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith(".sql") && name < "20261025100000_business_email_check.sql")
  .filter((name) => EARLIER_TOUCH.test(withoutComments(readFileSync(path.join(MIGRATIONS, name), "utf8"))));
const words = await import(path.join(ROOT, "supabase/functions/_shared/businessEmailCode.ts"));

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

const OLD_BIZ = "20000000-0000-4000-8000-000000000001";
const NEW_BIZ = "20000000-0000-4000-8000-000000000002";
const GOOGLE_BIZ = "20000000-0000-4000-8000-000000000003";
const ADMIN = "20000000-0000-4000-8000-000000000004";
const TEAM = "20000000-0000-4000-8000-000000000005";
const APPLICANT = "10000000-0000-4000-8000-000000000001";

const db = new PGlite();
await db.exec(`
  create schema auth; create schema private;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create or replace function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated') $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant anon, authenticated, service_role to postgres;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

  create table auth.users (id uuid primary key, email text);
  create table auth.identities (user_id uuid, provider text, identity_data jsonb);
  create type public.job_status as enum ('draft', 'published', 'closed', 'archived');
  create type public.app_role as enum ('employer', 'candidate');
  create table public.profiles (id uuid primary key default gen_random_uuid(), user_id uuid unique, email text, full_name text);
  create table public.user_roles (user_id uuid, role public.app_role);
  create table public.platform_admins (user_id uuid primary key);
  create table public.jobs (id uuid primary key default gen_random_uuid(), employer_id uuid not null, title text, status public.job_status default 'draft');
  create function public.is_platform_admin() returns boolean language sql stable security definer as $$
    select exists (select 1 from public.platform_admins where user_id = auth.uid()) $$;
  grant execute on function public.is_platform_admin() to authenticated;

  insert into auth.users values
    ('${OLD_BIZ}', 'old@biz.test'), ('${NEW_BIZ}', 'new@biz.test'), ('${GOOGLE_BIZ}', 'g@biz.test'),
    ('${ADMIN}', 'admin@biz.test'), ('${TEAM}', 'team@biz.test'), ('${APPLICANT}', 'a@x.test');
  insert into auth.identities values ('${GOOGLE_BIZ}', 'google', '{"email":"g@biz.test"}');
  insert into public.profiles (user_id, email) values
    ('${OLD_BIZ}', 'old@biz.test'), ('${GOOGLE_BIZ}', 'g@biz.test'), ('${ADMIN}', 'admin@biz.test'),
    ('${TEAM}', 'team@biz.test'), ('${APPLICANT}', 'a@x.test');
  insert into public.user_roles values ('${OLD_BIZ}', 'employer'), ('${APPLICANT}', 'candidate'), ('${GOOGLE_BIZ}', 'employer');
  insert into public.platform_admins values ('${ADMIN}');

  alter table public.profiles enable row level security;
  create policy own_profile on public.profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  grant select, insert, update on public.profiles to authenticated;
  alter table public.jobs enable row level security;
  create policy jobs_any on public.jobs for all to authenticated using (true) with check (true);
  grant select, insert, update on public.jobs to authenticated, service_role;
`);
console.log(`\nApplied, in order: ${LATER.join(", ")}\n`);
for (const name of LATER) {
  try {
    await db.exec(readFileSync(path.join(MIGRATIONS, name), "utf8"));
  } catch (e) {
    check(`${name} applies on this test's schema (it touches the email check; extend the stub if it needs more)`, false, e.message ?? String(e));
  }
}
check("the migrations that make the check are among them", ["20261025100000_business_email_check.sql", "20261025130000_business_email_check_hardening.sql", "20261025140000_business_email_check_round3.sql", "20261025150000_business_email_check_after_trigger.sql"].every((n) => LATER.includes(n)), LATER.join(", "));
check("no migration named earlier than the check touches it (a back-dated file would run after it live)", EARLIER.length === 0, EARLIER.join(", "));
check("every skipped migration still exists (the list is not stale)", Object.keys(NOT_THE_CHECK).every((n) => readdirSync(MIGRATIONS).includes(n)));
// Signed up after the migration: never asked yet.
await db.exec(`insert into public.profiles (user_id, email) values ('${NEW_BIZ}', 'new@biz.test'); insert into public.user_roles values ('${NEW_BIZ}', 'employer');`);

async function as(uid, role, sql) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); select set_config('request.jwt.claim.role', '${role}', false); set role ${role === "service_role" ? "service_role" : role === "anon" ? "anon" : "authenticated"};`);
  try {
    const r = await db.query(sql);
    return { rows: r.rows, error: null };
  } catch (e) {
    return { rows: [], error: e.message ?? String(e), hint: e.hint };
  } finally {
    await db.exec(`reset role;`);
  }
}
const one = async (uid, role, sql) => (await as(uid, role, sql)).rows[0] ?? {};
const issue = (uid) => one(null, "service_role", `select public.issue_business_email_code('${uid}') as r`).then((x) => x.r);
const verify = (uid, code) => one(uid, "authenticated", `select public.verify_business_email_code('${code}') as r`).then((x) => x.r);
const stamped = async (uid) => (await db.query(`select email_verified_at from public.profiles where user_id = '${uid}'`)).rows[0]?.email_verified_at != null;
const age = (uid, interval) => db.exec(`update private.business_email_codes set sent_at = sent_at - interval '${interval}', window_started_at = window_started_at - interval '${interval}', expires_at = expires_at - interval '${interval}' where user_id = '${uid}'; update private.business_email_code_sends set sent_at = sent_at - interval '${interval}'`);
const ageSentOnly = (uid, interval) => db.exec(`update private.business_email_codes set sent_at = sent_at - interval '${interval}' where user_id = '${uid}'`);

console.log("\nThe businesses that already existed\n");
check("an existing business was stamped", await stamped(OLD_BIZ));
check("an applicant was not", !(await stamped(APPLICANT)));
check("a business that signs up afterwards is not", !(await stamped(NEW_BIZ)));

console.log("\nWho may make a code\n");
{
  const r = await as(NEW_BIZ, "authenticated", `select public.issue_business_email_code('${NEW_BIZ}')`);
  check("a signed-in account cannot make one for itself (it would see the code)", !!r.error && /permission denied/i.test(r.error), r.error ?? "no error");
  const anon = await as(null, "anon", `select public.issue_business_email_code('${NEW_BIZ}')`);
  check("nor can someone signed out", !!anon.error && /permission denied/i.test(anon.error), anon.error ?? "no error");
  const table = await as(NEW_BIZ, "authenticated", `select * from private.business_email_codes`);
  check("the codes table is nobody's to read through the API", !!table.error, table.error ?? "no error");
  check("an already-confirmed business gets no code", (await issue(OLD_BIZ))?.reason === "already_verified");
  check("nor a Google sign-in (Google checked the address)", (await issue(GOOGLE_BIZ))?.reason === "already_verified");
}

console.log("\nThe code\n");
let first;
{
  first = await issue(NEW_BIZ);
  check("the system makes a 6-digit code", first?.ok === true && /^[0-9]{6}$/.test(first.code), JSON.stringify(first));
  check("…and says which address it is for (the function mails that one only)", first?.email === "new@biz.test", JSON.stringify(first));
  const row = (await db.query(`select code_hash from private.business_email_codes where user_id = '${NEW_BIZ}'`)).rows[0];
  check("only a hash is kept", row && row.code_hash !== first.code && /^[0-9a-f]{64}$/.test(row.code_hash));
  const again = await issue(NEW_BIZ);
  check("another within a minute: too soon, with the wait", again?.ok === false && again.reason === "too_soon" && again.retry_after > 0 && again.retry_after <= 60, JSON.stringify(again));
  const codes = new Set([first.code]);
  for (let i = 2; i <= 5; i += 1) {
    await ageSentOnly(NEW_BIZ, "61 seconds");
    const r = await issue(NEW_BIZ);
    if (r?.ok) codes.add(r.code);
    if (i === 5) check("up to five an hour", r?.ok === true, JSON.stringify(r));
  }
  await ageSentOnly(NEW_BIZ, "61 seconds");
  const sixth = await issue(NEW_BIZ);
  check("the sixth in an hour is refused, with the wait", sixth?.ok === false && sixth.reason === "too_many" && sixth.retry_after > 60, JSON.stringify(sixth));
  check("the codes are not all the same", codes.size >= 2, [...codes].join(","));
  await age(NEW_BIZ, "61 minutes");
  first = await issue(NEW_BIZ);
  check("an hour later it can ask again", first?.ok === true, JSON.stringify(first));
}

console.log("\nChecking it\n");
{
  const wrongCode = first.code === "000000" ? "111111" : "000000";
  const w1 = await verify(NEW_BIZ, wrongCode);
  check("a wrong code: says so, with the tries left", w1?.ok === false && w1.reason === "wrong_code" && w1.tries_left === 4, JSON.stringify(w1));
  const junk = await verify(NEW_BIZ, "12ab");
  check("something that is not six digits counts as a wrong try", junk?.ok === false && junk.tries_left === 3, JSON.stringify(junk));
  const UNCONFIRMED = "20000000-0000-4000-8000-000000000007";
  await db.exec(`insert into auth.users values ('${UNCONFIRMED}', 'other@biz.test'); insert into public.profiles (user_id, email) values ('${UNCONFIRMED}', 'other@biz.test'); insert into public.user_roles values ('${UNCONFIRMED}', 'employer');`);
  const other = await verify(UNCONFIRMED, first.code);
  check("another business's code does nothing for an unconfirmed account", other?.ok === false && other.reason === "no_code" && !(await stamped(UNCONFIRMED)), JSON.stringify(other));
  const app = await verify(APPLICANT, first.code);
  check("an applicant with the business's code: no code of their own", app?.ok === false && app.reason === "no_code", JSON.stringify(app));
  check("…and is not stamped", !(await stamped(APPLICANT)));
  await verify(NEW_BIZ, wrongCode);
  await verify(NEW_BIZ, wrongCode);
  const w5 = await verify(NEW_BIZ, wrongCode);
  check("the fifth wrong try uses the code up (said as such, not 'expired')", w5?.ok === false && w5.reason === "used_up", JSON.stringify(w5));
  const late = await verify(NEW_BIZ, first.code);
  check("…even the right code no longer works", late?.ok === false && late.reason === "used_up" && !(await stamped(NEW_BIZ)), JSON.stringify(late));

  await ageSentOnly(NEW_BIZ, "61 seconds");
  const fresh = await issue(NEW_BIZ);
  await age(NEW_BIZ, "16 minutes");
  const stale = await verify(NEW_BIZ, fresh.code);
  check("a code older than 15 minutes has expired", stale?.ok === false && stale.reason === "expired", JSON.stringify(stale));

  await ageSentOnly(NEW_BIZ, "61 seconds");
  const good = await issue(NEW_BIZ);
  const anon = await as(null, "anon", `select public.verify_business_email_code('${good.code}')`);
  check("someone signed out cannot check a code", !!anon.error && /permission denied/i.test(anon.error), anon.error ?? "no error");
  const right = await verify(NEW_BIZ, ` ${good.code.slice(0, 3)} ${good.code.slice(3)} `);
  check("the right code (spaces allowed) confirms the email", right?.ok === true && (await stamped(NEW_BIZ)), JSON.stringify(right));
  const used = (await db.query(`select count(*)::int as n from private.business_email_codes where user_id = '${NEW_BIZ}'`)).rows[0].n;
  check("…and is used up", used === 0);
  check("the page can ask whether it passed", (await one(NEW_BIZ, "authenticated", `select public.my_business_email_verified() as v`)).v === true);
}

console.log("\nThe hardening (second Pass C review)\n");
{
  // An applicant account never gets a code.
  const app = await issue(APPLICANT);
  check("an applicant account gets no code (businesses only)", app?.ok === false && app.reason === "not_a_business", JSON.stringify(app));

  // The stamp is for an address.
  check("a confirmed business passes while its address is the one it confirmed", (await one(NEW_BIZ, "authenticated", `select public.my_business_email_verified() as v`)).v === true);
  await db.exec(`update auth.users set email = 'hr@victim.test' where id = '${NEW_BIZ}'`);
  check("…and stops passing the moment its sign-in address changes", (await one(NEW_BIZ, "authenticated", `select public.my_business_email_verified() as v`)).v === false);
  const sneaky = await as(NEW_BIZ, "authenticated", `insert into public.jobs (employer_id, title, status) values ('${NEW_BIZ}', 'Under another address', 'published')`);
  check("…so it cannot publish under the new address without confirming it", !!sneaky.error && /Confirm your email/.test(sneaky.error), sneaky.error ?? "no error");
  check("…and the refusal no longer promises a code where none is sent", !/We'll send you a 6-digit code/.test(sneaky.error ?? "") && /press Publish in the job editor/.test(sneaky.error ?? ""));
  await db.exec(`update auth.users set email = 'NEW@biz.test' where id = '${NEW_BIZ}'`);
  check("…case does not matter for the same address", (await one(NEW_BIZ, "authenticated", `select public.my_business_email_verified() as v`)).v === true);

  // A code is for the address it went to.
  const SWITCH = "20000000-0000-4000-8000-000000000008";
  await db.exec(`insert into auth.users values ('${SWITCH}', 'a@switch.test'); insert into public.profiles (user_id, email) values ('${SWITCH}', 'a@switch.test'); insert into public.user_roles values ('${SWITCH}', 'employer');`);
  const sent = await issue(SWITCH);
  await db.exec(`update auth.users set email = 'b@switch.test' where id = '${SWITCH}'`);
  const switched = await verify(SWITCH, sent.code);
  check("a code sent to one address does nothing after a switch to another", switched?.ok === false && switched.reason === "address_changed" && !(await stamped(SWITCH)), JSON.stringify(switched));

  // One inbox, however it is written.
  const keys = (await db.query(`select private.inbox_key('Vic.Tim+1@GoogleMail.com') as a, private.inbox_key('victim+2@gmail.com') as b, private.inbox_key('v.i.c.t.i.m@gmail.com') as c, private.inbox_key('Sam.Lee+x@clinic.test') as d`)).rows[0];
  check("the inbox key ignores case, +tags, and Gmail's dots and googlemail.com", keys.a === "victim@gmail.com" && keys.b === "victim@gmail.com" && keys.c === "victim@gmail.com" && keys.d === "sam.lee@clinic.test", JSON.stringify(keys));
  const flood = [];
  let refusal = null;
  for (let i = 1; i <= 11; i += 1) {
    const uid = `30000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`;
    await db.exec(`insert into auth.users values ('${uid}', 'victim+${i}@gmail.com'); insert into public.profiles (user_id, email) values ('${uid}', 'victim+${i}@gmail.com'); insert into public.user_roles values ('${uid}', 'employer');`);
    // Half an hour before the eleventh, so the wait it gives can be told
    // apart from a flat hour (fourth Pass C review).
    if (i === 11) await db.exec(`update private.business_email_code_sends set sent_at = sent_at - interval '30 minutes' where address_key = 'victim@gmail.com'`);
    const r = await issue(uid);
    flood.push(r?.ok === true);
    if (!r?.ok) refusal = r;
  }
  // (One connection here, so a parallel burst is not run. That the inbox and
  // overall locks are taken before the counts are read and the code written
  // is checked by the publish-requires-verified-email guard, by position in
  // the function's body; the guard cannot prove the locks' effect.)
  check("eleven new accounts at victim+N@gmail.com: ten codes reach that inbox in an hour, the eleventh does not", flood.slice(0, 10).every(Boolean) && flood[10] === false, JSON.stringify(flood));
  check("…and the wait it gives is the real one, not always an hour", refusal?.reason === "too_many" && refusal.retry_after > 1700 && refusal.retry_after <= 1800, JSON.stringify(refusal));
  await db.exec(`update private.business_email_code_sends set sent_at = sent_at - interval '31 minutes' where address_key = 'victim@gmail.com'`);
  const more = [];
  for (let i = 12; i <= 21; i += 1) {
    const uid = `30000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`;
    await db.exec(`insert into auth.users values ('${uid}', 'victim+${i}@gmail.com'); insert into public.profiles (user_id, email) values ('${uid}', 'victim+${i}@gmail.com'); insert into public.user_roles values ('${uid}', 'employer');`);
    more.push((await issue(uid))?.reason ?? "ok");
  }
  await db.exec(`update private.business_email_code_sends set sent_at = sent_at - interval '61 minutes' where address_key = 'victim@gmail.com' and sent_at > now() - interval '1 hour'`);
  const UID22 = "30000000-0000-4000-8000-000000000022";
  await db.exec(`insert into auth.users values ('${UID22}', 'victim+22@gmail.com'); insert into public.profiles (user_id, email) values ('${UID22}', 'victim+22@gmail.com'); insert into public.user_roles values ('${UID22}', 'employer');`);
  const day = await issue(UID22);
  check("an hour later ten more; twenty in a day is the end of it for that inbox", more.every((r) => r === "ok") && day?.reason === "too_many_today", JSON.stringify({ more, day }));

  // Everyone together.
  await db.exec(`insert into private.business_email_code_sends (address_key, sent_at) select 'x' || g || '@load.test', now() from generate_series(1, 300) g`);
  const LATE2 = "20000000-0000-4000-8000-000000000010";
  await db.exec(`insert into auth.users values ('${LATE2}', 'late2@biz.test'); insert into public.profiles (user_id, email) values ('${LATE2}', 'late2@biz.test'); insert into public.user_roles values ('${LATE2}', 'employer');`);
  check("past 300 codes in an hour for everyone, the next waits", (await issue(LATE2))?.reason === "busy");
  await db.exec(`delete from private.business_email_code_sends where address_key like '%@load.test'`);
  const sends = await as(NEW_BIZ, "authenticated", `select * from private.business_email_code_sends`);
  check("the send log is nobody's to read through the API", !!sends.error);
}

console.log("\nNobody stamps themself\n");
{
  const u = await as(APPLICANT, "authenticated", `update public.profiles set email_verified_at = now() where user_id = '${APPLICANT}'`);
  check("an update through the API keeps the old value", u.error === null && !(await stamped(APPLICANT)), u.error);
  await db.exec(`delete from public.profiles where user_id = '${APPLICANT}'`);
  const i = await as(APPLICANT, "authenticated", `insert into public.profiles (user_id, email, email_verified_at) values ('${APPLICANT}', 'a@x.test', now())`);
  check("an insert through the API comes in unstamped", i.error === null && !(await stamped(APPLICANT)), i.error);
  const clear = await as(NEW_BIZ, "authenticated", `update public.profiles set email_verified_at = null where user_id = '${NEW_BIZ}'`);
  check("nor can a stamp be cleared through the API", clear.error === null && (await stamped(NEW_BIZ)), clear.error);
  const repoint = await as(NEW_BIZ, "authenticated", `update public.profiles set email_verified_for = 'hr@victim.test' where user_id = '${NEW_BIZ}'`);
  const forNow = (await db.query(`select email_verified_for from public.profiles where user_id = '${NEW_BIZ}'`)).rows[0]?.email_verified_for;
  check("nor can the confirmed address be pointed somewhere else", repoint.error === null && forNow === "new@biz.test", `${repoint.error} ${forNow}`);
}

console.log("\nPutting a job live\n");
{
  const LATE = "20000000-0000-4000-8000-000000000006";
  await db.exec(`insert into auth.users values ('${LATE}', 'late@biz.test'); insert into public.profiles (user_id, email) values ('${LATE}', 'late@biz.test');`);
  const ins = await as(LATE, "authenticated", `insert into public.jobs (employer_id, title, status) values ('${LATE}', 'Chat agent', 'published')`);
  check("a business that never confirmed cannot publish a new job", !!ins.error && /Confirm your email/.test(ins.error), ins.error ?? "no error");
  check("…and the page can tell why (HINT email_not_verified)", ins.hint === "email_not_verified", String(ins.hint));
  const draft = await as(LATE, "authenticated", `insert into public.jobs (employer_id, title, status) values ('${LATE}', 'Chat agent', 'draft') returning id`);
  check("a draft is fine", draft.error === null && draft.rows.length === 1, draft.error);
  const jobId = draft.rows[0]?.id;
  const up = await as(LATE, "authenticated", `update public.jobs set status = 'published' where id = '${jobId}'`);
  check("a draft cannot be published either", !!up.error && /Confirm your email/.test(up.error), up.error ?? "no error");
  const team = await as(TEAM, "authenticated", `update public.jobs set status = 'published' where id = '${jobId}'`);
  check("nor by a team member: it is the business's email that counts", !!team.error && /Confirm your email/.test(team.error), team.error ?? "no error");
  const sys = await as(null, "service_role", `update public.jobs set status = 'published' where id = '${jobId}'`);
  check("the system's own write passes", sys.error === null, sys.error);
  const edit = await as(LATE, "authenticated", `update public.jobs set title = 'Chat agent (nights)' where id = '${jobId}'`);
  check("editing a job that is already live is not a publish", edit.error === null, edit.error);
  await as(LATE, "authenticated", `update public.jobs set status = 'closed' where id = '${jobId}'`);
  const reopen = await as(LATE, "authenticated", `update public.jobs set status = 'published' where id = '${jobId}'`);
  check("closing works, but opening it again needs the check", !!reopen.error && /Confirm your email/.test(reopen.error), reopen.error ?? "no error");
  const nul = await as(LATE, "authenticated", `insert into public.jobs (employer_id, title, status) values ('${LATE}', 'x', null)`);
  check("a job with no status is not a publish", nul.error === null, nul.error);

  const ok = await as(NEW_BIZ, "authenticated", `insert into public.jobs (employer_id, title, status) values ('${NEW_BIZ}', 'Chat agent', 'published')`);
  check("the business that confirmed publishes", ok.error === null, ok.error);
  const old = await as(OLD_BIZ, "authenticated", `insert into public.jobs (employer_id, title, status) values ('${OLD_BIZ}', 'Phone agent', 'published')`);
  check("an existing business publishes as before", old.error === null, old.error);
  const g = await as(GOOGLE_BIZ, "authenticated", `insert into public.jobs (employer_id, title, status) values ('${GOOGLE_BIZ}', 'Front desk', 'published')`);
  check("a Google sign-in publishes", g.error === null, g.error);
  await db.exec(`update auth.users set email = 'other@victim.test' where id = '${GOOGLE_BIZ}'`);
  check("…but not once its sign-in address is no longer its Google address", (await one(GOOGLE_BIZ, "authenticated", `select public.my_business_email_verified() as v`)).v === false);
  await db.exec(`update auth.users set email = 'g@biz.test' where id = '${GOOGLE_BIZ}'`);
  const adm = await as(ADMIN, "authenticated", `insert into public.jobs (employer_id, title, status) values ('${ADMIN}', 'Test job', 'published')`);
  check("a platform admin publishes", adm.error === null, adm.error);
  const adminReopen = await as(ADMIN, "authenticated", `update public.jobs set status = 'published' where id = '${jobId}'`);
  check("a platform admin reopening a business's job is not refused (the business still confirms to publish itself)", adminReopen.error === null, adminReopen.error);
  const forOther = await as(LATE, "authenticated", `insert into public.jobs (employer_id, title, status) values ('${NEW_BIZ}', 'Spoof', 'published')`);
  check("the rule reads the job's business, whoever writes it (RLS decides who may write)", forOther.error === null, forOther.error);

  // Another trigger that puts a job live by itself on an ordinary edit (a
  // scheduled publish, say): a column trigger "of status" never fired for it
  // (the sixth Pass C review). The check reads the row as finally written.
  const later = await as(LATE, "authenticated", `insert into public.jobs (employer_id, title, status) values ('${LATE}', 'Night agent', 'draft') returning id`);
  await db.exec(`
    create function public.zz_test_auto_publish() returns trigger language plpgsql as $f$
    begin if new.title like '%(go live)' then new.status := 'published'; end if; return new; end $f$;
    create trigger zz_test_auto_publish before insert or update on public.jobs for each row execute function public.zz_test_auto_publish();`);
  const sneaky = await as(LATE, "authenticated", `update public.jobs set title = 'Night agent (go live)' where id = '${later.rows[0]?.id}'`);
  check("a job put live by another trigger on an ordinary edit is still checked", !!sneaky.error && /Confirm your email/.test(sneaky.error), sneaky.error ?? "no error");
  const sneakyNew = await as(LATE, "authenticated", `insert into public.jobs (employer_id, title, status) values ('${LATE}', 'Day agent (go live)', 'draft')`);
  check("…and on a new job saved as a draft", !!sneakyNew.error && /Confirm your email/.test(sneakyNew.error), sneakyNew.error ?? "no error");
  const stillDraft = (await db.query(`select status from public.jobs where id = '${later.rows[0]?.id}'`)).rows[0]?.status;
  check("…and the refused edit is undone", stillDraft === "draft", String(stillDraft));
  const fine = await as(NEW_BIZ, "authenticated", `insert into public.jobs (employer_id, title, status) values ('${NEW_BIZ}', 'Weekend agent (go live)', 'draft')`);
  check("a confirmed business's job put live that way is fine", fine.error === null, fine.error);
  await db.exec(`drop trigger zz_test_auto_publish on public.jobs; drop function public.zz_test_auto_publish();`);
}

console.log("\nThe email and its answers (_shared/businessEmailCode.ts)\n");
{
  const e = words.businessEmailCodeEmail({ code: "042917", firstName: "hireflow-verify.example/login" });
  check("the subject carries the code", e.subject === "Your HireFlow code: 042917");
  check("it says how long the code lasts", /15 minutes/.test(e.lines.join(" ")));
  check("it carries nothing the account typed, not even a first name (second Pass C review)", !/hireflow-verify|Hi /.test(JSON.stringify(e)));
  check("it says what to do if they did not ask", /didn't ask for it/.test(e.lines.join(" ")));
  check("no player, Zulu or sweepstakes wording", !/player|zulu|sweepstake/i.test(JSON.stringify(e)));
  check("a good answer gives the code and the address it is for", JSON.stringify(words.readIssuedCode({ ok: true, code: "123456", email: "a@b.test" })) === JSON.stringify({ ok: true, code: "123456", email: "a@b.test" }));
  check("…and an answer without an address sends nothing (try later)", words.readIssuedCode({ ok: true, code: "123456" }).ok === false);
  check("twenty for one inbox in a day: said, with Help offered", /Help/.test(words.readIssuedCode({ ok: false, reason: "too_many_today" }).error));
  check("a code that is not six digits is not sent", words.readIssuedCode({ ok: true, code: "12345" }).ok === false);
  const soon = words.readIssuedCode({ ok: false, reason: "too_soon", retry_after: 42 });
  check("too soon: 429 with the seconds", soon.status === 429 && soon.retryAfter === 42 && /42 seconds/.test(soon.error));
  const many = words.readIssuedCode({ ok: false, reason: "too_many", retry_after: 1500 });
  check("too many: 429 with the minutes, never 'you asked five times' (the inbox's limit can be someone else's doing)", many.status === 429 && /25 minutes/.test(many.error) && !/five codes/.test(many.error));
  check("already confirmed: not an error for the page", words.readIssuedCode({ ok: false, reason: "already_verified" }).status === 200);
  check("anything unreadable: try later", words.readIssuedCode(null).status === 503 && words.readIssuedCode({ ok: false, reason: "made_up" }).code === "try_later");
  check("an applicant account: refused in words", words.readIssuedCode({ ok: false, reason: "not_a_business" }).status === 403);
  check("busy for everyone: a wait in words", words.readIssuedCode({ ok: false, reason: "busy" }).status === 503 && /few minutes/.test(words.readIssuedCode({ ok: false, reason: "busy" }).error));
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
