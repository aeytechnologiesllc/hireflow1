import jsPDF from "jspdf";
import type { Tables } from "@/integrations/supabase/types";

interface ApplicationData extends Tables<"applications"> {
  jobs: Tables<"jobs"> | null;
  profiles: Tables<"profiles"> | null;
}

interface CandidateProfile {
  full_name: string | null;
  email: string;
  phone?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
}

// Color palette
const COLORS = {
  primary: [16, 185, 129] as [number, number, number],
  secondary: [139, 92, 246] as [number, number, number],
  success: [34, 197, 94] as [number, number, number],
  warning: [245, 158, 11] as [number, number, number],
  danger: [239, 68, 68] as [number, number, number],
  dark: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  light: [241, 245, 249] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

function roundedRect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, style: "S" | "F" | "FD" = "F") {
  doc.roundedRect(x, y, w, h, r, r, style);
}

function drawProgressBar(doc: jsPDF, x: number, y: number, width: number, height: number, value: number, color: [number, number, number]) {
  doc.setFillColor(...COLORS.light);
  roundedRect(doc, x, y, width, height, 2, "F");
  const fillWidth = (value / 100) * width;
  if (fillWidth > 0) {
    doc.setFillColor(...color);
    roundedRect(doc, x, y, Math.max(fillWidth, 4), height, 2, "F");
  }
}

function drawScoreCircle(doc: jsPDF, x: number, y: number, radius: number, score: number, color: [number, number, number]) {
  doc.setDrawColor(...color);
  doc.setLineWidth(3);
  doc.circle(x, y, radius, "S");
  doc.setFontSize(24);
  doc.setTextColor(...color);
  doc.setFont("helvetica", "bold");
  doc.text(`${score}`, x, y + 3, { align: "center" });
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.text("/ 100", x, y + 10, { align: "center" });
}

function parseNotes(notes: string | null): Record<string, any> {
  try {
    return notes ? JSON.parse(notes) : {};
  } catch {
    return {};
  }
}

function getScoreColor(score: number): [number, number, number] {
  if (score >= 80) return COLORS.success;
  if (score >= 60) return COLORS.primary;
  if (score >= 40) return COLORS.warning;
  return COLORS.danger;
}

function addWrappedText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number = 5): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function getRecommendation(score: number): { text: string; color: [number, number, number] } {
  if (score >= 80) return { text: "STRONGLY RECOMMEND", color: COLORS.success };
  if (score >= 60) return { text: "RECOMMEND WITH CONSIDERATION", color: COLORS.primary };
  if (score >= 40) return { text: "CONSIDER WITH CAUTION", color: COLORS.warning };
  return { text: "NOT RECOMMENDED", color: COLORS.danger };
}

function addPageHeader(doc: jsPDF, pageWidth: number) {
  doc.setFillColor(...COLORS.dark);
  doc.rect(0, 0, pageWidth, 8, "F");
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  doc.text("CONFIDENTIAL - EMPLOYER USE ONLY", pageWidth / 2, 5, { align: "center" });
}

function addPageFooter(doc: jsPDF, pageWidth: number, pageHeight: number, candidateName: string, pageNum: number) {
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text(candidateName, 20, pageHeight - 10);
  doc.text(`Page ${pageNum}`, pageWidth - 20, pageHeight - 10, { align: "right" });
}

