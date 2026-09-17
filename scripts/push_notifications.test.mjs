#!/usr/bin/env node
/**
 * Phone push notifications (2026-09-16):
 *   1. pushUrlForLink (supabase/functions/_shared/pushLink.ts) only lets a push
 *      open a hireflownow.com path, never an outside site.
 *   2. The real migration's trigger posts only { notification_id } to
 *      send-push-notification through net.http_post (PGlite, with net.http_post
 *      stubbed to record its calls), and a failing pg_net never blocks the insert.
 *
 * Run with: node scripts/push_notifications.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pushUrlForLink } from "../supabase/functions/_shared/pushLink.ts";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let passed = 0;
let failed = 0;
function check(label, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("-- pushUrlForLink --");
check("a site path becomes a full hireflownow.com URL", pushUrlForLink("/applications/abc") === "https://hireflownow.com/applications/abc");
check("query strings on a site path are kept", pushUrlForLink("/messages?candidate=1") === "https://hireflownow.com/messages?candidate=1");
for (const bad of [
  "https://evil.example/login",
  "http://hireflownow.com.evil.example/",
  "//evil.example/x",
  "/\\evil.example/x",
  "javascript:alert(1)",
  "data:text/html,hi",
  "applications/abc",
  "/path with space",
  "/tab\there",
  "",
  "   ",
  null,
  undefined,
  "/" + "a".repeat(600),
]) {
  check(`refused: ${JSON.stringify(bad)?.slice(0, 40)}`, pushUrlForLink(bad) === null, String(pushUrlForLink(bad)));
}

console.log("-- trigger (real migration) --");
const db = new PGlite();
await db.exec(`
  create type notification_type as enum ('application', 'message', 'interview');
  create table public.notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null, type notification_type not null,
    title text not null, message text not null, link text,
    is_read boolean not null default false, created_at timestamptz not null default now()
  );
  create schema net;
  create table net.calls (url text, body jsonb, headers jsonb);
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
  returns bigint language plpgsql as $$ begin insert into net.calls values (url, body, headers); return 1; end $$;
`);
await db.exec(await readFile(path.join(ROOT, "supabase/migrations/20260916220000_push_notifications_actually_send.sql"), "utf8"));
await db.exec(`create trigger on_notification_inserted after insert on public.notifications for each row execute function public.trigger_push_notification();`);

const ins = await db.query(
  `insert into public.notifications (user_id, type, title, message, link) values (gen_random_uuid(), 'message', 'New message', 'hi', 'https://evil.example') returning id`
);
const id = ins.rows[0].id;
const calls = (await db.query(`select url, body, headers from net.calls`)).rows;
check("exactly one push call per notification", calls.length === 1, String(calls.length));
check("the call goes to send-push-notification on the live project", calls[0]?.url === "https://yqklrkpptnhubsnijqze.supabase.co/functions/v1/send-push-notification", calls[0]?.url);
check("the body carries ONLY the notification id", JSON.stringify(calls[0]?.body) === JSON.stringify({ notification_id: id }), JSON.stringify(calls[0]?.body));
const cols = (await db.query(`select column_name from information_schema.columns where table_name = 'notifications' and column_name = 'push_sent_at'`)).rows;
check("notifications.push_sent_at exists (the once-only claim)", cols.length === 1);

await db.exec(`
  create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
  returns bigint language plpgsql as $$ begin raise exception 'pg_net is down'; end $$;
`);
let insertOk = true;
try {
  await db.query(`insert into public.notifications (user_id, type, title, message) values (gen_random_uuid(), 'message', 't', 'm')`);
} catch {
  insertOk = false;
}
check("a failing pg_net never blocks creating the notification (fail-open)", insertOk);

await db.close();
console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
