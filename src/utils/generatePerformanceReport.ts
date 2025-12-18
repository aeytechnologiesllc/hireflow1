import jsPDF from "jspdf";
import type { Tables } from "@/integrations/supabase/types";

interface ApplicationData extends Tables<"applications"> {
  jobs: Tables<"jobs"> | null;
}

interface CandidateProfile {
  full_name: string | null;
  email: string;
}

// Color palette
const COLORS = {
  primary: [16, 185, 129] as [number, number, number], // Teal/Emerald
  secondary: [139, 92, 246] as [number, number, number], // Purple
  success: [34, 197, 94] as [number, number, number], // Green
  warning: [245, 158, 11] as [number, number, number], // Amber
  danger: [239, 68, 68] as [number, number, number], // Red
  dark: [15, 23, 42] as [number, number, number], // Slate-900
  muted: [100, 116, 139] as [number, number, number], // Slate-500
  light: [241, 245, 249] as [number, number, number], // Slate-100
  white: [255, 255, 255] as [number, number, number],
};

// Helper to draw rounded rectangles
function roundedRect(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  style: "S" | "F" | "FD" = "F"
) {
  doc.roundedRect(x, y, w, h, r, r, style);
}

// Helper to draw progress bar
function drawProgressBar(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  value: number,
  color: [number, number, number]
) {
  // Background
  doc.setFillColor(...COLORS.light);
  roundedRect(doc, x, y, width, height, 2, "F");
  
  // Progress fill
  const fillWidth = (value / 100) * width;
  if (fillWidth > 0) {
    doc.setFillColor(...color);
    roundedRect(doc, x, y, Math.max(fillWidth, 4), height, 2, "F");
  }
}

// Helper to draw score circle
function drawScoreCircle(
  doc: jsPDF,
  x: number,
  y: number,
  radius: number,
  score: number,
  color: [number, number, number]
) {
  // Outer circle
  doc.setDrawColor(...color);
  doc.setLineWidth(3);
  doc.circle(x, y, radius, "S");
  
  // Score text
  doc.setFontSize(24);
  doc.setTextColor(...color);
  doc.setFont("helvetica", "bold");
  doc.text(`${score}`, x, y + 3, { align: "center" });
  
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.text("/ 100", x, y + 10, { align: "center" });
}

// Parse notes JSON safely
function parseNotes(notes: string | null): Record<string, any> {
  try {
    return notes ? JSON.parse(notes) : {};
  } catch {
    return {};
  }
}

// Get score color based on value
function getScoreColor(score: number): [number, number, number] {
  if (score >= 80) return COLORS.success;
  if (score >= 60) return COLORS.primary;
  if (score >= 40) return COLORS.warning;
  return COLORS.danger;
}

// Helper to add wrapped text and return new Y position
function addWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number = 6
): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

