#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261025010000_safe_links.sql: stored
 * links can only be in-app paths or http(s) addresses (docs/LAUNCH-PLAN.md,
 * Phase 1, task 1).
 *
 * The attack it closes: an applicant inserts a notification for the business
 * they applied to with link = 'javascript:...'; the Notifications page
 * rendered it through <Link to>, which becomes a plain <a href>. Same shape
 * for a business's meeting link, an applicant's LinkedIn/portfolio address,
 * and a message attachment.
 *
 * Builds minimal tables with the live columns and the live permissive
 * policies (so the writes really happen as `authenticated`, not as the
 * owner), applies the migration VERBATIM from disk, then writes every bad
 * shape as a signed-in user and checks what was kept. Also proves the
 * migration would have applied cleanly to the live rows (all of which pass)
 * and that it does not break a legitimate write.
 *
 * Run with: node scripts/safe_links.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATION = path.join(ROOT, "supabase/migrations/20261025010000_safe_links.sql");

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

const APPLICANT = "10000000-0000-4000-8000-000000000001";
const BUSINESS = "20000000-0000-4000-8000-000000000002";

const BAD_PATHS = [
  "javascript:alert(document.cookie)",
  "JavaScript:alert(1)",
  " javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "//evil.example/x",
  "/\\evil.example/x",
  "https://evil.example/x",
  "/applicants/x y",
  "/applicants/x\nhttps://evil.example",
  "/" + "a".repeat(600),
];
const GOOD_PATHS = ["/applicants/30000000-0000-4000-8000-000000000008", "/c/biz/job?x=1#y", "/"];

const BAD_URLS = [
  "javascript:alert(1)",
  "JAVASCRIPT:alert(1)",
  "data:text/html,x",
  "vbscript:x",
  "file:///etc/passwd",
  "//evil.example",
  "https:/\\evil.example",
  "https://evil.example/a b",
];

