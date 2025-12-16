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
  Undo2,
  Edit,
  Save,
  UserCheck,
  Building2
} from "lucide-react";
import { format } from "date-fns";
import type { DocumentWithApplication } from "@/hooks/useDocuments";
import { PdfSignaturePlacer, type SignatureFieldWithPosition } from "./PdfSignaturePlacer";

interface SignatureField {
  id: string;
  label: string;
  required: boolean;
}

interface DocumentData {
  content: string | null;
  signatureFields: SignatureField[] | SignatureFieldWithPosition[];
  metadata?: Record<string, any>;
  uploadedFileUrl?: string;
  uploadedFileName?: string;
  uploadedFileType?: string;
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
  signed: { color: "bg-success/20 text-success", icon: CheckCircle, label: "Fully Signed" },
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
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentField, setCurrentField] = useState<string | null>(null);
  const { toast } = useToast();
  const { role, user } = useAuth();
  const queryClient = useQueryClient();

  // Determine signing state
  const candidateSigned = !!document?.candidate_signed_at;
  const employerSigned = !!document?.employer_signed_at;
  const isFullySigned = candidateSigned && employerSigned;

  useEffect(() => {
    if (document && open) {
      fetchAuditLogs();
      parseDocumentData();
      recordDocumentView();
      setIsEditing(false);
      setShowDeclineForm(false);
      setDeclineReason("");
      setSignatures({});
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
        setEditedContent(parsed.content || "");
      } else if (document.file_url.startsWith("data:text/plain;base64,")) {
        const base64Content = document.file_url.split(",")[1];
        const content = atob(base64Content);
        setDocumentData({
          content,
          signatureFields: [
            { id: "recipient", label: "Candidate Signature", required: true },
            { id: "employer", label: "Employer Signature", required: true },
          ],
        });
        setEditedContent(content);
      }
    } catch (error) {
      console.error("Error parsing document:", error);
      setDocumentData({
        content: "Unable to parse document content",
        signatureFields: [],
      });
    }
  };

  const isUploadedDocument = documentData?.uploadedFileUrl && !documentData?.content;
  const hasPositionedSignatures = documentData?.metadata?.hasPositionedSignatures === true;
  
  // Check if signature fields have position data
  const isPositionedField = (field: SignatureField | SignatureFieldWithPosition): field is SignatureFieldWithPosition => {
    return 'x' in field && 'y' in field && 'type' in field;
  };
  
  const positionedSignatureFields = hasPositionedSignatures && documentData?.signatureFields
    ? (documentData.signatureFields as SignatureFieldWithPosition[])
    : [];

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

  // Get fields that the current user needs to sign
  const getSignableFields = () => {
    if (!documentData?.signatureFields) return [];
    
    if (role === "candidate") {
      // Candidate signs recipient field
      return documentData.signatureFields.filter(f => f.id === "recipient");
    } else if (role === "employer") {
      // Employer signs employer field, but only after candidate has signed
      if (!candidateSigned) return [];
      return documentData.signatureFields.filter(f => f.id === "employer");
    }
    return [];
  };

  const signableFields = getSignableFields();
  const canSign = signableFields.length > 0 && document?.status === "pending";

  const allRequiredSigned = () => {
    return signableFields
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

      const updates: Record<string, any> = {
        user_agent: navigator.userAgent,
      };

      if (role === "candidate") {
        updates.candidate_signature_data = signatureData;
        updates.candidate_signed_at = new Date().toISOString();
      } else if (role === "employer") {
        updates.employer_signature_data = signatureData;
        updates.employer_signed_at = new Date().toISOString();
        // Both parties have signed - mark as fully signed
        updates.status = "signed";
        updates.signed_at = new Date().toISOString();
        updates.signature_data = signatureData;
      }

      const { error } = await supabase
        .from("documents")
        .update(updates)
        .eq("id", document.id);

      if (error) throw error;

      await supabase.from("document_audit_logs").insert({
        document_id: document.id,
        user_id: user.id,
        action: role === "candidate" ? "candidate_signed" : "employer_countersigned",
        details: { 
          method: "electronic_signature",
          fieldsCompleted: Object.keys(signatures).length,
          role,
        },
        user_agent: navigator.userAgent,
      });

      // Notify the other party
      if (role === "candidate" && document.sender_id) {
        await supabase.from("notifications").insert({
          user_id: document.sender_id,
          title: "Document Signed by Candidate",
          message: `${document.name} has been signed by the candidate. You can now countersign.`,
          type: "system" as const,
          link: "/documents",
        });
      }

      toast({
        title: role === "candidate" ? "Document Signed" : "Document Countersigned",
        description: role === "candidate" 
          ? "You have signed this document. Waiting for employer countersignature."
          : "Document has been fully signed by both parties.",
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
        details: { reason: declineReason, role },
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

  const handleSaveEdit = async () => {
    if (!document || !documentData) return;
    
    setIsSavingEdit(true);
    try {
      const updatedDocumentData = {
        ...documentData,
        content: editedContent,
      };

      const { error } = await supabase
        .from("documents")
        .update({
          file_url: `data:application/json;base64,${btoa(JSON.stringify(updatedDocumentData))}`,
        })
        .eq("id", document.id);

      if (error) throw error;

      await supabase.from("document_audit_logs").insert({
        document_id: document.id,
        user_id: user?.id,
        action: "edited",
        details: { editedBy: role },
        user_agent: navigator.userAgent,
      });

      setDocumentData(updatedDocumentData);
      setIsEditing(false);
      
      toast({
        title: "Document Updated",
        description: "Your changes have been saved.",
      });

      queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch (error: any) {
      console.error("Error saving document:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save changes.",
        variant: "destructive",
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDownload = () => {
    if (!document || !documentData) return;
    
    // For uploaded documents, open the file URL
    if (isUploadedDocument && documentData.uploadedFileUrl) {
      window.open(documentData.uploadedFileUrl, "_blank");
      return;
    }
    
    // For generated documents, download as text
    const blob = new Blob([documentData.content || ""], { type: "text/plain" });
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
  const canEdit = role === "employer" && document.status === "pending" && !candidateSigned;

  // Determine signing status display
  const getSigningStatus = () => {
    if (isFullySigned) return "Fully Signed";
    if (candidateSigned && !employerSigned) return "Awaiting Employer Countersignature";
    if (!candidateSigned) return "Awaiting Candidate Signature";
    return "Pending";
  };

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
            <div className="flex items-center gap-2">
              <Badge className={status?.color}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {status?.label}
              </Badge>
            </div>
          </div>
          
          {/* Signing Progress */}
          {document.status === "pending" && (
            <div className="mt-4 p-3 rounded-lg bg-secondary/50 border border-border">
              <p className="text-sm font-medium mb-2">Signing Progress</p>
              <div className="flex items-center gap-4">
                <div className={`flex items-center gap-2 ${candidateSigned ? "text-success" : "text-muted-foreground"}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${candidateSigned ? "bg-success/20" : "bg-secondary"}`}>
                    <UserCheck className="h-3 w-3" />
                  </div>
                  <span className="text-xs">Candidate {candidateSigned ? "✓" : "(pending)"}</span>
                </div>
                <div className="flex-1 h-0.5 bg-border" />
                <div className={`flex items-center gap-2 ${employerSigned ? "text-success" : "text-muted-foreground"}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${employerSigned ? "bg-success/20" : "bg-secondary"}`}>
                    <Building2 className="h-3 w-3" />
                  </div>
                  <span className="text-xs">Employer {employerSigned ? "✓" : candidateSigned ? "(your turn)" : "(waiting)"}</span>
                </div>
              </div>
            </div>
          )}
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
              <ScrollArea className="h-[calc(70vh-180px)]">
                {isUploadedDocument && hasPositionedSignatures && documentData?.uploadedFileUrl ? (
                  // Uploaded PDF with positioned signatures
                  <PdfSignaturePlacer
                    pdfUrl={documentData.uploadedFileUrl}
                    signatureFields={positionedSignatureFields}
                    onFieldsChange={() => {}}
                    readOnly={true}
                    signatures={signatures}
                  />
                ) : isUploadedDocument ? (
                  // Uploaded document view (legacy)
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-border min-h-full shadow-inner overflow-hidden">
                    {documentData?.uploadedFileType === "application/pdf" ? (
                      <iframe
                        src={documentData.uploadedFileUrl}
                        className="w-full h-[500px] border-0"
                        title="Document Preview"
                      />
                    ) : (
                      <div className="p-8 text-center">
                        <FileText className="h-16 w-16 text-primary mx-auto mb-4" />
                        <h3 className="font-semibold mb-2">{documentData?.uploadedFileName || document?.name}</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          {documentData?.uploadedFileType || "Document file"}
                        </p>
                        <Button onClick={() => window.open(documentData?.uploadedFileUrl, "_blank")}>
                          <Download className="h-4 w-4 mr-2" />
                          Open Document
                        </Button>
                      </div>
                    )}
                  </div>
                ) : isEditing ? (
                  <Textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="min-h-[400px] font-serif text-sm leading-relaxed bg-white dark:bg-zinc-900"
                  />
                ) : (
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-border p-8 min-h-full shadow-inner">
                    <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-foreground">
                      {documentData?.content || "Loading document..."}
                    </pre>
                  </div>
                )}
              </ScrollArea>
              
              <div className="flex gap-3 mt-4">
                <Button variant="outline" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                {canEdit && !hasPositionedSignatures && (
                  isEditing ? (
                    <>
                      <Button onClick={handleSaveEdit} disabled={isSavingEdit}>
                        {isSavingEdit ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Save Changes
                      </Button>
                      <Button variant="outline" onClick={() => {
                        setIsEditing(false);
                        setEditedContent(documentData?.content || "");
                      }}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" onClick={() => setIsEditing(true)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Document
                    </Button>
                  )
                )}
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
                    <h3 className="font-semibold">
                      {role === "candidate" ? "Sign as Candidate" : "Countersign as Employer"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {role === "candidate" 
                        ? "Draw your signature below. The employer will countersign after you."
                        : "The candidate has signed. Add your countersignature to complete the document."}
                    </p>
                  </div>

                  <ScrollArea className="h-[calc(50vh-120px)]">
                    <div className="space-y-6">
                      {signableFields.map((field) => (
                        <div key={field.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-2">
                              {field.id === "recipient" && <UserCheck className="h-4 w-4" />}
                              {field.id === "employer" && <Building2 className="h-4 w-4" />}
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
                      {role === "candidate" ? "Sign Document" : "Countersign"}
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
                          log.action.includes("signed") ? "bg-success/20" :
                          log.action === "declined" ? "bg-destructive/20" :
                          log.action === "viewed" ? "bg-blue-500/20" :
                          log.action === "edited" ? "bg-orange-500/20" :
                          "bg-primary/20"
                        }`}>
                          {log.action.includes("signed") ? (
                            <CheckCircle className="h-5 w-5 text-success" />
                          ) : log.action === "declined" ? (
                            <XCircle className="h-5 w-5 text-destructive" />
                          ) : log.action === "viewed" ? (
                            <Eye className="h-5 w-5 text-blue-500" />
                          ) : log.action === "edited" ? (
                            <Edit className="h-5 w-5 text-orange-500" />
                          ) : (
                            <FileText className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="font-medium capitalize">{log.action.replace(/_/g, " ")}</p>
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
