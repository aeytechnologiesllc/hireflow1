#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261025460000_voice_recordings_go_with_application.sql
 * (the ninth Phase 5 review): a spoken-interview recording is kept under the
 * application's id, so deleting the application (Delete Account's cascade, a
 * withdrawal, a business's removal) queues its folder for document-cleanup.
 *
 * Run with: node scripts/voice_recordings_go_with_application.pglite.test.mjs
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
  create schema auth;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create table auth.users (id uuid primary key);
  create table public.applications (
    id uuid primary key default gen_random_uuid(), candidate_id uuid references auth.users(id) on delete cascade,
    voice_interview_recording_url text, voice_interview_result jsonb
  );
  -- As 20261025180000 made it.
  create table public.storage_file_trash (
    id uuid primary key default gen_random_uuid(),
    bucket text not null check (bucket in ('videos', 'portfolios', 'resumes', 'voice-interview-recordings', 'documents')),
    path text, folder text, starts_with text, application_id uuid,
    attempts integer not null default 0, queued_at timestamptz not null default now(), last_tried_at timestamptz,
    constraint storage_file_trash_one_target check ((path is null) <> (folder is null)),
    constraint storage_file_trash_plain_path check (coalesce(path, folder) !~ '(^/|\\.\\.|//)' and length(coalesce(path, folder)) between 3 and 500)
  );
`);
const migration = readFileSync(path.join(ROOT, "supabase/migrations/20261025460000_voice_recordings_go_with_application.sql"), "utf8");
await db.exec(migration);
await db.exec(migration);
check("the migration applies, and applies again", true);

const ANA = "20000000-0000-4000-8000-000000000001";
await db.exec(`insert into auth.users values ('${ANA}')`);
const recorded = (await db.query(`insert into public.applications (candidate_id, voice_interview_recording_url) values ($1, 'https://x/voice-interview-recordings/a/interview-1.webm') returning id`, [ANA])).rows[0].id;
const graded = (await db.query(`insert into public.applications (candidate_id, voice_interview_result) values ($1, '{"score": 70}') returning id`, [ANA])).rows[0].id;
const plain = (await db.query(`insert into public.applications (candidate_id) values ($1) returning id`, [ANA])).rows[0].id;

await db.exec(`delete from public.applications where id = '${plain}'`);
check("an application with no spoken interview queues nothing", (await db.query(`select count(*)::int as n from public.storage_file_trash`)).rows[0].n === 0);

await db.exec(`delete from public.applications where id = '${recorded}'`);
let q = (await db.query(`select bucket, folder, starts_with, application_id from public.storage_file_trash where application_id = $1`, [recorded])).rows;
check("withdrawing (deleting) an application with a recording queues its folder in voice-interview-recordings", q.length === 1 && q[0].bucket === "voice-interview-recordings" && q[0].folder === recorded && q[0].starts_with === "", JSON.stringify(q));

await db.exec(`delete from auth.users where id = '${ANA}'`);
q = (await db.query(`select folder from public.storage_file_trash where application_id = $1`, [graded])).rows;
check("Delete Account's cascade queues the recordings of every application it removes", q.length === 1 && q[0].folder === graded, JSON.stringify(q));

const cleanup = readFileSync(path.join(ROOT, "supabase/functions/document-cleanup/index.ts"), "utf8");
check("document-cleanup empties that bucket's queued folders", /const REMOVAL_BUCKETS = new Set\(\[[^\]]*"voice-interview-recordings"/.test(cleanup) && /\.from\("storage_file_trash"\)/.test(cleanup));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
