#!/usr/bin/env node
/**
 * The hiring team's shortlist (docs/APPLICANTS-LIST.md §7):
 * src/cockpit/lib/shortlist.ts, and how the Applicants list takes it in
 * (src/cockpit/lib/applicantList.ts).
 *
 * The owner, 2026-10-07: "I need you to also add a feature where I can add
 * them as favorites. Maybe do a short list for this particular job." These
 * checks prove:
 *  - who can be on it: anyone still in the running, never someone declined
 *    or blocked;
 *  - marking leaves everyone on their own tab and in All, and adds them to
 *    Shortlist, whose count follows the job in view (it is per job);
 *  - the same row object comes back for the same input, so a 300-row list
 *    does not redraw for a mark it already had;
 *  - the list holds still: marking on All moves no one and nothing waits;
 *    taking someone off on the Shortlist tab (his own click) removes that row
 *    at once and Undo puts it back in place; a teammate's change waits in the
 *    update bar instead of pulling a row from under the cursor;
 *  - "shortlist" means one thing on the staff screens: the pipeline stage
 *    that used to carry the name is "In review" / "Review";
 *  - the wiring: one function, a query the live sync does not refetch
 *    mid-click, no confirm, and nothing on someone declined.
 *
 * The database half is scripts/shortlist.pglite.test.mjs.
 *
 * Run with: node scripts/shortlist.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.TZ = "UTC";

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

const L = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/applicantList.ts")).href);
const S = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/shortlist.ts")).href);
const B = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/blockedApplicants.ts")).href);

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
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const NOW = Date.parse("2026-10-07T12:00:00Z");
const TAB_BY_STATUS = { rejected: "declined", interview: "interview", offered: "interview", hired: "interview" };
/** One list row, with only what the list's filters, sort and tabs read. */
function row(id, over = {}) {
  const status = over.status ?? "reviewing";
  return {
    id,
    jobId: "job-a",
    jobTitle: "Support lead",
    candidateId: `person-${id}`,
    name: `Person ${id.toUpperCase()}`,
    email: null,
    status,
    tab: TAB_BY_STATUS[status] ?? "needs-review",
    country: "Unknown",
    appliedAt: "2026-10-06T10:00:00Z",
    lastActiveAt: null,
    score: null,
    flags: { count: 0, kinds: [], tooltip: null },
    below: [],
    finished: true,
    currentStepId: null,
    phone: null,
    ...over,
  };
}
const state = (patch = {}) => ({ ...L.DEFAULT_LIST_STATE, ...patch });
const ids = (rows) => rows.map((r) => r.id);

/* ── 1. Who can be on it ───────────────────────────────────────────────── */

console.log("\n1. Who can be on the shortlist");
{
  for (const status of ["in_progress", "pending", "reviewing", "interview", "offered", "hired"]) {
    check(`${status}: yes`, S.canShortlist(status) === true);
  }
  check("declined: no (passing on someone is how they leave it)", S.canShortlist("rejected") === false);
  check("blocked: no, whatever their status", S.canShortlist("reviewing", true) === false && S.canShortlist("interview", true) === false);
  check("no status yet: yes", S.canShortlist(null) === true && S.canShortlist(undefined) === true);

  const index = S.shortlistIndex([{ application_id: "a" }, { application_id: "b", job_id: "job-a" }, { application_id: "" }, null, { job_id: "x" }]);
  check("the index is the marked application ids, and skips rows without one", index.size === 2 && index.has("a") && index.has("b"), show([...index]));
  check("nothing to read is nobody", S.shortlistIndex(null).size === 0 && S.shortlistIndex(undefined).size === 0);
}

/* ── 2. Marking rows ───────────────────────────────────────────────────── */

