#!/usr/bin/env node
/**
 * The job editor (src/pages/CreateJob.tsx) offers the computer and connection
 * check (docs/EQUIPMENT-CHECK.md §2) as "Computer and connection check", stores
 * it on the job under the candidate's title "Your computer and connection",
 * and edits its three bars — min_download_mbps, min_upload_mbps,
 * max_latency_ms, the names connection-test and the staff record read — on
 * the step's own config, with the live job's defaults 10 / 3 / 200.
 *
 * These checks run the real rules: the `#region equipment-check-step` block
 * of CreateJob.tsx with its types stripped (Node 24's
 * module.stripTypeScriptTypes), then the `#region job-edit-save` block to
 * prove an edit of a bar writes `workflow_steps` and nothing else. A few
 * source checks then prove the picker, the step card and the save use them.
 *
 * Run with: node scripts/job_editor_equipment_step.test.mjs
 * Against another copy of the file:
 *   CREATE_JOB_FILE=/path/to/CreateJob.tsx node scripts/job_editor_equipment_step.test.mjs
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { stripTypeScriptTypes } from "node:module";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

// fileURLToPath, not URL.pathname: the repo folder has a space in its name.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = process.env.CREATE_JOB_FILE || path.join(ROOT, "src/pages/CreateJob.tsx");

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  ok    ${message}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  }
}

const source = await readFile(FILE, "utf8");

/** A `#region <name>` block of the page, with its types stripped, as a module. */
async function region(name, exports) {
  const START = `// #region ${name}`;
  const END = `// #endregion ${name}`;
  const start = source.indexOf(START);
  const end = source.indexOf(END);
  if (start < 0 || end < start) {
    console.log(`  FAIL  ${path.relative(ROOT, FILE)} has no "${START}" block`);
    process.exit(1);
  }
  const block = source.slice(start, end);
  const js = `${stripTypeScriptTypes(block, { mode: "strip" })}\nexport { ${exports.join(", ")} };\n`;
  return { block, rules: await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`) };
}

const { block, rules } = await region("equipment-check-step", [
  "EQUIPMENT_CHECK_DEFAULT_CONFIG",
  "EQUIPMENT_CHECK_BAR_FIELDS",
  "cleanEquipmentCheckBar",
  "equipmentCheckBars",
  "equipmentCheckBarToStore",
]);
const { EQUIPMENT_CHECK_DEFAULT_CONFIG, EQUIPMENT_CHECK_BAR_FIELDS, cleanEquipmentCheckBar, equipmentCheckBars, equipmentCheckBarToStore } = rules;

console.log("\nThe defaults are the live job's own numbers (docs/EQUIPMENT-CHECK.md §2)");
assert(isDeepStrictEqual(EQUIPMENT_CHECK_DEFAULT_CONFIG, { min_download_mbps: 10, min_upload_mbps: 3, max_latency_ms: 200 }), "10 Mbps down, 3 Mbps up, 200 ms");
assert(
  isDeepStrictEqual(EQUIPMENT_CHECK_BAR_FIELDS.map((f) => f.key), ["min_download_mbps", "min_upload_mbps", "max_latency_ms"]),
  "the editor has one field per bar, in the contract's order, under the contract's names",
);
assert(EQUIPMENT_CHECK_BAR_FIELDS.every((f) => /Mbps|ms/.test(f.unit) && f.label.length > 0 && f.min > 0 && f.max > f.min), "every field has words, a unit and a range");

console.log("\nReading a step's config");
assert(isDeepStrictEqual(equipmentCheckBars({ min_download_mbps: 25, min_upload_mbps: 10, max_latency_ms: 100 }), { min_download_mbps: 25, min_upload_mbps: 10, max_latency_ms: 100 }), "a full config reads as stored");
assert(isDeepStrictEqual(equipmentCheckBars({ min_upload_mbps: 5 }), { min_download_mbps: 10, min_upload_mbps: 5, max_latency_ms: 200 }), "a missing bar reads as its default");
assert(isDeepStrictEqual(equipmentCheckBars({}), EQUIPMENT_CHECK_DEFAULT_CONFIG) && isDeepStrictEqual(equipmentCheckBars(null), EQUIPMENT_CHECK_DEFAULT_CONFIG), "no config at all reads as the defaults");
assert(isDeepStrictEqual(equipmentCheckBars({ min_download_mbps: 0, min_upload_mbps: -3, max_latency_ms: "abc" }), EQUIPMENT_CHECK_DEFAULT_CONFIG), "0, a negative or garbage reads as the default, never as 0");
assert(equipmentCheckBars({ min_download_mbps: "25" }).min_download_mbps === 25, "a bar stored as text still reads");
assert(!isDeepStrictEqual(equipmentCheckBars({ min_download_mbps: 25 }), EQUIPMENT_CHECK_DEFAULT_CONFIG) && EQUIPMENT_CHECK_DEFAULT_CONFIG.min_download_mbps === 10, "reading never changes the defaults themselves");

console.log("\nA typed value becomes a bar");
assert(cleanEquipmentCheckBar("min_download_mbps", "25") === 25, 'typing "25" stores 25');
assert(cleanEquipmentCheckBar("min_upload_mbps", 4.6) === 5, "a decimal is rounded to a whole number");
assert(cleanEquipmentCheckBar("max_latency_ms", "150") === 150, "latency in ms");
assert(cleanEquipmentCheckBar("min_download_mbps", "") === null && cleanEquipmentCheckBar("min_download_mbps", "   ") === null, "a blank field is not a bar (the default applies)");
assert(cleanEquipmentCheckBar("min_download_mbps", "fast") === null && cleanEquipmentCheckBar("min_download_mbps", null) === null, "words and nothing are not a bar");
assert(cleanEquipmentCheckBar("min_download_mbps", 0) === null && cleanEquipmentCheckBar("min_download_mbps", -5) === null, "0 and a negative are not a bar: no job asks for no connection");
assert(cleanEquipmentCheckBar("min_download_mbps", 0.4) === 1, "a tiny positive value is held at the field's floor");
assert(cleanEquipmentCheckBar("min_download_mbps", 99999) === 1000 && cleanEquipmentCheckBar("max_latency_ms", 1) === 10, "a value past the range is held at its edge");
assert(cleanEquipmentCheckBar("not_a_bar", 5) === null, "an unknown key is refused");
assert(equipmentCheckBarToStore("min_upload_mbps", "") === 3 && equipmentCheckBarToStore("min_upload_mbps", "7") === 7, "what is stored is the cleaned bar, or the default for a cleared field");

console.log("\nThe page offers the step and edits its bars on the step's own config");
const outside = source.slice(0, source.indexOf("// #region equipment-check-step")) + source.slice(source.indexOf("// #endregion equipment-check-step"));
const info = outside.slice(outside.indexOf("const STEP_TYPE_INFO"), outside.indexOf("type ReviewEditorField"));
const entry = info.slice(info.indexOf("equipment_check: {"), info.indexOf("typing_test: {"));
assert(entry.length > 0, "STEP_TYPE_INFO has an equipment_check entry, listed first");
assert(/label: "Computer and connection check"/.test(entry), 'the picker calls it "Computer and connection check"');
assert(/candidateTitle: "Your computer and connection"/.test(entry), 'the candidate\'s title stored on the job is "Your computer and connection"');
assert(/hasConfig: true/.test(entry), "it is marked as having config");
const candidateCopy = [...entry.matchAll(/candidate(?:Title|Description): "([^"]*)"/g)].map((m) => m[1]).join(" ");
assert(candidateCopy.length > 0 && !/\b(Ava|AI|automated|algorithm|scor(?:e|ing|ed)|grad(?:e|ing|ed))\b/i.test(candidateCopy), "the candidate's title and description never name Ava, AI, automation, scoring or grading");
assert(/type === 'equipment_check'\s*\?\s*\{ \.\.\.EQUIPMENT_CHECK_DEFAULT_CONFIG \}/.test(outside), "Add Step gives the new step the default bars as its config");
assert(/type === 'equipment_check'\)\s*\{[^}]*newRegularSteps\.unshift\(newStep\)/.test(outside), "Add Step puts it first among the workflow steps (docs/EQUIPMENT-CHECK.md §2)");
// One editor for the bars (renderEquipmentCheckBars), drawn in the step card
// while a job is created AND on the edit page, where the tests and their
// order stay locked but the bars are the job's to change (§2).
const editorStart = outside.indexOf("const renderEquipmentCheckBars = (step: WorkflowStep) => {");
const card = editorStart < 0 ? "" : outside.slice(editorStart, outside.indexOf("\n  };\n", editorStart));
assert(card.length > 0, "the page has one editor for the connection check's bars");
assert(/step\.type === 'equipment_check' && renderEquipmentCheckBars\(step\)/.test(outside), "the step card draws it");
const editPage = outside.slice(outside.indexOf("Screening Plan (Read Only)"), outside.indexOf("{applicationQuestionsSection}", outside.indexOf("Screening Plan (Read Only)")));
assert(
  /\.filter\(\(step\) => step\.type === 'equipment_check'\)[\s\S]*renderEquipmentCheckBars\(step\)/.test(editPage),
  "and so does the edit page, for the job's own connection check, beside the locked plan",
);
assert(/const bars = equipmentCheckBars\(step\.config\)/.test(card), "the card reads the bars off step.config");
assert(/EQUIPMENT_CHECK_BAR_FIELDS\.map\(/.test(card), "it draws one field per bar");
assert(/updateWorkflowStepConfig\(step\.id, field\.key, equipmentCheckBarToStore\(field\.key, e\.target\.value\)\)/.test(card), "a typed value goes through updateWorkflowStepConfig onto the step's config (never page-level state)");
assert(!/setRequiredWpm|required_wpm/.test(card), "the typing slider's page-level state is not reused");
assert(!/\b(Ava|AI)\b/.test(card.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")), "the card's words do not lean on Ava for a measurement the server makes");

console.log("\nSaving an edit still writes only what changed (#region job-edit-save)");
const save = (await region("job-edit-save", ["JOB_EDIT_FIELD_COLUMNS", "changedJobEditColumns", "pickJobColumns"])).rules;
const clone = (value) => JSON.parse(JSON.stringify(value));
const connectionStep = { id: "step_connection", type: "equipment_check", title: "Your computer and connection", description: "A short speed test on the computer you will work from", required: true, config: { ...EQUIPMENT_CHECK_DEFAULT_CONFIG } };
const loaded = {
  title: "Customer Support Chat Agent",
  description: "Answer players in chat.",
  requirements: "", responsibilities: "",
  location: "Remote (worldwide)", job_type: "full-time", experience_level: "entry", department: "Player Support",
  salary_type: "fixed", salary_period: "yearly", salary_min: "", salary_max: "", salary_fixed: "", salary_currency: "USD",
  skills_required: "Chat support", benefits: "Fully remote", application_deadline: null, status: "published",
  application_questions: [], quiz_questions: [],
  workflow_steps: [connectionStep, { id: "step_typing", type: "typing_test", title: "Typing speed and accuracy", description: "", required: true, config: { min_wpm: 45 } }],
  workflow_difficulty: "medium", processing_mode: "auto", passing_score: 60, required_wpm: 45,
};
assert(save.changedJobEditColumns(loaded, clone(loaded)).size === 0, "opening a job with the step and saving it untouched writes no column at all");
const raised = clone(loaded);
raised.workflow_steps[0].config = { ...raised.workflow_steps[0].config, min_upload_mbps: equipmentCheckBarToStore("min_upload_mbps", "5") };
const columns = save.changedJobEditColumns(loaded, raised);
assert(isDeepStrictEqual([...columns], ["workflow_steps"]), `raising the upload bar to 5 writes workflow_steps only (got ${[...columns].join(", ")})`);
const row = { title: "x", required_wpm: 45, workflow_steps: raised.workflow_steps, status: "published" };
const picked = save.pickJobColumns(row, columns);
assert(isDeepStrictEqual(Object.keys(picked), ["workflow_steps"]), "and the update carries that column alone");
assert(picked.workflow_steps[0].config.min_upload_mbps === 5 && picked.workflow_steps[0].config.min_download_mbps === 10, "with the new bar beside the untouched ones");
assert(save.JOB_EDIT_FIELD_COLUMNS.workflow_steps.includes("workflow_steps"), "workflow_steps is a column an edit may write");

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("All checks passed");
