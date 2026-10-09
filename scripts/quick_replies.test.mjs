#!/usr/bin/env node
/**
 * Messages: ready-made replies (docs/MESSAGES.md, "Ready-made replies";
 * src/cockpit/lib/quickReplies.ts, src/cockpit/pages/Messages.tsx).
 *
 * The owner, 2026-10-09, looking at a declined applicant asking when they
 * would hear back: "without using AI so we don't burn credits, is it
 * possible to allow employers to draft a message to answer basic questions
 * like that ... she's already been declined maybe." These checks pin:
 *  - which reply is offered first for where the applicant stands;
 *  - what each one says, and what none of them says (no date promised, no
 *    reason given for a decline, no score);
 *  - the decision is told in the decline note's own words;
 *  - no AI, no request: the file imports nothing that could make one;
 *  - the wiring: only the hiring team sees them, only while the box is
 *    empty, and a tap fills the box and sends nothing.
 *
 * Run with: node scripts/quick_replies.test.mjs
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

const read = (rel) => readFile(path.join(ROOT, rel), "utf8");
const Q = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/quickReplies.ts")).href);
const D = await import(pathToFileURL(path.join(ROOT, "src/lib/declineNote.ts")).href);

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
/** Source with its comments taken out: a pin must not pass on a comment. */
const code = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const JOB = "Chat Support Team Leader";
const ctx = (over = {}) => ({ status: "reviewing", name: "Ana Reyes", jobTitle: JOB, ...over });
const ids = (c) => Q.quickRepliesFor(c).map((r) => r.id);
const first = (c) => Q.quickRepliesFor(c)[0];

console.log("\nWhere the applicant stands");
{
  const sit = (status, more = {}) => Q.replySituation({ status, ...more });
  check("declined, from the chat's status or from their record", sit("rejected") === "declined" && sit(null, { stage: "Rejected" }) === "declined" && sit("REJECTED") === "declined");
  check("invited to interview", sit("interview") === "interview");
  check("tests still to do: on the form, or still testing", sit("in_progress") === "testing" && sit("pending", { stillTesting: true }) === "testing");
  check("finished and waiting on a decision", sit("reviewing") === "reviewing" && sit("pending") === "reviewing" && sit(null) === "reviewing" && sit(undefined) === "reviewing");
  check("an offer and a hire are their own, with no ready-made status reply", sit("offered") === "offered" && sit("hired") === "hired" && sit(null, { stage: "Hired" }) === "hired");
  check("a decline wins over still testing (declined before they finished)", sit("rejected", { stillTesting: true }) === "declined");
}

console.log("\nWhich replies are offered, the one that fits first");
{
  check("declined: the decision, then 'got your message'", show(ids(ctx({ status: "rejected" }))) === show(["decision", "received"]));
  check("reviewing: still reviewing, then 'got your message'", show(ids(ctx())) === show(["reviewing", "received"]));
  check("tests to do: steps still to do", show(ids(ctx({ status: "in_progress" }))) === show(["testing", "received"]));
  check("interview: about the interview", show(ids(ctx({ status: "interview" }))) === show(["interview", "received"]));
  check("offered or hired: only 'got your message' (those have their own words elsewhere)", show(ids(ctx({ status: "offered" }))) === show(["received"]) && show(ids(ctx({ status: "hired" }))) === show(["received"]));
  check("every reply has a short label for its button", ["rejected", "reviewing", "in_progress", "interview", "hired"].every((s) => Q.quickRepliesFor(ctx({ status: s })).every((r) => r.label.length >= 8 && r.label.length <= 26 && r.text.length > 40)));
}

