#!/usr/bin/env node
/**
 * "Copy to drafts" and "New job" starting from a job you already have
 * (docs/JOB-COPY.md): src/lib/jobCopy.ts, src/hooks/useJobCopy.ts,
 * src/cockpit/components/NewJobDialog.tsx and their wiring on the Jobs page.
 *
 * The owner, 2026-10-07: "I like this job, right? So I want to be able to add
 * that to the draft and then that way I can pull it, use the same job later."
 * These checks prove:
 *  - every column of public.jobs is either carried to a copy or left out on
 *    purpose: a column added later fails here until someone decides which;
 *  - a copy is a draft with the whole job in it (the post, pay, place, the
 *    form, the tests WITH their answers, the steps and settings) and nothing
 *    of the original's life (its id, owner, link, code, dates, deadline);
 *  - the copy never changes the job it was made from;
 *  - the chooser's order and words;
 *  - the wiring: the copy reads the answers or stops, writes only through the
 *    ordinary create path, and is offered only to whoever may create a job.
 *
 * Run with: node scripts/job_copy.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// Decoded, so a checkout whose path has a space in it works too.
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

const C = await import(pathToFileURL(path.join(ROOT, "src/lib/jobCopy.ts")).href);
const K = await import(pathToFileURL(path.join(ROOT, "src/lib/quizAnswerKeys.ts")).href);

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
const show = (v) => JSON.stringify(v);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");
/** Source with its comments taken out: a pin must not pass on a comment. */
const code = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── 1. Every column is accounted for ──────────────────────────────────── */

console.log("\n1. Every column of public.jobs is carried or left out on purpose");
{
  const types = await read("src/integrations/supabase/types.ts");
  const block = /\n {6}jobs: \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/.exec(types)?.[1] ?? "";
  const columns = [...block.matchAll(/^ {10}([a-z_0-9]+)\??:/gm)].map((m) => m[1]);
  check("the database types list the jobs columns", columns.length >= 30 && columns.includes("title") && columns.includes("workflow_steps"), `${columns.length} found`);

  const carried = new Set(C.JOB_COPY_COLUMNS);
  const left = new Set(C.JOB_COPY_LEFT_OUT);
  const unknown = columns.filter((c) => !carried.has(c) && !left.has(c));
  check("no column is in neither list (decide: does a copy carry it?)", unknown.length === 0, unknown.join(", "));
  const gone = [...carried, ...left].filter((c) => !columns.includes(c));
  check("neither list names a column that is not there any more", gone.length === 0, gone.join(", "));
  const both = [...carried].filter((c) => left.has(c));
  check("no column is in both lists", both.length === 0, both.join(", "));
  check("no column is listed twice", carried.size === C.JOB_COPY_COLUMNS.length && left.size === C.JOB_COPY_LEFT_OUT.length);

  for (const c of ["title", "description", "requirements", "responsibilities", "application_questions", "quiz_questions", "workflow_steps", "passing_score", "required_wpm", "processing_mode", "salary_min", "salary_max", "location"]) {
    if (!carried.has(c)) check(`a copy carries ${c}`, false);
  }
  check("a copy carries the post, the form, the tests, the steps and the pay", ["title", "description", "application_questions", "quiz_questions", "workflow_steps", "passing_score", "salary_min", "location"].every((c) => carried.has(c)));
  for (const c of ["id", "employer_id", "status", "job_code", "slug", "created_at", "updated_at", "application_deadline"]) {
    if (!left.has(c)) check(`a copy leaves ${c} behind`, false);
  }
  check("a copy leaves behind who the job is: id, owner, link, code, dates", ["id", "employer_id", "status", "job_code", "slug", "created_at", "updated_at", "application_deadline"].every((c) => left.has(c)));
}

/* ── 2. What a copy is ─────────────────────────────────────────────────── */

