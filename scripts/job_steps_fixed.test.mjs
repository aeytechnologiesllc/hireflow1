#!/usr/bin/env node
/**
 * Once anyone has applied to a job, its application questions, quiz and steps
 * stay as they were (the twentieth Phase 5 review, 2026-10-27;
 * supabase/migrations/20261025730000_applicants_words_stay_as_applied.sql).
 *
 *   1. src/lib/jobStepsFixed.ts reads the database's refusal (HINT
 *      job_steps_fixed, or its words) and nothing else, and the editor's
 *      message is the database's own, word for word.
 *   2. The editor (src/pages/CreateJob.tsx) shows the questions read-only
 *      once the job has applications: no Add, no move, no Edit, no Delete,
 *      and the one line saying why and what to do instead; a refused save
 *      says the same. Until then the questions stay editable on the edit
 *      screen, and the tests stay read-only as before.
 *
 * The database side is proved in launch_locks_behaviour sections 28 and 29.
 *
 * Run with: node scripts/job_steps_fixed.test.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${String(detail).slice(0, 400)})` : ""}`);
  }
}

const lib = await import(path.join(ROOT, "src/lib/jobStepsFixed.ts"));
const migration = read("supabase/migrations/20261025730000_applicants_words_stay_as_applied.sql");

console.log("\n1. The refusal, read\n");
{
  const raised = /RAISE EXCEPTION '((?:[^']|'')*)'\s+USING ERRCODE = 'check_violation', HINT = 'job_steps_fixed';/.exec(migration);
  const dbWords = raised ? raised[1].replace(/''/g, "'") : null;
  check("the editor's message is the database's own, word for word", dbWords === lib.JOB_STEPS_FIXED_MESSAGE, dbWords);
  check("…and it says what to do instead (Copy to drafts)", /Copy to drafts on the Jobs page/.test(lib.JOB_STEPS_FIXED_MESSAGE) && /Copy to drafts on the Jobs page/.test(lib.JOB_STEPS_FIXED_NOTE));
  // As PostgREST hands the error to the browser.
  check("the refusal is known by its hint", lib.isJobStepsFixedError({ code: "23514", message: "x", hint: "job_steps_fixed" }) === true);
  check("…or by its words", lib.isJobStepsFixedError({ code: "23514", message: lib.JOB_STEPS_FIXED_MESSAGE, hint: null }) === true);
  check(
    "…and nothing else is",
    [null, undefined, "job_steps_fixed", new Error("Failed"), { hint: "email_not_verified", message: "Confirm your email" }, { hint: "business_suspended" }].every((e) => lib.isJobStepsFixedError(e) === false),
  );
}

console.log("\n2. The editor\n");
{
  const editor = read("src/pages/CreateJob.tsx").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").replace(/\s+/g, " ");
  const at = editor.indexOf("const applicationQuestionsSection = (");
  const card = at >= 0 ? editor.slice(at, editor.indexOf("</Card>", at)) : "";
  check("it knows when the job has applications (drafts included)", /const \{ data: stepsFixed = false \} = useJobHasApplications\(isEditMode \? id : undefined\);/.test(editor) && /const questionsLocked = isEditMode && stepsFixed;/.test(editor));
  check("…then Add Question is gone", /\{!questionsLocked && \( <Button variant="outline" size="sm" onClick=\{addNewQuestion\}/.test(card));
  check("…and so are moving a question, editing it and deleting it", /\{!questionsLocked && \( <div className="flex shrink-0 flex-col gap-1">/.test(card) && /\{!questionsLocked && \( <div className="flex shrink-0 gap-1 sm:opacity-0/.test(card) && (card.match(/moveQuestion\(/g) ?? []).length === 2 && /setEditingQuestion\(q\)/.test(card));
  check("…with the one line saying why and what to do", /\{questionsLocked && \( <p className="text-sm text-muted-foreground" data-steps-fixed> \{JOB_STEPS_FIXED_NOTE\} <\/p> \)\}/.test(card));
  check("…while nobody has applied, the edit screen says the questions stay once someone does", /\{isEditMode && !questionsLocked && "\. Once someone applies, they stay as they are\."\}/.test(card));
  check("the read-only plan says the questions stay too, once people have applied", /People have applied, so the application questions stay as they are too\./.test(editor) && /The tests and their order cannot be changed after the job is created\./.test(editor));
  check("a refused save says so in the database's words", /if \(isJobStepsFixedError\(error\)\) \{ toast\.error\(JOB_STEPS_FIXED_MESSAGE\);/.test(editor));
  // The save sends only what changed, so a save of unchanged step words sends none of them (and the database takes the same words again).
  check("an edit sends only the columns whose fields changed, with the status", /const columns = editedColumns \?\? new Set<string>\(\);/.test(editor) && /await updateJob\.mutateAsync\(\{ id, \.\.\.pickJobColumns\(jobData, columns\), status \}\);/.test(editor));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
