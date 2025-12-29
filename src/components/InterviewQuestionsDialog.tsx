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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Loader2, Sparkles, Copy, Check, ChevronDown, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
  category?: string;
}

// Categorize questions based on content
function categorizeQuestion(question: string): string {
  const q = question.toLowerCase();
  
  if (q.includes('sales') || q.includes('quota') || q.includes('close') || q.includes('prospect') || q.includes('pipeline')) {
    return 'Core Sales Fundamentals';
  }
  if (q.includes('adapt') || q.includes('challenge') || q.includes('difficult') || q.includes('change') || q.includes('obstacle') || q.includes('failure')) {
    return 'Adaptability & Judgment';
  }
  if (q.includes('team') || q.includes('culture') || q.includes('why') || q.includes('fit') || q.includes('collaborate') || q.includes('manager')) {
    return 'Team & Role Fit';
  }
  if (q.includes('pressure') || q.includes('compete') || q.includes('deadline') || q.includes('stress') || q.includes('conflict')) {
    return 'Competitive Pressure Scenario';
  }
  
  return 'General Assessment';
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
    
    // Validate "What to Look For" is complete - not ending with colon/incomplete phrase and has sufficient content
    const incompleteEndings = [':', 'should', 'should:', 'include:', 'for:', 'like:', 'such as:'];
    const lookForLower = lookFor.toLowerCase();
    const isIncomplete = incompleteEndings.some(ending => lookForLower.endsWith(ending)) || lookFor.length < 25;
    
    if (isIncomplete && lookFor.length > 0) {
      // The response was truncated or incomplete - append meaningful completion
      lookFor = lookFor.replace(/:$/, '') + ' demonstrate relevant experience through specific examples, articulate clear reasoning, and show understanding of best practices for the role.';
    }
    
    questions.push({
      question: questionText,
      assesses: assesses || 'Evaluates candidate skills and experience relevant to the role',
      lookFor: lookFor || 'Candidate should provide specific examples with measurable outcomes, demonstrate clear understanding of the concept, and articulate their approach with confidence and clarity.',
      category: categorizeQuestion(questionText),
    });
  }
  
  console.log('[InterviewQuestions] Parsed questions count:', questions.length);
  return questions;
}

// Group questions by category
function groupQuestionsByCategory(questions: ParsedQuestion[]): Record<string, ParsedQuestion[]> {
  const groups: Record<string, ParsedQuestion[]> = {};
  
  const categoryOrder = [
    'Core Sales Fundamentals',
    'Adaptability & Judgment',
    'Team & Role Fit',
    'Competitive Pressure Scenario',
    'General Assessment',
  ];
  
  // Initialize groups in order
  categoryOrder.forEach(cat => {
    groups[cat] = [];
  });
  
  // Distribute questions
  questions.forEach(q => {
    const cat = q.category || 'General Assessment';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(q);
  });
  
  // Remove empty categories
  Object.keys(groups).forEach(key => {
    if (groups[key].length === 0) delete groups[key];
  });
  
  return groups;
}

