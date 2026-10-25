#!/usr/bin/env node
/**
 * PGlite proof for admin_growth (supabase/migrations/20261025080000_admin_growth.sql,
 * as replaced by 20261025120000_admin_growth_one_role.sql and
 * 20261025390000_admin_growth_channels.sql; docs/LAUNCH-PLAN.md, Phase 2,
 * task 3): where new businesses come from, which public pages bring visits,
 * and campaigns by name, for the platform admin only.
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
  create table public.page_view_daily (day date, path text, referrer_host text, utm_source text, view_count integer, utm_medium text not null default '', utm_campaign text not null default '');
  create table public.jobs (id uuid primary key default gen_random_uuid(), slug text);
  insert into public.jobs (slug) values ('front-desk');
  create function public.is_platform_admin() returns boolean language sql stable as $$ select auth.uid() = '${ADMIN}'::uuid $$;
  grant execute on function public.is_platform_admin() to authenticated;

  insert into auth.users (id, raw_user_meta_data) values
    ('${ADMIN}', '{}'),
    ('30000000-0000-4000-8000-000000000001', '{"signup_source":{"utm_source":"youtube"}}'),
    ('30000000-0000-4000-8000-000000000002', '{"signup_source":{"utm_source":"youtube"}}'),
    ('30000000-0000-4000-8000-000000000003', '{"signup_source":{"ref":"quora.com"}}'),
    ('30000000-0000-4000-8000-000000000004', '{}'),
    ('30000000-0000-4000-8000-000000000005', '{"signup_source":{"utm_source":"youtube","utm_campaign":"v2"}}');
  insert into public.user_roles values
    ('30000000-0000-4000-8000-000000000001', 'employer'),
    ('30000000-0000-4000-8000-000000000002', 'employer'),
    ('30000000-0000-4000-8000-000000000002', 'candidate'),
    ('30000000-0000-4000-8000-000000000003', 'employer'),
    ('30000000-0000-4000-8000-000000000005', 'employer');
  insert into auth.users (id, created_at) values ('30000000-0000-4000-8000-000000000009', now() - interval '90 days');
  insert into public.page_view_daily values
    (current_date, '/', null, 'youtube', 7), (current_date, '/', 'quora.com', null, 3), (current_date, '/', null, null, 5),
    (current_date - 1, '/', null, 'youtube', 2), (current_date, '/auth', null, null, 4), (current_date - 40, '/', null, 'old', 100);
  insert into public.page_view_daily (day, path, referrer_host, utm_source, view_count, utm_medium, utm_campaign) values
    (current_date, '/', '', 'youtube', 6, 'video', 'v1'),
    (current_date, '/blog/hire-a-receptionist', 'google.com', '', 4, '', ''),
    (current_date, '/blog', '', '', 1, '', ''),
    (current_date, '/open-jobs', '', 'facebook', 3, 'post', 'clinic-week'),
    (current_date, '/front-desk', '', 'flyer', 2, 'hiring_link', ''),
    (current_date, '/c/acme-dental/front-desk', '', '', 1, '', ''),
    (current_date, '/job/7d2c', '', '', 1, '', ''),
    (current_date, '/c/acme-dental', '', '', 2, '', ''),
    (current_date, '/applications', '', '', 50, '', ''),
    (current_date, '/not-a-job', '', '', 9, '', ''),
    (current_date, '/open-jobs', 'staff.hireflownow.com', '', 8, '', '');
`);
await db.exec(readFileSync(path.join(ROOT, "supabase/migrations/20261025080000_admin_growth.sql"), "utf8"));
await db.exec(readFileSync(path.join(ROOT, "supabase/migrations/20261025120000_admin_growth_one_role.sql"), "utf8"));
const channels = readFileSync(path.join(ROOT, "supabase/migrations/20261025390000_admin_growth_channels.sql"), "utf8");
await db.exec(channels);
await db.exec(channels);

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
check("front-page visits by source: campaign tag, else referring site, else direct", front.youtube === 15 && front["quora.com"] === 3 && front.direct === 5, JSON.stringify(front));
check("visits older than the window are left out", front.old === undefined);
check("the sign-in and sign-up page is counted on its own", g?.signup_page === 4);
const accounts = g?.accounts ?? [];
const total = accounts.reduce((n, r) => n + r.accounts, 0);
check("each new account counted once, even with two roles", total === 6, JSON.stringify(accounts));
const yt = accounts.filter((r) => r.source === "youtube").reduce((n, r) => n + r.accounts, 0);
check("accounts by source: the campaign tag", yt === 3);
check("…else the referring site", accounts.some((r) => r.source === "quora.com" && r.role === "employer" && r.accounts === 1));
check("…else unknown, and an account with no role says so", accounts.some((r) => r.source === "unknown" && r.role === "none"));
const pages = Object.fromEntries((g?.pages ?? []).map((r) => [r.kind, r]));
check("every kind of public page is counted: front page, blog, Open jobs, job pages, careers pages", pages.front_page?.visits === 23 && pages.blog?.visits === 5 && pages.open_jobs?.visits === 3 && pages.job_page?.visits === 4 && pages.careers_page?.visits === 2, JSON.stringify(pages));
check("…a short link counts as a job page only when it is a job's own slug", pages.job_page?.sources?.some((r) => r.source === "flyer" && r.visits === 2) && !Object.values(pages).some((p) => p.sources?.some((r) => r.visits === 9)), JSON.stringify(pages.job_page));
check("…the app's own pages are not public pages", !Object.values(pages).some((p) => p.visits >= 50));
check("…the hiring team's own clicks from the staff host are left out", pages.open_jobs?.visits === 3);
check("…each with its sources", pages.blog?.sources?.some((r) => r.source === "google.com" && r.visits === 4));
const campaigns = g?.campaigns ?? [];
check("campaigns by name, with source and medium", campaigns.some((c) => c.source === "youtube" && c.medium === "video" && c.campaign === "v1" && c.visits === 6) && campaigns.some((c) => c.source === "facebook" && c.campaign === "clinic-week" && c.visits === 3), JSON.stringify(campaigns));
check("…a medium alone is listed too (a flyer's hiring link)", campaigns.some((c) => c.source === "flyer" && c.medium === "hiring_link" && c.campaign === ""));
check("…untagged visits are not campaigns", !campaigns.some((c) => c.medium === "" && c.campaign === ""));
const accountCampaigns = g?.account_campaigns ?? [];
check("new accounts by campaign", accountCampaigns.length === 1 && accountCampaigns[0].campaign === "v2" && accountCampaigns[0].source === "youtube" && accountCampaigns[0].role === "employer" && accountCampaigns[0].accounts === 1, JSON.stringify(accountCampaigns));
check("the window is clamped to 1–365 days", (await as(ADMIN, "select public.admin_growth(5000) as g")).rows[0].g.days === 365 && (await as(ADMIN, "select public.admin_growth(0) as g")).rows[0].g.days === 1);

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
