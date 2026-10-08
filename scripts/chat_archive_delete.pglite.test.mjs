#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/*_chat_archive_and_delete.sql
 * (archive a chat, and delete one from your own side): plain assertions
 * against a real Postgres with the live messages policies, not a text match.
 *
 * The owner, 2026-10-08: "there's no button for me to archive the chat,
 * there's no filters of that either, and delete as well, permanently delete
 * the chat." This proves the database half:
 *
 *   0. The migration applies twice. Of the six live messages policies,
 *      the five for reading, sending and marking read are word for word as
 *      they were; "Users can delete their own messages" is replaced.
 *   1. Before anyone marks anything, everybody reads what they read before.
 *  1b. Nobody removes the other person's copy (the owner, while this was
 *      being built: "Make sure that applicant cannot delete any messages.
 *      They can delete it from their side, but it will still show on my
 *      side."): an applicant can remove no message at all, not the team's
 *      and not their own; nor can someone on the team, or anon. A job's
 *      owner can still clear the messages of their own application.
 *   2. Archive and move back: the caller's own mark, nothing else changes,
 *      nobody else can see the mark.
 *   3. Delete: every message so far stops coming back for the person who
 *      deleted, in every way they could ask (the list, the chat, the unread
 *      count, by id). The other person still reads every one of them.
 *   4. A message written after the delete is read normally by both, and the
 *      sender's own insert-and-read-back works.
 *   5. It only touches that one chat: the person's other chats are whole.
 *   6. cleared_at only moves forwards; archive and unarchive leave it alone.
 *   7. Who is refused: not signed in, anon, a chat the caller is not in, a
 *      person who does not exist, yourself, an unknown action. Nobody writes
 *      the table directly.
 *   8. Someone on the hiring team marks their own view of the employer's
 *      chat; the employer's view is untouched. A removed team member is
 *      refused.
 *   9. anon reads messages exactly as before (nothing, and no error).
 *  10. Deleting an account takes its marks with it.
 *
 * anon / authenticated / service_role are real, separate roles, so RLS and
 * GRANT/REVOKE are genuinely in force.
 *
 * Run with: node scripts/chat_archive_delete.pglite.test.mjs
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

// ── People ──────────────────────────────────────────────────────────────────
const OWNER = "10000000-0000-4000-8000-000000000001"; // the employer
const OTHER_EMP = "10000000-0000-4000-8000-000000000002"; // another employer
const TEAM = "10000000-0000-4000-8000-0000000000a1"; // on OWNER's team, active
const TEAM_GONE = "10000000-0000-4000-8000-0000000000a2"; // on OWNER's team, removed
const ANA = "20000000-0000-4000-8000-000000000001"; // applicant, chats with OWNER
const BEN = "20000000-0000-4000-8000-000000000002"; // applicant, chats with OWNER
const CAT = "20000000-0000-4000-8000-000000000003"; // applicant, chats with OTHER_EMP only
const NOBODY = "20000000-0000-4000-8000-0000000000ee"; // no such account

const JOB = "30000000-0000-4000-8000-00000000000a";
const JOB_X = "30000000-0000-4000-8000-0000000000aa";
const APP_ANA = "40000000-0000-4000-8000-000000000001";
const APP_BEN = "40000000-0000-4000-8000-000000000002";
const APP_CAT = "40000000-0000-4000-8000-000000000003";