export function generatePerformanceReport(
  application: ApplicationData,
  profile: CandidateProfile
): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  
  const notes = parseNotes(application.notes);
  const job = application.jobs;
  const overallScore = application.ai_score || 0;
  
  // ============= PAGE 1: COVER PAGE =============
  
  // Header gradient simulation (dark section at top)
  doc.setFillColor(...COLORS.dark);
  doc.rect(0, 0, pageWidth, 100, "F");
  
  // Accent line
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 100, pageWidth, 4, "F");
  
  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(32);
  doc.setTextColor(...COLORS.white);
  doc.text("Performance Report", pageWidth / 2, 45, { align: "center" });
  
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.primary);
  doc.text("Your Comprehensive Application Analysis", pageWidth / 2, 58, { align: "center" });
  
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.light);
  doc.text("Detailed insights to accelerate your career growth", pageWidth / 2, 72, { align: "center" });
  
  // Candidate info card
  let y = 130;
  
  doc.setFillColor(...COLORS.light);
  roundedRect(doc, margin, y, contentWidth, 60, 8, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...COLORS.dark);
  doc.text(profile.full_name || "Candidate", margin + 15, y + 25);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.muted);
  doc.text(profile.email, margin + 15, y + 38);
  
  // Position applied for
  y += 80;
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.muted);
  doc.text("Position Applied For", margin, y);
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.dark);
  doc.text(job?.title || "Position", margin, y + 15);
  
  if (job?.department) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.muted);
    doc.text(job.department, margin, y + 28);
  }
  
  // Date info
  y += 50;
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.muted);
  doc.text(`Application Date: ${new Date(application.created_at).toLocaleDateString("en-US", { 
    year: "numeric", month: "long", day: "numeric" 
  })}`, margin, y);
  doc.text(`Report Generated: ${new Date().toLocaleDateString("en-US", { 
    year: "numeric", month: "long", day: "numeric" 
  })}`, margin, y + 12);
  
  // Footer message
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.muted);
  doc.text(
    "This premium report provides comprehensive feedback on your application.",
    pageWidth / 2,
    pageHeight - 30,
    { align: "center" }
  );
  doc.text(
    "Use these insights to strengthen your career trajectory.",
    pageWidth / 2,
    pageHeight - 22,
    { align: "center" }
  );
  
  // ============= PAGE 2: EXECUTIVE SUMMARY =============
  doc.addPage();
  y = margin;
  
  // Page header
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, 8, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...COLORS.dark);
  doc.text("Executive Summary", margin, y + 25);
  
  y += 45;
  
  // Overall score display
  doc.setFillColor(...COLORS.light);
  roundedRect(doc, margin, y, contentWidth, 70, 8, "F");
  
  drawScoreCircle(doc, margin + 45, y + 35, 25, overallScore, getScoreColor(overallScore));
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...COLORS.dark);
  doc.text("Overall Performance Score", margin + 85, y + 25);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.muted);
  
  let performanceLevel = "Needs Development";
  let performanceDescription = "";
  if (overallScore >= 80) {
    performanceLevel = "Excellent Performance";
    performanceDescription = "You demonstrated exceptional skills across multiple assessment areas.";
  } else if (overallScore >= 60) {
    performanceLevel = "Strong Performance";
    performanceDescription = "You showed solid capabilities with room for targeted improvement.";
  } else if (overallScore >= 40) {
    performanceLevel = "Developing Performance";
    performanceDescription = "You have foundational skills that can be strengthened with focused practice.";
  } else {
    performanceDescription = "This assessment highlighted key areas where development will accelerate your growth.";
  }
  
  doc.text(performanceLevel, margin + 85, y + 40);
  
  const descLines = doc.splitTextToSize(performanceDescription, contentWidth - 100);
  doc.text(descLines, margin + 85, y + 52);
  
  y += 90;
  
  // Comprehensive Summary Paragraphs
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.dark);
  doc.text("Your Application Journey", margin, y);
  
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.dark);
  
  const summaryParagraph1 = generateOpeningSummary(application, notes, overallScore, job?.title || "this position");
  y = addWrappedText(doc, summaryParagraph1, margin, y, contentWidth, 5);
  
  y += 8;
  
  const summaryParagraph2 = generateStrengthsSummary(notes, overallScore);
  y = addWrappedText(doc, summaryParagraph2, margin, y, contentWidth, 5);
  
  y += 8;
  
  const summaryParagraph3 = generateGrowthSummary(notes, overallScore);
  y = addWrappedText(doc, summaryParagraph3, margin, y, contentWidth, 5);
  
  // Key Metrics Section
  y += 15;
  
  if (y > pageHeight - 80) {
    doc.addPage();
    y = margin + 20;
  }
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.dark);
  doc.text("Key Performance Metrics", margin, y);
  
  y += 15;
  
  const metrics = extractKeyMetrics(notes, application);
  const metricsPerRow = 3;
  const metricWidth = (contentWidth - 20) / metricsPerRow;
  
  metrics.slice(0, 6).forEach((metric, index) => {
    const col = index % metricsPerRow;
    const row = Math.floor(index / metricsPerRow);
    const xPos = margin + col * (metricWidth + 10);
    const yPos = y + row * 35;
    
    doc.setFillColor(...COLORS.light);
    roundedRect(doc, xPos, yPos, metricWidth - 5, 30, 4, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...getScoreColor(metric.value));
    doc.text(metric.display, xPos + (metricWidth - 5) / 2, yPos + 12, { align: "center" });
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text(metric.label, xPos + (metricWidth - 5) / 2, yPos + 22, { align: "center" });
  });
  
  // ============= PAGE 3+: DETAILED PHASE BREAKDOWN =============
  doc.addPage();
  y = margin;
  
  // Page header
  doc.setFillColor(...COLORS.secondary);
  doc.rect(0, 0, pageWidth, 8, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...COLORS.dark);
  doc.text("Detailed Phase Analysis", margin, y + 25);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.muted);
  doc.text("In-depth breakdown of your performance in each assessment phase", margin, y + 38);
  
  y += 55;
  
  // Quiz Results
  const quizResult = notes.quizResult || notes.quiz || notes.quizAnswers;
  if (quizResult) {
    y = drawDetailedPhaseSection(doc, y, margin, contentWidth, pageHeight, "Skills Assessment Quiz", quizResult, "quiz", notes);
  }
  
  // Typing Test
  if (notes.typingTestResult) {
    if (y > pageHeight - 100) {
      doc.addPage();
      y = margin + 20;
    }
    y = drawDetailedPhaseSection(doc, y, margin, contentWidth, pageHeight, "Typing Proficiency Test", notes.typingTestResult, "typing", notes);
  }
  
  // Chat Simulation
  if (notes.chatSimulationResult) {
    if (y > pageHeight - 100) {
      doc.addPage();
      y = margin + 20;
    }
    y = drawDetailedPhaseSection(doc, y, margin, contentWidth, pageHeight, "Customer Service Simulation", notes.chatSimulationResult, "chat", notes);
  }
  
  // Sales Simulation
  if (notes.salesSimulationResult) {
    if (y > pageHeight - 100) {
      doc.addPage();
      y = margin + 20;
    }
    y = drawDetailedPhaseSection(doc, y, margin, contentWidth, pageHeight, "Sales Meeting Simulation", notes.salesSimulationResult, "sales", notes);
  }
  
  // Chat Interview
  if (notes.chatInterviewResult) {
    if (y > pageHeight - 100) {
      doc.addPage();
      y = margin + 20;
    }
    y = drawDetailedPhaseSection(doc, y, margin, contentWidth, pageHeight, "Professional Interview", notes.chatInterviewResult, "interview", notes);
  }
  
  // Voice Interview
  const voiceResult = application.voice_interview_result as Record<string, any> | null;
  if (voiceResult) {
    if (y > pageHeight - 100) {
      doc.addPage();
      y = margin + 20;
    }
    y = drawDetailedPhaseSection(doc, y, margin, contentWidth, pageHeight, "Voice Interview", voiceResult, "voice", notes);
  }
  
  // Portfolio
  if (notes.portfolioResult) {
    if (y > pageHeight - 100) {
      doc.addPage();
      y = margin + 20;
    }
    y = drawDetailedPhaseSection(doc, y, margin, contentWidth, pageHeight, "Portfolio Review", notes.portfolioResult, "portfolio", notes);
  }
  
  // ============= COMPREHENSIVE IMPROVEMENT ROADMAP PAGE =============
  doc.addPage();
  y = margin;
  
  // Page header with gradient simulation
  doc.setFillColor(...COLORS.warning);
  doc.rect(0, 0, pageWidth, 8, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...COLORS.dark);
  doc.text("Your Growth Roadmap", margin, y + 25);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.muted);
  doc.text("Personalized action plan to accelerate your career development", margin, y + 38);
  
  y += 55;
  
  // Introduction paragraph
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.dark);
  const roadmapIntro = `Based on your assessment results, we've identified specific areas where focused development will have the greatest impact on your career trajectory. Each recommendation below includes concrete steps you can take immediately, along with resources and timelines to help you track your progress. Remember, growth is a journey, and every step forward builds toward your success.`;
  y = addWrappedText(doc, roadmapIntro, margin, y, contentWidth, 5);
  
  y += 12;
  
  // Generate improvement recommendations
  const recommendations = generateComprehensiveRoadmap(application, notes, overallScore);
  
  recommendations.forEach((rec, index) => {
    if (y > pageHeight - 80) {
      doc.addPage();
      y = margin + 20;
    }
    
    // Recommendation card with more detail
    const cardHeight = 70 + (rec.steps ? rec.steps.length * 8 : 0);
    doc.setFillColor(...COLORS.light);
    roundedRect(doc, margin, y, contentWidth, cardHeight, 6, "F");
    
    // Priority badge
    const priorityColor = rec.priority === "high" ? COLORS.danger : 
                          rec.priority === "medium" ? COLORS.warning : COLORS.primary;
    doc.setFillColor(...priorityColor);
    roundedRect(doc, margin + 8, y + 8, 60, 16, 3, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.white);
    doc.text(`${rec.priority.toUpperCase()} PRIORITY`, margin + 38, y + 18, { align: "center" });
    
    // Timeline badge
    if (rec.timeline) {
      doc.setFillColor(...COLORS.dark);
      roundedRect(doc, margin + 75, y + 8, 50, 16, 3, "F");
      doc.setFontSize(8);
      doc.text(rec.timeline, margin + 100, y + 18, { align: "center" });
    }
    
    // Recommendation title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...COLORS.dark);
    doc.text(rec.title, margin + 10, y + 38);
    
    // Description paragraph
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.muted);
    const descLines = doc.splitTextToSize(rec.description, contentWidth - 20);
    doc.text(descLines, margin + 10, y + 50);
    
    // Action steps
    if (rec.steps && rec.steps.length > 0) {
      let stepY = y + 50 + descLines.length * 5 + 5;
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.dark);
      rec.steps.forEach((step, i) => {
        doc.text(`${i + 1}. ${step}`, margin + 15, stepY);
        stepY += 8;
      });
    }
    
    y += cardHeight + 10;
  });
  
  // ============= SKILLS DEEP DIVE PAGE =============
  doc.addPage();
  y = margin;
  
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, 8, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...COLORS.dark);
  doc.text("Skills Deep Dive", margin, y + 25);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.muted);
  doc.text("Comprehensive analysis of your demonstrated competencies", margin, y + 38);
  
  y += 55;
  
  // Skills analysis content
  const skillsAnalysis = generateSkillsDeepDive(notes, application, job?.skills_required || []);
  
  skillsAnalysis.forEach((skill) => {
    if (y > pageHeight - 60) {
      doc.addPage();
      y = margin + 20;
    }
    
    // Skill header with score bar
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.dark);
    doc.text(skill.name, margin, y);
    
    // Score display
    doc.setFontSize(11);
    doc.setTextColor(...getScoreColor(skill.score));
    doc.text(`${skill.score}%`, margin + contentWidth - 10, y, { align: "right" });
    
    y += 8;
    drawProgressBar(doc, margin, y, contentWidth, 6, skill.score, getScoreColor(skill.score));
    
    y += 14;
    
    // Analysis paragraph
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.dark);
    y = addWrappedText(doc, skill.analysis, margin, y, contentWidth, 5);
    
    // Improvement tip
    if (skill.tip) {
      y += 5;
      doc.setFillColor(...COLORS.light);
      roundedRect(doc, margin, y, contentWidth, 20, 4, "F");
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.primary);
      doc.text("Pro Tip:", margin + 8, y + 8);
      
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.muted);
      const tipLines = doc.splitTextToSize(skill.tip, contentWidth - 55);
      doc.text(tipLines, margin + 40, y + 8);
      
      y += 25;
    }
    
    y += 10;
  });
  
  // ============= FINAL PAGE: ENCOURAGEMENT =============
  doc.addPage();
  y = margin;
  
  // Centered motivational section
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  
  // White content area
  doc.setFillColor(...COLORS.white);
  roundedRect(doc, margin, 50, contentWidth, 180, 12, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...COLORS.dark);
  doc.text("Your Journey Continues", pageWidth / 2, 85, { align: "center" });
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.muted);
  
  const encouragementParagraph1 = `Every application is a stepping stone on your career path. The insights in this report aren't just feedback—they're your roadmap to becoming an even stronger candidate. The fact that you're taking the time to review and learn from this assessment already sets you apart.`;
  
  const encouragementParagraph2 = `Focus on one or two key areas from your Growth Roadmap each week. Small, consistent improvements compound over time into transformative growth. Your next opportunity will benefit from every lesson learned here.`;
  
  const encouragementParagraph3 = `Remember: the most successful professionals aren't those who never faced setbacks—they're the ones who learned from every experience and kept moving forward. Your dedication to growth is your greatest asset.`;
  
  let textY = 105;
  const lines1 = doc.splitTextToSize(encouragementParagraph1, contentWidth - 30);
  doc.text(lines1, pageWidth / 2, textY, { align: "center", maxWidth: contentWidth - 30 });
  textY += lines1.length * 6 + 10;
  
  const lines2 = doc.splitTextToSize(encouragementParagraph2, contentWidth - 30);
  doc.text(lines2, pageWidth / 2, textY, { align: "center", maxWidth: contentWidth - 30 });
  textY += lines2.length * 6 + 10;
  
  const lines3 = doc.splitTextToSize(encouragementParagraph3, contentWidth - 30);
  doc.text(lines3, pageWidth / 2, textY, { align: "center", maxWidth: contentWidth - 30 });
  
  // Quote
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.primary);
  doc.text('"Success is not final, failure is not fatal: it is the courage to continue that counts."', pageWidth / 2, 210, { align: "center" });
  
  // Footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.white);
  doc.text("Thank you for your application.", pageWidth / 2, pageHeight - 40, { align: "center" });
  doc.text("We wish you tremendous success in your career journey.", pageWidth / 2, pageHeight - 28, { align: "center" });
  
  // Save the PDF
  const fileName = `Performance-Report-${profile.full_name?.replace(/\s+/g, "-") || "Candidate"}-${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

// Draw a detailed phase section with comprehensive analysis
function drawDetailedPhaseSection(
  doc: jsPDF,
  startY: number,
  margin: number,
  contentWidth: number,
  pageHeight: number,
  title: string,
  data: Record<string, any>,
  type: string,
  notes: Record<string, any>
): number {
  let y = startY;
  
  // Section header with icon-like marker
  doc.setFillColor(...COLORS.secondary);
  roundedRect(doc, margin, y, 4, 20, 2, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.dark);
  doc.text(title, margin + 12, y + 8);
  
  // Score
  const score = extractScore(data, type);
  if (score !== null) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...getScoreColor(score));
    doc.text(`${score}%`, margin + contentWidth - 10, y + 8, { align: "right" });
    
    // Progress bar
    y += 18;
    drawProgressBar(doc, margin + 12, y, contentWidth - 12, 8, score, getScoreColor(score));
  }
  
  y += 20;
  
  // Phase introduction paragraph
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.dark);
  
  const phaseIntro = generatePhaseIntro(type, score || 0);
  y = addWrappedText(doc, phaseIntro, margin, y, contentWidth, 5);
  
  y += 10;
  
  // What You Did Well (Strengths) - with detailed explanations
  const strengths = extractDetailedStrengths(data, type, score || 0);
  if (strengths.length > 0) {
    doc.setFillColor(...COLORS.success);
    roundedRect(doc, margin, y, 4, 14, 1, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.success);
    doc.text("What You Did Well", margin + 10, y + 10);
    
    y += 20;
    
    strengths.forEach((strength, index) => {
      if (y > pageHeight - 40) {
        doc.addPage();
        y = margin + 20;
      }
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.dark);
      doc.text(`${index + 1}. ${strength.title}`, margin + 5, y);
      
      y += 6;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.muted);
      y = addWrappedText(doc, strength.detail, margin + 10, y, contentWidth - 15, 4.5);
      y += 6;
    });
  }
  
  y += 5;
  
  // Areas for Growth - with detailed explanations
  const improvements = extractDetailedImprovements(data, type, score || 0);
  if (improvements.length > 0) {
    if (y > pageHeight - 60) {
      doc.addPage();
      y = margin + 20;
    }
    
    doc.setFillColor(...COLORS.warning);
    roundedRect(doc, margin, y, 4, 14, 1, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.warning);
    doc.text("Opportunities for Growth", margin + 10, y + 10);
    
    y += 20;
    
    improvements.forEach((improvement, index) => {
      if (y > pageHeight - 40) {
        doc.addPage();
        y = margin + 20;
      }
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.dark);
      doc.text(`${index + 1}. ${improvement.title}`, margin + 5, y);
      
      y += 6;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.muted);
      y = addWrappedText(doc, improvement.detail, margin + 10, y, contentWidth - 15, 4.5);
      y += 6;
    });
  }
  
  return y + 15;
}

// Generate opening summary paragraph
function generateOpeningSummary(application: ApplicationData, notes: Record<string, any>, score: number, jobTitle: string): string {
  const phasesCompleted = countCompletedPhases(notes, application);
  
  if (score >= 70) {
    return `Your application for ${jobTitle} demonstrated strong capabilities across ${phasesCompleted} assessment phases. You approached each challenge with evident preparation and professionalism. While every hiring process has its unique requirements, your performance shows you possess many of the fundamental skills valued in this field. This report will help you understand exactly what worked well and identify opportunities to become an even more competitive candidate.`;
  } else if (score >= 50) {
    return `Your application for ${jobTitle} showed promising potential across ${phasesCompleted} assessment phases. You demonstrated core competencies in several areas while revealing specific opportunities for targeted improvement. This is valuable information—knowing exactly where to focus your development efforts is the first step toward significant growth. Use the detailed analysis in this report to create a focused improvement plan.`;
  } else {
    return `Your application for ${jobTitle} provided valuable insights across ${phasesCompleted} assessment phases. While the results highlight areas that need development, this feedback is a powerful tool for growth. Many successful professionals have used similar assessments as turning points in their careers. The detailed analysis below will help you understand specific areas to focus on and concrete steps to improve.`;
  }
}

// Generate strengths summary paragraph
function generateStrengthsSummary(notes: Record<string, any>, score: number): string {
  const strengths: string[] = [];
  
  if (notes.typingTestResult?.wpm >= 50) strengths.push("strong typing proficiency");
  if (notes.typingTestResult?.accuracy >= 95) strengths.push("exceptional accuracy");
  if (notes.salesSimulationResult?.overall_score >= 60) strengths.push("effective communication in professional scenarios");
  if (notes.chatSimulationResult?.overall_score >= 60) strengths.push("customer service aptitude");
  if (notes.chatInterviewResult?.overall_score >= 60) strengths.push("interview presence");
  
  if (strengths.length > 0) {
    return `Your assessment revealed several notable strengths: ${strengths.join(", ")}. These capabilities form a solid foundation for professional success. In competitive job markets, candidates who can demonstrate these skills have a significant advantage. The key is to continue building on these strengths while addressing the areas for improvement outlined below.`;
  }
  
  return `Every assessment reveals both strengths and opportunities for growth. While this application highlighted areas for development, remember that self-awareness is itself a valuable professional skill. The willingness to receive feedback and act on it is what separates candidates who grow from those who plateau. Focus on the actionable recommendations in this report.`;
}

// Generate growth summary paragraph  
function generateGrowthSummary(notes: Record<string, any>, score: number): string {
  const areas: string[] = [];
  
  if (notes.typingTestResult?.wpm < 40) areas.push("typing speed");
  if (notes.typingTestResult?.accuracy < 90) areas.push("typing accuracy");
  if (notes.salesSimulationResult?.overall_score < 50) areas.push("sales communication");
  if (notes.chatSimulationResult?.overall_score < 50) areas.push("customer interaction");
  
  if (areas.length > 0) {
    return `The assessment identified ${areas.join(", ")} as priority development areas. These skills are highly trainable—most candidates see significant improvement within 2-4 weeks of focused practice. The Growth Roadmap section provides specific, actionable steps for each area. Consider setting weekly goals and tracking your progress to maintain momentum.`;
  }
  
  return `Looking forward, continued development in your assessment areas will strengthen your candidacy for similar positions. Professional growth is a continuous journey, and each application provides data to guide your improvement. The recommendations in this report are designed to be immediately actionable so you can start making progress today.`;
}

// Extract key metrics from notes
function extractKeyMetrics(notes: Record<string, any>, application: ApplicationData): Array<{ label: string; value: number; display: string }> {
  const metrics: Array<{ label: string; value: number; display: string }> = [];
  
  if (notes.typingTestResult) {
    metrics.push({ label: "Typing Speed", value: Math.min(notes.typingTestResult.wpm || 0, 100), display: `${notes.typingTestResult.wpm || 0} WPM` });
    metrics.push({ label: "Accuracy", value: notes.typingTestResult.accuracy || 0, display: `${notes.typingTestResult.accuracy || 0}%` });
  }
  
  const quizResult = notes.quizResult || notes.quiz;
  if (quizResult?.score) {
    metrics.push({ label: "Quiz Score", value: quizResult.score, display: `${quizResult.score}%` });
  }
  
  if (notes.salesSimulationResult?.overall_score) {
    metrics.push({ label: "Sales Skills", value: notes.salesSimulationResult.overall_score, display: `${notes.salesSimulationResult.overall_score}%` });
  }
  
  if (notes.chatSimulationResult?.overall_score) {
    metrics.push({ label: "Service Skills", value: notes.chatSimulationResult.overall_score, display: `${notes.chatSimulationResult.overall_score}%` });
  }
  
  const voiceResult = application.voice_interview_result as Record<string, any> | null;
  if (voiceResult?.overall_score) {
    metrics.push({ label: "Interview", value: voiceResult.overall_score, display: `${voiceResult.overall_score}%` });
  }
  
  // Add overall if we have room
  if (metrics.length < 6 && application.ai_score) {
    metrics.push({ label: "Overall", value: application.ai_score, display: `${application.ai_score}%` });
  }
  
  return metrics;
}

// Count completed phases
function countCompletedPhases(notes: Record<string, any>, application: ApplicationData): number {
  let count = 1; // Application phase always counts
  
  if (notes.typingTestResult) count++;
  if (notes.quizResult || notes.quiz || notes.quizAnswers) count++;
  if (notes.salesSimulationResult) count++;
  if (notes.chatSimulationResult) count++;
  if (notes.chatInterviewResult) count++;
  if (notes.portfolioResult) count++;
  if (application.voice_interview_result) count++;
  
  return count;
}

// Generate phase introduction
function generatePhaseIntro(type: string, score: number): string {
  const intros: Record<string, string> = {
    quiz: `The skills assessment quiz evaluated your knowledge of key concepts relevant to this role. This type of assessment helps identify your current understanding and areas where additional study would be beneficial.`,
    typing: `The typing proficiency test measured both your speed (words per minute) and accuracy. These metrics are important for roles requiring keyboard work, as they directly impact productivity and the quality of written communication.`,
    chat: `The customer service simulation placed you in realistic support scenarios to evaluate your communication style, problem-solving approach, and ability to handle customer concerns with empathy and professionalism.`,
    sales: `The sales meeting simulation assessed your ability to build rapport, identify customer needs, present value propositions, and navigate objections—core skills for any client-facing role.`,
    interview: `The professional interview evaluation assessed your communication style, response quality, and overall interview presence. Strong interview performance translates directly to real-world hiring conversations.`,
    voice: `The voice interview provided an opportunity to demonstrate your verbal communication skills, including clarity, confidence, listening ability, and professional presence.`,
    portfolio: `The portfolio review evaluated the quality and relevance of your work samples, assessing both technical execution and creative problem-solving.`,
  };
  
  return intros[type] || `This assessment phase evaluated your capabilities in a specific area relevant to the position.`;
}

// Extract detailed strengths
function extractDetailedStrengths(data: Record<string, any>, type: string, score: number): Array<{ title: string; detail: string }> {
  const strengths: Array<{ title: string; detail: string }> = [];
  
  // Check for explicit strengths array
  if (data.strengths && Array.isArray(data.strengths)) {
    data.strengths.slice(0, 3).forEach((s: string) => {
      strengths.push({
        title: s,
        detail: `This demonstrates a valuable capability that employers look for. Continue to leverage and highlight this strength in future applications.`
      });
    });
    return strengths;
  }
  
  switch (type) {
    case "typing":
      if (data.wpm >= 60) {
        strengths.push({
          title: "Exceptional Typing Speed",
          detail: `Your ${data.wpm} WPM typing speed places you well above the average professional (40-50 WPM). This level of proficiency enables you to be highly productive in documentation-heavy roles and demonstrates strong keyboard familiarity.`
        });
      } else if (data.wpm >= 45) {
        strengths.push({
          title: "Solid Typing Speed",
          detail: `Your ${data.wpm} WPM typing speed meets professional standards. This baseline proficiency ensures you can handle typical workplace typing demands efficiently.`
        });
      }
      if (data.accuracy >= 97) {
        strengths.push({
          title: "Outstanding Accuracy",
          detail: `Your ${data.accuracy}% accuracy rate is exceptional. High accuracy reduces time spent on corrections and ensures professional-quality written communication from the first draft.`
        });
      } else if (data.accuracy >= 93) {
        strengths.push({
          title: "Good Accuracy",
          detail: `Your ${data.accuracy}% accuracy demonstrates careful attention to detail. This level of precision is valued in roles where written communication quality matters.`
        });
      }
      break;
      
    case "quiz":
      if (score >= 80) {
        strengths.push({
          title: "Strong Knowledge Foundation",
          detail: `Your quiz performance demonstrates solid understanding of core concepts. This knowledge base provides a strong foundation for on-the-job learning and quick ramp-up.`
        });
      } else if (score >= 60) {
        strengths.push({
          title: "Adequate Conceptual Understanding",
          detail: `You demonstrated understanding of fundamental concepts. This foundation can be built upon with targeted learning in specific areas.`
        });
      }
      break;
      
    case "chat":
    case "sales":
      if (data.communication_score >= 70 || data.overall_score >= 70) {
        strengths.push({
          title: "Effective Communication Style",
          detail: `Your communication approach demonstrated clarity and professionalism. You structured your responses logically and maintained appropriate tone throughout the interaction.`
        });
      }
      if (data.problem_solving >= 70 || data.discovery >= 70) {
        strengths.push({
          title: "Strong Problem-Solving Approach",
          detail: `You showed good instincts for understanding the situation and working toward solutions. This analytical approach is valuable in client-facing roles.`
        });
      }
      if (data.rapport_building >= 70 || data.empathy >= 70) {
        strengths.push({
          title: "Relationship Building Skills",
          detail: `You demonstrated the ability to connect with others and build rapport. This interpersonal skill is crucial for roles involving customer or client interaction.`
        });
      }
      break;
      
    case "voice":
    case "interview":
      if (data.communication_score >= 70) {
        strengths.push({
          title: "Strong Verbal Communication",
          detail: `Your verbal communication demonstrated clarity, appropriate pacing, and professional tone. These skills translate directly to effective workplace communication.`
        });
      }
      if (data.confidence >= 70 || (data.soft_skills?.confidence >= 70)) {
        strengths.push({
          title: "Confident Presentation",
          detail: `You presented yourself with confidence during the interview. This self-assurance helps create positive impressions and builds credibility with interviewers.`
        });
      }
      break;
  }
  
  // Add fallback if no specific strengths identified
  if (strengths.length === 0) {
    strengths.push({
      title: "Assessment Completion",
      detail: `You completed this assessment phase, demonstrating commitment to the application process. Taking time to engage fully with each step shows professionalism and dedication.`
    });
  }
  
  return strengths;
}

// Extract detailed improvements
function extractDetailedImprovements(data: Record<string, any>, type: string, score: number): Array<{ title: string; detail: string }> {
  const improvements: Array<{ title: string; detail: string }> = [];
  
  // Check for explicit concerns array
  if (data.concerns && Array.isArray(data.concerns)) {
    data.concerns.slice(0, 3).forEach((c: string) => {
      improvements.push({
        title: c,
        detail: `Focused practice in this area will strengthen your overall profile. Consider setting specific, measurable goals and tracking your progress over time.`
      });
    });
    return improvements;
  }
  
  switch (type) {
    case "typing":
      if (data.wpm < 35) {
        improvements.push({
          title: "Increase Typing Speed",
          detail: `Your current ${data.wpm} WPM is below the typical professional range of 40-60 WPM. Daily practice with typing tutors like TypingClub, Keybr, or TypeRacer can help you gain 10-15 WPM within 2-3 weeks. Focus on proper finger placement and rhythm rather than rushing—speed naturally increases with correct technique.`
        });
      } else if (data.wpm < 45) {
        improvements.push({
          title: "Build Typing Speed",
          detail: `Your ${data.wpm} WPM typing speed has room for improvement. Consistent daily practice of 15-20 minutes can help you reach the 50+ WPM range within a few weeks, significantly boosting your productivity potential.`
        });
      }
      if (data.accuracy < 88) {
        improvements.push({
          title: "Improve Typing Accuracy",
          detail: `Your ${data.accuracy}% accuracy indicates room for improvement in precision. Focus on slowing down slightly and hitting the correct keys rather than chasing speed. Accuracy naturally improves first, and speed follows. Consider practicing with accuracy-focused exercises.`
        });
      } else if (data.accuracy < 93) {
        improvements.push({
          title: "Refine Typing Precision",
          detail: `While your ${data.accuracy}% accuracy is acceptable, reaching 95%+ will reduce time spent on corrections. Practice with deliberate attention to each keystroke rather than rushing through exercises.`
        });
      }
      break;
      
    case "quiz":
      if (score < 50) {
        improvements.push({
          title: "Strengthen Core Knowledge",
          detail: `Your quiz results indicate gaps in fundamental concepts for this role. Consider reviewing industry resources, taking online courses, or seeking mentorship to build a stronger knowledge foundation. Focus on understanding core principles rather than memorizing facts.`
        });
      } else if (score < 70) {
        improvements.push({
          title: "Deepen Subject Matter Expertise",
          detail: `You have foundational knowledge but would benefit from deeper exploration of certain topics. Identify the specific questions you missed and use them as a study guide. Industry blogs, professional courses, and practice assessments can accelerate your learning.`
        });
      }
      break;
      
    case "chat":
    case "sales":
      if (data.communication_score < 60 || data.overall_score < 60) {
        improvements.push({
          title: "Enhance Communication Clarity",
          detail: `Work on structuring your responses more clearly. Practice the STAR method (Situation, Task, Action, Result) for explaining scenarios. Record yourself responding to practice scenarios and review for areas to improve. Clear, concise communication is a highly trainable skill.`
        });
      }
      if (data.objection_handling < 60) {
        improvements.push({
          title: "Develop Objection Handling Skills",
          detail: `Handling objections confidently is crucial in client-facing roles. Practice the "Feel, Felt, Found" technique: acknowledge feelings, share that others felt similarly, then explain what they found. Role-play common objections with a colleague or mentor to build confidence.`
        });
      }
      if (data.problem_solving < 60 || data.discovery < 60) {
        improvements.push({
          title: "Improve Discovery and Analysis",
          detail: `Work on asking more open-ended questions to understand situations fully before proposing solutions. Practice active listening—summarize what you've heard before responding. This approach leads to better-targeted solutions and builds rapport.`
        });
      }
      break;
      
    case "voice":
    case "interview":
      if (data.communication_score < 60) {
        improvements.push({
          title: "Strengthen Interview Communication",
          detail: `Practice speaking clearly and at a measured pace. Record yourself answering common interview questions and review for filler words, clarity, and structure. Consider joining a group like Toastmasters or practicing with a mentor to build verbal communication confidence.`
        });
      }
      if (data.technical_score && data.technical_score < 60) {
        improvements.push({
          title: "Prepare Technical Responses",
          detail: `Strengthen your ability to discuss technical topics by preparing concise explanations of your experience and skills. Practice explaining concepts as if to someone unfamiliar with the topic—this builds clarity and confidence in technical discussions.`
        });
      }
      break;
  }
  
  // Add general improvement if none specific
  if (improvements.length === 0 && score < 70) {
    improvements.push({
      title: "Continue Developing Skills",
      detail: `Focus on consistent practice and learning in this area. Set specific goals, seek feedback from others, and track your progress over time. Even small daily improvements compound into significant growth.`
    });
  }
  
  return improvements;
}

