/**
 * The Documents page's filters (src/cockpit/lib/documentFilters.ts). The
 * owner, 2026-10-10: "Documents tab also need a filter. A lot of filters."
 *
 * Holds the rules in words: which status each letter and request falls in,
 * that the counts on the status row follow the other filters, the kinds,
 * the job, the search, the order; and that the page opens on "Your turn"
 * while something waits on him.
 */
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(resolve(tmpdir(), "document-filters-"));
const outfile = resolve(dir, "documentFilters.mjs");
await build({ entryPoints: [resolve(root, "src/cockpit/lib/documentFilters.ts")], bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent" });
const f = await import(pathToFileURL(outfile).href);
rmSync(dir, { recursive: true, force: true });
const read = (p) => readFileSync(resolve(root, p), "utf8");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) passed += 1;
  else {
    failed += 1;
    console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ""}`);
  }
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);

const NOW = Date.parse("2026-10-10T12:00:00Z");
const doc = (id, fields) => ({ id, title: `Offer letter - ${fields.candidate ?? "Jason"}`, type: "offer_letter", candidate: "Jason", avatar: id, role: "Chat Support Team Leader", status: "Pending", statusNote: "", updated: "", createdAt: "2026-10-09T10:00:00Z", expiresAt: "2026-10-14T23:59:59Z", candidateSignedAt: null, isVoided: false, ...fields });
const req = (id, fields) => ({ id, status: "pending", document_type: "government_id", custom_document_name: null, due_date: "2026-10-13", created_at: "2026-10-10T09:00:00Z", personName: "Jason", jobTitle: "Chat Support Team Leader", ...fields });
const title = (r) => (r.custom_document_name || { government_id: "Government ID", payment_email: "Payment email", nbi_clearance: "NBI clearance" }[r.document_type] || "Document");

// --- where each thing stands ---------------------------------------------------
eq("a letter they have not signed waits on them", f.docStatus(doc("d1", {}), NOW), "theirs");
eq("a letter they signed is your turn", f.docStatus(doc("d2", { candidateSignedAt: "2026-10-10T09:12:00Z" }), NOW), "yours");
eq("signed by both is done", f.docStatus(doc("d3", { status: "Signed", candidateSignedAt: "x" }), NOW), "done");
eq("declined is closed", f.docStatus(doc("d4", { status: "Declined" }), NOW), "closed");
eq("withdrawn is closed", f.docStatus(doc("d5", { status: "Withdrawn", isVoided: true }), NOW), "closed");
eq("expired unsigned is closed", f.docStatus(doc("d6", { expiresAt: "2026-10-09T23:59:59Z" }), NOW), "closed");
eq("…but signed by them before it expired is still your turn", f.docStatus(doc("d7", { expiresAt: "2026-10-09T23:59:59Z", candidateSignedAt: "2026-10-09T10:00:00Z" }), NOW), "yours");
eq("a request nobody answered waits on them", f.requestStatus({ status: "pending" }), "theirs");
eq("asked again waits on them", f.requestStatus({ status: "rejected" }), "theirs");
eq("sent for you to check is your turn", f.requestStatus({ status: "submitted" }), "yours");
eq("approved is done", f.requestStatus({ status: "approved" }), "done");

// --- the counts follow the other filters ------------------------------------------
const docs = [
  doc("a", { candidateSignedAt: "2026-10-10T09:12:00Z", createdAt: "2026-10-08T10:00:00Z" }),
  doc("b", { candidate: "Ana Reyes", title: "Offer letter - Ana Reyes", createdAt: "2026-10-10T08:00:00Z", expiresAt: "2026-10-12T23:59:59Z" }),
  doc("c", { status: "Signed", type: "nda", title: "NDA - Jason", createdAt: "2026-10-01T10:00:00Z", role: "Night Shift Agent" }),
];
const requests = [
  req("r1", { status: "submitted", created_at: "2026-10-10T09:20:00Z" }),
  req("r2", { document_type: "payment_email", status: "pending", personName: "Ana Reyes", due_date: "2026-10-11" }),
  req("r3", { status: "approved", personName: "Bea", jobTitle: "Night Shift Agent" }),
];
const all = f.applyDocFilters(docs, requests, { status: "all", ...f.NO_FILTERS }, title, NOW);
eq("counts across everything", all.counts, { all: 6, yours: 2, theirs: 2, done: 2, closed: 0 });
const yours = f.applyDocFilters(docs, requests, { status: "yours", ...f.NO_FILTERS }, title, NOW);
eq("'Your turn' shows the letter to sign and the ID to check", [...yours.docs.map((d) => d.id), ...yours.requests.map((r) => r.id)], ["a", "r1"]);
const papers = f.applyDocFilters(docs, requests, { status: "all", ...f.NO_FILTERS, kind: "papers" }, title, NOW);
eq("ID & papers shows requests only", [papers.docs.length, papers.requests.length], [0, 3]);
eq("…and the counts follow it", papers.counts, { all: 3, yours: 1, theirs: 1, done: 1, closed: 0 });
const offers = f.applyDocFilters(docs, requests, { status: "all", ...f.NO_FILTERS, kind: "offers" }, title, NOW);
eq("Offer letters shows offer letters only", offers.docs.map((d) => d.id).sort(), ["a", "b"]);
const files = f.applyDocFilters(docs, requests, { status: "all", ...f.NO_FILTERS, kind: "files" }, title, NOW);
eq("Files to sign shows the rest", [files.docs.map((d) => d.id), files.requests.length], [["c"], 0]);
const night = f.applyDocFilters(docs, requests, { status: "all", ...f.NO_FILTERS, job: "Night Shift Agent" }, title, NOW);
eq("a job shows that job's letters and requests", [night.docs.map((d) => d.id), night.requests.map((r) => r.id)], [["c"], ["r3"]]);
const ana = f.applyDocFilters(docs, requests, { status: "all", ...f.NO_FILTERS, search: "ana" }, title, NOW);
eq("search finds a person", [ana.docs.map((d) => d.id), ana.requests.map((r) => r.id)], [["b"], ["r2"]]);
const pay = f.applyDocFilters(docs, requests, { status: "all", ...f.NO_FILTERS, search: "payment" }, title, NOW);
eq("…or a document by its name", pay.requests.map((r) => r.id), ["r2"]);
check("…ignoring case and accents", f.searchMatches("jose pena", "José Peña") && !f.searchMatches("ana x", "Ana Reyes"));

// --- order -------------------------------------------------------------------------
eq("newest first", f.applyDocFilters(docs, [], { status: "all", ...f.NO_FILTERS }, title, NOW).docs.map((d) => d.id), ["b", "a", "c"]);
eq("oldest first", f.applyDocFilters(docs, [], { status: "all", ...f.NO_FILTERS, order: "oldest" }, title, NOW).docs.map((d) => d.id), ["c", "a", "b"]);
eq("due soonest: the one that expires first; a tie goes newest first", f.applyDocFilters(docs, [], { status: "all", ...f.NO_FILTERS, order: "due" }, title, NOW).docs.map((d) => d.id), ["b", "a", "c"]);
eq("…and anything with no date goes last", f.applyDocFilters([doc("x", { expiresAt: null, createdAt: "2026-10-10T11:00:00Z" }), doc("y", { expiresAt: "2026-10-20T00:00:00Z" })], [], { status: "all", ...f.NO_FILTERS, order: "due" }, title, NOW).docs.map((d) => d.id), ["y", "x"]);
eq("requests by due date", f.applyDocFilters([], requests, { status: "all", ...f.NO_FILTERS, order: "due" }, title, NOW).requests.map((r) => r.id), ["r2", "r1", "r3"]);

// --- words -------------------------------------------------------------------------
eq("the line above the list", [f.resultLine("yours", 3, false), f.resultLine("yours", 1, false), f.resultLine("theirs", 6, false), f.resultLine("all", 14, false), f.resultLine("all", 2, true), f.resultLine("done", 0, true)], ["3 things need you", "1 thing needs you", "6 waiting on them", "14 in all", "2 matches", "Nothing matches these filters."]);
eq("the status words, as in the mock-up", Object.values(f.STATUS_WORDS), ["All", "Your turn", "Waiting on them", "Done", "Declined or withdrawn"]);
eq("the kinds", Object.values(f.KIND_WORDS), ["Everything", "Offer letters", "ID & papers", "Files to sign"]);

// --- the page ----------------------------------------------------------------------
{
  const page = read("src/cockpit/pages/Documents.tsx");
  check("the page opens on 'Your turn' while something waits on him, else on All", /statusPick \?\? \(counted\.counts\.yours > 0 \? "yours" : "all"\)/.test(page));
  check("the status row shows a count on each", /counts=\{result\.counts\}/.test(page));
  check("search, kind, job and order are all there", /data-filter-search/.test(page) && /options=\{\["all", "offers", "papers", "files"\] as const\}/.test(page) && /data-filter-job/.test(page) && /data-filter-order/.test(page));
  check("nothing found says so, with a way back", /data-filter-empty/.test(page) && /Show everything/.test(page));
  check("the filter rows scroll sideways on a phone, without trapping the page", /overflow-x-auto/.test(page) && !/overscroll-behavior|overscroll-contain/.test(page));
}

console.log(`document filters: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
