import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { ownDocumentsPath } from "@/lib/ownDocumentFile";
import { motion, AnimatePresence } from "framer-motion";
import { jsPDF } from "jspdf";
import { QRCodeCanvas } from "qrcode.react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { DocumentSigningPanel } from "./DocumentSigningPanel";
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
  MapPin,
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
  AlertTriangle,
  Loader2,
  Ban,
  ChevronDown,
} from "lucide-react";
// Every time on the record in UTC for real, the same text on every device
// (the eighth product review: date-fns printed the viewer's own clock under
// a "UTC" label).
import { utcDay, utcStamp, utcTime } from "@/lib/utcTime";
import { recordClosedUnfinished, recordFinalHash, recordFinalHashCell, recordState, recordStatusLabel } from "@/lib/signingRecord";
import { applicantDocumentState } from "@/lib/applicantDocumentTurn";
import type { DocumentWithApplication } from "@/hooks/useDocuments";
import { AuditCertificate } from "./AuditCertificate";
import { downloadAuditTrailPDF, downloadAuditTrailJSON, AuditExportData, AuditExportEntry } from "@/lib/auditExport";
import { generateCompletionCertificate, CompletionCertificate } from "@/lib/completionCertificate";
import { downloadCertificatePDF } from "@/lib/certificatePDF";
import { burnSignaturesIntoPdf, generatePdfHash, type SignatureOverlay, type CertificateData } from "@/lib/pdfSignatureBurner";
import {
  formatAuditActionLabel,
  getAuditActionColor,
  formatAuditTimestamp,
  formatAuditEventDescription,
  formatSignerRole
} from "@/lib/auditFormatting";
import { candidateOrigin } from "@/lib/hosts";
import { externalHref } from "@/lib/safeLink";
import { generateV1Hash } from "@/lib/documentHash";

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
  content: string | null;
  signatureFields?: { id: string; label: string; required: boolean; x?: number; y?: number; page?: number; width?: number; height?: number; type?: string }[];
  metadata?: Record<string, unknown>;
  uploadedFileUrl?: string;
  uploadedFileName?: string;
  uploadedFileType?: string;
}

/** A drawn signature is stored as a picture; a typed one is stored as the name itself. */
const isDrawnSignature = (value: string) => /^data:image\//.test(value);

/**
 * A signature as it was made. A typed name used to be handed to <img> like a
 * drawing and showed as a broken picture, on both sides, and "Type" is the
 * tab the signing box opens on (seen in the offer-letter test run,
 * 2026-10-09).
 */
function SignatureMark({ value, alt, className, style }: { value: string; alt: string; className?: string; style?: CSSProperties }) {
  if (isDrawnSignature(value)) return <img src={value} alt={alt} className={className} style={style} />;
  return (
    <span className="px-2 font-signature text-[30px] leading-none text-foreground" aria-label={alt} data-typed-signature>
      {value}
    </span>
  );
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
    case "document_viewed":
      return <Eye className="h-4 w-4" />;
    case "candidate_signed":
      return <PenTool className="h-4 w-4" />;
    case "employer_countersigned":
      return <FileCheck className="h-4 w-4" />;
    case "declined":
    case "document_declined":
      return <XCircle className="h-4 w-4" />;
    case "withdrawn":
    case "document_withdrawn":
    case "voided":
    case "document_voided":
      return <Ban className="h-4 w-4" />;
    case "edited":
      return <Edit className="h-4 w-4" />;
    case "document_completed":
    case "completed":
      return <Award className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
};

/** Drives every "is this actually signed" claim in the main document view off
 *  document.status (and, since the withdraw/void pass, document.is_voided —
 *  a withdrawn/voided document is still status='pending' underneath, see
 *  document-signing's withdraw/void actions), instead of the view assuming
 *  completion regardless of where the document really is in its lifecycle. */
const DOCUMENT_STATUS_META: Record<
  "signed" | "declined" | "pending" | "withdrawn" | "voided" | "expired",
  {
    icon: typeof CheckCircle;
    badgeClass: string;
    badgeLabel: string;
    iconBoxClass: string;
    iconClass: string;
    stripBgClass: string;
    bannerTitle: string;
    bannerSubtitle: string;
  }
