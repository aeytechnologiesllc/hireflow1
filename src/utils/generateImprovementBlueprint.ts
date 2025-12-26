import { jsPDF } from "jspdf";

// Types for the Personal Improvement Blueprint
export interface ImprovementBlueprintData {
  honestReflection: {
    whatHappened: string;
    scoreContext: string;
    keyInsight: string;
  };
  strengthsToLeverage: {
    identified: Array<{
      strength: string;
      evidence: string;
      futureStrategy: string;
    }>;
    hiddenEdge: string;
  };
  improvementCoaching: Array<{
    area: string;
    whatWasObserved: string;
    whyThisMatters: string;
    improvementStrategy: {
      framework: string;
      practiceScript: string;
      dailyHabit: string;
    };
    resource: {
      name: string;
      url: string;
      whyHelpful: string;
    };
  }>;
  thirtyDayPlan: {
    week1: WeekPlan;
    week2: WeekPlan;
    week3: WeekPlan;
    week4: WeekPlan;
  };
  closingMessage: {
    personalNote: string;
    immediateActions: string[];
    finalThought: string;
  };
  metadata: {
    candidateName: string;
    candidateEmail: string;
    jobTitle: string;
    overallScore: number;
    generatedAt: string;
    applicationId: string;
  };
}

interface WeekPlan {
  focus: string;
  dailyActions: string[];
  successMetric: string;
}

// Clean, modern color palette
const COLORS = {
  primary: { r: 79, g: 70, b: 229 },      // Indigo
  primaryLight: { r: 99, g: 102, b: 241 },
  success: { r: 16, g: 185, b: 129 },     // Emerald
  coaching: { r: 245, g: 158, b: 11 },    // Amber
  coachingBg: { r: 254, g: 243, b: 199 },
  successBg: { r: 209, g: 250, b: 229 },
  dark: { r: 30, g: 41, b: 59 },          // Slate 800
  body: { r: 51, g: 65, b: 85 },          // Slate 700
  muted: { r: 100, g: 116, b: 139 },      // Slate 500
  light: { r: 241, g: 245, b: 249 },      // Slate 100
  white: { r: 255, g: 255, b: 255 },
  border: { r: 226, g: 232, b: 240 },     // Slate 200
};

function setColor(doc: jsPDF, c: { r: number; g: number; b: number }) {
  doc.setTextColor(c.r, c.g, c.b);
}

function setFillColor(doc: jsPDF, c: { r: number; g: number; b: number }) {
  doc.setFillColor(c.r, c.g, c.b);
}

function setDrawColor(doc: jsPDF, c: { r: number; g: number; b: number }) {
  doc.setDrawColor(c.r, c.g, c.b);
}

function roundedRect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, style: 'S' | 'F' | 'FD' = 'F') {
  doc.roundedRect(x, y, w, h, r, r, style);
}

function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (doc.getTextWidth(testLine) > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });
  if (currentLine) lines.push(currentLine);
  return lines;
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Strong Performance";
  if (score >= 60) return "Room to Grow";
  if (score >= 40) return "Needs Development";
  return "Significant Gap";
}

