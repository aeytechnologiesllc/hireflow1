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
 *      work samples in storage_file_trash (3 rows, each where storage holds a
 *      file) and the files sent with its form: the applicant's own
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
 *   8. A new application starts clean.
 *   9. One account cannot flood the file queue: an application queues only
 *      the files storage holds, and one account starts at most 10
 *      applications an hour with one business and 20 in all (the eleventh
 *      Phase 5 review, in the shape of its flood proof).
 *  10. A deleted request's papers are queued for document-cleanup, a photo
 *      whose link was never saved included (document_requests_trash_file).
 *  11. remove_applicant refuses a teammate assigned elsewhere, no longer
 *      active, or not managing applicants.
 *  12. ai_budget_take counts a teammate against their business, and tells
 *      the admins at 80% (platform:80) and at 100% (platform:100) apart.
 *  13. A business deletes no application straight through the API; Delete
 *      their information still does (20261025550000).
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
// BIZ's team (sections 11 to 13).
const TM_OK = id(6, 1); // active, manages applicants, on every job
const TM_ELSEWHERE = id(6, 2); // active, manages applicants, assigned to JOB_NEW only
const TM_GONE = id(6, 3); // manages applicants, no longer active
const TM_VIEW = id(6, 4); // active, on every job, does not manage applicants

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
const show = (r) => String(JSON.stringify(r) ?? r).slice(0, 300);
const apply = async (who, job) => {
  const r = await as(user(who), `insert into public.applications (job_id, candidate_id) values ($1, $2) returning id`, [job, who]);
  if (!r.ok) throw new Error(`setup: ${who} could not apply to ${job}: ${r.error}`);
  return r.rows[0].id;
};
const queued = async (application) =>
  (await db.query(`select bucket, folder, starts_with from public.storage_file_trash where application_id = $1 and path is null order by bucket`, [application])).rows;
const queuedPaths = async (application) =>
  (await db.query(`select path from public.storage_file_trash where application_id = $1 and path is not null order by path`, [application])).rows.map((r) => r.path);
const queuesAll = (rows, application, candidate) =>
  JSON.stringify(rows) ===
  JSON.stringify([
    { bucket: "portfolios", folder: candidate, starts_with: `${application}-` },
    { bucket: "videos", folder: candidate, starts_with: `${application}-` },
    { bucket: "voice-interview-recordings", folder: application, starts_with: "" },
  ]);
