#!/usr/bin/env node
/**
 * The note an applicant gets when the team passes on them, and the confirm
 * the owner sees before it is sent (docs/APPLICANTS-LIST.md §6, "Pass is a
 * plain confirm").
 *
 * The words live twice, because the edge functions cannot import from src/:
 * src/lib/declineNote.ts (the Pass dialog's preview) and
 * supabase/functions/_shared/declineNote.ts (the email). If they ever differ,
 * the owner confirms one note and the applicant reads another.
 *
 * Run with: node scripts/decline_note.test.mjs
 */
import { readFile } from "node:fs/promises";
import { declineNoteLines, declineNoteText } from "../src/lib/declineNote.ts";
import { declineNoteLines as serverLines } from "../supabase/functions/_shared/declineNote.ts";

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}
const src = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

console.log("\nOne wording, two files:\n");
const [page, server] = await Promise.all([src("src/lib/declineNote.ts"), src("supabase/functions/_shared/declineNote.ts")]);
check("the page's copy and the email's copy are the same file", page === server);
const JOB = "Chat Support Team Leader (Zulu Royal & Zulu Rush)";
check("both give the same note", JSON.stringify(declineNoteLines(JOB)) === JSON.stringify(serverLines(JOB)));

console.log("\nThe note:\n");
const lines = declineNoteLines(JOB);
const text = declineNoteText(JOB);
check("three sentences, short", lines.length === 3 && text.split(/\s+/).length <= 70, `${text.split(/\s+/).length} words`);
check("it thanks them for the work, by the job's name", lines[0] === `Thank you for applying for the ${JOB} role, and for the time and effort you put into every step.`);
check("it says no plainly, as a fit for this role now, not a verdict on them", lines[1] === "It wasn't the right fit for this role at the moment, so we won't be moving forward this time.");
check("it leaves the door open", /Please don't be discouraged/.test(lines[2]) && /welcome to apply again/.test(lines[2]) && /wish you the very best/.test(lines[2]));
check("it gives no reason and compares them to nobody", !/because|score|test|other candidates|unfortunately|regret/i.test(text));
check("with no job title it still reads", declineNoteLines(null)[0] === "Thank you for applying for the role, and for the time and effort you put into every step." && declineNoteLines("  ")[0] === declineNoteLines(undefined)[0]);
check("the preview is the same words as one paragraph", text === lines.join(" "));

console.log("\nThe email:\n");
const email = await src("supabase/functions/send-notification-email/index.ts");
const template = (email.match(/status_rejected: \{\s*\n\s*subject:[\s\S]*?\n    \},/) ?? [""])[0];
check("the decline email is built from the shared note, escaped", /import \{ declineNoteLines \} from "\.\.\/_shared\/declineNote\.ts";/.test(email) && /declineNoteLines\(data\.job_title\)\.map\(\(line\) => `<p>\$\{esc\(line\)\}<\/p>`\)/.test(template));
check("it is signed by the team, not by HireFlow", /`— \$\{teamLabel\}`/.test(template));
check("the old wording is gone", !/move forward with other candidates/.test(email));

console.log("\nThe confirm:\n");
const dialogs = await src("src/cockpit/components/ApplicantDecisionDialogs.tsx");
const rowMenu = await src("src/cockpit/components/ApplicantRowMenu.tsx");
const list = await src("src/cockpit/pages/Applicants.tsx");
const passDialog = (dialogs.match(/open=\{open === "reject" && !!candidate\}[\s\S]*?onClose=\{onClose\}\s*\n\s*\/>/) ?? [""])[0];
check("the profile's Pass asks for no reason", passDialog.length > 0 && !/withReason|reasonLabel/.test(passDialog) && /onConfirm=\{\(\) => onReject\(\)\}/.test(passDialog));
check("…and shows the note they will get", /note=\{candidate \? <DeclineNotePreview jobTitle=\{candidate\.role\} \/> : null\}/.test(passDialog) && /declineNoteText\(jobTitle\)/.test(dialogs));
check("the list's Pass is the same confirm, in the same words", /description=\{passDialogWords\(who, request\.offered\)\}/.test(rowMenu) && /note=\{<DeclineNotePreview jobTitle=\{request\.jobTitle\} \/>\}/.test(rowMenu) && /await reject\(request\.target\.applicationId\);/.test(rowMenu));
check("no Pass dialog asks why any more", !/Why, in a line\? Only you see this\./.test(dialogs + rowMenu));
check("the list tells the confirm which job the note names", /jobTitle: row\.jobTitle,/.test(list) && /onRequest\(\{ kind: "pass", target, offered, jobTitle \}\)/.test(rowMenu));
check("the confirm says what happens, and that the note is in the owner's name", /comes off your list and gets this note in your name:/.test(dialogs) && /offer is taken back, and \$\{who\} gets this note in your name:/.test(dialogs));

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