export function generateImprovementBlueprint(data: ImprovementBlueprintData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15; // Reduced from 20
  const contentWidth = pageWidth - (margin * 2);
  
  const { metadata, honestReflection, strengthsToLeverage, improvementCoaching, thirtyDayPlan, closingMessage } = data;

  // ===== PAGE 1: PERSONAL SUMMARY & HONEST REFLECTION =====
  
  // Header bar
  setFillColor(doc, COLORS.primary);
  doc.rect(0, 0, pageWidth, 35, 'F');
  
  setColor(doc, COLORS.white);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Personal Improvement Blueprint", margin, 18);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Prepared for ${metadata.candidateName}`, margin, 28);
  
  // Date on right
  doc.text(
    new Date(metadata.generatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    pageWidth - margin,
    28,
    { align: 'right' }
  );

  let y = 45;

  // What Happened section
  setColor(doc, COLORS.dark);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("What Happened", margin, y);
  y += 8;

  setFillColor(doc, COLORS.light);
  const whatHappenedLines = wrapText(doc, honestReflection?.whatHappened || "Application was not advanced to the next stage.", contentWidth - 16);
  const whatHappenedHeight = Math.max(whatHappenedLines.length * 5 + 12, 25);
  roundedRect(doc, margin, y, contentWidth, whatHappenedHeight, 3, 'F');
  
  setColor(doc, COLORS.body);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  whatHappenedLines.forEach((line, i) => {
    doc.text(line, margin + 8, y + 10 + (i * 5));
  });
  y += whatHappenedHeight + 10;

  // Score context with visual
  setFillColor(doc, COLORS.white);
  setDrawColor(doc, COLORS.border);
  doc.setLineWidth(0.5);
  roundedRect(doc, margin, y, contentWidth, 35, 3, 'FD');
  
  // Score circle
  const scoreColor = metadata.overallScore >= 60 ? COLORS.success : COLORS.coaching;
  setFillColor(doc, scoreColor);
  doc.circle(margin + 25, y + 17, 15, 'F');
  setColor(doc, COLORS.white);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`${metadata.overallScore}`, margin + 25, y + 20, { align: 'center' });
  
  // Score context text
  setColor(doc, COLORS.dark);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(getScoreLabel(metadata.overallScore), margin + 50, y + 12);
  
  setColor(doc, COLORS.muted);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const contextLines = wrapText(doc, honestReflection?.scoreContext || "", contentWidth - 60);
  contextLines.slice(0, 2).forEach((line, i) => {
    doc.text(line, margin + 50, y + 20 + (i * 4));
  });
  y += 45;

  // Key Insight callout
  setFillColor(doc, COLORS.primary);
  roundedRect(doc, margin, y, contentWidth, 28, 3, 'F');
  setColor(doc, COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("KEY INSIGHT", margin + 8, y + 10);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const insightLines = wrapText(doc, honestReflection?.keyInsight || "", contentWidth - 16);
  insightLines.slice(0, 2).forEach((line, i) => {
    doc.text(line, margin + 8, y + 18 + (i * 5));
  });
  y += 38;

  // ===== PAGE 2: STRENGTHS TO LEVERAGE =====
  doc.addPage();
  
  // Page header
  setFillColor(doc, COLORS.success);
  doc.rect(0, 0, pageWidth, 8, 'F');
  setColor(doc, COLORS.muted);
  doc.setFontSize(8);
  doc.text("Page 2 of 4", pageWidth - margin, 16, { align: 'right' });
  
  y = 22;
  setColor(doc, COLORS.success);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Your Strengths to Leverage", margin, y);
  y += 6;
  setColor(doc, COLORS.muted);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("These are real advantages you demonstrated. Here's how to present them even better.", margin, y);
  y += 12;

  // Strengths cards
  (strengthsToLeverage?.identified || []).slice(0, 4).forEach((item) => {
    const cardHeight = 55;
    setFillColor(doc, COLORS.successBg);
    roundedRect(doc, margin, y, contentWidth, cardHeight, 3, 'F');
    
    // Strength name
    setColor(doc, COLORS.success);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(item.strength || "Strength", margin + 8, y + 10);
    
    // Evidence - allow 2 lines
    setColor(doc, COLORS.body);
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    const evidenceLines = wrapText(doc, `"${item.evidence || ''}"`, contentWidth - 16);
    evidenceLines.slice(0, 2).forEach((line, i) => {
      doc.text(line, margin + 8, y + 18 + (i * 4));
    });
    
    // Future strategy - allow 2 lines
    setColor(doc, COLORS.dark);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("→ Future strategy:", margin + 8, y + 32);
    const strategyLines = wrapText(doc, item.futureStrategy || "", contentWidth - 50);
    strategyLines.slice(0, 2).forEach((line, i) => {
      doc.text(line, i === 0 ? margin + 40 : margin + 8, y + 32 + (i * 5));
    });
    
    y += cardHeight + 6;
    
    if (y > pageHeight - 60) return;
  });

  // Hidden Edge
  y += 4;
  setFillColor(doc, COLORS.primary);
  roundedRect(doc, margin, y, contentWidth, 30, 3, 'F');
  setColor(doc, COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("YOUR HIDDEN EDGE", margin + 8, y + 10);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const edgeLines = wrapText(doc, strengthsToLeverage?.hiddenEdge || "", contentWidth - 16);
  edgeLines.slice(0, 2).forEach((line, i) => {
    doc.text(line, margin + 8, y + 18 + (i * 5));
  });

  // ===== PAGE 3: WHAT TO IMPROVE (COACHING FOCUS) =====
  doc.addPage();
  
  // Page header
  setFillColor(doc, COLORS.coaching);
  doc.rect(0, 0, pageWidth, 8, 'F');
  setColor(doc, COLORS.muted);
  doc.setFontSize(8);
  doc.text("Page 3 of 4", pageWidth - margin, 16, { align: 'right' });
  
  y = 22;
  setColor(doc, COLORS.coaching);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("What to Improve", margin, y);
  y += 6;
  setColor(doc, COLORS.muted);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Each area includes a specific strategy you can implement today.", margin, y);
  y += 12;

  // Improvement coaching cards (max 3)
  (improvementCoaching || []).slice(0, 3).forEach((item, idx) => {
    const cardHeight = 80;
    
    // Check if we need new page
    if (y + cardHeight > pageHeight - 20) {
      doc.addPage();
      setFillColor(doc, COLORS.coaching);
      doc.rect(0, 0, pageWidth, 8, 'F');
      y = 22;
    }
    
    setFillColor(doc, COLORS.coachingBg);
    roundedRect(doc, margin, y, contentWidth, cardHeight, 3, 'F');
    
    // Number badge
    setFillColor(doc, COLORS.coaching);
    roundedRect(doc, margin + 5, y + 5, 18, 12, 2, 'F');
    setColor(doc, COLORS.white);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`${idx + 1}`, margin + 14, y + 13, { align: 'center' });
    
    // Area name
    setColor(doc, COLORS.dark);
    doc.setFontSize(11);
    doc.text(item.area || "Area", margin + 28, y + 13);
    
    // What was observed - allow 2 lines
    setColor(doc, COLORS.body);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const obsLines = wrapText(doc, `Observed: ${item.whatWasObserved || ''}`, contentWidth - 16);
    obsLines.slice(0, 2).forEach((line, i) => {
      doc.text(line, margin + 8, y + 23 + (i * 4));
    });
    
    // Why this matters - allow 2 lines
    setColor(doc, COLORS.muted);
    doc.setFont("helvetica", "italic");
    const whyLines = wrapText(doc, item.whyThisMatters || "", contentWidth - 16);
    whyLines.slice(0, 2).forEach((line, i) => {
      doc.text(line, margin + 8, y + 35 + (i * 4));
    });
    
    // Strategy box
    setColor(doc, COLORS.success);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const strategyLines = wrapText(doc, `Strategy: ${item.improvementStrategy?.framework || ''}`, contentWidth - 16);
    strategyLines.slice(0, 2).forEach((line, i) => {
      doc.text(line, margin + 8, y + 48 + (i * 4));
    });
    
    setColor(doc, COLORS.body);
    doc.setFont("helvetica", "normal");
    const habitLines = wrapText(doc, `Daily habit: ${item.improvementStrategy?.dailyHabit || ''}`, contentWidth - 16);
    habitLines.slice(0, 2).forEach((line, i) => {
      doc.text(line, margin + 8, y + 60 + (i * 4));
    });
    
    // Resource
    setColor(doc, COLORS.primary);
    doc.setFontSize(7);
    const resourceText = `Resource: ${item.resource?.name || ''} (${item.resource?.url || ''})`;
    const resourceLines = wrapText(doc, resourceText, contentWidth - 16);
    doc.text(resourceLines[0] || "", margin + 8, y + 72);
    
    y += cardHeight + 6;
  });

  // ===== PAGE 4: 30-DAY PLAN & CLOSING =====
  doc.addPage();
  
  // Page header
  setFillColor(doc, COLORS.primary);
  doc.rect(0, 0, pageWidth, 8, 'F');
  setColor(doc, COLORS.muted);
  doc.setFontSize(8);
  doc.text("Page 4 of 4", pageWidth - margin, 16, { align: 'right' });
  
  y = 22;
  setColor(doc, COLORS.primary);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Your 30-Day Improvement Plan", margin, y);
  y += 10;

  // Week cards - 2x2 grid
  const weekWidth = (contentWidth - 8) / 2;
  const weekHeight = 75;
  const weeks = [
    { ...thirtyDayPlan?.week1, label: "Week 1" },
    { ...thirtyDayPlan?.week2, label: "Week 2" },
    { ...thirtyDayPlan?.week3, label: "Week 3" },
    { ...thirtyDayPlan?.week4, label: "Week 4" },
  ];

  weeks.forEach((week, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = margin + (col * (weekWidth + 8));
    const wy = y + (row * (weekHeight + 6));
    
    setFillColor(doc, COLORS.light);
    roundedRect(doc, x, wy, weekWidth, weekHeight, 3, 'F');
    
    // Week label
    setFillColor(doc, COLORS.primary);
    roundedRect(doc, x + 5, wy + 5, 40, 10, 2, 'F');
    setColor(doc, COLORS.white);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(week.label, x + 25, wy + 11, { align: 'center' });
    
    // Focus - use wrapText instead of substring
    setColor(doc, COLORS.dark);
    doc.setFontSize(9);
    const focusLines = wrapText(doc, week.focus || "Focus area", weekWidth - 55);
    focusLines.slice(0, 1).forEach((line, i) => {
      doc.text(line, x + 50, wy + 11 + (i * 4));
    });
    
    // Daily actions - use wrapText for each action
    setColor(doc, COLORS.body);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    let actionY = wy + 20;
    (week.dailyActions || []).slice(0, 3).forEach((action) => {
      const actionLines = wrapText(doc, `• ${action || ""}`, weekWidth - 16);
      actionLines.slice(0, 2).forEach((line, i) => {
        doc.text(line, x + 8, actionY + (i * 5));
      });
      actionY += Math.min(actionLines.length, 2) * 5 + 3;
    });
    
    // Success metric - use wrapText instead of substring
    setColor(doc, COLORS.success);
    doc.setFontSize(7);
    const metricLines = wrapText(doc, `✓ ${week.successMetric || ""}`, weekWidth - 16);
    metricLines.slice(0, 2).forEach((line, i) => {
      doc.text(line, x + 8, wy + weekHeight - 12 + (i * 5));
    });
  });

  y += (weekHeight * 2) + 20;

  // Closing message
  setFillColor(doc, COLORS.primary);
  const closingHeight = 70;
  roundedRect(doc, margin, y, contentWidth, closingHeight, 4, 'F');
  
  setColor(doc, COLORS.white);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("A Note From Your Career Coach", margin + 8, y + 12);
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const noteLines = wrapText(doc, closingMessage?.personalNote || "Keep pushing forward!", contentWidth - 16);
  noteLines.slice(0, 4).forEach((line, i) => {
    doc.text(line, margin + 8, y + 22 + (i * 5));
  });
  
  // Final thought
  doc.setFontSize(10);
  doc.setFont("helvetica", "italic");
  const finalLines = wrapText(doc, closingMessage?.finalThought || "", contentWidth - 16);
  finalLines.slice(0, 2).forEach((line, i) => {
    doc.text(line, margin + 8, y + 55 + (i * 5));
  });

  y += closingHeight + 10;

  // Immediate Actions checklist
  if (y + 60 < pageHeight) {
    setColor(doc, COLORS.dark);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Do This Today", margin, y);
    y += 7;
    
    let actionY = y;
    (closingMessage?.immediateActions || []).slice(0, 5).forEach((action) => {
      setDrawColor(doc, COLORS.primary);
      doc.setLineWidth(0.5);
      doc.rect(margin, actionY, 4, 4, 'S');
      
      setColor(doc, COLORS.body);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const actionLines = wrapText(doc, action || "", contentWidth - 16);
      actionLines.slice(0, 2).forEach((line, i) => {
        doc.text(line, margin + 8, actionY + 4 + (i * 5));
      });
      actionY += Math.min(actionLines.length, 2) * 5 + 4;
    });
  }

  // Footer
  y = pageHeight - 15;
  setDrawColor(doc, COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(margin, y - 5, pageWidth - margin, y - 5);
  setColor(doc, COLORS.muted);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("Personal Improvement Blueprint • Generated by Ava", pageWidth / 2, y, { align: 'center' });

  // Save the file
  const fileName = `Improvement-Blueprint-${(metadata.candidateName || 'Candidate').replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
