import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { buildAvaPhaseNarrative, type PhaseType, type QuizPhaseData, type TypingPhaseData, type ChatSimulationPhaseData, type ChatInterviewPhaseData, type SalesSimulationPhaseData, type PortfolioPhaseData, type VoiceInterviewPhaseData } from "@/lib/avaPhaseNarratives";

// ============= Types =============
interface ParsedAnalysis {
  score: number | null;
  recommendation: string | null;
  fullSummary: string;
  sections: ParsedSection[];
  jobFitAnalysis?: string;
  personalityProfile?: string;
  cultureFit?: string;
}

interface ParsedSection {
  title: string;
  items: string[];
}

interface PhaseResult {
  phase: string;
  score: string;
  details: string;
}

// Job context for dynamic analysis
interface JobContext {
  title?: string;
  requiredSkills?: string[];
  description?: string;
  companyName?: string;
}

// Application notes structure from parsedNotes
interface ApplicationNotes {
  avaScorecard?: {
    overallScore?: number;
    confidence?: number;
    recommendedAction?: "advance" | "review" | "reject";
    autopilotAction?: "advance" | "reject" | "defer";
    directMatchScore?: number;
    transferableFitScore?: number;
    learningSignalScore?: number;
    transferableEvidence?: string[];
    decisionState?: "ready_for_decision" | "needs_more_evidence";
    evidenceFingerprint?: string;
    evidenceFloorMet?: boolean;
    pendingHighSignalPhases?: string[];
    completedHighSignalPhases?: string[];
    hardRejectReason?: string | null;
    riskFlags?: string[];
    rationale?: string;
    evidenceRefs?: string[];
  };
  avaAnalysisMeta?: {
    provider?: string;
    model?: string | null;
    analyzedAt?: string;
    evidenceFingerprint?: string;
    resume?: {
      provided?: boolean;
      analyzed?: boolean;
      status?: string;
      textExtracted?: boolean;
      textLength?: number;
      imagePagesUsed?: number;
      visualSources?: string[];
      url?: string | null;
    };
    inputsUsed?: {
      applicationAnswers?: number;
      coverLetter?: boolean;
      quiz?: boolean;
      typingTest?: boolean;
      chatSimulation?: boolean;
      salesSimulation?: boolean;
      chatInterview?: boolean;
      portfolio?: boolean;
      videoIntro?: boolean;
      voiceInterview?: boolean;
    };
  };
  quizResult?: { score: number; passed: boolean; total?: number };
  portfolioResult?: { score: number; feedback?: string; analysis?: string; portfolioUrls?: string[] };
  typingTestResult?: { wpm: number; accuracy: number; passed?: boolean; requiredWpm?: number };
  chatSimulationResult?: { 
    score?: number; 
    passed?: boolean; 
    evaluation?: string; 
    scenario?: string;
    empathy?: number;
    problemSolving?: number;
    communication?: number;
    professionalism?: number;
    strengths?: string[];
    improvements?: string[];
    overallFeedback?: string;
    messageCount?: number;
    messages?: Array<{ role: string; content: string }>;
    antiCheatSummary?: {
      hasViolations: boolean;
      violationCount: number;
      tabSwitches?: number;
      copyPasteAttempts?: number;
    };
  };
  chatInterviewResult?: { 
    score?: number; 
    passed?: boolean; 
    summary?: string;
    overallScore?: number;
    messageCount?: number;
    duration?: number;
    messages?: Array<{ role: string; content: string }>;
    communication?: number;
    technicalKnowledge?: number;
    problemSolving?: number;
    enthusiasm?: number;
    strengths?: string[];
    improvements?: string[];
    overallFeedback?: string;
  };
  salesSimulationResult?: { 
    score?: number; 
    passed?: boolean; 
    evaluation?: string;
    rapport?: number;
    needsDiscovery?: number;
    productKnowledge?: number;
    objectionHandling?: number;
    closingSkills?: number;
    strengths?: string[];
    improvements?: string[];
    overallFeedback?: string;
    messages?: Array<{ role: string; content: string }>;
    antiCheatSummary?: {
      hasViolations: boolean;
      violationCount: number;
      tabSwitches?: number;
      copyPasteAttempts?: number;
    };
  };
  videoIntroUrl?: string;
  applicationAnswers?: Array<{ question: string; answer: string }>;
  [key: string]: any;
}

// ============= Human-Readable Helpers =============

// Detect placeholder values that shouldn't be displayed to users
const PLACEHOLDER_PATTERNS = [
  'CANNOT_VERIFY', 'CANNOT VERIFY', 'CANNOTVERIFY',
  'NOT_AVAILABLE', 'NOT AVAILABLE', 'NOTAVAILABLE',
  'NOT_PROVIDED', 'NOT PROVIDED', 'NOTPROVIDED',
  'UNVERIFIED', 'UNKNOWN', 'N/A', 'NA', 'TBD',
  '[MATCH/MISMATCH/CANNOT_VERIFY]', '[CANNOT_VERIFY]',
  'PLACEHOLDER', 'UNDEFINED', 'NULL'
];

function isPlaceholderValue(value: string): boolean {
  if (!value || typeof value !== 'string') return true;
  const upperValue = value.toUpperCase().trim();
  
  // Check for exact matches or contains
  for (const placeholder of PLACEHOLDER_PATTERNS) {
    if (upperValue === placeholder || upperValue.includes(placeholder)) {
      return true;
    }
  }
  
  // Check for bracket patterns like [SOMETHING]
  if (/^\[.*\]$/.test(value.trim())) {
    return true;
  }
  
  return false;
}

function cleanPlaceholderFromText(text: string): string {
  if (!text) return '';
  
  let cleaned = text;
  for (const placeholder of PLACEHOLDER_PATTERNS) {
    // Remove the placeholder and any surrounding punctuation/whitespace
    const regex = new RegExp(`[,;:\\s]*${placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[,;:\\s]*`, 'gi');
    cleaned = cleaned.replace(regex, ' ');
  }
  
  // Clean up any double spaces and trim
  return cleaned.replace(/\s+/g, ' ').trim();
}

