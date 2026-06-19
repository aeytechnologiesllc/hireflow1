import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, PartyPopper, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

interface HiringDocumentPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  jobTitle: string;
  applicationId: string;
  onSkip: () => void;
}

export function HiringDocumentPromptDialog({
  open,
  onOpenChange,
  candidateName,
  jobTitle,
  applicationId,
  onSkip,
}: HiringDocumentPromptDialogProps) {
  const navigate = useNavigate();

  const handleSendDocuments = () => {
    onOpenChange(false);
    // Navigate to Documents page with query params to auto-open wizard for this applicant
    navigate(`/documents?applicant_id=${applicationId}&action=create`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center pb-2">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="mx-auto mb-4 w-16 h-16 rounded-full bg-gradient-to-br from-success/20 to-primary/20 flex items-center justify-center"
          >
            <PartyPopper className="h-8 w-8 text-primary" />
          </motion.div>
          <DialogTitle className="text-xl">
            Congratulations on the hire!
          </DialogTitle>
          <DialogDescription className="text-center pt-2">
            Would you like to send hiring documents to{" "}
            <span className="font-medium text-foreground">{candidateName}</span>{" "}
            for{" "}
            <span className="font-medium text-foreground">{jobTitle}</span>?
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground text-center pb-4">
          Documents like offer letters, employment contracts, or NDAs can be
          created and sent for signature.
        </p>

        <div className="space-y-3">
          <Button
            onClick={handleSendDocuments}
            className="w-full bg-gradient-to-r from-primary to-success hover:from-primary/90 hover:to-success/90 text-primary-foreground"
          >
            <FileText className="mr-2 h-4 w-4" />
            Send Hiring Documents
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          <Button
            onClick={onSkip}
            variant="ghost"
            className="w-full text-muted-foreground hover:text-foreground"
          >
            Skip for now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}