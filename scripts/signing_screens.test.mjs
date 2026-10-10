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