console.log("\n2. A copy");
const STORED = {
  id: "job-1",
  employer_id: "owner-1",
  title: "  Chat Support Team Leader  ",
  description: "Lead a team of chat agents.",
  requirements: "Two years leading a team.",
  responsibilities: null,
  department: "Support",
  experience_level: "senior",
  skills_required: ["coaching", "chat"],
  benefits: [],
  job_type: "full-time",
  salary_min: 500,
  salary_max: 500,
  salary_currency: "USD",
  salary_period: "MONTH",
  location: "Remote (worldwide)",
  location_city: null,
  location_region: null,
  location_country: null,
  location_country_code: null,
  latitude: null,
  longitude: null,
  locations: null,
  is_remote: true,
  application_questions: [{ id: "q1", question: "Phone / WhatsApp", type: "phone", required: true }],
  // As stored: the answers live in job_quiz_keys, not on the row.
  quiz_questions: [
    { id: "k1", question: "A customer asks for a refund you cannot give. What first?", options: ["Refuse", "Acknowledge and explain", "Transfer"] },
    { question: "Second question, with no id of its own", options: ["A", "B"] },
  ],
  workflow_steps: [
    { id: "step_connection", type: "equipment_check", title: "Your computer and connection", config: { minDownloadMbps: 10 } },
    { id: "step_quiz_2", type: "quiz", title: "Policy check", config: { questions: [{ id: "p1", question: "Which is allowed?", options: ["X", "Y"] }] } },
    { id: "step_chat", type: "chat_simulation", title: "Chat practice", config: { scenario: "A late order.", passingScore: 60 } },
  ],
  workflow_difficulty: "medium",
  processing_mode: "auto",
  passing_score: 70,
  required_wpm: 45,
  require_resume: false,
  exclude_from_feed: true,
  status: "published",
  job_code: "ZULU-7F3K",
  slug: "team-lead",
  created_at: "2026-10-04T10:00:00Z",
  updated_at: "2026-10-06T09:00:00Z",
  application_deadline: "2026-10-20T00:00:00Z",
  ai_bias_score: 0.2,
  ai_bias_feedback: "Fine.",
};
const KEYS = [
  { step_id: "__quiz_questions__", question_id: "k1", key: { correct_answer: 1 } },
  { step_id: "__quiz_questions__", question_id: "__idx_1", key: { correctAnswer: "B" } },
  { step_id: "step_quiz_2", question_id: "p1", key: { correct_answers: [1], fit_context: "Y is the policy." } },
];
{
  const before = show(STORED);
  const whole = K.mergeQuizAnswerKeys(STORED, KEYS);
  const copy = C.jobCopyPayload(whole);
  check("is a draft", copy?.status === "draft");
  check("keeps the title (tidied) and the description", copy?.title === "Chat Support Team Leader" && copy?.description === STORED.description);
  const carriedOk = C.JOB_COPY_COLUMNS.filter((c) => c !== "title" && c !== "quiz_questions" && c !== "workflow_steps").every((c) => eq(copy?.[c], STORED[c]));
  check("carries every other column exactly as it stands (nulls, empty lists and false included)", carriedOk, C.JOB_COPY_COLUMNS.filter((c) => !eq(copy?.[c], whole[c])).join(", "));
  check("…so a setting that is off stays off", copy?.require_resume === false && copy?.exclude_from_feed === true && copy?.is_remote === true);
  const leaked = C.JOB_COPY_LEFT_OUT.filter((c) => c !== "status" && c in (copy ?? {}));
  check("has nothing of the original's life: no id, owner, link, code, dates or deadline", leaked.length === 0, leaked.join(", "));
  check("has exactly the carried columns and its status", eq(Object.keys(copy ?? {}).sort(), [...C.JOB_COPY_COLUMNS, "status"].sort()));

  // The tests come with their answers, or they could never be marked.
  const quiz = copy?.quiz_questions ?? [];
  check("the skills check keeps its questions", quiz.length === 2 && quiz[0].question === STORED.quiz_questions[0].question);
  check("…WITH the right answers (by id, and by position where a question has none)", quiz[0]?.correct_answer === 1 && quiz[1]?.correctAnswer === "B", show(quiz));
  const stepQuiz = (copy?.workflow_steps ?? []).find((s) => s.id === "step_quiz_2");
  check("a quiz step keeps its answers too", eq(stepQuiz?.config?.questions?.[0]?.correct_answers, [1]) && stepQuiz?.config?.questions?.[0]?.fit_context === "Y is the policy.", show(stepQuiz));
  check("every step comes across, in order, with its settings", eq((copy?.workflow_steps ?? []).map((s) => s.id), ["step_connection", "step_quiz_2", "step_chat"]) && copy?.workflow_steps?.[2]?.config?.passingScore === 60 && copy?.workflow_steps?.[0]?.config?.minDownloadMbps === 10);
  check("the job it was made from is not changed", show(STORED) === before);
  check("…and neither are its stored questions (no answers written back onto them)", STORED.quiz_questions[0].correct_answer === undefined && STORED.workflow_steps[1].config.questions[0].correct_answers === undefined);

  // Without the keys the questions would be copied bare: the hook stops instead (section 5).
  const bare = C.jobCopyPayload(STORED);
  check("copied without its answers, a quiz has none: which is why the hook refuses to", bare?.quiz_questions?.[0]?.correct_answer === undefined);

  // A narrower row: a column that is not there is left to the database.
  const narrow = C.jobCopyPayload({ title: "Host", description: "Greet people.", workflow_steps: [] });
  check("a column the row does not have is not written at all", eq(Object.keys(narrow ?? {}).sort(), ["description", "status", "title", "workflow_steps"]), show(Object.keys(narrow ?? {})));
  check("nothing to copy: no row, no title, or no description", C.jobCopyPayload(null) === null && C.jobCopyPayload({ title: " ", description: "x" }) === null && C.jobCopyPayload({ title: "Host", description: "  " }) === null && C.jobCopyPayload({ title: 7, description: "x" }) === null);
}

