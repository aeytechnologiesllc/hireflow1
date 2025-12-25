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

// Generate a comprehensive full summary from all sections - building a 15+ sentence narrative
function generateFullSummary(sections: ParsedSection[], recommendation: string | null): string {
  // Collect data from all sections
  const phaseResults: { phase: string; score: string; details: string }[] = [];
  const resumeFindings: string[] = [];
  const skillsInfo: string[] = [];
  const personalityInfo: string[] = [];
  const experienceInfo: string[] = [];
  const concerns: string[] = [];
  const strengths: string[] = [];
  const crossRefFindings: string[] = [];
  let overallScore: string | null = null;
  let recommendationText: string | null = recommendation;
  
  for (const section of sections) {
    const titleLower = section.title.toLowerCase();
    
    // Extract Phase Performance Summary
    if (titleLower.includes('phase') && titleLower.includes('performance')) {
      for (const item of section.items) {
        const match = item.match(/^([^:]{2,40}):\s*(.+)$/);
        if (match) {
          const label = match[1].trim();
          const labelLower = label.toLowerCase();
          const value = match[2].trim();
          const valueLower = value.toLowerCase();
          
          if (labelLower.includes('quiz') && !valueLower.includes('not completed') && !valueLower.includes('n/a')) {
            const scoreMatch = value.match(/(\d+)%/);
            if (scoreMatch) {
              phaseResults.push({ phase: 'Quiz', score: `${scoreMatch[1]}%`, details: value });
            }
          }
          
          if (labelLower.includes('portfolio') && !valueLower.includes('not submitted') && !valueLower.includes('n/a')) {
            const scoreMatch = value.match(/(\d+)(?:\/100)?/);
            if (scoreMatch) {
              phaseResults.push({ phase: 'Portfolio', score: `${scoreMatch[1]}/100`, details: value });
            }
          }
          
          if (labelLower.includes('voice') && labelLower.includes('interview') && !valueLower.includes('not completed') && !valueLower.includes('n/a')) {
            const scoreMatch = value.match(/(\d+)(?:\/100)?/);
            if (scoreMatch) {
              phaseResults.push({ phase: 'Voice Interview', score: `${scoreMatch[1]}/100`, details: value });
            }
          }
          
          if (labelLower.includes('typing') && !valueLower.includes('not completed') && !valueLower.includes('n/a')) {
            const wpmMatch = value.match(/(\d+)\s*wpm/i);
            if (wpmMatch) {
              phaseResults.push({ phase: 'Typing Test', score: `${wpmMatch[1]} WPM`, details: value });
            }
          }
          
          if (labelLower.includes('video') && !valueLower.includes('not submitted') && !valueLower.includes('n/a')) {
            phaseResults.push({ phase: 'Video Introduction', score: 'Submitted', details: value });
          }
          
          if (labelLower.includes('chat') && labelLower.includes('simulation') && !valueLower.includes('not completed') && !valueLower.includes('n/a')) {
            phaseResults.push({ phase: 'Chat Simulation', score: 'Completed', details: value });
          }
          
          if (labelLower.includes('overall') && labelLower.includes('strength')) {
            strengths.push(value);
          }
          
          if (labelLower.includes('highlight')) {
            const highlights = value.split(/[,;]/).filter(h => h.trim() && !h.toLowerCase().includes('none'));
            strengths.push(...highlights.map(h => h.trim()));
          }
          
          if (labelLower.includes('concern') && !valueLower.includes('none')) {
            concerns.push(value);
          }
        }
      }
    }
    
    // Extract Resume/Document Analysis
    if (titleLower.includes('resume') || titleLower.includes('document')) {
      for (const item of section.items) {
        const match = item.match(/^([^:]{2,40}):\s*(.+)$/);
        if (match) {
          const label = match[1].trim().toLowerCase();
          const value = match[2].trim();
          const valueUpper = value.toUpperCase();
          
          if (label.includes('status') || label.includes('ownership')) {
            if (valueUpper.includes('WRONG') || valueUpper.includes('MISMATCH') || valueUpper.includes('DIFFERENT')) {
              resumeFindings.push('The resume appears to belong to a different person');
              concerns.push('Resume ownership discrepancy detected');
            } else if (valueUpper.includes('CONFIRMED') || valueUpper.includes('MATCH')) {
              resumeFindings.push('The resume appears to belong to the applicant');
            }
          }
          
          if (label.includes('authenticity') || label.includes('confidence')) {
            resumeFindings.push(`Document authenticity: ${value}`);
          }
          
          if (label.includes('ai') && label.includes('detect')) {
            resumeFindings.push(`AI detection: ${value}`);
          }
        }
      }
    }
    
    // Extract Cross-Reference Analysis
    if (titleLower.includes('cross') && titleLower.includes('reference')) {
      for (const item of section.items) {
        const match = item.match(/^([^:]{2,40}):\s*(.+)$/);
        if (match) {
          const label = match[1].trim().toLowerCase();
          const value = match[2].trim();
          
          if (label.includes('name')) {
            if (value.toUpperCase().includes('MISMATCH') || value.toUpperCase().includes('DIFFERENT')) {
              crossRefFindings.push('Name on resume does not match applicant name');
              concerns.push('Name mismatch between resume and application');
            } else if (value.toUpperCase().includes('MATCH')) {
              crossRefFindings.push('Name verification passed');
            }
          }
          
          if (label.includes('consistency') || label.includes('alignment')) {
            crossRefFindings.push(`Application consistency: ${value}`);
          }
        }
      }
    }
    
    // Extract Skills Analysis
    if (titleLower.includes('skill')) {
      for (const item of section.items) {
        const match = item.match(/^([^:]{2,40}):\s*(.+)$/);
        if (match) {
          const label = match[1].trim().toLowerCase();
          const value = match[2].trim();
          
          if (label.includes('matching') || label.includes('relevant')) {
            if (value.toLowerCase().includes('none') || value === '0') {
              skillsInfo.push('No matching skills were found for this position');
              concerns.push('No relevant skills match');
            } else {
              skillsInfo.push(`Matching skills: ${value}`);
            }
          }
          
          if (label.includes('missing') || label.includes('gap')) {
            if (!value.toLowerCase().includes('none')) {
              skillsInfo.push(`Skills gaps identified: ${value}`);
            }
          }
          
          if (label.includes('strength')) {
            strengths.push(value);
          }
        }
      }
    }
    
    // Extract Personality/Soft Skills
    if (titleLower.includes('personality') || titleLower.includes('soft')) {
      for (const item of section.items) {
        if (!item.includes(':')) continue;
        const match = item.match(/^([^:]{2,40}):\s*(.+)$/);
        if (match) {
          const value = match[2].trim();
          if (value && !value.toLowerCase().includes('none') && value !== 'N/A') {
            personalityInfo.push(value);
          }
        }
      }
    }
    
    // Extract Experience Analysis
    if (titleLower.includes('experience')) {
      for (const item of section.items) {
        const match = item.match(/^([^:]{2,40}):\s*(.+)$/);
        if (match) {
          const label = match[1].trim().toLowerCase();
          const value = match[2].trim();
          
          if (label.includes('year') || label.includes('level')) {
            experienceInfo.push(`Experience level: ${value}`);
          }
          
          if (label.includes('relevance') || label.includes('alignment')) {
            experienceInfo.push(`Experience relevance: ${value}`);
          }
        }
      }
    }
    
    // Extract Final Assessment
    if (titleLower.includes('assessment') || titleLower.includes('recommendation') || titleLower.includes('scoring')) {
      for (const item of section.items) {
        const match = item.match(/^([^:]{2,40}):\s*(.+)$/);
        if (match) {
          const label = match[1].trim().toLowerCase();
          const value = match[2].trim();
          
          if (label.includes('score') || label.includes('rating')) {
            const scoreMatch = value.match(/(\d+)/);
            if (scoreMatch) {
              overallScore = scoreMatch[1];
            }
          }
          
          if (label.includes('recommendation') || label.includes('verdict')) {
            recommendationText = value;
          }
          
          if (label.includes('red flag') || label.includes('concern')) {
            if (!value.toLowerCase().includes('none') && value !== 'N/A') {
              concerns.push(value);
            }
          }
        }
      }
    }
  }
  
  // Build comprehensive narrative (targeting 15+ sentences)
  const sentences: string[] = [];
  
  // Opening - Application overview
  if (phaseResults.length > 0) {
    sentences.push(`This candidate has completed ${phaseResults.length} phase${phaseResults.length > 1 ? 's' : ''} of the application process.`);
  } else {
    sentences.push('This candidate has submitted their application for review.');
  }
  
  // Phase-by-phase breakdown (detailed sentences for each)
  for (const phase of phaseResults) {
    if (phase.phase === 'Quiz') {
      const score = parseInt(phase.score);
      if (score >= 90) {
        sentences.push(`They achieved an outstanding ${phase.score} on the skills quiz, demonstrating excellent knowledge in the required areas.`);
      } else if (score >= 70) {
        sentences.push(`They scored ${phase.score} on the skills quiz, showing solid competency in the required skills.`);
      } else if (score >= 50) {
        sentences.push(`Their quiz score of ${phase.score} indicates moderate knowledge, with some areas needing improvement.`);
      } else {
        sentences.push(`The quiz score of ${phase.score} is concerning and suggests gaps in fundamental knowledge.`);
      }
    }
    
    if (phase.phase === 'Portfolio') {
      const score = parseInt(phase.score);
      if (score >= 80) {
        sentences.push(`The portfolio received a strong rating of ${phase.score}, showcasing impressive technical execution and creativity.`);
      } else if (score >= 60) {
        sentences.push(`Their portfolio was rated ${phase.score}, showing decent technical execution but with room for improvement.`);
      } else {
        sentences.push(`The portfolio scored ${phase.score}, indicating significant areas for development in their work quality.`);
      }
    }
    
    if (phase.phase === 'Voice Interview') {
      const score = parseInt(phase.score);
      if (score >= 80) {
        sentences.push(`The voice interview scored ${phase.score}, reflecting excellent communication skills and strong engagement.`);
      } else if (score >= 60) {
        sentences.push(`Their voice interview performance was rated ${phase.score}, showing adequate communication abilities.`);
      } else if (score >= 40) {
        sentences.push(`The voice interview score of ${phase.score} indicates some concerns about communication or engagement during the conversation.`);
      } else {
        sentences.push(`The voice interview scored only ${phase.score}, suggesting significant issues with communication or interview preparation.`);
      }
    }
    
    if (phase.phase === 'Typing Test') {
      sentences.push(`They completed the typing test with a speed of ${phase.score}.`);
    }
    
    if (phase.phase === 'Video Introduction') {
      sentences.push(`A video introduction was submitted for review.`);
    }
    
    if (phase.phase === 'Chat Simulation') {
      sentences.push(`The candidate completed the chat simulation exercise.`);
    }
  }
  
  // Resume analysis section
  if (resumeFindings.length > 0) {
    sentences.push('Regarding the submitted resume:');
    resumeFindings.forEach(finding => {
      sentences.push(finding + '.');
    });
  }
  
  // Cross-reference findings
  if (crossRefFindings.length > 0) {
    crossRefFindings.forEach(finding => {
      if (!finding.endsWith('.')) {
        sentences.push(finding + '.');
      } else {
        sentences.push(finding);
      }
    });
  }
  
  // Skills assessment
  if (skillsInfo.length > 0) {
    skillsInfo.forEach(skill => {
      if (!skill.endsWith('.')) {
        sentences.push(skill + '.');
      } else {
        sentences.push(skill);
      }
    });
  }
  
  // Experience insights
  if (experienceInfo.length > 0) {
    experienceInfo.slice(0, 2).forEach(exp => {
      if (!exp.endsWith('.')) {
        sentences.push(exp + '.');
      } else {
        sentences.push(exp);
      }
    });
  }
  
  // Concerns section
  const uniqueConcerns = [...new Set(concerns)];
  if (uniqueConcerns.length > 0) {
    if (uniqueConcerns.length === 1) {
      sentences.push(`A key concern is ${uniqueConcerns[0].toLowerCase()}.`);
    } else {
      sentences.push(`Key concerns include: ${uniqueConcerns.slice(0, 4).join(', ')}.`);
    }
  }
  
  // Strengths section
  const uniqueStrengths = [...new Set(strengths)].filter(s => s && s.toLowerCase() !== 'none');
  if (uniqueStrengths.length > 0) {
    if (uniqueStrengths.length === 1) {
      sentences.push(`A notable strength is ${uniqueStrengths[0]}.`);
    } else {
      sentences.push(`Notable strengths include: ${uniqueStrengths.slice(0, 3).join(', ')}.`);
    }
  }
  
  // Personality insights (if available)
  if (personalityInfo.length > 0) {
    const personalityNote = personalityInfo.slice(0, 2).join(' ');
    sentences.push(`Personality indicators suggest: ${personalityNote}.`);
  }
  
  // Closing - Overall assessment
  if (overallScore) {
    sentences.push(`Based on the overall assessment, this candidate scores ${overallScore}/100.`);
  }
  
  if (recommendationText) {
    const cleanRec = recommendationText.replace(/^\*\*|\*\*$/g, '').trim();
    sentences.push(`Recommendation: ${cleanRec}.`);
  }
  
  // Ensure we have enough sentences - add context if needed
  if (sentences.length < 10) {
    if (phaseResults.length > 0) {
      sentences.push('The application data shows a mix of strengths and areas for improvement.');
    }
    if (concerns.length > 0 && strengths.length > 0) {
      sentences.push('While there are notable positive aspects, the concerns warrant careful consideration.');
    } else if (concerns.length > 0) {
      sentences.push('The identified concerns should be addressed before proceeding.');
    } else if (strengths.length > 0) {
      sentences.push('The candidate shows promise in several key areas.');
    }
    sentences.push('A thorough review of all submitted materials is recommended before making a final decision.');
  }
  
  if (sentences.length > 0) {
    return sentences.join(' ');
  }
  
  return 'Analysis complete. View the detailed sections below for comprehensive insights.';
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