export function generateApplicantDossier(application: ApplicationData, profile: CandidateProfile): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  
  const notes = parseNotes(application.notes);
  const job = application.jobs;
  const overallScore = application.ai_score || 0;
  const candidateName = profile.full_name || "Candidate";
  const voiceResult = application.voice_interview_result as Record<string, any> | null;
  let pageNum = 1;

  // ============= PAGE 1: COVER PAGE =============
  doc.setFillColor(...COLORS.dark);
  doc.rect(0, 0, pageWidth, 100, "F");
  
  doc.setFillColor(...COLORS.secondary);
  doc.rect(0, 100, pageWidth, 4, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...COLORS.white);
  doc.text("Applicant Dossier", pageWidth / 2, 40, { align: "center" });
  
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.secondary);
  doc.text("Comprehensive Candidate Assessment Report", pageWidth / 2, 55, { align: "center" });
  
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.light);
  doc.text("CONFIDENTIAL - FOR EMPLOYER USE ONLY", pageWidth / 2, 72, { align: "center" });

  // Candidate card
  let y = 130;
  doc.setFillColor(...COLORS.light);
  roundedRect(doc, margin, y, contentWidth, 70, 8, "F");
  
  // Score circle
  drawScoreCircle(doc, pageWidth - margin - 40, y + 35, 25, overallScore, getScoreColor(overallScore));
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...COLORS.dark);
  doc.text(candidateName, margin + 15, y + 25);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.muted);
  doc.text(profile.email, margin + 15, y + 38);
  
  if (profile.phone) {
    doc.text(profile.phone, margin + 15, y + 50);
  }
  if (profile.location) {
    doc.text(profile.location, margin + 15, y + 62);
  }

  // Position info
  y += 90;
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.muted);
  doc.text("Position Applied For", margin, y);
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.dark);
  doc.text(job?.title || "Position", margin, y + 14);
  
  if (job?.department) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.muted);
    doc.text(job.department, margin, y + 26);
  }

  // Dates
  y += 45;
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text(`Application Date: ${new Date(application.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, margin, y);
  doc.text(`Report Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, margin, y + 12);
  doc.text(`Status: ${application.status.toUpperCase()}`, margin, y + 24);

  // Recommendation badge
  const rec = getRecommendation(overallScore);
  doc.setFillColor(...rec.color);
  roundedRect(doc, margin, pageHeight - 50, contentWidth, 30, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.white);
  doc.text(rec.text, pageWidth / 2, pageHeight - 31, { align: "center" });

  // ============= PAGE 2: EXECUTIVE SUMMARY =============
  doc.addPage();
  pageNum++;
  addPageHeader(doc, pageWidth);
  y = margin + 15;
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...COLORS.dark);
  doc.text("Executive Summary", margin, y);
  
  y += 20;
  
  // Quick stats row
  const stats = [
    { label: "Overall Score", value: `${overallScore}`, color: getScoreColor(overallScore) },
    { label: "Status", value: application.status, color: COLORS.dark },
    { label: "Phase", value: application.phase || "Application", color: COLORS.dark },
  ];
  
  const statWidth = (contentWidth - 20) / 3;
  stats.forEach((stat, i) => {
    const xPos = margin + i * (statWidth + 10);
    doc.setFillColor(...COLORS.light);
    roundedRect(doc, xPos, y, statWidth, 35, 4, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...stat.color);
    doc.text(String(stat.value), xPos + statWidth / 2, y + 15, { align: "center" });
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text(stat.label, xPos + statWidth / 2, y + 27, { align: "center" });
  });
  
  y += 50;

  // AVA Analysis Summary
  if (application.ai_analysis) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.dark);
    doc.text("AVA Assessment", margin, y);
    
    y += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.dark);
    
    // Parse and display key sections from AI analysis
    const analysisLines = application.ai_analysis.split('\n');
    let inStrengths = false;
    let inConcerns = false;
    
    for (const line of analysisLines) {
      if (y > pageHeight - 40) {
        addPageFooter(doc, pageWidth, pageHeight, candidateName, pageNum);
        doc.addPage();
        pageNum++;
        addPageHeader(doc, pageWidth);
        y = margin + 15;
      }
      
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Bold headings
      if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
        const headingText = trimmed.replace(/\*\*/g, '');
        inStrengths = headingText.toLowerCase().includes('strength');
        inConcerns = headingText.toLowerCase().includes('concern') || headingText.toLowerCase().includes('critical');
        
        y += 5;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        const headingColor = inStrengths ? COLORS.success : inConcerns ? COLORS.warning : COLORS.dark;
        doc.setTextColor(...headingColor);
        doc.text(headingText, margin, y);
        y += 6;
        continue;
      }
      
      // List items
      if (trimmed.startsWith('- ')) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const listColor = inStrengths ? COLORS.success : inConcerns ? COLORS.warning : COLORS.muted;
        doc.setTextColor(...listColor);
        const itemText = trimmed.substring(2);
        y = addWrappedText(doc, `• ${itemText}`, margin + 5, y, contentWidth - 10, 4.5);
        y += 2;
        continue;
      }
      
      // Regular text
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.dark);
      y = addWrappedText(doc, trimmed.replace(/\*\*/g, ''), margin, y, contentWidth, 4.5);
      y += 2;
    }
  }

  // ============= PAGE 3+: PHASE RESULTS =============
  doc.addPage();
  pageNum++;
  addPageHeader(doc, pageWidth);
  y = margin + 15;
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...COLORS.dark);
  doc.text("Phase-by-Phase Results", margin, y);
  y += 20;

  // Application Answers
  if (notes.applicationAnswers?.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.secondary);
    doc.text("Application Answers", margin, y);
    y += 10;
    
    for (const qa of notes.applicationAnswers) {
      if (y > pageHeight - 60) {
        addPageFooter(doc, pageWidth, pageHeight, candidateName, pageNum);
        doc.addPage();
        pageNum++;
        addPageHeader(doc, pageWidth);
        y = margin + 15;
      }
      
      doc.setFillColor(...COLORS.light);
      roundedRect(doc, margin, y, contentWidth, 30, 4, "F");
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.dark);
      doc.text(qa.question || "Question", margin + 5, y + 10, { maxWidth: contentWidth - 10 });
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.muted);
      const answerLines = doc.splitTextToSize(qa.answer || "No answer", contentWidth - 10);
      doc.text(answerLines.slice(0, 2), margin + 5, y + 20);
      
      y += 35;
    }
    y += 10;
  }

  // Quiz Results
  const quizData = notes.quiz || notes.quizResult || notes.quizAnswers;
  if (quizData) {
    if (y > pageHeight - 80) {
      addPageFooter(doc, pageWidth, pageHeight, candidateName, pageNum);
      doc.addPage();
      pageNum++;
      addPageHeader(doc, pageWidth);
      y = margin + 15;
    }
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.secondary);
    doc.text("Skills Assessment Quiz", margin, y);
    y += 10;
    
    const quizScore = quizData.score || 0;
    doc.setFillColor(...COLORS.light);
    roundedRect(doc, margin, y, contentWidth, 40, 4, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(...getScoreColor(quizScore));
    doc.text(`${quizScore}%`, margin + 20, y + 25);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.muted);
    doc.text("Quiz Score", margin + 50, y + 25);
    
    drawProgressBar(doc, margin + 90, y + 20, contentWidth - 110, 10, quizScore, getScoreColor(quizScore));
    
    y += 55;
  }

  // Typing Test
  if (notes.typingTestResult) {
    if (y > pageHeight - 80) {
      addPageFooter(doc, pageWidth, pageHeight, candidateName, pageNum);
      doc.addPage();
      pageNum++;
      addPageHeader(doc, pageWidth);
      y = margin + 15;
    }
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.secondary);
    doc.text("Typing Proficiency Test", margin, y);
    y += 10;
    
    doc.setFillColor(...COLORS.light);
    roundedRect(doc, margin, y, contentWidth, 35, 4, "F");
    
    const wpm = notes.typingTestResult.wpm || 0;
    const accuracy = notes.typingTestResult.accuracy || 0;
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...COLORS.primary);
    doc.text(`${wpm} WPM`, margin + 20, y + 22);
    
    doc.setFontSize(16);
    doc.setTextColor(...getScoreColor(accuracy));
    doc.text(`${accuracy}% Accuracy`, margin + 80, y + 22);
    
    y += 50;
  }

  // Chat Simulation
  if (notes.chatSimulationResult) {
    if (y > pageHeight - 80) {
      addPageFooter(doc, pageWidth, pageHeight, candidateName, pageNum);
      doc.addPage();
      pageNum++;
      addPageHeader(doc, pageWidth);
      y = margin + 15;
    }
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.secondary);
    doc.text("Customer Service Simulation", margin, y);
    y += 10;
    
    const chatScore = notes.chatSimulationResult.overallScore || 0;
    doc.setFillColor(...COLORS.light);
    roundedRect(doc, margin, y, contentWidth, 40, 4, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...getScoreColor(chatScore));
    doc.text(`${chatScore}%`, margin + 20, y + 25);
    
    drawProgressBar(doc, margin + 60, y + 20, contentWidth - 80, 10, chatScore, getScoreColor(chatScore));
    
    y += 55;
  }

  // Sales Simulation
  if (notes.salesSimulationResult) {
    if (y > pageHeight - 80) {
      addPageFooter(doc, pageWidth, pageHeight, candidateName, pageNum);
      doc.addPage();
      pageNum++;
      addPageHeader(doc, pageWidth);
      y = margin + 15;
    }
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.secondary);
    doc.text("Sales Meeting Simulation", margin, y);
    y += 10;
    
    const salesScore = notes.salesSimulationResult.overallScore || 0;
    const wouldBuy = notes.salesSimulationResult.wouldBuy;
    
    doc.setFillColor(...COLORS.light);
    roundedRect(doc, margin, y, contentWidth, 50, 4, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...getScoreColor(salesScore));
    doc.text(`${salesScore}%`, margin + 20, y + 20);
    
    doc.setFontSize(12);
    const buyColor = wouldBuy ? COLORS.success : COLORS.danger;
    doc.setTextColor(...buyColor);
    doc.text(wouldBuy ? "Would Buy" : "Would Not Buy", margin + 60, y + 20);
    
    // Category scores
    const categories = notes.salesSimulationResult.categoryScores || {};
    let catX = margin + 10;
    doc.setFontSize(8);
    for (const [cat, score] of Object.entries(categories)) {
      if (catX > pageWidth - 60) break;
      doc.setTextColor(...COLORS.muted);
      doc.text(`${cat}: `, catX, y + 40);
      doc.setTextColor(...getScoreColor(score as number));
      doc.text(`${score}%`, catX + 30, y + 40);
      catX += 50;
    }
    
    y += 65;
  }

  // Voice Interview
  if (voiceResult) {
    if (y > pageHeight - 100) {
      addPageFooter(doc, pageWidth, pageHeight, candidateName, pageNum);
      doc.addPage();
      pageNum++;
      addPageHeader(doc, pageWidth);
      y = margin + 15;
    }
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.secondary);
    doc.text("Voice Interview with AVA", margin, y);
    y += 10;
    
    const voiceScore = voiceResult.overall_score || 0;
    doc.setFillColor(...COLORS.light);
    roundedRect(doc, margin, y, contentWidth, 55, 4, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...getScoreColor(voiceScore));
    doc.text(`${voiceScore}%`, margin + 20, y + 20);
    
    doc.setFontSize(11);
    const voiceRec = voiceResult.recommendation || "pending";
    const voiceRecColor = voiceRec === "hire" ? COLORS.success : voiceRec === "no_hire" ? COLORS.danger : COLORS.warning;
    doc.setTextColor(...voiceRecColor);
    doc.text(voiceRec.toUpperCase().replace("_", " "), margin + 60, y + 20);
    
    // Soft skills
    if (voiceResult.soft_skills) {
      let skillX = margin + 10;
      doc.setFontSize(8);
      y += 30;
      for (const [skill, score] of Object.entries(voiceResult.soft_skills).slice(0, 6)) {
        doc.setTextColor(...COLORS.muted);
        const skillName = skill.charAt(0).toUpperCase() + skill.slice(1);
        doc.text(`${skillName}: `, skillX, y + 15);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...getScoreColor((score as number) * 10));
        doc.text(`${score}/10`, skillX + 35, y + 15);
        doc.setFont("helvetica", "normal");
        skillX += 55;
        if (skillX > pageWidth - 70) {
          skillX = margin + 10;
          y += 12;
        }
      }
    }
    
    y += 40;
    
    // Interview concerns
    if (voiceResult.concerns?.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.warning);
      doc.text("Concerns Noted:", margin, y);
      y += 8;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      for (const concern of voiceResult.concerns.slice(0, 3)) {
        if (y > pageHeight - 30) break;
        doc.setTextColor(...COLORS.muted);
        y = addWrappedText(doc, `• ${concern}`, margin + 5, y, contentWidth - 10, 4.5);
        y += 3;
      }
    }
    
    // Interview highlights
    if (voiceResult.interview_highlights?.length > 0) {
      y += 5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.success);
      doc.text("Highlights:", margin, y);
      y += 8;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      for (const highlight of voiceResult.interview_highlights.slice(0, 3)) {
        if (y > pageHeight - 30) break;
        doc.setTextColor(...COLORS.muted);
        y = addWrappedText(doc, `• ${highlight.quote || highlight}`, margin + 5, y, contentWidth - 10, 4.5);
        y += 3;
      }
    }
  }

  // ============= FINAL PAGE: DECISION SUMMARY =============
  doc.addPage();
  pageNum++;
  addPageHeader(doc, pageWidth);
  y = margin + 15;
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...COLORS.dark);
  doc.text("Decision Summary", margin, y);
  y += 25;
  
  // Large recommendation box
  const finalRec = getRecommendation(overallScore);
  doc.setFillColor(...finalRec.color);
  roundedRect(doc, margin, y, contentWidth, 50, 8, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.white);
  doc.text(finalRec.text, pageWidth / 2, y + 22, { align: "center" });
  
  doc.setFontSize(12);
  doc.text(`Overall Score: ${overallScore}/100`, pageWidth / 2, y + 38, { align: "center" });
  
  y += 70;
  
  // Key factors
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.dark);
  doc.text("Key Decision Factors", margin, y);
  y += 15;
  
  const factors: string[] = [];
  if (quizData?.score) factors.push(`Quiz Score: ${quizData.score}%`);
  if (notes.typingTestResult?.wpm) factors.push(`Typing Speed: ${notes.typingTestResult.wpm} WPM`);
  if (notes.salesSimulationResult?.wouldBuy !== undefined) {
    factors.push(`Sales Simulation: ${notes.salesSimulationResult.wouldBuy ? "Passed" : "Failed"}`);
  }
  if (voiceResult?.recommendation) {
    factors.push(`Interview Recommendation: ${voiceResult.recommendation.toUpperCase()}`);
  }
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.dark);
  
  for (const factor of factors) {
    doc.setFillColor(...COLORS.light);
    roundedRect(doc, margin, y, contentWidth, 20, 4, "F");
    doc.text(`• ${factor}`, margin + 10, y + 13);
    y += 25;
  }
  
  // Suggested follow-up questions
  if (voiceResult?.suggested_followups?.length > 0) {
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.dark);
    doc.text("Suggested Follow-up Questions", margin, y);
    y += 12;
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    
    for (const question of voiceResult.suggested_followups.slice(0, 5)) {
      if (y > pageHeight - 30) break;
      y = addWrappedText(doc, `• ${question}`, margin + 5, y, contentWidth - 10, 4.5);
      y += 5;
    }
  }
  
  addPageFooter(doc, pageWidth, pageHeight, candidateName, pageNum);
  
  // Save the PDF
  const fileName = `${candidateName.replace(/\s+/g, '_')}_Dossier_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
