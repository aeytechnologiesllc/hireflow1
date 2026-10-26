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
 *      that name; a note that failed waits behind every note that is due (a
 *      thousand accounts' failing notes, then a real withdrawal: taken
 *      within two runs); and a real withdrawal's oldest note waits only for
 *      those queued before it (200 accounts queuing a folder each an hour:
 *      all three of its folders within three runs). The ninth security
 *      review, in the shape of its proofs; 20261025580000. And people take
 *      turns: each run records whom it took, so 200 accounts' burst of 30
 *      folders an hour each, queued before a real withdrawal (for one hour or
 *      three, or going on), gives it a folder within two runs and all three
 *      within four (ranked by age it waited 30 runs for every hour of
 *      burst); 200 fresh accounts every hour, one a run; a real folder
 *      storage refused once is taken again within four runs while a flood
 *      goes on; folders and exact paths keep their own turns; the record is
 *      pruned only once its person holds nothing, and no browser may touch
 *      it. The tenth security
 *      review, in the shape of its proof; 20261025590000. And a withdrawal
 *      goes together: a person's turn is all of their notes when they hold
 *      no more than one withdrawal's worth (3 folders, 6 exact paths), taken
 *      whole or not at all. 200 new accounts an hour with 30 folders each
 *      from an hour before it, or 1,000 with one each after it, leave a real
 *      withdrawal all in one run within two (one note a turn, its last folder
 *      waited 11 and 31 runs); 1,000 new accounts an hour with one withdrawal
 *      each, from an hour before, all in the run that ends the thousand
 *      queued before it; accounts holding four folders still give one a
 *      turn; a turn that would cross the run's 200 goes whole in the next;
 *      exact paths the same, six to a turn. The eleventh security review, in
 *      the shape of its proof; 20261025600000.
 *  16. One business cannot keep other people's ID papers in storage (the
 *      twelfth Phase 5 review, in the shape of its proof,
 *      probes/trash_flood.mjs; 20261025610000): at most 50 requests on one
 *      application and 300 an hour for a business; an applicant links only
 *      their own upload for that request, so a deleted request queues only
 *      what storage holds, naming the business that asked; after one
 *      business's 5,000 or 20,000 deleted requests a real ID removed through
 *      Delete their information goes in document-cleanup's first run
 *      (document_file_trash_fair_pick), within two after 300 businesses'; a
 *      note that failed waits out a back-off; the ID papers still open that
 *      are due are taken the same way (document_requests_due_pick), only the
 *      three ID kinds and only after 24 hours or 7 days; nothing of it is a
 *      browser's.
 *  17. What a removal or a withdrawal keeps and takes, after every
 *      migration (the twelfth Phase 5 review, finding 2: these weakenings
 *      passed every test): remove_applicant keeps the profile's resume and a
 *      file another application lists, takes the block with this business
 *      only; a paper named under "Something else" goes with its application;
 *      an applicant withdraws only while nobody has decided and nothing is
 *      signed.
 *  18. A run reads a run's worth, however big the queues grow (the twelfth
 *      security review, finding 1, in the shape of its proof: ranking the
 *      whole removal queue, the pick passed the API's 8-second timeout at
 *      about 700,000 notes; 20261025620000, 20261025630000): each queue's
 *      turns (storage_file_trash_turns, document_file_trash_turns,
 *      document_requests_due_turns) are the queue as it stands after every
 *      kind of write, the server's run included, and nobody else may write
 *      them; each of the four picks at ten times the queue takes less than
 *      twice as long (the old ones about ten times).
 *  19. Who may move an ID paper's clock, and which file a request may point
 *      to, after every migration (the thirteenth Phase 5 review, finding 1:
 *      its weakenings K1 to K9 of the two guards passed every test): no
 *      client changes when the team first opened it, when it was sent or
 *      asked for, that its file was deleted, whom it is for or what was
 *      asked; the hiring side never changes the file or the answer; a new
 *      file starts its own clock; a new request starts empty, unopened, for
 *      its application's applicant; another business cannot point a request
 *      at a first business's copy of an ID (probes p2 and p3), and
 *      requested-document-url signs only a file in its request's own folder.
 *  20. A paper sent again, or taken back: the database queues the earlier
 *      file for document-cleanup (the thirteenth Phase 5 review, finding 2;
 *      20261025640000), only where storage holds it, naming its business, at
 *      most 50 a day for one applicant; never from the hiring side or the
 *      server.
 *  21. An ID photo an open request never linked (its link save and the
 *      dialog's removal both failed) is queued seven days after the request
 *      was asked for, each request looked at once, 5,000 a run, only the ID
 *      kinds, never while storage cannot be read (the thirteenth Phase 5
 *      review's finding 2, asked of the twelfth security round;
 *      20261025630000).
 *  22. Contact counts as it was made, whatever the business deletes since
 *      (the fourteenth Phase 5 review, finding 1, in the shape of its probe
 *      p2; 20261025670000): messages deleted through the API, requests
 *      cancelled, interviews deleted, the applicants removed with Delete
 *      their information, a document deleted, a teammate taken off the team
 *      and the whole job deleted: three reports still pause the business;
 *      three it removed without contact still ring "reported 3 times";
 *      nobody else makes a business look in touch; no API role touches the
 *      record; a person's own Delete Account takes their rows; the migration
 *      fills it from the rows there.
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
    // An upload storage holds (since the twelfth Phase 5 review a link with
    // no upload behind it is refused: section 16).
    await putFile("requested-documents", `${ANA}/${req}/id-1.jpg`);
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
  check("…and both are taken within two runs: a note that failed waits out its back-off behind every note that is due", exactRuns.reduce((a, b) => a + b, 0) === 2 && (await queuedPaths(real)).length === 0, show(exactRuns));
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
  check("…yet the real withdrawal's folders go, all three within three runs", (await queued(victim)).length === 0, show(folderRuns));

  // (C) The tenth security review (finding 1), in the shape of its proof
  // (probes/burst.mjs): 200 throwaway accounts, each starting and withdrawing
  // 10 applications an hour on one job with a tiny file in each
  // application's three folders, for an hour, then nothing. Ranked by each
  // note's age, an account whose notes were all queued before a real
  // withdrawal kept a place ahead of it in every run until they were gone:
  // its first folder waited 31 runs, 91 after a three-hour burst. People now
  // take turns: each run records whom it took (storage_file_trash_served),
  // and a person's first note is ranked by when they were last taken or it
  // became due, whichever is later. The flood's notes are written as the
  // trigger writes them; one account's hour of it goes through the trigger.
  const anHourOfIt = async (account) => {
    const startedIn = Math.floor(Date.now() / 3_600_000);
    await makeUser(account, "candidate");
    let apps = 0;
    let refused = "";
    for (let i = 0; i < 11; i += 1) {
      const r = await as(user(account), `insert into public.applications (job_id, candidate_id) values ($1, $2) returning id`, [JOB, account]);
      if (!r.ok) {
        refused = r.error;
        break;
      }
      apps += 1;
      await putStepFiles(r.rows[0].id, account);
      await as(user(account), `delete from public.applications where id = $1`, [r.rows[0].id]);
    }
    const folders = (await one(`select count(*)::int n from public.storage_file_trash where candidate_id = $1 and path is null`, [account])).n;
    return { apps, refused, folders, sameHour: Math.floor(Date.now() / 3_600_000) === startedIn };
  };
  // The start limit counts in clock hours: a run that crosses one is done
  // again by a fresh account.
  let bursty = await anHourOfIt(id(9, 4));
  if (!bursty.sameHour) bursty = await anHourOfIt(id(9, 5));
  check("one account starts and withdraws 10 applications an hour on one job (the 11th is refused): 30 folders an hour", bursty.apps === 10 && /too_many_applications/.test(bursty.refused) && bursty.folders === 30, show(bursty));

  const served = (await one(`select to_regclass('public.storage_file_trash_served') is not null as there`)).there;
  // The clock: an hour passes between runs, so before each run every stored
  // time is made an hour older, and the run's own now() comes an hour after
  // the last run's.
  const anHourPasses = async () => {
    await db.exec(`update public.storage_file_trash set queued_at = queued_at - interval '1 hour', last_tried_at = last_tried_at - interval '1 hour'`);
    if (served) await db.exec(`update public.storage_file_trash_served set served_at = served_at - interval '1 hour'`);
  };
  /** k folders for each of these people, as the trigger writes them, spread over the hour that starts `ago` hours back. */
  const queueFolders = (people, k, ago) =>
    db.query(
      `insert into public.storage_file_trash (bucket, folder, starts_with, application_id, candidate_id, queued_at)
       select 'videos', x.person::text, x.app::text || '-', x.app, x.person, x.at
         from (select p.person, gen_random_uuid() as app, now() - interval '1 hour' * ($3::float8 - 0.98 * (n - 0.5) / ($2::int + 1)) as at
                 from unnest($1::uuid[]) as p (person), generate_series(1, $2::int) as n) x`,
      [people, k, ago],
    );
  let made = 0;
  const people = (n) => Array.from({ length: n }, () => `9c${String((made += 1)).padStart(6, "0")}-0000-4000-8000-${String(made).padStart(12, "0")}`);
  let victims = 0;
  /**
   * A real withdrawal, after what `before()` queues in the hours before it;
   * then document-cleanup's runs, an hour apart (the first an hour after it),
   * while `each()` queues more in each hour between: the run (1 = the next)
   * in which its first and last folder went. With failOnce, the first of its
   * folders a run takes is refused once (a storage hiccup): the run that was,
   * and the run it went in after all.
   */
  const realWithdrawal = async ({ before = async () => {}, each = async () => {}, failOnce = false, runs = 6, onRun = async () => {} }) => {
    await db.query(`delete from public.storage_file_trash`);
    if (served) await db.query(`delete from public.storage_file_trash_served`);
    const who = id(9, 100 + (victims += 1));
    await makeUser(who, "candidate");
    const app = await apply(who, JOB_P);
    await putStepFiles(app, who);
    await as(user(who), `delete from public.applications where id = $1`, [app]);
    if ((await queued(app)).length !== 3) throw new Error(`setup: the real withdrawal queued ${show(await queued(app))}`);
    await before();
    const taken = [];
    let refusedId = null;
    let refusedIn = Infinity;
    let retried = Infinity;
    for (let h = 1; h <= runs && (taken.length < 3 || (failOnce && retried === Infinity)); h += 1) {
      await anHourPasses();
      await each();
      const r = await as(SERVICE, `select id, application_id, candidate_id from public.storage_file_trash_fair_pick(false)`);
      if (!r.ok) throw new Error(`the pick: ${r.error}`);
      await onRun(h, r.rows);
      const mine = r.rows.filter((n) => n.application_id === app);
      let refused = [];
      if (failOnce && refusedId === null && mine.length) {
        refused = [(refusedId = mine[0].id)];
        refusedIn = h;
      } else if (refusedId !== null && mine.some((n) => n.id === refusedId)) retried = h;
      for (const n of mine) if (!refused.includes(n.id)) taken.push(h);
      if (refused.length) await db.query(`update public.storage_file_trash set attempts = attempts + 1, last_tried_at = now() where id = any($1::uuid[])`, [refused]);
      await db.query(`delete from public.storage_file_trash where id = any($1::uuid[])`, [r.rows.filter((n) => !refused.includes(n.id)).map((n) => n.id)]);
    }
    return { first: taken[0] ?? Infinity, all: taken[2] ?? Infinity, refusedIn, retried };
  };
  const shownRuns = (r) => JSON.stringify(r, (_, v) => (v === Infinity ? "not in these runs" : v));

  const crowd200 = people(200);
  let recorded = null;
  const c1 = await realWithdrawal({
    before: () => queueFolders(crowd200, 30, 1),
    onRun: async (h, picked) => {
      if (h !== 1 || !served) return;
      const rows = (await db.query(`select person, served_at = (select max(served_at) from public.storage_file_trash_served) as now from public.storage_file_trash_served where not exact`)).rows;
      const took = new Set(picked.map((n) => n.candidate_id));
      recorded = { rows: rows.length, now: rows.filter((x) => x.now).length, took: took.size, same: rows.every((x) => x.now === took.has(x.person)) };
    },
  });
  check("each run records whom it took, and when (storage_file_trash_served)", recorded !== null && recorded.same && recorded.now === recorded.took && recorded.rows === recorded.took, show(recorded));
  check("200 accounts' one-hour burst (30 folders each) queued before a real withdrawal: its first folder goes within two runs, all three within four (was 31)", c1.first <= 2 && c1.all <= 4, shownRuns(c1));
  const c3 = await realWithdrawal({
    before: async () => {
      for (const ago of [3, 2, 1]) await queueFolders(crowd200, 30, ago);
    },
  });
  check("…a three-hour burst: the same, however long it went on (was 91)", c3.first <= 2 && c3.all <= 4, shownRuns(c3));
  const c2 = await realWithdrawal({ before: () => queueFolders(crowd200, 30, 1), each: () => queueFolders(crowd200, 30, 1) });
  check("…a burst that keeps going: the same", c2.first <= 2 && c2.all <= 4, shownRuns(c2));
  const c2f = await realWithdrawal({ before: () => queueFolders(crowd200, 30, 1), each: () => queueFolders(crowd200, 30, 1), failOnce: true, runs: 10 });
  check("…and a real folder storage refused once is taken again within four runs while it goes on, not after every note never tried", c2f.retried - c2f.refusedIn <= 4, shownRuns(c2f));
  const b2 = await realWithdrawal({ each: () => queueFolders(people(200), 1, 1) });
  check("200 fresh accounts every hour, one folder each: the real withdrawal still gets a folder every run, all three within three", b2.first === 1 && b2.all <= 3, shownRuns(b2));

  // (D) The eleventh security review (finding 1), in the shape of its proof
  // (probes/fresh3.mjs). One note a turn, and a person's next turn ranked by
  // when the last one was: once a real withdrawal's first folder was taken,
  // its other two waited behind every account that had queued anything since,
  // so a stream of new accounts made each wait longer than the one before. A
  // person's turn is now all of their notes when they hold no more than one
  // withdrawal's worth (3 folders, 6 exact paths), taken whole or not at all;
  // anyone holding more still gives one note a turn.
  const cf = await realWithdrawal({ before: () => queueFolders(people(200), 30, 1), each: () => queueFolders(people(200), 30, 1) });
  check("200 new accounts an hour with 30 folders each, from an hour before a real withdrawal: its three folders go together, within two runs (were the 2nd, 5th and 11th)", cf.first === cf.all && cf.all <= 2, shownRuns(cf));
  const f10 = await realWithdrawal({ each: () => queueFolders(people(1000), 1, 1) });
  check("1,000 new accounts an hour with one folder each, from the withdrawal on: all three in the next run (were the 1st, 6th and 31st)", f10.first === 1 && f10.all === 1, shownRuns(f10));
  // Where more withdrawals were queued before it than a run takes (66 a
  // run), it waits for those, never for the ones queued after it.
  const w10 = await realWithdrawal({ before: () => queueFolders(people(1000), 3, 1), each: () => queueFolders(people(1000), 3, 1), runs: 20 });
  check("1,000 new accounts an hour with one withdrawal (3 folders) each, from an hour before: all three in one run, the one that ends the thousand withdrawals queued before it (the 16th; were the 6th, the 41st and past the 90th)", w10.first === w10.all && w10.all <= Math.ceil(1001 / 66), shownRuns(w10));
  // A withdrawal's worth, no more: accounts holding a little more each still
  // take one folder a turn.
  const k4 = await realWithdrawal({ before: () => queueFolders(people(1000), 4, 1), runs: 8 });
  check("1,000 accounts with 4 folders each queued before it: one from each a turn, so its three go together in the 6th run (four a turn each: the 21st)", k4.first === k4.all && k4.all <= 6, shownRuns(k4));
  // A turn that would cross the run's 200 waits for the next run, where it
  // comes first: split, its last folders went behind everyone who had queued
  // since.
  const edge = await realWithdrawal({ before: () => queueFolders(people(199), 1, 1), each: () => queueFolders(people(1000), 1, 1) });
  check("199 accounts' folders just before it, then 1,000 new accounts an hour: its turn would cross the run's 200, so all three go in the next run, together (split, they were the 1st, 7th and 37th)", edge.first === 2 && edge.all === 2, shownRuns(edge));

  // (E) The twelfth security review (finding 2), in the shape of its probe
  // (probes/edge.mjs, M3): a Delete Account with two applications (six
  // folders) gave one a turn until it was down to three, each turn behind
  // everyone who queued since, now up to three folders from each of them.
  // Someone holding no more than two withdrawals' worth who has had a turn
  // since their oldest note was queued takes up to a withdrawal's worth a
  // turn (20261025620000).
  const sixFolders = async (eachHour, hoursBefore, runs) => {
    await db.query(`delete from public.storage_file_trash`);
    if (served) await db.query(`delete from public.storage_file_trash_served`);
    for (let h = 0; h < hoursBefore; h += 1) {
      await anHourPasses();
      await eachHour();
      const r = await as(SERVICE, `select id from public.storage_file_trash_fair_pick(false)`);
      await db.query(`delete from public.storage_file_trash where id = any($1::uuid[])`, [(r.rows ?? []).map((n) => n.id)]);
    }
    const who = id(9, 200 + (victims += 1));
    await db.query(`insert into public.storage_file_trash (bucket, folder, starts_with, application_id, candidate_id)
      select b, case when b = 'voice-interview-recordings' then a::text else $1 end, case when b = 'voice-interview-recordings' then '' else a::text || '-' end, a, $1::uuid
        from (values (gen_random_uuid()), (gen_random_uuid())) apps (a), unnest(array['voice-interview-recordings', 'videos', 'portfolios']) b`, [who]);
    const taken = [];
    for (let h = 1; h <= runs && taken.length < 6; h += 1) {
      await anHourPasses();
      await eachHour();
      const r = await as(SERVICE, `select id, candidate_id from public.storage_file_trash_fair_pick(false)`);
      if (!r.ok) throw new Error(`the pick: ${r.error}`);
      for (const n of r.rows) if (n.candidate_id === who) taken.push(h);
      await db.query(`delete from public.storage_file_trash where id = any($1::uuid[])`, [r.rows.map((n) => n.id)]);
    }
    return taken;
  };
  const six = await sixFolders(() => queueFolders(people(100), 3, 1), 1, 14);
  check("a Delete Account with two applications (six folders), under 100 new accounts an hour each withdrawing one, from an hour before: one, then three together, then the last two (the 1st, 3rd and 6th runs; one a turn, the last three waited for the 10th)", JSON.stringify(six) === JSON.stringify([1, 3, 3, 3, 6, 6]), JSON.stringify(six));

  // Exact paths take turns the same way, six to a withdrawal (a resume, its
  // page images and the form's files): 1,000 accounts holding 7 each queued
  // before a real withdrawal, then 1,500 new accounts an hour with one each.
  await db.query(`delete from public.storage_file_trash`);
  if (served) await db.query(`delete from public.storage_file_trash_served`);
  const FORMS = id(9, 80);
  await makeUser(FORMS, "candidate");
  const formsApp = await apply(FORMS, JOB_P);
  const formFiles = Array.from({ length: 6 }, (_, k) => `${FORMS}/17290000000${k}.pdf`);
  for (const p of formFiles) await putFile("resumes", p);
  await as(user(FORMS), `update public.applications set resume_url = $2, notes = $3 where id = $1`, [formsApp, formFiles[0], JSON.stringify({ fileUploads: Object.fromEntries(formFiles.slice(1).map((p, k) => [`q${k}`, { url: p, imageUrls: [], isResume: false }])) })]);
  await as(user(FORMS), `delete from public.applications where id = $1`, [formsApp]);
  if (JSON.stringify(await queuedPaths(formsApp)) !== JSON.stringify([...formFiles].sort())) throw new Error(`setup: the withdrawal queued ${show(await queuedPaths(formsApp))}`);
  /** k exact paths for each of n new people, as the trigger writes them, spread over the hour that starts `ago` hours back. */
  const queuePaths = (n, k, ago) =>
    db.query(
      `insert into public.storage_file_trash (bucket, path, application_id, candidate_id, queued_at)
       select 'resumes', p.person::text || '/17290000' || lpad(i::text, 5, '0') || '.pdf', gen_random_uuid(), p.person,
              now() - interval '1 hour' * ($3::float8 - 0.98 * (i - 0.5) / ($2::int + 1))
         from (select gen_random_uuid() as person from generate_series(1, $1::int)) p, generate_series(1, $2::int) as i`,
      [n, k, ago],
    );
  await queuePaths(1000, 7, 1);
  const formRuns = [];
  for (let h = 1; h <= 8 && (await queuedPaths(formsApp)).length > 0; h += 1) {
    await anHourPasses();
    await queuePaths(1500, 1, 1);
    const r = await as(SERVICE, `select id, application_id from public.storage_file_trash_fair_pick(true)`);
    if (!r.ok) throw new Error(`the pick: ${r.error}`);
    formRuns.push(r.rows.filter((n) => n.application_id === formsApp).length);
    await db.query(`delete from public.storage_file_trash where id = any($1::uuid[])`, [r.rows.map((n) => n.id)]);
  }
  check("exact paths: a withdrawal's six files go together, in the run after 1,000 accounts holding seven each take one each, while 1,500 new accounts an hour queue a file each (one a turn, four went in the 2nd, 6th, 13th and 24th runs and two after the 40th)", JSON.stringify(formRuns) === JSON.stringify([0, 6]), show(formRuns));

  // Folders and exact paths are two queues, read by two calls in one run:
  // each keeps its own turns, so a withdrawal's folders taken first never
  // send its resume behind a thousand accounts' files queued after it.
  await db.query(`delete from public.storage_file_trash`);
  if (served) await db.query(`delete from public.storage_file_trash_served`);
  const APART = id(9, 70);
  await makeUser(APART, "candidate");
  const apartApp = await apply(APART, JOB_P);
  await putStepFiles(apartApp, APART);
  const APART_CV = `${APART}/1729000000000.pdf`;
  await putFile("resumes", APART_CV);
  await as(user(APART), `update public.applications set resume_url = $2 where id = $1`, [apartApp, APART_CV]);
  await as(user(APART), `delete from public.applications where id = $1`, [apartApp]);
  await db.query(
    `insert into public.storage_file_trash (bucket, path, application_id, candidate_id)
     select 'resumes', p.person::text || '/1729000000000.pdf', gen_random_uuid(), p.person
       from (select gen_random_uuid() as person from generate_series(1, 1000)) p`,
  );
  const apartFolders = await as(SERVICE, `select id, application_id from public.storage_file_trash_fair_pick(false)`);
  const apartPaths = await as(SERVICE, `select id, application_id, path from public.storage_file_trash_fair_pick(true)`);
  check("folders and exact paths take turns apart: a withdrawal's folders taken in a run keep its resume ahead of a thousand accounts' files queued after it", apartFolders.ok && apartFolders.rows.filter((n) => n.application_id === apartApp).length === 3 && apartPaths.ok && apartPaths.rows.some((n) => n.path === APART_CV), show({ folders: apartFolders.rows?.length, paths: apartPaths.rows?.length, cv: apartPaths.rows?.some((n) => n.path === APART_CV) }));

  // The record is the server's: a person's turn goes a day after it, once
  // they hold nothing in that queue (dropping it while they hold a note would
  // rank them by that note's age again, ahead of everyone who waited since).
  await db.query(`delete from public.storage_file_trash`);
  const [GONE_DAY, HOLDS, RECENT, OTHER_KIND] = [id(9, 60), id(9, 61), id(9, 62), id(9, 63)];
  let pruned = null;
  if (served) {
    await db.query(`delete from public.storage_file_trash_served`);
    await queueFolders([HOLDS, OTHER_KIND], 1, 1);
    await db.query(`insert into public.storage_file_trash_served (exact, person, served_at) values (false, $1, now() - interval '2 days'), (false, $2, now() - interval '2 days'), (false, $3, now() - interval '1 hour'), (true, $4, now() - interval '2 days')`, [GONE_DAY, HOLDS, RECENT, OTHER_KIND]);
  }
  try {
    await db.query(`select public.prune_storage_file_trash_served()`);
    pruned = (await db.query(`select exact, person from public.storage_file_trash_served order by person`)).rows.map((x) => `${x.exact}:${x.person}`);
  } catch (e) {
    pruned = e.message;
  }
  check("a person's record goes a day after their last turn once they hold nothing in that queue; one still holding a note, or served today, stays", JSON.stringify(pruned) === JSON.stringify([`false:${HOLDS}`, `false:${RECENT}`]), show(pruned));
  const browserTries = [
    await as(user(ANA), `select * from public.storage_file_trash_served`),
    await as(ANON, `select * from public.storage_file_trash_served`),
    await as(user(ANA), `insert into public.storage_file_trash_served (exact, person, served_at) values (false, $1, now() - interval '1 year')`, [ANA]),
    await as(user(ANA), `update public.storage_file_trash_served set served_at = now() + interval '1 year'`),
    await as(user(ANA), `select public.prune_storage_file_trash_served()`),
    await as(user(ANA), `select id from public.storage_file_trash_fair_pick(false)`),
  ];
  check("…and no browser may read or write it, prune it or take a run (which writes it)", served && browserTries.every((r) => !r.ok), show(browserTries.map((r) => r.ok || r.error)));
}