console.log("\n2. Marking the list's rows");
const base = [
  row("a", { score: 90 }),
  row("b", { score: 80, tab: "taking-tests", finished: false }),
  row("c", { score: 70, status: "interview" }),
  row("d", { score: 60, status: "rejected" }),
  row("e", { score: 50, tab: "part-way", finished: false, status: "in_progress" }),
  row("f", { score: 40, jobId: "job-b", jobTitle: "Night shift" }),
];
{
  const marked = S.markShortlisted(base, new Set(["a", "c", "d", "f", "zzz"]));
  const on = marked.filter((r) => r.shortlisted).map((r) => r.id);
  check("marks the ones on it", eq(on, ["a", "c", "f"]), show(on));
  check("…not someone declined, though their row is in the table", marked.find((r) => r.id === "d").shortlisted !== true);
  check("…and an id that is not on the list is simply ignored", marked.length === base.length);
  check("everyone keeps their own tab", eq(marked.map((r) => r.tab), base.map((r) => r.tab)), show(marked.map((r) => r.tab)));
  check("an unmarked row is the very same object", marked[1] === base[1] && marked[4] === base[4] && marked[3] === base[3]);
  check("the input rows are not changed", base.every((r) => r.shortlisted === undefined));
  const again = S.markShortlisted(base, new Set(["a", "c", "d", "f"]));
  check("marked the same way again, the same objects come back (no redraw)", again[0] === marked[0] && again[2] === marked[2] && again[5] === marked[5]);
  check("with nobody marked, the very same array comes back", S.markShortlisted(base, new Set()) === base);
  check("with marks that match no row here, the same array too", S.markShortlisted(base, new Set(["zzz"])) === base);

  // After the blocks: a blocked person is not on it.
  const blocked = B.markBlocked(base, new Map([["person-c", { candidate_id: "person-c" }]]));
  const both = S.markShortlisted(blocked, new Set(["a", "c"]));
  check("a blocked person is not marked, even with an open application", both.find((r) => r.id === "c").shortlisted !== true && both.find((r) => r.id === "c").blocked === true);
  check("…the rest still are", both.find((r) => r.id === "a").shortlisted === true);
}

/* ── 3. The Shortlist tab ──────────────────────────────────────────────── */

console.log("\n3. The Shortlist tab");
const marks = new Set(["a", "c", "f"]);
const rows = S.markShortlisted(base, marks);
{
  check("it is a tab, second on screen, called Shortlist", L.APPLICANT_TABS[1] === "shortlist" && L.TAB_LABELS.shortlist === "Shortlist");
  check("?tab=shortlist opens it", L.parseListState("?tab=shortlist").tab === "shortlist" && L.serializeListState(state({ tab: "shortlist" })).get("tab") === "shortlist");

  const before = L.tabCounts(base);
  const counts = L.tabCounts(rows);
  check("the count is who is marked", counts.shortlist === 3 && before.shortlist === 0, show(counts));
  const own = ["needs-review", "taking-tests", "part-way", "interview", "declined", "blocked"];
  check("no other count changes: they stay on their own tab", own.every((t) => counts[t] === before[t]) && counts.all === before.all, show(counts));
  check("the own tabs still add up to everyone", own.reduce((n, t) => n + counts[t], 0) === rows.length);

  const view = L.applyListState(rows, state({ tab: "shortlist" }), NOW);
  check("the tab lists exactly them, best score first", eq(ids(view.matched), ["a", "c", "f"]), show(ids(view.matched)));
  check("All still lists everyone", L.applyListState(rows, state(), NOW).total === rows.length);
  check("and each is still on their own tab", eq(ids(L.applyListState(rows, state({ tab: "interview" }), NOW).matched), ["c"]) && L.applyListState(rows, state({ tab: "needs-review" }), NOW).matched.some((r) => r.id === "a"));

  // "for this particular job": the job in view scopes the tab and its count.
  const jobA = L.applyListState(rows, state({ tab: "shortlist", job: "job-a" }), NOW);
  const jobB = L.applyListState(rows, state({ tab: "shortlist", job: "job-b" }), NOW);
  check("one job in view: that job's shortlist only", eq(ids(jobA.matched), ["a", "c"]) && jobA.tabCounts.shortlist === 2, show([ids(jobA.matched), jobA.tabCounts.shortlist]));
  check("…and the other job has its own", eq(ids(jobB.matched), ["f"]) && jobB.tabCounts.shortlist === 1);

  // The filters and the search still narrow it.
  check("a filter narrows it like any tab", eq(ids(L.applyListState(rows, state({ tab: "shortlist", score: "70-up" }), NOW).matched), ["a", "c"]));
  check("so does the search", eq(ids(L.applyListState(rows, state({ tab: "shortlist", q: "person c" }), NOW).matched), ["c"]));

  // Declined, then: passing on someone takes them off.
  const passedOn = S.markShortlisted(base.map((r) => (r.id === "a" ? { ...r, status: "rejected", tab: "declined" } : r)), marks);
  check("passing on someone takes them off the tab and the count", eq(ids(L.applyListState(passedOn, state({ tab: "shortlist" }), NOW).matched), ["c", "f"]) && L.tabCounts(passedOn).shortlist === 2);
  // A row on the Blocked tab is on nothing else, marked or not.
  const hidden = rows.map((r) => (r.id === "a" ? { ...r, tab: "blocked" } : r));
  check("someone on the Blocked tab is never on Shortlist", !L.applyListState(hidden, state({ tab: "shortlist" }), NOW).matched.some((r) => r.id === "a") && L.tabCounts(hidden).shortlist === 2);
}

