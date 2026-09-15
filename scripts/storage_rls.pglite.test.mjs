#!/usr/bin/env node
/**
 * PGlite RLS proof for supabase/migrations/20260915100000_private_portfolios_and_attachments.sql.
 *
 * Runs the migration's *actual, committed* SQL (read straight off disk, not
 * retyped here) against a real Postgres (PGlite — Postgres compiled to wasm,
 * not a mock) stubbed with just enough of the live schema to exercise it:
 * `auth.uid()`, `storage.objects`/`storage.buckets`/`storage.foldername()`,
 * and the `jobs` / `applications` / `team_members` / `messages` columns the
 * policies actually join on (copied from yqklrkpptnhubsnijqze). Row Level
 * Security is genuinely enforced — every assertion runs as a real, unprivileged
 * `authenticated` or `anon` Postgres role via `SET ROLE`, not as the
 * superuser that created the schema, so a passing assertion means the policy
 * itself allowed or blocked the row, not that the harness assumed it would.
 *
 * This is the harness for storage privacy going forward: extend FIXTURES +
 * add assertions here for every new case, the same way
 * score_aggregation.test.mjs is extended for scoring.
 *
 * Run with: node scripts/storage_rls.pglite.test.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATION = "supabase/migrations/20260915100000_private_portfolios_and_attachments.sql";

// --- fixture ids -----------------------------------------------------------
// Not real UUIDs from any project — just distinct, readable v4-shaped strings.

const CANDIDATE_A = "10000000-0000-4000-8000-000000000001"; // uploads the real files
const CANDIDATE_B = "10000000-0000-4000-8000-000000000002"; // separate candidate; pastes A's path into their own notes
const EMPLOYER_1 = "20000000-0000-4000-8000-000000000001"; // owns job1 (posted the job A and B applied to)
const EMPLOYER_2 = "20000000-0000-4000-8000-000000000002"; // owns job2 — unrelated, A also applied there
const EMPLOYER_3 = "20000000-0000-4000-8000-000000000003"; // owns job3 — B's target for the notes-injection attack; has NO other route to FILE_A
const TEAM_ACTIVE = "30000000-0000-4000-8000-000000000001"; // active team member of employer1, assigned to job1
const TEAM_UNASSIGNED = "30000000-0000-4000-8000-000000000002"; // active team member of employer1, NOT assigned to job1
const TEAM_INACTIVE = "30000000-0000-4000-8000-000000000003"; // revoked team member of employer1
const RANDOM_USER = "40000000-0000-4000-8000-000000000001"; // has no relationship to any of this at all

const JOB_1 = "50000000-0000-4000-8000-000000000001"; // employer1
const JOB_2 = "50000000-0000-4000-8000-000000000002"; // employer2
const JOB_3 = "50000000-0000-4000-8000-000000000003"; // employer3

const APPLICATION_1 = "60000000-0000-4000-8000-000000000001"; // A -> job1, notes correctly reference FILE_A (bare path)
const APPLICATION_2 = "60000000-0000-4000-8000-000000000002"; // B -> job3 (employer3), B's own application, notes ALSO paste FILE_A's path (the attack)
const APPLICATION_3 = "60000000-0000-4000-8000-000000000003"; // A -> job1, notes reference FILE_A_LEGACY as a full public URL
const APPLICATION_4 = "60000000-0000-4000-8000-000000000004"; // A -> job2 (employer2), notes do not mention FILE_A at all
const APPLICATION_5 = "60000000-0000-4000-8000-000000000005"; // A -> job1, notes reference FILE_WILDCARD (name has literal % and _)
const APPLICATION_6 = "60000000-0000-4000-8000-000000000006"; // B -> job3 (employer3), a fresh/real application; notes say nothing about FILE_A yet — the UPDATE-forgery target

const SUPABASE_HOST = "https://yqklrkpptnhubsnijqze.supabase.co";

// --- setup -------------------------------------------------------------------

async function main() {
  const db = new PGlite();
  const migrationSql = await readFile(path.join(ROOT, MIGRATION), "utf8");

  await db.exec(`
    -- auth.uid(), the same definition Supabase itself uses.
    create schema auth;
    create or replace function auth.uid() returns uuid
      language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

    -- storage.objects / storage.buckets / storage.foldername(), trimmed to the
    -- columns the migration's policies actually reference. foldername() body is
    -- copied verbatim from live storage.foldername.
    create schema storage;
    create table storage.buckets (
      id text primary key,
      public boolean not null default false
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text,
      name text,
      owner uuid
    );
    create or replace function storage.foldername(name text) returns text[]
      language plpgsql immutable
      as $$
      declare _parts text[];
      begin
        select string_to_array(name, '/') into _parts;
        return _parts[1 : array_length(_parts,1) - 1];
      end
      $$;

    -- public.jobs / applications / team_members / messages, trimmed to the
    -- columns the migration's policies join on (types copied from live schema).
    create table jobs (
      id uuid primary key,
      employer_id uuid not null
    );
    create table applications (
      id uuid primary key,
      job_id uuid not null references jobs(id),
      candidate_id uuid not null,
      notes text
    );
    create table team_members (
      id uuid primary key,
      user_id uuid not null,
      employer_id uuid not null,
      status text not null,
      can_message_candidates boolean not null default true,
      assigned_job_ids uuid[]
    );
    create table messages (
      id uuid primary key default gen_random_uuid(),
      sender_id uuid not null,
      receiver_id uuid not null,
      application_id uuid references applications(id),
      file_url text,
      is_read boolean not null default false
    );

    -- Real, unprivileged Postgres roles — no BYPASSRLS, distinct from the
    -- superuser that creates the schema below, so SET ROLE later genuinely
    -- subjects every query to RLS instead of the owner bypassing it.
    create role anon;
    create role authenticated;
    grant usage on schema auth, storage, public to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
    grant select on storage.buckets, jobs, team_members to anon, authenticated;
    -- applications/messages additionally get insert+update here (matching the
    -- live, table-wide grants confirmed via information_schema.role_table_grants
    -- for both tables) so the UPDATE-forgery assertions below can actually issue
    -- the UPDATE and observe what the migration's trigger / column grant does to
    -- it, rather than being blocked one layer earlier by a grant the harness
    -- never gave them.
    grant select, insert, update on applications, messages to anon, authenticated;

    alter table storage.objects enable row level security;
  `);

  // The migration's own, unmodified SQL — this is what's actually being proved.
  await db.exec(migrationSql);

  // --- fixtures --------------------------------------------------------------
  // All inserted as the connecting superuser, which owns every table and so
  // bypasses RLS regardless of role — fixture setup is not itself a proof of
  // anything, only what the assertions below see once a real role is active.

  await db.query(`insert into jobs (id, employer_id) values ($1,$2),($3,$4),($5,$6)`, [
    JOB_1, EMPLOYER_1, JOB_2, EMPLOYER_2, JOB_3, EMPLOYER_3,
  ]);

  await db.query(
    `insert into team_members (id, user_id, employer_id, status, can_message_candidates, assigned_job_ids) values
       ($1,$2,$3,'active',true, array[$4]::uuid[]),
       ($5,$6,$3,'active',true, array[$7]::uuid[]),
       ($8,$9,$3,'revoked',true, null)`,
    [
      "31000000-0000-4000-8000-000000000001", TEAM_ACTIVE, EMPLOYER_1, JOB_1,
      "31000000-0000-4000-8000-000000000002", TEAM_UNASSIGNED, JOB_2, // assigned to a job that isn't job1
      "31000000-0000-4000-8000-000000000003", TEAM_INACTIVE,
    ],
  );

  // FILE_A: candidateA's real upload, correctly referenced by application_1's
  // notes in the bare-path shape PortfolioUploadPhase.tsx writes today.
  const FILE_A = `${CANDIDATE_A}/fileA.png`;
  await db.query(`insert into storage.objects (bucket_id, name, owner) values ('portfolios',$1,$2)`, [FILE_A, CANDIDATE_A]);
  await db.query(`insert into applications (id, job_id, candidate_id, notes) values ($1,$2,$3,$4)`, [
    APPLICATION_1, JOB_1, CANDIDATE_A, JSON.stringify({ files: [{ url: FILE_A, name: "fileA.png" }] }),
  ]);

  // The attack (1): candidateB's OWN, legitimate application to employer3's
  // job3 — a job/employer with NO other route to FILE_A at all — but its
  // notes additionally paste candidateA's real file path into it. If employer3
  // can read FILE_A through this, the only thing that could have granted it is
  // the notes match alone; there is no legitimate application backing it.
  await db.query(`insert into applications (id, job_id, candidate_id, notes) values ($1,$2,$3,$4)`, [
    APPLICATION_2, JOB_3, CANDIDATE_B,
    JSON.stringify({ files: [{ url: `${CANDIDATE_B}/legit-own-file.png` }] , stolenPath: FILE_A }),
  ]);

  // FILE_A_LEGACY: candidateA's file, referenced the OLD way — a full public
  // URL, exactly the shape the live d4d4d4d4... row still holds.
  const FILE_A_LEGACY = `${CANDIDATE_A}/fileA-legacy.png`;
  const legacyUrl = `${SUPABASE_HOST}/storage/v1/object/public/portfolios/${FILE_A_LEGACY}`;
  await db.query(`insert into storage.objects (bucket_id, name, owner) values ('portfolios',$1,$2)`, [FILE_A_LEGACY, CANDIDATE_A]);
  await db.query(`insert into applications (id, job_id, candidate_id, notes) values ($1,$2,$3,$4)`, [
    APPLICATION_3, JOB_1, CANDIDATE_A, JSON.stringify({ files: [{ url: legacyUrl, name: "fileA-legacy.png" }] }),
  ]);

  // candidateA's second application, to a DIFFERENT employer's job — notes say
  // nothing about FILE_A. Proves the grant stays scoped to the application
  // that actually references the file, not "any employer this candidate ever
  // applied to" (the over-grant the previous PGlite round explicitly ruled out).
  await db.query(`insert into applications (id, job_id, candidate_id, notes) values ($1,$2,$3,$4)`, [
    APPLICATION_4, JOB_2, CANDIDATE_A, JSON.stringify({ applicationAnswers: [] }),
  ]);

  // FILE_WILDCARD: a real file whose name itself contains literal LIKE
  // metacharacters (`%`, `_`) — correctly referenced, to prove position()
  // still finds a real, exact match even when the needle has special chars.
  const FILE_WILDCARD = `${CANDIDATE_A}/50%_off.png`;
  await db.query(`insert into storage.objects (bucket_id, name, owner) values ('portfolios',$1,$2)`, [FILE_WILDCARD, CANDIDATE_A]);
  await db.query(`insert into applications (id, job_id, candidate_id, notes) values ($1,$2,$3,$4)`, [
    APPLICATION_5, JOB_1, CANDIDATE_A, JSON.stringify({ files: [{ url: FILE_WILDCARD }] }),
  ]);

  // --- message-attachments fixtures ------------------------------------------

  // MSG_FILE_REAL: candidateA's real upload, referenced by a real message from
  // A to the employer (bare path — useMessages.ts's current shape).
  const MSG_FILE_REAL = `${CANDIDATE_A}/msg1.png`;
  await db.query(`insert into storage.objects (bucket_id, name, owner) values ('message-attachments',$1,$2)`, [MSG_FILE_REAL, CANDIDATE_A]);
  await db.query(
    `insert into messages (id, sender_id, receiver_id, application_id, file_url) values ($1,$2,$3,$4,$5)`,
    ["70000000-0000-4000-8000-000000000001", CANDIDATE_A, EMPLOYER_1, APPLICATION_1, MSG_FILE_REAL],
  );

  // MSG_FILE_LEGACY: employer1's real upload, referenced by a real message,
  // stored the OLD way (full public URL, from before useMessages.ts switched
  // to bare paths).
  const MSG_FILE_LEGACY = `${EMPLOYER_1}/msg2.png`;
  const msgLegacyUrl = `${SUPABASE_HOST}/storage/v1/object/public/message-attachments/${MSG_FILE_LEGACY}`;
  await db.query(`insert into storage.objects (bucket_id, name, owner) values ('message-attachments',$1,$2)`, [MSG_FILE_LEGACY, EMPLOYER_1]);
  await db.query(
    `insert into messages (id, sender_id, receiver_id, application_id, file_url) values ($1,$2,$3,$4,$5)`,
    ["70000000-0000-4000-8000-000000000002", EMPLOYER_1, CANDIDATE_A, APPLICATION_1, msgLegacyUrl],
  );

  // MSG_FILE_TEAM: another real employer1 -> candidateA upload in the same
  // thread, used to prove a team member (neither sender nor receiver) can
  // still read it.
  const MSG_FILE_TEAM = `${EMPLOYER_1}/msg-team.png`;
  await db.query(`insert into storage.objects (bucket_id, name, owner) values ('message-attachments',$1,$2)`, [MSG_FILE_TEAM, EMPLOYER_1]);
  await db.query(
    `insert into messages (id, sender_id, receiver_id, application_id, file_url) values ($1,$2,$3,$4,$5)`,
    ["70000000-0000-4000-8000-000000000003", EMPLOYER_1, CANDIDATE_A, APPLICATION_1, MSG_FILE_TEAM],
  );

  return { db, MSG_FILE_REAL, MSG_FILE_LEGACY, MSG_FILE_TEAM };
}

// --- role helpers ------------------------------------------------------------

async function asUser(db, uid) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  await db.exec(`set role authenticated`);
}
async function asAnon(db) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [""]);
  await db.exec(`set role anon`);
}
async function asAdmin(db) {
  await db.exec(`reset role`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [""]);
}

/** Row visibility, as whatever role/uid is currently active. */
async function canSee(db, bucket, name) {
  const r = await db.query(`select 1 from storage.objects where bucket_id = $1 and name = $2`, [bucket, name]);
  return r.rows.length > 0;
}