/* ── 3. The chooser ────────────────────────────────────────────────────── */

console.log("\n3. Where a new job can start from");
{
  const day = 86_400_000;
  const options = [
    { id: "c1", title: "Shift Lead", status: "closed", when: "Closed 4 months ago", at: 1 * day },
    { id: "l1", title: "Barista", status: "live", when: "Posted 2 months ago", at: 5 * day },
    { id: "d1", title: "Cashier", status: "draft", when: "Last edited 1 day ago", at: 8 * day },
    { id: "l2", title: "Server", status: "live", when: "Posted 3 days ago", at: 9 * day },
    { id: "d2", title: "Server", status: "draft", when: "Last edited today", at: 10 * day },
  ];
  const before = show(options);
  const sorted = C.sortJobStartOptions(options);
  check("drafts first, then live, then closed; newest first in each", eq(sorted.map((o) => o.id), ["d2", "d1", "l2", "l1", "c1"]), show(sorted.map((o) => o.id)));
  check("the list it was given is not reordered", show(options) === before);
  const tie = C.sortJobStartOptions([{ id: "b", title: "Same", status: "live", when: "", at: 0 }, { id: "a", title: "Same", status: "live", when: "", at: 0 }]);
  check("a tie has one fixed order", eq(tie.map((o) => o.id), ["a", "b"]));
  check("a draft is finished; any other job is used as a start", C.jobStartActionLabel("draft") === "Finish & publish" && C.jobStartActionLabel("live") === "Use this one" && C.jobStartActionLabel("closed") === "Use this one");
}

/* ── 4. Words ──────────────────────────────────────────────────────────── */

