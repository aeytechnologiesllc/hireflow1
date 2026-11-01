#!/usr/bin/env node
/**
 * The job builder keeps unfinished work (src/lib/avaEngine/draft.ts,
 * src/pages/AvaCreateJob.tsx). The owner, building a real job on 2026-11-01:
 * "this job should be saved up, so if they ... exit this back out, the job
 * should be saved up one day so they can continue or restart."
 *
 * It was kept only for the tab it was made in (a sessionStorage mark) and
 * every "New job" button cleared it, so closing the tab or going back to Jobs
 * lost the work. Holds: every change is saved with its time under the
 * account, for a week (more than the day asked), never another account's;
 * the builder offers "Continue where you left off" or "Start over" and says
 * where it opens; a draft opens where it was left (never on the build); a
 * job saved as a draft at the payment step goes to Jobs and the builder's
 * copy goes; no "New job" button clears it.
 *
 * Run with: node scripts/builder_drafts.test.mjs
 */
import { build } from "esbuild";
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
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

// A browser's localStorage, in memory.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
};

const bundle = await build({
  stdin: { contents: 'export * from "./src/lib/avaEngine/draft.ts";\n', resolveDir: ROOT, loader: "ts" },
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  alias: { "@": path.join(ROOT, "src") },
  logLevel: "silent",
});
const D = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 1, 18, 0, 0);
const brief = (over = {}) => ({ role: "", location: "", type: "Full-time · Remote", pay: "", start: "Within a few weeks", work: "", openings: 1, typeChosen: false, ...over });
const draft = (over = {}) => ({ briefFields: brief(over.briefFields), chipAnswers: {}, rigor: "standard", rigorTouched: false, flow: null, ...over, briefFields: brief(over.briefFields) });
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

// 1. Saved under the account, with its time, for a week.
{
  store.clear();
  D.saveDraft(draft({ briefFields: { role: "Chat Support Agent" }, step: 4 }), OWNER, NOW);
  const back = D.loadDraft(OWNER, NOW + HOUR);
  check("a save is kept under the account with the time it was saved", back?.briefFields.role === "Chat Support Agent" && back.savedAt === NOW && store.has(`ava-create-job-draft-v2:${OWNER}`));
  check("it comes back the next day (the owner asked for a day)", D.loadDraft(OWNER, NOW + 25 * HOUR)?.briefFields.role === "Chat Support Agent");
  check("…and up to a week", D.DRAFT_KEEP_MS === 7 * 24 * HOUR && D.loadDraft(OWNER, NOW + D.DRAFT_KEEP_MS)?.briefFields.role === "Chat Support Agent");
  check("never to another account on the same browser", D.loadDraft(OTHER, NOW + HOUR) === null && D.loadDraft(null, NOW) === null);
  check("after a week it is gone, and removed", D.loadDraft(OWNER, NOW + D.DRAFT_KEEP_MS + 1) === null && !store.has(`ava-create-job-draft-v2:${OWNER}`));
  D.saveDraft(draft({ briefFields: { role: "A" } }), null, NOW);
  check("no account, nothing saved", store.size === 0);
  D.saveDraft(draft({ briefFields: { role: "A" } }), OWNER, NOW);
  D.clearDraft(OWNER);
  check("clearDraft drops it (published, saved to Jobs, or Start over)", D.loadDraft(OWNER, NOW) === null);
  store.set(`ava-create-job-draft-v2:${OWNER}`, "{not json");
  check("a draft that cannot be read is no draft", D.loadDraft(OWNER, NOW) === null);
}

// 2. A draft from before accounts were kept apart (one per browser, no time).
{
  store.clear();
  store.set("ava-create-job-draft-v1", JSON.stringify(draft({ briefFields: { role: "Patient chat agent" }, step: 2 })));
  const legacy = D.loadDraft(OWNER, NOW);
  check("is offered to the account that opens the builder, as saved earlier", legacy?.briefFields.role === "Patient chat agent" && legacy.savedAt === undefined && D.savedAgo(legacy.savedAt, NOW) === "earlier");
  D.saveDraft({ ...legacy, briefFields: { ...legacy.briefFields, role: "Patient chat agent (edited)" } }, OWNER, NOW);
  check("the account's own save is read from then on", D.loadDraft(OWNER, NOW)?.briefFields.role === "Patient chat agent (edited)");
  D.clearDraft(OWNER);
  check("and clearing removes both", D.loadDraft(OWNER, NOW) === null && !store.has("ava-create-job-draft-v1"));
}

