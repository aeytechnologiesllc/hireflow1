#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261025170000_remove_applicant.sql
 * and supabase/functions/remove-applicant/files.ts (docs/LAUNCH-PLAN.md,
 * Phase 5, task 3): a business removes an applicant's information.
 *
 *   - only the job's business owner, or an active teammate who manages
 *     applicants, may; nobody calls it but the system;
 *   - it removes exactly that application and what hangs off it, logs who
 *     and when, keeps the messages (they lose the link) and every other
 *     application, the same person's included;
 *   - it says which files to delete, never one the person still uses on
 *     their profile or another application.
 *
 * Run with: node scripts/remove_applicant.pglite.test.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const FILES = await import("../supabase/functions/remove-applicant/files.ts");

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

const OWNER = "40000000-0000-4000-8000-000000000001";
const OTHER_OWNER = "40000000-0000-4000-8000-000000000002";
const MANAGER = "40000000-0000-4000-8000-000000000003";
const VIEWER = "40000000-0000-4000-8000-000000000004";
const LEFT = "40000000-0000-4000-8000-000000000005";
const STRANGER = "40000000-0000-4000-8000-000000000006";
const ANA = "40000000-0000-4000-8000-000000000010";
const JOB = "41000000-0000-4000-8000-000000000001";
const OTHER_JOB = "41000000-0000-4000-8000-000000000002";
const APP = "42000000-0000-4000-8000-000000000001";
const ANA_OTHER = "42000000-0000-4000-8000-000000000002";
const BEN_APP = "42000000-0000-4000-8000-000000000003";
const SECOND = "42000000-0000-4000-8000-000000000004";

const db = new PGlite();
await db.exec(`
  create schema private;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant anon, authenticated, service_role to postgres;
  grant usage on schema public to anon, authenticated, service_role;

  create table public.profiles (user_id uuid primary key, resume_url text, portfolio_url text);
  create table public.jobs (id uuid primary key, employer_id uuid not null, title text);
  create table public.applications (id uuid primary key, job_id uuid references public.jobs(id), candidate_id uuid, resume_url text, notes text);
  create table public.team_members (employer_id uuid, user_id uuid, status text, can_manage_pipeline boolean);
  create table public.applicant_notes (id serial primary key, application_id uuid references public.applications(id) on delete cascade, body text);
  create table public.interviews (id serial primary key, application_id uuid references public.applications(id) on delete cascade);
  create table public.documents (id uuid primary key default gen_random_uuid(), application_id uuid references public.applications(id) on delete cascade, file_url text);
  create table public.document_requests (id serial primary key, application_id uuid references public.applications(id) on delete cascade);
  create table public.messages (id serial primary key, application_id uuid references public.applications(id) on delete set null, content text);

  insert into public.profiles values ('${ANA}', '${ANA}/profile-cv.pdf', null);
  insert into public.jobs values ('${JOB}', '${OWNER}', 'Chat agent'), ('${OTHER_JOB}', '${OTHER_OWNER}', 'Phone agent');
  insert into public.applications values
    ('${APP}', '${JOB}', '${ANA}', '${ANA}/1700000000000.pdf', '{"answers":{"q1":"${ANA}/1700000000001_q1.pdf"},"cv":"${ANA}/profile-cv.pdf"}'),
    ('${ANA_OTHER}', '${OTHER_JOB}', '${ANA}', '${ANA}/1700000000009.pdf', '{"answers":{"q1":"${ANA}/1700000000001_q1.pdf"}}'),
    ('${BEN_APP}', '${JOB}', '40000000-0000-4000-8000-000000000011', null, null),
    ('${SECOND}', '${JOB}', '40000000-0000-4000-8000-000000000012', null, null);
  insert into public.team_members values
    ('${OWNER}', '${MANAGER}', 'active', true),
    ('${OWNER}', '${VIEWER}', 'active', false),
    ('${OWNER}', '${LEFT}', 'removed', true);
  insert into public.applicant_notes (application_id, body) values ('${APP}', 'Strong'), ('${BEN_APP}', 'Keep');
  insert into public.interviews (application_id) values ('${APP}');
  insert into public.documents (id, application_id, file_url) values ('43000000-0000-4000-8000-000000000001', '${APP}', 'https://x.supabase.co/storage/v1/object/sign/documents/${OWNER}/offer.pdf?token=t');
  insert into public.document_requests (application_id) values ('${APP}');
  insert into public.messages (application_id, content) values ('${APP}', 'Hello Ana'), ('${BEN_APP}', 'Hello Ben');
`);
await db.exec(read("supabase/migrations/20261025170000_remove_applicant.sql"));

const remove = async (application, actor, reason = null) =>
  (await db.query(`select public.remove_applicant($1, $2, $3) as r`, [application, actor, reason])).rows[0].r;
const count = async (sql) => (await db.query(sql)).rows[0].n;

