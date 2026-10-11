#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/*_business_basics_server.sql (the
 * 2026-10-11 overview, step 3, server half):
 *
 *   1. A suspended business cannot publish a job (new or reopened); a business
 *      in good standing can; the server and the platform admin (who reopens
 *      jobs when un-pausing a business) can.
 *   2. published_jobs_public shows a suspended business's job to nobody but
 *      that business.
 *   3. Visits: the home business counts only its own jobs' old id addresses,
 *      never another business's; the shared sign-in page counts for it only
 *      until another business has a live job, then its own applications.
 *
 * Run with: node scripts/business_basics_server.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");

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

const ZACK = "10000000-0000-4000-8000-000000000001";
const LUCKY = "10000000-0000-4000-8000-000000000002";
const LATE = "10000000-0000-4000-8000-000000000003"; // a business with no careers address yet
const ANA = "20000000-0000-4000-8000-000000000001";
const JOB_Z = "30000000-0000-4000-8000-00000000000a";
const JOB_DRAFT = "30000000-0000-4000-8000-00000000000d";

async function migration(pattern) {
  const names = (await readdir(MIGRATIONS)).filter((n) => pattern.test(n));
  return names.length === 1 ? readFile(path.join(MIGRATIONS, names[0]), "utf8") : null;
}

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant anon to postgres; grant authenticated to postgres; grant service_role to postgres;
    grant usage on schema auth to anon, authenticated, service_role;
    grant select on auth.users to service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant execute on function auth.role() to anon, authenticated, service_role;
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create type public.job_status as enum ('draft', 'published', 'closed');
    create table public.profiles (user_id uuid primary key, full_name text, company_name text);
    create table public.user_roles (user_id uuid, role text);
    -- jobs, with every column the public view reads (live, 2026-10-10).
    create table public.jobs (
      id uuid primary key default gen_random_uuid(), employer_id uuid, title text, description text, responsibilities text, requirements text,
      location text, job_type text, experience_level text, department text, skills_required text[], salary_min numeric, salary_max numeric,
      salary_currency text, salary_period text, created_at timestamptz default now(), application_deadline timestamptz, job_code text,
      location_city text, location_region text, location_country text, location_country_code text, latitude numeric, longitude numeric,
      is_remote boolean, locations jsonb, require_resume boolean, application_questions jsonb, quiz_questions jsonb, workflow_steps jsonb,
      exclude_from_feed boolean not null default false, benefits jsonb, status public.job_status not null default 'draft', slug text,
      constraint jobs_slug_format check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$')
    );
    -- As live before this migration: one name per site.
    create unique index jobs_slug_unique on public.jobs (slug) where slug is not null;
    create table public.applications (id uuid primary key default gen_random_uuid(), job_id uuid, candidate_id uuid, created_at timestamptz default now());
    create table public.team_members (user_id uuid, employer_id uuid, status text);
    create or replace function public.is_active_team_member_for_job(p_job_id uuid, p_user_id uuid) returns boolean language sql stable as $$
      select exists (select 1 from public.team_members tm join public.jobs j on j.employer_id = tm.employer_id where j.id = p_job_id and tm.user_id = p_user_id and tm.status = 'active') $$;
    create table public.page_view_daily (day date, path text, referrer_host text, view_count int);

    -- Business standing and the platform admin, as live (20261011100000_business_trust).
    create table public.business_standing (employer_id uuid primary key, status text not null default 'new');
    create or replace function public.business_status_of(p_employer uuid) returns text language sql stable security definer as $$
      select coalesce((select s.status from public.business_standing s where s.employer_id = p_employer), 'new') $$;
    create table public.platform_admins (user_id uuid primary key);
    create or replace function public.is_platform_admin() returns boolean language sql stable security definer as $$
      select exists (select 1 from public.platform_admins where user_id = auth.uid()) $$;
    -- As live: nobody may call business_status_of() directly (a view that
    -- calls it fails for every visitor; the rehearsal on live caught that).
    revoke execute on function public.business_status_of(uuid) from public, anon, authenticated;
    alter table public.business_standing enable row level security;
    insert into auth.users values ('${ZACK}', 'zack@yahoo.com'), ('${LUCKY}', 'maria@x.example'), ('${LATE}', 'rico@x.example'), ('${ANA}', 'ana@x.example');
    insert into public.user_roles values ('${ZACK}', 'employer'), ('${LUCKY}', 'employer'), ('${LATE}', 'employer'), ('${ANA}', 'candidate');
    insert into public.profiles values ('${ZACK}', 'Zack', 'Zulu Support Team'), ('${LUCKY}', 'Maria', 'Lucky Star Support'), ('${LATE}', 'Rico', 'Night Owl Chat'), ('${ANA}', 'Ana', null);
    insert into public.jobs (id, employer_id, title, status, slug, created_at) values
      ('${JOB_Z}', '${ZACK}', 'Chat Support Team Leader', 'published', 'team-lead', now() - interval '20 days'),
      ('${JOB_DRAFT}', '${ZACK}', 'Draft role', 'draft', 'draft-role', now() - interval '2 days');
  `);
  async function as(uid, role, sql, params = []) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
    await db.exec(`select set_config('request.jwt.claim.role', '${role}', false);`);
    await db.exec(`set role ${role};`);
    try {
      const r = await db.query(sql, params);
      return { ok: true, rows: r.rows };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      await db.exec(`reset role;`);
      await db.exec(`select set_config('request.jwt.claim.sub', '', false);`);
      await db.exec(`select set_config('request.jwt.claim.role', '', false);`);
    }
  }
  return { db, as, pg: (sql, p = []) => db.query(sql, p).then((r) => r.rows) };
}

async function main() {
  const pages = await migration(/^\d+_business_pages_and_traffic\.sql$/);
  const links = await migration(/^\d+_job_links_per_business\.sql$/);
  const basics = await migration(/^\d+_business_basics_server\.sql$/);
  check("the migrations are there, once each", !!pages && !!links && !!basics);
  if (!pages || !links || !basics) return;
  const { db, as, pg } = await setup();
  let applied = true;
  try {
    await db.exec(pages);
    await db.exec(links);
    await db.exec(basics);
    await db.exec(basics);
  } catch (e) {
    applied = false;
    console.log(e.message);
  }
  check("0. it applies, and applies again", applied);

  await pg(`insert into public.platform_admins values ($1)`, [ZACK]);
  await pg(`insert into public.business_standing values ($1, 'approved'), ($2, 'suspended')`, [ZACK, LUCKY]);

  // 1 ──────────────────────────────────────────────────────────────────────
  const newBiz = await as(LATE, "authenticated", `insert into public.jobs (employer_id, title, status, slug) values ($1, 'Night agent', 'published', 'night-agent') returning id`, [LATE]);
  check("1. a new business in good standing publishes", newBiz.ok, show(newBiz));
  const susNew = await as(LUCKY, "authenticated", `insert into public.jobs (employer_id, title, status, slug) values ($1, 'Team lead', 'published', 'team-lead')`, [LUCKY]);
  check("1. a suspended business cannot publish a new job", !susNew.ok && /paused/.test(susNew.error), show(susNew));
  const draft = await as(LUCKY, "authenticated", `insert into public.jobs (employer_id, title, status, slug) values ($1, 'Team lead', 'draft', 'team-lead') returning id`, [LUCKY]);
  check("1. …it can still keep a draft", draft.ok, show(draft));
  const JOB_L = draft.rows?.[0]?.id;
  const reopen = await as(LUCKY, "authenticated", `update public.jobs set status = 'published' where id = $1`, [JOB_L]);
  check("1. …and cannot publish it", !reopen.ok && /paused/.test(reopen.error), show(reopen));
  const edit = await as(LUCKY, "authenticated", `update public.jobs set title = 'Team lead (nights)' where id = $1 returning title`, [JOB_L]);
  check("1. …but can still edit it", edit.ok && edit.rows[0]?.title === "Team lead (nights)", show(edit));
  const admin = await as(ZACK, "authenticated", `update public.jobs set status = 'published' where id = $1 returning status`, [JOB_L]);
  check("1. the platform admin can reopen it (what un-pausing does)", admin.ok && admin.rows[0]?.status === "published", show(admin));
  await pg(`update public.jobs set status = 'draft' where id = $1`, [JOB_L]);
  const server = await as(null, "service_role", `update public.jobs set status = 'published' where id = $1 returning status`, [JOB_L]);
  check("1. so can the server", server.ok && server.rows[0]?.status === "published", show(server));
  const zackJob = await as(ZACK, "authenticated", `update public.jobs set status = 'published' where id = $1 returning status`, [JOB_Z]);
  check("1. the owner's own job is untouched", zackJob.ok && zackJob.rows[0]?.status === "published", show(zackJob));

  // 2 ──────────────────────────────────────────────────────────────────────
  const anon = await as(null, "anon", `select id from public.published_jobs_public where employer_id = $1`, [LUCKY]);
  check("2. a suspended business's live job is shown to nobody", anon.ok && anon.rows.length === 0, show(anon));
  const owner = await as(LUCKY, "authenticated", `select id from public.published_jobs_public where employer_id = $1`, [LUCKY]);
  check("2. …but its own business", owner.ok && owner.rows.length === 1, show(owner));
  const others = await as(null, "anon", `select employer_id from public.published_jobs_public order by title`);
  check("2. everyone else's live jobs still show", others.ok && others.rows.some((r) => r.employer_id === ZACK) && others.rows.some((r) => r.employer_id === LATE), show(others));

  // 3 ──────────────────────────────────────────────────────────────────────
  await pg(`update public.jobs set status = 'draft' where employer_id in ($1, $2)`, [LUCKY, LATE]);
  await pg(`update public.jobs set created_at = now() - interval '10 days' where id = $1`, [JOB_Z]);
  await pg(`insert into public.page_view_daily values
    (current_date - 3, '/candidate/job/${JOB_Z}', null, 4),
    (current_date - 3, '/candidate/job/' || $1, null, 7),
    (current_date - 3, '/candidate/auth', null, 30),
    (current_date, '/candidate/auth', null, 50)`, [JOB_L]);
  const z1 = await as(ZACK, "authenticated", `select sum(job_views)::int j, sum(apply_views)::int a from public.get_careers_traffic(14)`);
  check("3. the home business counts its own job's old address (4), never another business's (7)", z1.ok && z1.rows[0].j === 4, show(z1));
  check("3. with no other business live, the sign-in page counts for it (30 + 50)", z1.ok && z1.rows[0].a === 80, show(z1));
  // Another business goes live today: from today the home business counts its applications.
  await pg(`update public.business_standing set status = 'approved' where employer_id = $1`, [LUCKY]);
  await pg(`update public.jobs set status = 'published', created_at = now() where id = $1`, [JOB_L]);
  await pg(`insert into public.applications (job_id, candidate_id, created_at) values ($1, $2, now())`, [JOB_Z, ANA]);
  const z2 = await as(ZACK, "authenticated", `select day, apply_views from public.get_careers_traffic(14) order by day`);
  const today = z2.rows?.[z2.rows.length - 1];
  const before = z2.rows?.find((r) => r.apply_views === 30);
  check("3. once another business is live, today counts the home business's own applications (1), not the shared page (50)", z2.ok && today?.apply_views === 1, show(today));
  check("3. …and the days before keep what they said (30)", !!before, show(z2.rows));
  void db;
}

await main();
console.log(`\nbusiness basics, server half (pglite): ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