// Extract score from different data structures
function extractScore(data: Record<string, any>, type: string): number | null {
  switch (type) {
    case "quiz":
      return data.score || data.percentage || null;
    case "typing":
      const wpm = data.wpm || 0;
      const accuracy = data.accuracy || 0;
      return Math.round((wpm / 60 * 50) + (accuracy * 0.5));
    case "chat":
    case "sales":
      return data.overall_score || data.overallScore || null;
    case "interview":
      return data.overall_score || data.overallScore || null;
    case "voice":
      return data.overall_score || null;
    case "portfolio":
      return data.score || null;
    default:
      return data.score || null;
  }
}

// Generate comprehensive roadmap
function generateComprehensiveRoadmap(
  application: ApplicationData,
  notes: Record<string, any>,
  overallScore: number
): Array<{ title: string; description: string; priority: "high" | "medium" | "low"; timeline?: string; steps?: string[] }> {
  const recommendations: Array<{ title: string; description: string; priority: "high" | "medium" | "low"; timeline?: string; steps?: string[] }> = [];
  
  // Typing recommendations
  if (notes.typingTestResult) {
    const wpm = notes.typingTestResult.wpm || 0;
    const accuracy = notes.typingTestResult.accuracy || 0;
    
    if (wpm < 40) {
      recommendations.push({
        title: "Master Typing Speed",
        description: "Your typing speed is below professional standards. With focused daily practice, you can significantly improve within 2-3 weeks. This investment pays dividends in every role requiring keyboard work.",
        priority: "high",
        timeline: "2-3 weeks",
        steps: [
          "Use TypingClub or Keybr for 15-20 minutes daily",
          "Focus on proper finger placement before speed",
          "Practice with real text, not just exercises",
          "Track your WPM weekly to see progress"
        ]
      });
    } else if (accuracy < 90) {
      recommendations.push({
        title: "Improve Typing Accuracy",
        description: "High accuracy reduces time spent on corrections and improves professional communication quality. Focus on precision before speed—accuracy improvements often naturally increase speed as well.",
        priority: "medium",
        timeline: "1-2 weeks",
        steps: [
          "Slow down your typing pace by 20%",
          "Practice accuracy-focused exercises",
          "Use typing games that penalize errors",
          "Review and correct your work before submitting"
        ]
      });
    }
  }
  
  // Quiz recommendations
  const quizResult = notes.quizResult || notes.quiz || notes.quizAnswers;
  if (quizResult && (quizResult.score || 0) < 70) {
    recommendations.push({
      title: "Strengthen Industry Knowledge",
      description: "Knowledge assessments reveal areas where additional learning would benefit your career. Investing in targeted education now will make you more competitive and effective in future roles.",
      priority: "high",
      timeline: "2-4 weeks",
      steps: [
        "Identify topics where you struggled in the quiz",
        "Find online courses or resources for those topics",
        "Create flashcards for key concepts",
        "Test yourself weekly to track improvement"
      ]
    });
  }
  
  // Communication recommendations
  const chatResult = notes.chatSimulationResult || notes.chatInterviewResult;
  if (chatResult && (chatResult.communication_score || chatResult.overall_score || 0) < 60) {
    recommendations.push({
      title: "Elevate Communication Skills",
      description: "Clear, professional communication is one of the most valuable and transferable career skills. Improvement here benefits every aspect of your professional life.",
      priority: "high",
      timeline: "Ongoing",
      steps: [
        "Practice the STAR method for structured responses",
        "Record yourself and review for clarity",
        "Join a public speaking group or find a practice partner",
        "Read business communication resources or take a course"
      ]
    });
  }
  
  // Sales recommendations
  if (notes.salesSimulationResult) {
    const salesScore = notes.salesSimulationResult.overall_score || 0;
    if (salesScore < 60) {
      recommendations.push({
        title: "Develop Sales Communication",
        description: "Sales skills are valuable in any client-facing role. Learning consultative selling techniques improves your ability to understand and address customer needs effectively.",
        priority: "medium",
        timeline: "3-4 weeks",
        steps: [
          "Study consultative selling approaches",
          "Practice asking open-ended discovery questions",
          "Learn to identify and articulate value propositions",
          "Role-play sales scenarios with a mentor"
        ]
      });
    }
    if (notes.salesSimulationResult.objection_handling < 60) {
      recommendations.push({
        title: "Master Objection Handling",
        description: "The ability to address concerns confidently is crucial for any persuasive communication. This skill improves not just sales but negotiation and conflict resolution abilities.",
        priority: "medium",
        timeline: "2-3 weeks",
        steps: [
          "List common objections in your field",
          "Prepare thoughtful responses to each",
          "Practice the Feel-Felt-Found technique",
          "Role-play objection scenarios until comfortable"
        ]
      });
    }
  }
  
  // Interview recommendations
  const voiceResult = application.voice_interview_result as Record<string, any> | null;
  if (voiceResult && voiceResult.overall_score < 60) {
    recommendations.push({
      title: "Sharpen Interview Performance",
      description: "Strong interview skills directly impact your ability to land desired positions. This is one of the highest-ROI areas for career development.",
      priority: "high",
      timeline: "1-2 weeks",
      steps: [
        "Research common interview questions for your field",
        "Prepare and practice structured answers",
        "Conduct mock interviews with friends or mentors",
        "Record yourself and review for improvement areas"
      ]
    });
  }
  
  // General recommendations based on overall score
  if (overallScore < 50) {
    recommendations.push({
      title: "Create a Focused Development Plan",
      description: "Significant improvement requires focused effort. Create a structured plan targeting 1-2 key areas at a time rather than trying to improve everything at once.",
      priority: "high",
      timeline: "4-6 weeks",
      steps: [
        "Choose 2 priority areas from this report",
        "Set specific, measurable weekly goals",
        "Schedule dedicated practice time daily",
        "Review progress and adjust approach weekly"
      ]
    });
  }
  
  // Always include a positive forward-looking recommendation
  recommendations.push({
    title: "Build on This Experience",
    description: "Every application provides valuable data for growth. Use the specific feedback in this report as your guide, and track your improvement over time. Your next application will reflect your progress.",
    priority: "low",
    timeline: "Ongoing",
    steps: [
      "Save this report for future reference",
      "Set calendar reminders to practice key skills",
      "Apply to similar positions to practice and improve",
      "Celebrate progress, no matter how small"
    ]
  });
  
  return recommendations.slice(0, 5);
}

