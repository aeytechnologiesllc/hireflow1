/**
 * PDF Signature Burner Utility
 * Overlays signatures onto uploaded PDFs and adds a certificate of completion page
 * Uses pdf-lib for PDF manipulation
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { format } from 'date-fns';

export interface SignatureOverlay {
  signatureDataUrl: string;
  x: number;      // percentage (0-100)
  y: number;      // percentage (0-100)
  width: number;  // percentage (0-100)
  height: number; // percentage (0-100)
  page: number;   // 1-indexed
  signerName: string;
  signedAt: string;
  ipAddress?: string;
  signerRole: 'candidate' | 'employer';
}

export interface CertificateData {
  documentId: string;
  documentCode: string;
  documentName: string;
  documentType: string | null;
  completedAt: string | null;
  candidateName: string;
  candidateEmail?: string;
  candidateSignedAt: string | null;
  candidateIp?: string;
  employerName: string;
  employerEmail?: string;
  employerSignedAt: string | null;
  employerIp?: string;
  v1Hash?: string | null;
  v2Hash?: string | null;
  v3Hash?: string | null;
  auditEntriesCount: number;
}

/**
 * Convert a data URL to a Uint8Array
 */
async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Burn signatures into an uploaded PDF and optionally add a certificate of completion page
 * Also adds a professional footer to each page
 * @param includeCertificatePage - If false, only signatures are burned without the certificate page (default: true)
 */
