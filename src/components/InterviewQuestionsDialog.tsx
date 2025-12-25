import { useState, useMemo, useEffect, useRef } from "react";
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
  
  // Split by **Question:** pattern (the AI generates questions in this format)
  const questionBlocks = markdown.split(/\*\*Question:\*\*/i);
  
  console.log('[InterviewQuestions] Parsing markdown, blocks found:', questionBlocks.length - 1);
  
  for (let i = 1; i < questionBlocks.length; i++) {
    const block = questionBlocks[i];
    const trimmedBlock = block.trim();
    
    // Skip empty blocks
    if (!trimmedBlock || trimmedBlock.length < 10) continue;
    
    const lines = trimmedBlock.split('\n');
    
    // First non-empty line is the question text
    let questionText = '';
    for (const line of lines) {
      const cleaned = line.replace(/\*\*/g, '').trim();
      if (cleaned && !cleaned.startsWith('-') && !cleaned.startsWith('###') && !cleaned.startsWith('•')) {
        questionText = cleaned;
        break;
      }
    }
    
    if (!questionText || questionText.length < 10) continue;
    
    let assesses = '';
    let lookFor = '';
    
    // Look for **What it assesses:** pattern
    const assessMatch = trimmedBlock.match(/\*\*What it assesses:\*\*\s*([^\n]+)/i);
    if (assessMatch) {
      assesses = assessMatch[1].trim();
    }
    
    // Look for **What to look for in a good answer:** pattern
    const lookForMatch = trimmedBlock.match(/\*\*What to look for[^:]*:\*\*\s*([^\n]+)/i);
    if (lookForMatch) {
      lookFor = lookForMatch[1].trim();
    }
    
    questions.push({
      question: questionText,
      assesses: assesses || 'Evaluates candidate skills and experience relevant to the role',
      lookFor: lookFor || 'Clear, specific examples with measurable outcomes',
    });
  }
  
  console.log('[InterviewQuestions] Parsed questions count:', questions.length);
  return questions;
}

export default function InterviewQuestionsDialog({
  interview,
  open,
  onOpenChange,
  onQuestionsGenerated,
}: InterviewQuestionsDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [rawQuestions, setRawQuestions] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  
  // Track if we're actively regenerating to prevent sync overwriting fresh data
  const isRegeneratingRef = useRef(false);
  // Track the interview ID we last synced from
  const lastSyncedInterviewIdRef = useRef<string | null>(null);

  // Sync rawQuestions with interview prop when dialog opens or interview changes
  // But NOT during active regeneration
  useEffect(() => {
    if (!open) {
      // Reset refs when dialog closes
      isRegeneratingRef.current = false;
      lastSyncedInterviewIdRef.current = null;
      return;
    }
    
    // Don't overwrite if we're actively regenerating
    if (isRegeneratingRef.current) {
      console.log('[InterviewQuestions] Skipping sync - regenerating in progress');
      return;
    }
    
    const interviewId = interview?.id || null;
    
    // Only sync if this is a new interview or first open
    if (interviewId === lastSyncedInterviewIdRef.current && rawQuestions !== null) {
      console.log('[InterviewQuestions] Skipping sync - already synced this interview');
      return;
    }
    
    if (interview?.ai_questions && interview.ai_questions.length > 0) {
      console.log('[InterviewQuestions] Syncing from interview.ai_questions:', interview.ai_questions.length, 'items');
      setRawQuestions(interview.ai_questions.join("\n\n"));
      lastSyncedInterviewIdRef.current = interviewId;
    } else if (!interview?.ai_questions) {
      setRawQuestions(null);
      lastSyncedInterviewIdRef.current = interviewId;
    }
  }, [open, interview?.id, interview?.ai_questions]);

  const application = interview?.applications;
  const job = application?.jobs;
  const profile = application?.profiles as any;

  // Parse questions into structured format
  const parsedQuestions = useMemo(() => {
    if (!rawQuestions) return [];
    return parseQuestionsFromMarkdown(rawQuestions);
  }, [rawQuestions]);

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
      toast.success("Question copied to clipboard");
    } catch (err) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleCopyAll = async () => {
    try {
      const allQuestions = parsedQuestions
        .map((q, i) => `${i + 1}. ${q.question}`)
        .join('\n\n');
      await navigator.clipboard.writeText(allQuestions);
      toast.success("All questions copied to clipboard");
    } catch (err) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleGenerate = async () => {
    if (!interview?.id) {
      toast.error("No interview scheduled. Please schedule an interview first.");
      return;
    }

    setIsGenerating(true);
    isRegeneratingRef.current = true; // Prevent sync from overwriting
    
    try {
      // Fetch the full application to get resume_url, cover_letter, ai_analysis
      let resumeUrl = null;
      let coverLetter = null;
      let previousAnalysis = null;
      
      if (application?.id) {
        const { data: fullApp } = await supabase
          .from("applications")
          .select("resume_url, cover_letter, ai_analysis")
          .eq("id", application.id)
          .single();
        
        if (fullApp) {
          resumeUrl = fullApp.resume_url;
          coverLetter = fullApp.cover_letter;
          previousAnalysis = fullApp.ai_analysis;
        }
      }
      
      const { data, error } = await supabase.functions.invoke("ai-analyze", {
        body: {
          type: "interview",
          jobTitle: job?.title || "Position",
          jobDescription: job?.description || "",
          requirements: job?.requirements || "",
          responsibilities: job?.responsibilities || "",
          candidateName: profile?.full_name || "Candidate",
          resumeUrl,
          coverLetter,
          previousAnalysis,
        },
      });

      if (error) throw error;

      if (data?.analysis) {
        console.log('[InterviewQuestions] AI returned analysis, length:', data.analysis.length);
        
        // Set the raw questions for display
        setRawQuestions(data.analysis);
        
        // Parse the questions to build proper storage format
        const parsed = parseQuestionsFromMarkdown(data.analysis);
        console.log('[InterviewQuestions] Parsed', parsed.length, 'questions for storage');
        
        // Build full question blocks for storage (preserving structure for re-parsing)
        const questionsToSave = parsed.map(q => 
          `**Question:** ${q.question}\n- **What it assesses:** ${q.assesses}\n- **What to look for in a good answer:** ${q.lookFor}`
        );
        
        console.log('[InterviewQuestions] Saving', questionsToSave.length, 'question blocks to database');

        // Save to database
        const { error: updateError } = await supabase
          .from("interviews")
          .update({ ai_questions: questionsToSave })
          .eq("id", interview.id);

        if (updateError) {
          console.error('[InterviewQuestions] Failed to save:', updateError);
          throw updateError;
        }

        toast.success(`${parsed.length} interview questions generated and saved`);
        
        onQuestionsGenerated?.(questionsToSave);
      }
    } catch (error: any) {
      console.error("[InterviewQuestions] Generation error:", error);
      toast.error(error.message || "Failed to generate interview questions");
    } finally {
      setIsGenerating(false);
      // Keep isRegeneratingRef true briefly to prevent immediate sync overwrite
      setTimeout(() => {
        isRegeneratingRef.current = false;
      }, 1000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Interview Questions
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Tailored interview questions for {profile?.full_name || "this candidate"} - {job?.title || "position"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-[200px] max-h-[65vh] pr-4 overflow-y-auto">
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
