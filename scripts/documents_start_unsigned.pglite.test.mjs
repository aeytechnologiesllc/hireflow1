#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261025340000_documents_start_unsigned.sql
 * (Phase 7 security review, round 2, H1): a business that inserts a document
 * already "signed" (status, lock, the applicant's signature, hashes, a
 * certificate, its own code) gets a pending, unsigned document with a code
 * the database made; the document-signing function's own writes (service
 * role) are untouched.
 *
 * Run with: node scripts/documents_start_unsigned.pglite.test.mjs
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

const BIZ = "10000000-0000-4000-8000-000000000001";
const CAND = "20000000-0000-4000-8000-000000000001";
const APP = "40000000-0000-4000-8000-000000000001";

const db = new PGlite();
await db.exec(`
  create schema auth;
  create schema extensions;
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create or replace function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant anon to postgres; grant authenticated to postgres; grant service_role to postgres;
  grant usage on schema auth, extensions to anon, authenticated, service_role;
  create function extensions.gen_random_bytes(n int) returns bytea language sql volatile as $$ select decode(substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, n * 2), 'hex') $$;
  grant execute on function extensions.gen_random_bytes(int) to anon, authenticated, service_role;
  create type public.document_status as enum ('pending', 'viewed', 'signed', 'declined', 'expired');
  create table public.documents (
    id uuid primary key default gen_random_uuid(), application_id uuid, name text, file_url text, document_type text,
    status public.document_status not null default 'pending', signed_at timestamptz, created_at timestamptz default now(),
    sender_id uuid, recipient_id uuid, declined_at timestamptz, decline_reason text, signature_data text, ip_address text,
    user_agent text, expires_at timestamptz, reminder_sent_at timestamptz, viewed_at timestamptz, candidate_signature_data text,
    candidate_signed_at timestamptz, employer_signature_data text, employer_signed_at timestamptz, signing_order text,
    document_hash text, version_number int, is_voided boolean default false, voided_at timestamptz, voided_reason text,
    v1_hash text, v2_hash text, v3_hash text, is_locked boolean default false, locked_at timestamptz, completion_certificate jsonb,
    document_code text unique, package_id uuid, final_pdf_hash text
  );
  grant select, insert on public.documents to authenticated, service_role;
  -- The live code maker (generate_document_code).
  create or replace function public.generate_document_code() returns trigger language plpgsql security definer set search_path = public as $$
  begin
    if new.document_code is null then new.document_code := 'DOC-' || upper(encode(extensions.gen_random_bytes(16), 'hex')); end if;
    return new;
  end $$;
  create trigger set_document_code before insert on public.documents for each row execute function public.generate_document_code();
`);
const migration = readFileSync(path.join(ROOT, "supabase/migrations/20261025340000_documents_start_unsigned.sql"), "utf8");
await db.exec(migration);
await db.exec(migration);
check("the migration applies, and applies again", true);

const forged = `insert into public.documents (application_id, name, sender_id, recipient_id, status, is_locked, locked_at, candidate_signature_data, candidate_signed_at, employer_signature_data, employer_signed_at, signed_at, v1_hash, v2_hash, v3_hash, final_pdf_hash, document_hash, completion_certificate, document_code, viewed_at, ip_address)
  values ('${APP}', 'Training fee agreement', '${BIZ}', '${CAND}', 'signed', true, now(), 'Jane X', now(), 'Boss', now(), now(), 'v1', 'v2', 'v3', 'final', 'doc', '{"fake": true}', 'DOC-MINE', now(), '1.2.3.4')`;
async function as(uid, role, sql) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); select set_config('request.jwt.claim.role', '${role}', false); set role ${role};`);
  try {
    await db.exec(sql);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claim.role', '', false);`);
  }
}
const ins = await as(BIZ, "authenticated", forged);
check("the business's insert goes through (the pages' own inserts must keep working)", ins.ok, ins.error);
const row = (await db.query(`select * from public.documents where name = 'Training fee agreement'`)).rows[0];
check("…as a pending document", row?.status === "pending", row?.status);
check("…unlocked, with no signature or signing time for either side", row && row.is_locked === false && row.locked_at === null && row.candidate_signature_data === null && row.candidate_signed_at === null && row.employer_signature_data === null && row.employer_signed_at === null && row.signed_at === null, JSON.stringify(row));
check("…no hash past the sender's own v1, and no certificate", row && row.v1_hash === "v1" && row.v2_hash === null && row.v3_hash === null && row.final_pdf_hash === null && row.document_hash === null && row.completion_certificate === null);
check("…nothing about a viewer", row && row.viewed_at === null && row.ip_address === null);
check("…and a code the database made, never the business's own", row && row.document_code !== "DOC-MINE" && /^DOC-[0-9A-F]{32}$/.test(row.document_code), row?.document_code);

const svc = await as(null, "service_role", forged.replace("Training fee agreement", "Signed by the function").replace("DOC-MINE", "DOC-SERVICE"));
const svcRow = (await db.query(`select status::text, candidate_signed_at, document_code from public.documents where name = 'Signed by the function'`)).rows[0];
check("the document-signing function's own writes (service role) are untouched", svc.ok && svcRow?.status === "signed" && svcRow.candidate_signed_at !== null && svcRow.document_code === "DOC-SERVICE", JSON.stringify(svcRow));

// The third security review (20261025430000): sent now, by whoever is signed in.
{
  const round3 = readFileSync(path.join(ROOT, "supabase/migrations/20261025430000_security_round3.sql"), "utf8");
  await db.exec(round3);
  await db.exec(round3);
  const OTHER_SENDER = "40000000-0000-4000-8000-0000000000aa";
  const backdated = await as(BIZ, "authenticated", `insert into public.documents (application_id, name, sender_id, recipient_id, created_at, v1_hash) values ('${APP}', 'Backdated', '${OTHER_SENDER}', '${CAND}', '2020-01-01', 'v1')`);
  const doc = (await db.query(`select sender_id, created_at from public.documents where name = 'Backdated'`)).rows[0];
  check("a business's document is sent now, never on a date it picks (the third security review)", backdated.ok && doc && new Date(doc.created_at).getFullYear() > 2025, JSON.stringify({ backdated, doc }));
  check("…and by whoever is signed in, never a sender it names", doc?.sender_id === BIZ, doc?.sender_id);
  const svcDoc = await as(null, "service_role", `insert into public.documents (application_id, name, sender_id, created_at) values ('${APP}', 'Server dated', '${OTHER_SENDER}', '2021-06-01')`);
  const sd = (await db.query(`select sender_id, created_at from public.documents where name = 'Server dated'`)).rows[0];
  check("…the server's own inserts are untouched", svcDoc.ok && sd?.sender_id === OTHER_SENDER && new Date(sd.created_at).getFullYear() === 2021, JSON.stringify(sd));
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