console.log("\n4. Words");
{
  check("the row's button", C.COPY_TO_DRAFTS_LABEL === "Copy to drafts");
  check("its hint says the original and its applicants are not touched", /copy/i.test(C.COPY_TO_DRAFTS_HINT) && /aren't touched/.test(C.COPY_TO_DRAFTS_HINT));
  const words = C.copiedToDraftsWords("Server");
  check("the toast names the job and says where the copy is", words.title === "A copy of Server is in your drafts" && /New job/.test(words.body) && /Finish & publish/.test(words.body), show(words));
  check("a job with no title still reads as a sentence", C.copiedToDraftsWords("").title === "A copy of this job is in your drafts");
  check("the chooser says a copy is made and the original is left alone", /makes a copy in your drafts/.test(C.START_FROM_JOB_LINE) && /aren't touched/.test(C.START_FROM_JOB_LINE));
  const all = [C.COPY_TO_DRAFTS_LABEL, C.COPY_TO_DRAFTS_HINT, words.title, words.body, C.START_FROM_JOB_LINE].join(" ");
  check("no dashes standing in for punctuation", !/[—–]/.test(all));
}

/* ── 5. The wiring ─────────────────────────────────────────────────────── */

console.log("\n5. The wiring");
{
  const hook = code(await read("src/hooks/useJobCopy.ts"));
  check("the copy reads the job's answers the way the editor does", /\.rpc\(\s*"get_job_quiz_keys",\s*\{\s*p_job_id: jobId\s*\}\)/.test(hook) && /mergeQuizAnswerKeys\(/.test(hook));
  check("…and stops when they cannot be read (a quiz copied bare could never be marked)", /if \(keysError\) throw new JobCopyError\("answers_unreadable"/.test(hook));
  const keysAt = hook.indexOf("get_job_quiz_keys");
  const writeAt = hook.indexOf("createJob.mutateAsync(");
  check("…before anything is written", keysAt > 0 && writeAt > keysAt);
  check("it writes only through the ordinary create path", /createJob\.mutateAsync\(draft/.test(hook) && !/\.(insert|upsert|update|delete)\(/.test(hook));
  check("it never touches the job it copies, its applicants or their answers", !/from\("(applications|job_quiz_keys|assessment_sessions)"\)/.test(hook));

  const page = code(await read("src/cockpit/pages/Jobs.tsx"));
  check("the row offers it on every job but a draft, to whoever may create one", /\{!draft && onCopy && \(/.test(page) && /onCopy=\{canCopy \? \(\) => void copyToDrafts\(job, false\) : null\}/.test(page));
  check("…never on the showcase data, nor to a team member who may not create jobs", /const canCopy = mode !== "showcase" && !\(teamPermissions\?\.isTeamMember && !teamPermissions\.canCreateJobs\)/.test(page));
  check("the row's buttons wrap on a phone (five of them are wider than the row; without it the first ran off the left edge)", /className="flex w-full shrink-0 flex-wrap justify-end gap-2 sm:w-auto"/.test(page));
  check("the button says it is working, and cannot be pressed twice", /disabled=\{copying\}/.test(page) && /copying \? "Copying…" : COPY_TO_DRAFTS_LABEL/.test(page) && /if \(copyingId\) return;/.test(page));
  check("'+ New job' asks where to start only when there is a job to start from", /startOptions\.length > 0 \? setNewJobOpen\(true\) : startRole\(\)/.test(page));
  check("picking a draft opens that draft; any other job is copied, and the copy opens", /if \(option\.status === "draft"\) \{\s*setNewJobOpen\(false\);\s*navigate\(`\/jobs\/edit\/\$\{option\.id\}`\);\s*\} else \{\s*void copyToDrafts\(option, true\);/.test(page));
  check("Ava is still one click from there, exactly as before", /onAva=\{\(\) => \{\s*setNewJobOpen\(false\);\s*startRole\(\);/.test(page));
  check("a failed copy says so", /toast\.error\(jobCopyFailureWords\(error\)\)/.test(page));

  const dialog = code(await read("src/cockpit/components/NewJobDialog.tsx"));
  check("the chooser is a labelled dialog, portalled to the page", /role="dialog"/.test(dialog) && /aria-labelledby="ck-new-job-title"/.test(dialog) && /createPortal\(/.test(dialog));
  const avaAt = dialog.indexOf("data-new-job-ava");
  const listAt = dialog.indexOf("data-new-job-option");
  check("Ava first, then the jobs", avaAt > 0 && listAt > avaAt);
  check("everything waits while a copy is being made", (dialog.match(/disabled=\{busy\}/g) ?? []).length >= 3 && /e\.key === "Escape" && !busy/.test(dialog));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
