import { useState, useEffect, useMemo } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Shield,
  Target,
  AlertCircle,
  FileText,
  Sparkles
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

// ============= Types =============
interface ParsedAnalysis {
  score: number | null;
  recommendation: string | null;
  primaryReason: string | null;
  sections: ParsedSection[];
}

interface ParsedSection {
  title: string;
  summary: string;
  priority: 'critical' | 'important' | 'secondary';
  items: string[];
  status: 'positive' | 'negative' | 'warning' | 'neutral';
}

type StatusType = 'positive' | 'negative' | 'warning' | 'neutral';

// ============= Parsing Logic =============

function getStatusType(value: string): StatusType | null {
  const upper = value.toUpperCase();
  
  if (/^(AUTHENTIC|VALID_RESUME|VALID|MATCH|CONSISTENT|RECOMMENDED|PROCEED|PASS|STRONG|EXCELLENT|YES|VERIFIED|CONFIRMED|HIGH)$/.test(upper)) {
    return 'positive';
  }
  
  if (/^(WRONG_RESUME|MISMATCH|INCONSISTENT|NOT_PROVIDED|UNRELATED|NOT_RECOMMENDED|REJECT|FAIL|FRAUDULENT|AI_GENERATED|FAKE|INVALID|POOR|WEAK|NO|MISSING|INCOMPLETE|NOT AUTHENTIC)$/.test(upper)) {
    return 'negative';
  }
  
  if (/^(CANNOT_VERIFY|MIXED|UNKNOWN|UNCLEAR|NONE|PARTIAL|MODERATE|AVERAGE|MEDIUM|N\/A|LOW|LIKELY_AI_GENERATED)$/.test(upper)) {
    return 'warning';
  }
  
  return null;
}

function extractSectionSummary(items: string[]): { summary: string; status: StatusType } {
  // Find the first key-value item with a status
  for (const item of items) {
    const match = item.match(/^([^:]{2,40}):\s*(.+)$/);
    if (match) {
      const value = match[2].trim();
      const status = getStatusType(value);
      if (status) {
        return { 
          summary: `${match[1].trim()}: ${value}`, 
          status 
        };
      }
    }
  }
  
  // Fallback: count positive/negative items
  let positive = 0, negative = 0, warning = 0;
  
  for (const item of items) {
    const match = item.match(/^[^:]+:\s*(.+)$/);
    if (match) {
      const status = getStatusType(match[1].trim());
      if (status === 'positive') positive++;
      else if (status === 'negative') negative++;
      else if (status === 'warning') warning++;
    }
  }
  
  if (negative > 0) {
    return { 
      summary: `${negative} issue${negative > 1 ? 's' : ''} found`, 
      status: 'negative' 
    };
  }
  if (warning > 0) {
    return { 
      summary: `${warning} item${warning > 1 ? 's' : ''} need review`, 
      status: 'warning' 
    };
  }
  if (positive > 0) {
    return { 
      summary: `${positive} check${positive > 1 ? 's' : ''} passed`, 
      status: 'positive' 
    };
  }
  
  return { 
    summary: `${items.length} item${items.length !== 1 ? 's' : ''}`, 
    status: 'neutral' 
  };
}

function getSectionPriority(title: string, items: string[]): 'critical' | 'important' | 'secondary' {
  const titleLower = title.toLowerCase();
  
  // Critical: Document validation, authenticity, red flags
  if (titleLower.includes('document') || 
      titleLower.includes('validation') || 
      titleLower.includes('authenticity') ||
      titleLower.includes('red flag') ||
      titleLower.includes('warning')) {
    // Check if there are issues
    const hasIssues = items.some(item => {
      const match = item.match(/^[^:]+:\s*(.+)$/);
      if (match) {
        const status = getStatusType(match[1].trim());
        return status === 'negative' || status === 'warning';
      }
      return false;
    });
    return hasIssues ? 'critical' : 'important';
  }
  
  // Important: Skills, experience, qualifications
  if (titleLower.includes('skill') || 
      titleLower.includes('experience') || 
      titleLower.includes('qualification') ||
      titleLower.includes('match') ||
      titleLower.includes('strength')) {
    return 'important';
  }
  
  // Secondary: Everything else
  return 'secondary';
}

function extractPrimaryReason(sections: ParsedSection[], recommendation: string | null): string | null {
  // Look for critical issues first
  for (const section of sections) {
    if (section.priority === 'critical' && section.status === 'negative') {
      return section.summary;
    }
  }
  
  // Look for negative sections
  for (const section of sections) {
    if (section.status === 'negative') {
      return section.summary;
    }
  }
  
  // Look for positive highlights
  for (const section of sections) {
    if (section.status === 'positive') {
      return section.summary;
    }
  }
  
  // Fallback to recommendation snippet
  if (recommendation) {
    const words = recommendation.split(' ').slice(0, 8);
    return words.join(' ') + (recommendation.split(' ').length > 8 ? '...' : '');
  }
  
  return null;
}

