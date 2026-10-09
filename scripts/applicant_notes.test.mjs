#!/usr/bin/env node
/**
 * The hiring team's notes on an applicant, and each reader's "viewed" mark
 * (docs/APPLICANTS-LIST.md §9): src/cockpit/lib/applicantNotes.ts and how
 * the list and the applicant's page take them in.
 *
 * The owner, 2026-10-08, going through 124 applicants: "is there a way you
 * can cleanly allow me to add some notes ... I like him or he did something
 * really good. That's why I picked him ... just a simple note that I can
 * also access. Also ... sometimes I forget which one I've already clicked on
 * and reviewed ... maybe they change after I've clicked on it once." These
 * checks prove:
 *  - a note is kept as written (line breaks and all), never empty, never
 *    longer than the database takes;
 *  - "Viewed" replaces "Needs review" on the list for an applicant this
 *    reader has opened, and only until the applicant does something new;
 *  - a looked-at applicant stays on their tab and in the count: it still
 *    needs a decision;
 *  - the same row object comes back when nothing is marked, so the list
 *    does not redraw for nothing;
 *  - the wiring: three database functions and nothing else, opening the
 *    page sets the mark, and nothing here is anywhere near what emails the
 *    applicant.
 *
 * The database half (who may read and write) is
 * scripts/applicant_notes.pglite.test.mjs.
 *
 * Run with: node scripts/applicant_notes.test.mjs
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

const N = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/applicantNotes.ts")).href);

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
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");
/** Source with its comments taken out: a pin must not pass on a comment. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

console.log("\nWhat a note is");
{
  check("kept as written, white space off both ends", N.cleanNoteBody("  Calm in the chat practice. My first pick.  ") === "Calm in the chat practice. My first pick.");
  check("line breaks are kept (a note can be a short list)", N.cleanNoteBody("Good:\n- calm\n- clear") === "Good:\n- calm\n- clear");
  check("…at most one empty line in a row, and no trailing spaces on a line", N.cleanNoteBody("one   \n\n\n\n\ntwo\r\nthree") === "one\n\ntwo\nthree");
  check("other control characters become spaces", N.cleanNoteBody("a\tb\u0000c") === "a b c");
  check("nothing, or only white space: no note", N.cleanNoteBody("") === null && N.cleanNoteBody("  \n \t ") === null && N.cleanNoteBody(null) === null && N.cleanNoteBody(7) === null && N.cleanNoteBody(["x"]) === null);
  check("the longest is what the database takes, and one more is refused, never cut", N.NOTE_MAX === 2000 && N.cleanNoteBody("x".repeat(2000))?.length === 2000 && N.cleanNoteBody("x".repeat(2001)) === null);
  check("it says who sees them", N.NOTES_PRIVATE_LINE === "Only your team sees these. The applicant never does.");
}

console.log("\nNotes by applicant");
{
  const notes = [
    { id: "1", application_id: "a", author_id: "me", body: "older", created_at: "2026-10-07T10:00:00Z" },
    { id: "2", application_id: "a", author_id: "you", body: "newer", created_at: "2026-10-08T09:00:00Z" },
    { id: "3", application_id: "b", author_id: "me", body: "only", created_at: "2026-10-08T08:00:00Z" },
    { id: "4", application_id: null, body: "junk" },
    null,
  ];
  const by = N.notesByApplication(notes);
  check("grouped, newest first", by.get("a").map((n) => n.id).join() === "2,1" && by.get("b").length === 1 && by.size === 2);
  check("nothing at all: an empty map", N.notesByApplication(null).size === 0 && N.notesByApplication([]).size === 0);
  check("the list's tooltip is the newest note, and says how many more", N.noteTitle({ count: 1, latest: "only" }) === "only" && N.noteTitle({ count: 2, latest: "newer" }) === "newer (and 1 more note)" && N.noteTitle({ count: 4, latest: "n" }) === "n (and 3 more notes)");
  check("a long note is cut for the tooltip only", N.noteTitle({ count: 1, latest: "y".repeat(400) }).length === 180);

  const NOW = new Date("2026-10-08T14:30:00Z");
  const EAST = "America/New_York";
  check("when it was written: today, yesterday, a date", N.noteWhen("2026-10-08T13:14:00Z", NOW, EAST) === "today at 9:14 AM" && N.noteWhen("2026-10-07T20:02:00Z", NOW, EAST) === "yesterday at 4:02 PM" && N.noteWhen("2026-10-01T15:30:00Z", NOW, EAST) === "Oct 1 at 11:30 AM");
  check("…with the year once it is another year", N.noteWhen("2025-12-30T15:30:00Z", NOW, EAST) === "Dec 30, 2025 at 10:30 AM");
  check("…by the reader's own calendar day, not UTC's", N.noteWhen("2026-10-08T03:30:00Z", NOW, EAST) === "yesterday at 11:30 PM");
  check("not a date: nothing", N.noteWhen("nope", NOW) === "" && N.noteWhen(null, NOW) === "");
  check("who wrote it, for the reader", N.noteAuthorWords("me", "me") === "You" && N.noteAuthorWords("you", "me") === "A teammate" && N.noteAuthorWords(null, "me") === "A teammate");
}

console.log("\nViewed");
{
  check("opened after their last move: seen", N.seenSince("2026-10-08T12:00:00Z", "2026-10-08T11:00:00Z") === true);
  check("they did something after it was opened: not seen any more", N.seenSince("2026-10-08T12:00:00Z", "2026-10-08T12:00:01Z") === false);
  check("the same moment counts as seen", N.seenSince("2026-10-08T12:00:00Z", "2026-10-08T12:00:00Z") === true);
  check("no activity on file: opening it is seeing it", N.seenSince("2026-10-08T12:00:00Z", null) === true);
  check("never opened, or a mark that is not a date: not seen", N.seenSince(null, "2026-10-08T11:00:00Z") === false && N.seenSince(undefined, null) === false && N.seenSince("nope", null) === false);
  check("the marks by application", show([...N.viewsIndex([{ application_id: "a", viewed_at: "t1" }, { application_id: null, viewed_at: "t2" }, null])]) === show([["a", "t1"]]));

  const row = (id, over = {}) => ({ id, name: id, status: "reviewing", tab: "needs-review", chip: { label: "Needs review", tone: "amber" }, lastActiveAt: "2026-10-08T11:00:00Z", ...over });
  const rows = [
    row("opened"),
    row("unopened"),
    row("opened-then-they-moved", { lastActiveAt: "2026-10-08T13:00:00Z" }),
    row("interview", { status: "interview", tab: "interview", chip: { label: "Interview", tone: "jade" } }),
    row("part-way", { tab: "part-way", chip: null }),
  ];
  const views = new Map([["opened", "2026-10-08T12:00:00Z"], ["opened-then-they-moved", "2026-10-08T12:00:00Z"], ["interview", "2026-10-08T12:00:00Z"], ["part-way", "2026-10-08T12:00:00Z"]]);
  const notes = N.notesByApplication([
    { id: "1", application_id: "unopened", author_id: "me", body: "first", created_at: "2026-10-07T10:00:00Z" },
    { id: "2", application_id: "unopened", author_id: "me", body: "second", created_at: "2026-10-08T10:00:00Z" },
  ]);
  const marked = N.markSeenAndNoted(rows, views, notes);
  const by = Object.fromEntries(marked.map((r) => [r.id, r]));
  check("a Needs-review applicant this reader opened reads 'Viewed', quietly", by.opened.viewed === true && show(by.opened.chip) === show({ label: "Viewed", tone: "muted" }));
  check("…and stays on the Needs-review tab: it still needs a decision", by.opened.tab === "needs-review");
  check("one not opened still reads 'Needs review'", by.unopened.viewed === undefined && by.unopened.chip.label === "Needs review");
  check("one opened part-way, who has since done more, needs review again", by["opened-then-they-moved"].viewed === undefined && by["opened-then-they-moved"].chip.label === "Needs review");
  check("any other chip is left as it is (Interview stays Interview)", by.interview.viewed === true && by.interview.chip.label === "Interview");
  check("no chip, no chip: someone still taking tests is not given one", by["part-way"].viewed === true && by["part-way"].chip === null);
  check("the team's notes ride on the row: how many, and the newest", show(by.unopened.note) === show({ count: 2, latest: "second" }) && by.opened.note === undefined);
  check("a row with no mark is the very same object (the list does not redraw it)", marked[1] !== rows[1] && N.markSeenAndNoted(rows, new Map(), new Map()) === rows && N.markSeenAndNoted([rows[1]], new Map([["someone-else", "t"]]), new Map())[0] === rows[1]);
  check("the rows handed in are never changed", rows[0].chip.label === "Needs review" && rows[0].viewed === undefined);
}

console.log("\nThe wiring");
{
  const hook = code(await read("src/cockpit/hooks/useApplicantNotes.ts"));
  const list = code(await read("src/cockpit/pages/Applicants.tsx"));
  const page = code(await read("src/cockpit/pages/CandidateDetail.tsx"));
  const panel = code(await read("src/cockpit/components/ApplicantNotesPanel.tsx"));
  const rowFile = code(await read("src/cockpit/components/ApplicantRow.tsx"));
  const types = await read("src/integrations/supabase/types.ts");

  check("three database functions, and nothing else writes", ["add_applicant_note", "delete_applicant_note", "mark_applicant_viewed"].every((fn) => hook.includes(`supabase.rpc("${fn}"`)) && !/\.(insert|update|upsert|delete)\(/.test(hook));
  check("the two lists are read plainly, with no join", /\.from\("applicant_notes"\)\.select\(NOTE_COLUMNS\)/.test(hook) && /\.from\("applicant_views"\)\.select\(VIEW_COLUMNS\)/.test(hook) && N.NOTE_COLUMNS === "id, application_id, author_id, body, created_at" && N.VIEW_COLUMNS === "application_id, viewed_at");
  check("nowhere near what emails the applicant or changes their status", !/useUpdateApplication|emailNotifications|send-notification-email|\.from\("applications"\)/.test(hook + panel));
  check("before the migration: no notes, nothing viewed, never an error card", (hook.match(/if \(isRecordNotDeployed\(error\)\) return \{ rows: \[\], deployed: false \};/g) ?? []).length === 2 && /if \(!applicationId \|\| !user \|\| !data\.deployed\) return;/.test(hook));
  check("a note is cleaned before it is sent, and an empty one is never sent", /const body = cleanNoteBody\(raw\);\s*if \(!body\) \{/.test(hook));
  check("taking a note away offers to put it back", /toast\.success\("Note removed", \{ action: \{ label: "Undo"/.test(hook));
  check("opening an applicant's page sets this reader's mark", /const \{ markViewed \} = useApplicantViews\(\);/.test(page) && /if \(openedId\) void markViewed\(openedId\);/.test(page));
  // 2026-10-08: the mark was written about ten times a second for as long as an applicant's page was open.
  check("…once per visit: the query key is the same array from one render to the next, so the page's effect does not run again on every render", /const key = useMemo\(\(\) => applicantNoteKeys\.views\(uid\), \[uid\]\);/.test(hook) && /const key = useMemo\(\(\) => applicantNoteKeys\.notes\(uid\), \[uid\]\);/.test(hook) && !/const key = applicantNoteKeys\.(views|notes)\(user\?\.id\);/.test(hook));
  check("…and whatever calls it, a second call inside a minute writes nothing", /export const MARK_VIEWED_ONCE_MS = 60_000;/.test(hook) && /const last = lastMarked\.current\.get\(applicationId\);\s*if \(last != null && Date\.now\(\) - last < MARK_VIEWED_ONCE_MS\) return;\s*lastMarked\.current\.set\(applicationId, Date\.now\(\)\);/.test(hook) && hook.indexOf("lastMarked.current.set(applicationId") < hook.indexOf('supabase.rpc("mark_applicant_viewed"'));
  check("the page has the Notes box in every layout", (page.match(/<ApplicantNotesPanel applicationId=\{c\.id\} firstName=\{first\} \/>/g) ?? []).length === 2 && (page.match(/\{notesPanel\}/g) ?? []).length === 2);
  check("the list takes both marks in, after the shortlist's", /markSeenAndNoted\(markShortlisted\(markBlocked\(listRows, blocks\.blocked\), shortlist\.ids\), applicantViews\.viewedAt, applicantNotes\.byApplication\)/.test(list));
  check("a noted row carries the note mark, on the table and on the phone card", (rowFile.match(/\{row\.note && <NoteMark note=\{row\.note\} \/>\}/g) ?? []).length === 2);
  check("'Viewed' has a quiet look of its own", /muted: \{ color: "var\(--ink-3\)"/.test(rowFile));
  check("the box stops at the database's limit, and Save waits for words", /maxLength=\{NOTE_MAX\}/.test(panel) && /const ready = draft\.trim\(\)\.length > 0 && !saving;/.test(panel) && /disabled=\{!ready\}/.test(panel));
  check("only the writer or the job's owner is offered the remove button", /const isOwner = role === "employer" && !isTeamMember;/.test(panel) && /\{\(mine \|\| isOwner\) && \(/.test(panel));
  check("the app knows the two tables and three functions by type", ["applicant_notes: {", "applicant_views: {", "add_applicant_note: {", "delete_applicant_note: {", "mark_applicant_viewed: {"].every((t) => types.includes(t)));

  const migration = await read("supabase/migrations/" + (await import("node:fs")).readdirSync(path.join(ROOT, "supabase/migrations")).find((n) => n.endsWith("_applicant_notes_and_views.sql")));
  check("in the database, nobody writes either table directly", (migration.match(/REVOKE ALL ON public\.applicant_(notes|views) FROM PUBLIC, anon, authenticated;/g) ?? []).length === 2 && (migration.match(/GRANT SELECT ON public\.applicant_(notes|views) TO authenticated;/g) ?? []).length === 2);
  check("…a note is readable by the job's team only, a mark by its own person only", /USING \(\s*public\.is_job_owner\(job_id, \(SELECT auth\.uid\(\)\)\)\s*OR public\.is_active_team_member_for_job\(job_id, \(SELECT auth\.uid\(\)\)\)\s*\);/.test(migration) && /USING \(viewer_id = \(SELECT auth\.uid\(\)\)\);/.test(migration));

  const doc = await read("docs/APPLICANTS-LIST.md");
  check("docs/APPLICANTS-LIST.md explains both and names both tests", doc.includes("## 9. Notes, and \"Viewed\"") && doc.includes("scripts/applicant_notes.test.mjs") && doc.includes("scripts/applicant_notes.pglite.test.mjs"));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
