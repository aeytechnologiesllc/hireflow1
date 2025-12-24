import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Sparkles, Copy, Check, Target, CheckCircle, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { InterviewWithDetails } from "@/hooks/useInterviews";

interface InterviewQuestionsDialogProps {
  interview: InterviewWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQuestionsGenerated?: (questions: string[]) => void;
}

interface ParsedQuestion {
  question: string;
  assesses: string;
  lookFor: string;
}

// Parse AI-generated markdown into structured questions
function parseQuestionsFromMarkdown(markdown: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  
  // Split by question numbers (1., 2., 3., etc.)
  const questionBlocks = markdown.split(/(?=\d+\.\s)/);
  
  for (const block of questionBlocks) {
    if (!block.trim()) continue;
    
    // Extract question text (first line after the number)
    const lines = block.split('\n').filter(l => l.trim());
    if (lines.length === 0) continue;
    
    // Get the question (remove the number prefix and any ** markers)
    let questionText = lines[0].replace(/^\d+\.\s*/, '').replace(/\*\*/g, '').trim();
    if (!questionText) continue;
    
    let assesses = '';
    let lookFor = '';
    
    // Look for "What it assesses" or similar patterns
    const fullBlock = block.toLowerCase();
    
    // Find "assesses" content
    const assessIndex = fullBlock.indexOf('assess');
    if (assessIndex !== -1) {
      const afterAssess = block.substring(assessIndex);
      const assessMatch = afterAssess.match(/assess[es]*[:\s]*([^\n]+)/i);
      if (assessMatch) {
        assesses = assessMatch[1].replace(/\*\*/g, '').replace(/^[:\s-]+/, '').trim();
      }
    }
    
    // Find "look for" content
    const lookForIndex = fullBlock.indexOf('look for');
    if (lookForIndex !== -1) {
      const afterLookFor = block.substring(lookForIndex);
      const lookForMatch = afterLookFor.match(/look for[:\s]*([^\n]+(?:\n(?![0-9]+\.|###)[^\n]+)*)/i);
      if (lookForMatch) {
        lookFor = lookForMatch[1].replace(/\*\*/g, '').replace(/^[:\s-]+/, '').replace(/\n/g, ' ').trim();
      }
    }
    
    // If no structured content found, check for bullet points
    if (!assesses && !lookFor) {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].replace(/\*\*/g, '').replace(/^[-•*]\s*/, '').trim();
        if (line.toLowerCase().includes('assess')) {
          assesses = line.replace(/assess[es]*[:\s]*/i, '').trim();
        } else if (line.toLowerCase().includes('look for')) {
          lookFor = line.replace(/look for[:\s]*/i, '').trim();
        } else if (!assesses && line.length > 10) {
          assesses = line;
        } else if (!lookFor && line.length > 10) {
          lookFor = line;
        }
      }
    }
    
    questions.push({
      question: questionText,
      assesses: assesses || 'Evaluates candidate skills and experience relevant to the role',
      lookFor: lookFor || 'Clear, specific examples with measurable outcomes',
    });
  }
  
  return questions;
}

export default function InterviewQuestionsDialog({
  interview,
  open,
  onOpenChange,
  onQuestionsGenerated,
}: InterviewQuestionsDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [rawQuestions, setRawQuestions] = useState<string | null>(
    interview?.ai_questions?.join("\n\n") || null
  );
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const application = interview?.applications;
  const job = application?.jobs;
  const profile = application?.profiles as any;

  // Parse questions into structured format
  const parsedQuestions = useMemo(() => {
    if (!rawQuestions) return [];
    return parseQuestionsFromMarkdown(rawQuestions);
  }, [rawQuestions]);

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

Please generate 5-7 tailored interview questions. For each question, include:
1. The question itself
2. What it assesses (skills/competencies being evaluated)
3. What to look for in a good answer
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

      setRawQuestions(data.analysis);

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
    if (parsedQuestions.length > 0) {
      const allText = parsedQuestions
        .map((q, i) => `${i + 1}. ${q.question}\n   Assesses: ${q.assesses}\n   Look for: ${q.lookFor}`)
        .join('\n\n');
      await navigator.clipboard.writeText(allText);
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
            Tailored interview questions for {profile?.full_name || "this candidate"} - {job?.title || "position"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] pr-4">
          {parsedQuestions.length > 0 ? (
            <div className="space-y-4">
              {parsedQuestions.map((q, index) => (
                <Card key={index} className="bg-secondary/20 border-border overflow-hidden">
                  <CardHeader className="bg-primary/5 py-3 px-4 border-b border-border">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary font-semibold text-sm">{index + 1}</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-foreground text-sm leading-relaxed">
                          {q.question}
                        </h4>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground flex-shrink-0"
                        onClick={() => handleCopy(q.question, index)}
                      >
                        {copiedIndex === index ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex gap-3">
                      <Target className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-blue-500 mb-1">What it Assesses</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">{q.assesses}</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-green-500 mb-1">What to Look For</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">{q.lookFor}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                <HelpCircle className="h-8 w-8 text-primary/50" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Generate Interview Questions</h3>
              <p className="text-muted-foreground max-w-sm mx-auto">
                Create tailored questions based on the job requirements and candidate profile to conduct an effective interview.
              </p>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {parsedQuestions.length > 0 && (
            <Button variant="outline" onClick={handleCopyAll} className="sm:mr-auto gap-2">
              <Copy className="h-4 w-4" />
              Copy All Questions
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating} className="gap-2">
            {isGenerating && <Loader2 className="h-4 w-4 animate-spin" />}
            <Sparkles className="h-4 w-4" />
            {parsedQuestions.length > 0 ? "Regenerate" : "Generate Questions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
