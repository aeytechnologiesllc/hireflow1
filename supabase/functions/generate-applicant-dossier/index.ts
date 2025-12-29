import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Professional minimal color palette
const COLORS = {
  black: { r: 0, g: 0, b: 0 },
  darkGray: { r: 30, g: 41, b: 59 },      // #1e293b
  mediumGray: { r: 71, g: 85, b: 105 },   // #475569
  lightGray: { r: 148, g: 163, b: 184 },  // #94a3b8
  subtleGray: { r: 241, g: 245, b: 249 }, // #f1f5f9
  white: { r: 255, g: 255, b: 255 },
  accent: { r: 51, g: 65, b: 85 },        // #334155 navy
};

// Sanitize text for PDF rendering
function sanitizeText(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/✓/g, '[+]')
    .replace(/→/g, '->')
    .replace(/•/g, '*')
    .replace(/—/g, '-')
    .replace(/–/g, '-')
    .replace(/'/g, "'")
    .replace(/'/g, "'")
    .replace(/"/g, '"')
    .replace(/"/g, '"')
    .replace(/…/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x00-\x7F]/g, '');
}

function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const sanitized = sanitizeText(text);
  const words = sanitized.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (doc.getTextWidth(testLine) <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function parseNotes(notes: string | null): Record<string, any> {
  try {
    return notes ? JSON.parse(notes) : {};
  } catch {
    return {};
  }
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Needs Improvement';
}

function getRecommendation(score: number): string {
  if (score >= 80) return 'HIGHLY RECOMMENDED';
  if (score >= 60) return 'RECOMMENDED';
  if (score >= 40) return 'PROCEED WITH CAUTION';
  return 'NOT RECOMMENDED';
}

function getInterviewRecommendation(score: number): string {
  if (score >= 80) return 'Yes - Strong candidate for interview';
  if (score >= 60) return 'Yes - With considerations noted below';
  if (score >= 40) return 'Optional - Review concerns before proceeding';
  return 'No - Does not meet minimum requirements';
}

function getRiskLevel(score: number, concerns: string[]): string {
  if (score >= 80 && concerns.length === 0) return 'Low';
  if (score >= 60 && concerns.length <= 2) return 'Low';
  if (score >= 40 || concerns.length <= 3) return 'Moderate';
  return 'Elevated';
}

function extractStrengths(notes: Record<string, any>, voiceResult: Record<string, any> | null, score: number): string[] {
  const strengths: string[] = [];
  
  // Quiz performance
  const quizData = notes.quiz || notes.quizResult;
  if (quizData?.score >= 80) {
    strengths.push(`Strong skills assessment performance (${quizData.score}%)`);
  } else if (quizData?.passed) {
    strengths.push('Passed skills assessment');
  }
  
  // Typing test
  if (notes.typingTestResult?.wpm >= 60 && notes.typingTestResult?.accuracy >= 95) {
    strengths.push(`Excellent typing proficiency (${notes.typingTestResult.wpm} WPM, ${notes.typingTestResult.accuracy}% accuracy)`);
  } else if (notes.typingTestResult?.passed) {
    strengths.push('Meets typing requirements');
  }
  
  // Voice interview
  if (voiceResult && voiceResult.overall_score >= 70) {
    strengths.push(`Strong interview performance (${voiceResult.overall_score}%)`);
  }
  
  // Sales/Chat simulation
  if (notes.salesSimulationResult?.wouldBuy) {
    strengths.push('Demonstrated effective sales approach');
  }
  if (notes.chatSimulationResult?.overallScore >= 70) {
    strengths.push('Strong customer service capabilities');
  }
  
  // Overall score based strength
  if (score >= 80) {
    strengths.push('Overall profile exceeds expectations');
  } else if (score >= 60) {
    strengths.push('Meets core job requirements');
  }
  
  return strengths.slice(0, 3);
}

function extractConcerns(notes: Record<string, any>, voiceResult: Record<string, any> | null, score: number): string[] {
  const concerns: string[] = [];
  
  // Quiz performance concerns
  const quizData = notes.quiz || notes.quizResult;
  if (quizData && !quizData.passed) {
    concerns.push(`Skills assessment below passing threshold (${quizData.score || 0}%)`);
  }
  
  // Typing test concerns
  if (notes.typingTestResult && !notes.typingTestResult.passed) {
    concerns.push('Typing proficiency below requirements');
  }
  
  // Voice interview concerns
  if (voiceResult && voiceResult.concerns && voiceResult.concerns.length > 0) {
    concerns.push(voiceResult.concerns[0]);
  }
  
  // Low overall score
  if (score < 40) {
    concerns.push('Overall assessment indicates significant gaps');
  } else if (score < 60) {
    concerns.push('Profile requires additional verification');
  }
  
  return concerns.slice(0, 3);
}

function getNextStepRecommendation(notes: Record<string, any>, voiceResult: Record<string, any> | null, concerns: string[]): string {
  if (concerns.length === 0) {
    return 'Proceed to interview to confirm cultural fit and role expectations.';
  }
  
  const quizData = notes.quiz || notes.quizResult;
  if (quizData && !quizData.passed) {
    return 'Interview should focus on validating core skills and assessing practical knowledge.';
  }
  
  if (voiceResult?.concerns?.length > 0) {
    return 'Interview should explore areas flagged during initial screening and clarify experience claims.';
  }
  
  return 'Interview should focus on addressing noted concerns and verifying qualifications.';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { applicationId } = await req.json();
    
    if (!applicationId) {
      return new Response(
        JSON.stringify({ error: 'Application ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Dossier] Generating dossier for application:', applicationId);

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch application with job data (separate query for profile to avoid FK issues)
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`*, jobs (*)`)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      console.error('[Dossier] Error fetching application:', appError);
      return new Response(
        JSON.stringify({ error: 'Application not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Dossier] Application found, candidate_id:', application.candidate_id);

    // Fetch candidate profile separately using user_id
    let profile = null;
    if (application.candidate_id) {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', application.candidate_id)
        .single();
      
      if (profileError) {
        console.error('[Dossier] Error fetching profile (continuing without it):', profileError);
      } else {
        profile = profileData;
        console.log('[Dossier] Profile found:', profile?.full_name);
      }
    }

    const job = application.jobs;
    const notes = parseNotes(application.notes);
    const voiceResult = application.voice_interview_result as Record<string, any> | null;
    const overallScore = application.ai_score || 0;
    const candidateName = sanitizeText(profile?.full_name) || 'Candidate';

    // Create PDF
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210, pageH = 297, margin = 20, contentW = pageW - margin * 2;
    let y = margin;
    let pageNum = 1;

    // Helper: Add footer
    const addFooter = () => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(COLORS.lightGray.r, COLORS.lightGray.g, COLORS.lightGray.b);
      doc.text(candidateName, margin, pageH - 10);
      doc.text(`Page ${pageNum}`, pageW - margin, pageH - 10, { align: 'right' });
      doc.text('CONFIDENTIAL', pageW / 2, pageH - 10, { align: 'center' });
    };

    // Helper: Add section header
    const addSectionHeader = (title: string) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
      doc.text(sanitizeText(title), margin, y);
      y += 2;
      doc.setDrawColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageW - margin, y);
      y += 8;
    };

    // Helper: Check page break
    const checkPageBreak = (needed: number) => {
      if (y + needed > pageH - 25) {
        addFooter();
        doc.addPage();
        pageNum++;
        y = margin;
      }
    };

    // Helper: Draw table row
    const drawTableRow = (label: string, value: string, isHeader = false) => {
      checkPageBreak(8);
      if (isHeader) {
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(COLORS.subtleGray.r, COLORS.subtleGray.g, COLORS.subtleGray.b);
        doc.rect(margin, y - 4, contentW, 8, 'F');
      } else {
        doc.setFont('helvetica', 'normal');
      }
      doc.setFontSize(9);
      doc.setTextColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
      doc.text(sanitizeText(label), margin + 2, y);
      doc.text(sanitizeText(value), margin + contentW / 2, y);
      y += 7;
    };

    // ============= PAGE 1: COVER =============
    
    // Header
    doc.setFillColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
    doc.rect(0, 0, pageW, 50, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(COLORS.white.r, COLORS.white.g, COLORS.white.b);
    doc.text('Applicant Dossier', margin, 25);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Candidate Hiring Report', margin, 35);
    
    doc.setFontSize(8);
    doc.text('CONFIDENTIAL - EMPLOYER USE ONLY', margin, 45);

    y = 65;

    // Candidate Info Section
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
    doc.text(candidateName, margin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(COLORS.mediumGray.r, COLORS.mediumGray.g, COLORS.mediumGray.b);
    if (profile?.email) {
      doc.text(sanitizeText(profile.email), margin, y);
      y += 5;
    }
    if (profile?.phone) {
      doc.text(sanitizeText(profile.phone), margin, y);
      y += 5;
    }
    if (profile?.location) {
      doc.text(sanitizeText(profile.location), margin, y);
      y += 5;
    }

    y += 10;

    // Position Info
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(COLORS.lightGray.r, COLORS.lightGray.g, COLORS.lightGray.b);
    doc.text('POSITION APPLIED FOR', margin, y);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
    doc.text(sanitizeText(job?.title) || 'Position', margin, y);
    y += 6;

    if (job?.department) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(COLORS.mediumGray.r, COLORS.mediumGray.g, COLORS.mediumGray.b);
      doc.text(sanitizeText(job.department), margin, y);
      y += 5;
    }

    y += 15;

    // Key Metrics Table
    doc.setDrawColor(COLORS.lightGray.r, COLORS.lightGray.g, COLORS.lightGray.b);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentW, 35);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
    
    // Overall Score
    doc.text('Overall Score', margin + 10, y + 12);
    doc.setFontSize(20);
    doc.text(`${overallScore}/100`, margin + 10, y + 25);

    // Status
    doc.setFontSize(9);
    doc.text('Status', margin + 60, y + 12);
    doc.setFontSize(12);
    doc.text(sanitizeText(application.status?.toUpperCase()) || 'PENDING', margin + 60, y + 25);

    // Phase
    doc.setFontSize(9);
    doc.text('Current Phase', margin + 110, y + 12);
    doc.setFontSize(12);
    doc.text(sanitizeText(application.phase) || 'Application', margin + 110, y + 25);

    y += 45;

    // Dates
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(COLORS.mediumGray.r, COLORS.mediumGray.g, COLORS.mediumGray.b);
    doc.text(`Application Date: ${formatDate(application.created_at)}`, margin, y);
    y += 5;
    doc.text(`Report Generated: ${formatDate(new Date().toISOString())}`, margin, y);
    y += 15;

    // Recommendation
    const recommendation = getRecommendation(overallScore);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
    doc.text('RECOMMENDATION:', margin, y);
    y += 7;
    doc.setFontSize(14);
    doc.text(recommendation, margin, y);

    addFooter();

    // ============= PAGE 2: HIRING SNAPSHOT =============
    doc.addPage();
    pageNum++;
    y = margin;

    // Extract data for snapshot
    const strengths = extractStrengths(notes, voiceResult, overallScore);
    const concerns = extractConcerns(notes, voiceResult, overallScore);
    const riskLevel = getRiskLevel(overallScore, concerns);
    const interviewRec = getInterviewRecommendation(overallScore);
    const nextStep = getNextStepRecommendation(notes, voiceResult, concerns);

    addSectionHeader('Hiring Snapshot (Quick Review)');

    // Interview Recommendation Box
    doc.setDrawColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
    doc.setLineWidth(0.8);
    doc.setFillColor(COLORS.subtleGray.r, COLORS.subtleGray.g, COLORS.subtleGray.b);
    doc.rect(margin, y, contentW, 18, 'FD');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
    doc.text('INTERVIEW RECOMMENDATION', margin + 4, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(interviewRec, margin + 4, y + 14);
    y += 25;

    // Candidate Credibility
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
    doc.text('Candidate Credibility', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
    const credibilityText = overallScore >= 60 
      ? 'Profile information appears consistent and verified based on available data.'
      : 'Profile requires additional verification during interview process.';
    doc.text(credibilityText, margin, y);
    y += 12;

    // Top Strengths
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
    doc.text('Top Strengths', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
    
    if (strengths.length > 0) {
      for (const strength of strengths) {
        const lines = wrapText(doc, `[+] ${strength}`, contentW - 5);
        for (const l of lines) {
          doc.text(l, margin, y);
          y += 4.5;
        }
      }
    } else {
      doc.text('[+] Completed application process', margin, y);
      y += 4.5;
    }
    y += 8;

    // Primary Concerns
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
    doc.text('Points to Explore', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
    
    if (concerns.length > 0) {
      for (const concern of concerns) {
        const lines = wrapText(doc, `- ${concern}`, contentW - 5);
        for (const l of lines) {
          doc.text(l, margin, y);
          y += 4.5;
        }
      }
    } else {
      doc.text('- No significant concerns identified', margin, y);
      y += 4.5;
    }
    y += 8;

    // Risk Level
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
    doc.text('Risk Assessment', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
    doc.text(`Risk Level: ${riskLevel}`, margin, y);
    y += 12;

    // Recommended Next Step
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
    doc.text('Recommended Next Step', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
    const nextStepLines = wrapText(doc, nextStep, contentW);
    for (const l of nextStepLines) {
      doc.text(l, margin, y);
      y += 4.5;
    }
    y += 15;

    // How to Use This Report
    doc.setDrawColor(COLORS.lightGray.r, COLORS.lightGray.g, COLORS.lightGray.b);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentW, 28);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(COLORS.mediumGray.r, COLORS.mediumGray.g, COLORS.mediumGray.b);
    doc.text('How to Use This Report', margin + 4, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const howToUseText = 'This report is designed to support, not replace, the interview process. Scores indicate readiness for the role based on available data. Final hiring decisions should incorporate interview performance, team fit, and business needs.';
    const howToLines = wrapText(doc, howToUseText, contentW - 8);
    for (const l of howToLines) {
      doc.text(l, margin + 4, y);
      y += 4;
    }

    addFooter();

    // Note: This is now page 3 due to Hiring Snapshot insertion
    // Executive Summary follows the Hiring Snapshot

    addSectionHeader('Executive Summary');

    // AI Analysis
    if (application.ai_analysis) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
      
      const analysisLines = application.ai_analysis.split('\n');
      for (const line of analysisLines) {
        checkPageBreak(6);
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Bold headings (lines wrapped in **)
        if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
          const headingText = trimmed.replace(/\*\*/g, '');
          y += 3;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.text(sanitizeText(headingText), margin, y);
          y += 6;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          continue;
        }
        
        // List items
        if (trimmed.startsWith('- ')) {
          const itemText = trimmed.substring(2);
          const wrappedLines = wrapText(doc, `  - ${itemText}`, contentW - 5);
          for (const wl of wrappedLines) {
            checkPageBreak(5);
            doc.text(wl, margin, y);
            y += 4.5;
          }
          continue;
        }
        
        // Regular text
        const wrappedLines = wrapText(doc, trimmed.replace(/\*\*/g, ''), contentW);
        for (const wl of wrappedLines) {
          checkPageBreak(5);
          doc.text(wl, margin, y);
          y += 4.5;
        }
      }
    }

    addFooter();

    // ============= ASSESSMENT RESULTS (Observed Performance) =============
    doc.addPage();
    pageNum++;
    y = margin;

    addSectionHeader('Assessment Results (Observed Performance)');

    // Application Answers
    if (notes.applicationAnswers?.length > 0) {
      checkPageBreak(15);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
      doc.text('Application Answers', margin, y);
      y += 8;
      
      for (const qa of notes.applicationAnswers) {
        checkPageBreak(20);
        
        // Question
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
        const qLines = wrapText(doc, `Q: ${qa.question || 'Question'}`, contentW);
        for (const ql of qLines) {
          doc.text(ql, margin, y);
          y += 4.5;
        }
        
        // Answer
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(COLORS.mediumGray.r, COLORS.mediumGray.g, COLORS.mediumGray.b);
        const aLines = wrapText(doc, `A: ${qa.answer || 'No answer provided'}`, contentW);
        for (const al of aLines.slice(0, 4)) {
          checkPageBreak(5);
          doc.text(al, margin, y);
          y += 4.5;
        }
        y += 5;
      }
      y += 5;
    }

    // Quiz Results
    const quizData = notes.quiz || notes.quizResult || notes.quizAnswers;
    if (quizData) {
      checkPageBreak(20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
      doc.text('Skills Assessment', margin, y);
      y += 8;
      
      const quizScore = quizData.score || 0;
      drawTableRow('Metric', 'Result', true);
      drawTableRow('Score', `${quizScore}% (${getScoreLabel(quizScore)})`);
      if (quizData.passed !== undefined) {
        drawTableRow('Result', quizData.passed ? 'Passed' : 'Did Not Pass');
      }
      y += 5;
    }

    // Typing Test
    if (notes.typingTestResult) {
      checkPageBreak(20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
      doc.text('Typing Proficiency', margin, y);
      y += 8;
      
      drawTableRow('Metric', 'Result', true);
      drawTableRow('Words Per Minute', `${notes.typingTestResult.wpm || 0} WPM`);
      drawTableRow('Accuracy', `${notes.typingTestResult.accuracy || 0}%`);
      if (notes.typingTestResult.passed !== undefined) {
        drawTableRow('Result', notes.typingTestResult.passed ? 'Passed' : 'Did Not Pass');
      }
      y += 5;
    }

    // Chat Interview
    if (notes.chatInterviewResult) {
      checkPageBreak(25);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
      doc.text('Conversational Assessment', margin, y);
      y += 8;
      
      const chatScore = notes.chatInterviewResult.overallScore || notes.chatInterviewResult.score || 0;
      drawTableRow('Metric', 'Result', true);
      drawTableRow('Overall Score', `${chatScore}% (${getScoreLabel(chatScore)})`);
      if (notes.chatInterviewResult.passed !== undefined) {
        drawTableRow('Result', notes.chatInterviewResult.passed ? 'Passed' : 'Did Not Pass');
      }
      y += 5;
    }

    // Chat Simulation
    if (notes.chatSimulationResult) {
      checkPageBreak(25);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
      doc.text('Customer Service Evaluation', margin, y);
      y += 8;
      
      const chatScore = notes.chatSimulationResult.overallScore || 0;
      drawTableRow('Metric', 'Result', true);
      drawTableRow('Overall Score', `${chatScore}% (${getScoreLabel(chatScore)})`);
      if (notes.chatSimulationResult.passed !== undefined) {
        drawTableRow('Result', notes.chatSimulationResult.passed ? 'Passed' : 'Did Not Pass');
      }
      y += 5;
    }

    // Sales Simulation
    if (notes.salesSimulationResult) {
      checkPageBreak(35);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
      doc.text('Sales Performance Evaluation', margin, y);
      y += 8;
      
      const salesScore = notes.salesSimulationResult.overallScore || 0;
      const wouldBuy = notes.salesSimulationResult.wouldBuy;
      
      drawTableRow('Metric', 'Result', true);
      drawTableRow('Overall Score', `${salesScore}% (${getScoreLabel(salesScore)})`);
      if (wouldBuy !== undefined) {
        drawTableRow('Would Buy', wouldBuy ? 'Yes' : 'No');
      }
      
      // Category scores
      const categories = notes.salesSimulationResult.categoryScores || {};
      for (const [cat, score] of Object.entries(categories)) {
        const catName = cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ');
        drawTableRow(catName, `${score}%`);
      }
      y += 5;
    }

    addFooter();

    // ============= VOICE INTERVIEW (if exists) =============
    if (voiceResult) {
      doc.addPage();
      pageNum++;
      y = margin;

      const interviewLabel = application.voice_interview_video_enabled !== false 
        ? 'Video Interview with AVA' 
        : 'Voice Interview with AVA';
      
      addSectionHeader(interviewLabel);

      const voiceScore = voiceResult.overall_score || 0;
      const voiceRec = voiceResult.recommendation || 'pending';
      
      drawTableRow('Metric', 'Result', true);
      drawTableRow('Overall Score', `${voiceScore}% (${getScoreLabel(voiceScore)})`);
      drawTableRow('Recommendation', voiceRec.toUpperCase().replace('_', ' '));
      
      if (application.voice_interview_duration) {
        drawTableRow('Duration', `${Math.round(application.voice_interview_duration / 60)} minutes`);
      }
      if (application.voice_interview_language) {
        drawTableRow('Language', application.voice_interview_language);
      }
      y += 5;

      // Soft skills
      if (voiceResult.soft_skills) {
        checkPageBreak(20);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
        doc.text('Interpersonal Skills', margin, y);
        y += 8;
        
        drawTableRow('Skill', 'Score', true);
        for (const [skill, score] of Object.entries(voiceResult.soft_skills)) {
          const skillName = skill.charAt(0).toUpperCase() + skill.slice(1).replace(/_/g, ' ');
          drawTableRow(skillName, `${score}/10`);
        }
        y += 5;
      }

      // Concerns
      if (voiceResult.concerns?.length > 0) {
        checkPageBreak(20);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
        doc.text('Points to Explore', margin, y);
        y += 8;
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
        for (const concern of voiceResult.concerns.slice(0, 5)) {
          checkPageBreak(8);
          const lines = wrapText(doc, `- ${concern}`, contentW - 5);
          for (const l of lines) {
            doc.text(l, margin, y);
            y += 4.5;
          }
        }
        y += 5;
      }

      // Highlights
      if (voiceResult.interview_highlights?.length > 0) {
        checkPageBreak(20);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
        doc.text('Notable Responses', margin, y);
        y += 8;
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
        for (const highlight of voiceResult.interview_highlights.slice(0, 5)) {
          checkPageBreak(8);
          const text = highlight.quote || highlight;
          const lines = wrapText(doc, `- ${text}`, contentW - 5);
          for (const l of lines) {
            doc.text(l, margin, y);
            y += 4.5;
          }
        }
      }

      addFooter();
    }

    // ============= FINAL PAGE: HIRING RECOMMENDATION =============
    doc.addPage();
    pageNum++;
    y = margin;

    addSectionHeader('Hiring Recommendation (Final Assessment)');

    // Recommendation box
    doc.setDrawColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
    doc.setLineWidth(1);
    doc.rect(margin, y, contentW, 30);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
    doc.text(recommendation, pageW / 2, y + 12, { align: 'center' });
    
    doc.setFontSize(11);
    doc.text(`Overall Score: ${overallScore}/100`, pageW / 2, y + 22, { align: 'center' });
    
    y += 40;

    // Key Decision Factors
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
    doc.text('Performance Summary', margin, y);
    y += 8;

    drawTableRow('Factor', 'Result', true);
    
    if (quizData?.score !== undefined) {
      drawTableRow('Quiz Score', `${quizData.score}%`);
    }
    if (notes.typingTestResult?.wpm) {
      drawTableRow('Typing Speed', `${notes.typingTestResult.wpm} WPM`);
    }
    if (notes.typingTestResult?.accuracy) {
      drawTableRow('Typing Accuracy', `${notes.typingTestResult.accuracy}%`);
    }
    if (notes.chatSimulationResult?.overallScore) {
      drawTableRow('Chat Simulation', `${notes.chatSimulationResult.overallScore}%`);
    }
    if (notes.salesSimulationResult?.overallScore) {
      drawTableRow('Sales Simulation', `${notes.salesSimulationResult.overallScore}%`);
    }
    if (notes.salesSimulationResult?.wouldBuy !== undefined) {
      drawTableRow('Sales Result', notes.salesSimulationResult.wouldBuy ? 'Would Buy' : 'Would Not Buy');
    }
    if (voiceResult?.overall_score) {
      drawTableRow('Interview Score', `${voiceResult.overall_score}%`);
    }
    if (voiceResult?.recommendation) {
      drawTableRow('Interview Recommendation', voiceResult.recommendation.toUpperCase().replace('_', ' '));
    }

    y += 10;

    // Suggested follow-up questions
    const followups = voiceResult?.suggested_followups as string[] | undefined;
    if (followups && followups.length > 0) {
      checkPageBreak(25);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(COLORS.accent.r, COLORS.accent.g, COLORS.accent.b);
      doc.text('Recommended Interview Topics', margin, y);
      y += 8;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(COLORS.darkGray.r, COLORS.darkGray.g, COLORS.darkGray.b);
      
      for (let i = 0; i < Math.min(followups.length, 5); i++) {
        checkPageBreak(10);
        const q = followups[i];
        const lines = wrapText(doc, `${i + 1}. ${q}`, contentW);
        for (const l of lines) {
          doc.text(l, margin, y);
          y += 4.5;
        }
        y += 2;
      }
    }

    addFooter();

    // Generate PDF data
    const pdfOutput = doc.output('datauristring');
    const fileName = `${candidateName.replace(/\s+/g, '_')}_Dossier_${new Date().toISOString().split('T')[0]}.pdf`;

    console.log('[Dossier] PDF generated successfully for:', candidateName);

    return new Response(
      JSON.stringify({ 
        pdfDataUri: pdfOutput,
        fileName 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[Dossier] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate dossier';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