async function migrationFile() {
  const names = (await readdir(MIGRATIONS)).filter((n) => /^\d+_chat_archive_and_delete\.sql$/.test(n));
  return names.length === 1 ? path.join(MIGRATIONS, names[0]) : null;
}

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create or replace function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
    $$;

    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant anon to postgres;
    grant authenticated to postgres;
    grant service_role to postgres;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant execute on function auth.role() to anon, authenticated, service_role;
    -- As on Supabase: client roles reach every new public table and function
    -- by default; RLS and REVOKEs do the restricting.
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

    create table public.jobs (id uuid primary key, employer_id uuid not null, title text not null);
    create table public.team_members (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null, employer_id uuid not null,
      status text default 'active',
      can_message_candidates boolean default true,
      assigned_job_ids uuid[] default '{}'
    );
    create table public.applications (
      id uuid primary key,
      job_id uuid not null references public.jobs(id) on delete cascade,
      candidate_id uuid not null
    );
    create or replace function public.is_job_owner(p_job_id uuid, p_user_id uuid)
    returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
      select (p_user_id = auth.uid() or auth.role() = 'service_role')
        and exists (select 1 from public.jobs j where j.id = p_job_id and j.employer_id = p_user_id);
    $$;

    -- public.messages and its six policies, as they are live
    -- (information_schema.columns and pg_policies, production, 2026-10-08).
    create table public.messages (
      id uuid primary key default gen_random_uuid(),
      sender_id uuid not null references auth.users(id) on delete cascade,
      receiver_id uuid not null references auth.users(id) on delete cascade,
      application_id uuid references public.applications(id) on delete set null,
      content text not null,
      is_read boolean not null default false,
      created_at timestamptz not null default now(),
      file_url text, file_name text, file_type text, file_size integer
    );
    alter table public.messages enable row level security;
    create policy "Users can view their own messages" on public.messages for select
      using ((auth.uid() = sender_id) or (auth.uid() = receiver_id));
    create policy "Team members can view messages for assigned jobs" on public.messages for select
      using (exists (
        select 1 from public.applications a
          join public.jobs j on j.id = a.job_id
          join public.team_members tm on tm.employer_id = j.employer_id
         where a.id = messages.application_id and tm.user_id = auth.uid() and tm.status = 'active'
           and (array_length(tm.assigned_job_ids, 1) is null or j.id = any (tm.assigned_job_ids))
      ));
    create policy "Receivers can update message read status" on public.messages for update
      using (auth.uid() = receiver_id);
    create policy "Users can delete their own messages" on public.messages for delete
      using ((auth.uid() = sender_id) or (auth.uid() = receiver_id));
    create policy "Counterparties can send messages" on public.messages for insert to authenticated
      with check ((auth.uid() = sender_id) and (
        exists (select 1 from public.applications a join public.jobs j on j.id = a.job_id
                 where a.candidate_id = auth.uid() and j.employer_id = messages.receiver_id
                   and (messages.application_id is null or messages.application_id = a.id))
        or exists (select 1 from public.applications a
                    where a.candidate_id = messages.receiver_id and public.is_job_owner(a.job_id, auth.uid())
                      and (messages.application_id is null or messages.application_id = a.id))
      ));
    create policy "Team members can send messages if permitted" on public.messages for insert
      with check ((auth.uid() = sender_id) and exists (
        select 1 from public.applications a
          join public.jobs j on j.id = a.job_id
          join public.team_members tm on tm.employer_id = j.employer_id
         where a.id = messages.application_id and messages.receiver_id = a.candidate_id
           and tm.user_id = auth.uid() and tm.status = 'active' and tm.can_message_candidates = true
           and (array_length(tm.assigned_job_ids, 1) is null or j.id = any (tm.assigned_job_ids))
      ));
  `);

  for (const id of [OWNER, OTHER_EMP, TEAM, TEAM_GONE, ANA, BEN, CAT]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id.slice(-4)}@example.com`]);
  }
  await db.query(`insert into public.jobs (id, employer_id, title) values ($1,$2,'Support lead'),($3,$4,'Other job')`, [JOB, OWNER, JOB_X, OTHER_EMP]);
  await db.query(`insert into public.team_members (user_id, employer_id, status) values ($1,$3,'active'),($2,$3,'removed')`, [TEAM, TEAM_GONE, OWNER]);
  await db.query(`insert into public.applications (id, job_id, candidate_id) values ($1,$4,$5),($2,$4,$6),($3,$7,$8)`, [APP_ANA, APP_BEN, APP_CAT, JOB, ANA, BEN, JOB_X, CAT]);

  // Yesterday's chats. Ana: three messages (one with no application on it,
  // as six of the eleven live rows are), the last one unread by the owner.
  const old = [
    ["m-ana-1", ANA, OWNER, APP_ANA, "Hello, any update?", true, "2 days"],
    ["m-ana-2", OWNER, ANA, null, "We will be in touch.", true, "47 hours"],
    ["m-ana-3", ANA, OWNER, APP_ANA, "Thank you!", false, "46 hours"],
    ["m-ben-1", BEN, OWNER, APP_BEN, "Hi, Ben here.", false, "30 hours"],
    ["m-ben-2", OWNER, BEN, APP_BEN, "Hi Ben.", true, "29 hours"],
    ["m-cat-1", CAT, OTHER_EMP, APP_CAT, "Hi from Cat.", false, "20 hours"],
  ];
  for (const [content, from, to, app, body, read, ago] of old) {
    await db.query(
      `insert into public.messages (sender_id, receiver_id, application_id, content, is_read, created_at, file_name) values ($1,$2,$3,$4,$5, now() - $6::interval, $7)`,
      [from, to, app, body, read, ago, content],
    );
  }

  async function as(uid, role, sql, params = []) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
    await db.exec(`select set_config('request.jwt.claim.role', '${role}', false);`);
    await db.exec(`set role ${role};`);
    try {
      const r = await db.query(sql, params);
      return { ok: true, rows: r.rows };
    } catch (e) {
      return { ok: false, error: e.message, code: e.code };
    } finally {
      await db.exec(`reset role;`);
      await db.exec(`select set_config('request.jwt.claim.sub', '', false);`);
      await db.exec(`select set_config('request.jwt.claim.role', '', false);`);
    }
  }
  const pg = (sql, params = []) => db.query(sql, params).then((r) => r.rows);
  return { db, as, pg };
}

