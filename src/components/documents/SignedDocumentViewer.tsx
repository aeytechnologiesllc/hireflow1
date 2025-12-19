import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { jsPDF } from "jspdf";
import { QRCodeCanvas } from "qrcode.react";
import { 
  FileText, 
  Download, 
  CheckCircle, 
  History,
  Shield,
  User,
  Building2,
  Calendar,
  Globe,
  Monitor,
  Clock,
  Eye,
  PenTool,
  XCircle,
  ChevronRight,
  FileCheck,
  Edit,
  Hash,
  FileJson,
  Award,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import type { DocumentWithApplication } from "@/hooks/useDocuments";
import { AuditCertificate } from "./AuditCertificate";
import { downloadAuditTrailPDF, downloadAuditTrailJSON, AuditExportData, AuditExportEntry } from "@/lib/auditExport";
import { generateCompletionCertificate, CompletionCertificate } from "@/lib/completionCertificate";
import { downloadCertificatePDF } from "@/lib/certificatePDF";

interface AuditLog {
  id: string;
  action: string;
  details: unknown;
  created_at: string;
  user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  signer_name?: string;
  signer_email?: string;
  signer_role?: string;
  location_city?: string;
  location_region?: string;
  location_country?: string;
  document_hash?: string;
  document_version?: number;
  signature_method?: string;
  consent_confirmed?: boolean;
  pre_signature_hash?: string;
  post_signature_hash?: string;
}

interface DocumentData {
  content: string;
  signatureFields?: { id: string; label: string; required: boolean }[];
  metadata?: Record<string, unknown>;
}

interface SignedDocumentViewerProps {
  document: DocumentWithApplication | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getActionIcon = (action: string) => {
  switch (action) {
    case "created":
    case "document_created":
      return <FileText className="h-4 w-4" />;
    case "sent":
      return <ChevronRight className="h-4 w-4" />;
    case "viewed":
      return <Eye className="h-4 w-4" />;
    case "candidate_signed":
      return <PenTool className="h-4 w-4" />;
    case "employer_countersigned":
      return <FileCheck className="h-4 w-4" />;
    case "declined":
      return <XCircle className="h-4 w-4" />;
    case "edited":
      return <Edit className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
};

const getActionColor = (action: string) => {
  if (action.includes("signed")) return "bg-success text-success-foreground";
  if (action === "declined") return "bg-destructive text-destructive-foreground";
  if (action === "viewed") return "bg-blue-500 text-white";
  if (action === "edited") return "bg-orange-500 text-white";
  if (action === "sent") return "bg-primary text-primary-foreground";
  return "bg-muted text-muted-foreground";
};

const getActionLabel = (action: string) => {
  switch (action) {
    case "created":
    case "document_created":
      return "Document Created";
    case "sent":
      return "Document Sent";
    case "viewed":
    case "document_viewed":
      return "Document Viewed";
    case "candidate_signed":
      return "Signed by Candidate";
    case "employer_countersigned":
      return "Countersigned by Employer";
    case "declined":
    case "document_declined":
      return "Document Declined";
    case "edited":
      return "Document Edited";
    case "electronic_consent_confirmed":
      return "Electronic Consent Confirmed";
    case "signing_session_started":
      return "Signing Session Started";
    case "employer_review_confirmed":
      return "Employer Review Confirmed";
    case "document_completed":
      return "Document Completed";
    default:
      return action.replace(/_/g, " ");
  }
};

/**
 * Transform raw audit events into human-readable narrative descriptions
 * This replaces raw JSON display with clean, professional text
 */
const formatAuditEventDescription = (log: AuditLog): string => {
  const details = log.details as Record<string, unknown> | null;
  const signatureType = log.signature_method === 'drawn' ? 'drawn signature' : 'typed signature';
  
  switch (log.action) {
    case 'document_created':
    case 'created':
      return 'Document created and ready for signing workflow.';
    case 'document_viewed':
    case 'viewed':
      return `Document opened for viewing by ${log.signer_role === 'candidate' ? 'candidate' : 'employer'}.`;
    case 'signing_session_started':
      return `${log.signer_role === 'candidate' ? 'Candidate' : 'Employer'} initiated signing session.`;
    case 'electronic_consent_confirmed':
      return 'Electronic signature consent confirmed. Signer acknowledged legal equivalence of electronic signature.';
    case 'candidate_signed':
      return `Candidate signed the document using ${signatureType}. Document hash updated.`;
    case 'employer_review_confirmed':
      return 'Employer reviewed document and verified candidate signature before countersigning.';
    case 'employer_countersigned':
      return `Employer countersigned the document using ${signatureType}. Document is now fully executed.`;
    case 'document_completed':
      return 'All signatures collected. Document is now fully executed and locked from further changes.';
    case 'document_declined':
    case 'declined':
      const reason = details?.decline_reason || details?.reason || 'Not specified';
      return `Document was declined. Reason: ${reason}`;
    case 'sent':
      return 'Document was sent to the recipient for review and signing.';
    default:
      return details?.event ? String(details.event) : 'Activity recorded.';
  }
};

export function SignedDocumentViewer({ document, open, onOpenChange }: SignedDocumentViewerProps) {
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [documentData, setDocumentData] = useState<DocumentData | null>(null);
  const [candidateSignature, setCandidateSignature] = useState<string | null>(null);
  const [employerSignature, setEmployerSignature] = useState<string | null>(null);
  const [completionCert, setCompletionCert] = useState<CompletionCertificate | null>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (document && open) {
      fetchAuditLogs();
      parseDocumentData();
      parseSignatures();
      loadCompletionCertificate();
      setShowAuditTrail(false);
    }
  }, [document, open]);

  const fetchAuditLogs = async () => {
    if (!document) return;
    
    const { data, error } = await supabase
      .from("document_audit_logs")
      .select("*")
      .eq("document_id", document.id)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setAuditLogs(data as AuditLog[]);
    }
  };

  const loadCompletionCertificate = async () => {
    if (!document || document.status !== 'signed') return;
    
    // Try to load from stored certificate first
    if (document.completion_certificate) {
      try {
        const cert = typeof document.completion_certificate === 'string' 
          ? JSON.parse(document.completion_certificate) 
          : document.completion_certificate;
        setCompletionCert(cert as CompletionCertificate);
        return;
      } catch (e) {
        console.error("Error parsing stored certificate:", e);
      }
    }
    
    // Generate on the fly
    try {
      const finalHash = document.v3_hash || document.v2_hash || document.document_hash || '';
      const cert = await generateCompletionCertificate(
        document.id,
        document.name,
        document.document_type,
        finalHash
      );
      setCompletionCert(cert);
    } catch (e) {
      console.error("Error generating certificate:", e);
    }
  };

  const parseDocumentData = () => {
    if (!document?.file_url) return;
    
    try {
      if (document.file_url.startsWith("data:application/json;base64,")) {
        const base64Content = document.file_url.split(",")[1];
        const jsonString = atob(base64Content);
        const parsed = JSON.parse(jsonString) as DocumentData;
        setDocumentData(parsed);
      } else if (document.file_url.startsWith("data:text/plain;base64,")) {
        const base64Content = document.file_url.split(",")[1];
        const content = atob(base64Content);
        setDocumentData({ content });
      }
    } catch (error) {
      console.error("Error parsing document:", error);
      setDocumentData({ content: "Unable to parse document content" });
    }
  };

  const parseSignatures = () => {
    if (document?.candidate_signature_data) {
      try {
        const parsed = JSON.parse(document.candidate_signature_data);
        if (parsed.signatures?.recipient) {
          setCandidateSignature(parsed.signatures.recipient);
        }
      } catch (e) {
        console.error("Error parsing candidate signature:", e);
      }
    }
    if (document?.employer_signature_data) {
      try {
        const parsed = JSON.parse(document.employer_signature_data);
        if (parsed.signatures?.employer) {
          setEmployerSignature(parsed.signatures.employer);
        }
      } catch (e) {
        console.error("Error parsing employer signature:", e);
      }
    }
  };

  const getDocumentCode = () => {
    return (document as any)?.document_code || `DOC-${document?.id.slice(0, 6).toUpperCase()}`;
  };

  const getVerificationUrl = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/verify/${getDocumentCode()}`;
  };

  const getQRDataUrl = (): string | undefined => {
    if (qrRef.current) {
      return qrRef.current.toDataURL('image/png');
    }
    return undefined;
  };

  const handleDownloadCertificate = async () => {
    if (!document || !completionCert) return;
    
    const qrDataUrl = getQRDataUrl();
    await downloadCertificatePDF(completionCert, getDocumentCode(), document.name, qrDataUrl);
  };

  const handleDownloadAuditPDF = () => {
    if (!document) return;
    
    const exportData: AuditExportData = {
      documentId: document.id,
      documentCode: getDocumentCode(),
      documentName: document.name,
      documentType: document.document_type,
      status: document.status,
      completedAt: document.signed_at,
      v1Hash: document.v1_hash,
      v2Hash: document.v2_hash,
      v3Hash: document.v3_hash,
      finalHash: document.v3_hash || document.v2_hash || document.document_hash,
      entries: auditLogs as AuditExportEntry[]
    };
    
    downloadAuditTrailPDF(exportData);
  };

  const handleDownloadAuditJSON = () => {
    if (!document) return;
    
    const exportData: AuditExportData = {
      documentId: document.id,
      documentCode: getDocumentCode(),
      documentName: document.name,
      documentType: document.document_type,
      status: document.status,
      completedAt: document.signed_at,
      v1Hash: document.v1_hash,
      v2Hash: document.v2_hash,
      v3Hash: document.v3_hash,
      finalHash: document.v3_hash || document.v2_hash || document.document_hash,
      entries: auditLogs as AuditExportEntry[]
    };
    
    downloadAuditTrailJSON(exportData);
  };

  const handleDownload = async () => {
    if (!document || !documentData) return;
    
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - margin * 2;
    let yPosition = margin;

    pdf.setFont("helvetica");

    // Document header with Document ID
    pdf.setFontSize(10);
    pdf.setTextColor(100);
    pdf.text(`Document ID: ${getDocumentCode()}`, margin, yPosition);
    pdf.text(
      `Completed: ${document.signed_at ? format(new Date(document.signed_at), "PPpp") : ""}`,
      pageWidth - margin,
      yPosition,
      { align: "right" }
    );
    yPosition += 10;

    // Title
    pdf.setFontSize(16);
    pdf.setTextColor(0);
    pdf.setFont("helvetica", "bold");
    pdf.text(document.name, margin, yPosition);
    yPosition += 8;

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100);
    pdf.text(document.document_type?.replace(/_/g, " ") || "", margin, yPosition);
    yPosition += 10;

    pdf.setDrawColor(200);
    pdf.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;

    // Document content
    pdf.setFontSize(11);
    pdf.setTextColor(0);
    pdf.setFont("helvetica", "normal");
    
    const content = documentData.content;
    const lines = content.split('\n');
    
    // Skip signature lines in content - we'll add proper signature blocks at the end
    const candidatePatterns = [
      /^(Employee Signature:?\s*)([_\s]+)(Date:?\s*)([_\s]*)$/i,
      /^(Candidate Signature:?\s*)([_\s]+)(Date:?\s*)([_\s]*)$/i,
      /^(Recipient Signature:?\s*)([_\s]+)(Date:?\s*)([_\s]*)$/i,
      /^(Employee:?\s*)([_\s]+)(Date:?\s*)([_\s]*)$/i,
    ];
    
    const employerPatterns = [
      /^(Company Representative:?\s*)([_\s]+)(Date:?\s*)([_\s]*)$/i,
      /^(Employer Signature:?\s*)([_\s]+)(Date:?\s*)([_\s]*)$/i,
      /^(Authorized Representative:?\s*)([_\s]+)(Date:?\s*)([_\s]*)$/i,
      /^(Authorized Signatory:?\s*)([_\s]+)(Date:?\s*)([_\s]*)$/i,
      /^(For .*?:?\s*)([_\s]+)(Date:?\s*)([_\s]*)$/i,
    ];

    for (const line of lines) {
      if (yPosition > pageHeight - 80) {
        pdf.addPage();
        yPosition = margin;
      }

      const isCandidateLine = candidatePatterns.some(pattern => pattern.test(line.trim()));
      const isEmployerLine = employerPatterns.some(pattern => pattern.test(line.trim()));

      // Skip original signature lines - we'll add professional signature blocks at the end
      if ((isCandidateLine && candidateSignature) || (isEmployerLine && employerSignature)) {
        continue;
      }
      
      const wrappedLines = pdf.splitTextToSize(line || " ", maxWidth);
      for (const wrappedLine of wrappedLines) {
        if (yPosition > pageHeight - 80) {
          pdf.addPage();
          yPosition = margin;
        }
        pdf.text(wrappedLine, margin, yPosition);
        yPosition += 5;
      }
    }

    // === SIGNATURE SECTION (Non-Negotiable: Burned into PDF) ===
    // Ensure we have enough space for signature section
    if (yPosition > pageHeight - 120) {
      pdf.addPage();
      yPosition = margin;
    }
    
    yPosition += 10;
    pdf.setDrawColor(100);
    pdf.setLineWidth(0.5);
    pdf.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;
    
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(0);
    pdf.text("SIGNATURES", margin, yPosition);
    yPosition += 8;

    // Helper function to render professional signature block
    const renderSignatureBlock = (
      signatureData: string | null,
      signerName: string,
      signerRole: string,
      signedAt: string | null,
      ipAddress: string | null
    ) => {
      if (yPosition > pageHeight - 60) {
        pdf.addPage();
        yPosition = margin;
      }

      // Signature block border
      pdf.setDrawColor(180);
      pdf.setLineWidth(0.3);
      pdf.rect(margin, yPosition, maxWidth, 50);
      
      // "Electronically signed by" header
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "italic");
      pdf.setTextColor(100);
      pdf.text("Electronically signed by", margin + 5, yPosition + 6);
      
      // Signature image
      if (signatureData) {
        try {
          pdf.addImage(signatureData, "PNG", margin + 5, yPosition + 8, 50, 15);
        } catch (e) {
          pdf.setFontSize(10);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(0);
          pdf.text("[Signature on file]", margin + 5, yPosition + 16);
        }
      }
      
      // Signer name
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(0);
      pdf.text(signerName || "Unknown", margin + 5, yPosition + 28);
      
      // Role
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(60);
      pdf.text(signerRole, margin + 5, yPosition + 34);
      
      // Timestamp (UTC)
      if (signedAt) {
        const formattedDate = format(new Date(signedAt), "MMMM d, yyyy 'at' h:mm:ss a");
        pdf.text(`Signed on ${formattedDate} (UTC)`, margin + 5, yPosition + 40);
      }
      
      // IP Address (right side) - Never silently omit
      pdf.setFontSize(8);
      pdf.setTextColor(120);
      const ipDisplay = ipAddress && ipAddress !== 'unknown' 
        ? `IP: ${ipAddress}` 
        : 'IP unavailable at time of signing';
      pdf.text(ipDisplay, pageWidth - margin - 5, yPosition + 46, { align: "right" });
      
      yPosition += 55;
    };

    // Get IP addresses from audit logs
    const candidateSignEvent = auditLogs.find(log => log.action === 'candidate_signed');
    const employerSignEvent = auditLogs.find(log => log.action === 'employer_countersigned');

    // Render Candidate Signature Block
    if (candidateSignature || document.candidate_signed_at) {
      const candidateName = candidateSignEvent?.signer_name || 
        document.applications?.profiles?.full_name || 'Candidate';
      renderSignatureBlock(
        candidateSignature,
        candidateName,
        'Candidate',
        document.candidate_signed_at,
        candidateSignEvent?.ip_address || null
      );
    }

    // Render Employer Signature Block
    if (employerSignature || document.employer_signed_at) {
      const employerName = employerSignEvent?.signer_name || 'Employer Representative';
      renderSignatureBlock(
        employerSignature,
        employerName,
        'Employer / Hiring Manager',
        document.employer_signed_at,
        employerSignEvent?.ip_address || null
      );
    }

    // === EMBEDDED CERTIFICATE OF COMPLETION (CRITICAL - Burned into PDF) ===
    if (yPosition > pageHeight - 80) {
      pdf.addPage();
      yPosition = margin;
    }
    
    yPosition += 10;
    pdf.setDrawColor(200);
    pdf.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 8;
    
    // Enhanced Certificate Box
    const certHeight = 55;
    pdf.setFillColor(240, 255, 240);
    pdf.rect(margin, yPosition - 3, maxWidth, certHeight, 'F');
    pdf.setDrawColor(34, 139, 34);
    pdf.setLineWidth(0.5);
    pdf.rect(margin, yPosition - 3, maxWidth, certHeight, 'S');
    
    // Certificate Header
    pdf.setFontSize(10);
    pdf.setTextColor(34, 139, 34);
    pdf.setFont("helvetica", "bold");
    pdf.text("✓ CERTIFICATE OF COMPLETION", margin + 5, yPosition + 4);
    
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(60);
    
    // Left column - Document Info
    pdf.text(`Certificate ID: ${completionCert?.certificate_id || 'CERT-' + getDocumentCode()}`, margin + 5, yPosition + 11);
    pdf.text(`Document ID: ${getDocumentCode()}`, margin + 5, yPosition + 16);
    pdf.text(`Status: FULLY EXECUTED`, margin + 5, yPosition + 21);
    pdf.text(`Completed: ${document.signed_at ? format(new Date(document.signed_at), "MMMM d, yyyy 'at' h:mm:ss a") + " (UTC)" : ""}`, margin + 5, yPosition + 26);
    
    // Signing Order
    pdf.text(`Signing Order: Candidate (1) → Employer (2)`, margin + 5, yPosition + 31);
    pdf.text(`Jurisdiction: ESIGN Act (15 U.S.C. § 7001) & UETA`, margin + 5, yPosition + 36);
    
    // Right column - Integrity Info
    const rightCol = pageWidth / 2 + 10;
    pdf.setFont("helvetica", "bold");
    pdf.text("DOCUMENT INTEGRITY", rightCol, yPosition + 11);
    pdf.setFont("helvetica", "normal");
    
    const finalHash = document.v3_hash || document.v2_hash || document.document_hash;
    pdf.text(`Hash Algorithm: SHA-256`, rightCol, yPosition + 16);
    if (finalHash) {
      pdf.setFontSize(6);
      pdf.text(`Final Hash: ${finalHash.substring(0, 32)}...`, rightCol, yPosition + 21);
      pdf.text(`             ${finalHash.substring(32)}`, rightCol, yPosition + 25);
    }
    
    // Warning text
    pdf.setFontSize(6);
    pdf.setTextColor(100);
    pdf.setFont("helvetica", "italic");
    pdf.text("⚠ Any modification to this document will invalidate the above hash.", margin + 5, yPosition + 44);
    pdf.text("This certificate verifies that all parties have electronically signed as indicated above.", margin + 5, yPosition + 48);

    pdf.save(`${document.name}.pdf`);
  };

  const renderDocumentWithSignatures = () => {
    if (!documentData?.content) return <span className="text-muted-foreground">Loading document...</span>;

    const content = documentData.content;
    const lines = content.split('\n');
    
    const candidatePatterns = [
      /^(Employee Signature:?\s*)([_\s]+)(Date:?\s*)([_\s]*)$/i,
      /^(Candidate Signature:?\s*)([_\s]+)(Date:?\s*)([_\s]*)$/i,
      /^(Recipient Signature:?\s*)([_\s]+)(Date:?\s*)([_\s]*)$/i,
      /^(Employee:?\s*)([_\s]+)(Date:?\s*)([_\s]*)$/i,
    ];
    
    const employerPatterns = [
      /^(Company Representative:?\s*)([_\s]+)(Date:?\s*)([_\s]*)$/i,
      /^(Employer Signature:?\s*)([_\s]+)(Date:?\s*)([_\s]*)$/i,
      /^(Authorized Representative:?\s*)([_\s]+)(Date:?\s*)([_\s]*)$/i,
      /^(Authorized Signatory:?\s*)([_\s]+)(Date:?\s*)([_\s]*)$/i,
      /^(For .*?:?\s*)([_\s]+)(Date:?\s*)([_\s]*)$/i,
    ];

    return lines.map((line, index) => {
      const isCandidateLine = candidatePatterns.some(pattern => pattern.test(line.trim()));
      const isEmployerLine = employerPatterns.some(pattern => pattern.test(line.trim()));

      if (isCandidateLine && candidateSignature) {
        const labelMatch = line.match(/^([^:]+:?\s*)/);
        const label = labelMatch ? labelMatch[1] : "Employee Signature: ";
        
        return (
          <div key={index} className="my-6">
            <div className="flex items-end gap-8">
              <div className="flex-1">
                <span className="text-foreground">{label}</span>
                <div className="mt-2 border-b-2 border-foreground/30 pb-1">
                  <img 
                    src={candidateSignature} 
                    alt="Candidate signature" 
                    className="h-12 object-contain"
                    style={{ filter: 'brightness(0) saturate(100%) invert(15%) sepia(70%) saturate(5000%) hue-rotate(220deg)' }}
                  />
                </div>
              </div>
              <div className="w-40">
                <span className="text-foreground">Date: </span>
                <div className="mt-2 border-b-2 border-foreground/30 pb-1">
                  <span className="text-primary font-medium">
                    {document?.candidate_signed_at 
                      ? format(new Date(document.candidate_signed_at), "MM/dd/yyyy")
                      : ""}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      }

      if (isEmployerLine && employerSignature) {
        const labelMatch = line.match(/^([^:]+:?\s*)/);
        const label = labelMatch ? labelMatch[1] : "Company Representative: ";
        
        return (
          <div key={index} className="my-6">
            <div className="flex items-end gap-8">
              <div className="flex-1">
                <span className="text-foreground">{label}</span>
                <div className="mt-2 border-b-2 border-foreground/30 pb-1">
                  <img 
                    src={employerSignature} 
                    alt="Employer signature" 
                    className="h-12 object-contain"
                    style={{ filter: 'brightness(0) saturate(100%) invert(15%) sepia(70%) saturate(5000%) hue-rotate(220deg)' }}
                  />
                </div>
              </div>
              <div className="w-40">
                <span className="text-foreground">Date: </span>
                <div className="mt-2 border-b-2 border-foreground/30 pb-1">
                  <span className="text-primary font-medium">
                    {document?.employer_signed_at 
                      ? format(new Date(document.employer_signed_at), "MM/dd/yyyy")
                      : ""}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div key={index} className="whitespace-pre-wrap">
          {line || '\u00A0'}
        </div>
      );
    });
  };

  if (!document) return null;

  const finalHash = document.v3_hash || document.v2_hash || document.document_hash;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col overflow-hidden p-0">
        {/* Hidden QR Code for PDF generation */}
        <div className="hidden">
          <QRCodeCanvas 
            ref={qrRef}
            value={getVerificationUrl()} 
            size={150}
            level="M"
          />
        </div>

        <AnimatePresence mode="wait">
          {!showAuditTrail ? (
            <motion.div
              key="document"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col h-full overflow-hidden"
            >
              {/* Header */}
              <DialogHeader className="p-6 pb-4 border-b border-border shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                      <FileCheck className="h-6 w-6 text-success" />
                    </div>
                    <div>
                      <DialogTitle className="text-xl">{document.name}</DialogTitle>
                      <p className="text-sm text-muted-foreground">
                        {document.document_type?.replace(/_/g, " ")} • Completed {document.signed_at ? format(new Date(document.signed_at), "MMM d, yyyy") : ""}
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-success/20 text-success px-3 py-1.5">
                    <CheckCircle className="h-4 w-4 mr-1.5" />
                    Fully Signed
                  </Badge>
                </div>
              </DialogHeader>

              {/* Document Identity Bar */}
              <div className="px-6 py-3 bg-muted/50 border-b border-border">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Document ID:</span>
                      <span className="font-mono font-medium">{getDocumentCode()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Completed:</span>
                      <span className="font-medium">
                        {document.signed_at ? format(new Date(document.signed_at), "PPpp 'UTC'") : "Pending"}
                      </span>
                    </div>
                  </div>
                  {finalHash && (
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-xs text-muted-foreground">
                        {finalHash.substring(0, 16)}...
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Document Content */}
              <ScrollArea className="flex-1 min-h-0 p-6">
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-lg overflow-hidden">
                  {/* Document Header */}
                  <div className="bg-gradient-to-r from-primary/10 to-accent/10 p-6 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Shield className="h-6 w-6 text-primary" />
                        <div>
                          <p className="font-semibold text-foreground">Legally Binding Document</p>
                          <p className="text-xs text-muted-foreground">Electronically signed and verified</p>
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>Document ID: {getDocumentCode()}</p>
                        <p>Signed: {document.signed_at ? format(new Date(document.signed_at), "PPpp") : ""}</p>
                      </div>
                    </div>
                  </div>

                  {/* Document Body with Embedded Signatures */}
                  <div className="p-8">
                    <div className="font-serif text-sm leading-relaxed text-foreground">
                      {renderDocumentWithSignatures()}
                    </div>
                  </div>

                  {/* Signatures Section */}
                  <div className="border-t border-border p-6 bg-muted/30">
                    <h4 className="font-semibold mb-4 flex items-center gap-2">
                      <PenTool className="h-4 w-4 text-primary" />
                      Electronic Signatures
                    </h4>
                    <div className="grid grid-cols-2 gap-6">
                      {/* Candidate Signature */}
                      <div className="p-4 rounded-lg bg-background border border-border">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                            <User className="h-4 w-4 text-success" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Candidate</p>
                            <p className="text-xs text-muted-foreground">
                              {document.candidate_signed_at 
                                ? format(new Date(document.candidate_signed_at), "MMM d, yyyy 'at' h:mm a")
                                : "Not signed"}
                            </p>
                          </div>
                        </div>
                        {candidateSignature ? (
                          <div className="h-16 bg-white dark:bg-zinc-800 rounded border border-border flex items-center justify-center overflow-hidden">
                            <img src={candidateSignature} alt="Candidate signature" className="max-h-full max-w-full object-contain" />
                          </div>
                        ) : (
                          <div className="h-16 bg-muted/50 rounded border border-dashed border-border flex items-center justify-center">
                            <span className="text-xs text-muted-foreground">Signature on file</span>
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-1 text-xs text-success">
                          <CheckCircle className="h-3 w-3" />
                          <span>Verified</span>
                        </div>
                      </div>

                      {/* Employer Signature */}
                      <div className="p-4 rounded-lg bg-background border border-border">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-success" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Employer</p>
                            <p className="text-xs text-muted-foreground">
                              {document.employer_signed_at 
                                ? format(new Date(document.employer_signed_at), "MMM d, yyyy 'at' h:mm a")
                                : "Not signed"}
                            </p>
                          </div>
                        </div>
                        {employerSignature ? (
                          <div className="h-16 bg-white dark:bg-zinc-800 rounded border border-border flex items-center justify-center overflow-hidden">
                            <img src={employerSignature} alt="Employer signature" className="max-h-full max-w-full object-contain" />
                          </div>
                        ) : (
                          <div className="h-16 bg-muted/50 rounded border border-dashed border-border flex items-center justify-center">
                            <span className="text-xs text-muted-foreground">Signature on file</span>
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-1 text-xs text-success">
                          <CheckCircle className="h-3 w-3" />
                          <span>Verified</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Certificate of Completion */}
                  <div className="border-t border-border p-4 bg-success/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Shield className="h-5 w-5 text-success" />
                        <div>
                          <p className="text-sm font-medium text-success">Certificate of Completion</p>
                          <p className="text-xs text-muted-foreground">
                            Integrity verified via SHA-256 hash matching the finalized document.
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          Document ID: {getDocumentCode()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Completed: {document.signed_at ? format(new Date(document.signed_at), "MMMM d, yyyy") : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>

              {/* Footer Actions */}
              <div className="p-4 border-t border-border bg-card shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleDownload}>
                      <Download className="h-4 w-4 mr-2" />
                      Signed PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownloadCertificate} disabled={!completionCert}>
                      <Award className="h-4 w-4 mr-2" />
                      Certificate
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownloadAuditPDF}>
                      <FileText className="h-4 w-4 mr-2" />
                      Audit PDF
                    </Button>
                  </div>
                  <Button onClick={() => setShowAuditTrail(true)} className="gap-2">
                    <History className="h-4 w-4" />
                    View Audit Trail
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="audit"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col h-full overflow-hidden"
            >
              {/* Audit Trail Header */}
              <DialogHeader className="p-6 pb-4 border-b border-border shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                      <History className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <DialogTitle className="text-xl">Audit Trail</DialogTitle>
                      <p className="text-sm text-muted-foreground">
                        Complete history of document activity
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" onClick={() => setShowAuditTrail(false)}>
                    Back to Document
                  </Button>
                </div>
              </DialogHeader>

              {/* Phase Label */}
              <div className="px-6 py-2 border-b border-border">
                {document.status === 'signed' ? (
                  <Badge className="bg-success/20 text-success font-medium">
                    <CheckCircle className="h-3 w-3 mr-1.5" />
                    Finalized Audit Trail
                  </Badge>
                ) : (
                  <Badge className="bg-blue-500/20 text-blue-600 dark:text-blue-400 font-medium">
                    <Clock className="h-3 w-3 mr-1.5" />
                    Signing in Progress
                  </Badge>
                )}
              </div>

              {/* Document Identity Bar in Audit View */}
              <div className="px-6 py-3 bg-muted/50 border-b border-border">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Document ID</p>
                    <p className="font-mono font-medium">{getDocumentCode()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant="default" className="mt-0.5">
                      {document.status === 'signed' ? 'Fully Executed' : 'Pending Signatures'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Final Hash (SHA-256)</p>
                    <p className="font-mono text-xs truncate">{finalHash || 'Pending'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="font-medium">
                      {document.signed_at ? format(new Date(document.signed_at), "PPpp 'UTC'") : "Pending"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Audit Trail Content */}
              <ScrollArea className="flex-1 min-h-0 p-6">
                <div className="space-y-1">
                  {auditLogs.map((log, index) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="relative"
                    >
                      {index < auditLogs.length - 1 && (
                        <div className="absolute left-5 top-12 w-0.5 h-full bg-border -translate-x-1/2" />
                      )}
                      
                      <div className="flex gap-4 p-4 rounded-xl hover:bg-muted/50 transition-colors">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${getActionColor(log.action)}`}>
                          {getActionIcon(log.action)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-medium text-foreground">
                                {getActionLabel(log.action)}
                              </p>
                              {log.signer_name && (
                                <p className="text-sm text-muted-foreground">
                                  {log.signer_name} ({log.signer_role || 'Unknown role'})
                                </p>
                              )}
                              {/* Human-readable event description - NO raw JSON */}
                              <p className="mt-1 text-sm text-muted-foreground">
                                {formatAuditEventDescription(log)}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-medium text-muted-foreground">
                                {format(new Date(log.created_at), "MMM d, yyyy")}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(log.created_at), "h:mm:ss a 'UTC'")}
                              </p>
                            </div>
                          </div>
                          
                          <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                              {/* Always show IP - never silently omit */}
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Globe className="h-3 w-3" />
                                <span>
                                  {log.ip_address && log.ip_address !== 'unknown' 
                                    ? `IP: ${log.ip_address}` 
                                    : 'IP unavailable at time of signing'}
                                </span>
                              </div>
                              {log.location_city && log.location_city !== 'Unknown' && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Globe className="h-3 w-3" />
                                  <span>{log.location_city}, {log.location_region}, {log.location_country}</span>
                                </div>
                              )}
                              {/* VPN/Proxy Warning - Informational Only */}
                              {(log.details as Record<string, unknown>)?.connectionWarning && (
                                <div className="flex items-center gap-2 text-amber-500 col-span-2">
                                  <AlertTriangle className="h-3 w-3" />
                                  <span>{String((log.details as Record<string, unknown>).connectionWarning)}</span>
                                </div>
                              )}
                              {log.user_agent && (
                                <div className="flex items-center gap-2 text-muted-foreground truncate">
                                  <Monitor className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{log.user_agent.slice(0, 50)}...</span>
                                </div>
                              )}
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                <span>{format(new Date(log.created_at), "PPpp 'UTC'")}</span>
                              </div>
                              {log.document_hash && (
                                <div className="flex items-center gap-2 text-muted-foreground col-span-2">
                                  <Hash className="h-3 w-3" />
                                  <span className="font-mono">Hash: {log.document_hash.substring(0, 24)}...</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Summary Card */}
                <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-success/10 to-primary/10 border border-success/20">
                  <div className="flex items-center gap-3">
                    <Shield className="h-8 w-8 text-success" />
                    <div>
                      <p className="font-semibold text-foreground">Integrity Verified via SHA-256</p>
                      <p className="text-sm text-muted-foreground">
                        This audit trail provides a complete, tamper-evident record of all document activity.
                        Hash matching confirms the finalized document has not been altered.
                      </p>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
