#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261025040000_profiles_email_from_account.sql
 * (docs/LAUNCH-PLAN.md, Phase 1, task 5): a write through the API cannot
 * change profiles.email, the system's own writes can, and an account's
 * address change in auth.users carries over to its profile.
 *
 * Run with: node scripts/profiles_email_from_account.pglite.test.mjs
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

const ME = "10000000-0000-4000-8000-000000000001";
const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant anon, authenticated, service_role to postgres;
  grant usage on schema public to anon, authenticated, service_role;
  create table public.profiles (user_id uuid primary key, email text, full_name text);
  insert into auth.users values ('${ME}', 'me@real.example');
  insert into public.profiles values ('${ME}', 'me@real.example', 'Me');
  alter table public.profiles enable row level security;
  create policy own on public.profiles for all to authenticated using (true) with check (true);
  grant select, update on public.profiles to authenticated, service_role;
`);
await db.exec(readFileSync(path.join(ROOT, "supabase/migrations/20261025040000_profiles_email_from_account.sql"), "utf8"));

const emailNow = async () => (await db.query(`select email, full_name from public.profiles where user_id = '${ME}'`)).rows[0];

await db.exec(`set role authenticated; update public.profiles set email = 'victim@elsewhere.example', full_name = 'Me Too' where user_id = '${ME}'; reset role;`);
let row = await emailNow();
check("an API write cannot change profiles.email", row.email === "me@real.example", row.email);
check("…while the rest of the same write still lands", row.full_name === "Me Too");

await db.exec(`set role anon; update public.profiles set email = 'x@y.z' where user_id = '${ME}'; reset role;`).catch(() => {});
check("anon cannot change it either", (await emailNow()).email === "me@real.example");

await db.exec(`set role service_role; update public.profiles set email = 'system@real.example' where user_id = '${ME}'; reset role;`);
check("the system's own write can", (await emailNow()).email === "system@real.example");

await db.exec(`update auth.users set email = 'changed@real.example' where id = '${ME}';`);
check("an account's address change carries over to its profile", (await emailNow()).email === "changed@real.example");

await db.exec(`update auth.users set email = email where id = '${ME}';`);
check("an unchanged address is a no-op", (await emailNow()).email === "changed@real.example");

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
