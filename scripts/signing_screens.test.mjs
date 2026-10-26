/**
 * The signing screens (docs/DOCUMENT-SIGNING.md, "Signing record and who sees
 * it"). The owner, 2026-10-11, on the old viewer: "it's still showing signed
 * PDF when it hasn't even been signed. Why does it say audit PDF? ... there's
 * no way for me to sign this." Holds the two new screens to that:
 *   - a written letter opens ApplicantDocumentSheet (the applicant) or
 *     TeamDocumentSheet (the team), never the old viewer first;
 *   - neither shows "Signed PDF", "Audit PDF", "Certificate" or "View Audit
 *     Trail"; the download appears only once both have signed;
 *   - the team's screen says it waits on the applicant, and signs with the
 *     review confirmation the function requires;
 *   - both send the device and place with a signature.
 * The full back-and-forth (send, sign, countersign, both download) was walked
 * on sample data with Playwright before shipping (scratch script loop_walk).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(root, p), "utf8");
let passed = 0;
let failed = 0;
const check = (name, ok) => {
  if (ok) passed += 1;
  else {
    failed += 1;
    console.log(`FAIL ${name}`);
  }
};

const applicant = read("src/components/documents/ApplicantDocumentSheet.tsx");
const team = read("src/cockpit/components/TeamDocumentSheet.tsx");
const myDocs = read("src/pages/MyDocuments.tsx");
const docsPage = read("src/cockpit/pages/Documents.tsx");

for (const [who, src] of [["applicant", applicant], ["team", team]]) {
  check(`${who}: none of the old record buttons`, !/Signed PDF|Audit PDF|View Audit Trail|>\s*Certificate\s*</.test(src));
  check(`${who}: the download only once both have signed`, /state === "done"[\s\S]{0,400}Download signed copy/.test(src));
  check(`${who}: the full record one tap away, not up front`, /Signing record/.test(src) && /onShowRecord\(/.test(src));
  check(`${who}: sends the device and place with the signature`, /collectSignerContext\(\)/.test(src) && /signerContext/.test(src));
  check(`${who}: the same consent words as the audit record`, src.includes("I acknowledge that I am signing this document electronically and that my electronic signature has the same legal effect as a handwritten signature."));
}
// An uploaded PDF still opens the old viewer: there the applicant sees the
// finished copies and the audit trail only once it is signed, on any screen
// (the fifth product review: on a computer they showed before signing).
const viewer = read("src/components/documents/SignedDocumentViewer.tsx");
check("PDF viewer: the applicant's copies only once signed", /\$\{document\.status === "signed" \? "flex" : role === "candidate" \? "hidden" : recordClosedUnfinished\(record\) \? "flex" : "hidden sm:flex"\}/.test(viewer));
// The sixth product review: the audit trail is the applicant's once THEY have
// signed (it waited for the countersign, and was gone for good after a void),
// and the footer shows only on a screen where it holds a button (it was an
// empty strip on a computer before signing, and everywhere while waiting).
check("PDF viewer: the applicant's audit trail once they have signed, countersigned or not, voided or not; never before", /const auditTrailOffered = role === "candidate" \? document\?\.status === "signed" \|\| !!document\?\.candidate_signed_at : canSendDocuments;/.test(viewer) && /\{auditTrailOffered && \(\s*<Button onClick=\{\(\) => setShowAuditTrail\(true\)\}/.test(viewer) && !/\{\(document\.status === "signed" \|\| role !== "candidate"\) && \(\s*<Button onClick=\{\(\) => setShowAuditTrail/.test(viewer));
check("PDF viewer: the footer only where it has a button: everywhere with the audit trail, on a phone for 'Sign' alone, else none", /const footerOn: "both" \| "phone" \| "none" = auditTrailOffered \? "both" : canSignAsCandidate \|\| canCountersignAsEmployer \? "phone" : "none";/.test(viewer) && /\{footerOn !== "none" && \(\s*<div className=\{`p-3 sm:p-4 border-t border-border bg-card shrink-0 \$\{footerOn === "phone" \? "sm:hidden" : ""\}`\}/.test(viewer) && /className="gap-2 whitespace-nowrap sm:hidden"\s*data-go-to-sign/.test(viewer));
// The twelfth product review: a teammate without "Send documents" is offered neither Countersign nor the signing record
// (document-signing refuses them; document_audit_log returns them nothing), and the Documents page says which they are.
check("PDF viewer: Countersign and the signing record only for someone who may send documents", /canSendDocuments = true \}: SignedDocumentViewerProps/.test(viewer) && /\(role === "employer" \|\| role === "team_member"\) &&\s*canSendDocuments &&/.test(viewer) && /<SignedDocumentViewer\s+document=\{viewerDocument\}\s+canSendDocuments=\{canSend\}/.test(docsPage));
check("Team sheet: a decline after the applicant signed is the team's own, never quoted as theirs; an already-hired person has no Hire to press", /const declinedByTeam = state === "declined" && !!document\.candidate_signed_at;/.test(read("src/cockpit/components/TeamDocumentSheet.tsx")) && /declinedByTeam \? "You declined this" : `\$\{First\} declined`/.test(read("src/cockpit/components/TeamDocumentSheet.tsx")) && /document\.applications\?\.status === "hired"/.test(read("src/cockpit/components/TeamDocumentSheet.tsx")) && /candidate_id,\s*status,\s*jobs\(\*\)/.test(read("src/hooks/useDocuments.ts")));
// The seventh product review: an applicant now opens the audit trail before
// the countersign and after a void, so the screen must not call a voided one
// "Pending Signatures", nor say an unfinished one's final hash was verified.
check("PDF viewer: the audit trail's status and final hash come from the record's own rule (src/lib/signingRecord.ts)", /<Badge variant=\{record === 'voided' \|\| record === 'declined' \? 'destructive' : record === 'withdrawn' \|\| record === 'expired' \? 'secondary' : 'default'\} className="mt-0\.5" data-audit-status>\s*\{recordStatusLabel\(document\)\}/.test(viewer) && /data-audit-final-hash>\{recordFinalHashCell\(document\)\}<\/p>/.test(viewer) && !/\{finalHash \|\| \(document\.is_voided \? 'None' : 'Pending'\)\}/.test(viewer));
check("PDF viewer: 'Integrity Verified' only for a finished, unvoided document", /\{document\.status === 'signed' && !document\.is_voided \? \(\s*<div[^>]*data-audit-summary="verified"/.test(viewer) && /data-audit-summary=\{recordSummaryKey\}/.test(viewer) && /const recordSummaryKey = recordClosedUnfinished\(record\) \? record : "in-progress";/.test(viewer) && (viewer.match(/Integrity Verified via SHA-256/g) ?? []).length === 1);
// The eighth product review: the "Final Hash" cell showed the applicant's
// signature hash (v2) on a voided or unfinished document, under a card saying
// there was none; a withdrawn document read "Voided" under a "Withdrawn"
// badge; the record's exports carried the same v2 as the final hash.
check("PDF viewer: the withdrawn, voided, declined and expired cards say so in their own words", /withdrawn: \{\s*title: "Withdrawn before it was signed"/.test(viewer) && /voided: \{\s*title: "Voided before it was finished"/.test(viewer) && /declined: \{\s*title: "Declined before it was finished"/.test(viewer) && /expired: \{\s*title: "Expired before it was signed"/.test(viewer));
check("PDF viewer: the exported audit trail's final hash is the record's too", (viewer.match(/finalHash: recordFinalHash\(document\),/g) ?? []).length === 2 && !/finalHash: document\.v3_hash \|\| document\.v2_hash/.test(viewer));
check("PDF viewer: the phase badge of a closed, unfinished document wears its own word and colours (muted when withdrawn or expired, red when voided or declined)", /recordClosedUnfinished\(record\) \? \(\s*<Badge className=\{`\$\{statusMeta\.badgeClass\} font-medium`\}>\s*<statusMeta\.icon className="h-3 w-3 mr-1\.5" \/>\s*\{statusMeta\.badgeLabel\}/.test(viewer));
// The eighth product review: on a phone the close X sat on "Back to Document".
check("PDF viewer: the audit trail's header keeps clear of the close button's tap area on a phone (pr-14), as the document's header does", /<DialogHeader className="p-4 pb-3 pr-14 sm:p-6 sm:pb-4 sm:pr-12 border-b border-border shrink-0" data-audit-header>/.test(viewer) && /<DialogHeader className="p-4 pb-3 pr-12 sm:p-6 sm:pb-4 border-b border-border shrink-0">/.test(viewer));
// The eighth product review: an expired PDF still offered the place to sign.
check("PDF viewer: the applicant's place to sign only while it is theirs and in time", /const canSignAsCandidate =\s*role === "candidate" &&\s*!!document &&\s*document\.status === "pending" &&\s*!document\.candidate_signed_at &&\s*!document\.is_voided &&\s*applicantDocumentState\(document\) !== "expired";/.test(viewer) && /: applicantDocumentState\(document\) === "expired"\s*\? "expired"/.test(viewer));
// The ninth product review: the business's list and the Audit PDF.
const mappers = read("src/cockpit/lib/mappers.ts");
check("Documents: a declined or expired row opens the signing viewer or the letter sheet, never the raw file", /row\.status === "Pending" \|\| row\.status === "Signed" \|\| row\.status === "Withdrawn" \|\| row\.status === "Voided" \|\| row\.status === "Declined" \|\| row\.status === "Expired" \? \(/.test(docsPage));
check("Documents: a letter past its date and never signed reads Expired, not Waiting, and is waited on by nobody", /if \(status === "pending" && !candidateSignedAt && expiresAt && new Date\(expiresAt\)\.getTime\(\) <= now\) return "Expired";/.test(mappers) && /Expired: \{ label: "Expired"/.test(docsPage) && /pending: rows\.filter\(\(r\) => r\.status === "Pending"\)\.length/.test(docsPage));
check("Documents: the Expires tile only while the applicant may still sign by it", /if \(row\.expires && row\.status === "Pending" && !row\.candidateSignedAt\) meta\.push/.test(docsPage));
check("PDF viewer: a declined document says the reason given", /document\.status === "declined" && document\.decline_reason && \(\s*<p[^>]*data-viewer-decline-reason>/.test(viewer));
check("Audit PDF: the record's own status and 'Not completed' for a closed one, never 'PENDING'", (viewer.match(/status: recordStatusLabel\(document\),\s*completedAt: document\.signed_at,\s*closedUnfinished: recordClosedUnfinished\(recordState\(document\)\),/g) ?? []).length === 2 && /data\.closedUnfinished \? 'Not completed' : 'Pending'/.test(read("src/lib/auditExport.ts")));
// The tenth product review: closed, unfinished documents.
// A PDF the applicant signed and the team voided: the viewer shows only the
// kept copy, which the function now gives on a voided document too; a file it
// cannot show is blamed on the file only when it is not a PDF.
check("PDF viewer: 'not a PDF' only for a file that is not one; a copy that could not be fetched says so, without blaming the file", /setShownPdfFailed\("not_pdf"\)/.test(viewer) && /setShownPdfFailed\("unavailable"\)/.test(viewer) && /shownPdfFailed === "not_pdf"\s*\? role === "candidate"\s*\? "This file is not a PDF, so it can't be shown or signed here\. Ask the hiring team to send it again as a PDF\."\s*: "This file is not a PDF, so it can't be shown or signed here\. Send it again as a PDF\."\s*: shownPdfFailed === "unavailable"\s*\? "This document could not be loaded just now\. Close it and open it again\."/.test(viewer) && !/if it is another kind of file, send it again as a PDF/.test(viewer) && !/throw new Error\("not a pdf"\)/.test(viewer));
{
  // Which of "unavailable" and "not_pdf" the viewer's own loader lands on.
  const loader = /const signedByApplicant = !!document\?\.candidate_signed_at;[\s\S]*?\}\)\(\);/.exec(viewer)?.[0] ?? "";
  check("…the kept copy refused (a void, the network) lands on 'unavailable', never 'not_pdf'", /if \(!kept\) throw new Error\("no signed copy"\);/.test(loader) && /\} catch \{[\s\S]*?setShownPdfFailed\("unavailable"\)/.test(loader) && loader.indexOf('setShownPdfFailed("not_pdf")') > loader.indexOf('!== "%PDF-"'));
}
check("PDF viewer: 'Signed PDF' only for a document signed by both (it was offered on declined, expired, voided and unsigned ones, and saved '<name>_Signed.pdf')", /\{record === "done" && \(\s*<Button variant="outline" size="sm" onClick=\{handleDownload\} data-viewer-signed-pdf>\s*<Download className="h-4 w-4 mr-2" \/>\s*Signed PDF/.test(viewer) && (viewer.match(/>\s*Signed PDF\s*</g) ?? []).length === 1 && /const handleDownload = async \(\) => \{\s*\/\/[^\n]*\n\s*if \(!document \|\| recordState\(document\) !== "done"\) return;/.test(viewer));
check("team: a closed letter (declined, withdrawn, voided, expired) links its signing record too", /\{\(state === "declined" \|\| state === "withdrawn" \|\| state === "voided" \|\| state === "expired"\) && canSend && \(\s*<div className="mt-5 flex justify-end" data-team-document-closed-record>\s*<button[^>]*onClick=\{\(\) => onShowRecord\(document\)\}>[\s\S]{0,120}Signing record/.test(team));
// The thirteenth product review: a teammate without "Send documents" is not offered "Sign to finish", the signed copy or the
// signing record on a letter (document-signing refuses them; the record is empty to them); a plain line says who may.
check("team: no Sign to finish, signed copy or signing record for a teammate who cannot send; a line says who may", /\{state === "yours" && canSend && \(\s*<section/.test(team) && /\{state === "done" && canSend && \(/.test(team) && /\{!canSend && \(state === "yours" \|\| state === "done"[^)]*\) && \(\s*<p[^>]*data-team-document-no-send>/.test(team));
// The fourteenth product review: the line names the signed copy only for a letter that has one; no Withdraw, no "your turn",
// and no promise of a notification for a teammate; the page passes canSend into the counts.
check("team: no Withdraw or 'your turn' for a teammate who cannot send; the copy named only when it exists; the owner is the one notified", /\{state === "waiting" && canSend && \(/.test(team) && /canSend \? `\$\{First\} signed · your turn` : `\$\{First\} signed · waiting on your team`/.test(team) && /: state === "done"\s*\? "Only someone on your team who may send documents can open the signed copy and the signing record\."\s*: "Only someone on your team who may send documents can open the signing record\."/.test(team) && /\? "You'll get a notification when they do, and then you sign here to finish\."\s*: canSend\s*\? "The account owner gets a notification when they do; then you or the owner sign here to finish\."/.test(team) && /isOwner=\{!isTeamMember\}/.test(docsPage) && /requestTitle, Date\.now\(\), canSend\)/.test(docsPage));
// The fifteenth product review: a teammate without "Send documents" saw Approve / Ask again on papers, which the live policy
// refuses silently (0 rows), and the applicant was still asked to send again; the hook now fails on 0 rows, before telling them.
{
  const panel = read("src/cockpit/components/ApplicantDocumentsPanel.tsx");
  const hook = read("src/cockpit/hooks/useApplicantRequests.ts");
  check("papers: Approve and Ask again only for someone who may send documents; a review that changes no row says so and asks no one again", /const canReview = isTeamMember \? !!teamPermissions\?\.canSendDocuments : role === "employer";/.test(panel) && /\{received && canReview && \(/.test(panel) && /data-request-no-review/.test(panel) && /\.eq\("id", request\.id\)\s*\.select\("id"\);/.test(hook) && hook.indexOf("if (!changed || changed.length === 0) throw") > -1 && hook.indexOf("if (!changed || changed.length === 0) throw") < hook.indexOf('title: "Please send it again"'));
}
{
  // The dev preview answers as live does (it served the kept copy before
  // looking at a void, so `pdf,voided` hid the failure).
  const install = read("src/dev-preview/install.ts");
  const handler = install.slice(install.indexOf('if (name !== "document-signing") return null;'));
  const gate = handler.indexOf('if (row.is_voided && body.action !== "view" && body.action !== "original")');
  const original = handler.indexOf('if (body.action === "original")');
  check("dev preview: a voided document answers only view and original, as the function does", gate !== -1 && original !== -1 && gate < original && gate < handler.indexOf('if (body.action === "view")'));
  check("…and the kept copy only once the applicant has signed an uploaded file", /if \(!row\.candidate_signed_at \|\| !row\.v1_hash \|\| !uploaded\) return \{ data: \{ error: "not_pending"/.test(handler.slice(original, original + 900)));
}
// The eleventh product review.
// On a phone a closed document's record had no copy to save: the team's
// Certificate and Audit PDF were hidden there for anything not signed by both.
{
  const copies = /<div className=\{`flex-wrap items-center gap-2 \[&>button\]:whitespace-nowrap \$\{([^`]*)\}`\} data-viewer-copies>/.exec(viewer)?.[1] ?? "";
  // The class each case gets, worked out from the source's own expression.
  const classFor = (status, role, record) => (copies ? new Function("document", "role", "record", "recordClosedUnfinished", `return (${copies});`)({ status }, role, record, (s) => ["voided", "withdrawn", "declined", "expired"].includes(s)) : null);
  check("PDF viewer: on a phone the team's copies show for a closed document (declined, withdrawn, voided, expired)", copies !== "" && ["declined", "withdrawn", "voided", "expired"].every((r) => classFor("pending", "employer", r) === "flex" && classFor("pending", "team_member", r) === "flex"));
  check("…still not while it is being signed (the place to sign comes first on a phone)", classFor("pending", "employer", "waiting") === "hidden sm:flex" && classFor("pending", "employer", "pending") === "hidden sm:flex");
  check("…and never the applicant's before both have signed", ["declined", "withdrawn", "voided", "expired", "waiting"].every((r) => classFor("pending", "candidate", r) === "hidden") && classFor("signed", "candidate", "done") === "flex");
  const cert = /<Button variant="outline" size="sm" onClick=\{handleDownloadCertificate\} disabled=\{!completionCert\} className=\{([^}]*)\} data-viewer-certificate>/.exec(viewer)?.[1] ?? "";
  check("…the Certificate on a phone only for a document signed by both", cert === 'record === "done" ? undefined : "hidden sm:inline-flex"');
  check("…the Audit PDF with no screen rule of its own", /<Button variant="outline" size="sm" onClick=\{handleDownloadAuditPDF\} data-viewer-audit-pdf>/.test(viewer));
}
// A teammate without "Send documents" opening a PDF the applicant signed was
// told it "could not be loaded just now… open it again" (document-signing
// answers them 403, role_mismatch): now they are told why.
{
  const loader = /const signedByApplicant = !!document\?\.candidate_signed_at;[\s\S]*?\}\)\(\);/.exec(viewer)?.[0] ?? "";
  const refusal = loader.indexOf("if (await refusedForRole(data, error)) {");
  check("PDF viewer: a refused kept copy is told apart from a failed load, before anything else is read from the answer", refusal !== -1 && /const \{ data, error \} = await supabase\.functions\.invoke\("document-signing", \{ body: \{ documentId: document\.id, action: "original" \} \}\);/.test(loader) && refusal < loader.indexOf("const kept = ") && /if \(await refusedForRole\(data, error\)\) \{\s*if \(!cancelled\) setShownPdfFailed\("not_allowed"\);\s*return;\s*\}/.test(loader));
  check("…and says plainly who may open it, naming the switch to a teammate", /shownPdfFailed === "not_allowed"\s*\? `On your team, only someone who may send documents can open the signed file\.\$\{isTeamMember \? ` Ask the owner to turn on \$\{TEAM_PERMISSION_NAMES\.canSendDocuments\} for you\.` : ""\}`/.test(viewer));
  const { build } = await import("esbuild");
  const out = await build({ entryPoints: [resolve(root, "src/lib/documentSigningErrors.ts")], bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent" });
  const loaded = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
  // Called through this, so the old code reports each check instead of stopping at the first.
  const errors = { refusedForRole: async (...args) => (typeof loaded.refusedForRole === "function" ? loaded.refusedForRole(...args) : "no refusedForRole") };
  const answer = (status, body) => ({ context: new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }) });
  check("refusedForRole: a 403 from the function is the person, not the file", (await errors.refusedForRole(null, answer(403, { error: "role_mismatch" }))) === true);
  check("…role_mismatch in the body, whatever the status", (await errors.refusedForRole(null, answer(400, { error: "role_mismatch" }))) === true);
  check("…the dev preview's stand-in answering on data", (await errors.refusedForRole({ error: "role_mismatch" }, null)) === true);
  check("…a void, a missing copy or a broken network is not", (await errors.refusedForRole(null, answer(409, { error: "voided" }))) === false && (await errors.refusedForRole(null, answer(409, { error: "not_pending" }))) === false && (await errors.refusedForRole(null, answer(500, { error: "internal_error" }))) === false && (await errors.refusedForRole(null, new Error("Failed to fetch"))) === false && (await errors.refusedForRole({ url: "https://x/y.pdf" }, null)) === false);
  check("…nor an answer with no readable body", (await errors.refusedForRole(null, { context: new Response("not json", { status: 502 }) })) === false);
}
// The letter's sheet: "Send a new offer letter" only to someone who can, and
// not when a later letter already went out to them.
check("team: an expired letter asks for a new one only from someone who may send, and not once a newer one went out", /\{newerLetterSentAt\s*\? ` A newer offer letter went out on \$\{format\(new Date\(newerLetterSentAt\), "MMMM d"\)\}\.`\s*: isOffer && canSend\s*\? " Send a new offer letter if you still want them\."\s*: ""\}/.test(team) && !/\. Send a new offer letter if you still want them\.\s*<\/div>/.test(team));
check("…the page tells it both", /canSend=\{canSend\}/.test(docsPage) && /newerLetterSentAt=\{sheetNewer\?\.createdAt \?\? null\}/.test(docsPage) && /const sheetNewer = sheetRow \? laterLetter\(sheetRow, rows\) : null;/.test(docsPage));
{
  // The dev preview answers a teammate without "Send documents" as live does.
  const install = read("src/dev-preview/install.ts");
  const handler = install.slice(install.indexOf('if (name !== "document-signing") return null;'));
  const roleGate = handler.indexOf('if (role === "team_member") {');
  check("dev preview: a teammate without 'Send documents' gets the function's 403 for every action, before anything else", roleGate !== -1 && roleGate < handler.indexOf("if (row.is_voided && body.action") && /if \(!member\?\.can_send_documents\) \{[\s\S]{0,200}status: 403[\s\S]{0,300}error: Object\.assign\(new Error\("Edge Function returned a non-2xx status code"\), \{ name: "FunctionsHttpError", context \}\)/.test(handler.slice(roleGate, roleGate + 900)));
}

// …and My Documents keeps "To sign" for documents waiting on them.
check("My Documents: 'To sign' lists only documents waiting on them; the rest (signed by them or both, declined, voided, withdrawn, expired) are under 'Signed or closed'", /const toSign = signDocuments\.filter\(\(d\) => waitingOnApplicant\(d, now\)\);/.test(myDocs) && /const closedDocuments = signDocuments\.filter\(\(d\) => !waitingOnApplicant\(d, now\)\);/.test(myDocs) && /data-documents-section="to-sign"[\s\S]*?To sign — \{toSign\.length\} waiting on you[\s\S]*?\{toSign\.map\(/.test(myDocs) && /data-documents-section="closed"[\s\S]*?Signed or closed[\s\S]*?\{closedDocuments\.map\(/.test(myDocs) && !/\{signDocuments\.map\(\(doc\) => \(\s*<SignDocumentRow/.test(myDocs));
check("My Documents: an expired one wears an 'Expired' chip and 'View', never 'Read and sign'", /if \(state === "expired"\) return \{ label: "Expired"/.test(myDocs) && /const theirTurn = waitingOnApplicant\(doc, now\);/.test(myDocs) && /\{theirTurn \? "Read and sign" : "View"\}/.test(myDocs));
const badge = read("src/hooks/usePendingDocumentsCount.ts");
check("the sidebar's badge counts by the same rule (the date read, not only the status)", /select\("id, status, candidate_signed_at, is_voided, expires_at"\)/.test(badge) && /\.filter\(\(d\) => waitingOnApplicant\(d, now\)\)\.length/.test(badge) && !/select\("id", \{ count: "exact", head: true \}\)\s*\.in\("application_id"/.test(badge));
check("the letter's own screen reads whose turn it is by the same rule", /export \{ applicantDocumentState, type ApplicantDocumentState \} from "@\/lib\/applicantDocumentTurn";/.test(applicant) && !/export function applicantDocumentState/.test(applicant));
{
  // The rules themselves, through every state.
  const { build } = await import("esbuild");
  const load = async (rel) => {
    const out = await build({ entryPoints: [resolve(root, rel)], bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent" });
    return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
  };
  const turn = await load("src/lib/applicantDocumentTurn.ts");
  const rec = await load("src/lib/signingRecord.ts");
  const NOW = new Date("2026-10-25T12:00:00Z");
  const past = "2026-10-24T15:59:59Z";
  const future = "2026-10-28T15:59:59Z";
  const docs = {
    yours: { status: "pending", candidate_signed_at: null, is_voided: false, expires_at: future },
    expired: { status: "pending", candidate_signed_at: null, is_voided: false, expires_at: past },
    theirs: { status: "pending", candidate_signed_at: "2026-10-24T13:00:00Z", is_voided: false, expires_at: future, v2_hash: "v2", document_hash: "v2" },
    theirsLate: { status: "pending", candidate_signed_at: "2026-10-24T13:00:00Z", is_voided: false, expires_at: past, v2_hash: "v2", document_hash: "v2" },
    voided: { status: "pending", candidate_signed_at: "2026-10-24T13:00:00Z", is_voided: true, expires_at: future, v2_hash: "v2", document_hash: "v2" },
    withdrawn: { status: "pending", candidate_signed_at: null, is_voided: true, expires_at: future },
    done: { status: "signed", candidate_signed_at: "2026-10-24T13:00:00Z", is_voided: false, expires_at: past, v2_hash: "v2", v3_hash: "v3", document_hash: "v3" },
    declined: { status: "declined", candidate_signed_at: null, is_voided: false, expires_at: future },
  };
  const states = Object.fromEntries(Object.entries(docs).map(([k, d]) => [k, turn.applicantDocumentState(d, NOW)]));
  check("whose turn: theirs to sign only while in time; signed in time it is the team's, whatever the date", JSON.stringify(states) === JSON.stringify({ yours: "yours", expired: "expired", theirs: "theirs", theirsLate: "theirs", voided: "withdrawn", withdrawn: "withdrawn", done: "done", declined: "declined" }), JSON.stringify(states));
  check("…and only 'yours' waits on them (To sign, the badge)", Object.entries(docs).filter(([, d]) => turn.waitingOnApplicant(d, NOW)).map(([k]) => k).join() === "yours");
  check("…at the very second of the date it has passed, as the server reads it", turn.applicantDocumentState({ ...docs.yours, expires_at: NOW.toISOString() }, NOW) === "expired");
  const cells = Object.fromEntries(Object.entries(docs).map(([k, d]) => [k, `${rec.recordStatusLabel(d, NOW)} | ${rec.recordFinalHashCell(d, NOW)}`]));
  check(
    "the record: one word per state, and a final hash only once finished (never the applicant's v2)",
    JSON.stringify(cells) ===
      JSON.stringify({
        yours: "Pending Signatures | Pending",
        expired: "Expired | None",
        theirs: "Waiting for countersign | Pending",
        theirsLate: "Waiting for countersign | Pending",
        voided: "Voided | None",
        withdrawn: "Withdrawn | None",
        done: "Fully Executed | v3",
        declined: "Declined | None",
      }),
    JSON.stringify(cells),
  );
  check("…and the exports' final hash is null until finished", rec.recordFinalHash(docs.voided) === null && rec.recordFinalHash(docs.theirs) === null && rec.recordFinalHash(docs.done) === "v3");
}
check("…and the record still keeps the team's address from the applicant: the trail is read through document_audit_log, and an IP shows only on their own rows", /supabase\.rpc\("document_audit_log" as never/.test(viewer) && /\(role !== "candidate" \|\| log\.user_id === user\?\.id\) && \(/.test(viewer));
{
  // The footer's rule, worked through every state the viewer can be in.
  const footer = ({ role, status = "pending", signed = false, countersigned = false, voided = false }) => {
    const canSign = role === "candidate" && status === "pending" && !signed && !voided;
    const canCountersign = role !== "candidate" && status === "pending" && signed && !countersigned && !voided;
    const audit = status === "signed" || role !== "candidate" || signed;
    return audit ? "both" : canSign || canCountersign ? "phone" : "none";
  };
  check("…the applicant before signing: 'Sign' on a phone, no strip on a computer", footer({ role: "candidate" }) === "phone");
  check("…after signing, waiting on the team, or voided: the audit trail, on every screen", footer({ role: "candidate", signed: true }) === "both" && footer({ role: "candidate", signed: true, voided: true }) === "both");
  check("…declined or withdrawn before signing: nothing, so no footer", footer({ role: "candidate", status: "declined" }) === "none" && footer({ role: "candidate", voided: true }) === "none");
  check("…the team: always", footer({ role: "employer" }) === "both" && footer({ role: "team_member", signed: true }) === "both");
}
check("PDF viewer: 'before you sign' only to the one who signs next", /: canSignAsCandidate\s*\? "Read it here, or open it in its own tab, before you sign\."/.test(viewer));
check("applicant: 'Sign and accept the offer'", /Sign and accept the offer/.test(applicant));
check("team: says it waits on the applicant when it does", /Nothing to do yet\.<\/strong> \{First\} signs first/.test(team));
check("team: countersigns with the review confirmation", /action: "countersign"[\s\S]{0,200}reviewConfirmed: true/.test(team));
check("team: the button stays off until both boxes are ticked", /const canSign = consent && reviewed &&/.test(team));
check("the applicant's page opens written letters in the new screen", /isWrittenDocument\(doc\.file_url\) \? setSheetDocument\(doc\) : setViewerDocument\(doc\)/.test(myDocs));
check("the team's page opens written letters in the new screen", /if \(isWrittenDocument\(full\.file_url\)\) setSheetDocId\(row\.id\);/.test(docsPage) && /<TeamDocumentSheet/.test(docsPage));
check("the team's row button says Sign on their turn", /row\.candidateSignedAt && !row\.isVoided \? "Sign" : "Open"/.test(docsPage));
check("a refresh after signing never hides the finished moment (resets only on open or another document)", /\}, \[open, documentId, userId, fileUrl\]\);/.test(team) && /\}, \[open, documentId\]\);/.test(applicant));

console.log(`signing screens: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
