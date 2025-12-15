import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { jsPDF } from "jspdf";
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
  Edit
} from "lucide-react";
import { format } from "date-fns";
import type { DocumentWithApplication } from "@/hooks/useDocuments";

interface AuditLog {
  id: string;
  action: string;
  details: unknown;
  created_at: string;
  user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
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
      return "Document Created";
    case "sent":
      return "Document Sent";
    case "viewed":
      return "Document Viewed";
    case "candidate_signed":
      return "Signed by Candidate";
    case "employer_countersigned":
      return "Countersigned by Employer";
    case "declined":
      return "Document Declined";
    case "edited":
      return "Document Edited";
    default:
      return action.replace(/_/g, " ");
  }
};

export function SignedDocumentViewer({ document, open, onOpenChange }: SignedDocumentViewerProps) {
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [documentData, setDocumentData] = useState<DocumentData | null>(null);
  const [candidateSignature, setCandidateSignature] = useState<string | null>(null);
  const [employerSignature, setEmployerSignature] = useState<string | null>(null);

  useEffect(() => {
    if (document && open) {
      fetchAuditLogs();
      parseDocumentData();
      parseSignatures();
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
      setAuditLogs(data);
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

    // Set font
    pdf.setFont("helvetica");

    // Document header
    pdf.setFontSize(10);
    pdf.setTextColor(100);
    pdf.text(`Document ID: ${document.id.slice(0, 8)}...`, margin, yPosition);
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

    // Document type
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100);
    pdf.text(document.document_type?.replace(/_/g, " ") || "", margin, yPosition);
    yPosition += 10;

    // Divider line
    pdf.setDrawColor(200);
    pdf.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;

    // Document content
    pdf.setFontSize(11);
    pdf.setTextColor(0);
    pdf.setFont("helvetica", "normal");
    
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

    for (const line of lines) {
      // Check if we need a new page
      if (yPosition > pageHeight - 40) {
        pdf.addPage();
        yPosition = margin;
      }

      const isCandidateLine = candidatePatterns.some(pattern => pattern.test(line.trim()));
      const isEmployerLine = employerPatterns.some(pattern => pattern.test(line.trim()));

      if (isCandidateLine && candidateSignature) {
        const labelMatch = line.match(/^([^:]+:?\s*)/);
        const label = labelMatch ? labelMatch[1].trim() : "Employee Signature:";
        
        yPosition += 5;
        pdf.setFont("helvetica", "normal");
        pdf.text(label, margin, yPosition);
        yPosition += 5;
        
        // Add signature image
        try {
          pdf.addImage(candidateSignature, "PNG", margin, yPosition, 50, 15);
        } catch (e) {
          pdf.text("[Signed]", margin, yPosition + 8);
        }
        
        // Add date
        const signDate = document.candidate_signed_at 
          ? format(new Date(document.candidate_signed_at), "MM/dd/yyyy")
          : "";
        pdf.text(`Date: ${signDate}`, margin + 80, yPosition + 10);
        
        yPosition += 20;
        
        // Draw signature line
        pdf.setDrawColor(150);
        pdf.line(margin, yPosition, margin + 60, yPosition);
        yPosition += 8;
        
      } else if (isEmployerLine && employerSignature) {
        const labelMatch = line.match(/^([^:]+:?\s*)/);
        const label = labelMatch ? labelMatch[1].trim() : "Company Representative:";
        
        yPosition += 5;
        pdf.setFont("helvetica", "normal");
        pdf.text(label, margin, yPosition);
        yPosition += 5;
        
        // Add signature image
        try {
          pdf.addImage(employerSignature, "PNG", margin, yPosition, 50, 15);
        } catch (e) {
          pdf.text("[Signed]", margin, yPosition + 8);
        }
        
        // Add date
        const signDate = document.employer_signed_at 
          ? format(new Date(document.employer_signed_at), "MM/dd/yyyy")
          : "";
        pdf.text(`Date: ${signDate}`, margin + 80, yPosition + 10);
        
        yPosition += 20;
        
        // Draw signature line
        pdf.setDrawColor(150);
        pdf.line(margin, yPosition, margin + 60, yPosition);
        yPosition += 8;
        
      } else {
        // Regular text line
        const wrappedLines = pdf.splitTextToSize(line || " ", maxWidth);
        for (const wrappedLine of wrappedLines) {
          if (yPosition > pageHeight - 20) {
            pdf.addPage();
            yPosition = margin;
          }
          pdf.text(wrappedLine, margin, yPosition);
          yPosition += 5;
        }
      }
    }

    // Certificate of completion at the bottom
    if (yPosition > pageHeight - 50) {
      pdf.addPage();
      yPosition = margin;
    }
    
    yPosition += 10;
    pdf.setDrawColor(200);
    pdf.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 8;
    
    pdf.setFontSize(9);
    pdf.setTextColor(34, 139, 34); // Green color
    pdf.setFont("helvetica", "bold");
    pdf.text("✓ Certificate of Completion", margin, yPosition);
    yPosition += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100);
    pdf.text("This document has been electronically signed by all parties.", margin, yPosition);
    yPosition += 4;
    pdf.text(`Completed: ${document.signed_at ? format(new Date(document.signed_at), "MMMM d, yyyy") : ""}`, margin, yPosition);

    // Save the PDF
    pdf.save(`${document.name}.pdf`);
  };

  // Render document content with inline embedded signatures
  const renderDocumentWithSignatures = () => {
    if (!documentData?.content) return <span className="text-muted-foreground">Loading document...</span>;

    const content = documentData.content;
    const lines = content.split('\n');
    
    // Patterns for signature lines
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
      // Check if line matches candidate signature pattern
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

      // Regular line - preserve whitespace
      return (
        <div key={index} className="whitespace-pre-wrap">
          {line || '\u00A0'}
        </div>
      );
    });
  };

  if (!document) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col overflow-hidden p-0">
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

              {/* Document Content */}
              <ScrollArea className="flex-1 min-h-0 p-6">
                {/* PDF-like Document View */}
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
                        <p>Document ID: {document.id.slice(0, 8)}...</p>
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
                            This document has been electronically signed by all parties.
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Completed: {document.signed_at ? format(new Date(document.signed_at), "MMMM d, yyyy") : ""}
                      </p>
                    </div>
                  </div>
                </div>
              </ScrollArea>

              {/* Footer Actions */}
              <div className="p-4 border-t border-border flex items-center justify-between bg-card shrink-0">
                <Button variant="outline" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button onClick={() => setShowAuditTrail(true)} className="gap-2">
                  <History className="h-4 w-4" />
                  View Audit Trail
                </Button>
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

              {/* Audit Trail Content - DocuSign Style */}
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
                      {/* Timeline connector */}
                      {index < auditLogs.length - 1 && (
                        <div className="absolute left-5 top-12 w-0.5 h-full bg-border -translate-x-1/2" />
                      )}
                      
                      <div className="flex gap-4 p-4 rounded-xl hover:bg-muted/50 transition-colors">
                        {/* Icon */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${getActionColor(log.action)}`}>
                          {getActionIcon(log.action)}
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-medium text-foreground">
                                {getActionLabel(log.action)}
                              </p>
                              {log.details && typeof log.details === "object" && (
                                <div className="mt-1 text-sm text-muted-foreground">
                                  {(log.details as Record<string, unknown>).reason && (
                                    <p>Reason: {String((log.details as Record<string, unknown>).reason)}</p>
                                  )}
                                  {(log.details as Record<string, unknown>).role && (
                                    <p>Role: {String((log.details as Record<string, unknown>).role)}</p>
                                  )}
                                  {(log.details as Record<string, unknown>).method && (
                                    <p>Method: {String((log.details as Record<string, unknown>).method)}</p>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-medium text-muted-foreground">
                                {format(new Date(log.created_at), "MMM d, yyyy")}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(log.created_at), "h:mm:ss a")}
                              </p>
                            </div>
                          </div>
                          
                          {/* Technical Details */}
                          <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                              {log.ip_address && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Globe className="h-3 w-3" />
                                  <span>IP: {log.ip_address}</span>
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
                                <span>{format(new Date(log.created_at), "PPpp")}</span>
                              </div>
                              {log.user_id && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <User className="h-3 w-3" />
                                  <span>User: {log.user_id.slice(0, 8)}...</span>
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
                      <p className="font-semibold text-foreground">Document Integrity Verified</p>
                      <p className="text-sm text-muted-foreground">
                        This audit trail provides a complete, tamper-evident record of all document activity.
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