console.log("\nWho may remove an applicant\n");
check("nobody signed in: refused", (await remove(APP, null))?.reason === "not_signed_in");
check("an application that does not exist: not found", (await remove("42000000-0000-4000-8000-0000000000ff", OWNER))?.reason === "not_found");
check("a stranger: refused", (await remove(APP, STRANGER))?.reason === "not_allowed");
check("another business's owner: refused", (await remove(APP, OTHER_OWNER))?.reason === "not_allowed");
check("a teammate who may not manage applicants: refused", (await remove(APP, VIEWER))?.reason === "not_allowed");
check("someone who left the team: refused", (await remove(APP, LEFT))?.reason === "not_allowed");
check("the applicant themself: refused (they delete their own account in Settings)", (await remove(APP, ANA))?.reason === "not_allowed");
check("nothing was removed by any refusal", (await count(`select count(*)::int as n from public.applications`)) === 4 && (await count(`select count(*)::int as n from private.applicant_removals`)) === 0);
{
  let blocked = false;
  try {
    await db.exec(`set role authenticated; select public.remove_applicant('${APP}', '${OWNER}', null);`);
  } catch {
    blocked = true;
  } finally {
    await db.exec(`reset role;`);
  }
  check("only the system may call it (a signed-in user could otherwise name any actor)", blocked);
  let logBlocked = false;
  try {
    await db.exec(`set role authenticated; select * from private.applicant_removals;`);
  } catch {
    logBlocked = true;
  } finally {
    await db.exec(`reset role;`);
  }
  check("the removal log is nobody's to read through the API", logBlocked);
}

console.log("\nThe owner removes Ana's application\n");
const done = await remove(APP, OWNER, "She asked us to delete her information");
check("it is removed", done?.ok === true && (await count(`select count(*)::int as n from public.applications where id = '${APP}'`)) === 0, JSON.stringify(done));
check("…with its notes, interviews, documents and document requests", (await count(`select (select count(*) from public.applicant_notes where application_id = '${APP}') + (select count(*) from public.interviews) + (select count(*) from public.documents) + (select count(*) from public.document_requests) as n`)) === 0);
check("its messages stay, without the link (they are Ana's conversation too)", (await count(`select count(*)::int as n from public.messages where content = 'Hello Ana' and application_id is null`)) === 1);
check("Ana's application to another business is untouched", (await count(`select count(*)::int as n from public.applications where id = '${ANA_OTHER}'`)) === 1);
check("other applicants to the same job are untouched, notes and messages included", (await count(`select count(*)::int as n from public.applications where id in ('${BEN_APP}', '${SECOND}')`)) === 2 && (await count(`select count(*)::int as n from public.applicant_notes where application_id = '${BEN_APP}'`)) === 1 && (await count(`select count(*)::int as n from public.messages where application_id = '${BEN_APP}'`)) === 1);
const log = (await db.query(`select * from private.applicant_removals`)).rows;
check("it is logged: which application, whose, by whom, why, when", log.length === 1 && log[0].application_id === APP && log[0].employer_id === OWNER && log[0].candidate_id === ANA && log[0].removed_by === OWNER && /asked us/.test(log[0].reason) && !!log[0].removed_at);
check("it says which documents' files to delete", Array.isArray(done.documents) && done.documents.length === 1 && /offer\.pdf/.test(done.documents[0].file));
check("it says what Ana still uses elsewhere: her profile's resume and her other application", done.other_refs.includes(`${ANA}/profile-cv.pdf`) && done.other_refs.includes(`${ANA}/1700000000009.pdf`) && done.other_refs.includes(`${ANA}/1700000000001_q1.pdf`));
check("removing it again: not found", (await remove(APP, OWNER))?.reason === "not_found");

console.log("\nA teammate who manages applicants\n");
check("may remove one", (await remove(SECOND, MANAGER))?.ok === true && (await count(`select count(*)::int as n from private.applicant_removals where removed_by = '${MANAGER}'`)) === 1);

console.log("\nWhich files are deleted (remove-applicant/files.ts)\n");
const toRemove = FILES.resumeFilesToRemove(ANA, done.resume_url, done.notes, done.other_refs);
check("the resume uploaded for this application goes", toRemove.includes(`${ANA}/1700000000000.pdf`), JSON.stringify(toRemove));
check("a form file another application of hers still uses stays", !toRemove.includes(`${ANA}/1700000000001_q1.pdf`));
check("her profile's resume stays, even when this application pointed at it", !toRemove.includes(`${ANA}/profile-cv.pdf`));
check("nothing outside her own folder is ever named", toRemove.every((p) => p.startsWith(`${ANA}/`)));
check("a storage link is read as its path in the bucket", FILES.storagePathIn(`https://x.supabase.co/storage/v1/object/sign/documents/documents/abc/final.pdf?token=1`, "documents") === "documents/abc/final.pdf" && FILES.storagePathIn("uid/file.pdf", "resumes") === "uid/file.pdf" && FILES.storagePathIn("https://elsewhere.test/file.pdf", "resumes") === null && FILES.storagePathIn("", "resumes") === null);

const fn = read("supabase/functions/remove-applicant/index.ts");
check("the function takes the actor from the sign-in, never the request", /const caller = await requireSignedInUser\(req, corsHeaders\);/.test(fn) && /p_actor: caller\.userId/.test(fn) && !/body\.actor|body\.userId/.test(fn));
check("files go only after the database removed the application", fn.indexOf('admin.rpc("remove_applicant"') < fn.indexOf("await removeAll(storage"));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
