#!/usr/bin/env node
/**
 * PGlite proof for supabase/migrations/20261025170000_remove_applicant.sql,
 * its review fix 20261025180000_remove_applicant_review.sql, and
 * supabase/functions/remove-applicant/files.ts (docs/LAUNCH-PLAN.md,
 * Phase 5, task 3): a business removes an applicant's information.
 *
 *   - only the job's business owner, or an active teammate who manages
 *     applicants on that job, may; nobody calls it but the system;
 *   - documents are named by id only, never by the file address a business
 *     wrote (which once let one business delete another's signed copy);
 *   - the team's notifications about the applicant go with it;
 *   - files storage would not delete are queued, in plain paths only;
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
const OWNER_JOB2 = "41000000-0000-4000-8000-000000000003";
const THIRD = "42000000-0000-4000-8000-000000000005";
const ONLY_JOB2 = "40000000-0000-4000-8000-000000000007";

const db = new PGlite();
await db.exec(`
  create schema private;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant anon, authenticated, service_role to postgres;
  grant usage on schema public to anon, authenticated, service_role;

  create table public.profiles (user_id uuid primary key, resume_url text, portfolio_url text);
  create table public.jobs (id uuid primary key, employer_id uuid not null, title text);
  create table public.applications (id uuid primary key, job_id uuid references public.jobs(id), candidate_id uuid, resume_url text, notes text);
  create table public.team_members (employer_id uuid, user_id uuid, status text, can_manage_pipeline boolean, assigned_job_ids uuid[]);
  create table public.notifications (id serial primary key, user_id uuid, title text, link text);
  create table public.blocked_applicants (id serial primary key, employer_id uuid not null, candidate_id uuid not null, email text, phone text, reason text, unique (employer_id, candidate_id));
  create table public.applicant_notes (id serial primary key, application_id uuid references public.applications(id) on delete cascade, body text);
  create table public.interviews (id serial primary key, application_id uuid references public.applications(id) on delete cascade);
  create table public.documents (id uuid primary key default gen_random_uuid(), application_id uuid references public.applications(id) on delete cascade, file_url text);
  create table public.document_requests (id serial primary key, application_id uuid references public.applications(id) on delete cascade);
  create table public.messages (id serial primary key, application_id uuid references public.applications(id) on delete set null, content text);

  insert into public.profiles values ('${ANA}', '${ANA}/profile-cv.pdf', null);
  insert into public.jobs values ('${JOB}', '${OWNER}', 'Chat agent'), ('${OTHER_JOB}', '${OTHER_OWNER}', 'Phone agent'), ('${OWNER_JOB2}', '${OWNER}', 'Email agent');
  insert into public.applications values
    ('${APP}', '${JOB}', '${ANA}', '${ANA}/1700000000000.pdf', '{"answers":{"q1":"${ANA}/1700000000001_q1.pdf"},"cv":"${ANA}/profile-cv.pdf"}'),
    ('${ANA_OTHER}', '${OTHER_JOB}', '${ANA}', '${ANA}/1700000000009.pdf', '{"answers":{"q1":"${ANA}/1700000000001_q1.pdf"}}'),
    ('${BEN_APP}', '${JOB}', '40000000-0000-4000-8000-000000000011', null, null),
    ('${SECOND}', '${JOB}', '40000000-0000-4000-8000-000000000012', null, null),
    ('${THIRD}', '${OWNER_JOB2}', '40000000-0000-4000-8000-000000000013', null, null);
  insert into public.team_members (employer_id, user_id, status, can_manage_pipeline, assigned_job_ids) values
    ('${OWNER}', '${MANAGER}', 'active', true, null),
    ('${OWNER}', '${VIEWER}', 'active', false, null),
    ('${OWNER}', '${LEFT}', 'removed', true, null),
    ('${OWNER}', '${ONLY_JOB2}', 'active', true, array['${OWNER_JOB2}']::uuid[]);
  insert into public.blocked_applicants (employer_id, candidate_id, email, phone, reason) values
    ('${OWNER}', '${ANA}', 'ana@x.example', '09171234567', 'No-show twice'),
    ('${OTHER_OWNER}', '${ANA}', 'ana@x.example', null, 'Elsewhere'),
    ('${OWNER}', '40000000-0000-4000-8000-000000000012', 'sec@x.example', null, 'Kept while another application remains');
  insert into public.applications values ('42000000-0000-4000-8000-000000000006', '${OWNER_JOB2}', '40000000-0000-4000-8000-000000000012', null, null);
  insert into public.notifications (user_id, title, link) values
    ('${OWNER}', 'Ana finished', '/applicants/${APP}'),
    ('${MANAGER}', 'Ana finished', '/applicants/${APP}?tab=tests'),
    ('${OWNER}', 'Ben finished', '/applicants/${BEN_APP}'),
    ('${ANA}', 'Your application', '/applications/${APP}'),
    ('${OTHER_OWNER}', 'Not theirs to lose', '/applicants/${APP}');
  insert into public.applicant_notes (application_id, body) values ('${APP}', 'Strong'), ('${BEN_APP}', 'Keep');
  insert into public.interviews (application_id) values ('${APP}');
  insert into public.documents (id, application_id, file_url) values ('43000000-0000-4000-8000-000000000001', '${APP}', 'https://x.supabase.co/storage/v1/object/sign/documents/${OWNER}/offer.pdf?token=t');
  insert into public.document_requests (application_id) values ('${APP}');
  insert into public.messages (application_id, content) values ('${APP}', 'Hello Ana'), ('${BEN_APP}', 'Hello Ben');
`);
await db.exec(read("supabase/migrations/20261025170000_remove_applicant.sql"));
await db.exec(read("supabase/migrations/20261025180000_remove_applicant_review.sql"));
await db.exec(read("supabase/migrations/20261025220000_remove_applicant_help_review2.sql"));

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
check("a teammate who manages applicants on another job only: refused (the Phase 5 review)", (await remove(APP, ONLY_JOB2))?.reason === "not_allowed");
check("nothing was removed by any refusal", (await count(`select count(*)::int as n from public.applications`)) === 6 && (await count(`select count(*)::int as n from private.applicant_removals`)) === 0);
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
check("it names the application's documents by id only, never by the file address the business wrote", Array.isArray(done.documents) && done.documents.length === 1 && done.documents[0].id === "43000000-0000-4000-8000-000000000001" && !("file" in done.documents[0]) && !JSON.stringify(done).includes("offer.pdf"), JSON.stringify(done.documents));
check("the team's notifications about Ana go (owner and teammate, with or without a query)", (await count(`select count(*)::int as n from public.notifications where link like '/applicants/${APP}%' and user_id in ('${OWNER}', '${MANAGER}')`)) === 0);
check("…Ana's own notifications stay (her account is not touched), as do the team's about Ben", (await count(`select count(*)::int as n from public.notifications where user_id = '${ANA}'`)) === 1 && (await count(`select count(*)::int as n from public.notifications where link = '/applicants/${BEN_APP}'`)) === 1);
check("her block with this business goes too, once no application of hers is left there (the second Phase 5 review)", (await count(`select count(*)::int as n from public.blocked_applicants where employer_id = '${OWNER}' and candidate_id = '${ANA}'`)) === 0);
check("…her block with another business stays", (await count(`select count(*)::int as n from public.blocked_applicants where employer_id = '${OTHER_OWNER}' and candidate_id = '${ANA}'`)) === 1);
check("…and another business's notifications are never touched", (await count(`select count(*)::int as n from public.notifications where user_id = '${OTHER_OWNER}'`)) === 1);
check("it says what Ana still uses elsewhere: her profile's resume and her other application", done.other_refs.includes(`${ANA}/profile-cv.pdf`) && done.other_refs.includes(`${ANA}/1700000000009.pdf`) && done.other_refs.includes(`${ANA}/1700000000001_q1.pdf`));
check("removing it again: not found", (await remove(APP, OWNER))?.reason === "not_found");

console.log("\nA teammate who manages applicants\n");
check("may remove one", (await remove(SECOND, MANAGER))?.ok === true && (await count(`select count(*)::int as n from private.applicant_removals where removed_by = '${MANAGER}'`)) === 1);
check("one assigned to a job may remove an applicant to that job", (await remove(THIRD, ONLY_JOB2))?.ok === true);
check("a block stays while the person still has another application with the business", (await count(`select count(*)::int as n from public.blocked_applicants where candidate_id = '40000000-0000-4000-8000-000000000012'`)) === 1);

console.log("\nFiles storage would not delete yet (storage_file_trash)\n");
{
  const queue = async (values) => {
    try {
      await db.query(`insert into public.storage_file_trash (bucket, path, folder, starts_with) values ($1, $2, $3, $4)`, values);
      return true;
    } catch {
      return false;
    }
  };
  check("a plain file path is queued", await queue(["videos", `${ANA}/${APP}-intro.webm`, null, null]));
  check("…a folder and a name prefix too", await queue(["portfolios", null, ANA, `${APP}-`]));
  for (const [why, values] of [
    ["a path that climbs (..)", ["resumes", `${ANA}/../${STRANGER}/cv.pdf`, null, null]],
    ["a path from the root", ["resumes", `/${ANA}/cv.pdf`, null, null]],
    ["an empty segment", ["resumes", `${ANA}//cv.pdf`, null, null]],
    ["a bucket the removal never uses (the ID papers)", ["requested-documents", `${ANA}/id.jpg`, null, null]],
    ["both a path and a folder", ["videos", `${ANA}/x.webm`, ANA, null]],
    ["neither", ["videos", null, null, null]],
    ["a prefix with a slash", ["videos", null, ANA, "../x"]],
  ]) check(`refused: ${why}`, !(await queue(values)));
  let blocked = false;
  try {
    await db.exec(`set role authenticated; select * from public.storage_file_trash;`);
  } catch {
    blocked = true;
  } finally {
    await db.exec(`reset role;`);
  }
  check("nobody but the system reads or writes the queue", blocked);
}

console.log("\nWhich files are deleted (remove-applicant/files.ts)\n");
const toRemove = FILES.resumeFilesToRemove(ANA, done.resume_url, done.notes, done.other_refs);
check("the resume uploaded for this application goes", toRemove.includes(`${ANA}/1700000000000.pdf`), JSON.stringify(toRemove));
check("a form file another application of hers still uses stays", !toRemove.includes(`${ANA}/1700000000001_q1.pdf`));
check("her profile's resume stays, even when this application pointed at it", !toRemove.includes(`${ANA}/profile-cv.pdf`));
check("nothing outside her own folder is ever named", toRemove.every((p) => p.startsWith(`${ANA}/`)));
const sneaky = FILES.resumeFilesToRemove(ANA, null, `{"q":"${ANA}/../${STRANGER}/cv.pdf","r":"${ANA}//x.pdf","s":"${ANA}/folder/"}`, "");
check("a path in her answers that climbs out of her folder (..), or is not a plain file, is never deleted", sneaky.length === 0, JSON.stringify(sneaky));
check("a storage link is read as its path in the bucket", FILES.storagePathIn(`https://x.supabase.co/storage/v1/object/sign/documents/documents/abc/final.pdf?token=1`, "documents") === "documents/abc/final.pdf" && FILES.storagePathIn("uid/file.pdf", "resumes") === "uid/file.pdf" && FILES.storagePathIn("https://elsewhere.test/file.pdf", "resumes") === null && FILES.storagePathIn("", "resumes") === null);

const fn = read("supabase/functions/remove-applicant/index.ts");
check("the function takes the actor from the sign-in, never the request", /const caller = await requireSignedInUser\(req, corsHeaders\);/.test(fn) && /p_actor: caller\.userId/.test(fn) && !/body\.actor|body\.userId/.test(fn));
check("files go only after the database removed the application", fn.indexOf('admin.rpc("remove_applicant"') > 0 && fn.indexOf('admin.rpc("remove_applicant"') < fn.indexOf("removeAll(storage, "));
check("each kind of file is removed on its own, so one that throws is queued whole and never stops the rest (the second Phase 5 review)", /const step = async \(fallback: Leftover, work: \(\) => Promise<number>\) =>/.test(fn) && /leftovers\.push\(fallback\)/.test(fn) && /for \(const leftover of leftovers\) \{[\s\S]*queueablePath\(leftover\.path \?\? leftover\.folder\)[\s\S]*attempt <= 3/.test(fn) && /filesLeft: leftovers\.length/.test(fn));
check("a document's files are found by its id only (documents/<id>/), never by its file address (the Phase 5 review)", /for \(const id of documentIdsOf\(result\.documents\)\) \{\s*await step\(\{ bucket: "documents", folder: `documents\/\$\{id\}` \}, async \(\) =>\s*removeAll\(storage, "documents", await listNames\(storage, "documents", `documents\/\$\{id\}`/.test(fn) && !/doc\.file|storagePathIn\(/.test(fn));
check("only a path the retry queue accepts is queued, one at a time (the third Phase 5 review: one bad row kept every file out)", FILES.queueablePath("uid/app-video.webm") && !FILES.queueablePath("a".repeat(501)) && !FILES.queueablePath("uid/../x") && !FILES.queueablePath("/uid/x") && !FILES.queueablePath("uid//x") && !FILES.queueablePath(null));
check("a path in the notes is read at most 400 characters long", FILES.resumeFilesToRemove(ANA, null, `${ANA}/${"a".repeat(600)}.pdf`, "").every((p) => p.length <= ANA.length + 401));
check("…and documentIdsOf keeps only real ids", JSON.stringify(FILES.documentIdsOf([{ id: "43000000-0000-4000-8000-000000000001", file: "x" }, { id: "../x" }, { id: 5 }, null, { id: "43000000-0000-4000-8000-000000000001" }])) === JSON.stringify(["43000000-0000-4000-8000-000000000001"]));
check("a file storage would not delete is queued for the hourly retry, and the answer says how many", /\.from\("storage_file_trash"\)\.insert\(/.test(fn) && /filesQueued/.test(fn));
const cleanup = read("supabase/functions/document-cleanup/index.ts");
check("a failed read (ID papers or either queue) tells the platform admins in the app, once a day (the scheduler's history would not show it)", /error \? `the ID-paper requests/.test(cleanup) && /trashError \?/.test(cleanup) && /leftoverError \?/.test(cleanup) && /if \(unread\.length > 0\) \{\s*await tell\("read", "ID papers are not being deleted"/.test(cleanup));
check("…\"told today\" is the server's own record, never a card in a bell that a client may write (the eighth Phase 5 review)", /admin\.rpc\("claim_daily_alert", \{ p_alert: `cleanup:\$\{key\}` \}\)/.test(cleanup) && /if \(first !== true\) return;/.test(cleanup) && !/from\("notifications"\)\s*\.select/.test(cleanup));
check("…and a failed read is never counted as a failed delete", /failed: 0 \};/.test(cleanup) && !/failed: error \? 1 : 0/.test(cleanup));
check("a signed address loses its token and a list splits at the next path (the fifth Phase 5 review)", (() => { const got = FILES.resumeFilesToRemove(ANA, null, JSON.stringify({ q: `https://x.supabase.co/storage/v1/object/sign/resumes/${ANA}/1.pdf?token=abc`, r: `${ANA}/a.pdf, ${ANA}/b.pdf` }), ""); return got.includes(`${ANA}/1.pdf`) && got.includes(`${ANA}/a.pdf`) && got.includes(`${ANA}/b.pdf`) && !got.some((p) => /token|, /.test(p)); })());
check("…while a name with a comma or an '&' stays whole, an encoded one is read both ways (the sixth), and a '#page=2' fragment is no part of a name (the seventh: storage keys hold no '#')", (() => { const got = FILES.resumeFilesToRemove(ANA, null, JSON.stringify({ a: `${ANA}/1700_q1.CV, final`, b: `${ANA}/1700_q2.Smith & Co`, c: `${ANA}/1700_q3.pdf#page=2`, d: `https://x.supabase.co/storage/v1/object/sign/resumes/${ANA}/1700_Scan%202026?token=z` }), ""); return [`${ANA}/1700_q1.CV, final`, `${ANA}/1700_q2.Smith & Co`, `${ANA}/1700_q3.pdf`, `${ANA}/1700_Scan 2026`].every((p) => got.includes(p)) && !got.some((p) => p.includes("#")); })());
check("…even with a stray \"%\" elsewhere and an accented name encoded in small letters (the eighth)", (() => { const mine = `${ANA}/1700_Résumé.pdf`; const got = FILES.resumeFilesToRemove(ANA, mine, "", JSON.stringify({ note: "Scored 100% on typing", other: `https://x.supabase.co/storage/v1/object/sign/resumes/${ANA}/1700_R%c3%a9sum%c3%a9.pdf?token=y` })); return !got.includes(mine); })());
check("a file another application still uses stays, even when one side stored it encoded (the seventh)", (() => { const enc = `https://x.supabase.co/storage/v1/object/sign/resumes/${ANA}/1700_Scan%202026`; const got = FILES.resumeFilesToRemove(ANA, null, JSON.stringify({ d: `${enc}?token=z` }), JSON.stringify({ other: `${enc}?token=y` })); return !got.some((p) => p.includes("1700_Scan")); })());
check("a file name with a space is still found in the notes ('Scan 2026')", FILES.resumeFilesToRemove(ANA, null, JSON.stringify({ q: `${ANA}/1700_Scan 2026` }), "").includes(`${ANA}/1700_Scan 2026`));
check("document-cleanup tries the fewest-tried notes first, and a failed ID-papers read never skips the queue", /\.order\("attempts", \{ ascending: true \}\)/.test(cleanup) && !/return json\(\{ error: "read_failed" \}, 500\)/.test(cleanup));
check("document-cleanup retries the queue, plain paths in the known buckets only, and drops a note only once its files are gone", /\.from\("storage_file_trash"\)[\s\S]*REMOVAL_BUCKETS\.has\(bucket\)[\s\S]*\.remove\(paths\)[\s\S]*\.from\("storage_file_trash"\)\.delete\(\)/.test(cleanup) && /attempts: Number\(note\.attempts \?\? 0\) \+ 1/.test(cleanup));

console.log("\nOn the applicant's page\n");
const menu = read("src/cockpit/components/ApplicantRowMenu.tsx");
check("the ⋯ menu offers 'Delete their information', only to whoever may decide", /if \(!canDecide\) return items;[\s\S]*key: "delete", label: "Delete their information"/.test(menu));
check("…confirmed in a dialog that says it cannot be undone and that messages and their account stay", /Delete \$\{who\}'s information\?/.test(menu) && /It cannot be undone\./.test(menu) && /Their messages stay in Messages, the signing record of any document they signed is kept, and their own account is not touched\./.test(menu) && /confirmLabel="Delete for good"/.test(menu));
check("…offered for a blocked applicant too (the Phase 5 review: only Unblock was left)", /if \(blocked && closed\) \{[\s\S]{0,120}items\.push\(unblock, deleteItem\);/.test(menu));
const hook = read("src/cockpit/hooks/useRemoveApplicant.ts");
check("the page says when some files are still being removed (retried hourly)", /filesQueued/.test(hook) && /tried again every hour/.test(hook));
check("the page asks the function, never deletes rows itself", /functions\.invoke\("remove-applicant"/.test(hook) && !/\.from\("applications"\)[\s\S]{0,40}\.delete\(/.test(hook + menu));
check("the profile goes back to the list once they are deleted", /request\.kind === "block" \|\| request\.kind === "delete"\) && ok\) goBack\(\);/.test(read("src/cockpit/pages/CandidateDetail.tsx")));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
