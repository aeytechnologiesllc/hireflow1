import { renderTextDocumentPdf, type FinalCertificateData } from "./renderFinalPdf.ts";

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
