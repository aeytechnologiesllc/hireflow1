#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20260916140000_voice_session_log.sql.
 *
 * Runs the migration's actual, committed SQL (read straight off disk, not
 * retyped here) against a real Postgres (PGlite — Postgres compiled to wasm,
 * not a mock), with the same broad `GRANT ... ON ALL TABLES IN SCHEMA public
 * TO anon, authenticated, service_role` every other RLS proof in this repo
 * uses to mirror Supabase's own default grants (storage_rls, rpc_caller_checks,
 * forgery_policy_lockdown) — so every assertion below is genuinely about the
 * table's RLS policy count, not an artifact of a missing GRANT. Every check
 * runs as a real, unprivileged `anon`/`authenticated` Postgres role via `SET
 * ROLE`, or as `service_role` (which bypasses RLS, exactly like the admin
 * client ava-voice-session/deduct-voice-minutes actually use).
 *
 * Proves:
 *   1. voice_session_log is genuinely server-only: anon and authenticated
 *      (including the session's own caller_user_id) get zero rows on SELECT
 *      and a denied/zero-row INSERT or UPDATE — matching this migration's
 *      own header comment and the same shape as quiz_attempt_ledger.
 *   2. The atomic settle pattern deduct-voice-minutes actually runs
 *      (`UPDATE ... WHERE ended_at IS NULL RETURNING`) is genuinely
 *      idempotent: the first call charges the session and returns one row;
 *      an identical second call — even one that tries to charge a much
 *      larger amount, simulating a replayed/retried request — matches zero
 *      rows and leaves minutes_charged exactly as the first call set it.
 *   3. The table's own CHECK constraints reject a bogus mode and a row
 *      whose ended_at/minutes_charged aren't set together.
 *   4. Deleting the referenced application sets application_id to NULL
 *      rather than deleting the billing record (ON DELETE SET NULL) — the
 *      audit trail of what was actually charged must survive the
 *      application being deleted.
 *
 * Run with: node scripts/voice_session_log.pglite.test.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATION = "supabase/migrations/20260916140000_voice_session_log.sql";

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

// --- fixture ids (not real UUIDs from any project) --------------------------
const EMPLOYER_1 = "20000000-0000-4000-8000-000000000001";
const CANDIDATE_1 = "10000000-0000-4000-8000-000000000001"; // the session's own caller
const STRANGER = "40000000-0000-4000-8000-000000000001"; // no relationship to this session at all
const APPLICATION_1 = "60000000-0000-4000-8000-000000000001";

async function asUser(db, uid) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  await db.exec(`set role authenticated`);
}
async function asAnon(db) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [""]);
  await db.exec(`set role anon`);
}
async function asServiceRole(db) {
  await db.exec(`reset role`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [""]);
  await db.exec(`set role service_role`);
}

