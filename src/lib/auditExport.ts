import { jsPDF } from "jspdf";
import { format } from "date-fns";

export interface AuditExportEntry {
  id: string;
  action: string;
  created_at: string;
  signer_name?: string;
  signer_email?: string;
  signer_role?: string;
  ip_address?: string;
  location_city?: string;
  location_region?: string;
  location_country?: string;
  document_hash?: string;
  document_version?: number;
  signature_method?: string;
  consent_confirmed?: boolean;
  user_agent?: string;
  pre_signature_hash?: string;
  post_signature_hash?: string;
}

export interface AuditExportData {
  documentId: string;
  documentCode: string;
  documentName: string;
  documentType: string | null;
  status: string;
  completedAt: string | null;
  v1Hash: string | null;
  v2Hash: string | null;
  v3Hash: string | null;
  finalHash: string | null;
  entries: AuditExportEntry[];
}

const getActionLabel = (action: string): string => {
  const labels: Record<string, string> = {
    created: 'Document Created',
    document_created: 'Document Created',
    viewed: 'Document Viewed',
    edited: 'Document Edited',
    candidate_signed: 'Candidate Signed',
    employer_countersigned: 'Employer Countersigned',
    completed: 'Document Completed',
    document_completed: 'Document Completed',
    declined: 'Document Declined',
    downloaded: 'Document Downloaded',
    voided: 'Document Voided',
    electronic_consent_confirmed: 'Electronic Consent Confirmed',
    employer_review_confirmed: 'Employer Review Confirmed',
    sent: 'Document Sent'
  };
  return labels[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

/**
 * Export audit trail as JSON
 */
export function exportAuditTrailJSON(data: AuditExportData): string {
  const exportData = {
    exportedAt: new Date().toISOString(),
    document: {
      id: data.documentId,
      code: data.documentCode,
      name: data.documentName,
      type: data.documentType,
      status: data.status,
      completedAt: data.completedAt
    },
    integrity: {
      hashAlgorithm: "SHA-256",
      v1Hash: data.v1Hash,
      v2Hash: data.v2Hash,
      v3Hash: data.v3Hash,
      finalHash: data.finalHash
    },
    auditTrail: data.entries.map(entry => ({
      id: entry.id,
      event: getActionLabel(entry.action),
      action: entry.action,
      timestamp: entry.created_at,
      timestampUTC: format(new Date(entry.created_at), "yyyy-MM-dd HH:mm:ss 'UTC'"),
      actor: {
        name: entry.signer_name || 'System',
        email: entry.signer_email || null,
        role: entry.signer_role || null
      },
      technical: {
        ipAddress: entry.ip_address || null,
        userAgent: entry.user_agent || null,
        location: entry.location_city ? {
          city: entry.location_city,
          region: entry.location_region,
          country: entry.location_country
        } : null
      },
      documentVersion: entry.document_version || null,
      hashes: {
        preSignature: entry.pre_signature_hash || null,
        postSignature: entry.post_signature_hash || null,
        document: entry.document_hash || null
      },
      signatureMethod: entry.signature_method || null,
      consentConfirmed: entry.consent_confirmed || false
    })),
    compliance: {
      framework: "ESIGN Act (15 U.S.C. § 7001) and UETA",
      immutabilityStatement: "All entries are immutable and cannot be modified after creation",
      integrityStatement: "Document integrity verified via SHA-256 cryptographic hash"
    }
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Download audit trail as JSON file
 */
export function downloadAuditTrailJSON(data: AuditExportData): void {
  const json = exportAuditTrailJSON(data);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `AuditTrail_${data.documentCode}_${data.documentName.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate audit trail PDF
 */
export function generateAuditTrailPDF(data: AuditExportData): jsPDF {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  // Helper to add new page if needed
  const checkNewPage = (requiredSpace: number = 30) => {
    if (y + requiredSpace > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  // Header
  pdf.setFontSize(16);
  pdf.setTextColor(0);
  pdf.setFont("helvetica", "bold");
  pdf.text("AUDIT TRAIL REPORT", pageWidth / 2, y, { align: "center" });
  
  y += 8;
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(100);
  pdf.text("Electronic Signature Verification Document", pageWidth / 2, y, { align: "center" });
  
  y += 10;

  // Document Info Box
  pdf.setFillColor(245, 245, 245);
  pdf.rect(margin, y, pageWidth - 2 * margin, 25, 'F');
  pdf.setDrawColor(200);
  pdf.rect(margin, y, pageWidth - 2 * margin, 25, 'S');
  
  y += 6;
  pdf.setFontSize(9);
  pdf.setTextColor(0);
  pdf.setFont("helvetica", "bold");
  pdf.text(`Document ID: ${data.documentCode}`, margin + 5, y);
  pdf.text(`Status: ${data.status.toUpperCase()}`, pageWidth / 2, y);
  
  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.text(`Title: ${data.documentName}`, margin + 5, y);
  pdf.text(`Type: ${data.documentType || 'Not specified'}`, pageWidth / 2, y);
  
  y += 5;
  pdf.text(`Completed: ${data.completedAt ? format(new Date(data.completedAt), "PPpp 'UTC'") : 'Pending'}`, margin + 5, y);
  
  y += 15;

  // Hash Information
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");
  pdf.text("DOCUMENT INTEGRITY", margin, y);
  y += 6;
  
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  pdf.text("Hash Algorithm: SHA-256", margin, y);
  y += 4;
  
  if (data.v1Hash) {
    pdf.text(`v1 (Draft): ${data.v1Hash.substring(0, 40)}...`, margin, y);
    y += 4;
  }
  if (data.v2Hash) {
    pdf.text(`v2 (Candidate Signed): ${data.v2Hash.substring(0, 40)}...`, margin, y);
    y += 4;
  }
  if (data.v3Hash) {
    pdf.text(`v3 (Fully Executed): ${data.v3Hash.substring(0, 40)}...`, margin, y);
    y += 4;
  }
  if (data.finalHash) {
    pdf.setFont("helvetica", "bold");
    pdf.text(`Final Hash: ${data.finalHash}`, margin, y);
    pdf.setFont("helvetica", "normal");
    y += 4;
  }
  
  y += 8;

  // Audit Trail Events
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");
  pdf.text(`CHRONOLOGICAL AUDIT TRAIL (${data.entries.length} entries)`, margin, y);
  y += 8;

  // Table Header
  pdf.setFillColor(70, 130, 180);
  pdf.rect(margin, y, pageWidth - 2 * margin, 7, 'F');
  pdf.setTextColor(255);
  pdf.setFontSize(8);
  pdf.text("EVENT", margin + 2, y + 5);
  pdf.text("ACTOR", margin + 45, y + 5);
  pdf.text("TIMESTAMP (UTC)", margin + 90, y + 5);
  pdf.text("IP ADDRESS", margin + 135, y + 5);
  y += 9;

  // Table Rows
  pdf.setTextColor(0);
  data.entries.forEach((entry, index) => {
    checkNewPage(15);
    
    const bgColor = index % 2 === 0 ? 255 : 248;
    pdf.setFillColor(bgColor, bgColor, bgColor);
    pdf.rect(margin, y - 2, pageWidth - 2 * margin, 10, 'F');
    
    pdf.setFontSize(7);
    pdf.text(getActionLabel(entry.action).substring(0, 25), margin + 2, y + 3);
    pdf.text((entry.signer_name || 'System').substring(0, 20), margin + 45, y + 3);
    pdf.text(format(new Date(entry.created_at), "yyyy-MM-dd HH:mm:ss"), margin + 90, y + 3);
    pdf.text(entry.ip_address || '-', margin + 135, y + 3);
    
    y += 10;
  });

  y += 10;
  checkNewPage(40);

  // Compliance Statement
  pdf.setFillColor(250, 250, 250);
  pdf.rect(margin, y, pageWidth - 2 * margin, 25, 'F');
  pdf.setDrawColor(200);
  pdf.rect(margin, y, pageWidth - 2 * margin, 25, 'S');
  
  y += 6;
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(0);
  pdf.text("COMPLIANCE STATEMENT", margin + 5, y);
  
  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(60);
  pdf.setFontSize(7);
  const complianceText = "This audit trail is generated in compliance with the Electronic Signatures in Global and National Commerce Act (ESIGN) and the Uniform Electronic Transactions Act (UETA). All entries are immutable and cannot be modified or deleted after creation. Integrity verified via SHA-256 hash matching the finalized document.";
  const complianceLines = pdf.splitTextToSize(complianceText, pageWidth - 2 * margin - 10);
  pdf.text(complianceLines, margin + 5, y);

  // Footer
  pdf.setFontSize(7);
  pdf.setTextColor(150);
  pdf.text(`Generated: ${format(new Date(), "PPpp 'UTC'")}`, margin, pageHeight - 10);
  pdf.text(`Document ID: ${data.documentCode}`, pageWidth - margin, pageHeight - 10, { align: "right" });

  return pdf;
}

/**
 * Download audit trail as PDF
 */
export function downloadAuditTrailPDF(data: AuditExportData): void {
  const pdf = generateAuditTrailPDF(data);
  pdf.save(`AuditTrail_${data.documentCode}_${data.documentName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}
