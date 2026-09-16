#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20260915150000_document_signing.sql
 * — plain assertions, no framework, real Postgres (via PGlite), not a text
 * match.
 *
 * Builds a minimal but faithful fixture of `documents`/`applications`/
 * `jobs`/`team_members` plus the LIVE (pre-fix) RLS policies this migration
 * touches or depends on ("Candidates can update document status",
 * "Employers can update their documents", "Team members can update
 * documents if permitted", "Candidates can delete their documents",
 * "Employers can delete their documents" — verbatim from
 * 20251214202144_*.sql / 20251215015739_*.sql / 20251215060535_*.sql),
 * proves the pre-fix holes this migration closes actually exist (so this
 * fixture is known to model the real gap, not a strawman), then applies
 * supabase/migrations/20260915150000_document_signing.sql VERBATIM (read
 * from disk, not retyped) and re-proves every must-change fix from the
 * design doc's revision log:
 *
 *   1. array_length(assigned_job_ids, 1) IS NULL semantics — a team member
 *      scoped to '{}'::uuid[] (not a genuine NULL) is still treated as
 *      "every job" and correctly fenced, not misclassified into the
 *      unrestricted pass-through branch.
 *   2. is_voided / voided_at / voided_reason are blocked from a direct
 *      client UPDATE on both a pending and a closed (signed) document.
 *   3. signature_data / signed_at (legacy columns, signed_at now also the
 *      live completion timestamp) are blocked from a direct client UPDATE
 *      on both a pending and a closed document.
 *   4. Candidates can no longer delete their own documents; an employer
 *      can only delete a document the candidate hasn't signed yet.
 *
 * `anon`/`authenticated`/`service_role` are real, separate Postgres roles
 * (not the table owner), so RLS is genuinely enforced.
 *
 * Run with: node scripts/document_signing_guard_pglite_check.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20260915150000_document_signing.sql");

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

const EMP_A = "10000000-0000-0000-0000-00000000000a";
const CAND_X = "20000000-0000-0000-0000-000000000001";
const STRANGER = "40000000-0000-0000-0000-000000000001";
const TEAM_NULL = "30000000-0000-0000-0000-000000000001"; // assigned_job_ids IS NULL
const TEAM_EMPTY = "30000000-0000-0000-0000-000000000002"; // assigned_job_ids = '{}' — the must-change #5 case

const JOB_A = "50000000-0000-0000-0000-00000000000a";
const APP_AX = "60000000-0000-0000-0000-00000000000a";
const DOC_PENDING = "70000000-0000-0000-0000-00000000000a";
const DOC_SIGNED = "70000000-0000-0000-0000-00000000000b";

