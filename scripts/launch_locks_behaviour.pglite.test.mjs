#!/usr/bin/env node
/**
 * The launch locks, proved by what they do (the sixth security review,
 * finding 3).
 *
 * The guards that hold these locks read the migrations as text, and the
 * review found natural ways to write a weakening that every one of them
 * missed: the queue's trigger remade WHEN (false) or FOR EACH STATEMENT,
 * switched to replica only or made SECURITY INVOKER; a function redefined
 * with $function$ quotes, or with SECURITY DEFINER after its body; a grant
 * without the "public." prefix or ON ROUTINE; a cap multiplied away. This
 * test applies EVERY migration in order on a stand-in for Supabase (the auth
 * and storage schemas, pg_cron, pg_net and Vault as recorders, the anon /
 * authenticated / service_role roles with Supabase's default grants) and then
 * acts as each role with real JWT claims (request.jwt.claims, as PostgREST
 * sends them). A later migration that weakens a lock, however its SQL is
 * written, fails here.
 *
 *   1. A deleted application queues its recordings, video introduction and
 *      work samples in storage_file_trash (3 rows): the applicant's own
 *      withdrawal, Delete Account, a deleted job, and remove_applicant.
 *   2. remove_applicant: refused to anon and authenticated; the service role
 *      removes for the job's owner, logs it, refuses a stranger.
 *   3. ai_budget_take (service role only): a business stops at 2,000 units a
 *      day, 300 while it has not confirmed its email and has no live job;
 *      HireFlow's own business at 6,000; the platform at 10,000; a call the
 *      platform refuses gives the business its units back.
 *   4. What a browser writes into someone else's bell or inbox: titles 160
 *      and messages 600 characters, in-app links only, an applicant's card
 *      never "system", the database's own time, 30 an hour to one person and
 *      300 in all (quietly not written); messages up to 10,000 characters, 120
 *      an hour to one person and 600 in all (refused).
 *   5. Reports pause a business only from three people it has been in touch
 *      with; three who merely applied leave it open and ring the admins.
 *      business_has_contacted is the server's only.
 *   6. Team invite codes are made by the server: 'TEAM-' and 24 hex
 *      characters from gen_random_bytes, never the code the browser sent.
 *   7. File paths an applicant stores (the resume link, the form's files, a
 *      requested paper) hold no "%", backslash or control character, which
 *      the service-key signers would read as a step out of their folder
 *      (20261025500000_plain_file_paths.sql).
 *
 * Two repo migrations were never applied live and fail on any database since
 * (docs/MIGRATION-HISTORY.md, section 3b); they are skipped with that reason.
 *
 * Run with: node scripts/launch_locks_behaviour.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${String(detail).slice(0, 400)})` : ""}`);
  }
}

// Never applied live, and would fail on any database since: they alter the
// "showcase" roles/candidates tables that were dropped the day they were made
// (docs/MIGRATION-HISTORY.md, section 3b).
const NEVER_APPLIED = {
  "20260625120000_accountless_candidate_flow.sql": "targets the dropped showcase public.roles / public.candidates (MIGRATION-HISTORY.md 3b)",
  "20260625130000_phone_continue_flow.sql": "indexes the dropped showcase public.candidates (MIGRATION-HISTORY.md 3b)",
};

// What Supabase gives every project before its first migration, as far as
// these locks need it.
const STAND_IN = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create role supabase_auth_admin nologin;
  create role supabase_storage_admin nologin;
  grant anon, authenticated, service_role to postgres;

  create schema auth;
  create schema storage;
  create schema extensions;
  create schema cron;
  create schema net;
  create schema vault;
  grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
  -- Supabase's default grants: the API roles may touch every table and call
  -- every function in public; RLS and the migrations' REVOKEs are what hold.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  create table auth.users (
    id uuid primary key, email text, raw_app_meta_data jsonb default '{}'::jsonb,
    raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now(),
    updated_at timestamptz default now(), last_sign_in_at timestamptz, email_confirmed_at timestamptz,
    phone text, deleted_at timestamptz, is_anonymous boolean not null default false
  );
  create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
    provider text, provider_id text, identity_data jsonb, email text, created_at timestamptz default now());
  create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
    factor_type text, status text, friendly_name text, created_at timestamptz default now());
  -- As Supabase defines them: from the claims PostgREST sets for the request.
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  create function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
  create function auth.email() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.email', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'))::text $$;
  grant execute on function auth.uid(), auth.role(), auth.jwt(), auth.email() to anon, authenticated, service_role;

  create table storage.buckets (id text primary key, name text not null unique, owner uuid, public boolean default false,
    avif_autodetection boolean default false, file_size_limit bigint, allowed_mime_types text[], owner_id text,
    created_at timestamptz default now(), updated_at timestamptz default now());
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text,
    owner uuid, owner_id text, metadata jsonb, user_metadata jsonb, version text,
    path_tokens text[] generated always as (string_to_array(name, '/')) stored,
    created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz default now());
  alter table storage.objects enable row level security;
  alter table storage.buckets enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  create function storage.filename(name text) returns text language sql immutable as $$
    select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
  create function storage.extension(name text) returns text language sql immutable as $$
    select reverse(split_part(reverse(name), '.', 1)) $$;
  grant select, insert, update, delete on storage.objects, storage.buckets to anon, authenticated, service_role;
  grant execute on all functions in schema storage to anon, authenticated, service_role;

  -- pg_cron, pg_net and Vault record what they are given and run nothing.
  create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
  create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
    insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
    on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
  create function cron.schedule(schedule text, command text) returns bigint language sql as $$
    insert into cron.job (schedule, command) values (schedule, command) returning jobid $$;
  create function cron.unschedule(job_name text) returns boolean language plpgsql as $$
  begin
    delete from cron.job where jobname = job_name;
    if not found then raise exception 'could not find valid entry for job ''%''', job_name; end if;
    return true;
  end $$;
  create function cron.unschedule(job_id bigint) returns boolean language sql as $$ delete from cron.job where jobid = job_id returning true $$;
  create table net.requests (id bigserial primary key, url text, body jsonb, headers jsonb, made_at timestamptz default now());
  create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
    headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer default 5000)
    returns bigint language sql security definer as $$ insert into net.requests (url, body, headers) values (url, body, headers) returning id $$;
  create function net.http_get(url text, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
    returns bigint language sql security definer as $$ insert into net.requests (url, headers) values (url, headers) returning id $$;
  create function extensions.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
    headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer default 5000)
    returns bigint language sql as $$ select net.http_post(url, body, params, headers, timeout_milliseconds) $$;
  create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text, secret text, created_at timestamptz default now());
  create view vault.decrypted_secrets as select id, name, description, secret, secret as decrypted_secret, created_at from vault.secrets;
  create function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid language sql as $$
    insert into vault.secrets (name, description, secret) values (new_name, new_description, new_secret) returning id $$;

  create publication supabase_realtime;
  create extension if not exists pgcrypto with schema extensions;
  set search_path = public, extensions;
`;

// pg_cron and pg_net are not PGlite extensions; their schemas stand in above.
const prepare = (sql) => sql.replace(/create\s+extension\s+if\s+not\s+exists\s+(pg_cron|pg_net)\b[^;]*;/gi, "-- (stand-in: $1)\n");

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(STAND_IN);

console.log("\nEvery migration, in order\n");
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
const notApplied = [];
for (const name of files) {
  if (name in NEVER_APPLIED) continue;
  try {
    await db.exec(prepare(readFileSync(path.join(MIGRATIONS, name), "utf8")));
  } catch (e) {
    notApplied.push(`${name}: ${e.message}`);
  }
}
check(`all ${files.length - Object.keys(NEVER_APPLIED).length} migrations apply in order (two never-applied files aside)`, notApplied.length === 0, notApplied.join(" | "));
check("the never-applied list is not stale", Object.keys(NEVER_APPLIED).every((n) => files.includes(n)));

// ---------------------------------------------------------------------------
// People and jobs. Accounts are made as Supabase Auth makes them (a row in
// auth.users, whose trigger makes the profile); roles and the email check
// are set as the server sets them.

const id = (group, n) => `${group}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1, 1); // HireFlow's own account (a platform admin)
const BIZ = id(1, 2); // a business that confirmed its email
const NEWBIZ = id(1, 3); // signed up, not confirmed, nothing live
const BIZ_E = id(1, 4); // confirmed, for the platform's own cap
const PBIZ = id(1, 5); // reported by people who only applied
const QBIZ = id(1, 6); // reported by people it was in touch with
const STRANGER = id(1, 7); // another business
const WD = id(2, 1); // withdraws
const GONE = id(2, 2); // deletes their account
const JOBLESS = id(2, 3); // their job is deleted
const REMOVED = id(2, 4); // removed by the business
const ANA = id(2, 5); // writes notifications and messages
const ANA2 = id(2, 6);
const ANA3 = id(2, 7);
const ANA4 = id(2, 8);
const R = [id(3, 1), id(3, 2), id(3, 3)]; // applied to PBIZ, never contacted
const S = [id(3, 4), id(3, 5), id(3, 6)]; // applied to QBIZ, contacted
const JOB = id(4, 1);
const JOB_GOES = id(4, 2);
const JOB_P = id(4, 3);
const JOB_Q = id(4, 4);
const JOB_NEW = id(4, 5);

const businesses = [[ADMIN, "HireFlow"], [BIZ, "Clinic One"], [NEWBIZ, "New Shop"], [BIZ_E, "Dental Two"], [PBIZ, "Plain Co"], [QBIZ, "Quick Co"], [STRANGER, "Elsewhere"]];
const applicants = [WD, GONE, JOBLESS, REMOVED, ANA, ANA2, ANA3, ANA4, ...R, ...S];
const users = [...businesses.map(([u, name]) => [u, { full_name: `${name} owner`, company_name: name }]), ...applicants.map((u, i) => [u, { full_name: `Applicant ${i + 1}` }])];
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values
    ${users.map(([u, meta]) => `('${u}', '${u.slice(0, 8)}-${u.slice(-4)}@example.test', '${JSON.stringify(meta)}'::jsonb)`).join(",\n    ")};
  insert into public.user_roles (user_id, role) values
    ${businesses.map(([u]) => `('${u}', 'employer')`).join(", ")},
    ${applicants.map((u) => `('${u}', 'candidate')`).join(", ")};
  insert into public.platform_admins (user_id) values ('${ADMIN}');
  update public.profiles set email_verified_at = now(), email_verified_for = email
   where user_id in ('${BIZ}', '${BIZ_E}', '${PBIZ}', '${QBIZ}', '${STRANGER}');
  insert into public.jobs (id, employer_id, title, description, status) values
    ('${JOB}', '${BIZ}', 'Chat support agent', 'Answer patients by chat.', 'published'),
    ('${JOB_GOES}', '${BIZ}', 'Phone support agent', 'Answer the phone.', 'published'),
    ('${JOB_P}', '${PBIZ}', 'Email support agent', 'Answer email.', 'published'),
    ('${JOB_Q}', '${QBIZ}', 'Front desk agent', 'Answer the front desk line.', 'published'),
    ('${JOB_NEW}', '${BIZ}', 'Night chat agent', 'Answer patients by chat at night.', 'published');
`);

const emailOf = (u) => `${u.slice(0, 8)}-${u.slice(-4)}@example.test`;
const ANON = { role: "anon" };
const SERVICE = { role: "service_role" };
const user = (u) => ({ role: "authenticated", id: u });

/** One request as PostgREST makes it: the claims and the role for one transaction. */
async function as(who, sql, params = []) {
  const claims = who.role === "authenticated"
    ? { sub: who.id, role: "authenticated", aud: "authenticated", email: emailOf(who.id), aal: "aal1" }
    : { role: who.role };
  try {
    const rows = await db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true), set_config('role', $2, true)`, [JSON.stringify(claims), who.role]);
      return (await tx.query(sql, params)).rows;
    });
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const show = (r) => JSON.stringify(r).slice(0, 300);
const apply = async (who, job) => {
  const r = await as(user(who), `insert into public.applications (job_id, candidate_id) values ($1, $2) returning id`, [job, who]);
  if (!r.ok) throw new Error(`setup: ${who} could not apply to ${job}: ${r.error}`);
  return r.rows[0].id;
};
const queued = async (application) =>
  (await db.query(`select bucket, folder, starts_with from public.storage_file_trash where application_id = $1 order by bucket`, [application])).rows;
const queuesAll = (rows, application, candidate) =>
  JSON.stringify(rows) ===
  JSON.stringify([
    { bucket: "portfolios", folder: candidate, starts_with: `${application}-` },
    { bucket: "videos", folder: candidate, starts_with: `${application}-` },
    { bucket: "voice-interview-recordings", folder: application, starts_with: "" },
  ]);

// ---------------------------------------------------------------------------
console.log("\n1. A deleted application's files are queued for removal\n");
{
  const app = await apply(WD, JOB);
  const r = await as(user(WD), `delete from public.applications where id = $1 returning id`, [app]);
  check("the applicant withdraws their own application", r.ok && r.rows.length === 1, show(r));
  const rows = await queued(app);
  check("…and its recordings, video introduction and work samples are queued (3 rows)", queuesAll(rows, app, WD), show(rows));

  const goneApp = await apply(GONE, JOB);
  await db.query(`delete from auth.users where id = $1`, [GONE]); // Delete Account: Supabase Auth deletes the user
  const goneRows = await queued(goneApp);
  check("Delete Account (the account's applications go by cascade) queues the same 3", (await one(`select count(*)::int n from public.applications where id = $1`, [goneApp])).n === 0 && queuesAll(goneRows, goneApp, GONE), show(goneRows));

  const joblessApp = await apply(JOBLESS, JOB_GOES);
  const d = await as(user(BIZ), `delete from public.jobs where id = $1 returning id`, [JOB_GOES]);
  const joblessRows = await queued(joblessApp);
  check("the business deletes a job: each of its applications queues the same 3", d.ok && d.rows.length === 1 && queuesAll(joblessRows, joblessApp, JOBLESS), show({ d, joblessRows }));
  check("nobody but the server reads the queue", !(await as(user(WD), `select * from public.storage_file_trash`)).ok || (await as(user(WD), `select * from public.storage_file_trash`)).rows.length === 0);
}

// ---------------------------------------------------------------------------
console.log("\n2. remove_applicant is the server's, for the job's own business\n");
{
  const app = await apply(REMOVED, JOB);
  const call = `select public.remove_applicant($1, $2, 'asked by email') as r`;
  const anon = await as(ANON, call, [app, BIZ]);
  check("a signed-out visitor cannot call it", !anon.ok && /permission denied/.test(anon.error), show(anon));
  const owner = await as(user(BIZ), call, [app, BIZ]);
  check("…nor a signed-in account, the job's owner included (it trusts the actor it is given)", !owner.ok && /permission denied/.test(owner.error), show(owner));
  const stranger = await as(SERVICE, call, [app, STRANGER]);
  check("the server refuses another business as the actor", stranger.ok && stranger.rows[0].r?.reason === "not_allowed", show(stranger));
  const done = await as(SERVICE, call, [app, BIZ]);
  check("the server removes it for the job's owner", done.ok && done.rows[0].r?.ok === true && (await one(`select count(*)::int n from public.applications where id = $1`, [app])).n === 0, show(done));
  const log = await one(`select removed_by, reason from private.applicant_removals where application_id = $1`, [app]);
  check("…logs who removed it and why", log?.removed_by === BIZ && log?.reason === "asked by email", show(log));
  check("…and queues its files", queuesAll(await queued(app), app, REMOVED));
}

// ---------------------------------------------------------------------------
console.log("\n3. The AI budget\n");
{
  const take = (units, business) => as(SERVICE, `select public.ai_budget_take($1, $2) as ok`, [units, business]);
  const usage = async (business) => (await one(`select calls, refused from private.ai_business_daily_usage where business_id = $1 and day = (now() at time zone 'utc')::date`, [business])) ?? { calls: 0, refused: 0 };
  const run = async (business, times) => {
    let allowed = 0;
    for (let i = 0; i < times; i += 1) if ((await take(100, business)).rows?.[0]?.ok === true) allowed += 1;
    return allowed;
  };
  const anon = await as(ANON, `select public.ai_budget_take(1, null)`);
  const signedIn = await as(user(BIZ), `select public.ai_budget_take(1, $1)`, [BIZ]);
  check("only the server takes from the budget", !anon.ok && !signedIn.ok, show({ anon, signedIn }));
  check("a confirmed business gets 2,000 units a day", (await run(BIZ, 20)) === 20, JSON.stringify(await usage(BIZ)));
  const over = await take(100, BIZ);
  check("…and is refused past them", over.ok && over.rows[0].ok === false, show(over));
  check("…a refused call gives its units back (the day stays at 2,000)", JSON.stringify(await usage(BIZ)) === JSON.stringify({ calls: 2000, refused: 1 }), JSON.stringify(await usage(BIZ)));
  check("a business that has not confirmed its email, with nothing live, gets 300", (await run(NEWBIZ, 3)) === 3 && (await take(100, NEWBIZ)).rows?.[0]?.ok === false, JSON.stringify(await usage(NEWBIZ)));
  check("HireFlow's own business has its own 6,000", (await run(ADMIN, 60)) === 60 && (await take(100, ADMIN)).rows?.[0]?.ok === false, JSON.stringify(await usage(ADMIN)));
  // The platform has counted 2,000 + 300 + 6,000; calls for no business fill it to 10,000.
  check("the platform's day is 10,000", (await run(null, 17)) === 17, JSON.stringify(await one(`select calls from private.ai_daily_usage`)));
  const platformSaysNo = await take(100, BIZ_E);
  check("…past it even a business with its own day left is refused", platformSaysNo.ok && platformSaysNo.rows[0].ok === false, show(platformSaysNo));
  check("…and gets its units back", (await usage(BIZ_E)).calls === 0, JSON.stringify(await usage(BIZ_E)));
  check("…as is a call for no business", (await take(1, null)).rows?.[0]?.ok === false);
}

// ---------------------------------------------------------------------------
console.log("\n4. What a browser writes into someone else's bell or inbox\n");
{
  for (const who of [ANA, ANA2, ANA3, ANA4]) await apply(who, JOB);
  const card = (u, values) => as(user(u), `insert into public.notifications (user_id, type, title, message, link, created_at) values ($1, $2, $3, $4, $5, $6)`, values);
  const r = await card(ANA, [BIZ, "system", "HireFlow: your account is suspended " + "x".repeat(500), "y".repeat(2000), "https://evil.example/login", "2099-01-01"]);
  const got = await one(`select type::text, length(title) t, length(message) m, link, created_at < now() + interval '1 minute' as now_ish from public.notifications where user_id = $1 and title like 'HireFlow: your account%'`, [BIZ]);
  check("an applicant's card to the business goes in", r.ok && !!got, show(r));
  check("…its title is cut to 160 characters and its message to 600", got?.t === 160 && got?.m === 600, show(got));
  check("…a link to another site is dropped", got?.link === null, show(got));
  check("…it is never a HireFlow \"system\" card", got?.type === "application", show(got));
  check("…and it carries the database's own time, not the browser's", got?.now_ish === true, show(got));
  for (const [link, kept] of [["/applicants/1", true], ["//evil.example", false], ["/\\evil.example", false], ["javascript:alert(1)", false]]) {
    await card(ANA, [BIZ, "application", `link ${link}`, "m", link, null]);
    const row = await one(`select link from public.notifications where user_id = $1 and title = $2`, [BIZ, `link ${link}`]);
    check(`…a link ${JSON.stringify(link)} is ${kept ? "kept" : "dropped"}`, kept ? row?.link === link : row?.link === null, show(row));
  }
  for (let i = 0; i < 35; i += 1) await card(ANA2, [BIZ, "application", `pair ${i}`, "m", null, null]);
  const pair = await one(`select count(*)::int n from public.notifications where user_id = $1 and title like 'pair %'`, [BIZ]);
  check("30 cards an hour from one account to one person; past that they are quietly not written", pair.n === 30, show(pair));
  const allowed = async (u, kind, recipient) => (await as(user(u), `select public.client_send_allowed($1, $2) as ok`, [kind, recipient])).rows?.[0]?.ok;
  let total = 0;
  for (let p = 0; p < 10; p += 1) for (let i = 0; i < 30; i += 1) if (await allowed(ANA3, "notification", id(9, p))) total += 1;
  check("300 cards an hour in all", total === 300 && (await allowed(ANA3, "notification", id(9, 99))) === false, String(total));
  await card(ANA3, [BIZ, "application", "after the total", "m", null, null]);
  check("…after which the account's next card is not written", !(await one(`select 1 as x from public.notifications where user_id = $1 and title = 'after the total'`, [BIZ])));
  const anonCard = await as(ANON, `insert into public.notifications (user_id, type, title, message) values ($1, 'system', 't', 'm')`, [BIZ]);
  const anonAllowed = await as(ANON, `select public.client_send_allowed('notification', $1)`, [BIZ]);
  check("a signed-out visitor writes no card and cannot spend an allowance", !anonCard.ok && !anonAllowed.ok, show({ anonCard, anonAllowed }));

  const message = (u, content) => as(user(u), `insert into public.messages (sender_id, receiver_id, content) values ($1, $2, $3)`, [u, BIZ, content]);
  const long = await message(ANA, "z".repeat(10001));
  check("a message over 10,000 characters is refused", !long.ok && /message_too_long/.test(long.error), show(long));
  const full = await message(ANA, "z".repeat(10000));
  check("…10,000 goes", full.ok, show(full));
  let sent = 0;
  let refused = "";
  for (let i = 0; i < 121; i += 1) {
    const m = await message(ANA4, `hello ${i}`);
    if (m.ok) sent += 1;
    else refused = m.error;
  }
  check("120 messages an hour to one person, then refused", sent === 120 && /too_many_messages/.test(refused), `${sent} ${refused}`);
  let totalMessages = 0;
  for (let p = 0; p < 5; p += 1) for (let i = 0; i < 120; i += 1) if (await allowed(ANA3, "message", id(9, p))) totalMessages += 1;
  check("600 messages an hour in all", totalMessages === 600 && (await allowed(ANA3, "message", id(9, 98))) === false, String(totalMessages));
  const serverCard = await one(`select count(*)::int n from public.notifications where user_id = $1 and type = 'message'`, [BIZ]);
  check("the server's own bells (a card per message) are not limited by the browser's allowance", serverCard.n >= 121, show(serverCard));
}

// ---------------------------------------------------------------------------
console.log("\n5. Reports pause a business only from people it was in touch with\n");
{
  const status = async (b) => (await one(`select public.business_status_of($1) as s`, [b])).s;
  const jobStatus = async (j) => (await one(`select status::text s from public.jobs where id = $1`, [j])).s;
  const report = (u, job) => as(user(u), `select public.report_employer($1, 'asked_for_money', 'They asked me to pay for training.') as id`, [job]);
  for (const who of R) await apply(who, JOB_P);
  for (const who of S) await apply(who, JOB_Q);
  const reportsBefore = (await one(`select count(*)::int n from public.notifications n join public.platform_admins a on a.user_id = n.user_id where n.title = 'A business was reported 3 times'`)).n;
  const rp = [];
  for (const who of R) rp.push(await report(who, JOB_P));
  check("three people who only applied report a business: each report is taken", rp.every((x) => x.ok && x.rows[0].id), show(rp));
  check("…the business stays open, its job live", (await status(PBIZ)) !== "suspended" && (await jobStatus(JOB_P)) === "published", `${await status(PBIZ)} ${await jobStatus(JOB_P)}`);
  const told = (await one(`select count(*)::int n from public.notifications n join public.platform_admins a on a.user_id = n.user_id where n.title = 'A business was reported 3 times'`)).n;
  check("…and the admins are told once", told === reportsBefore + 1, String(told));

  for (const who of S) {
    const m = await as(user(QBIZ), `insert into public.messages (sender_id, receiver_id, content) values ($1, $2, 'Please send the training fee.')`, [QBIZ, who]);
    if (!m.ok) throw new Error(`setup: QBIZ could not message ${who}: ${m.error}`);
  }
  const contacted = await as(SERVICE, `select public.business_has_contacted($1, $2) as yes, public.business_has_contacted($3, $4) as no`, [QBIZ, S[0], PBIZ, R[0]]);
  check("business_has_contacted: yes for someone the business messaged, no for someone who only applied", contacted.ok && contacted.rows[0].yes === true && contacted.rows[0].no === false, show(contacted));
  const fromClient = await as(user(R[0]), `select public.business_has_contacted($1, $2)`, [PBIZ, R[0]]);
  const fromAnon = await as(ANON, `select public.business_has_contacted($1, $2)`, [PBIZ, R[0]]);
  check("…and only the server may ask it", !fromClient.ok && !fromAnon.ok, show({ fromClient, fromAnon }));
  const sq = [];
  for (const who of S.slice(0, 2)) sq.push(await report(who, JOB_Q));
  check("two reports from people it was in touch with leave it open", sq.every((x) => x.ok) && (await status(QBIZ)) !== "suspended", show(sq));
  const third = await report(S[2], JOB_Q);
  check("the third pauses it and closes its jobs", third.ok && (await status(QBIZ)) === "suspended" && (await jobStatus(JOB_Q)) === "closed", `${show(third)} ${await status(QBIZ)} ${await jobStatus(JOB_Q)}`);
}

// ---------------------------------------------------------------------------
console.log("\n6. Team invite codes\n");
{
  const invite = (code, email) => as(user(BIZ), `insert into public.team_invitations (inviter_id, invitee_email, expires_at, invite_code) values ($1, $2, now() + interval '7 days', $3) returning invite_code`, [BIZ, email, code]);
  const a = await invite("TEAM-AAAAAAAA", "a@team.example");
  const b = await invite(null, "b@team.example");
  const codeA = a.rows?.[0]?.invite_code;
  const codeB = b.rows?.[0]?.invite_code;
  check("a business invites a teammate", a.ok && b.ok, show({ a, b }));
  check("…the code is the server's, never the one the browser sent", codeA && codeA !== "TEAM-AAAAAAAA", String(codeA));
  check("…'TEAM-' and 24 hex characters (96 bits from gen_random_bytes)", /^TEAM-[0-9A-F]{24}$/.test(codeA ?? "") && /^TEAM-[0-9A-F]{24}$/.test(codeB ?? ""), `${codeA} ${codeB}`);
  check("…and no two alike", codeA !== codeB);
}

// ---------------------------------------------------------------------------
console.log("\n7. File paths an applicant stores are plain paths\n");
{
  // The sixth security review: applicant-file-url and requested-document-url
  // sign these with the service key, where "%2e%2e" is a parent step.
  const app = await apply(ANA, JOB_P);
  const NOT_PLAIN = [["a %", `${ANA}/%2e%2e/${BIZ}/cv.pdf`], ["a backslash", `${ANA}/cv\\x.pdf`], ["a control character", `${ANA}/cv\u0001.pdf`]];
  const write = (sql, params) => as(user(ANA), sql, params);
  for (const [what, value] of NOT_PLAIN) {
    const r = await write(`update public.applications set resume_url = $2 where id = $1`, [app, value]);
    check(`the resume link is never a path with ${what}`, !r.ok && /resume_not_own_file/.test(r.error), show(r));
    const f = await write(`update public.applications set notes = $2 where id = $1`, [app, JSON.stringify({ fileUploads: { q1: { url: value, imageUrls: [], isResume: false } } })]);
    check(`…nor a form file with ${what}`, !f.ok && /file_path_not_plain/.test(f.error), show(f));
  }
  const ok = await write(`update public.applications set resume_url = $2, notes = $3 where id = $1`, [app, `${ANA}/1729000000000_q1.pdf`, JSON.stringify({ fileUploads: { q1: { url: `${ANA}/1729000000000_q1.pdf`, imageUrls: [`${ANA}/1729000000001_q1_page1.png`], isResume: true } }, resumeImageUrls: [`${ANA}/1729000000001_q1_page1.png`] })]);
  check("…while ordinary paths in their own folder go in", ok.ok, show(ok));
  const fresh = await as(user(ANA), `insert into public.applications (job_id, candidate_id, resume_url) values ($1, $2, $3) returning resume_url`, [JOB_NEW, ANA, NOT_PLAIN[0][1]]);
  check("a new application drops such a resume link", fresh.ok && fresh.rows[0].resume_url === null, show(fresh));
  const asked = await as(user(PBIZ), `insert into public.document_requests (application_id, employer_id, candidate_id, document_type) values ($1, $2, $3, 'nbi_clearance') returning id`, [app, PBIZ, ANA]);
  check("the business asks the applicant for a paper", asked.ok, show(asked));
  if (asked.ok) {
    const req = asked.rows[0].id;
    for (const [what, value] of NOT_PLAIN) {
      const r = await write(`update public.document_requests set file_url = $2, status = 'submitted' where id = $1`, [req, value.replace("cv", `${req}/id`)]);
      check(`…the file sent is never a path with ${what}`, !r.ok && /request_file_not_yours/.test(r.error), show(r));
    }
    const sentOk = await write(`update public.document_requests set file_url = $2, file_name = 'NBI clearance.jpg', status = 'submitted' where id = $1`, [req, `${ANA}/${req}/id-1.jpg`]);
    check("…while an ordinary path in their own folder goes in", sentOk.ok, show(sentOk));
  }
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
