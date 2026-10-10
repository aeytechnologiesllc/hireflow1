#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/*_business_pages_and_traffic.sql:
 * each business its own careers address, and its own visits.
 *
 *   1. ensure_business_page(): a business gets an address from its name
 *      (taken names get "-2"), once; an applicant gets none.
 *   2. Anyone reads a careers page; a business edits only its own address
 *      and "about" line, never the home flag or someone else's.
 *   3. get_careers_traffic(): a business counts only its own careers page
 *      and its own job pages, never another's; the home business (the one
 *      that runs HireFlow) also keeps /careers, the old "/" careers page, the
 *      old job-page addresses and the shared sign-in and apply pages; every
 *      other business gets its own applications in that column. A team
 *      member sees their business's numbers.
 *
 * Run with: node scripts/business_pages.pglite.test.mjs
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
const NEW1 = "10000000-0000-4000-8000-000000000002";
const NEW2 = "10000000-0000-4000-8000-000000000003";
const TEAM = "10000000-0000-4000-8000-0000000000a1";
const ANA = "20000000-0000-4000-8000-000000000001";
const JOB_Z = "30000000-0000-4000-8000-00000000000a";
const JOB_N = "30000000-0000-4000-8000-00000000000b";

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
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant execute on function auth.role() to anon, authenticated, service_role;
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create table public.profiles (user_id uuid primary key, full_name text, company_name text);
    create table public.user_roles (user_id uuid, role text);
    create table public.jobs (id uuid primary key, employer_id uuid, title text, status text, slug text, created_at timestamptz);
    create table public.applications (id uuid primary key default gen_random_uuid(), job_id uuid, candidate_id uuid, created_at timestamptz default now());
    create table public.team_members (user_id uuid, employer_id uuid, status text);
    create or replace function public.is_active_team_member_for_job(p_job_id uuid, p_user_id uuid) returns boolean language sql stable as $$
      select exists (select 1 from public.team_members tm join public.jobs j on j.employer_id = tm.employer_id where j.id = p_job_id and tm.user_id = p_user_id and tm.status = 'active') $$;
    create table public.page_view_daily (day date, path text, referrer_host text, view_count int);
  `);
  const today = "current_date";
  await db.exec(`
    insert into auth.users values ('${ZACK}', 'zack@yahoo.com'), ('${NEW1}', 'a@x.example'), ('${NEW2}', 'b@x.example'), ('${TEAM}', 't@x.example'), ('${ANA}', 'ana@x.example');
    insert into public.user_roles values ('${ZACK}', 'employer'), ('${NEW1}', 'employer'), ('${NEW2}', 'employer'), ('${TEAM}', 'team_member'), ('${ANA}', 'candidate');
    insert into public.profiles values ('${ZACK}', 'Zack', 'Zulu Support Team'), ('${NEW1}', 'Maria', 'Lucky Star Support!'), ('${NEW2}', 'Rico', 'Lucky Star Support'), ('${ANA}', 'Ana', null);
    insert into public.team_members values ('${TEAM}', '${NEW1}', 'active');
    insert into public.jobs values
      ('${JOB_Z}', '${ZACK}', 'Team lead', 'published', 'team-lead', now() - interval '30 days'),
      ('${JOB_N}', '${NEW1}', 'Night agent', 'published', 'night-agent', now() - interval '5 days');
    insert into public.applications (job_id, candidate_id, created_at) values
      ('${JOB_N}', '${ANA}', ${today}::timestamptz + interval '1 hour'),
      ('${JOB_N}', '${ANA}', ${today}::timestamptz + interval '2 hours'),
      ('${JOB_Z}', '${ANA}', ${today}::timestamptz + interval '3 hours');
    insert into public.page_view_daily values
      (${today}, '/careers', null, 10),
      (${today}, '/c/zulu-support-team', null, 3),
      (${today}, '/c/lucky-star-support', null, 7),
      (${today}, '/team-lead', null, 20),
      (${today}, '/night-agent', null, 5),
      (${today}, '/candidate/job/<redacted>', null, 4),
      (${today}, '/candidate/auth', null, 9),
      (${today}, '/apply', null, 2),
      (${today}, '/', null, 100),
      (${today}, '/careers', 'staff.hireflownow.com', 50);
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
  const names = (await readdir(MIGRATIONS)).filter((n) => /^\d+_business_pages_and_traffic\.sql$/.test(n));
  check("the migration file is there, once", names.length === 1);
  if (names.length !== 1) return;
  const sql = await readFile(path.join(MIGRATIONS, names[0]), "utf8");
  const { db, as, pg } = await setup();
  let applied = true;
  try {
    await db.exec(sql);
    await db.exec(sql);
  } catch (e) {
    applied = false;
    console.log(e.message);
  }
  check("0. it applies, and applies again", applied);

  // 1
  const home = await pg(`select slug, home_alias from public.business_pages where employer_id = $1`, [ZACK]);
  check("1. the owner's business is zulu-support-team, the home of /careers", home[0]?.slug === "zulu-support-team" && home[0]?.home_alias === true, show(home));
  const a = await as(NEW1, "authenticated", `select public.ensure_business_page() as s`);
  check("1. a new business gets an address from its name", a.rows?.[0]?.s === "lucky-star-support", show(a));
  const again = await as(NEW1, "authenticated", `select public.ensure_business_page() as s`);
  check("…once: asking again gives the same address", again.rows?.[0]?.s === "lucky-star-support");
  const b = await as(NEW2, "authenticated", `select public.ensure_business_page() as s`);
  check("1. a taken name gets -2", b.rows?.[0]?.s === "lucky-star-support-2", show(b));
  const ana = await as(ANA, "authenticated", `select public.ensure_business_page() as s`);
  check("1. an applicant gets none", !ana.ok && /not_a_business/.test(ana.error));

  // 2
  const anon = await as(null, "anon", `select slug from public.business_pages order by slug`);
  check("2. anyone reads a careers page", anon.ok && anon.rows.length === 3, show(anon));
  const edit = await as(NEW1, "authenticated", `update public.business_pages set slug = 'lucky-star', about = 'Remote chat support in Manila.' where employer_id = $1 returning slug, about`, [NEW1]);
  check("2. a business changes its own address and about line", edit.ok && edit.rows[0]?.slug === "lucky-star" && edit.rows[0]?.about === "Remote chat support in Manila.", show(edit));
  const steal = await as(NEW1, "authenticated", `update public.business_pages set slug = 'mine' where employer_id = $1 returning slug`, [ZACK]);
  check("2. …never another business's", steal.ok && steal.rows.length === 0, show(steal));
  const homeGrab = await as(NEW1, "authenticated", `update public.business_pages set home_alias = true where employer_id = $1`, [NEW1]);
  check("2. …and never the home flag", !homeGrab.ok, show(homeGrab));
  const taken = await as(NEW2, "authenticated", `update public.business_pages set slug = 'zulu-support-team' where employer_id = $1`, [NEW2]);
  check("2. an address already taken is refused", !taken.ok);
  const bad = await as(NEW2, "authenticated", `update public.business_pages set slug = 'Bad Slug!' where employer_id = $1`, [NEW2]);
  check("2. an address must be plain lower-case words and dashes", !bad.ok);
  // back to the default for the traffic checks
  await as(NEW1, "authenticated", `update public.business_pages set slug = 'lucky-star-support' where employer_id = $1`, [NEW1]);

  // 3
  const totals = async (uid) => {
    const r = await as(uid, "authenticated", `select sum(careers_views)::int c, sum(job_views)::int j, sum(apply_views)::int a from public.get_careers_traffic(14)`);
    return r.ok ? r.rows[0] : { error: r.error };
  };
  const zack = await totals(ZACK);
  check("3. the home business: /careers, its own page, its job, the old job pages, the shared sign-in pages", zack.c === 13 && zack.j === 24 && zack.a === 11, show(zack));
  check("…never another business's careers page or job", zack.c !== 20 && zack.j !== 29);
  const biz = await totals(NEW1);
  check("3. another business: only its own careers page and its own job", biz.c === 7 && biz.j === 5, show(biz));
  check("…and its own applications for 'apply', never the site's sign-ins", biz.a === 2, show(biz));
  const team = await totals(TEAM);
  check("3. a team member sees their business's numbers", team.c === 7 && team.j === 5 && team.a === 2, show(team));
  const none = await as(NEW2, "authenticated", `select * from public.get_careers_traffic(14)`);
  check("3. a business with no live job is refused, as before", !none.ok);
  const anonT = await as(null, "anon", `select * from public.get_careers_traffic(14)`);
  check("3. nobody signed out", !anonT.ok);
}

await main();
console.log(`\nbusiness pages (pglite): ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
