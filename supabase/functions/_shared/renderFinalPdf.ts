/**
 * Renders the ONE canonical, permanently-hashed final PDF for a fully
 * countersigned document — see docs/DOCUMENT-SIGNING.md §2.
 *
 * Ported from src/lib/pdfSignatureBurner.ts's `burnSignaturesIntoPdf`
 * (framework-agnostic already — pdf-lib, date-fns, fetch, no DOM — so it
 * runs unchanged under Deno via the same esm.sh import style every other
 * function in this repo already uses for @supabase/supabase-js), with one
 * deliberate change: the footer's `Generated: ${format(new Date(), ...)}`
 * line is replaced with the document's own completion_timestamp_utc — makes
 * the render a pure function of stored data, which "hash the bytes and have
 * that hash mean something forever" requires. Two identical inputs must
 * produce byte-identical output; see renderFinalPdf.test.ts.
 *
 * Also adds `renderTextDocumentPdf`, the AI-generated (text) document path
 * the client's jsPDF-based `handleDownloadGeneratedPdf` covers today — one
 * PDF library instead of two, and jsPDF doesn't need to exist inside the
 * edge function.
 */
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { format } from "https://esm.sh/date-fns@3.6.0";

export interface SignatureOverlay {
  signatureDataUrl: string;
  x: number; // percentage (0-100)
  y: number; // percentage (0-100)
  width: number; // percentage (0-100)
  height: number; // percentage (0-100)
  page: number; // 1-indexed
  signerName: string;
  signedAt: string;
  signerRole: "candidate" | "employer";
}

export interface FinalCertificateData {
  documentId: string;
  documentCode: string;
  documentName: string;
  documentType: string | null;
  completionTimestampUtc: string;
  candidateName: string;
  candidateEmail?: string;
  candidateSignedAt: string;
  candidateIp?: string;
  employerName: string;
  employerEmail?: string;
  employerSignedAt: string;
  employerIp?: string;
  v1Hash?: string | null;
  v2Hash?: string | null;
  v3Hash?: string | null;
  auditEntriesCount: number;
}

/**
 * pdf-lib's `PDFDocument.create()`/`.load()` stamp CreationDate/ModDate
 * metadata with `new Date()` at call time unless told otherwise — left
 * alone, that alone would make every render of the "same" document
 * byte-different, defeating the entire point of a canonical, once-hashed
 * final PDF. Pin both to the document's own completion timestamp so the
 * output is a pure function of stored data. See renderFinalPdf.test.ts.
 */
// deno-lint-ignore no-explicit-any
function setDeterministicMetadata(pdfDoc: any, cert: FinalCertificateData): void {
  const at = new Date(cert.completionTimestampUtc);
  pdfDoc.setCreationDate(at);
  pdfDoc.setModificationDate(at);
  pdfDoc.setProducer("HireFlow");
  pdfDoc.setTitle(cert.documentName);
}

async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new Uint8Array(await blob.arrayBuffer());
}

