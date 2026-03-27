import { useState } from "react";
import { useCreateApplication } from "@/hooks/useApplications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { invokeTriggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";
import type { Tables } from "@/integrations/supabase/types";

interface JobApplicationDialogProps {
  job: Tables<"jobs"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function JobApplicationDialog({
  job,
  open,
  onOpenChange,
}: JobApplicationDialogProps) {
  const [coverLetter, setCoverLetter] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createApplication = useCreateApplication();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;

    setIsSubmitting(true);
    
    try {
      // Create application WITHOUT ai_score/ai_analysis - backend will handle scoring
      const result = await createApplication.mutateAsync({
        job_id: job.id,
        cover_letter: coverLetter || null,
        resume_url: resumeUrl || null,
        // DO NOT set ai_analysis or ai_score here - backend is the single source of truth
      });

      // Trigger backend analysis - this is the ONLY place scoring happens
      // The backend will process the resume (PDF→image), run AI analysis, and set ai_score
      invokeTriggerAvaAnalysis({
        applicationId: result.id,
        force: true,
      }).catch(err => {
        console.error("[JobApplicationDialog] Failed to trigger AVA analysis:", err);
      });

      toast.success("Application submitted!", {
        description: "Ava is analyzing your application...",
      });
      
      onOpenChange(false);
      setCoverLetter("");
      setResumeUrl("");
    } catch (error: any) {
      toast.error(error.message || "Failed to submit application");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Apply for {job?.title}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Submit your application for this position
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="resumeUrl" className="text-foreground">Resume URL (optional)</Label>
            <Input
              id="resumeUrl"
              placeholder="https://example.com/my-resume.pdf"
              value={resumeUrl}
              onChange={(e) => setResumeUrl(e.target.value)}
              className="bg-background border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coverLetter" className="text-foreground">Cover Letter (optional)</Label>
            <Textarea
              id="coverLetter"
              placeholder="Tell us why you're a great fit for this role..."
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              rows={6}
              className="bg-background border-border resize-none"
            />
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">
              Ava will analyze your application after submission
            </span>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Submit Application
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
