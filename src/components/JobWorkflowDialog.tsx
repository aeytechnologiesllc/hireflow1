import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  MessageSquare,
  HelpCircle,
  CheckCircle2,
  Clock,
  Keyboard,
  Video,
  Upload,
  AlertTriangle
} from "lucide-react";
import AvaGlyph from "@/components/AvaGlyph";
import type { Tables } from "@/integrations/supabase/types";

interface ApplicationQuestion {
  id: string;
  type: string;
  question: string;
  required: boolean;
  placeholder?: string;
}

interface QuizQuestion {
  id: string;
  type: string;
  question: string;
  options?: string[];
  correct_answer: string;
  time_limit_seconds: number;
  category: string;
}

interface WorkflowStep {
  id: string;
  type: string;
  title: string;
  description: string;
  required: boolean;
  config: Record<string, unknown>;
}

interface JobWorkflowDialogProps {
  job: Tables<"jobs"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEP_ICONS: Record<string, React.ElementType> = {
  typing_test: Keyboard,
  video_message: Video,
  chat_simulation: MessageSquare,
  sales_simulation: AvaGlyph,
  portfolio_upload: Upload,
};

// Helper to check if a quiz question has a valid correct answer
const hasValidCorrectAnswer = (q: QuizQuestion): boolean => {
  if (!q.options || q.options.length === 0) return true; // Non-option questions are fine
  return q.options.some(opt => 
    String(opt).toLowerCase().trim() === String(q.correct_answer || '').toLowerCase().trim()
  );
};

export default function JobWorkflowDialog({ job, open, onOpenChange }: JobWorkflowDialogProps) {
  if (!job) return null;

  const applicationQuestions = (job.application_questions as unknown as ApplicationQuestion[]) || [];
  const quizQuestions = (job.quiz_questions as unknown as QuizQuestion[]) || [];
  const workflowSteps = (job.workflow_steps as unknown as WorkflowStep[]) || [];
  const hasWorkflow = applicationQuestions.length > 0 || quizQuestions.length > 0 || workflowSteps.length > 0;

  const difficultyLabels: Record<string, { label: string; color: string }> = {
    easy: { label: "Easy", color: "text-success" },
    medium: { label: "Medium", color: "text-muted-foreground" },
    hard: { label: "Hard", color: "text-warning" },
    intense: { label: "Intense", color: "text-destructive" },
  };

  const difficulty = difficultyLabels[job.workflow_difficulty || "medium"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-foreground">
            <AvaGlyph className="h-5 w-5 text-primary" />
            AI Hiring Workflow
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {job.title} • Difficulty: <span className={difficulty.color}>{difficulty.label}</span>
          </p>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          {!hasWorkflow ? (
            <div className="text-center py-12 text-muted-foreground">
              <AvaGlyph className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No workflow has been configured for this job</p>
              <p className="text-sm mt-1">Workflows are generated when publishing a job</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Application Questions */}
              {applicationQuestions.length > 0 && (
                <Card className="bg-background border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      Application Questions ({applicationQuestions.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {applicationQuestions.map((q, index) => (
                      <div key={q.id} className="p-3 rounded-lg bg-muted/30 border border-border">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">
                              {index + 1}. {q.question}
                            </p>
                            {q.placeholder && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Placeholder: {q.placeholder}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {q.type}
                            </Badge>
                            {q.required && (
                              <Badge className="bg-primary/20 text-primary text-xs">
                                Required
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Quiz Questions */}
              {quizQuestions.length > 0 && (
                <Card className="bg-background border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <HelpCircle className="h-4 w-4 text-accent" />
                      Timed Quiz Questions ({quizQuestions.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {quizQuestions.map((q, index) => (
                      <div key={q.id} className="p-3 rounded-lg bg-muted/30 border border-border">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-sm font-medium text-foreground flex-1">
                            {index + 1}. {q.question}
                          </p>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {!hasValidCorrectAnswer(q) && (
                              <Badge variant="destructive" className="text-xs flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                No valid answer
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-xs">
                              {q.category}
                            </Badge>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {q.time_limit_seconds}s
                            </div>
                          </div>
                        </div>
                        {q.options && q.options.length > 0 && (
                          <div className="space-y-1 mt-2">
                            {q.options.map((option, optIndex) => (
                              <div 
                                key={optIndex}
                                className={`text-xs p-2 rounded flex items-center gap-2 ${
                                  option === q.correct_answer 
                                    ? "bg-primary/10 text-primary border border-primary/30" 
                                    : "bg-muted/50 text-muted-foreground"
                                }`}
                              >
                                {option === q.correct_answer && (
                                  <CheckCircle2 className="h-3 w-3" />
                                )}
                                {option}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Workflow Steps */}
              {workflowSteps.length > 0 && (
                <Card className="bg-background border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AvaGlyph className="h-4 w-4 text-primary" />
                      Workflow Steps ({workflowSteps.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {workflowSteps.map((step, index) => {
                      const StepIcon = STEP_ICONS[step.type] || AvaGlyph;
                      return (
                        <div key={step.id} className="p-3 rounded-lg bg-muted/30 border border-border">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                              <StepIcon className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-foreground">
                                  {index + 1}. {step.title}
                                </p>
                                {step.required && (
                                  <Badge className="bg-primary/20 text-primary text-xs">
                                    Required
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {step.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}