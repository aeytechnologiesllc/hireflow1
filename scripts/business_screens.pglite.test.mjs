#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/*_business_screens.sql, the database
 * half of the new-business screens (the 2026-10-11 mock-ups):
 *
 *   1. Help: a business (or its team member) writes to HireFlow; only that
 *      business and the platform admin read the thread; the admin answers;
 *      each side is told in the bell; nobody writes rows directly; a limit.
 *   2. A new business joining tells the platform admin.
 *   3. The careers address changes only until the first job goes live, looks
 *      like an address and is not HireFlow's own word; the line is one line.
 *
 * Run with: node scripts/business_screens.pglite.test.mjs
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

const ZACK = "10000000-0000-4000-8000-000000000001"; // platform admin, home business
const LUCKY = "10000000-0000-4000-8000-000000000002";
const NIGHT = "10000000-0000-4000-8000-000000000003";
const TESS = "40000000-0000-4000-8000-000000000001"; // on Lucky's team
const ANA = "20000000-0000-4000-8000-000000000001"; // an applicant
const NEWBIZ = "10000000-0000-4000-8000-000000000009";

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
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant execute on function auth.role() to anon, authenticated, service_role;
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create type public.app_role as enum ('employer', 'candidate', 'team_member', 'developer');
    create type public.job_status as enum ('draft', 'published', 'closed');
    create table public.user_roles (user_id uuid, role public.app_role);
    create table public.profiles (user_id uuid primary key, full_name text, company_name text);
    create table public.team_members (id uuid primary key default gen_random_uuid(), user_id uuid, employer_id uuid, status text, created_at timestamptz default now());
    create table public.jobs (id uuid primary key default gen_random_uuid(), employer_id uuid, title text, status public.job_status default 'draft');
    create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid, type text, title text, message text, link text, is_read boolean default false, created_at timestamptz default now());
    create table public.platform_admins (user_id uuid primary key);
    create or replace function public.is_platform_admin() returns boolean language sql stable security definer as $$
      select exists (select 1 from public.platform_admins where user_id = auth.uid()) $$;
    -- business_pages as live (20261011110000 + 20261011150000).
    create table public.business_pages (employer_id uuid primary key, slug text unique not null, about text, home_alias boolean not null default false,
      created_at timestamptz default now(), updated_at timestamptz default now());
    alter table public.business_pages enable row level security;
    create policy "Anyone reads a careers page" on public.business_pages for select using (true);
    create policy "A business edits its own page" on public.business_pages for update using (employer_id = auth.uid()) with check (employer_id = auth.uid());

    insert into auth.users values ('${ZACK}', 'zack@yahoo.com'), ('${LUCKY}', 'maria@x.example'), ('${NIGHT}', 'rico@x.example'),
      ('${TESS}', 'tess@x.example'), ('${ANA}', 'ana@x.example'), ('${NEWBIZ}', 'new@x.example');
    insert into public.user_roles values ('${ZACK}', 'employer'), ('${LUCKY}', 'employer'), ('${NIGHT}', 'employer'), ('${TESS}', 'team_member'), ('${ANA}', 'candidate');
    insert into public.profiles values ('${ZACK}', 'Zack', 'Zulu Support Team'), ('${LUCKY}', 'Maria', 'Lucky Star Support'), ('${NIGHT}', 'Rico', 'Night Owl Chat'),
      ('${TESS}', 'Tess', null), ('${ANA}', 'Ana', null), ('${NEWBIZ}', 'Nina', 'Brand New Co');
    insert into public.team_members (user_id, employer_id, status) values ('${TESS}', '${LUCKY}', 'active');
    insert into public.platform_admins values ('${ZACK}');
    insert into public.business_pages (employer_id, slug, home_alias) values ('${ZACK}', 'zulu-support-team', true), ('${LUCKY}', 'lucky-star-support', false), ('${NIGHT}', 'night-owl-chat', false);
    insert into public.jobs (employer_id, title, status) values ('${ZACK}', 'Team lead', 'published');
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