/** A file in storage, as Storage records an upload (storage.objects). */
const putFile = async (bucket, name) => {
  await db.query(`insert into storage.buckets (id, name) values ($1, $1) on conflict (id) do nothing`, [bucket]);
  await db.query(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, name]);
};
/** What a real application has by the time it is withdrawn: a recording, a video introduction and a work sample. */
const putStepFiles = async (application, candidate) => {
  await putFile("voice-interview-recordings", `${application}/interview-1.webm`);
  await putFile("videos", `${candidate}/${application}-intro.webm`);
  await putFile("portfolios", `${candidate}/${application}-sample.pdf`);
};
/** A new account, as Supabase Auth makes one (its trigger makes the profile). */
const makeUser = async (u, role, meta = { full_name: "Someone" }) => {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)`, [u, `${u.slice(0, 8)}-${u.slice(-4)}@example.test`, JSON.stringify(meta)]);
  await db.query(`insert into public.user_roles (user_id, role) values ($1, $2)`, [u, role]);
};

// ---------------------------------------------------------------------------
console.log("\n1. A deleted application's files are queued for removal\n");
{
  const app = await apply(WD, JOB);
  await putStepFiles(app, WD);
  // The form's files (resumes/<applicant>/<time>…, ApplicationFormPhase.tsx),
  // one of them also listed by another application of theirs, one listed but
  // never uploaded (the eleventh Phase 5 review, finding 4).
  const other = await apply(WD, JOB_P);
  const SHARED = `${WD}/1729000000009_cv.pdf`;
  await putFile("resumes", SHARED);
  const otherOk = await as(user(WD), `update public.applications set resume_url = $2 where id = $1`, [other, SHARED]);
  const FORM = [`${WD}/1729000000000.pdf`, `${WD}/1729000000001_page1.png`, `${WD}/1729000000002_q1.pdf`, `${WD}/1729000000003_q1_page1.png`];
  for (const f of FORM) await putFile("resumes", f);
  const NEVER_UPLOADED = `${WD}/1729000000004_q2.pdf`;
  const formOk = await as(user(WD), `update public.applications set resume_url = $2, notes = $3 where id = $1`, [app, FORM[0], JSON.stringify({
    resumeImageUrls: [FORM[1]],
    fileUploads: { q1: { url: FORM[2], imageUrls: [FORM[3]], isResume: false }, q2: { fileUrl: NEVER_UPLOADED, isResume: false }, q3: { url: SHARED, isResume: true } },
  })]);
  if (!otherOk.ok || !formOk.ok) throw new Error(`setup: the form's files could not be written: ${show({ otherOk, formOk })}`);
  const r = await as(user(WD), `delete from public.applications where id = $1 returning id`, [app]);
  check("the applicant withdraws their own application", r.ok && r.rows.length === 1, show(r));
  const rows = await queued(app);
  check("…and its recordings, video introduction and work samples are queued (3 rows)", queuesAll(rows, app, WD), show(rows));
  const paths = await queuedPaths(app);
  check("…and the files sent with the form: the resume, the form's file and their page images", JSON.stringify(paths) === JSON.stringify([...FORM].sort()), show(paths));
  check("…never a file another application of theirs still lists, nor one never uploaded", !paths.includes(SHARED) && !paths.includes(NEVER_UPLOADED), show(paths));

  const bare = await apply(WD, JOB_NEW);
  await as(user(WD), `delete from public.applications where id = $1`, [bare]);
  check("a form withdrawn with nothing uploaded queues nothing (the eleventh Phase 5 review)", (await queued(bare)).length === 0 && (await queuedPaths(bare)).length === 0, show(await queued(bare)));

  const goneApp = await apply(GONE, JOB);
  await putStepFiles(goneApp, GONE);
  await db.query(`delete from auth.users where id = $1`, [GONE]); // Delete Account: Supabase Auth deletes the user
  const goneRows = await queued(goneApp);
  check("Delete Account (the account's applications go by cascade) queues the same 3", (await one(`select count(*)::int n from public.applications where id = $1`, [goneApp])).n === 0 && queuesAll(goneRows, goneApp, GONE), show(goneRows));

  const joblessApp = await apply(JOBLESS, JOB_GOES);
  await putStepFiles(joblessApp, JOBLESS);
  const CV = `${JOBLESS}/1729000000000.pdf`;
  await putFile("resumes", CV);
  await as(user(JOBLESS), `update public.applications set resume_url = $2 where id = $1`, [joblessApp, CV]);
  const d = await as(user(BIZ), `delete from public.jobs where id = $1 returning id`, [JOB_GOES]);
  const joblessRows = await queued(joblessApp);
  check("the business deletes a job: each of its applications queues the same 3", d.ok && d.rows.length === 1 && queuesAll(joblessRows, joblessApp, JOBLESS), show({ d, joblessRows }));
  check("…and the resume sent with it", JSON.stringify(await queuedPaths(joblessApp)) === JSON.stringify([CV]), show(await queuedPaths(joblessApp)));
  check("nobody but the server reads the queue", !(await as(user(WD), `select * from public.storage_file_trash`)).ok || (await as(user(WD), `select * from public.storage_file_trash`)).rows.length === 0);
}

