#!/usr/bin/env node
/**
 * Pass on several applicants at once (docs/APPLICANTS-LIST.md §8):
 * src/cockpit/lib/bulkPass.ts, src/cockpit/hooks/useBulkPass.ts, the list's
 * bar and the confirm.
 *
 * The owner, 2026-10-07: "you added remove and block at the shortlist, but
 * you didn't give me the option to pass on all of them. So I need to do a
 * bulk pass. And make these smaller buttons." These checks prove:
 *  - who a bulk Pass reaches: only people still being decided on. Never
 *    someone declined, hired, blocked, or holding an offer;
 *  - one confirm that says the number, how many have not finished the tests,
 *    how many are left as they are, and that each gets the note;
 *  - it writes exactly what a single Pass writes, and only where the status
 *    is still one a Pass may change;
 *  - one person at a time, the email waited for, so the outcome can say
 *    truthfully how many were told; it stops after three failures in a row;
 *  - the bar: Shortlist, Pass N, Remove and block N, a size down;
 *  - it is not Remove and block: nobody is blocked.
 *
 * Run with: node scripts/bulk_pass.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

// Decoded, so a checkout whose path has a space in it works too.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/bulkPass.ts")).href);
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");

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

const row = (id, status, over = {}) => ({ id, candidateId: `c-${id}`, name: `Person ${id}`, jobTitle: "Team leader", status, tab: "needs-review", finished: true, ...over });

console.log("\nWho a bulk Pass reaches\n");
{
  check("someone still being decided on", ["in_progress", "pending", "reviewing", "interview"].every((s) => P.canBulkPass(s)));
  check("never someone already declined or hired", !P.canBulkPass("rejected") && !P.canBulkPass("hired"));
  check("never someone holding an offer (an offer is taken back one at a time)", !P.canBulkPass("offered"));
  check("never a status it does not know", !P.canBulkPass("") && !P.canBulkPass("archived"));

  const plan = P.bulkPassPlan([
    row("a", "reviewing"),
    row("b", "pending", { finished: false }),
    row("c", "in_progress", { finished: false }),
    row("d", "interview"),
    row("e", "rejected"),
    row("f", "hired"),
    row("g", "offered"),
    row("h", "reviewing", { tab: "blocked" }),
    row("a", "reviewing"), // the same row twice
  ]);
  check("the ones it reaches, in the order picked, each once", show(plan.targets.map((t) => t.applicationId)) === show(["a", "b", "c", "d"]), show(plan.targets.map((t) => t.applicationId)));
  check("the rest are counted as left as they are", plan.left === 4, String(plan.left));
  check("how many of them have not finished the tests", plan.unfinished === 2);
  check("a target carries what the note needs", show(plan.targets[0]) === show({ applicationId: "a", candidateId: "c-a", name: "Person a", jobTitle: "Team leader" }));
  check("the note names the job when they all applied for the same one", plan.jobTitle === "Team leader");
  check("…and no job when they did not", P.bulkPassPlan([row("a", "reviewing"), row("b", "reviewing", { jobTitle: "Night agent" })]).jobTitle === null);
  check("nobody passable: an empty plan", show(P.bulkPassPlan([row("e", "rejected"), row("g", "offered")])) === show({ targets: [], left: 2, unfinished: 0, jobTitle: null }));
}

console.log("\nThe confirm\n");
{
  const plain = P.bulkPassWords(P.bulkPassPlan([row("a", "reviewing"), row("b", "reviewing"), row("c", "interview")]));
  check("the number, in the title and on the button", plain.title === "Pass on 3 applicants?" && plain.confirm === "Pass on 3", show(plain));
  check("everyone finished, nobody left: only that each gets the note", plain.body === "They all come off your list, and each gets this note in your name:", plain.body);

  const mixed = P.bulkPassWords(P.bulkPassPlan([row("a", "reviewing"), row("b", "pending", { finished: false }), row("c", "in_progress", { finished: false }), row("e", "rejected"), row("g", "offered")]));
  check("it says how many have not finished the tests, and what passing does to them", mixed.body.startsWith("2 of them have not finished the tests yet; passing closes those applications."), mixed.body);
  check("it says how many picked are left as they are, and why", mixed.body.includes("2 others you picked are left as they are (already declined, hired, blocked or holding an offer)."), mixed.body);
  check("it ends on the note", mixed.body.endsWith("They all come off your list, and each gets this note in your name:"));

  const one = P.bulkPassWords(P.bulkPassPlan([row("a", "reviewing"), row("b", "pending", { finished: false }), row("e", "rejected")]));
  check("singular where it is one", one.body.includes("1 of them has not finished the tests yet; passing closes that application.") && one.body.includes("1 other you picked is left as it is"), one.body);
  const none = P.bulkPassWords(P.bulkPassPlan([row("a", "pending", { finished: false }), row("b", "in_progress", { finished: false })]));
  check("when none of them has finished", none.body.startsWith("None of them has finished the tests yet; passing closes their applications."), none.body);
  check("no words for the applicant: the confirm never says rejected or declined to their face", !/reject/i.test(plain.title + plain.body + plain.confirm));
}

console.log("\nWhat is written, and how it went\n");
{
  check("a Pass writes the decline, who made it, and that a person did", show(P.passUpdate("u-1")) === show({ status: "rejected", rejected_by: "u-1", rejected_by_type: "user" }) && P.passUpdate(null).rejected_by === null);
  const single = await read("src/cockpit/hooks/useCockpitData.ts");
  check("…the same three fields the single Pass writes", /status: "rejected" as never,\s*rejected_by: user\?\.id \?\? null,[\s\S]{0,220}?rejected_by_type: "user",/.test(single));
  check("the statuses it may change are the ones it reaches", show([...P.PASSABLE_STATUSES].sort()) === show(["in_progress", "interview", "pending", "reviewing"]) && P.PASSABLE_STATUSES.every((s) => P.canBulkPass(s)));

  check("the button counts while it runs", P.bulkPassProgressWords(0, 25) === "Passing 1 of 25…" && P.bulkPassProgressWords(24, 25) === "Passing 25 of 25…" && P.bulkPassProgressWords(99, 25) === "Passing 25 of 25…");

  const all = P.bulkPassDoneWords({ total: 25, passed: 25, emailed: 25, moved: 0, failed: 0, stopped: false });
  check("everyone passed and told", all.ok && all.title === "25 applicants passed" && all.description === "Each was sent the note.", show(all));
  const someUnsent = P.bulkPassDoneWords({ total: 25, passed: 25, emailed: 22, moved: 0, failed: 0, stopped: false });
  check("it never claims an email that did not go", someUnsent.ok && someUnsent.description === "22 were sent the note; 3 could not be emailed and will see the decision in their application.", show(someUnsent));
  const noneSent = P.bulkPassDoneWords({ total: 4, passed: 4, emailed: 0, moved: 0, failed: 0, stopped: false });
  check("no mail at all: it says so", noneSent.description === "The note could not be emailed to any of them; they will see the decision in their application.", show(noneSent));
  const moved = P.bulkPassDoneWords({ total: 5, passed: 3, emailed: 3, moved: 2, failed: 0, stopped: false });
  check("someone who moved on in the meantime is left alone, and that is not a failure", moved.ok && moved.title === "3 of 5 passed" && /2 had already moved on and were left as they were\./.test(moved.description), show(moved));
  const partial = P.bulkPassDoneWords({ total: 10, passed: 8, emailed: 8, moved: 0, failed: 2, stopped: false });
  check("a failure is said as one", !partial.ok && partial.title === "8 of 10 passed" && /2 could not be changed\. Try those again\./.test(partial.description), show(partial));
  const stopped = P.bulkPassDoneWords({ total: 20, passed: 4, emailed: 4, moved: 0, failed: 3, stopped: true });
  check("stopping early says how many were not changed", !stopped.ok && /It stopped after 3 failures in a row: 16 were not changed\./.test(stopped.description), show(stopped));
  const nothing = P.bulkPassDoneWords({ total: 3, passed: 0, emailed: 0, moved: 0, failed: 3, stopped: true });
  check("nobody passed: it does not say 'passed'", !nothing.ok && nothing.title === "Couldn't pass on them", show(nothing));
  check("one person reads as one", P.bulkPassDoneWords({ total: 1, passed: 1, emailed: 1, moved: 0, failed: 0, stopped: false }).title === "1 applicant passed");
}

console.log("\nHow it is sent\n");
{
  const hook = await read("src/cockpit/hooks/useBulkPass.ts");
  check("it writes the Pass's own fields, by application id", /\.from\("applications"\)\s*\.update\(passUpdate\(user\?\.id \?\? null\) as never\)\s*\.eq\("id", target\.applicationId\)/.test(hook));
  check("…and only where the status is still one a Pass may change", /\.in\("status", \[\.\.\.PASSABLE_STATUSES\] as never\)/.test(hook));
  check("nothing changed means they had moved on: counted, not a failure", /if \(!Array\.isArray\(data\) \|\| data\.length === 0\) \{[\s\S]{0,160}?result\.moved \+= 1;/.test(hook));
  check("the note is the single Pass's own, and it is waited for", /const emailed = await notifyStatusRejected\(target\.candidateId, target\.jobTitle \|\| "Position"\);/.test(hook) && /if \(emailed === "sent"\) result\.emailed \+= 1;/.test(hook));
  check("one person at a time: no Promise.all, no burst", !/Promise\.all/.test(hook) && /for \(let i = 0; i < targets\.length; i \+= 1\)/.test(hook));
  check("it stops after three failures in a row", /if \(failuresInARow >= BULK_PASS_STOP_AFTER\) \{\s*result\.stopped = true;\s*break;/.test(hook) && P.BULK_PASS_STOP_AFTER === 3);
  check("it is not Remove and block: no block, and no other table", !/block_applicants|blocked_applicants|\.rpc\(/.test(hook) && (hook.match(/\.from\("/g) ?? []).length === 1);
  check("it does not go through the hook whose email is not waited for", !/useUpdateApplication/.test(hook.replace(/\/\*\*[\s\S]*?\*\//, "")));
  check("the list is refreshed once, at the end", /finally \{\s*setProgress\(null\);\s*queryClient\.invalidateQueries\(\{ queryKey: \["applications"\] \}\);/.test(hook));
}

console.log("\nThe bar and the confirm\n");
{
  const bar = await read("src/cockpit/components/ApplicantBulkBar.tsx");
  const order = [bar.indexOf('data-bulk="shortlist"'), bar.indexOf('data-bulk="pass"'), bar.indexOf('data-bulk="block"')];
  check("Shortlist, Pass, Remove and block, in that order", order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2]);
  check("Pass says how many", /const passLabel = count > 0 \? `Pass \$\{count\}` : "Pass";/.test(bar));
  check("a size down on a computer: 32px, 12.5px", (bar.match(/ck-btn ck-btn-outline h-8 !gap-1\.5 !px-3 !text-\[12\.5px\]/g) ?? []).length === 3 && !/\bh-9\b/.test(bar));
  check("on a phone: three in one row, still a 40px tap", (bar.match(/min-h-\[40px\] min-w-0/g) ?? []).length === 3);
  check("on a phone the short 'Block N' still reads 'Remove and block N' aloud", /aria-label=\{blockLabel\}\s*data-bulk="block"/.test(bar) && /`Block \$\{count\}`/.test(bar));
  check("Pass is off with nobody picked, and while something is running", /data-bulk="pass"[^>]*disabled=\{count === 0 \|\| busy\}/.test(bar));

  const menu = await read("src/cockpit/components/ApplicantRowMenu.tsx");
  check("the confirm is the plan's own words, with the note under it", /const words = bulkPassWords\(request\.plan\);/.test(menu) && /note=\{<DeclineNotePreview jobTitle=\{request\.plan\.jobTitle\} \/>\}/.test(menu) && /confirmLabel=\{words\.confirm\}\s*tone="danger"/.test(menu));
  check("the button counts while it runs", /busyLabel=\{passProgress \? bulkPassProgressWords\(passProgress\.done, passProgress\.total\) : undefined\}/.test(menu));
  check("how it went is said once, as a success or as a fault", /const said = bulkPassDoneWords\(result\);\s*\(said\.ok \? toast\.success : toast\.error\)\(said\.title/.test(menu));
  const dialog = await read("src/cockpit/components/ActionDialog.tsx");
  check("the dialog cannot be closed while it runs", /if \(e\.key === "Escape" && !busy\) onClose\(\);/.test(dialog) && /\{busy \? busyLabel \?\? "Working…" : confirmLabel\}/.test(dialog));

  const page = await read("src/cockpit/pages/Applicants.tsx");
  check("the page plans from everyone picked on the list, drawn or further down it", /const plan = bulkPassPlan\(view\.matched\.filter\(\(r\) => picked\.has\(r\.id\)\)\);/.test(page));
  check("nobody passable: it says why, and opens nothing", /if \(plan\.targets\.length === 0\) \{\s*toast\.message\(/.test(page));
  check("one person is the ordinary Pass dialog", /if \(plan\.targets\.length === 1 && plan\.left === 0\) \{[\s\S]{0,260}?kind: "pass"/.test(page));
  check("the picks are let go afterwards", /if \(request\.kind === "passMany"\) \{\s*setPicked\(new Set\(\)\);\s*setSelectMode\(false\);/.test(page));
  check("the rows it is about are settled at once, like any other action", /if \(request\.kind === "passMany"\) return request\.plan\.targets\.map\(\(t\) => t\.applicationId\);/.test(page));

  const doc = await read("docs/APPLICANTS-LIST.md");
  check("docs/APPLICANTS-LIST.md §8 explains it and names this test", doc.includes("## 8. Pass on several at once") && doc.includes("scripts/bulk_pass.test.mjs") && doc.includes("Nobody is blocked"));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