> = {
  signed: {
    icon: CheckCircle,
    badgeClass: "bg-success/20 text-success",
    badgeLabel: "Fully Signed",
    iconBoxClass: "bg-success/20",
    iconClass: "text-success",
    stripBgClass: "bg-success/5",
    bannerTitle: "Signed and Time-Stamped",
    bannerSubtitle: "SHA-256 verified",
  },
  declined: {
    icon: XCircle,
    badgeClass: "bg-destructive/20 text-destructive",
    badgeLabel: "Declined",
    iconBoxClass: "bg-destructive/20",
    iconClass: "text-destructive",
    stripBgClass: "bg-destructive/5",
    bannerTitle: "Signing Declined",
    bannerSubtitle: "This document was not completed",
  },
  pending: {
    icon: Clock,
    badgeClass: "bg-warning/20 text-warning",
    badgeLabel: "Awaiting Signature",
    iconBoxClass: "bg-warning/20",
    iconClass: "text-warning",
    stripBgClass: "bg-warning/5",
    bannerTitle: "Awaiting Signature",
    // Was "Not yet verified": to someone reading their own job offer that
    // sounded like something was wrong with it.
    bannerSubtitle: "Not signed by everyone yet",
  },
  withdrawn: {
    icon: Ban,
    badgeClass: "bg-muted text-muted-foreground",
    badgeLabel: "Withdrawn",
    iconBoxClass: "bg-muted",
    iconClass: "text-muted-foreground",
    stripBgClass: "bg-muted/50",
    bannerTitle: "Withdrawn",
    bannerSubtitle: "Cancelled before it was signed",
  },
  voided: {
    icon: Ban,
    badgeClass: "bg-destructive/20 text-destructive",
    badgeLabel: "Voided",
    iconBoxClass: "bg-destructive/20",
    iconClass: "text-destructive",
    stripBgClass: "bg-destructive/5",
    bannerTitle: "Voided",
    bannerSubtitle: "Cancelled after signing, before it was countersigned",
  },
  // Not signed by its date (the eighth product review: the applicant was
  // still shown the place to sign, and signing answered "This document has
  // expired"). Signed in time, a document is never this: the date is theirs.
  expired: {
    icon: Clock,
    badgeClass: "bg-muted text-muted-foreground",
    badgeLabel: "Expired",
    iconBoxClass: "bg-muted",
    iconClass: "text-muted-foreground",
    stripBgClass: "bg-muted/50",
    bannerTitle: "Expired",
    bannerSubtitle: "The date to sign passed before it was signed",
  },
};


/** The audit trail's closing card for a document that is not finished (the
 *  seventh product review; withdrawn, declined and expired since the eighth,
 *  which found a withdrawn one called "Voided" under a "Withdrawn" badge). */
const RECORD_SUMMARY: Record<"voided" | "withdrawn" | "declined" | "expired" | "in-progress", { title: string; text: string }> = {
  voided: {
    title: "Voided before it was finished",
    text: "This record shows every step up to the void. A voided document was never finalized, so it has no final hash.",
  },
  withdrawn: {
    title: "Withdrawn before it was signed",
    text: "This record shows every step up to the withdrawal. A withdrawn document was never finalized, so it has no final hash.",
  },
  declined: {
    title: "Declined before it was finished",
    text: "This record shows every step up to the decline. A declined document was never finalized, so it has no final hash.",
  },
  expired: {
    title: "Expired before it was signed",
    text: "This record shows every step up to the date to sign. A document not signed in time was never finalized, so it has no final hash.",
  },
  "in-progress": {
    title: "Not finished yet",
    text: "This record shows every step so far. The final hash is made once both sides have signed.",
  },
};

/** "Offer letter.pdf": the name a phone saves the document under. */
function pdfFileName(title: string | null | undefined): string {
  const name = (title ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w .()-]+/g, "").trim().slice(0, 80);
  return `${name || "Document"}.pdf`;
}

