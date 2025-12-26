import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Package,
  FileText,
  Upload,
  ChevronRight,
  ChevronLeft,
  Send,
  Plus,
  Check,
  Loader2,
  Sparkles,
  Calendar,
  FileCheck,
  CreditCard,
  FileSignature,
  Shield,
  Briefcase,
  User,
  X,
  PartyPopper,
  Eye,
  Trash2,
  FileUp,
} from "lucide-react";
import { getDocumentTypeLabel } from "./PackageItemCard";
import {
  useCreateDocumentPackage,
  useSendDocumentPackage,
} from "@/hooks/useDocumentPackages";
import { useProfile } from "@/hooks/useProfile";
import { useQueryClient } from "@tanstack/react-query";

interface HiringPackageWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  jobId: string;
  jobTitle: string;
}

interface TempDocument {
  id: string;
  type: "document";
  name: string;
  document_type: string;
  file_url: string;
  content?: string;
  mode: "generate" | "upload";
}

interface TempRequest {
  id: string;
  type: "request";
  document_type: string;
  custom_document_name?: string;
  description?: string;
  is_required: boolean;
}

type TempItem = TempDocument | TempRequest;

// Document types that can be created/uploaded
const DOCUMENT_TYPES = [
  { value: "offer_letter", label: "Offer Letter", icon: FileText, description: "Formal job offer" },
  { value: "nda", label: "NDA", icon: Shield, description: "Non-disclosure agreement" },
  { value: "employment_contract", label: "Employment Contract", icon: FileSignature, description: "Full employment terms" },
  { value: "background_check", label: "Background Check", icon: User, description: "Authorization form" },
  { value: "non_compete", label: "Non-Compete", icon: Briefcase, description: "Competition restriction" },
  { value: "ip_assignment", label: "IP Assignment", icon: Sparkles, description: "Intellectual property" },
];

// Document types that can be requested from candidate
const REQUEST_TYPES = [
  { value: "drivers_license", label: "Driver's License", icon: CreditCard },
  { value: "ssn_card", label: "Social Security Card", icon: CreditCard },
  { value: "passport", label: "Passport", icon: CreditCard },
  { value: "work_authorization", label: "Work Authorization", icon: FileCheck },
  { value: "tax_form", label: "Tax Form (W-9/1099)", icon: FileText },
  { value: "id_card", label: "Government ID", icon: CreditCard },
  { value: "proof_of_address", label: "Proof of Address", icon: FileText },
  { value: "bank_details", label: "Bank Details", icon: CreditCard },
];

