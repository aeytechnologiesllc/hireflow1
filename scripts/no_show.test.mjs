#!/usr/bin/env node
/**
 * Interviews: when they do not show up (docs/INTERVIEWS.md, "When they do
 * not show up"; src/cockpit/lib/noShow.ts, components/NoShowDialog.tsx).
 *
 * The owner, 2026-10-09: "what should we do when an applicant doesn't show up
 * for the interview? What do you think is a good way to do that?" Until then
 * "No-show" only labelled the interview and told nobody anything.
 *
 * Run with: node scripts/no_show.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");
const N = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/noShow.ts")).href);

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
const code = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\nThe message a second chance sends");
{
  const note = N.secondChanceNote("Ana Maria Reyes");
  console.log(`   ${note}`);
  check("it is by first name, blames nobody, and says what to do next", note === "Hi Ana, we missed you at your interview. If something came up, that is okay. Reply here with the days and times that work for you, and we will set a new time.");
  check("it asks for no reason and makes no threat", !/why|explain|reason|last chance|otherwise|or else|will be (declined|rejected)|warning/i.test(note));
  check("it promises no date", !/\b(within|by|in) \d|tomorrow|today|this week|\bdays?\b(?! and)/i.test(note.replace("days and times", "")));
  check("with no name it still reads", N.secondChanceNote("  ") === "Hi, we missed you at your interview. If something came up, that is okay. Reply here with the days and times that work for you, and we will set a new time.");
}

console.log("\nThe choices");
{
  const first = N.noShowWords("Ana Reyes", 0);
  check("the first time, one more chance is the one suggested", first.suggested === "chance" && first.title === "Ana did not show up" && /Nothing is sent until you press one\.$/.test(first.body));
  check("each choice says exactly what the applicant gets", /gets this message, and an email, and stays at the interview stage/.test(first.chance.detail) && /is declined and gets your usual note by email/.test(first.pass.detail) && first.pass.button === "Pass on Ana" && first.chance.button === "Send it");
  check("there is a way to only mark it", first.markOnly === "Only mark it as a no-show");
  const second = N.noShowWords("Ana Reyes", 1);
  check("the second time, it says so and suggests passing", second.suggested === "pass" && /This is not the first time: Ana has missed an interview before\./.test(second.body) && /Nothing is sent until you press one\.$/.test(second.body));
  check("…and counts when it is more than one", /Ana has missed 2 interviews before/.test(N.noShowWords("Ana Reyes", 2).body));
  check("with no name it still reads", N.noShowWords("", 0).title === "They did not show up");
}

console.log("\nWhat is said afterwards");
{
  check("a second chance that went: asked which times work", show(N.noShowDoneWords("Ana Reyes", "chance", true)) === show({ ok: true, title: "Marked as a no-show", description: "Ana was asked which times work. Their answer will be in Messages." }));
  check("a second chance whose message could not be sent says so, and what to do", N.noShowDoneWords("Ana Reyes", "chance", false).ok === false && /could not be sent\. Write to them from Messages\./.test(N.noShowDoneWords("Ana Reyes", "chance", false).description));
  check("a pass: passed on and sent the note", /Ana was passed on and sent your note\./.test(N.noShowDoneWords("Ana Reyes", "pass").description));
  check("only marked: just that", show(N.noShowDoneWords("Ana Reyes", "mark")) === show({ ok: true, title: "Marked as a no-show: Ana" }));
}

console.log("\nThe wiring");
{
  const lib = code(await read("src/cockpit/lib/noShow.ts"));
  check("the words are plain code: no imports, no request", !/^import /m.test(lib) && !/supabase|fetch\(|functions\.invoke/.test(lib));
  const page = code(await read("src/cockpit/pages/Interviews.tsx"));
  check("nothing marks a no-show straight away: both kinds of passed row ask how it went first", (page.match(/onClick=\{\(\) => setOutcomeFor\(\{ session: s, stage: "ask" \}\)\}/g) ?? []).length === 2 && !/markOutcome\(s, "no_show"\)/.test(page) && !/markOutcome\(s, "completed"\)/.test(page));
  const resolve = /const resolveNoShow = async \(choice: NoShowChoice\) => \{([\s\S]*?)\n  \};/.exec(page)?.[1] ?? "";
  check("the interview is marked first, whatever was chosen", resolve.indexOf('updateInterview.mutateAsync({ id: target.id, status: "no_show" })') > 0 && resolve.indexOf("updateInterview.mutateAsync") < resolve.indexOf("sendMessage.mutateAsync") && resolve.indexOf("updateInterview.mutateAsync") < resolve.indexOf("reject("));
  check("one more chance sends the note as an ordinary message (which emails them), to the applicant of that interview", /if \(choice === "chance"\) \{[\s\S]*?sendMessage\.mutateAsync\(\{ receiver_id: target\.candidateId, content: secondChanceNote\(target\.name\), application_id: target\.applicationId \?\? undefined \}\);/.test(resolve));
  check("…and a message that fails does not undo the mark; it is said", /sent = false;/.test(resolve) && /noShowDoneWords\(target\.name, choice, sent\)/.test(resolve));
  check("pass is the ordinary Pass, on that interview's own application", /else if \(choice === "pass" && target\.applicationId\) \{\s*await reject\(target\.applicationId\);/.test(resolve));
  check("only marking sends nothing", !/choice === "mark"[\s\S]*?(sendMessage|reject)\(/.test(resolve) && (resolve.match(/sendMessage\.mutateAsync/g) ?? []).length === 1 && (resolve.match(/reject\(/g) ?? []).length === 1);
  // Since 2026-10-09 the row asks one question, "How did it go?", and the
  // no-show choices are reached through its answer (lib/interviewOutcome.ts).
  check("an interview whose time has passed today can be answered the same day", /when\?\.tone === "over" && \(/.test(page) && /How did it go\?/.test(page) && /data-outcome-open/.test(page));
  check("answering 'did not show up' opens these same choices, for that interview", /onNoShow=\{\(\) => \{\s*const target = outcomeFor\?\.session \?\? null;\s*setOutcomeFor\(null\);\s*if \(target\) setNoShowFor\(target\);/.test(page));
  check("'We talked' only moves on once the interview is saved as done", /if \(await markOutcome\(target, "completed"\)\) setOutcomeFor\(\{ session: target, stage: "next" \}\);/.test(page) && /return false;/.test(page));
  check("the dialog is told how many interviews this same applicant already missed", /earlierNoShows=\{noShowFor \? sessions\.filter\(\(x\) => x\.status === "no_show" && x\.id !== noShowFor\.id && !!x\.applicationId && x\.applicationId === noShowFor\.applicationId\)\.length : 0\}/.test(page));
  const dialog = code(await read("src/cockpit/components/NoShowDialog.tsx"));
  check("the dialog shows both notes word for word before anything is sent", /secondChanceNote\(name\)/.test(dialog) && /<DeclineNotePreview jobTitle=\{jobTitle\} \/>/.test(dialog));
  check("three ways on, and none of them runs without a press", ["chance", "pass", "mark"].every((c) => dialog.includes(`onChoose("${c}")`)) && !/useEffect\([^)]*onChoose/.test(dialog));
  check("it cannot be closed half-way through", /if \(e\.key === "Escape" && !busy\) onClose\(\);/.test(dialog) && /if \(!busy\) onClose\(\);/.test(dialog));
  const doc = await read("docs/INTERVIEWS.md");
  check("docs/INTERVIEWS.md explains it and names this test", doc.includes("## When they do not show up") && doc.includes("scripts/no_show.test.mjs"));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
