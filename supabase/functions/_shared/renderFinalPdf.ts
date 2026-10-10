/**
 * Renders the ONE canonical, permanently-hashed final PDF for a fully
 * countersigned document — see docs/DOCUMENT-SIGNING.md §2.
 *
 * Ported from src/lib/pdfSignatureBurner.ts's `burnSignaturesIntoPdf`
 * (framework-agnostic already — pdf-lib, fetch, no DOM — so it
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
import { PDFDocument, PDFFont, PDFImage, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

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
  /** "Manila, Metro Manila, PH" (the network's answer at signing). */
  candidatePlace?: string;
  /** "Phone, iOS, 390x844, Asia/Manila". */
  candidateDevice?: string;
  employerName: string;
  employerEmail?: string;
  employerSignedAt: string;
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
function setDeterministicMetadata(pdfDoc: PDFDocument, cert: FinalCertificateData): void {
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

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * "October 10, 2026 at 7:00:13 PM UTC". Read in UTC whatever zone the
 * server's clock is set to: date-fns' format() used the machine's own zone
 * while the label said UTC, so a render anywhere but a UTC server printed a
 * wrong time under a UTC label.
 */
export function utcStamp(iso: string, withSeconds = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hours = d.getUTCHours();
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${hours % 12 || 12}:${pad(d.getUTCMinutes())}${withSeconds ? `:${pad(d.getUTCSeconds())}` : ""} ${hours >= 12 ? "PM" : "AM"}`;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} at ${time} UTC`;
}

// The built-in PDF fonts only know Western European letters. Anything else
// (a peso sign in the pay line, an emoji, a name in another script) made
// drawText throw, and the whole countersign failed with it. Common ones are
// spelled out; the rest become "?". Built with fromCharCode so no editor
// can turn the escapes into look-alike characters.
const SPELLED_OUT: Record<string, string> = {
  [String.fromCharCode(0x20b1)]: "PHP ",
  [String.fromCharCode(0x20b9)]: "INR ",
  [String.fromCharCode(0x2192)]: "->",
  [String.fromCharCode(0x2190)]: "<-",
  [String.fromCharCode(0x2713)]: "*",
  [String.fromCharCode(0x2714)]: "*",
  [String.fromCharCode(0x00a0)]: " ",
  [String.fromCharCode(0x202f)]: " ",
  [String.fromCharCode(0x2009)]: " ",
  "\t": "    ",
  "\r": "",
};
const characterSets = new WeakMap<PDFFont, Set<number>>();

/** The text, with every character this font cannot draw replaced. */
export function pdfSafe(font: PDFFont, text: string): string {
  let known = characterSets.get(font);
  if (!known) {
    known = new Set(font.getCharacterSet());
    characterSets.set(font, known);
  }
  let out = "";
  for (const char of text) {
    if (char === "\n") out += char; // line breaks are the caller's to lay out
    else if (char in SPELLED_OUT) out += SPELLED_OUT[char];
    else out += known.has(char.codePointAt(0) ?? 0) ? char : "?";
  }
  return out;
}

/** A drawn signature's image, or null for a typed one (its value is the name itself). */
async function signatureImage(pdfDoc: PDFDocument, value: string): Promise<PDFImage | null> {
  if (!value.startsWith("data:image/")) return null;
  try {
    const bytes = await dataUrlToBytes(value);
    try {
      return await pdfDoc.embedPng(bytes);
    } catch {
      return await pdfDoc.embedJpg(bytes);
    }
  } catch {
    return null;
  }
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
  const signatureFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);

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
    const sigImage = await signatureImage(pdfDoc, sig.signatureDataUrl);

    const sigWidth = (sig.width / 100) * pageWidth;
    const sigHeight = (sig.height / 100) * pageHeight;
    const sigX = (sig.x / 100) * pageWidth;
    const sigY = pageHeight - (sig.y / 100) * pageHeight - sigHeight;

    if (sigImage) {
      page.drawImage(sigImage, { x: sigX, y: sigY, width: sigWidth, height: sigHeight });
    } else {
      // Typed signature (or any non-image value): render what they typed as
      // the visual mark in the signature box, in a script-like face, rather
      // than silently leaving the box blank — the design doc's
      // should-consider item 6 requires the canonical PDF to visually
      // contain the actual signature, not just body text.
      const typed = pdfSafe(signatureFont, sig.signatureDataUrl.trim() || sig.signerName || "Signed");
      let size = Math.min(18, sigHeight);
      while (size > 8 && signatureFont.widthOfTextAtSize(typed, size) > sigWidth) size -= 1;
      page.drawText(typed, {
        x: sigX,
        y: sigY + sigHeight / 2 - size / 3,
        size,
        font: signatureFont,
        color: rgb(0.08, 0.1, 0.3),
      });
    }

    const infoY = sigY - 12;
    page.drawText(pdfSafe(helvetica, sig.signerName), { x: sigX, y: infoY, size: 7, font: helvetica, color: rgb(0.3, 0.3, 0.3) });
    if (sig.signedAt) {
      page.drawText(utcStamp(sig.signedAt, false), {
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
  const signatureFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);

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

  for (const rawLine of content.replace(/\r\n?/g, "\n").split("\n").map((line) => pdfSafe(helvetica, line))) {
    for (const line of wrapLine(rawLine)) {
      if (y < margin + lineHeight) newPage();
      page.drawText(line, { x: margin, y, size: fontSize, font: helvetica, color: rgb(0, 0, 0) });
      y -= lineHeight;
    }
  }

  // The signatures, side by side under the letter: each one the mark
  // itself (the drawn image, or the typed name in a script-like face) on a
  // line, then who signed and when. Moved to a fresh page only when it
  // does not fit under the text.
  const grey = rgb(0.42, 0.42, 0.42);
  const gap = 28;
  const columnWidth = (maxWidth - gap) / 2;
  if (y < margin + 120) newPage();
  y -= 26;
  page.drawText("SIGNATURES", { x: margin, y, size: 8, font: helveticaBold, color: grey });
  const top = y - 22;

  const drawColumn = async (x: number, label: string, sig: SignatureOverlay | null) => {
    page.drawText(label, { x, y: top, size: 8, font: helveticaBold, color: grey });
    const lineY = top - 46;
    if (sig) {
      const image = await signatureImage(pdfDoc, sig.signatureDataUrl);
      if (image) {
        const h = 34;
        const w = Math.min(columnWidth, (image.width / image.height) * h);
        page.drawImage(image, { x, y: lineY + 4, width: w, height: h });
      } else {
        const typed = pdfSafe(signatureFont, sig.signatureDataUrl.trim() || sig.signerName);
        let size = 22;
        while (size > 10 && signatureFont.widthOfTextAtSize(typed, size) > columnWidth) size -= 1;
        page.drawText(typed, { x, y: lineY + 8, size, font: signatureFont, color: rgb(0.08, 0.1, 0.3) });
      }
    }
    page.drawLine({ start: { x, y: lineY }, end: { x: x + columnWidth, y: lineY }, thickness: 0.75, color: rgb(0.7, 0.7, 0.7) });
    page.drawText(pdfSafe(helvetica, sig ? sig.signerName : "Not signed"), { x, y: lineY - 14, size: 9, font: helvetica, color: rgb(0, 0, 0) });
    if (sig?.signedAt) {
      page.drawText(`Signed electronically, ${utcStamp(sig.signedAt, false)}`, { x, y: lineY - 27, size: 7.5, font: helvetica, color: grey });
    }
  };

  await drawColumn(margin, "CANDIDATE", candidateSignature);
  await drawColumn(margin + columnWidth + gap, "EMPLOYER", employerSignature);

  // The certificate always starts its own page.
  appendCertificatePage(pdfDoc, helvetica, helveticaBold, certificateData);

  return pdfDoc.save();
}

function appendCertificatePage(pdfDoc: PDFDocument, helvetica: PDFFont, helveticaBold: PDFFont, cert: FinalCertificateData) {
  const certPage = pdfDoc.addPage([612, 792]);
  const { width: certWidth, height: certHeight } = certPage.getSize();
  const margin = 50;
  let y = certHeight - margin;

  certPage.drawText("CERTIFICATE OF COMPLETION", {
    x: margin,
    y,
    size: 20,
    font: helveticaBold,
    color: rgb(0.13, 0.55, 0.13),
  });
  // The rule sits under the title (it used to be drawn through it).
  certPage.drawRectangle({
    x: margin,
    y: y - 10,
    width: certWidth - margin * 2,
    height: 2,
    color: rgb(0.13, 0.55, 0.13),
  });
  y -= 36;

  const drawLabelValue = (label: string, value: string) => {
    certPage.drawText(label, { x: margin, y, size: 9, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) });
    certPage.drawText(pdfSafe(helvetica, value), { x: margin + 130, y, size: 9, font: helvetica, color: rgb(0, 0, 0) });
    y -= 14;
  };

  drawLabelValue("Document ID:", cert.documentCode);
  drawLabelValue("Document Name:", cert.documentName);
  drawLabelValue("Document Type:", cert.documentType?.replace(/_/g, " ") || "Custom Document");
  drawLabelValue("Status:", "FULLY EXECUTED");
  drawLabelValue(
    "Completed:",
    utcStamp(cert.completionTimestampUtc),
  );
  y -= 10;

  certPage.drawText("SIGNING ORDER", { x: margin, y, size: 12, font: helveticaBold, color: rgb(0, 0, 0) });
  y -= 18;

  certPage.drawText("1. CANDIDATE", { x: margin, y, size: 10, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) });
  y -= 14;
  drawLabelValue("Name:", cert.candidateName);
  if (cert.candidateEmail) drawLabelValue("Email:", cert.candidateEmail);
  drawLabelValue("Signed At:", utcStamp(cert.candidateSignedAt));
  // The address the server saw (bestEffortIp.ts: Cloudflare's, not the
  // caller's to choose), the place the network put it in, and the device.
  drawLabelValue("IP Address:", cert.candidateIp || "Unavailable");
  if (cert.candidatePlace) drawLabelValue("Location:", cert.candidatePlace);
  if (cert.candidateDevice) drawLabelValue("Device:", cert.candidateDevice);
  y -= 10;

  certPage.drawText("2. EMPLOYER", { x: margin, y, size: 10, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) });
  y -= 14;
  drawLabelValue("Name:", cert.employerName);
  if (cert.employerEmail) drawLabelValue("Email:", cert.employerEmail);
  drawLabelValue("Signed At:", utcStamp(cert.employerSignedAt));
  // No address, place or device for the team: this page is the applicant's
  // copy too (the owner, 2026-10-11). They are in the team's audit record.
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
    `Completed: ${utcStamp(cert.completionTimestampUtc)}`,
    { x: margin, y: footerY, size: 7, font: helvetica, color: rgb(0.5, 0.5, 0.5) },
  );
}
