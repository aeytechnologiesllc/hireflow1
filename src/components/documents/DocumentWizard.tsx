import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { 
  FileText, 
  Sparkles, 
  ChevronRight, 
  ChevronLeft,
  Send,
  User,
  Building2,
  CalendarIcon,
  DollarSign,
  PenTool,
  Check,
  Loader2,
  Wand2,
  MapPin,
  Phone,
  Mail,
  Eye,
  Upload,
  FileUp,
  X,
  File
} from "lucide-react";
import type { ApplicationForDocument } from "@/hooks/useApplicationsForDocuments";
import { PdfSignaturePlacer, type SignatureFieldWithPosition } from "./PdfSignaturePlacer";

interface DocumentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applications: ApplicationForDocument[];
}

const DOCUMENT_TYPES = [
  { 
    value: "offer_letter", 
    label: "Offer Letter",
    icon: FileText,
    description: "Formal job offer with compensation details"
  },
  { 
    value: "nda", 
    label: "Non-Disclosure Agreement",
    icon: FileText,
    description: "Protect confidential business information"
  },
  { 
    value: "employment_contract", 
    label: "Employment Contract",
    icon: FileText,
    description: "Full employment terms and conditions"
  },
  { 
    value: "background_check", 
    label: "Background Check Authorization",
    icon: User,
    description: "Authorization for background verification"
  },
  { 
    value: "non_compete", 
    label: "Non-Compete Agreement",
    icon: Building2,
    description: "Prevent competitive employment"
  },
  { 
    value: "ip_assignment", 
    label: "IP Assignment Agreement",
    icon: Sparkles,
    description: "Intellectual property rights transfer"
  },
  { 
    value: "custom", 
    label: "Custom Document",
    icon: File,
    description: "Upload your own document"
  },
];

// Steps for AI Generation flow
const GENERATE_STEPS = [
  { id: "source", title: "Document Source", subtitle: "Choose how to create your document" },
  { id: "type", title: "Document Type", subtitle: "Choose the type of document to create" },
  { id: "recipient", title: "Recipient", subtitle: "Select or enter recipient details" },
  { id: "details", title: "Document Details", subtitle: "Provide information for the document" },
  { id: "generate", title: "AI Generation", subtitle: "Generate your document with AI" },
  { id: "review", title: "Review & Sign", subtitle: "Review and add signature fields" },
];

// Steps for Upload flow
const UPLOAD_STEPS = [
  { id: "source", title: "Document Source", subtitle: "Choose how to create your document" },
  { id: "recipient", title: "Recipient", subtitle: "Select or enter recipient details" },
  { id: "upload", title: "Upload Document", subtitle: "Upload your document file" },
  { id: "review", title: "Review & Sign", subtitle: "Configure signature fields" },
];

const ACCEPTED_FILE_TYPES = {
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "text/plain": [".txt"],
};

