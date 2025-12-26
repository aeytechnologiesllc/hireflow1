import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SecurityBadge } from "./SecurityBadge";
import { useAuth } from "@/hooks/useAuth";
import { useCreateDocumentRequest } from "@/hooks/useDocumentRequests";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  ChevronRight,
  ChevronLeft,
  Check,
  User,
  FileText,
  Settings,
  Send,
  CalendarDays,
  CreditCard,
  FileCheck,
  Briefcase,
  IdCard,
  Home,
  Building2,
  Plus,
  X,
  Loader2,
  Shield,
} from "lucide-react";

interface Application {
  id: string;
  candidate_id: string;
  jobs: {
    id: string;
    title: string;
  } | null;
  profiles: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  } | null;
}

interface DocumentRequestWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applications: Application[];
}

interface DocumentType {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
}

const DOCUMENT_TYPES: DocumentType[] = [
  {
    id: "drivers_license",
    label: "Driver's License",
    description: "Valid government-issued driver's license",
    icon: IdCard,
  },
  {
    id: "ssn_card",
    label: "Social Security Card",
    description: "Social Security card for employment verification",
    icon: CreditCard,
  },
  {
    id: "passport",
    label: "Passport",
    description: "Valid passport for identity verification",
    icon: FileCheck,
  },
  {
    id: "work_authorization",
    label: "Work Authorization",
    description: "I-9, work visa, or employment authorization",
    icon: Briefcase,
  },
  {
    id: "tax_form",
    label: "Tax Forms",
    description: "W-9, W-4, 1099, or other tax documents",
    icon: FileText,
  },
  {
    id: "proof_of_address",
    label: "Proof of Address",
    description: "Utility bill, bank statement, or lease agreement",
    icon: Home,
  },
  {
    id: "bank_details",
    label: "Bank Details",
    description: "Voided check or bank letter for direct deposit",
    icon: Building2,
  },
];

const STEPS = [
  { id: "recipient", label: "Select Recipient", icon: User },
  { id: "documents", label: "Choose Documents", icon: FileText },
  { id: "configure", label: "Configure", icon: Settings },
  { id: "review", label: "Review & Send", icon: Send },
];