const sql = await migration(/_business_screens\.sql$/);
const teamSql = await migration(/_business_screens_team\.sql$/);
check("the migration files exist exactly once", !!sql && !!teamSql);
if (!sql || !teamSql) process.exit(1);
const { db, as, pg } = await setup();
let applied = true;
try {
  // As live (20261011100000_business_trust): standing, ID papers, admin.
  await db.exec(`
    create table public.business_standing (employer_id uuid primary key, status text not null default 'new');
    create or replace function public.business_status_of(p_employer uuid) returns text language sql stable security definer as $$
      select coalesce((select s.status from public.business_standing s where s.employer_id = p_employer), 'new') $$;
    create or replace function public.business_has_paid(p_employer uuid) returns boolean language sql stable security definer as $$ select false $$;
    revoke execute on function public.business_status_of(uuid) from public, anon, authenticated;
  `);
  await db.exec(sql);
  await db.exec(sql);
  await db.exec(teamSql);
  await db.exec(teamSql);
} catch (e) {
  applied = false;
  console.log(e.message);
}
check("0. it applies, and applies again", applied);

// 1. Help ─────────────────────────────────────────────────────────────────
{
  const sent = await as(LUCKY, "authenticated", `select public.send_help_message('How do I add my logo?') as id`);
  check("1. a business writes to HireFlow", sent.ok && !!sent.rows[0]?.id, show(sent));
  const team = await as(TESS, "authenticated", `select public.send_help_message('Can I invite another person?') as id`);
  check("1. its team member writes too, into the business's thread", team.ok, show(team));
  const thread = await pg(`select employer_id, author_id, from_admin from public.help_messages order by created_at`);
  check("1. both messages sit in Lucky Star's thread", thread.length === 2 && thread.every((m) => m.employer_id === LUCKY && m.from_admin === false), show(thread));
  const alerts = await pg(`select user_id, title, link from public.notifications where title = 'New help message'`);
  check("1. you are told in your bell, with a link to Admin's Help tab", alerts.length === 2 && alerts.every((n) => n.user_id === ZACK && n.link === "/admin?tab=help"), show(alerts));
  const applicant = await as(ANA, "authenticated", `select public.send_help_message('hello')`);
  check("1. an applicant cannot write here (they message the business)", !applicant.ok && /not_a_business/.test(applicant.error), show(applicant));
  const empty = await as(LUCKY, "authenticated", `select public.send_help_message('   ')`);
  check("1. an empty message is refused", !empty.ok && /empty_message/.test(empty.error));
  const direct = await as(LUCKY, "authenticated", `insert into public.help_messages (employer_id, author_id, body, from_admin) values ($1, $1, 'forged', true)`, [LUCKY]);
  check("1. nobody writes a row directly (not even 'from HireFlow')", !direct.ok, show(direct));
  const own = await as(LUCKY, "authenticated", `select count(*)::int n from public.help_messages`);
  const other = await as(NIGHT, "authenticated", `select count(*)::int n from public.help_messages`);
  const admin = await as(ZACK, "authenticated", `select count(*)::int n from public.help_messages`);
  check("1. Lucky Star reads its own thread", own.ok && own.rows[0].n === 2, show(own));
  check("1. another business reads none of it", other.ok && other.rows[0].n === 0, show(other));
  check("1. you read every thread", admin.ok && admin.rows[0].n === 2, show(admin));

  const threads = await as(ZACK, "authenticated", `select employer_id, company_name, unread, last_from_admin from public.admin_help_threads()`);
  check("1. Admin lists the thread, by business name, with 2 unread", threads.ok && threads.rows.length === 1 && threads.rows[0].company_name === "Lucky Star Support" && threads.rows[0].unread === 2, show(threads));
  const notAdmin = await as(LUCKY, "authenticated", `select * from public.admin_help_threads()`);
  check("1. only you can list threads", !notAdmin.ok && /NOT_AUTHORIZED/.test(notAdmin.error));
  const forgedReply = await as(LUCKY, "authenticated", `select public.admin_reply_help($1, 'I am HireFlow')`, [NIGHT]);
  check("1. only you can answer as HireFlow", !forgedReply.ok && /NOT_AUTHORIZED/.test(forgedReply.error));
  const reply = await as(ZACK, "authenticated", `select public.admin_reply_help($1, 'Open Profile and add it under Company logo.') as id`, [LUCKY]);
  check("1. you answer", reply.ok, show(reply));
  const told = await pg(`select user_id, title, link from public.notifications where title = 'HireFlow replied'`);
  check("1. the business is told in its bell, with a link to Help", told.length === 1 && told[0].user_id === LUCKY && told[0].link === "/help", show(told));
  const after = await as(ZACK, "authenticated", `select unread, last_from_admin from public.admin_help_threads()`);
  check("1. answering marks their messages read", after.ok && after.rows[0].unread === 0 && after.rows[0].last_from_admin === true, show(after));
  const read = await as(LUCKY, "authenticated", `select public.mark_help_read()`);
  const unreadForBiz = await pg(`select count(*)::int n from public.help_messages where from_admin and read_at is null`);
  check("1. the business marks your answer read", read.ok && unreadForBiz[0].n === 0, show(read));
  const markOther = await as(LUCKY, "authenticated", `select public.mark_help_read($1)`, [NIGHT]);
  check("1. a business cannot mark another thread read", !markOther.ok);

  for (let i = 0; i < 18; i += 1) await as(LUCKY, "authenticated", `select public.send_help_message('message ${i}')`);
  const tooMany = await as(LUCKY, "authenticated", `select public.send_help_message('one more')`);
  check("1. twenty messages a day, then it waits", !tooMany.ok && /help_too_many/.test(tooMany.error), show(tooMany));
}