export function DocumentWizard({ open, onOpenChange, applications }: DocumentWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [documentSource, setDocumentSource] = useState<"generate" | "upload" | "">("");
  const [documentType, setDocumentType] = useState("");
  const [selectedApplication, setSelectedApplication] = useState<string>("");
  const [isManualRecipient, setIsManualRecipient] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [salary, setSalary] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [additionalTerms, setAdditionalTerms] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [signatureFields, setSignatureFields] = useState<SignatureFieldWithPosition[]>([]);
  const [legacySignatureFields, setLegacySignatureFields] = useState<{ id: string; label: string; required: boolean }[]>([
    { id: "recipient", label: "Recipient Signature", required: true },
    { id: "employer", label: "Employer Signature", required: true },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Upload-related state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [documentName, setDocumentName] = useState("");
  const [isAnalyzingDocument, setIsAnalyzingDocument] = useState(false);
  const [totalPdfPages, setTotalPdfPages] = useState(1);
  
  // Optional fields
  const [hiringManagerName, setHiringManagerName] = useState("");
  const [hiringManagerTitle, setHiringManagerTitle] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();

  // Get current steps based on document source
  const WIZARD_STEPS = documentSource === "upload" ? UPLOAD_STEPS : GENERATE_STEPS;
  
  // Auto-populate from profile when wizard opens
  useEffect(() => {
    if (open && profile) {
      if (profile.company_name && !companyName) {
        setCompanyName(profile.company_name);
      }
      if (profile.full_name && !hiringManagerName) {
        setHiringManagerName(profile.full_name);
      }
      if (profile.email && !companyEmail) {
        setCompanyEmail(profile.email);
      }
      if (profile.phone && !companyPhone) {
        setCompanyPhone(profile.phone);
      }
      if (profile.location && !companyAddress) {
        setCompanyAddress(profile.location);
      }
    }
  }, [open, profile]);

  const resetWizard = () => {
    setCurrentStep(0);
    setDocumentSource("");
    setDocumentType("");
    setSelectedApplication("");
    setIsManualRecipient(false);
    setRecipientName("");
    setRecipientEmail("");
    setCompanyName("");
    setJobTitle("");
    setSalary("");
    setStartDate(undefined);
    setAdditionalTerms("");
    setGeneratedContent("");
    setIsGenerating(false);
    setHiringManagerName("");
    setHiringManagerTitle("");
    setCompanyAddress("");
    setCompanyPhone("");
    setCompanyEmail("");
    setUploadedFile(null);
    setUploadedFileUrl("");
    setDocumentName("");
    setSignatureFields([]);
    setIsAnalyzingDocument(false);
    setTotalPdfPages(1);
    setLegacySignatureFields([
      { id: "recipient", label: "Recipient Signature", required: true },
      { id: "employer", label: "Employer Signature", required: true },
    ]);
  };

  const handleClose = () => {
    resetWizard();
    onOpenChange(false);
  };

  const getSelectedRecipient = () => {
    if (applications.length === 0 || isManualRecipient) {
      return { name: recipientName, email: recipientEmail, jobTitle };
    }
    const app = applications.find(a => a.id === selectedApplication);
    return {
      name: app?.profiles?.full_name || "",
      email: app?.profiles?.email || "",
      jobTitle: app?.jobs?.title || jobTitle,
    };
  };

  const getCurrentStepId = () => WIZARD_STEPS[currentStep]?.id || "";

  const canProceed = () => {
    const stepId = getCurrentStepId();
    
    switch (stepId) {
      case "source":
        return !!documentSource;
      case "type":
        return !!documentType;
      case "recipient":
        if (applications.length === 0 || isManualRecipient) {
          return !!(recipientName.trim() && recipientEmail.trim());
        }
        return !!selectedApplication;
      case "details":
        return companyName.trim() && (jobTitle.trim() || getSelectedRecipient().jobTitle);
      case "generate":
        return !!generatedContent;
      case "upload":
        return !!uploadedFileUrl && !!documentName.trim() && !isAnalyzingDocument;
      case "review":
        // For uploads with PDF, require all 4 signature fields to be placed
        if (documentSource === "upload" && uploadedFile?.type === "application/pdf") {
          return signatureFields.length >= 4; // Candidate sig, candidate date, employer sig, employer date
        }
        // For AI-generated or non-PDF uploads, use legacy fields
        return legacySignatureFields.length > 0;
      default:
        return true;
    }
  };

  const handleNext = async () => {
    const stepId = getCurrentStepId();
    
    if (stepId === "generate" && !generatedContent) {
      await generateDocument();
    } else if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      // If going back from first step after source selection, reset source
      if (currentStep === 1) {
        setDocumentSource("");
      }
      setCurrentStep(prev => prev - 1);
    }
  };

  // File upload handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, []);

  const handleFileSelect = async (file: File) => {
    // Validate file type
    const validTypes = Object.keys(ACCEPTED_FILE_TYPES);
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a PDF, Word document, or text file.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Maximum file size is 10MB.",
        variant: "destructive",
      });
      return;
    }

    setUploadedFile(file);
    setDocumentName(file.name.replace(/\.[^/.]+$/, "")); // Remove extension for default name
    
    // Upload to Supabase Storage
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}_${file.name}`;
      
      const { data, error } = await supabase.storage
        .from("documents")
        .upload(fileName, file);

      if (error) throw error;

      // Get signed URL for private bucket
      const { data: urlData, error: urlError } = await supabase.storage
        .from("documents")
        .createSignedUrl(fileName, 60 * 60 * 24 * 365); // 1 year

      if (urlError) throw urlError;

      // Ensure we have a full absolute URL (Supabase may return relative path)
      const signedPath = urlData.signedUrl;
      const fullUrl = signedPath.startsWith('http') 
        ? signedPath 
        : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1${signedPath}`;
      
      console.log('Signed URL:', signedPath);
      console.log('Full URL:', fullUrl);
      
      setUploadedFileUrl(fullUrl);
      
      // Clear any existing signature fields - user will place them manually in guided mode
      setSignatureFields([]);
      
      toast({
        title: "File Uploaded",
        description: file.type === "application/pdf" 
          ? "Document uploaded. You'll place signature fields in the next step."
          : "Your document has been uploaded successfully.",
      });
    } catch (error: any) {
      console.error("Error uploading file:", error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload file.",
        variant: "destructive",
      });
      setUploadedFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  const removeUploadedFile = () => {
    setUploadedFile(null);
    setUploadedFileUrl("");
    setDocumentName("");
  };

  const generateDocument = async () => {
    setIsGenerating(true);
    
    const recipient = getSelectedRecipient();

    try {
      const { data, error } = await supabase.functions.invoke("ai-generate-document", {
        body: {
          documentType,
          recipientName: recipient.name || recipientName,
          companyName,
          jobTitle: recipient.jobTitle || jobTitle,
          salary,
          startDate: startDate ? format(startDate, "PPP") : "",
          additionalTerms,
          hiringManagerName,
          hiringManagerTitle,
          companyAddress,
          companyEmail,
          companyPhone,
        },
      });

      if (error) throw error;

      setGeneratedContent(data.content);
      setCurrentStep(prev => prev + 1);
    } catch (error: any) {
      console.error("Error generating document:", error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const analyzeDocumentFields = async (pdfUrl: string) => {
    setIsAnalyzingDocument(true);
    
    try {
      // Get PDF page count by loading it
      // We'll estimate 1 page for now since we can't easily count without full PDF parsing
      // The edge function will handle the actual analysis
      const estimatedPages = 1;
      setTotalPdfPages(estimatedPages);
      
      const { data, error } = await supabase.functions.invoke("ai-analyze-document-fields", {
        body: {
          pdfUrl,
          totalPages: estimatedPages,
        },
      });

      if (error) {
        console.error("Error analyzing document:", error);
        // Use default fields on error
        setDefaultSignatureFields(estimatedPages);
        return;
      }

      if (data?.suggestedFields && data.suggestedFields.length > 0) {
        console.log("AI suggested fields:", data.suggestedFields);
        setSignatureFields(data.suggestedFields);
      } else {
        // Fallback to defaults
        setDefaultSignatureFields(estimatedPages);
      }
    } catch (error) {
      console.error("Error analyzing document:", error);
      setDefaultSignatureFields(1);
    } finally {
      setIsAnalyzingDocument(false);
    }
  };

  const setDefaultSignatureFields = (totalPages: number) => {
    const timestamp = Date.now();
    setSignatureFields([
      {
        id: `field_${timestamp}_0`,
        label: "Candidate Signature",
        required: true,
        type: "candidate",
        x: 10,
        y: 82,
        page: totalPages,
        width: 25,
        height: 5,
      },
      {
        id: `field_${timestamp}_1`,
        label: "Employer Signature",
        required: true,
        type: "employer",
        x: 55,
        y: 82,
        page: totalPages,
        width: 25,
        height: 5,
      },
    ]);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const recipient = getSelectedRecipient();
      const app = applications.find(a => a.id === selectedApplication);
      
      let fileUrl: string;
      let docName: string;
      let docType: string;

      if (documentSource === "upload") {
        // For uploaded documents, store the URL and metadata
        const isPdf = uploadedFile?.type === "application/pdf";
        const documentData = {
          content: null,
          uploadedFileUrl,
          uploadedFileName: uploadedFile?.name,
          uploadedFileType: uploadedFile?.type,
          signatureFields: isPdf ? signatureFields : legacySignatureFields,
          metadata: {
            recipientName: recipient.name || recipientName,
            recipientEmail: recipient.email || recipientEmail,
            hasPositionedSignatures: isPdf,
          },
        };
        fileUrl = `data:application/json;base64,${btoa(JSON.stringify(documentData))}`;
        docName = documentName || uploadedFile?.name || "Uploaded Document";
        docType = "custom";
      } else {
        // For AI-generated documents
        const documentData = {
          content: generatedContent,
          signatureFields: legacySignatureFields,
          metadata: {
            companyName,
            jobTitle: recipient.jobTitle || jobTitle,
            salary,
            startDate: startDate ? format(startDate, "PPP") : "",
            recipientName: recipient.name || recipientName,
            recipientEmail: recipient.email || recipientEmail,
          },
        };
        fileUrl = `data:application/json;base64,${btoa(JSON.stringify(documentData))}`;
        docName = `${DOCUMENT_TYPES.find(t => t.value === documentType)?.label} - ${recipient.name || recipientName || "Draft"}`;
        docType = documentType;
      }

      // Create document record
      const { data: document, error: docError } = await supabase
        .from("documents")
        .insert({
          application_id: selectedApplication || null,
          name: docName,
          document_type: docType,
          file_url: fileUrl,
          status: "pending",
          sender_id: user.id,
          recipient_id: app?.candidate_id || null,
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (docError) throw docError;

      // Create audit log
      await supabase.from("document_audit_logs").insert({
        document_id: document.id,
        user_id: user.id,
        action: "created",
        details: { 
          documentType: docType, 
          generatedWithAI: documentSource === "generate",
          uploaded: documentSource === "upload",
          recipient: recipient.email || recipientEmail,
        },
        user_agent: navigator.userAgent,
      });

      // Notify candidate if applicable
      if (app?.candidate_id) {
        await supabase.from("notifications").insert([{
          user_id: app.candidate_id,
          title: "New Document to Sign",
          message: `You have a new document to review and sign: ${docName}`,
          type: "system" as const,
          link: "/documents",
        }]);
      }

      toast({
        title: "Document Created",
        description: documentSource === "upload" 
          ? "Your document has been uploaded and sent for signature."
          : "Your document has been generated and sent for signature.",
      });

      queryClient.invalidateQueries({ queryKey: ["documents"] });
      handleClose();
    } catch (error: any) {
      console.error("Error creating document:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create document.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addLegacySignatureField = () => {
    setLegacySignatureFields(prev => [
      ...prev,
      { id: `field_${Date.now()}`, label: "New Signature Field", required: false },
    ]);
  };

  const removeLegacySignatureField = (id: string) => {
    setLegacySignatureFields(prev => prev.filter(f => f.id !== id));
  };

  const updateLegacySignatureField = (id: string, updates: Partial<typeof legacySignatureFields[0]>) => {
    setLegacySignatureFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const renderStepContent = () => {
    const stepId = getCurrentStepId();

    switch (stepId) {
      case "source":
        return (
          <motion.div
            key="step-source"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-2 gap-6"
          >
            {/* Generate with AI */}
            <button
              onClick={() => {
                setDocumentSource("generate");
                setCurrentStep(1);
              }}
              className={cn(
                "p-6 rounded-xl border-2 text-left transition-all hover:border-primary/50 group",
                documentSource === "generate"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-secondary/50"
              )}
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center transition-colors",
                  documentSource === "generate" ? "bg-primary/20" : "bg-secondary group-hover:bg-primary/10"
                )}>
                  <Sparkles className={cn(
                    "h-8 w-8",
                    documentSource === "generate" ? "text-primary" : "text-muted-foreground group-hover:text-primary"
                  )} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Generate with AI</h3>
                  <p className="text-sm text-muted-foreground">
                    Let AI create a professional document based on your inputs. Perfect for offer letters, NDAs, and contracts.
                  </p>
                </div>
              </div>
            </button>

            {/* Upload Your Own */}
            <button
              onClick={() => {
                setDocumentSource("upload");
                setDocumentType("custom");
                setCurrentStep(1);
              }}
              className={cn(
                "p-6 rounded-xl border-2 text-left transition-all hover:border-primary/50 group",
                documentSource === "upload"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-secondary/50"
              )}
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center transition-colors",
                  documentSource === "upload" ? "bg-primary/20" : "bg-secondary group-hover:bg-primary/10"
                )}>
                  <Upload className={cn(
                    "h-8 w-8",
                    documentSource === "upload" ? "text-primary" : "text-muted-foreground group-hover:text-primary"
                  )} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Upload Your Own</h3>
                  <p className="text-sm text-muted-foreground">
                    Upload an existing PDF, Word document, or text file. Add electronic signature fields.
                  </p>
                </div>
              </div>
            </button>
          </motion.div>
        );

      case "type":
        return (
          <motion.div
            key="step-type"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-2 gap-4"
          >
            {DOCUMENT_TYPES.filter(t => t.value !== "custom").map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.value}
                  onClick={() => setDocumentType(type.value)}
                  className={`p-4 rounded-xl border-2 text-left transition-all hover:border-primary/50 ${
                    documentType === type.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-secondary/50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      documentType === type.value ? "bg-primary/20" : "bg-secondary"
                    }`}>
                      <Icon className={`h-5 w-5 ${
                        documentType === type.value ? "text-primary" : "text-muted-foreground"
                      }`} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{type.label}</p>
                      <p className="text-sm text-muted-foreground">{type.description}</p>
                    </div>
                    {documentType === type.value && (
                      <Check className="h-5 w-5 text-primary" />
                    )}
                  </div>
                </button>
              );
            })}
          </motion.div>
        );

      case "recipient":
        return (
          <motion.div
            key="step-recipient"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            {applications.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Button
                    variant={!isManualRecipient ? "default" : "outline"}
                    onClick={() => setIsManualRecipient(false)}
                    className="flex-1"
                  >
                    <User className="h-4 w-4 mr-2" />
                    Select from Applicants
                  </Button>
                  <Button
                    variant={isManualRecipient ? "default" : "outline"}
                    onClick={() => setIsManualRecipient(true)}
                    className="flex-1"
                  >
                    <PenTool className="h-4 w-4 mr-2" />
                    Enter Manually
                  </Button>
                </div>
              </div>
            )}

            {!isManualRecipient && applications.length > 0 ? (
              <div className="space-y-3">
                <Label>Select Applicant</Label>
                <div className="grid gap-3 max-h-[300px] overflow-y-auto">
                  {applications.map((app) => (
                    <button
                      key={app.id}
                      onClick={() => setSelectedApplication(app.id)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        selectedApplication === app.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">
                            {app.profiles?.full_name || app.profiles?.email}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {app.jobs?.title}
                          </p>
                        </div>
                        {selectedApplication === app.id && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Recipient Name</Label>
                  <Input
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Recipient Email</Label>
                  <Input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="john@example.com"
                  />
                </div>
              </div>
            )}
          </motion.div>
        );

      case "details":
        return (
          <motion.div
            key="step-details"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            {/* Required Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Company Name
                </Label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Corporation"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Job Title
                </Label>
                <Input
                  value={jobTitle || getSelectedRecipient().jobTitle || ""}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Software Engineer"
                />
              </div>
            </div>

            {(documentType === "offer_letter" || documentType === "employment_contract") && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Annual Salary
                  </Label>
                  <Input
                    value={salary}
                    onChange={(e) => setSalary(e.target.value)}
                    placeholder="$120,000"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    Start Date
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {/* Optional Fields Section */}
            <div className="pt-4 border-t border-border">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-medium text-muted-foreground">Optional Details</span>
                <span className="text-xs text-muted-foreground">(Adds more detail to your document)</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-4 w-4" />
                    Authorized Representative Name
                  </Label>
                  <Input
                    value={hiringManagerName}
                    onChange={(e) => setHiringManagerName(e.target.value)}
                    placeholder="Jane Smith"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    Representative Title
                  </Label>
                  <Input
                    value={hiringManagerTitle}
                    onChange={(e) => setHiringManagerTitle(e.target.value)}
                    placeholder="HR Director"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 mt-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    Company Address
                  </Label>
                  <Input
                    value={companyAddress}
                    onChange={(e) => setCompanyAddress(e.target.value)}
                    placeholder="123 Business Ave, Suite 100, City, State ZIP"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    Company Email
                  </Label>
                  <Input
                    type="email"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    placeholder="hr@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    Company Phone
                  </Label>
                  <Input
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Additional Terms or Notes (Optional)</Label>
              <Textarea
                value={additionalTerms}
                onChange={(e) => setAdditionalTerms(e.target.value)}
                placeholder="Add any specific clauses or requirements..."
                className="min-h-[100px]"
              />
            </div>
          </motion.div>
        );

      case "generate":
        return (
          <motion.div
            key="step-generate"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col items-center justify-center min-h-[400px]"
          >
            {isGenerating ? (
              <AILoadingAnimation />
            ) : (
              <div className="text-center space-y-6">
                <div className="w-24 h-24 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                  <Sparkles className="h-12 w-12 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Ready to Generate</h3>
                  <p className="text-muted-foreground max-w-md">
                    Our AI will create a professional{" "}
                    {DOCUMENT_TYPES.find(t => t.value === documentType)?.label} based on your inputs.
                  </p>
                </div>
                <Button size="lg" onClick={generateDocument} className="gap-2">
                  <Wand2 className="h-5 w-5" />
                  Generate Document
                </Button>
              </div>
            )}
          </motion.div>
        );

      case "upload":
        return (
          <motion.div
            key="step-upload"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            {/* Document Name */}
            <div className="space-y-2">
              <Label>Document Name</Label>
              <Input
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                placeholder="e.g., Employment Agreement - John Doe"
              />
            </div>

            {/* Upload Area */}
            {!uploadedFile ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "border-2 border-dashed rounded-xl p-12 text-center transition-colors",
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className="flex flex-col items-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
                    <FileUp className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium mb-1">
                      {isDragging ? "Drop your file here" : "Drag and drop your file here"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      or click to browse
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                    className="hidden"
                    id="file-upload"
                  />
                  <Button
                    variant="outline"
                    onClick={() => document.getElementById("file-upload")?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Browse Files
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Supported formats: PDF, DOC, DOCX, TXT • Max size: 10MB
                  </p>
                </div>
              </div>
            ) : (
              <div className="border rounded-xl p-4 bg-secondary/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{uploadedFile.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={removeUploadedFile}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {isAnalyzingDocument ? (
                  <div className="mt-3 flex items-center gap-2 text-sm text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing document and placing signature fields...
                  </div>
                ) : uploadedFileUrl && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-success">
                    <Check className="h-4 w-4" />
                    {uploadedFile?.type === "application/pdf" 
                      ? "Document analyzed - signature fields placed automatically"
                      : "File uploaded successfully"}
                  </div>
                )}
              </div>
            )}

            {/* Document Type Selection for uploads */}
            <div className="space-y-2">
              <Label>Document Type (for categorization)</Label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </motion.div>
        );

      case "review":
        if (documentSource === "upload") {
          const isPdf = uploadedFile?.type === "application/pdf";
          
          if (isPdf && uploadedFileUrl) {
            // Guided click-to-place mode - compact layout for maximum PDF preview
            return (
              <motion.div
                key="step-review-upload-pdf"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-1"
              >
                <PdfSignaturePlacer
                  pdfUrl={uploadedFileUrl}
                  signatureFields={signatureFields}
                  onFieldsChange={setSignatureFields}
                  guidedMode={true}
                />
              </motion.div>
            );
          }
          
          // Review step for non-PDF uploaded documents (legacy signature fields)
          return (
            <motion.div
              key="step-review-upload"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6"
            >
              {/* Document Preview */}
              <div className="space-y-4">
                <h3 className="font-semibold">Document Preview</h3>
                <div className="border rounded-xl p-6 bg-secondary/30 min-h-[300px] flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mb-4">
                    <FileText className="h-8 w-8 text-primary" />
                  </div>
                  <p className="font-medium">{documentName || uploadedFile?.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {uploadedFile?.type || "Document"}
                  </p>
                </div>
              </div>

              {/* Signature Fields */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Signature Fields</h3>
                  <Button variant="outline" size="sm" onClick={addLegacySignatureField}>
                    Add Field
                  </Button>
                </div>
                
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    <strong>Signing Order:</strong> Candidate signs first, then employer countersigns.
                  </p>
                </div>

                <div className="space-y-3">
                  {legacySignatureFields.map((field) => (
                    <div
                      key={field.id}
                      className="p-3 rounded-lg border border-border bg-secondary/30 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        {field.id === "recipient" && (
                          <Badge variant="outline" className="text-xs">Candidate</Badge>
                        )}
                        {field.id === "employer" && (
                          <Badge variant="outline" className="text-xs">Employer</Badge>
                        )}
                      </div>
                      <Input
                        value={field.label}
                        onChange={(e) => updateLegacySignatureField(field.id, { label: e.target.value })}
                        placeholder="Field label"
                        className="text-sm"
                      />
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => updateLegacySignatureField(field.id, { required: e.target.checked })}
                            className="rounded"
                          />
                          Required
                        </label>
                        {field.id !== "recipient" && field.id !== "employer" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLegacySignatureField(field.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2 text-primary mb-2">
                    <PenTool className="h-4 w-4" />
                    <span className="text-sm font-medium">Signing Flow</span>
                  </div>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p>1. Candidate receives & signs</p>
                    <p>2. Employer countersigns</p>
                    <p>3. Document is complete</p>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        }

        // Review step for AI-generated documents
        return (
          <motion.div
            key="step-review-generate"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Document Preview & Edit */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Document Content</h3>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={generateDocument}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Regenerate
                      </>
                    )}
                  </Button>
                </div>
              </div>
              <Textarea
                value={generatedContent}
                onChange={(e) => setGeneratedContent(e.target.value)}
                className="min-h-[400px] max-h-[500px] font-mono text-xs bg-white dark:bg-secondary/30"
                placeholder="Document content will appear here..."
              />
              <p className="text-xs text-muted-foreground">
                You can edit the document content directly above before sending.
              </p>
            </div>

            {/* Signature Fields */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Signature Fields</h3>
                <Button variant="outline" size="sm" onClick={addLegacySignatureField}>
                  Add Field
                </Button>
              </div>
              
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  <strong>Signing Order:</strong> Candidate signs first, then employer countersigns.
                </p>
              </div>

              <div className="space-y-3">
                {legacySignatureFields.map((field) => (
                  <div
                    key={field.id}
                    className="p-3 rounded-lg border border-border bg-secondary/30 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      {field.id === "recipient" && (
                        <Badge variant="outline" className="text-xs">Candidate</Badge>
                      )}
                      {field.id === "employer" && (
                        <Badge variant="outline" className="text-xs">Employer</Badge>
                      )}
                    </div>
                    <Input
                      value={field.label}
                      onChange={(e) => updateLegacySignatureField(field.id, { label: e.target.value })}
                      placeholder="Field label"
                      className="text-sm"
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => updateLegacySignatureField(field.id, { required: e.target.checked })}
                          className="rounded"
                        />
                        Required
                      </label>
                      {field.id !== "recipient" && field.id !== "employer" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLegacySignatureField(field.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2 text-primary mb-2">
                  <PenTool className="h-4 w-4" />
                  <span className="text-sm font-medium">Signing Flow</span>
                </div>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>1. Candidate receives & signs</p>
                  <p>2. Employer countersigns</p>
                  <p>3. Document is complete</p>
                </div>
              </div>
            </div>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0">
        {/* Progress Header */}
        <div className="border-b border-border p-6 bg-gradient-to-r from-primary/5 to-primary/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                {documentSource === "upload" ? (
                  <Upload className="h-5 w-5 text-primary" />
                ) : (
                  <Wand2 className="h-5 w-5 text-primary" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-semibold">{WIZARD_STEPS[currentStep]?.title || "Create Document"}</h2>
                <p className="text-sm text-muted-foreground">{WIZARD_STEPS[currentStep]?.subtitle || ""}</p>
              </div>
            </div>
            <span className="text-sm text-muted-foreground">
              Step {currentStep + 1} of {WIZARD_STEPS.length}
            </span>
          </div>
          
          {/* Progress Bar */}
          <div className="flex gap-2">
            {WIZARD_STEPS.map((step, index) => (
              <div
                key={step.id}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  index <= currentStep ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <AnimatePresence mode="wait">
            {renderStepContent()}
          </AnimatePresence>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-border p-4 flex items-center justify-between bg-background">
          <Button
            variant="outline"
            onClick={currentStep === 0 ? handleClose : handleBack}
            disabled={isGenerating || isSubmitting || isUploading}
          >
            {currentStep === 0 ? (
              "Cancel"
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </>
            )}
          </Button>

          {getCurrentStepId() === "source" ? (
            <div /> // Empty div for spacing on source step
          ) : getCurrentStepId() === "review" ? (
            <Button onClick={handleSubmit} disabled={!canProceed() || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send for Signature
                </>
              )}
            </Button>
          ) : (
            <Button 
              onClick={handleNext} 
              disabled={!canProceed() || isGenerating || isUploading}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : getCurrentStepId() === "generate" ? (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Generate
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AILoadingAnimation() {
  return (
    <div className="flex flex-col items-center justify-center space-y-8">
      {/* Animated Logo */}
      <div className="relative">
        <motion.div
          className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center"
          animate={{
            scale: [1, 1.05, 1],
            rotate: [0, 5, -5, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <Sparkles className="h-12 w-12 text-primary" />
        </motion.div>
        
        {/* Orbiting particles */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute w-3 h-3 rounded-full bg-primary/60"
            style={{
              top: "50%",
              left: "50%",
            }}
            animate={{
              x: [0, 50 * Math.cos((i * 2 * Math.PI) / 3), 0],
              y: [0, 50 * Math.sin((i * 2 * Math.PI) / 3), 0],
              opacity: [0.6, 1, 0.6],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.3,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Dynamic Text */}
      <motion.div
        className="text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <h3 className="text-xl font-semibold mb-2">Generating Your Document</h3>
        <motion.p
          className="text-muted-foreground"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          AI is crafting a professional document...
        </motion.p>
      </motion.div>

      {/* Progress Steps */}
      <div className="flex items-center gap-3">
        {["Analyzing", "Writing", "Formatting"].map((step, i) => (
          <motion.div
            key={step}
            className="flex items-center gap-2"
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.6,
            }}
          >
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-sm text-muted-foreground">{step}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
