#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20260915121000_forgery_policy_lockdown.sql
 * — plain assertions, no framework, real Postgres (via PGlite), not a text match.
 *
 * Builds a minimal but faithful fixture of the eight tables/functions the
 * migration touches or depends on (profiles, jobs, applications, team_members,
 * documents, document_audit_logs, messages, blueprint_purchases, plus the
 * `public.is_job_owner` / `public.is_active_team_member_for_job` SECURITY
 * DEFINER helpers from 20260715014000_break_jobs_applications_rls_recursion.sql,
 * which already exist on the live project — see the header comment on the
 * migration under test), seeds it with the *exact* pre-fix vulnerable
 * policies for blueprint_purchases / document_audit_logs / messages, proves
 * each forgery the task describes actually succeeds under the OLD policies
 * (so this fixture is known to model the real hole, not a strawman), then
 * applies supabase/migrations/20260915121000_forgery_policy_lockdown.sql
 * VERBATIM (read from disk, not retyped) and re-runs the same forgeries plus
 * every legitimate call shape found in src/hooks/useImprovementBlueprint.ts,
 * src/components/documents/DocumentWizard.tsx, src/hooks/useMessages.ts and
 * src/cockpit/pages/Messages.tsx, asserting the forgeries are now denied and
 * the legitimate paths still work.
 *
 * `anon`/`authenticated`/`service_role` are real, separate Postgres roles
 * (not the table owner), so RLS is genuinely enforced — the same shape
 * Supabase itself runs in production, not an approximation.
 *
 * Run with: node scripts/forgery_policy_lockdown.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATION_PATH = path.join(
  ROOT,
  "supabase/migrations/20260915121000_forgery_policy_lockdown.sql"
);

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

// --- fixture ids --------------------------------------------------------------
const EMP_A = "10000000-0000-0000-0000-00000000000a"; // owns JOB_A, JOB_A2
const EMP_B = "10000000-0000-0000-0000-00000000000b"; // owns JOB_B, unrelated to EMP_A
const CAND_X = "20000000-0000-0000-0000-000000000001"; // applied to JOB_A (APP_AX) and JOB_B (APP_BX)
const CAND_Y = "20000000-0000-0000-0000-000000000002"; // applied to JOB_A2 (APP_A2Y) only
const TEAM_A_MSG = "30000000-0000-0000-0000-000000000001"; // active team member for EMP_A, can_message_candidates
const TEAM_A_VIEW = "30000000-0000-0000-0000-000000000002"; // active team member for EMP_A, view-only
const STRANGER = "40000000-0000-0000-0000-000000000001"; // no relationship to anything

const JOB_A = "50000000-0000-0000-0000-00000000000a";
const JOB_A2 = "50000000-0000-0000-0000-00000000000c";
const JOB_B = "50000000-0000-0000-0000-00000000000b";
const APP_AX = "60000000-0000-0000-0000-00000000000a"; // CAND_X on JOB_A (EMP_A)
const APP_BX = "60000000-0000-0000-0000-00000000000b"; // CAND_X on JOB_B (EMP_B)
const APP_A2Y = "60000000-0000-0000-0000-00000000000c"; // CAND_Y on JOB_A2 (EMP_A)
const DOC_AX = "70000000-0000-0000-0000-00000000000a"; // document on APP_AX, sender EMP_A, recipient CAND_X