function parseAIAnalysis(content: string): ParsedAnalysis {
  const result: ParsedAnalysis = {
    score: null,
    recommendation: null,
    primaryReason: null,
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

  // Convert raw sections to parsed sections with summaries and priorities
  result.sections = rawSections.map(section => {
    const { summary, status } = extractSectionSummary(section.items);
    const priority = getSectionPriority(section.title, section.items);
    
    return {
      title: section.title,
      summary,
      priority,
      items: section.items,
      status,
    };
  });

  // Sort by priority: critical first, then important, then secondary
  result.sections.sort((a, b) => {
    const priorityOrder = { critical: 0, important: 1, secondary: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  // Extract primary reason
  result.primaryReason = extractPrimaryReason(result.sections, result.recommendation);

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

function StatusBadge({ status, type, compact = false }: { status: string; type: StatusType; compact?: boolean }) {
  const baseClasses = compact 
    ? "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
    : "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium";
  
  const typeClasses: Record<StatusType, string> = {
    positive: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    negative: "bg-red-500/10 text-red-400 border border-red-500/20",
    warning: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
    neutral: "bg-muted text-muted-foreground border border-border",
  };
  
  return (
    <span className={cn(baseClasses, typeClasses[type])}>
      {status}
    </span>
  );
}

function SectionIcon({ title, status }: { title: string; status: StatusType }) {
  const titleLower = title.toLowerCase();
  
  let Icon = FileText;
  if (titleLower.includes('document') || titleLower.includes('validation') || titleLower.includes('authentic')) {
    Icon = Shield;
  } else if (titleLower.includes('skill') || titleLower.includes('match') || titleLower.includes('experience')) {
    Icon = Target;
  } else if (titleLower.includes('red flag') || titleLower.includes('warning') || titleLower.includes('concern')) {
    Icon = AlertCircle;
  } else if (titleLower.includes('strength')) {
    Icon = Sparkles;
  }
  
  const colorClasses: Record<StatusType, string> = {
    positive: "text-emerald-400",
    negative: "text-red-400",
    warning: "text-amber-400",
    neutral: "text-muted-foreground",
  };
  
  return <Icon className={cn("h-4 w-4", colorClasses[status])} />;
}

function AnalysisItem({ item }: { item: string }) {
  const match = item.match(/^([^:]{2,40}):\s*(.+)$/);
  
  if (match) {
    const label = match[1].trim();
    const value = match[2].trim();
    const statusType = getStatusType(value);
    
    return (
      <div className="flex items-start justify-between gap-3 py-1">
        <span className="text-xs text-muted-foreground shrink-0">{label}</span>
        <span className="text-xs text-right">
          {statusType ? (
            <StatusBadge status={value} type={statusType} compact />
          ) : (
            <span className="text-foreground/80">{value}</span>
          )}
        </span>
      </div>
    );
  }
  
  return (
    <div className="text-xs text-muted-foreground py-0.5 leading-relaxed">
      {item}
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
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [showAllExpanded, setShowAllExpanded] = useState(false);
  
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
  
  const handleToggleAll = () => {
    if (showAllExpanded) {
      setExpandedSections([]);
    } else {
      setExpandedSections(parsed.sections.map(s => s.title));
    }
    setShowAllExpanded(!showAllExpanded);
  };
  
  return (
    <div className={cn("space-y-4", className)}>
      {/* Executive Summary Card */}
      <Card className="border-border/50 bg-gradient-to-br from-card/80 to-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {verdictIcon}
                <span className={cn("text-base font-semibold", verdictColor)}>
                  {verdictText}
                </span>
              </div>
              {parsed.primaryReason && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {parsed.primaryReason}
                </p>
              )}
            </div>
            {parsed.score !== null && (
              <ScoreRing score={parsed.score} />
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Expand/Collapse Toggle */}
      {parsed.sections.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {parsed.sections.length} section{parsed.sections.length !== 1 ? 's' : ''}
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleToggleAll}
            className="h-7 text-xs gap-1 px-2"
          >
            {showAllExpanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Collapse All
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Expand All
              </>
            )}
          </Button>
        </div>
      )}
      
      {/* Accordion Sections */}
      <Accordion 
        type="multiple" 
        value={expandedSections}
        onValueChange={setExpandedSections}
        className="space-y-2"
      >
        {parsed.sections.map((section) => (
          <AccordionItem 
            key={section.title} 
            value={section.title}
            className={cn(
              "border rounded-lg px-3 overflow-hidden",
              section.priority === 'critical' && section.status === 'negative' 
                ? "border-red-500/30 bg-red-500/5"
                : section.priority === 'critical' && section.status === 'warning'
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-border/50 bg-card/50"
            )}
          >
            <AccordionTrigger className="py-2.5 hover:no-underline tap-target">
              <div className="flex items-center gap-2 w-full pr-2">
                <SectionIcon title={section.title} status={section.status} />
                <span className="text-sm font-medium text-foreground flex-1 text-left truncate">
                  {section.title}
                </span>
                <StatusBadge 
                  status={section.summary.split(':')[1]?.trim() || section.summary} 
                  type={section.status} 
                  compact 
                />
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              <div className="divide-y divide-border/20 pt-1">
                {section.items.map((item, i) => (
                  <AnalysisItem key={i} item={item} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      
      {/* Full Recommendation (if different from summary) */}
      {parsed.recommendation && parsed.recommendation.length > 50 && (
        <div className="pt-2 border-t border-border/30">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Full Recommendation: </span>
            {parsed.recommendation}
          </p>
        </div>
      )}
    </div>
  );
}
