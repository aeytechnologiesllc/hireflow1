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
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATION = path.join(ROOT, "supabase/migrations/20261025100000_business_email_check.sql");
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
  create table auth.identities (user_id uuid, provider text);
  create type public.job_status as enum ('draft', 'published', 'closed', 'archived');
  create type public.app_role as enum ('employer', 'candidate');
  create table public.profiles (id uuid primary key default gen_random_uuid(), user_id uuid unique, email text, full_name text);
  create table public.user_roles (user_id uuid, role public.app_role);
  create table public.platform_admins (user_id uuid primary key);
  create table public.jobs (id uuid primary key default gen_random_uuid(), employer_id uuid not null, title text, status public.job_status default 'draft');

  insert into auth.users values
    ('${OLD_BIZ}', 'old@biz.test'), ('${NEW_BIZ}', 'new@biz.test'), ('${GOOGLE_BIZ}', 'g@biz.test'),
    ('${ADMIN}', 'admin@biz.test'), ('${TEAM}', 'team@biz.test'), ('${APPLICANT}', 'a@x.test');
  insert into auth.identities values ('${GOOGLE_BIZ}', 'google');
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
await db.exec(readFileSync(MIGRATION, "utf8"));
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
const age = (uid, interval) => db.exec(`update private.business_email_codes set sent_at = sent_at - interval '${interval}', window_started_at = window_started_at - interval '${interval}', expires_at = expires_at - interval '${interval}' where user_id = '${uid}'`);
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
  const other = await verify(OLD_BIZ, first.code);
  check("another account's code does nothing for them (they are already confirmed anyway)", other?.ok === true && other.already === true);
  const app = await verify(APPLICANT, first.code);
  check("an applicant with the business's code: no code of their own", app?.ok === false && app.reason === "no_code", JSON.stringify(app));
  check("…and is not stamped", !(await stamped(APPLICANT)));
  await verify(NEW_BIZ, wrongCode);
  await verify(NEW_BIZ, wrongCode);
  const w5 = await verify(NEW_BIZ, wrongCode);
  check("the fifth wrong try ends the code", w5?.ok === false && w5.reason === "expired", JSON.stringify(w5));
  const late = await verify(NEW_BIZ, first.code);
  check("…even the right code no longer works", late?.ok === false && late.reason === "expired" && !(await stamped(NEW_BIZ)), JSON.stringify(late));

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

console.log("\nNobody stamps themself\n");
{
  const u = await as(APPLICANT, "authenticated", `update public.profiles set email_verified_at = now() where user_id = '${APPLICANT}'`);
  check("an update through the API keeps the old value", u.error === null && !(await stamped(APPLICANT)), u.error);
  await db.exec(`delete from public.profiles where user_id = '${APPLICANT}'`);
  const i = await as(APPLICANT, "authenticated", `insert into public.profiles (user_id, email, email_verified_at) values ('${APPLICANT}', 'a@x.test', now())`);
  check("an insert through the API comes in unstamped", i.error === null && !(await stamped(APPLICANT)), i.error);
  const clear = await as(NEW_BIZ, "authenticated", `update public.profiles set email_verified_at = null where user_id = '${NEW_BIZ}'`);
  check("nor can a stamp be cleared through the API", clear.error === null && (await stamped(NEW_BIZ)), clear.error);
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
  const adm = await as(ADMIN, "authenticated", `insert into public.jobs (employer_id, title, status) values ('${ADMIN}', 'Test job', 'published')`);
  check("a platform admin publishes", adm.error === null, adm.error);
  const forOther = await as(LATE, "authenticated", `insert into public.jobs (employer_id, title, status) values ('${NEW_BIZ}', 'Spoof', 'published')`);
  check("the rule reads the job's business, whoever writes it (RLS decides who may write)", forOther.error === null, forOther.error);
}

console.log("\nThe email and its answers (_shared/businessEmailCode.ts)\n");
{
  const e = words.businessEmailCodeEmail({ code: "042917", firstName: "Dana Lee" });
  check("the subject carries the code", e.subject === "Your HireFlow code: 042917");
  check("it greets them by first name and says how long it lasts", e.lines[0].startsWith("Hi Dana,") && /15 minutes/.test(e.lines.join(" ")));
  check("it says what to do if they did not ask", /didn't ask for it/.test(e.lines.join(" ")));
  check("no player, Zulu or sweepstakes wording", !/player|zulu|sweepstake/i.test(JSON.stringify(e)));
  check("a good answer gives the code", JSON.stringify(words.readIssuedCode({ ok: true, code: "123456" })) === JSON.stringify({ ok: true, code: "123456" }));
  check("a code that is not six digits is not sent", words.readIssuedCode({ ok: true, code: "12345" }).ok === false);
  const soon = words.readIssuedCode({ ok: false, reason: "too_soon", retry_after: 42 });
  check("too soon: 429 with the seconds", soon.status === 429 && soon.retryAfter === 42 && /42 seconds/.test(soon.error));
  const many = words.readIssuedCode({ ok: false, reason: "too_many", retry_after: 1500 });
  check("too many: 429 with the minutes", many.status === 429 && /25 minutes/.test(many.error));
  check("already confirmed: not an error for the page", words.readIssuedCode({ ok: false, reason: "already_verified" }).status === 200);
  check("anything unreadable: try later", words.readIssuedCode(null).status === 503 && words.readIssuedCode({ ok: false, reason: "made_up" }).code === "try_later");
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