/** Burn both signatures into an uploaded PDF and append a certificate page. */
export async function renderSignedUploadedPdf(
  originalPdfBytes: ArrayBuffer,
  candidateSignature: SignatureOverlay | null,
  employerSignature: SignatureOverlay | null,
  certificateData: FinalCertificateData,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalPdfBytes, { ignoreEncryption: true });
  setDeterministicMetadata(pdfDoc, certificateData);
  const pages = pdfDoc.getPages();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const footerText = "Electronically signed and verified via HireFlow.";
  for (const page of pages) {
    const { width: pageWidth } = page.getSize();
    const textWidth = helvetica.widthOfTextAtSize(footerText, 6);
    page.drawText(footerText, {
      x: (pageWidth - textWidth) / 2,
      y: 15,
      size: 6,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  const overlaySignature = async (sig: SignatureOverlay) => {
    const pageIndex = sig.page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) return;
    const page = pages[pageIndex];
    const { width: pageWidth, height: pageHeight } = page.getSize();

    // A typed signature's value is the signer's plain name, not a data:
    // URL — dataUrlToBytes's `fetch(dataUrl)` throws a hard TypeError for
    // any non-URL string, not something embedPng/embedJpg's own try/catch
    // below ever sees. Left unguarded, countersigning an uploaded-PDF
    // document whenever either party typed (rather than drew) their
    // signature threw out of this function, rolled back the reservation,
    // and returned a generic 500 — permanently, since the candidate's
    // stored typed signature never changes between retries. Mirrors
    // renderTextDocumentPdf's drawSignatureBlock, which already wraps the
    // equivalent call: a missing/invalid signature image never blocks
    // rendering the rest of the canonical PDF — the DB columns remain the
    // source of truth, and the signer's name/timestamp still get drawn
    // below regardless.
    let sigImage;
    try {
      const sigBytes = await dataUrlToBytes(sig.signatureDataUrl);
      try {
        sigImage = await pdfDoc.embedPng(sigBytes);
      } catch {
        sigImage = await pdfDoc.embedJpg(sigBytes);
      }
    } catch {
      sigImage = null;
    }

    const sigWidth = (sig.width / 100) * pageWidth;
    const sigHeight = (sig.height / 100) * pageHeight;
    const sigX = (sig.x / 100) * pageWidth;
    const sigY = pageHeight - (sig.y / 100) * pageHeight - sigHeight;

    if (sigImage) {
      page.drawImage(sigImage, { x: sigX, y: sigY, width: sigWidth, height: sigHeight });
    } else {
      // Typed signature (or any non-image value): render the typed name
      // itself as the visual mark in the signature box, in a bold/italic
      // hand-off font, rather than silently leaving the box blank — the
      // design doc's should-consider item 6 requires the canonical PDF to
      // visually contain the actual signature, not just body text.
      page.drawText(sig.signerName || "Signed", {
        x: sigX,
        y: sigY + sigHeight / 2 - 5,
        size: Math.min(16, sigHeight),
        font: helveticaBold,
        color: rgb(0.1, 0.1, 0.4),
      });
    }

    const infoY = sigY - 12;
    page.drawText(sig.signerName, { x: sigX, y: infoY, size: 7, font: helvetica, color: rgb(0.3, 0.3, 0.3) });
    if (sig.signedAt) {
      page.drawText(format(new Date(sig.signedAt), "MM/dd/yyyy 'at' h:mm a"), {
        x: sigX,
        y: infoY - 9,
        size: 6,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
  };

  if (candidateSignature) await overlaySignature(candidateSignature);
  if (employerSignature) await overlaySignature(employerSignature);

  appendCertificatePage(pdfDoc, helvetica, helveticaBold, certificateData);

  return pdfDoc.save();
}

/**
 * AI-generated (text) documents have no uploaded PDF to burn signatures
 * into — lay the stored content string, both signature images and the
 * certificate onto a fresh document instead.
 */
export async function renderTextDocumentPdf(
  content: string,
  candidateSignature: SignatureOverlay | null,
  employerSignature: SignatureOverlay | null,
  certificateData: FinalCertificateData,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  setDeterministicMetadata(pdfDoc, certificateData);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize: [number, number] = [612, 792];
  const margin = 50;
  let page = pdfDoc.addPage(pageSize);
  let y = pageSize[1] - margin;
  const lineHeight = 14;
  const fontSize = 10;
  const maxWidth = pageSize[0] - margin * 2;

  const newPage = () => {
    page = pdfDoc.addPage(pageSize);
    y = pageSize[1] - margin;
  };

  const wrapLine = (line: string): string[] => {
    if (line.length === 0) return [""];
    const words = line.split(" ");
    const wrapped: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (helvetica.widthOfTextAtSize(candidate, fontSize) > maxWidth && current) {
        wrapped.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) wrapped.push(current);
    return wrapped;
  };

  for (const rawLine of content.split("\n")) {
    for (const line of wrapLine(rawLine)) {
      if (y < margin + lineHeight) newPage();
      page.drawText(line, { x: margin, y, size: fontSize, font: helvetica, color: rgb(0, 0, 0) });
      y -= lineHeight;
    }
  }

  // Signature block, laid out below the body content on the last page (or a
  // fresh one if there isn't room) — the same visual intent as the client's
  // jsPDF handleDownloadGeneratedPdf, one library instead of two.
  if (y < margin + 140) newPage();
  y -= 20;
  page.drawText("Electronic Signatures", { x: margin, y, size: 12, font: helveticaBold, color: rgb(0, 0, 0) });
  y -= 20;

  const drawSignatureBlock = async (label: string, sig: SignatureOverlay | null) => {
    page.drawText(label, { x: margin, y, size: 9, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) });
    y -= 14;
    if (sig) {
      try {
        const sigBytes = await dataUrlToBytes(sig.signatureDataUrl);
        let sigImage;
        try {
          sigImage = await pdfDoc.embedPng(sigBytes);
        } catch {
          sigImage = await pdfDoc.embedJpg(sigBytes);
        }
        const h = 30;
        const w = Math.min(160, (sigImage.width / sigImage.height) * h);
        page.drawImage(sigImage, { x: margin, y: y - h, width: w, height: h });
        y -= h + 4;
      } catch {
        // Missing/corrupt signature image never blocks rendering the rest
        // of the canonical PDF — the DB columns remain the source of truth.
      }
      page.drawText(
        `${sig.signerName} — ${format(new Date(sig.signedAt), "MMM d, yyyy 'at' h:mm a")}`,
        { x: margin, y, size: 7, font: helvetica, color: rgb(0.4, 0.4, 0.4) },
      );
      y -= 16;
    } else {
      page.drawText("Not signed", { x: margin, y, size: 8, font: helvetica, color: rgb(0.6, 0.6, 0.6) });
      y -= 16;
    }
  };

  await drawSignatureBlock("Candidate", candidateSignature);
  await drawSignatureBlock("Employer", employerSignature);

  if (y < margin + 260) newPage();
  appendCertificatePage(pdfDoc, helvetica, helveticaBold, certificateData);

  return pdfDoc.save();
}

// deno-lint-ignore no-explicit-any
function appendCertificatePage(pdfDoc: any, helvetica: any, helveticaBold: any, cert: FinalCertificateData) {
  const certPage = pdfDoc.addPage([612, 792]);
  const { width: certWidth, height: certHeight } = certPage.getSize();
  const margin = 50;
  let y = certHeight - margin;

  certPage.drawRectangle({
    x: margin,
    y: y + 5,
    width: certWidth - margin * 2,
    height: 3,
    color: rgb(0.13, 0.55, 0.13),
  });
  certPage.drawText("CERTIFICATE OF COMPLETION", {
    x: margin,
    y,
    size: 20,
    font: helveticaBold,
    color: rgb(0.13, 0.55, 0.13),
  });
  y -= 30;

  const drawLabelValue = (label: string, value: string) => {
    certPage.drawText(label, { x: margin, y, size: 9, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) });
    certPage.drawText(value, { x: margin + 130, y, size: 9, font: helvetica, color: rgb(0, 0, 0) });
    y -= 14;
  };

  drawLabelValue("Document ID:", cert.documentCode);
  drawLabelValue("Document Name:", cert.documentName);
  drawLabelValue("Document Type:", cert.documentType?.replace(/_/g, " ") || "Custom Document");
  drawLabelValue("Status:", "FULLY EXECUTED");
  drawLabelValue(
    "Completed:",
    format(new Date(cert.completionTimestampUtc), "MMMM d, yyyy 'at' h:mm:ss a 'UTC'"),
  );
  y -= 10;

  certPage.drawText("SIGNING ORDER", { x: margin, y, size: 12, font: helveticaBold, color: rgb(0, 0, 0) });
  y -= 18;

  certPage.drawText("1. CANDIDATE", { x: margin, y, size: 10, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) });
  y -= 14;
  drawLabelValue("Name:", cert.candidateName);
  if (cert.candidateEmail) drawLabelValue("Email:", cert.candidateEmail);
  drawLabelValue("Signed At:", format(new Date(cert.candidateSignedAt), "MMMM d, yyyy 'at' h:mm:ss a 'UTC'"));
  // Self-reported — see bestEffortIp.ts. Never presented as independently verified.
  drawLabelValue("IP Address (self-reported):", cert.candidateIp || "Unavailable");
  y -= 10;

  certPage.drawText("2. EMPLOYER", { x: margin, y, size: 10, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) });
  y -= 14;
  drawLabelValue("Name:", cert.employerName);
  if (cert.employerEmail) drawLabelValue("Email:", cert.employerEmail);
  drawLabelValue("Signed At:", format(new Date(cert.employerSignedAt), "MMMM d, yyyy 'at' h:mm:ss a 'UTC'"));
  drawLabelValue("IP Address (self-reported):", cert.employerIp || "Unavailable");
  y -= 16;

  certPage.drawText("DOCUMENT INTEGRITY", { x: margin, y, size: 12, font: helveticaBold, color: rgb(0, 0, 0) });
  y -= 18;
  drawLabelValue("Hash Algorithm:", "SHA-256");
  if (cert.v1Hash) drawLabelValue("V1 Hash (Draft):", cert.v1Hash);
  if (cert.v2Hash) drawLabelValue("V2 Hash (Candidate Signed):", cert.v2Hash);
  if (cert.v3Hash) drawLabelValue("V3 Hash (Fully Executed):", cert.v3Hash);
  y -= 6;
  drawLabelValue("Audit Events:", `${cert.auditEntriesCount} recorded`);
  y -= 16;

  const complianceBoxY = y - 70;
  certPage.drawRectangle({
    x: margin - 5,
    y: complianceBoxY,
    width: certWidth - margin * 2 + 10,
    height: 75,
    color: rgb(0.95, 0.98, 0.95),
    borderColor: rgb(0.13, 0.55, 0.13),
    borderWidth: 1,
  });
  y -= 10;
  certPage.drawText("LEGAL COMPLIANCE STATEMENT", {
    x: margin,
    y,
    size: 10,
    font: helveticaBold,
    color: rgb(0.13, 0.55, 0.13),
  });
  y -= 16;
  const complianceText = [
    "This document was electronically signed and verified in compliance with the U.S. ESIGN Act",
    "and applicable state laws. Document integrity is protected by SHA-256 cryptographic hashing,",
    "and every signing event is recorded in a tamper-evident audit trail available at /verify.",
  ];
  for (const line of complianceText) {
    certPage.drawText(line, { x: margin, y, size: 8, font: helvetica, color: rgb(0.3, 0.3, 0.3) });
    y -= 11;
  }

  const footerY = 40;
  certPage.drawText("Electronically signed and verified via HireFlow.", {
    x: margin,
    y: footerY + 10,
    size: 8,
    font: helveticaBold,
    color: rgb(0.4, 0.4, 0.4),
  });
  // Deliberately NOT `Generated: ${new Date()}` — that made every download
  // byte-different from the last, so there was no single canonical file to
  // hash. This footer, like everything else on this page, is a pure
  // function of stored data: two renders of the same completed document
  // produce byte-identical PDFs. See renderFinalPdf.test.ts.
  certPage.drawText(
    `Completed: ${format(new Date(cert.completionTimestampUtc), "MMMM d, yyyy 'at' h:mm:ss a 'UTC'")}`,
    { x: margin, y: footerY, size: 7, font: helvetica, color: rgb(0.5, 0.5, 0.5) },
  );
}
