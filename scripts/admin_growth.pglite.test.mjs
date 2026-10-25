#!/usr/bin/env node
/**
 * PGlite proof for admin_growth (supabase/migrations/20261025080000_admin_growth.sql,
 * as replaced by 20261025120000_admin_growth_one_role.sql; docs/LAUNCH-PLAN.md,
 * Phase 2, task 3): where new businesses come from, for the platform admin only.
 *
 * Run with: node scripts/admin_growth.pglite.test.mjs
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

const ADMIN = "20000000-0000-4000-8000-000000000001";
const OTHER = "20000000-0000-4000-8000-000000000002";

const db = new PGlite();
await db.exec(`
  create schema auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create table auth.users (id uuid primary key, created_at timestamptz default now(), raw_user_meta_data jsonb default '{}');
  create type public.app_role as enum ('candidate', 'employer');
  create table public.user_roles (user_id uuid, role public.app_role);
  create table public.page_view_daily (day date, path text, referrer_host text, utm_source text, view_count integer);
  create function public.is_platform_admin() returns boolean language sql stable as $$ select auth.uid() = '${ADMIN}'::uuid $$;
  grant execute on function public.is_platform_admin() to authenticated;

  insert into auth.users (id, raw_user_meta_data) values
    ('${ADMIN}', '{}'),
    ('30000000-0000-4000-8000-000000000001', '{"signup_source":{"utm_source":"youtube"}}'),
    ('30000000-0000-4000-8000-000000000002', '{"signup_source":{"utm_source":"youtube"}}'),
    ('30000000-0000-4000-8000-000000000003', '{"signup_source":{"ref":"quora.com"}}'),
    ('30000000-0000-4000-8000-000000000004', '{}');
  insert into public.user_roles values
    ('30000000-0000-4000-8000-000000000001', 'employer'),
    ('30000000-0000-4000-8000-000000000002', 'employer'),
    ('30000000-0000-4000-8000-000000000002', 'candidate'),
    ('30000000-0000-4000-8000-000000000003', 'employer');
  insert into auth.users (id, created_at) values ('30000000-0000-4000-8000-000000000009', now() - interval '90 days');
  insert into public.page_view_daily values
    (current_date, '/', null, 'youtube', 7), (current_date, '/', 'quora.com', null, 3), (current_date, '/', null, null, 5),
    (current_date - 1, '/', null, 'youtube', 2), (current_date, '/auth', null, null, 4), (current_date - 40, '/', null, 'old', 100);
`);
await db.exec(readFileSync(path.join(ROOT, "supabase/migrations/20261025080000_admin_growth.sql"), "utf8"));
await db.exec(readFileSync(path.join(ROOT, "supabase/migrations/20261025120000_admin_growth_one_role.sql"), "utf8"));

async function as(uid, sql) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role authenticated;`);
  try {
    return { rows: (await db.query(sql)).rows, error: null };
  } catch (e) {
    return { rows: [], error: e.message };
  } finally {
    await db.exec("reset role;");
  }
}

const refused = await as(OTHER, "select public.admin_growth(30) as g");
check("anyone but the platform admin is refused", refused.error === "admins_only", refused.error ?? "no error");
await db.exec("set role anon;");
const anon = await db.query("select public.admin_growth(30)").then(() => null, (e) => e.message);
await db.exec("reset role;");
check("someone signed out cannot call it at all", /permission denied/i.test(anon ?? ""), anon ?? "no error");

const g = (await as(ADMIN, "select public.admin_growth(30) as g")).rows[0]?.g;
check("the admin gets the report", !!g && g.days === 30, JSON.stringify(g));
const front = Object.fromEntries((g?.front_page ?? []).map((r) => [r.source, r.visits]));
check("front-page visits by source: campaign tag, else referring site, else direct", front.youtube === 9 && front["quora.com"] === 3 && front.direct === 5, JSON.stringify(front));
check("visits older than the window are left out", front.old === undefined);
check("the sign-in and sign-up page is counted on its own", g?.signup_page === 4);
const accounts = g?.accounts ?? [];
const total = accounts.reduce((n, r) => n + r.accounts, 0);
check("each new account counted once, even with two roles", total === 5, JSON.stringify(accounts));
const yt = accounts.filter((r) => r.source === "youtube").reduce((n, r) => n + r.accounts, 0);
check("accounts by source: the campaign tag", yt === 2);
check("…else the referring site", accounts.some((r) => r.source === "quora.com" && r.role === "employer" && r.accounts === 1));
check("…else unknown, and an account with no role says so", accounts.some((r) => r.source === "unknown" && r.role === "none"));
check("the window is clamped to 1–365 days", (await as(ADMIN, "select public.admin_growth(5000) as g")).rows[0].g.days === 365 && (await as(ADMIN, "select public.admin_growth(0) as g")).rows[0].g.days === 1);

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
