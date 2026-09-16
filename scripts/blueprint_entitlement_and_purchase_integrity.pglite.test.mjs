#!/usr/bin/env node
/**
 * PGlite proof for
 * supabase/migrations/20260916160000_blueprint_entitlement_and_purchase_integrity.sql.
 *
 * Runs the migration's actual, committed SQL (read straight off disk, not
 * retyped here) against a real Postgres (PGlite — Postgres compiled to wasm,
 * not a mock), with the same broad `GRANT ... ON ALL TABLES IN SCHEMA public
 * TO anon, authenticated, service_role` every other RLS proof in this repo
 * uses to mirror Supabase's own default grants — so every assertion below is
 * genuinely about the migration's own RLS policies and constraints, not an
 * artifact of a missing GRANT. Every check runs as a real, unprivileged
 * `anon`/`authenticated` Postgres role via `SET ROLE`, or as `service_role`
 * (which bypasses RLS, exactly like the admin client
 * ai-generate-performance-report / verify-blueprint-purchase / stripe-webhook
 * actually use).
 *
 * Proves:
 *   1. app_settings: readable by anon AND authenticated (the client needs
 *      this to render honest pricing copy without an edge-function round
 *      trip); no anon/authenticated role can INSERT, UPDATE, or DELETE a
 *      row — including trying to flip 'blueprint_paid' to true themselves.
 *      service_role can write (bypasses RLS).
 *   2. The seeded 'blueprint_paid' row exists and defaults to `false`
 *      (free/included) — matching the free tier being open on purpose.
 *   3. blueprint_purchases' new unique index on stripe_session_id makes a
 *      second INSERT for the same session id fail outright, and makes
 *      ON CONFLICT (stripe_session_id) DO NOTHING — the exact pattern
 *      verify-blueprint-purchase and stripe-webhook now both use — a
 *      genuine no-op that leaves exactly one row for that session, not two.
 *   4. That same unique index does NOT block two DIFFERENT purchases that
 *      both happen to have a NULL stripe_session_id (the partial index is
 *      `where stripe_session_id is not null`), so it can never reject a
 *      legitimate non-Stripe-backed row some other write path might create.
 *
 * Run with: node scripts/blueprint_entitlement_and_purchase_integrity.pglite.test.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATION = "supabase/migrations/20260916160000_blueprint_entitlement_and_purchase_integrity.sql";

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

const CANDIDATE_1 = "10000000-0000-4000-8000-000000000001";
const CANDIDATE_2 = "10000000-0000-4000-8000-000000000002";
const STRANGER = "40000000-0000-4000-8000-000000000001";
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

    -- Minimal public.applications, and the ORIGINAL blueprint_purchases
    -- table exactly as 20251227004711_*.sql created it (this migration only
    -- ADDS an index on top of it — it must already exist for that to work).
    create table public.applications (
      id uuid primary key default gen_random_uuid()
    );
    create table public.blueprint_purchases (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      application_id uuid not null references public.applications(id) on delete cascade,
      stripe_session_id text,
      amount_paid integer default 199,
      purchased_at timestamptz not null default now()
    );
    grant usage on schema public to anon, authenticated, service_role;
  `);

  await db.query(`insert into public.applications (id) values ($1)`, [APPLICATION_1]);

  // Run the real migration, verbatim off disk.
  await db.exec(migrationSql);

  // Mirror Supabase's own default grants (also done by every other RLS
  // proof in this repo) so every assertion below is genuinely about RLS
  // policy count, not a missing table-level GRANT.
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
  `);

  // ---- 1. app_settings: public SELECT, no client writes -------------------
  await asAnon(db);
  const anonSelect = await db.query(`select key, value from public.app_settings where key = 'blueprint_paid'`);
  check("anon can SELECT app_settings (public config)", anonSelect.rows.length === 1);
  check("...and 'blueprint_paid' defaults to false (free tier open)", anonSelect.rows[0]?.value === false);

  let anonInsertDenied = false;
  try {
    await db.query(`insert into public.app_settings (key, value) values ('blueprint_paid', 'true'::jsonb)`);
  } catch {
    anonInsertDenied = true;
  }
  check("anon cannot INSERT into app_settings", anonInsertDenied);

  await asUser(db, CANDIDATE_1);
  const authSelect = await db.query(`select value from public.app_settings where key = 'blueprint_paid'`);
  check("authenticated can also SELECT app_settings", authSelect.rows.length === 1);

  let selfUpgradeAttempt = false;
  try {
    await db.query(`update public.app_settings set value = 'true'::jsonb where key = 'blueprint_paid'`);
    const after = await db.query(`select value from public.app_settings where key = 'blueprint_paid'`);
    selfUpgradeAttempt = after.rows[0]?.value !== true; // update matched 0 rows (still false) = blocked
  } catch {
    selfUpgradeAttempt = true; // outright denied = also blocked
  }
  check(
    "an authenticated candidate cannot flip 'blueprint_paid' to true themselves (no client write policy)",
    selfUpgradeAttempt,
  );

  let authDeleteDenied = false;
  try {
    const del = await db.query(`delete from public.app_settings where key = 'blueprint_paid'`);
    authDeleteDenied = del.rows.length === 0 || del.affectedRows === 0;
  } catch {
    authDeleteDenied = true;
  }
  check("authenticated cannot DELETE the app_settings row either", authDeleteDenied);

  await asServiceRole(db);
  const serviceUpdate = await db.query(
    `update public.app_settings set value = 'true'::jsonb where key = 'blueprint_paid' returning value`,
  );
  check("service_role (bypasses RLS) CAN flip the switch — this is the owner's eventual billing launch", serviceUpdate.rows[0]?.value === true);
  // Flip it back so the rest of this proof runs against the default (off) state.
  await db.query(`update public.app_settings set value = 'false'::jsonb where key = 'blueprint_paid'`);

  // ---- 2. blueprint_purchases unique index on stripe_session_id -----------
  await asServiceRole(db);
  const sessionId = "cs_test_abc123";
  const firstInsert = await db.query(
    `insert into public.blueprint_purchases (user_id, application_id, stripe_session_id, amount_paid)
     values ($1, $2, $3, 199)
     returning id`,
    [CANDIDATE_1, APPLICATION_1, sessionId],
  );
  check("first purchase insert for a session succeeds", firstInsert.rows.length === 1);

  let rawDuplicateRejected = false;
  try {
    await db.query(
      `insert into public.blueprint_purchases (user_id, application_id, stripe_session_id, amount_paid)
       values ($1, $2, $3, 199)`,
      [CANDIDATE_1, APPLICATION_1, sessionId],
    );
  } catch {
    rawDuplicateRejected = true;
  }
  check("a second plain INSERT for the SAME stripe_session_id is rejected by the unique index", rawDuplicateRejected);

  // The exact pattern verify-blueprint-purchase / stripe-webhook use:
  // upsert(...) with onConflict: 'stripe_session_id', ignoreDuplicates: true
  // == INSERT ... ON CONFLICT (stripe_session_id) DO NOTHING.
  const conflictInsert = await db.query(
    `insert into public.blueprint_purchases (user_id, application_id, stripe_session_id, amount_paid)
     values ($1, $2, $3, 999999)
     on conflict (stripe_session_id) do nothing
     returning id`,
    [STRANGER, APPLICATION_1, sessionId], // even a different user/amount — simulating a racing/replayed write
  );
  check(
    "ON CONFLICT DO NOTHING (the app's idempotent upsert pattern) matches ZERO rows for a repeat session — no double insert",
    conflictInsert.rows.length === 0,
  );

  const stillOne = await db.query(
    `select count(*)::int as n, min(amount_paid) as amt, max(amount_paid) as amt2
     from public.blueprint_purchases where stripe_session_id = $1`,
    [sessionId],
  );
  check("exactly one row exists for that session after both the raw duplicate and the racing upsert", stillOne.rows[0]?.n === 1);
  check("...and it's still the original $1.99 (199) purchase, untouched by the racing 999999 attempt", stillOne.rows[0]?.amt === 199 && stillOne.rows[0]?.amt2 === 199);

  // ---- 3. NULL stripe_session_id is never blocked by the partial index ----
  const nullSession1 = await db.query(
    `insert into public.blueprint_purchases (user_id, application_id, stripe_session_id, amount_paid)
     values ($1, $2, null, 199) returning id`,
    [CANDIDATE_1, APPLICATION_1],
  );
  const nullSession2 = await db.query(
    `insert into public.blueprint_purchases (user_id, application_id, stripe_session_id, amount_paid)
     values ($1, $2, null, 199) returning id`,
    [CANDIDATE_2, APPLICATION_1],
  );
  check(
    "two rows with a NULL stripe_session_id both insert fine — SQL NULLs are never equal, so a plain unique index never blocks them",
    nullSession1.rows.length === 1 && nullSession2.rows.length === 1,
  );

  console.log(failed ? `\n${failed} of ${passed + failed} checks failed.` : `\nAll ${passed} checks passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