// ---------------------------------------------------------------------------
console.log("\n16. One business cannot keep other people's ID papers in storage\n");
{
  // The twelfth Phase 5 review (finding 1), in the shape of its proof
  // (probes/trash_flood.mjs): a business that confirmed its email and put a
  // job live asked one throwaway applicant for 5,000 papers in one request;
  // the applicant set file_url on all of them to a made-up path in their own
  // folder (no upload) and withdrew. That one withdrawal left 5,000 notes in
  // document_file_trash, which document-cleanup read 200 a run with no
  // order, so a real ID removed through Delete their information afterwards
  // was first read in run 26 (101 after 20,000), and the papers still open
  // were read the same way. As Supabase's own storage does, objects are
  // indexed by bucket and name here (bucketid_objname).
  await db.exec(`create unique index if not exists objects_bucket_name on storage.objects (bucket_id, name)`);
  await db.query(`delete from public.document_file_trash`);
  const hour = () => Math.floor(Date.now() / 3_600_000);
  const newBusiness = async (u, name) => {
    await makeUser(u, "employer", { full_name: `${name} owner`, company_name: name });
    await db.query(`update public.profiles set email_verified_at = now(), email_verified_for = email where user_id = $1`, [u]);
    return (await one(`insert into public.jobs (employer_id, title, description, status) values ($1, 'Chat support agent', 'Answer customers by chat.', 'published') returning id`, [u])).id;
  };
  const askFor = (business, application, candidate, n, type = "custom") =>
    as(user(business), `insert into public.document_requests (application_id, employer_id, candidate_id, document_type, custom_document_name)
      select $1, $2, $3, $5, 'Paper ' || g from generate_series(1, $4::int) g returning id`, [application, business, candidate, n, type]);
  const requestsOn = async (application) => (await one(`select count(*)::int n from public.document_requests where application_id = $1`, [application])).n;

  // (a) The limits: 50 on one application, 300 an hour for a business.
  const FLOODER = id("a", 1);
  const FJOB = await newBusiness(FLOODER, "Flood Co");
  const ATT = id("a", 2);
  await makeUser(ATT, "candidate");
  const attApp = await apply(ATT, FJOB);
  const bulk = await askFor(FLOODER, attApp, ATT, 5000);
  check("the review's 5,000 papers in one request are refused, and none goes in", !bulk.ok && /too_many_requests_on_application/.test(bulk.error) && (await requestsOn(attApp)) === 0, show(bulk));
  const fiftyIn = hour();
  const fifty = await askFor(FLOODER, attApp, ATT, 50);
  check("…while 50 on one application go in", fifty.ok && fifty.rows.length === 50, show(fifty.error));
  const more = await askFor(FLOODER, attApp, ATT, 1, "government_id");
  check("…and the 51st is refused (too_many_requests_on_application, which the request screen says plainly)", !more.ok && /too_many_requests_on_application/.test(more.error) && (await requestsOn(attApp)) === 50, show(more));
  // 300 an hour across the business's applications. The limit counts in
  // clock hours: a run that crosses one is done again by a fresh business.
  const hourlyLimit = async (biz, job, n0, startedIn = hour()) => {
    let sent = 0;
    let refused = "";
    for (let k = 0; k < 7 && !refused; k += 1) {
      const who = id("a", n0 + k);
      await makeUser(who, "candidate");
      const app = await apply(who, job);
      const r = await askFor(biz, app, who, 50);
      if (r.ok) sent += r.rows.length;
      else refused = r.error;
    }
    return { sent, refused, sameHour: hour() === startedIn };
  };
  // FLOODER's first 50 count in its hour too: 50 + 250 = 300 (a fresh business: 300).
  let limit = { ...(await hourlyLimit(FLOODER, FJOB, 10, fiftyIn)), expected: 250 };
  if (!limit.sameHour) {
    const AGAIN = id("a", 30);
    limit = { ...(await hourlyLimit(AGAIN, await newBusiness(AGAIN, "Flood Again"), 31)), expected: 300 };
  }
  check("a business sends at most 300 requests an hour across its applications; the next is refused (too_many_document_requests)", limit.sameHour === false || (limit.sent === limit.expected && /too_many_document_requests/.test(limit.refused)), show(limit));
  const server = await as(SERVICE, `insert into public.document_requests (application_id, employer_id, candidate_id, document_type) values ($1, $2, $3, 'custom') returning id`, [attApp, FLOODER, ATT]);
  check("…the server's own inserts are not counted", server.ok, show(server));
  await as(SERVICE, `delete from public.document_requests where id = $1`, [server.rows?.[0]?.id]);

  // (b) The applicant's link: only their own upload for that request.
  const [rid, rid2, ...rest] = fifty.rows.map((r) => r.id);
  await putFile("requested-documents", `${ATT}/elsewhere.jpg`);
  await putFile("requested-documents", `${ATT}/${rid2}/1729000000000.jpg`);
  await putFile("requested-documents", `${ATT}/${rid}/sub/1729000000000.jpg`);
  const setLink = (request, link) => as(user(ATT), `update public.document_requests set file_url = $2, file_name = 'x.jpg', status = 'submitted' where id = $1 returning id`, [request, link]);
  for (const [what, link] of [
    ["a made-up path in their own folder with no upload (the review's)", `${ATT}/x.jpg`],
    ["a file of theirs outside the request's folder", `${ATT}/elsewhere.jpg`],
    ["another request's upload", `${ATT}/${rid2}/1729000000000.jpg`],
    ["a name in the request's folder that storage does not hold", `${ATT}/${rid}/1729000000001.jpg`],
    ["a file in a folder inside it", `${ATT}/${rid}/sub/1729000000000.jpg`],
    ["the folder itself", `${ATT}/${rid}/`],
    ["a \".\" part", `${ATT}/${rid}/.`],
  ]) {
    const r = await setLink(rid, link);
    check(`the applicant cannot link ${what}`, !r.ok && /request_file_not_yours/.test(r.error), show(r));
  }
  const patchAll = await as(user(ATT), `update public.document_requests set file_url = $2, file_name = 'x.jpg', status = 'submitted' where application_id = $1`, [attApp, `${ATT}/x.jpg`]);
  check("…nor PATCH one made-up link onto every request of the application (the review's step 2)", !patchAll.ok && (await one(`select count(*)::int n from public.document_requests where application_id = $1 and file_url is not null`, [attApp])).n === 0, show(patchAll));
  // Ten real uploads, each in its own request's folder.
  const uploaded = [rid, ...rest.slice(0, 9)];
  for (const r of uploaded) {
    await putFile("requested-documents", `${ATT}/${r}/1729000000000.jpg`);
    const ok = await setLink(r, `${ATT}/${r}/1729000000000.jpg`);
    if (!ok.ok) throw new Error(`setup: a real upload could not be linked: ${ok.error}`);
  }
  check("…while their own upload for that request goes in", (await one(`select count(*)::int n from public.document_requests where application_id = $1 and file_url is not null`, [attApp])).n === 10);
  const w = await as(user(ATT), `delete from public.applications where id = $1 returning id`, [attApp]);
  const left = (await db.query(`select request_id, employer_id from public.document_file_trash where candidate_id = $1`, [ATT])).rows;
  // …and the request whose folder holds an upload that was never linked (rid2 above).
  check("the withdrawal queues only the papers storage holds: 11 of 50 (10 linked, one in its folder but never linked), each naming the business that asked", w.ok && left.length === 11 && left.every((t) => t.employer_id === FLOODER) && JSON.stringify(left.map((t) => t.request_id).sort()) === JSON.stringify([...uploaded, rid2].sort()), show({ w: w.error, left: left.length }));
  await db.query(`delete from public.document_file_trash`);

  // (c) The worst the limits still leave, as the trigger leaves it: one
  // business's 5,000 (then 20,000) notes over many throwaway applicants,
  // queued before a real ID that the team opens and then removes through
  // Delete their information. document-cleanup's runs take the pick and
  // delete what it gave.
  let victimNo = 0;
  const realIdRemoved = async () => {
    victimNo += 1;
    const VICTIM = id("b", victimNo);
    await makeUser(VICTIM, "candidate");
    const app = await apply(VICTIM, JOB);
    const asked = await as(user(BIZ), `insert into public.document_requests (application_id, employer_id, candidate_id, document_type) values ($1, $2, $3, 'government_id') returning id`, [app, BIZ, VICTIM]);
    if (!asked.ok) throw new Error(`setup: BIZ could not ask for an ID: ${asked.error}`);
    const request = asked.rows[0].id;
    const file = `${VICTIM}/${request}/1729000000000.jpg`;
    await putFile("requested-documents", file);
    const sent = await as(user(VICTIM), `update public.document_requests set file_url = $2, file_name = 'ID.jpg', status = 'submitted' where id = $1`, [request, file]);
    if (!sent.ok) throw new Error(`setup: the ID could not be sent: ${sent.error}`);
    await as(SERVICE, `update public.document_requests set team_opened_at = now() - interval '1 hour' where id = $1`, [request]);
    const removed = await as(SERVICE, `select public.remove_applicant($1, $2, 'They asked us to delete it') as r`, [app, BIZ]);
    if (removed.rows?.[0]?.r?.ok !== true) throw new Error(`setup: remove_applicant: ${show(removed)}`);
    return request;
  };
  const flood = (n, businesses = [FLOODER]) =>
    as(SERVICE, `insert into public.document_file_trash (candidate_id, request_id, file_url, employer_id, queued_at)
      select person, gen_random_uuid(), null, ($2::uuid[])[1 + (g % array_length($2::uuid[], 1))], now() - interval '1 hour' + g * interval '1 millisecond'
        from generate_series(1, $1::int) g, lateral (select ('ac' || lpad((g % 400)::text, 6, '0') || '-0000-4000-8000-000000000000')::uuid as person) p`, [n, businesses]);
  const runDeleted = async () => {
    const r = await as(SERVICE, `select id, request_id from public.document_file_trash_fair_pick()`);
    if (!r.ok) throw new Error(`the pick: ${r.error}`);
    await db.query(`delete from public.document_file_trash where id = any($1::uuid[])`, [r.rows.map((n) => n.id)]);
    return r.rows;
  };
  const runsUntil = async (request, most = 30) => {
    for (let run = 1; run <= most; run += 1) {
      if ((await runDeleted()).some((n) => n.request_id === request)) return run;
    }
    return -1;
  };
  for (const n of [5000, 20000]) {
    await db.query(`delete from public.document_file_trash`);
    const f = await flood(n);
    if (!f.ok) throw new Error(`setup: the flood: ${f.error}`);
    const request = await realIdRemoved();
    const note = await one(`select employer_id from public.document_file_trash where request_id = $1`, [request]);
    check(`a real ID removed through Delete their information is queued, naming its business (after ${n.toLocaleString("en-US")})`, note?.employer_id === BIZ, show(note));
    const before = (await db.query(`select request_id from public.document_file_trash limit 200`)).rows;
    check(`…the flood is big enough to matter: read as before (200, no order), the first run would not reach it`, !before.some((r) => r.request_id === request));
    const runs = await runsUntil(request);
    check(`…and with one business's ${n.toLocaleString("en-US")} notes ahead of it, it goes in document-cleanup's first run`, runs === 1, String(runs));
  }
  // Many businesses (each one a confirmed sign-up with a live job): 300 of
  // them, 20,000 notes in all, queued before it. A business, not a person:
  // throwaway applicant accounts cost nothing, a business confirms its email.
  {
    await db.query(`delete from public.document_file_trash`);
    const many = Array.from({ length: 300 }, (_, i) => `ad${String(i).padStart(6, "0")}-0000-4000-8000-000000000000`);
    const f = await flood(20000, many);
    if (!f.ok) throw new Error(`setup: the flood of many: ${f.error}`);
    const request = await realIdRemoved();
    const runs = await runsUntil(request);
    check("…and with 300 businesses' 20,000 notes ahead of it, within two runs (one for every 200 businesses ahead)", runs >= 1 && runs <= 2, String(runs));
  }
  // A note that failed waits out a back-off behind every note that is due,
  // and is tried again after it.
  {
    await db.query(`delete from public.document_file_trash`);
    await flood(600);
    const failedOnce = await as(SERVICE, `insert into public.document_file_trash (candidate_id, request_id, employer_id, attempts, last_tried_at, queued_at) values ($1, gen_random_uuid(), $2, 1, now(), now() - interval '2 hours') returning request_id`, [ANA, BIZ]);
    const firstRun = await runDeleted();
    check("a note that failed a moment ago waits behind every note that is due", !firstRun.some((r) => r.request_id === failedOnce.rows[0].request_id) && firstRun.length === 200, show(firstRun.length));
    await as(SERVICE, `update public.document_file_trash set last_tried_at = now() - interval '2 hours' where request_id = $1`, [failedOnce.rows[0].request_id]);
    check("…and goes in the next run once its back-off is over", (await runDeleted()).some((r) => r.request_id === failedOnce.rows[0].request_id));
  }

  // (d) The ID papers still open that are due: one business's 20,000,
  // opened 26 hours ago, and a real one opened 25 hours ago (the review's
  // PLAUSIBLE item: three reads of 200 with no order).
  const KINDS = `array['government_id', 'nbi_clearance', 'proof_of_address']`;
  const pickDue = () => as(SERVICE, `select id, file_url from public.document_requests_due_pick(${KINDS}, now() - interval '24 hours', now() - interval '7 days')`);
  const runDue = async () => {
    const r = await pickDue();
    if (!r.ok) throw new Error(`the due pick: ${r.error}`);
    await as(SERVICE, `update public.document_requests set file_url = null, file_deleted_at = now() where id = any($1::uuid[])`, [r.rows.map((x) => x.id)]);
    return r.rows;
  };
  const HOLDER = id("a", 50);
  await makeUser(HOLDER, "candidate");
  const holderApp = await apply(HOLDER, FJOB);
  const dueFlood = (n, businesses) =>
    as(SERVICE, `insert into public.document_requests (application_id, employer_id, candidate_id, document_type, status, file_url, submitted_at, team_opened_at)
      select $1, ($3::uuid[])[1 + (g % array_length($3::uuid[], 1))], $2::uuid, 'government_id', 'submitted', $2::uuid::text || '/' || gen_random_uuid() || '/1.jpg', now() - interval '30 hours', now() - interval '26 hours' + g * interval '1 millisecond'
        from generate_series(1, $4::int) g`, [holderApp, HOLDER, businesses, n]);
  let realNo = 0;
  const realDueId = async () => {
    realNo += 1;
    const REAL = id("c", realNo);
    await makeUser(REAL, "candidate");
    const app = await apply(REAL, JOB);
    const asked = await as(user(BIZ), `insert into public.document_requests (application_id, employer_id, candidate_id, document_type) values ($1, $2, $3, 'government_id') returning id`, [app, BIZ, REAL]);
    const request = asked.rows[0].id;
    const file = `${REAL}/${request}/1729000000000.jpg`;
    await putFile("requested-documents", file);
    await as(user(REAL), `update public.document_requests set file_url = $2, file_name = 'ID.jpg', status = 'submitted' where id = $1`, [request, file]);
    await as(SERVICE, `update public.document_requests set team_opened_at = now() - interval '25 hours' where id = $1`, [request]);
    return request;
  };
  {
    const f = await dueFlood(20000, [FLOODER]);
    if (!f.ok) throw new Error(`setup: the due flood: ${f.error}`);
    const request = await realDueId();
    const before = (await as(SERVICE, `select id from public.document_requests where document_type = any(${KINDS}) and file_url is not null and team_opened_at <= now() - interval '24 hours' limit 200`)).rows;
    check("one business holds 20,000 ID papers due before a real one: read as before (200, no order), the first run would not reach it", !before.some((r) => r.id === request));
    const first = await runDue();
    check("…and the real one is in document-cleanup's first run", first.some((r) => r.id === request) && first.length === 200, show(first.length));
    await as(SERVICE, `update public.document_requests set file_url = null where application_id = $1`, [holderApp]);
  }
  {
    const many = Array.from({ length: 300 }, (_, i) => `ae${String(i).padStart(6, "0")}-0000-4000-8000-000000000000`);
    const f = await dueFlood(20000, many);
    if (!f.ok) throw new Error(`setup: the due flood of many: ${f.error}`);
    const request = await realDueId();
    let runs = -1;
    for (let run = 1; run <= 30 && runs < 0; run += 1) if ((await runDue()).some((r) => r.id === request)) runs = run;
    check("…and with 300 businesses' 20,000 ahead of it, within two runs", runs >= 1 && runs <= 2, String(runs));
    await as(SERVICE, `update public.document_requests set file_url = null where application_id = $1`, [holderApp]);
  }
  // Which papers are due (the review's weakenings T1, T2 and T8 passed every
  // test: only regexes held the kinds and the 7-day reads).
  {
    const at = { app: holderApp, who: HOLDER };
    const put = async (type, stamps) => {
      const r = await as(SERVICE, `insert into public.document_requests (application_id, employer_id, candidate_id, document_type, status, file_url, submitted_at, team_opened_at, created_at)
        values ($1, $2, $3::uuid, $4, 'submitted', $3::uuid::text || '/' || gen_random_uuid() || '/1.jpg', $5, $6, coalesce($7, now())) returning id`, [at.app, FLOODER, at.who, type, stamps.sent ?? null, stamps.opened ?? null, stamps.asked ?? null]);
      return r.rows[0].id;
    };
    const ago = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
    const cases = [
      ["an ID opened 25 hours ago", await put("government_id", { opened: ago(25), sent: ago(30) }), true],
      ["an NBI clearance opened 25 hours ago", await put("nbi_clearance", { opened: ago(25), sent: ago(30) }), true],
      ["a paper named under \"Something else\", opened 25 hours ago", await put("custom", { opened: ago(25), sent: ago(30) }), false],
      ["an ID opened 23 hours ago", await put("government_id", { opened: ago(23), sent: ago(30) }), false],
      ["an ID sent 8 days ago that nobody opened", await put("proof_of_address", { sent: ago(24 * 8) }), true],
      ["an ID sent 6 days ago that nobody opened", await put("government_id", { sent: ago(24 * 6) }), false],
      ["an ID put there, never marked sent, asked for 8 days ago", await put("government_id", { asked: ago(24 * 8) }), true],
      ["an ID put there, never marked sent, asked for 6 days ago", await put("government_id", { asked: ago(24 * 6) }), false],
    ];
    const picked = new Set((await pickDue()).rows.map((r) => r.id));
    for (const [what, request, due] of cases) check(`the due pick ${due ? "takes" : "leaves"} ${what}`, picked.has(request) === due);
    const none = await as(SERVICE, `select count(*)::int n from public.document_requests_due_pick(null, now() - interval '24 hours', now() - interval '7 days')`);
    check("…and takes nothing without its kinds", none.ok && none.rows[0].n === 0, show(none));
  }

  // (e) Only the server takes a run, and only it reads or writes whom each
  // run took; a business's record goes only once it holds nothing.
  const browserTries = [
    await as(user(FLOODER), `select * from public.document_file_trash_fair_pick()`),
    await as(user(FLOODER), `select * from public.document_requests_due_pick(${KINDS}, now(), now())`),
    await as(user(FLOODER), `select * from public.document_cleanup_served`),
    await as(ANON, `select * from public.document_cleanup_served`),
    await as(user(FLOODER), `insert into public.document_cleanup_served (queue, person, served_at) values ('deleted', $1, now() + interval '1 year')`, [BIZ]),
    await as(user(FLOODER), `select public.prune_document_cleanup_served()`),
    await as(user(ATT), `select * from public.document_file_trash`),
  ];
  check("no browser may take a run, read or write whom each run took, or prune it", browserTries.every((r) => !r.ok || r.rows.length === 0), show(browserTries.map((r) => r.ok || r.error)));
  await db.query(`delete from public.document_file_trash`);
  await db.query(`update public.document_cleanup_served set served_at = now() - interval '2 days'`);
  await as(SERVICE, `insert into public.document_file_trash (candidate_id, request_id, employer_id) values ($1, gen_random_uuid(), $2)`, [ANA, BIZ]);
  await db.query(`select public.prune_document_cleanup_served()`);
  const kept = (await db.query(`select queue, person from public.document_cleanup_served where person = $1`, [BIZ])).rows.map((r) => r.queue).sort();
  check("the daily prune keeps a business's turn while it holds a note or a paper, and drops one that holds nothing", JSON.stringify(kept) === JSON.stringify(["deleted"]) && (await one(`select count(*)::int n from public.document_cleanup_served where person like 'ad%'`)).n === 0, show(kept));
  await db.query(`delete from public.document_file_trash`);
}