/* ── 4. The list holds still ───────────────────────────────────────────── */

console.log("\n4. The held list");
{
  const all = state();
  const liveAll = L.applyListState(rows, all, NOW);
  const holdAll = L.holdApplicantList(rows, liveAll, all);
  // He marks "b" from All.
  const more = S.markShortlisted(base, new Set([...marks, "b"]));
  const heldAll = L.heldListView(L.settleApplicantHold(holdAll, ["b"]), L.applyListState(more, all, NOW), all);
  check("marking someone on All moves no one", eq(ids(heldAll.matched), ids(liveAll.matched)) && eq(heldAll.updates, { fresh: 0, moved: 0 }), show(heldAll.updates));
  check("…and the Shortlist count is up at once", heldAll.tabCounts.shortlist === 4 && heldAll.matched.find((r) => r.id === "b").shortlisted === true);

  const tab = state({ tab: "shortlist" });
  const live0 = L.applyListState(rows, tab, NOW);
  const hold0 = L.holdApplicantList(rows, live0, tab);
  const fewer = S.markShortlisted(base, new Set(["a", "f"]));
  const liveFewer = L.applyListState(fewer, tab, NOW);

  // His own click: settled first (Applicants.tsx), so the row leaves at once.
  const settled = L.settleApplicantHold(hold0, ["c"]);
  const mine = L.heldListView(settled, liveFewer, tab);
  check("taken off by him on the Shortlist tab: the row leaves at once", eq(ids(mine.matched), ["a", "f"]) && mine.tabCounts.shortlist === 2, show(ids(mine.matched)));
  check("…and nothing waits in the update bar", eq(mine.updates, { fresh: 0, moved: 0 }), show(mine.updates));
  const undone = L.heldListView(settled, live0, tab);
  check("Undo puts them back exactly where they were", eq(ids(undone.matched), ["a", "c", "f"]) && eq(undone.updates, { fresh: 0, moved: 0 }), show(ids(undone.matched)));

  // A teammate's change: the row stays under his cursor, and the bar says so.
  const theirs = L.heldListView(hold0, liveFewer, tab);
  check("taken off by a teammate: the row stays drawn, without its mark", eq(ids(theirs.matched), ["a", "c", "f"]) && theirs.matched.find((r) => r.id === "c").shortlisted !== true);
  check("…and 1 waits in the update bar", theirs.updates.moved === 1 && theirs.updates.fresh === 0, show(theirs.updates));
  const added = L.heldListView(hold0, L.applyListState(more, tab, NOW), tab);
  check("added by a teammate: 1 waits, nobody jumps in", eq(ids(added.matched), ["a", "c", "f"]) && added.updates.moved === 1, show(added.updates));

  // An empty Shortlist has nothing to keep still: the first mark shows.
  const none = S.markShortlisted(base, new Set());
  const holdEmpty = L.holdApplicantList(none, L.applyListState(none, tab, NOW), tab);
  const first = L.heldListView(holdEmpty, live0, tab);
  check("on an empty Shortlist a first mark is counted as waiting, so the page takes the list afresh", first.matched.length === 0 && first.updates.moved === 3, show(first.updates));
}

/* ── 5. Words ──────────────────────────────────────────────────────────── */

