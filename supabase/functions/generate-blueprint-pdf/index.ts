import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Types matching the AI response structure
interface ImprovementBlueprintData {
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
    completedPhases: string[];
    dataDepth: 'minimal' | 'moderate' | 'comprehensive';
    dataDepthMessage: string;
  };
}

interface WeekPlan {
  focus: string;
  dailyActions: string[];
  successMetric: string;
}

// Color palette
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

function getPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    application_form: 'Application Form',
    resume: 'Resume',
    typing_test: 'Typing Test',
    quiz: 'Quiz Assessment',
    screening_questions: 'Screening Questions',
    portfolio: 'Portfolio Review',
    chat_interview: 'Chat Interview',
    sales_simulation: 'Sales Simulation',
    voice_interview: 'Voice Interview',
    voice_transcript: 'Interview Transcript'
  };
  return labels[phase] || phase;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { blueprintData } = await req.json() as { blueprintData: ImprovementBlueprintData };

    if (!blueprintData) {
      return new Response(
        JSON.stringify({ error: 'Blueprint data is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating PDF for:', blueprintData.metadata?.candidateName, 'dataDepth:', blueprintData.metadata?.dataDepth);

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    
    const { metadata, honestReflection, strengthsToLeverage, improvementCoaching, thirtyDayPlan, closingMessage } = blueprintData;
    const dataDepth = metadata?.dataDepth || 'minimal';
    const completedPhases = metadata?.completedPhases || ['application_form'];

    // Track total pages dynamically
    let totalPages = 1;
    // Calculate expected pages based on content
    const numStrengths = (strengthsToLeverage?.identified || []).length;
    const numImprovements = (improvementCoaching || []).length;
    const hasFullPlan = dataDepth !== 'minimal';
    
    // Estimate: Page 1 (summary + data sources), Page 2+ (strengths if many), Page 3+ (improvements), Page 4 (30-day plan), Page 5 (closing)
    if (numStrengths > 0) totalPages++;
    if (numImprovements > 0) totalPages++;
    if (hasFullPlan) totalPages++; // 30-day plan
    totalPages++; // Closing

    let currentPage = 1;

    // ===== PAGE 1: HEADER, DATA SOURCES & SUMMARY =====
    
    // Header bar
    setFillColor(doc, COLORS.primary);
    doc.rect(0, 0, pageWidth, 38, 'F');
    
    setColor(doc, COLORS.white);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Personal Improvement Blueprint", margin, 18);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Prepared for ${metadata?.candidateName || 'Candidate'}`, margin, 28);
    doc.text(`Position: ${metadata?.jobTitle || 'Position'}`, margin, 34);
    
    // Date on right
    const formattedDate = new Date(metadata?.generatedAt || Date.now()).toLocaleDateString('en-US', { 
      month: 'long', day: 'numeric', year: 'numeric' 
    });
    doc.text(formattedDate, pageWidth - margin, 28, { align: 'right' });

    let y = 48;

    // ===== DATA SOURCES SECTION =====
    setColor(doc, COLORS.dark);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("📋 Data Sources Analyzed", margin, y);
    y += 8;

    // Data sources box with phase pills
    const dataSourceHeight = dataDepth === 'minimal' ? 35 : 28;
    setFillColor(doc, COLORS.light);
    roundedRect(doc, margin, y, contentWidth, dataSourceHeight, 3, 'F');
    
    // Show phase labels
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    let pillX = margin + 6;
    let pillY = y + 8;
    
    completedPhases.forEach((phase) => {
      const label = getPhaseLabel(phase);
      const labelWidth = doc.getTextWidth(label) + 10;
      
      if (pillX + labelWidth > pageWidth - margin - 6) {
        pillX = margin + 6;
        pillY += 12;
      }
      
      setFillColor(doc, COLORS.primary);
      roundedRect(doc, pillX, pillY - 5, labelWidth, 10, 2, 'F');
      setColor(doc, COLORS.white);
      doc.text(label, pillX + 5, pillY + 2);
      pillX += labelWidth + 4;
    });
    
    // Data depth message
    if (metadata?.dataDepthMessage) {
      setColor(doc, COLORS.muted);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      const depthLines = wrapText(doc, metadata.dataDepthMessage, contentWidth - 12);
      depthLines.slice(0, 2).forEach((line, i) => {
        doc.text(line, margin + 6, y + dataSourceHeight - 8 + (i * 4));
      });
    }
    
    y += dataSourceHeight + 10;

    // ===== WHAT HAPPENED SECTION =====
    setColor(doc, COLORS.dark);
    doc.setFontSize(12);
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
    y += whatHappenedHeight + 8;

    // ===== SCORE SECTION =====
    setFillColor(doc, COLORS.white);
    setDrawColor(doc, COLORS.border);
    doc.setLineWidth(0.5);
    roundedRect(doc, margin, y, contentWidth, 35, 3, 'FD');
    
    // Score circle
    const scoreColor = (metadata?.overallScore || 0) >= 60 ? COLORS.success : COLORS.coaching;
    setFillColor(doc, scoreColor);
    doc.circle(margin + 25, y + 17, 15, 'F');
    setColor(doc, COLORS.white);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`${metadata?.overallScore || 0}`, margin + 25, y + 20, { align: 'center' });
    
    // Score context text
    setColor(doc, COLORS.dark);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(getScoreLabel(metadata?.overallScore || 0), margin + 50, y + 12);
    
    setColor(doc, COLORS.muted);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const contextLines = wrapText(doc, honestReflection?.scoreContext || "", contentWidth - 60);
    contextLines.slice(0, 2).forEach((line, i) => {
      doc.text(line, margin + 50, y + 20 + (i * 4));
    });
    y += 43;

    // ===== KEY INSIGHT =====
    setFillColor(doc, COLORS.primary);
    const insightLines = wrapText(doc, honestReflection?.keyInsight || "Focus on continuous improvement.", contentWidth - 16);
    const insightHeight = Math.max(insightLines.length * 5 + 18, 28);
    roundedRect(doc, margin, y, contentWidth, insightHeight, 3, 'F');
    setColor(doc, COLORS.white);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("KEY INSIGHT", margin + 8, y + 10);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    insightLines.forEach((line, i) => {
      doc.text(line, margin + 8, y + 18 + (i * 5));
    });
    y += insightHeight + 8;

    // Footer for page 1
    setColor(doc, COLORS.muted);
    doc.setFontSize(7);
    doc.text("Personal Improvement Blueprint", margin, pageHeight - 10);
    doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });

    // ===== PAGE 2: STRENGTHS =====
    if (numStrengths > 0) {
      doc.addPage();
      currentPage++;
      
      // Page header
      setFillColor(doc, COLORS.success);
      doc.rect(0, 0, pageWidth, 8, 'F');
      
      y = 18;
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

      // Strengths cards - dynamic based on data
      const maxStrengths = dataDepth === 'minimal' ? 2 : 4;
      (strengthsToLeverage?.identified || []).slice(0, maxStrengths).forEach((item) => {
        // Check if we need a new page
        if (y > pageHeight - 80) {
          doc.addPage();
          currentPage++;
          setFillColor(doc, COLORS.success);
          doc.rect(0, 0, pageWidth, 8, 'F');
          y = 18;
        }

        const evidenceLines = wrapText(doc, `"${item.evidence || ''}"`, contentWidth - 16);
        const strategyLines = wrapText(doc, item.futureStrategy || "", contentWidth - 50);
        const cardHeight = 20 + (Math.min(evidenceLines.length, 2) * 4) + (Math.min(strategyLines.length, 2) * 5) + 10;
        
        setFillColor(doc, COLORS.successBg);
        roundedRect(doc, margin, y, contentWidth, cardHeight, 3, 'F');
        
        // Strength name
        setColor(doc, COLORS.success);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(item.strength || "Strength", margin + 8, y + 10);
        
        // Evidence
        setColor(doc, COLORS.body);
        doc.setFontSize(9);
        doc.setFont("helvetica", "italic");
        evidenceLines.slice(0, 2).forEach((line, i) => {
          doc.text(line, margin + 8, y + 18 + (i * 4));
        });
        
        // Future strategy
        const strategyY = y + 18 + (Math.min(evidenceLines.length, 2) * 4) + 6;
        setColor(doc, COLORS.dark);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text("→ Future strategy:", margin + 8, strategyY);
        strategyLines.slice(0, 2).forEach((line, i) => {
          doc.text(line, i === 0 ? margin + 40 : margin + 8, strategyY + (i * 5));
        });
        
        y += cardHeight + 6;
      });

      // Hidden Edge
      if (strengthsToLeverage?.hiddenEdge && y < pageHeight - 50) {
        y += 4;
        const edgeLines = wrapText(doc, strengthsToLeverage.hiddenEdge, contentWidth - 16);
        const edgeHeight = Math.max(edgeLines.length * 5 + 18, 30);
        
        setFillColor(doc, COLORS.primary);
        roundedRect(doc, margin, y, contentWidth, edgeHeight, 3, 'F');
        setColor(doc, COLORS.white);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("YOUR HIDDEN EDGE", margin + 8, y + 10);
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        edgeLines.slice(0, 3).forEach((line, i) => {
          doc.text(line, margin + 8, y + 18 + (i * 5));
        });
      }

      // Footer
      setColor(doc, COLORS.muted);
      doc.setFontSize(7);
      doc.text("Personal Improvement Blueprint", margin, pageHeight - 10);
      doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
    }

    // ===== PAGE 3: IMPROVEMENTS =====
    if (numImprovements > 0) {
      doc.addPage();
      currentPage++;
      
      // Page header
      setFillColor(doc, COLORS.coaching);
      doc.rect(0, 0, pageWidth, 8, 'F');
      
      y = 18;
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

      // Improvement coaching cards - dynamic based on data
      const maxImprovements = dataDepth === 'minimal' ? 2 : 4;
      (improvementCoaching || []).slice(0, maxImprovements).forEach((item, idx) => {
        // Check if we need a new page
        if (y > pageHeight - 100) {
          doc.addPage();
          currentPage++;
          setFillColor(doc, COLORS.coaching);
          doc.rect(0, 0, pageWidth, 8, 'F');
          y = 18;
        }

        const obsLines = wrapText(doc, `Observed: ${item.whatWasObserved || ''}`, contentWidth - 16);
        const whyLines = wrapText(doc, item.whyThisMatters || "", contentWidth - 16);
        const stratLines = wrapText(doc, `Strategy: ${item.improvementStrategy?.framework || ''}`, contentWidth - 16);
        const habitLines = wrapText(doc, `Daily habit: ${item.improvementStrategy?.dailyHabit || ''}`, contentWidth - 16);
        
        const cardHeight = 25 + 
          (Math.min(obsLines.length, 2) * 4) + 
          (Math.min(whyLines.length, 2) * 4) + 
          (Math.min(stratLines.length, 2) * 4) + 
          (Math.min(habitLines.length, 2) * 4) + 20;
        
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
        
        let cardY = y + 22;
        
        // What was observed
        setColor(doc, COLORS.body);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        obsLines.slice(0, 2).forEach((line, i) => {
          doc.text(line, margin + 8, cardY + (i * 4));
        });
        cardY += Math.min(obsLines.length, 2) * 4 + 4;
        
        // Why this matters
        setColor(doc, COLORS.muted);
        doc.setFont("helvetica", "italic");
        whyLines.slice(0, 2).forEach((line, i) => {
          doc.text(line, margin + 8, cardY + (i * 4));
        });
        cardY += Math.min(whyLines.length, 2) * 4 + 6;
        
        // Strategy
        setColor(doc, COLORS.success);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        stratLines.slice(0, 2).forEach((line, i) => {
          doc.text(line, margin + 8, cardY + (i * 4));
        });
        cardY += Math.min(stratLines.length, 2) * 4 + 4;
        
        // Daily habit
        setColor(doc, COLORS.body);
        doc.setFont("helvetica", "normal");
        habitLines.slice(0, 2).forEach((line, i) => {
          doc.text(line, margin + 8, cardY + (i * 4));
        });
        cardY += Math.min(habitLines.length, 2) * 4 + 4;
        
        // Resource
        if (item.resource?.name) {
          setColor(doc, COLORS.primary);
          doc.setFontSize(7);
          const resourceText = `📚 Resource: ${item.resource.name} (${item.resource.url || ''})`;
          const resourceLines = wrapText(doc, resourceText, contentWidth - 16);
          doc.text(resourceLines[0] || "", margin + 8, cardY);
        }
        
        y += cardHeight + 8;
      });

      // Footer
      setColor(doc, COLORS.muted);
      doc.setFontSize(7);
      doc.text("Personal Improvement Blueprint", margin, pageHeight - 10);
      doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
    }

    // ===== PAGE 4: 30-DAY PLAN (only for moderate/comprehensive data) =====
    if (hasFullPlan && thirtyDayPlan) {
      doc.addPage();
      currentPage++;
      
      // Page header
      setFillColor(doc, COLORS.primary);
      doc.rect(0, 0, pageWidth, 8, 'F');
      
      y = 18;
      setColor(doc, COLORS.primary);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Your 30-Day Improvement Plan", margin, y);
      y += 10;

      // Week cards - 2x2 grid
      const weekWidth = (contentWidth - 8) / 2;
      const weekHeight = 70;
      const weeks = [
        { ...thirtyDayPlan.week1, label: "Week 1" },
        { ...thirtyDayPlan.week2, label: "Week 2" },
        { ...thirtyDayPlan.week3, label: "Week 3" },
        { ...thirtyDayPlan.week4, label: "Week 4" },
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
        
        // Focus
        setColor(doc, COLORS.dark);
        doc.setFontSize(9);
        const focusLines = wrapText(doc, week.focus || "Focus area", weekWidth - 55);
        doc.text(focusLines[0] || "", x + 50, wy + 11);
        
        // Daily actions
        setColor(doc, COLORS.body);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        let actionY = wy + 20;
        (week.dailyActions || []).slice(0, 3).forEach((action) => {
          const actionLines = wrapText(doc, `• ${action || ""}`, weekWidth - 16);
          actionLines.slice(0, 2).forEach((line, i) => {
            doc.text(line, x + 8, actionY + (i * 5));
          });
          actionY += Math.min(actionLines.length, 2) * 5 + 2;
        });
        
        // Success metric
        setColor(doc, COLORS.success);
        doc.setFontSize(7);
        const metricLines = wrapText(doc, `✓ ${week.successMetric || ""}`, weekWidth - 16);
        metricLines.slice(0, 1).forEach((line) => {
          doc.text(line, x + 8, wy + weekHeight - 8);
        });
      });

      y += (weekHeight * 2) + 18;

      // Footer
      setColor(doc, COLORS.muted);
      doc.setFontSize(7);
      doc.text("Personal Improvement Blueprint", margin, pageHeight - 10);
      doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
    }

    // ===== FINAL PAGE: CLOSING MESSAGE =====
    doc.addPage();
    currentPage++;
    
    // Page header
    setFillColor(doc, COLORS.primary);
    doc.rect(0, 0, pageWidth, 8, 'F');
    
    y = 22;

    // Closing message box
    const noteLines = wrapText(doc, closingMessage?.personalNote || "Keep pushing forward!", contentWidth - 16);
    const closingHeight = Math.max(noteLines.length * 5 + 35, 60);
    
    setFillColor(doc, COLORS.primary);
    roundedRect(doc, margin, y, contentWidth, closingHeight, 4, 'F');
    
    setColor(doc, COLORS.white);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("A Note From Your Career Coach", margin + 8, y + 14);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    noteLines.slice(0, 5).forEach((line, i) => {
      doc.text(line, margin + 8, y + 26 + (i * 5));
    });
    
    // Final thought
    if (closingMessage?.finalThought) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      const finalLines = wrapText(doc, closingMessage.finalThought, contentWidth - 16);
      finalLines.slice(0, 2).forEach((line, i) => {
        doc.text(line, margin + 8, y + closingHeight - 12 + (i * 5));
      });
    }

    y += closingHeight + 15;

    // Immediate Actions checklist
    if (closingMessage?.immediateActions?.length > 0) {
      setColor(doc, COLORS.dark);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("✅ Do This Today", margin, y);
      y += 10;
      
      (closingMessage.immediateActions || []).slice(0, 6).forEach((action) => {
        setDrawColor(doc, COLORS.primary);
        doc.setLineWidth(0.5);
        doc.rect(margin, y, 4, 4, 'S');
        
        setColor(doc, COLORS.body);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        const actionLines = wrapText(doc, action || "", contentWidth - 15);
        actionLines.slice(0, 2).forEach((line, i) => {
          doc.text(line, margin + 10, y + 4 + (i * 5));
        });
        y += Math.min(actionLines.length, 2) * 5 + 6;
      });
    }

    // Footer with document ID
    setColor(doc, COLORS.muted);
    doc.setFontSize(7);
    doc.text("Personal Improvement Blueprint", margin, pageHeight - 10);
    doc.text(`Document ID: ${metadata?.applicationId?.slice(0, 8) || 'N/A'}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: 'right' });

    // Generate PDF as base64
    const pdfBase64 = doc.output('datauristring');
    
    console.log('PDF generated successfully, pages:', currentPage);

    return new Response(
      JSON.stringify({ 
        pdf: pdfBase64,
        fileName: `Improvement_Blueprint_${(metadata?.candidateName || 'Candidate').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error generating PDF:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Failed to generate PDF' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
