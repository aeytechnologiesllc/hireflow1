import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COLORS = {
  primary: { r: 99, g: 102, b: 241 },
  error: { r: 220, g: 38, b: 38 },
  errorBg: { r: 254, g: 242, b: 242 },
  strength: { r: 20, g: 184, b: 166 },
  strengthBg: { r: 240, g: 253, b: 250 },
  improvement: { r: 244, g: 63, b: 94 },
  improvementBg: { r: 255, g: 241, b: 242 },
  coaching: { r: 139, g: 92, b: 246 },
  coachingBg: { r: 245, g: 243, b: 255 },
  resource: { r: 245, g: 158, b: 11 },
  resourceBg: { r: 255, g: 251, b: 235 },
  dark: { r: 30, g: 41, b: 59 },
  body: { r: 71, g: 85, b: 105 },
  muted: { r: 148, g: 163, b: 184 },
  light: { r: 241, g: 245, b: 249 },
  white: { r: 255, g: 255, b: 255 },
};

function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const words = text.split(' ');
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

function renderText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 4): number {
  if (!text) return 0;
  const lines = wrapText(doc, text, maxWidth);
  lines.forEach((line, i) => doc.text(line, x, y + i * lineHeight));
  return lines.length * lineHeight;
}

function truncate(doc: jsPDF, text: string, maxWidth: number): string {
  if (!text || doc.getTextWidth(text) <= maxWidth) return text || '';
  let t = text;
  while (doc.getTextWidth(t + '...') > maxWidth && t.length > 1) t = t.slice(0, -1);
  return t + '...';
}

function checkPageBreak(doc: jsPDF, y: number, needed: number, pageH: number, margin: number): number {
  if (y + needed > pageH - 20) { doc.addPage(); return margin; }
  return y;
}

function drawSectionTitle(doc: jsPDF, title: string, y: number, color: any): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(color.r, color.g, color.b);
  doc.text(title, 15, y);
  doc.setDrawColor(color.r, color.g, color.b);
  doc.setLineWidth(0.5);
  doc.line(15, y + 2, 195, y + 2);
  return y + 8;
}

