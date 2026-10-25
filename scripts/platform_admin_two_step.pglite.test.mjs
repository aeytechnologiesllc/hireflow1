#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261025060000_platform_admin_two_step.sql
 * (docs/LAUNCH-PLAN.md, Phase 1, task 7): the platform admin's powers need
 * the second step only once the admin has a verified authenticator, so
 * turning it on can never lock the admin out; a non-admin is never an admin.
 *
 * Run with: node scripts/platform_admin_two_step.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
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

const ADMIN = "90000000-0000-4000-8000-000000000001";
const BUSINESS = "20000000-0000-4000-8000-000000000002";
const db = new PGlite();
await db.exec(`
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text);
  create role anon nologin; create role authenticated nologin;
  grant anon, authenticated to postgres;
  create table public.platform_admins (user_id uuid primary key);
  insert into public.platform_admins values ('${ADMIN}');
`);
await db.exec(readFileSync(path.join(ROOT, "supabase/migrations/20261025060000_platform_admin_two_step.sql"), "utf8"));

async function asUser(uid, aal) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false); select set_config('request.jwt.claims', '{"aal":"${aal}"}', false);`);
  const r = await db.query(`select public.is_platform_admin() as admin, public.is_platform_admin_account() as account`);
  return r.rows[0];
}

let r = await asUser(ADMIN, "aal1");
check("before any authenticator, the admin is an admin with a password alone", r.admin === true && r.account === true);
await db.exec(`insert into auth.mfa_factors (user_id, status) values ('${ADMIN}', 'unverified')`);
r = await asUser(ADMIN, "aal1");
check("an unfinished set-up changes nothing (no lock-out)", r.admin === true);
await db.exec(`update auth.mfa_factors set status = 'verified' where user_id = '${ADMIN}'`);
r = await asUser(ADMIN, "aal1");
check("with a verified authenticator, a password-only session is not an admin", r.admin === false);
check("…but the account is still known as the admin's (Settings shows the card)", r.account === true);
r = await asUser(ADMIN, "aal2");
check("after the second step, the admin is an admin", r.admin === true);
await db.exec(`delete from auth.mfa_factors where user_id = '${ADMIN}'`);
r = await asUser(ADMIN, "aal1");
check("removing the authenticator turns it back off", r.admin === true);
r = await asUser(BUSINESS, "aal2");
check("a business is never an admin, at any level", r.admin === false && r.account === false);
await db.exec(`select set_config('request.jwt.claim.sub', '', false);`);
r = (await db.query(`select public.is_platform_admin() as admin, public.is_platform_admin_account() as account`)).rows[0];
check("nobody signed in is never an admin", r.admin === false && r.account === false);

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