// 1b. Team members (20261011181000_business_screens_team) ─────────────────────
{
  const teamReads = await as(TESS, "authenticated", `select count(*)::int n from public.help_messages`);
  check("1b. Lucky Star's team member reads its Help thread too", teamReads.ok && teamReads.rows[0].n > 0, show(teamReads));
  const nightTeam = await as(TESS, "authenticated", `select count(*)::int n from public.help_messages where employer_id = $1`, [NIGHT]);
  check("1b. …and no other business's", nightTeam.ok && nightTeam.rows[0].n === 0, show(nightTeam));
  await pg(`insert into public.business_standing values ($1, 'approved')`, [LUCKY]);
  const owner = await as(LUCKY, "authenticated", `select public.my_business_standing() s`);
  const team = await as(TESS, "authenticated", `select public.my_business_standing() s`);
  const fresh = await as(NIGHT, "authenticated", `select public.my_business_standing() s`);
  check("1b. the owner's standing: approved, may ask for ID papers", owner.ok && owner.rows[0].s.status === "approved" && owner.rows[0].s.can_request_ids === true, show(owner));
  check("1b. the team member gets their business's standing (approved), not their own", team.ok && team.rows[0].s.status === "approved" && team.rows[0].s.can_request_ids === true, show(team));
  check("1b. a new business: new, no ID papers yet", fresh.ok && fresh.rows[0].s.status === "new" && fresh.rows[0].s.can_request_ids === false, show(fresh));
  const anon = await as(null, "anon", `select public.my_business_standing() s`);
  check("1b. nobody signed out can ask", !anon.ok || anon.rows[0].s === null, show(anon));
}