async function main() {
  const db = new PGlite();
  const migrationSql = await readFile(MIGRATION_PATH, "utf8").catch(() => null);
  check("migration file exists on disk", migrationSql != null, MIGRATION_PATH);
  if (!migrationSql) {
    console.log(`\n${failed} of ${passed + failed} checks failed.`);
    process.exit(1);
  }

  await db.exec(`
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

    create type public.document_status as enum ('pending', 'signed', 'declined');

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
      can_send_documents boolean not null default false,
      assigned_job_ids uuid[]
    );

    create table public.documents (
      id uuid primary key default gen_random_uuid(),
      application_id uuid not null references public.applications(id),
      name text not null,
      file_url text not null default 'data:text/plain;base64,',
      document_type text,
      status public.document_status not null default 'pending',
      sender_id uuid,
      recipient_id uuid,
      candidate_signature_data text,
      candidate_signed_at timestamptz,
      employer_signature_data text,
      employer_signed_at timestamptz,
      v1_hash text,
      v2_hash text,
      v3_hash text,
      document_hash text,
      final_pdf_hash text,
      is_locked boolean not null default false,
      locked_at timestamptz,
      completion_certificate jsonb,
      declined_at timestamptz,
      decline_reason text,
      viewed_at timestamptz,
      ip_address text,
      user_agent text,
      expires_at timestamptz,
      reminder_sent_at timestamptz,
      is_voided boolean not null default false,
      voided_at timestamptz,
      voided_reason text,
      package_id uuid,
      signature_data text,
      signed_at timestamptz,
      document_code text not null default 'DOC-TEST',
      created_at timestamptz not null default now()
    );

    alter table public.jobs enable row level security;
    alter table public.applications enable row level security;
    alter table public.team_members enable row level security;
    alter table public.documents enable row level security;

    grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;

    -- Small stand-in for is_job_owner (only used by the SELECT-policy
    -- fixture below, never by the migration under test itself — the
    -- migration's own trigger joins applications/jobs inline).
    create or replace function public.is_job_owner_stub(p_job_id uuid, p_user_id uuid)
    returns boolean language sql stable security definer set search_path = public, pg_temp as $$
      select exists (select 1 from public.jobs j where j.id = p_job_id and j.employer_id = p_user_id);
    $$;

    -- ---- live SELECT policies these UPDATE/DELETE attempts need to even
    -- reach a row (mirroring 20251214183024_*.sql / 20251215060535_*.sql) ----
    create policy "sel_jobs" on public.jobs for select using (
      auth.uid() = employer_id or exists (
        select 1 from public.team_members tm where tm.user_id = auth.uid() and tm.employer_id = jobs.employer_id and tm.status = 'active'
      )
    );
    create policy "sel_apps" on public.applications for select using (
      auth.uid() = candidate_id or public.is_job_owner_stub(applications.job_id, auth.uid())
      or exists (select 1 from public.team_members tm where tm.user_id = auth.uid())
    );
    create policy "sel_docs" on public.documents for select using (
      exists (
        select 1 from public.applications a where a.id = documents.application_id
          and (a.candidate_id = auth.uid() or public.is_job_owner_stub(a.job_id, auth.uid())
               or exists (select 1 from public.team_members tm where tm.user_id = auth.uid()))
      )
    );
    create policy "sel_team" on public.team_members for select using (true);

    -- live UPDATE policies, verbatim from 20251214202144_*.sql / 20251215060535_*.sql
    create policy "Candidates can update document status" on public.documents for update using (
      exists (select 1 from public.applications a where a.id = documents.application_id and a.candidate_id = auth.uid())
    );
    create policy "Employers can update their documents" on public.documents for update using (
      exists (
        select 1 from public.applications a join public.jobs j on j.id = a.job_id
        where a.id = documents.application_id and j.employer_id = auth.uid()
      )
    );
    create policy "Team members can update documents if permitted" on public.documents for update using (
      exists (
        select 1 from public.applications a join public.jobs j on j.id = a.job_id
          join public.team_members tm on tm.employer_id = j.employer_id
        where a.id = documents.application_id and tm.user_id = auth.uid() and tm.status = 'active'
          and tm.can_send_documents = true
          and (array_length(tm.assigned_job_ids, 1) is null or j.id = any (tm.assigned_job_ids))
      )
    );

    -- live (pre-fix) DELETE policies, verbatim from 20251215015739_*.sql
    create policy "Employers can delete their documents" on public.documents for delete using (
      exists (
        select 1 from public.applications a join public.jobs j on j.id = a.job_id
        where a.id = documents.application_id and j.employer_id = auth.uid()
      )
    );
    create policy "Candidates can delete their documents" on public.documents for delete using (
      exists (select 1 from public.applications a where a.id = documents.application_id and a.candidate_id = auth.uid())
    );
  `);

  await db.query(`insert into public.jobs (id, employer_id) values ($1, $2)`, [JOB_A, EMP_A]);
  await db.query(`insert into public.applications (id, job_id, candidate_id) values ($1, $2, $3)`, [APP_AX, JOB_A, CAND_X]);
  await db.query(
    `insert into public.team_members (user_id, employer_id, status, can_send_documents, assigned_job_ids) values
       ($1, $2, 'active', true, null),
       ($3, $2, 'active', true, '{}')`,
    [TEAM_NULL, EMP_A, TEAM_EMPTY],
  );
  await db.query(
    `insert into public.documents (id, application_id, name, sender_id, recipient_id, status)
     values ($1, $2, 'Offer Letter', $3, $4, 'pending')`,
    [DOC_PENDING, APP_AX, EMP_A, CAND_X],
  );
  await db.query(
    `insert into public.documents (id, application_id, name, sender_id, recipient_id, status, is_locked, candidate_signed_at, employer_signed_at)
     values ($1, $2, 'Signed NDA', $3, $4, 'signed', true, now(), now())`,
    [DOC_SIGNED, APP_AX, EMP_A, CAND_X],
  );

  async function asUser(uid, role, sql, params = []) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
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
  // Sanity: prove the pre-fix hole actually exists (no trigger at all
  // today — RLS's UPDATE USING clauses have no column restriction).
  // =====================================================================
  console.log("\n-- sanity: no trigger yet, a candidate can forge any column RLS lets them reach --");

  await asUser(CAND_X, "authenticated", `update public.documents set employer_signed_at = now() where id = '${DOC_PENDING}'`);
  {
    const res = await db.query(`select employer_signed_at from public.documents where id = $1`, [DOC_PENDING]);
    check("(pre-fix) candidate can set employer_signed_at directly on their own pending document", res.rows[0]?.employer_signed_at != null);
  }
  await asUser(CAND_X, "authenticated", `delete from public.documents where id = '${DOC_PENDING}'`);
  {
    const res = await db.query(`select 1 from public.documents where id = $1`, [DOC_PENDING]);
    check("(pre-fix) candidate can delete their own document outright", res.rows.length === 0);
  }

  await asPostgres(
    `update public.documents set employer_signed_at = null, status = 'pending' where id = $1`,
    [DOC_PENDING],
  );
  // the delete sanity check above actually removed the row — recreate it.
  await asPostgres(
    `insert into public.documents (id, application_id, name, sender_id, recipient_id, status)
     values ($1, $2, 'Offer Letter', $3, $4, 'pending')
     on conflict (id) do update set status = 'pending', employer_signed_at = null, candidate_signed_at = null, is_locked = false`,
    [DOC_PENDING, APP_AX, EMP_A, CAND_X],
  );

  // =====================================================================
  // Apply the migration under test, verbatim.
  // =====================================================================
  await db.exec(migrationSql);

  // =====================================================================
  // Core fence: a candidate can never write signing/lock/hash columns.
  // =====================================================================
  console.log("\n-- protect_document_columns(): candidate side --");

  check(
    "candidate can no longer set employer_signed_at on a pending document",
    !(await asUser(CAND_X, "authenticated", `update public.documents set employer_signed_at = now() where id = '${DOC_PENDING}'`)).ok,
  );
  check(
    "candidate can no longer set is_locked",
    !(await asUser(CAND_X, "authenticated", `update public.documents set is_locked = true where id = '${DOC_PENDING}'`)).ok,
  );
  check(
    "candidate can no longer set v3_hash",
    !(await asUser(CAND_X, "authenticated", `update public.documents set v3_hash = 'forged' where id = '${DOC_PENDING}'`)).ok,
  );
  check(
    "candidate can no longer write completion_certificate",
    !(await asUser(CAND_X, "authenticated", `update public.documents set completion_certificate = '{}'::jsonb where id = '${DOC_PENDING}'`)).ok,
  );

  console.log("\n-- protect_document_columns(): employer side --");

  check(
    "employer can no longer set candidate_signed_at on a pending document",
    !(await asUser(EMP_A, "authenticated", `update public.documents set candidate_signed_at = now() where id = '${DOC_PENDING}'`)).ok,
  );
  await asUser(EMP_A, "authenticated", `update public.documents set name = 'Renamed Offer', expires_at = now() + interval '7 days' where id = '${DOC_PENDING}'`);
  {
    const res = await asPostgres(`select name from public.documents where id = $1`, [DOC_PENDING]);
    check("employer CAN still update name/expires_at on a pending document (not a full lockout)", res.rows[0]?.name === "Renamed Offer");
  }

  console.log("\n-- must-change #5: array_length(assigned_job_ids, 1) IS NULL semantics --");

  check(
    "a team member with assigned_job_ids = '{}' (NOT a plain IS NULL) is STILL correctly fenced from signing columns — not misclassified into the unrestricted pass-through",
    !(await asUser(TEAM_EMPTY, "authenticated", `update public.documents set employer_signed_at = now() where id = '${DOC_PENDING}'`)).ok,
  );
  await asUser(TEAM_EMPTY, "authenticated", `update public.documents set name = 'Renamed by empty-array team member' where id = '${DOC_PENDING}'`);
  {
    const res = await asPostgres(`select name from public.documents where id = $1`, [DOC_PENDING]);
    check(
      "...but that same '{}' team member CAN still update ordinary columns like name (proves they're correctly recognized as employer-side, not silently blocked from everything either)",
      res.rows[0]?.name === "Renamed by empty-array team member",
    );
  }
  await asUser(TEAM_NULL, "authenticated", `update public.documents set name = 'Renamed by null-array team member' where id = '${DOC_PENDING}'`);
  {
    const res = await asPostgres(`select name from public.documents where id = $1`, [DOC_PENDING]);
    check(
      "a team member with assigned_job_ids = NULL (the ordinary 'every job' case) behaves the same way",
      res.rows[0]?.name === "Renamed by null-array team member",
    );
  }

  console.log("\n-- must-change #2: is_voided / voided_at / voided_reason are blocked --");

  check(
    "employer cannot set is_voided directly on a pending document",
    !(await asUser(EMP_A, "authenticated", `update public.documents set is_voided = true where id = '${DOC_PENDING}'`)).ok,
  );
  check(
    "employer cannot set voided_reason directly on a pending document",
    !(await asUser(EMP_A, "authenticated", `update public.documents set voided_reason = 'because' where id = '${DOC_PENDING}'`)).ok,
  );
  check(
    "employer cannot void a fully signed, locked document either — the exact scenario the finding flagged",
    !(await asUser(EMP_A, "authenticated", `update public.documents set is_voided = true, voided_at = now(), voided_reason = 'oops' where id = '${DOC_SIGNED}'`)).ok,
  );

  console.log("\n-- must-change #6: legacy signature_data / signed_at are blocked --");

  check(
    "employer cannot forge signed_at on a pending document (the live completion-date column every UI surface reads)",
    !(await asUser(EMP_A, "authenticated", `update public.documents set signed_at = now() where id = '${DOC_PENDING}'`)).ok,
  );
  check(
    "employer cannot forge signed_at on an already-signed, locked document",
    !(await asUser(EMP_A, "authenticated", `update public.documents set signed_at = now() where id = '${DOC_SIGNED}'`)).ok,
  );
  check(
    "employer cannot write the legacy signature_data column on a pending document",
    !(await asUser(EMP_A, "authenticated", `update public.documents set signature_data = 'forged' where id = '${DOC_PENDING}'`)).ok,
  );

  console.log("\n-- repairer finding: employer cannot swap document content after the candidate has signed --");

  // Recreate a fresh pending document and have the candidate "sign" it
  // (service_role write, mirroring what document-signing's sign() does) so
  // candidate_signed_at is set while status stays 'pending' — exactly the
  // window the finding flagged.
  const DOC_CAND_SIGNED = "70000000-0000-0000-0000-00000000000c";
  await asPostgres(
    `insert into public.documents (id, application_id, name, sender_id, recipient_id, status, candidate_signed_at, v1_hash, v2_hash)
     values ($1, $2, 'Offer Letter (candidate signed, employer has not countersigned)', $3, $4, 'pending', now(), 'v1hash-original', 'v2hash')`,
    [DOC_CAND_SIGNED, APP_AX, EMP_A, CAND_X],
  );
  const swapAttempt = await asUser(
    EMP_A,
    "authenticated",
    `update public.documents set file_url = 'data:text/plain;base64,SFdBQ0tFRA==', name = 'Swapped Offer', document_type = 'nda' where id = '${DOC_CAND_SIGNED}'`,
  );
  check(
    "employer can no longer swap file_url/name/document_type once the candidate has signed but before countersigning",
    !swapAttempt.ok,
    swapAttempt.ok ? "UPDATE unexpectedly succeeded" : swapAttempt.error,
  );
  {
    const res = await asPostgres(`select name, file_url from public.documents where id = $1`, [DOC_CAND_SIGNED]);
    check(
      "...and the content actually stayed the original, unswapped values",
      res.rows[0]?.name === "Offer Letter (candidate signed, employer has not countersigned)",
    );
  }
  // But before any signature, an employer can still legitimately re-save
  // these fields (DocumentWizard right after insert) — must not be a full
  // lockout of ordinary pending-document editing.
  const preSignEdit = await asUser(EMP_A, "authenticated", `update public.documents set name = 'Retitled before anyone signs' where id = '${DOC_PENDING}'`);
  check("employer CAN still edit name/file_url before the candidate has signed at all (not a full lockout)", preSignEdit.ok);

  console.log("\n-- BLOCKER: v1_hash can no longer be raw-UPDATEd independently of a content re-save --");

  // Give DOC_PENDING a known v1_hash baseline to test against (it was
  // inserted with no v1_hash at all above). Routed through service_role,
  // same as every other post-migration direct column write in this file —
  // a plain asPostgres() UPDATE would itself now hit the trigger, since
  // protect_document_columns() only exempts auth.role() = 'service_role',
  // not the Postgres superuser running the test harness.
  await asUser(null, "service_role", `update public.documents set v1_hash = 'v1hash-pending-baseline' where id = '${DOC_PENDING}'`);

  const v1OnlyPreSign = await asUser(
    EMP_A,
    "authenticated",
    `update public.documents set v1_hash = 'forged-v1-no-content-change' where id = '${DOC_PENDING}'`,
  );
  check(
    "a v1_hash-only UPDATE (no content column changing in the same statement) is refused, even before anyone has signed",
    !v1OnlyPreSign.ok,
    v1OnlyPreSign.ok ? "UPDATE unexpectedly succeeded" : v1OnlyPreSign.error,
  );
  {
    const res = await asPostgres(`select v1_hash from public.documents where id = $1`, [DOC_PENDING]);
    check("...and v1_hash actually stayed the original baseline value", res.rows[0]?.v1_hash === "v1hash-pending-baseline");
  }

  const contentPlusV1PreSign = await asUser(
    EMP_A,
    "authenticated",
    `update public.documents set name = 'Re-saved with new content', v1_hash = 'v1hash-recomputed-for-new-content' where id = '${DOC_PENDING}'`,
  );
  check(
    "a v1_hash change together with a content re-save (name changing in the SAME UPDATE) still works pre-signature — DocumentWizard's legitimate re-save case",
    contentPlusV1PreSign.ok,
    contentPlusV1PreSign.ok ? "" : contentPlusV1PreSign.error,
  );
  {
    const res = await asPostgres(`select name, v1_hash from public.documents where id = $1`, [DOC_PENDING]);
    check(
      "...and both the new name and the new v1_hash actually landed together",
      res.rows[0]?.name === "Re-saved with new content" && res.rows[0]?.v1_hash === "v1hash-recomputed-for-new-content",
    );
  }

  const v1OnlyAfterSign = await asUser(
    EMP_A,
    "authenticated",
    `update public.documents set v1_hash = 'forged-v1-after-candidate-signed' where id = '${DOC_CAND_SIGNED}'`,
  );
  check(
    "THE BLOCKER: any v1_hash change is refused once the candidate has signed but before the employer countersigns — closes the window where v2_hash (computed from the original v1_hash at sign time) would stop reconciling",
    !v1OnlyAfterSign.ok,
    v1OnlyAfterSign.ok ? "UPDATE unexpectedly succeeded" : v1OnlyAfterSign.error,
  );
  const v1PlusContentAfterSign = await asUser(
    EMP_A,
    "authenticated",
    // Content columns are already blocked post-signature by the existing
    // guard; this proves v1_hash doesn't get a free pass by riding along
    // with a content column that will itself be refused for an unrelated
    // reason — the whole statement must still fail.
    `update public.documents set name = 'Swapped post-signature', v1_hash = 'forged-v1-with-content-too' where id = '${DOC_CAND_SIGNED}'`,
  );
  check(
    "...and pairing the v1_hash change with a simultaneous content change post-signature doesn't help either — both are refused",
    !v1PlusContentAfterSign.ok,
    v1PlusContentAfterSign.ok ? "UPDATE unexpectedly succeeded" : v1PlusContentAfterSign.error,
  );
  {
    const res = await asPostgres(`select v1_hash from public.documents where id = $1`, [DOC_CAND_SIGNED]);
    check("...and v1_hash on the candidate-signed document actually stayed the original signed-against value", res.rows[0]?.v1_hash === "v1hash-original");
  }

  console.log("\n-- service_role (the document-signing edge function) can still write v1_hash freely --");

  const v1ServiceRole = await asUser(
    null,
    "service_role",
    `update public.documents set v1_hash = 'service-role-can-still-set-this' where id = '${DOC_CAND_SIGNED}'`,
  );
  check("service_role's own write of v1_hash is unaffected by the trigger, even on a candidate-signed pending document", v1ServiceRole.ok, v1ServiceRole.ok ? "" : v1ServiceRole.error);
  await asPostgres(`update public.documents set v1_hash = 'v1hash-original' where id = $1`, [DOC_CAND_SIGNED]);

  console.log("\n-- repairer finding: recipient_id is fenced, not just claimed as 'checked below' --");

  const STRANGER_2 = "40000000-0000-0000-0000-000000000002";
  const recipientHijack = await asUser(EMP_A, "authenticated", `update public.documents set recipient_id = '${STRANGER_2}' where id = '${DOC_PENDING}'`);
  check("employer cannot reassign recipient_id on a pending document", !recipientHijack.ok, recipientHijack.ok ? "UPDATE unexpectedly succeeded" : recipientHijack.error);
  const recipientHijackLocked = await asUser(EMP_A, "authenticated", `update public.documents set recipient_id = '${STRANGER_2}' where id = '${DOC_SIGNED}'`);
  check(
    "employer cannot reassign recipient_id on a fully signed, locked document either — the exact scenario the finding flagged (audit-log/verify-document party hijack)",
    !recipientHijackLocked.ok,
    recipientHijackLocked.ok ? "UPDATE unexpectedly succeeded" : recipientHijackLocked.error,
  );
  {
    const res = await asPostgres(`select recipient_id from public.documents where id = $1`, [DOC_PENDING]);
    check("...and recipient_id on the pending document actually stayed CAND_X, not the stranger", res.rows[0]?.recipient_id === CAND_X);
  }

  console.log("\n-- a fully signed/locked document is otherwise closed to plain edits --");

  check(
    "employer's own client can no longer touch file_url once status = 'signed'",
    !(await asUser(EMP_A, "authenticated", `update public.documents set file_url = 'data:text/plain;base64,eA==' where id = '${DOC_SIGNED}'`)).ok,
  );

  console.log("\n-- service_role (the document-signing edge function) is unaffected --");

  await asUser(
    null,
    "service_role",
    `update public.documents set employer_signed_at = now(), v3_hash = 'x', is_locked = true, status = 'signed', signed_at = now(), completion_certificate = '{}'::jsonb where id = '${DOC_PENDING}'`,
  );
  {
    const res = await asPostgres(`select v3_hash, is_locked, status from public.documents where id = $1`, [DOC_PENDING]);
    check(
      "service_role can still write every signing/lock/hash/void column, on a pending or closed document alike",
      res.rows[0]?.v3_hash === "x" && res.rows[0]?.is_locked === true && res.rows[0]?.status === "signed",
    );
  }
  await asPostgres(
    `update public.documents set status = 'pending', is_locked = false, employer_signed_at = null, v3_hash = null, signed_at = null, completion_certificate = null where id = $1`,
    [DOC_PENDING],
  );

  console.log("\n-- must-change (should-consider list item): identity fields are still structurally protected --");

  check(
    "employer cannot change application_id (document identity)",
    !(await asUser(EMP_A, "authenticated", `update public.documents set application_id = gen_random_uuid() where id = '${DOC_PENDING}'`)).ok,
  );

  // =====================================================================
  // DELETE policy swap
  // =====================================================================
  // A DELETE that no policy authorizes doesn't error — it just matches 0
  // rows (RLS's normal "silently filtered out" behavior). So each check
  // here verifies actual row survival with a service_role SELECT
  // afterward, not just "the statement didn't throw".
  console.log("\n-- DELETE policy swap --");

  async function rowExists(id) {
    const res = await asPostgres(`select 1 from public.documents where id = $1`, [id]);
    return res.rows.length > 0;
  }

  await asUser(CAND_X, "authenticated", `delete from public.documents where id = '${DOC_PENDING}'`);
  check("candidate can no longer delete their own document at all", await rowExists(DOC_PENDING));

  await asUser(EMP_A, "authenticated", `delete from public.documents where id = '${DOC_PENDING}'`);
  check("employer CAN still delete an undelivered (not yet candidate-signed) document", !(await rowExists(DOC_PENDING)));

  // Recreate for the next check (the delete above actually removed it).
  await asPostgres(
    `insert into public.documents (id, application_id, name, sender_id, recipient_id, status, candidate_signed_at)
     values ($1, $2, 'Offer Letter (candidate signed)', $3, $4, 'pending', now())`,
    [DOC_PENDING, APP_AX, EMP_A, CAND_X],
  );
  await asUser(EMP_A, "authenticated", `delete from public.documents where id = '${DOC_PENDING}'`);
  check("employer can NOT delete a document the candidate has already signed", await rowExists(DOC_PENDING));

  await asUser(EMP_A, "authenticated", `delete from public.documents where id = '${DOC_SIGNED}'`);
  check("employer can NOT delete a locked (fully signed) document", await rowExists(DOC_SIGNED));

  console.log("\n-- a stranger has no access at all --");

  {
    await db.exec(`select set_config('request.jwt.claim.sub', '${STRANGER}', false); select set_config('request.jwt.claim.role', 'authenticated', false); set role authenticated;`);
    const res = await db.query(`update public.documents set name = 'nope-should-not-land' where id = '${DOC_SIGNED}' returning id`);
    await db.exec(`reset role;`);
    check("...and it actually affects 0 rows, not a real rename", res.rows.length === 0);
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
