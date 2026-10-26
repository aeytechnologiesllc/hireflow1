/**
 * SignedDocumentViewer's main document view claimed a document was
 * "Fully Signed" / "Signed and Time-Stamped" / "SHA-256 verified" and
 * carried a "Certificate of Completion" unconditionally — none of it
 * gated on document.status. Wired live for the first time from
 * src/pages/MyDocuments.tsx (:170) by the candidate-nav fix, this meant a
 * candidate opening any *pending* (unsigned) or *declined* document was
 * told it was fully executed and SHA-256 verified, directly contradicting
 * the "Awaiting your signature" / "Declined" chip on the card they just
 * clicked "View" from.
 *
 * The fix drives the header badge, the document-identity banner, each
 * signer's "Verified" tag, and the Certificate-of-Completion strip off
 * document.status via a signed/declined/pending lookup, so an unsigned or
 * declined document is never claimed as complete.
 */
export default [
  {
    id: "signed-document-viewer-status-honesty",
    why: "SignedDocumentViewer's document view claiming \"Fully Signed\" / SHA-256 verified regardless of document.status means every pending or declined document a candidate opens on /my-documents lies to them about its real state.",
    run: async ({ read }) => {
      const detail = [];
      const file = "src/components/documents/SignedDocumentViewer.tsx";
      const src = await read(file);
      if (src == null) {
        detail.push(`${file} is missing`);
        return { ok: false, detail };
      }

      // A status lookup covering all three real document_status values must
      // exist, so the view has something status-aware to render from instead
      // of one hardcoded "fully done" state.
      if (!/\bpending\b/.test(src) || !/\bdeclined\b/.test(src) || !/\bsigned\b/.test(src)) {
        detail.push("no status lookup covering signed/declined/pending found");
      }

      // Only look at what's actually rendered from here on — a lookup table
      // legitimately holds strings like "Fully Signed" earlier in the file.
      const bodyStart = src.indexOf("export function SignedDocumentViewer");
      if (bodyStart === -1) {
        detail.push("SignedDocumentViewer component not found");
        return { ok: false, detail };
      }
      const body = src.slice(bodyStart);

      if (!/document\.status/.test(body)) {
        detail.push("the rendered document view never reads document.status");
      }

      // The header badge must not hardcode "Fully Signed" as static JSX text.
      if (/Fully Signed\s*\n\s*<\/Badge>/.test(body)) {
        detail.push('the header Badge still hardcodes "Fully Signed" as static JSX text');
      }

      // The document banner must not hardcode the signed/verified claim.
      if (/>Signed and Time-Stamped<\/p>/.test(body) || />SHA-256 verified<\/p>/.test(body)) {
        detail.push('the document banner still hardcodes "Signed and Time-Stamped" / "SHA-256 verified" as static JSX text');
      }

      // The Certificate of Completion strip must be conditional on a signed
      // status, not rendered for every document regardless of state.
      const certIdx = body.indexOf("Certificate of Completion");
      if (certIdx === -1) {
        detail.push('the "Certificate of Completion" strip is gone entirely — a signed document should still show it');
      } else {
        const before = body.slice(Math.max(0, certIdx - 600), certIdx);
        if (!/status\s*===\s*["']signed["']/.test(before)) {
          detail.push('the "Certificate of Completion" strip isn\'t gated on document.status === "signed"');
        }
      }

      // Each signer's "Verified" tag must be gated on that signer's own
      // *_signed_at timestamp, not shown under every signature block
      // regardless of whether that party has actually signed.
      const verifiedTags = [...body.matchAll(/<span>Verified<\/span>/g)];
      if (verifiedTags.length === 0) {
        detail.push('no per-signer "Verified" tag found to check');
      }
      for (const m of verifiedTags) {
        const before = body.slice(Math.max(0, m.index - 300), m.index);
        if (!/(candidate|employer)_signed_at\s*&&/.test(before)) {
          detail.push('a "Verified" tag renders without being gated on that signer\'s *_signed_at');
          break;
        }
      }

      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "signing-record-final-hash-and-words",
    why:
      "The eighth product review: the audit trail's \"Final Hash\" showed the applicant's signature hash (v2) on a " +
      "voided or unfinished document, under a card saying there was none, and a withdrawn document read \"Voided\" " +
      "under a \"Withdrawn\" badge. Fails if the cell or the exports go back to v3 || v2 || document_hash, or the " +
      "record stops telling withdrawn from voided.",
    run: async ({ read }) => {
      const detail = [];
      const viewer = await read("src/components/documents/SignedDocumentViewer.tsx");
      const record = await read("src/lib/signingRecord.ts");
      if (!viewer || !record) return { ok: false, detail: ["SignedDocumentViewer.tsx or src/lib/signingRecord.ts is missing"] };
      if (!/data-audit-final-hash>\{recordFinalHashCell\(document\)\}/.test(viewer)) detail.push("the audit trail's Final Hash cell must be recordFinalHashCell(document)");
      if (/finalHash: document\.v3_hash \|\| document\.v2_hash/.test(viewer)) detail.push("the audit exports must take recordFinalHash(document), not v3 || v2 || document_hash");
      if (!/\{recordStatusLabel\(document\)\}/.test(viewer)) detail.push("the audit trail's Status cell must be recordStatusLabel(document)");
      const finalHash = /export function recordFinalHash\([\s\S]*?\n}/.exec(record)?.[0] ?? "";
      if (!/if \(recordState\(doc\) !== "done"\) return null;/.test(finalHash)) detail.push("recordFinalHash must give a hash for a finished document only");
      if (!/if \(doc\.is_voided\) return doc\.candidate_signed_at \? "voided" : "withdrawn";/.test(record)) detail.push("recordState must tell voided (after signing) from withdrawn (before)");
      if (!/withdrawn: "Withdrawn"/.test(record)) detail.push('the record must call a withdrawn document "Withdrawn"');
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "signing-record-times-are-utc",
    why:
      "The eighth product review: every time on the signing record was the viewer's own clock printed with \"UTC\" " +
      "after it (date-fns reads the browser's zone), so Manila and New York saw times twelve hours apart for one " +
      "signature. Fails on any date-fns format() with a 'UTC' label in src, or if the record's screens and PDFs stop " +
      "reading their times from src/lib/utcTime.ts.",
    run: async ({ read, sources }) => {
      const detail = [];
      for (const { rel, text } of await sources([".ts", ".tsx"])) {
        if (!rel.startsWith("src/")) continue;
        if (/\bformat\([^;\n]*'UTC'/.test(text)) detail.push(`${rel}: a date-fns format with a 'UTC' label prints local time; use src/lib/utcTime.ts`);
      }
      for (const rel of ["src/components/documents/SignedDocumentViewer.tsx", "src/lib/auditExport.ts", "src/lib/certificatePDF.ts", "src/lib/pdfSignatureBurner.ts", "src/pages/VerifyDocument.tsx", "src/lib/auditFormatting.ts"]) {
        const src = await read(rel);
        if (!src) detail.push(`${rel} is missing`);
        else if (!/from ["'](@\/lib|\.)\/utcTime["']/.test(src)) detail.push(`${rel} no longer reads its times from utcTime`);
      }
      const helper = await read("src/lib/utcTime.ts");
      if (!helper || !/getUTCHours\(\)/.test(helper) || /from "date-fns"/.test(helper)) detail.push("src/lib/utcTime.ts must read the instant's UTC parts, not date-fns");
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "signed-pdf-only-when-signed-by-both",
    why:
      "The tenth product review: on a computer the team's viewer offered \"Signed PDF\" on declined, expired, voided " +
      "and unsigned documents, and saved \"<name>_Signed.pdf\" (\"Signed PDF downloaded.\") with nobody's signature " +
      "on it. Fails if the button is shown, or the download runs, for anything but a document signed by both.",
    run: async ({ read }) => {
      const viewer = await read("src/components/documents/SignedDocumentViewer.tsx");
      if (!viewer) return { ok: false, detail: ["SignedDocumentViewer.tsx is missing"] };
      const detail = [];
      const buttons = [...viewer.matchAll(/>\s*Signed PDF\s*</g)];
      if (buttons.length !== 1) detail.push(`expected one "Signed PDF" button, found ${buttons.length}`);
      else if (!/\{record === "done" && \(\s*<Button[^>]*onClick=\{handleDownload\}[^>]*>\s*<Download[^>]*\/>\s*$/.test(viewer.slice(Math.max(0, buttons[0].index - 400), buttons[0].index + 1))) {
        detail.push('the "Signed PDF" button must be inside {record === "done" && (...)}');
      }
      if (!/const handleDownload = async \(\) => \{[^}]*?if \(!document \|\| recordState\(document\) !== "done"\) return;/.test(viewer)) {
        detail.push("handleDownload must save nothing for a document not signed by both");
      }
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "viewer-says-not-a-pdf-only-for-a-file-that-is-not-one",
    why:
      "The tenth product review: a PDF the team voided after the applicant signed could not be opened, and the viewer " +
      "told the team to \"send it again as a PDF\" and the applicant to ask for one. Fails if the viewer stops telling " +
      "a file that is not a PDF from one it could not fetch, or blames the file for the second.",
    run: async ({ read }) => {
      const viewer = await read("src/components/documents/SignedDocumentViewer.tsx");
      if (!viewer) return { ok: false, detail: ["SignedDocumentViewer.tsx is missing"] };
      const detail = [];
      if (!/useState<"not_pdf" \| "unavailable"(?: \| "[a-z_]+")* \| null>\(null\)/.test(viewer)) detail.push("shownPdfFailed must say why: \"not_pdf\" or \"unavailable\"");
      const loader = /const signedByApplicant = !!document\?\.candidate_signed_at;[\s\S]*?\}\)\(\);/.exec(viewer)?.[0] ?? "";
      if (!/!== "%PDF-"\) \{\s*if \(!cancelled\) setShownPdfFailed\("not_pdf"\);/.test(loader)) detail.push('only the "%PDF-" check may set "not_pdf"');
      if (!/\} catch \{[\s\S]*?setShownPdfFailed\("unavailable"\)/.test(loader) || /catch \{[^}]*not_pdf/.test(loader)) detail.push('a refused or failed fetch must set "unavailable", never "not_pdf"');
      const unavailable = /shownPdfFailed === "unavailable"\s*\?\s*"([^"]*)"/.exec(viewer)?.[1] ?? "";
      if (!unavailable) detail.push("the viewer must have its own words for a file it could not fetch");
      else if (/PDF/.test(unavailable)) detail.push(`"${unavailable}" blames the file for a fetch that failed`);
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "closed-letter-links-its-signing-record",
    why:
      "The tenth product review: the team's letter sheet linked the signing record (the audit trail and its copies) " +
      "only once both had signed, so a declined, withdrawn, voided or expired offer letter had no way to it. Fails " +
      "if a closed letter loses the link.",
    run: async ({ read }) => {
      const sheet = await read("src/cockpit/components/TeamDocumentSheet.tsx");
      if (!sheet) return { ok: false, detail: ["src/cockpit/components/TeamDocumentSheet.tsx is missing"] };
      // (For someone who may send documents: the thirteenth product review hid it from a teammate who may not,
      // whom document_audit_log answers with nothing.)
      const block = /\{\(state === "declined" \|\| state === "withdrawn" \|\| state === "voided" \|\| state === "expired"\) && canSend && \([\s\S]*?\n\s*\)\}/.exec(sheet)?.[0] ?? "";
      const ok = /onClick=\{\(\) => onShowRecord\(document\)\}/.test(block) && /Signing record/.test(block);
      return { ok, detail: ok ? [] : ["a closed letter (declined, withdrawn, voided, expired) must link its signing record (onShowRecord)"] };
    },
  },
  {
    id: "audit-trail-header-clears-close-button",
    why:
      "The eighth product review: on a phone the dialog's close X (and its 44px tap area at right-3) sat on " +
      "\"Back to Document\" in the audit trail, so a tap there closed the whole viewer. Fails if the audit header " +
      "loses its phone padding (pr-14).",
    run: async ({ read }) => {
      const viewer = await read("src/components/documents/SignedDocumentViewer.tsx");
      const header = /<DialogHeader className="([^"]*)"[^>]*data-audit-header>/.exec(viewer ?? "")?.[1];
      if (!header) return { ok: false, detail: ["the audit trail's header (data-audit-header) is gone"] };
      const ok = /(^|\s)pr-14(\s|$)/.test(header) && !/(^|\s)p-6(\s|$)/.test(header);
      return { ok, detail: ok ? [] : [`the audit header's classes ("${header}") must keep pr-14 on a phone`] };
    },
  },
  {
    id: "closed-document-audit-pdf-on-a-phone",
    why:
      "The eleventh product review: on a phone the team's Certificate and Audit PDF were hidden for any document not " +
      "signed by both (to keep the place to sign in view), so a declined, withdrawn, voided or expired document's " +
      "record had no copy to save there. Fails if the team's copies go back to hidden on a phone for a closed " +
      "document, if the applicant's show before both have signed, or if a phone offers the Certificate for a " +
      "document not signed by both.",
    run: async ({ read }) => {
      const viewer = await read("src/components/documents/SignedDocumentViewer.tsx");
      if (!viewer) return { ok: false, detail: ["SignedDocumentViewer.tsx is missing"] };
      const detail = [];
      const copies = /<div className=\{`flex-wrap items-center gap-2 \[&>button\]:whitespace-nowrap \$\{([^`]*)\}`\} data-viewer-copies>/.exec(viewer)?.[1] ?? "";
      if (copies !== 'document.status === "signed" ? "flex" : role === "candidate" ? "hidden" : recordClosedUnfinished(record) ? "flex" : "hidden sm:flex"') {
        detail.push(`the copies' classes ("${copies}") must show the team's on a phone for a closed document, and the applicant's only once signed by both`);
      }
      if (!/onClick=\{handleDownloadCertificate\} disabled=\{!completionCert\} className=\{record === "done" \? undefined : "hidden sm:inline-flex"\}/.test(viewer)) detail.push("the Certificate must stay off a phone unless the document is signed by both");
      if (/onClick=\{handleDownloadAuditPDF\}[^>]*className=/.test(viewer)) detail.push("the Audit PDF must have no screen rule of its own (it goes with the copies)");
      return { ok: detail.length === 0, detail };
    },
  },
  {
    id: "viewer-tells-a-teammate-who-may-open-the-signed-copy",
    why:
      "The eleventh product review: a teammate without \"Send documents\" can list documents (the documents SELECT " +
      "policy is every active teammate on the job) but document-signing answers their `original` with a 403, and the " +
      "viewer said the signed file \"could not be loaded just now. Close it and open it again.\", which never helps. " +
      "Fails if the viewer stops reading a refusal from the answer before treating it as a failed load, or loses the " +
      "words that say who may open it.",
    run: async ({ read }) => {
      const viewer = await read("src/components/documents/SignedDocumentViewer.tsx");
      const errors = await read("src/lib/documentSigningErrors.ts");
      if (!viewer || !errors) return { ok: false, detail: ["SignedDocumentViewer.tsx or src/lib/documentSigningErrors.ts is missing"] };
      const detail = [];
      const loader = /const signedByApplicant = !!document\?\.candidate_signed_at;[\s\S]*?\}\)\(\);/.exec(viewer)?.[0] ?? "";
      const refusal = loader.indexOf("if (await refusedForRole(data, error)) {");
      if (refusal === -1 || refusal > loader.indexOf("const kept = ") || !/if \(await refusedForRole\(data, error\)\) \{\s*if \(!cancelled\) setShownPdfFailed\("not_allowed"\);\s*return;/.test(loader)) detail.push("the viewer must read a refusal (refusedForRole) before it reads the kept copy's address, and say not_allowed");
      if (!/shownPdfFailed === "not_allowed"\s*\? `On your team, only someone who may send documents can open the signed file\./.test(viewer)) detail.push("the viewer must say who may open the signed file");
      const fn = /export async function refusedForRole\([\s\S]*?\n}/.exec(errors)?.[0] ?? "";
      if (!/=== "role_mismatch"/.test(fn) || !/context\.status === 403/.test(fn)) detail.push("refusedForRole must read the function's 403 and role_mismatch");
      return { ok: detail.length === 0, detail };
    },
  },
];
