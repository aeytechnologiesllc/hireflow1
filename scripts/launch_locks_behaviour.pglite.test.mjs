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
 *      withdrawal, Delete Account, a deleted job, and remove_applicant. Never
 *      the profile's own resume, a path in another person's folder or one
 *      stepping out of the applicant's ("..", "%2e%2e"), never one file twice,
 *      and at most 40 a deleted application (the eighth security review).
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
 *      applications an hour with one business (on any of its jobs) and 20 in
 *      all (the eleventh Phase 5 review, in the shape of its flood proof).
 *  10. A deleted request's papers are queued for document-cleanup, a photo
 *      whose link was never saved included (document_requests_trash_file).
 *  11. remove_applicant refuses a teammate assigned elsewhere, no longer
 *      active, not managing applicants, or of another business.
 *  12. ai_budget_take counts a teammate against their business, and tells
 *      the admins at 80% (platform:80) and at 100% (platform:100) apart.
 *  13. A business deletes no application straight through the API, through a
 *      function of its own rights a browser may call, or by moving it to a
 *      throwaway job and deleting that (20261025570000); Delete their
 *      information still does; a deleted document's kept copies are queued
 *      (documents_queue_files), from a cascade or the business's own delete,
 *      found by its id only, never by the file address the business wrote
 *      (the ninth security review).
 *  14. One account's uploads hold up only its own removals: at most 200
 *      exact paths a day for one applicant, and document-cleanup's next run
 *      (storage_file_trash_fair_pick) takes a real withdrawal queued after
 *      one account's flood, or seventy (the eighth security review, in the
 *      shape of its flood proof; 20261025560000).
 *  15. Many accounts cannot keep a real removal out of the run: the trigger
 *      queues no "." part and an exact path only where storage holds exactly
 *      that name; a note that failed comes after every note never tried (a
 *      thousand accounts' failing notes, then a real withdrawal: taken
 *      within two runs); and a real withdrawal's oldest note waits only for
 *      those queued before it (200 accounts queuing a folder each an hour:
 *      one of its folders every run). The ninth security review, in the
 *      shape of its proofs; 20261025580000.
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
const TM_STRANGER = id(6, 5); // active, manages applicants, on every job of ANOTHER business (STRANGER)

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

  // The eighth security review (finding 3): each of the rules below could be
  // dropped from the trigger and every test still passed.
  // The form sets an application's resume_url to the profile's own resume
  // (ApplicationFormPhase.tsx: finalResumeUrl = profile.resume_url); a
  // withdrawal must never queue it.
  const PROF = id(7, 1);
  await makeUser(PROF, "candidate");
  const PROFILE_CV = `${PROF}/1729000000000_profile.pdf`;
  await putFile("resumes", PROFILE_CV);
  await db.query(`update public.profiles set resume_url = $2 where user_id = $1`, [PROF, PROFILE_CV]);
  const profApp = await apply(PROF, JOB);
  const usesProfile = await as(user(PROF), `update public.applications set resume_url = $2 where id = $1`, [profApp, PROFILE_CV]);
  if (!usesProfile.ok) throw new Error(`setup: the profile's resume could not be sent: ${usesProfile.error}`);
  await as(user(PROF), `delete from public.applications where id = $1`, [profApp]);
  check("a withdrawal whose resume is the profile's own queues nothing of it", (await queuedPaths(profApp)).length === 0 && (await one(`select count(*)::int n from public.storage_file_trash where path = $1`, [PROFILE_CV])).n === 0, show(await queuedPaths(profApp)));

  // One file, listed by an application withdrawn and then by a later one
  // (it is still there until document-cleanup runs): one row, not one each.
  const TWICE = id(7, 2);
  await makeUser(TWICE, "candidate");
  const TWICE_CV = `${TWICE}/1729000000000.pdf`;
  await putFile("resumes", TWICE_CV);
  for (const job of [JOB, JOB_P]) {
    const a = await apply(TWICE, job);
    const w = await as(user(TWICE), `update public.applications set resume_url = $2 where id = $1`, [a, TWICE_CV]);
    if (!w.ok) throw new Error(`setup: the resume could not be sent: ${w.error}`);
    await as(user(TWICE), `delete from public.applications where id = $1`, [a]);
  }
  check("one file listed by two deleted applications is queued once", (await one(`select count(*)::int n from public.storage_file_trash where bucket = 'resumes' and path = $1`, [TWICE_CV])).n === 1);

  // 41 files listed: the trigger queues 40 a deleted application.
  const MANY = id(7, 3);
  await makeUser(MANY, "candidate");
  const manyApp = await apply(MANY, JOB);
  const uploads = {};
  for (let k = 0; k < 41; k += 1) {
    const p = `${MANY}/17290000${String(k).padStart(5, "0")}.pdf`;
    await putFile("resumes", p);
    uploads[`q${k}`] = { url: p, imageUrls: [], isResume: false };
  }
  const listed = await as(user(MANY), `update public.applications set notes = $2 where id = $1`, [manyApp, JSON.stringify({ fileUploads: uploads })]);
  if (!listed.ok) throw new Error(`setup: the 41 files could not be listed: ${listed.error}`);
  await as(user(MANY), `delete from public.applications where id = $1`, [manyApp]);
  check("41 files listed by one application: 40 are queued", (await queuedPaths(manyApp)).length === 40, String((await queuedPaths(manyApp)).length));

  // Paths the business wrote into its applicant's notes, then deleted the
  // job: another person's file (their own application still lists it), and
  // two that start in the applicant's folder but step out of it ("..", and
  // "%2e%2e", which a service-key request reads as ".."). Storage refuses
  // such names, so these stand for the worst case: as if it held them.
  const OWNER = id(7, 4);
  const OTHER = id(7, 5);
  for (const u of [OWNER, OTHER]) await makeUser(u, "candidate");
  const OTHER_CV = `${OTHER}/1729000000000.pdf`;
  await putFile("resumes", OTHER_CV);
  const otherApp = await apply(OTHER, JOB_P);
  await as(user(OTHER), `update public.applications set resume_url = $2 where id = $1`, [otherApp, OTHER_CV]);
  const JOB_REWRITTEN = (await one(`insert into public.jobs (employer_id, title, description, status) values ($1, 'Weekend chat agent', 'Answer patients by chat at weekends.', 'published') returning id`, [BIZ])).id;
  const ownerApp = await apply(OWNER, JOB_REWRITTEN);
  const OWN = `${OWNER}/1729000000000.pdf`;
  const DOTS = `${OWNER}/../${OTHER}/1729000000000.pdf`;
  const ENCODED = `${OWNER}/%2e%2e/${OTHER}/1729000000000.pdf`;
  for (const p of [OWN, DOTS, ENCODED]) await putFile("resumes", p);
  const rewritten = await as(user(BIZ), `update public.applications set notes = $2 where id = $1`, [ownerApp, JSON.stringify({ fileUploads: { q1: { url: OWN }, q2: { url: OTHER_CV }, q3: { url: DOTS }, q4: { url: ENCODED } } })]);
  if (!rewritten.ok) throw new Error(`setup: the business could not write the notes: ${rewritten.error}`);
  await as(user(BIZ), `delete from public.jobs where id = $1`, [JOB_REWRITTEN]);
  const rewrittenPaths = await queuedPaths(ownerApp);
  check("a path the business wrote into another person's folder is never queued", !rewrittenPaths.includes(OTHER_CV) && (await one(`select count(*)::int n from public.storage_file_trash where path = $1`, [OTHER_CV])).n === 0, show(rewrittenPaths));
  check("…nor one that steps out of the applicant's folder (\"..\", \"%2e%2e\")", !rewrittenPaths.includes(DOTS) && !rewrittenPaths.includes(ENCODED), show(rewrittenPaths));
  check("…while the applicant's own file goes", JSON.stringify(rewrittenPaths) === JSON.stringify([OWN]), show(rewrittenPaths));
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
    // Another job of the same business counts with the first (the eighth
    // security review: keying the limit by job let ten more through a job).
    const sameBusiness = await as(user(account), `insert into public.applications (job_id, candidate_id) values ($1, $2) returning id`, [JOB, account]);
    if (sameBusiness.ok) await as(user(account), `delete from public.applications where id = $1`, [sameBusiness.rows[0].id]);
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
    return { loops, refusal, sameBusiness: sameBusiness.ok ? "allowed" : sameBusiness.error, more, totalRefusal, sameHour: hour() === startedIn };
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
  check("…on another of that business's jobs too", /too_many_applications/.test(f.sameBusiness), f.sameBusiness);
  const fromFlood = (await one(`select count(*)::int n from public.storage_file_trash where folder in ($1, $2) or path like $3 or path like $4`, [FLOOD, FLOOD_AGAIN, `${FLOOD}/%`, `${FLOOD_AGAIN}/%`])).n;
  check("…and an application started and withdrawn with nothing uploaded queues nothing", fromFlood === 0, String(fromFlood));
  check("…and at most 20 an hour in all, whichever businesses", f.loops + f.more === 20 && /too_many_applications/.test(f.totalRefusal), `${f.loops + f.more} ${f.totalRefusal}`);
  const real2 = await apply(REAL_AFTER, JOB);
  await putStepFiles(real2, REAL_AFTER);
  await as(user(REAL_AFTER), `delete from public.applications where id = $1`, [real2]);
  // What document-cleanup's next run takes (storage_file_trash_fair_pick, as
  // the service role: folders, then exact paths).
  const pick = [];
  let pickError = "";
  for (const exact of [false, true]) {
    const r = await as(SERVICE, `select application_id from public.storage_file_trash_fair_pick($1)`, [exact]);
    if (r.ok) pick.push(...r.rows.map((row) => row.application_id));
    else pickError = r.error;
  }
  check("a real withdrawal before and after it is in document-cleanup's next run", pick.includes(real) && pick.includes(real2), pickError || String((await one(`select count(*)::int n from public.storage_file_trash`)).n));
  const peek = await as(user(FLOOD), `select * from public.storage_file_trash_fair_pick(false)`);
  check("…and only the server takes the queue's next run", !peek.ok && /permission denied/.test(peek.error), show(peek));
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
  // A teammate of another business, active, managing applicants on all its
  // jobs (the eighth security review: no test had one, so a remove_applicant
  // that stopped comparing the business passed).
  await makeUser(TM_STRANGER, "team_member");
  await db.query(`insert into public.team_members (user_id, employer_id, email, status, can_manage_pipeline, assigned_job_ids) values ($1, $2, $3, 'active', true, '{}'::uuid[])`, [TM_STRANGER, STRANGER, emailOf(TM_STRANGER)]);
  const SOMEONE = id(5, 5);
  await makeUser(SOMEONE, "candidate");
  const app = await apply(SOMEONE, JOB);
  const call = (actor) => as(SERVICE, `select public.remove_applicant($1, $2, null) as r`, [app, actor]);
  for (const [actor, who] of [[TM_ELSEWHERE, "a teammate assigned to another job only"], [TM_GONE, "a teammate no longer active"], [TM_VIEW, "a teammate who does not manage applicants"], [TM_STRANGER, "a teammate of another business"]]) {
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
  // Each loop is bounded: a budget that stops counting makes these checks
  // fail, not the test run forever (the eighth security review's A2 ran until
  // CI's per-file timeout).
  for (let i = 0; i < 100 && (await platform()) < 7_900; i += 1) await take(100, null);
  check("no 80% alert below 80% of the platform's day", (await platform()) === 7_900 && !(await alerts()).includes("platform:80") && (await adminTold("80% of today's AI budget is used")) === 0, JSON.stringify({ calls: await platform(), alerts: await alerts() }));
  await take(100, null);
  check("at 8,000 of 10,000 the admins are told 80% is used (platform:80)", (await alerts()).includes("platform:80") && (await adminTold("80% of today's AI budget is used")) === 1, JSON.stringify(await alerts()));
  for (let i = 0; i < 100 && (await platform()) < 10_000; i += 1) await take(100, null);
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
  // Nor through a function of its own rights a browser may call (the eighth
  // security review's P3, a SECURITY DEFINER delete for the job's owner, was
  // caught only by another test's list of functions).
  const doors = (await db.query(`
    select p.oid::regprocedure::text as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
       and p.prosrc ~* 'delete\\s+from\\s+(only\\s+)?("?public"?\\s*\\.\\s*)?"?applications"?([^_a-z0-9]|$)'
     order by 1`)).rows.map((r) => r.fn);
  check("…nor through a function a browser may call that deletes applications with its own rights", doors.length === 0, JSON.stringify(doors));
  const removed = await as(SERVICE, `select public.remove_applicant($1, $2, 'asked in a message') as r`, [app, BIZ]);
  check("…and Delete their information still removes it, logged", removed.ok && removed.rows[0].r?.ok === true && (await one(`select reason from private.applicant_removals where application_id = $1`, [app]))?.reason === "asked in a message", show(removed));

  // The eighth security review (finding 2): another door. Move the
  // application to a throwaway job of the business's own, then delete that
  // job (probes/move2.mjs): the application went by cascade, unlogged, with a
  // document the applicant had signed. An application now stays on its job.
  const MOVED = id(5, 9);
  await makeUser(MOVED, "candidate");
  const movedApp = await apply(MOVED, JOB);
  const draft = await as(user(BIZ), `insert into public.jobs (employer_id, title, description, status) values ($1, 'Temporary', 'x', 'draft') returning id`, [BIZ]);
  if (!draft.ok) throw new Error(`setup: BIZ could not make a draft job: ${draft.error}`);
  const DRAFT = draft.rows[0].id;
  const move = (who) => as(who, `update public.applications set job_id = $2 where id = $1 returning id`, [movedApp, DRAFT]);
  const byOwner = await move(user(BIZ));
  check("the job's owner cannot move an application to another job of theirs", !byOwner.ok && /application_job_fixed/.test(byOwner.error), show(byOwner));
  const byTeammate = await move(user(TM_OK));
  check("…nor a teammate who manages applicants", !byTeammate.ok && /application_job_fixed/.test(byTeammate.error), show(byTeammate));
  const byApplicant = await move(user(MOVED));
  check("…nor the applicant", !byApplicant.ok || byApplicant.rows.length === 0, show(byApplicant));
  const gone = await as(user(BIZ), `delete from public.jobs where id = $1 returning id`, [DRAFT]);
  check("…so deleting that job leaves the application where it was", gone.ok && (await one(`select job_id from public.applications where id = $1`, [movedApp]))?.job_id === JOB, show(gone));
  const other = await as(user(BIZ), `update public.applications set status = 'reviewing' where id = $1 returning id`, [movedApp]);
  check("…while the team still moves it along its own job", other.ok && other.rows.length === 1, show(other));

  // A deleted document's kept copies (documents/<id>/) go with it, however
  // the row goes: here a job the business deletes, with an offer the
  // applicant signed and one never written to storage.
  const SIGNED = id(5, 10);
  await makeUser(SIGNED, "candidate");
  const JOB_DOC = (await one(`insert into public.jobs (employer_id, title, description, status) values ($1, 'Phone agent, evenings', 'Answer the phone in the evening.', 'published') returning id`, [BIZ])).id;
  const signedApp = await apply(SIGNED, JOB_DOC);
  const DOC = "d0000000-0000-4000-8000-000000000001";
  const DOC_EMPTY = "d0000000-0000-4000-8000-000000000002";
  for (const doc of [DOC, DOC_EMPTY]) {
    await db.query(`insert into public.documents (id, application_id, name, file_url, sender_id, recipient_id, status, candidate_signed_at, v1_hash, v2_hash) values ($1, $2, 'Offer', 'data:text/plain;base64,eA==', $3, $4, 'pending', now(), 'v1', 'v2')`, [doc, signedApp, BIZ, SIGNED]);
  }
  await putFile("documents", `documents/${DOC}/original-v1.pdf`);
  // The business deletes a letter not yet signed ("Employers can delete
  // undelivered documents"), straight from its browser: no cascade, so the
  // trigger runs as the business, and only its own rights can write the queue.
  const DOC_UNSIGNED = "d0000000-0000-4000-8000-000000000003";
  await db.query(`insert into public.documents (id, application_id, name, file_url, sender_id, recipient_id, status) values ($1, $2, 'Offer, draft', 'data:text/plain;base64,eA==', $3, $4, 'pending')`, [DOC_UNSIGNED, signedApp, BIZ, SIGNED]);
  await putFile("documents", `documents/${DOC_UNSIGNED}/original-v0.pdf`);
  const unsignedGone = await as(user(BIZ), `delete from public.documents where id = $1 returning id`, [DOC_UNSIGNED]);
  const unsignedRows = (await db.query(`select folder from public.storage_file_trash where bucket = 'documents' and folder = $1`, [`documents/${DOC_UNSIGNED}`])).rows;
  check("a letter the business deletes before it is signed queues its copies too", unsignedGone.ok && unsignedGone.rows.length === 1 && unsignedRows.length === 1, show({ unsignedGone, unsignedRows }));
  // A document's files are found by its id only (documents/<id>/), never by
  // its file address: the business writes that, and it can name another
  // business's upload in the documents bucket (<their uid>/…). The ninth
  // security review: a second trigger queuing the file the address names
  // passed every test, and the next run would have deleted that business's
  // file; only remove-applicant had a proof of this rule.
  const ELSEWHERE_FILE = `${STRANGER}/1729000000000_offer.pdf`;
  await putFile("documents", ELSEWHERE_FILE);
  const DOC_POINTS_ELSEWHERE = "d0000000-0000-4000-8000-000000000004";
  await db.query(`insert into public.documents (id, application_id, name, file_url, sender_id, recipient_id, status) values ($1, $2, 'Offer, theirs', $3, $4, $5, 'pending')`, [DOC_POINTS_ELSEWHERE, signedApp, `https://yqklrkpptnhubsnijqze.supabase.co/storage/v1/object/sign/documents/${ELSEWHERE_FILE}?token=t`, BIZ, SIGNED]);
  await putFile("documents", `documents/${DOC_POINTS_ELSEWHERE}/original-v0.pdf`);
  const pointsGone = await as(user(BIZ), `delete from public.documents where id = $1 returning id`, [DOC_POINTS_ELSEWHERE]);
  const pointsRows = (await db.query(`select bucket, folder, path from public.storage_file_trash where folder = $1 or coalesce(path, '') like $2 or coalesce(folder, '') like $2 order by folder`, [`documents/${DOC_POINTS_ELSEWHERE}`, `%${STRANGER}%`])).rows;
  check("a deleted document whose file address names another business's upload queues only documents/<its own id>/", pointsGone.ok && pointsGone.rows.length === 1 && JSON.stringify(pointsRows) === JSON.stringify([{ bucket: "documents", folder: `documents/${DOC_POINTS_ELSEWHERE}`, path: null }]), show({ pointsGone, pointsRows }));
  const jobGone = await as(user(BIZ), `delete from public.jobs where id = $1 returning id`, [JOB_DOC]);
  const docRows = (await db.query(`select bucket, folder, starts_with, to_jsonb(t) ->> 'candidate_id' as candidate_id from public.storage_file_trash t where bucket = 'documents' and application_id = $1 and folder in ($2, $3) order by folder`, [signedApp, `documents/${DOC}`, `documents/${DOC_EMPTY}`])).rows;
  check("a deleted job takes its documents' kept copies with it: documents/<id>/ is queued", jobGone.ok && JSON.stringify(docRows) === JSON.stringify([{ bucket: "documents", folder: `documents/${DOC}`, starts_with: "", candidate_id: SIGNED }]), show(docRows));
  check("…and a document with nothing in storage queues nothing", !docRows.some((r) => r.folder.includes(DOC_EMPTY)));
  const direct = await db.query(`select count(*)::int n from public.documents where application_id = $1`, [signedApp]);
  check("…(the documents went with the application, by cascade)", direct.rows[0].n === 0);
}

