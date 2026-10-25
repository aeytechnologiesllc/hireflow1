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
check("PDF viewer: the audit trail's status says Voided, or Waiting for countersign", /document\.is_voided \? 'Voided' : document\.status === 'signed' \? 'Fully Executed' : document\.candidate_signed_at \? 'Waiting for countersign' : 'Pending Signatures'/.test(viewer));
check("PDF viewer: 'Integrity Verified' only for a finished, unvoided document", /\{document\.status === 'signed' && !document\.is_voided \? \(\s*<div[^>]*data-audit-summary="verified"/.test(viewer) && /data-audit-summary=\{document\.is_voided \? "voided" : "in-progress"\}/.test(viewer) && (viewer.match(/Integrity Verified via SHA-256/g) ?? []).length === 1);
// …and My Documents keeps "To sign" for documents still open.
check("My Documents: 'To sign' lists only open documents; signed, declined, voided and withdrawn ones are under 'Signed or closed'", /const openDocuments = signDocuments\.filter\(\(d\) => d\.status === "pending" && !d\.is_voided\);/.test(myDocs) && /data-documents-section="to-sign"[\s\S]*?\{openDocuments\.map\(/.test(myDocs) && /data-documents-section="closed"[\s\S]*?Signed or closed[\s\S]*?\{closedDocuments\.map\(/.test(myDocs) && !/\{signDocuments\.map\(\(doc\) => \(\s*<SignDocumentRow/.test(myDocs));
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
