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
  doc.setFillColor(...COLORS.light);
  roundedRect(doc, x, y, width, height, 2, "F");
  
  const fillWidth = (value / 100) * width;
  if (fillWidth > 0) {
    doc.setFillColor(...color);
    roundedRect(doc, x, y, Math.max(fillWidth, 4), height, 2, "F");
  }
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

export function generatePerformanceReport(
  application: ApplicationData,
  profile: CandidateProfile
): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  
  const notes = parseNotes(application.notes);
  const job = application.jobs;
  const overallScore = application.ai_score || 0;
  
  // ============= PAGE 1: HEADER + EXECUTIVE SUMMARY + METRICS =============
  let y = 0;
  
  // Compact header bar
  doc.setFillColor(...COLORS.dark);
  doc.rect(0, 0, pageWidth, 45, "F");
  
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 45, pageWidth, 3, "F");
  
  // Title and candidate info in header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.white);
  doc.text("Performance Report", margin, 18);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.primary);
  doc.text(profile.full_name || "Candidate", margin, 30);
  
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.light);
  doc.text(`${job?.title || "Position"} • ${new Date(application.created_at).toLocaleDateString()}`, margin, 38);
  
  // Overall Score - Right side of header
  doc.setFillColor(...getScoreColor(overallScore));
  doc.circle(pageWidth - 30, 23, 15, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...COLORS.white);
  doc.text(`${overallScore}`, pageWidth - 30, 26, { align: "center" });
  
  doc.setFontSize(7);
  doc.text("SCORE", pageWidth - 30, 33, { align: "center" });
  
  y = 58;
  
  // Performance Level Badge
  let performanceLevel = "Needs Development";
  let levelColor = COLORS.danger;
  if (overallScore >= 80) { performanceLevel = "Excellent"; levelColor = COLORS.success; }
  else if (overallScore >= 60) { performanceLevel = "Strong"; levelColor = COLORS.primary; }
  else if (overallScore >= 40) { performanceLevel = "Developing"; levelColor = COLORS.warning; }
  
  doc.setFillColor(...levelColor);
  roundedRect(doc, margin, y, 70, 16, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.white);
  doc.text(performanceLevel.toUpperCase(), margin + 35, y + 10.5, { align: "center" });
  
  // Quick summary text next to badge
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  const phasesCompleted = countCompletedPhases(notes, application);
  doc.text(`${phasesCompleted} phases completed • Generated ${new Date().toLocaleDateString()}`, margin + 78, y + 10.5);
  
  y += 28;
  
  // KEY METRICS GRID (2 rows x 3 cols)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.dark);
  doc.text("Key Metrics", margin, y);
  
  y += 10;
  
  const metrics = extractKeyMetrics(notes, application);
  const metricWidth = (contentWidth - 10) / 3;
  const metricHeight = 28;
  
  metrics.slice(0, 6).forEach((metric, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const xPos = margin + col * (metricWidth + 5);
    const yPos = y + row * (metricHeight + 5);
    
    doc.setFillColor(...COLORS.light);
    roundedRect(doc, xPos, yPos, metricWidth, metricHeight, 4, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...getScoreColor(metric.value));
    doc.text(metric.display, xPos + metricWidth / 2, yPos + 11, { align: "center" });
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(metric.label, xPos + metricWidth / 2, yPos + 21, { align: "center" });
  });
  
  y += Math.ceil(metrics.slice(0, 6).length / 3) * (metricHeight + 5) + 10;
  
  // SIDE-BY-SIDE ASSESSMENT CARDS
  const cardWidth = (contentWidth - 8) / 2;
  const strengths = extractStrengthsList(notes, application);
  const improvements = extractImprovementsList(notes, application);
  
  // Strengths Card (Left)
  doc.setFillColor(230, 255, 240); // Light green tint
  roundedRect(doc, margin, y, cardWidth, 70, 6, "F");
  
  doc.setFillColor(...COLORS.success);
  roundedRect(doc, margin, y, 4, 70, 2, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.success);
  doc.text("What You Did Well", margin + 10, y + 12);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.dark);
  let bulletY = y + 24;
  strengths.slice(0, 4).forEach((s) => {
    doc.text(`• ${s}`, margin + 10, bulletY);
    bulletY += 11;
  });
  
  // Growth Card (Right)
  doc.setFillColor(255, 247, 230); // Light amber tint
  roundedRect(doc, margin + cardWidth + 8, y, cardWidth, 70, 6, "F");
  
  doc.setFillColor(...COLORS.warning);
  roundedRect(doc, margin + cardWidth + 8, y, 4, 70, 2, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.warning);
  doc.text("Areas for Growth", margin + cardWidth + 18, y + 12);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.dark);
  bulletY = y + 24;
  improvements.slice(0, 4).forEach((i) => {
    doc.text(`• ${i}`, margin + cardWidth + 18, bulletY);
    bulletY += 11;
  });
  
  y += 82;
  
  // PHASE PERFORMANCE (Compact rows)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.dark);
  doc.text("Phase Performance", margin, y);
  
  y += 12;
  
  const phases = getCompletedPhases(notes, application);
  
  phases.forEach((phase) => {
    if (y > pageHeight - 25) {
      doc.addPage();
      y = margin;
    }
    
    // Phase row: Name | Progress Bar | Score
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.dark);
    doc.text(phase.name, margin, y + 4);
    
    // Progress bar
    drawProgressBar(doc, margin + 55, y, contentWidth - 85, 6, phase.score, getScoreColor(phase.score));
    
    // Score
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...getScoreColor(phase.score));
    doc.text(`${phase.score}%`, margin + contentWidth - 5, y + 4, { align: "right" });
    
    y += 14;
  });
  
  // ============= PAGE 2: GROWTH ROADMAP + CLOSING =============
  doc.addPage();
  y = margin;
  
  // Header bar
  doc.setFillColor(...COLORS.warning);
  doc.rect(0, 0, pageWidth, 6, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.dark);
  doc.text("Your Growth Roadmap", margin, y + 18);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text("Actionable steps to strengthen your candidacy", margin, y + 28);
  
  y += 40;
  
  // Recommendations (compact cards)
  const recommendations = generateRoadmap(application, notes, overallScore);
  
  recommendations.forEach((rec, index) => {
    if (y > pageHeight - 50) {
      doc.addPage();
      y = margin + 15;
    }
    
    const cardHeight = 38 + (rec.steps ? Math.min(rec.steps.length, 3) * 9 : 0);
    
    doc.setFillColor(...COLORS.light);
    roundedRect(doc, margin, y, contentWidth, cardHeight, 5, "F");
    
    // Priority badge
    const priorityColor = rec.priority === "high" ? COLORS.danger : 
                          rec.priority === "medium" ? COLORS.warning : COLORS.primary;
    doc.setFillColor(...priorityColor);
    roundedRect(doc, margin + 6, y + 6, 45, 12, 2, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.white);
    doc.text(rec.priority.toUpperCase(), margin + 28.5, y + 13.5, { align: "center" });
    
    // Timeline badge
    if (rec.timeline) {
      doc.setFillColor(...COLORS.dark);
      roundedRect(doc, margin + 55, y + 6, 40, 12, 2, "F");
      doc.setFontSize(7);
      doc.text(rec.timeline, margin + 75, y + 13.5, { align: "center" });
    }
    
    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.dark);
    doc.text(rec.title, margin + 8, y + 28);
    
    // Steps (compact)
    if (rec.steps && rec.steps.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.muted);
      let stepY = y + 38;
      rec.steps.slice(0, 3).forEach((step, i) => {
        doc.text(`${i + 1}. ${step}`, margin + 12, stepY);
        stepY += 9;
      });
    }
    
    y += cardHeight + 8;
  });
  
  // CLOSING MESSAGE (compact, not a full page)
  if (y > pageHeight - 60) {
    doc.addPage();
    y = margin + 15;
  }
  
  y += 10;
  
  doc.setFillColor(...COLORS.primary);
  roundedRect(doc, margin, y, contentWidth, 45, 6, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.white);
  doc.text("Your Journey Continues", margin + 10, y + 15);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const closingText = "Every application is a stepping stone. Use these insights to become an even stronger candidate. Small, consistent improvements compound into transformative growth.";
  const closingLines = doc.splitTextToSize(closingText, contentWidth - 20);
  doc.text(closingLines, margin + 10, y + 26);
  
  // Footer
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  doc.text("Generated by HireFlow • Thank you for your application", pageWidth / 2, pageHeight - 10, { align: "center" });
  
  // Save the PDF
  const fileName = `Performance-Report-${profile.full_name?.replace(/\s+/g, "-") || "Candidate"}-${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

// Count completed phases
function countCompletedPhases(notes: Record<string, any>, application: ApplicationData): number {
  let count = 1;
  if (notes.typingTestResult) count++;
  if (notes.quizResult || notes.quiz || notes.quizAnswers) count++;
  if (notes.salesSimulationResult) count++;
  if (notes.chatSimulationResult) count++;
  if (notes.chatInterviewResult) count++;
  if (notes.portfolioResult) count++;
  if (application.voice_interview_result) count++;
  return count;
}

// Extract key metrics
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
  
  if (metrics.length < 6 && application.ai_score) {
    metrics.push({ label: "Overall", value: application.ai_score, display: `${application.ai_score}%` });
  }
  
  return metrics;
}

// Extract strengths as bullet points
function extractStrengthsList(notes: Record<string, any>, application: ApplicationData): string[] {
  const strengths: string[] = [];
  
  if (notes.typingTestResult?.wpm >= 50) strengths.push("Strong typing proficiency");
  if (notes.typingTestResult?.accuracy >= 95) strengths.push("Excellent accuracy");
  if ((notes.quizResult?.score || notes.quiz?.score) >= 70) strengths.push("Solid knowledge foundation");
  if (notes.salesSimulationResult?.overall_score >= 60) strengths.push("Effective sales communication");
  if (notes.chatSimulationResult?.overall_score >= 60) strengths.push("Good customer service aptitude");
  if (notes.chatInterviewResult?.overall_score >= 60) strengths.push("Strong interview presence");
  
  const voiceResult = application.voice_interview_result as Record<string, any> | null;
  if (voiceResult?.overall_score >= 60) strengths.push("Clear verbal communication");
  
  if (strengths.length === 0) {
    strengths.push("Completed all required phases");
    strengths.push("Demonstrated initiative");
  }
  
  return strengths;
}

// Extract improvements as bullet points
function extractImprovementsList(notes: Record<string, any>, application: ApplicationData): string[] {
  const improvements: string[] = [];
  
  if (notes.typingTestResult?.wpm < 40) improvements.push("Increase typing speed (target: 50+ WPM)");
  if (notes.typingTestResult?.accuracy < 90) improvements.push("Improve typing accuracy");
  if ((notes.quizResult?.score || notes.quiz?.score || 0) < 60) improvements.push("Strengthen core knowledge");
  if (notes.salesSimulationResult?.overall_score < 50) improvements.push("Develop sales communication");
  if (notes.chatSimulationResult?.overall_score < 50) improvements.push("Enhance customer service skills");
  if (notes.chatInterviewResult?.overall_score < 50) improvements.push("Practice interview responses");
  
  const voiceResult = application.voice_interview_result as Record<string, any> | null;
  if (voiceResult?.overall_score && voiceResult.overall_score < 50) improvements.push("Improve verbal clarity");
  
  if (improvements.length === 0) {
    improvements.push("Continue refining existing skills");
    improvements.push("Seek additional practice opportunities");
  }
  
  return improvements;
}

// Get completed phases with scores
function getCompletedPhases(notes: Record<string, any>, application: ApplicationData): Array<{ name: string; score: number }> {
  const phases: Array<{ name: string; score: number }> = [];
  
  const quizResult = notes.quizResult || notes.quiz;
  if (quizResult?.score) {
    phases.push({ name: "Skills Quiz", score: quizResult.score });
  }
  
  if (notes.typingTestResult) {
    const wpm = notes.typingTestResult.wpm || 0;
    const accuracy = notes.typingTestResult.accuracy || 0;
    const score = Math.round((wpm / 60 * 50) + (accuracy * 0.5));
    phases.push({ name: "Typing Test", score: Math.min(score, 100) });
  }
  
  if (notes.chatSimulationResult?.overall_score) {
    phases.push({ name: "Customer Service", score: notes.chatSimulationResult.overall_score });
  }
  
  if (notes.salesSimulationResult?.overall_score) {
    phases.push({ name: "Sales Meeting", score: notes.salesSimulationResult.overall_score });
  }
  
  if (notes.chatInterviewResult?.overall_score) {
    phases.push({ name: "Interview", score: notes.chatInterviewResult.overall_score });
  }
  
  if (notes.portfolioResult?.score) {
    phases.push({ name: "Portfolio", score: notes.portfolioResult.score });
  }
  
  const voiceResult = application.voice_interview_result as Record<string, any> | null;
  if (voiceResult?.overall_score) {
    phases.push({ name: "Voice Interview", score: voiceResult.overall_score });
  }
  
  return phases;
}

// Generate compact roadmap recommendations
function generateRoadmap(
  application: ApplicationData,
  notes: Record<string, any>,
  overallScore: number
): Array<{ title: string; priority: "high" | "medium" | "low"; timeline?: string; steps?: string[] }> {
  const recommendations: Array<{ title: string; priority: "high" | "medium" | "low"; timeline?: string; steps?: string[] }> = [];
  
  if (notes.typingTestResult) {
    const wpm = notes.typingTestResult.wpm || 0;
    const accuracy = notes.typingTestResult.accuracy || 0;
    
    if (wpm < 40) {
      recommendations.push({
        title: "Master Typing Speed",
        priority: "high",
        timeline: "2-3 weeks",
        steps: [
          "Practice 15-20 min daily with TypingClub or Keybr",
          "Focus on proper finger placement before speed",
          "Track your WPM weekly to see progress"
        ]
      });
    } else if (accuracy < 90) {
      recommendations.push({
        title: "Improve Typing Accuracy",
        priority: "medium",
        timeline: "1-2 weeks",
        steps: [
          "Slow down your pace by 20%",
          "Use accuracy-focused typing exercises",
          "Review work before submitting"
        ]
      });
    }
  }
  
  const quizResult = notes.quizResult || notes.quiz;
  if (quizResult && (quizResult.score || 0) < 70) {
    recommendations.push({
      title: "Strengthen Industry Knowledge",
      priority: "high",
      timeline: "2-4 weeks",
      steps: [
        "Identify topics where you struggled",
        "Find online courses for those areas",
        "Test yourself weekly to track improvement"
      ]
    });
  }
  
  const chatResult = notes.chatSimulationResult || notes.chatInterviewResult;
  if (chatResult && (chatResult.overall_score || 0) < 60) {
    recommendations.push({
      title: "Elevate Communication Skills",
      priority: "high",
      timeline: "Ongoing",
      steps: [
        "Practice the STAR method for responses",
        "Record yourself and review for clarity",
        "Join a public speaking group or find a mentor"
      ]
    });
  }
  
  if (notes.salesSimulationResult && (notes.salesSimulationResult.overall_score || 0) < 60) {
    recommendations.push({
      title: "Develop Sales Skills",
      priority: "medium",
      timeline: "3-4 weeks",
      steps: [
        "Study consultative selling approaches",
        "Practice asking discovery questions",
        "Role-play sales scenarios with a mentor"
      ]
    });
  }
  
  const voiceResult = application.voice_interview_result as Record<string, any> | null;
  if (voiceResult && voiceResult.overall_score < 60) {
    recommendations.push({
      title: "Sharpen Interview Performance",
      priority: "high",
      timeline: "1-2 weeks",
      steps: [
        "Research common interview questions",
        "Prepare structured answers using STAR",
        "Conduct mock interviews with friends"
      ]
    });
  }
  
  // Always include a forward-looking recommendation
  recommendations.push({
    title: "Build on This Experience",
    priority: "low",
    timeline: "Ongoing",
    steps: [
      "Save this report for future reference",
      "Set calendar reminders to practice",
      "Apply to similar positions to improve"
    ]
  });
  
  return recommendations.slice(0, 4);
}