// 1c. Applicants write to HireFlow too (20261025200000_help_for_applicants) ──
{
  const applicantSql = await migration(/_help_for_applicants\.sql$/);
  check("1c. the applicant migration exists exactly once", !!applicantSql);
  await db.exec(applicantSql);
  await db.exec(applicantSql);
  await pg(`delete from public.notifications`);
  const fromAna = await as(ANA, "authenticated", `select public.send_help_message('Please send me a copy of my information.') as id`);
  check("1c. an applicant writes to HireFlow (the Privacy Policy sends them here)", fromAna.ok && !!fromAna.rows[0]?.id, show(fromAna));
  const anaRows = await pg(`select employer_id, author_id from public.help_messages where author_id = $1`, [ANA]);
  check("1c. …into a thread of her own, never a business's", anaRows.length === 1 && anaRows[0].employer_id === ANA, show(anaRows));
  const anaReads = await as(ANA, "authenticated", `select count(*)::int n, bool_and(employer_id = $1) mine from public.help_messages`, [ANA]);
  check("1c. she reads her own thread and nothing else", anaReads.ok && anaReads.rows[0].n === 1 && anaReads.rows[0].mine === true, show(anaReads));
  const bizReads = await as(LUCKY, "authenticated", `select count(*)::int n from public.help_messages where employer_id = $1`, [ANA]);
  const teamReadsAna = await as(TESS, "authenticated", `select count(*)::int n from public.help_messages where employer_id = $1`, [ANA]);
  check("1c. no business and no team member reads it", bizReads.ok && bizReads.rows[0].n === 0 && teamReadsAna.ok && teamReadsAna.rows[0].n === 0, show([bizReads, teamReadsAna]));
  const bell = await pg(`select user_id, title, message from public.notifications where title = 'New help message'`);
  check("1c. your bell says an applicant wrote", bell.length === 1 && bell[0].user_id === ZACK && /^Ana \(applicant\): Please send me a copy/.test(bell[0].message), show(bell));
  const listed = await as(ZACK, "authenticated", `select employer_id, company_name from public.admin_help_threads()`);
  const anaThread = listed.ok ? listed.rows.find((r) => r.employer_id === ANA) : null;
  const luckyThread = listed.ok ? listed.rows.find((r) => r.employer_id === LUCKY) : null;
  check("1c. Admin lists her thread as an applicant's, and businesses by name as before", anaThread?.company_name === "Ana (applicant)" && luckyThread?.company_name === "Lucky Star Support", show(listed));
  // (Section 1 used up Lucky Star's twenty for today.)
  await pg(`delete from public.help_messages where employer_id = $1 and not from_admin`, [LUCKY]);
  const teamStill = await as(TESS, "authenticated", `select public.send_help_message('Still Lucky Star?') as id`);
  const teamRow = await pg(`select employer_id from public.help_messages where body = 'Still Lucky Star?'`);
  check("1c. a team member still writes in the business's thread", teamStill.ok && teamRow[0]?.employer_id === LUCKY, show(teamRow));
  const answer = await as(ZACK, "authenticated", `select public.admin_reply_help($1, 'Here it is.') as id`, [ANA]);
  const toldAna = await pg(`select user_id, link from public.notifications where title = 'HireFlow replied'`);
  check("1c. you answer her, and her bell links to Contact us (/help)", answer.ok && toldAna.length === 1 && toldAna[0].user_id === ANA && toldAna[0].link === "/help", show(toldAna));
  const nobody = await as(null, "anon", `select public.send_help_message('hi')`);
  check("1c. nobody signed out can write", !nobody.ok, show(nobody));
}

// 2. A new business joins ───────────────────────────────────────────────────
{
  await pg(`delete from public.notifications`);
  await pg(`insert into public.user_roles values ($1, 'employer')`, [NEWBIZ]);
  const n = await pg(`select user_id, title, message, link from public.notifications`);
  check("2. a new business tells you, by name, with a link to Admin", n.length === 1 && n[0].user_id === ZACK && /Brand New Co signed up/.test(n[0].message) && n[0].link === "/admin", show(n));
  await pg(`delete from public.notifications`);
  await pg(`insert into public.user_roles values ($1, 'candidate')`, ["20000000-0000-4000-8000-000000000002"]);
  const none = await pg(`select count(*)::int n from public.notifications`);
  check("2. a new applicant does not", none[0].n === 0);
}

