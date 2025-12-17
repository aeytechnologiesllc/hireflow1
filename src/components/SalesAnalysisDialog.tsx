import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, TrendingUp, Target, MessageSquare, Handshake, ThumbsUp, ThumbsDown, HelpCircle } from "lucide-react";

interface SalesAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: {
    evaluation?: {
      score?: number;
      wouldBuy?: string;
      discovery?: number;
      objectionHandling?: number;
      valueProposition?: number;
      closingSkills?: number;
      strengths?: string[];
      improvements?: string[];
    };
    messages?: Array<{ role: string; content: string }>;
    antiCheatLog?: {
      totalViolations: number;
      tabSwitches: number;
      copyAttempts: number;
      pasteAttempts: number;
    };
    score?: number;
  };
}

export function SalesAnalysisDialog({ open, onOpenChange, data }: SalesAnalysisDialogProps) {
  const evaluation = data?.evaluation;
  const score = evaluation?.score ?? data?.score;
  
  const getScoreColor = (value: number | undefined | null) => {
    if (value === null || value === undefined) return "text-muted-foreground";
    if (value >= 70) return "text-emerald-500";
    if (value >= 50) return "text-amber-500";
    return "text-red-400";
  };

  const formatScore = (value: number | undefined | null) => {
    if (value === null || value === undefined) return "N/A";
    return `${value}%`;
  };

  const getWouldBuyIcon = () => {
    if (evaluation?.wouldBuy === "yes") return <ThumbsUp className="h-5 w-5 text-emerald-500" />;
    if (evaluation?.wouldBuy === "maybe") return <HelpCircle className="h-5 w-5 text-amber-500" />;
    return <ThumbsDown className="h-5 w-5 text-red-400" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Sales Simulation Analysis
          </DialogTitle>
          <DialogDescription>
            Detailed performance breakdown and conversation transcript
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="space-y-6">
            {/* Overall Score + Would Buy */}
            <div className="flex items-center gap-6 p-4 bg-muted/30 rounded-lg border border-border">
              <div className="text-center">
                <p className={`text-4xl font-bold ${getScoreColor(score)}`}>
                  {score ?? "N/A"}
                </p>
                <p className="text-sm text-muted-foreground">/100</p>
              </div>
              <div className="h-12 w-px bg-border" />
              <div className="flex items-center gap-3">
                {getWouldBuyIcon()}
                <div>
                  <p className="text-sm text-muted-foreground">Would Buy</p>
                  <p className={`font-semibold ${
                    evaluation?.wouldBuy === "yes" ? "text-emerald-500" :
                    evaluation?.wouldBuy === "maybe" ? "text-amber-500" : "text-red-400"
                  }`}>
                    {evaluation?.wouldBuy === "yes" ? "Yes" :
                     evaluation?.wouldBuy === "maybe" ? "Maybe" : "No"}
                  </p>
                </div>
              </div>
            </div>

            {/* Category Scores */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Category Scores
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Discovery</span>
                    <span className={`font-bold ${getScoreColor(evaluation?.discovery)}`}>
                      {formatScore(evaluation?.discovery)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        (evaluation?.discovery ?? 0) >= 70 ? "bg-emerald-500" :
                        (evaluation?.discovery ?? 0) >= 50 ? "bg-amber-500" : "bg-red-400"
                      }`}
                      style={{ width: `${evaluation?.discovery ?? 0}%` }}
                    />
                  </div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Objection Handling</span>
                    <span className={`font-bold ${getScoreColor(evaluation?.objectionHandling)}`}>
                      {formatScore(evaluation?.objectionHandling)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        (evaluation?.objectionHandling ?? 0) >= 70 ? "bg-emerald-500" :
                        (evaluation?.objectionHandling ?? 0) >= 50 ? "bg-amber-500" : "bg-red-400"
                      }`}
                      style={{ width: `${evaluation?.objectionHandling ?? 0}%` }}
                    />
                  </div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Value Proposition</span>
                    <span className={`font-bold ${getScoreColor(evaluation?.valueProposition)}`}>
                      {formatScore(evaluation?.valueProposition)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        (evaluation?.valueProposition ?? 0) >= 70 ? "bg-emerald-500" :
                        (evaluation?.valueProposition ?? 0) >= 50 ? "bg-amber-500" : "bg-red-400"
                      }`}
                      style={{ width: `${evaluation?.valueProposition ?? 0}%` }}
                    />
                  </div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Closing Skills</span>
                    <span className={`font-bold ${getScoreColor(evaluation?.closingSkills)}`}>
                      {formatScore(evaluation?.closingSkills)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        (evaluation?.closingSkills ?? 0) >= 70 ? "bg-emerald-500" :
                        (evaluation?.closingSkills ?? 0) >= 50 ? "bg-amber-500" : "bg-red-400"
                      }`}
                      style={{ width: `${evaluation?.closingSkills ?? 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Strengths */}
            {evaluation?.strengths && evaluation.strengths.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-emerald-500 mb-2">Strengths</h4>
                <ul className="space-y-1.5">
                  {evaluation.strengths.map((s, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-emerald-500 mt-0.5">•</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Improvements */}
            {evaluation?.improvements && evaluation.improvements.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-amber-500 mb-2">Areas for Improvement</h4>
                <ul className="space-y-1.5">
                  {evaluation.improvements.map((s, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5">•</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Anti-cheat Summary */}
            {data?.antiCheatLog && data.antiCheatLog.totalViolations > 0 && (
              <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
                <h4 className="text-sm font-semibold text-destructive mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Anti-Cheat Violations ({data.antiCheatLog.totalViolations})
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 bg-background rounded">
                    Tab Switches: {data.antiCheatLog.tabSwitches}
                  </div>
                  <div className="p-2 bg-background rounded">
                    Copy/Paste: {(data.antiCheatLog.copyAttempts || 0) + (data.antiCheatLog.pasteAttempts || 0)}
                  </div>
                </div>
              </div>
            )}

            {/* Conversation Transcript */}
            {data?.messages && data.messages.length > 0 && (
              <div className="border-t border-border pt-4">
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Sales Conversation ({data.messages.length} messages)
                </h4>
                <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                  {data.messages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === "salesRep" || msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`p-3 rounded-lg max-w-[80%] ${
                        msg.role === "salesRep" || msg.role === "user" 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-muted"
                      }`}>
                        <p className="text-xs font-medium mb-1 opacity-70">
                          {msg.role === "salesRep" || msg.role === "user" ? "Candidate" : "Prospect"}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
