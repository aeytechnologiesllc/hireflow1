import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { 
  FileText, 
  Download, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2,
  PenTool,
  History,
  Eye,
  Trash2,
  Undo2
} from "lucide-react";
import { format } from "date-fns";
import type { DocumentWithApplication } from "@/hooks/useDocuments";

interface SignatureField {
  id: string;
  label: string;
  required: boolean;
}

interface DocumentData {
  content: string;
  signatureFields: SignatureField[];
  metadata?: Record<string, any>;
}

interface AuditLog {
  id: string;
  action: string;
  details: unknown;
  created_at: string;
  user_id: string | null;
}

interface DocumentSigningDialogProps {
  document: DocumentWithApplication | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusConfig = {
  pending: { color: "bg-yellow-500/20 text-yellow-500", icon: Clock, label: "Pending Signature" },
  signed: { color: "bg-success/20 text-success", icon: CheckCircle, label: "Signed" },
  declined: { color: "bg-destructive/20 text-destructive", icon: XCircle, label: "Declined" },
};

export function DocumentSigningDialog({ document, open, onOpenChange }: DocumentSigningDialogProps) {
  const [isSigning, setIsSigning] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [documentData, setDocumentData] = useState<DocumentData | null>(null);
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("document");
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentField, setCurrentField] = useState<string | null>(null);
  const { toast } = useToast();
  const { role, user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (document && open) {
      fetchAuditLogs();
      parseDocumentData();
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
        setDocumentData({
          content: atob(base64Content),
          signatureFields: [
            { id: "recipient", label: "Recipient Signature", required: true },
          ],
        });
      }
    } catch (error) {
      console.error("Error parsing document:", error);
      setDocumentData({
        content: "Unable to parse document content",
        signatureFields: [],
      });
    }
  };

  const recordDocumentView = async () => {
    if (!document || !user) return;
    
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

  const initCanvas = (fieldId: string, canvas: HTMLCanvasElement | null) => {
    canvasRefs.current[fieldId] = canvas;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    }
  };

  const startDrawing = (fieldId: string, e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRefs.current[fieldId];
    if (!canvas) return;
    
    setIsDrawing(true);
    setCurrentField(fieldId);
    
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const rect = canvas.getBoundingClientRect();
      ctx.beginPath();
      ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentField) return;
    
    const canvas = canvasRefs.current[currentField];
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const rect = canvas.getBoundingClientRect();
      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    if (isDrawing && currentField) {
      const canvas = canvasRefs.current[currentField];
      if (canvas) {
        setSignatures(prev => ({
          ...prev,
          [currentField]: canvas.toDataURL(),
        }));
      }
    }
    setIsDrawing(false);
    setCurrentField(null);
  };

  const clearSignature = (fieldId: string) => {
    const canvas = canvasRefs.current[fieldId];
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    setSignatures(prev => {
      const updated = { ...prev };
      delete updated[fieldId];
      return updated;
    });
  };

  const allRequiredSigned = () => {
    if (!documentData?.signatureFields) return false;
    return documentData.signatureFields
      .filter(f => f.required)
      .every(f => signatures[f.id]);
  };

  const handleSign = async () => {
    if (!document || !user || !allRequiredSigned()) {
      toast({
        title: "Signatures Required",
        description: "Please complete all required signature fields.",
        variant: "destructive",
      });
      return;
    }
    
    setIsSigning(true);
    try {
      const signatureData = JSON.stringify({
        signatures,
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

      await supabase.from("document_audit_logs").insert({
        document_id: document.id,
        user_id: user.id,
        action: "signed",
        details: { 
          method: "electronic_signature",
          fieldsCompleted: Object.keys(signatures).length,
        },
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

  const handleDownload = () => {
    if (!document || !documentData) return;
    
    const blob = new Blob([documentData.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${document.name}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!document) return null;

  const status = statusConfig[document.status as keyof typeof statusConfig];
  const StatusIcon = status?.icon || Clock;
  const canSign = role === "candidate" && document.status === "pending";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle>{document.name}</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {document.document_type?.replace(/_/g, " ")} • Created {format(new Date(document.created_at), "MMM d, yyyy")}
                </p>
              </div>
            </div>
            <Badge className={status?.color}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {status?.label}
            </Badge>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="px-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="document" className="gap-2">
                <Eye className="h-4 w-4" />
                Document
              </TabsTrigger>
              <TabsTrigger value="sign" className="gap-2" disabled={!canSign}>
                <PenTool className="h-4 w-4" />
                Sign
              </TabsTrigger>
              <TabsTrigger value="audit" className="gap-2">
                <History className="h-4 w-4" />
                Audit Trail
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden p-6 pt-4">
            {/* Document View */}
            <TabsContent value="document" className="h-full m-0">
              <ScrollArea className="h-[calc(70vh-120px)]">
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-border p-8 min-h-full shadow-inner">
                  <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-foreground">
                    {documentData?.content || "Loading document..."}
                  </pre>
                </div>
              </ScrollArea>
              
              <div className="flex gap-3 mt-4">
                <Button variant="outline" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                {canSign && (
                  <Button onClick={() => setActiveTab("sign")}>
                    <PenTool className="h-4 w-4 mr-2" />
                    Proceed to Sign
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* Signing View */}
            <TabsContent value="sign" className="h-full m-0">
              {showDeclineForm ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4 p-6 bg-destructive/5 rounded-xl border border-destructive/20"
                >
                  <h3 className="font-semibold text-destructive">Decline Document</h3>
                  <div className="space-y-2">
                    <Label>Reason for Declining</Label>
                    <Textarea
                      value={declineReason}
                      onChange={(e) => setDeclineReason(e.target.value)}
                      placeholder="Please explain why you're declining this document..."
                      className="min-h-[120px]"
                    />
                  </div>
                  <div className="flex gap-3">
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
                </motion.div>
              ) : (
                <div className="space-y-6">
                  <div className="text-center p-4 bg-primary/5 rounded-xl border border-primary/20">
                    <PenTool className="h-8 w-8 text-primary mx-auto mb-2" />
                    <h3 className="font-semibold">Sign Your Document</h3>
                    <p className="text-sm text-muted-foreground">
                      Draw your signature in each field below to complete the signing process.
                    </p>
                  </div>

                  <ScrollArea className="h-[calc(50vh-120px)]">
                    <div className="space-y-6">
                      {documentData?.signatureFields.map((field) => (
                        <div key={field.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-2">
                              {field.label}
                              {field.required && (
                                <span className="text-destructive">*</span>
                              )}
                            </Label>
                            {signatures[field.id] && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => clearSignature(field.id)}
                              >
                                <Undo2 className="h-4 w-4 mr-1" />
                                Clear
                              </Button>
                            )}
                          </div>
                          <div className="relative">
                            <canvas
                              ref={(el) => initCanvas(field.id, el)}
                              width={500}
                              height={100}
                              className={`w-full border-2 rounded-lg cursor-crosshair bg-white ${
                                signatures[field.id] 
                                  ? "border-success" 
                                  : "border-dashed border-border hover:border-primary"
                              }`}
                              onMouseDown={(e) => startDrawing(field.id, e)}
                              onMouseMove={draw}
                              onMouseUp={stopDrawing}
                              onMouseLeave={stopDrawing}
                            />
                            {!signatures[field.id] && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <p className="text-muted-foreground text-sm">
                                  Draw your signature here
                                </p>
                              </div>
                            )}
                            {signatures[field.id] && (
                              <div className="absolute top-2 right-2">
                                <CheckCircle className="h-5 w-5 text-success" />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <Button
                      variant="outline"
                      onClick={() => setShowDeclineForm(true)}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Decline to Sign
                    </Button>
                    <Button
                      onClick={handleSign}
                      disabled={!allRequiredSigned() || isSigning}
                      className="min-w-[150px]"
                    >
                      {isSigning ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      Complete Signing
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Audit Trail */}
            <TabsContent value="audit" className="h-full m-0">
              <ScrollArea className="h-[calc(70vh-120px)]">
                <div className="space-y-3">
                  {auditLogs.length > 0 ? (
                    auditLogs.map((log, index) => (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex gap-4 p-4 rounded-xl bg-secondary/30 border border-border"
                      >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          log.action === "signed" ? "bg-success/20" :
                          log.action === "declined" ? "bg-destructive/20" :
                          log.action === "viewed" ? "bg-blue-500/20" :
                          "bg-primary/20"
                        }`}>
                          {log.action === "signed" ? (
                            <CheckCircle className="h-5 w-5 text-success" />
                          ) : log.action === "declined" ? (
                            <XCircle className="h-5 w-5 text-destructive" />
                          ) : log.action === "viewed" ? (
                            <Eye className="h-5 w-5 text-blue-500" />
                          ) : (
                            <FileText className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="font-medium capitalize">{log.action}</p>
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(log.created_at), "MMM d, yyyy 'at' h:mm a")}
                            </span>
                          </div>
                          {log.details && typeof log.details === "object" && Object.keys(log.details as object).length > 0 && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {JSON.stringify(log.details)}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="text-center p-8 text-muted-foreground">
                      <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No audit logs available yet.</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
