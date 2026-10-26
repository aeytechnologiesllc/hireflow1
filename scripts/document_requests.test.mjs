/**
 * "Request documents" (src/lib/documentRequests.ts; docs/DOCUMENT-REQUESTS.md).
 *
 * The rules in words: what can be asked, how a typed answer is checked and
 * shown, how long an ID is kept; that the cleanup function deletes the same
 * kinds after the same number of days; that the hiring side only opens a file
 * through requested-document-url; and that bank account numbers are never
 * asked for. The database half is scripts/document_requests.pglite.test.mjs.
 */
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(resolve(tmpdir(), "document-requests-"));
const outfile = resolve(dir, "documentRequests.mjs");
await build({ entryPoints: [resolve(root, "src/lib/documentRequests.ts")], bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent" });
const lib = await import(pathToFileURL(outfile).href);
// The email function's own list maker (Deno), built the same way: plain TS.
const welcomeOut = resolve(dir, "welcomeTodo.mjs");
await build({ entryPoints: [resolve(root, "supabase/functions/_shared/welcomeTodo.ts")], bundle: true, format: "esm", platform: "node", outfile: welcomeOut, logLevel: "silent" });
const welcome = await import(pathToFileURL(welcomeOut).href);
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
const eq = (name, got, want) => check(name, got === want, `got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);

// --- the list ---------------------------------------------------------------------
const keys = lib.REQUEST_KINDS.map((k) => k.key);
eq("the list, in order", keys.join(","), "government_id,nbi_clearance,proof_of_address,tin,payment_email");
check("every kind has a name and a line to the applicant", lib.REQUEST_KINDS.every((k) => k.label && k.ask.length > 10));
check("no bank account numbers are ever asked for", !lib.REQUEST_KINDS.some((k) => /bank account|account number|routing|iban|swift/i.test(`${k.label} ${k.ask}`)) && !keys.includes("bank_details"));
eq("the payment email names Wise and PayPal", lib.requestKind("payment_email").ask, "The email you use on Wise or PayPal, so we can pay you there.");
check("IDs are files and identity papers; typed answers are kept", ["government_id", "nbi_clearance", "proof_of_address"].every((k) => lib.requestKind(k).answer === "file" && lib.requestKind(k).idPaper === true) && ["tin", "payment_email"].every((k) => lib.requestKind(k).answer === "text" && lib.requestKind(k).idPaper === false));
eq("an ID goes 24 hours after the team first opens it (the owner, 2026-10-10)", lib.ID_DELETE_HOURS_AFTER_OPENED, 24);
eq("…or 7 days after it is sent if nobody opens it", lib.ID_DELETE_DAYS_UNOPENED, 7);
eq("the promise, in one sentence", lib.idDeletionPromise("Zulu Support Team"), "HireFlow deletes it 24 hours after Zulu Support Team first opens it, and after 7 days if they never do.");
eq("an older key still reads", lib.requestKind("drivers_license").label, "Driver's license");
eq("…as a file", lib.requestKind("drivers_license").answer, "file");
eq("an unknown key reads as a document", lib.requestKind("whatever").label, "Document");
eq("the team's own name wins", lib.requestTitle({ document_type: "custom", custom_document_name: "  House rules, signed " }), "House rules, signed");
eq("…else the kind's", lib.requestTitle({ document_type: "nbi_clearance", custom_document_name: " " }), "NBI clearance");

// --- typed answers ---------------------------------------------------------------
eq("empty", lib.answerProblem("tin", "  "), "Type your answer first.");
eq("a good TIN", lib.answerProblem("tin", "123-456-789-000"), null);
eq("a 9-digit TIN", lib.answerProblem("tin", "123 456 789"), null);
eq("too short", lib.answerProblem("tin", "123-456"), "Type your TIN as numbers, like 123-456-789-000.");
eq("letters in a TIN", lib.answerProblem("tin", "12345678A"), "Type your TIN as numbers, like 123-456-789-000.");
eq("a good email", lib.answerProblem("payment_email", " ana.reyes@gmail.com "), null);
eq("not an email", lib.answerProblem("payment_email", "ana at gmail"), "Type the email address you use on Wise or PayPal.");
eq("too long", lib.answerProblem("payment_email", `${"a".repeat(115)}@x.com`), "Keep it under 120 characters.");
eq("ANSWER_MAX matches the database's limit", lib.ANSWER_MAX, Number((read("supabase/migrations/20261010150000_document_requests_safe.sql").match(/char_length\(answer_text\) <= (\d+)/) ?? [])[1]));
eq("a TIN shows its last four digits to the team", lib.shownAnswer("tin", "123-456-789-000"), "••••••••9000");
eq("an email shows whole", lib.shownAnswer("payment_email", " ana@x.com "), "ana@x.com");
eq("nothing shows nothing", lib.shownAnswer("tin", null), "");

// --- a named paper that is really an ID gets the "it is kept" warning -------------
// The eleventh Phase 5 review: the curly apostrophe an iPhone types, British
// spelling, the Philippine national ID and SSS card, and "I.D." at the end
// were all missed.
for (const name of ["Passport", "Driver's license", "Driver’s license", "drivers licence", "Driving licence", "PhilSys card", "PhilSys ID", "National ID", "UMID", "SSS card", "SSS ID", "GSIS card", "Postal ID", "Postal I.D.", "Voter’s ID", "PRC ID", "TIN ID", "Pag-IBIG ID", "PhilHealth ID", "Valid ID", "two IDs", "Company I.D"]) {
  check(`an ID named "${name}" is recognised`, lib.looksLikeAnId(name) === true);
}
for (const name of ["Diploma", "Certificate of employment", "Transcript of records", "Birth certificate", "Video of your desk", "Medical certificate", "Résumé (updated)", "Idea board"]) {
  check(`"${name}" is not taken for an ID`, lib.looksLikeAnId(name) === false);
}
check("the request screen warns with it", /import \{[^}]*\blooksLikeAnId\b[^}]*\} from "@\/lib\/documentRequests";/.test(read("src/cockpit/components/RequestDocumentsDialog.tsx")) && /\{looksLikeAnId\(other\) && \(/.test(read("src/cockpit/components/RequestDocumentsDialog.tsx")));

// --- status and deletion ----------------------------------------------------------
eq("team: received", lib.statusWords("submitted", "team"), "Received");
eq("team: asked again", lib.statusWords("rejected", "team"), "Asked again");
eq("team: waiting", lib.statusWords("pending", "team"), "Waiting for them");
eq("applicant: to send again", lib.statusWords("rejected", "applicant"), "Please send it again");
const sentAt = "2026-10-10T08:00:00.000Z";
const idSent = { document_type: "government_id", file_url: "ana/r1/id.jpg", submitted_at: sentAt, created_at: sentAt };
eq("an ID nobody opened goes 7 days after it was sent", JSON.stringify(lib.idDeletion(idSent)), JSON.stringify({ at: new Date("2026-10-17T08:00:00.000Z"), opened: false, deleted: false }));
eq("…once opened, 24 hours after the first opening", JSON.stringify(lib.idDeletion({ ...idSent, team_opened_at: "2026-10-10T09:30:00.000Z" })), JSON.stringify({ at: new Date("2026-10-11T09:30:00.000Z"), opened: true, deleted: false }));
eq("…and once gone, the day it went", lib.idDeletion({ ...idSent, file_url: null, team_opened_at: "2026-10-10T09:30:00.000Z", file_deleted_at: "2026-10-11T10:17:00.000Z" })?.deleted, true);
eq("a TIN is not deleted", lib.idDeletion({ document_type: "tin", file_url: null, submitted_at: sentAt }), null);
eq("nothing sent: no date", lib.idDeletion({ document_type: "government_id", file_url: null }), null);
eq("time left reads plainly", [lib.timeLeft(new Date("2026-10-11T09:30:00Z"), new Date("2026-10-10T10:30:00Z")), lib.timeLeft(new Date("2026-10-10T11:00:00Z"), new Date("2026-10-10T10:30:00Z")), lib.timeLeft(new Date("2026-10-17T08:00:00Z"), new Date("2026-10-10T10:00:00Z"))].join(" | "), "23 h | 30 min | 7 days");
eq("due choices", lib.DUE_CHOICES.join(","), "3,5,7");

// --- the cleanup function keeps the same list ------------------------------------
{
  const cleanup = read("supabase/functions/document-cleanup/index.ts");
  const listed = JSON.parse((cleanup.match(/const DELETED_KINDS = (\[[^\]]*\]);/) ?? [])[1] ?? "[]");
  eq("the cleanup function deletes the same kinds", listed.join(","), lib.ID_PAPER_KINDS.join(","));
  eq("…24 hours after the first opening", Number((cleanup.match(/const HOURS_AFTER_OPENED = (\d+);/) ?? [])[1]), lib.ID_DELETE_HOURS_AFTER_OPENED);
  eq("…or after the same days unopened", Number((cleanup.match(/const DAYS_UNOPENED = (\d+);/) ?? [])[1]), lib.ID_DELETE_DAYS_UNOPENED);
  check("…reading the first opening, and when it was sent", /lte\("team_opened_at", openedBefore\)/.test(cleanup) && /is\("team_opened_at", null\)\.lte\("submitted_at", sentBefore\)/.test(cleanup));
  const hourly = read("supabase/migrations/20261011130000_id_papers_deleted_after_opening.sql");
  check("the admins are told when an ID file could not be deleted, not only when the requests could not be read (the fifth Phase 5 review)", /if \(counts\.failed > 0 \|\| orphansFailed > 0\)/.test(cleanup) && /ID file\$\{counts\.failed === 1/.test(cleanup));
  check("…under two titles, so a delete failure never hides a read failure, and files of deleted requests are named as such (the sixth)", /tell\("read-requests", "ID papers are not being deleted"/.test(cleanup) && /tell\("delete", "ID papers were not deleted on time"/.test(cleanup) && /of deleted requests/.test(cleanup));
  check("…every hour, so 24 hours means 24 hours", /'document-cleanup',\s*'17 \* \* \* \*'/.test(hourly));
  check("…only with the secret from Vault, checked by the database", /x-cleanup-secret/.test(cleanup) && /document_cleanup_secret_matches/.test(cleanup) && /401/.test(cleanup));
  check("…and only files in the applicant's own folder", /startsWith\(`\$\{request\.candidate_id\}\/`\)/.test(cleanup) && /includes\("\.\."\)/.test(cleanup));
  const schedule = read("supabase/migrations/20261010150100_document_cleanup_schedule.sql");
  check("the schedule sends the secret from Vault and never holds it", /'document-cleanup'/.test(schedule) && /vault\.decrypted_secrets/.test(schedule) && !/x-cleanup-secret',\s*'[0-9a-f]{32,}/.test(schedule));
  check("…the check is the service role's alone", /REVOKE ALL ON FUNCTION public\.document_cleanup_secret_matches\(text\) FROM anon, authenticated;/.test(schedule) && /GRANT EXECUTE ON FUNCTION public\.document_cleanup_secret_matches\(text\) TO service_role;/.test(schedule));
}

// --- the hiring side opens a file only through the function -----------------------
{
  const config = read("supabase/config.toml");
  check("requested-document-url checks the caller's sign-in", /\[functions\.requested-document-url\]\s*\n(#.*\n)*verify_jwt = true/.test(config));
  check("document-cleanup is called by the scheduler, with its own secret", /\[functions\.document-cleanup\]\s*\n(#.*\n)*verify_jwt = false/.test(config));
  const fn = read("supabase/functions/requested-document-url/index.ts");
  check("the function signs a link of five minutes", /const LINK_SECONDS = 300;/.test(fn));
  check("…only for the applicant, the job's owner or its team", /user\.id === request\.candidate_id/.test(fn) && /is_job_owner/.test(fn) && /is_active_team_member_for_job/.test(fn));
  check("…records every opening", /action: "opened"/.test(fn));
  check("…and answers 410 once a file was deleted", /file_deleted_at && !request\.file_url\) return jsonResponse\([^)]*410\)/.test(fn));
  check("…records the hiring side's first opening, only while unset (opening again never moves the deletion)", /user\.id !== request\.candidate_id && !teamOpenedAt/.test(fn) && /\.is\("team_opened_at", null\)/.test(fn));
  check("…and can save the file instead of showing it", /download \? \{ download:/.test(fn));
  // Only a plain path in the applicant's own folder is signed (the sixth
  // security review: storage-js puts the path into the request address as it
  // is, where "%2e%2e" is a parent step, and the link is signed with the
  // service key).
  check("…and checks the stored path with ownFolder.ts before it signs", /import \{ inOwnFolder \} from "\.\/ownFolder\.ts";/.test(fn) && !/function inOwnFolder/.test(fn) && fn.search(/if \(!inOwnFolder\(request\.file_url, request\.candidate_id\)\) return jsonResponse\(\{ error: "Nothing has been sent for this request" \}, 404\);/) > 0 && fn.search(/if \(!inOwnFolder\(request\.file_url, request\.candidate_id\)\)/) < fn.search(/\.createSignedUrl\(/));
  const { inOwnFolder } = await import(pathToFileURL(resolve(root, "supabase/functions/requested-document-url/ownFolder.ts")).href);
  const owner = "aaaaaaaa-0000-4000-8000-000000000001";
  const stored = `${owner}/%2e%2e/x/y.pdf`; // the reviewer's value (path_rule_check.mjs)
  check("(why) once in an address, that stored path leaves the applicant's folder", new URL(`https://p.supabase.co/storage/v1/object/sign/requested-documents/${stored}`).pathname === "/storage/v1/object/sign/requested-documents/x/y.pdf");
  check("a file in the applicant's own folder is signed", inOwnFolder(`${owner}/req-1/id-1.jpg`, owner) && inOwnFolder(`${owner}/req-1/NBI clearance (1).pdf`, owner));
  for (const [what, bad] of [
    ["%2e%2e (the reviewer's value)", stored],
    ["%252e%252e", `${owner}/%252e%252e/x/y.pdf`],
    ["any %", `${owner}/req-1/id%20card.jpg`],
    ["a backslash", `${owner}/req-1\\x.pdf`],
    ["a control character", `${owner}/req-1/id\u0001.jpg`],
    ["a tab", `${owner}/req-1/id\t.jpg`],
    ["an empty part", `${owner}//id.jpg`],
    ["a dot part", `${owner}/./id.jpg`],
    ["..", `${owner}/../x/id.jpg`],
    ["another folder", `bbbbbbbb-0000-4000-8000-000000000002/id.jpg`],
    ["a long path", `${owner}/${"x".repeat(1100)}`],
    ["no path", null],
  ]) check(`…but not a path with ${what}`, !inOwnFolder(bad, owner));
  const hook = read("src/cockpit/hooks/useApplicantRequests.ts");
  const panel = read("src/cockpit/components/ApplicantDocumentsPanel.tsx");
  check("the team's screens open files through the function, never the bucket", /functions\.invoke\("requested-document-url"/.test(hook) && !/requested-documents/.test(hook + panel) && !/createSignedUrl/.test(hook + panel));
  check("the team sees a TIN masked", /shownAnswer\(/.test(panel));
}

// --- the applicant's side ---------------------------------------------------------
{
  const dialog = read("src/components/documents/DocumentUploadDialog.tsx");
  check("the applicant types a TIN or payment email instead of uploading", /answerProblem\(/.test(dialog) && /answer_text: answer\.trim\(\)/.test(dialog));
  check("…is told who sees it and when an ID is deleted", /Only the hiring team can see it/.test(dialog) && /idDeletionPromise\("the hiring team"\)/.test(dialog));
  check("…and the team's bell names them, never their email", !/user\.email/.test(dialog));
  check("a file sent again replaces the earlier one", /remove\(\[previous\]\)/.test(dialog));
}

// --- hiring: one welcome email, never twice (approved 2026-10-10) ------------------
{
  // The dialog's preview and the real email use the same words.
  eq("the offer line is the same in the app and the email", lib.SIGN_OFFER_LINE, welcome.SIGN_OFFER_LINE);
  for (const kind of [...keys, "custom", "drivers_license", "id_card", "ssn_card", "nonsense"]) {
    eq(`"${kind}" reads the same in the dialog and the email`, lib.todoLine(kind), welcome.todoLine(kind));
  }
  eq("a named document reads the same too", lib.todoLine("custom", "  House rules,  signed "), welcome.todoLine("custom", "  House rules,  signed "));
  eq("…as a plain line", welcome.todoLine("custom", "House rules, signed"), "Send: House rules, signed");
  eq("the payment email line names Wise and PayPal", welcome.todoLine("payment_email"), "Type the email you use on Wise or PayPal");

  const now = new Date("2026-10-10T10:00:00Z");
  const fiveDays = new Date("2026-10-15T23:59:59Z").toISOString();
  const list = welcome.welcomeTodo({
    offerUnsigned: true,
    requests: [
      { document_type: "government_id", due_date: fiveDays },
      { document_type: "payment_email", due_date: fiveDays },
      { document_type: "government_id", due_date: fiveDays },
    ],
    now,
  });
  eq("the welcome list: sign the offer first, then each document once", list.items.join(" | "), "Sign your offer letter | Send a photo of your government ID | Type the email you use on Wise or PayPal");
  eq("…'within 5 days' for five days ending late on the fifth", list.dueInDays, 5);
  check("…and it says IDs are deleted when one is asked for", list.deletesIds === true && list.asksForDocuments === true);
  const onlyOffer = welcome.welcomeTodo({ offerUnsigned: true, requests: [], now });
  check("an unsigned offer alone: one line, no due date, no privacy line", onlyOffer.items.length === 1 && onlyOffer.dueInDays === null && onlyOffer.asksForDocuments === false);
  const nothing = welcome.welcomeTodo({ offerUnsigned: false, requests: [{ document_type: "tin", due_date: "2026-10-01T00:00:00Z" }], now });
  check("a due date already past is not promised", nothing.dueInDays === null && nothing.deletesIds === false);

  // An offer letter is on the list only while it is theirs to sign: the
  // dialog and the email answer by the same rule (the tenth product review:
  // a letter past its date, "Expired" in My Documents, was "Sign your offer
  // letter" in the email and "hasn't signed yet" in the dialog).
  {
    const at = new Date("2026-10-20T12:00:00Z");
    const letters = {
      "in time": { status: "pending", candidate_signed_at: null, is_voided: false, expires_at: "2026-10-21T00:00:00Z", created_at: "2026-10-10T10:00:00Z" },
      "no date": { status: "pending", candidate_signed_at: null, is_voided: false, expires_at: null, created_at: "2026-10-10T10:00:00Z" },
      "past its date": { status: "pending", candidate_signed_at: null, is_voided: false, expires_at: "2026-10-20T11:59:59Z", created_at: "2026-10-10T10:00:00Z" },
      "on its date to the second": { status: "pending", candidate_signed_at: null, is_voided: false, expires_at: "2026-10-20T12:00:00Z", created_at: "2026-10-10T10:00:00Z" },
      signed: { status: "pending", candidate_signed_at: "2026-10-12T10:00:00Z", is_voided: false, expires_at: "2026-10-14T00:00:00Z", created_at: "2026-10-10T10:00:00Z" },
      withdrawn: { status: "pending", candidate_signed_at: null, is_voided: true, expires_at: "2026-10-21T00:00:00Z", created_at: "2026-10-10T10:00:00Z" },
      declined: { status: "declined", candidate_signed_at: null, is_voided: false, expires_at: "2026-10-21T00:00:00Z", created_at: "2026-10-10T10:00:00Z" },
    };
    const want = { "in time": true, "no date": true, "past its date": false, "on its date to the second": false, signed: false, withdrawn: false, declined: false };
    for (const [name, letter] of Object.entries(letters)) {
      eq(`an offer letter ${name}: ${want[name] ? "on" : "off"} the welcome list (the email)`, welcome.offerLetterWaiting(letter, at), want[name]);
      eq(`…the dialog agrees`, lib.offerLetterWaiting(letter, at), want[name]);
    }
    eq("no letter at all: off the list", welcome.offerLetterWaiting(undefined, at), false);
    eq("the dialog calls one past its date 'expired', not 'unsigned'", lib.offerLetterState(letters["past its date"], at).kind, "expired");
    eq("…one in time 'unsigned'", lib.offerLetterState(letters["in time"], at).kind, "unsigned");
    eq("…one signed in time 'signed', whatever the date says now", lib.offerLetterState(letters.signed, at).kind, "signed");
    eq("…one withdrawn 'withdrawn'", lib.offerLetterState(letters.withdrawn, at).kind, "withdrawn");
    // Called through this, so the old code reports each check instead of stopping at the first.
    const hireOfferLine = (...args) => (typeof lib.hireOfferLine === "function" ? lib.hireOfferLine(...args) : "no hireOfferLine");
    const dialog = read("src/cockpit/components/HireDialog.tsx");
    eq("the Hire dialog says an expired letter expired, leaves it off the email and points to a new one", hireOfferLine(lib.offerLetterState(letters["past its date"], at), "Ana", true), "The offer letter expired before it was signed, so the email doesn't ask for it. You can send a new one from Documents.");
    check("…through hireOfferLine, asking for a signature only for an unsigned letter", /hireOfferLine\(offer, first, canSendLetters,/.test(dialog) && /const offerUnsigned = offer\?\.kind === "unsigned";/.test(dialog) && /\.\.\.\(offerUnsigned \? \[SIGN_OFFER_LINE\] : \[\]\)/.test(dialog));

    // The eleventh product review: a letter that went out and was declined,
    // or voided after they signed, read "No offer letter has gone out"; one
    // the team declined on its turn read "{First} signed the offer letter";
    // and "You can send a new one from Documents" was said to a teammate
    // without "Send documents", and after the hire, when Offer letter listed
    // nobody already hired.
    const signedThenVoided = { ...letters.signed, is_voided: true };
    const declinedByTeam = { ...letters.signed, status: "declined" };
    eq("declined by them: 'declined', theirs", JSON.stringify(lib.offerLetterState(letters.declined, at)), JSON.stringify({ kind: "declined", by: "applicant" }));
    eq("declined by the team on its turn: 'declined', the team's (not 'signed')", JSON.stringify(lib.offerLetterState(declinedByTeam, at)), JSON.stringify({ kind: "declined", by: "team" }));
    eq("voided after they signed: 'voided' (not 'withdrawn')", lib.offerLetterState(signedThenVoided, at).kind, "voided");
    eq("no letter: 'none'", lib.offerLetterState(undefined, at).kind, "none");
    const lines = {
      declined: hireOfferLine(lib.offerLetterState(letters.declined, at), "Ana", true),
      declinedByTeam: hireOfferLine(lib.offerLetterState(declinedByTeam, at), "Ana", true),
      voided: hireOfferLine(lib.offerLetterState(signedThenVoided, at), "Ana", true),
      withdrawn: hireOfferLine(lib.offerLetterState(letters.withdrawn, at), "Ana", true),
      none: hireOfferLine({ kind: "none" }, "Ana", true),
    };
    eq("the dialog: declined by them", lines.declined, "Ana declined the offer letter, so the email doesn't ask for it. You can send a new one from Documents.");
    eq("…declined by the team", lines.declinedByTeam, "You declined the offer letter after Ana signed it, so the email doesn't ask for it. You can send a new one from Documents.");
    eq("…voided", lines.voided, "You voided the offer letter after Ana signed it, so the email doesn't ask for it. You can send a new one from Documents.");
    eq("…withdrawn", lines.withdrawn, "You withdrew the offer letter before Ana signed it, so the email doesn't ask for it. You can send a new one from Documents.");
    eq("…none", lines.none, "No offer letter has gone out. You can still send one from Documents.");
    for (const [name, line] of Object.entries(lines)) {
      if (name !== "none") check(`…${name}: never "No offer letter has gone out" for one that went out`, !/No offer letter has gone out/.test(line));
    }
    eq("…signed, with its day", hireOfferLine({ kind: "signed", signedAt: "2026-10-12T10:00:00Z" }, "Ana", true, "Monday, October 12, 2026"), "Ana signed the offer letter on Monday, October 12, 2026.");
    eq("…unsigned", hireOfferLine({ kind: "unsigned", sentAt: "2026-10-10T10:00:00Z" }, "Ana", true), "Ana hasn't signed the offer letter yet, so the email asks for that too.");
    for (const state of [{ kind: "none" }, { kind: "expired" }, { kind: "declined", by: "applicant" }, { kind: "declined", by: "team" }, { kind: "voided" }, { kind: "withdrawn" }]) {
      check(`a teammate without "Send documents" is never pointed to Documents (${state.kind}${state.by ? `, ${state.by}` : ""})`, !/Documents/.test(hireOfferLine(state, "Ana", false)));
    }
    check("the dialog points to Documents only once a teammate's switches say they may send", /const canSendLetters = !isTeamMember \|\| teamPermissions\?\.canSendDocuments === true;/.test(dialog));
    const offerHook = read("src/cockpit/hooks/useOfferLetter.ts");
    check("Offer letter lists people already hired (before those still in review: a search shows eight), so 'send a new one from Documents' still works after the hire", /const OFFER_STAGES = \["interview", "offered", "hired", "reviewing"\] as const;/.test(offerHook) && /export function useOfferPeople\(enabled: boolean, stages: readonly string\[\] = OFFER_STAGES\)/.test(offerHook));
    check("…and sending to someone hired leaves them hired (only interview and review move to Offer)", /if \(person\.status === "interview" \|\| person\.status === "reviewing"\) \{/.test(offerHook));
    const offerDialog = read("src/cockpit/components/OfferLetterDialog.tsx");
    check("…the picker calls them Hired", /hired: "Hired"/.test(offerDialog));
    const hook = read("src/cockpit/hooks/useHire.ts");
    check("…and its state reads the letter's date", /\.select\("status, candidate_signed_at, is_voided, expires_at, created_at"\)/.test(hook) && /return offerLetterState\(/.test(hook));
  }

  const fn = read("supabase/functions/send-notification-email/index.ts");
  check("the hire email leaves out a letter past its date: it reads expires_at and asks offerLetterWaiting", /\.select\("candidate_signed_at, is_voided, status, expires_at"\)/.test(fn) && /const offerUnsigned = offerLetterWaiting\(letter\);/.test(fn));
  check("the email function builds the list from the application, never from the request", /from\("document_requests"\)[\s\S]{0,300}\.eq\("application_id", data\.application_id\)[\s\S]{0,120}\.eq\("candidate_id", recipient_user_id\)/.test(fn) && /welcomeTodo\(\{ offerUnsigned, requests: requests\.data \?\? \[\] \}\)/.test(fn));
  const access = read("supabase/functions/_shared/notificationAccess.ts");
  check("…and only for an application that links the sender to that applicant", /kept\.application_id = links\.find\(\(l\) => l\.id === wanted\)\?\.id \?\? links\[0\]\.id;/.test(access));
  check("the welcome email asks them to sign and send, in one email", /"You're hired!"/.test(fn) && /Before your first day, please:/.test(fn) && /"Open HireFlow"/.test(fn));
  check("an offer letter's email says they were selected, then asks them to sign", /"Congratulations, you've been selected!"/.test(fn) && /has selected you for the position of/.test(fn) && /"Read and sign your offer letter"/.test(fn) && /doc\?\.document_type === "offer_letter"/.test(fn));

  const hire = read("src/cockpit/hooks/useHire.ts");
  // When nothing changed, every way out returns before anything is asked for
  // or emailed; it reads where they stand so a refusal is not "already hired".
  const noChange = /if \(!moved \|\| moved\.length === 0\) \{([\s\S]*?)\n      \}\n/.exec(hire)?.[1] ?? "";
  check(
    "hired once: the update only touches someone not already hired or declined",
    /\.not\("status", "in", "\(hired,rejected\)"\)/.test(hire) &&
      /return \{ already: true/.test(noChange) &&
      /refused: "declined"/.test(noChange) &&
      /return \{ already: false, refused: "not_allowed"/.test(noChange) &&
      !/insertRequestRows\(|notifyStatusHired\(|\.update\(/.test(noChange),
  );
  check("…the documents are asked for before the one welcome email, so it lists them", hire.indexOf("insertRequestRows(") > 0 && hire.indexOf("insertRequestRows(") < hire.indexOf("notifyStatusHired("));
  check("…and no automatic retry", /retry: false/.test(hire));
  const dialog = read("src/cockpit/components/HireDialog.tsx");
  check("the Hire button locks before anything is awaited", /if \(locked \|\| !candidateId\) return;\s*\/\/[^\n]*\n\s*setLocked\(true\);\s*try \{\s*const result = await hire\.mutateAsync/.test(dialog));
  check("…the usual documents are ticked to start: an ID and the payment email, never the NBI clearance (the owner, 2026-10-10)", /DEFAULT_KINDS = \["government_id", "payment_email"\]/.test(dialog));
  const page = read("src/cockpit/pages/CandidateDetail.tsx");
  check("the applicant page hires through that box only", /setHireOpen\(true\)/.test(page) && !/HiringDocumentPromptDialog/.test(page) && !/onHire=/.test(page));
  check("into Offer is the offer letter itself, on the page and the dashboard", /advanceLabel === "Offer"\s*\? \{ key: "offer", text: "Send offer letter"/.test(page) && /=== "Offer" \? setOfferFor\(c\.id\)/.test(read("src/cockpit/pages/Dashboard.tsx")));
  check("after the interview, the offer letter leads", /const offerLeads = status === "interview" && !!interviewDone && !interviewStatus/.test(page));
}

console.log(`document requests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