async function main() {
  const sql = await readFile(MIGRATION, "utf8").catch(() => null);
  check("migration file exists", sql != null, MIGRATION);
  if (!sql) return finish();

  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create role anon nologin;
    create role authenticated nologin;
    grant anon to postgres;
    grant authenticated to postgres;
    grant usage on schema auth, public to anon, authenticated;

    create table public.notifications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      type text not null default 'info',
      title text not null,
      message text,
      link text,
      group_key text
    );
    create table public.interviews (
      id uuid primary key default gen_random_uuid(),
      employer_id uuid not null,
      meeting_link text
    );
    create table public.profiles (
      user_id uuid primary key,
      linkedin_url text,
      portfolio_url text
    );
    create table public.messages (
      id uuid primary key default gen_random_uuid(),
      sender_id uuid not null,
      file_url text
    );

    -- Live rows before the migration (shapes seen live on 2026-10-25).
    insert into public.notifications (user_id, title, link) values
      ('${BUSINESS}', 'New application', '/applicants/30000000-0000-4000-8000-000000000008'),
      ('${APPLICANT}', 'Interview', '/applications/30000000-0000-4000-8000-000000000008');
    insert into public.interviews (employer_id, meeting_link) values ('${BUSINESS}', 'https://meet.google.com/abc-defg-hij');
    insert into public.profiles (user_id, linkedin_url) values ('${APPLICANT}', 'www.linkedin.com/in/someone');

    alter table public.notifications enable row level security;
    alter table public.interviews enable row level security;
    alter table public.profiles enable row level security;
    alter table public.messages enable row level security;
    create policy n_ins on public.notifications for insert to authenticated with check (true);
    create policy n_sel on public.notifications for select to authenticated using (true);
    create policy n_upd on public.notifications for update to authenticated using (true) with check (true);
    create policy i_all on public.interviews for all to authenticated using (true) with check (true);
    create policy p_all on public.profiles for all to authenticated using (true) with check (true);
    create policy m_all on public.messages for all to authenticated using (true) with check (true);
    grant select, insert, update on public.notifications, public.interviews, public.profiles, public.messages to authenticated;
  `);

  // The migration must apply to the live shapes without error.
  let applied = true;
  try {
    await db.exec(sql);
  } catch (e) {
    applied = false;
    check("migration applies cleanly over live-shaped rows", false, e.message);
  }
  if (applied) check("migration applies cleanly over live-shaped rows", true);
  // Applying twice must also work (idempotent re-run).
  try {
    await db.exec(sql);
    check("migration is safe to re-run", true);
  } catch (e) {
    check("migration is safe to re-run", false, e.message);
  }

  const existing = await db.query(`select link from public.notifications order by link`);
  check("existing notification links untouched", existing.rows.every((r) => r.link.startsWith("/app")));
  const bareLinkedIn = await db.query(`select linkedin_url from public.profiles where user_id = '${APPLICANT}'`);
  check("existing bare-domain LinkedIn value left as it was", bareLinkedIn.rows[0].linkedin_url === "www.linkedin.com/in/someone");

  async function asApplicant(fn) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${APPLICANT}', false); set role authenticated;`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role;`);
    }
  }

  // ---- notifications.link -------------------------------------------------
  for (const bad of BAD_PATHS) {
    const row = await asApplicant(() =>
      db.query(`insert into public.notifications (user_id, title, link) values ($1, 'x', $2) returning link`, [BUSINESS, bad]),
    );
    check(`notification link refused: ${JSON.stringify(bad).slice(0, 50)}`, row.rows[0].link === null, `kept ${row.rows[0].link}`);
  }
  for (const good of GOOD_PATHS) {
    const row = await asApplicant(() =>
      db.query(`insert into public.notifications (user_id, title, link) values ($1, 'x', $2) returning link`, [BUSINESS, good]),
    );
    check(`notification link kept: ${good}`, row.rows[0].link === good, `got ${row.rows[0].link}`);
  }
  const padded = await asApplicant(() =>
    db.query(`insert into public.notifications (user_id, title, link) values ($1, 'x', $2) returning link`, [BUSINESS, "  /applicants/a  "]),
  );
  check("notification link trimmed", padded.rows[0].link === "/applicants/a");
  // Updating an existing row to a bad link is refused too.
  const upd = await asApplicant(() =>
    db.query(`update public.notifications set link = 'javascript:alert(1)' where user_id = $1 returning link`, [BUSINESS]),
  );
  check("notification link refused on UPDATE", upd.rows.every((r) => r.link === null));
  // The constraint itself (bypassing the trigger) refuses a bad value.
  let constraintHeld = false;
  try {
    await db.exec(`alter table public.notifications disable trigger notifications_safe_link;`);
    await db.query(`insert into public.notifications (user_id, title, link) values ($1, 'x', 'javascript:1')`, [BUSINESS]);
  } catch (e) {
    constraintHeld = /notifications_link_in_app/.test(e.message);
  } finally {
    await db.exec(`alter table public.notifications enable trigger notifications_safe_link;`);
  }
  check("CHECK constraint refuses a bad link even with the trigger off", constraintHeld);
  // The same for the other two constraints. (A CHECK whose expression is
  // NULL passes, so `f(x) = x` with f returning NULL would let anything in:
  // the migration uses IS NOT DISTINCT FROM, and these prove it.)
  for (const [table, trigger, column, constraint, bad] of [
    ["interviews", "interviews_safe_meeting_link", "meeting_link", "interviews_meeting_link_http", "javascript:1"],
    ["messages", "messages_safe_file_url", "file_url", "messages_file_url_no_script", "javascript:1"],
  ]) {
    let held = false;
    const owner = table === "interviews" ? "employer_id" : "sender_id";
    try {
      await db.exec(`alter table public.${table} disable trigger ${trigger};`);
      await db.query(`insert into public.${table} (${owner}, ${column}) values ($1, $2)`, [BUSINESS, bad]);
    } catch (e) {
      held = e.message.includes(constraint) || e.constraint === constraint || /check constraint/i.test(e.message);
    } finally {
      await db.exec(`alter table public.${table} enable trigger ${trigger};`);
    }
    check(`CHECK ${constraint} refuses a bad value even with the trigger off`, held);
  }

  // ---- interviews.meeting_link -------------------------------------------
  for (const bad of BAD_URLS) {
    const row = await asApplicant(() =>
      db.query(`insert into public.interviews (employer_id, meeting_link) values ($1, $2) returning meeting_link`, [BUSINESS, bad]),
    );
    check(`meeting link refused: ${JSON.stringify(bad).slice(0, 40)}`, row.rows[0].meeting_link === null, `kept ${row.rows[0].meeting_link}`);
  }
  for (const [input, expected] of [
    ["https://meet.google.com/abc-defg-hij", "https://meet.google.com/abc-defg-hij"],
    ["https://us02web.zoom.us/j/123?pwd=x", "https://us02web.zoom.us/j/123?pwd=x"],
    ["zoom.us/j/123", "https://zoom.us/j/123"],
  ]) {
    const row = await asApplicant(() =>
      db.query(`insert into public.interviews (employer_id, meeting_link) values ($1, $2) returning meeting_link`, [BUSINESS, input]),
    );
    check(`meeting link kept: ${input}`, row.rows[0].meeting_link === expected, `got ${row.rows[0].meeting_link}`);
  }

  // ---- profiles ----------------------------------------------------------
  const prof = await asApplicant(() =>
    db.query(
      `update public.profiles set linkedin_url = 'javascript:alert(1)', portfolio_url = 'data:text/html,x' where user_id = $1 returning linkedin_url, portfolio_url`,
      [APPLICANT],
    ),
  );
  check("profile LinkedIn javascript: refused", prof.rows[0].linkedin_url === null);
  check("profile portfolio data: refused", prof.rows[0].portfolio_url === null);
  const prof2 = await asApplicant(() =>
    db.query(
      `update public.profiles set linkedin_url = 'www.linkedin.com/in/me', portfolio_url = 'https://me.dev' where user_id = $1 returning linkedin_url, portfolio_url`,
      [APPLICANT],
    ),
  );
  check("profile bare domain gets https://", prof2.rows[0].linkedin_url === "https://www.linkedin.com/in/me");
  check("profile https kept", prof2.rows[0].portfolio_url === "https://me.dev");

  // ---- messages.file_url --------------------------------------------------
  for (const [input, expected] of [
    ["javascript:alert(1)", null],
    ["data:image/svg+xml,<svg onload=alert(1)>", null],
    [`${APPLICANT}/1700000000-cv.pdf`, `${APPLICANT}/1700000000-cv.pdf`],
    ["https://yqklrkpptnhubsnijqze.supabase.co/storage/v1/object/public/message-attachments/a.png", "https://yqklrkpptnhubsnijqze.supabase.co/storage/v1/object/public/message-attachments/a.png"],
  ]) {
    const row = await asApplicant(() =>
      db.query(`insert into public.messages (sender_id, file_url) values ($1, $2) returning file_url`, [APPLICANT, input]),
    );
    check(`message file_url ${expected === null ? "refused" : "kept"}: ${input.slice(0, 40)}`, row.rows[0].file_url === expected, `got ${row.rows[0].file_url}`);
  }

  // ---- the SQL rule and the TS rule agree ----------------------------------
  const { inAppPath, externalHref } = await import(path.join(ROOT, "src/lib/safeLink.ts")).catch(() => ({}));
  if (inAppPath && externalHref) {
    for (const value of [...BAD_PATHS, ...GOOD_PATHS, "  /applicants/a  "]) {
      const r = await db.query(`select public.safe_in_app_path($1) as v`, [value]);
      check(`TS and SQL agree on path ${JSON.stringify(value).slice(0, 40)}`, (inAppPath(value) ?? null) === r.rows[0].v, `ts=${inAppPath(value)} sql=${r.rows[0].v}`);
    }
    for (const value of [...BAD_URLS, "https://meet.google.com/x", "zoom.us/j/1", "www.linkedin.com/in/me", "not a url"]) {
      const r = await db.query(`select public.safe_http_url($1) as v`, [value]);
      check(`TS and SQL agree on URL ${JSON.stringify(value).slice(0, 40)}`, (externalHref(value) ?? null) === r.rows[0].v, `ts=${externalHref(value)} sql=${r.rows[0].v}`);
    }
  } else {
    console.log("  (skipped TS/SQL agreement: this Node cannot import .ts; scripts/safe_links.test.mjs covers the TS rule)");
  }

  finish();
}

function finish() {
  console.log(`\n${failed === 0 ? "All" : failed + " of"} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
