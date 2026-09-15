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
];
