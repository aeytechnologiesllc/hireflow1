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
  candidatePlace: "Manila, Metro Manila, PH",
  candidateDevice: "Phone, iOS, 390x844, Asia/Manila",
  employerName: "Emp Y",
  employerEmail: "empy@example.com",
  employerSignedAt: "2026-09-15T12:00:00.000Z",
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

// 2026-10-10, rehearsing the first live countersign: a blank page sat
// between the letter and the certificate, and a letter with a peso sign or
// an emoji in it could not be rendered at all (the countersign failed).
Deno.test("renderTextDocumentPdf: the letter, then the certificate, no blank page between", async () => {
  const bytes = await renderTextDocumentPdf("Dear Ana,\n\nShort letter.", null, null, FIXED_CERT);
  const doc = await PDFDocument.load(bytes);
  if (doc.getPageCount() !== 2) throw new Error(`expected 2 pages (letter + certificate), got ${doc.getPageCount()}`);
});

Deno.test("renderTextDocumentPdf: a peso sign, an emoji and another script do not stop the render", async () => {
  const peso = String.fromCharCode(0x20b1);
  const content = `PAY\n${peso}25,000 a month \u{1F389}\r\nWelcome, José 张伟 — see you Monday.`;
  const typed: SignatureOverlay = { signatureDataUrl: "张伟 Reyes", x: 10, y: 80, width: 25, height: 8, page: 1, signerName: "张伟 Reyes", signedAt: "2026-09-15T10:00:00.000Z", signerRole: "candidate" };
  const bytes = await renderTextDocumentPdf(content, typed, null, { ...FIXED_CERT, candidateName: "张伟 Reyes", documentName: `Offer ${peso}` });
  if (bytes.length < 1000) throw new Error("render produced no real PDF");
});

Deno.test("utcStamp reads UTC whatever the server's zone", async () => {
  const { utcStamp } = await import("./renderFinalPdf.ts");
  const got = utcStamp("2026-10-10T19:00:13.875+00:00");
  if (got !== "October 10, 2026 at 7:00:13 PM UTC") throw new Error(`got "${got}"`);
  const noon = utcStamp("2026-10-10T00:05:00Z", false);
  if (noon !== "October 10, 2026 at 12:05 AM UTC") throw new Error(`got "${noon}"`);
});

Deno.test("pdfSafe spells out the peso sign and replaces what the font cannot draw", async () => {
  const { pdfSafe } = await import("./renderFinalPdf.ts");
  const doc = await PDFDocument.create();
  const { StandardFonts } = await import("https://esm.sh/pdf-lib@1.17.1");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const out = pdfSafe(font, `${String.fromCharCode(0x20b1)}500 — café \u{1F389}`);
  if (out !== "PHP 500 — café ?") throw new Error(`got "${out}"`);
  // The first version of this turned every line break into "?" and ran the
  // whole letter into one paragraph.
  if (pdfSafe(font, "Dear Ana,\n\nWelcome.") !== "Dear Ana,\n\nWelcome.") throw new Error("line breaks must survive");
});

/** The PDF's font names (its objects are compressed, so the raw bytes do not show them). */
async function fontNames(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const names: string[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    const text = object.toString();
    const match = /\/BaseFont\s*\/(\S+)/.exec(text);
    if (match && text.includes("/Type /Font")) names.push(match[1]);
  }
  return names;
}

// The owner's pick, 2026-10-10: a typed signature is written in Allura, the
// script the signing screens show it in.
Deno.test("renderTextDocumentPdf: a typed signature is written in Allura, and the render stays byte-identical", async () => {
  const typed = (name: string, role: "candidate" | "employer"): SignatureOverlay => ({ signatureDataUrl: name, x: 10, y: 80, width: 25, height: 8, page: 1, signerName: name, signedAt: "2026-09-15T10:00:00.000Z", signerRole: role });
  const a = await renderTextDocumentPdf("Dear Ana,", typed("Ana Reyes", "candidate"), typed("Emp Y", "employer"), FIXED_CERT);
  const b = await renderTextDocumentPdf("Dear Ana,", typed("Ana Reyes", "candidate"), typed("Emp Y", "employer"), FIXED_CERT);
  const fonts = await fontNames(a);
  if (!fonts.some((name) => name.includes("Allura"))) throw new Error(`no Allura font in the PDF: ${fonts.join(", ")}`);
  if (a.length !== b.length || a.some((byte, i) => byte !== b[i])) throw new Error("two renders of the same signed letter differ");
});

Deno.test("renderTextDocumentPdf: a drawn-only letter does not carry the signature font", async () => {
  const drawn: SignatureOverlay = { signatureDataUrl: MINIMAL_PNG_DATA_URL, x: 10, y: 80, width: 25, height: 8, page: 1, signerName: "Ana", signedAt: "2026-09-15T10:00:00.000Z", signerRole: "candidate" };
  const bytes = await renderTextDocumentPdf("Dear Ana,", drawn, null, FIXED_CERT);
  if ((await fontNames(bytes)).some((name) => name.includes("Allura"))) throw new Error("Allura embedded with no typed signature");
});

Deno.test("renderSignedUploadedPdf: a typed signature is written in Allura", async () => {
  const typed: SignatureOverlay = { signatureDataUrl: "Ana Reyes", x: 10, y: 80, width: 25, height: 8, page: 1, signerName: "Ana Reyes", signedAt: "2026-09-15T10:00:00.000Z", signerRole: "candidate" };
  const bytes = await renderSignedUploadedPdf(await makeMinimalPdfBytes(), typed, null, FIXED_CERT);
  const fonts = await fontNames(bytes);
  if (!fonts.some((name) => name.includes("Allura"))) throw new Error(`no Allura font in the PDF: ${fonts.join(", ")}`);
});
