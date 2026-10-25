#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261025400000_daily_alert_claims.sql
 * (the eighth Phase 5 review): "told today" for the server's alerts is kept
 * where no client can write. claim_daily_alert(key) answers true the first
 * time a key is claimed in a UTC day and false after; only the service role
 * may call it, so an applicant cannot claim an alert to keep it from the
 * platform admins.
 *
 * Run with: node scripts/daily_alert_claims.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

const db = new PGlite();
await db.exec(`
  create schema private;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant anon to postgres; grant authenticated to postgres; grant service_role to postgres;
  grant usage on schema public to anon, authenticated, service_role;
  -- The default grants Supabase gives every new function.
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  create table private.ai_budget_alerts (day date not null, alert text not null, sent_at timestamptz not null default now(), primary key (day, alert));
  revoke all on table private.ai_budget_alerts from public, anon, authenticated;
`);
const migration = readFileSync(path.join(ROOT, "supabase/migrations/20261025400000_daily_alert_claims.sql"), "utf8");
await db.exec(migration);
await db.exec(migration);
check("the migration applies, and applies again", true);

async function as(role, sql) {
  await db.exec(`set role ${role};`);
  try {
    return { ok: true, rows: (await db.query(sql)).rows };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await db.exec("reset role;");
  }
}

let r = await as("service_role", "select public.claim_daily_alert('cleanup:delete') as first");
check("the server's first claim of the day answers true", r.ok && r.rows[0].first === true, JSON.stringify(r));
r = await as("service_role", "select public.claim_daily_alert('cleanup:delete') as first");
check("…the second answers false (told once a day)", r.ok && r.rows[0].first === false, JSON.stringify(r));
r = await as("service_role", "select public.claim_daily_alert('cleanup:read') as first");
check("…each alert has its own day (a read failure never hides a delete failure)", r.ok && r.rows[0].first === true);
await db.exec("update private.ai_budget_alerts set day = day - 1 where alert = 'cleanup:delete'");
r = await as("service_role", "select public.claim_daily_alert('cleanup:delete') as first");
check("…and tomorrow it is told again", r.ok && r.rows[0].first === true);
for (const role of ["authenticated", "anon"]) {
  r = await as(role, "select public.claim_daily_alert('cleanup:leftovers') as first");
  check(`${role === "anon" ? "a signed-out visitor" : "a signed-in applicant"} cannot claim an alert to keep it from the admins`, !r.ok && /permission denied/i.test(r.error), JSON.stringify(r));
  r = await as(role, "insert into private.ai_budget_alerts (day, alert) values (current_date, 'cleanup:leftovers')");
  check(`…nor write the record directly (${role})`, !r.ok);
}
r = await as("service_role", "select public.claim_daily_alert('cleanup:leftovers') as first");
check("…so the server's claim still answers true", r.ok && r.rows[0].first === true);
r = await as("service_role", `select public.claim_daily_alert('') as a, public.claim_daily_alert(null) as b, public.claim_daily_alert(repeat('x', 201)) as c`);
check("an empty, missing or overlong key claims nothing", r.ok && r.rows[0].a === false && r.rows[0].b === false && r.rows[0].c === false);

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
