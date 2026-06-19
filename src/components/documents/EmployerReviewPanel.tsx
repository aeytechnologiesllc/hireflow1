import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { 
  UserCheck, 
  Eye, 
  MapPin, 
  Clock, 
  Hash, 
  Shield,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import { fetchAuditTrail, type AuditLogEntry } from "@/lib/auditTrail";

interface EmployerReviewPanelProps {
  documentId: string;
  documentContent: string | null;
  candidateSignatureData: string | null;
  candidateSignedAt: string | null;
  onReviewConfirmed: (confirmed: boolean) => void;
  reviewConfirmed: boolean;
}

export function EmployerReviewPanel({
  documentId,
  documentContent,
  candidateSignatureData,
  candidateSignedAt,
  onReviewConfirmed,
  reviewConfirmed
}: EmployerReviewPanelProps) {
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAuditTrail();
  }, [documentId]);

  const loadAuditTrail = async () => {
    setIsLoading(true);
    const logs = await fetchAuditTrail(documentId);
    // Filter to show only events up to and including candidate signature
    const relevantLogs = logs.filter(log => {
      const relevantActions = [
        'document_created', 'created',
        'document_viewed', 'viewed',
        'signing_session_started',
        'electronic_consent_confirmed',
        'candidate_signed'
      ];
      return relevantActions.includes(log.action);
    });
    setAuditLogs(relevantLogs);
    setIsLoading(false);
  };

  // Parse candidate signature for display
  const parsedSignature = candidateSignatureData ? (() => {
    try {
      const parsed = JSON.parse(candidateSignatureData);
      return {
        signatureImage: parsed.signatures?.positioned_signature || 
                       parsed.signatures?.recipient || 
                       parsed.signatures?.candidate_signature ||
                       null,
        signedAt: parsed.signedAt,
        userAgent: parsed.userAgent
      };
    } catch {
      return null;
    }
  })() : null;

  // Get candidate signed entry for metadata
  const candidateSignedEntry = auditLogs.find(log => log.action === 'candidate_signed');

  const getActionLabel = (action: string): string => {
    const labels: Record<string, string> = {
      'document_created': 'Document Created',
      'created': 'Document Created',
      'document_viewed': 'Document Viewed',
      'viewed': 'Document Viewed',
      'signing_session_started': 'Signing Session Started',
      'electronic_consent_confirmed': 'Electronic Consent Confirmed',
      'candidate_signed': 'Candidate Signed'
    };
    return labels[action] || action.replace(/_/g, ' ');
  };

  const getActionIcon = (action: string) => {
    if (action === 'candidate_signed') return CheckCircle;
    if (action.includes('consent')) return Shield;
    if (action.includes('viewed')) return Eye;
    if (action.includes('session')) return Clock;
    return Hash;
  };

  return (
    <div className="space-y-6">
      {/* Review Header */}
      <div className="p-4 bg-warning/10 border border-warning/20 rounded-xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-warning" />
          </div>
          <div>
            <h3 className="font-semibold text-warning">Review Required Before Countersigning</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Please review the document and candidate's signature below before applying your countersignature.
            </p>
          </div>
        </div>
      </div>

      {/* Candidate Signature Preview */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="p-4 bg-success/5 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
            <UserCheck className="h-4 w-4 text-success" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-success">Candidate Has Signed</p>
            <p className="text-xs text-muted-foreground">
              {candidateSignedAt && format(new Date(candidateSignedAt), "MMMM d, yyyy 'at' h:mm a")} (UTC)
            </p>
          </div>
          <Badge variant="outline" className="bg-success/10 text-success border-success/30">
            Verified
          </Badge>
        </div>
        
        {parsedSignature?.signatureImage && (
          <div className="p-6 bg-card">
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Candidate Signature</p>
            <div className="border-b-2 border-dashed border-muted pb-2">
              <img 
                src={parsedSignature.signatureImage} 
                alt="Candidate Signature" 
                className="max-h-16 object-contain"
              />
            </div>
            {candidateSignedEntry && (
              <p className="text-xs text-muted-foreground mt-2">
                Signed by: {candidateSignedEntry.signer_name} ({candidateSignedEntry.signer_email})
              </p>
            )}
          </div>
        )}
      </div>

      {/* Partial Audit Trail */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="p-4 bg-secondary/50 border-b border-border">
          <h4 className="font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Audit Trail (Up to Candidate Signature)
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            All events are recorded with UTC timestamps and tamper-evident hashes
          </p>
        </div>
        
        <ScrollArea className="max-h-[300px]">
          <div className="p-4 space-y-3">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading audit trail...
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No audit entries found
              </div>
            ) : (
              auditLogs.map((log, index) => {
                const ActionIcon = getActionIcon(log.action);
                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`p-3 rounded-lg border ${
                      log.action === 'candidate_signed' 
                        ? 'bg-success/5 border-success/20' 
                        : 'bg-secondary/30 border-border'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        log.action === 'candidate_signed' ? 'bg-success/20' : 'bg-primary/10'
                      }`}>
                        <ActionIcon className={`h-4 w-4 ${
                          log.action === 'candidate_signed' ? 'text-success' : 'text-primary'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm">{getActionLabel(log.action)}</p>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {log.created_at && format(new Date(log.created_at), "h:mm a")}
                          </span>
                        </div>
                        
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          {log.signer_name && (
                            <div className="flex items-center gap-1">
                              <UserCheck className="h-3 w-3" />
                              <span>{log.signer_name} ({log.signer_email})</span>
                            </div>
                          )}
                          {log.ip_address && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              <span>
                                {log.ip_address}
                                {log.location_city && ` • ${log.location_city}, ${log.location_country}`}
                              </span>
                            </div>
                          )}
                          {(log.document_hash || log.post_signature_hash) && (
                            <div className="flex items-center gap-1">
                              <Hash className="h-3 w-3" />
                              <span className="font-mono truncate">
                                {(log.post_signature_hash || log.document_hash || '').substring(0, 32)}...
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      <Separator />

      {/* Review Confirmation Checkbox */}
      <div className="p-4 border border-primary/20 bg-primary/5 rounded-xl">
        <div className="flex items-start gap-3">
          <Checkbox
            id="review-confirmation"
            checked={reviewConfirmed}
            onCheckedChange={(checked) => onReviewConfirmed(checked as boolean)}
            className="mt-0.5"
          />
          <Label htmlFor="review-confirmation" className="cursor-pointer leading-relaxed">
            <span className="font-medium">I confirm that I have reviewed the document and the candidate's signature.</span>
            <span className="block text-sm text-muted-foreground mt-1">
              By checking this box, you acknowledge that you have reviewed all document content and verified the candidate's electronic signature before applying your countersignature.
            </span>
          </Label>
        </div>
      </div>
    </div>
  );
}