// ---------------------------------------------------------------------------
console.log("\n14. One account's uploads hold up only its own removals\n");
{
  // The eighth security review (finding 1), in the shape of its proof
  // (probes/flood.mjs): a throwaway applicant starts 20 applications in the
  // hour, puts a tiny file in each of the three per-application folders and
  // 40 in its resume folder (the storage rules allow both at any time), lists
  // the 40 in the form and withdraws. That was 860 rows from one account in
  // an hour, while document-cleanup took 200 a run, oldest first, so every
  // real withdrawal after it waited days.
  const jobs = [];
  for (const [biz, n] of [[BIZ, 1], [STRANGER, 2], [BIZ_E, 3]]) {
    jobs.push((await one(`insert into public.jobs (employer_id, title, description, status) values ($1, $2, 'Answer customers by chat.', 'published') returning id`, [biz, `Chat agent ${n}`])).id);
  }
  const hour = () => Math.floor(Date.now() / 3_600_000);
  const floodWithUploads = async (account) => {
    const startedIn = hour();
    let apps = 0;
    let refused = "";
    let fileNo = 0;
    for (const job of jobs) {
      for (let i = 0; i < 10 && !refused; i += 1) {
        const r = await as(user(account), `insert into public.applications (job_id, candidate_id) values ($1, $2) returning id`, [job, account]);
        if (!r.ok) {
          refused = r.error;
          break;
        }
        const app = r.rows[0].id;
        apps += 1;
        await putFile("voice-interview-recordings", `${app}/x.webm`);
        await putFile("videos", `${account}/${app}-x.webm`);
        await putFile("portfolios", `${account}/${app}-x.pdf`);
        const fileUploads = {};
        for (let k = 0; k < 40; k += 1) {
          const p = `${account}/17290000${String(fileNo++).padStart(5, "0")}.pdf`;
          await putFile("resumes", p);
          fileUploads[`q${k}`] = { url: p, imageUrls: [], isResume: false };
        }
        const w = await as(user(account), `update public.applications set notes = $2 where id = $1`, [app, JSON.stringify({ fileUploads })]);
        const d = await as(user(account), `delete from public.applications where id = $1 returning id`, [app]);
        if (!w.ok || !d.ok || d.rows.length !== 1) throw new Error(`setup: the flood could not list or withdraw: ${show({ w, d })}`);
      }
      if (refused) break;
    }
    return { apps, refused, sameHour: hour() === startedIn };
  };
  // The start limit counts in clock hours and the path cap in UTC days: a
  // run that crosses an hour is done again by a fresh account.
  let FL = id(8, 1);
  await makeUser(FL, "candidate");
  let f = await floodWithUploads(FL);
  if (!f.sameHour) {
    FL = id(8, 2);
    await makeUser(FL, "candidate");
    f = await floodWithUploads(FL);
  }
  check("one account starts 20 applications in the hour, each with its uploads, and the 21st is refused", f.apps === 20 && /too_many_applications/.test(f.refused), `${f.apps} ${f.refused}`);
  const mine = await one(`select count(*) filter (where path is null)::int folders, count(*) filter (where path is not null)::int paths from public.storage_file_trash t where to_jsonb(t) ->> 'candidate_id' = $1`, [FL]);
  check("…each withdrawal's three folders are queued (60), past the cap too: never nothing", mine.folders === 60, show(mine));
  check("…but its exact paths stop at 200 for the day, not 800", mine.paths === 200, show(mine));

  // A real withdrawal, after the flood.
  const LATE = id(8, 3);
  await makeUser(LATE, "candidate");
  const late = await apply(LATE, JOB);
  await putStepFiles(late, LATE);
  const LATE_CV = `${LATE}/1729000000000.pdf`;
  await putFile("resumes", LATE_CV);
  await as(user(LATE), `update public.applications set resume_url = $2 where id = $1`, [late, LATE_CV]);
  await as(user(LATE), `delete from public.applications where id = $1`, [late]);
  const oldestFirst = (await db.query(`select application_id from public.storage_file_trash order by attempts asc, queued_at asc limit 200`)).rows.map((r) => r.application_id);
  check("the flood is big enough to matter: 200 a run, oldest first, would not reach the real withdrawal", !oldestFirst.includes(late), String((await one(`select count(*)::int n from public.storage_file_trash`)).n));
  const nextRun = async () => {
    const folders = await as(SERVICE, `select * from public.storage_file_trash_fair_pick(false)`);
    const paths = await as(SERVICE, `select * from public.storage_file_trash_fair_pick(true)`);
    check("the server takes document-cleanup's next run (storage_file_trash_fair_pick)", folders.ok && paths.ok, show({ folders: folders.error, paths: paths.error }));
    return { folders: folders.rows ?? [], paths: paths.rows ?? [] };
  };
  let run = await nextRun();
  check("document-cleanup's next run takes all of the real withdrawal: its three folders and its resume", run.folders.filter((r) => r.application_id === late).length === 3 && JSON.stringify(run.paths.filter((r) => r.application_id === late).map((r) => r.path)) === JSON.stringify([LATE_CV]), show({ folders: run.folders.length, paths: run.paths.length }));
  check("…and at most 6 of the flood's folders and 40 of its exact paths", run.folders.filter((r) => r.candidate_id === FL).length === 6 && run.paths.filter((r) => r.candidate_id === FL).length === 40, show({ folders: run.folders.filter((r) => r.candidate_id === FL).length, paths: run.paths.filter((r) => r.candidate_id === FL).length }));
  check("…at most 200 folders and 1,000 exact paths in all", run.folders.length <= 200 && run.paths.length <= 1000);

  // Seventy such accounts (sign-up is free), as the trigger leaves their
  // notes: seven folders each, all older than the real withdrawal's. Taken
  // oldest first, or one round after another by age alone, the real
  // withdrawal's third folder would fall past the run's 200; the people
  // with the fewest waiting come first in every round.
  const seventy = await as(SERVICE, `
    insert into public.storage_file_trash (bucket, folder, starts_with, application_id, candidate_id, queued_at)
    select 'videos', person::text, app::text || '-', app, person, now() - interval '1 hour'
      from (select gen_random_uuid() as person from generate_series(1, 70)) people,
           lateral (select gen_random_uuid() as app, people.person as p from generate_series(1, 7)) apps`);
  check("seventy accounts' notes are in the queue, each with its person", seventy.ok, show(seventy));
  run = await nextRun();
  check("…and with seventy flooding accounts, the real withdrawal is still all in the next run", run.folders.filter((r) => r.application_id === late).length === 3 && run.folders.length === 200, show({ late: run.folders.filter((r) => r.application_id === late).length, all: run.folders.length }));
}

