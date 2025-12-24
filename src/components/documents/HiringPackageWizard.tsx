import { useState, useMemo, useEffect } from "react";
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
} from "lucide-react";
import { PackageItemCard, getDocumentTypeLabel } from "./PackageItemCard";
import {
  useCreateDocumentPackage,
  useSendDocumentPackage,
  type PackageItem,
} from "@/hooks/useDocumentPackages";
import { useProfile } from "@/hooks/useProfile";
import { useQueryClient } from "@tanstack/react-query";
import { DocumentWizard } from "./DocumentWizard";
import { useApplicationsForDocuments } from "@/hooks/useApplicationsForDocuments";

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

const WIZARD_STEPS = [
  { id: "setup", title: "Package Setup", subtitle: "Name your hiring package" },
  { id: "documents", title: "Add Documents", subtitle: "Documents for the candidate to sign" },
  { id: "requests", title: "Request Documents", subtitle: "Documents for the candidate to upload" },
  { id: "review", title: "Review & Send", subtitle: "Review and send the package" },
];

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
  const [currentStep, setCurrentStep] = useState(0);
  const [packageName, setPackageName] = useState(`Hiring Package - ${candidateName}`);
  const [items, setItems] = useState<TempItem[]>([]);
  const [dueDate, setDueDate] = useState<Date | undefined>(addDays(new Date(), 7));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDocumentCreator, setShowDocumentCreator] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<string | null>(null);
  const [selectedRequestTypes, setSelectedRequestTypes] = useState<string[]>([]);
  
  // Document creation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [documentMode, setDocumentMode] = useState<"generate" | "upload">("generate");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  
  // State for DocumentWizard integration
  const [showDocumentWizard, setShowDocumentWizard] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const createPackage = useCreateDocumentPackage();
  const sendPackage = useSendDocumentPackage();
  
  // Fetch applications for DocumentWizard
  const { data: applications = [] } = useApplicationsForDocuments();

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setPackageName(`Hiring Package - ${candidateName}`);
      setItems([]);
      setCurrentStep(0);
      setDueDate(addDays(new Date(), 7));
      setSelectedRequestTypes([]);
    }
  }, [open, candidateName]);

  const documents = items.filter((i): i is TempDocument => i.type === "document");
  const requests = items.filter((i): i is TempRequest => i.type === "request");

  const canProceed = () => {
    switch (WIZARD_STEPS[currentStep].id) {
      case "setup":
        return packageName.trim().length > 0;
      case "documents":
        return true; // Can skip documents
      case "requests":
        return true; // Can skip requests
      case "review":
        return items.length > 0; // Must have at least one item
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleClose = () => {
    setCurrentStep(0);
    setPackageName("");
    setItems([]);
    setShowDocumentCreator(false);
    setShowDocumentWizard(false);
    setSelectedDocType(null);
    setSelectedRequestTypes([]);
    onOpenChange(false);
  };

  // Handle when DocumentWizard creates a document - add it to the package
  const handleDocumentCreated = (document: { id: string; name: string; document_type: string; file_url: string }) => {
    const newDoc: TempDocument = {
      id: document.id, // Use the actual document ID from the database
      type: "document",
      name: document.name,
      document_type: document.document_type,
      file_url: document.file_url,
      mode: "generate",
    };
    
    setItems((prev) => [...prev, newDoc]);
    setShowDocumentWizard(false);
    setShowDocumentCreator(false);
    setSelectedDocType(null);
    
    toast({
      title: "Document Created",
      description: `${document.name} has been added to the package.`,
    });
  };

  // Generate document with AI
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

      // Convert to PDF and upload
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
      setShowDocumentCreator(false);
      setSelectedDocType(null);
      
      toast({
        title: "Document Created",
        description: `${getDocumentTypeLabel(docType)} has been added to the package.`,
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

  // Upload document
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
      setShowDocumentCreator(false);
      setSelectedDocType(null);
      setUploadedFile(null);

      toast({
        title: "Document Uploaded",
        description: `${file.name} has been added to the package.`,
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
      description: `${newRequests.length} document request${newRequests.length !== 1 ? "s" : ""} added.`,
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

  // Send the package
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
        // Generate document code
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

      // Send the package (updates status and sends notification)
      await sendPackage.mutateAsync(pkg.id);

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document-requests"] });
      queryClient.invalidateQueries({ queryKey: ["document-packages"] });

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

  const renderStepContent = () => {
    const stepId = WIZARD_STEPS[currentStep].id;

    switch (stepId) {
      case "setup":
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-center mb-6">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-success/20 flex items-center justify-center"
              >
                <PartyPopper className="h-8 w-8 text-primary" />
              </motion.div>
            </div>
            
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold">Congratulations on the hire!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create a hiring package for <span className="font-medium text-foreground">{candidateName}</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="packageName">Package Name</Label>
              <Input
                id="packageName"
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
                placeholder="Enter package name"
              />
            </div>

            <div className="space-y-2">
              <Label>Due Date (optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dueDate && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "PPP") : "Select due date"}
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
        );

      case "documents":
        return (
          <div className="space-y-4">
            <div className="text-center mb-4">
              <h3 className="text-lg font-semibold">Documents to Sign</h3>
              <p className="text-sm text-muted-foreground">
                Add documents the candidate needs to sign (e.g., offer letter, NDA)
              </p>
            </div>

            {/* Added documents */}
            {documents.length > 0 && (
              <div className="space-y-2 mb-4">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Added Documents ({documents.length})
                </Label>
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <PackageItemCard
                      key={doc.id}
                      item={{
                        type: "document",
                        id: doc.id,
                        name: doc.name,
                        document_type: doc.document_type,
                        status: "pending",
                        created_at: new Date().toISOString(),
                      }}
                      onRemove={() => handleRemoveItem(doc.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Document type selection */}
            {!showDocumentCreator ? (
              <div className="grid grid-cols-2 gap-3">
                {DOCUMENT_TYPES.map((type) => {
                  const Icon = type.icon;
                  const alreadyAdded = documents.some((d) => d.document_type === type.value);
                  return (
                    <button
                      key={type.value}
                      onClick={() => {
                        setSelectedDocType(type.value);
                        setShowDocumentCreator(true);
                      }}
                      disabled={alreadyAdded}
                      className={cn(
                        "p-4 rounded-lg border text-left transition-all",
                        alreadyAdded
                          ? "bg-muted/50 border-border/50 opacity-50 cursor-not-allowed"
                          : "bg-card hover:bg-accent hover:border-primary/50 cursor-pointer"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium flex items-center gap-2">
                            {type.label}
                            {alreadyAdded && (
                              <Check className="w-3 h-3 text-success" />
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {type.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              // Document creation mode
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowDocumentCreator(false);
                        setSelectedDocType(null);
                        setDocumentMode("generate");
                        setUploadedFile(null);
                      }}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Back
                    </Button>
                    <span className="text-sm font-medium">
                      {getDocumentTypeLabel(selectedDocType || "")}
                    </span>
                  </div>
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
                    onClick={() => setShowDocumentWizard(true)}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Document
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
                          <p className="text-xs text-muted-foreground">
                            Click to change
                          </p>
                        </>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                          <p className="text-sm font-medium">Click to upload</p>
                          <p className="text-xs text-muted-foreground">
                            PDF, DOC, DOCX
                          </p>
                        </>
                      )}
                    </label>
                    {uploadedFile && (
                      <Button
                        className="w-full"
                        onClick={() => handleUploadDocument(uploadedFile, selectedDocType!)}
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
            )}

            {documents.length === 0 && !showDocumentCreator && (
              <p className="text-center text-sm text-muted-foreground py-4">
                No documents added yet. Click a document type above to add one.
              </p>
            )}
          </div>
        );

      case "requests":
        return (
          <div className="space-y-4">
            <div className="text-center mb-4">
              <h3 className="text-lg font-semibold">Request Documents</h3>
              <p className="text-sm text-muted-foreground">
                Select documents the candidate needs to upload
              </p>
            </div>

            {/* Added requests */}
            {requests.length > 0 && (
              <div className="space-y-2 mb-4">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Requested Documents ({requests.length})
                </Label>
                <div className="space-y-2">
                  {requests.map((req) => (
                    <PackageItemCard
                      key={req.id}
                      item={{
                        type: "request",
                        id: req.id,
                        name: req.custom_document_name || getDocumentTypeLabel(req.document_type),
                        document_type: req.document_type,
                        status: "pending",
                        created_at: new Date().toISOString(),
                      }}
                      onRemove={() => handleRemoveItem(req.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Request type selection */}
            <div className="grid grid-cols-2 gap-3">
              {REQUEST_TYPES.map((type) => {
                const Icon = type.icon;
                const isSelected = selectedRequestTypes.includes(type.value);
                const alreadyAdded = requests.some((r) => r.document_type === type.value);
                return (
                  <button
                    key={type.value}
                    onClick={() => !alreadyAdded && toggleRequestType(type.value)}
                    disabled={alreadyAdded}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-all",
                      alreadyAdded
                        ? "bg-muted/50 border-border/50 opacity-50 cursor-not-allowed"
                        : isSelected
                        ? "border-primary bg-primary/5"
                        : "bg-card hover:bg-accent hover:border-primary/50 cursor-pointer"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={isSelected || alreadyAdded}
                        disabled={alreadyAdded}
                        className="pointer-events-none"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium flex items-center gap-2">
                          {type.label}
                          {alreadyAdded && (
                            <Check className="w-3 h-3 text-success" />
                          )}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedRequestTypes.length > 0 && (
              <Button className="w-full" onClick={handleAddRequests}>
                <Plus className="w-4 h-4 mr-2" />
                Add {selectedRequestTypes.length} Request{selectedRequestTypes.length !== 1 ? "s" : ""}
              </Button>
            )}

            {requests.length === 0 && selectedRequestTypes.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                No document requests added yet. Select types above to request.
              </p>
            )}
          </div>
        );

      case "review":
        return (
          <div className="space-y-4">
            <div className="text-center mb-4">
              <h3 className="text-lg font-semibold">Review Package</h3>
              <p className="text-sm text-muted-foreground">
                {items.length} item{items.length !== 1 ? "s" : ""} ready to send
              </p>
            </div>

            {/* Package summary */}
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
              <div className="flex items-center gap-3 mb-3">
                <Package className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium">{packageName}</p>
                  <p className="text-xs text-muted-foreground">
                    For {candidateName} • {jobTitle}
                  </p>
                </div>
              </div>
              {dueDate && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  Due: {format(dueDate, "PPP")}
                </div>
              )}
            </div>

            {/* Documents */}
            {documents.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Documents to Sign ({documents.length})
                </Label>
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <PackageItemCard
                      key={doc.id}
                      item={{
                        type: "document",
                        id: doc.id,
                        name: doc.name,
                        document_type: doc.document_type,
                        status: "pending",
                        created_at: new Date().toISOString(),
                      }}
                      canRemove={false}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Requests */}
            {requests.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Documents to Upload ({requests.length})
                </Label>
                <div className="space-y-2">
                  {requests.map((req) => (
                    <PackageItemCard
                      key={req.id}
                      item={{
                        type: "request",
                        id: req.id,
                        name: req.custom_document_name || getDocumentTypeLabel(req.document_type),
                        document_type: req.document_type,
                        status: "pending",
                        created_at: new Date().toISOString(),
                      }}
                      canRemove={false}
                    />
                  ))}
                </div>
              </div>
            )}

            {items.length === 0 && (
              <div className="text-center py-8">
                <Package className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">Package is empty</p>
                <p className="text-sm text-muted-foreground">
                  Go back to add documents or requests
                </p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {/* Header with steps */}
        <div className="px-6 pt-6 pb-4 border-b border-border/50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">
                {WIZARD_STEPS[currentStep].title}
              </h2>
              <p className="text-sm text-muted-foreground">
                {WIZARD_STEPS[currentStep].subtitle}
              </p>
            </div>
            <Badge variant="secondary" className="text-xs">
              Step {currentStep + 1} of {WIZARD_STEPS.length}
            </Badge>
          </div>

          {/* Step indicators */}
          <div className="flex gap-1">
            {WIZARD_STEPS.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  index <= currentStep ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 px-6 py-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderStepContent()}
            </motion.div>
          </AnimatePresence>
        </ScrollArea>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/50 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={currentStep === 0 ? handleClose : handleBack}
          >
            {currentStep === 0 ? "Cancel" : (
              <>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </>
            )}
          </Button>

          {currentStep === WIZARD_STEPS.length - 1 ? (
            <Button
              onClick={handleSendPackage}
              disabled={!canProceed() || isSubmitting}
              className="bg-gradient-to-r from-primary to-success hover:from-primary/90 hover:to-success/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Package
                </>
              )}
            </Button>
          ) : (
            <Button onClick={handleNext} disabled={!canProceed()}>
              {WIZARD_STEPS[currentStep].id === "documents" || WIZARD_STEPS[currentStep].id === "requests" ? (
                items.filter((i) => 
                  WIZARD_STEPS[currentStep].id === "documents" ? i.type === "document" : i.type === "request"
                ).length === 0 ? "Skip" : "Next"
              ) : "Next"}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
      
      {/* DocumentWizard for detailed document generation flow */}
      <DocumentWizard
        open={showDocumentWizard}
        onOpenChange={setShowDocumentWizard}
        applications={applications}
        preSelectedApplicationId={applicationId}
        initialMode="generate"
        preSelectedDocumentType={selectedDocType || undefined}
        onDocumentCreated={handleDocumentCreated}
      />
    </Dialog>
  );
}
