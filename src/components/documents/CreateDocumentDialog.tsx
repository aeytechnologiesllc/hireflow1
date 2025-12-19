import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Send, Loader2 } from "lucide-react";

interface Application {
  id: string;
  candidate_id: string;
  profiles?: {
    full_name: string | null;
    email: string;
  } | null;
  jobs?: {
    title: string;
  } | null;
}

interface CreateDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applications: Application[];
}

const DOCUMENT_TYPES = [
  { value: "offer_letter", label: "Offer Letter" },
  { value: "nda", label: "Non-Disclosure Agreement (NDA)" },
  { value: "employment_contract", label: "Employment Contract" },
  { value: "background_check", label: "Background Check Authorization" },
  { value: "benefits_enrollment", label: "Benefits Enrollment Form" },
  { value: "tax_form", label: "Tax Form (W-4/W-9)" },
  { value: "other", label: "Other Document" },
];

const DOCUMENT_TEMPLATES: Record<string, string> = {
  offer_letter: `OFFER LETTER

Dear [Candidate Name],

We are pleased to extend an offer of employment for the position of [Job Title] at [Company Name].

Start Date: [Start Date]
Salary: [Salary Amount] per year
Employment Type: Full-time

This offer is contingent upon successful completion of background verification and signing of our standard employment agreements.

Please sign below to accept this offer.

Signature: _______________________
Date: _______________________

We look forward to having you join our team!

Sincerely,
[Hiring Manager Name]
[Company Name]`,

  nda: `NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into between:

Company: [Company Name]
Individual: [Candidate Name]

1. CONFIDENTIAL INFORMATION
The Individual agrees to hold in confidence all proprietary information, trade secrets, and confidential business information disclosed by the Company.

2. OBLIGATIONS
The Individual shall:
- Not disclose confidential information to third parties
- Use confidential information only for authorized purposes
- Return all confidential materials upon request

3. TERM
This Agreement shall remain in effect for a period of two (2) years from the date of signing.

4. GOVERNING LAW
This Agreement shall be governed by applicable laws.

SIGNATURES

Individual: _______________________
Date: _______________________

Company Representative: _______________________
Date: _______________________`,

  employment_contract: `EMPLOYMENT CONTRACT

This Employment Contract is entered into between [Company Name] ("Employer") and [Candidate Name] ("Employee").

1. POSITION AND DUTIES
Position: [Job Title]
Start Date: [Start Date]
The Employee agrees to perform duties as assigned by the Employer.

2. COMPENSATION
Base Salary: [Salary Amount] per year
Payment Schedule: Bi-weekly

3. BENEFITS
- Health Insurance
- 401(k) Retirement Plan
- Paid Time Off

4. AT-WILL EMPLOYMENT
This employment is at-will and may be terminated by either party at any time.

5. CONFIDENTIALITY
The Employee agrees to maintain confidentiality of all proprietary information.

SIGNATURES

Employee: _______________________
Date: _______________________

Employer Representative: _______________________
Date: _______________________`,
};

export function CreateDocumentDialog({ open, onOpenChange, applications }: CreateDocumentDialogProps) {
  const [selectedApplication, setSelectedApplication] = useState<string>("");
  const [documentType, setDocumentType] = useState<string>("");
  const [documentName, setDocumentName] = useState("");
  const [documentContent, setDocumentContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleDocumentTypeChange = (type: string) => {
    setDocumentType(type);
    const template = DOCUMENT_TEMPLATES[type];
    if (template) {
      // Auto-fill candidate and job info if application is selected
      const app = applications.find(a => a.id === selectedApplication);
      let content = template;
      if (app) {
        content = content.replace(/\[Candidate Name\]/g, app.profiles?.full_name || "Candidate");
        content = content.replace(/\[Job Title\]/g, app.jobs?.title || "Position");
      }
      setDocumentContent(content);
    }
    // Auto-set document name
    const typeLabel = DOCUMENT_TYPES.find(t => t.value === type)?.label || type;
    setDocumentName(typeLabel);
  };

  const handleApplicationChange = (appId: string) => {
    setSelectedApplication(appId);
    // Update template with new candidate info
    if (documentType && DOCUMENT_TEMPLATES[documentType]) {
      const app = applications.find(a => a.id === appId);
      let content = DOCUMENT_TEMPLATES[documentType];
      if (app) {
        content = content.replace(/\[Candidate Name\]/g, app.profiles?.full_name || "Candidate");
        content = content.replace(/\[Job Title\]/g, app.jobs?.title || "Position");
      }
      setDocumentContent(content);
    }
  };

  const handleSubmit = async () => {
    if (!selectedApplication || !documentType || !documentName || !documentContent) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const app = applications.find(a => a.id === selectedApplication);
      
      // Create document record with a placeholder file URL (in production, you'd upload to storage)
      const { data: document, error: docError } = await supabase
        .from("documents")
        .insert({
          application_id: selectedApplication,
          name: documentName,
          document_type: documentType,
          file_url: `data:text/plain;base64,${btoa(documentContent)}`,
          status: "pending" as const,
          sender_id: user.id,
          recipient_id: app?.candidate_id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        } as any)
        .select()
        .single();

      if (docError) throw docError;

      // Create audit log entry
      await supabase.from("document_audit_logs").insert({
        document_id: document.id,
        user_id: user.id,
        action: "created",
        details: { document_type: documentType, recipient: app?.profiles?.email },
        ip_address: null,
        user_agent: navigator.userAgent,
      });

      // Create notification for the candidate
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
        description: "The document has been sent for signature.",
      });

      queryClient.invalidateQueries({ queryKey: ["documents"] });
      onOpenChange(false);
      resetForm();
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

  const resetForm = () => {
    setSelectedApplication("");
    setDocumentType("");
    setDocumentName("");
    setDocumentContent("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Create New Document
          </DialogTitle>
          <DialogDescription>
            Create and send a document for signature to a candidate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Select Candidate</Label>
              <Select value={selectedApplication} onValueChange={handleApplicationChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a candidate" />
                </SelectTrigger>
                <SelectContent>
                  {applications.map((app) => (
                    <SelectItem key={app.id} value={app.id}>
                      {app.profiles?.full_name || app.profiles?.email} - {app.jobs?.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Document Type</Label>
              <Select value={documentType} onValueChange={handleDocumentTypeChange}>
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
          </div>

          <div className="space-y-2">
            <Label>Document Name</Label>
            <Input
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              placeholder="Enter document name"
            />
          </div>

          <div className="space-y-2">
            <Label>Document Content</Label>
            <Textarea
              value={documentContent}
              onChange={(e) => setDocumentContent(e.target.value)}
              placeholder="Enter or modify the document content..."
              className="min-h-[300px] font-mono text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send for Signature
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