// Generate skills deep dive
function generateSkillsDeepDive(
  notes: Record<string, any>,
  application: ApplicationData,
  requiredSkills: string[]
): Array<{ name: string; score: number; analysis: string; tip?: string }> {
  const skills: Array<{ name: string; score: number; analysis: string; tip?: string }> = [];
  
  // Typing/Keyboard skills
  if (notes.typingTestResult) {
    const wpm = notes.typingTestResult.wpm || 0;
    const accuracy = notes.typingTestResult.accuracy || 0;
    const score = Math.round((wpm / 60 * 50) + (accuracy * 0.5));
    
    let analysis = "";
    if (wpm >= 50 && accuracy >= 95) {
      analysis = `Your typing proficiency is excellent. With ${wpm} WPM and ${accuracy}% accuracy, you're well-equipped for any role requiring significant keyboard work. This skill level enables high productivity in documentation, communication, and data entry tasks. Continue maintaining these skills with occasional practice.`;
    } else if (wpm >= 40 && accuracy >= 90) {
      analysis = `Your typing skills are at professional competency level. Your ${wpm} WPM and ${accuracy}% accuracy meet standard workplace requirements. To move to the next level, consider focused practice sessions to push your speed above 50 WPM while maintaining accuracy.`;
    } else {
      analysis = `Your typing proficiency has room for significant improvement. At ${wpm} WPM with ${accuracy}% accuracy, you're below the typical professional range. The good news is that typing is highly trainable—dedicated practice can improve your speed by 10-20 WPM within a few weeks. This investment will pay dividends throughout your career.`;
    }
    
    skills.push({
      name: "Typing Proficiency",
      score,
      analysis,
      tip: wpm < 50 ? "Try the 'home row' method and practice 15 minutes daily with typing games that make practice engaging." : undefined
    });
  }
  
  // Communication skills
  const commScore = notes.chatSimulationResult?.communication_score || 
                   notes.salesSimulationResult?.communication_score ||
                   notes.chatInterviewResult?.communication_score ||
                   (application.voice_interview_result as any)?.communication_score;
  
  if (commScore) {
    let analysis = "";
    if (commScore >= 70) {
      analysis = `Your communication skills are a notable strength. You demonstrated the ability to express ideas clearly, maintain professional tone, and structure your responses effectively. Strong communicators advance more quickly in their careers and are more effective in team environments. Continue to refine this skill through practice and feedback.`;
    } else if (commScore >= 50) {
      analysis = `Your communication skills show potential with room for development. You have foundational abilities but would benefit from working on clarity, structure, and confidence in your responses. Communication is one of the most valuable career skills—improvement here will benefit every aspect of your professional life.`;
    } else {
      analysis = `Communication is an important area for development. Clear, confident communication impacts everything from interviews to daily work interactions. Consider focused practice through mock conversations, public speaking groups, or communication courses. This is a highly trainable skill that improves quickly with deliberate practice.`;
    }
    
    skills.push({
      name: "Communication",
      score: commScore,
      analysis,
      tip: commScore < 70 ? "Practice the STAR method (Situation, Task, Action, Result) for structuring clear, impactful responses." : undefined
    });
  }
  
  // Problem Solving
  const problemScore = notes.chatSimulationResult?.problem_solving ||
                      notes.salesSimulationResult?.discovery ||
                      (application.voice_interview_result as any)?.problem_solving_score;
  
  if (problemScore) {
    let analysis = "";
    if (problemScore >= 70) {
      analysis = `You demonstrated strong problem-solving abilities. Your approach showed analytical thinking, the ability to gather relevant information, and skill in developing effective solutions. This capability is highly valued across industries and positions you well for roles requiring independent thinking and decision-making.`;
    } else {
      analysis = `Problem-solving skills are an opportunity for growth. Strengthening your analytical approach will make you more effective in any role. Practice by breaking down complex problems into smaller components, asking clarifying questions before proposing solutions, and considering multiple approaches before acting.`;
    }
    
    skills.push({
      name: "Problem Solving",
      score: problemScore,
      analysis,
      tip: problemScore < 70 ? "Before answering, pause to ask clarifying questions and restate the problem to ensure understanding." : undefined
    });
  }
  
  // Adaptability/Confidence
  const confidenceScore = (application.voice_interview_result as any)?.soft_skills?.confidence ||
                         (application.voice_interview_result as any)?.adaptability_score ||
                         notes.salesSimulationResult?.rapport_building;
  
  if (confidenceScore) {
    let analysis = "";
    if (confidenceScore >= 70) {
      analysis = `You project confidence and adaptability well. These qualities help you navigate new situations, make positive impressions, and handle pressure effectively. Confident professionals are often given more opportunities and responsibilities because they inspire trust in their abilities.`;
    } else {
      analysis = `Building confidence and adaptability will strengthen your professional presence. These qualities can be developed through preparation, practice, and positive self-talk. Focus on thorough preparation before high-stakes situations, and remember that confidence grows with each successful experience.`;
    }
    
    skills.push({
      name: "Confidence & Adaptability",
      score: confidenceScore,
      analysis,
      tip: confidenceScore < 70 ? "Preparation breeds confidence. Thoroughly prepare for interviews and presentations to feel more self-assured." : undefined
    });
  }
  
  // Knowledge/Technical skills (from quiz)
  const quizResult = notes.quizResult || notes.quiz;
  if (quizResult?.score) {
    let analysis = "";
    if (quizResult.score >= 70) {
      analysis = `Your knowledge assessment demonstrates solid understanding of relevant concepts. This foundation enables faster onboarding and more effective contribution in your target role. Continue expanding your knowledge through continuous learning and staying current with industry developments.`;
    } else {
      analysis = `Your knowledge assessment revealed areas for additional learning. While current knowledge can always be expanded, prioritizing study in the topics covered by this assessment will strengthen your candidacy. Consider online courses, industry resources, or mentorship to accelerate your learning.`;
    }
    
    skills.push({
      name: "Domain Knowledge",
      score: quizResult.score,
      analysis,
      tip: quizResult.score < 70 ? "Focus on understanding concepts rather than memorizing facts—this leads to better retention and application." : undefined
    });
  }
  
  return skills;
}
