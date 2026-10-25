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
check("PDF viewer: the applicant's copies only once signed", /\$\{document\.status === "signed" \? "flex" : role === "candidate" \? "hidden" : "hidden sm:flex"\}/.test(viewer));
// The sixth product review: the audit trail is the applicant's once THEY have
// signed (it waited for the countersign, and was gone for good after a void),
// and the footer shows only on a screen where it holds a button (it was an
// empty strip on a computer before signing, and everywhere while waiting).
check("PDF viewer: the applicant's audit trail once they have signed, countersigned or not, voided or not; never before", /const auditTrailOffered = document\?\.status === "signed" \|\| role !== "candidate" \|\| !!document\?\.candidate_signed_at;/.test(viewer) && /\{auditTrailOffered && \(\s*<Button onClick=\{\(\) => setShowAuditTrail\(true\)\}/.test(viewer) && !/\{\(document\.status === "signed" \|\| role !== "candidate"\) && \(\s*<Button onClick=\{\(\) => setShowAuditTrail/.test(viewer));
check("PDF viewer: the footer only where it has a button: everywhere with the audit trail, on a phone for 'Sign' alone, else none", /const footerOn: "both" \| "phone" \| "none" = auditTrailOffered \? "both" : canSignAsCandidate \|\| canCountersignAsEmployer \? "phone" : "none";/.test(viewer) && /\{footerOn !== "none" && \(\s*<div className=\{`p-3 sm:p-4 border-t border-border bg-card shrink-0 \$\{footerOn === "phone" \? "sm:hidden" : ""\}`\}/.test(viewer) && /className="gap-2 whitespace-nowrap sm:hidden"\s*data-go-to-sign/.test(viewer));
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