// 3. Worth offering, and where it opens.
{
  check("an untouched brief is not offered", !D.draftWorthOffering(draft()) && !D.draftWorthOffering(null));
  check("a title, the work, the pay, an answer, own words or a plan is", [
    draft({ briefFields: { role: "Chat agent" } }),
    draft({ briefFields: { work: "Answer chats." } }),
    draft({ briefFields: { pay: "$500 a month" } }),
    draft({ chipAnswers: { "cs-channel": 1 } }),
    draft({ ownWords: { business: "a pet grooming salon" } }),
    draft({ flow: { phases: [] } }),
  ].every((d) => D.draftWorthOffering(d)));
  const O = D.draftOpeningStep;
  check("it opens where it was left: details, a question, How strict, the plan", O(draft()) === 0 && O(draft({ step: 0 })) === 0 && O(draft({ step: 1 })) === 1 && O(draft({ step: 2 })) === 2 && O(draft({ step: 4, flow: { phases: [] } })) === 4);
  check("left while the plan was building: on How strict, never building again by itself", O(draft({ step: 3 })) === 2 && O(draft({ step: 3, flow: { phases: [] } })) === 4);
  check("never the published screen", O(draft({ step: 5, flow: { phases: [] } })) === 4 && O(draft({ step: 5 })) === 0);
}

// 4. The offer's words.
{
  const A = (ms) => D.savedAgo(NOW - ms, NOW);
  check("saved just now / 5 minutes / 1 hour / 3 hours ago / yesterday / 4 days ago", A(10_000) === "just now" && A(5 * 60_000) === "5 minutes ago" && A(61 * 60_000) === "1 hour ago" && A(3 * HOUR) === "3 hours ago" && A(30 * HOUR) === "yesterday" && A(4 * 24 * HOUR) === "4 days ago");
  const w = D.draftResumeWords(draft({ briefFields: { role: "Chat Support Agent" }, step: 4, flow: { phases: [] }, savedAt: NOW - 2 * HOUR }), { step: 4, questions: 8 }, NOW);
  check("\"Chat Support Agent\" · \"Saved 2 hours ago. It opens at your hiring plan.\"", w.title === "Chat Support Agent" && w.detail === "Saved 2 hours ago. It opens at your hiring plan.", JSON.stringify(w));
  const q = D.draftResumeWords(draft({ step: 1, questionIndex: 4, savedAt: NOW - 60_000 }), { step: 1, questions: 8 }, NOW);
  check("no title yet: \"Your new job\", and the question it was left on", q.title === "Your new job" && q.detail === "Saved 1 minute ago. It opens at question 5 of 8.", JSON.stringify(q));
  check("How strict and the job details", D.draftPlaceWords(2) === "How strict" && D.draftPlaceWords(0) === "the job details");
}

// 5. The page and the ways out.
{
  const page = read("src/pages/AvaCreateJob.tsx");
  check("the builder reads this account's draft and offers it: Continue where you left off, or Start over", /loadDraft\(userId\)/.test(page) && /draftWorthOffering\(offered\)/.test(page) && page.includes("Continue where you left off") && />\s*Start over\s*</.test(page) && /clearDraft\(userId\);\s*setChoice\("fresh"\)/.test(page));
  check("no tab-only mark any more (closing the tab kept nothing)", !/sessionStorage/.test(page) && !/ava-create-active/.test(page));
  check("every change is saved under the account, with the question showing", /saveDraft\(\s*\{[\s\S]*?questionIndex: fuIndex,[\s\S]*?\},\s*userId,\s*\)/.test(page));
  check("a draft opens where it was left, on its question", /draftOpeningStep\(saved\)/.test(page) && /saved\.questionIndex/.test(page));
  check("published or saved to Jobs (the payment step's draft), the builder's copy goes and stays gone", (page.match(/draftDoneRef\.current = true;\s*(\/\/[^\n]*\n\s*)?clearDraft\(userId\);/g) ?? []).length === 2 && /if \(publishedCode \|\| draftDoneRef\.current\) return;/.test(page));
  check("the payment step saves the job to Jobs as a draft first (\"Finish & publish\" there)", /createJobFromFlow\(edited, brief, \{ status: "draft"/.test(page) && /Finish &amp; publish/.test(read("src/cockpit/pages/Jobs.tsx")));
  for (const p of ["src/cockpit/pages/Jobs.tsx", "src/cockpit/pages/Analytics.tsx", "src/cockpit/pages/Dashboard.tsx", "src/cockpit/pages/Applicants.tsx"]) {
    const src = read(p);
    check(`${p}: "New job" no longer throws the unfinished job away`, !/clearDraft/.test(src) && !/ava-create-active/.test(src) && /navigate\("\/jobs\/create"\)/.test(src));
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
