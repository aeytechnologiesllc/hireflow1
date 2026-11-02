#!/usr/bin/env node
/**
 * "When will they work?" → Set your own hours (src/lib/ownAnswers.ts,
 * src/pages/AvaCreateJob.tsx). The owner, building a real job on 2026-11-01:
 * "here you should also be able to pick or define your own timings ... easy,
 * but also very customizable".
 *
 * Holds: the four picks stay and a fifth opens a field; the hours as written
 * are the answer the writer reads (left out while empty); the job post says
 * them on either plan, once; the review and the strip name them; the page
 * has the field. (Something else, the same module's other half, is held by
 * scripts/business_kind.test.mjs.)
 *
 * Run with: node scripts/own_answers.test.mjs
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

const bundle = await build({
  stdin: {
    contents:
      'export * from "./src/lib/ownAnswers.ts";\n' +
      'export { PLAYBOOKS, CS_HOURS_CHIPS, chipAnswersToBriefAnswers, briefFromForm, CHAT_AGENT_KIND } from "./src/lib/avaEngine/playbook.ts";\n' +
      'export { generateTemplateFlow } from "./src/lib/avaEngine/templateGenerator.ts";\n' +
      'export { fromYourAnswers, answersGiven, knownSoFar, ANSWER_TAGS } from "./src/lib/builderHints.ts";\n',
    resolveDir: ROOT,
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  alias: { "@": path.join(ROOT, "src") },
  external: ["@supabase/supabase-js"],
  logLevel: "silent",
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

const HOURS = "Mon–Fri, 9am–5pm Manila time";
const playbook = M.PLAYBOOKS.customer_service;
const defs = playbook.followUps({}, { roleTitle: "Chat support agent", whatTheyDo: "Answer customer chats." });
const hoursQ = defs.find((f) => f.id === "cs-hours");
const own = hoursQ.chips.indexOf(M.OWN_HOURS_CHIP);

// 1. The question: three picks, then the business's own; weekends a switch beside them, not a pick.
{
  check("When will they work? has three picks and Set your own hours last, no \"Weekends too\" pick", JSON.stringify(hoursQ.chips) === JSON.stringify(["Daytime", "Evenings or nights", "Rotating shifts", "Set your own hours"]) && own === 3 && hoursQ.def === 0);
  check("…the same chips as CS_HOURS_CHIPS, with a short tag for the strip", JSON.stringify([...M.CS_HOURS_CHIPS]) === JSON.stringify(hoursQ.chips) && M.ANSWER_TAGS["cs-hours"]["Set your own hours"] === "Own hours");
}

// 2. The brief: the hours as written, or nothing.
{
  const answers = (picks, words) => M.withOwnWords(M.chipAnswersToBriefAnswers([M.CHAT_AGENT_KIND, ...defs], picks), words);
  const mine = answers({ "cs-hours": own }, { hours: `  ${HOURS} ` });
  const h = mine.find((a) => a.questionId === "cs-hours");
  check("the writer reads the hours as written, under its own question", h?.answer === HOURS && h.question === "When will they work?", JSON.stringify(h));
  check("…left out while empty (the writer is never told \"Set your own hours\")", !answers({ "cs-hours": own }, { hours: "   " }).some((a) => a.questionId === "cs-hours") && !answers({ "cs-hours": own }, {}).some((a) => a.questionId === "cs-hours"));
  check("a pick is answered as before, whatever was typed", answers({ "cs-hours": 1 }, { hours: HOURS }).find((a) => a.questionId === "cs-hours").answer === "Evenings or nights");
  check("ownHoursIn: the business's own hours, null for one of the picks", M.ownHoursIn(mine, M.CS_HOURS_CHIPS) === HOURS && M.ownHoursIn(answers({ "cs-hours": 2 }, {}), M.CS_HOURS_CHIPS) === null && M.ownHoursIn([], M.CS_HOURS_CHIPS) === null);
  const weekends = answers({ "cs-hours": 1 }, { weekends: true });
  const at = weekends.findIndex((a) => a.questionId === "cs-hours");
  check(
    "the weekends switch keeps the pick and tells the writer \"Do they work weekends?\" right after it",
    weekends[at]?.answer === "Evenings or nights" && weekends[at + 1]?.questionId === M.WEEKENDS_ID && weekends[at + 1].question === "Do they work weekends?" && weekends[at + 1].answer === "Yes, weekends too" && weekends.filter((a) => a.questionId === M.WEEKENDS_ID).length === 1,
    JSON.stringify(weekends),
  );
  check(
    "…never with the business's own hours (they say their own days), never while off, and never twice",
    !answers({ "cs-hours": own }, { hours: HOURS, weekends: true }).some((a) => a.questionId === M.WEEKENDS_ID) && !answers({ "cs-hours": 1 }, { weekends: false }).some((a) => a.questionId === M.WEEKENDS_ID) &&
      M.withOwnWords(weekends, { weekends: true }).filter((a) => a.questionId === M.WEEKENDS_ID).length === 1 && M.ownHoursIn(weekends, M.CS_HOURS_CHIPS) === null,
  );
}

// 3. The job post says them, on either plan, once.
{
  const brief = M.briefFromForm({ role: "Chat support agent", location: "Remote, Philippines", type: "Full-time · Remote", typeChosen: false, pay: "$500 a month", start: "Within a few weeks", work: "Answer customer chats.", followUps: [] });
  const post = M.generateTemplateFlow({ brief, rigor: "standard" }).flow.jobPost;
  const withHours = M.withOwnHoursInPost(post, HOURS);
  check("the built-in plan's post gets \"Hours: …\" after its summary", withHours.summary === `${post.summary}\n\nHours: ${HOURS}.` && withHours.title === post.title, withHours.summary);
  check("…once: a post that already says them word for word is left as it is", JSON.stringify(M.withOwnHoursInPost(withHours, HOURS)) === JSON.stringify(withHours) && JSON.stringify(M.withOwnHoursInPost({ ...post, requirements: [`Available ${HOURS.toLowerCase()}`] }, HOURS)) === JSON.stringify({ ...post, requirements: [`Available ${HOURS.toLowerCase()}`] }));
  check("…and nothing when there are none", M.withOwnHoursInPost(post, "") === post && M.withOwnHoursInPost(post, null) === post);
  check("ownHoursLine trims the end's marks: \"Hours: Mon–Fri, 9am–5pm Manila time.\"", M.ownHoursLine(`${HOURS}.;  `) === `Hours: ${HOURS}.` && M.ownHoursLine("  ") === null);
  check("an empty summary gets the line alone", M.withOwnHoursInPost({ ...post, summary: "" }, HOURS).summary === `Hours: ${HOURS}.`);
}

// 4. What the review and the strip say.
{
  const given = M.givenWithOwnWords(M.answersGiven(defs, { "cs-hours": own }, { step: 4, questionIndex: 0 }), { hours: HOURS });
  const a = { role: "Chat support agent", location: "Remote, Philippines", pay: "$500 a month", workMode: "remote", countryCode: "PH", answers: given };
  check("the strip shows the hours as written", M.knownSoFar(a).includes(HOURS), JSON.stringify(M.knownSoFar(a)));
  check("the review's job post names them on the built-in plan too (they are in its post)", M.fromYourAnswers("job-post", a, { writtenByAva: false }).includes(HOURS) && M.fromYourAnswers("job-post", a, { writtenByAva: true }).includes(HOURS));
  const picked = M.answersGiven(defs, { "cs-hours": 1 }, { step: 4, questionIndex: 0 });
  check("…but one of the four only on the writer's (the built-in plan reads none)", !M.fromYourAnswers("job-post", { ...a, answers: picked }, { writtenByAva: false }).includes("Evenings or nights") && M.fromYourAnswers("job-post", { ...a, answers: picked }, { writtenByAva: true }).includes("Evenings or nights"));
  check("an empty field shows nothing", !M.givenWithOwnWords([{ questionId: "cs-hours", answer: "Set your own hours" }], { hours: "" }).length);
  const both = { ...a, answers: M.givenWithOwnWords(M.answersGiven(defs, { "cs-hours": 1 }, { step: 4, questionIndex: 0 }), { weekends: true }) };
  check("the strip shows the pick and \"Weekends too\" together", M.knownSoFar(both).includes("Evenings or nights") && M.knownSoFar(both).includes("Weekends too"), JSON.stringify(M.knownSoFar(both)));
  check("…and not with the business's own hours", !M.knownSoFar({ ...a, answers: M.givenWithOwnWords(M.answersGiven(defs, { "cs-hours": own }, { step: 4, questionIndex: 0 }), { hours: HOURS, weekends: true }) }).includes("Weekends too"));
}

// 5. The page.
{
  const page = readFileSync(path.join(ROOT, "src/pages/AvaCreateJob.tsx"), "utf8");
  check("Set your own hours opens a field with the owner's kind of example", /fu\.id === "cs-hours" && fu\.chips\[picked\] === OWN_HOURS_CHIP/.test(page) && page.includes('placeholder="e.g. Mon–Fri, 9am–5pm Manila time"') && /Your job post will say “\{ownHoursLine\(ownWords\.hours\)\}”/.test(page));
  check("a tap on it puts the cursor in the field", /questionId === "cs-hours" && chip === OWN_HOURS_CHIP \? "own-hours"/.test(page));
  check(
    "the weekends switch sits under the hours picks (not with Set your own hours) and is kept with the draft's own words",
    /fu\.id === "cs-hours" && fu\.chips\[picked\] !== OWN_HOURS_CHIP && \(\s*<label[^>]*data-weekends>/.test(page) && /<Switch checked=\{!!ownWords\.weekends\} onCheckedChange=\{\(weekends\) => setOwnWords\(\(o\) => \(\{ \.\.\.o, weekends \}\)\)\}/.test(page),
  );
  check("the built plan's post gets the hours, whichever plan wrote it", /jobPost: withOwnHoursInPost\(result\.flow\.jobPost, ownHoursIn\(brief\.followUps, CS_HOURS_CHIPS\)\)/.test(page));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