console.log("\nWhat they say");
{
  const all = ["rejected", "reviewing", "in_progress", "interview", "offered", "hired"].flatMap((s) => Q.quickRepliesFor(ctx({ status: s })));
  check("every reply greets them by first name and thanks them for writing", all.every((r) => r.text.startsWith("Hi Ana, thank you for your message")), show(all.filter((r) => !r.text.startsWith("Hi Ana, thank you for your message")).map((r) => r.id)));
  check("with no name it still reads", Q.quickRepliesFor(ctx({ name: "  " })).every((r) => r.text.startsWith("Hi, thank you for your message")));
  check("the job is named when it is known, and it reads without one", /Your application for the Chat Support Team Leader role is complete/.test(first(ctx()).text) && /Your application for the role is complete/.test(first(ctx({ jobTitle: null })).text));

  const decision = first(ctx({ status: "rejected" })).text;
  const [, notThisTime, doorOpen] = D.declineNoteLines(JOB);
  console.log(`   declined → ${decision}`);
  check("the decision is told in the decline note's own words", decision.includes(notThisTime) && decision.includes(doorOpen) && /We have finished reviewing your application for the Chat Support Team Leader role\./.test(decision));
  check("…with no reason given and nothing about a score or a test", !/because|score|%|test result|failed|did not pass|unfortunately/i.test(decision));
  console.log(`   reviewing → ${first(ctx()).text}`);
  check("still reviewing: says everyone who finishes gets a yes or no by email", /is complete, and we are reviewing it now\. Everyone who finishes every step gets a yes or no from us by email/.test(first(ctx()).text));
  console.log(`   testing → ${first(ctx({ status: "in_progress" })).text}`);
  check("tests to do: says it is not finished and where to carry on", /is not finished yet: there are still steps to complete\. You can pick up where you left off on your Applications page\./.test(first(ctx({ status: "in_progress" })).text));
  console.log(`   interview → ${first(ctx({ status: "interview" })).text}`);
  check("interview: a conversation, not another test, and what to do if the time does not work", /a conversation and not another test/.test(first(ctx({ status: "interview" })).text) && /If you cannot make it, tell us there which times work for you and we will set a new one\./.test(first(ctx({ status: "interview" })).text));
  check("no reply promises a date or a number of days", all.every((r) => !/\b(within|in) \d+|\bdays?\b|\bhours?\b|tomorrow|by (Monday|Tuesday|Wednesday|Thursday|Friday)|this week/i.test(r.text.replace("about 30 minutes", ""))), show(all.filter((r) => /\bdays?\b|\bhours?\b/i.test(r.text)).map((r) => r.id)));
  check("no reply is a wall of text (under 75 words)", all.every((r) => r.text.split(/\s+/).length < 75), show(all.map((r) => r.text.split(/\s+/).length)));
  check("one paragraph each: nothing to tidy before sending", all.every((r) => !/\n/.test(r.text) && !/ {2,}/.test(r.text) && !/undefined|null|\{|\}/.test(r.text)));
}

console.log("\nNo AI, and nothing sent by itself");
{
  const lib = code(await read("src/cockpit/lib/quickReplies.ts"));
  check("the replies are plain code: one import, the decline note, and no request of any kind", (lib.match(/^import /gm) ?? []).length === 1 && /import \{ declineNoteLines \} from "@\/lib\/declineNote";/.test(lib) && !/supabase|fetch\(|functions\.invoke|openai|rpc\(/i.test(lib));
  const page = code(await read("src/cockpit/pages/Messages.tsx"));
  check("only the hiring team gets them, never an applicant", /isCandidate \|\| !partner\s*\?\s*\[\]\s*:\s*quickRepliesFor\(\{/.test(page));
  check("they are chosen by the chat's own status and the applicant's record", /status: activeConv\?\.status,\s*stage: activeCandidate\?\.stage,\s*stillTesting: activeCandidate\?\.stillTesting,\s*name: partner\.name,\s*jobTitle: partner\.role,/.test(page));
  check("offered only while the box is empty", /\{quickReplies\.length > 0 && !draft\.trim\(\) && \(/.test(page));
  const fill = /const fillReply = \(text: string\) => \{([\s\S]*?)\n  \};/.exec(page)?.[1] ?? "";
  check("a tap fills the box and puts the cursor at the end; it sends nothing", /setDraft\(text\);/.test(fill) && /box\.setSelectionRange\(text\.length, text\.length\);/.test(fill) && !/handleSend|send\(/.test(fill), fill.slice(0, 200));
  check("each button says which reply it is", /onClick=\{\(\) => fillReply\(reply\.text\)\}/.test(page) && page.includes("data-quick-reply={reply.id}") && /Ready-made replies/.test(page));
  const doc = await read("docs/MESSAGES.md");
  check("docs/MESSAGES.md explains them and names this test", doc.includes("## Ready-made replies") && doc.includes("scripts/quick_replies.test.mjs") && /No AI/.test(doc));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
