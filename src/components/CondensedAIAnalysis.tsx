import { useState, useEffect, useMemo } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { 
  ChevronDown, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

// ============= Types =============
interface ParsedAnalysis {
  score: number | null;
  recommendation: string | null;
  fullSummary: string;
  sections: ParsedSection[];
}

interface ParsedSection {
  title: string;
  items: string[];
}

// ============= Human-Readable Helpers =============

function humanizeStatus(status: string): string {
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function humanizeTitle(title: string): string {
  return title
    .replace(/_/g, ' ')
    .replace(/\b(ai|cv)\b/gi, match => match.toUpperCase())
    .trim();
}

function generateParagraphSummary(items: string[]): string {
  const sentences: string[] = [];
  
  for (const item of items) {
    const match = item.match(/^([^:]{2,40}):\s*(.+)$/);
    if (match) {
      const label = match[1].trim();
      const value = match[2].trim();
      const humanValue = humanizeStatus(value);
      const labelLower = label.toLowerCase();
      
      if (labelLower.includes('status') || labelLower.includes('result')) {
        sentences.push(`The ${labelLower} is ${humanValue.toLowerCase()}.`);
      } else if (labelLower.includes('match') && labelLower.includes('name')) {
        if (value.toUpperCase().includes('MISMATCH')) {
          const details = value.replace(/^MISMATCH\s*[-–—]\s*/i, '');
          sentences.push(`There's a name discrepancy. ${details}`);
        } else {
          sentences.push(`The name matches the application.`);
        }
      } else if (labelLower.includes('matching skills')) {
        if (value.toLowerCase().includes('none') || value === '0') {
          sentences.push(`No matching skills were found on this resume.`);
        } else {
          sentences.push(`The candidate has matching skills: ${humanValue}.`);
        }
      } else if (labelLower.includes('missing skills')) {
        if (value.toLowerCase() !== 'none' && value !== 'N/A') {
          sentences.push(`Key skills missing: ${value}.`);
        }
      } else if (labelLower.includes('match rate') || labelLower.includes('score')) {
        sentences.push(`The overall match rate is ${value}.`);
      } else if (labelLower.includes('experience')) {
        if (value.toUpperCase().includes('INCONSISTENT') || value.toUpperCase().includes('UNRELATED')) {
          const details = value.replace(/^(INCONSISTENT|UNRELATED)\s*[-–—]\s*/i, '');
          sentences.push(`The experience appears unrelated. ${details}`);
        } else {
          sentences.push(`Experience: ${humanValue}.`);
        }
      } else if (labelLower.includes('confidence') || labelLower.includes('authenticity')) {
        sentences.push(`${label}: ${humanValue}.`);
      } else if (labelLower.includes('red flag') || labelLower.includes('concern')) {
        if (value.toLowerCase() !== 'none' && value !== 'N/A' && value !== '0') {
          sentences.push(`Concern: ${value}.`);
        }
      } else if (labelLower.includes('notes') || labelLower.includes('summary')) {
        sentences.push(value);
      } else {
        sentences.push(`${label}: ${humanValue}.`);
      }
    } else {
      sentences.push(item);
    }
  }
  
  return sentences.join(' ');
}

// Generate a cohesive full summary from all sections
function generateFullSummary(sections: ParsedSection[], recommendation: string | null): string {
  const keyFindings: string[] = [];
  
  for (const section of sections) {
    for (const item of section.items) {
      const match = item.match(/^([^:]{2,40}):\s*(.+)$/);
      if (match) {
        const label = match[1].trim().toLowerCase();
        const value = match[2].trim();
        const valueUpper = value.toUpperCase();
        
        // Capture the most important findings
        if (label.includes('status') && valueUpper.includes('WRONG')) {
          keyFindings.push('The resume appears to belong to a different person.');
        } else if (label.includes('name') && valueUpper.includes('MISMATCH')) {
          keyFindings.push('There is a name discrepancy between the resume and application.');
        } else if (label.includes('matching skills') && (value.toLowerCase().includes('none') || value === '0')) {
          keyFindings.push('No matching skills were found for this position.');
        } else if (label.includes('authenticity') && valueUpper.includes('AUTHENTIC')) {
          keyFindings.push('The document appears authentic.');
        } else if (label.includes('experience') && (valueUpper.includes('UNRELATED') || valueUpper.includes('INCONSISTENT'))) {
          keyFindings.push('The experience is unrelated to this position.');
        } else if (label.includes('red flag') && value.toLowerCase() !== 'none' && value !== 'N/A') {
          keyFindings.push(`Red flag: ${value}.`);
        }
      }
    }
  }
  
  // Deduplicate and limit
  const uniqueFindings = [...new Set(keyFindings)].slice(0, 4);
  
  if (uniqueFindings.length > 0) {
    return uniqueFindings.join(' ');
  }
  
  // Fallback to recommendation
  if (recommendation) {
    return recommendation;
  }
  
  return 'Analysis complete. View details below.';
}

// ============= Parsing Logic =============

function parseAIAnalysis(content: string): ParsedAnalysis {
  const result: ParsedAnalysis = {
    score: null,
    recommendation: null,
    fullSummary: '',
    sections: [],
  };

  const lines = content.split("\n");
  let currentSection: { title: string; items: string[] } | null = null;
  const rawSections: { title: string; items: string[] }[] = [];

  const pushSection = () => {
    if (currentSection && (currentSection.items.length > 0 || currentSection.title)) {
      rawSections.push(currentSection);
    }
    currentSection = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Score
    const scoreMatch = trimmed.match(/^(?:\*\*)?Overall Score\s*[:\-]\s*(\d{1,3})(?:\*\*)?$/i);
    if (scoreMatch) {
      const n = parseInt(scoreMatch[1], 10);
      result.score = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
      continue;
    }

    // Recommendation
    const recMatch = trimmed.match(/^(?:\*\*)?Recommendation\s*[:\-]\s*([^*\n]+?)(?:\*\*)?$/i);
    if (recMatch) {
      result.recommendation = recMatch[1].trim();
      continue;
    }

    // Section headings
    const headingMatch = trimmed.match(/^\*\*\s*([^*]+?)\s*\*\*\s*:??\s*$/);
    if (headingMatch) {
      pushSection();
      currentSection = { title: headingMatch[1].trim(), items: [] };
      continue;
    }

    // Start section on structured content
    if (!currentSection && /^Status\s*[:\-]|^Confidence\s*[:\-]|^Notes\s*[:\-]|^Red Flags\s*[:\-]|^Summary\s*[:\-]|^Key Strengths\s*[:\-]|^Areas of Concern\s*[:\-]/i.test(trimmed)) {
      currentSection = { title: "Overview", items: [] };
    }

    if (!currentSection) continue;

    // Bullet items
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      currentSection.items.push(trimmed.slice(2).trim());
      continue;
    }

    // Key/value lines
    const kvMatch = trimmed.match(/^([^:]{2,40}):\s*(.+)$/);
    if (kvMatch) {
      currentSection.items.push(`${kvMatch[1].trim()}: ${kvMatch[2].trim()}`);
      continue;
    }
  }

  pushSection();

  // Convert raw sections
  result.sections = rawSections.map(section => ({
    title: humanizeTitle(section.title),
    items: section.items,
  }));

  // Generate full summary
  result.fullSummary = generateFullSummary(result.sections, result.recommendation);

  return result;
}

// ============= Sub-components =============

function useAnimatedCounter(value: number) {
  const spring = useSpring(0, { stiffness: 50, damping: 20 });
  const display = useTransform(spring, (current) => Math.round(current));
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);
  
  useEffect(() => {
    const unsubscribe = display.on("change", (v) => setDisplayValue(v));
    return unsubscribe;
  }, [display]);
  
  return displayValue;
}