/** Which of the seeded messages (by their tag, kept in file_name) a person reads. */
async function reads(as, uid, role = "authenticated") {
  const r = await as(uid, role, `select file_name from public.messages where file_name is not null order by created_at`);
  return r.ok ? r.rows.map((x) => x.file_name).join(",") : `ERROR ${r.code}: ${r.error}`;
}

async function main() {
  const file = await migrationFile();
  check("the migration file is there, once", !!file);
  if (!file) return;
  const sql = await readFile(file, "utf8");
  const { db, as, pg } = await setup();

  const policiesBefore = await pg(`select policyname, permissive, roles::text, cmd, coalesce(qual,'') as qual, coalesce(with_check,'') as with_check from pg_policies where tablename = 'messages' order by policyname`);

  console.log("\n0. It applies, twice");
  let applied = true;
  try {
    await db.exec(sql);
    await db.exec(sql);
  } catch (e) {
    applied = false;
    console.log(String(e.message));
  }
  check("the migration runs, and runs again", applied);
  const policiesAfter = await pg(`select policyname, permissive, roles::text, cmd, coalesce(qual,'') as qual, coalesce(with_check,'') as with_check from pg_policies where tablename = 'messages' order by policyname`);
  const added = policiesAfter.filter((p) => !policiesBefore.some((b) => b.policyname === p.policyname));
  const gone = policiesBefore.filter((b) => !policiesAfter.some((p) => p.policyname === b.policyname)).map((b) => b.policyname);
  const kept = policiesBefore.filter((b) => show(policiesAfter.find((p) => p.policyname === b.policyname)) === show(b));
  check("the five policies for reading, sending and marking read are word for word as they were", policiesBefore.length === 6 && kept.length === 5 && kept.every((k) => k.cmd !== "DELETE"), show(kept.map((k) => k.policyname)));
  check("the one policy that is gone is the one that let either side remove any row of a chat", show(gone) === show(["Users can delete their own messages"]), show(gone));
  const hides = added.find((p) => p.cmd === "SELECT");
  const removes = added.find((p) => p.cmd === "DELETE");
  check("two policies are added, and no more", added.length === 2 && !!hides && !!removes, show(added.map((a) => a.policyname)));
  check("the one for reading can only take rows away: restrictive, signed-in people only", hides?.permissive === "RESTRICTIVE" && hides?.roles === "{authenticated}", show(hides));
  check("the one for removing is the only DELETE policy left, for signed-in people", removes?.roles === "{authenticated}" && policiesAfter.filter((p) => p.cmd === "DELETE").length === 1, show(removes));
  const cols = await pg(`select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'messages'`);
  const trig = await pg(`select count(*)::int as n from pg_trigger where tgrelid = 'public.messages'::regclass and not tgisinternal`);
  check("no column and no trigger is added to messages", cols[0].n === 11 && trig[0].n === 0, show({ cols, trig }));

  console.log("\n1. Before anyone marks anything");
  check("the owner reads both of their chats", (await reads(as, OWNER)) === "m-ana-1,m-ana-2,m-ana-3,m-ben-1,m-ben-2", await reads(as, OWNER));
  check("Ana reads hers", (await reads(as, ANA)) === "m-ana-1,m-ana-2,m-ana-3");
  check("the other employer reads only theirs", (await reads(as, OTHER_EMP)) === "m-cat-1");
  check("someone on the team reads the messages that carry an application of the job", (await reads(as, TEAM)) === "m-ana-1,m-ana-3,m-ben-1,m-ben-2", await reads(as, TEAM));

  console.log("\n1b. Nobody removes the other person's copy");
  const total = async () => (await pg(`select count(*)::int as n from public.messages`))[0].n;
  const before = await total();
  for (const [name, uid, where] of [
    ["what the hiring team wrote to them", ANA, `file_name = 'm-ana-2'`],
    ["their own message, which the team has read", ANA, `file_name = 'm-ana-1'`],
    ["everything they can see, in one go", ANA, `true`],
    ["by naming the chat, as the old delete-the-conversation did", BEN, `(sender_id = '${BEN}' and receiver_id = '${OWNER}') or (sender_id = '${OWNER}' and receiver_id = '${BEN}')`],
  ]) {
    const r = await as(uid, "authenticated", `delete from public.messages where ${where} returning id`);
    check(`an applicant cannot remove ${name}`, r.ok && r.rows.length === 0 && (await total()) === before, show(r));
  }
  const teamRemoves = await as(TEAM, "authenticated", `delete from public.messages where true returning id`);
  check("someone on the hiring team cannot remove a message either", teamRemoves.ok && teamRemoves.rows.length === 0 && (await total()) === before, show(teamRemoves));
  const anonRemoves = await as(null, "anon", `delete from public.messages where true returning id`);
  check("anon removes nothing", anonRemoves.ok && anonRemoves.rows.length === 0 && (await total()) === before, show(anonRemoves));
  const ownerLoose = await as(OWNER, "authenticated", `delete from public.messages where file_name = 'm-ana-2' returning id`);
  check("the owner cannot remove a message that is on no application", ownerLoose.ok && ownerLoose.rows.length === 0 && (await total()) === before, show(ownerLoose));
  const ownerOthers = await as(OWNER, "authenticated", `delete from public.messages where application_id = $1 returning id`, [APP_CAT]);
  check("or the messages of another employer's application", ownerOthers.ok && ownerOthers.rows.length === 0 && (await total()) === before, show(ownerOthers));
  // The one place the app ever removed messages: a job's owner deleting an application of theirs.
  await db.query(`insert into auth.users (id, email) values ($1, 'gone@example.com')`, ["20000000-0000-4000-8000-0000000000d0"]);
  await db.query(`insert into public.applications (id, job_id, candidate_id) values ($1,$2,$3)`, ["40000000-0000-4000-8000-0000000000d0", JOB, "20000000-0000-4000-8000-0000000000d0"]);
  await db.query(`insert into public.messages (sender_id, receiver_id, application_id, content) values ($1,$2,$3,'a'),($2,$1,$3,'b')`, ["20000000-0000-4000-8000-0000000000d0", OWNER, "40000000-0000-4000-8000-0000000000d0"]);
  const theirsFirst = await as("20000000-0000-4000-8000-0000000000d0", "authenticated", `delete from public.messages where application_id = $1 returning id`, ["40000000-0000-4000-8000-0000000000d0"]);
  check("that application's own applicant still cannot", theirsFirst.ok && theirsFirst.rows.length === 0 && (await total()) === before + 2, show(theirsFirst));
  const ownerClears = await as(OWNER, "authenticated", `delete from public.messages where application_id = $1 returning id`, ["40000000-0000-4000-8000-0000000000d0"]);
  check("a job's owner can still clear the messages of an application of theirs", ownerClears.ok && ownerClears.rows.length === 2 && (await total()) === before, show(ownerClears));
  await db.query(`delete from auth.users where id = $1`, ["20000000-0000-4000-8000-0000000000d0"]);
  check("and after all of that everybody reads what they read before", (await reads(as, OWNER)) === "m-ana-1,m-ana-2,m-ana-3,m-ben-1,m-ben-2" && (await reads(as, ANA)) === "m-ana-1,m-ana-2,m-ana-3" && (await reads(as, BEN)) === "m-ben-1,m-ben-2");

  console.log("\n2. Archive, and move back");
  const arch = await as(OWNER, "authenticated", `select public.set_chat_state($1, 'archive') as s`, [ANA]);
  check("the owner archives the chat with Ana", arch.ok && arch.rows[0].s.contact_id === ANA && !!arch.rows[0].s.archived_at && arch.rows[0].s.cleared_at === null, show(arch));
  check("archiving hides nothing: every message is still read", (await reads(as, OWNER)) === "m-ana-1,m-ana-2,m-ana-3,m-ben-1,m-ben-2");
  const mine = await as(OWNER, "authenticated", `select contact_id, archived_at is not null as archived from public.message_thread_state`);
  check("the owner reads their own mark", mine.ok && mine.rows.length === 1 && mine.rows[0].contact_id === ANA && mine.rows[0].archived === true, show(mine));
  for (const [who, name] of [[ANA, "Ana, whose chat it is"], [TEAM, "someone on the team"], [OTHER_EMP, "another employer"]]) {
    const theirs = await as(who, "authenticated", `select * from public.message_thread_state`);
    check(`${name} cannot see that mark`, theirs.ok && theirs.rows.length === 0, show(theirs));
  }
  const anonMarks = await as(null, "anon", `select * from public.message_thread_state`);
  check("anon cannot read the marks at all", !anonMarks.ok && anonMarks.code === "42501", show(anonMarks));
  const back = await as(OWNER, "authenticated", `select public.set_chat_state($1, 'unarchive') as s`, [ANA]);
  check("moving it back clears the mark", back.ok && back.rows[0].s.archived_at === null && back.rows[0].s.cleared_at === null, show(back));

  console.log("\n3. Delete: gone for the person who deleted, kept by the other");
  await as(OWNER, "authenticated", `select public.set_chat_state($1, 'archive')`, [ANA]);
  const del = await as(OWNER, "authenticated", `select public.set_chat_state($1, 'delete') as s`, [ANA]);
  check("the owner deletes the chat with Ana", del.ok && !!del.rows[0].s.cleared_at, show(del));
  check("a deleted chat is not also archived", del.ok && del.rows[0].s.archived_at === null, show(del));
  check("the owner no longer reads any of it (the page's list and the open chat ask this)", (await reads(as, OWNER)) === "m-ben-1,m-ben-2", await reads(as, OWNER));
  const unread = await as(OWNER, "authenticated", `select count(*)::int as n from public.messages where receiver_id = $1 and is_read = false`, [OWNER]);
  check("the unread count no longer counts it (Ana's last message was unread)", unread.ok && unread.rows[0].n === 1, show(unread));
  const anaIds = await pg(`select id from public.messages where file_name like 'm-ana-%'`);
  const byId = await as(OWNER, "authenticated", `select id from public.messages where id = any($1::uuid[])`, [`{${anaIds.map((r) => r.id).join(",")}}`]);
  check("asked for by id, they still do not come back", byId.ok && byId.rows.length === 0, show(byId));
  check("Ana still reads every message, the owner's reply included", (await reads(as, ANA)) === "m-ana-1,m-ana-2,m-ana-3", await reads(as, ANA));
  const stored = await pg(`select count(*)::int as n from public.messages where file_name like 'm-ana-%'`);
  check("no row left public.messages", stored[0].n === 3);
  const markRead = await as(OWNER, "authenticated", `update public.messages set is_read = true where file_name = 'm-ana-3' returning id`);
  check("nor can the owner change one of them", markRead.ok && markRead.rows.length === 0, show(markRead));
  const hardDelete = await as(OWNER, "authenticated", `delete from public.messages where file_name like 'm-ana-%' returning id`);
  check("or remove Ana's copy through them", hardDelete.ok && hardDelete.rows.length === 0 && (await pg(`select count(*)::int as n from public.messages where file_name like 'm-ana-%'`))[0].n === 3, show(hardDelete));

  console.log("\n4. What is written afterwards");
  await new Promise((resolve) => setTimeout(resolve, 15));
  const again = await as(ANA, "authenticated", `insert into public.messages (sender_id, receiver_id, application_id, content, file_name) values ($1,$2,$3,'One more thing','m-ana-4') returning id`, [ANA, OWNER, APP_ANA]);
  check("Ana writes again, and her own insert reads back", again.ok && again.rows.length === 1, show(again));
  check("the owner's chat with Ana starts over from that message", (await reads(as, OWNER)) === "m-ben-1,m-ben-2,m-ana-4", await reads(as, OWNER));
  const reply = await as(OWNER, "authenticated", `insert into public.messages (sender_id, receiver_id, application_id, content, file_name) values ($1,$2,$3,'Yes?','m-ana-5') returning id`, [OWNER, ANA, APP_ANA]);
  check("the owner replies, and the insert reads back for them", reply.ok && reply.rows.length === 1, show(reply));
  check("Ana reads the whole history, old and new", (await reads(as, ANA)) === "m-ana-1,m-ana-2,m-ana-3,m-ana-4,m-ana-5", await reads(as, ANA));
  const readNew = await as(OWNER, "authenticated", `update public.messages set is_read = true where file_name = 'm-ana-4' returning id`);
  check("the owner can mark the new one read", readNew.ok && readNew.rows.length === 1, show(readNew));

  console.log("\n5. Only that chat");
  check("the owner's chat with Ben is whole", (await reads(as, OWNER)).includes("m-ben-1,m-ben-2"));
  check("Ben reads his", (await reads(as, BEN)) === "m-ben-1,m-ben-2");
  check("the other employer's chat is untouched", (await reads(as, OTHER_EMP)) === "m-cat-1");

  console.log("\n6. Deleted stays deleted");
  const clearedAt = (await pg(`select cleared_at from public.message_thread_state where user_id = $1 and contact_id = $2`, [OWNER, ANA]))[0].cleared_at;
  await as(OWNER, "authenticated", `select public.set_chat_state($1, 'archive')`, [ANA]);
  await as(OWNER, "authenticated", `select public.set_chat_state($1, 'unarchive')`, [ANA]);
  const afterMarks = (await pg(`select cleared_at from public.message_thread_state where user_id = $1 and contact_id = $2`, [OWNER, ANA]))[0].cleared_at;
  check("archiving and moving back leave the delete where it was", String(afterMarks) === String(clearedAt));
  check("and bring nothing back", (await reads(as, OWNER)) === "m-ben-1,m-ben-2,m-ana-4,m-ana-5", await reads(as, OWNER));
  await new Promise((resolve) => setTimeout(resolve, 15));
  const delAgain = await as(OWNER, "authenticated", `select public.set_chat_state($1, 'delete') as s`, [ANA]);
  const later = (await pg(`select cleared_at from public.message_thread_state where user_id = $1 and contact_id = $2`, [OWNER, ANA]))[0].cleared_at;
  check("deleting again moves it forwards, taking the newer messages too", delAgain.ok && new Date(later) > new Date(clearedAt) && (await reads(as, OWNER)) === "m-ben-1,m-ben-2", await reads(as, OWNER));
  for (const [what, statement] of [
    ["insert a mark", `insert into public.message_thread_state (user_id, contact_id, archived_at) values ('${OWNER}', '${BEN}', now())`],
    ["set a delete back", `update public.message_thread_state set cleared_at = null where user_id = '${OWNER}'`],
    ["remove a mark", `delete from public.message_thread_state where user_id = '${OWNER}'`],
  ]) {
    const direct = await as(OWNER, "authenticated", statement);
    check(`nobody can ${what} directly, not even its owner`, !direct.ok && direct.code === "42501", show(direct));
  }
  check("so it is still gone", (await reads(as, OWNER)) === "m-ben-1,m-ben-2");

  console.log("\n7. Who is refused");
  const refusals = [
    ["a chat the caller is not in (another employer's applicant)", OWNER, "authenticated", CAT, "archive"],
    ["somebody else's chat, from the applicant side", CAT, "authenticated", OWNER, "delete"],
    ["a person who does not exist", OWNER, "authenticated", NOBODY, "archive"],
    ["yourself", OWNER, "authenticated", OWNER, "delete"],
    ["a removed team member", TEAM_GONE, "authenticated", ANA, "archive"],
  ];
  for (const [name, uid, role, contact, action] of refusals) {
    const r = await as(uid, role, `select public.set_chat_state($1, $2)`, [contact, action]);
    check(`refused: ${name}`, !r.ok && r.code === "42501" && /not allowed/.test(r.error), show(r));
  }
  const unknown = await as(OWNER, "authenticated", `select public.set_chat_state($1, 'restore')`, [ANA]);
  check("refused: an action that is not archive, unarchive or delete", !unknown.ok && unknown.code === "22023", show(unknown));
  const noContact = await as(OWNER, "authenticated", `select public.set_chat_state(null, 'archive')`);
  check("refused: nobody named", !noContact.ok && noContact.code === "42501", show(noContact));
  const signedOut = await as(null, "authenticated", `select public.set_chat_state($1, 'archive')`, [ANA]);
  check("refused: not signed in", !signedOut.ok && signedOut.code === "42501", show(signedOut));
  const anonCall = await as(null, "anon", `select public.set_chat_state($1, 'archive')`, [ANA]);
  check("anon cannot call it at all", !anonCall.ok && anonCall.code === "42501" && /permission denied/.test(anonCall.error), show(anonCall));
  const strangerRows = await pg(`select count(*)::int as n from public.message_thread_state where user_id <> $1`, [OWNER]);
  check("none of those left a mark", strangerRows[0].n === 0, show(strangerRows));

  console.log("\n8. The applicant's own side, and someone on the team");
  const benDel = await as(BEN, "authenticated", `select public.set_chat_state($1, 'delete') as s`, [OWNER]);
  check("Ben may delete his own side of his chat", benDel.ok && !!benDel.rows[0].s.cleared_at, show(benDel));
  check("Ben no longer reads it", (await reads(as, BEN)) === "", await reads(as, BEN));
  check("the owner still reads every message with Ben", (await reads(as, OWNER)) === "m-ben-1,m-ben-2", await reads(as, OWNER));
  const teamDel = await as(TEAM, "authenticated", `select public.set_chat_state($1, 'delete') as s`, [BEN]);
  check("someone on the team may delete their own view of the employer's chat with Ben", teamDel.ok && !!teamDel.rows[0].s.cleared_at, show(teamDel));
  check("it is gone from their view only: they keep the rest", (await reads(as, TEAM)) === "m-ana-1,m-ana-3,m-ana-4,m-ana-5", await reads(as, TEAM));
  check("and the owner's view is untouched", (await reads(as, OWNER)) === "m-ben-1,m-ben-2");

  console.log("\n9. anon");
  const anonReads = await as(null, "anon", `select id from public.messages`);
  check("anon reads no message, and gets no error, exactly as before", anonReads.ok && anonReads.rows.length === 0, show(anonReads));

  console.log("\n10. A deleted account");
  await db.query(`delete from auth.users where id = $1`, [BEN]);
  const left = await pg(`select count(*)::int as n from public.message_thread_state where user_id = $1 or contact_id = $1`, [BEN]);
  check("takes its own marks, and the marks others put on chats with it", left[0].n === 0, show(left));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
