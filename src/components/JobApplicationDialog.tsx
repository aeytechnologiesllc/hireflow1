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
import { supabase } from "@/integrations/supabase/client";
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const createApplication = useCreateApplication();

  const analyzeApplication = async (jobData: Tables<"jobs">) => {
    if (!coverLetter && !resumeUrl) return null;

    setIsAnalyzing(true);
    try {
      const content = `
Job Title: ${jobData.title}
Job Description: ${jobData.description}
Requirements: ${jobData.requirements || "Not specified"}

Candidate Cover Letter:
${coverLetter || "Not provided"}

Resume URL: ${resumeUrl || "Not provided"}
      `;

      const { data, error } = await supabase.functions.invoke("ai-analyze", {
        body: {
          type: "application",
          content,
          context: {
            skills_required: jobData.skills_required,
            experience_level: jobData.experience_level,
          },
        },
      });

      if (error) throw error;

      // Extract score from analysis (simple regex for "Score: XX" pattern)
      const scoreMatch = data.analysis?.match(/Score[:\s]+(\d+)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

      return {
        analysis: data.analysis,
        score: score && score >= 0 && score <= 100 ? score : null,
      };
    } catch (error) {
      console.error("AI analysis error:", error);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;

    try {
      // Run AI analysis
      const aiResult = await analyzeApplication(job);

      await createApplication.mutateAsync({
        job_id: job.id,
        cover_letter: coverLetter || null,
        resume_url: resumeUrl || null,
        ai_analysis: aiResult?.analysis || null,
        ai_score: aiResult?.score || null,
      });

      toast.success("Application submitted successfully!");
      onOpenChange(false);
      setCoverLetter("");
      setResumeUrl("");
    } catch (error: any) {
      toast.error(error.message || "Failed to submit application");
    }
  };

  const isPending = createApplication.isPending || isAnalyzing;

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
              Your application will be analyzed by AI to help employers understand your fit
            </span>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isAnalyzing ? "Analyzing..." : "Submit Application"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
