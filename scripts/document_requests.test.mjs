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
check("IDs are files, deleted after the set days; typed answers are kept", ["government_id", "nbi_clearance", "proof_of_address"].every((k) => lib.requestKind(k).answer === "file" && lib.requestKind(k).deleteAfterDays === lib.ID_KEEP_DAYS) && ["tin", "payment_email"].every((k) => lib.requestKind(k).answer === "text" && lib.requestKind(k).deleteAfterDays === null));
eq("ID_KEEP_DAYS", lib.ID_KEEP_DAYS, 30);
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

// --- status and deletion ----------------------------------------------------------
eq("team: received", lib.statusWords("submitted", "team"), "Received");
eq("team: asked again", lib.statusWords("rejected", "team"), "Asked again");
eq("team: waiting", lib.statusWords("pending", "team"), "Waiting for them");
eq("applicant: to send again", lib.statusWords("rejected", "applicant"), "Please send it again");
const approved = "2026-10-10T08:00:00.000Z";
eq("an ID is deleted 30 days after approval", lib.deletesOn("government_id", approved)?.toISOString(), "2026-11-09T08:00:00.000Z");
eq("a TIN is not deleted", lib.deletesOn("tin", approved), null);
eq("not approved: no date", lib.deletesOn("government_id", null), null);
eq("a bad date: no date", lib.deletesOn("government_id", "soon"), null);
eq("due choices", lib.DUE_CHOICES.join(","), "3,5,7");

// --- the cleanup function keeps the same list ------------------------------------
{
  const cleanup = read("supabase/functions/document-cleanup/index.ts");
  const listed = JSON.parse((cleanup.match(/const DELETED_KINDS = (\[[^\]]*\]);/) ?? [])[1] ?? "[]");
  eq("the cleanup function deletes the same kinds", listed.join(","), lib.DELETED_AFTER_APPROVAL.join(","));
  eq("…after the same number of days", Number((cleanup.match(/const KEEP_DAYS = (\d+);/) ?? [])[1]), lib.ID_KEEP_DAYS);
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
  check("…and answers 410 once a file was deleted", /file_deleted_at\) return jsonResponse\([^)]*410\)/.test(fn));
  const hook = read("src/cockpit/hooks/useApplicantRequests.ts");
  const panel = read("src/cockpit/components/ApplicantDocumentsPanel.tsx");
  check("the team's screens open files through the function, never the bucket", /functions\.invoke\("requested-document-url"/.test(hook) && !/requested-documents/.test(hook + panel) && !/createSignedUrl/.test(hook + panel));
  check("the team sees a TIN masked", /shownAnswer\(/.test(panel));
}

// --- the applicant's side ---------------------------------------------------------
{
  const dialog = read("src/components/documents/DocumentUploadDialog.tsx");
  check("the applicant types a TIN or payment email instead of uploading", /answerProblem\(/.test(dialog) && /answer_text: answer\.trim\(\)/.test(dialog));
  check("…is told who sees it and when an ID is deleted", /Only the hiring team can see it/.test(dialog) && /days after they approve it/.test(dialog));
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

  const fn = read("supabase/functions/send-notification-email/index.ts");
  check("the email function builds the list from the application, never from the request", /from\("document_requests"\)[\s\S]{0,300}\.eq\("application_id", data\.application_id\)[\s\S]{0,120}\.eq\("candidate_id", recipient_user_id\)/.test(fn) && /welcomeTodo\(\{ offerUnsigned, requests: requests\.data \?\? \[\] \}\)/.test(fn));
  const access = read("supabase/functions/_shared/notificationAccess.ts");
  check("…and only for an application that links the sender to that applicant", /kept\.application_id = links\.find\(\(l\) => l\.id === wanted\)\?\.id \?\? links\[0\]\.id;/.test(access));
  check("the welcome email asks them to sign and send, in one email", /"You're hired!"/.test(fn) && /Before your first day, please:/.test(fn) && /"Open HireFlow"/.test(fn));
  check("an offer letter's email says it is a job offer", /"You have a job offer"/.test(fn) && /"Read and sign your offer"/.test(fn) && /doc\?\.document_type === "offer_letter"/.test(fn));

  const hire = read("src/cockpit/hooks/useHire.ts");
  check("hired once: the update only touches someone not already hired or declined", /\.not\("status", "in", "\(hired,rejected\)"\)/.test(hire) && /if \(!moved \|\| moved\.length === 0\) return \{ already: true/.test(hire));
  check("…the documents are asked for before the one welcome email, so it lists them", hire.indexOf("insertRequestRows(") > 0 && hire.indexOf("insertRequestRows(") < hire.indexOf("notifyStatusHired("));
  check("…and no automatic retry", /retry: false/.test(hire));
  const dialog = read("src/cockpit/components/HireDialog.tsx");
  check("the Hire button locks before anything is awaited", /if \(locked \|\| !candidateId\) return;\s*\/\/[^\n]*\n\s*setLocked\(true\);\s*try \{\s*const result = await hire\.mutateAsync/.test(dialog));
  check("…the usual documents are ticked to start", /DEFAULT_KINDS = \["government_id", "nbi_clearance", "payment_email"\]/.test(dialog));
  const page = read("src/cockpit/pages/CandidateDetail.tsx");
  check("the applicant page hires through that box only", /setHireOpen\(true\)/.test(page) && !/HiringDocumentPromptDialog/.test(page) && !/onHire=/.test(page));
  check("into Offer is the offer letter itself, on the page and the dashboard", /advanceLabel === "Offer"\s*\? \{ key: "offer", text: "Send offer letter"/.test(page) && /=== "Offer" \? setOfferFor\(c\.id\)/.test(read("src/cockpit/pages/Dashboard.tsx")));
  check("after the interview, the offer letter leads", /const offerLeads = status === "interview" && !!interviewDone && !interviewStatus/.test(page));
}

console.log(`document requests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
