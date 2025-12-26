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

interface PhaseResult {
  phase: string;
  score: string;
  details: string;
}

// Application notes structure from parsedNotes
interface ApplicationNotes {
  quizResult?: { score: number; passed: boolean; total?: number };
  portfolioResult?: { score: number; feedback?: string };
  typingTestResult?: { wpm: number; accuracy: number; passed?: boolean };
  chatSimulationResult?: { score?: number; passed?: boolean };
  chatInterviewResult?: { score?: number; passed?: boolean };
  salesSimulationResult?: { score?: number; passed?: boolean };
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

// Generate a comprehensive full summary from all sections - building a 15+ sentence narrative
function generateFullSummary(
  sections: ParsedSection[], 
  recommendation: string | null,
  applicationNotes?: ApplicationNotes,
  voiceInterviewResult?: any,
  authoritativeScore?: number | null
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
  
  // Collect data from all sections (for non-phase data like resume findings, skills, etc.)
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
  
  // Build comprehensive narrative in AVA's first-person voice with paragraph breaks
  const paragraphs: string[] = [];
  
  // ============= PARAGRAPH 1: Opening + Phase Results =============
  const openingSentences: string[] = [];
  
  // Conversational opening
  if (phaseResults.length > 0) {
    openingSentences.push(`Hey! I've finished reviewing this applicant and here's what I found.`);
    openingSentences.push(`They completed ${phaseResults.length} phase${phaseResults.length > 1 ? 's' : ''} of the application process.`);
  } else {
    openingSentences.push(`Hey! I've taken a look at this application.`);
    openingSentences.push(`They've submitted their application for review, but haven't completed any assessment phases yet.`);
  }
  
  // Phase-by-phase breakdown in first person
  for (const phase of phaseResults) {
    if (phase.phase === 'Quiz') {
      const score = parseInt(phase.score);
      if (score >= 90) {
        openingSentences.push(`I was really impressed with their quiz performance - they scored ${phase.score}! That tells me they really know the material.`);
      } else if (score >= 70) {
        openingSentences.push(`Their quiz score of ${phase.score} is solid - shows they have a good grasp of the fundamentals.`);
      } else if (score >= 50) {
        openingSentences.push(`They got ${phase.score} on the quiz, which is okay but there are definitely some knowledge gaps I noticed.`);
      } else {
        openingSentences.push(`The quiz score of ${phase.score} is concerning to me - it suggests they're missing some fundamental knowledge we need.`);
      }
    }
    
    if (phase.phase === 'Portfolio') {
      const score = parseInt(phase.score);
      if (score >= 80) {
        openingSentences.push(`Their portfolio really caught my eye - scored ${phase.score}. Great technical work and creativity there!`);
      } else if (score >= 60) {
        openingSentences.push(`The portfolio came in at ${phase.score}. It's decent work, but honestly, I expected a bit more polish for this role.`);
      } else {
        openingSentences.push(`Their portfolio scored ${phase.score}, which is below what I'd hope to see. There's definitely room for improvement.`);
      }
    }
    
    if (phase.phase === 'Voice Interview') {
      const score = parseInt(phase.score);
      if (score >= 80) {
        openingSentences.push(`The voice interview went great - ${phase.score}! They communicated well and seemed genuinely engaged.`);
      } else if (score >= 60) {
        openingSentences.push(`Their voice interview was rated ${phase.score}. Communication was adequate, though nothing that really stood out.`);
      } else if (score >= 40) {
        openingSentences.push(`Here's where I got a bit concerned - the voice interview only scored ${phase.score}. They seemed disengaged and I had trouble connecting with them.`);
      } else {
        openingSentences.push(`I have to be honest - the voice interview worried me. Only ${phase.score}. They really struggled with communication and didn't seem prepared.`);
      }
    }
    
    if (phase.phase === 'Typing Test') {
      openingSentences.push(`They completed the typing test at ${phase.score}, which I noted.`);
    }
    
    if (phase.phase === 'Video Introduction') {
      openingSentences.push(`They did submit a video introduction, which I reviewed.`);
    }
    
    if (phase.phase === 'Chat Simulation') {
      openingSentences.push(`They went through the chat simulation exercise as well.`);
    }
  }
  
  if (openingSentences.length > 0) {
    paragraphs.push(openingSentences.join(' '));
  }
  
  // ============= PARAGRAPH 2: Resume & Skills Analysis =============
  const resumeSentences: string[] = [];
  
  if (resumeFindings.length > 0 || crossRefFindings.length > 0) {
    resumeSentences.push(`Now, I have to flag something important about the resume.`);
    
    // Resume findings in conversational tone
    for (const finding of resumeFindings) {
      if (finding.toLowerCase().includes('different person')) {
        resumeSentences.push(`The resume they submitted doesn't seem to match - it looks like it might belong to someone else entirely.`);
      } else if (finding.toLowerCase().includes('belong to the applicant')) {
        resumeSentences.push(`Good news - the resume does appear to be theirs.`);
      } else if (finding.toLowerCase().includes('authenticity')) {
        resumeSentences.push(finding + '.');
      } else {
        resumeSentences.push(finding + '.');
      }
    }
    
    // Cross-reference findings
    for (const finding of crossRefFindings) {
      if (finding.toLowerCase().includes('name') && finding.toLowerCase().includes('not match')) {
        resumeSentences.push(`The name on the resume doesn't match what they put on their application - that's a red flag for me.`);
      } else if (finding.toLowerCase().includes('inconsistent')) {
        resumeSentences.push(`I'm seeing some inconsistencies between their resume and application data.`);
      } else if (finding.toLowerCase().includes('match') && finding.toLowerCase().includes('name')) {
        resumeSentences.push(`At least the names check out and match up.`);
      }
    }
  }
  
  // Skills assessment
  if (skillsInfo.length > 0) {
    for (const skill of skillsInfo) {
      // Skip placeholder values entirely
      if (isPlaceholderValue(skill)) continue;
      
      const cleanedSkill = cleanPlaceholderFromText(skill);
      if (!cleanedSkill) continue;
      
      if (cleanedSkill.toLowerCase().includes('no matching skills')) {
        resumeSentences.push(`I couldn't find any of the skills we need for this position on their resume.`);
      } else if (cleanedSkill.toLowerCase().includes('skills gap')) {
        const gapMatch = cleanedSkill.match(/Skills gaps identified:\s*(.+)/i);
        if (gapMatch) {
          const gapValue = cleanPlaceholderFromText(gapMatch[1]);
          if (gapValue && !isPlaceholderValue(gapValue)) {
            resumeSentences.push(`We're looking for things like ${gapValue} - and those weren't showing up.`);
          }
        }
      } else if (cleanedSkill.toLowerCase().includes('matching skills')) {
        const skillValue = cleanPlaceholderFromText(cleanedSkill.replace(/Matching skills:\s*/i, ''));
        if (skillValue && !isPlaceholderValue(skillValue)) {
          resumeSentences.push(`On the positive side, I did find some relevant skills: ${skillValue}.`);
        }
      }
    }
  }
  
  // Experience
  if (experienceInfo.length > 0) {
    for (const exp of experienceInfo.slice(0, 2)) {
      if (exp.toLowerCase().includes('unknown')) {
        resumeSentences.push(`I couldn't get a clear picture of their experience level from what they submitted.`);
      } else {
        resumeSentences.push(exp + ' - based on the application data.');
      }
    }
  }
  
  if (resumeSentences.length > 0) {
    paragraphs.push(resumeSentences.join(' '));
  }
  
  // ============= PARAGRAPH 3: Concerns & Red Flags =============
  const concernsSentences: string[] = [];
  const uniqueConcerns = [...new Set(concerns)];
  
  if (uniqueConcerns.length > 0) {
    concernsSentences.push(`Between you and me, there are some real concerns here.`);
    concernsSentences.push(`Key concerns include: ${uniqueConcerns.join(', ')}.`);
  }
  
  // Strengths (balance it out)
  const uniqueStrengths = [...new Set(strengths)].filter(s => s && s.toLowerCase() !== 'none');
  if (uniqueStrengths.length > 0) {
    if (uniqueStrengths.length === 1) {
      concernsSentences.push(`A notable strength is ${uniqueStrengths[0]}.`);
    } else {
      concernsSentences.push(`On the positive side, I did notice: ${uniqueStrengths.slice(0, 3).join(', ')}.`);
    }
  }
  
  // Personality insights
  if (personalityInfo.length > 0) {
    const personalityNote = personalityInfo.slice(0, 2).join(' ');
    concernsSentences.push(`Personality indicators suggest: ${personalityNote}.`);
  }
  
  if (concernsSentences.length > 0) {
    paragraphs.push(concernsSentences.join(' '));
  }
  
  // ============= PARAGRAPH 4: Final Recommendation =============
  const closingSentences: string[] = [];
  
  // Use authoritative score if provided, otherwise use parsed overallScore
  const finalScore = authoritativeScore !== undefined && authoritativeScore !== null 
    ? authoritativeScore.toString() 
    : overallScore;
  
  if (finalScore) {
    closingSentences.push(`After reviewing everything, I'm giving this candidate ${finalScore}/100.`);
  }
  
  if (recommendationText) {
    const cleanRec = recommendationText.replace(/^\*\*|\*\*$/g, '').trim().toLowerCase();
    if (cleanRec.includes('not recommended') || cleanRec.includes('reject')) {
      closingSentences.push(`My recommendation? I don't think we should move forward with them.`);
      if (uniqueConcerns.length > 0) {
        closingSentences.push(`The concerns I mentioned are just too significant to overlook.`);
      }
    } else if (cleanRec.includes('proceed') || cleanRec.includes('interview')) {
      closingSentences.push(`My recommendation is to proceed with an interview.`);
      closingSentences.push(`I'd like to get to know them better before making a final call.`);
    } else if (cleanRec.includes('hire') || cleanRec.includes('recommend')) {
      closingSentences.push(`I think this could be a great fit! I'd recommend moving forward with them.`);
    } else {
      closingSentences.push(`Recommendation: ${recommendationText}.`);
    }
  } else if (finalScore) {
    const score = parseInt(finalScore);
    if (score >= 70) {
      closingSentences.push(`Overall, I think this candidate shows real promise.`);
    } else if (score >= 50) {
      closingSentences.push(`They're on the fence - could go either way depending on what you prioritize.`);
    } else {
      closingSentences.push(`Honestly? I have reservations about moving forward with this one.`);
    }
  }
  
  if (closingSentences.length > 0) {
    paragraphs.push(closingSentences.join(' '));
  }
  
  // Join paragraphs with double line breaks
  if (paragraphs.length > 0) {
    return paragraphs.join('\n\n');
  }
  
  return "Hey! I've reviewed this application. Check out the detailed sections below for all my findings and insights.";
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

// ============= Main Component =============

interface CondensedAIAnalysisProps {
  content: string;
  className?: string;
  applicationNotes?: ApplicationNotes;
  voiceInterviewResult?: any;
  aiScore?: number | null; // Authoritative score from database
}

export function CondensedAIAnalysis({ 
  content, 
  className, 
  applicationNotes,
  voiceInterviewResult,
  aiScore 
}: CondensedAIAnalysisProps) {
  const parsed = useMemo(() => parseAIAnalysis(content, applicationNotes, voiceInterviewResult, aiScore), [content, applicationNotes, voiceInterviewResult, aiScore]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  // Use authoritative score from database if provided, otherwise use parsed score
  const displayScore = aiScore ?? parsed.score;
  
  // Determine verdict display - use actual recommendation from AI
  const recLower = parsed.recommendation?.toLowerCase() || '';
  const isPositiveRec = recLower.includes('proceed') ||
                        recLower.includes('strong') ||
                        recLower.includes('hire') ||
                        (recLower.includes('recommend') && !recLower.includes('not recommend'));
  const isNegativeRec = recLower.includes('not recommend') ||
                        recLower.includes('reject') ||
                        recLower.includes('do not') ||
                        recLower.includes('pass on');

  const verdictIcon = isPositiveRec
    ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
    : isNegativeRec
      ? <XCircle className="h-5 w-5 text-red-400" />
      : <AlertTriangle className="h-5 w-5 text-amber-400" />;

  // Show actual recommendation from AI, not translated text
  const verdictText = parsed.recommendation 
    ? parsed.recommendation.replace(/^\*\*|\*\*$/g, '').trim()
    : "Pending";

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
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Verdict</span>
                  <span className={cn("text-base font-semibold", verdictColor)}>
                    {verdictText}
                  </span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {parsed.fullSummary}
              </p>
            </div>
            {displayScore !== null && (
              <ScoreRing score={displayScore} />
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
