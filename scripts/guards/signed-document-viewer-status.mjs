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
];
