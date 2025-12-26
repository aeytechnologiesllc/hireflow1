import { useState, useEffect, useMemo } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import {
  ChevronDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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

// Generate a comprehensive full summary - dynamic, job-aware, no hardcoded phrases
function generateFullSummary(
  sections: ParsedSection[], 
  recommendation: string | null,
  applicationNotes?: ApplicationNotes,
  voiceInterviewResult?: any,
  authoritativeScore?: number | null,
  jobContext?: JobContext
): string {
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
  
  // Collect data from all sections
  const phaseResults: PhaseResult[] = notesPhaseResults.length > 0 ? notesPhaseResults : [];
  const resumeFindings: string[] = [];
  const skillsInfo: string[] = [];
  const personalityInfo: string[] = [];
  const experienceInfo: string[] = [];
  const concerns: string[] = [];
  const strengths: string[] = [];
  const crossRefFindings: string[] = [];
  let overallScore: string | null = null;
  let recommendationText: string | null = recommendation;
  let jobFitDetails: string[] = [];
  let cultureIndicators: string[] = [];
  
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
        // Skip placeholder items
        if (isPlaceholderValue(item)) continue;
        
        const match = item.match(/^([^:]{2,40}):\s*(.+)$/);
        if (match) {
          const label = match[1].trim().toLowerCase();
          const value = match[2].trim();
          
          // Skip placeholder values
          if (isPlaceholderValue(value)) continue;
          
          const cleanedValue = cleanPlaceholderFromText(value);
          if (!cleanedValue) continue;
          
          if (label.includes('matching') || label.includes('relevant')) {
            if (cleanedValue.toLowerCase().includes('none') || cleanedValue === '0') {
              skillsInfo.push('No matching skills were found for this position');
              concerns.push('No relevant skills match');
            } else {
              skillsInfo.push(`Matching skills: ${cleanedValue}`);
            }
          }
          
          if (label.includes('missing') || label.includes('gap')) {
            if (!cleanedValue.toLowerCase().includes('none')) {
              skillsInfo.push(`Skills gaps identified: ${cleanedValue}`);
            }
          }
          
          if (label.includes('strength')) {
            strengths.push(cleanedValue);
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
  
  // Build comprehensive narrative - DYNAMIC, job-aware, no hardcoded phrases
  const paragraphs: string[] = [];
  const jobTitle = jobContext?.title || 'this position';
  const companyName = jobContext?.companyName;
  const requiredSkills = jobContext?.requiredSkills || [];
  
  // Use authoritative score
  const finalScoreNum = authoritativeScore ?? (overallScore ? parseInt(overallScore) : null);
  
  // ============= PARAGRAPH 1: Dynamic Opening Based on Assessment =============
  const openingSentences: string[] = [];
  
  // Dynamic opening based on what we found - NOT hardcoded
  if (finalScoreNum !== null) {
    if (finalScoreNum >= 80) {
      openingSentences.push(`This is a strong candidate for ${jobTitle}.`);
    } else if (finalScoreNum >= 60) {
      openingSentences.push(`This candidate shows potential for ${jobTitle}, with some areas to consider.`);
    } else if (finalScoreNum >= 40) {
      openingSentences.push(`I have reservations about this candidate for ${jobTitle}.`);
    } else {
      openingSentences.push(`This candidate doesn't appear to be a good fit for ${jobTitle}.`);
    }
  } else if (phaseResults.length > 0) {
    openingSentences.push(`Here's my assessment based on ${phaseResults.length} completed evaluation${phaseResults.length !== 1 ? 's' : ''}.`);
  } else {
    openingSentences.push(`Initial application received - awaiting assessment phases.`);
  }
  
  // Key performance highlights (not listing phases, but highlighting standouts)
  const standoutPhases: string[] = [];
  const concernPhases: string[] = [];
  
  for (const phase of phaseResults) {
    const scoreNum = parseInt(phase.score);
    if (!isNaN(scoreNum)) {
      if (phase.phase === 'Quiz') {
        if (scoreNum >= 80) standoutPhases.push(`strong knowledge assessment (${phase.score})`);
        else if (scoreNum < 50) concernPhases.push(`knowledge gaps in assessment (${phase.score})`);
      }
      if (phase.phase === 'Portfolio') {
        if (scoreNum >= 80) standoutPhases.push(`impressive portfolio work (${phase.score})`);
        else if (scoreNum < 50) concernPhases.push(`portfolio below expectations (${phase.score})`);
      }
      if (phase.phase === 'Voice Interview') {
        if (scoreNum >= 80) standoutPhases.push(`excellent communication in interview (${phase.score})`);
        else if (scoreNum < 50) concernPhases.push(`communication challenges in interview (${phase.score})`);
      }
      if (phase.phase === 'Chat Simulation') {
        if (scoreNum >= 80) standoutPhases.push(`handled customer scenarios well (${phase.score})`);
        else if (scoreNum < 50) concernPhases.push(`struggled with customer simulation (${phase.score})`);
      }
    }
    if (phase.phase === 'Typing Test') {
      const wpm = parseInt(phase.score);
      if (wpm >= 60) standoutPhases.push(`good typing speed (${phase.score})`);
      else if (wpm < 30) concernPhases.push(`slow typing speed (${phase.score})`);
    }
  }
  
  if (standoutPhases.length > 0) {
    openingSentences.push(`Strengths: ${standoutPhases.join(', ')}.`);
  }
  if (concernPhases.length > 0) {
    openingSentences.push(`Concerns: ${concernPhases.join(', ')}.`);
  }
  
  if (openingSentences.length > 0) {
    paragraphs.push(openingSentences.join(' '));
  }
  
  // ============= PARAGRAPH 2: Job Fit & Skills Analysis =============
  const fitSentences: string[] = [];
  
  // Skills match vs job requirements
  const matchingSkillsList = skillsInfo.filter(s => s.toLowerCase().includes('matching')).map(s => cleanPlaceholderFromText(s.replace(/matching skills:\s*/i, ''))).filter(Boolean);
  const missingSkillsList = skillsInfo.filter(s => s.toLowerCase().includes('missing') || s.toLowerCase().includes('gap')).map(s => cleanPlaceholderFromText(s.replace(/missing skills:\s*|skills gap[s]? identified:\s*/gi, ''))).filter(Boolean);
  
  if (matchingSkillsList.length > 0 && matchingSkillsList[0] && !isPlaceholderValue(matchingSkillsList[0])) {
    fitSentences.push(`Relevant skills found: ${matchingSkillsList[0]}.`);
  }
  
  if (missingSkillsList.length > 0 && missingSkillsList[0] && !isPlaceholderValue(missingSkillsList[0]) && !missingSkillsList[0].toLowerCase().includes('none')) {
    fitSentences.push(`Skills to develop: ${missingSkillsList[0]}.`);
  }
  
  // Experience context
  const expSummary = experienceInfo.find(e => !e.toLowerCase().includes('unknown') && !isPlaceholderValue(e));
  if (expSummary) {
    fitSentences.push(expSummary + '.');
  }
  
  // Resume verification issues (only if significant)
  const hasNameMismatch = crossRefFindings.some(f => f.toLowerCase().includes('mismatch') || f.toLowerCase().includes('not match'));
  const hasResumeIssue = resumeFindings.some(f => f.toLowerCase().includes('different person') || f.toLowerCase().includes('wrong'));
  
  if (hasNameMismatch || hasResumeIssue) {
    fitSentences.push(`⚠️ Document verification flagged: ${hasNameMismatch ? 'name discrepancy detected' : 'resume authenticity concerns'}.`);
  }
  
  if (fitSentences.length > 0) {
    paragraphs.push(fitSentences.join(' '));
  }
  
  // ============= PARAGRAPH 3: Personality & Culture Fit =============
  const cultureSentences: string[] = [];
  
  // Only include meaningful personality insights
  const meaningfulPersonality = personalityInfo.filter(p => p && p.length > 10 && !isPlaceholderValue(p));
  if (meaningfulPersonality.length > 0) {
    cultureSentences.push(`Personality profile: ${meaningfulPersonality.slice(0, 2).join('. ')}.`);
  }
  
  // Culture indicators from analysis
  const uniqueCultureIndicators = [...new Set(cultureIndicators)].filter(c => c && !isPlaceholderValue(c));
  if (uniqueCultureIndicators.length > 0) {
    cultureSentences.push(`Work style indicators: ${uniqueCultureIndicators.join(', ')}.`);
  }
  
  if (cultureSentences.length > 0) {
    paragraphs.push(cultureSentences.join(' '));
  }
  
  // ============= PARAGRAPH 4: Concerns (only if significant) =============
  const uniqueConcerns = [...new Set(concerns)].filter(c => c && c.length > 5 && !isPlaceholderValue(c));
  if (uniqueConcerns.length > 0) {
    const concernList = uniqueConcerns.slice(0, 3).join('; ');
    paragraphs.push(`Key concerns: ${concernList}.`);
  }
  
  // ============= PARAGRAPH 5: Final Verdict =============
  const verdictSentences: string[] = [];
  
  if (finalScoreNum !== null) {
    verdictSentences.push(`Overall score: ${finalScoreNum}/100.`);
  }
  
  if (recommendationText) {
    const cleanRec = recommendationText.replace(/^\*\*|\*\*$/g, '').trim();
    verdictSentences.push(`Recommendation: ${cleanRec}.`);
  } else if (finalScoreNum !== null) {
    if (finalScoreNum >= 75) {
      verdictSentences.push(`This candidate is worth advancing to the next stage.`);
    } else if (finalScoreNum >= 50) {
      verdictSentences.push(`Consider based on your specific priorities for this role.`);
    } else {
      verdictSentences.push(`I recommend passing on this candidate.`);
    }
  }
  
  if (verdictSentences.length > 0) {
    paragraphs.push(verdictSentences.join(' '));
  }
  
  // Return dynamic summary or minimal fallback
  if (paragraphs.length > 0) {
    return paragraphs.join('\n\n');
  }
  
  return "Application received. Complete the phase-by-phase analysis below for detailed insights.";
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
      return "Voice Interview";
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
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
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
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
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
    if (applicationNotes.portfolioResult) {
      const portfolio = applicationNotes.portfolioResult;
      const score = portfolio.score;
      const baseFacts = score
        ? `The candidate submitted a portfolio scored at ${score}/100.`
        : "The candidate submitted a portfolio.";
      const phaseType: PhaseType = "portfolio";

      // Build portfolioData from stored result
      const portfolioData: PortfolioPhaseData = {
        score: portfolio.score,
        feedback: portfolio.feedback,
        analysis: portfolio.analysis,
        portfolioUrls: portfolio.portfolioUrls,
        fileCount: portfolio.portfolioUrls?.length,
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
          portfolioData,
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
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
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
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
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

    // Voice interview - detailed Ava narrative
    if (voiceInterviewResult) {
      const score = voiceInterviewResult.overall_score || voiceInterviewResult.overallScore;
      const phaseType: PhaseType = "voice_interview";
      const baseFacts = score
        ? `The candidate completed a voice interview and scored ${score}/100.`
        : "The candidate completed a voice interview.";

      // Build voiceData from stored result
      const voiceData: VoiceInterviewPhaseData = {
        overall_score: voiceInterviewResult.overall_score,
        overallScore: voiceInterviewResult.overallScore,
        summary: voiceInterviewResult.summary,
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
        <span>View phase-by-phase analysis ({completedPhases.length} phase{completedPhases.length !== 1 ? 's' : ''} completed)</span>
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
                        ? "bg-red-500/10 text-red-500" 
                        : phase.passed === true 
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-primary/10 text-primary"
                    )}>
                      {phase.score}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {phase.summary}
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
}

export function CondensedAIAnalysis({ 
  content, 
  className, 
  applicationNotes,
  voiceInterviewResult,
  aiScore,
  applicationStatus,
  rejectionReason,
  passingScore
}: CondensedAIAnalysisProps) {
  const parsed = useMemo(() => parseAIAnalysis(content, applicationNotes, voiceInterviewResult, aiScore), [content, applicationNotes, voiceInterviewResult, aiScore]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  // Use authoritative score from database if provided, otherwise use parsed score
  const displayScore = aiScore ?? parsed.score;
  
  // CRITICAL: If application is rejected, override the verdict regardless of AI analysis
  const isRejected = applicationStatus === 'rejected';
  
  // Determine verdict display - use actual recommendation from AI (but override if rejected)
  const recLower = parsed.recommendation?.toLowerCase() || '';
  const isPositiveRec = !isRejected && (
                        recLower.includes('proceed') ||
                        recLower.includes('strong') ||
                        recLower.includes('hire') ||
                        (recLower.includes('recommend') && !recLower.includes('not recommend')));
  const isNegativeRec = isRejected || 
                        recLower.includes('not recommend') ||
                        recLower.includes('reject') ||
                        recLower.includes('do not') ||
                        recLower.includes('pass on');

  const verdictIcon = isRejected
    ? <XCircle className="h-5 w-5 text-red-400" />
    : isPositiveRec
      ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
      : isNegativeRec
        ? <XCircle className="h-5 w-5 text-red-400" />
        : <AlertTriangle className="h-5 w-5 text-amber-400" />;

  // Override verdict text when rejected
  let verdictText: string;
  if (isRejected) {
    verdictText = "Rejected";
  } else if (parsed.recommendation) {
    verdictText = parsed.recommendation.replace(/^\*\*|\*\*$/g, '').trim();
  } else {
    verdictText = "Pending";
  }

  const verdictColor = isRejected
    ? "text-red-400"
    : isPositiveRec
      ? "text-emerald-400"
      : isNegativeRec
        ? "text-red-400"
        : "text-amber-400";
  
  // Generate a full summary that includes rejection context when rejected
  const displaySummary = useMemo(() => {
    if (isRejected) {
      // If there's a rejection reason, use it
      if (rejectionReason) {
        return rejectionReason;
      }
      // Generate a fallback reason based on score
      const scoreValue = displayScore ?? 0;
      const threshold = passingScore ?? 60;
      if (scoreValue < threshold) {
        return `This application was rejected because the overall score of ${scoreValue}% did not meet the passing threshold of ${threshold}%. ${parsed.fullSummary}`;
      }
      // Generic fallback if no score info
      return `This application has been rejected. ${parsed.fullSummary}`;
    }
    return parsed.fullSummary;
  }, [isRejected, rejectionReason, displayScore, passingScore, parsed.fullSummary]);
  
  return (
    <div className={cn("space-y-4", className)}>
      {/* Executive Summary Card */}
      <Card className="border-border/50 bg-card">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {verdictIcon}
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Verdict</span>
                  <span className={cn("text-base font-semibold", verdictColor)}>
                    {verdictText}
                  </span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {displaySummary}
              </p>
            </div>
            {displayScore !== null && (
              <ScoreRing score={displayScore} />
            )}
          </div>
        </CardContent>
      </Card>
      
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
