#!/usr/bin/env node
/**
 * Interviews: today's count on the menu, and how soon each one is
 * (docs/INTERVIEWS.md, "Today, and how soon"; src/cockpit/lib/interviewWhen.ts).
 *
 * The owner, 2026-10-09: "it would be nice if the interview tab, let's say
 * it's today, so you should have a one count or two count depending on how
 * many interviews you have today. And also right here where it says 4 p.m.
 * it should be a button that says in 30 minutes or now ... so kind of like
 * they know that oh right now is the time to do the interview."
 *
 * Run with: node scripts/interview_when.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

// Decoded, so a checkout whose path has a space in it works too.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");
const W = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/interviewWhen.ts")).href);

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

// A fixed local moment: 1:00 pm on a Friday, on whatever clock runs the test.
const at = (h, m = 0, dayOffset = 0) => new Date(2026, 9, 9 + dayOffset, h, m, 0, 0).getTime();
const NOW = at(13, 0);
const when = (start, minutes) => W.interviewWhen(start, NOW, minutes);

console.log("\nHow soon, in words");
{
  check("three hours off: 'In 3 h'", show(when(at(16, 0))) === show({ tone: "today", label: "In 3 h" }));
  check("with minutes: 'In 2 h 10 min'", when(at(15, 10)).label === "In 2 h 10 min" && when(at(15, 10)).tone === "today");
  check("an hour or less is said in minutes, in full: 'In 30 minutes'", show(when(at(13, 30))) === show({ tone: "soon", label: "In 30 minutes" }) && when(at(14, 0)).label === "In 60 minutes" && when(at(14, 1)).label === "In 1 h 1 min");
  check("a part minute rounds up, never 'In 0 minutes'", W.interviewWhen(at(13, 6) + 20_000, NOW).label === "In 7 minutes" && W.interviewWhen(at(13, 5) + 1000, NOW).label === "In 6 minutes");
  check("from five minutes before: 'Now'", show(when(at(13, 5))) === show({ tone: "now", label: "Now" }) && when(at(13, 1)).tone === "now" && when(at(13, 0)).tone === "now");
  check("…and it stays 'Now' while the call is on", when(at(12, 45), 30).tone === "now" && when(at(12, 31), 30).tone === "now");
  check("once its length has passed: 'Earlier today'", show(when(at(12, 30), 30)) === show({ tone: "over", label: "Earlier today" }) && when(at(9, 0), 30).tone === "over");
  check("a call with no length on record is taken as half an hour", when(at(12, 31)).tone === "now" && when(at(12, 30)).tone === "over" && W.DEFAULT_INTERVIEW_MINUTES === 30);
  check("a longer call is 'Now' for longer", when(at(12, 15), 60).tone === "now");
  check("tomorrow is 'Tomorrow', by the calendar and not by 24 hours", show(when(at(9, 0, 1))) === show({ tone: "later", label: "Tomorrow" }) && W.interviewWhen(at(2, 30, 1), at(23, 50)).label === "Tomorrow");
  check("…but a call 20 minutes off across midnight is still said in minutes", W.interviewWhen(at(0, 10, 1), at(23, 50)).label === "In 20 minutes");
  check("further off: 'In 3 days'", when(at(16, 0, 3)).label === "In 3 days" && when(at(16, 0, 3)).tone === "later");
  check("a day that has passed has no line (the page lists those on their own)", when(at(16, 0, -1)) === null && when(at(23, 59, -1)) === null);
  check("no time, no line", when(null) === null && when(undefined) === null && when(NaN) === null);
  check("a Date works as well as a number", W.interviewWhen(new Date(at(13, 30)), NOW).label === "In 30 minutes");
}

console.log("\nThe count on the menu");
{
  const row = (h, m, over = {}) => ({ scheduled_at: new Date(at(h, m)).toISOString(), status: "scheduled", candidate_response: "confirmed", duration_minutes: 30, ...over });
  const two = [row(16, 0), row(17, 0)];
  check("two agreed interviews later today: 2", W.interviewsLeftToday(two, NOW) === 2);
  check("one under way still counts; one that is over does not", W.interviewsLeftToday([row(12, 45), row(12, 0)], NOW) === 1);
  check("as the day goes on the count falls", W.interviewsLeftToday(two, at(16, 31)) === 1 && W.interviewsLeftToday(two, at(17, 31)) === 0);
  check("tomorrow's and yesterday's are not today's", W.interviewsLeftToday([{ ...row(16, 0), scheduled_at: new Date(at(16, 0, 1)).toISOString() }, { ...row(16, 0), scheduled_at: new Date(at(16, 0, -1)).toISOString() }], NOW) === 0);
  check("one the applicant has not agreed a time for is not an interview today", W.interviewsLeftToday([row(16, 0, { candidate_response: "awaiting_pick" }), row(16, 0, { candidate_response: "reschedule_requested" }), row(16, 0, { candidate_response: null })], NOW) === 0);
  check("a cancelled, finished or no-show one is not counted", W.interviewsLeftToday([row(16, 0, { status: "cancelled" }), row(16, 0, { status: "completed" }), row(16, 0, { status: "no_show" })], NOW) === 0);
  check("nothing loaded yet, or rows with no time: 0, never a crash", W.interviewsLeftToday(undefined, NOW) === 0 && W.interviewsLeftToday(null, NOW) === 0 && W.interviewsLeftToday([{}, { status: "scheduled", candidate_response: "confirmed", scheduled_at: "not a date" }], NOW) === 0);
}

console.log("\nThe wiring");
{
  const page = code(await read("src/cockpit/pages/Interviews.tsx"));
  check("the line is shown only for a time the applicant has agreed to, off the page's own clock", /const when = s\.response === "confirmed" \? interviewWhen\(s\.at, now, s\.minutes\) : null;/.test(page));
  check("it sits under the time, and says which kind it is", page.includes("data-interview-when={when.tone}") && /\{when\.label\}/.test(page));
  check("the one that is on now is ringed, and its button says 'Join now'", /when\?\.tone === "now" \? \{ boxShadow: "0 0 0 2px var\(--jade\)" \} : null/.test(page) && (page.match(/when\?\.tone === "now" \? "Join now" : "Join interview"/g) ?? []).length === 2);
  check("the page's clock still ticks every 30 seconds, and stops with the page", /setInterval\(\(\) => setNow\(Date\.now\(\)\), 30_000\);\s*return \(\) => clearInterval\(t\);/.test(page));
  const hook = code(await read("src/cockpit/hooks/useInterviewsLeftToday.ts"));
  check("the count reads the list the Interviews page reads (one cached query), and checks the clock once a minute", /const \{ data: rows \} = useInterviews\(\);/.test(hook) && /window\.setInterval\(\(\) => setNow\(Date\.now\(\)\), 60_000\);\s*return \(\) => window\.clearInterval\(timer\);/.test(hook) && !/supabase|\.from\(/.test(hook));
  const shell = code(await read("src/cockpit/Shell.tsx"));
  check("the count is on the menu's Interviews item, and on More on a phone (where Interviews lives)", /item\.to === "\/interviews" && interviewsToday > 0/.test(shell) && /tab\.to === "\/more" && interviewsToday > 0/.test(shell) && (shell.match(/useInterviewsLeftToday\(\)/g) ?? []).length === 2);
  const more = code(await read("src/cockpit/pages/More.tsx"));
  check("…and beside Interviews on the More page", /it\.to === "\/interviews" && interviewsToday > 0/.test(more) && /\{interviewsToday\} today/.test(more));
  const doc = await read("docs/INTERVIEWS.md");
  check("docs/INTERVIEWS.md explains it and names this test", doc.includes("## Today, and how soon") && doc.includes("scripts/interview_when.test.mjs"));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