export function SignedDocumentViewer({ document, open, onOpenChange }: SignedDocumentViewerProps) {
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [documentData, setDocumentData] = useState<DocumentData | null>(null);
  // What this screen shows, and its hash: an uploaded PDF is fetched once and
  // framed from those very bytes, and the signature is sent with their hash,
  // so the server signs nothing the applicant did not see (the third Phase 7
  // security review; supabase/functions/_shared/documentShown.ts).
  const [shownPdf, setShownPdf] = useState<{ src: string; hash: string } | null>(null);
  const [shownPdfFailed, setShownPdfFailed] = useState(false);
  const [viewedHash, setViewedHash] = useState<string | null>(null);
  const [candidateSignature, setCandidateSignature] = useState<string | null>(null);
  const [employerSignature, setEmployerSignature] = useState<string | null>(null);
  const [completionCert, setCompletionCert] = useState<CompletionCertificate | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const qrRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  const { role, user } = useAuth();
  const queryClient = useQueryClient();

  // A candidate may sign their own pending, not-yet-signed document; an
  // employer/team member may countersign once the candidate has. Mirrors
  // the same preconditions the document-signing edge function enforces
  // server-side — this is just what shows the panel, not what authorizes
  // the write. The applicant's turn ends at the date to sign (the eighth
  // product review: an expired PDF still offered the panel); the team's
  // countersign does not (signedInTime in document-signing).
  const canSignAsCandidate =
    role === "candidate" &&
    !!document &&
    document.status === "pending" &&
    !document.candidate_signed_at &&
    !document.is_voided &&
    applicantDocumentState(document) !== "expired";
  const canCountersignAsEmployer =
    (role === "employer" || role === "team_member") &&
    document?.status === "pending" &&
    !!document?.candidate_signed_at &&
    !document?.employer_signed_at &&
    !document?.is_voided;

  // The audit trail: the team's at any time; the applicant's once they have
  // signed, and still after a void (the record of their own signature is
  // theirs to read: document_audit_log gives them the team's rows without
  // its address, place or device). Before they sign it stays out of their way
  // (the fifth product review). The sixth product review: shown to them only
  // once countersigned, it was out of reach while the team took its time, and
  // for good once the team voided what they had signed.
  const auditTrailOffered = document?.status === "signed" || role !== "candidate" || !!document?.candidate_signed_at;
  // Which screens the footer has a button for: the copies (finished; the
  // team's on a computer) and the audit trail go with auditTrailOffered, and
  // only a phone has "Sign" / "Countersign". Nothing at all: no footer.
  const footerOn: "both" | "phone" | "none" = auditTrailOffered ? "both" : canSignAsCandidate || canCountersignAsEmployer ? "phone" : "none";

  const fetchAuditLogs = useCallback(async () => {
    if (!document) return;

    // Through document_audit_log (2026-10-11): the team reads every row
    // whole; the applicant reads their own rows whole and the team's without
    // its IP address, device, place or email. The table no longer hands
    // those columns to a client at all.
    const { data, error } = await supabase.rpc("document_audit_log" as never, { p_document_id: document.id } as never);

    if (!error && data) {
      setAuditLogs(data as unknown as AuditLog[]);
    }
  }, [document]);

  const loadCompletionCertificate = useCallback(async () => {
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
  }, [document]);

  const parseDocumentData = useCallback(() => {
    if (!document?.file_url) return;
    
    try {
      if (document.file_url.startsWith("data:application/json;base64,")) {
        const base64Content = document.file_url.split(",")[1];
        const jsonString = atob(base64Content);
        const parsed = JSON.parse(jsonString) as DocumentData;
        
        // An uploaded PDF's address is the sender's own words: it is shown,
        // fetched and framed only when it is a file in this project's own
        // documents bucket (src/lib/ownDocumentFile.ts; the Phase 7 security
        // review: any http(s) address became a frame inside the signing view).
        setDocumentData(
          parsed.uploadedFileUrl && !ownDocumentsPath(parsed.uploadedFileUrl, SUPABASE_URL)
            ? { ...parsed, uploadedFileUrl: undefined }
            : parsed,
        );
      } else if (document.file_url.startsWith("data:text/plain;base64,")) {
        const base64Content = document.file_url.split(",")[1];
        const content = atob(base64Content);
        setDocumentData({ content });
      }
    } catch (error) {
      console.error("Error parsing document:", error);
      setDocumentData({ content: "Unable to parse document content" });
    }
  }, [document]);

  const parseSignatures = useCallback(() => {
    if (document?.candidate_signature_data) {
      try {
        const parsed = JSON.parse(document.candidate_signature_data);
        // Check multiple possible keys for candidate signature (different formats)
        const candidateSig = parsed.signatures?.recipient 
          || parsed.signatures?.candidate_signature 
          || parsed.signatures?.positioned_signature;
        if (candidateSig) {
          setCandidateSignature(candidateSig);
        }
      } catch (e) {
        console.error("Error parsing candidate signature:", e);
      }
    }
    if (document?.employer_signature_data) {
      try {
        const parsed = JSON.parse(document.employer_signature_data);
        // Check multiple possible keys for employer signature (different formats)
        const employerSig = parsed.signatures?.employer 
          || parsed.signatures?.employer_signature
          || parsed.signatures?.positioned_signature;
        if (employerSig) {
          setEmployerSignature(employerSig);
        }
      } catch (e) {
        console.error("Error parsing employer signature:", e);
      }
    }
  }, [document]);

  useEffect(() => {
    if (document && open) {
      fetchAuditLogs();
      parseDocumentData();
      parseSignatures();
      loadCompletionCertificate();
      setShowAuditTrail(false);
      // Replaces DocumentViewerDialog.tsx's old recordDocumentView — the
      // edge function is idempotent (only the first call per document sets
      // viewed_at / writes an audit row), so firing this on every open is
      // safe and doesn't need to block rendering.
      supabase.functions.invoke("document-signing", { body: { documentId: document.id, action: "view" } })
        .catch(() => {
          // Best-effort — a failed "viewed" ping never blocks reading the document.
        });
    }
  }, [document, open, fetchAuditLogs, parseDocumentData, parseSignatures, loadCompletionCertificate]);

  const getDocumentCode = () => {
    return document?.document_code || `DOC-${document?.id.slice(0, 6).toUpperCase()}`;
  };

  const getVerificationUrl = () => {
    const baseUrl = candidateOrigin();
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
      // The record's own words, as the Status cell reads them: a voided,
      // withdrawn or expired one is still stored as pending (the ninth
      // product review: the Audit PDF printed "Status: PENDING").
      status: recordStatusLabel(document),
      completedAt: document.signed_at,
      closedUnfinished: recordClosedUnfinished(recordState(document)),
      v1Hash: document.v1_hash,
      v2Hash: document.v2_hash,
      v3Hash: document.v3_hash,
      finalHash: recordFinalHash(document),
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
      // The record's own words, as the Status cell reads them: a voided,
      // withdrawn or expired one is still stored as pending (the ninth
      // product review: the Audit PDF printed "Status: PENDING").
      status: recordStatusLabel(document),
      completedAt: document.signed_at,
      closedUnfinished: recordClosedUnfinished(recordState(document)),
      v1Hash: document.v1_hash,
      v2Hash: document.v2_hash,
      v3Hash: document.v3_hash,
      finalHash: recordFinalHash(document),
      entries: auditLogs as AuditExportEntry[]
    };
    
    downloadAuditTrailJSON(exportData);
  };

  const handleDownload = async () => {
    if (!document) return;

    setIsDownloading(true);

    try {
      // A fully signed document has ONE canonical final PDF, rendered once
      // server-side at countersign time and stored — serve that instead of
      // re-burning a fresh (and no longer authoritative) copy client-side.
      // See docs/DOCUMENT-SIGNING.md §2.
      if (document.status === "signed" && document.final_pdf_hash) {
        const { data, error } = await supabase.functions.invoke("document-signing", {
          body: { documentId: document.id, action: "download" },
        });
        if (!error && data?.url) {
          window.open(data.url, "_blank", "noopener,noreferrer");
          return;
        }
        // Falls through to the legacy client-side render below if the
        // signed URL couldn't be minted, so a download is never a dead end.
      }

      // Check if this is an uploaded PDF with positioned signatures
      const isUploadedPdf = documentData?.uploadedFileUrl && documentData?.metadata?.hasPositionedSignatures;
      
      if (isUploadedPdf && documentData?.uploadedFileUrl) {
        // Download and burn signatures into uploaded PDF
        await handleDownloadSignedUploadedPdf();
        return;
      }
      
      // For AI-generated documents, use existing jsPDF logic
      await handleDownloadGeneratedPdf();
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Download Error", 
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadSignedUploadedPdf = async () => {
    if (!document || !documentData?.uploadedFileUrl) return;

    // The PDF this screen shows (after signing, the server's kept copy), never
    // the sender's folder again (the fourth security review).
    if (!shownPdf) throw new Error("The document is not open yet");
    const response = await fetch(shownPdf.src);
    if (!response.ok) throw new Error("Failed to fetch original PDF");
    const originalPdfBytes = await response.arrayBuffer();

    // Get signature positions from stored fields
    const signatureFields = documentData.signatureFields || [];
    
    // Find candidate signature field and data
    let candidateOverlay: SignatureOverlay | null = null;
    let employerOverlay: SignatureOverlay | null = null;

    const candidateField = signatureFields.find(f => f.type === 'candidate' && f.id?.includes('signature'));
    const employerField = signatureFields.find(f => f.type === 'employer' && f.id?.includes('signature'));

    // Parse candidate signature
    if (document.candidate_signature_data && candidateField) {
      try {
        const parsed = JSON.parse(document.candidate_signature_data);
        const sigDataUrl = parsed.signatures?.candidate_signature || parsed.signatures?.positioned_signature || parsed.signatures?.recipient;
        if (sigDataUrl) {
          candidateOverlay = {
            signatureDataUrl: sigDataUrl,
            x: candidateField.x || 10,
            y: candidateField.y || 80,
            width: candidateField.width || 25,
            height: candidateField.height || 8,
            page: candidateField.page || 1,
            signerName: parsed.signerName || document.applications?.profiles?.full_name || 'Candidate',
            signedAt: document.candidate_signed_at || '',
            ipAddress: parsed.ipAddress,
            signerRole: 'candidate',
          };
        }
      } catch (e) {
        console.error("Error parsing candidate signature:", e);
      }
    }

    // Parse employer signature
    if (document.employer_signature_data && employerField) {
      try {
        const parsed = JSON.parse(document.employer_signature_data);
        const sigDataUrl = parsed.signatures?.employer_signature || parsed.signatures?.positioned_signature || parsed.signatures?.employer;
        if (sigDataUrl) {
          employerOverlay = {
            signatureDataUrl: sigDataUrl,
            x: employerField.x || 55,
            y: employerField.y || 80,
            width: employerField.width || 25,
            height: employerField.height || 8,
            page: employerField.page || 1,
            signerName: parsed.signerName || 'Employer',
            signedAt: document.employer_signed_at || '',
            ipAddress: parsed.ipAddress,
            signerRole: 'employer',
          };
        }
      } catch (e) {
        console.error("Error parsing employer signature:", e);
      }
    }

    // Get names from audit logs
    const candidateSignEvent = auditLogs.find(log => log.action === 'candidate_signed');
    const employerSignEvent = auditLogs.find(log => log.action === 'employer_countersigned');

    // Prepare certificate data
    const certData: CertificateData = {
      documentId: document.id,
      documentCode: getDocumentCode(),
      documentName: document.name,
      documentType: document.document_type,
      completedAt: document.signed_at,
      candidateName: candidateSignEvent?.signer_name || document.applications?.profiles?.full_name || 'Candidate',
      candidateEmail: candidateSignEvent?.signer_email,
      candidateSignedAt: document.candidate_signed_at,
      candidateIp: candidateSignEvent?.ip_address || undefined,
      employerName: employerSignEvent?.signer_name || 'Employer',
      employerEmail: employerSignEvent?.signer_email,
      employerSignedAt: document.employer_signed_at,
      employerIp: employerSignEvent?.ip_address || undefined,
      v1Hash: document.v1_hash,
      v2Hash: document.v2_hash,
      v3Hash: document.v3_hash,
      auditEntriesCount: auditLogs.length,
    };

    // Burn signatures into PDF (without certificate - user can download that separately)
    const signedPdfBytes = await burnSignaturesIntoPdf(
      originalPdfBytes,
      candidateOverlay,
      employerOverlay,
      certData,
      false // Don't include certificate page in signed PDF download
    );

    // Download the signed PDF
    const blob = new Blob([new Uint8Array(signedPdfBytes).buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${document.name}_Signed.pdf`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Download Complete",
      description: "Signed PDF downloaded.",
    });
  };

  const handleDownloadGeneratedPdf = async () => {
    if (!document || !documentData?.content) return;

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
      `Completed: ${utcStamp(document.signed_at)}`,
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
    
    for (const line of lines) {
      if (yPosition > pageHeight - 80) {
        pdf.addPage();
        yPosition = margin;
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

    // Signature section
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
    yPosition += 15;

    // Add signature blocks
    const candidateSignEvent = auditLogs.find(log => log.action === 'candidate_signed');
    const employerSignEvent = auditLogs.find(log => log.action === 'employer_countersigned');

    if (candidateSignature) {
      pdf.setFontSize(10);
      pdf.text("Candidate:", margin, yPosition);
      try {
        if (isDrawnSignature(candidateSignature)) {
          pdf.addImage(candidateSignature, "PNG", margin, yPosition + 2, 50, 15);
        } else {
          pdf.setFont("times", "italic");
          pdf.setFontSize(16);
          pdf.text(candidateSignature, margin, yPosition + 12);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(10);
        }
      } catch {
        /* Signature image embedding is non-critical; PDF still generates without it */
      }
      yPosition += 25;
    }

    if (employerSignature) {
      pdf.setFontSize(10);
      pdf.text("Employer:", margin, yPosition);
      try {
        if (isDrawnSignature(employerSignature)) {
          pdf.addImage(employerSignature, "PNG", margin, yPosition + 2, 50, 15);
        } else {
          pdf.setFont("times", "italic");
          pdf.setFontSize(16);
          pdf.text(employerSignature, margin, yPosition + 12);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(10);
        }
      } catch {
        /* Signature image embedding is non-critical; PDF still generates without it */
      }
      yPosition += 25;
    }

    // Certificate footer
    pdf.setFontSize(8);
    pdf.setTextColor(100);
    pdf.text(`Document ID: ${getDocumentCode()} | Hash: ${document.v3_hash?.substring(0, 32) || 'N/A'}...`, margin, pageHeight - 10);

    pdf.save(`${document.name}.pdf`);
  };

  useEffect(() => {
    const sent = externalHref(documentData?.uploadedFileUrl);
    setShownPdf(null);
    setShownPdfFailed(false);
    if (!sent) return;
    let cancelled = false;
    let blobUrl: string | null = null;
    const signedByApplicant = !!document?.candidate_signed_at;
    (async () => {
      try {
        // After the applicant signs, the copy the server kept, which is what
        // was signed; the sender's own folder could hold another file by then
        // (the fourth security review).
        let address = sent;
        if (signedByApplicant && document) {
          const { data } = await supabase.functions.invoke("document-signing", { body: { documentId: document.id, action: "original" } });
          const kept = externalHref((data as { url?: string } | null)?.url);
          if (!kept) throw new Error("no signed copy");
          address = kept;
        }
        const response = await fetch(address);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        // A PDF only: a Word or text file cannot be shown or signed here.
        const head = new Uint8Array(bytes.slice(0, 5));
        if (String.fromCharCode(...head) !== "%PDF-") throw new Error("not a pdf");
        const hash = await generatePdfHash(bytes);
        if (cancelled) return;
        blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        setShownPdf({ src: blobUrl, hash });
      } catch {
        if (!cancelled) setShownPdfFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [documentData?.uploadedFileUrl, document?.id, document?.candidate_signed_at]);

  useEffect(() => {
    let cancelled = false;
    if (documentData?.uploadedFileUrl) {
      setViewedHash(shownPdf?.hash ?? null);
    } else if (typeof documentData?.content === "string") {
      void generateV1Hash(documentData.content).then((hash) => {
        if (!cancelled) setViewedHash(hash);
      });
    } else {
      setViewedHash(null);
    }
    return () => {
      cancelled = true;
    };
  }, [documentData, shownPdf]);

  const renderDocumentWithSignatures = () => {
    // Handle uploaded PDFs with positioned signatures
    // uploadedFileUrl comes from the document's own body, which the sender
    // wrote: only an http(s) address may become a frame (a javascript: frame
    // would run inside this page). src/lib/safeLink.ts.
    if (externalHref(documentData?.uploadedFileUrl)) {
      if (!shownPdf) {
        return (
          <span className="text-muted-foreground">
            {/* Said to whoever is looking (the fifth product review: the team
                was told to ask the hiring team). */}
            {shownPdfFailed
              ? role === "candidate"
                ? "This document could not be opened here. If it is not a PDF, ask the hiring team to send it as a PDF; otherwise close it and open it again."
                : "This document could not be opened here. Only a PDF can be signed: if it is another kind of file, send it again as a PDF; otherwise close it and open it again."
              : "Loading document..."}
          </span>
        );
      }
      return (
        <div className="space-y-4">
          <iframe 
            src={shownPdf.src} 
            className="w-full h-[500px] border border-border rounded-lg bg-background"
            title="Signed Document"
          />
          {/* A phone may not show a PDF in a frame: the same bytes open in their
              own tab, or, where the phone saves a PDF instead (Android), as a
              file with the document's own name (the fifth product review: an
              unnamed download). Elsewhere "download" would stop the tab opening. */}
          <p className="text-center text-sm">
            <a href={shownPdf.src} target="_blank" rel="noopener" download={/Android/i.test(navigator.userAgent) ? pdfFileName(document?.name) : undefined} className="font-medium underline underline-offset-2">
              Open the document
            </a>
          </p>
          <p className="text-sm text-muted-foreground text-center">
            {document?.status === "signed"
              ? "Signatures have been applied to this document. Download the signed PDF to view the final version."
              : canSignAsCandidate
                ? "Read it here, or open it in its own tab, before you sign."
                : "Read it here, or open it in its own tab."}
          </p>
        </div>
      );
    }

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
                  <SignatureMark value={candidateSignature} alt="Candidate signature" className="h-12 object-contain" style={{ filter: 'brightness(0) saturate(100%) invert(15%) sepia(70%) saturate(5000%) hue-rotate(220deg)' }} />
                </div>
              </div>
              <div className="w-40">
                <span className="text-foreground">Date: </span>
                <div className="mt-2 border-b-2 border-foreground/30 pb-1">
                  <span className="text-primary font-medium">
                    {utcDay(document?.candidate_signed_at)}
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
                  <SignatureMark value={employerSignature} alt="Employer signature" className="h-12 object-contain" style={{ filter: 'brightness(0) saturate(100%) invert(15%) sepia(70%) saturate(5000%) hue-rotate(220deg)' }} />
                </div>
              </div>
              <div className="w-40">
                <span className="text-foreground">Date: </span>
                <div className="mt-2 border-b-2 border-foreground/30 pb-1">
                  <span className="text-primary font-medium">
                    {utcDay(document?.employer_signed_at)}
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

  // The newest hash in the chain, shown unlabelled in the document view's
  // identity bar. It is not the final hash: that is recordFinalHash's, made
  // only at the countersign (the eighth product review: the audit trail
  // called the applicant's signature hash "Final Hash").
  const latestHash = document.v3_hash || document.v2_hash || document.document_hash;
  // A withdrawn/voided document is still status='pending' underneath (see
  // document-signing's withdraw/void actions) — is_voided must win over the
  // raw status, or this would keep reading as "Awaiting Signature".
  const displayStatusKey = document.is_voided
    ? document.candidate_signed_at
      ? "voided"
      : "withdrawn"
    : applicantDocumentState(document) === "expired"
      ? "expired"
      : document.status;
  const statusMeta = DOCUMENT_STATUS_META[displayStatusKey] ?? DOCUMENT_STATUS_META.pending;
  // The audit trail's own reading of the same state (src/lib/signingRecord.ts).
  const record = recordState(document);
  const recordSummaryKey = recordClosedUnfinished(record) ? record : "in-progress";
  const voidAuditLog = document.is_voided
    ? [...auditLogs].reverse().find((log) => log.action === "document_withdrawn" || log.action === "document_voided")
    : null;
  const voidedByName = voidAuditLog?.signer_name || "the employer";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* On a phone the letter gets the whole screen. It used to be a 390px
          window between a two-row header and a row of four squeezed buttons
          (seen in the offer-letter test run, 2026-10-09). */}
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col overflow-hidden p-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:border-0">
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
              <DialogHeader className="p-4 pb-3 pr-12 sm:p-6 sm:pb-4 border-b border-border shrink-0">
                <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start max-sm:gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`hidden sm:flex w-12 h-12 shrink-0 rounded-xl ${statusMeta.iconBoxClass} items-center justify-center`}>
                      <statusMeta.icon className={`h-6 w-6 ${statusMeta.iconClass}`} />
                    </div>
                    <div className="min-w-0 text-left">
                      <DialogTitle className="text-lg sm:text-xl text-left">{document.name}</DialogTitle>
                      <p className="hidden sm:block text-sm text-muted-foreground">
                        {document.document_type?.replace(/_/g, " ")}
                        {document.status === "signed" && document.signed_at
                          ? ` • Completed ${utcDay(document.signed_at)}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <Badge className={`${statusMeta.badgeClass} shrink-0 whitespace-nowrap px-3 py-1.5`}>
                    <statusMeta.icon className="h-4 w-4 mr-1.5" />
                    {statusMeta.badgeLabel}
                  </Badge>
                </div>
              </DialogHeader>

              {/* Document Identity Bar */}
              <div className="hidden sm:block px-6 py-3 bg-muted/50 border-b border-border">
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
                        {document.status === "signed" && document.signed_at
                          ? utcStamp(document.signed_at)
                          : statusMeta.badgeLabel}
                      </span>
                    </div>
                  </div>
                  {latestHash && (
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-xs text-muted-foreground">
                        {latestHash.substring(0, 16)}...
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Document Content */}
              <ScrollArea className="flex-1 min-h-0 p-3 sm:p-6">
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-lg overflow-hidden">
                  {/* Document Header */}
                  <div className="bg-gradient-to-r from-primary/10 to-accent/10 p-4 sm:p-6 border-b border-border">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Shield className={`h-6 w-6 ${statusMeta.iconClass}`} />
                        <div>
                          <p className="font-semibold text-foreground">{statusMeta.bannerTitle}</p>
                          <p className="text-xs text-muted-foreground">{statusMeta.bannerSubtitle}</p>
                          {/* Who declined and why, as the team's letter sheet says it
                              (the ninth product review: a declined PDF's reason was
                              shown nowhere but the bell). */}
                          {document.status === "declined" && document.decline_reason && (
                            <p className="mt-1 text-xs text-foreground" data-viewer-decline-reason>
                              Reason given: &ldquo;{document.decline_reason}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="hidden sm:block text-right text-xs text-muted-foreground">
                        <p>Document ID: {getDocumentCode()}</p>
                        <p>Status: {statusMeta.badgeLabel}</p>
                      </div>
                    </div>
                  </div>

                  {/* Document Body with Embedded Signatures */}
                  <div className="p-5 sm:p-8">
                    <div className="font-serif text-[15px] sm:text-sm leading-relaxed text-foreground">
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
                              {document.candidate_signed_at ? utcStamp(document.candidate_signed_at, false) : "Not signed"}
                            </p>
                          </div>
                        </div>
                        {candidateSignature ? (
                          <div className="h-16 bg-white dark:bg-zinc-800 rounded border border-border flex items-center justify-center overflow-hidden">
                            <SignatureMark value={candidateSignature} alt="Candidate signature" className="max-h-full max-w-full object-contain" />
                          </div>
                        ) : (
                          <div className="h-16 bg-muted/50 rounded border border-dashed border-border flex items-center justify-center">
                            <span className="text-xs text-muted-foreground">
                              {document.candidate_signed_at ? "Signature on file" : "Not yet signed"}
                            </span>
                          </div>
                        )}
                        {document.candidate_signed_at && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-success">
                            <CheckCircle className="h-3 w-3" />
                            <span>Verified</span>
                          </div>
                        )}
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
                              {document.employer_signed_at ? utcStamp(document.employer_signed_at, false) : "Not signed"}
                            </p>
                          </div>
                        </div>
                        {employerSignature ? (
                          <div className="h-16 bg-white dark:bg-zinc-800 rounded border border-border flex items-center justify-center overflow-hidden">
                            <SignatureMark value={employerSignature} alt="Employer signature" className="max-h-full max-w-full object-contain" />
                          </div>
                        ) : (
                          <div className="h-16 bg-muted/50 rounded border border-dashed border-border flex items-center justify-center">
                            <span className="text-xs text-muted-foreground">
                              {document.employer_signed_at ? "Signature on file" : "Not yet signed"}
                            </span>
                          </div>
                        )}
                        {document.employer_signed_at && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-success">
                            <CheckCircle className="h-3 w-3" />
                            <span>Verified</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Completion certificate — only a fully signed document has earned
                      this; a pending/declined one gets an honest status strip instead. */}
                  {document.status === "signed" ? (
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
                            Completed: {utcDay(document.signed_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={`border-t border-border p-4 ${statusMeta.stripBgClass}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <statusMeta.icon className={`h-5 w-5 ${statusMeta.iconClass}`} />
                          <div>
                            <p className={`text-sm font-medium ${statusMeta.iconClass}`}>{statusMeta.badgeLabel}</p>
                            <p className="text-xs text-muted-foreground">
                              {document.is_voided
                                ? document.candidate_signed_at
                                  ? `Voided by ${voidedByName}${document.voided_reason ? `: ${document.voided_reason}` : "."}`
                                  : `Withdrawn by ${voidedByName}${document.voided_reason ? `: ${document.voided_reason}` : "."}`
                                : document.status === "declined"
                                  ? "This document hasn't been completed, so there's no certificate to show."
                                  : displayStatusKey === "expired"
                                    ? "The date to sign has passed, so it can no longer be signed."
                                    : "A certificate is issued once every signature has been collected."}
                            </p>
                          </div>
                        </div>
                        <p className="text-right text-xs text-muted-foreground">
                          Document ID: {getDocumentCode()}
                        </p>
                      </div>
                    </div>
                  )}

                  {(canSignAsCandidate || canCountersignAsEmployer) && (
                    <div id="document-signing-place" data-signing-place>
                    <DocumentSigningPanel
                      documentId={document.id}
                      mode={canSignAsCandidate ? "sign" : "countersign"}
                      viewedHash={viewedHash}
                      onComplete={() => {
                        queryClient.invalidateQueries({ queryKey: ["documents"] });
                        onOpenChange(false);
                      }}
                    />
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Footer Actions */}
              {/* The copies to keep belong to a finished document. Until then,
                  on a phone, they would only squeeze the place to sign.
                  The bar itself shows only on a screen where it holds a button
                  (the sixth product review: an applicant saw an empty strip). */}
              {footerOn !== "none" && (
              <div className={`p-3 sm:p-4 border-t border-border bg-card shrink-0 ${footerOn === "phone" ? "sm:hidden" : ""}`} data-viewer-footer={footerOn}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* …and to the applicant only once it is finished, on any screen (the
                      fifth product review: before signing they saw Signed PDF,
                      Certificate, Audit PDF and the audit trail). */}
                  <div className={`flex-wrap items-center gap-2 [&>button]:whitespace-nowrap ${document.status === "signed" ? "flex" : role === "candidate" ? "hidden" : "hidden sm:flex"}`}>
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
                  {auditTrailOffered && (
                    <Button onClick={() => setShowAuditTrail(true)} variant={document.status === "signed" ? "default" : "outline"} size="sm" className="gap-2 whitespace-nowrap">
                      <History className="h-4 w-4" />
                      View Audit Trail
                    </Button>
                  )}
                  {/* The place to sign is at the end of the letter. On a phone
                      that is a long way down: one press takes them there. */}
                  {(canSignAsCandidate || canCountersignAsEmployer) && (
                    <Button
                      size="sm"
                      className="gap-2 whitespace-nowrap sm:hidden"
                      data-go-to-sign
                      onClick={() => window.document.getElementById("document-signing-place")?.scrollIntoView({ block: "start" })}
                    >
                      {canSignAsCandidate ? "Sign" : "Countersign"}
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              )}
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
              {/* Audit Trail Header. On a phone it keeps clear of the dialog's
                  close button and its 44px tap area (right-3: 12 + 44 = 56px,
                  pr-14), as the document's own header does: the eighth product
                  review found the X over "Back to Document", where a tap
                  closed the whole viewer. */}
              <DialogHeader className="p-4 pb-3 pr-14 sm:p-6 sm:pb-4 sm:pr-12 border-b border-border shrink-0" data-audit-header>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="hidden sm:flex w-12 h-12 shrink-0 rounded-xl bg-primary/20 items-center justify-center">
                      <History className="h-6 w-6 text-primary" />
                    </div>
                    <div className="min-w-0 text-left">
                      <DialogTitle className="text-lg sm:text-xl text-left">Audit Trail</DialogTitle>
                      <p className="text-sm text-muted-foreground">
                        Complete history of document activity
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" className="shrink-0" onClick={() => setShowAuditTrail(false)}>
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
                ) : recordClosedUnfinished(record) ? (
                  <Badge className={`${statusMeta.badgeClass} font-medium`}>
                    <statusMeta.icon className="h-3 w-3 mr-1.5" />
                    {statusMeta.badgeLabel}
                  </Badge>
                ) : (
                  <Badge className="bg-primary/20 text-primary font-medium">
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
                    {/* A voided document is still stored as pending; an applicant
                        who signed opens this screen too, before the countersign
                        and after a void (the seventh product review: it said
                        "Pending Signatures" under a red "Voided"). Withdrawn
                        before they signed reads "Withdrawn", as the badge above
                        does (the eighth product review). */}
                    <Badge variant={record === 'voided' || record === 'declined' ? 'destructive' : record === 'withdrawn' || record === 'expired' ? 'secondary' : 'default'} className="mt-0.5" data-audit-status>
                      {recordStatusLabel(document)}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Final Hash (SHA-256)</p>
                    {/* Only a finished, unvoided document has a final hash (made at
                        the countersign); never the applicant's signature hash
                        (the eighth product review). */}
                    <p className="font-mono text-xs truncate" data-audit-final-hash>{recordFinalHashCell(document)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="font-medium">
                      {document.signed_at ? utcStamp(document.signed_at) : recordClosedUnfinished(record) ? "Not completed" : "Pending"}
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
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${getAuditActionColor(log.action)} text-white`}>
                          {getActionIcon(log.action)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-medium text-foreground">
                                {formatAuditActionLabel(log.action)}
                              </p>
                              {log.signer_name && (
                                <p className="text-sm text-muted-foreground">
                                  {log.signer_name} ({formatSignerRole(log.signer_role)})
                                </p>
                              )}
                              {/* Human-readable event description - NO raw JSON */}
                              <p className="mt-1 text-sm text-muted-foreground">
                                {formatAuditEventDescription(log.action, log.details as Record<string, unknown> | null, log.signer_role, log.signature_method)}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-medium text-muted-foreground">
                                {utcDay(log.created_at)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {utcTime(log.created_at)}
                              </p>
                            </div>
                          </div>
                          
                          <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                              {/* The IP, place and device: the team sees everyone's; an
                                  applicant sees only their own (document_audit_log
                                  leaves the team's out, 2026-10-11). */}
                              {(role !== "candidate" || log.user_id === user?.id) && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Globe className="h-3 w-3" />
                                  <span>
                                    {log.ip_address && log.ip_address !== 'unknown'
                                      ? `IP: ${log.ip_address}`
                                      : 'IP unavailable at time of signing'}
                                  </span>
                                </div>
                              )}
                              {[log.location_city, log.location_region, log.location_country].some((part) => part && part !== 'Unknown') && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <MapPin className="h-3 w-3" />
                                  <span>{[log.location_city, log.location_region, log.location_country].filter((part) => part && part !== 'Unknown').join(", ")}</span>
                                </div>
                              )}
                              {(() => {
                                const device = (log.details as { device?: { deviceType?: string; platform?: string; screen?: string; timeZone?: string; languages?: string[]; deviceId?: string } } | null)?.device;
                                if (!device) return null;
                                const line = [device.deviceType, device.platform, device.screen, device.timeZone, device.languages?.[0]].filter(Boolean).join(" · ");
                                return line ? (
                                  <div className="flex items-center gap-2 text-muted-foreground col-span-2" data-audit-device>
                                    <Monitor className="h-3 w-3 shrink-0" />
                                    <span>
                                      {line}
                                      {device.deviceId ? ` · device ${device.deviceId.slice(0, 8)}` : ""}
                                    </span>
                                  </div>
                                ) : null;
                              })()}
                              {/* VPN/Proxy Warning - Informational Only */}
                              {(log.details as Record<string, unknown>)?.connectionWarning && (
                                <div className="flex items-center gap-2 text-[var(--warning)] col-span-2">
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
                                <span>{utcStamp(log.created_at)}</span>
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

                {/* Summary Card. "Verified" only for a finished document: the
                    final hash is made when both sides have signed (the seventh
                    product review: it said the finalized document was intact
                    on one still waiting for the countersign, and on a voided one). */}
                {document.status === 'signed' && !document.is_voided ? (
                  <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-success/10 to-primary/10 border border-success/20" data-audit-summary="verified">
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
                ) : (
                  <div className="mt-6 p-4 rounded-xl bg-muted/50 border border-border" data-audit-summary={recordSummaryKey}>
                    <div className="flex items-center gap-3">
                      <Shield className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="font-semibold text-foreground">{RECORD_SUMMARY[recordSummaryKey].title}</p>
                        <p className="text-sm text-muted-foreground">{RECORD_SUMMARY[recordSummaryKey].text}</p>
                      </div>
                    </div>
                  </div>
                )}
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
