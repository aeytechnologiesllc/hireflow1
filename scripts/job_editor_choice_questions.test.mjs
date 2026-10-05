#!/usr/bin/env node
/**
 * The job editor (/jobs/edit/:id, src/pages/CreateJob.tsx) can edit "Pick one"
 * and "Pick several" application questions, and opening and saving a job never
 * changes a question the owner did not touch.
 *
 * On 2026-10-05 the live Zulu chat-agent job had four `select` questions (q5-q8,
 * the shift, hours, computer and English questions) and a `tel` phone question
 * (q3). The editor's Type dropdown had no `select` at all and no way to edit the
 * choices: opening q5 showed a blank Type, and the owner could not turn the
 * shift question into a pick-several one.
 *
 * These checks run the real rules: the `#region application-question-editor`
 * block of CreateJob.tsx, with its types stripped (Node 24's
 * module.stripTypeScriptTypes). A few source checks then prove the dialog and
 * the job save actually use those rules.
 *
 * Run with: node scripts/job_editor_choice_questions.test.mjs
 * Against another copy of the file (e.g. to see the old one fail):
 *   CREATE_JOB_FILE=/path/to/CreateJob.tsx node scripts/job_editor_choice_questions.test.mjs
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
const START = "// #region application-question-editor";
const END = "// #endregion application-question-editor";
const start = source.indexOf(START);
const end = source.indexOf(END);

if (start < 0 || end < start) {
  console.log(`  FAIL  ${path.relative(ROOT, FILE)} has no "${START}" block: the editor has no choice-question rules`);
  process.exit(1);
}

const EXPORTS = [
  "APPLICATION_QUESTION_TYPE_OPTIONS",
  "MIN_CHOICE_OPTIONS",
  "MAX_CHOICE_OPTIONS",
  "editorQuestionType",
  "isChoiceQuestionType",
  "questionTypeLabel",
  "cleanChoiceOptions",
  "choiceQuestionProblem",
  "applicationQuestionsProblem",
  "withQuestionType",
  "finalizeEditedQuestion",
  "moveChoiceOption",
];
const block = source.slice(start, end);
const js = `${stripTypeScriptTypes(block, { mode: "strip" })}\nexport { ${EXPORTS.join(", ")} };\n`;
const rules = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const {
  APPLICATION_QUESTION_TYPE_OPTIONS,
  MAX_CHOICE_OPTIONS,
  editorQuestionType,
  isChoiceQuestionType,
  questionTypeLabel,
  choiceQuestionProblem,
  applicationQuestionsProblem,
  withQuestionType,
  finalizeEditedQuestion,
  moveChoiceOption,
} = rules;

// The live job's application_questions, read from production on 2026-10-05
// (job 02f91311-a3a4-461c-a52d-5893cef7a9f3). Pinned here word for word.
const LIVE_QUESTIONS = [
  { id: "q1", type: "text", question: "Full name", required: true, placeholder: "Your full name" },
  { id: "q2", type: "email", question: "Email address", required: true, placeholder: "you@example.com" },
  { id: "q3", type: "tel", question: "Phone number (WhatsApp if you have it)", required: true, placeholder: "Include your country code" },
  { id: "q4", type: "text", question: "Country and city you will work from", required: true, placeholder: "For example: Lahore, Pakistan" },
  {
    id: "q5", type: "select", required: true,
    question: "Which shift can you cover, in US Eastern time?",
    options: ["Daytime, 8am to 4pm Eastern", "Evening, 4pm to midnight Eastern", "Overnight, midnight to 8am Eastern", "Any shift, including weekends"],
  },
  { id: "q6", type: "select", required: true, question: "How many hours a week can you work?", options: ["Under 20", "20 to 30", "30 to 40", "40 or more"] },
  { id: "q7", type: "select", required: true, question: "Do you have your own computer and a reliable internet connection for chat work?", options: ["Yes", "No"] },
  {
    id: "q8", type: "select", required: true, question: "How would you rate your written English?",
    options: ["Native or fluent", "Strong, I write in English every day for work", "Conversational", "Basic"],
  },
  { id: "q9", type: "textarea", required: true, question: "Describe any customer support or chat support experience you have (apps, games, call centers, online shops).", placeholder: "Where, for how long, and what kind of problems you handled" },
  { id: "q10", type: "textarea", required: true, question: "Why do you want this job, and what makes you good with upset people?", placeholder: "A few honest sentences" },
  { id: "q11", type: "textarea", required: false, question: "Have you ever played or supported online sweepstakes or social casino games (for example Golden Dragon, Fire Kirin, Juwa)? Tell us what you know.", placeholder: "Optional" },
];
const clone = (value) => JSON.parse(JSON.stringify(value));
const offered = new Set(APPLICATION_QUESTION_TYPE_OPTIONS.map((option) => option.value));

console.log("\nThe Type dropdown offers both choice types, in the owner's words");
assert(questionTypeLabel("select") === "Pick one", '"select" reads "Pick one"');
assert(questionTypeLabel("multi_select") === "Pick several", '"multi_select" reads "Pick several"');
assert(offered.has("select") && offered.has("multi_select"), "both are in the dropdown");

console.log("\nEvery question on the live job opens with a Type, never a blank");
for (const question of LIVE_QUESTIONS) {
  const label = questionTypeLabel(question.type);
  // One of the dropdown's own entries, or (for a type the form does not know,
  // like the live q3's `tel` on 2026-10-05) shown as itself through the
  // dialog's extra item.
  const ok = offered.has(editorQuestionType(question.type)) || label === question.type;
  assert(ok && label.length > 0, `${question.id} (${question.type}) is shown as "${label}"`);
}
assert(isChoiceQuestionType("select") && isChoiceQuestionType("multi_select"), "select and multi_select are choice questions");
assert(isChoiceQuestionType("dropdown") && isChoiceQuestionType("checkboxes"), "the spellings the form accepts for them are too");
assert(!isChoiceQuestionType("tel") && !isChoiceQuestionType("textarea"), "phone and long text are not");

console.log("\nThe editor names each stored type the way the application form reads it");
/** `case "a": case "b": return "c";` pairs of one switch, as alias -> type. */
function switchAliases(text) {
  const map = new Map();
  for (const group of text.matchAll(/((?:case\s+"[^"]+":\s*(?:\/\/[^\n]*\n\s*)*)+)return\s+"([^"]+)";/g)) {
    for (const alias of group[1].matchAll(/case\s+"([^"]+)":/g)) map.set(alias[1], group[2]);
  }
  return map;
}
const FORM_FILE = process.env.FORM_FILE || path.join(ROOT, "src/pages/ApplicationFormPhase.tsx");
const formSource = await readFile(FORM_FILE, "utf8").catch(() => null);
if (formSource == null) {
  console.log(`  skip  ${path.relative(ROOT, FORM_FILE)} not found`);
} else {
  const formStart = formSource.indexOf("const normalizeQuestionType");
  const formBody = formStart >= 0 ? formSource.slice(formStart, formSource.indexOf("\n};", formStart)) : "";
  const editorStart = block.indexOf("function editorQuestionType");
  const editorBody = block.slice(editorStart, block.indexOf("\n}", editorStart));
  const formMap = switchAliases(formBody);
  const editorMap = switchAliases(editorBody);
  assert(formMap.size > 0, `read ${formMap.size} type spellings from the form's normalizeQuestionType`);
  // Fails: the editor would name a field the applicant does not get.
  for (const [alias, type] of editorMap) {
    const formType = formMap.has(alias) ? formMap.get(alias) : alias;
    assert(formType === type, `the editor's "${alias}" -> "${type}" is what the form draws ("${formType}")`);
  }
  // Only a note: a spelling the form learns first is shown by the editor as
  // itself ("tel") and saved unchanged, so the form can land it on its own.
  // Add the same case to editorQuestionType when it does.
  for (const [alias, type] of formMap) {
    if (editorMap.has(alias)) continue;
    if (editorQuestionType(alias) === type) continue;
    console.log(`  note  the form reads "${alias}" as "${type}"; the editor shows it as "${editorQuestionType(alias)}" until editorQuestionType learns it`);
  }
}

console.log("\nOpening and saving the live job leaves every question exactly as it was");
assert(applicationQuestionsProblem(clone(LIVE_QUESTIONS)) === null, "the live questions pass the save check");
for (const question of LIVE_QUESTIONS) {
  const saved = finalizeEditedQuestion(clone(question));
  assert(isDeepStrictEqual(saved, question), `${question.id}: dialog opened and saved unchanged writes the same object`);
}
// Picking the type it already shows changes nothing.
assert(withQuestionType(clone(LIVE_QUESTIONS[2]), "tel").type === "tel", 'the "tel" question keeps "tel" unless the owner picks a type');
// Since 2026-10-05 the form and the editor both read "tel" as Phone, so the
// dropdown already shows Phone for it and picking Phone changes nothing.
assert(editorQuestionType("tel") === "phone", 'the editor shows the live "tel" question as Phone');
assert(withQuestionType(clone(LIVE_QUESTIONS[2]), "phone").type === "tel", "picking Phone, which it already shows, leaves the stored type alone");
assert(withQuestionType(clone(LIVE_QUESTIONS[4]), "select").options.length === 4, "picking Pick one on q5 keeps its 4 choices");

console.log("\nThe shift question can become Pick several without retyping its choices");
const q5 = clone(LIVE_QUESTIONS[4]);
const several = finalizeEditedQuestion(withQuestionType(q5, "multi_select"));
assert(several.type === "multi_select", "q5 becomes multi_select");
assert(isDeepStrictEqual(several.options, LIVE_QUESTIONS[4].options), "with the same 4 choices in the same order");
assert(several.question === q5.question && several.required === true && several.id === "q5", "and nothing else on it changes");
const reworded = { ...several, options: [...several.options.slice(0, 3), "Weekends (Saturday and Sunday)"] };
assert(choiceQuestionProblem(reworded) === null, '"Any shift, including weekends" can be replaced by "Weekends (Saturday and Sunday)"');

console.log("\nA new choice question starts with room for two choices and cannot be saved empty");
const fresh = withQuestionType({ id: "q99", type: "text", question: "New Question", required: true, placeholder: "Enter your answer" }, "select");
assert(Array.isArray(fresh.options) && fresh.options.length === 2, "switching Text -> Pick one gives two empty choice fields");
assert(/at least 2/.test(choiceQuestionProblem(fresh) || ""), "two blank choices are refused");
assert(/at least 2/.test(choiceQuestionProblem({ type: "select", options: ["Yes", "   "] }) || ""), "a whitespace-only choice does not count");
assert(/at least 2/.test(choiceQuestionProblem({ type: "multi_select" }) || ""), "a pick-several question with no options at all is refused");
const filled = finalizeEditedQuestion({ ...fresh, options: ["  Yes ", "", "No"] });
assert(isDeepStrictEqual(filled.options, ["Yes", "No"]), "Save trims choices and drops blanks, keeping the order");
assert(filled.placeholder === "Enter your answer", "the rest of the question is kept");

console.log("\n2 to 8 choices, no duplicates");
const nine = Array.from({ length: 9 }, (_, i) => `Choice ${i + 1}`);
assert(MAX_CHOICE_OPTIONS === 8, "the cap is 8");
assert(choiceQuestionProblem({ type: "select", options: nine.slice(0, 8) }) === null, "8 choices are fine");
assert(/at most 8/.test(choiceQuestionProblem({ type: "select", options: nine }) || ""), "9 are refused");
assert(/twice/.test(choiceQuestionProblem({ type: "multi_select", options: ["Weekends", "weekends "] }) || ""), "the same choice twice is refused");
assert(choiceQuestionProblem({ type: "text" }) === null, "a text question has no choice rules");

console.log("\nThe job save names the question that is wrong");
const broken = clone(LIVE_QUESTIONS);
broken[5] = { ...broken[5], options: ["Under 20"] };
const message = applicationQuestionsProblem(broken) || "";
assert(message.startsWith("Application question 6"), `names it by number: ${message}`);
assert(message.includes("How many hours a week can you work?"), "and by its text");

console.log("\nSwitching away from a choice type");
const toText = withQuestionType(clone(LIVE_QUESTIONS[6]), "text");
assert(Array.isArray(toText.options), "keeps the choices on the draft (a mis-tap back loses nothing)");
assert(isDeepStrictEqual(withQuestionType(toText, "select").options, ["Yes", "No"]), "switching back restores them");
assert(!("options" in finalizeEditedQuestion(toText)), "saving it as Text drops the unused choices");

console.log("\nReordering choices");
const order = ["A", "B", "C"];
assert(isDeepStrictEqual(moveChoiceOption(order, 1, "up"), ["B", "A", "C"]), "up swaps with the one above");
assert(isDeepStrictEqual(moveChoiceOption(order, 1, "down"), ["A", "C", "B"]), "down swaps with the one below");
assert(isDeepStrictEqual(moveChoiceOption(order, 0, "up"), order), "the first cannot move up");
assert(isDeepStrictEqual(moveChoiceOption(order, 2, "down"), order), "the last cannot move down");
assert(isDeepStrictEqual(order, ["A", "B", "C"]), "the original list is never mutated");

console.log("\nThe page uses these rules");
const outside = source.slice(0, start) + source.slice(end);
assert(/options\?: string\[\];/.test(source.slice(source.indexOf("interface ApplicationQuestion"), source.indexOf("interface QuizQuestion"))),
  "ApplicationQuestion declares options?: string[]");
assert(/APPLICATION_QUESTION_TYPE_OPTIONS\.map\(/.test(outside), "the Type dropdown is drawn from APPLICATION_QUESTION_TYPE_OPTIONS");
assert(/value=\{editorQuestionType\(editingQuestion\.type\)\}/.test(outside), "the dropdown shows editorQuestionType(), so `select`/`tel` are never blank");
assert(/withQuestionType\(editingQuestion,/.test(outside), "picking a type goes through withQuestionType()");
assert(/choiceQuestionProblem\(editingQuestion\)/.test(outside) && /finalizeEditedQuestion\(editingQuestion\)/.test(outside),
  "the dialog's Save checks and finalizes the question");
assert(/applicationQuestionsProblem\(applicationQuestions\)/.test(outside), "saving the job checks every application question");
const handleSubmit = outside.slice(outside.indexOf("const handleSubmit = async"), outside.indexOf("const jobData = {"));
assert(handleSubmit.includes("applicationQuestionsProblem(applicationQuestions)"), "that check runs inside handleSubmit, before the job row is built");

// /jobs/edit/:id used to show the whole screening plan read-only, so the
// application questions (and this dialog) could not be reached on a live job.
const readOnlyAt = outside.indexOf("Screening Plan (Read Only)");
const editBranchEnd = outside.indexOf(") : (", readOnlyAt);
const editBranch = readOnlyAt >= 0 && editBranchEnd > readOnlyAt ? outside.slice(readOnlyAt, editBranchEnd) : "";
assert(editBranch.includes("{applicationQuestionsSection}"), "the edit screen (/jobs/edit/:id) shows the editable application questions card");
assert((outside.match(/\{applicationQuestionsSection\}/g) || []).length >= 2, "and the create screen still shows the same card");

// ---------------------------------------------------------------------------
// Saving an edit writes only what the owner changed (#region job-edit-save).
// Until 2026-10-05 the edit screen wrote the whole row back, and the load is
// lossy, so a one-question edit of the live job would have turned its 8 skills
// into 9 and could have stored "(worldwide)" as its city.
console.log("\nAn edit writes only the columns the owner changed");
const SAVE_START = "// #region job-edit-save";
const SAVE_END = "// #endregion job-edit-save";
const saveStart = source.indexOf(SAVE_START);
const saveEnd = source.indexOf(SAVE_END);
if (saveStart < 0 || saveEnd < saveStart) {
  assert(false, `${path.relative(ROOT, FILE)} has a "${SAVE_START}" block (what an edit writes back)`);
} else {
  const SAVE_EXPORTS = [
    "JOB_EDIT_FIELD_COLUMNS",
    "changedJobEditColumns",
    "pickJobColumns",
    "splitListKeepingItems",
    "fromGoogleSalaryPeriod",
    "toGoogleSalaryPeriod",
  ];
  const saveBlock = source.slice(saveStart, saveEnd);
  const saveJs = `${stripTypeScriptTypes(saveBlock, { mode: "strip" })}\nexport { ${SAVE_EXPORTS.join(", ")} };\n`;
  const save = await import(`data:text/javascript;base64,${Buffer.from(saveJs).toString("base64")}`);

  // The live job's other columns, read from production on 2026-10-05.
  const LIVE_SKILLS = [
    "Fluent written English", "Fast, accurate typing", "De-escalation", "Attention to detail",
    "Chat support", "Following money rules", "Clear explanations", "Reliability",
  ];
  const LIVE_BENEFITS = ["Fully remote", "Scheduled shifts you choose from", "Paid training on our games and tools"];
  // What the load effect puts in the form for that row (skills joined with ", ").
  const loaded = {
    title: "Customer Support Chat Agent (Zulu Royal & Zulu Rush)",
    description: "Answer players in chat.",
    requirements: "", responsibilities: "",
    location: "Remote (worldwide)", job_type: "full-time", experience_level: "entry", department: "Player Support",
    salary_type: "fixed", salary_period: save.fromGoogleSalaryPeriod("YEAR"), salary_min: "", salary_max: "", salary_fixed: "",
    salary_currency: "USD",
    skills_required: LIVE_SKILLS.join(", "), benefits: LIVE_BENEFITS.join(", "),
    application_deadline: null,
    status: "published",
    application_questions: clone(LIVE_QUESTIONS), quiz_questions: [], workflow_steps: [],
    workflow_difficulty: "medium", processing_mode: "auto", passing_score: 60, required_wpm: 45,
  };

  const untouched = save.changedJobEditColumns(loaded, clone(loaded));
  assert(untouched.size === 0, "opening the live job and saving it untouched writes no column at all");

  const editedQuestions = clone(LIVE_QUESTIONS);
  editedQuestions[4] = finalizeEditedQuestion(withQuestionType(editedQuestions[4], "multi_select"));
  const q5Only = save.changedJobEditColumns(loaded, { ...clone(loaded), application_questions: editedQuestions });
  assert(isDeepStrictEqual([...q5Only], ["application_questions"]), `turning q5 into Pick several writes application_questions only (got ${[...q5Only].join(", ")})`);
  const row = { title: "x", skills_required: ["a"], location_city: "(worldwide)", application_questions: editedQuestions, status: "published" };
  assert(isDeepStrictEqual(Object.keys(save.pickJobColumns(row, q5Only)), ["application_questions"]), "and the update carries that column alone");

  const draft = save.changedJobEditColumns(loaded, { ...clone(loaded), status: "draft" });
  assert(isDeepStrictEqual([...draft], ["status"]), "Save Draft on the live job changes status only");
  const moved = save.changedJobEditColumns(loaded, { ...clone(loaded), location: "Lahore, Pakistan" });
  assert(moved.has("location") && moved.has("location_city") && moved.has("latitude") && moved.has("is_remote") && !moved.has("title"),
    "a new location writes the location columns (and is_remote), nothing else");
  const typed = save.changedJobEditColumns(loaded, { ...clone(loaded), job_type: "part-time" });
  assert(typed.has("is_remote") && typed.has("job_type") && !typed.has("location_city"), "a new job type re-works is_remote but never re-geocodes");
  const pay = save.changedJobEditColumns(loaded, { ...clone(loaded), salary_currency: "EUR" });
  assert(isDeepStrictEqual([...pay], ["salary_currency"]), "a new currency writes salary_currency only");
  assert(save.changedJobEditColumns({ ...loaded, application_deadline: new Date("2026-11-01T00:00:00Z") },
    { ...loaded, application_deadline: new Date("2026-11-01T00:00:00Z") }).size === 0, "the same deadline (a new Date object) is not a change");

  console.log("\nSkills and benefits survive the editor");
  const oldSplit = LIVE_SKILLS.join(", ").split(",").map((item) => item.trim()).filter(Boolean);
  assert(oldSplit.length === 9, `the old split turned the 8 live skills into ${oldSplit.length} (the corruption the review found)`);
  assert(isDeepStrictEqual(save.splitListKeepingItems(LIVE_SKILLS.join(", "), LIVE_SKILLS), LIVE_SKILLS), "the live skills split back into the same 8");
  assert(isDeepStrictEqual(save.splitListKeepingItems(`${LIVE_SKILLS.join(", ")}, Patience`, LIVE_SKILLS), [...LIVE_SKILLS, "Patience"]),
    'adding "Patience" keeps "Fast, accurate typing" one skill');
  assert(isDeepStrictEqual(save.splitListKeepingItems("A, B,, C ,", []), ["A", "B", "C"]), "with nothing to keep it is the plain comma split it was");
  assert(isDeepStrictEqual(save.splitListKeepingItems("Fast, accurate typing", ["Fast,  accurate typing"]), ["Fast, accurate typing"]),
    "spacing around the comma does not matter");
  assert(isDeepStrictEqual(save.splitListKeepingItems(LIVE_BENEFITS.join(", "), LIVE_BENEFITS), LIVE_BENEFITS), "the live benefits split back into the same 3");

  console.log("\nThe pay period loads as stored");
  for (const [stored, form] of [["YEAR", "yearly"], ["MONTH", "monthly"], ["HOUR", "hourly"], [null, "yearly"]]) {
    assert(save.fromGoogleSalaryPeriod(stored) === form, `${stored} loads as ${form}`);
  }
  for (const stored of ["YEAR", "MONTH", "HOUR"]) {
    assert(save.toGoogleSalaryPeriod(save.fromGoogleSalaryPeriod(stored)) === stored, `${stored} saves back as ${stored}`);
  }

  console.log("\nThe page saves an edit through these rules");
  const outsideSave = source.slice(0, saveStart) + source.slice(saveEnd);
  const literalStart = outsideSave.indexOf("const jobData = {");
  const literal = literalStart >= 0 ? outsideSave.slice(literalStart, outsideSave.indexOf("\n      };", literalStart)) : "";
  const builtColumns = [...literal.matchAll(/^\s{8}([a-z_]+):/gm)].map((match) => match[1]);
  const listed = new Set(Object.values(save.JOB_EDIT_FIELD_COLUMNS).flat());
  assert(builtColumns.length >= 20, `read ${builtColumns.length} columns from handleSubmit's job row`);
  const unlisted = builtColumns.filter((column) => !listed.has(column));
  assert(unlisted.length === 0, `every column the job row builds can be saved on an edit${unlisted.length ? ` (missing: ${unlisted.join(", ")})` : ""}`);
  const submit = outsideSave.slice(outsideSave.indexOf("const handleSubmit = async"), outsideSave.indexOf("const handleSaveCompanyNameAndContinue"));
  assert(/updateJob\.mutateAsync\(\{ id, \.\.\.pickJobColumns\(jobData, columns\), status \}\)/.test(submit),
    "the edit sends pickJobColumns(jobData, …), never the whole row");
  assert(!/updateJob\.mutateAsync\(\{ id, \.\.\.jobData \}\)/.test(submit), "the whole-row update is gone");
  assert(/changedJobEditColumns\(loadedEditFields,/.test(submit), "the changed columns are worked out against the job as loaded");
  assert(/needsGeocode \? await geocodePlace/.test(submit) && /editedColumns\.has\("location_city"\)/.test(submit),
    "an unchanged location is never geocoded again");
  assert(/parseCommaSeparatedList\(formData\.skills_required, existingJob\?\.skills_required/.test(submit), "skills keep the job's own items whole");
  assert(/loadedEditFieldsRef\.current = \{ \.\.\.loadedForm, \.\.\.loadedWorkflow, status: existingJob\.status \}/.test(outsideSave),
    "the load effect keeps the snapshot it filled the form from");
  assert(/salary_period: fromGoogleSalaryPeriod\(existingJob\.salary_period\)/.test(outsideSave), "the edit form loads the stored pay period");
  assert(/existingJob\?\.status === "published" \? setConfirmUnpublishOpen\(true\)/.test(outsideSave),
    "Save Draft on a published job asks before taking it off the careers page");
  assert(/isEditMode \? setQuestionPendingDelete\(q\) : deleteQuestion\(q\.id\)/.test(outsideSave), "deleting a question on the edit screen asks first");
}

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("All checks passed");