/** Attempt a delete (rolled back immediately after) — true if it removed a row. */
async function canDelete(db, bucket, name) {
  await db.exec("begin");
  try {
    const r = await db.query(`delete from storage.objects where bucket_id = $1 and name = $2 returning 1`, [bucket, name]);
    return r.rows.length > 0;
  } finally {
    await db.exec("rollback");
  }
}

// --- assertions ----------------------------------------------------------------

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  ok    ${message}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  }
}

async function run() {
  const { db, MSG_FILE_REAL, MSG_FILE_LEGACY, MSG_FILE_TEAM } = await main();
  const FILE_A = `${CANDIDATE_A}/fileA.png`;
  const FILE_A_LEGACY = `${CANDIDATE_A}/fileA-legacy.png`;
  const FILE_WILDCARD = `${CANDIDATE_A}/50%_off.png`;

  console.log("Portfolios — candidate self-access:\n");
  await asUser(db, CANDIDATE_A);
  assert(await canSee(db, "portfolios", FILE_A), "candidateA can read their own uploaded file");
  await asUser(db, CANDIDATE_B);
  assert(!(await canSee(db, "portfolios", FILE_A)), "candidateB (a different candidate) cannot read candidateA's file directly");
  await asAnon(db);
  assert(!(await canSee(db, "portfolios", FILE_A)), "anon cannot read candidateA's file");

  console.log("\nPortfolios — employer/team access via a legitimate application:\n");
  await asUser(db, EMPLOYER_1);
  assert(await canSee(db, "portfolios", FILE_A), "job owner (employer1) can read the file their applicant's notes legitimately reference");
  await asUser(db, TEAM_ACTIVE);
  assert(await canSee(db, "portfolios", FILE_A), "an active team member assigned to job1 can read it too");
  await asUser(db, TEAM_INACTIVE);
  assert(!(await canSee(db, "portfolios", FILE_A)), "a revoked team member cannot");
  await asUser(db, EMPLOYER_2);
  assert(
    !(await canSee(db, "portfolios", FILE_A)),
    "employer2 cannot read FILE_A — even though candidateA separately applied to employer2's job2 — (no over-grant across applications)",
  );

  console.log("\nPortfolios — point (1): path injection via applications.notes is denied:\n");
  await asAdmin(db);
  const r = await db.query(
    `select 1 from applications where id = $1 and position($2 in notes) > 0`,
    [APPLICATION_2, FILE_A],
  );
  assert(r.rows.length > 0, "sanity: application_2's (candidateB -> job3) notes do contain candidateA's pasted path (the injection attempt is in place)");
  // employer3 has no legitimate application referencing FILE_A at all — the
  // only thing that could grant them a read is the notes match on
  // application_2 by itself. Before the candidate_id binding, this would have
  // passed (the old policy only checked "some application of one of my jobs
  // mentions this path in its notes").
  await asUser(db, EMPLOYER_3);
  assert(
    !(await canSee(db, "portfolios", FILE_A)),
    "employer3 cannot read candidateA's file via candidateB pasting its path into candidateB's own (job3) application notes",
  );
  await asUser(db, CANDIDATE_B);
  assert(
    !(await canSee(db, "portfolios", FILE_A)),
    "candidateB themself has no route to it either (not an employer/team of any job it's referenced from)",
  );

  console.log("\nPortfolios — legacy full-URL notes (point fixed earlier this round):\n");
  await asUser(db, EMPLOYER_1);
  assert(await canSee(db, "portfolios", FILE_A_LEGACY), "employer1 can read a file referenced by a legacy full-URL note");
  await asUser(db, TEAM_ACTIVE);
  assert(await canSee(db, "portfolios", FILE_A_LEGACY), "an active team member can too");
  await asUser(db, EMPLOYER_2);
  assert(!(await canSee(db, "portfolios", FILE_A_LEGACY)), "an unrelated employer cannot");

  console.log("\nPortfolios — wildcard characters in the object name:\n");
  await asUser(db, EMPLOYER_1);
  assert(
    await canSee(db, "portfolios", FILE_WILDCARD),
    "employer1 can still read a real file whose name contains literal % and _ (position() handles it as a literal, not a pattern)",
  );
  {
    // The concrete vulnerability class LIKE would have reopened: an object
    // name that is itself made of LIKE metacharacters turns the OLD
    // `notes like ('%' || objects.name || '%')` predicate into a pattern that
    // can match text having nothing to do with the real path.
    const bare = await db.query(`select ('no real path in here at all' like ('%' || $1 || '%')) as v`, ["%"]);
    const exact = await db.query(`select (position($1 in 'no real path in here at all') > 0) as v`, ["%"]);
    assert(bare.rows[0].v === true, "sanity: a bare '%' object name DOES turn the old LIKE predicate into an always-match pattern");
    assert(exact.rows[0].v === false, "the new position()-based predicate does not — unrelated text is correctly not matched");
  }

  console.log("\nPortfolios — point (2): a forged UPDATE cannot rebind candidate_id:\n");
  await asAdmin(db);
  // A fresh, entirely legitimate application from candidateB to employer3's
  // own job3 — notes say nothing about FILE_A yet.
  await db.query(`insert into applications (id, job_id, candidate_id, notes) values ($1,$2,$3,$4)`, [
    APPLICATION_6, JOB_3, CANDIDATE_B, JSON.stringify({ files: [] }),
  ]);
  await asUser(db, EMPLOYER_3);
  // The forgery the reviewer demonstrated: employer3 owns job3 and so can
  // already UPDATE application_6 (is_job_owner) — rewrite that row's
  // candidate_id to candidateA and paste candidateA's real portfolio path
  // into its notes, in one statement. Before the candidate_id-pin trigger,
  // this satisfied every check the SELECT policy above makes, with data
  // employer3 just forged on their own, unrelated application.
  let appForgeryThrew = false;
  try {
    await db.query(`update applications set candidate_id = $1, notes = $2 where id = $3`, [
      CANDIDATE_A, JSON.stringify({ files: [{ url: FILE_A }] }), APPLICATION_6,
    ]);
  } catch {
    appForgeryThrew = true;
  }
  assert(
    appForgeryThrew,
    "employer3's forged UPDATE (candidate_id -> candidateA, notes -> candidateA's real path) is rejected by the candidate_id-pin trigger",
  );
  assert(!(await canSee(db, "portfolios", FILE_A)), "...and employer3 still cannot read candidateA's file afterward");
  await asAdmin(db);
  const app6Check = await db.query(`select candidate_id, notes from applications where id = $1`, [APPLICATION_6]);
  assert(
    app6Check.rows[0].candidate_id === CANDIDATE_B && !/fileA\.png/.test(app6Check.rows[0].notes ?? ""),
    "application_6 is entirely unchanged (candidate_id still candidateB, notes still empty) after the rejected forgery — the whole statement rolled back, not just the candidate_id column",
  );
  // Sanity: employer3 can still legitimately edit their own application's
  // notes when candidate_id is left untouched — the same shape as
  // ava-voice-tools writing voice-interview notes as the employer's own
  // authenticated session.
  await asUser(db, EMPLOYER_3);
  await db.query(`update applications set notes = $1 where id = $2`, [
    JSON.stringify({ voiceInterviewNotes: "no concerns" }), APPLICATION_6,
  ]);
  await asAdmin(db);
  const app6NotesCheck = await db.query(`select notes from applications where id = $1`, [APPLICATION_6]);
  assert(
    /voiceInterviewNotes/.test(app6NotesCheck.rows[0].notes ?? ""),
    "employer3 can still edit their own application's notes when candidate_id is left untouched",
  );

  console.log("\nMessage attachments — participants and legacy URLs:\n");
  await asUser(db, CANDIDATE_A);
  assert(await canSee(db, "message-attachments", MSG_FILE_REAL), "candidateA (the sender) can read their own real attachment");
  await asUser(db, EMPLOYER_1);
  assert(await canSee(db, "message-attachments", MSG_FILE_REAL), "employer1 (the receiver) can read it too");
  assert(await canSee(db, "message-attachments", MSG_FILE_LEGACY), "employer1 (the uploader) can read a legacy full-URL attachment");
  await asUser(db, CANDIDATE_A);
  assert(await canSee(db, "message-attachments", MSG_FILE_LEGACY), "candidateA (the receiver) can read that legacy attachment too");
  await asAnon(db);
  assert(!(await canSee(db, "message-attachments", MSG_FILE_REAL)), "anon cannot read any message attachment");

  console.log("\nMessage attachments — point (2): a fake messages row naming a victim's real path:\n");
  await asAdmin(db);
  // The attack: RANDOM_USER, who has no application or relationship to
  // candidateA at all, inserts a message row *naming their own id* as sender
  // and pointing file_url at candidateA's real, already-uploaded object.
  await db.query(
    `insert into messages (id, sender_id, receiver_id, application_id, file_url) values ($1,$2,$3,$4,$5)`,
    ["70000000-0000-4000-8000-000000000009", RANDOM_USER, RANDOM_USER, null, MSG_FILE_REAL],
  );
  await asUser(db, RANDOM_USER);
  assert(
    !(await canSee(db, "message-attachments", MSG_FILE_REAL)),
    "RANDOM_USER cannot read candidateA's real attachment via a fake messages row naming its path",
  );
  assert(
    !(await canDelete(db, "message-attachments", MSG_FILE_REAL)),
    "RANDOM_USER cannot delete it either, via the same fake row",
  );
  // The real uploader can still delete their own file.
  await asUser(db, CANDIDATE_A);
  assert(await canDelete(db, "message-attachments", MSG_FILE_REAL), "candidateA (the real uploader) can still delete their own attachment");
  // The receiver of a real message is no longer enough to delete a file they
  // did not upload (the DELETE tightening) — employer1 received MSG_FILE_REAL
  // but candidateA uploaded it.
  await asUser(db, EMPLOYER_1);
  assert(
    !(await canDelete(db, "message-attachments", MSG_FILE_REAL)),
    "employer1 (a real receiver, not the uploader) can no longer delete a file they didn't upload",
  );

  console.log("\nMessage attachments — point (1): a forged UPDATE cannot rebind sender_id/file_url:\n");
  await asUser(db, RANDOM_USER);
  // RANDOM_USER inserts a message to themselves — sender_id = receiver_id =
  // their own uid, allowed by "Users can send messages" — then attempts the
  // exact forgery the reviewer demonstrated: UPDATE that same row's
  // sender_id to candidateA and file_url to candidateA's real, already-
  // uploaded attachment, while receiver_id stays their own. Before the
  // column-privilege fix, this satisfied every check in the SELECT policy
  // with data RANDOM_USER just wrote themselves.
  const SELF_MSG_ID = "70000000-0000-4000-8000-000000000010";
  await db.query(
    `insert into messages (id, sender_id, receiver_id, application_id, file_url) values ($1,$2,$2,null,$3)`,
    [SELF_MSG_ID, RANDOM_USER, "placeholder"],
  );
  let msgForgeryThrew = false;
  try {
    await db.query(`update messages set sender_id = $1, file_url = $2 where id = $3`, [
      CANDIDATE_A, MSG_FILE_REAL, SELF_MSG_ID,
    ]);
  } catch {
    msgForgeryThrew = true;
  }
  assert(
    msgForgeryThrew,
    "RANDOM_USER's forged UPDATE (sender_id -> candidateA, file_url -> candidateA's real attachment) is rejected — UPDATE is now granted on is_read only",
  );
  assert(
    !(await canSee(db, "message-attachments", MSG_FILE_REAL)),
    "...and RANDOM_USER still cannot read candidateA's real attachment through the (unchanged) self-message row",
  );
  await asAdmin(db);
  const selfMsgCheck = await db.query(`select sender_id, file_url from messages where id = $1`, [SELF_MSG_ID]);
  assert(
    selfMsgCheck.rows[0].sender_id === RANDOM_USER && selfMsgCheck.rows[0].file_url === "placeholder",
    "the self-message row itself is unchanged after the rejected forgery attempt",
  );
  // Sanity: the one legitimate UPDATE — a real receiver marking a real
  // message read — still works.
  await asUser(db, EMPLOYER_1);
  await db.query(`update messages set is_read = true where id = $1`, ["70000000-0000-4000-8000-000000000001"]);
  await asAdmin(db);
  const readCheck = await db.query(`select is_read from messages where id = $1`, ["70000000-0000-4000-8000-000000000001"]);
  assert(readCheck.rows[0].is_read === true, "employer1 (a real receiver) can still mark a real message read via UPDATE(is_read)");

  console.log("\nMessage attachments — point (3): team members of a readable thread:\n");
  await asUser(db, TEAM_ACTIVE);
  assert(await canSee(db, "message-attachments", MSG_FILE_TEAM), "an active team member assigned to job1 can read an attachment in that thread");
  await asUser(db, TEAM_UNASSIGNED);
  assert(
    !(await canSee(db, "message-attachments", MSG_FILE_TEAM)),
    "an active team member NOT assigned to job1 cannot (mirrors the live messages SELECT policy's assigned_job_ids gate)",
  );
  await asUser(db, TEAM_INACTIVE);
  assert(!(await canSee(db, "message-attachments", MSG_FILE_TEAM)), "a revoked team member cannot");
  await asUser(db, RANDOM_USER);
  assert(!(await canSee(db, "message-attachments", MSG_FILE_TEAM)), "an unrelated authenticated user cannot");

  console.log(failures ? `\n${failures} assertion(s) failed.` : "\nAll assertions passed.");
  process.exit(failures ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