function drawFooter(doc: jsPDF, page: number, total: number) {
  const h = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b);
  doc.text(`HireFlow Improvement Blueprint - Page ${page} of ${total}`, 105, h - 8, { align: 'center' });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  
  try {
    const rawData = await req.json();
    const bp = rawData.blueprintData || rawData;
    
    console.log('[PDF] Generating compact blueprint...');
    
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210, pageH = 297, margin = 15, contentW = pageW - margin * 2;
    let y = margin;

    // Extract data
    const meta = bp.metadata || {};
    const name = meta.candidateName || 'Candidate';
    const job = meta.jobTitle || 'Position';
    const score = meta.overallScore ?? 0;
    const phases = bp.phaseBreakdown || [];
    const topReasons = bp.topRejectionReasons || [];
    const quickWins = bp.quickWins || [];
    const reflection = bp.honestReflection || {};
    const strengths = bp.strengthsToLeverage?.identified || [];
    const improvements = bp.improvementCoaching || [];
    const plan = bp.thirtyDayPlan || {};
    const closing = bp.closingMessage || {};

    // === HEADER (compact) ===
    doc.setFillColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
    doc.rect(0, 0, pageW, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Your Improvement Blueprint', margin, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`${name} • ${job}`, margin, 19);
    doc.setFontSize(8);
    doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }), pageW - margin, 19, { align: 'right' });
    y = 32;

    // === WHY YOU WEREN'T SELECTED (prominent, at top) ===
    doc.setFillColor(COLORS.errorBg.r, COLORS.errorBg.g, COLORS.errorBg.b);
    doc.setDrawColor(COLORS.error.r, COLORS.error.g, COLORS.error.b);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y, contentW, topReasons.length > 0 ? 8 + topReasons.length * 5 + 5 : 22, 2, 2, 'FD');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(COLORS.error.r, COLORS.error.g, COLORS.error.b);
    doc.text('WHY YOU WEREN\'T SELECTED', margin + 4, y + 6);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
    
    if (topReasons.length > 0) {
      let ry = y + 12;
      topReasons.slice(0, 3).forEach((reason: string, i: number) => {
        doc.text(`${i + 1}. ${truncate(doc, reason, contentW - 12)}`, margin + 4, ry);
        ry += 5;
      });
      y += 8 + topReasons.length * 5 + 5;
    } else if (reflection.whatHappened) {
      const lines = wrapText(doc, reflection.whatHappened, contentW - 8);
      lines.slice(0, 3).forEach((line, i) => doc.text(line, margin + 4, y + 12 + i * 4));
      y += 12 + Math.min(lines.length, 3) * 4 + 4;
    } else {
      y += 26;
    }

    // Score inline
    const scoreColor = score >= 70 ? COLORS.strength : score >= 50 ? COLORS.resource : COLORS.improvement;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
    doc.text(`Score: `, margin, y + 5);
    doc.setTextColor(scoreColor.r, scoreColor.g, scoreColor.b);
    doc.text(`${score}/100`, margin + 14, y + 5);
    
    if (reflection.keyInsight) {
      doc.setTextColor(COLORS.body.r, COLORS.body.g, COLORS.body.b);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`Key Insight: ${truncate(doc, reflection.keyInsight, contentW - 45)}`, margin + 35, y + 5);
    }
    y += 12;

    // === PHASE-BY-PHASE BREAKDOWN ===
    if (phases.length > 0) {
      y = checkPageBreak(doc, y, 15 + phases.length * 20, pageH, margin);
      y = drawSectionTitle(doc, 'Phase-by-Phase Performance', y, COLORS.improvement);
      
      phases.forEach((phase: any) => {
        y = checkPageBreak(doc, y, 20, pageH, margin);
        
        // Phase header row
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
        const phaseScore = phase.score ?? phase.result ?? '';
        doc.text(`${phase.phase}${phaseScore ? ` (${phaseScore})` : ''}`, margin, y);
        
        // What went wrong
        if (phase.issues?.length) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(COLORS.improvement.r, COLORS.improvement.g, COLORS.improvement.b);
          let iy = y + 4;
          phase.issues.slice(0, 2).forEach((issue: string) => {
            doc.text(`• ${truncate(doc, issue, contentW - 8)}`, margin + 2, iy);
            iy += 3.5;
          });
          y = iy;
        }
        
        // Evidence/quotes
        if (phase.evidence?.length) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(7);
          doc.setTextColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b);
          phase.evidence.slice(0, 1).forEach((ev: string) => {
            doc.text(`"${truncate(doc, ev, contentW - 12)}"`, margin + 4, y);
            y += 3.5;
          });
        }
        
        // Fix this
        if (phase.fix) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(COLORS.strength.r, COLORS.strength.g, COLORS.strength.b);
          doc.text(`→ Fix: ${truncate(doc, phase.fix, contentW - 15)}`, margin + 2, y);
          y += 4;
        }
        
        y += 3;
      });
    }

    // === QUICK WINS ===
    if (quickWins.length > 0) {
      y = checkPageBreak(doc, y, 10 + quickWins.length * 4, pageH, margin);
      y = drawSectionTitle(doc, 'Quick Wins This Week', y, COLORS.strength);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
      
      quickWins.slice(0, 5).forEach((win: string, i: number) => {
        doc.text(`${i + 1}. ${truncate(doc, win, contentW - 10)}`, margin, y);
        y += 4;
      });
      y += 4;
    }

    // === STRENGTHS (compact) ===
    if (strengths.length > 0) {
      y = checkPageBreak(doc, y, 10 + strengths.length * 8, pageH, margin);
      y = drawSectionTitle(doc, 'Your Strengths', y, COLORS.strength);
      
      strengths.slice(0, 3).forEach((s: any) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(COLORS.strength.r, COLORS.strength.g, COLORS.strength.b);
        doc.text(`✓ ${s.strength || 'Strength'}`, margin, y);
        
        if (s.evidence) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(COLORS.body.r, COLORS.body.g, COLORS.body.b);
          doc.text(truncate(doc, s.evidence, contentW - 5), margin + 3, y + 3.5);
          y += 8;
        } else {
          y += 5;
        }
      });
      y += 3;
    }

    // === IMPROVEMENT AREAS (compact) ===
    if (improvements.length > 0) {
      y = checkPageBreak(doc, y, 10 + improvements.length * 12, pageH, margin);
      y = drawSectionTitle(doc, 'Areas to Improve', y, COLORS.improvement);
      
      improvements.slice(0, 3).forEach((imp: any) => {
        y = checkPageBreak(doc, y, 15, pageH, margin);
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(COLORS.improvement.r, COLORS.improvement.g, COLORS.improvement.b);
        doc.text(`• ${imp.area || 'Area'}`, margin, y);
        y += 4;
        
        if (imp.whatWasObserved) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(COLORS.body.r, COLORS.body.g, COLORS.body.b);
          const obsH = renderText(doc, imp.whatWasObserved, margin + 3, y, contentW - 6, 3.5);
          y += Math.min(obsH, 10);
        }
        
        if (imp.improvementStrategy?.framework) {
          doc.setTextColor(COLORS.coaching.r, COLORS.coaching.g, COLORS.coaching.b);
          doc.text(`→ ${truncate(doc, imp.improvementStrategy.framework, contentW - 10)}`, margin + 3, y);
          y += 4;
        }
        
        y += 2;
      });
    }

    // === 30-DAY PLAN (condensed table) ===
    const weeks = ['week1', 'week2', 'week3', 'week4'].filter(w => plan[w]);
    if (weeks.length > 0) {
      y = checkPageBreak(doc, y, 10 + weeks.length * 10, pageH, margin);
      y = drawSectionTitle(doc, '30-Day Plan', y, COLORS.coaching);
      
      weeks.forEach((wk, i) => {
        const w = plan[wk];
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(COLORS.coaching.r, COLORS.coaching.g, COLORS.coaching.b);
        doc.text(`Week ${i + 1}:`, margin, y);
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
        doc.text(truncate(doc, w.focus || '', 60), margin + 15, y);
        
        if (w.dailyActions?.length) {
          doc.setFontSize(6);
          doc.setTextColor(COLORS.body.r, COLORS.body.g, COLORS.body.b);
          const actions = w.dailyActions.slice(0, 2).join(' • ');
          doc.text(truncate(doc, actions, contentW - 80), margin + 78, y);
        }
        y += 5;
      });
      y += 3;
    }

    // === RESOURCES (inline) ===
    const resources = improvements.filter((i: any) => i.resource?.name).slice(0, 3);
    if (resources.length > 0) {
      y = checkPageBreak(doc, y, 8 + resources.length * 4, pageH, margin);
      y = drawSectionTitle(doc, 'Resources', y, COLORS.resource);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      
      resources.forEach((imp: any) => {
        doc.setTextColor(COLORS.resource.r, COLORS.resource.g, COLORS.resource.b);
        doc.text(`• ${imp.resource.name}`, margin, y);
        if (imp.resource.url) {
          doc.setTextColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b);
          doc.text(truncate(doc, imp.resource.url, 80), margin + 45, y);
        }
        y += 4;
      });
      y += 3;
    }

    // === IMMEDIATE ACTIONS ===
    const actions = closing.immediateActions || [];
    if (actions.length > 0) {
      y = checkPageBreak(doc, y, 8 + actions.length * 4, pageH, margin);
      y = drawSectionTitle(doc, 'Do This Today', y, COLORS.strength);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
      
      actions.slice(0, 5).forEach((action: string, i: number) => {
        doc.text(`${i + 1}. ${truncate(doc, action, contentW - 10)}`, margin, y);
        y += 4;
      });
      y += 3;
    }

    // === CLOSING NOTE (compact) ===
    if (closing.personalNote) {
      y = checkPageBreak(doc, y, 20, pageH, margin);
      
      doc.setFillColor(COLORS.coachingBg.r, COLORS.coachingBg.g, COLORS.coachingBg.b);
      const noteLines = wrapText(doc, closing.personalNote, contentW - 8);
      const noteH = Math.min(noteLines.length, 4) * 3.5 + 8;
      doc.roundedRect(margin, y, contentW, noteH, 2, 2, 'F');
      
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(COLORS.coaching.r, COLORS.coaching.g, COLORS.coaching.b);
      noteLines.slice(0, 4).forEach((line, i) => {
        doc.text(line, margin + 4, y + 5 + i * 3.5);
      });
    }

    // Add footers
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      drawFooter(doc, p, total);
    }

    const fileName = `Improvement_Blueprint_${name.replace(/\s+/g, '_')}.pdf`;
    console.log('[PDF] Generated:', fileName, 'pages:', total);
    
    return new Response(
      JSON.stringify({ pdf: doc.output('datauristring').split(',')[1], pages: total, fileName }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    console.error('[PDF] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