export async function burnSignaturesIntoPdf(
  originalPdfBytes: ArrayBuffer,
  candidateSignature: SignatureOverlay | null,
  employerSignature: SignatureOverlay | null,
  certificateData: CertificateData,
  includeCertificatePage: boolean = true
): Promise<Uint8Array> {
  // Load the original PDF
  const pdfDoc = await PDFDocument.load(originalPdfBytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Add professional footer to each document page (not certificate page)
  const footerText = "Electronically signed and verified via HireFlow.";
  for (const page of pages) {
    const { width: pageWidth } = page.getSize();
    const textWidth = helvetica.widthOfTextAtSize(footerText, 6);
    const footerX = (pageWidth - textWidth) / 2;
    
    page.drawText(footerText, {
      x: footerX,
      y: 15,
      size: 6,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  // Helper function to overlay a signature
  const overlaySignature = async (sig: SignatureOverlay) => {
    const pageIndex = sig.page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) {
      console.warn(`Page ${sig.page} does not exist in PDF, skipping signature`);
      return;
    }
    
    const page = pages[pageIndex];
    const { width: pageWidth, height: pageHeight } = page.getSize();

    try {
      // Convert data URL to bytes and embed the image
      const sigBytes = await dataUrlToBytes(sig.signatureDataUrl);
      
      // Try PNG first, then JPEG
      let sigImage;
      try {
        sigImage = await pdfDoc.embedPng(sigBytes);
      } catch {
        try {
          sigImage = await pdfDoc.embedJpg(sigBytes);
        } catch (e) {
          console.error('Failed to embed signature image:', e);
          return;
        }
      }

      // Calculate position and size from percentages
      const sigWidth = (sig.width / 100) * pageWidth;
      const sigHeight = (sig.height / 100) * pageHeight;
      const sigX = (sig.x / 100) * pageWidth;
      // PDF coordinates have origin at bottom-left, so we need to flip Y
      const sigY = pageHeight - ((sig.y / 100) * pageHeight) - sigHeight;

      // Draw the signature image
      page.drawImage(sigImage, {
        x: sigX,
        y: sigY,
        width: sigWidth,
        height: sigHeight,
      });

      // Add signer info below signature
      const infoY = sigY - 12;
      page.drawText(`${sig.signerName}`, {
        x: sigX,
        y: infoY,
        size: 7,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3),
      });
      
      if (sig.signedAt) {
        const formattedDate = format(new Date(sig.signedAt), "MM/dd/yyyy 'at' h:mm a");
        page.drawText(formattedDate, {
          x: sigX,
          y: infoY - 9,
          size: 6,
          font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });
  } // End of includeCertificatePage block
    } catch (error) {
      console.error('Error overlaying signature:', error);
    }
  };

  // Overlay both signatures if present
  if (candidateSignature) {
    await overlaySignature(candidateSignature);
  }
  if (employerSignature) {
    await overlaySignature(employerSignature);
  }

  // Only add Certificate of Completion page if requested
  if (includeCertificatePage) {
    const certPage = pdfDoc.addPage([612, 792]); // Letter size
    const { width: certWidth, height: certHeight } = certPage.getSize();
    const margin = 50;
    let y = certHeight - margin;

  // Header with green accent line
  certPage.drawRectangle({
    x: margin,
    y: y + 5,
    width: certWidth - (margin * 2),
    height: 3,
    color: rgb(0.13, 0.55, 0.13),
  });
  
  certPage.drawText('CERTIFICATE OF COMPLETION', {
    x: margin,
    y,
    size: 20,
    font: helveticaBold,
    color: rgb(0.13, 0.55, 0.13),
  });
  y -= 25;

  certPage.drawText('This document was electronically signed and verified in compliance with the', {
    x: margin,
    y,
    size: 10,
    font: helvetica,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 12;
  certPage.drawText('U.S. ESIGN Act and applicable state laws.', {
    x: margin,
    y,
    size: 10,
    font: helvetica,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 30;

  // Document Information Section
  certPage.drawText('DOCUMENT INFORMATION', {
    x: margin,
    y,
    size: 12,
    font: helveticaBold,
    color: rgb(0, 0, 0),
  });
  y -= 18;

  const drawLabelValue = (label: string, value: string) => {
    certPage.drawText(label, {
      x: margin,
      y,
      size: 9,
      font: helveticaBold,
      color: rgb(0.4, 0.4, 0.4),
    });
    certPage.drawText(value, {
      x: margin + 120,
      y,
      size: 9,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    y -= 14;
  };

  drawLabelValue('Document ID:', certificateData.documentCode);
  drawLabelValue('Document Name:', certificateData.documentName);
  drawLabelValue('Document Type:', certificateData.documentType?.replace(/_/g, ' ') || 'Custom Document');
  drawLabelValue('Status:', 'FULLY EXECUTED');
  if (certificateData.completedAt) {
    drawLabelValue('Completed:', format(new Date(certificateData.completedAt), "MMMM d, yyyy 'at' h:mm:ss a 'UTC'"));
  }
  y -= 10;

  // Signing Order Section
  certPage.drawText('SIGNING ORDER', {
    x: margin,
    y,
    size: 12,
    font: helveticaBold,
    color: rgb(0, 0, 0),
  });
  y -= 18;

  // Candidate signature block
  certPage.drawText('1. CANDIDATE', {
    x: margin,
    y,
    size: 10,
    font: helveticaBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 14;
  drawLabelValue('Name:', certificateData.candidateName);
  if (certificateData.candidateEmail) {
    drawLabelValue('Email:', certificateData.candidateEmail);
  }
  if (certificateData.candidateSignedAt) {
    drawLabelValue('Signed At:', format(new Date(certificateData.candidateSignedAt), "MMMM d, yyyy 'at' h:mm:ss a 'UTC'"));
  }
  if (certificateData.candidateIp) {
    drawLabelValue('IP Address:', certificateData.candidateIp);
  }
  drawLabelValue('Signature Method:', 'Electronic (Drawn)');
  y -= 10;

  // Employer signature block
  certPage.drawText('2. EMPLOYER', {
    x: margin,
    y,
    size: 10,
    font: helveticaBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 14;
  drawLabelValue('Name:', certificateData.employerName);
  if (certificateData.employerEmail) {
    drawLabelValue('Email:', certificateData.employerEmail);
  }
  if (certificateData.employerSignedAt) {
    drawLabelValue('Signed At:', format(new Date(certificateData.employerSignedAt), "MMMM d, yyyy 'at' h:mm:ss a 'UTC'"));
  }
  if (certificateData.employerIp) {
    drawLabelValue('IP Address:', certificateData.employerIp);
  }
  drawLabelValue('Signature Method:', 'Electronic (Drawn)');
  y -= 20;

  // Document Integrity Section
  certPage.drawText('DOCUMENT INTEGRITY', {
    x: margin,
    y,
    size: 12,
    font: helveticaBold,
    color: rgb(0, 0, 0),
  });
  y -= 18;

  drawLabelValue('Hash Algorithm:', 'SHA-256');
  if (certificateData.v1Hash) {
    certPage.drawText('V1 Hash (Draft):', {
      x: margin,
      y,
      size: 9,
      font: helveticaBold,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 12;
    certPage.drawText(certificateData.v1Hash, {
      x: margin,
      y,
      size: 7,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 14;
  }
  if (certificateData.v2Hash) {
    certPage.drawText('V2 Hash (Candidate Signed):', {
      x: margin,
      y,
      size: 9,
      font: helveticaBold,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 12;
    certPage.drawText(certificateData.v2Hash, {
      x: margin,
      y,
      size: 7,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 14;
  }
  if (certificateData.v3Hash) {
    certPage.drawText('V3 Hash (Fully Executed):', {
      x: margin,
      y,
      size: 9,
      font: helveticaBold,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 12;
    certPage.drawText(certificateData.v3Hash, {
      x: margin,
      y,
      size: 7,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 20;
  }

  // Audit Trail Summary
  certPage.drawText('AUDIT TRAIL', {
    x: margin,
    y,
    size: 12,
    font: helveticaBold,
    color: rgb(0, 0, 0),
  });
  y -= 18;
  drawLabelValue('Total Events:', `${certificateData.auditEntriesCount} recorded`);
  y -= 20;

  // Compliance Statement Box
  const complianceBoxY = y - 80;
  certPage.drawRectangle({
    x: margin - 5,
    y: complianceBoxY,
    width: certWidth - (margin * 2) + 10,
    height: 85,
    color: rgb(0.95, 0.98, 0.95),
    borderColor: rgb(0.13, 0.55, 0.13),
    borderWidth: 1,
  });

  y -= 10;
  certPage.drawText('LEGAL COMPLIANCE STATEMENT', {
    x: margin,
    y,
    size: 10,
    font: helveticaBold,
    color: rgb(0.13, 0.55, 0.13),
  });
  y -= 16;

  const complianceText = [
    'This document was electronically signed and verified in compliance with the U.S. ESIGN Act',
    'and applicable state laws. The electronic signatures applied to this document are legally',
    'binding and carry the same legal effect as handwritten signatures under the Electronic',
    'Signatures in Global and National Commerce Act (15 U.S.C. § 7001) and the Uniform Electronic',
    'Transactions Act (UETA). Document integrity is protected by SHA-256 cryptographic hashing.',
  ];

  for (const line of complianceText) {
    certPage.drawText(line, {
      x: margin,
      y,
      size: 8,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 11;
  }

  // Footer with HireFlow branding
  const footerY = 40;
  certPage.drawText('Electronically signed and verified via HireFlow.', {
    x: margin,
    y: footerY + 10,
    size: 8,
    font: helveticaBold,
    color: rgb(0.4, 0.4, 0.4),
  });
  certPage.drawText('This certificate was generated automatically upon document completion.', {
    x: margin,
    y: footerY,
    size: 7,
    font: helvetica,
    color: rgb(0.5, 0.5, 0.5),
  });
  certPage.drawText(`Generated: ${format(new Date(), "MMMM d, yyyy 'at' h:mm:ss a 'UTC'")}`, {
    x: margin,
    y: footerY - 10,
    size: 7,
    font: helvetica,
    color: rgb(0.5, 0.5, 0.5),
  });
  } // End of includeCertificatePage block

  // Save and return
  return pdfDoc.save();
}

/**
 * Generate a hash of PDF bytes for v1 hash generation
 */
export async function generatePdfHash(pdfBytes: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', pdfBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
