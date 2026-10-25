#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261025050000_drop_leftover_open_policies.sql
 * (docs/LAUNCH-PLAN.md, Phase 1, task 6): a database rebuilt from the
 * migration files ends with no USING (true) / WITH CHECK (true) policy except
 * the two intended public reads; scoped policies are untouched; and on a
 * database that already has only those two (the live one), it drops nothing.
 *
 * Run with: node scripts/drop_leftover_open_policies.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SQL = readFileSync(path.join(ROOT, "supabase/migrations/20261025050000_drop_leftover_open_policies.sql"), "utf8");
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

async function world() {
  const db = new PGlite();
  await db.exec(`
    create schema storage;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create role anon nologin; create role authenticated nologin;
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    create table public.applications (id uuid primary key, candidate_id uuid);
    create table public.messages (id uuid primary key);
    create table public.app_settings (key text primary key, value jsonb);
    create table public.business_pages (id uuid primary key);
    alter table storage.objects enable row level security;
    alter table public.applications enable row level security;
    alter table public.messages enable row level security;
    alter table public.app_settings enable row level security;
    alter table public.business_pages enable row level security;
    create policy "app_settings readable by anyone" on public.app_settings for select using (true);
    create policy "Anyone reads a careers page" on public.business_pages for select using (true);
    create policy "Candidates can view their own applications" on public.applications for select using (auth.uid() = candidate_id);
  `);
  return db;
}
const policies = async (db) =>
  (await db.query(`select schemaname || '.' || tablename || ': ' || policyname as p from pg_policies order by 1`)).rows.map((r) => r.p);

// A rebuild that still carries the June 2026 demo policies.
{
  const db = await world();
  await db.exec(`
    create policy "demo upload interview audio" on storage.objects for insert to anon, authenticated with check (true);
    create policy "public read applications" on public.applications for select using (true);
    create policy "public read messages" on public.messages for select using (true);
    create policy "demo update application" on public.applications for update using (true) with check (true);
    create policy "public apply insert application" on public.applications for insert with check (true);
  `);
  await db.exec(SQL);
  const left = await policies(db);
  check("every demo policy is gone", !left.some((p) => /demo|public read|public apply/.test(p)), left.join(" | "));
  check("the two intended public reads stay", left.includes("public.app_settings: app_settings readable by anyone") && left.includes("public.business_pages: Anyone reads a careers page"));
  check("a scoped policy is untouched", left.includes("public.applications: Candidates can view their own applications"));
  check("nothing else remains", left.length === 3, left.join(" | "));
}

// The live database: only the two intended ones. Nothing to drop.
{
  const db = await world();
  const before = await policies(db);
  await db.exec(SQL);
  const after = await policies(db);
  check("on the live shape it drops nothing", JSON.stringify(before) === JSON.stringify(after));
  await db.exec(SQL);
  check("it is safe to run twice", JSON.stringify(await policies(db)) === JSON.stringify(after));
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
