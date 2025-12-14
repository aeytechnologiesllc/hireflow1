import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FileText, 
  Sparkles, 
  ChevronRight, 
  ChevronLeft,
  Send,
  User,
  Building2,
  Calendar,
  DollarSign,
  PenTool,
  Check,
  Loader2,
  Wand2
} from "lucide-react";
import type { ApplicationForDocument } from "@/hooks/useApplicationsForDocuments";

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
];

const WIZARD_STEPS = [
  { id: "type", title: "Document Type", subtitle: "Choose the type of document to create" },
  { id: "recipient", title: "Recipient", subtitle: "Select or enter recipient details" },
  { id: "details", title: "Document Details", subtitle: "Provide information for the document" },
  { id: "generate", title: "AI Generation", subtitle: "Generate your document with AI" },
  { id: "review", title: "Review & Sign", subtitle: "Review and add signature fields" },
];

export function DocumentWizard({ open, onOpenChange, applications }: DocumentWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [documentType, setDocumentType] = useState("");
  const [selectedApplication, setSelectedApplication] = useState<string>("");
  const [isManualRecipient, setIsManualRecipient] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [salary, setSalary] = useState("");
  const [startDate, setStartDate] = useState("");
  const [additionalTerms, setAdditionalTerms] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [signatureFields, setSignatureFields] = useState<{ id: string; label: string; required: boolean }[]>([
    { id: "recipient", label: "Recipient Signature", required: true },
    { id: "employer", label: "Employer Signature", required: true },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const resetWizard = () => {
    setCurrentStep(0);
    setDocumentType("");
    setSelectedApplication("");
    setIsManualRecipient(false);
    setRecipientName("");
    setRecipientEmail("");
    setCompanyName("");
    setJobTitle("");
    setSalary("");
    setStartDate("");
    setAdditionalTerms("");
    setGeneratedContent("");
    setIsGenerating(false);
    setSignatureFields([
      { id: "recipient", label: "Recipient Signature", required: true },
      { id: "employer", label: "Employer Signature", required: true },
    ]);
  };

  const handleClose = () => {
    resetWizard();
    onOpenChange(false);
  };

  const getSelectedRecipient = () => {
    if (isManualRecipient) {
      return { name: recipientName, email: recipientEmail };
    }
    const app = applications.find(a => a.id === selectedApplication);
    return {
      name: app?.profiles?.full_name || "",
      email: app?.profiles?.email || "",
      jobTitle: app?.jobs?.title || jobTitle,
    };
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return !!documentType;
      case 1:
        return isManualRecipient 
          ? (recipientName.trim() && recipientEmail.trim())
          : !!selectedApplication;
      case 2:
        return companyName.trim() && (jobTitle.trim() || getSelectedRecipient().jobTitle);
      case 3:
        return !!generatedContent;
      case 4:
        return signatureFields.length > 0;
      default:
        return true;
    }
  };

  const handleNext = async () => {
    if (currentStep === 3 && !generatedContent) {
      await generateDocument();
    } else if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const generateDocument = async () => {
    setIsGenerating(true);
    
    const recipient = getSelectedRecipient();
    const docTypeLabel = DOCUMENT_TYPES.find(t => t.value === documentType)?.label || documentType;

    try {
      const { data, error } = await supabase.functions.invoke("ai-generate-document", {
        body: {
          documentType,
          recipientName: recipient.name || recipientName,
          companyName,
          jobTitle: recipient.jobTitle || jobTitle,
          salary,
          startDate,
          additionalTerms,
        },
      });

      if (error) throw error;

      setGeneratedContent(data.content);
      setCurrentStep(4);
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

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const recipient = getSelectedRecipient();
      const app = applications.find(a => a.id === selectedApplication);
      
      // Prepare document data with signature fields
      const documentData = {
        content: generatedContent,
        signatureFields,
        metadata: {
          companyName,
          jobTitle: recipient.jobTitle || jobTitle,
          salary,
          startDate,
          recipientName: recipient.name || recipientName,
          recipientEmail: recipient.email || recipientEmail,
        },
      };

      // Create document record
      const { data: document, error: docError } = await supabase
        .from("documents")
        .insert({
          application_id: selectedApplication || null,
          name: `${DOCUMENT_TYPES.find(t => t.value === documentType)?.label} - ${recipient.name || recipientName || "Draft"}`,
          document_type: documentType,
          file_url: `data:application/json;base64,${btoa(JSON.stringify(documentData))}`,
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
          documentType, 
          generatedWithAI: true,
          recipient: recipient.email || recipientEmail,
        },
        user_agent: navigator.userAgent,
      });

      // Notify candidate if applicable
      if (app?.candidate_id) {
        await supabase.from("notifications").insert([{
          user_id: app.candidate_id,
          title: "New Document to Sign",
          message: `You have a new ${DOCUMENT_TYPES.find(t => t.value === documentType)?.label} to review and sign.`,
          type: "system" as const,
          link: "/documents",
        }]);
      }

      toast({
        title: "Document Created",
        description: "Your document has been generated and sent for signature.",
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

  const addSignatureField = () => {
    setSignatureFields(prev => [
      ...prev,
      { id: `field_${Date.now()}`, label: "New Signature Field", required: false },
    ]);
  };

  const removeSignatureField = (id: string) => {
    setSignatureFields(prev => prev.filter(f => f.id !== id));
  };

  const updateSignatureField = (id: string, updates: Partial<typeof signatureFields[0]>) => {
    setSignatureFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0">
        {/* Progress Header */}
        <div className="border-b border-border p-6 bg-gradient-to-r from-primary/5 to-primary/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Wand2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{WIZARD_STEPS[currentStep].title}</h2>
                <p className="text-sm text-muted-foreground">{WIZARD_STEPS[currentStep].subtitle}</p>
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
            {/* Step 1: Document Type */}
            {currentStep === 0 && (
              <motion.div
                key="step-0"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="grid grid-cols-2 gap-4"
              >
                {DOCUMENT_TYPES.map((type) => {
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
            )}

            {/* Step 2: Recipient */}
            {currentStep === 1 && (
              <motion.div
                key="step-1"
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
            )}

            {/* Step 3: Document Details */}
            {currentStep === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
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
                        <Calendar className="h-4 w-4" />
                        Start Date
                      </Label>
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                      />
                    </div>
                  </div>
                )}

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
            )}

            {/* Step 4: AI Generation */}
            {currentStep === 3 && (
              <motion.div
                key="step-3"
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
            )}

            {/* Step 5: Review & Signature Fields */}
            {currentStep === 4 && (
              <motion.div
                key="step-4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-6"
              >
                {/* Document Preview */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Document Preview</h3>
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
                  <div className="bg-white dark:bg-secondary/30 rounded-xl border border-border p-6 min-h-[400px] max-h-[500px] overflow-y-auto">
                    <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap font-mono text-xs">
                      {generatedContent}
                    </div>
                  </div>
                </div>

                {/* Signature Fields */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Signature Fields</h3>
                    <Button variant="outline" size="sm" onClick={addSignatureField}>
                      Add Field
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {signatureFields.map((field) => (
                      <div
                        key={field.id}
                        className="p-3 rounded-lg border border-border bg-secondary/30 space-y-2"
                      >
                        <Input
                          value={field.label}
                          onChange={(e) => updateSignatureField(field.id, { label: e.target.value })}
                          placeholder="Field label"
                          className="text-sm"
                        />
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(e) => updateSignatureField(field.id, { required: e.target.checked })}
                              className="rounded"
                            />
                            Required
                          </label>
                          {field.id !== "recipient" && field.id !== "employer" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeSignatureField(field.id)}
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
                      <span className="text-sm font-medium">Signature Preview</span>
                    </div>
                    <div className="border-2 border-dashed border-primary/30 rounded-lg p-4 text-center">
                      <p className="text-xs text-muted-foreground">
                        Signature fields will appear here for signing
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-border p-4 flex items-center justify-between bg-background">
          <Button
            variant="outline"
            onClick={currentStep === 0 ? handleClose : handleBack}
            disabled={isGenerating || isSubmitting}
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

          {currentStep === WIZARD_STEPS.length - 1 ? (
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
              disabled={!canProceed() || isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : currentStep === 3 ? (
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
          className="w-32 h-32 rounded-3xl bg-gradient-to-br from-primary via-primary/80 to-primary/60 flex items-center justify-center shadow-2xl shadow-primary/30"
          animate={{
            scale: [1, 1.05, 1],
            rotate: [0, 5, -5, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          >
            <Sparkles className="h-16 w-16 text-white" />
          </motion.div>
        </motion.div>
        
        {/* Orbiting particles */}
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-3 h-3 rounded-full bg-primary"
            style={{
              top: "50%",
              left: "50%",
            }}
            animate={{
              x: [0, Math.cos(i * (Math.PI * 2) / 3) * 80],
              y: [0, Math.sin(i * (Math.PI * 2) / 3) * 80],
              scale: [0, 1, 0],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.5,
              ease: "easeOut",
            }}
          />
        ))}
      </div>

      {/* Loading Text */}
      <div className="text-center space-y-2">
        <motion.h3 
          className="text-xl font-semibold"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          Generating Your Document
        </motion.h3>
        <div className="flex items-center justify-center gap-1">
          {["Analyzing", "requirements", "..."].map((word, i) => (
            <motion.span
              key={i}
              className="text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.3 }}
            >
              {word}
            </motion.span>
          ))}
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {[
          "Understanding document type",
          "Incorporating your details",
          "Generating legal content",
          "Adding signature fields",
        ].map((step, i) => (
          <motion.div
            key={i}
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.8 }}
          >
            <motion.div
              className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center"
              animate={{
                backgroundColor: ["hsl(var(--primary) / 0.2)", "hsl(var(--primary))", "hsl(var(--primary) / 0.2)"],
              }}
              transition={{ duration: 1.5, delay: i * 0.8, repeat: Infinity }}
            >
              <Check className="h-3 w-3 text-primary-foreground" />
            </motion.div>
            <span className="text-sm text-muted-foreground">{step}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