// ---------------------------------------------------------------------------
console.log("\n15. Many accounts cannot keep a real removal out of the run\n");
{
  // The ninth security review (finding 1), in the shape of its proofs
  // (probes/dotseg.mjs). Sign-up is free, so many throwaway accounts are
  // cheap: (A) a thousand, each with one note document-cleanup refuses every
  // hour ("<uid>/.", which the trigger queued because "<uid>/.x" was in
  // storage), held the front of every exact-path run for good; (B) 200, each
  // withdrawing one application an hour with one file in its videos folder,
  // kept a three-folder withdrawal out of every folder run. The queue starts
  // empty here, so each proof sees only its own notes.
  await db.query(`delete from public.storage_file_trash`);

  // The trigger: a "." part is no plain path, and an exact path is queued
  // only where storage holds a file of exactly that name. Storage refuses a
  // "." part in an upload, so these files stand for the worst case: as if
  // it held them.
  const DOTTY = id(9, 1);
  await makeUser(DOTTY, "candidate");
  const dottyApp = await apply(DOTTY, JOB);
  const DOT = `${DOTTY}/.`;
  const DOT_INSIDE = `${DOTTY}/./1729000000000.pdf`;
  const ONLY_LONGER = `${DOTTY}/1729000000001`; // storage holds "…1729000000001.pdf", not this
  const OWN = `${DOTTY}/1729000000002.pdf`;
  for (const p of [`${DOTTY}/.x`, DOT, DOT_INSIDE, `${ONLY_LONGER}.pdf`, OWN]) await putFile("resumes", p);
  const listed = await as(user(DOTTY), `update public.applications set notes = $2 where id = $1`, [dottyApp, JSON.stringify({ fileUploads: { q1: { url: DOT }, q2: { url: DOT_INSIDE }, q3: { url: ONLY_LONGER }, q4: { url: OWN } } })]);
  if (!listed.ok) throw new Error(`setup: the form's files could not be listed: ${listed.error}`);
  await as(user(DOTTY), `delete from public.applications where id = $1`, [dottyApp]);
  const dottyPaths = await queuedPaths(dottyApp);
  check("a path with a \".\" part is never queued, even where storage holds a file of that name", !dottyPaths.includes(DOT) && !dottyPaths.includes(DOT_INSIDE), show(dottyPaths));
  check("…nor one where storage holds only a longer name that starts with it", !dottyPaths.includes(ONLY_LONGER), show(dottyPaths));
  check("…while the applicant's own file goes", JSON.stringify(dottyPaths) === JSON.stringify([OWN]), show(dottyPaths));
  await db.query(`delete from public.storage_file_trash`);

  /** document-cleanup's run, as its code does it: the pick; a note storage refuses tries again later (attempts + 1); the rest are removed. */
  const runOnce = async (exact, refuses) => {
    const r = await as(SERVICE, `select id, path, folder, application_id, attempts from public.storage_file_trash_fair_pick($1)`, [exact]);
    if (!r.ok) throw new Error(`the pick: ${r.error}`);
    const failedIds = r.rows.filter(refuses).map((n) => n.id);
    const doneIds = r.rows.filter((n) => !refuses(n)).map((n) => n.id);
    if (failedIds.length) await db.query(`update public.storage_file_trash set attempts = attempts + 1, last_tried_at = now() where id = any($1::uuid[])`, [failedIds]);
    if (doneIds.length) await db.query(`delete from public.storage_file_trash where id = any($1::uuid[])`, [doneIds]);
    return r.rows;
  };

  // (A) A thousand accounts' notes that storage refuses every hour, queued
  // before a real withdrawal (as 20261025560000's trigger left "<uid>/." in
  // the queue; document-cleanup now drops such a note, so these stand for
  // any note that keeps failing), then a real withdrawal whose form listed
  // two files: its resume and the resume's page image.
  const failing = await as(SERVICE, `
    insert into public.storage_file_trash (bucket, path, application_id, candidate_id, queued_at)
    select 'resumes', person::text || '/.', gen_random_uuid(), person, now() - interval '1 hour'
      from (select gen_random_uuid() as person from generate_series(1, 1000)) people`);
  check("a thousand accounts each hold one note that keeps failing", failing.ok && (await one(`select count(*)::int n from public.storage_file_trash`)).n === 1000, show(failing));
  const REAL = id(9, 2);
  await makeUser(REAL, "candidate");
  const real = await apply(REAL, JOB);
  const CV = `${REAL}/1729000000000.pdf`;
  const PAGE = `${REAL}/1729000000000_page1.png`;
  for (const p of [CV, PAGE]) await putFile("resumes", p);
  await as(user(REAL), `update public.applications set resume_url = $2, notes = $3 where id = $1`, [real, CV, JSON.stringify({ resumeImageUrls: [PAGE] })]);
  await as(user(REAL), `delete from public.applications where id = $1`, [real]);
  check("the real withdrawal queues its two files, after them", JSON.stringify(await queuedPaths(real)) === JSON.stringify([CV, PAGE].sort()), show(await queuedPaths(real)));
  const refusesDot = (n) => typeof n.path === "string" && n.path.endsWith("/.");
  const exactRuns = [];
  for (let h = 0; h < 2; h += 1) exactRuns.push((await runOnce(true, refusesDot)).filter((n) => n.application_id === real).length);
  check("…and both are taken within two runs: a note that failed comes after every note never tried", exactRuns.reduce((a, b) => a + b, 0) === 2 && (await queuedPaths(real)).length === 0, show(exactRuns));
  check("…while the notes that keep failing are tried again, behind it", (await one(`select count(*)::int n from public.storage_file_trash where attempts >= 1`)).n === 1000);
  await db.query(`delete from public.storage_file_trash`);

  // (B) A real withdrawal (a recording, a video introduction and a work
  // sample), then each hour 200 accounts each withdrawing one application
  // with one file in its videos folder, queued after it.
  const VICTIM = id(9, 3);
  await makeUser(VICTIM, "candidate");
  const victim = await apply(VICTIM, JOB_P);
  await putStepFiles(victim, VICTIM);
  await as(user(VICTIM), `delete from public.applications where id = $1`, [victim]);
  check("a real withdrawal queues its three folders", (await queued(victim)).length === 3, show(await queued(victim)));
  const crowd = Array.from({ length: 200 }, (_, i) => `9b${String(i).padStart(6, "0")}-0000-4000-8000-000000000000`);
  for (const u of crowd) await makeUser(u, "candidate");
  const folderRuns = [];
  for (let h = 0; h < 3; h += 1) {
    for (const [i, u] of crowd.entries()) {
      const r = await as(user(u), `insert into public.applications (job_id, candidate_id) values ($1, $2) returning id`, [[JOB, JOB_P, JOB_NEW][(i + h) % 3], u]);
      if (!r.ok) throw new Error(`setup: hour ${h}, account ${i} could not apply: ${r.error}`);
      await putFile("videos", `${u}/${r.rows[0].id}-x.webm`);
      await as(user(u), `delete from public.applications where id = $1`, [r.rows[0].id]);
    }
    const picked = await runOnce(false, () => false);
    folderRuns.push({ picked: picked.length, victim: picked.filter((n) => n.application_id === victim).length });
  }
  check("200 accounts queuing one folder each an hour fill every run", folderRuns.every((x) => x.picked === 200), show(folderRuns));
  check("…yet the real withdrawal gets a folder in every run, all three within three runs", folderRuns.every((x) => x.victim >= 1) && (await queued(victim)).length === 0, show(folderRuns));
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
