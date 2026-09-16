import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { renderSignedUploadedPdf, renderTextDocumentPdf, type FinalCertificateData, type SignatureOverlay } from "./renderFinalPdf.ts";

// A well-known minimal (1x1, transparent) valid PNG, base64-encoded — real
// image bytes, not a placeholder string, so embedPng actually exercises its
// real decode path rather than always hitting the embedJpg fallback.
const MINIMAL_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function makeMinimalPdfBytes(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const FIXED_CERT: FinalCertificateData = {
  documentId: "doc-1",
  documentCode: "DOC-DETERMINISM-TEST",
  documentName: "Offer Letter",
  documentType: "offer_letter",
  completionTimestampUtc: "2026-09-15T12:00:00.000Z",
  candidateName: "Cand X",
  candidateEmail: "candx@example.com",
  candidateSignedAt: "2026-09-15T10:00:00.000Z",
  candidateIp: "203.0.113.5",
  employerName: "Emp Y",
  employerEmail: "empy@example.com",
  employerSignedAt: "2026-09-15T12:00:00.000Z",
  employerIp: "203.0.113.9",
  v1Hash: "v1hash",
  v2Hash: "v2hash",
  v3Hash: "v3hash",
  auditEntriesCount: 5,
};

Deno.test("renderTextDocumentPdf is a pure function of its inputs — two renders of the same document are byte-identical", async () => {
  const first = await renderTextDocumentPdf("Dear Cand X,\n\nWelcome aboard.\n\nSincerely,\nEmp Y", null, null, FIXED_CERT);
  const second = await renderTextDocumentPdf("Dear Cand X,\n\nWelcome aboard.\n\nSincerely,\nEmp Y", null, null, FIXED_CERT);

  if (first.length !== second.length) {
    throw new Error(`byte length differs: ${first.length} vs ${second.length}`);
  }
  for (let i = 0; i < first.length; i++) {
    if (first[i] !== second[i]) {
      throw new Error(`byte ${i} differs: ${first[i]} vs ${second[i]} — render is not deterministic`);
    }
  }
});

Deno.test("renderTextDocumentPdf output changes when the completion timestamp changes", async () => {
  const first = await renderTextDocumentPdf("Body", null, null, FIXED_CERT);
  const second = await renderTextDocumentPdf("Body", null, null, {
    ...FIXED_CERT,
    completionTimestampUtc: "2026-09-16T00:00:00.000Z",
  });

  let identical = first.length === second.length;
  if (identical) {
    for (let i = 0; i < first.length; i++) {
      if (first[i] !== second[i]) {
        identical = false;
        break;
      }
    }
  }
  if (identical) {
    throw new Error("changing the completion timestamp should change the rendered bytes");
  }
});

// Repairer finding: renderSignedUploadedPdf's overlaySignature crashed with
// an unhandled "Invalid URL" TypeError whenever a signature's
// signatureDataUrl was a typed name (a plain string, not a data: URL) —
// dataUrlToBytes's `fetch(dataUrl)` throws for any non-URL string, and only
// the embedPng/embedJpg call after it was wrapped in try/catch. This is the
// common, first-class "uploaded PDF + typed signature" path through
// DocumentSigningPanel.tsx, and no test previously exercised
// renderSignedUploadedPdf at all.
Deno.test("renderSignedUploadedPdf does not throw when a signature is typed (a plain name, not a data: URL)", async () => {
  const original = await makeMinimalPdfBytes();
  const typedSignature: SignatureOverlay = {
    signatureDataUrl: "Jane Q. Candidate",
    x: 10,
    y: 80,
    width: 25,
    height: 8,
    page: 1,
    signerName: "Jane Q. Candidate",
    signedAt: "2026-09-15T10:00:00.000Z",
    signerRole: "candidate",
  };
  const employerTypedSignature: SignatureOverlay = {
    ...typedSignature,
    signatureDataUrl: "Erin Employer",
    signerName: "Erin Employer",
    signerRole: "employer",
  };

  // Must not throw — before the fix, this rejected with "Invalid URL:
  // Jane Q. Candidate" and the countersign edge function surfaced it as a
  // permanent 500 (retries never help; the stored signature never changes).
  const bytes = await renderSignedUploadedPdf(original, typedSignature, employerTypedSignature, FIXED_CERT);
  if (!bytes || bytes.length === 0) {
    throw new Error("renderSignedUploadedPdf returned no bytes for typed signatures");
  }
});

Deno.test("renderSignedUploadedPdf still embeds a real drawn (PNG) signature image", async () => {
  const original = await makeMinimalPdfBytes();
  const drawnSignature: SignatureOverlay = {
    signatureDataUrl: MINIMAL_PNG_DATA_URL,
    x: 10,
    y: 80,
    width: 25,
    height: 8,
    page: 1,
    signerName: "Jane Q. Candidate",
    signedAt: "2026-09-15T10:00:00.000Z",
    signerRole: "candidate",
  };

  const bytes = await renderSignedUploadedPdf(original, drawnSignature, null, FIXED_CERT);
  if (!bytes || bytes.length === 0) {
    throw new Error("renderSignedUploadedPdf returned no bytes for a drawn signature");
  }
});

Deno.test("renderSignedUploadedPdf mixing one typed and one drawn signature does not throw", async () => {
  const original = await makeMinimalPdfBytes();
  const drawnSignature: SignatureOverlay = {
    signatureDataUrl: MINIMAL_PNG_DATA_URL,
    x: 10,
    y: 80,
    width: 25,
    height: 8,
    page: 1,
    signerName: "Jane Q. Candidate",
    signedAt: "2026-09-15T10:00:00.000Z",
    signerRole: "candidate",
  };
  const typedSignature: SignatureOverlay = {
    signatureDataUrl: "Erin Employer",
    x: 55,
    y: 80,
    width: 25,
    height: 8,
    page: 1,
    signerName: "Erin Employer",
    signedAt: "2026-09-15T12:00:00.000Z",
    signerRole: "employer",
  };

  const bytes = await renderSignedUploadedPdf(original, drawnSignature, typedSignature, FIXED_CERT);
  if (!bytes || bytes.length === 0) {
    throw new Error("renderSignedUploadedPdf returned no bytes for a mixed typed/drawn pair");
  }
});