function ScoreRing({ score, size = "md" }: { score: number; size?: "sm" | "md" }) {
  const displayScore = useAnimatedCounter(score);
  const circumference = 94.2;
  const targetDasharray = (score / 100) * circumference;
  
  const getScoreColor = (s: number) => {
    if (s >= 70) return "stroke-emerald-500";
    if (s >= 50) return "stroke-amber-500";
    return "stroke-red-500";
  };
  
  const sizeClasses = size === "sm" ? "w-12 h-12" : "w-14 h-14";
  const textSize = size === "sm" ? "text-sm" : "text-base";
  
  return (
    <div className="relative">
      <svg className={cn(sizeClasses, "-rotate-90")} viewBox="0 0 36 36">
        <circle
          cx="18" cy="18" r="15"
          fill="none"
          className="stroke-muted/30"
          strokeWidth="2.5"
        />
        <motion.circle
          cx="18" cy="18" r="15"
          fill="none"
          className={getScoreColor(score)}
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${targetDasharray} ${circumference}` }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn(textSize, "font-semibold text-foreground")}>{displayScore}</span>
      </div>
    </div>
  );
}

// ============= Main Component =============

interface CondensedAIAnalysisProps {
  content: string;
  className?: string;
}

export function CondensedAIAnalysis({ content, className }: CondensedAIAnalysisProps) {
  const parsed = useMemo(() => parseAIAnalysis(content), [content]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  // Determine verdict display
  const recLower = parsed.recommendation?.toLowerCase() || '';
  const isPositiveRec = recLower.includes('proceed') || 
                        recLower.includes('strong') ||
                        recLower.includes('recommend');
  const isNegativeRec = recLower.includes('not recommend') ||
                        recLower.includes('reject') ||
                        recLower.includes('do not');
  
  const verdictIcon = isPositiveRec 
    ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
    : isNegativeRec 
      ? <XCircle className="h-5 w-5 text-red-400" />
      : <AlertTriangle className="h-5 w-5 text-amber-400" />;
  
  const verdictText = isPositiveRec 
    ? "Proceed with Interview" 
    : isNegativeRec 
      ? "Not Recommended" 
      : "Review Carefully";
  
  const verdictColor = isPositiveRec 
    ? "text-emerald-400" 
    : isNegativeRec 
      ? "text-red-400" 
      : "text-amber-400";
  
  return (
    <div className={cn("space-y-4", className)}>
      {/* Executive Summary Card */}
      <Card className="border-border/50 bg-card">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {verdictIcon}
                <span className={cn("text-base font-semibold", verdictColor)}>
                  {verdictText}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {parsed.fullSummary}
              </p>
            </div>
            {parsed.score !== null && (
              <ScoreRing score={parsed.score} />
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Single Collapsible Details Section */}
      {parsed.sections.length > 0 && (
        <Collapsible open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-2">
            <ChevronDown className={cn(
              "h-4 w-4 transition-transform",
              isDetailOpen && "rotate-180"
            )} />
            <span>View detailed analysis</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pt-2 space-y-4">
              {parsed.sections.map((section, idx) => (
                <div key={idx}>
                  <h4 className="text-sm font-medium text-foreground mb-1">
                    {section.title}
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {generateParagraphSummary(section.items)}
                  </p>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