export function HiringPackageWizard({
  open,
  onOpenChange,
  applicationId,
  candidateId,
  candidateName,
  candidateEmail,
  jobId,
  jobTitle,
}: HiringPackageWizardProps) {
  const [packageName, setPackageName] = useState(`Hiring Package - ${candidateName}`);
  const [items, setItems] = useState<TempItem[]>([]);
  const [dueDate, setDueDate] = useState<Date | undefined>(addDays(new Date(), 7));
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Document creation state
  const [selectedDocType, setSelectedDocType] = useState<string | null>(null);
  const [documentMode, setDocumentMode] = useState<"generate" | "upload">("generate");
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Request selection state
  const [selectedRequestTypes, setSelectedRequestTypes] = useState<string[]>([]);
  
  // Preview state
  const [previewItem, setPreviewItem] = useState<TempDocument | null>(null);
  
  // Active tab: "documents" or "requests"
  const [activeTab, setActiveTab] = useState<"documents" | "requests">("documents");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const createPackage = useCreateDocumentPackage();
  const sendPackage = useSendDocumentPackage();

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setPackageName(`Hiring Package - ${candidateName}`);
      setItems([]);
      setDueDate(addDays(new Date(), 7));
      setSelectedRequestTypes([]);
      setSelectedDocType(null);
      setActiveTab("documents");
      setPreviewItem(null);
    }
  }, [open, candidateName]);

  const documents = items.filter((i): i is TempDocument => i.type === "document");
  const requests = items.filter((i): i is TempRequest => i.type === "request");

  const handleClose = () => {
    setPackageName("");
    setItems([]);
    setSelectedDocType(null);
    setSelectedRequestTypes([]);
    setPreviewItem(null);
    onOpenChange(false);
  };

  // Generate document with AI (stores locally, does NOT save to DB)
  const handleGenerateDocument = async (docType: string) => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-generate-document", {
        body: {
          documentType: docType,
          recipientName: candidateName,
          companyName: profile?.company_name || "Company",
          jobTitle: jobTitle,
          hiringManagerName: profile?.full_name || "",
          companyEmail: profile?.email || "",
        },
      });

      if (error) throw error;

      // Convert to HTML and upload to storage for preview
      const htmlContent = data.content;
      const blob = new Blob([htmlContent], { type: "text/html" });
      const file = new File([blob], `${docType}_${Date.now()}.html`, { type: "text/html" });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileName = `${user.id}/${Date.now()}_${docType}.html`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = await supabase.storage
        .from("documents")
        .createSignedUrl(fileName, 60 * 60 * 24 * 365);

      const newDoc: TempDocument = {
        id: crypto.randomUUID(),
        type: "document",
        name: getDocumentTypeLabel(docType),
        document_type: docType,
        file_url: urlData?.signedUrl || "",
        content: htmlContent,
        mode: "generate",
      };

      setItems((prev) => [...prev, newDoc]);
      setSelectedDocType(null);
      
      toast({
        title: "Document Generated",
        description: `${getDocumentTypeLabel(docType)} added to your package.`,
      });
    } catch (error: any) {
      console.error("Error generating document:", error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate document.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Upload document (stores locally, does NOT save to DB)
  const handleUploadDocument = async (file: File, docType: string) => {
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileName = `${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = await supabase.storage
        .from("documents")
        .createSignedUrl(fileName, 60 * 60 * 24 * 365);

      const newDoc: TempDocument = {
        id: crypto.randomUUID(),
        type: "document",
        name: file.name.replace(/\.[^/.]+$/, ""),
        document_type: docType,
        file_url: urlData?.signedUrl || "",
        mode: "upload",
      };

      setItems((prev) => [...prev, newDoc]);
      setSelectedDocType(null);
      setUploadedFile(null);

      toast({
        title: "Document Uploaded",
        description: `${file.name} added to your package.`,
      });
    } catch (error: any) {
      console.error("Error uploading document:", error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload document.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Add document requests
  const handleAddRequests = () => {
    const newRequests: TempRequest[] = selectedRequestTypes.map((type) => ({
      id: crypto.randomUUID(),
      type: "request" as const,
      document_type: type,
      is_required: true,
    }));

    setItems((prev) => [...prev, ...newRequests]);
    setSelectedRequestTypes([]);
    
    toast({
      title: "Requests Added",
      description: `${newRequests.length} document request${newRequests.length !== 1 ? "s" : ""} added to your package.`,
    });
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const toggleRequestType = (type: string) => {
    setSelectedRequestTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  // Send the package - saves everything to DB at once
  const handleSendPackage = async () => {
    if (items.length === 0) {
      toast({
        title: "No Items",
        description: "Please add at least one document or request to the package.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create the package
      const pkg = await createPackage.mutateAsync({
        application_id: applicationId,
        employer_id: user.id,
        candidate_id: candidateId,
        name: packageName,
      });

      // Create documents with package_id
      for (const doc of documents) {
        const docCode = `DOC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        
        const { error } = await supabase.from("documents").insert({
          application_id: applicationId,
          package_id: pkg.id,
          name: doc.name,
          document_type: doc.document_type,
          file_url: doc.file_url,
          document_code: docCode,
          status: "pending",
          sender_id: user.id,
          recipient_id: candidateId,
        });

        if (error) throw error;
      }

      // Create document requests with package_id
      for (const req of requests) {
        const { error } = await supabase.from("document_requests").insert({
          application_id: applicationId,
          package_id: pkg.id,
          employer_id: user.id,
          candidate_id: candidateId,
          document_type: req.document_type,
          custom_document_name: req.custom_document_name,
          description: req.description,
          is_required: req.is_required,
          due_date: dueDate?.toISOString(),
          status: "pending",
        });

        if (error) throw error;
      }

      // Send the package
      await sendPackage.mutateAsync(pkg.id);

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document-requests"] });
      queryClient.invalidateQueries({ queryKey: ["document-packages"] });

      toast({
        title: "Package Sent!",
        description: `Hiring package sent to ${candidateName}.`,
      });

      handleClose();
    } catch (error: any) {
      console.error("Error sending package:", error);
      toast({
        title: "Failed to Send",
        description: error.message || "Failed to send the hiring package.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render document type selection or creation mode
  const renderDocumentsTab = () => {
    if (selectedDocType) {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedDocType(null);
                setDocumentMode("generate");
                setUploadedFile(null);
              }}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <span className="text-sm font-medium">
              {getDocumentTypeLabel(selectedDocType)}
            </span>
          </div>

          {/* Mode selection */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setDocumentMode("generate")}
              className={cn(
                "p-4 rounded-lg border text-center transition-all",
                documentMode === "generate"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
            >
              <Sparkles className="w-6 h-6 mx-auto mb-2 text-primary" />
              <p className="text-sm font-medium">Generate with AI</p>
            </button>
            <button
              onClick={() => setDocumentMode("upload")}
              className={cn(
                "p-4 rounded-lg border text-center transition-all",
                documentMode === "upload"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
            >
              <Upload className="w-6 h-6 mx-auto mb-2 text-primary" />
              <p className="text-sm font-medium">Upload File</p>
            </button>
          </div>

          {documentMode === "generate" ? (
            <Button
              className="w-full"
              onClick={() => handleGenerateDocument(selectedDocType)}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate & Add to Package
                </>
              )}
            </Button>
          ) : (
            <div className="space-y-3">
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setUploadedFile(file);
                }}
                className="hidden"
                id="doc-upload"
              />
              <label
                htmlFor="doc-upload"
                className={cn(
                  "flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-all",
                  uploadedFile
                    ? "border-success bg-success/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                {uploadedFile ? (
                  <>
                    <FileCheck className="w-8 h-8 text-success mb-2" />
                    <p className="text-sm font-medium">{uploadedFile.name}</p>
                    <p className="text-xs text-muted-foreground">Click to change</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">Click to upload</p>
                    <p className="text-xs text-muted-foreground">PDF, DOC, DOCX</p>
                  </>
                )}
              </label>
              {uploadedFile && (
                <Button
                  className="w-full"
                  onClick={() => handleUploadDocument(uploadedFile, selectedDocType)}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Add to Package
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Select a document type to add to the package
        </p>
        <div className="grid grid-cols-1 gap-2">
          {DOCUMENT_TYPES.map((type) => {
            const Icon = type.icon;
            const alreadyAdded = documents.some((d) => d.document_type === type.value);
            return (
              <button
                key={type.value}
                onClick={() => setSelectedDocType(type.value)}
                disabled={alreadyAdded}
                className={cn(
                  "p-3 rounded-lg border text-left transition-all flex items-center gap-3",
                  alreadyAdded
                    ? "bg-muted/50 border-border/50 opacity-50 cursor-not-allowed"
                    : "bg-card hover:bg-accent hover:border-primary/50 cursor-pointer"
                )}
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium flex items-center gap-2">
                    {type.label}
                    {alreadyAdded && <Check className="w-3 h-3 text-success" />}
                  </p>
                  <p className="text-xs text-muted-foreground">{type.description}</p>
                </div>
                {!alreadyAdded && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Render request type selection
  const renderRequestsTab = () => {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Select documents the candidate needs to upload
        </p>
        <div className="grid grid-cols-1 gap-2">
          {REQUEST_TYPES.map((type) => {
            const isSelected = selectedRequestTypes.includes(type.value);
            const alreadyAdded = requests.some((r) => r.document_type === type.value);
            return (
              <button
                key={type.value}
                onClick={() => !alreadyAdded && toggleRequestType(type.value)}
                disabled={alreadyAdded}
                className={cn(
                  "p-3 rounded-lg border text-left transition-all flex items-center gap-3",
                  alreadyAdded
                    ? "bg-muted/50 border-border/50 opacity-50 cursor-not-allowed"
                    : isSelected
                    ? "border-primary bg-primary/5"
                    : "bg-card hover:bg-accent hover:border-primary/50 cursor-pointer"
                )}
              >
                <Checkbox
                  checked={isSelected || alreadyAdded}
                  disabled={alreadyAdded}
                  className="pointer-events-none"
                />
                <p className="text-sm font-medium flex items-center gap-2 flex-1">
                  {type.label}
                  {alreadyAdded && <Check className="w-3 h-3 text-success" />}
                </p>
              </button>
            );
          })}
        </div>

        {selectedRequestTypes.length > 0 && (
          <Button className="w-full" onClick={handleAddRequests}>
            <Plus className="w-4 h-4 mr-2" />
            Add {selectedRequestTypes.length} Request{selectedRequestTypes.length !== 1 ? "s" : ""} to Package
          </Button>
        )}
      </div>
    );
  };

  // Render the staging panel (right side)
  const renderStagingPanel = () => {
    return (
      <div className="flex flex-col h-full border-l border-border/50 bg-muted/20">
        {/* Panel header */}
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Your Package</h3>
            {items.length > 0 && (
              <Badge className="ml-auto">{items.length}</Badge>
            )}
          </div>
          
          <Input
            value={packageName}
            onChange={(e) => setPackageName(e.target.value)}
            placeholder="Package name..."
            className="text-sm h-8"
          />
          
          <div className="mt-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "w-full justify-start text-left text-xs h-8",
                    !dueDate && "text-muted-foreground"
                  )}
                >
                  <Calendar className="mr-2 h-3 w-3" />
                  {dueDate ? `Due: ${format(dueDate, "MMM d, yyyy")}` : "Set due date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={dueDate}
                  onSelect={setDueDate}
                  disabled={(date) => date < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Items list */}
        <ScrollArea className="flex-1 p-3">
          {items.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No items yet</p>
              <p className="text-xs text-muted-foreground">
                Add documents or requests
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Documents */}
              {documents.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
                    Documents ({documents.length})
                  </p>
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-2 rounded-lg bg-card border border-border/50 group"
                    >
                      <div className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText className="w-3 h-3 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {doc.mode === "generate" ? "AI Generated" : "Uploaded"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setPreviewItem(doc)}
                          >
                            <Eye className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveItem(doc.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Requests */}
              {requests.length > 0 && (
                <div className="space-y-1.5 mt-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
                    Requests ({requests.length})
                  </p>
                  {requests.map((req) => (
                    <div
                      key={req.id}
                      className="p-2 rounded-lg bg-card border border-border/50 group"
                    >
                      <div className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded bg-amber-500/10 flex items-center justify-center shrink-0">
                          <FileUp className="w-3 h-3 text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {req.custom_document_name || getDocumentTypeLabel(req.document_type)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Candidate will upload
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleRemoveItem(req.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Send button */}
        <div className="p-3 border-t border-border/50">
          <Button
            className="w-full bg-gradient-to-r from-primary to-success hover:from-primary/90 hover:to-success/90"
            onClick={handleSendPackage}
            disabled={items.length === 0 || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send Package ({items.length})
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            To: {candidateName}
          </p>
        </div>
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent 
          className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div className="flex flex-1 overflow-hidden">
            {/* Left side - Main content */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Header */}
              <div className="px-6 pt-6 pb-4 border-b border-border/50">
                <div className="flex items-center gap-3 mb-4">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-success/20 flex items-center justify-center"
                  >
                    <PartyPopper className="h-5 w-5 text-primary" />
                  </motion.div>
                  <div>
                    <h2 className="text-lg font-semibold">Create Hiring Package</h2>
                    <p className="text-sm text-muted-foreground">
                      For {candidateName} • {jobTitle}
                    </p>
                  </div>
                </div>

                {/* Tab buttons */}
                <div className="flex gap-2">
                  <Button
                    variant={activeTab === "documents" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveTab("documents")}
                    className="flex-1"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Documents to Sign
                    {documents.length > 0 && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {documents.length}
                      </Badge>
                    )}
                  </Button>
                  <Button
                    variant={activeTab === "requests" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveTab("requests")}
                    className="flex-1"
                  >
                    <FileUp className="w-4 h-4 mr-2" />
                    Documents to Request
                    {requests.length > 0 && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {requests.length}
                      </Badge>
                    )}
                  </Button>
                </div>
              </div>

              {/* Content */}
              <ScrollArea className="flex-1 px-6 py-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab + (selectedDocType || "")}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                  >
                    {activeTab === "documents" ? renderDocumentsTab() : renderRequestsTab()}
                  </motion.div>
                </AnimatePresence>
              </ScrollArea>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-border/50">
                <Button variant="ghost" onClick={handleClose}>
                  Cancel
                </Button>
              </div>
            </div>

            {/* Right side - Staging panel */}
            <div className="w-72 shrink-0 hidden sm:flex flex-col">
              {renderStagingPanel()}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview dialog for documents */}
      <Dialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">{previewItem?.name}</h3>
              <p className="text-sm text-muted-foreground">
                {previewItem?.mode === "generate" ? "AI Generated Document" : "Uploaded Document"}
              </p>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto border rounded-lg bg-white">
            {previewItem?.content ? (
              <iframe
                srcDoc={previewItem.content}
                className="w-full h-full min-h-[400px]"
                title="Document Preview"
              />
            ) : previewItem?.file_url ? (
              <iframe
                src={previewItem.file_url}
                className="w-full h-full min-h-[400px]"
                title="Document Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                Preview not available
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
