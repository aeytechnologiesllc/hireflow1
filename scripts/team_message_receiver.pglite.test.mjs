#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20260916213000_team_message_receiver_must_be_candidate.sql.
 *
 * Real anon/authenticated roles, so RLS is genuinely enforced. Seeds the exact
 * live (pre-fix) "Team members can send messages if permitted" policy, proves a
 * team member can message a stranger under it, applies the migration from disk,
 * then proves the stranger case is refused and every legitimate shape still works.
 *
 * Run with: node scripts/team_message_receiver.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATION = path.join(ROOT, "supabase/migrations/20260916213000_team_message_receiver_must_be_candidate.sql");

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

const EMP_A = "a0000000-0000-4000-8000-000000000001";
const EMP_B = "b0000000-0000-4000-8000-000000000001";
const CAND_X = "c0000000-0000-4000-8000-000000000001";
const STRANGER = "d0000000-0000-4000-8000-000000000001";
const TEAM_MSG = "e0000000-0000-4000-8000-000000000001"; // can message, all jobs
const TEAM_NOPERM = "e0000000-0000-4000-8000-000000000002"; // cannot message
const TEAM_ASSIGNED = "e0000000-0000-4000-8000-000000000003"; // can message, only JOB_A2
const JOB_A = "10000000-0000-4000-8000-000000000001";
const JOB_A2 = "10000000-0000-4000-8000-000000000002";
const JOB_B = "10000000-0000-4000-8000-000000000003";
const APP_AX = "20000000-0000-4000-8000-000000000001";
const APP_BX = "20000000-0000-4000-8000-000000000002";

async function main() {
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
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;

    create table public.jobs (id uuid primary key, employer_id uuid not null);
    create table public.applications (id uuid primary key, job_id uuid not null references public.jobs(id), candidate_id uuid not null);
    create table public.team_members (
      user_id uuid not null, employer_id uuid not null, status text not null default 'active',
      can_message_candidates boolean not null default false, assigned_job_ids uuid[]
    );
    create table public.messages (
      id uuid primary key default gen_random_uuid(),
      sender_id uuid not null, receiver_id uuid not null,
      application_id uuid references public.applications(id), content text
    );
    alter table public.messages enable row level security;
    grant select on public.jobs, public.applications, public.team_members to anon, authenticated;
    grant select, insert on public.messages to anon, authenticated;

    -- Live pre-fix policy, verbatim shape (pg_policies, 2026-09-16).
    create policy "Team members can send messages if permitted"
    on public.messages for insert
    with check (
      auth.uid() = sender_id and exists (
        select 1 from public.applications a
          join public.jobs j on j.id = a.job_id
          join public.team_members tm on tm.employer_id = j.employer_id
        where a.id = messages.application_id
          and tm.user_id = auth.uid() and tm.status = 'active'
          and tm.can_message_candidates = true
          and (array_length(tm.assigned_job_ids, 1) is null or j.id = any (tm.assigned_job_ids))
      )
    );
  `);
  await db.query(`insert into public.jobs values ($1,$2),($3,$2),($4,$5)`, [JOB_A, EMP_A, JOB_A2, JOB_B, EMP_B]);
  await db.query(`insert into public.applications values ($1,$2,$3),($4,$5,$3)`, [APP_AX, JOB_A, CAND_X, APP_BX, JOB_B]);
  await db.query(
    `insert into public.team_members (user_id, employer_id, status, can_message_candidates, assigned_job_ids)
     values ($1,$2,'active',true,null),($3,$2,'active',false,null),($4,$2,'active',true,array[$5]::uuid[])`,
    [TEAM_MSG, EMP_A, TEAM_NOPERM, TEAM_ASSIGNED, JOB_A2]
  );

  async function send(uid, role, receiver, app) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${role};`);
    try {
      await db.query(`insert into public.messages (sender_id, receiver_id, application_id, content) values ($1,$2,$3,'hi')`, [
        uid ?? STRANGER, receiver, app,
      ]);
      return true;
    } catch {
      return false;
    } finally {
      await db.exec(`reset role;`);
    }
  }

  console.log("-- before the fix: the hole is real --");
  check("OLD: team member can message a stranger by attaching an assigned application", await send(TEAM_MSG, "authenticated", STRANGER, APP_AX));
  check("OLD: team member can message another employer the same way", await send(TEAM_MSG, "authenticated", EMP_B, APP_AX));

  await db.exec(await readFile(MIGRATION, "utf8"));
  console.log("-- after the fix --");
  check("team member can NOT message a stranger", !(await send(TEAM_MSG, "authenticated", STRANGER, APP_AX)));
  check("team member can NOT message another employer", !(await send(TEAM_MSG, "authenticated", EMP_B, APP_AX)));
  check("team member can NOT message their own boss through this policy", !(await send(TEAM_MSG, "authenticated", EMP_A, APP_AX)));
  check("team member CAN message the application's candidate", await send(TEAM_MSG, "authenticated", CAND_X, APP_AX));
  check("team member without messaging permission is refused", !(await send(TEAM_NOPERM, "authenticated", CAND_X, APP_AX)));
  check("team member assigned to a different job is refused", !(await send(TEAM_ASSIGNED, "authenticated", CAND_X, APP_AX)));
  check("team member can NOT use another employer's application", !(await send(TEAM_MSG, "authenticated", CAND_X, APP_BX)));
  check("team member with no application_id is refused", !(await send(TEAM_MSG, "authenticated", CAND_X, null)));
  check("signed-out caller is refused", !(await send(null, "anon", CAND_X, APP_AX)));

  console.log(`\n${passed} passed, ${failed} failed.`);
  await db.close();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