// ---------------------------------------------------------------------------
console.log("\n17. What a removal or a withdrawal keeps, and what it takes\n");
{
  // The twelfth Phase 5 review (finding 2): these weakenings passed every
  // test, since remove_applicant.pglite.test.mjs ran only 20261025220000's
  // definition, sections 2 and 11 checked only who and the log, and the
  // applicant's delete policy was held only by tests that load chosen
  // migrations. Every migration is applied here.
  const FILES = await import("../supabase/functions/remove-applicant/files.ts");
  const KEEPS = id("d", 1);
  await makeUser(KEEPS, "candidate");
  const PROFILE_CV = `${KEEPS}/1729000000000_profile.pdf`;
  const SHARED = `${KEEPS}/1729000000001_q1.pdf`;
  const OWN = `${KEEPS}/1729000000002_q2.pdf`;
  for (const p of [PROFILE_CV, SHARED, OWN]) await putFile("resumes", p);
  await db.query(`update public.profiles set resume_url = $2 where user_id = $1`, [KEEPS, PROFILE_CV]);
  const here = await apply(KEEPS, JOB);
  const elsewhere = await apply(KEEPS, JOB_P);
  const listedHere = await as(user(KEEPS), `update public.applications set resume_url = $2, notes = $3 where id = $1`, [here, PROFILE_CV, JSON.stringify({ fileUploads: { q1: { url: SHARED, imageUrls: [], isResume: false }, q2: { url: OWN, imageUrls: [], isResume: false } } })]);
  const listedThere = await as(user(KEEPS), `update public.applications set notes = $2 where id = $1`, [elsewhere, JSON.stringify({ fileUploads: { q1: { url: SHARED, imageUrls: [], isResume: false } } })]);
  if (!listedHere.ok || !listedThere.ok) throw new Error(`setup: the form's files: ${show({ listedHere, listedThere })}`);
  // Blocked by this business and by another.
  for (const biz of [BIZ, PBIZ]) await db.query(`insert into public.blocked_applicants (employer_id, candidate_id, email, reason, blocked_by) values ($1, $2, $3, 'No-show twice', $1)`, [biz, KEEPS, emailOf(KEEPS)]);
  const removed = await as(SERVICE, `select public.remove_applicant($1, $2, 'They asked us to delete it') as r`, [here, BIZ]);
  const r = removed.rows?.[0]?.r ?? {};
  check("Delete their information removes the application", r.ok === true && (await one(`select count(*)::int n from public.applications where id = $1`, [here])).n === 0, show(removed));
  const goes = FILES.resumeFilesToRemove(KEEPS, r.resume_url, r.notes, r.other_refs);
  check("…keeps their profile's resume, though this application used it (the review's S1)", String(r.other_refs).includes(PROFILE_CV) && !goes.includes(PROFILE_CV), show({ goes, refs: String(r.other_refs).slice(0, 200) }));
  check("…keeps a file their application to another business still lists (S2)", String(r.other_refs).includes(SHARED) && !goes.includes(SHARED), show(goes));
  check("…and deletes the file only this application used", JSON.stringify(goes) === JSON.stringify([OWN]), show(goes));
  const blocks = (await db.query(`select employer_id from public.blocked_applicants where candidate_id = $1 order by employer_id`, [KEEPS])).rows.map((b) => b.employer_id);
  check("…takes their block with this business, with no application of theirs left there (S4: the second Phase 5 review)", !blocks.includes(BIZ), show(blocks));
  check("…and never their block with another business (S5)", blocks.includes(PBIZ), show(blocks));
  // A block stays while another application of theirs is still with the business.
  const TWICE = id("d", 2);
  await makeUser(TWICE, "candidate");
  const one1 = await apply(TWICE, JOB);
  await apply(TWICE, JOB_NEW);
  await db.query(`insert into public.blocked_applicants (employer_id, candidate_id, email, reason, blocked_by) values ($1, $2, $3, 'Rude on the call', $1)`, [BIZ, TWICE, emailOf(TWICE)]);
  await as(SERVICE, `select public.remove_applicant($1, $2, null)`, [one1, BIZ]);
  check("…a block stays while another application of theirs is with the business", (await one(`select count(*)::int n from public.blocked_applicants where candidate_id = $1 and employer_id = $2`, [TWICE, BIZ])).n === 1);

  // A paper named under "Something else" goes with its application (S6: the
  // Terms say it is kept until the application is deleted, not for good).
  const NAMED = id("d", 3);
  await makeUser(NAMED, "candidate");
  const namedApp = await apply(NAMED, JOB);
  const asked = await as(user(BIZ), `insert into public.document_requests (application_id, employer_id, candidate_id, document_type, custom_document_name) values ($1, $2, $3, 'custom', 'Diploma') returning id`, [namedApp, BIZ, NAMED]);
  const namedFile = `${NAMED}/${asked.rows[0].id}/1729000000000.pdf`;
  await putFile("requested-documents", namedFile);
  await as(user(NAMED), `update public.document_requests set file_url = $2, file_name = 'Diploma.pdf', status = 'submitted' where id = $1`, [asked.rows[0].id, namedFile]);
  await as(user(NAMED), `delete from public.applications where id = $1`, [namedApp]);
  check("a paper named under \"Something else\" is queued for deletion with its application (S6)", (await one(`select count(*)::int n from public.document_file_trash where request_id = $1 and file_url = $2`, [asked.rows[0].id, namedFile])).n === 1);

  // The applicant withdraws only while nobody has decided, and never once
  // they signed something (20261011197000; S10, S11).
  const withdraws = async (status, signed = false) => {
    const who = id("d", 10 + (await one(`select count(*)::int n from auth.users where id::text like 'd0000000-%'`)).n);
    await makeUser(who, "candidate");
    const app = await apply(who, JOB_NEW);
    await as(SERVICE, `update public.applications set status = $2 where id = $1`, [app, status]);
    if (signed) {
      const doc = await as(SERVICE, `insert into public.documents (application_id, name, file_url, status, candidate_signed_at, sender_id, recipient_id) values ($1, 'Offer letter', 'documents/x/original.pdf', 'signed', now(), $2, $3) returning id`, [app, BIZ, who]);
      if (!doc.ok) throw new Error(`setup: the signed document: ${doc.error}`);
    }
    const d = await as(user(who), `delete from public.applications where id = $1 returning id`, [app]);
    return d.ok && d.rows.length === 1 && (await one(`select count(*)::int n from public.applications where id = $1`, [app])).n === 0;
  };
  for (const status of ["in_progress", "pending", "reviewing"]) check(`an applicant may withdraw an application at "${status}"`, await withdraws(status));
  for (const status of ["interview", "offered", "hired", "rejected"]) check(`…never one at "${status}": the interview, offer and decision are the business's record too (S11)`, !(await withdraws(status)));
  check("…nor one with a document they signed, though nobody decided yet (S10)", !(await withdraws("reviewing", true)));
}