// Question card with collapsible assessment guidance
function QuestionCard({ 
  question, 
  index, 
  onCopy, 
  isCopied 
}: { 
  question: ParsedQuestion; 
  index: number; 
  onCopy: () => void; 
  isCopied: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <Card className="bg-secondary/20 border-border overflow-hidden">
      <CardHeader className="bg-primary/5 py-3 px-4 border-b border-border">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-primary font-semibold text-xs">{index}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-foreground text-sm leading-relaxed">
              {question.question}
            </h4>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground flex-shrink-0"
            onClick={onCopy}
          >
            {isCopied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </CardHeader>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger className="w-full px-4 py-2 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors border-b border-border/50">
          <span>Assessment guidance</span>
          <ChevronDown className={cn(
            "h-3.5 w-3.5 transition-transform",
            isExpanded && "rotate-180"
          )} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-4 pt-3 space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Assesses</p>
              <p className="text-sm text-foreground/80 leading-relaxed">{question.assesses}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Look for</p>
              <p className="text-sm text-foreground/80 leading-relaxed">{question.lookFor}</p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
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
  
  // Group questions by category
  const groupedQuestions = useMemo(() => {
    return groupQuestionsByCategory(parsedQuestions);
  }, [parsedQuestions]);

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
      toast.success("Question copied");
    } catch (err) {
      toast.error("Failed to copy");
    }
  };

  const handleCopyAll = async () => {
    try {
      const allQuestions = parsedQuestions
        .map((q, i) => `${i + 1}. ${q.question}`)
        .join('\n\n');
      await navigator.clipboard.writeText(allQuestions);
      toast.success("All questions copied");
    } catch (err) {
      toast.error("Failed to copy");
    }
  };

  const handleGenerate = async () => {
    if (!interview?.id) {
      toast.error("No interview scheduled");
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
      
      // Build the content string that the edge function expects
      const contentParts = [
        `Job Title: ${job?.title || "Position"}`,
        `Job Description: ${job?.description || "Not provided"}`,
        job?.requirements ? `Requirements: ${job.requirements}` : null,
        job?.responsibilities ? `Responsibilities: ${job.responsibilities}` : null,
        `Candidate Name: ${profile?.full_name || "Candidate"}`,
        previousAnalysis ? `Previous AI Analysis Summary: ${previousAnalysis.substring(0, 500)}...` : null,
        coverLetter ? `Cover Letter: ${coverLetter}` : null,
      ].filter(Boolean).join('\n\n');
      
      const { data, error } = await supabase.functions.invoke("ai-analyze", {
        body: {
          type: "interview",
          content: contentParts,
          resumeUrl,
          coverLetter,
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

        toast.success(`${parsed.length} questions generated`);
        
        onQuestionsGenerated?.(questionsToSave);
      }
    } catch (error: any) {
      console.error("[InterviewQuestions] Generation error:", error);
      toast.error(error.message || "Failed to generate questions");
    } finally {
      setIsGenerating(false);
      // Keep isRegeneratingRef true briefly to prevent immediate sync overwrite
      setTimeout(() => {
        isRegeneratingRef.current = false;
      }, 1000);
    }
  };
  
  // Track global question index for numbering
  let globalIndex = 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Interview Questions
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {profile?.full_name || "Candidate"} — {job?.title || "Position"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-[200px] max-h-[65vh] pr-4 overflow-y-auto">
          {parsedQuestions.length > 0 ? (
            <div className="space-y-5">
              {/* Usage guidance */}
              <p className="text-xs text-muted-foreground italic">
                Select 4–6 questions based on interview length and candidate profile.
              </p>
              
              {/* Grouped questions */}
              {Object.entries(groupedQuestions).map(([category, questions]) => (
                <div key={category} className="space-y-3">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {category}
                  </h3>
                  <div className="space-y-3">
                    {questions.map((q) => {
                      globalIndex++;
                      const currentIndex = globalIndex;
                      return (
                        <QuestionCard
                          key={currentIndex}
                          question={q}
                          index={currentIndex}
                          onCopy={() => handleCopy(q.question, currentIndex)}
                          isCopied={copiedIndex === currentIndex}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                <HelpCircle className="h-8 w-8 text-primary/50" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Generate Interview Questions</h3>
              <p className="text-muted-foreground max-w-sm mx-auto text-sm">
                Create tailored questions based on the job and candidate profile.
              </p>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {parsedQuestions.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleCopyAll} className="sm:mr-auto gap-2">
              <Copy className="h-3.5 w-3.5" />
              Copy All
            </Button>
          )}
          <Button onClick={handleGenerate} disabled={isGenerating} size="sm" className="gap-2">
            {isGenerating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <Sparkles className="h-3.5 w-3.5" />
            {parsedQuestions.length > 0 ? "Regenerate" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
