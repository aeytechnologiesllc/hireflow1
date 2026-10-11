#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/*_job_links_per_business.sql: job
 * links per business, hireflownow.com/c/<business>/<job>.
 *
 * The owner, 2026-10-10: "once I click on the link and they don't have an
 * account and they're creating the account, will they be able to redirect to
 * that same job, no collision? ... Make sure you check different scenarios to
 * find out it doesn't collide." So, against a real Postgres:
 *
 *   1. Two businesses can both have "team-lead"; one business cannot have it
 *      twice.
 *   2. (business, job) names exactly one row of published_jobs_public, so
 *      the link an applicant follows (and is sent back to after sign-up)
 *      can only ever open that job.
 *   3. The root link hireflownow.com/team-lead stays the job it was handed
 *      out for, even after another business makes a "team-lead"; no client
 *      can give a job a root link (not on insert, not on update); a renamed
 *      job loses it.
 *   4. Every business that posts a job has a careers address, made for it;
 *      nobody can make one for someone else.
 *   5. The view keeps its rules: drafts and closed jobs are not in it; a job
 *      kept out of the feed is the owner's alone.
 *   6. Visits: a business counts its own job at its new address (and its
 *      root link, if it has one), never another business's job of the same
 *      name.
 *
 * Run with: node scripts/job_links_per_business.pglite.test.mjs
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
  check("the migrations are there, once each", !!pages && !!links);
  if (!pages || !links) return;
  const { db, as, pg } = await setup();
  let applied = true;
  try {
    await db.exec(pages);
    await db.exec(links);
    await db.exec(links);
  } catch (e) {
    applied = false;
    console.log(e.message);
  }
  check("0. it applies over the business pages, and applies again", applied);

  // 3 (before anyone else moves) ───────────────────────────────────────────────
  const zRow = (await pg(`select root_link from public.jobs where id = $1`, [JOB_Z]))[0];
  check("3. the job whose root link was handed out keeps it", zRow?.root_link === true, show(zRow));
  const idx = (await pg(`select indexname from pg_indexes where tablename = 'jobs' and indexname like 'jobs_%'`)).map((r) => r.indexname).sort();
  check("1. one name per business, one root link per name; the site-wide rule is gone", idx.includes("jobs_slug_per_business") && idx.includes("jobs_root_link_unique") && !idx.includes("jobs_slug_unique"), show(idx));

  // 4 ──────────────────────────────────────────────────────────────────────
  const preLate = await pg(`select slug from public.business_pages where employer_id = $1`, [LATE]);
  check("4. a business with no job has no address yet", preLate.length === 0);
  const forged = await as(LUCKY, "authenticated", `select public.business_page_for($1) as s`, [LATE]);
  check("4. nobody makes a careers address for someone else", !forged.ok && /permission denied/.test(forged.error), show(forged));

  // 1 ──────────────────────────────────────────────────────────────────────
  const luckyJob = await as(
    LUCKY,
    "authenticated",
    `insert into public.jobs (employer_id, title, status, slug, root_link) values ($1, 'Team lead', 'published', 'team-lead', true) returning id, root_link`,
    [LUCKY],
  );
  check("1. another business can have 'team-lead' too", luckyJob.ok, show(luckyJob));
  check("3. …and cannot give it a root link, even by asking", luckyJob.rows?.[0]?.root_link === false, show(luckyJob));
  const JOB_L = luckyJob.rows?.[0]?.id;
  const luckyPage = await pg(`select slug from public.business_pages where employer_id = $1`, [LUCKY]);
  check("4. posting a job made the business its careers address", luckyPage[0]?.slug === "lucky-star-support", show(luckyPage));
  const twice = await as(LUCKY, "authenticated", `insert into public.jobs (employer_id, title, status, slug) values ($1, 'Team lead 2', 'published', 'team-lead')`, [LUCKY]);
  check("1. one business cannot have the same name twice", !twice.ok && /jobs_slug_per_business/.test(twice.error), show(twice));
  const lateJob = await as(LATE, "authenticated", `insert into public.jobs (employer_id, title, status, slug) values ($1, 'Team lead', 'published', 'team-lead') returning id`, [LATE]);
  check("1. a third business: 'team-lead' again", lateJob.ok, show(lateJob));
  const JOB_LATE = lateJob.rows?.[0]?.id;
  const latePage = await pg(`select slug from public.business_pages where employer_id = $1`, [LATE]);
  check("4. …with its own address, made on its first job", latePage[0]?.slug === "night-owl-chat", show(latePage));

  // 2 ──────────────────────────────────────────────────────────────────────
  // What the job page asks (JobDetails, the sign-in screen, the link preview).
  const open = (business, slug, who = null, role = "anon") =>
    as(who, role, `select id, business_slug, slug, root_link from public.published_jobs_public where business_slug = $1 and slug = $2`, [business, slug]);
  const zz = await open("zulu-support-team", "team-lead");
  const ll = await open("lucky-star-support", "team-lead");
  const nn = await open("night-owl-chat", "team-lead");
  check("2. /c/zulu-support-team/team-lead opens Zulu's job, and only it", zz.ok && zz.rows.length === 1 && zz.rows[0].id === JOB_Z, show(zz));
  check("2. /c/lucky-star-support/team-lead opens Lucky Star's, and only it", ll.ok && ll.rows.length === 1 && ll.rows[0].id === JOB_L, show(ll));
  check("2. /c/night-owl-chat/team-lead opens Night Owl's, and only it", nn.ok && nn.rows.length === 1 && nn.rows[0].id === JOB_LATE, show(nn));
  const signedIn = await open("lucky-star-support", "team-lead", ANA, "authenticated");
  check("2. …the same for a person just signed up (the page they are sent back to)", signedIn.ok && signedIn.rows.length === 1 && signedIn.rows[0].id === JOB_L, show(signedIn));
  const wrongPair = await open("lucky-star-support", "chat-support-team-leader");
  check("2. a business's address with a name it does not have opens nothing", wrongPair.ok && wrongPair.rows.length === 0);
  const unknownBiz = await open("nobody-here", "team-lead");
  check("2. an unknown business opens nothing (never someone else's 'team-lead')", unknownBiz.ok && unknownBiz.rows.length === 0);
  const allTL = await as(null, "anon", `select business_slug from public.published_jobs_public where slug = 'team-lead' order by business_slug`);
  check("2. the view says each job's business", show(allTL.rows?.map((r) => r.business_slug)) === show(["lucky-star-support", "night-owl-chat", "zulu-support-team"]), show(allTL));

  // 3 ──────────────────────────────────────────────────────────────────────
  const root = await as(null, "anon", `select id from public.published_jobs_public where slug = 'team-lead' and root_link`);
  check("3. hireflownow.com/team-lead is still Zulu's, with three 'team-lead's on the site", root.ok && root.rows.length === 1 && root.rows[0].id === JOB_Z, show(root));
  const grab = await as(LUCKY, "authenticated", `update public.jobs set root_link = true where id = $1 returning root_link`, [JOB_L]);
  check("3. a business cannot give its job a root link later either", grab.ok && grab.rows[0]?.root_link === false, show(grab));
  const viaService = await as(null, "service_role", `update public.jobs set root_link = true where id = $1`, [JOB_L]);
  check("3. even the database refuses a second root link for one name", !viaService.ok && /jobs_root_link_unique/.test(viaService.error), show(viaService));

  // 5 ──────────────────────────────────────────────────────────────────────
  const draft = await as(null, "anon", `select id from public.published_jobs_public where id = $1`, [JOB_DRAFT]);
  check("5. a draft is not in the view", draft.ok && draft.rows.length === 0);
  await pg(`update public.jobs set exclude_from_feed = true where id = $1`, [JOB_LATE]);
  const hidden = await open("night-owl-chat", "team-lead");
  const hiddenOwner = await open("night-owl-chat", "team-lead", LATE, "authenticated");
  check("5. a job kept out of the feed is hidden from strangers", hidden.ok && hidden.rows.length === 0);
  check("5. …and still the owner's to see", hiddenOwner.ok && hiddenOwner.rows.length === 1);
  await pg(`update public.jobs set exclude_from_feed = false where id = $1`, [JOB_LATE]);
  const cols = (await pg(`select column_name from information_schema.columns where table_name = 'published_jobs_public' order by ordinal_position`)).map((r) => r.column_name);
  check("5. the view's new columns come last, after everything it had", cols.slice(-3).join(",") === "slug,business_slug,root_link" && cols[0] === "id", show(cols.slice(-4)));

  // 6 ──────────────────────────────────────────────────────────────────────
  // Visits count from the day after a business's first live job.
  await pg(`update public.jobs set created_at = now() - interval '5 days' where id in ($1, $2)`, [JOB_L, JOB_LATE]);
  await pg(`insert into public.page_view_daily values
    (current_date, '/team-lead', null, 20),
    (current_date, '/c/zulu-support-team/team-lead', null, 6),
    (current_date, '/c/lucky-star-support/team-lead', null, 9),
    (current_date, '/c/night-owl-chat/team-lead', null, 2)`);
  const z = await as(ZACK, "authenticated", `select sum(job_views)::int as j from public.get_careers_traffic(14)`);
  const l = await as(LUCKY, "authenticated", `select sum(job_views)::int as j from public.get_careers_traffic(14)`);
  check("6. Zulu counts its job at the new address and its root link (6 + 20)", z.ok && z.rows[0].j === 26, show(z));
  check("6. Lucky Star counts only its own 'team-lead' (9), never Zulu's or Night Owl's", l.ok && l.rows[0].j === 9, show(l));

  // 3, last: a renamed job loses its root link ──────────────────────────────────
  const renamed = await as(ZACK, "authenticated", `update public.jobs set slug = 'team-leader' where id = $1 returning root_link`, [JOB_Z]);
  check("3. a renamed job loses its root link (the old one stops, as the editor warns)", renamed.ok && renamed.rows[0]?.root_link === false, show(renamed));
  const back = await as(ZACK, "authenticated", `update public.jobs set slug = 'team-lead' where id = $1 returning root_link`, [JOB_Z]);
  check("3. …and naming it back does not bring it back (nobody can mint one)", back.ok && back.rows[0]?.root_link === false, show(back));
  const ensure = await as(ZACK, "authenticated", `select public.ensure_business_page() as s`);
  check("4. ensure_business_page() still answers the caller's own address", ensure.ok && ensure.rows[0].s === "zulu-support-team", show(ensure));
  void db;
}

await main();
console.log(`\njob links per business (pglite): ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