async function main() {
  const db = new PGlite();
  const migrationSql = await readFile(path.join(ROOT, MIGRATION), "utf8").catch(() => null);
  check("migration file exists on disk", migrationSql != null, MIGRATION);
  if (!migrationSql) {
    console.log(`\n${failed} of ${passed + failed} checks failed.`);
    process.exit(1);
  }

  await db.exec(`
    -- ---- auth shim (mirrors Supabase's auth.uid()) ----
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid());
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant anon to postgres;
    grant authenticated to postgres;
    grant service_role to postgres;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant select on auth.users to anon, authenticated, service_role;

    -- Minimal public.applications — just enough for voice_session_log's FK.
    create table public.applications (
      id uuid primary key default gen_random_uuid()
    );
    grant usage on schema public to anon, authenticated, service_role;
  `);

  await db.query(`insert into public.applications (id) values ($1)`, [APPLICATION_1]);

  // Run the real migration, verbatim off disk.
  await db.exec(migrationSql);

  // Mirror Supabase's own default grants (also done by every other RLS
  // proof in this repo) so every assertion below is genuinely about RLS
  // policy count, not a missing table-level GRANT. Runs AFTER the migration
  // so it covers the table the migration just created.
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
  `);

  // ---- 1. mint a session, exactly like ava-voice-session does -------------
  await asServiceRole(db);
  const mintResult = await db.query(
    `insert into public.voice_session_log
       (application_id, employer_id, caller_user_id, mode, time_limit_minutes, hard_cap_minutes)
     values ($1, $2, $3, 'interview', 12, 60)
     returning id, started_at`,
    [APPLICATION_1, EMPLOYER_1, CANDIDATE_1],
  );
  check("service_role can mint (insert) a voice_session_log row", mintResult.rows.length === 1);
  const sessionId = mintResult.rows[0]?.id;

  // ---- 2. server-only: RLS blocks every client role, including the caller -
  await asAnon(db);
  const anonSelect = await db.query(`select * from public.voice_session_log where id = $1`, [sessionId]);
  check("anon SELECT sees zero rows (RLS, no policy for anon)", anonSelect.rows.length === 0);

  let anonInsertDenied = false;
  try {
    await db.query(
      `insert into public.voice_session_log (application_id, employer_id, caller_user_id, mode, time_limit_minutes)
       values ($1, $2, $3, 'interview', 12)`,
      [APPLICATION_1, STRANGER, STRANGER],
    );
  } catch {
    anonInsertDenied = true;
  }
  check("anon INSERT is denied (RLS, no policy for anon)", anonInsertDenied);

  await asUser(db, CANDIDATE_1); // the session's OWN caller
  const ownerSelect = await db.query(`select * from public.voice_session_log where id = $1`, [sessionId]);
  check(
    "even the session's own caller_user_id gets zero rows on SELECT (server-only, same as quiz_attempt_ledger)",
    ownerSelect.rows.length === 0,
  );

  const ownerUpdate = await db.query(
    `update public.voice_session_log set minutes_charged = 0, ended_at = now() where id = $1 returning id`,
    [sessionId],
  );
  check(
    "the session's own caller cannot self-settle the row (RLS blocks the UPDATE, matches zero rows)",
    ownerUpdate.rows.length === 0,
  );

  let strangerInsertDenied = false;
  await asUser(db, STRANGER);
  try {
    await db.query(
      `insert into public.voice_session_log (application_id, employer_id, caller_user_id, mode, time_limit_minutes)
       values ($1, $2, $3, 'interview', 999)`,
      [APPLICATION_1, STRANGER, STRANGER],
    );
  } catch {
    strangerInsertDenied = true;
  }
  check("an unrelated authenticated user cannot insert a forged session either", strangerInsertDenied);

  // ---- 3. the atomic settle pattern deduct-voice-minutes actually runs ----
  // Confirm the row is genuinely unsettled before charging.
  await asServiceRole(db);
  const preCheck = await db.query(
    `select ended_at, minutes_charged from public.voice_session_log where id = $1`,
    [sessionId],
  );
  check("session starts unsettled (ended_at/minutes_charged both NULL)", preCheck.rows[0]?.ended_at == null && preCheck.rows[0]?.minutes_charged == null);

  const firstSettle = await db.query(
    `update public.voice_session_log
       set ended_at = now(), minutes_charged = $2
     where id = $1 and ended_at is null
     returning id, minutes_charged`,
    [sessionId, 3],
  );
  check("first settle (the real charge) updates exactly one row", firstSettle.rows.length === 1);
  check("first settle records the capped amount (3 minutes)", firstSettle.rows[0]?.minutes_charged === 3);

  // A second call for the SAME session — simulating a retry, or the
  // end_interview tool-call path racing disconnect()'s cleanup path — with
  // an inflated amount, exactly like a replayed exploit payload would try.
  const secondSettle = await db.query(
    `update public.voice_session_log
       set ended_at = now(), minutes_charged = $2
     where id = $1 and ended_at is null
     returning id, minutes_charged`,
    [sessionId, 999999],
  );
  check(
    "second settle for the same session matches ZERO rows — no double charge",
    secondSettle.rows.length === 0,
  );

  const afterBoth = await db.query(
    `select minutes_charged from public.voice_session_log where id = $1`,
    [sessionId],
  );
  check(
    "minutes_charged is still 3 after the second (attempted 999999-minute) call — untouched",
    afterBoth.rows[0]?.minutes_charged === 3,
  );

  // ---- 4. CHECK constraints -------------------------------------------------
  let badModeRejected = false;
  try {
    await db.query(
      `insert into public.voice_session_log (employer_id, caller_user_id, mode, time_limit_minutes)
       values ($1, $2, 'not_a_real_mode', 10)`,
      [EMPLOYER_1, CANDIDATE_1],
    );
  } catch {
    badModeRejected = true;
  }
  check("a bogus mode value is rejected by the CHECK constraint", badModeRejected);

  let unsettledTogetherRejected = false;
  try {
    await db.query(
      `insert into public.voice_session_log (employer_id, caller_user_id, mode, time_limit_minutes, ended_at, minutes_charged)
       values ($1, $2, 'assistant', 20, now(), null)`,
      [EMPLOYER_1, CANDIDATE_1],
    );
  } catch {
    unsettledTogetherRejected = true;
  }
  check("ended_at set without minutes_charged is rejected (settled-together CHECK)", unsettledTogetherRejected);

  // ---- 5. ON DELETE SET NULL preserves the billing record ------------------
  await db.query(`delete from public.applications where id = $1`, [APPLICATION_1]);
  const afterAppDelete = await db.query(
    `select application_id, minutes_charged from public.voice_session_log where id = $1`,
    [sessionId],
  );
  check("deleting the application does not delete the session log row", afterAppDelete.rows.length === 1);
  check(
    "...but does null out application_id (ON DELETE SET NULL) rather than cascading",
    afterAppDelete.rows[0]?.application_id === null,
  );
  check(
    "...and the already-settled charge is untouched by the application's deletion",
    afterAppDelete.rows[0]?.minutes_charged === 3,
  );

  console.log(failed ? `\n${failed} of ${passed + failed} checks failed.` : `\nAll ${passed} checks passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