// ---------------------------------------------------------------------------
console.log("\n18. A run reads a run's worth, however big the queues grow\n");
{
  // The twelfth security review (finding 1), in the shape of its proof
  // (probes/perf.mjs, pg/time3.sql): storage_file_trash_fair_pick ranked the
  // whole queue on every call, document-cleanup calls it through the API
  // (an 8-second statement timeout), and a note leaves only once a run has
  // picked it. At about 700,000 folder notes, a day of 1,000 free accounts
  // at the start limit, every run's pick timed out from then on, and no
  // folder was removed for anyone again. The papers' two picks had the same
  // shape. Each queue's turns are now kept by its own triggers
  // (20261025620000, 20261025630000), and a run reads the people it can reach
  // by index. (a) The turns are the queues as they stand, whatever writes
  // them; (b) a pick at ten times the queue takes less than twice as long
  // (the old picks took about ten times as long).
  const there = async (t) => (await one(`select to_regclass($1) is not null as there`, [t])).there;
  const turnsTables = ["public.storage_file_trash_turns", "public.document_file_trash_turns", "public.document_requests_due_turns"];
  const kept = (await Promise.all(turnsTables.map(there))).every(Boolean);
  check("each queue's turns are kept in a table of their own (storage_file_trash_turns, document_file_trash_turns, document_requests_due_turns)", kept);
  /** How many turns differ from their queue counted afresh (null without the tables). */
  const drift = async () => {
    if (!kept) return null;
    return one(`
      with s as (
        select (t.path is not null) as exact, coalesce(t.candidate_id::text, t.application_id::text, t.bucket || ':' || coalesce(t.path, t.folder)) as person, count(*)::int as waiting,
               (array_agg(case when t.attempts > 0 then coalesce(t.last_tried_at, t.queued_at) + least(t.attempts, 24) * interval '1 hour' + interval '30 minutes' else t.queued_at end order by t.attempts, t.queued_at, t.id))[1] as first_due
          from public.storage_file_trash t group by 1, 2
      ), sv as (select s.*, v.served_at from s left join public.storage_file_trash_served v on v.exact = s.exact and v.person = s.person),
      d as (
        select coalesce(t.employer_id, t.candidate_id)::text as person, count(*)::int as waiting, (count(*) filter (where t.attempts > 0))::int as failed,
               (array_agg(case when t.attempts > 0 then coalesce(t.last_tried_at, t.queued_at) + least(t.attempts, 24) * interval '1 hour' + interval '30 minutes' else t.queued_at end order by t.attempts, t.queued_at, t.id))[1] as first_due
          from public.document_file_trash t group by 1
      ), dv as (select d.*, v.served_at from d left join public.document_cleanup_served v on v.queue = 'deleted' and v.person = d.person),
      q as (
        select coalesce(r.employer_id, r.candidate_id)::text as person, count(*)::int as on_file,
               least(min(r.team_opened_at) + interval '24 hours', min(r.submitted_at) filter (where r.team_opened_at is null) + interval '168 hours',
                     min(r.created_at) filter (where r.team_opened_at is null and r.submitted_at is null) + interval '168 hours') as first_due
          from public.document_requests r where r.file_url is not null and r.document_type in ('government_id', 'nbi_clearance', 'proof_of_address') group by 1
      ), qv as (select q.*, v.served_at from q left join public.document_cleanup_served v on v.queue = 'due' and v.person = q.person)
      select (select count(*)::int from ((select * from sv except select exact, person, waiting, first_due, served_at from public.storage_file_trash_turns)
                                         union all (select exact, person, waiting, first_due, served_at from public.storage_file_trash_turns except select * from sv)) x) as removal,
             (select count(*)::int from ((select * from dv except select person, waiting, failed, first_due, served_at from public.document_file_trash_turns)
                                         union all (select person, waiting, failed, first_due, served_at from public.document_file_trash_turns except select * from dv)) x) as deleted,
             (select count(*)::int from ((select * from qv except select person, on_file, first_due, served_at from public.document_requests_due_turns)
                                         union all (select person, on_file, first_due, served_at from public.document_requests_due_turns except select * from qv)) x) as due`);
  };
  const noDrift = (d) => d !== null && d.removal === 0 && d.deleted === 0 && d.due === 0;

  // (a) Every way a queue is written: rows in and out, a note's tries and
  // times, a note moved to another person, the record written and cleared.
  await db.exec(`delete from public.storage_file_trash; delete from public.storage_file_trash_served; delete from public.document_file_trash; delete from public.document_cleanup_served;`);
  const [P1, P2, P3, P4] = [id("e", 1), id("e", 2), id("e", 3), id("e", 4)];
  await db.query(`insert into public.storage_file_trash (bucket, folder, starts_with, path, application_id, candidate_id, attempts, queued_at, last_tried_at)
    select b, case when b = 'resumes' then null else p::text end, case when b = 'resumes' then null else 'x' || g || '-' end,
           case when b = 'resumes' then p::text || '/' || g || '.pdf' end, null, p, (g % 3 = 0)::int * 2, now() - interval '1 minute' * g, case when g % 3 = 0 then now() - interval '2 hours' end
      from unnest($1::uuid[]) p, unnest(array['videos', 'resumes']) b, generate_series(1, 5) g`, [[P1, P2, P3]]);
  await db.query(`insert into public.storage_file_trash (bucket, folder, starts_with) values ('portfolios', 'nobody-folder', '')`);
  const writes = [
    `update public.storage_file_trash set attempts = attempts + 1, last_tried_at = now() where candidate_id = '${P1}' and path is null`,
    `update public.storage_file_trash set queued_at = queued_at - interval '1 hour', last_tried_at = last_tried_at - interval '1 hour'`,
    `update public.storage_file_trash set candidate_id = '${P3}' where candidate_id = '${P2}' and path is not null`,
    `delete from public.storage_file_trash where candidate_id = '${P1}' and path is not null`,
    `insert into public.storage_file_trash_served (exact, person, served_at) values (false, '${P1}', now() - interval '3 hours'), (true, '${P3}', now()), (false, 'someone-gone', now())`,
    `update public.storage_file_trash_served set served_at = served_at - interval '1 hour'`,
    `delete from public.storage_file_trash_served where person = '${P1}'`,
    `delete from public.storage_file_trash where candidate_id = '${P2}'`,
    // Some of a person's notes go, not all: the count goes down.
    `delete from public.storage_file_trash where id in (select id from public.storage_file_trash where candidate_id = '${P3}' and path is null order by queued_at limit 2)`,
    // A person's record written while they hold nothing, then a note of theirs
    // queued (with an older time, as a clock that moved might give it).
    `insert into public.storage_file_trash_served (exact, person, served_at) values (false, '${P4}', now())`,
    `insert into public.storage_file_trash (bucket, folder, starts_with, candidate_id, queued_at) values ('videos', '${P4}', 'x-', '${P4}', now() - interval '3 hours')`,
  ];
  const after = [];
  for (const w of writes) {
    await db.query(w);
    after.push((await drift())?.removal ?? null);
  }
  check("the removal queue's turns are the queue as it stands after every kind of write (notes in and out, tries, times, a note moved to another person, the record written and cleared)", kept && after.every((n) => n === 0), show(after));
  const pickedNow = await as(SERVICE, `select id from public.storage_file_trash_fair_pick(false)`);
  check("…and after a run, which writes the record itself", pickedNow.ok && noDrift(await drift()), show({ ok: pickedNow.ok, drift: await drift() }));
  await db.exec(`truncate public.storage_file_trash`);
  check("…and a truncated queue leaves no turn", !kept || (await one(`select count(*)::int n from public.storage_file_trash_turns`)).n === 0);

  const [B1, B2, B3, B4] = [id("e", 11), id("e", 12), id("e", 13), id("e", 14)];
  const docWrites = [
    `insert into public.document_file_trash (candidate_id, request_id, employer_id, attempts, queued_at) select '${P1}', gen_random_uuid(), case when g % 2 = 0 then '${B1}'::uuid else '${B2}'::uuid end, (g % 4 = 0)::int, now() - interval '1 minute' * g from generate_series(1, 12) g`,
    `insert into public.document_file_trash (candidate_id, request_id) values ('${P2}', gen_random_uuid())`,
    `update public.document_file_trash set attempts = attempts + 1, last_tried_at = now() where employer_id = '${B1}'`,
    `update public.document_file_trash set employer_id = '${B1}' where employer_id = '${B2}' and attempts = 0`,
    `insert into public.document_cleanup_served (queue, person, served_at) values ('deleted', '${B1}', now() - interval '2 hours'), ('due', '${B1}', now())`,
    `delete from public.document_file_trash where employer_id = '${B2}'`,
    `delete from public.document_file_trash where id in (select id from public.document_file_trash where employer_id = '${B1}' order by queued_at limit 2)`,
    `insert into public.document_cleanup_served (queue, person, served_at) values ('deleted', '${B3}', now())`,
    `insert into public.document_file_trash (candidate_id, request_id, employer_id, queued_at) values ('${P1}', gen_random_uuid(), '${B3}', now() - interval '3 hours')`,
  ];
  const docAfter = [];
  for (const w of docWrites) {
    await db.query(w);
    docAfter.push((await drift())?.deleted ?? null);
  }
  check("the deleted requests' turns are their queue as it stands after every kind of write", kept && docAfter.every((n) => n === 0), show(docAfter));
  const HOLD = id("e", 20);
  await makeUser(HOLD, "candidate");
  const holdApp = await apply(HOLD, JOB);
  const papers = await as(SERVICE, `insert into public.document_requests (application_id, employer_id, candidate_id, document_type, status, file_url, submitted_at, team_opened_at, created_at)
    select $1, case when g % 2 = 0 then $2::uuid else $3::uuid end, $4::uuid, (array['government_id', 'nbi_clearance', 'proof_of_address', 'custom'])[1 + g % 4], 'submitted',
           case when g % 5 = 0 then null else $4::text || '/' || gen_random_uuid() || '/1.jpg' end,
           case when g % 3 = 0 then null else now() - interval '1 day' * g end, case when g % 2 = 0 then now() - interval '1 hour' * g end, now() - interval '9 days'
      from generate_series(1, 20) g returning id`, [holdApp, B1, B2, HOLD]);
  if (!papers.ok) throw new Error(`setup: the papers: ${papers.error}`);
  const dueWrites = [
    [`update public.document_requests set file_url = null, file_deleted_at = now() where id = $1`, [papers.rows[1].id]],
    [`update public.document_requests set team_opened_at = now() - interval '30 hours' where id = $1`, [papers.rows[2].id]],
    [`update public.document_requests set document_type = 'custom' where id = $1`, [papers.rows[3].id]],
    [`update public.document_requests set status = 'approved', reviewed_at = now() where id = $1`, [papers.rows[4].id]],
    [`delete from public.document_requests where id = $1`, [papers.rows[6].id]],
    [`update public.document_cleanup_served set served_at = served_at - interval '1 hour'`, []],
    [`insert into public.document_cleanup_served (queue, person, served_at) values ('due', $1, now())`, [B4]],
    [`insert into public.document_requests (application_id, employer_id, candidate_id, document_type, status, file_url, submitted_at, created_at) values ($1, $2, $3::uuid, 'government_id', 'submitted', $3::text || '/x/1.jpg', now() - interval '8 days', now() - interval '9 days')`, [holdApp, B4, HOLD]],
    [`delete from public.document_requests where application_id = $1`, [holdApp]],
  ];
  const dueAfter = [];
  for (const [w, params] of dueWrites) {
    const r = await as(SERVICE, w, params);
    if (!r.ok) throw new Error(`setup: ${w}: ${r.error}`);
    dueAfter.push((await drift())?.due ?? null);
  }
  check("the due ID papers' turns are the requests as they stand after every kind of write (a file gone, a paper opened, its kind or status changed, a request deleted)", kept && dueAfter.every((n) => n === 0), show(dueAfter));
  const tries = kept ? await Promise.all(turnsTables.flatMap((t) => [
    as(user(ANA), `select * from ${t}`),
    as(ANON, `select * from ${t}`),
    as(user(ANA), `delete from ${t}`),
    as(SERVICE, `delete from ${t}`),
  ])) : [];
  check("…and no browser may read or write a turn, nor the server but through its own triggers", kept && tries.every((r) => !r.ok), show(tries.map((r) => r.ok || r.error)));

  // (c) What only the turns' order can miss: a person whose first note
  // failed and waits out its back-off ranks after now(), so their other
  // notes, due, are read only when a run has room (the old pick took them,
  // the waiting one last); and businesses served in the same run rank
  // together, and the fewest due goes first among them however many tie.
  await db.exec(`delete from public.storage_file_trash; delete from public.storage_file_trash_served; delete from public.document_file_trash; delete from public.document_cleanup_served;`);
  const [HELD, FREE] = [id("e", 30), id("e", 31)];
  await db.query(`insert into public.storage_file_trash (bucket, folder, starts_with, candidate_id, attempts, queued_at, last_tried_at) values
    ('videos', $1::text, 'a-', $1::uuid, 1, now() - interval '5 hours', now() - interval '30 minutes'),
    ('videos', $1::text, 'b-', $1::uuid, 2, now() - interval '6 hours', now() - interval '4 hours'),
    ('videos', $2::text, 'c-', $2::uuid, 0, now() - interval '1 hour', null)`, [HELD, FREE]);
  const roomy = await as(SERVICE, `select candidate_id, attempts from public.storage_file_trash_fair_pick(false)`);
  check("a person whose first note waits out its back-off has their due note taken when the run has room, the waiting one last (as the old pick did)", roomy.ok && JSON.stringify(roomy.rows.map((n) => [n.candidate_id, n.attempts])) === JSON.stringify([[FREE, 0], [HELD, 2], [HELD, 1]]), show(roomy.rows ?? roomy.error));
  await db.query(`insert into public.document_file_trash (candidate_id, request_id, employer_id, attempts, queued_at, last_tried_at) values
    ($3, gen_random_uuid(), $1, 1, now() - interval '5 hours', now() - interval '30 minutes'),
    ($3, gen_random_uuid(), $1, 2, now() - interval '6 hours', now() - interval '4 hours'),
    ($3, gen_random_uuid(), $2, 0, now() - interval '1 hour', null)`, [HELD, FREE, P1]);
  const roomyPapers = await as(SERVICE, `select employer_id, attempts from public.document_file_trash_fair_pick()`);
  check("…and a business's the same, in the deleted requests' queue", roomyPapers.ok && JSON.stringify(roomyPapers.rows.map((n) => [n.employer_id, n.attempts])) === JSON.stringify([[FREE, 0], [HELD, 2], [HELD, 1]]), show(roomyPapers.rows ?? roomyPapers.error));
  // The businesses one run took rank together (up to 200): 150 with 5 due ID
  // papers each and a real one with 3, its papers due last and its id last,
  // after 199 others taken an hour before them, so the run's 200th place
  // falls inside the tie.
  const EARLY = Array.from({ length: 199 }, (_, i) => `e6${String(i).padStart(6, "0")}-0000-4000-8000-000000000000`);
  const TIED = Array.from({ length: 150 }, (_, i) => `e7${String(i).padStart(6, "0")}-0000-4000-8000-000000000000`);
  const REAL_BIZ = "efffffff-0000-4000-8000-000000000000";
  // (Earlier sections' ID papers still due are set aside: only these rank.)
  const setAside = await as(SERVICE, `update public.document_requests set file_url = null, file_deleted_at = now() where file_url is not null and document_type in ('government_id', 'nbi_clearance', 'proof_of_address') returning id`);
  if (!setAside.ok) throw new Error(`setup: setting earlier papers aside: ${setAside.error}`);
  await makeUser(id("e", 32), "candidate");
  const tieApp = await apply(id("e", 32), JOB);
  const tied = await as(SERVICE, `insert into public.document_requests (application_id, employer_id, candidate_id, document_type, status, file_url, submitted_at, team_opened_at)
    select $1::uuid, b, $2::uuid, 'government_id', 'submitted', $2::text || '/' || gen_random_uuid() || '/1.jpg', now() - interval '40 hours', now() - interval '30 hours' + (n || ' seconds')::interval
      from unnest($3::uuid[]) b, generate_series(1, 5) n
    union all
    select $1::uuid, b, $2::uuid, 'government_id', 'submitted', $2::text || '/' || gen_random_uuid() || '/1.jpg', now() - interval '40 hours', now() - interval '31 hours'
      from unnest($5::uuid[]) b
    union all
    select $1::uuid, $4::uuid, $2::uuid, 'government_id', 'submitted', $2::text || '/' || gen_random_uuid() || '/1.jpg', now() - interval '40 hours', now() - interval '25 hours' - (n || ' seconds')::interval
      from generate_series(1, 3) n`, [tieApp, id("e", 32), TIED, REAL_BIZ, EARLY]);
  if (!tied.ok) throw new Error(`setup: the tied papers: ${tied.error}`);
  await db.query(`insert into public.document_cleanup_served (queue, person, served_at)
    select 'due', b, now() - interval '61 minutes' from unnest($1::text[]) b
    union all select 'due', b, now() - interval '1 minute' from unnest($2::text[]) b`, [EARLY, [...TIED, REAL_BIZ]]);
  const tieRun = await as(SERVICE, `select id from public.document_requests_due_pick(array['government_id', 'nbi_clearance', 'proof_of_address'], now() - interval '24 hours', now() - interval '7 days')`);
  const realPapers = (await db.query(`select id from public.document_requests where employer_id = $1`, [REAL_BIZ])).rows.map((r) => r.id);
  check("businesses one run took rank together: when the run's 200th place falls among them, the one with the fewest due (3 against 5) goes, though its id sorts last", tieRun.ok && tieRun.rows.length === 200 && tieRun.rows.some((r) => realPapers.includes(r.id)), show({ n: tieRun.rows?.length, error: tieRun.error }));
  await as(SERVICE, `delete from public.document_requests where application_id = $1`, [tieApp]);

  // (b) What a run costs as the queues grow ten times over. A run inside a
  // transaction rolled back, each the fastest of seven, so it never changes
  // the record or what the next run sees.
  const runMs = async (sql) => {
    const ms = [];
    for (let i = 0; i < 7; i += 1) {
      await db.query("begin");
      try {
        await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true), set_config('role', 'service_role', true)`);
        const t = performance.now();
        await db.query(sql);
        ms.push(performance.now() - t);
      } finally {
        await db.query("rollback");
      }
    }
    return Math.min(...ms);
  };
  // Less than twice as long, give or take 30 ms (a run that is a few
  // milliseconds either way on a busy machine is not the queue's size; the
  // old picks took 400 to 800 ms more).
  const flat = (small, big) => big < 2 * small + 30;
  const ms = (x) => `${Math.round(x)} ms`;
  await db.exec(`delete from public.storage_file_trash; delete from public.storage_file_trash_served; delete from public.document_file_trash; delete from public.document_cleanup_served;`);
  const queueRemovals = async (folders, paths) => {
    await db.query(`insert into public.storage_file_trash (bucket, folder, starts_with, candidate_id, queued_at)
      select 'videos', p.person::text, gen_random_uuid()::text || '-', p.person, now() - interval '1 second' * (random() * 86400)
        from (select gen_random_uuid() as person from generate_series(1, $1::int / 3)) p, generate_series(1, 3) n`, [folders]);
    await db.query(`insert into public.storage_file_trash (bucket, path, candidate_id, queued_at)
      select 'resumes', p.person::text || '/f' || n || '.pdf', p.person, now() - interval '1 second' * (random() * 86400)
        from (select gen_random_uuid() as person from generate_series(1, $1::int / 6)) p, generate_series(1, 6) n`, [paths]);
  };
  const businesses = (n, from = 0) => Array.from({ length: n }, (_, i) => `e5${String(from + i).padStart(6, "0")}-0000-4000-8000-000000000000`);
  const FLOODED = businesses(400);
  const queueDeleted = (n) => as(SERVICE, `insert into public.document_file_trash (candidate_id, request_id, employer_id, queued_at)
    select $3::uuid, gen_random_uuid(), ($2::uuid[])[1 + (g % array_length($2::uuid[], 1))], now() - interval '1 second' * (random() * 86400)
      from generate_series(1, $1::int) g`, [n, FLOODED, HOLD]);
  await makeUser(id("e", 21), "candidate");
  const DUE_APP = await apply(id("e", 21), JOB);
  const queueDue = (n, from) => as(SERVICE, `insert into public.document_requests (application_id, employer_id, candidate_id, document_type, status, file_url, submitted_at, team_opened_at)
    select $1, ($3::uuid[])[1 + (g % array_length($3::uuid[], 1))], $2::uuid, 'government_id', 'submitted', $2::text || '/' || gen_random_uuid() || '/1.jpg', now() - interval '30 hours', now() - interval '25 hours' - interval '1 second' * (random() * 86400)
      from generate_series(1, $4::int) g`, [DUE_APP, id("e", 21), businesses(n / 10, from), n]);
  const PICKS = {
    folders: `select id from public.storage_file_trash_fair_pick(false)`,
    paths: `select id from public.storage_file_trash_fair_pick(true)`,
    deleted: `select id from public.document_file_trash_fair_pick()`,
    due: `select id from public.document_requests_due_pick(array['government_id', 'nbi_clearance', 'proof_of_address'], now() - interval '24 hours', now() - interval '7 days')`,
  };
  const SMALL = 10000;
  await queueRemovals(SMALL, SMALL);
  const smallDeleted = await queueDeleted(SMALL);
  const smallDue = await queueDue(SMALL, 0);
  if (!smallDeleted.ok || !smallDue.ok) throw new Error(`setup: the papers' queues: ${show({ d: smallDeleted.error, q: smallDue.error })}`);
  const small = {};
  for (const [k, q] of Object.entries(PICKS)) small[k] = await runMs(q);
  await queueRemovals(9 * SMALL, 9 * SMALL);
  await queueDeleted(9 * SMALL);
  await queueDue(9 * SMALL, SMALL / 10);
  const big = {};
  for (const [k, q] of Object.entries(PICKS)) big[k] = await runMs(q);
  const sizes = await one(`select (select count(*)::int from public.storage_file_trash where path is null) as folders, (select count(*)::int from public.storage_file_trash where path is not null) as paths,
    (select count(*)::int from public.document_file_trash) as deleted, (select count(*)::int from public.document_requests where file_url is not null and team_opened_at is not null) as due`);
  check(`the queues grew ten times over: ${show(sizes)}`, sizes.folders >= 9 * SMALL && sizes.paths >= 9 * SMALL && sizes.deleted >= 10 * SMALL && sizes.due >= 10 * SMALL, show(sizes));
  check(`a run of folders at ten times the queue takes less than twice as long (${ms(small.folders)}, then ${ms(big.folders)})`, flat(small.folders, big.folders));
  check(`…of exact paths, the same (${ms(small.paths)}, then ${ms(big.paths)})`, flat(small.paths, big.paths));
  check(`…of deleted requests' files, the same (${ms(small.deleted)}, then ${ms(big.deleted)})`, flat(small.deleted, big.deleted));
  check(`…of ID papers that are due, the same (${ms(small.due)}, then ${ms(big.due)})`, flat(small.due, big.due));
  await db.exec(`delete from public.storage_file_trash; delete from public.storage_file_trash_served; delete from public.document_file_trash; delete from public.document_cleanup_served;`);
  await as(SERVICE, `delete from public.document_requests where application_id = $1`, [DUE_APP]);
}

// The papers' own people for sections 19 and 20 (an id range of their own).
const P13 = (n) => `9d130000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID_KINDS = `array['government_id', 'nbi_clearance', 'proof_of_address']`;
const duePapers = async () => {
  const r = await as(SERVICE, `select id from public.document_requests_due_pick(${ID_KINDS}, now() - interval '24 hours', now() - interval '7 days')`);
  if (!r.ok) throw new Error(`the due pick: ${r.error}`);
  return new Set(r.rows.map((x) => x.id));
};
const paperRow = (request) => one(`select * from public.document_requests where id = $1`, [request]);
const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// ---------------------------------------------------------------------------
console.log("\n19. Who may move an ID paper's clock, and which file a request may point to\n");
{
  // The thirteenth Phase 5 review (finding 1): of document_requests_guard_update
  // only its link clause was held against its latest definition (section 16),
  // and document_requests_guard_insert was tested only by
  // document_requests.pglite on three fixed files. Nine weakenings, one line
  // each, passed every test (K1 to K9); with K7 or K8 another business could
  // open an applicant's ID (probes p2 and p3), with K1 the business kept an
  // opened ID for good. Every migration is applied here, so each now fails a
  // check below.
  const { inOwnFolder } = await import("../supabase/functions/requested-document-url/ownFolder.ts");
  const A = P13(1); // applied to BIZ and to STRANGER
  const OTHER = P13(2); // another applicant of BIZ's
  for (const u of [A, OTHER]) await makeUser(u, "candidate");
  const appBiz = await apply(A, JOB);
  const appOther = await apply(OTHER, JOB);
  const SJOB = (await one(`insert into public.jobs (employer_id, title, description, status) values ($1, 'Phone support agent', 'Answer calls.', 'published') returning id`, [STRANGER])).id;
  const appStranger = await apply(A, SJOB);
  const ask = async (business, application, candidate, type = "government_id") => {
    const r = await as(user(business), `insert into public.document_requests (application_id, employer_id, candidate_id, document_type, custom_document_name) values ($1, $2, $3, $4, case when $4 = 'custom' then 'Anything' end) returning id`, [application, business, candidate, type]);
    if (!r.ok) throw new Error(`setup: ${business} could not ask: ${r.error}`);
    return r.rows[0].id;
  };
  const send = async (who, request, file) => {
    await putFile("requested-documents", file);
    const r = await as(user(who), `update public.document_requests set file_url = $2, file_name = 'ID.jpg', status = 'submitted' where id = $1 returning id`, [request, file]);
    if (!r.ok || r.rows.length !== 1) throw new Error(`setup: the paper could not be sent: ${show(r)}`);
  };
  // BIZ asks A for their ID, A sends it, and the team opened it 25 hours ago
  // (requested-document-url stamps the first opening, as the server).
  const rid = await ask(BIZ, appBiz, A);
  const first = `${A}/${rid}/1729000000000.jpg`;
  await send(A, rid, first);
  await as(SERVICE, `update public.document_requests set team_opened_at = now() - interval '25 hours' where id = $1`, [rid]);
  check("(set-up) an ID opened 25 hours ago is due for deletion", (await duePapers()).has(rid));

  // (a) What the hiring side may not change. Each try also changes the
  // request's note, which the hiring side may, so the update goes through.
  const before = await paperRow(rid);
  const hiringTries = [
    ["when the team first opened it, to never (the review's K1)", "team_opened_at", "2999-01-01T00:00:00Z"],
    ["when the team first opened it, back to unopened (K1: that would start its 24 hours again)", "team_opened_at", null],
    ["when it was sent (K2: the 7 days of a paper nobody opened)", "submitted_at", new Date(Date.now() + 30 * 86_400_000).toISOString()],
    ["when it was asked for (K4: the 7 days of a paper never marked sent)", "created_at", "2999-01-01T00:00:00Z"],
    ["that its file was deleted, while it is there (K5)", "file_deleted_at", new Date().toISOString()],
    ["which file it holds (K8)", "file_url", `${A}/${rid}/1729000000009.jpg`],
    ["whom it is for (K9)", "candidate_id", OTHER],
    ["which application it is on", "application_id", appOther],
    ["which business asked", "employer_id", STRANGER],
    ["what was asked", "document_type", "custom"],
    ["the name of the file sent", "file_name", "forged.jpg"],
    ["the answer typed", "answer_text", "000-000-000"],
  ];
  let note = 0;
  for (const [what, column, value] of hiringTries) {
    note += 1;
    const r = await as(user(BIZ), `update public.document_requests set description = $2, ${column} = $3 where id = $1 returning id`, [rid, `Note ${note}`, value]);
    const after = await paperRow(rid);
    check(`the hiring side cannot change ${what}`, r.ok && r.rows.length === 1 && after.description === `Note ${note}` && sameValue(after[column], before[column]), show({ r: r.error, was: before[column], now: after[column] }));
    if (column === "team_opened_at" && value !== null) check("…so the ID it opened 25 hours ago is still due (the review's p2: the pick no longer took it)", (await duePapers()).has(rid));
  }
  // (b) The same columns are the database's on the applicant's side too.
  const applicantTries = [
    ["when the team first opened it, back to unopened (K1)", "team_opened_at", null],
    ["when it was asked for (K4)", "created_at", "2999-01-01T00:00:00Z"],
    ["that its file was deleted (K5)", "file_deleted_at", new Date().toISOString()],
    ["which business asked", "employer_id", STRANGER],
    ["what was asked", "document_type", "custom"],
  ];
  for (const [what, column, value] of applicantTries) {
    note += 1;
    const r = await as(user(A), `update public.document_requests set file_name = $2, ${column} = $3 where id = $1 returning id`, [rid, `ID ${note}.jpg`, value]);
    const after = await paperRow(rid);
    check(`the applicant cannot change ${what}`, r.ok && r.rows.length === 1 && after.file_name === `ID ${note}.jpg` && sameValue(after[column], before[column]), show({ r: r.error, was: before[column], now: after[column] }));
  }
  const moveAway = await as(user(A), `update public.document_requests set candidate_id = $2 where id = $1 returning id`, [rid, OTHER]);
  check("…nor give the request to someone else (K9)", (await paperRow(rid)).candidate_id === A, show(moveAway));

  // (c) A new file starts its own clock (K3): the team asks again, the
  // applicant sends a new photo, and the earlier opening no longer counts.
  const asked = await as(user(BIZ), `update public.document_requests set status = 'rejected', rejection_reason = 'The photo is blurry' where id = $1 returning id`, [rid]);
  if (!asked.ok) throw new Error(`setup: ask again: ${asked.error}`);
  const second = `${A}/${rid}/1729000000001.jpg`;
  await send(A, rid, second);
  const resent = await paperRow(rid);
  check("a paper sent again is not yet opened (K3: it kept the first copy's opening, and went before the team saw it)", resent.file_url === second && resent.team_opened_at === null && Date.now() - new Date(resent.submitted_at).getTime() < 60_000, show(resent));
  check("…so it is not due for deletion", !(await duePapers()).has(rid));
  // Once document-cleanup has deleted a file, a new one clears that too.
  await as(SERVICE, `update public.document_requests set file_url = null, file_deleted_at = now(), status = 'rejected' where id = $1`, [rid]);
  const third = `${A}/${rid}/1729000000002.jpg`;
  await send(A, rid, third);
  const again = await paperRow(rid);
  check("…and one sent after the cleanup deleted the last is not marked deleted", again.file_url === third && again.file_deleted_at === null && again.team_opened_at === null, show(again));

  // (d) A new request starts empty and unopened, for its application's
  // applicant, filed under the job's owner (document_requests_guard_insert).
  const forged = await as(user(BIZ), `insert into public.document_requests (application_id, employer_id, candidate_id, document_type, status, file_url, file_name, answer_text, submitted_at, team_opened_at, file_deleted_at, reviewed_at, reviewed_by, rejection_reason, candidate_viewed_at)
    values ($1, $2, $3, 'government_id', 'approved', $4, 'ID.jpg', '123', now() - interval '8 days', now() - interval '25 hours', now(), now(), $5, 'No', now()) returning id`, [appBiz, STRANGER, OTHER, third, BIZ]);
  const born = forged.ok ? await paperRow(forged.rows[0].id) : null;
  check("(set-up) the hiring side's request with every field filled in goes in", !!born, show(forged));
  for (const [what, ok] of [
    ["with no file the business chose (K7: it could carry another request's photo)", born?.file_url === null && born?.file_name === null],
    ["not yet opened (K6: its 24 hours would start before anyone opened it)", born?.team_opened_at === null],
    ["not marked deleted, sent, answered, seen or reviewed", born?.file_deleted_at === null && born?.submitted_at === null && born?.answer_text === null && born?.candidate_viewed_at === null && born?.reviewed_at === null && born?.reviewed_by === null && born?.rejection_reason === null],
    ["waiting for the applicant", born?.status === "pending"],
    ["for the application's own applicant, never another (it named another applicant of the business's)", born?.candidate_id === A],
    ["filed under the job's owner (it named another business)", born?.employer_id === BIZ],
  ]) check(`a new request starts ${what}`, ok, show(born));
  if (born) await as(SERVICE, `delete from public.document_requests where id = $1`, [born.id]);

  // (e) The review's proof (probes p2 and p3): another business that A also
  // applied to tries to point a request of its own at BIZ's copy of A's ID.
  const k7 = await as(user(STRANGER), `insert into public.document_requests (application_id, employer_id, candidate_id, document_type, custom_document_name, file_url, file_name) values ($1, $2, $3, 'custom', 'Anything', $4, 'ID.jpg') returning id, file_url`, [appStranger, STRANGER, A, third]);
  check("another business cannot make a request carrying the first business's copy of the ID (K7, probe p2)", k7.ok && (await paperRow(k7.rows[0].id)).file_url === null, show(k7));
  const ridS = await ask(STRANGER, appStranger, A, "custom");
  const k8 = await as(user(STRANGER), `update public.document_requests set file_url = $2 where id = $1 returning id`, [ridS, third]);
  check("…nor point a request of its own at it (K8, probe p3)", (await paperRow(ridS)).file_url === null, show(k8));
  check("…and requested-document-url signs a file only in its request's own folder, so it would not sign it for that business either", inOwnFolder(third, A, rid) && !inOwnFolder(third, A, ridS) && !inOwnFolder(third, A, k7.rows?.[0]?.id ?? ridS));
  for (const r of [k7.rows?.[0]?.id, ridS].filter(Boolean)) await as(SERVICE, `delete from public.document_requests where id = $1`, [r]);
  await db.query(`delete from public.document_file_trash`);
}

// ---------------------------------------------------------------------------
console.log("\n20. A paper sent again, or taken back: the database queues the earlier file\n");
{
  // The thirteenth Phase 5 review (finding 2): the upload dialog deleted the
  // earlier file itself, fire-and-forget, after saving the new link. When
  // that delete did not go through, an ID the team had already opened stayed
  // until the new copy's own deadline (probe p1 D: 25 hours after the team
  // opened the first copy, nothing was due). document_requests_guard_update
  // queues it now (20261025640000), and document_file_trash_fair_pick takes
  // it in the next run.
  await db.query(`delete from public.document_file_trash`);
  const B = P13(10);
  await makeUser(B, "candidate");
  const app = await apply(B, JOB);
  const asked = await as(user(BIZ), `insert into public.document_requests (application_id, employer_id, candidate_id, document_type) values ($1, $2, $3, 'government_id') returning id`, [app, BIZ, B]);
  const rid = asked.rows[0].id;
  const link = (file) => as(user(B), `update public.document_requests set file_url = $2, file_name = 'ID.jpg', status = 'submitted' where id = $1 returning id`, [rid, file]);
  const notesOf = async (request) => (await db.query(`select candidate_id, request_id, file_url, employer_id from public.document_file_trash where request_id = $1 order by queued_at, file_url`, [request])).rows;
  const f = (n) => `${B}/${rid}/17290000000${String(n).padStart(2, "0")}.jpg`;
  await putFile("requested-documents", f(0));
  await link(f(0));
  check("a paper sent for the first time queues nothing", (await notesOf(rid)).length === 0);
  await as(SERVICE, `update public.document_requests set team_opened_at = now() - interval '25 hours' where id = $1`, [rid]);
  await as(user(BIZ), `update public.document_requests set status = 'rejected', rejection_reason = 'The photo is blurry' where id = $1`, [rid]);
  await putFile("requested-documents", f(1));
  const resent = await link(f(1));
  const queued = await notesOf(rid);
  check("sent again, the earlier file is queued for document-cleanup, naming the applicant and the business that asked", resent.ok && queued.length === 1 && queued[0].file_url === f(0) && queued[0].candidate_id === B && queued[0].employer_id === BIZ, show({ resent: resent.error, queued }));
  const picked = await as(SERVICE, `select request_id, file_url from public.document_file_trash_fair_pick()`);
  check("…and document_file_trash_fair_pick gives it to the next run, as it does a deleted request's", picked.ok && picked.rows.some((n) => n.request_id === rid && n.file_url === f(0)), show(picked));
  await db.query(`delete from public.document_file_trash`);
  // A file storage no longer holds (the dialog's own delete went first) leaves no note.
  await db.query(`delete from storage.objects where bucket_id = 'requested-documents' and name = $1`, [f(1)]);
  await putFile("requested-documents", f(2));
  await link(f(2));
  check("a file storage no longer holds leaves no note", (await notesOf(rid)).length === 0, show(await notesOf(rid)));
  // A link the database refuses queues nothing (the update never happens).
  const refused = await link(`${B}/${rid}/never-uploaded.jpg`);
  check("a link the database refuses queues nothing", !refused.ok && (await notesOf(rid)).length === 0 && (await paperRow(rid)).file_url === f(2), show(refused));
  // Taken back: the applicant clears the link.
  const cleared = await as(user(B), `update public.document_requests set file_url = null where id = $1 returning id`, [rid]);
  check("a paper taken back (its link cleared) queues its file too", cleared.ok && JSON.stringify((await notesOf(rid)).map((n) => n.file_url)) === JSON.stringify([f(2)]), show({ cleared: cleared.error, notes: await notesOf(rid) }));
  await db.query(`delete from public.document_file_trash`);
  // The server clearing a link it deleted (document-cleanup) queues nothing;
  // the hiring side cannot change the link, so neither does it.
  await putFile("requested-documents", f(3));
  await link(f(3));
  await as(user(BIZ), `update public.document_requests set file_url = null, description = 'Thanks' where id = $1`, [rid]);
  check("the hiring side's update queues nothing (it cannot touch the link)", (await notesOf(rid)).length === 0 && (await paperRow(rid)).file_url === f(3));
  await as(SERVICE, `update public.document_requests set file_url = null, file_deleted_at = now() where id = $1`, [rid]);
  check("…nor does document-cleanup's own clearing, once it deleted the file", (await notesOf(rid)).length === 0);

  // At most 50 a day for one applicant: one account sending a paper again in
  // a loop cannot fill its business's turn in that queue. Every send still
  // goes through. The limit counts by UTC day: a run that crosses midnight is
  // not counted.
  const LOOP = P13(11);
  await makeUser(LOOP, "candidate");
  const loopApp = await apply(LOOP, JOB);
  const loopRid = (await as(user(BIZ), `insert into public.document_requests (application_id, employer_id, candidate_id, document_type) values ($1, $2, $3, 'government_id') returning id`, [loopApp, BIZ, LOOP])).rows[0].id;
  const day = () => new Date().toISOString().slice(0, 10);
  const startedOn = day();
  let sends = 0;
  for (let n = 0; n <= 55; n += 1) {
    const file = `${LOOP}/${loopRid}/${1729000000000 + n}.jpg`;
    await putFile("requested-documents", file);
    const r = await as(user(LOOP), `update public.document_requests set file_url = $2, status = 'submitted' where id = $1 returning id`, [loopRid, file]);
    if (r.ok && r.rows.length === 1) sends += 1;
  }
  const loopNotes = (await notesOf(loopRid)).length;
  check("one applicant sending a paper again 55 times: every send goes in, 50 earlier files are queued that day", day() !== startedOn || (sends === 56 && loopNotes === 50), show({ sends, loopNotes }));
  await db.query(`delete from public.document_file_trash`);
}

// ---------------------------------------------------------------------------
console.log("\n21. An ID photo an open request never linked goes seven days after it was asked for\n");
{
  // The thirteenth Phase 5 review (finding 2) left one: an applicant's ID
  // photo went up, saving its link failed and so did the upload dialog's own
  // removal, and the request stayed open: nothing on a timer found the file,
  // since the due pick takes a request by its link. Before it picks, the due
  // pick now looks at ID requests with no link asked for seven days ago, each
  // once, at most 5,000 a run, and queues the files in each one's own folder
  // in document_file_trash (20261025630000): document-cleanup deletes that
  // file alone in the business's turn.
  const R21 = (n) => `9d210000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const SWEPT = (await one(`select to_regclass('public.document_requests_swept') is not null as there`)).there;
  if (SWEPT) await db.query(`update public.document_requests_swept set created_at = '-infinity', id = '00000000-0000-0000-0000-000000000000'`);
  await db.query(`delete from public.document_file_trash`);
  const STRAY = R21(1);
  await makeUser(STRAY, "candidate");
  const strayApp = await apply(STRAY, JOB);
  /** A request as the business made it, asked for `days` ago (the server's stamp). */
  const asked = async (type, days) => {
    const r = await as(SERVICE, `insert into public.document_requests (application_id, employer_id, candidate_id, document_type, custom_document_name, created_at)
      values ($1, $2, $3, $4, case when $4 = 'custom' then 'Diploma' end, now() - interval '1 day' * $5) returning id`, [strayApp, BIZ, STRAY, type, days]);
    if (!r.ok) throw new Error(`setup: the request: ${r.error}`);
    return r.rows[0].id;
  };
  const strayOld = await asked("government_id", 8);
  const emptyOld = await asked("nbi_clearance", 8);
  const strayYoung = await asked("government_id", 6);
  const namedOld = await asked("custom", 8);
  const linkedOld = await asked("proof_of_address", 8);
  const strayFile = `${STRAY}/${strayOld}/1729000000000.jpg`;
  const youngFile = `${STRAY}/${strayYoung}/1729000000000.jpg`;
  const namedFile = `${STRAY}/${namedOld}/1729000000000.pdf`;
  const linkedFile = `${STRAY}/${linkedOld}/1729000000000.jpg`;
  for (const f of [strayFile, youngFile, namedFile, linkedFile]) await putFile("requested-documents", f);
  const linked = await as(user(STRAY), `update public.document_requests set file_url = $2, file_name = 'Bill.jpg', status = 'submitted' where id = $1`, [linkedOld, linkedFile]);
  if (!linked.ok) throw new Error(`setup: the link: ${linked.error}`);
  const notesFor = async (request) => (await db.query(`select file_url, employer_id from public.document_file_trash where request_id = $1`, [request])).rows;
  const picked = await duePapers();
  check("an ID request with no link, asked for 8 days ago, whose folder holds a photo: the photo is queued for deletion, naming the business that asked", SWEPT && JSON.stringify(await notesFor(strayOld)) === JSON.stringify([{ file_url: strayFile, employer_id: BIZ }]), show(await notesFor(strayOld)));
  check("…an ID request with no link whose folder holds nothing: nothing queued", (await notesFor(emptyOld)).length === 0);
  check("…one asked for 6 days ago: not yet", (await notesFor(strayYoung)).length === 0);
  check("…a paper named under \"Something else\": never (it is kept until its application goes)", (await notesFor(namedOld)).length === 0);
  check("…a request with a link: not by this (its file goes on its own clock)", (await notesFor(linkedOld)).length === 0 && !picked.has(strayOld));
  const trashRun = await as(SERVICE, `select request_id, file_url from public.document_file_trash_fair_pick()`);
  check("…and document_file_trash_fair_pick takes the photo in the business's turn", trashRun.ok && trashRun.rows.some((n) => n.request_id === strayOld && n.file_url === strayFile), show(trashRun.rows?.length));
  await db.query(`delete from public.document_file_trash where request_id = $1`, [strayOld]);
  await duePapers();
  check("each request is looked at once: the next run does not queue it again", (await notesFor(strayOld)).length === 0);
  const dayOn = await as(SERVICE, `select id from public.document_requests_due_pick(${ID_KINDS}, now() - interval '24 hours', now() - interval '5 days')`);
  check("…and the one asked for 6 days ago is queued once its seven days are up (here: the cutoff two days on)", dayOn.ok && JSON.stringify((await notesFor(strayYoung)).map((n) => n.file_url)) === JSON.stringify([youngFile]), show(await notesFor(strayYoung)));
  // Storage cannot be read: nothing is queued and the mark stays, so the
  // request is looked at again; the due papers are picked all the same.
  await db.query(`delete from public.document_file_trash`);
  const later = await asked("government_id", 9);
  const laterFile = `${STRAY}/${later}/1729000000000.jpg`;
  await putFile("requested-documents", laterFile);
  if (SWEPT) await db.query(`update public.document_requests_swept set created_at = '-infinity', id = '00000000-0000-0000-0000-000000000000'`);
  await db.exec(`alter table storage.objects rename to objects_away`);
  let blind;
  try {
    blind = await as(SERVICE, `select id from public.document_requests_due_pick(${ID_KINDS}, now() - interval '24 hours', now() - interval '7 days')`);
  } finally {
    await db.exec(`alter table storage.objects_away rename to objects`);
  }
  const markAfterBlind = SWEPT ? await one(`select created_at = '-infinity' as unmoved from public.document_requests_swept`) : null;
  check("when storage cannot be read, the due pick still answers, nothing is queued, and the mark does not move", blind.ok && (await notesFor(later)).length === 0 && markAfterBlind?.unmoved === true, show({ blind: blind.error, mark: markAfterBlind }));
  await duePapers();
  check("…so the next run queues it", JSON.stringify((await notesFor(later)).map((n) => n.file_url)) === JSON.stringify([laterFile]), show(await notesFor(later)));
  // 6,000 ID requests with no link and nothing in their folders, asked for
  // before a real one whose photo is there: 5,000 a run, so it is queued in
  // the second run.
  await db.query(`delete from public.document_file_trash`);
  const flooded = await as(SERVICE, `insert into public.document_requests (application_id, employer_id, candidate_id, document_type, created_at)
    select $1, $2, $3, 'government_id', now() - interval '20 days' + g * interval '1 second' from generate_series(1, 6000) g`, [strayApp, STRANGER, STRAY]);
  if (!flooded.ok) throw new Error(`setup: the flood: ${flooded.error}`);
  const real = await asked("government_id", 10);
  const realFile = `${STRAY}/${real}/1729000000000.jpg`;
  await putFile("requested-documents", realFile);
  if (SWEPT) await db.query(`update public.document_requests_swept set created_at = '-infinity', id = '00000000-0000-0000-0000-000000000000'`);
  const runsTill = [];
  for (let run = 1; run <= 3 && (await notesFor(real)).length === 0; run += 1) {
    await duePapers();
    runsTill.push(run);
  }
  check("6,000 such requests with nothing in their folders asked for before a real one: its photo is queued in the second run (5,000 looked at a run)", (await notesFor(real)).length === 1 && runsTill.at(-1) === 2, show(runsTill));
  const sweepTries = [
    await as(user(STRAY), `select public.document_requests_sweep_strays(${ID_KINDS}, now())`),
    await as(user(STRAY), `select * from public.document_requests_swept`),
    await as(ANON, `update public.document_requests_swept set created_at = 'infinity'`),
  ];
  check("…and no browser may run the sweep or move its mark", sweepTries.every((r) => !r.ok), show(sweepTries.map((r) => r.ok || r.error)));
  await as(SERVICE, `delete from public.document_requests where application_id = $1`, [strayApp]);
  await db.query(`delete from public.document_file_trash`);
}

// ---------------------------------------------------------------------------
console.log("\n22. Contact counts as it was made, whatever the business deletes since\n");
{
  // The fourteenth Phase 5 review (finding 1, probe p2): the pause read the
  // contact rows as they stood when the third report came, and the business
  // can delete every one of them. A business that asked three applicants for
  // a training fee in Messages and then deleted the messages, cancelled its
  // requests, deleted its interviews, or removed the three with Delete their
  // information, was never paused; in the last case not even the admins'
  // "reported 3 times" bell rang. Contact is now recorded when it is made
  // (private.business_contacts, 20261025670000).
  const R22 = (n) => `9d220000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const status = async (b) => (await one(`select public.business_status_of($1) as s`, [b])).s;
  const jobStatus = async (j) => (await one(`select status::text s from public.jobs where id = $1`, [j])).s;
  const report = (u, job) => as(user(u), `select public.report_employer($1, 'asked_for_money', 'They asked me to pay for training.') as id`, [job]);
  const rang = async (title) => (await one(`select count(*)::int n from public.notifications n join public.platform_admins a on a.user_id = n.user_id where n.title = $1`, [title])).n;
  const contacted = async (b, u) => {
    const r = await as(SERVICE, `select public.business_has_contacted($1, $2) as yes`, [b, u]);
    if (!r.ok) throw new Error(`business_has_contacted: ${r.error}`);
    return r.rows[0].yes;
  };
  /** What the record holds for a business and a person, as "applied,message" ("no record" without it). */
  const kinds = async (b, u) => {
    try {
      return (await db.query(`select kind from private.business_contacts where employer_id = $1 and person_id = $2 order by kind`, [b, u])).rows.map((r) => r.kind).join(",");
    } catch (e) {
      return `no record: ${e.message}`;
    }
  };
  /** A confirmed business with a live job and three applicants. */
  const business = async (n, name) => {
    const b = R22(100 + n);
    await makeUser(b, "employer", { full_name: `${name} owner`, company_name: name });
    await db.query(`update public.profiles set email_verified_at = now(), email_verified_for = email where user_id = $1`, [b]);
    const j = (await one(`insert into public.jobs (employer_id, title, description, status) values ($1, 'Chat support agent', 'Answer chats.', 'published') returning id`, [b])).id;
    const people = [];
    for (let k = 0; k < 3; k += 1) {
      const u = R22(1000 + n * 10 + k);
      await makeUser(u, "candidate");
      people.push({ u, app: await apply(u, j) });
    }
    return { b, j, people };
  };
  const reportAll = async (biz, job = biz.j) => {
    const out = [];
    for (const p of biz.people) out.push(await report(p.u, job));
    return out;
  };
  const paused = async (biz, job = biz.j) => (await status(biz.b)) === "suspended" && (await jobStatus(job)) === "closed";

  // (a) Messages in the app, then deleted by the job's owner through the API.
  const A = await business(1, "Fee Clinic");
  for (const p of A.people) {
    const m = await as(user(A.b), `insert into public.messages (sender_id, receiver_id, application_id, content) values ($1, $2, $3, 'Please send the 1,500 peso training fee to this GCash number.')`, [A.b, p.u, p.app]);
    if (!m.ok) throw new Error(`setup: message: ${m.error}`);
  }
  const firstAt = async (b, u, kind) => (await db.query(`select first_at::text t from private.business_contacts where employer_id = $1 and person_id = $2 and kind = $3`, [b, u, kind]).catch(() => ({ rows: [] }))).rows[0]?.t ?? null;
  const firstMessage = await firstAt(A.b, A.people[0].u, "message");
  await db.query(`update private.business_contacts set first_at = first_at - interval '1 hour' where employer_id = $1 and person_id = $2 and kind = 'message'`, [A.b, A.people[0].u]).catch(() => null);
  const anHourAgo = await firstAt(A.b, A.people[0].u, "message");
  const again = await as(user(A.b), `insert into public.messages (sender_id, receiver_id, application_id, content) values ($1, $2, $3, 'Did you send it?')`, [A.b, A.people[0].u, A.people[0].app]);
  check("(a) the record keeps when the business first wrote to someone: a later message does not move it", !!firstMessage && again.ok && anHourAgo !== firstMessage && (await firstAt(A.b, A.people[0].u, "message")) === anHourAgo, show({ firstMessage, anHourAgo, now: await firstAt(A.b, A.people[0].u, "message") }));
  const deleted = await as(user(A.b), `delete from public.messages where sender_id = $1 returning id`, [A.b]);
  check("…the business deletes the four messages it sent through the API", deleted.ok && deleted.rows.length === 4, show(deleted));
  check("…and it is still in touch with them, as of the messages it sent", (await contacted(A.b, A.people[0].u)) === true && (await kinds(A.b, A.people[0].u)) === "applied,message", await kinds(A.b, A.people[0].u));
  const pausedBellA = await rang("A business was paused");
  const repA = await reportAll(A);
  check("…so their three reports pause it and close its job, and the admins are told", repA.every((r) => r.ok) && (await paused(A)) && (await rang("A business was paused")) === pausedBellA + 1, show({ repA, s: await status(A.b) }));

  // (b) A request for papers, cancelled before anyone answers it.
  const B = await business(2, "Fee Shop");
  for (const p of B.people) {
    const r = await as(user(B.b), `insert into public.document_requests (application_id, employer_id, candidate_id, document_type) values ($1, $2, $3, 'government_id') returning id`, [p.app, B.b, p.u]);
    if (!r.ok) throw new Error(`setup: ask: ${r.error}`);
    const c = await as(user(B.b), `delete from public.document_requests where id = $1 returning id`, [r.rows[0].id]);
    if (!c.ok || c.rows.length !== 1) throw new Error(`setup: cancel: ${show(c)}`);
  }
  await reportAll(B);
  check("(b) papers asked of three people, each request cancelled: their three reports pause it", (await paused(B)) && (await kinds(B.b, B.people[1].u)) === "applied,document_request", `${await status(B.b)} ${await kinds(B.b, B.people[1].u)}`);

  // (c) An interview with each, then deleted.
  const C = await business(3, "Fee Desk");
  for (const p of C.people) {
    const i = await as(user(C.b), `insert into public.interviews (application_id, scheduled_at) values ($1, now() + interval '1 day') returning id`, [p.app]);
    if (!i.ok) throw new Error(`setup: interview: ${i.error}`);
    const d = await as(user(C.b), `delete from public.interviews where id = $1 returning id`, [i.rows[0].id]);
    if (!d.ok || d.rows.length !== 1) throw new Error(`setup: interview delete: ${show(d)}`);
  }
  await reportAll(C);
  check("(c) an interview with three people, each deleted: their three reports pause it", (await paused(C)) && (await kinds(C.b, C.people[2].u)) === "applied,interview", `${await status(C.b)} ${await kinds(C.b, C.people[2].u)}`);

  // (d) Messaged, then removed with Delete their information.
  const D = await business(4, "Fee Line");
  for (const p of D.people) {
    const m = await as(user(D.b), `insert into public.messages (sender_id, receiver_id, application_id, content) values ($1, $2, $3, 'Pay the fee.')`, [D.b, p.u, p.app]);
    if (!m.ok) throw new Error(`setup: message: ${m.error}`);
  }
  for (const p of D.people) {
    const r = await as(SERVICE, `select public.remove_applicant($1, $2, 'not a fit') as r`, [p.app, D.b]);
    if (!r.ok || r.rows[0].r?.ok !== true) throw new Error(`setup: remove: ${show(r)}`);
  }
  const pausedBellD = await rang("A business was paused");
  const repD = await reportAll(D);
  check(
    "(d) messaged three people, then removed them with Delete their information: their reports are taken, pause it, and the admins are told",
    repD.every((r) => r.ok) && (await paused(D)) && (await rang("A business was paused")) === pausedBellD + 1 && (await one(`select count(*)::int n from public.applications a join public.jobs j on j.id = a.job_id where j.employer_id = $1`, [D.b])).n === 0,
    show({ repD, s: await status(D.b) }),
  );

  // (d, never contacted) Removed with Delete their information, never contacted.
  const E = await business(5, "Quiet Co");
  for (const p of E.people) {
    const r = await as(SERVICE, `select public.remove_applicant($1, $2, 'not a fit') as r`, [p.app, E.b]);
    if (!r.ok || r.rows[0].r?.ok !== true) throw new Error(`setup: remove: ${show(r)}`);
  }
  const threeBell = await rang("A business was reported 3 times");
  const repE = await reportAll(E);
  check("(d) three people it removed without ever being in touch: their reports are taken and it stays open", repE.every((r) => r.ok) && (await status(E.b)) !== "suspended" && (await jobStatus(E.j)) === "published", show({ repE, s: await status(E.b) }));
  check("…and the admins' \"reported 3 times\" bell still rings, once: a removed applicant still counts as having applied", (await rang("A business was reported 3 times")) === threeBell + 1, String((await rang("A business was reported 3 times")) - threeBell));

  // (e) A document, a teammate's message and a request, then the teammate
  // taken off the team, the document deleted and the whole job deleted; the
  // three report the business's other job.
  const F = await business(6, "Fee Agency");
  const TEAMMATE = R22(200);
  await makeUser(TEAMMATE, "team_member", { full_name: "Teammate" });
  await db.query(`insert into public.team_members (user_id, employer_id, email, status, can_message_candidates, can_manage_pipeline, assigned_job_ids) values ($1, $2, $3, 'active', true, true, '{}'::uuid[])`, [TEAMMATE, F.b, emailOf(TEAMMATE)]);
  const [f0, f1, f2] = F.people;
  const doc = await as(user(F.b), `insert into public.documents (application_id, name, file_url, recipient_id) values ($1, 'Training agreement', 'data:text/plain;base64,eA==', $2) returning id`, [f0.app, f0.u]);
  const teamMsg = await as(user(TEAMMATE), `insert into public.messages (sender_id, receiver_id, application_id, content) values ($1, $2, $3, 'Send the fee to this GCash.')`, [TEAMMATE, f1.u, f1.app]);
  const ask = await as(user(F.b), `insert into public.document_requests (application_id, employer_id, candidate_id, document_type) values ($1, $2, $3, 'government_id')`, [f2.app, F.b, f2.u]);
  if (!doc.ok || !teamMsg.ok || !ask.ok) throw new Error(`setup: ${show({ doc, teamMsg, ask })}`);
  const docGone = await as(user(F.b), `delete from public.documents where id = $1 returning id`, [doc.rows[0].id]);
  const teamGone = await as(user(F.b), `delete from public.team_members where user_id = $1 returning user_id`, [TEAMMATE]);
  const otherJob = (await one(`insert into public.jobs (employer_id, title, description, status) values ($1, 'Phone support agent', 'Answer the phone.', 'published') returning id`, [F.b])).id;
  const jobGone = await as(user(F.b), `delete from public.jobs where id = $1 returning id`, [F.j]);
  check("(e) the business deletes the document, takes the teammate off its team and deletes the whole job", docGone.ok && docGone.rows.length === 1 && teamGone.ok && teamGone.rows.length === 1 && jobGone.ok && jobGone.rows.length === 1, show({ docGone, teamGone, jobGone }));
  check("…and is still in touch with all three (a document, its teammate's message, a request)", (await contacted(F.b, f0.u)) && (await contacted(F.b, f1.u)) && (await contacted(F.b, f2.u)), `${await kinds(F.b, f0.u)} | ${await kinds(F.b, f1.u)} | ${await kinds(F.b, f2.u)}`);
  await reportAll(F, otherJob);
  check("…so their three reports on its other job pause it", await paused(F, otherJob), await status(F.b));

  // Nobody makes a business look in touch but the business: an applicant's
  // own message, or another business's.
  const G = await business(7, "Honest Co");
  const [g0, g1, g2] = G.people;
  const own = await as(user(g0.u), `insert into public.messages (sender_id, receiver_id, application_id, content) values ($1, $2, $3, 'Hello, any news?')`, [g0.u, G.b, g0.app]);
  await db.query(`insert into public.messages (sender_id, receiver_id, content) values ($1, $2, 'from another business')`, [A.b, g1.u]);
  check(
    "an applicant's own message, or another business's, does not put this business in touch with them (nor the other, which they never applied to)",
    own.ok && (await contacted(G.b, g0.u)) === false && (await contacted(G.b, g1.u)) === false && (await kinds(G.b, g0.u)) === "applied" && (await kinds(g0.u, G.b)) === "" && (await kinds(A.b, g1.u)) === "",
    show({ own, g0: await kinds(G.b, g0.u), back: await kinds(g0.u, G.b), other: await kinds(A.b, g1.u) }),
  );
  const forge = await as(user(g0.u), `insert into public.messages (sender_id, receiver_id, application_id, content) values ($1, $2, $3, 'forged')`, [G.b, g0.u, g0.app]);
  check("…and nobody sends a message as the business", !forge.ok && (await contacted(G.b, g0.u)) === false, show(forge));

  // The record is nobody's to read, write or delete through the API.
  const tries = [
    await as(user(A.b), `delete from private.business_contacts where employer_id = $1`, [A.b]),
    await as(user(A.b), `select * from private.business_contacts`),
    await as(user(g0.u), `insert into private.business_contacts (employer_id, person_id, kind) values ($1, $2, 'message')`, [G.b, g0.u]),
    await as(ANON, `select count(*) from private.business_contacts`),
    await as(SERVICE, `delete from private.business_contacts where employer_id = $1`, [A.b]),
    await as(SERVICE, `update private.business_contacts set kind = 'applied' where employer_id = $1`, [A.b]),
    await as(user(g0.u), `select public.business_contacts_remember()`),
  ];
  check("no browser, nor the service role, may read, write or delete the record, or call its trigger function", tries.every((r) => !r.ok) && (await kinds(A.b, A.people[0].u)) === "applied,message", show(tries.map((r) => r.ok || r.error)));

  // The person's own account deletion takes their rows with it.
  const leaver = A.people[2].u;
  const leaverHad = await kinds(A.b, leaver);
  await db.query(`delete from auth.users where id = $1`, [leaver]);
  check("a person's own Delete Account takes their rows with it", leaverHad === "applied,message" && (await kinds(A.b, leaver)) === "", `${leaverHad} -> ${await kinds(A.b, leaver)}`);

  // Filled from today's rows: run the migration again on an emptied record.
  const sent = await as(user(g2.u), `update public.applications set status = 'pending' where id = $1 returning id`, [g2.app]);
  if (!sent.ok || sent.rows.length !== 1) throw new Error(`setup: send: ${show(sent)}`);
  const withdrew = await as(user(g2.u), `delete from public.applications where id = $1 returning id`, [g2.app]);
  if (!withdrew.ok || withdrew.rows.length !== 1) throw new Error(`setup: withdraw: ${show(withdrew)}`);
  const fill = files.find((f) => f.endsWith("_contact_kept_when_made.sql"));
  if (fill) {
    await db.query(`delete from private.business_contacts`);
    await db.exec(prepare(readFileSync(path.join(MIGRATIONS, fill), "utf8")));
  }
  const filled = { q: await kinds(QBIZ, S[0]), p: await kinds(PBIZ, R[0]), d: await kinds(D.b, D.people[0].u), e: await kinds(E.b, E.people[0].u), g: await kinds(G.b, g2.u), b: await kinds(B.b, B.people[0].u) };
  check(
    "the migration fills the record from today's rows: messages (section 5's, and (d)'s to people since removed), applications, removal notes and withdrawal notes",
    !!fill && filled.q === "applied,message" && filled.p === "applied" && filled.d === "applied,message" && filled.e === "applied" && filled.g === "applied" && (await contacted(QBIZ, S[0])) === true && (await contacted(PBIZ, R[0])) === false,
    show({ fill, filled }),
  );
  check("…and contact deleted before it ran is not made up ((a)'s deleted messages, (b)'s cancelled requests)", (await kinds(A.b, A.people[0].u)) === "applied" && filled.b === "applied", show({ a: await kinds(A.b, A.people[0].u), b: filled.b }));
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