export function DocumentRequestWizard({
  open,
  onOpenChange,
  applications,
}: DocumentRequestWizardProps) {
  const { user } = useAuth();
  const createRequest = useCreateDocumentRequest();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [selectedDocTypes, setSelectedDocTypes] = useState<string[]>([]);
  const [customDocName, setCustomDocName] = useState("");
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [isRequired, setIsRequired] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [dueDateOpen, setDueDateOpen] = useState(false);

  const activeApplications = applications;

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleDocTypeToggle = (docType: string) => {
    setSelectedDocTypes((prev) =>
      prev.includes(docType)
        ? prev.filter((t) => t !== docType)
        : [...prev, docType]
    );
  };

  const handleSend = async () => {
    if (!selectedApplication || !user) return;

    setIsSending(true);
    try {
      const requests = selectedDocTypes.map((docType) => ({
        application_id: selectedApplication.id,
        employer_id: user.id,
        candidate_id: selectedApplication.candidate_id,
        document_type: docType,
        custom_document_name: docType === "custom" ? customDocName : null,
        description: descriptions[docType] || null,
        is_required: isRequired,
        due_date: dueDate?.toISOString() || null,
      }));

      await createRequest.mutateAsync(requests);
      
      // Reset and close
      resetWizard();
      onOpenChange(false);
    } finally {
      setIsSending(false);
    }
  };

  const resetWizard = () => {
    setCurrentStep(0);
    setSelectedApplication(null);
    setSelectedDocTypes([]);
    setCustomDocName("");
    setDescriptions({});
    setDueDate(undefined);
    setIsRequired(true);
  };

  const canProceed = useMemo(() => {
    switch (currentStep) {
      case 0:
        return !!selectedApplication;
      case 1:
        return selectedDocTypes.length > 0 && 
          (!selectedDocTypes.includes("custom") || customDocName.trim().length > 0);
      case 2:
        return true;
      case 3:
        return true;
      default:
        return false;
    }
  }, [currentStep, selectedApplication, selectedDocTypes, customDocName]);

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {STEPS.map((step, index) => {
        const StepIcon = step.icon;
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;

        return (
          <div key={step.id} className="flex items-center">
            <div
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300",
                isActive && "bg-primary text-primary-foreground shadow-glow",
                isCompleted && "bg-success text-success-foreground",
                !isActive && !isCompleted && "bg-secondary text-muted-foreground"
              )}
            >
              {isCompleted ? (
                <Check className="h-5 w-5" />
              ) : (
                <StepIcon className="h-5 w-5" />
              )}
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-12 h-0.5 mx-1",
                  isCompleted ? "bg-success" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  const renderRecipientStep = () => (
    <div className="space-y-4">
      <p className="text-muted-foreground text-center">
        Select an applicant to request documents from
      </p>
      <ScrollArea className="h-[300px] pr-4">
        <div className="grid gap-3">
          {activeApplications.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="p-6 text-center">
                <User className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No active applicants found</p>
              </CardContent>
            </Card>
          ) : (
            activeApplications.map((app) => {
              const name = app.profiles?.full_name || app.profiles?.email || "Unknown";
              const initials = name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);
              const isSelected = selectedApplication?.id === app.id;

              return (
                <motion.div
                  key={app.id}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <Card
                    className={cn(
                      "cursor-pointer transition-all duration-200",
                      isSelected
                        ? "border-primary bg-primary/5 shadow-glow"
                        : "border-border hover:border-primary/50"
                    )}
                    onClick={() => {
                      setSelectedApplication(app);
                      // Auto-progress to next step after selecting recipient
                      setTimeout(() => setCurrentStep(1), 300);
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={app.profiles?.avatar_url || undefined} />
                          <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground">{name}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {app.jobs?.title || "No job assigned"}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-4 w-4 text-primary-foreground" />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );

  const renderDocumentsStep = () => (
    <div className="space-y-4">
      <p className="text-muted-foreground text-center">
        Select the documents you need from {selectedApplication?.profiles?.full_name || "the candidate"}
      </p>
      <ScrollArea className="h-[300px] pr-4">
        <div className="grid gap-3">
          {DOCUMENT_TYPES.map((docType) => {
            const DocIcon = docType.icon;
            const isSelected = selectedDocTypes.includes(docType.id);

            return (
              <motion.div
                key={docType.id}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <Card
                  className={cn(
                    "cursor-pointer transition-all duration-200",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                  onClick={() => handleDocTypeToggle(docType.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center",
                        isSelected ? "bg-primary/20" : "bg-secondary"
                      )}>
                        <DocIcon className={cn(
                          "h-5 w-5",
                          isSelected ? "text-primary" : "text-muted-foreground"
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{docType.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {docType.description}
                        </p>
                      </div>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleDocTypeToggle(docType.id)}
                      />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}

          {/* Custom document option */}
          <Card
            className={cn(
              "cursor-pointer transition-all duration-200",
              selectedDocTypes.includes("custom")
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            )}
            onClick={() => handleDocTypeToggle("custom")}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  selectedDocTypes.includes("custom") ? "bg-primary/20" : "bg-secondary"
                )}>
                  <Plus className={cn(
                    "h-5 w-5",
                    selectedDocTypes.includes("custom") ? "text-primary" : "text-muted-foreground"
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Custom Document</p>
                  <p className="text-sm text-muted-foreground">
                    Request any other document
                  </p>
                </div>
                <Checkbox
                  checked={selectedDocTypes.includes("custom")}
                  onCheckedChange={() => handleDocTypeToggle("custom")}
                />
              </div>
              {selectedDocTypes.includes("custom") && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-3"
                >
                  <Input
                    placeholder="Enter document name..."
                    value={customDocName}
                    onChange={(e) => setCustomDocName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </motion.div>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );

  const renderConfigureStep = () => (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Due Date (Optional)</Label>
          <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start">
                <CalendarDays className="h-4 w-4 mr-2" />
                {dueDate ? format(dueDate, "PPP") : "Select due date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dueDate}
                onSelect={(date) => {
                  setDueDate(date);
                  setDueDateOpen(false);
                }}
                disabled={(date) => date < new Date()}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="required"
            checked={isRequired}
            onCheckedChange={(checked) => setIsRequired(checked as boolean)}
          />
          <Label htmlFor="required" className="cursor-pointer">
            Mark as required
          </Label>
        </div>
      </div>

      <div className="space-y-3">
        <Label>Instructions for Each Document (Optional)</Label>
        {selectedDocTypes.map((docType) => {
          const docInfo = DOCUMENT_TYPES.find((d) => d.id === docType);
          const label = docType === "custom" ? customDocName : docInfo?.label || docType;

          return (
            <div key={docType} className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <Textarea
                placeholder={`Add instructions for ${label}...`}
                value={descriptions[docType] || ""}
                onChange={(e) =>
                  setDescriptions((prev) => ({
                    ...prev,
                    [docType]: e.target.value,
                  }))
                }
                rows={2}
              />
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderReviewStep = () => {
    const candidateName = selectedApplication?.profiles?.full_name || "the candidate";

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center">
          <SecurityBadge variant="secure" size="lg" />
        </div>

        <Card className="bg-secondary/50 border-border">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={selectedApplication?.profiles?.avatar_url || undefined} />
                <AvatarFallback>
                  {candidateName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-foreground">{candidateName}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedApplication?.jobs?.title}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Requesting {selectedDocTypes.length} document{selectedDocTypes.length > 1 ? "s" : ""}:
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedDocTypes.map((docType) => {
                  const docInfo = DOCUMENT_TYPES.find((d) => d.id === docType);
                  const label = docType === "custom" ? customDocName : docInfo?.label || docType;
                  return (
                    <Badge key={docType} variant="secondary">
                      {label}
                    </Badge>
                  );
                })}
              </div>
            </div>

            {dueDate && (
              <div className="flex items-center gap-2 text-sm">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Due by:</span>
                <span className="font-medium">{format(dueDate, "PPP")}</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm">
              <Badge variant={isRequired ? "default" : "outline"}>
                {isRequired ? "Required" : "Optional"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
          <Shield className="h-5 w-5 text-primary" />
          <p className="text-sm text-primary">
            The candidate will receive a secure notification to upload their documents.
          </p>
        </div>
      </div>
    );
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return renderRecipientStep();
      case 1:
        return renderDocumentsStep();
      case 2:
        return renderConfigureStep();
      case 3:
        return renderReviewStep();
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetWizard();
      onOpenChange(open);
    }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Request Documents
              </DialogTitle>
              <DialogDescription>
                {STEPS[currentStep].label}
              </DialogDescription>
            </div>
            <SecurityBadge variant="encrypted" size="sm" />
          </div>
        </DialogHeader>

        {renderStepIndicator()}

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

        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>

          {currentStep < STEPS.length - 1 ? (
            <Button onClick={handleNext} disabled={!canProceed}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSend} disabled={isSending || !canProceed}>
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Request
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