// ---------------------------------------------------------------------------
console.log("\n2. remove_applicant is the server's, for the job's own business\n");
{
  const app = await apply(REMOVED, JOB);
  await putStepFiles(app, REMOVED);
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
    // Every shape the form stores a path in, not only fileUploads' url (the
    // seventh security review: the other three were never written).
    for (const [shape, notes] of [
      ["a form file's fileUrl", { fileUploads: { q1: { fileUrl: value, isResume: false } } }],
      ["a form file's page images", { fileUploads: { q1: { url: `${ANA}/ok.pdf`, imageUrls: [value], isResume: false } } }],
      ["the resume's page images", { resumeImageUrls: [value] }],
    ]) {
      const g = await write(`update public.applications set notes = $2 where id = $1`, [app, JSON.stringify(notes)]);
      check(`…nor ${shape} with ${what}`, !g.ok && /file_path_not_plain/.test(g.error), show(g));
    }
  }
  // A plain path, but in someone else's folder (the seventh security review:
  // turning the rule's OR into AND dropped this and nothing noticed).
  for (const other of [`${BIZ}/cv.pdf`, `${ANA2}/cv.pdf`, `cv.pdf`]) {
    const r = await write(`update public.applications set resume_url = $2 where id = $1`, [app, other]);
    check(`the resume link is never a file outside their own folder (${other.split("/")[0].slice(0, 8)}…)`, !r.ok && /resume_not_own_file/.test(r.error), show(r));
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

// ---------------------------------------------------------------------------
console.log("\n8. A new application starts clean\n");
{
  // The seventh security review: applications_insert_starts_clean was proved
  // only by a test that loads its own migration, so a later rewrite without
  // its resets passed everything. The plain-path rule above checks paths
  // only on update, and relies on this.
  const forged = await as(user(ANA2), `insert into public.applications (job_id, candidate_id, status, phase, notes, voice_interview_result, source, external_provider) values ($1, $2, 'offered', 'offer', $3, $4, 'indeed', 'indeed') returning id`, [JOB_NEW, ANA2, JSON.stringify({ quizResult: { score: 100, passed: true }, chatSimulationResult: { score: 100 }, fileUploads: { q1: { url: `${ANA2}/%2e%2e/${BIZ}/x.pdf` } } }), JSON.stringify({ score: 100 })]);
  check("an applicant's own insert goes in", forged.ok, show(forged));
  if (forged.ok) {
    const row = await one(`select status, phase, notes, voice_interview_result, source, external_provider from public.applications where id = $1`, [forged.rows[0].id]);
    check("…as in progress, at the application, with no notes, no voice result and HireFlow as its source", row.status === "in_progress" && row.phase === "application" && row.notes === null && row.voice_interview_result === null && row.source === "hireflow" && row.external_provider === null, show(row));
    const ev = await one(`select ai_score, ai_analysis, ai_scorecard, employer_notes from public.application_evaluations where application_id = $1`, [forged.rows[0].id]);
    check("…and nothing for the hiring team's evaluation", !ev || (ev.ai_score === null && ev.ai_analysis === null && ev.ai_scorecard === null && ev.employer_notes === null), show(ev));
  }
  const scored = await as(user(ANA3), `insert into public.applications (job_id, candidate_id, ai_score, employer_notes) values ($1, $2, 99, 'hire them') returning id`, [JOB_NEW, ANA3]);
  if (scored.ok) {
    const ev = await one(`select ai_score, employer_notes from public.application_evaluations where application_id = $1`, [scored.rows[0].id]);
    check("an applicant's own score and team note never land", !ev || (ev.ai_score === null && ev.employer_notes === null), show(ev));
  } else {
    check("an applicant's own score and team note never land (refused outright)", /permission denied|not allowed|protect/i.test(scored.error), show(scored));
  }
}

// ---------------------------------------------------------------------------
console.log("\n9. One account cannot flood the file queue\n");
{
  // The eleventh Phase 5 review (finding 1), in the shape of its proof
  // (mut/flood.mjs): a throwaway applicant loops "start an application,
  // withdraw it". Every loop queued three rows (906 in 2.6 seconds), and a
  // real withdrawal after the loop was not in document-cleanup's next 200.
  const REAL = id(5, 2);
  const REAL_AFTER = id(5, 3);
  const FLOOD = id(5, 1);
  for (const u of [REAL, REAL_AFTER, FLOOD]) await makeUser(u, "candidate");
  const real = await apply(REAL, JOB);
  await putStepFiles(real, REAL);
  await as(user(REAL), `delete from public.applications where id = $1`, [real]);
  const elsewhere = [];
  for (const [biz, title] of [[STRANGER, "Help desk agent"], [BIZ_E, "Dental front desk"]]) {
    elsewhere.push((await one(`insert into public.jobs (employer_id, title, description, status) values ($1, $2, 'Answer the phone.', 'published') returning id`, [biz, title])).id);
  }
  const hour = () => Math.floor(Date.now() / 3_600_000);
  /** The review's loop on one business's job, then on three businesses' jobs. */
  const floodFrom = async (account) => {
    const startedIn = hour();
    let loops = 0;
    let refusal = "";
    for (let i = 0; i < 300; i += 1) {
      const r = await as(user(account), `insert into public.applications (job_id, candidate_id) values ($1, $2) returning id`, [JOB_NEW, account]);
      if (!r.ok) {
        refusal = r.error;
        break;
      }
      const d = await as(user(account), `delete from public.applications where id = $1 returning id`, [r.rows[0].id]);
      if (!d.ok || d.rows.length !== 1) {
        refusal = `delete: ${d.error ?? "refused"}`;
        break;
      }
      loops += 1;
    }
    let more = 0;
    let totalRefusal = "";
    for (const job of [JOB_P, ...elsewhere]) {
      for (let i = 0; i < 10 && !totalRefusal; i += 1) {
        const r = await as(user(account), `insert into public.applications (job_id, candidate_id) values ($1, $2) returning id`, [job, account]);
        if (!r.ok) totalRefusal = r.error;
        else {
          more += 1;
          await as(user(account), `delete from public.applications where id = $1`, [r.rows[0].id]);
        }
      }
    }
    return { loops, refusal, more, totalRefusal, sameHour: hour() === startedIn };
  };
  // The limit counts in clock hours: a run that crosses one is done again by
  // a fresh account.
  const FLOOD_AGAIN = id(5, 8);
  let f = await floodFrom(FLOOD);
  if (!f.sameHour) {
    await makeUser(FLOOD_AGAIN, "candidate");
    f = await floodFrom(FLOOD_AGAIN);
  }
  check("one account starts at most 10 applications an hour with one business, then is refused", f.loops === 10 && /too_many_applications/.test(f.refusal), `${f.loops} ${f.refusal}`);
  const fromFlood = (await one(`select count(*)::int n from public.storage_file_trash where folder in ($1, $2) or path like $3 or path like $4`, [FLOOD, FLOOD_AGAIN, `${FLOOD}/%`, `${FLOOD_AGAIN}/%`])).n;
  check("…and an application started and withdrawn with nothing uploaded queues nothing", fromFlood === 0, String(fromFlood));
  check("…and at most 20 an hour in all, whichever businesses", f.loops + f.more === 20 && /too_many_applications/.test(f.totalRefusal), `${f.loops + f.more} ${f.totalRefusal}`);
  const real2 = await apply(REAL_AFTER, JOB);
  await putStepFiles(real2, REAL_AFTER);
  await as(user(REAL_AFTER), `delete from public.applications where id = $1`, [real2]);
  // document-cleanup reads 200 a run, fewest attempts first, oldest first.
  const pick = (await db.query(`select application_id from public.storage_file_trash order by attempts asc, queued_at asc limit 200`)).rows.map((r) => r.application_id);
  check("a real withdrawal before and after it is in document-cleanup's next run", pick.includes(real) && pick.includes(real2), String((await one(`select count(*)::int n from public.storage_file_trash`)).n));
  const server = await as(SERVICE, `insert into public.applications (job_id, candidate_id) values ($1, $2) returning id`, [JOB_NEW, FLOOD]);
  check("the server's own insert is not counted against the account", server.ok, show(server));
}

// ---------------------------------------------------------------------------
console.log("\n10. The papers of a deleted request are queued for removal\n");
{
  // document_requests_trash_file carries the Privacy Policy's 24-hour /
  // 7-day promise once the application is gone (the eleventh Phase 5 review,
  // finding 2: nothing proved it).
  const PAPERS = id(5, 4);
  await makeUser(PAPERS, "candidate");
  const app = await apply(PAPERS, JOB);
  const ask = async (type) => {
    const r = await as(user(BIZ), `insert into public.document_requests (application_id, employer_id, candidate_id, document_type) values ($1, $2, $3, $4) returning id`, [app, BIZ, PAPERS, type]);
    if (!r.ok) throw new Error(`setup: BIZ could not ask for ${type}: ${r.error}`);
    return r.rows[0].id;
  };
  const sent = await ask("government_id");
  const neverSaved = await ask("nbi_clearance");
  const nothing = await ask("proof_of_address");
  const file = `${PAPERS}/${sent}/1729000000000.jpg`;
  await putFile("requested-documents", file);
  const up = await as(user(PAPERS), `update public.document_requests set file_url = $2, file_name = 'ID.jpg', status = 'submitted' where id = $1`, [sent, file]);
  if (!up.ok) throw new Error(`setup: the paper could not be sent: ${up.error}`);
  // A photo that went up whose link was never saved (finding 7).
  await putFile("requested-documents", `${PAPERS}/${neverSaved}/1729000000001.jpg`);
  const w = await as(user(PAPERS), `delete from public.applications where id = $1 returning id`, [app]);
  check("the applicant withdraws an application with papers sent", w.ok && w.rows.length === 1, show(w));
  const trash = async (request) => (await db.query(`select candidate_id, file_url from public.document_file_trash where request_id = $1`, [request])).rows;
  const t = await trash(sent);
  check("…the sent paper's file is queued for document-cleanup", t.length === 1 && t[0].candidate_id === PAPERS && t[0].file_url === file, show(t));
  check("…and so is the folder of a photo whose link was never saved", (await trash(neverSaved)).length === 1, show(await trash(neverSaved)));
  check("…while a request with nothing sent and nothing in storage queues nothing", (await trash(nothing)).length === 0, show(await trash(nothing)));
  const peek = await as(user(PAPERS), `select * from public.document_file_trash`);
  check("nobody but the server reads that queue", !peek.ok || peek.rows.length === 0, show(peek));
}

// ---------------------------------------------------------------------------
console.log("\n11. remove_applicant: a teammate only on the jobs they work on\n");
{
  // The eleventh Phase 5 review (finding 2): the behaviour test checked only
  // the owner and a stranger, so a teammate limited to one job, or one whose
  // access was taken away, could have deleted applicants on every job.
  const team = [[TM_OK, "active", true, []], [TM_ELSEWHERE, "active", true, [JOB_NEW]], [TM_GONE, "revoked", true, []], [TM_VIEW, "active", false, []]];
  for (const [u, status, manages, jobs] of team) {
    await makeUser(u, "team_member");
    await db.query(`insert into public.team_members (user_id, employer_id, email, status, can_manage_pipeline, assigned_job_ids) values ($1, $2, $3, $4, $5, $6::uuid[])`, [u, BIZ, emailOf(u), status, manages, jobs]);
  }
  const SOMEONE = id(5, 5);
  await makeUser(SOMEONE, "candidate");
  const app = await apply(SOMEONE, JOB);
  const call = (actor) => as(SERVICE, `select public.remove_applicant($1, $2, null) as r`, [app, actor]);
  for (const [actor, who] of [[TM_ELSEWHERE, "a teammate assigned to another job only"], [TM_GONE, "a teammate no longer active"], [TM_VIEW, "a teammate who does not manage applicants"]]) {
    const r = await call(actor);
    check(`refused for ${who}`, r.ok && r.rows[0].r?.reason === "not_allowed" && (await one(`select count(*)::int n from public.applications where id = $1`, [app])).n === 1, show(r));
  }
  const ok = await call(TM_OK);
  check("removed for an active teammate who manages applicants on every job", ok.ok && ok.rows[0].r?.ok === true, show(ok));
  check("…and logged as theirs", (await one(`select removed_by from private.applicant_removals where application_id = $1`, [app]))?.removed_by === TM_OK);
  const ASSIGNED = id(5, 7);
  await makeUser(ASSIGNED, "candidate");
  const onTheirJob = await apply(ASSIGNED, JOB_NEW);
  const theirs = await as(SERVICE, `select public.remove_applicant($1, $2, null) as r`, [onTheirJob, TM_ELSEWHERE]);
  check("a teammate assigned to a job removes an applicant to that job", theirs.ok && theirs.rows[0].r?.ok === true, show(theirs));
}

// ---------------------------------------------------------------------------
console.log("\n12. The AI budget: a teammate counts for their business; the 80% and 100% alerts\n");
{
  // The eleventh Phase 5 review (finding 2): giving each teammate a day of
  // their own, keying the 100% alert like the 80% one (so it never came on a
  // day the 80% one had), or moving 80% to 99% passed everything. Section 3
  // used up today's day; it starts again here.
  await db.exec(`
    delete from private.ai_daily_usage;
    delete from private.ai_business_daily_usage;
    delete from private.ai_budget_alerts;
    delete from public.notifications where user_id = '${ADMIN}' and type = 'system';
  `);
  const take = (units, business) => as(SERVICE, `select public.ai_budget_take($1, $2) as ok`, [units, business]);
  const usage = async (business) => (await one(`select calls from private.ai_business_daily_usage where business_id = $1 and day = (now() at time zone 'utc')::date`, [business]))?.calls ?? 0;
  const platform = async () => (await one(`select calls from private.ai_daily_usage where day = (now() at time zone 'utc')::date`))?.calls ?? 0;
  const alerts = async () => (await db.query(`select alert from private.ai_budget_alerts order by alert`)).rows.map((r) => r.alert);
  const adminTold = async (title) => (await one(`select count(*)::int n from public.notifications where user_id = $1 and type = 'system' and title = $2`, [ADMIN, title])).n;

  const first = await take(100, TM_OK);
  check("a teammate's call counts against their business's day, not a day of their own", first.ok && first.rows[0].ok === true && (await usage(BIZ)) === 100 && (await usage(TM_OK)) === 0, JSON.stringify({ biz: await usage(BIZ), tm: await usage(TM_OK) }));
  await take(100, TM_GONE);
  check("…a teammate no longer active is not counted as the business", (await usage(BIZ)) === 100, String(await usage(BIZ)));
  let allowed = 1;
  for (let i = 0; i < 19; i += 1) if ((await take(100, TM_OK)).rows?.[0]?.ok === true) allowed += 1;
  const past = await take(100, TM_OK);
  check("…so the teammate stops where the business's 2,000 stop", allowed === 20 && past.ok && past.rows[0].ok === false, `${allowed} ${show(past)}`);
  check("…and the alert names the business (business:<id>), not the teammate", (await alerts()).includes(`business:${BIZ}`) && !(await alerts()).some((a) => a.includes(TM_OK)), JSON.stringify(await alerts()));

  // The platform has 2,000 + 100 (the former teammate's own day) counted.
  while ((await platform()) < 7_900) await take(100, null);
  check("no 80% alert below 80% of the platform's day", (await platform()) === 7_900 && !(await alerts()).includes("platform:80") && (await adminTold("80% of today's AI budget is used")) === 0, JSON.stringify({ calls: await platform(), alerts: await alerts() }));
  await take(100, null);
  check("at 8,000 of 10,000 the admins are told 80% is used (platform:80)", (await alerts()).includes("platform:80") && (await adminTold("80% of today's AI budget is used")) === 1, JSON.stringify(await alerts()));
  while ((await platform()) < 10_000) await take(100, null);
  check("…once on the way to 10,000", (await adminTold("80% of today's AI budget is used")) === 1);
  const refused = await take(100, null);
  check("past 10,000 the call is refused", refused.ok && refused.rows[0].ok === false, show(refused));
  check("…and the admins are told the day is used up, under its own key (platform:100), on a day the 80% one already came", (await alerts()).includes("platform:100") && (await adminTold("The daily AI budget is used up")) === 1, JSON.stringify(await alerts()));
  await take(100, null);
  check("…once", (await adminTold("The daily AI budget is used up")) === 1);
}

// ---------------------------------------------------------------------------
console.log("\n13. A business removes an application only through Delete their information\n");
{
  // The eleventh Phase 5 review (finding 3): "Employers can delete
  // applications to their jobs" and its team twin let the owner or a teammate
  // delete one straight through the API, skipping remove_applicant (no log,
  // signed copies and form files left with nothing pointing at them).
  const DIRECT = id(5, 6);
  await makeUser(DIRECT, "candidate");
  const app = await apply(DIRECT, JOB);
  const owner = await as(user(BIZ), `delete from public.applications where id = $1 returning id`, [app]);
  check("the job's owner deletes nothing straight through the API", owner.ok && owner.rows.length === 0, show(owner));
  const teammate = await as(user(TM_OK), `delete from public.applications where id = $1 returning id`, [app]);
  check("…nor a teammate who manages applicants", teammate.ok && teammate.rows.length === 0, show(teammate));
  check("…the application is still there", (await one(`select count(*)::int n from public.applications where id = $1`, [app])).n === 1);
  const policies = (await db.query(`select policyname from pg_policies where schemaname = 'public' and tablename = 'applications' and cmd = 'DELETE' order by policyname`)).rows.map((r) => r.policyname);
  check("…the only delete rule left on applications is the applicant's own withdrawal", JSON.stringify(policies) === JSON.stringify(["Candidates can delete their own applications"]), JSON.stringify(policies));
  const removed = await as(SERVICE, `select public.remove_applicant($1, $2, 'asked in a message') as r`, [app, BIZ]);
  check("…and Delete their information still removes it, logged", removed.ok && removed.rows[0].r?.ok === true && (await one(`select reason from private.applicant_removals where application_id = $1`, [app]))?.reason === "asked in a message", show(removed));
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
