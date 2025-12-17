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
  doc.text("Your Application Journey & Growth Insights", pageWidth / 2, 58, { align: "center" });
  
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
    "This report provides detailed feedback on your application performance.",
    pageWidth / 2,
    pageHeight - 30,
    { align: "center" }
  );
  doc.text(
    "Use these insights to strengthen future opportunities.",
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
  doc.text("Overall Performance Score", margin + 85, y + 28);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.muted);
  
  let performanceLevel = "Needs Development";
  if (overallScore >= 80) performanceLevel = "Excellent Performance";
  else if (overallScore >= 60) performanceLevel = "Strong Performance";
  else if (overallScore >= 40) performanceLevel = "Developing Performance";
  
  doc.text(performanceLevel, margin + 85, y + 42);
  
  y += 90;
  
  // Key Takeaways section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.dark);
  doc.text("Key Takeaways", margin, y);
  
  y += 15;
  
  const takeaways = generateKeyTakeaways(application, notes, overallScore);
  
  takeaways.forEach((takeaway, index) => {
    // Bullet point
    doc.setFillColor(...COLORS.primary);
    doc.circle(margin + 5, y + 3, 2, "F");
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.dark);
    
    const lines = doc.splitTextToSize(takeaway, contentWidth - 20);
    doc.text(lines, margin + 15, y + 5);
    y += lines.length * 6 + 8;
  });
  
  // ============= PAGE 3: PHASE BREAKDOWN =============
  doc.addPage();
  y = margin;
  
  // Page header
  doc.setFillColor(...COLORS.secondary);
  doc.rect(0, 0, pageWidth, 8, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...COLORS.dark);
  doc.text("Phase-by-Phase Performance", margin, y + 25);
  
  y += 45;
  
  // Quiz Results
  const quizResult = notes.quizResult || notes.quiz || notes.quizAnswers;
  if (quizResult) {
    y = drawPhaseSection(doc, y, margin, contentWidth, "Skills Assessment", quizResult, "quiz");
  }
  
  // Typing Test
  if (notes.typingTestResult) {
    if (y > pageHeight - 80) {
      doc.addPage();
      y = margin + 20;
    }
    y = drawPhaseSection(doc, y, margin, contentWidth, "Typing Proficiency", notes.typingTestResult, "typing");
  }
  
  // Chat Simulation
  if (notes.chatSimulationResult) {
    if (y > pageHeight - 80) {
      doc.addPage();
      y = margin + 20;
    }
    y = drawPhaseSection(doc, y, margin, contentWidth, "Customer Service Simulation", notes.chatSimulationResult, "chat");
  }
  
  // Sales Simulation
  if (notes.salesSimulationResult) {
    if (y > pageHeight - 80) {
      doc.addPage();
      y = margin + 20;
    }
    y = drawPhaseSection(doc, y, margin, contentWidth, "Sales Meeting Performance", notes.salesSimulationResult, "sales");
  }
  
  // Chat Interview
  if (notes.chatInterviewResult) {
    if (y > pageHeight - 80) {
      doc.addPage();
      y = margin + 20;
    }
    y = drawPhaseSection(doc, y, margin, contentWidth, "Interview Performance", notes.chatInterviewResult, "interview");
  }
  
  // Voice Interview
  const voiceResult = application.voice_interview_result as Record<string, any> | null;
  if (voiceResult) {
    if (y > pageHeight - 80) {
      doc.addPage();
      y = margin + 20;
    }
    y = drawPhaseSection(doc, y, margin, contentWidth, "Voice Interview", voiceResult, "voice");
  }
  
  // Portfolio
  if (notes.portfolioResult) {
    if (y > pageHeight - 80) {
      doc.addPage();
      y = margin + 20;
    }
    y = drawPhaseSection(doc, y, margin, contentWidth, "Portfolio Review", notes.portfolioResult, "portfolio");
  }
  
  // ============= IMPROVEMENT ROADMAP PAGE =============
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
  doc.text("Personalized recommendations to strengthen your future applications", margin, y + 38);
  
  y += 55;
  
  // Generate improvement recommendations
  const recommendations = generateImprovementRoadmap(application, notes, overallScore);
  
  recommendations.forEach((rec, index) => {
    if (y > pageHeight - 60) {
      doc.addPage();
      y = margin + 20;
    }
    
    // Recommendation card
    doc.setFillColor(...COLORS.light);
    roundedRect(doc, margin, y, contentWidth, 50, 6, "F");
    
    // Priority badge
    const priorityColor = rec.priority === "high" ? COLORS.danger : 
                          rec.priority === "medium" ? COLORS.warning : COLORS.primary;
    doc.setFillColor(...priorityColor);
    roundedRect(doc, margin + 8, y + 8, 50, 14, 3, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.white);
    doc.text(rec.priority.toUpperCase(), margin + 33, y + 17, { align: "center" });
    
    // Recommendation title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.dark);
    doc.text(rec.title, margin + 65, y + 17);
    
    // Description
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.muted);
    const descLines = doc.splitTextToSize(rec.description, contentWidth - 20);
    doc.text(descLines, margin + 10, y + 32);
    
    y += 58;
  });
  
  // ============= FINAL PAGE: ENCOURAGEMENT =============
  doc.addPage();
  y = margin;
  
  // Centered motivational section
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  
  // White content area
  doc.setFillColor(...COLORS.white);
  roundedRect(doc, margin, 60, contentWidth, 160, 12, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...COLORS.dark);
  doc.text("Keep Growing!", pageWidth / 2, 100, { align: "center" });
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.muted);
  
  const encouragementLines = [
    "Every application is a learning opportunity.",
    "The insights in this report are stepping stones to your next success.",
    "",
    "Focus on the areas highlighted for growth,",
    "and your next opportunity will be even stronger."
  ];
  
  let textY = 125;
  encouragementLines.forEach(line => {
    doc.text(line, pageWidth / 2, textY, { align: "center" });
    textY += 14;
  });
  
  // Footer
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.white);
  doc.text("Thank you for your application.", pageWidth / 2, pageHeight - 40, { align: "center" });
  doc.text("We wish you the best in your career journey.", pageWidth / 2, pageHeight - 28, { align: "center" });
  
  // Save the PDF
  const fileName = `Performance-Report-${profile.full_name?.replace(/\s+/g, "-") || "Candidate"}-${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

// Draw a phase section with score, strengths, and areas for growth
function drawPhaseSection(
  doc: jsPDF,
  startY: number,
  margin: number,
  contentWidth: number,
  title: string,
  data: Record<string, any>,
  type: string
): number {
  let y = startY;
  
  // Section header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.dark);
  doc.text(title, margin, y);
  
  // Score
  const score = extractScore(data, type);
  if (score !== null) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...getScoreColor(score));
    doc.text(`${score}%`, margin + contentWidth - 10, y, { align: "right" });
    
    // Progress bar
    y += 10;
    drawProgressBar(doc, margin, y, contentWidth, 8, score, getScoreColor(score));
  }
  
  y += 20;
  
  // What You Did Well (Strengths)
  const strengths = extractStrengths(data, type);
  if (strengths.length > 0) {
    doc.setFillColor(...COLORS.success);
    roundedRect(doc, margin, y, 3, 12, 1, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.success);
    doc.text("What You Did Well", margin + 8, y + 9);
    
    y += 18;
    
    strengths.forEach(strength => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.dark);
      doc.text(`• ${strength}`, margin + 8, y);
      y += 8;
    });
  }
  
  y += 5;
  
  // Areas for Growth
  const improvements = extractImprovements(data, type);
  if (improvements.length > 0) {
    doc.setFillColor(...COLORS.warning);
    roundedRect(doc, margin, y, 3, 12, 1, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.warning);
    doc.text("Areas for Growth", margin + 8, y + 9);
    
    y += 18;
    
    improvements.forEach(improvement => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.dark);
      doc.text(`• ${improvement}`, margin + 8, y);
      y += 8;
    });
  }
  
  return y + 15;
}

// Extract score from different data structures
function extractScore(data: Record<string, any>, type: string): number | null {
  switch (type) {
    case "quiz":
      return data.score || data.percentage || null;
    case "typing":
      // Calculate typing score based on WPM and accuracy
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

// Extract strengths from data
function extractStrengths(data: Record<string, any>, type: string): string[] {
  // Check for explicit strengths array
  if (data.strengths && Array.isArray(data.strengths)) {
    return data.strengths.slice(0, 4);
  }
  
  // Generate based on type
  const strengths: string[] = [];
  
  switch (type) {
    case "typing":
      if (data.wpm >= 50) strengths.push("Above-average typing speed");
      if (data.accuracy >= 95) strengths.push("Excellent accuracy");
      if (data.wpm >= 40 && data.accuracy >= 90) strengths.push("Good balance of speed and precision");
      break;
    case "quiz":
      if (data.score >= 70) strengths.push("Strong knowledge base demonstrated");
      if (data.correctAnswers / data.totalQuestions >= 0.8) strengths.push("High question completion rate");
      break;
    case "chat":
    case "sales":
      if (data.communication_score >= 70) strengths.push("Clear communication style");
      if (data.problem_solving >= 70) strengths.push("Effective problem-solving approach");
      if (data.rapport_building >= 70) strengths.push("Strong rapport-building skills");
      break;
  }
  
  return strengths.length > 0 ? strengths : ["Completed the assessment", "Showed dedication"];
}

// Extract improvement areas from data
function extractImprovements(data: Record<string, any>, type: string): string[] {
  // Check for explicit concerns/improvements array
  if (data.concerns && Array.isArray(data.concerns)) {
    return data.concerns.slice(0, 4);
  }
  if (data.areas_for_improvement && Array.isArray(data.areas_for_improvement)) {
    return data.areas_for_improvement.slice(0, 4);
  }
  
  // Generate based on type and scores
  const improvements: string[] = [];
  
  switch (type) {
    case "typing":
      if (data.wpm < 40) improvements.push("Practice typing speed exercises");
      if (data.accuracy < 90) improvements.push("Focus on accuracy over speed");
      break;
    case "quiz":
      if (data.score < 60) improvements.push("Review core concepts for this role");
      break;
    case "chat":
    case "sales":
      if (data.communication_score < 60) improvements.push("Work on clear, concise communication");
      if (data.objection_handling < 60) improvements.push("Practice handling objections confidently");
      break;
  }
  
  return improvements.length > 0 ? improvements : ["Continue developing skills in this area"];
}

// Generate key takeaways for executive summary
function generateKeyTakeaways(
  application: ApplicationData,
  notes: Record<string, any>,
  overallScore: number
): string[] {
  const takeaways: string[] = [];
  
  if (overallScore >= 70) {
    takeaways.push("You demonstrated strong overall performance across multiple assessment areas.");
  } else if (overallScore >= 50) {
    takeaways.push("You showed promising potential with room for targeted improvement.");
  } else {
    takeaways.push("This application highlighted specific areas where focused development will help.");
  }
  
  if (notes.typingTestResult?.wpm >= 50) {
    takeaways.push("Your typing proficiency exceeded expectations, showing strong keyboard skills.");
  }
  
  if (notes.salesSimulationResult?.overall_score >= 70) {
    takeaways.push("You demonstrated effective sales and communication techniques.");
  }
  
  if (notes.chatSimulationResult?.overall_score >= 70) {
    takeaways.push("Your customer service approach showed empathy and problem-solving ability.");
  }
  
  // Add a forward-looking takeaway
  takeaways.push("Use the detailed feedback in this report to prepare for future opportunities.");
  
  return takeaways.slice(0, 5);
}

// Generate improvement roadmap
function generateImprovementRoadmap(
  application: ApplicationData,
  notes: Record<string, any>,
  overallScore: number
): Array<{ title: string; description: string; priority: "high" | "medium" | "low" }> {
  const recommendations: Array<{ title: string; description: string; priority: "high" | "medium" | "low" }> = [];
  
  // Typing recommendations
  if (notes.typingTestResult) {
    const wpm = notes.typingTestResult.wpm || 0;
    const accuracy = notes.typingTestResult.accuracy || 0;
    
    if (wpm < 40) {
      recommendations.push({
        title: "Improve Typing Speed",
        description: "Practice with online typing tutors like TypingClub or Keybr for 15-20 minutes daily. Focus on proper finger placement and rhythm.",
        priority: "high"
      });
    } else if (accuracy < 90) {
      recommendations.push({
        title: "Enhance Typing Accuracy",
        description: "Slow down slightly and focus on hitting the correct keys. Accuracy improvements often naturally increase speed over time.",
        priority: "medium"
      });
    }
  }
  
  // Quiz recommendations
  const quizResult = notes.quizResult || notes.quiz || notes.quizAnswers;
  if (quizResult && (quizResult.score || 0) < 70) {
    recommendations.push({
      title: "Strengthen Core Knowledge",
      description: "Review industry fundamentals and common practices for this role. Consider online courses or certifications to build expertise.",
      priority: "high"
    });
  }
  
  // Communication recommendations
  const chatResult = notes.chatSimulationResult || notes.chatInterviewResult;
  if (chatResult && (chatResult.communication_score || chatResult.overall_score || 0) < 60) {
    recommendations.push({
      title: "Develop Communication Skills",
      description: "Practice clear, structured responses. Use the STAR method (Situation, Task, Action, Result) for behavioral questions.",
      priority: "high"
    });
  }
  
  // Sales recommendations
  if (notes.salesSimulationResult) {
    const salesScore = notes.salesSimulationResult.overall_score || 0;
    if (salesScore < 60) {
      recommendations.push({
        title: "Strengthen Sales Techniques",
        description: "Study consultative selling approaches. Practice active listening and needs-based questioning to better understand prospect pain points.",
        priority: "medium"
      });
    }
    if (notes.salesSimulationResult.objection_handling < 60) {
      recommendations.push({
        title: "Master Objection Handling",
        description: "Prepare responses to common objections. Use the 'Feel, Felt, Found' technique to acknowledge and address concerns empathetically.",
        priority: "medium"
      });
    }
  }
  
  // General recommendations based on overall score
  if (overallScore < 50) {
    recommendations.push({
      title: "Targeted Role Preparation",
      description: "Research the specific requirements for this type of role. Focus your preparation on the 2-3 most critical skills mentioned in job descriptions.",
      priority: "high"
    });
  }
  
  // Always include a positive forward-looking recommendation
  recommendations.push({
    title: "Continue Building Experience",
    description: "Each application is valuable practice. Apply the insights from this report, and your next opportunity will reflect your growth.",
    priority: "low"
  });
  
  return recommendations.slice(0, 6);
}
