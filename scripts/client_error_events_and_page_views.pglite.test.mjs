#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20260916165000_client_error_events_and_page_views.sql
 * — plain assertions, no framework, real Postgres (via PGlite), not a text match.
 *
 * Builds a minimal fixture of the tables this migration depends on
 * (auth.users, user_roles, notifications, has_role — copied from
 * 20251214183024_*.sql), applies the migration under test VERBATIM (read
 * from disk, not retyped), then proves:
 *
 *   - client_error_events / page_view_daily are readable by a 'developer'
 *     role user and NOBODY else (not the row's own reporter, not anon) —
 *     genuine RLS, run as real unprivileged `authenticated`/`anon` Postgres
 *     roles via `SET ROLE`, exactly like the other RLS proofs in this repo.
 *   - record_client_error_event()/record_page_view() are service_role-only
 *     (anon/authenticated get a permission error, not a silently-empty
 *     no-op) — this is server-only ingestion, not a client-writable table.
 *   - record_client_error_event() groups occurrences by fingerprint (an
 *     upsert, not a new row per call), notifies every 'developer' user the
 *     FIRST time a fingerprint appears, stays quiet through a small run of
 *     repeat occurrences, then notifies again once occurrences cross the
 *     spike threshold — and does NOT notify a second time immediately after
 *     (the one-hour throttle).
 *   - record_page_view() aggregates same-dimension calls into one row's
 *     view_count and keeps different dimensions as separate rows.
 *
 * Run with: node scripts/client_error_events_and_page_views.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATION_PATH = path.join(
  ROOT,
  "supabase/migrations/20260916165000_client_error_events_and_page_views.sql",
);

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

const DEVELOPER_1 = "10000000-0000-4000-8000-000000000001";
const DEVELOPER_2 = "10000000-0000-4000-8000-000000000002";
const EMPLOYER = "20000000-0000-4000-8000-000000000001";
const CANDIDATE = "20000000-0000-4000-8000-000000000002";

async function main() {
  const db = new PGlite();
  const migrationSql = await readFile(MIGRATION_PATH, "utf8").catch(() => null);
  check("migration file exists on disk", migrationSql != null, MIGRATION_PATH);
  if (!migrationSql) {
    console.log(`\n${failed} of ${passed + failed} checks failed.`);
    process.exit(1);
  }

  await db.exec(`
    -- ---- auth shims (mirror Supabase's auth.uid()/auth.role()) ----
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid());
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

    -- Default privileges so tables the migration under test creates are
    -- reachable by the client roles too (RLS still governs actual rows) —
    -- mirrors the real project, where these grants pre-exist independent of
    -- any one migration.
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

    -- ---- minimal schema this migration depends on (from 20251214183024_*.sql) ----
    create type public.app_role as enum ('employer', 'candidate', 'team_member', 'developer');
    create type public.notification_type as enum ('message', 'application', 'interview', 'status_update', 'team', 'system');

    create table public.user_roles (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users(id) on delete cascade not null,
      role app_role not null,
      unique (user_id, role)
    );

    create table public.notifications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users(id) on delete cascade not null,
      type notification_type not null,
      title text not null,
      message text not null,
      link text,
      is_read boolean default false not null,
      created_at timestamptz default now() not null
    );

    create or replace function public.has_role(_user_id uuid, _role app_role)
    returns boolean language sql stable security definer set search_path = public as $$
      select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
    $$;

    alter table public.user_roles enable row level security;
    alter table public.notifications enable row level security;
    create policy "own roles" on public.user_roles for select using (auth.uid() = user_id);
    create policy "own notifications" on public.notifications for select using (auth.uid() = user_id);
  `);

  // seed users
  await db.query(`insert into auth.users (id) values ($1), ($2), ($3), ($4)`, [
    DEVELOPER_1, DEVELOPER_2, EMPLOYER, CANDIDATE,
  ]);
  await db.query(
    `insert into public.user_roles (user_id, role) values ($1, 'developer'), ($2, 'developer'), ($3, 'employer'), ($4, 'candidate')`,
    [DEVELOPER_1, DEVELOPER_2, EMPLOYER, CANDIDATE],
  );

  // ---- apply the migration under test, verbatim ----
  await db.exec(migrationSql);

  async function asUser(uid, role) {
    if (uid) await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false);`);
    else await db.exec(`select set_config('request.jwt.claim.sub', '', false);`);
    await db.exec(`select set_config('request.jwt.claim.role', '${role}', false);`);
    await db.exec(`set role ${role};`);
  }
  async function reset() {
    await db.exec(`reset role;`);
  }
  async function tryQuery(sql, params = []) {
    try {
      const res = await db.query(sql, params);
      return { ok: true, rows: res.rows };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // =========================================================================
  // RLS: client_error_events
  // =========================================================================
  console.log("\nclient_error_events RLS:\n");

  await asUser(null, "service_role");
  const firstCall = await tryQuery(
    `select * from public.record_client_error_event($1,$2,$3,$4,$5,$6,$7,$8)`,
    ["fp-a", "TypeError: boom", "at foo (bar.js:1:1)", "/jobs/123", "build-1", "chrome", "candidate", CANDIDATE],
  );
  check("service_role can call record_client_error_event", firstCall.ok, firstCall.error);
  check("first occurrence: is_new = true", firstCall.rows?.[0]?.out_is_new === true);
  check("first occurrence: occurrence_count = 1", Number(firstCall.rows?.[0]?.out_occurrence_count) === 1);
  await reset();

  await asUser(DEVELOPER_1, "authenticated");
  let res = await tryQuery(`select fingerprint, occurrence_count, last_user_id from public.client_error_events`);
  check("a developer can SELECT client_error_events", res.ok && res.rows.length === 1, res.error);
  check("last_user_id is stored when the reporting caller was signed in", res.rows[0].last_user_id === CANDIDATE, JSON.stringify(res.rows[0]));
  await reset();

  await asUser(EMPLOYER, "authenticated");
  res = await tryQuery(`select * from public.client_error_events`);
  check("a non-developer signed-in user sees ZERO client_error_events rows", res.ok && res.rows.length === 0, res.error);
  await reset();

  await asUser(null, "anon");
  res = await tryQuery(`select * from public.client_error_events`);
  check("anon sees ZERO client_error_events rows", res.ok && res.rows.length === 0, res.error);
  const anonWrite = await tryQuery(
    `select public.record_client_error_event($1,$2,$3,$4,$5,$6,$7,$8)`,
    ["fp-anon", "hi", null, "/", null, null, null, null],
  );
  check("anon CANNOT call record_client_error_event", anonWrite.ok === false, JSON.stringify(anonWrite));
  await reset();

  await asUser(EMPLOYER, "authenticated");
  const empWrite = await tryQuery(
    `select public.record_client_error_event($1,$2,$3,$4,$5,$6,$7,$8)`,
    ["fp-emp", "hi", null, "/", null, null, null, null],
  );
  check("a signed-in non-service caller CANNOT call record_client_error_event", empWrite.ok === false, JSON.stringify(empWrite));
  await reset();

  // =========================================================================
  // Fingerprint grouping + notification throttling
  // =========================================================================
  console.log("\nFingerprint grouping and developer notifications:\n");

  await asUser(null, "service_role");
  const secondCall = await tryQuery(
    `select * from public.record_client_error_event($1,$2,$3,$4,$5,$6,$7,$8)`,
    ["fp-a", "TypeError: boom", "at foo (bar.js:2:9)", "/jobs/123", "build-2", "chrome", "candidate", CANDIDATE],
  );
  check("repeat occurrence of the SAME fingerprint updates the existing row (is_new = false)", secondCall.rows?.[0]?.out_is_new === false);
  check("repeat occurrence increments occurrence_count to 2", Number(secondCall.rows?.[0]?.out_occurrence_count) === 2);

  let countRow = await tryQuery(`select count(*)::int as n from public.client_error_events`);
  check("still exactly one row for the fingerprint (grouped, not duplicated)", countRow.rows[0].n === 1);
  await reset();

  await asUser(DEVELOPER_1, "authenticated");
  let notifRow = await tryQuery(`select count(*)::int as n from public.notifications where user_id = $1`, [DEVELOPER_1]);
  check("developer 1 got exactly one notification for the brand-new fingerprint", notifRow.rows[0].n === 1, JSON.stringify(notifRow));
  await reset();
  await asUser(DEVELOPER_2, "authenticated");
  notifRow = await tryQuery(`select count(*)::int as n from public.notifications where user_id = $1`, [DEVELOPER_2]);
  check("developer 2 (also a developer) got the same new-fingerprint notification", notifRow.rows[0].n === 1);
  await reset();
  await asUser(CANDIDATE, "authenticated");
  notifRow = await tryQuery(`select count(*)::int as n from public.notifications where user_id = $1`, [CANDIDATE]);
  check("a non-developer user got NO error notification", notifRow.rows[0].n === 0);
  await reset();

  // last_notified_count is 1 (set when the brand-new fingerprint notified),
  // and last_notified_at is "just now" — inside the one-hour throttle
  // window. Drive occurrence_count up past the +25 delta threshold WITHOUT
  // moving last_notified_at back: the throttle must keep this quiet no
  // matter how large the delta gets, proving the "AND >= 1 hour" half of
  // the condition actually gates on time, not just count.
  await asUser(null, "service_role");
  for (let i = 0; i < 40; i++) {
    await db.query(`select public.record_client_error_event($1,$2,$3,$4,$5,$6,$7,$8)`, [
      "fp-a", "TypeError: boom", "at foo (bar.js:2:9)", "/jobs/123", "build-2", "chrome", "candidate", CANDIDATE,
    ]);
  }
  let row = await tryQuery(`select occurrence_count, last_notified_count from public.client_error_events where fingerprint = 'fp-a'`);
  check("occurrence_count is now 42 (well past a +25 delta)", row.rows[0].occurrence_count === 42, JSON.stringify(row.rows[0]));
  check("last_notified_count is UNCHANGED at 1 — throttle held even though the count delta qualifies", row.rows[0].last_notified_count === 1, JSON.stringify(row.rows[0]));
  await reset();
  await asUser(DEVELOPER_1, "authenticated");
  notifRow = await tryQuery(`select count(*)::int as n from public.notifications where user_id = $1`, [DEVELOPER_1]);
  check("throttle: still only ONE notification despite 42 occurrences, all inside the 1-hour window", notifRow.rows[0].n === 1, JSON.stringify(notifRow));
  await reset();

  // Now move last_notified_at back more than an hour (simulating real time
  // passing) and push occurrence_count over the threshold again — this time
  // both conditions hold, so it must notify.
  await tryQuery(`update public.client_error_events set last_notified_at = now() - interval '2 hours' where fingerprint = 'fp-a'`);
  await asUser(null, "service_role");
  await db.query(`select public.record_client_error_event($1,$2,$3,$4,$5,$6,$7,$8)`, [
    "fp-a", "TypeError: boom", "at foo (bar.js:2:9)", "/jobs/123", "build-2", "chrome", "candidate", CANDIDATE,
  ]);
  row = await tryQuery(`select occurrence_count, last_notified_count, last_notified_at from public.client_error_events where fingerprint = 'fp-a'`);
  check("occurrence_count reached 43", row.rows[0].occurrence_count === 43, JSON.stringify(row.rows[0]));
  check("last_notified_count caught up to 43 — a spike alert fired now that the throttle window passed", row.rows[0].last_notified_count === 43, JSON.stringify(row.rows[0]));
  await reset();

  await asUser(DEVELOPER_1, "authenticated");
  notifRow = await tryQuery(`select count(*)::int as n from public.notifications where user_id = $1`, [DEVELOPER_1]);
  check("developer got a SECOND notification for the spike", notifRow.rows[0].n === 2, JSON.stringify(notifRow));
  await reset();

  // Immediately drive more occurrences — throttle re-engages right away.
  await asUser(null, "service_role");
  for (let i = 0; i < 25; i++) {
    await db.query(`select public.record_client_error_event($1,$2,$3,$4,$5,$6,$7,$8)`, [
      "fp-a", "TypeError: boom", "at foo (bar.js:2:9)", "/jobs/123", "build-2", "chrome", "candidate", CANDIDATE,
    ]);
  }
  await reset();
  await asUser(DEVELOPER_1, "authenticated");
  notifRow = await tryQuery(`select count(*)::int as n from public.notifications where user_id = $1`, [DEVELOPER_1]);
  check("throttle re-engages: still only 2 notifications immediately after another 25 occurrences", notifRow.rows[0].n === 2, JSON.stringify(notifRow));
  await reset();

  // A genuinely different fingerprint notifies independently.
  await asUser(null, "service_role");
  await db.query(`select public.record_client_error_event($1,$2,$3,$4,$5,$6,$7,$8)`, [
    "fp-b", "ReferenceError: nope", "at baz (qux.js:1:1)", "/applicants", null, "safari", null, null,
  ]);
  await reset();
  await asUser(DEVELOPER_1, "authenticated");
  notifRow = await tryQuery(`select count(*)::int as n from public.notifications where user_id = $1`, [DEVELOPER_1]);
  check("a second, distinct fingerprint notifies independently (now 3 total)", notifRow.rows[0].n === 3, JSON.stringify(notifRow));
  await reset();

  // =========================================================================
  // page_view_daily: RLS + aggregation
  // =========================================================================
  console.log("\npage_view_daily RLS and aggregation:\n");

  await asUser(null, "service_role");
  const pv1 = await tryQuery(
    `select public.record_page_view(current_date, $1, $2, $3, $4, $5, $6)`,
    ["/jobs", "google.com", "google", "cpc", "launch", "mobile"],
  );
  check("service_role can call record_page_view", pv1.ok, pv1.error);
  await db.query(`select public.record_page_view(current_date, $1, $2, $3, $4, $5, $6)`, [
    "/jobs", "google.com", "google", "cpc", "launch", "mobile",
  ]);
  await db.query(`select public.record_page_view(current_date, $1, $2, $3, $4, $5, $6)`, [
    "/jobs", "google.com", "google", "cpc", "launch", "desktop", // different device_class -> separate row
  ]);
  await reset();

  await asUser(DEVELOPER_1, "authenticated");
  res = await tryQuery(`select path, device_class, view_count from public.page_view_daily order by device_class`);
  check("developer can SELECT page_view_daily", res.ok && res.rows.length === 2, res.error);
  const mobileRow = res.rows.find((r) => r.device_class === "mobile");
  const desktopRow = res.rows.find((r) => r.device_class === "desktop");
  check("same-dimension calls aggregate into one row with view_count = 2", mobileRow?.view_count === 2, JSON.stringify(res.rows));
  check("a different device_class stays a separate row with view_count = 1", desktopRow?.view_count === 1, JSON.stringify(res.rows));
  await reset();

  await asUser(null, "anon");
  res = await tryQuery(`select * from public.page_view_daily`);
  check("anon sees ZERO page_view_daily rows", res.ok && res.rows.length === 0, res.error);
  const anonPv = await tryQuery(`select public.record_page_view(current_date, $1, $2, $3, $4, $5, $6)`, [
    "/x", "", "", "", "", "desktop",
  ]);
  check("anon CANNOT call record_page_view", anonPv.ok === false, JSON.stringify(anonPv));
  await reset();

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