function sanitizeAnalysisCopy(text: string): string {
  if (!text) return "";

  return text
    .replace(/\*\*/g, "")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function toSentenceCase(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function humanizePhaseReference(raw: string) {
  const normalized = raw
    .replace(/[_-]+/g, " ")
    .replace(/\bvoice interview\b/gi, "Ava interview")
    .replace(/\bchat support\b/gi, "chat support")
    .replace(/\bchat simulation\b/gi, "chat simulation")
    .replace(/\btyping test\b/gi, "typing test")
    .replace(/\bvideo intro\b/gi, "video intro")
    .replace(/\bportfolio upload\b/gi, "portfolio review")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? toSentenceCase(normalized) : normalized;
}

function formatPhaseList(value: string) {
  const parts = value
    .split(/\s*(?:,|\/|\bor\b|\band\b)\s*/i)
    .map((part) => humanizePhaseReference(part))
    .filter(Boolean);

  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function buildCompletedEvidenceLead(notes?: ApplicationNotes, pendingPhases?: string) {
  const inputs = deriveEvidenceInputs(notes);
  const completed: string[] = [];

  if (inputs.quiz && typeof notes?.quizResult?.score === "number") {
    completed.push(`the quiz (${notes.quizResult.score}%)`);
  } else if (inputs.typingTest && notes?.typingTestResult) {
    completed.push(`the typing test (${notes.typingTestResult.wpm} WPM at ${notes.typingTestResult.accuracy}% accuracy)`);
  }

  if (inputs.chatSimulation && typeof notes?.chatSimulationResult?.score === "number") {
    completed.push(`the chat simulation (${notes.chatSimulationResult.score}%)`);
  }

  if (inputs.chatInterview && typeof notes?.chatInterviewResult?.score === "number") {
    completed.push(`the chat interview (${notes.chatInterviewResult.score}%)`);
  }

  if (inputs.salesSimulation && typeof notes?.salesSimulationResult?.score === "number") {
    completed.push(`the sales simulation (${notes.salesSimulationResult.score}%)`);
  }

  if (inputs.voiceInterview) {
    const voiceScore = notes?.voiceInterviewResult?.score ?? notes?.voiceInterviewResult?.overallScore;
    if (typeof voiceScore === "number") {
      completed.push(`the Ava interview (${voiceScore}%)`);
    } else {
      completed.push("the Ava interview");
    }
  }

  if (inputs.portfolio && typeof notes?.portfolioResult?.score === "number") {
    completed.push(`the portfolio review (${notes.portfolioResult.score}%)`);
  }

  if (completed.length === 0) {
    const fallbackPending = pendingPhases
      ? `${formatPhaseList(pendingPhases)} ${pendingPhases.match(/\b(?:,|or|and)\b/i) ? "are" : "is"} still pending`
      : "Later workflow phases are still pending";
    return `${fallbackPending}, so this recommendation is based on the evidence collected so far.`;
  }

  const evidenceBasis = getEvidenceBasis(notes)?.replace(/^Based on\s+/i, "") || "the evidence collected so far";
  const pendingLabel = pendingPhases ? formatPhaseList(pendingPhases) : "";
  const pendingLine = pendingLabel
    ? `${pendingLabel} ${pendingLabel.includes(" and ") || pendingLabel.includes(",") ? "are" : "is"} still pending`
    : "Later workflow phases are still pending";

  const completedLine = completed.length === 1
    ? `The candidate has completed ${completed[0]}.`
    : `The candidate has completed ${completed.slice(0, -1).join(", ")}, and ${completed[completed.length - 1]}.`;

  return `${completedLine} ${pendingLine}, so this recommendation is based on ${evidenceBasis}.`;
}

function neutralizePendingPhaseLanguage(text: string, notes?: ApplicationNotes): string {
  if (!text) return "";

  return sanitizeAnalysisCopy(text)
    .replace(
      /there (?:are|were) no completed workflow-phase results yet for ([^.]+?)\s*,\s*and\s*the only assessment score provided was[^.]*\./gi,
      (_match, pendingPhases: string) => `${buildCompletedEvidenceLead(notes, pendingPhases)} `,
    )
    .replace(
      /there (?:are|were) no completed workflow-phase results yet for ([^.]+?)\./gi,
      (_match, pendingPhases: string) => `${buildCompletedEvidenceLead(notes, pendingPhases)} `,
    )
    .replace(
      /with no completed [^.]+?, there is no direct evidence of [^.]+\.\s*/gi,
      "Later interview and simulation phases are still pending, so this recommendation is based on the evidence collected so far. ",
    )
    .replace(
      /without completed [^.]+?, there is no direct evidence of [^.]+\.\s*/gi,
      "Later interview and simulation phases are still pending, so this recommendation is based on the evidence collected so far. ",
    )
    .replace(
      /because [^.]+? (?:has|have) not been completed, there is no direct evidence of [^.]+\.\s*/gi,
      "Later interview and simulation phases are still pending, so this recommendation is based on the evidence collected so far. ",
    )
    .replace(
      /since ([^.]+?) (?:is|are) not yet completed, there is no phase-performance evidence available to ([^.]+?)\.\s*/gi,
      (_match, pendingPhases: string, tail: string) => {
        const lead = buildCompletedEvidenceLead(notes, pendingPhases);
        return `${lead} Additional completed phases may provide more evidence to ${tail.trim()}. `;
      },
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

function humanizeStatus(status: string): string {
  if (isPlaceholderValue(status)) return '';
  
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

function extractActualSummaryFromSections(sections: ParsedSection[]): string | null {
  const summaryCandidates: string[] = [];

  for (const section of sections) {
    const titleLower = section.title.toLowerCase();
    const isOverallSection =
      titleLower.includes("overall") ||
      titleLower.includes("assessment") ||
      titleLower.includes("score explanation");

    for (const item of section.items) {
      const match = item.match(/^([^:]{2,40}):\s*(.+)$/);
      if (!match) continue;

      const label = match[1].trim().toLowerCase();
      const value = sanitizeAnalysisCopy(match[2].trim());
      if (!value) continue;

      if (label === "summary" || label === "score explanation") {
        summaryCandidates.push(value);
      } else if (isOverallSection && (label === "recommendation" || label === "areas of concern")) {
        summaryCandidates.push(`${humanizeTitle(match[1].trim())}: ${value}`);
      }
    }
  }

  if (summaryCandidates.length === 0) return null;
  return summaryCandidates.join(" ").trim();
}

function generateParagraphSummary(items: string[]): string {
  const sentences: string[] = [];
  
  for (const item of items) {
    // Skip items that are just placeholder values
    if (isPlaceholderValue(item)) continue;
    
    const match = item.match(/^([^:]{2,40}):\s*(.+)$/);
    if (match) {
      const label = match[1].trim();
      const value = match[2].trim();
      
      // Skip if the value is a placeholder
      if (isPlaceholderValue(value)) continue;
      
      const cleanedValue = cleanPlaceholderFromText(value);
      if (!cleanedValue) continue;
      
      const humanValue = humanizeStatus(cleanedValue);
      if (!humanValue) continue;
      
      const labelLower = label.toLowerCase();
      
      if (labelLower.includes('status') || labelLower.includes('result')) {
        sentences.push(`The ${labelLower} is ${humanValue.toLowerCase()}.`);
      } else if (labelLower.includes('match') && labelLower.includes('name')) {
        if (cleanedValue.toUpperCase().includes('MISMATCH')) {
          const details = cleanPlaceholderFromText(cleanedValue.replace(/^MISMATCH\s*[-–—]\s*/i, ''));
          if (details) {
            sentences.push(`There's a name discrepancy. ${details}`);
          }
        } else {
          sentences.push(`The name matches the application.`);
        }
      } else if (labelLower.includes('matching skills')) {
        if (cleanedValue.toLowerCase().includes('none') || cleanedValue === '0') {
          sentences.push(`No matching skills were found on this resume.`);
        } else {
          sentences.push(`The candidate has matching skills: ${humanValue}.`);
        }
      } else if (labelLower.includes('missing skills')) {
        if (cleanedValue.toLowerCase() !== 'none') {
          sentences.push(`Key skills missing: ${cleanedValue}.`);
        }
      } else if (labelLower.includes('match rate') || labelLower.includes('score')) {
        sentences.push(`The overall match rate is ${cleanedValue}.`);
      } else if (labelLower.includes('experience')) {
        if (cleanedValue.toUpperCase().includes('INCONSISTENT') || cleanedValue.toUpperCase().includes('UNRELATED')) {
          const details = cleanPlaceholderFromText(cleanedValue.replace(/^(INCONSISTENT|UNRELATED)\s*[-–—]\s*/i, ''));
          if (details) {
            sentences.push(`The experience appears unrelated. ${details}`);
          }
        } else {
          sentences.push(`Experience: ${humanValue}.`);
        }
      } else if (labelLower.includes('confidence') || labelLower.includes('authenticity')) {
        sentences.push(`${label}: ${humanValue}.`);
      } else if (labelLower.includes('red flag') || labelLower.includes('concern')) {
        if (cleanedValue.toLowerCase() !== 'none' && cleanedValue !== '0') {
          sentences.push(`Concern: ${cleanedValue}.`);
        }
      } else if (labelLower.includes('notes') || labelLower.includes('summary')) {
        sentences.push(cleanedValue);
      } else {
        sentences.push(`${label}: ${humanValue}.`);
      }
    } else {
      // For non key:value items, clean and add if valid
      const cleaned = cleanPlaceholderFromText(item);
      if (cleaned && !isPlaceholderValue(cleaned)) {
        sentences.push(cleaned);
      }
    }
  }
  
  return sentences.join(' ');
}

// Extract phase results directly from application notes (authoritative source)
function getPhaseResultsFromNotes(notes: ApplicationNotes | undefined): PhaseResult[] {
  if (!notes) return [];
  
  const results: PhaseResult[] = [];
  
  // Quiz results
  if (notes.quizResult && typeof notes.quizResult.score === 'number') {
    results.push({
      phase: 'Quiz',
      score: `${notes.quizResult.score}%`,
      details: notes.quizResult.passed ? 'Passed' : 'Did not pass'
    });
  }
  
  // Portfolio results
  if (notes.portfolioResult && typeof notes.portfolioResult.score === 'number') {
    results.push({
      phase: 'Portfolio',
      score: `${notes.portfolioResult.score}/100`,
      details: notes.portfolioResult.feedback || 'Submitted'
    });
  }
  
  // Typing test results
  if (notes.typingTestResult && typeof notes.typingTestResult.wpm === 'number') {
    results.push({
      phase: 'Typing Test',
      score: `${notes.typingTestResult.wpm} WPM`,
      details: `${notes.typingTestResult.accuracy}% accuracy`
    });
  }
  
  // Chat simulation results
  if (notes.chatSimulationResult) {
    const score = notes.chatSimulationResult.score;
    results.push({
      phase: 'Chat Simulation',
      score: score !== undefined ? `${score}/100` : 'Completed',
      details: notes.chatSimulationResult.passed ? 'Passed' : 'Completed'
    });
  }
  
  // Chat interview results
  if (notes.chatInterviewResult) {
    const score = notes.chatInterviewResult.score;
    results.push({
      phase: 'Chat Interview',
      score: score !== undefined ? `${score}/100` : 'Completed',
      details: 'Completed'
    });
  }
  
  // Sales simulation results
  if (notes.salesSimulationResult) {
    const score = notes.salesSimulationResult.score;
    results.push({
      phase: 'Sales Simulation',
      score: score !== undefined ? `${score}/100` : 'Completed',
      details: 'Completed'
    });
  }
  
  // Video intro
  if (notes.videoIntroUrl) {
    results.push({
      phase: 'Video Introduction',
      score: 'Submitted',
      details: 'Video recorded'
    });
  }
  
  // Check for step-based video submissions (newer format)
  Object.keys(notes).forEach(key => {
    const stepData = notes[key];
    if (stepData && typeof stepData === 'object') {
      if ((stepData.type === 'video_intro' || stepData.type === 'video_message') && stepData.videoUrl) {
        // Avoid duplicates
        if (!results.some(r => r.phase === 'Video Introduction')) {
          results.push({
            phase: 'Video Introduction',
            score: 'Submitted',
            details: 'Video recorded'
          });
        }
      }
      // Portfolio upload via step
      if (stepData.type === 'portfolio_upload' && stepData.completed) {
        if (!results.some(r => r.phase === 'Portfolio')) {
          results.push({
            phase: 'Portfolio',
            score: 'Submitted',
            details: `${stepData.portfolioUrls?.length || 0} files uploaded`
          });
        }
      }
    }
  });
  
  return results;
}

// Generate a natural, conversational summary in Ava's voice
function generateFullSummary(
  sections: ParsedSection[], 
  recommendation: string | null,
  applicationNotes?: ApplicationNotes,
  voiceInterviewResult?: any,
  authoritativeScore?: number | null,
  jobContext?: JobContext
): string {
  const actualSummary = extractActualSummaryFromSections(sections);
  if (actualSummary) {
    return actualSummary;
  }

  // Get phase results from actual notes data (authoritative source)
  const notesPhaseResults = getPhaseResultsFromNotes(applicationNotes);
  
  // Add voice interview from application data if available
  if (voiceInterviewResult) {
    const score = voiceInterviewResult.overallScore || voiceInterviewResult.overall_score;
    if (score !== undefined) {
      notesPhaseResults.push({
        phase: 'Voice Interview',
        score: `${score}/100`,
        details: 'Completed with Ava'
      });
    }
  }
  
  // Collect key data points
  const phaseResults: PhaseResult[] = notesPhaseResults.length > 0 ? notesPhaseResults : [];
  let hasNameMismatch = false;
  let hasResumeIssue = false;
  let noMatchingSkills = false;
  let requiredSkillsFromJob: string[] = [];
  let recommendationText: string | null = recommendation;
  
  // Extract key findings from sections
  for (const section of sections) {
    const titleLower = section.title.toLowerCase();
    
    // Check for cross-reference issues
    if (titleLower.includes('cross') && titleLower.includes('reference')) {
      for (const item of section.items) {
        const itemLower = item.toLowerCase();
        
        // Specifically check the Name Match field for MISMATCH status
        if (itemLower.startsWith('name match:')) {
          // Check for explicit MISMATCH status
          if (itemLower.includes('mismatch') && !itemLower.includes('match -')) {
            hasNameMismatch = true;
          }
          continue;
        }
        
        // For other fields, check for actual mismatch issues but exclude negative contexts
        const hasMismatchWord = itemLower.includes('mismatch') || itemLower.includes('not match') || itemLower.includes('different');
        const isNegativeContext = itemLower.includes('no mismatch') || 
                                   itemLower.includes('no explicit mismatch') ||
                                   itemLower.includes('none') ||
                                   itemLower.includes('not found') ||
                                   itemLower.includes('were found');
        
        if (hasMismatchWord && !isNegativeContext) {
          hasNameMismatch = true;
        }
      }
    }
    
    // Check for resume issues
    if (titleLower.includes('resume') || titleLower.includes('document')) {
      for (const item of section.items) {
        if (item.toLowerCase().includes('different person') || item.toLowerCase().includes('wrong')) {
          hasResumeIssue = true;
        }
      }
    }
    
    // Check for skills gaps
    if (titleLower.includes('skill')) {
      for (const item of section.items) {
        if (item.toLowerCase().includes('no matching') || item.toLowerCase().includes('none found') || 
            (item.toLowerCase().includes('matching') && item.toLowerCase().includes(': none'))) {
          noMatchingSkills = true;
        }
      }
    }
    
    // Get recommendation if not already set
    if (!recommendationText && (titleLower.includes('assessment') || titleLower.includes('recommendation'))) {
      for (const item of section.items) {
        const match = item.match(/^([^:]{2,40}):\s*(.+)$/);
        if (match && (match[1].toLowerCase().includes('recommendation') || match[1].toLowerCase().includes('verdict'))) {
          recommendationText = match[2].trim();
        }
      }
    }
  }
  
  // Build natural narrative
  const paragraphs: string[] = [];
  const jobTitle = jobContext?.title || 'this role';
  const requiredSkills = jobContext?.requiredSkills || [];
  const finalScoreNum = authoritativeScore ?? null;
  
  // Extract specific phase scores for narrative
  let quizScore: number | null = null;
  let typingWpm: number | null = null;
  let chatSimScore: number | null = null;
  let voiceScore: number | null = null;
  let portfolioScore: number | null = null;
  
  for (const phase of phaseResults) {
    const scoreNum = parseInt(phase.score);
    if (phase.phase.toLowerCase().includes('quiz') && !isNaN(scoreNum)) {
      quizScore = scoreNum;
    }
    if (phase.phase.toLowerCase().includes('typing')) {
      const wpmMatch = phase.score.match(/(\d+)/);
      if (wpmMatch) typingWpm = parseInt(wpmMatch[1]);
    }
    if (phase.phase.toLowerCase().includes('chat') && phase.phase.toLowerCase().includes('simulation')) {
      if (!isNaN(scoreNum)) chatSimScore = scoreNum;
    }
    if (phase.phase.toLowerCase().includes('voice') && !isNaN(scoreNum)) {
      voiceScore = scoreNum;
    }
    if (phase.phase.toLowerCase().includes('portfolio') && !isNaN(scoreNum)) {
      portfolioScore = scoreNum;
    }
  }
  
  // ============= Build concise summary with interpretive clarity =============
  const summaryLines: string[] = [];
  
  // Identify top strength and concern first (needed for interpretation)
  let topStrength: string | null = null;
  let strengthLabel: string | null = null;
  if (voiceScore !== null && voiceScore >= 70) {
    topStrength = `${voiceScore}/100`;
    strengthLabel = 'interview performance';
  } else if (quizScore !== null && quizScore >= 70) {
    topStrength = `${quizScore}%`;
    strengthLabel = 'skills assessment';
  } else if (chatSimScore !== null && chatSimScore >= 70) {
    topStrength = `${chatSimScore}/100`;
    strengthLabel = 'customer handling';
  } else if (typingWpm !== null && typingWpm >= 50) {
    topStrength = `${typingWpm} WPM`;
    strengthLabel = 'typing proficiency';
  } else if (portfolioScore !== null && portfolioScore >= 70) {
    topStrength = `${portfolioScore}/100`;
    strengthLabel = 'portfolio';
  }
  
  let topConcern: string | null = null;
  let concernLabel: string | null = null;
  if (hasNameMismatch || hasResumeIssue) {
    topConcern = 'inconsistency detected';
    concernLabel = 'submitted information';
  } else if (quizScore !== null && quizScore < 50) {
    topConcern = `${quizScore}%`;
    concernLabel = 'skills assessment';
  } else if (voiceScore !== null && voiceScore < 50) {
    topConcern = `${voiceScore}/100`;
    concernLabel = 'interview performance';
  } else if (noMatchingSkills) {
    topConcern = 'gaps identified';
    concernLabel = 'required skills';
  } else if (typingWpm !== null && typingWpm < 40) {
    topConcern = `${typingWpm} WPM`;
    concernLabel = 'typing speed';
  }
  
  // Build plain-language summary with actionable next steps
  if (finalScoreNum !== null) {
    if (finalScoreNum >= 80) {
      // Strong candidate - recommend proceeding
      if (topStrength) {
        summaryLines.push(`This candidate performed well across evaluations, with particularly strong ${strengthLabel} (${topStrength}).`);
      } else {
        summaryLines.push(`This candidate performed well across all completed evaluations.`);
      }
      summaryLines.push(`Recommend scheduling an interview or extending an offer.`);
    } else if (finalScoreNum >= 60) {
      // Good candidate with some considerations
      if (topStrength && topConcern) {
        summaryLines.push(`This candidate shows promise in ${strengthLabel} (${topStrength}), but ${concernLabel} (${topConcern}) needs consideration.`);
        summaryLines.push(`Recommend reviewing these areas before moving forward.`);
      } else if (topConcern) {
        summaryLines.push(`This candidate meets baseline expectations, though ${concernLabel} (${topConcern}) may affect fit.`);
        summaryLines.push(`Consider a follow-up conversation to clarify.`);
      } else if (topStrength) {
        summaryLines.push(`This candidate shows solid ${strengthLabel} (${topStrength}) and meets role requirements.`);
        summaryLines.push(`Recommend proceeding to the next stage.`);
      } else {
        summaryLines.push(`This candidate meets most expectations for the role.`);
        summaryLines.push(`Recommend proceeding with caution or requesting additional information.`);
      }
    } else if (finalScoreNum >= 40) {
      // Mixed results - hold or gather more info
      if (topConcern) {
        summaryLines.push(`This candidate showed mixed results. ${concernLabel?.charAt(0).toUpperCase()}${concernLabel?.slice(1)} (${topConcern}) is the main concern.`);
      } else {
        summaryLines.push(`This candidate's performance was below expectations in multiple areas.`);
      }
      if (topStrength) {
        summaryLines.push(`However, ${strengthLabel} (${topStrength}) may warrant a closer look. Recommend holding for now.`);
      } else {
        summaryLines.push(`Recommend placing on hold unless the talent pool is limited.`);
      }
    } else {
      // Weak candidate - recommend passing
      if (topConcern) {
        summaryLines.push(`This candidate did not meet expectations. ${concernLabel?.charAt(0).toUpperCase()}${concernLabel?.slice(1)} (${topConcern}) is a significant gap.`);
      } else {
        summaryLines.push(`This candidate did not meet the requirements for this role.`);
      }
      summaryLines.push(`Recommend passing on this candidate.`);
    }
  } else if (phaseResults.length > 0) {
    summaryLines.push(`This candidate has completed ${phaseResults.length} evaluation${phaseResults.length !== 1 ? 's' : ''}.`);
    summaryLines.push(`Full recommendation will be available once all phases are complete.`);
  } else {
    summaryLines.push(`This candidate's evaluation is in progress.`);
    summaryLines.push(`Check back once they complete required phases.`);
  }
  
  // Return compact summary (2-3 sentences)
  return summaryLines.slice(0, 3).join(' ');
}

// ============= Parsing Logic =============

function parseAIAnalysis(
  content: string, 
  applicationNotes?: ApplicationNotes,
  voiceInterviewResult?: any,
  authoritativeScore?: number | null
): ParsedAnalysis {
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
      const key = kvMatch[1].trim();
      const value = kvMatch[2].trim();
      
      // Extract recommendation from key/value if we haven't found it yet
      if (!result.recommendation && key.toLowerCase() === 'recommendation') {
        result.recommendation = value;
      }
      
      // Extract overall score from key/value if we haven't found it yet
      if (result.score === null && key.toLowerCase().includes('overall score')) {
        const scoreVal = parseInt(value, 10);
        if (Number.isFinite(scoreVal)) {
          result.score = Math.max(0, Math.min(100, scoreVal));
        }
      }
      
      currentSection.items.push(`${key}: ${value}`);
      continue;
    }
  }

  pushSection();

  // Convert raw sections
  result.sections = rawSections.map(section => ({
    title: humanizeTitle(section.title),
    items: section.items,
  }));

  // Generate full summary with application notes for accurate phase detection
  result.fullSummary = generateFullSummary(result.sections, result.recommendation, applicationNotes, voiceInterviewResult, authoritativeScore);

  return result;
}

// ============= Sub-components =============

function ScoreRing({ score, size = "md", isLoading = false }: { score: number; size?: "sm" | "md"; isLoading?: boolean }) {
  const circumference = 94.2;
  const targetDasharray = (score / 100) * circumference;
  
  const getScoreColor = (s: number) => {
    if (isLoading) return "stroke-muted-foreground/50";
    if (s >= 70) return "stroke-success";
    if (s >= 50) return "stroke-warning";
    return "stroke-destructive";
  };
  
  const sizeClasses = size === "sm" ? "w-12 h-12" : "w-14 h-14";
  const textSize = size === "sm" ? "text-sm" : "text-base";
  
  return (
    <div className="relative">
      <svg className={cn(sizeClasses, "-rotate-90", isLoading && "animate-pulse")} viewBox="0 0 36 36">
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
        {isLoading ? (
          <span className={cn(textSize, "font-semibold text-muted-foreground")}>...</span>
        ) : (
          <span className={cn(textSize, "font-semibold text-foreground")}>{score}</span>
        )}
      </div>
    </div>
  );
}

// ============= Phase-Based Analysis Component =============

// Extract insights for a specific phase from the AI analysis sections
// NOTE: We use a dedicated narrative builder to produce a 10–15 sentence, first-person Ava explanation.

function getPhaseLabel(phaseType: PhaseType): string {
  switch (phaseType) {
    case "application_form":
      return "Application Form";
    case "quiz":
      return "Quiz Assessment";
    case "portfolio":
      return "Portfolio";
    case "video":
      return "Video Introduction";
    case "typing":
      return "Typing Test";
    case "chat_simulation":
      return "Chat Simulation";
    case "chat_interview":
      return "Chat Interview";
    case "sales_simulation":
      return "Sales Simulation";
    case "voice_interview":
      return "Video Interview";
    case "resume":
      return "Resume";
    default:
      return "Phase";
  }
}

interface CompletedPhase {
  id: string;
  name: string;
  icon: React.ReactNode;
  score?: string;
  summary: string;
  passed?: boolean;
}

interface PhaseBasedAnalysisProps {
  applicationNotes?: ApplicationNotes;
  voiceInterviewResult?: any;
  rawSections: ParsedSection[];
  isDetailOpen: boolean;
  setIsDetailOpen: (open: boolean) => void;
  wasRejected?: boolean;
}

function PhaseBasedAnalysis({ 
  applicationNotes, 
  voiceInterviewResult, 
  rawSections,
  isDetailOpen,
  setIsDetailOpen,
  wasRejected = false
}: PhaseBasedAnalysisProps) {
  
  // Build completed phases from applicationNotes with AI insights
  const completedPhases = useMemo(() => {
    const phases: CompletedPhase[] = [];
    const hasAIAnalysis = rawSections.length > 0;
    
    if (!applicationNotes) {
      // If no notes, check if we have raw sections to show basic analysis
      if (hasAIAnalysis) {
        phases.push({
          id: 'application',
          name: 'Application Review',
          icon: <CheckCircle2 className="h-4 w-4 text-primary" />,
          summary: rawSections.map(s => generateParagraphSummary(s.items)).filter(Boolean).join(' ')
        });
      }
      return phases;
    }
    
    // Application form answers - detailed Ava narrative
    if (applicationNotes.applicationAnswers && applicationNotes.applicationAnswers.length > 0) {
      const count = applicationNotes.applicationAnswers.length;
      const baseFacts = `The candidate submitted ${count} answer(s).`;
      const phaseType: PhaseType = "application_form";

      phases.push({
        id: "application_form",
        name: getPhaseLabel(phaseType),
        icon: <CheckCircle2 className="h-4 w-4 text-primary" />,
        summary: buildAvaPhaseNarrative({
          phaseType,
          phaseLabel: getPhaseLabel(phaseType),
          baseFacts,
          applicationAnswers: applicationNotes.applicationAnswers,
          voiceInterviewResult,
          rawSections,
          analysisAvailable: hasAIAnalysis,
          wasRejected,
        }),
      });
    }

    // Quiz results - detailed Ava narrative with actual quiz data
    if (applicationNotes.quizResult && typeof applicationNotes.quizResult.score === "number") {
      const quiz = applicationNotes.quizResult;
      const baseFacts = `The candidate scored ${quiz.score}%${quiz.total ? ` (${Math.round((quiz.score / 100) * quiz.total)}/${quiz.total} correct)` : ""}.`;
      const phaseType: PhaseType = "quiz";

      // Extract actual quiz data from notes (stored under stepId like "quiz")
      let quizData: QuizPhaseData | undefined;
      const quizStepData = applicationNotes.quiz || applicationNotes['quiz'];
      if (quizStepData && quizStepData.answers) {
        quizData = {
          answers: quizStepData.answers,
          score: quizStepData.score ?? quiz.score,
          correct: quizStepData.correct ?? 0,
          total: quizStepData.total ?? quiz.total ?? 0,
          passed: quizStepData.passed ?? quiz.passed,
          completedAt: quizStepData.completedAt,
          antiCheatViolations: quizStepData.antiCheatViolations,
          totalViolations: quizStepData.totalViolations,
          violationSummary: quizStepData.violationSummary,
        };
      }

      phases.push({
        id: "quiz",
        name: getPhaseLabel(phaseType),
        icon: quiz.passed ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" />
        ),
        score: `${quiz.score}%`,
        summary: buildAvaPhaseNarrative({
          phaseType,
          phaseLabel: getPhaseLabel(phaseType),
          baseFacts,
          applicationAnswers: applicationNotes.applicationAnswers,
          voiceInterviewResult,
          rawSections,
          analysisAvailable: hasAIAnalysis,
          wasRejected,
          quizData,
        }),
        passed: quiz.passed,
      });
    }

    // Typing test - detailed Ava narrative with actual typing data
    if (applicationNotes.typingTestResult && typeof applicationNotes.typingTestResult.wpm === "number") {
      const typing = applicationNotes.typingTestResult;
      const passed = typing.passed !== false;
      const baseFacts = `The candidate achieved ${typing.wpm} WPM with ${typing.accuracy}% accuracy.`;
      const phaseType: PhaseType = "typing";

      const typingData: TypingPhaseData = {
        wpm: typing.wpm,
        accuracy: typing.accuracy,
        passed: typing.passed,
        requiredWpm: typing.requiredWpm,
      };

      phases.push({
        id: "typing_test",
        name: getPhaseLabel(phaseType),
        icon: passed ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" />
        ),
        score: `${typing.wpm} WPM`,
        summary: buildAvaPhaseNarrative({
          phaseType,
          phaseLabel: getPhaseLabel(phaseType),
          baseFacts,
          applicationAnswers: applicationNotes.applicationAnswers,
          voiceInterviewResult,
          rawSections,
          analysisAvailable: hasAIAnalysis,
          wasRejected,
          typingData,
        }),
        passed,
      });
    }

    // Portfolio - detailed Ava narrative
    // Find portfolio data from step-based storage (e.g., step1, step2) or legacy portfolioResult
    let portfolioData: any = applicationNotes.portfolioResult;
    if (!portfolioData) {
      // Search through notes for portfolio_upload type steps
      for (const key of Object.keys(applicationNotes)) {
        const stepData = applicationNotes[key];
        if (stepData && typeof stepData === 'object' && stepData.type === 'portfolio_upload' && stepData.completed) {
          portfolioData = {
            score: stepData.aiAnalysis?.score,
            feedback: stepData.aiAnalysis?.summary,
            analysis: stepData.aiAnalysis?.summary,
            portfolioUrls: stepData.files?.map((f: any) => f.url),
            aiAnalysis: stepData.aiAnalysis, // Include full analysis for detail view
          };
          break;
        }
      }
    }
    
    if (portfolioData) {
      const score = portfolioData.score || portfolioData.aiAnalysis?.score;
      const aiAnalysis = portfolioData.aiAnalysis;
      const baseFacts = score
        ? `The candidate submitted a portfolio scored at ${score}/100.${aiAnalysis?.summary ? ` ${aiAnalysis.summary}` : ''}`
        : "The candidate submitted a portfolio.";
      const phaseType: PhaseType = "portfolio";

      // Build portfolioData from stored result with enhanced AI analysis data
      const portfolioPhaseData: PortfolioPhaseData = {
        score: score,
        feedback: portfolioData.feedback || aiAnalysis?.summary,
        analysis: portfolioData.analysis || aiAnalysis?.summary,
        portfolioUrls: portfolioData.portfolioUrls,
        fileCount: portfolioData.portfolioUrls?.length,
        // Include detailed analysis breakdown if available
        strengths: aiAnalysis?.strengths,
        improvements: aiAnalysis?.improvements || aiAnalysis?.penaltiesApplied,
        authenticity: aiAnalysis?.authenticity,
        relevance: aiAnalysis?.relevance,
        quality: aiAnalysis?.quality,
        creativity: aiAnalysis?.creativity,
      };

      phases.push({
        id: "portfolio",
        name: getPhaseLabel(phaseType),
        icon: <CheckCircle2 className="h-4 w-4 text-primary" />,
        score: score ? `${score}/100` : undefined,
        summary: buildAvaPhaseNarrative({
          phaseType,
          phaseLabel: getPhaseLabel(phaseType),
          baseFacts,
          applicationAnswers: applicationNotes.applicationAnswers,
          voiceInterviewResult,
          rawSections,
          analysisAvailable: hasAIAnalysis,
          wasRejected,
          portfolioData: portfolioPhaseData,
        }),
      });
    }

    // Video intro - detailed Ava narrative
    if (applicationNotes.videoIntroUrl) {
      const phaseType: PhaseType = "video";
      const baseFacts = "The candidate recorded and submitted a video introduction.";

      phases.push({
        id: "video_intro",
        name: getPhaseLabel(phaseType),
        icon: <CheckCircle2 className="h-4 w-4 text-primary" />,
        summary: buildAvaPhaseNarrative({
          phaseType,
          phaseLabel: getPhaseLabel(phaseType),
          baseFacts,
          applicationAnswers: applicationNotes.applicationAnswers,
          voiceInterviewResult,
          rawSections,
          analysisAvailable: hasAIAnalysis,
          wasRejected,
        }),
      });
    }

    // Chat simulation - detailed Ava narrative
    if (applicationNotes.chatSimulationResult) {
      const chat = applicationNotes.chatSimulationResult;
      const passed = chat.passed !== false;
      const phaseType: PhaseType = "chat_simulation";
      const baseFacts = `The candidate completed the chat simulation${chat.score ? ` and scored ${chat.score}/100` : ""}.`;

      // Build chatSimulationData from stored result
      const chatSimulationData: ChatSimulationPhaseData = {
        score: chat.score,
        passed: chat.passed,
        scenario: chat.scenario,
        messageCount: chat.messageCount,
        evaluation: chat.evaluation,
        messages: chat.messages,
        empathy: chat.empathy,
        problemSolving: chat.problemSolving,
        communication: chat.communication,
        professionalism: chat.professionalism,
        strengths: chat.strengths,
        improvements: chat.improvements,
        overallFeedback: chat.overallFeedback,
        antiCheatSummary: chat.antiCheatSummary,
      };

      phases.push({
        id: "chat_simulation",
        name: getPhaseLabel(phaseType),
        icon: passed ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-warning" />
        ),
        score: chat.score ? `${chat.score}/100` : undefined,
        summary: buildAvaPhaseNarrative({
          phaseType,
          phaseLabel: getPhaseLabel(phaseType),
          baseFacts,
          applicationAnswers: applicationNotes.applicationAnswers,
          voiceInterviewResult,
          rawSections,
          analysisAvailable: hasAIAnalysis,
          wasRejected,
          chatSimulationData,
        }),
        passed,
      });
    }

    // Chat interview - detailed Ava narrative
    if (applicationNotes.chatInterviewResult) {
      const interview = applicationNotes.chatInterviewResult;
      const phaseType: PhaseType = "chat_interview";
      const baseFacts = `The candidate completed the chat interview${interview.score ? ` and scored ${interview.score}/100` : ""}.`;

      // Build chatInterviewData from stored result
      const chatInterviewData: ChatInterviewPhaseData = {
        score: interview.score,
        overallScore: interview.overallScore,
        messageCount: interview.messageCount,
        duration: interview.duration,
        summary: interview.summary,
        messages: interview.messages,
        communication: interview.communication,
        technicalKnowledge: interview.technicalKnowledge,
        problemSolving: interview.problemSolving,
        enthusiasm: interview.enthusiasm,
        strengths: interview.strengths,
        improvements: interview.improvements,
      };

      phases.push({
        id: "chat_interview",
        name: getPhaseLabel(phaseType),
        icon: <CheckCircle2 className="h-4 w-4 text-primary" />,
        score: interview.score ? `${interview.score}/100` : undefined,
        summary: buildAvaPhaseNarrative({
          phaseType,
          phaseLabel: getPhaseLabel(phaseType),
          baseFacts,
          applicationAnswers: applicationNotes.applicationAnswers,
          voiceInterviewResult,
          rawSections,
          analysisAvailable: hasAIAnalysis,
          wasRejected,
          chatInterviewData,
        }),
      });
    }

    // Sales simulation - detailed Ava narrative
    if (applicationNotes.salesSimulationResult) {
      const sales = applicationNotes.salesSimulationResult;
      const passed = sales.passed !== false;
      const phaseType: PhaseType = "sales_simulation";
      const baseFacts = `The candidate completed the sales simulation${sales.score ? ` and scored ${sales.score}/100` : ""}.`;

      // Build salesSimulationData from stored result
      const salesSimulationData: SalesSimulationPhaseData = {
        score: sales.score,
        passed: sales.passed,
        evaluation: sales.evaluation,
        messages: sales.messages,
        rapport: sales.rapport,
        needsDiscovery: sales.needsDiscovery,
        productKnowledge: sales.productKnowledge,
        objectionHandling: sales.objectionHandling,
        closingSkills: sales.closingSkills,
        strengths: sales.strengths,
        improvements: sales.improvements,
        overallFeedback: sales.overallFeedback,
        antiCheatSummary: sales.antiCheatSummary,
      };

      phases.push({
        id: "sales_simulation",
        name: getPhaseLabel(phaseType),
        icon: passed ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-warning" />
        ),
        score: sales.score ? `${sales.score}/100` : undefined,
        summary: buildAvaPhaseNarrative({
          phaseType,
          phaseLabel: getPhaseLabel(phaseType),
          baseFacts,
          applicationAnswers: applicationNotes.applicationAnswers,
          voiceInterviewResult,
          rawSections,
          analysisAvailable: hasAIAnalysis,
          wasRejected,
          salesSimulationData,
        }),
        passed,
      });
    }

    // Video interview - detailed Ava narrative with ALL premium fields
    if (voiceInterviewResult) {
      const score = voiceInterviewResult.overall_score || voiceInterviewResult.overallScore;
      const phaseType: PhaseType = "voice_interview";
      const baseFacts = score
        ? `The candidate completed a video interview and scored ${score}/100.`
        : "The candidate completed a video interview.";

      // Pass the FULL voiceInterviewResult as voiceData to preserve all premium fields
      // This includes: executive_summary, recommendation, credibility_rating, score breakdowns,
      // soft_skills, communication_metrics, strengths, concerns, inconsistencies,
      // question_analysis, notable_quotes, suggested_followups, etc.
      const voiceData: VoiceInterviewPhaseData = {
        overall_score: voiceInterviewResult.overall_score,
        overallScore: voiceInterviewResult.overallScore,
        summary: voiceInterviewResult.summary,
        executive_summary: voiceInterviewResult.executive_summary,
        recommendation: voiceInterviewResult.recommendation,
        credibility_rating: voiceInterviewResult.credibility_rating,
        // Score breakdown
        communication_score: voiceInterviewResult.communication_score,
        technical_score: voiceInterviewResult.technical_score,
        culture_fit_score: voiceInterviewResult.culture_fit_score,
        problem_solving_score: voiceInterviewResult.problem_solving_score,
        adaptability_score: voiceInterviewResult.adaptability_score,
        leadership_potential_score: voiceInterviewResult.leadership_potential_score,
        // Soft skills
        soft_skills: voiceInterviewResult.soft_skills,
        // Communication metrics
        communication_metrics: voiceInterviewResult.communication_metrics,
        // Lists
        strengths: voiceInterviewResult.strengths,
        concerns: voiceInterviewResult.concerns,
        inconsistencies: voiceInterviewResult.inconsistencies,
        // Questions & quotes
        question_analysis: voiceInterviewResult.question_analysis,
        notable_quotes: voiceInterviewResult.notable_quotes,
        suggested_followups: voiceInterviewResult.suggested_followups,
        // Legacy
        questions: voiceInterviewResult.questions,
        transcript: voiceInterviewResult.transcript,
        duration: voiceInterviewResult.duration,
      };

      phases.push({
        id: "voice_interview",
        name: getPhaseLabel(phaseType),
        icon: <CheckCircle2 className="h-4 w-4 text-primary" />,
        score: score ? `${score}/100` : undefined,
        summary: buildAvaPhaseNarrative({
          phaseType,
          phaseLabel: getPhaseLabel(phaseType),
          baseFacts,
          applicationAnswers: applicationNotes.applicationAnswers,
          voiceInterviewResult,
          rawSections,
          analysisAvailable: hasAIAnalysis,
          wasRejected,
          voiceData,
        }),
      });
    }

    // Check for step-based submissions (video/portfolio) - detailed Ava narrative
    Object.keys(applicationNotes).forEach((key) => {
      const stepData = applicationNotes[key];
      if (stepData && typeof stepData === "object" && !Array.isArray(stepData)) {
        if ((stepData.type === "video_intro" || stepData.type === "video_message") && stepData.videoUrl) {
          if (!phases.some((p) => p.id === "video_intro")) {
            const phaseType: PhaseType = "video";
            const baseFacts = "The candidate recorded and submitted a video introduction.";
            phases.push({
              id: "video_intro",
              name: getPhaseLabel(phaseType),
              icon: <CheckCircle2 className="h-4 w-4 text-primary" />,
              summary: buildAvaPhaseNarrative({
                phaseType,
                phaseLabel: getPhaseLabel(phaseType),
                baseFacts,
                applicationAnswers: applicationNotes.applicationAnswers,
                voiceInterviewResult,
                rawSections,
                analysisAvailable: hasAIAnalysis,
                wasRejected,
              }),
            });
          }
        }

        if (stepData.type === "portfolio_upload" && stepData.completed) {
          if (!phases.some((p) => p.id === "portfolio")) {
            const phaseType: PhaseType = "portfolio";
            const count = stepData.portfolioUrls?.length || 0;
            const baseFacts = `The candidate uploaded ${count} portfolio item(s).`;
            phases.push({
              id: "portfolio",
              name: "Portfolio Upload",
              icon: <CheckCircle2 className="h-4 w-4 text-primary" />,
              summary: buildAvaPhaseNarrative({
                phaseType,
                phaseLabel: "Portfolio Upload",
                baseFacts,
                applicationAnswers: applicationNotes.applicationAnswers,
                voiceInterviewResult,
                rawSections,
                analysisAvailable: hasAIAnalysis,
                wasRejected,
              }),
            });
          }
        }
      }
    });

    return phases;
  }, [applicationNotes, voiceInterviewResult, rawSections, wasRejected]);

  // If no completed phases, don't show anything
  if (completedPhases.length === 0) {
    return null;
  }
  
  return (
    <Collapsible open={isDetailOpen} onOpenChange={setIsDetailOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-2">
        <ChevronDown className={cn(
          "h-4 w-4 transition-transform",
          isDetailOpen && "rotate-180"
        )} />
        <span>See evaluation breakdown ({completedPhases.length} step{completedPhases.length !== 1 ? 's' : ''} completed)</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-2 space-y-3">
          {completedPhases.map((phase) => (
            <div key={phase.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
              <div className="mt-0.5">{phase.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-medium text-foreground">{phase.name}</h4>
                  {phase.score && (
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full",
                      phase.passed === false
                        ? "bg-destructive/10 text-destructive"
                        : phase.passed === true
                          ? "bg-success/10 text-success"
                          : "bg-primary/10 text-primary"
                    )}>
                      {phase.score}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere]">
                  {sanitizeAnalysisCopy(phase.summary)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============= Main Component =============

interface CondensedAIAnalysisProps {
  content: string;
  className?: string;
  applicationNotes?: ApplicationNotes;
  voiceInterviewResult?: any;
  aiScore?: number | null; // Authoritative score from database
  applicationStatus?: string; // Current application status (for rejection override)
  rejectionReason?: string | null; // Phase AI analysis explaining rejection
  passingScore?: number | null; // Job's passing score for fallback rejection reason
  rejectedByType?: string | null; // 'ava' for autopilot, 'employer' for manual
  isAnalyzing?: boolean; // Whether re-analysis is in progress
}

function deriveRecommendationLabel(params: {
  isRejected: boolean;
  recommendation: string | null;
  score: number | null;
  passingScore?: number | null;
  scorecardAction?: "advance" | "review" | "reject";
  decisionState?: "ready_for_decision" | "needs_more_evidence";
}) {
  if (params.isRejected) {
    return "Do not move forward";
  }

  if (params.decisionState === "needs_more_evidence") {
    return "Continue to next phase";
  }

  if (params.scorecardAction === "advance") {
    return "Move forward";
  }

  if (params.scorecardAction === "review") {
    return "Review manually";
  }

  if (params.scorecardAction === "reject") {
    return "Do not move forward";
  }

  const recommendation = sanitizeAnalysisCopy(params.recommendation || "").toLowerCase();
  if (
    recommendation.includes("not recommend") ||
    recommendation.includes("reject") ||
    recommendation.includes("do not") ||
    recommendation.includes("pass on")
  ) {
    return "Do not move forward";
  }

  if (
    recommendation.includes("proceed") ||
    recommendation.includes("advance") ||
    recommendation.includes("hire") ||
    recommendation.includes("strong") ||
    recommendation.includes("move forward")
  ) {
    return "Move forward";
  }

  if (
    recommendation.includes("consider") ||
    recommendation.includes("review") ||
    recommendation.includes("caution") ||
    recommendation.includes("additional information") ||
    recommendation.includes("clarify")
  ) {
    return "Review manually";
  }

  if (params.score !== null && params.passingScore != null) {
    return params.score >= params.passingScore ? "Review manually" : "Hold for now";
  }

  return "Needs more evidence";
}

function getConfidenceTone(confidence: number | null | undefined) {
  if (typeof confidence !== "number") return null;
  if (confidence >= 80) return "High";
  if (confidence >= 55) return "Medium";
  return "Low";
}

function getResumeEvidenceLabel(meta?: ApplicationNotes["avaAnalysisMeta"]) {
  const resume = meta?.resume;
  if (!resume?.provided) return "No resume provided";
  if (!resume.analyzed) return "Application-only analysis";
  if (resume.status === "text_and_visual") {
    return `Resume analyzed from text + ${resume.imagePagesUsed || 0} page${resume.imagePagesUsed === 1 ? "" : "s"}`;
  }
  if (resume.status === "text_only") return "Resume analyzed from extracted text";
  if (resume.status === "visual_only") {
    return `Resume analyzed from ${resume.imagePagesUsed || 1} page image${resume.imagePagesUsed === 1 ? "" : "s"}`;
  }
  return "Resume analyzed";
}

function formatSignalLabel(signal: string) {
  return signal
    .replace(/_/g, " ")
    .replace(/\bava\b/gi, "Ava")
    .replace(/\bintro\b/gi, "Intro")
    .replace(/\bquiz\b/gi, "Quiz")
    .replace(/\bchat\b/gi, "Chat")
    .replace(/\bvoice\b/gi, "Voice")
    .replace(/\bvideo\b/gi, "Video")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function deriveEvidenceInputs(notes?: ApplicationNotes) {
  const meta = notes?.avaAnalysisMeta;
  const inputs = meta?.inputsUsed;
  const quizStepData = notes?.quiz || notes?.["quiz"];

  return {
    resume: !!meta?.resume?.provided,
    applicationAnswers: Math.max(inputs?.applicationAnswers || 0, notes?.applicationAnswers?.length || 0),
    coverLetter: !!inputs?.coverLetter,
    quiz: !!(
      inputs?.quiz ||
      notes?.quizResult ||
      (quizStepData && quizStepData.answers) ||
      (notes?.quizAnswers && Object.keys(notes.quizAnswers).length > 0)
    ),
    typingTest: !!(inputs?.typingTest || notes?.typingTestResult),
    chatSimulation: !!(inputs?.chatSimulation || notes?.chatSimulationResult),
    salesSimulation: !!(inputs?.salesSimulation || notes?.salesSimulationResult),
    chatInterview: !!(inputs?.chatInterview || notes?.chatInterviewResult),
    portfolio: !!(inputs?.portfolio || notes?.portfolioResult),
    videoIntro: !!(inputs?.videoIntro || notes?.videoIntroResult),
    voiceInterview: !!(inputs?.voiceInterview || notes?.voiceInterviewNotes?.length || notes?.voiceInterviewInconsistencies?.length),
  };
}

function getEvidenceBasis(notes?: ApplicationNotes) {
  const inputs = deriveEvidenceInputs(notes);
  const parts: string[] = [];

  if (inputs.resume) parts.push("resume");
  if ((inputs?.applicationAnswers || 0) > 0) parts.push("application answers");
  if (inputs?.coverLetter) parts.push("cover letter");
  if (inputs?.quiz) parts.push("quiz");
  if (inputs?.typingTest) parts.push("typing test");
  if (inputs?.chatSimulation) parts.push("chat simulation");
  if (inputs?.salesSimulation) parts.push("sales simulation");
  if (inputs?.chatInterview) parts.push("chat interview");
  if (inputs?.portfolio) parts.push("portfolio");
  if (inputs?.videoIntro) parts.push("video intro");
  if (inputs?.voiceInterview) parts.push("voice interview");

  if (parts.length === 0) return null;
  return `Based on ${parts.join(" + ")}`;
}

function getEvidenceBadges(notes?: ApplicationNotes) {
  const badges: string[] = [];
  const inputs = deriveEvidenceInputs(notes);

  const resumeLabel = getResumeEvidenceLabel(notes?.avaAnalysisMeta);
  if (resumeLabel) badges.push(resumeLabel);
  if ((inputs?.applicationAnswers || 0) > 0) badges.push(`${inputs?.applicationAnswers} application answers`);
  if (inputs?.coverLetter) badges.push("Cover letter");
  if (inputs?.quiz) badges.push("Quiz");
  if (inputs?.typingTest) badges.push("Typing test");
  if (inputs?.chatSimulation) badges.push("Chat simulation");
  if (inputs?.salesSimulation) badges.push("Sales simulation");
  if (inputs?.chatInterview) badges.push("Chat interview");
  if (inputs?.portfolio) badges.push("Portfolio");
  if (inputs?.videoIntro) badges.push("Video intro");
  if (inputs?.voiceInterview) badges.push("Voice interview");

  return badges;
}

export function CondensedAIAnalysis({ 
  content, 
  className, 
  applicationNotes,
  voiceInterviewResult,
  aiScore,
  applicationStatus,
  rejectionReason,
  passingScore,
  rejectedByType,
  isAnalyzing = false
}: CondensedAIAnalysisProps) {
  const parsed = useMemo(() => parseAIAnalysis(content, applicationNotes, voiceInterviewResult, aiScore), [content, applicationNotes, voiceInterviewResult, aiScore]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const scorecard = applicationNotes?.avaScorecard;
  const analysisMeta = applicationNotes?.avaAnalysisMeta;
  const evidenceBadges = useMemo(() => getEvidenceBadges(applicationNotes), [applicationNotes]);
  const evidenceBasis = useMemo(() => getEvidenceBasis(applicationNotes), [applicationNotes]);
  const confidenceTone = getConfidenceTone(scorecard?.confidence);
  
  // Use authoritative score from database if provided, otherwise use parsed score
  const displayScore = aiScore ?? parsed.score;
  const effectivePassingScore = passingScore ?? 60;
  
  // CRITICAL: If application is rejected, override the verdict regardless of AI analysis
  const isRejected = applicationStatus === 'rejected';
  const wasManualRejection = isRejected && !!rejectedByType && rejectedByType !== "ava";
  const needsMoreEvidence = scorecard?.decisionState === "needs_more_evidence" && !isRejected;
  const pendingSignals = useMemo(
    () => (scorecard?.pendingHighSignalPhases || []).map(formatSignalLabel),
    [scorecard?.pendingHighSignalPhases],
  );
  const transferableEvidence = useMemo(
    () => (scorecard?.transferableEvidence || []).map((entry) => String(entry || "").trim()).filter(Boolean),
    [scorecard?.transferableEvidence],
  );
  const showsTransferableFit = !!(
    transferableEvidence.length > 0 &&
    typeof scorecard?.transferableFitScore === "number" &&
    typeof scorecard?.directMatchScore === "number" &&
    scorecard.transferableFitScore >= Math.max(55, scorecard.directMatchScore)
  );
  const visibleRiskFlags = useMemo(() => {
    const flags = scorecard?.riskFlags || [];
    if (!needsMoreEvidence) return flags;
    return flags.filter((flag) => !/below the passing threshold/i.test(flag));
  }, [scorecard?.riskFlags, needsMoreEvidence]);
  const verdictText = deriveRecommendationLabel({
    isRejected,
    recommendation: parsed.recommendation,
    score: displayScore,
    passingScore,
    scorecardAction: scorecard?.recommendedAction,
    decisionState: scorecard?.decisionState,
  });
  const isPositiveRec = verdictText === "Move forward";
  const isNegativeRec = verdictText === "Do not move forward";

  const verdictIcon = isRejected
    ? <XCircle className="h-5 w-5 text-destructive" />
    : isPositiveRec
      ? <CheckCircle2 className="h-5 w-5 text-success" />
      : isNegativeRec
        ? <XCircle className="h-5 w-5 text-destructive" />
        : <AlertTriangle className="h-5 w-5 text-warning" />;

  const verdictColor = isRejected
    ? "text-destructive"
    : isPositiveRec
      ? "text-success"
      : isNegativeRec
        ? "text-destructive"
        : "text-warning";
  
  // Generate a full summary that includes rejection context when rejected
  const displaySummary = useMemo(() => {
    const parsedSummary = neutralizePendingPhaseLanguage(parsed.fullSummary, applicationNotes);

    if (isRejected) {
      // For Ava autopilot rejections, PRESERVE the original AI analysis
      if (rejectedByType === 'ava') {
        // Keep the original narrative, just add a brief context prefix if score is below threshold
        const scoreValue = displayScore ?? 0;
        const threshold = passingScore ?? 60;
        if (scoreValue < threshold && parsedSummary) {
          return `Automatically rejected (score ${scoreValue}% below ${threshold}% threshold). ${parsedSummary}`;
        }
        // If we have the original summary, use it as-is
        if (parsedSummary) {
          return parsedSummary;
        }
      }
      
      // For manual rejections by owner or team member, show the explicit reason if provided
      if (wasManualRejection) {
        if (rejectionReason) {
          return `Rejected by the hiring team. ${rejectionReason}`;
        }
        return `This application was manually rejected by the hiring team. ${parsed.fullSummary || ''}`.trim();
      }
      
      // Fallback for rejections without type info (legacy data)
      if (rejectionReason) {
        return rejectionReason;
      }
      // Generate a fallback reason based on score
      const scoreValue = displayScore ?? 0;
      const threshold = passingScore ?? 60;
      if (scoreValue < threshold) {
        return `This application was rejected because the overall score of ${scoreValue}% did not meet the passing threshold of ${threshold}%. ${parsedSummary}`;
      }
      // Generic fallback if no score info
      return `This application has been rejected. ${parsedSummary}`;
    }
    const scorecardRationale = neutralizePendingPhaseLanguage(scorecard?.rationale || "", applicationNotes);

    if (needsMoreEvidence) {
      const baseSummary = scorecardRationale || parsedSummary;
      const evidenceLead = /needs more evidence/i.test(baseSummary)
        ? baseSummary
        : `Ava needs more evidence before a final reject or advance recommendation.${baseSummary ? ` ${baseSummary}` : ""}`.trim();
      const pendingLine = pendingSignals.length > 0
        ? ` Pending signals: ${pendingSignals.join(", ")}.`
        : "";

      return `${evidenceLead}${pendingLine}`.trim();
    }

    if (scorecardRationale) {
      const hasSpecificEvidence = /\bresume|application|quiz|typing|simulation|interview|portfolio|video|skills|experience\b/i.test(parsedSummary);
      return hasSpecificEvidence && !parsedSummary.toLowerCase().startsWith(scorecardRationale.toLowerCase())
        ? `${scorecardRationale} ${parsedSummary}`.trim()
        : scorecardRationale;
    }

    return parsedSummary;
  }, [isRejected, rejectedByType, rejectionReason, displayScore, passingScore, parsed.fullSummary, scorecard?.rationale, needsMoreEvidence, pendingSignals]);
  const cleanedDisplaySummary = sanitizeAnalysisCopy(displaySummary);
  const decisionStatusLabel = scorecard?.decisionState
    ? needsMoreEvidence
      ? "Decision status: Gathering evidence"
      : "Decision status: Ready for review"
    : null;
  const scoreSummaryLabel = displayScore !== null
    ? needsMoreEvidence
      ? `Provisional score ${displayScore}/100 • Pass threshold ${effectivePassingScore}/100`
      : `Score ${displayScore}/100 • Pass threshold ${effectivePassingScore}/100`
    : null;
  
  
  return (
    <div className={cn("space-y-4", className)}>
      {/* Ava Recommendation Header */}
      <div className="space-y-0.5">
        <h3 className="text-lg font-semibold text-foreground">Ava Recommendation</h3>
        <p className="text-xs text-muted-foreground">{evidenceBasis || "Based on the evidence collected so far"}</p>
      </div>
      
      {/* Recommendation Summary Card */}
      <Card className="border-border/50 bg-card">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {verdictIcon}
                <div className="space-y-0.5">
                  <span className="text-xs font-medium text-muted-foreground">Recommended next step</span>
                  <div className={cn("text-base font-semibold", verdictColor)}>
                    {verdictText}
                  </div>
                </div>
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {evidenceBasis && (
                  <span>{evidenceBasis}</span>
                )}
                {decisionStatusLabel && (
                  <Badge
                    variant="outline"
                    className={needsMoreEvidence ? "text-[11px] border-warning/40 text-warning" : "text-[11px]"}
                  >
                    {decisionStatusLabel}
                  </Badge>
                )}
                {scoreSummaryLabel && (
                  <span>{scoreSummaryLabel}</span>
                )}
                {confidenceTone && typeof scorecard?.confidence === "number" && (
                  <Badge variant="outline" className="text-[11px]">
                    {needsMoreEvidence ? "Evidence confidence" : `${confidenceTone} evidence confidence`} • {scorecard.confidence}%
                  </Badge>
                )}
                {needsMoreEvidence && (
                  <Badge variant="outline" className="text-[11px] border-warning/40 text-warning">
                    Awaiting more evidence
                  </Badge>
                )}
                {showsTransferableFit && (
                  <Badge variant="outline" className="text-[11px] border-success/40 text-success">
                    Transferable fit {scorecard?.transferableFitScore}%
                  </Badge>
                )}
                {analysisMeta?.analyzedAt && (
                  <span>Updated {new Date(analysisMeta.analyzedAt).toLocaleString()}</span>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Why Ava says this</p>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {cleanedDisplaySummary}
                </p>
                {showsTransferableFit && transferableEvidence.length > 0 && (
                  <p className="text-xs text-success">
                    Transferable fit recognized from {transferableEvidence.join(", ")}.
                  </p>
                )}
                {needsMoreEvidence && pendingSignals.length > 0 && (
                  <p className="text-xs text-warning">
                    Pending signals: {pendingSignals.join(", ")}
                  </p>
                )}
              </div>
            </div>
            {displayScore !== null && (
              <ScoreRing score={displayScore} isLoading={isAnalyzing} />
            )}
          </div>
        </CardContent>
      </Card>

      {(evidenceBadges.length > 0 || visibleRiskFlags.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {evidenceBadges.length > 0 && (
            <Card className="border-border/50 bg-card">
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Evidence reviewed</p>
                <div className="flex flex-wrap gap-2">
                  {evidenceBadges.map((badge) => (
                    <Badge key={badge} variant="outline" className="text-[11px] whitespace-normal text-left">
                      {badge}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {visibleRiskFlags.length > 0 && (
            <Card className="border-border/50 bg-card">
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Needs a closer look</p>
                <div className="space-y-1.5">
                  {visibleRiskFlags.slice(0, 3).map((flag) => (
                    <div key={flag} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                      <span className="break-words [overflow-wrap:anywhere]">{flag}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      
      {/* Phase-Based Details Section - Only show completed phases */}
      <PhaseBasedAnalysis 
        applicationNotes={applicationNotes} 
        voiceInterviewResult={voiceInterviewResult}
        rawSections={parsed.sections}
        isDetailOpen={isDetailOpen}
        setIsDetailOpen={setIsDetailOpen}
        wasRejected={isRejected}
      />
    </div>
  );
}
