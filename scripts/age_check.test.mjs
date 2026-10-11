#!/usr/bin/env node
/**
 * "Are you 18 or older?" (2026-10-11): src/lib/ageCheck.ts,
 * supabase/migrations/*_age_check.sql.
 *
 * The owner asked for date of birth; the Philippine law (RA 10911) forbids
 * asking age or birth date during an application, so every application now
 * starts with one yes/no question instead.
 *
 *   - the question is first on every job, once, and never in a job's own list;
 *   - the form: "No" hides the rest, shows the message, and nothing is sent;
 *   - the applicant's page lists "18 or older" first under At a glance;
 *   - nothing anywhere asks for a birth date or an age;
 *   - the database refuses to send an application that answered "No".
 */
import { registerHooks } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = pathToFileURL(path.join(ROOT, "src", specifier.slice(2))).href;
      for (const suffix of [".ts", ".tsx", "/index.ts"]) {
        try {
          return nextResolve(base + suffix, context);
        } catch {
          // try the next spelling
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    passed++;
    console.log(`  ok  - ${name}`);
  } else {
    failed++;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
};
const show = (v) => JSON.stringify(v);
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");

/* ── The rule ─────────────────────────────────────────────────────────── */

const A = await import(pathToFileURL(path.join(ROOT, "src/lib/ageCheck.ts")).href);
check("the question is a yes/no pick", A.AGE_QUESTION.question === "Are you 18 or older?" && show(A.AGE_QUESTION.options) === show(["Yes", "No"]) && A.AGE_QUESTION.required === true);
check("its short name is \"18 or older\"", A.AGE_QUESTION.label === "18 or older");
const jobQs = [{ id: "q1", question: "Full name" }, { id: "q2", question: "Phone" }];
const listed = A.withAgeQuestion(jobQs);
check("it comes first, before the job's own questions", listed[0].id === A.AGE_QUESTION_ID && show(listed.slice(1).map((q) => q.id)) === show(["q1", "q2"]), show(listed.map((q) => q.id)));
check("the job's own list is not changed", jobQs.length === 2 && jobQs[0].id === "q1");
check("never twice, even if a job holds it", A.withAgeQuestion([{ id: A.AGE_QUESTION_ID, question: "x" }, ...jobQs]).filter((q) => q.id === A.AGE_QUESTION_ID).length === 1);
check("a job with no questions still asks it", A.withAgeQuestion(null).length === 1 && A.withAgeQuestion(undefined)[0].id === A.AGE_QUESTION_ID);
check("only \"No\" stops the form", A.isUnderAgeAnswer("No") && A.isUnderAgeAnswer(" no ") && !A.isUnderAgeAnswer("Yes") && !A.isUnderAgeAnswer("") && !A.isUnderAgeAnswer(undefined));
check("the stored answer is read by its id", A.storedAgeAnswer([{ questionId: "q1", answer: "No" }, { questionId: A.AGE_QUESTION_ID, answer: "Yes" }]) === "Yes");
check("no stored answer (applied before the question) reads as none", A.storedAgeAnswer([{ questionId: "q1", answer: "x" }]) === null && A.storedAgeAnswer(null) === null);
check("the message says why, without a date or an age to give", /18 and over/.test(A.UNDER_AGE_MESSAGE) && !/birth|how old/i.test(A.UNDER_AGE_MESSAGE));

/* ── The form ─────────────────────────────────────────────────────────── */

const form = await read("src/pages/ApplicationFormPhase.tsx");
check("the form's questions are the job's with the age question first", /withAgeQuestion\(\s*Array\.isArray\(application\?\.jobs\?\.application_questions\)/.test(form));
check("\"No\" is read from the age answer", /const underAge = isUnderAgeAnswer\(answers\[AGE_QUESTION_ID\]\)/.test(form));
check("\"No\": only the age question stays in the list", /if \(underAge && question\.id !== AGE_QUESTION_ID\) return false;/.test(form));
check("\"No\": the message shows in place of the rest", /\{underAge && \(\s*<UnderAgeStop/.test(form) && /\{UNDER_AGE_MESSAGE\}/.test(form));
check("\"No\": resume, cover letter and Continue are hidden", /\{!underAge && \(<>[\s\S]*Resume Upload[\s\S]*Cover Letter[\s\S]*onClick=\{handleSubmit\}[\s\S]*<\/>\)\}/.test(form));
check("\"No\": nothing is sent, even if Continue were reached", /\/\/ Never sent with "No"[^\n]*\n\s*if \(underAge\) return;/.test(form) && /if \(underAge\) errors\[AGE_QUESTION_ID\]/.test(form));
check("\"Close this application\" removes their own unsent application", /from\("applications"\)\.delete\(\)\.eq\("id", id\)\.select\("id"\)/.test(form) && /Close this application/.test(form));
check("a mistake can be undone (the answer stays changeable)", /Picked No by mistake\? Choose Yes above\./.test(form));
check("the answer is saved with the others (questions.map over the list that holds it)", /const applicationAnswers = questions\.map\(q =>/.test(form));

/* ── The business's view ─────────────────────────────────────────────── */

const detail = await read("src/cockpit/pages/CandidateDetail.tsx");
check("At a glance lists \"18 or older\" first", /atAGlance\(withAgeQuestion\(/.test(detail));
const P = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/applicantProfile.ts")).href);
const glance = P.atAGlance(A.withAgeQuestion([{ id: "shift", question: "Can you work the shift?", type: "select", options: ["Yes", "No"], label: "Can work the shift" }]), [
  { questionId: A.AGE_QUESTION_ID, question: "Are you 18 or older?", answer: "Yes", type: "select" },
  { questionId: "shift", question: "Can you work the shift?", answer: "Yes", type: "select" },
]);
check("At a glance: \"18 or older: Yes\" above the job's rows", glance[0]?.label === "18 or older" && glance[0]?.values?.[0]?.text === "Yes" && glance[1]?.label === "Can work the shift", show(glance.map((r) => r.label)));
const older = P.atAGlance(A.withAgeQuestion([{ id: "shift", question: "Can you work the shift?", type: "select", options: ["Yes", "No"] }]), [
  { questionId: "shift", question: "Can you work the shift?", answer: "Yes", type: "select" },
]);
check("someone who applied before the question shows no age row", older.length === 1 && older[0].label !== "18 or older");
const slipped = P.atAGlance(A.withAgeQuestion([]), [{ questionId: A.AGE_QUESTION_ID, question: "Are you 18 or older?", answer: "No", type: "select" }]);
check("a \"No\" that got through is flagged \"Under 18\"", slipped[0]?.flag === "Under 18" && slipped[0]?.values?.[0]?.flagged === true, show(slipped));
const record = await read("src/cockpit/lib/assessmentRecord.ts");
check("a draft shows the age answer once it is given", /draft\[AGE_QUESTION_ID\] != null \? \(withAgeQuestion\(jobQuestions\)/.test(record));

/* ── Never a birth date ───────────────────────────────────────────────── */

const builders = ["src/lib/jobFromFlow.ts", "src/lib/avaJobGeneration.ts", "src/lib/ageCheck.ts", "src/pages/ApplicationFormPhase.tsx"];
for (const rel of builders) {
  const text = (await read(rel)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check(`${rel} asks no birth date or age`, !/date of birth|birth ?date|\bdob\b|how old are you|your age\b/i.test(text));
}

/* ── The database ─────────────────────────────────────────────────────── */

const names = (await readdir(path.join(ROOT, "supabase/migrations"))).filter((n) => /^\d+_age_check\.sql$/.test(n));
check("one age_check migration", names.length === 1, show(names));
const sql = await readFile(path.join(ROOT, "supabase/migrations", names[0]), "utf8");

const db = new PGlite();
await db.exec(`
  create schema auth;
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant anon to postgres; grant authenticated to postgres; grant service_role to postgres;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create type public.application_status as enum ('pending','reviewing','interview','offered','hired','rejected','in_progress');
  create table public.applications (id uuid primary key, candidate_id uuid, status public.application_status default 'in_progress', notes text);
  alter table public.applications enable row level security;
  create policy own_read on public.applications for select to authenticated using (auth.uid() = candidate_id);
  create policy own_update on public.applications for update to authenticated using (auth.uid() = candidate_id) with check (auth.uid() = candidate_id);
  grant select, update on public.applications to authenticated;
`);
await db.exec(sql);

const ME = "20000000-0000-4000-8000-000000000001";
const answers = (age) => JSON.stringify({ applicationAnswers: [
  ...(age ? [{ questionId: "age_18_plus", question: "Are you 18 or older?", answer: age, type: "select" }] : []),
  { questionId: "q1", question: "Full name", answer: "Ana", type: "text" },
] });
async function asMe(statement) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${ME}', false);`);
  try {
    await db.query(statement);
    return "ok";
  } catch (e) {
    return String(e.message || e);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const status = async (id) => (await db.query(`select status::text as s from public.applications where id = $1`, [id])).rows[0]?.s;
const seed = async (id, notes) => db.query(`insert into public.applications (id, candidate_id, status, notes) values ($1, $2, 'in_progress', $3)`, [id, ME, notes]);

const NO = "50000000-0000-4000-8000-000000000001";
const YES = "50000000-0000-4000-8000-000000000002";
const OLD = "50000000-0000-4000-8000-000000000003";
const DRAFT = "50000000-0000-4000-8000-000000000004";
await seed(NO, null);
await seed(YES, null);
await seed(OLD, null);
await seed(DRAFT, null);

const refused = await asMe(`update public.applications set notes = '${answers("No")}', status = 'pending' where id = '${NO}'`);
check("\"No\" cannot be sent", /under_18/.test(refused) && (await status(NO)) === "in_progress", refused);
const sentYes = await asMe(`update public.applications set notes = '${answers("Yes")}', status = 'pending' where id = '${YES}'`);
check("\"Yes\" is sent", sentYes === "ok" && (await status(YES)) === "pending", sentYes);
const sentOld = await asMe(`update public.applications set notes = '${answers(null)}', status = 'pending' where id = '${OLD}'`);
check("no answer (a form from before the question) is sent as before", sentOld === "ok" && (await status(OLD)) === "pending", sentOld);
const kept = await asMe(`update public.applications set notes = '${answers("No")}' where id = '${DRAFT}'`);
check("saving answers while still filling in is never refused", kept === "ok" && (await status(DRAFT)) === "in_progress", kept);
const sneak = await asMe(`update public.applications set status = 'reviewing' where id = '${DRAFT}'`);
check("\"No\" cannot jump to any other stage either", /under_18/.test(sneak) && (await status(DRAFT)) === "in_progress", sneak);
await db.query(`update public.applications set status = 'rejected' where id = $1`, [DRAFT]);
check("the business can still decline it", (await status(DRAFT)) === "rejected");
await db.query(`update public.applications set notes = $2 where id = $1`, [YES, answers("No")]);
check("an application already sent is not touched by a later edit", (await status(YES)) === "pending");
const fn = async (v) => (await db.query(`select public.application_says_under_18($1) as x`, [v])).rows[0].x;
check("plain-text or empty notes never read as under 18", (await fn(null)) === false && (await fn("hello")) === false && (await fn("{not json")) === false && (await fn("{}")) === false);
check("\" no \" in any case reads as under 18", (await fn(JSON.stringify({ applicationAnswers: [{ questionId: "age_18_plus", answer: " NO " }] }))) === true);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
