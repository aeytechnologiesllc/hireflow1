import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { CompletionCertificate } from "./completionCertificate";

/**
 * Generate a PDF Certificate of Completion
 * Enterprise-grade formatting with consistent styling
 */
export async function generateCertificatePDF(
  cert: CompletionCertificate,
  documentCode: string,
  qrDataUrl?: string
): Promise<jsPDF> {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 20;
  let y = margin;

  // Header accent line
  pdf.setDrawColor(34, 139, 34);
  pdf.setLineWidth(1);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Header
  pdf.setFontSize(20);
  pdf.setTextColor(34, 139, 34);
  pdf.setFont("helvetica", "bold");
  pdf.text("CERTIFICATE OF COMPLETION", pageWidth / 2, y, { align: "center" });
  y += 8;
  
  pdf.setFontSize(10);
  pdf.setTextColor(100);
  pdf.setFont("helvetica", "normal");
  pdf.text("Electronic Signature Verification Document", pageWidth / 2, y, { align: "center" });
  y += 5;
  
  // Compliance tagline
  pdf.setFontSize(8);
  pdf.setTextColor(60);
  pdf.text("This document was electronically signed and verified in compliance with the U.S. ESIGN Act and applicable state laws.", pageWidth / 2, y, { align: "center" });
  
  y += 12;

  // Document Identification Section
  pdf.setFillColor(245, 245, 245);
  pdf.rect(margin, y, pageWidth - 2 * margin, 35, 'F');
  pdf.setDrawColor(200);
  pdf.rect(margin, y, pageWidth - 2 * margin, 35, 'S');
  
  y += 8;
  pdf.setFontSize(11);
  pdf.setTextColor(0);
  pdf.setFont("helvetica", "bold");
  pdf.text("DOCUMENT IDENTIFICATION", margin + 5, y);
  
  y += 8;
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  
  const leftCol = margin + 5;
  const rightCol = pageWidth / 2 + 5;
  
  pdf.text(`Document Title: ${cert.document_name}`, leftCol, y);
  pdf.text(`Document ID: ${documentCode}`, rightCol, y);
  y += 6;
  pdf.text(`Document Type: ${cert.document_type || 'Not specified'}`, leftCol, y);
  pdf.text(`Status: FULLY EXECUTED`, rightCol, y);
  y += 6;
  pdf.text(`Certificate ID: ${cert.certificate_id}`, leftCol, y);
  pdf.text(`Completion: ${format(new Date(cert.completion_timestamp_utc), "PPpp 'UTC'")}`, rightCol, y);
  
  y += 15;

  // Execution Summary Section
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(0);
  pdf.text("EXECUTION SUMMARY", margin, y);
  y += 8;
  
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Signing Order: Candidate → Employer (${cert.signing_order_verified ? 'Verified ✓' : 'Not Verified'})`, margin, y);
  y += 5;
  pdf.text("Signature Method: Electronic Signature (Draw/Type)", margin, y);
  y += 5;
  pdf.text("Jurisdiction: U.S. ESIGN Act (15 U.S.C. § 7001) and UETA compliant", margin, y);
  
  y += 12;

  // Signer Details Section
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.text("SIGNER DETAILS", margin, y);
  y += 8;

  // Candidate Signer
  if (cert.candidate_signature) {
    pdf.setFillColor(240, 255, 240);
    pdf.rect(margin, y, pageWidth - 2 * margin, 28, 'F');
    pdf.setDrawColor(34, 139, 34);
    pdf.rect(margin, y, pageWidth - 2 * margin, 28, 'S');
    
    y += 6;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(34, 139, 34);
    pdf.text("CANDIDATE (Signing Position: 1)", margin + 5, y);
    
    y += 6;
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(0);
    pdf.text(`Name: ${cert.candidate_signature.name}`, leftCol, y);
    pdf.text(`Email: ${cert.candidate_signature.email}`, rightCol, y);
    y += 5;
    pdf.text(`Signed: ${format(new Date(cert.candidate_signature.timestamp_utc), "PPpp 'UTC'")}`, leftCol, y);
    pdf.text(`IP Address: ${cert.candidate_signature.ip_address}`, rightCol, y);
    y += 5;
    const loc = cert.candidate_signature.location;
    pdf.text(`Location: ${loc.city}, ${loc.region}, ${loc.country}`, leftCol, y);
    
    y += 10;
  }

  // Employer Signer
  if (cert.employer_signature) {
    pdf.setFillColor(240, 248, 255);
    pdf.rect(margin, y, pageWidth - 2 * margin, 28, 'F');
    pdf.setDrawColor(70, 130, 180);
    pdf.rect(margin, y, pageWidth - 2 * margin, 28, 'S');
    
    y += 6;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(70, 130, 180);
    pdf.text("EMPLOYER (Signing Position: 2)", margin + 5, y);
    
    y += 6;
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(0);
    pdf.text(`Name: ${cert.employer_signature.name}`, leftCol, y);
    pdf.text(`Email: ${cert.employer_signature.email}`, rightCol, y);
    y += 5;
    pdf.text(`Signed: ${format(new Date(cert.employer_signature.timestamp_utc), "PPpp 'UTC'")}`, leftCol, y);
    pdf.text(`IP Address: ${cert.employer_signature.ip_address}`, rightCol, y);
    y += 5;
    const loc = cert.employer_signature.location;
    pdf.text(`Location: ${loc.city}, ${loc.region}, ${loc.country}`, leftCol, y);
    
    y += 12;
  }

  // Document Integrity Section
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(0);
  pdf.text("DOCUMENT INTEGRITY VERIFICATION", margin, y);
  y += 8;
  
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.text("Hash Algorithm: SHA-256 (Secure Hash Algorithm)", margin, y);
  y += 5;
  pdf.text(`Final Document Hash: ${cert.final_document_hash}`, margin, y);
  y += 5;
  pdf.text(`Audit Trail Hash: ${cert.audit_trail_hash}`, margin, y);
  y += 5;
  pdf.setTextColor(180, 0, 0);
  pdf.text("⚠ WARNING: Any modification to this document will invalidate the above hash.", margin, y);
  
  y += 12;

  // Version History
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(0);
  pdf.text("VERSION HISTORY", margin, y);
  y += 8;
  
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  
  if (cert.version_history.v1) {
    pdf.text(`v1 (Draft): ${cert.version_history.v1.hash.substring(0, 32)}...`, margin, y);
    y += 4;
  }
  if (cert.version_history.v2) {
    pdf.text(`v2 (Candidate Signed): ${cert.version_history.v2.hash.substring(0, 32)}...`, margin, y);
    y += 4;
  }
  if (cert.version_history.v3) {
    pdf.text(`v3 (Fully Executed): ${cert.version_history.v3.hash.substring(0, 32)}...`, margin, y);
    y += 4;
  }
  
  y += 8;

  // Audit Trail Reference
  pdf.setFontSize(9);
  pdf.setTextColor(100);
  pdf.text(`Audit Trail Reference: ${cert.audit_entries_count} entries recorded`, margin, y);
  pdf.text("Complete audit trail available for download", margin, y + 4);
  
  y += 15;

  // Compliance Statement - Calculate dynamic height
  const pageHeight = pdf.internal.pageSize.getHeight();
  const bottomMargin = 15;
  const complianceTextLines = pdf.splitTextToSize(cert.compliance_statement, pageWidth - 2 * margin - 10);
  const lineHeight = 4;
  const complianceBoxHeight = 14 + (complianceTextLines.length * lineHeight);

  // Check if we need a new page for compliance statement
  if (y + complianceBoxHeight > pageHeight - bottomMargin) {
    pdf.addPage();
    y = margin;
  }

  // Draw compliance box with dynamic height
  pdf.setFillColor(250, 250, 250);
  pdf.rect(margin, y, pageWidth - 2 * margin, complianceBoxHeight, 'F');
  pdf.setDrawColor(200);
  pdf.rect(margin, y, pageWidth - 2 * margin, complianceBoxHeight, 'S');
  
  y += 6;
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(0);
  pdf.text("COMPLIANCE STATEMENT", margin + 5, y);
  
  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(60);
  pdf.text(complianceTextLines, margin + 5, y);

  y += complianceBoxHeight - 6;

  // QR Code (if provided) - positioned after compliance box
  if (qrDataUrl) {
    const qrSize = 30;
    const qrX = pageWidth - margin - qrSize;
    const qrY = y + 5;
    
    // Check if QR code fits on current page
    if (qrY + qrSize + 10 > pageHeight - bottomMargin) {
      pdf.addPage();
      y = margin;
    }
    
    try {
      pdf.addImage(qrDataUrl, "PNG", qrX, y + 5, qrSize, qrSize);
      pdf.setFontSize(7);
      pdf.setTextColor(100);
      pdf.text("Scan to verify", qrX + qrSize / 2, y + 5 + qrSize + 4, { align: "center" });
    } catch (e) {
      console.error("Error adding QR code to PDF:", e);
    }
  }

  return pdf;
}

/**
 * Download the certificate PDF
 */
export async function downloadCertificatePDF(
  cert: CompletionCertificate,
  documentCode: string,
  documentName: string,
  qrDataUrl?: string
): Promise<void> {
  const pdf = await generateCertificatePDF(cert, documentCode, qrDataUrl);
  pdf.save(`Certificate_${documentCode}_${documentName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}
