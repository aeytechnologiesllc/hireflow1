import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ChevronDown, ShieldCheck, Shield, ShieldAlert, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface ApplicantAISummaryProps {
  summary?: string | null;
  fullAnalysis?: string | null;
  aiScore?: number | null;
  trustLevel?: "high" | "medium" | "low";
  isAnalyzing?: boolean;
  onReanalyze?: () => void;
  className?: string;
}

// Extract first 1-2 sentences for condensed view
function extractSummary(text: string | null | undefined): string {
  if (!text) return "No analysis available yet.";
  
  // Split by sentence-ending punctuation
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  // Take first 2 sentences
  const summary = sentences.slice(0, 2).join(" ").trim();
  
  // If still too long, truncate
  if (summary.length > 200) {
    return summary.slice(0, 197) + "...";
  }
  
  return summary;
}

function getTrustBadge(level: "high" | "medium" | "low") {
  switch (level) {
    case "high":
      return {
        icon: ShieldCheck,
        label: "High Confidence",
        className: "bg-primary/10 text-primary border-primary/30",
      };
    case "medium":
      return {
        icon: Shield,
        label: "Medium Confidence",
        className: "bg-amber-500/10 text-amber-500 border-amber-500/30",
      };
    case "low":
      return {
        icon: ShieldAlert,
        label: "Low Confidence",
        className: "bg-destructive/10 text-destructive border-destructive/30",
      };
  }
}

export function ApplicantAISummary({
  summary,
  fullAnalysis,
  aiScore,
  trustLevel = "medium",
  isAnalyzing = false,
  onReanalyze,
  className,
}: ApplicantAISummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const condensedSummary = extractSummary(summary || fullAnalysis);
  const trustBadge = getTrustBadge(trustLevel);
  const TrustIcon = trustBadge.icon;

  return (
    <Card className={cn("bg-card border-border overflow-hidden", className)}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Ava Icon */}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Ava's Summary</h3>
                {aiScore !== null && aiScore !== undefined && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                    Score: {aiScore}
                  </Badge>
                )}
              </div>
              <Badge 
                variant="outline" 
                className={cn("text-[10px] gap-1", trustBadge.className)}
              >
                <TrustIcon className="h-3 w-3" />
                {trustBadge.label}
              </Badge>
            </div>

            {/* Summary Text */}
            {isAnalyzing ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing candidate...
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {condensedSummary}
                </p>

                {/* Expand/Collapse for full analysis */}
                {fullAnalysis && fullAnalysis.length > 200 && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="mt-2 h-7 px-2 text-xs text-primary hover:text-primary"
                    >
                      <ChevronDown 
                        className={cn(
                          "h-3 w-3 mr-1 transition-transform",
                          isExpanded && "rotate-180"
                        )} 
                      />
                      {isExpanded ? "Show Less" : "Read Full Analysis"}
                    </Button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 pt-3 border-t border-border">
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                              {fullAnalysis}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </>
            )}

            {/* Reanalyze button */}
            {onReanalyze && !isAnalyzing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onReanalyze}
                className="mt-2 h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <Sparkles className="h-3 w-3 mr-1" />
                Reanalyze
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ApplicantAISummary;