async function main() {
  const db = new PGlite();
  const migrationSql = await readFile(MIGRATION_PATH, "utf8").catch(() => null);
  check("migration file exists on disk", migrationSql != null, MIGRATION_PATH);
  if (!migrationSql) {
    console.log(`\n${failed} of ${passed + failed} checks failed.`);
    process.exit(1);
  }

  await db.exec(`
    -- ---- auth shims (mirror Supabase's auth.uid()/auth.role()) ----
    create schema auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create or replace function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
    $$;

    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant anon to postgres;
    grant authenticated to postgres;
    grant service_role to postgres;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant execute on function auth.role() to anon, authenticated, service_role;

    -- ---- minimal schema (columns this migration and its dependencies touch) ----
    create table public.profiles (
      user_id uuid primary key,
      full_name text,
      email text,
      company_name text
    );

    create table public.jobs (
      id uuid primary key default gen_random_uuid(),
      employer_id uuid not null
    );

    create table public.applications (
      id uuid primary key default gen_random_uuid(),
      job_id uuid not null references public.jobs(id),
      candidate_id uuid not null
    );

    create table public.team_members (
      user_id uuid not null,
      employer_id uuid not null,
      status text not null default 'active',
      can_message_candidates boolean not null default false,
      can_send_documents boolean not null default false,
      assigned_job_ids uuid[]
    );

    create table public.documents (
      id uuid primary key default gen_random_uuid(),
      application_id uuid not null references public.applications(id),
      sender_id uuid,
      recipient_id uuid
    );

    create table public.document_audit_logs (
      id uuid primary key default gen_random_uuid(),
      document_id uuid not null references public.documents(id),
      user_id uuid,
      action text not null,
      details jsonb,
      ip_address text,
      user_agent text,
      signer_name text,
      signer_email text,
      signer_role text,
      signature_method text,
      consent_confirmed boolean,
      document_hash text,
      document_version integer default 1,
      page_numbers_signed text[],
      signature_event_id uuid,
      pre_signature_hash text,
      post_signature_hash text,
      signing_order_position integer,
      created_at timestamptz not null default now()
    );

    create table public.messages (
      id uuid primary key default gen_random_uuid(),
      sender_id uuid not null,
      receiver_id uuid not null,
      application_id uuid references public.applications(id),
      content text not null,
      is_read boolean not null default false,
      created_at timestamptz not null default now()
    );

    create table public.blueprint_purchases (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      application_id uuid not null references public.applications(id),
      stripe_session_id text,
      amount_paid integer default 199,
      purchased_at timestamptz not null default now()
    );

    alter table public.profiles enable row level security;
    alter table public.jobs enable row level security;
    alter table public.applications enable row level security;
    alter table public.team_members enable row level security;
    alter table public.documents enable row level security;
    alter table public.document_audit_logs enable row level security;
    alter table public.messages enable row level security;
    alter table public.blueprint_purchases enable row level security;

    grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;

    -- ---- the two SECURITY DEFINER helpers the migration under test relies
    -- on, copied verbatim from
    -- 20260715014000_break_jobs_applications_rls_recursion.sql, already live
    -- on the project (confirmed via mcp__supabase__execute_sql before writing
    -- this fixture) ----
    create or replace function public.is_job_owner(p_job_id uuid, p_user_id uuid)
    returns boolean language sql stable security definer set search_path = public, pg_temp as $$
      select exists (select 1 from public.jobs j where j.id = p_job_id and j.employer_id = p_user_id);
    $$;

    -- Simplified to the two-argument form: the migration under test only ever
    -- calls is_active_team_member_for_job(job_id, uid) with no permission
    -- flag, so the fixture's team_members table carries no
    -- can_manage_pipeline/can_create_jobs/can_delete_jobs columns either —
    -- the real function's extra optional params are irrelevant here.
    create or replace function public.is_active_team_member_for_job(p_job_id uuid, p_user_id uuid)
    returns boolean language sql stable security definer set search_path = public, pg_temp as $$
      select exists (
        select 1 from public.jobs j join public.team_members tm on tm.employer_id = j.employer_id
        where j.id = p_job_id and tm.user_id = p_user_id and tm.status = 'active'
          and (array_length(tm.assigned_job_ids, 1) is null or j.id = any (tm.assigned_job_ids))
      );
    $$;

    -- ---- SELECT policies on documents/applications, mirroring the live
    -- project exactly (20251214183024_*.sql, 20251216160358_*.sql and
    -- 20260715014000_*.sql), because the new document_audit_logs INSERT
    -- policy's EXISTS subquery below reads documents/applications as the
    -- authenticated role, not through a SECURITY DEFINER helper — so it is
    -- itself filtered by these, exactly as it would be in production. Left
    -- out, the fixture would under-report what the real database allows,
    -- not over-report it. ----
    create policy "Users can view documents related to their applications"
    on public.documents for select
    using (
      exists (
        select 1 from public.applications a
        where a.id = documents.application_id
          and (a.candidate_id = auth.uid() or public.is_job_owner(a.job_id, auth.uid()))
      )
    );

    create policy "Team members can view documents for assigned jobs"
    on public.documents for select
    using (
      exists (
        select 1 from public.applications a
        where a.id = documents.application_id
          and public.is_active_team_member_for_job(a.job_id, auth.uid())
      )
    );

    create policy "Candidates can view their own applications"
    on public.applications for select
    using (auth.uid() = candidate_id);

    create policy "Employers can view applications to their jobs"
    on public.applications for select
    using (public.is_job_owner(applications.job_id, auth.uid()));

    create policy "Team members can view applications for assigned jobs"
    on public.applications for select
    using (public.is_active_team_member_for_job(applications.job_id, auth.uid()));

    -- The untouched sibling "Team members can send messages if permitted"
    -- policy (seeded below) queries jobs/team_members inline too (not
    -- through a SECURITY DEFINER helper), so it needs the matching live
    -- policies (confirmed via mcp__supabase__execute_sql against pg_policies
    -- on the live project) for the same reason as documents/applications
    -- above.
    create policy "Employers can view their own jobs"
    on public.jobs for select
    using (auth.uid() = employer_id);

    create policy "Team members can view assigned jobs"
    on public.jobs for select
    using (
      exists (
        select 1 from public.team_members tm
        where tm.user_id = auth.uid() and tm.employer_id = jobs.employer_id and tm.status = 'active'
          and (array_length(tm.assigned_job_ids, 1) is null or jobs.id = any (tm.assigned_job_ids))
      )
    );

    create policy "Team members can view their own record"
    on public.team_members for select
    using (auth.uid() = user_id);

    create policy "Employers can view their team members"
    on public.team_members for select
    using (auth.uid() = employer_id);

    -- ---- pre-fix vulnerable policies, verbatim from the migrations the task
    -- describes, so the "forgery succeeds under OLD policy" sanity checks
    -- below prove this fixture actually models the real hole ----
    create policy "Users can insert their own blueprint purchases"
    on public.blueprint_purchases for insert
    with check (auth.uid() = user_id);

    create policy "System can insert audit logs"
    on public.document_audit_logs for insert
    with check (true);

    create policy "Users can send messages"
    on public.messages for insert
    with check (auth.uid() = sender_id);

    -- the sibling team-member policy is untouched by the migration under
    -- test, so it is seeded once, here, and never recreated below.
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

  // ---- seed data ----
  await db.query(`insert into public.profiles (user_id, full_name, email) values ($1, $2, $3)`, [
    CAND_X, "Cand X", "candx@example.com",
  ]);
  await db.query(`insert into public.jobs (id, employer_id) values ($1, $2), ($3, $2), ($4, $5)`, [
    JOB_A, EMP_A, JOB_A2, JOB_B, EMP_B,
  ]);
  await db.query(
    `insert into public.applications (id, job_id, candidate_id) values ($1, $2, $3), ($4, $5, $3), ($6, $7, $8)`,
    [APP_AX, JOB_A, CAND_X, APP_BX, JOB_B, APP_A2Y, JOB_A2, CAND_Y]
  );
  await db.query(
    `insert into public.team_members (user_id, employer_id, status, can_message_candidates) values ($1, $2, 'active', true), ($3, $2, 'active', false)`,
    [TEAM_A_MSG, EMP_A, TEAM_A_VIEW]
  );
  await db.query(
    `insert into public.documents (id, application_id, sender_id, recipient_id) values ($1, $2, $3, $4)`,
    [DOC_AX, APP_AX, EMP_A, CAND_X]
  );

  async function asUser(uid, role, sql, params = []) {
    if (uid) await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false);`);
    else await db.exec(`select set_config('request.jwt.claim.sub', '', false);`);
    await db.exec(`select set_config('request.jwt.claim.role', '${role}', false);`);
    await db.exec(`set role ${role};`);
    try {
      await db.query(sql, params);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      await db.exec(`reset role;`);
    }
  }

  async function asPostgres(sql, params = []) {
    await db.exec(`reset role;`);
    return db.query(sql, params);
  }

  // =====================================================================
  // Sanity: prove the OLD policies actually have the hole the task
  // describes, so a pass below means the migration closed a real door —
  // not that the fixture never opened one.
  // =====================================================================
  console.log("\n-- sanity: OLD (pre-fix) policies are exploitable --");

  check(
    "(a) OLD: candidate can self-insert a blueprint purchase with no Stripe session",
    (
      await asUser(
        CAND_X,
        "authenticated",
        `insert into public.blueprint_purchases (user_id, application_id, stripe_session_id) values ('${CAND_X}', '${APP_AX}', 'not-a-real-stripe-session')`
      )
    ).ok
  );

  check(
    "(b) OLD: a total stranger can forge a 'candidate_signed' audit row with a made-up signer_name",
    (
      await asUser(
        STRANGER,
        "authenticated",
        `insert into public.document_audit_logs (document_id, user_id, action, signer_name) values ('${DOC_AX}', '${STRANGER}', 'candidate_signed', 'Forged Signature')`
      )
    ).ok
  );

  check(
    "(b) OLD: even anon can insert an audit row (no TO clause)",
    (
      await asUser(
        null,
        "anon",
        `insert into public.document_audit_logs (document_id, action) values ('${DOC_AX}', 'viewed')`
      )
    ).ok
  );

  check(
    "(c) OLD: a stranger can message a candidate they have no application relationship with",
    (
      await asUser(
        STRANGER,
        "authenticated",
        `insert into public.messages (sender_id, receiver_id, content) values ('${STRANGER}', '${CAND_X}', 'hi')`
      )
    ).ok
  );

  // Clean up the rows the sanity block above actually inserted, so they
  // cannot mask a false pass in the post-fix assertions below.
  await asPostgres(`delete from public.blueprint_purchases`);
  await asPostgres(`delete from public.document_audit_logs`);
  await asPostgres(`delete from public.messages`);

  // =====================================================================
  // Apply the migration under test, verbatim.
  // =====================================================================
  await db.exec(migrationSql);

  // =====================================================================
  // (a) blueprint_purchases — forgery denied, service role still works
  // =====================================================================
  console.log("\n-- (a) blueprint_purchases --");

  check(
    "forged: candidate can no longer self-insert a purchase, even for their own application/user_id",
    !(
      await asUser(
        CAND_X,
        "authenticated",
        `insert into public.blueprint_purchases (user_id, application_id, stripe_session_id) values ('${CAND_X}', '${APP_AX}', 'still-not-real')`
      )
    ).ok
  );

  check(
    "forged: anon cannot insert either",
    !(
      await asUser(
        null,
        "anon",
        `insert into public.blueprint_purchases (user_id, application_id) values ('${CAND_X}', '${APP_AX}')`
      )
    ).ok
  );

  check(
    "legit: service_role (verify-blueprint-purchase, post-Stripe-verification) can still insert",
    (
      await asUser(
        CAND_X,
        "service_role",
        `insert into public.blueprint_purchases (user_id, application_id, stripe_session_id) values ('${CAND_X}', '${APP_AX}', 'cs_test_real_session')`
      )
    ).ok
  );

  // =====================================================================
  // (b) document_audit_logs — forgery denied, benign party logging allowed,
  // signer identity/hash fields forced regardless of payload
  // =====================================================================
  console.log("\n-- (b) document_audit_logs --");

  check(
    "forged: anon still cannot insert at all",
    !(
      await asUser(null, "anon", `insert into public.document_audit_logs (document_id, action) values ('${DOC_AX}', 'viewed')`)
    ).ok
  );

  check(
    "forged: a stranger with no relationship to the document cannot log anything",
    !(
      await asUser(
        STRANGER,
        "authenticated",
        `insert into public.document_audit_logs (document_id, user_id, action) values ('${DOC_AX}', '${STRANGER}', 'viewed')`
      )
    ).ok
  );

  check(
    "forged: the real candidate on the document cannot insert a 'candidate_signed' attestation client-side",
    !(
      await asUser(
        CAND_X,
        "authenticated",
        `insert into public.document_audit_logs (document_id, user_id, action, signer_name, document_hash) values ('${DOC_AX}', '${CAND_X}', 'candidate_signed', 'Cand X', 'deadbeef')`
      )
    ).ok
  );

  {
    // The trigger fires BEFORE the WITH CHECK is evaluated, so this insert is
    // not rejected outright — it lands, but with user_id corrected to the
    // real caller, never the payload's claimed identity.
    const r = await asUser(
      CAND_X,
      "authenticated",
      `insert into public.document_audit_logs (document_id, user_id, action, signer_name) values ('${DOC_AX}', '${EMP_A}', 'viewed', 'Someone Else')`
    );
    check("forged: the real candidate's attempt to claim to be someone else is accepted as an insert...", r.ok);
    const row = await asPostgres(
      `select user_id, signer_name from public.document_audit_logs where document_id = '${DOC_AX}' and action = 'viewed' and signer_name = 'Cand X' limit 1`
    );
    check(
      "...but the trigger overwrites user_id/signer_name to CAND_X, never EMP_A/'Someone Else'",
      row.rows.length === 1 && row.rows[0].user_id === CAND_X,
      JSON.stringify(row.rows)
    );
  }

  {
    // Matches the real shape of src/components/documents/DocumentWizard.tsx:723-737
    // — the one live client insert this policy allow-list admits — which sets
    // document_hash to a client-computed content-integrity hash on 'created'.
    const r = await asUser(
      EMP_A,
      "authenticated",
      `insert into public.document_audit_logs (document_id, user_id, action, document_hash) values ('${DOC_AX}', '${EMP_A}', 'created', 'v1-content-hash')`
    );
    check("legit: the document's sender (employer who created it) can log 'created'", r.ok);
    const row = await asPostgres(
      `select document_hash from public.document_audit_logs where document_id = '${DOC_AX}' and action = 'created' order by created_at desc limit 1`
    );
    check(
      "...and the trigger preserves document_hash on 'created' (DocumentWizard's v1 content-integrity hash, not a signing claim) — read back by EmployerReviewPanel.tsx, SignedDocumentViewer.tsx and completionCertificate.ts",
      row.rows[0]?.document_hash === "v1-content-hash",
      JSON.stringify(row.rows[0])
    );
  }

  check(
    "legit: the document's recipient (candidate) can log 'viewed'",
    (
      await asUser(
        CAND_X,
        "authenticated",
        `insert into public.document_audit_logs (document_id, user_id, action) values ('${DOC_AX}', '${CAND_X}', 'viewed')`
      )
    ).ok
  );

  check(
    "legit: an active team member assigned to the job can log 'viewed', even with no send/message permission",
    (
      await asUser(
        TEAM_A_VIEW,
        "authenticated",
        `insert into public.document_audit_logs (document_id, user_id, action) values ('${DOC_AX}', '${TEAM_A_VIEW}', 'viewed')`
      )
    ).ok
  );

  {
    const r = await asUser(
      CAND_X,
      "authenticated",
      `insert into public.document_audit_logs (document_id, user_id, action, signer_name, signer_email, document_hash) values ('${DOC_AX}', '${STRANGER}', 'viewed', 'Attacker Name', 'attacker@evil.example', 'forged-hash')`
    );
    check("legit action, forged identity/hash fields: insert still succeeds (row belongs to the real party)...", r.ok);
    const row = await asPostgres(
      `select user_id, signer_name, signer_email, signer_role, document_hash from public.document_audit_logs where document_id = '${DOC_AX}' and action = 'viewed' and signer_email is distinct from null order by created_at desc limit 1`
    );
    const last = row.rows[row.rows.length - 1];
    check(
      "...but the trigger forces user_id/signer_name/signer_email to the real caller, not the payload",
      last && last.user_id === CAND_X && last.signer_name === "Cand X" && last.signer_email === "candx@example.com",
      JSON.stringify(last)
    );
    check("...and strips the forged document_hash", last && last.document_hash === null, JSON.stringify(last));
  }

  {
    const r = await asUser(
      "service_role",
      "service_role",
      `insert into public.document_audit_logs (document_id, user_id, action, signer_name, signer_email, signer_role, document_hash) values ('${DOC_AX}', '${CAND_X}', 'candidate_signed', 'Cand X', 'candx@example.com', 'candidate', 'real-v2-hash')`
    );
    check("legit: service_role (the real future signing pipeline) can write candidate_signed with a real hash", r.ok);
    const row = await asPostgres(
      `select document_hash, signer_role from public.document_audit_logs where action = 'candidate_signed' order by created_at desc limit 1`
    );
    check(
      "...and the trigger leaves service_role's own fields untouched",
      row.rows[0]?.document_hash === "real-v2-hash" && row.rows[0]?.signer_role === "candidate",
      JSON.stringify(row.rows[0])
    );
  }

  // =====================================================================
  // (c) messages — forgery denied on both sender/receiver and application_id,
  // every legitimate shape (incl. application_id IS NULL) still allowed
  // =====================================================================
  console.log("\n-- (c) messages --");

  check(
    "forged: anon cannot insert",
    !(await asUser(null, "anon", `insert into public.messages (sender_id, receiver_id, content) values ('${STRANGER}', '${CAND_X}', 'hi')`)).ok
  );

  check(
    "forged: a stranger cannot message a candidate they share no application with",
    !(
      await asUser(STRANGER, "authenticated", `insert into public.messages (sender_id, receiver_id, content) values ('${STRANGER}', '${CAND_X}', 'hi')`)
    ).ok
  );

  check(
    "forged: a candidate cannot message an employer they never applied to",
    !(
      await asUser(CAND_Y, "authenticated", `insert into public.messages (sender_id, receiver_id, content) values ('${CAND_Y}', '${EMP_B}', 'hi')`)
    ).ok
  );

  check(
    "forged: a candidate cannot spoof another candidate as the sender",
    !(
      await asUser(
        CAND_Y,
        "authenticated",
        `insert into public.messages (sender_id, receiver_id, content) values ('${CAND_X}', '${EMP_A}', 'pretending to be Cand X')`
      )
    ).ok
  );

  check(
    "forged: candidate cannot pin a real thread to someone else's application_id",
    !(
      await asUser(
        CAND_X,
        "authenticated",
        `insert into public.messages (sender_id, receiver_id, application_id, content) values ('${CAND_X}', '${EMP_A}', '${APP_A2Y}', 'wrong application')`
      )
    ).ok,
    "APP_A2Y belongs to CAND_Y, not CAND_X"
  );

  check(
    "legit: candidate -> job owner, pinned to their real application_id",
    (
      await asUser(
        CAND_X,
        "authenticated",
        `insert into public.messages (sender_id, receiver_id, application_id, content) values ('${CAND_X}', '${EMP_A}', '${APP_AX}', 'hi')`
      )
    ).ok
  );

  check(
    "legit: candidate -> job owner, application_id NULL (matches live: 6 of 7 rows in prod today)",
    (
      await asUser(CAND_X, "authenticated", `insert into public.messages (sender_id, receiver_id, content) values ('${CAND_X}', '${EMP_A}', 'hi again')`)
    ).ok
  );

  check(
    "legit: job owner -> candidate of one of their applications",
    (
      await asUser(
        EMP_A,
        "authenticated",
        `insert into public.messages (sender_id, receiver_id, application_id, content) values ('${EMP_A}', '${CAND_X}', '${APP_AX}', 'reply')`
      )
    ).ok
  );

  check(
    "legit: candidate with applications to two different employers can message each independently",
    (
      await asUser(
        CAND_X,
        "authenticated",
        `insert into public.messages (sender_id, receiver_id, application_id, content) values ('${CAND_X}', '${EMP_B}', '${APP_BX}', 'hi EMP_B')`
      )
    ).ok
  );

  check(
    "legit (untouched sibling policy): active team member with can_message_candidates can still message",
    (
      await asUser(
        TEAM_A_MSG,
        "authenticated",
        `insert into public.messages (sender_id, receiver_id, application_id, content) values ('${TEAM_A_MSG}', '${CAND_X}', '${APP_AX}', 'team hi')`
      )
    ).ok
  );

  check(
    "forged (untouched sibling policy, unaffected by this migration): team member WITHOUT can_message_candidates still cannot message",
    !(
      await asUser(
        TEAM_A_VIEW,
        "authenticated",
        `insert into public.messages (sender_id, receiver_id, application_id, content) values ('${TEAM_A_VIEW}', '${CAND_X}', '${APP_AX}', 'should be denied')`
      )
    ).ok
  );

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
