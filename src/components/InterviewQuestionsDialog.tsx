import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Sparkles, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { InterviewWithDetails } from "@/hooks/useInterviews";

interface InterviewQuestionsDialogProps {
  interview: InterviewWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQuestionsGenerated?: (questions: string[]) => void;
}

export default function InterviewQuestionsDialog({
  interview,
  open,
  onOpenChange,
  onQuestionsGenerated,
}: InterviewQuestionsDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [questions, setQuestions] = useState<string | null>(
    interview?.ai_questions?.join("\n\n") || null
  );
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const application = interview?.applications;
  const job = application?.jobs;
  const profile = application?.profiles as any;

  const handleGenerate = async () => {
    if (!interview || !job) return;

    setIsGenerating(true);
    try {
      const content = `
Job Title: ${job.title}
Job Description: ${job.description}
Requirements: ${job.requirements || "Not specified"}
Experience Level: ${job.experience_level || "Not specified"}

Candidate Information:
Name: ${profile?.full_name || "Unknown"}
Experience: ${profile?.experience_years ? `${profile.experience_years} years` : "Not specified"}
Skills: ${profile?.skills?.join(", ") || "Not specified"}
Background: ${profile?.bio || "Not provided"}

Interview Type: ${interview.interview_type || "Video"}
Duration: ${interview.duration_minutes || 60} minutes
      `;

      const { data, error } = await supabase.functions.invoke("ai-analyze", {
        body: {
          type: "interview",
          content,
          context: {
            skills_required: job.skills_required,
          },
        },
      });

      if (error) throw error;

      setQuestions(data.analysis);

      // Split questions for saving
      const questionsList = data.analysis
        .split(/\d+\.\s+/)
        .filter((q: string) => q.trim().length > 0)
        .slice(0, 10);

      if (onQuestionsGenerated) {
        onQuestionsGenerated(questionsList);
      }

      toast.success("Interview questions generated!");
    } catch (error) {
      console.error("Failed to generate questions:", error);
      toast.error("Failed to generate questions");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
    toast.success("Copied to clipboard");
  };

  const handleCopyAll = async () => {
    if (questions) {
      await navigator.clipboard.writeText(questions);
      toast.success("All questions copied to clipboard");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Interview Questions
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Generate tailored interview questions for {profile?.full_name || "this candidate"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] pr-4">
          {questions ? (
            <Card className="bg-secondary/30 border-border">
              <CardContent className="p-4">
                <pre className="text-sm text-foreground whitespace-pre-wrap font-sans">
                  {questions}
                </pre>
              </CardContent>
            </Card>
          ) : (
            <div className="py-12 text-center">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">
                Click "Generate Questions" to create tailored interview questions based on the job requirements and candidate profile.
              </p>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {questions && (
            <Button variant="outline" onClick={handleCopyAll} className="sm:mr-auto">
              <Copy className="h-4 w-4 mr-2" />
              Copy All
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Sparkles className="mr-2 h-4 w-4" />
            {questions ? "Regenerate" : "Generate Questions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