// 3. The careers address and line ───────────────────────────────────────────
{
  const change = await as(LUCKY, "authenticated", `update public.business_pages set slug = 'lucky-star' where employer_id = $1 returning slug`, [LUCKY]);
  check("3. before its first live job, a business can change its address", change.ok && change.rows[0]?.slug === "lucky-star", show(change));
  const bad = await as(LUCKY, "authenticated", `update public.business_pages set slug = 'Lucky Star!' where employer_id = $1`, [LUCKY]);
  check("3. an address must look like one", !bad.ok && /small letters, numbers and dashes/.test(bad.error), show(bad));
  const reserved = await as(LUCKY, "authenticated", `update public.business_pages set slug = 'hireflow' where employer_id = $1`, [LUCKY]);
  check("3. HireFlow's own words are kept", !reserved.ok && /kept for HireFlow/.test(reserved.error), show(reserved));
  const taken = await as(LUCKY, "authenticated", `update public.business_pages set slug = 'night-owl-chat' where employer_id = $1`, [LUCKY]);
  check("3. another business's address is taken", !taken.ok && /duplicate|unique/.test(taken.error), show(taken));
  const someoneElse = await as(LUCKY, "authenticated", `update public.business_pages set slug = 'mine-now' where employer_id = $1 returning slug`, [NIGHT]);
  check("3. nobody edits another business's page", someoneElse.ok && someoneElse.rows.length === 0, show(someoneElse));
  await pg(`insert into public.jobs (employer_id, title, status) values ($1, 'Agent', 'published')`, [LUCKY]);
  const locked = await as(LUCKY, "authenticated", `update public.business_pages set slug = 'lucky-again' where employer_id = $1`, [LUCKY]);
  check("3. once a job has gone live, the address stays (links keep working)", !locked.ok && /can't change once a job has gone live/.test(locked.error), show(locked));
  const zulu = await as(ZACK, "authenticated", `update public.business_pages set slug = 'zulu' where employer_id = $1`, [ZACK]);
  check("3. …the same for your page (it has a live job)", !zulu.ok && /gone live/.test(zulu.error), show(zulu));
  const line = await as(LUCKY, "authenticated", `update public.business_pages set about = $2 where employer_id = $1 returning about`, [LUCKY, "Friendly chat support for online games, 24/7."]);
  check("3. the line about the business can still change", line.ok && line.rows[0]?.about === "Friendly chat support for online games, 24/7.", show(line));
  const long = await as(LUCKY, "authenticated", `update public.business_pages set about = $2 where employer_id = $1`, [LUCKY, "x".repeat(141)]);
  check("3. one line: 140 letters at most", !long.ok && /140 letters/.test(long.error), show(long));
  const ok140 = await as(LUCKY, "authenticated", `update public.business_pages set about = $2 where employer_id = $1 returning about`, [LUCKY, "y".repeat(140)]);
  check("3. …140 is fine", ok140.ok && ok140.rows[0]?.about.length === 140, show(ok140));
  const server = await as(null, "service_role", `update public.business_pages set slug = 'lucky-star-support' where employer_id = $1 returning slug`, [LUCKY]);
  check("3. HireFlow itself can still move an address (Help: 'message us')", server.ok && server.rows[0]?.slug === "lucky-star-support", show(server));
}

// 4. Help for team members (20261011186000_help_for_team_members) ─────────────
{
  const helpTeam = await migration(/^\d+_help_for_team_members\.sql$/);
  check("4. the migration exists once", !!helpTeam);
  if (helpTeam) {
    await db.exec(helpTeam);
    await pg(`delete from public.notifications`);
    const reply = await as(ZACK, "authenticated", `select public.admin_reply_help($1, 'Yes: Team, then Invite.') as id`, [LUCKY]);
    check("4. you answer Lucky Star again", reply.ok, show(reply));
    const told = (await pg(`select user_id from public.notifications where title = 'HireFlow replied' order by user_id`)).map((r) => r.user_id);
    check("4. the bell rings for the owner and for the team member who asked", told.length === 2 && told.includes(LUCKY) && told.includes(TESS), show(told));
    check("4. …and nobody else", !told.includes(NIGHT) && !told.includes(ANA));
    const read = await as(TESS, "authenticated", `select public.mark_help_read()`);
    const unread = await pg(`select count(*)::int n from public.help_messages where employer_id = $1 and from_admin and read_at is null`, [LUCKY]);
    check("4. the team member marks the answer read (it no longer stays new for them)", read.ok && unread[0].n === 0, show({ read, unread }));
    const reply2 = await as(ZACK, "authenticated", `select public.admin_reply_help($1, 'Anything else?') as id`, [LUCKY]);
    const nightRead = await as(NIGHT, "authenticated", `select public.mark_help_read()`);
    const stillUnread = await pg(`select count(*)::int n from public.help_messages where employer_id = $1 and from_admin and read_at is null`, [LUCKY]);
    check("4. another business marking its own Help read leaves Lucky Star's answer new", reply2.ok && nightRead.ok && stillUnread[0].n === 1, show(stillUnread));
    const anon = await as(null, "anon", `select public.mark_help_read()`);
    check("4. nobody signed out can mark anything", !anon.ok, show(anon));
  }
}

console.log(`\nbusiness screens (pglite): ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