console.log("\n5. Words");
{
  check("the action: add / take off", S.shortlistActionLabel(false) === "Add to shortlist" && S.shortlistActionLabel(true) === "Take off shortlist");
  check("the profile's button says where they stand", S.shortlistButtonLabel(false) === "Add to shortlist" && S.shortlistButtonLabel(true) === "On your shortlist");
  check("one person, by name", S.shortlistDoneWords(["Maria Santos"], true) === "Maria Santos is on your shortlist" && S.shortlistDoneWords(["Maria Santos"], false) === "Maria Santos is off your shortlist");
  check("several, by count", S.shortlistDoneWords(["A", "B", "C"], true) === "3 applicants added to your shortlist" && S.shortlistDoneWords(["A", "B"], false) === "2 applicants taken off your shortlist");
  check("it says it is private and that the applicant is not told", /only your team/i.test(S.SHORTLIST_PRIVATE_LINE) && /isn't told/.test(S.SHORTLIST_PRIVATE_LINE));
  check("the empty tab says how to add someone", /Add to shortlist/.test(S.SHORTLIST_EMPTY_LINE));
  const words = [S.SHORTLIST_PRIVATE_LINE, S.SHORTLIST_EMPTY_LINE, S.shortlistDoneWords(["A"], true), S.shortlistDoneWords(["A", "B"], false)].join(" ");
  check("no dashes standing in for punctuation", !/[—–]/.test(words));
}

/* ── 6. "Shortlist" means one thing on the staff screens ───────────────── */

console.log("\n6. One meaning");
{
  const data = code(await read("src/cockpit/hooks/useCockpitData.ts"));
  check("the pipeline stage every applicant reaches is 'Review', not 'Shortlist'", /reviewing:\s*"Review"/.test(data) && !/reviewing:\s*"Shortlist"/.test(data));
  const dialogs = code(await read("src/cockpit/components/ApplicantDecisionDialogs.tsx"));
  check("its confirm asks about review, and no longer promises a shortlist", /label === "Review"/.test(dialogs) && /into review\?/.test(dialogs) && !/to your shortlist\?/.test(dialogs));
  const mappers = code(await read("src/cockpit/lib/mappers.ts"));
  check("the funnel's stage is labelled 'In review'", /key:\s*"shortlist",\s*label:\s*"In review"/.test(mappers));
  const jobs = code(await read("src/cockpit/pages/Jobs.tsx"));
  check("the Jobs tile says 'Applied → in review'", /label:\s*"Applied → in review"/.test(jobs) && !/Applied → shortlist/.test(jobs));
}

/* ── 7. The wiring ─────────────────────────────────────────────────────── */

console.log("\n7. The wiring");
{
  const hook = code(await read("src/cockpit/hooks/useShortlist.ts"));
  check("the hook changes it through set_applications_shortlisted", /\.rpc\(\s*"set_applications_shortlisted"/.test(hook));
  check("its query is not under [\"applications\"]: the live sync refetches those on every applicant's write, and would undo a click mid-flight", /list:\s*\(uid[^)]*\)\s*=>\s*\["shortlist",/.test(hook) && !/\["applications",\s*"shortlist"/.test(hook));
  check("a teammate's change arrives on a clock, with no channel of its own", /refetchInterval:\s*60_000/.test(hook) && !/\.channel\(/.test(hook));
  check("it shows on the click and is put back if the server refuses", /onMutate/.test(hook) && /onError/.test(hook) && /apply\(skipped, !on\)/.test(hook));
  check("taking someone off offers Undo", /label:\s*"Undo"/.test(hook));

  const menu = code(await read("src/cockpit/components/ApplicantRowMenu.tsx"));
  check("the row menu offers it only to someone who can be on it", /shortlist && canShortlist\(status, blocked\)/.test(menu));
  const requestKinds = /export type ApplicantActionRequest =([\s\S]*?);\n/.exec(menu)?.[1] ?? "";
  check("…and it opens no confirm (it is not one of the menu's dialogs)", requestKinds.length > 0 && !/shortlist/i.test(requestKinds), requestKinds.slice(0, 80));

  const list = code(await read("src/cockpit/pages/Applicants.tsx"));
  check("the list marks its rows after the blocks", /markShortlisted\(markBlocked\(listRows, blocks\.blocked\), shortlist\.ids\)/.test(list));
  check("…waits for the shortlist before it draws", /isLoading = listLoading \|\| blocks\.isLoading \|\| shortlist\.isLoading/.test(list));
  check("…and settles his own click first, so it shows at once", /settle\(\[r\.id\]\);\s*void latest\.current\.setShortlisted/.test(list));

  const rowFile = code(await read("src/cockpit/components/ApplicantRow.tsx"));
  check("the table row and the phone card both draw the bookmark", (rowFile.match(/row\.shortlisted && <ShortlistMark \/>/g) ?? []).length === 2);
  check("…with words for a screen reader", /sr-only">On your shortlist</.test(rowFile));

  const profile = code(await read("src/cockpit/pages/CandidateDetail.tsx"));
  check("the profile has the toggle, with its state announced", /data-shortlist-toggle/.test(profile) && /aria-pressed=\{onShortlist\}/.test(profile));
  check("…only for someone who can be on it", /const canMark = canShortlist\(status, !!blockRow\)/.test(profile) && /canMark \?/.test(profile));
  check("…on the computer's top line and the phone's header", /shortlistButton\(false\)/.test(profile) && /shortlistButton\(true\)/.test(profile));

  const preview = code(await read("src/dev-preview/install.ts"));
  check("the offline preview answers the same function", /set_applications_shortlisted:/.test(preview) && /previewShortlistHandlers\(tables, ROLE_USERS\[role\]\)/.test(preview));
  const types = await read("src/integrations/supabase/types.ts");
  check("the database types know the table and the function", /shortlisted_applications: \{/.test(types) && /set_applications_shortlisted: \{/.test(types));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
