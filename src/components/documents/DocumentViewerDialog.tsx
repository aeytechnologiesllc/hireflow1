import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { 
  FileText, 
  Download, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2,
  PenTool,
  History
} from "lucide-react";
import { format } from "date-fns";
import type { DocumentWithApplication } from "@/hooks/useDocuments";

interface AuditLog {
  id: string;
  action: string;
  details: unknown;
  created_at: string;
  user_id: string | null;
}

interface DocumentViewerDialogProps {
  document: DocumentWithApplication | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusConfig = {
  pending: { color: "bg-warning/20 text-warning", icon: Clock, label: "Pending Signature" },
  signed: { color: "bg-success/20 text-success", icon: CheckCircle, label: "Signed" },
  declined: { color: "bg-destructive/20 text-destructive", icon: XCircle, label: "Declined" },
};

export function DocumentViewerDialog({ document, open, onOpenChange }: DocumentViewerDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [documentContent, setDocumentContent] = useState<string>("");
  const { toast } = useToast();
  const { role, user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (document && open) {
      fetchAuditLogs();
      parseDocumentContent();
      recordDocumentView();
    }
  }, [document, open]);

  const fetchAuditLogs = async () => {
    if (!document) return;
    
    const { data, error } = await supabase
      .from("document_audit_logs")
      .select("*")
      .eq("document_id", document.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setAuditLogs(data);
    }
  };

  const parseDocumentContent = () => {
    if (!document?.file_url) return;
    
    // Handle base64 encoded content
    if (document.file_url.startsWith("data:text/plain;base64,")) {
      try {
        const base64Content = document.file_url.split(",")[1];
        setDocumentContent(atob(base64Content));
      } catch {
        setDocumentContent("Unable to decode document content");
      }
    } else {
      setDocumentContent("");
    }
  };

  const recordDocumentView = async () => {
    if (!document || !user) return;
    
    // Check if already viewed
    if (!document.viewed_at) {
      await supabase
        .from("documents")
        .update({ viewed_at: new Date().toISOString() })
        .eq("id", document.id);

      await supabase.from("document_audit_logs").insert({
        document_id: document.id,
        user_id: user.id,
        action: "viewed",
        user_agent: navigator.userAgent,
      });
    }
  };

  const handleSign = async () => {
    if (!document || !user) return;
    
    setIsSigning(true);
    try {
      // Create a simple signature (in production, you'd use a proper e-signature solution)
      const signatureData = JSON.stringify({
        signedBy: user.id,
        signedAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
      });

      const { error } = await supabase
        .from("documents")
        .update({
          status: "signed",
          signed_at: new Date().toISOString(),
          signature_data: signatureData,
          user_agent: navigator.userAgent,
        })
        .eq("id", document.id);

      if (error) throw error;

      // Add audit log
      await supabase.from("document_audit_logs").insert({
        document_id: document.id,
        user_id: user.id,
        action: "signed",
        details: { method: "electronic" },
        user_agent: navigator.userAgent,
      });

      toast({
        title: "Document Signed",
        description: "You have successfully signed this document.",
      });

      queryClient.invalidateQueries({ queryKey: ["documents"] });
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error signing document:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to sign document.",
        variant: "destructive",
      });
    } finally {
      setIsSigning(false);
    }
  };

  const handleDecline = async () => {
    if (!document || !user || !declineReason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for declining.",
        variant: "destructive",
      });
      return;
    }
    
    setIsDeclining(true);
    try {
      const { error } = await supabase
        .from("documents")
        .update({
          status: "declined",
          declined_at: new Date().toISOString(),
          decline_reason: declineReason,
        })
        .eq("id", document.id);

      if (error) throw error;

      // Add audit log
      await supabase.from("document_audit_logs").insert({
        document_id: document.id,
        user_id: user.id,
        action: "declined",
        details: { reason: declineReason },
        user_agent: navigator.userAgent,
      });

      toast({
        title: "Document Declined",
        description: "You have declined to sign this document.",
      });

      queryClient.invalidateQueries({ queryKey: ["documents"] });
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error declining document:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to decline document.",
        variant: "destructive",
      });
    } finally {
      setIsDeclining(false);
    }
  };

  const handleDownload = async () => {
    if (!document) return;
    
    if (documentContent) {
      const blob = new Blob([documentContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `${document.name}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (document.file_url) {
      try {
        const response = await fetch(document.file_url);
        if (!response.ok) throw new Error("Failed to fetch document");
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = window.document.createElement("a");
        a.href = url;
        a.download = `${document.name}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Download error:", error);
        window.open(document.file_url, "_blank");
      }
    }
  };

  if (!document) return null;

  const status = statusConfig[document.status as keyof typeof statusConfig];
  const StatusIcon = status?.icon || Clock;
  const canSign = role === "candidate" && document.status === "pending";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {document.name}
            </DialogTitle>
            <Badge className={status?.color}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {status?.label}
            </Badge>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Document Content */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-secondary/30 rounded-lg p-6 min-h-[400px] font-mono text-sm whitespace-pre-wrap border border-border">
              {documentContent || (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <FileText className="h-12 w-12 mb-4 opacity-50" />
                  <p>Document preview not available</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={handleDownload}>
                    <Download className="h-4 w-4 mr-2" />
                    Download to View
                  </Button>
                </div>
              )}
            </div>

            {/* Signature Actions */}
            {canSign && !showDeclineForm && (
              <div className="flex gap-3">
                <Button className="flex-1" onClick={handleSign} disabled={isSigning}>
                  {isSigning ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <PenTool className="h-4 w-4 mr-2" />
                  )}
                  Sign Document
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowDeclineForm(true)}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Decline
                </Button>
              </div>
            )}

            {showDeclineForm && (
              <div className="space-y-3 p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                <Label>Reason for Declining</Label>
                <Textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Please explain why you're declining this document..."
                  className="min-h-[100px]"
                />
                <div className="flex gap-2">
                  <Button 
                    variant="destructive" 
                    onClick={handleDecline}
                    disabled={isDeclining}
                  >
                    {isDeclining ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-2" />
                    )}
                    Confirm Decline
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setShowDeclineForm(false);
                      setDeclineReason("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {!canSign && document.status !== "pending" && (
              <Button variant="outline" className="w-full" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download Document
              </Button>
            )}
          </div>

          {/* Document Details & Audit Trail */}
          <div className="space-y-6">
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Document Details
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="capitalize">{document.document_type?.replace(/_/g, " ") || "Document"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created:</span>
                  <span>{format(new Date(document.created_at), "MMM d, yyyy")}</span>
                </div>
                {document.signed_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Signed:</span>
                    <span>{format(new Date(document.signed_at), "MMM d, yyyy h:mm a")}</span>
                  </div>
                )}
                {document.applications?.jobs && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Position:</span>
                    <span>{document.applications.jobs.title}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <History className="h-4 w-4" />
                Audit Trail
              </h4>
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {auditLogs.length > 0 ? (
                  auditLogs.map((log) => (
                    <div key={log.id} className="text-sm p-2 bg-secondary/30 rounded border border-border">
                      <div className="flex justify-between items-start">
                        <span className="font-medium capitalize">{log.action}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), "MMM d, h:mm a")}
                        </span>
                      </div>
                      {log.details && typeof log.details === "object" && Object.keys(log.details as object).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {JSON.stringify(log.details)}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No audit logs available.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
