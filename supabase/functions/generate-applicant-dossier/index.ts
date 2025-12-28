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
  if (score >= 80) return 'STRONGLY RECOMMEND';
  if (score >= 60) return 'RECOMMEND WITH CONSIDERATION';
  if (score >= 40) return 'CONSIDER WITH CAUTION';
  return 'NOT RECOMMENDED';
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

    // Fetch application with related data
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        *,
        jobs (*),
        profiles:candidate_id (*)
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      console.error('[Dossier] Error fetching application:', appError);
      return new Response(
        JSON.stringify({ error: 'Application not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const profile = application.profiles;
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
    doc.text('Comprehensive Candidate Assessment Report', margin, 35);
    
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

    // ============= PAGE 2: EXECUTIVE SUMMARY =============
    doc.addPage();
    pageNum++;
    y = margin;

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

    // ============= PAGE 3+: PHASE RESULTS =============
    doc.addPage();
    pageNum++;
    y = margin;

    addSectionHeader('Phase-by-Phase Results');

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
      doc.text('Skills Assessment Quiz', margin, y);
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
      doc.text('Typing Proficiency Test', margin, y);
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
      doc.text('Chat Interview', margin, y);
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
      doc.text('Customer Service Simulation', margin, y);
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
      doc.text('Sales Meeting Simulation', margin, y);
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
        doc.text('Soft Skills Assessment', margin, y);
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
        doc.text('Areas of Concern', margin, y);
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
        doc.text('Interview Highlights', margin, y);
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

    // ============= FINAL PAGE: DECISION SUMMARY =============
    doc.addPage();
    pageNum++;
    y = margin;

    addSectionHeader('Decision Summary');

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
    doc.text('Key Decision Factors', margin, y);
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
      doc.text('Suggested Follow-up Questions', margin, y);
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
