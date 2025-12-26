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

// Sanitize text to ASCII-safe characters - removes Unicode that jsPDF can't render
function sanitizeText(text: string): string {
  if (!text) return '';
  return text
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
    .replace(/\u00A0/g, ' ') // non-breaking space
    .replace(/[^\x00-\x7F]/g, ''); // Remove any remaining non-ASCII
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

function renderText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 4.5): number {
  if (!text) return 0;
  const lines = wrapText(doc, text, maxWidth);
  lines.forEach((line, i) => doc.text(line, x, y + i * lineHeight));
  return lines.length * lineHeight;
}

function truncate(doc: jsPDF, text: string, maxWidth: number): string {
  const sanitized = sanitizeText(text);
  if (!sanitized || doc.getTextWidth(sanitized) <= maxWidth) return sanitized || '';
  let t = sanitized;
  while (doc.getTextWidth(t + '...') > maxWidth && t.length > 1) t = t.slice(0, -1);
  return t + '...';
}

function checkPageBreak(doc: jsPDF, y: number, needed: number, pageH: number, margin: number): number {
  if (y + needed > pageH - 20) { doc.addPage(); return margin; }
  return y;
}

function drawSectionTitle(doc: jsPDF, title: string, y: number, color: any): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(color.r, color.g, color.b);
  doc.text(sanitizeText(title), 15, y);
  doc.setDrawColor(color.r, color.g, color.b);
  doc.setLineWidth(0.5);
  doc.line(15, y + 2, 195, y + 2);
  return y + 10;
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
    
    console.log('[PDF] Generating comprehensive blueprint...');
    
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

    // === HEADER ===
    doc.setFillColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Your Improvement Blueprint', margin, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(sanitizeText(`${name} - ${job}`), margin, 21);
    doc.setFontSize(8);
    doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }), pageW - margin, 21, { align: 'right' });
    y = 36;

    // === WHY YOU WEREN'T SELECTED ===
    const reasonsContent = topReasons.length > 0 ? topReasons : (reflection.whatHappened ? [reflection.whatHappened] : []);
    const reasonsHeight = Math.max(30, 12 + reasonsContent.length * 8);
    
    doc.setFillColor(COLORS.errorBg.r, COLORS.errorBg.g, COLORS.errorBg.b);
    doc.setDrawColor(COLORS.error.r, COLORS.error.g, COLORS.error.b);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y, contentW, reasonsHeight, 2, 2, 'FD');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(COLORS.error.r, COLORS.error.g, COLORS.error.b);
    doc.text("WHY YOU WEREN'T SELECTED", margin + 5, y + 7);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
    
    let ry = y + 14;
    reasonsContent.slice(0, 4).forEach((reason: string, i: number) => {
      const reasonLines = wrapText(doc, reason, contentW - 14);
      reasonLines.slice(0, 2).forEach((line, li) => {
        doc.text(li === 0 ? `${i + 1}. ${line}` : `   ${line}`, margin + 5, ry);
        ry += 5;
      });
    });
    
    y += reasonsHeight + 6;

    // Score and Key Insight
    const scoreColor = score >= 70 ? COLORS.strength : score >= 50 ? COLORS.resource : COLORS.improvement;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
    doc.text(`Score: `, margin, y + 5);
    doc.setTextColor(scoreColor.r, scoreColor.g, scoreColor.b);
    doc.text(`${score}/100`, margin + 14, y + 5);
    
    if (reflection.keyInsight) {
      doc.setTextColor(COLORS.body.r, COLORS.body.g, COLORS.body.b);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      const insightLines = wrapText(doc, `Key Insight: ${reflection.keyInsight}`, contentW - 45);
      insightLines.slice(0, 2).forEach((line, i) => {
        doc.text(line, margin + 35, y + 5 + i * 4);
      });
    }
    y += 14;

    // === PHASE-BY-PHASE BREAKDOWN (EXPANDED) ===
    if (phases.length > 0) {
      y = checkPageBreak(doc, y, 20, pageH, margin);
      y = drawSectionTitle(doc, 'Phase-by-Phase Performance', y, COLORS.improvement);
      
      phases.forEach((phase: any) => {
        y = checkPageBreak(doc, y, 35, pageH, margin);
        
        // Phase header with score
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
        const phaseScore = phase.score ?? phase.result ?? '';
        doc.text(sanitizeText(`${phase.phase}${phaseScore ? ` (${phaseScore})` : ''}`), margin, y);
        y += 5;
        
        // Issues - show ALL, not just 2
        if (phase.issues?.length) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(COLORS.improvement.r, COLORS.improvement.g, COLORS.improvement.b);
          
          phase.issues.forEach((issue: string) => {
            y = checkPageBreak(doc, y, 8, pageH, margin);
            const issueLines = wrapText(doc, `* ${issue}`, contentW - 8);
            issueLines.forEach((line, i) => {
              doc.text(line, margin + 3, y);
              y += 4.5;
            });
          });
        }
        
        // Evidence - show up to 3 quotes
        if (phase.evidence?.length) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(7);
          doc.setTextColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b);
          
          phase.evidence.slice(0, 3).forEach((ev: string) => {
            y = checkPageBreak(doc, y, 6, pageH, margin);
            const evLines = wrapText(doc, `"${ev}"`, contentW - 12);
            evLines.slice(0, 2).forEach((line) => {
              doc.text(line, margin + 5, y);
              y += 4;
            });
          });
        }
        
        // Fix recommendation - full text
        if (phase.fix) {
          y = checkPageBreak(doc, y, 8, pageH, margin);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(COLORS.strength.r, COLORS.strength.g, COLORS.strength.b);
          const fixLines = wrapText(doc, `-> Fix: ${phase.fix}`, contentW - 10);
          fixLines.forEach((line) => {
            doc.text(line, margin + 3, y);
            y += 4.5;
          });
        }
        
        y += 4;
      });
    }

    // === QUICK WINS ===
    if (quickWins.length > 0) {
      y = checkPageBreak(doc, y, 15 + quickWins.length * 6, pageH, margin);
      y = drawSectionTitle(doc, 'Quick Wins This Week', y, COLORS.strength);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
      
      quickWins.slice(0, 5).forEach((win: string, i: number) => {
        y = checkPageBreak(doc, y, 8, pageH, margin);
        const winLines = wrapText(doc, `${i + 1}. ${win}`, contentW - 10);
        winLines.forEach((line) => {
          doc.text(line, margin, y);
          y += 4.5;
        });
      });
      y += 4;
    }

    // === STRENGTHS ===
    if (strengths.length > 0) {
      y = checkPageBreak(doc, y, 15 + strengths.length * 12, pageH, margin);
      y = drawSectionTitle(doc, 'Your Strengths', y, COLORS.strength);
      
      strengths.slice(0, 4).forEach((s: any) => {
        y = checkPageBreak(doc, y, 12, pageH, margin);
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(COLORS.strength.r, COLORS.strength.g, COLORS.strength.b);
        doc.text(sanitizeText(`[+] ${s.strength || 'Strength'}`), margin, y);
        y += 5;
        
        if (s.evidence) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(COLORS.body.r, COLORS.body.g, COLORS.body.b);
          const evLines = wrapText(doc, s.evidence, contentW - 8);
          evLines.slice(0, 2).forEach((line) => {
            doc.text(line, margin + 4, y);
            y += 4.5;
          });
        }
        y += 2;
      });
      y += 4;
    }

    // === IMPROVEMENT AREAS (EXPANDED) ===
    if (improvements.length > 0) {
      y = checkPageBreak(doc, y, 20, pageH, margin);
      y = drawSectionTitle(doc, 'Areas to Improve', y, COLORS.improvement);
      
      improvements.slice(0, 5).forEach((imp: any) => {
        y = checkPageBreak(doc, y, 25, pageH, margin);
        
        // Area name
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(COLORS.improvement.r, COLORS.improvement.g, COLORS.improvement.b);
        doc.text(sanitizeText(`* ${imp.area || 'Area'}`), margin, y);
        y += 5;
        
        // What was observed - full text wrap
        if (imp.whatWasObserved) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(COLORS.body.r, COLORS.body.g, COLORS.body.b);
          const obsLines = wrapText(doc, imp.whatWasObserved, contentW - 8);
          obsLines.forEach((line) => {
            y = checkPageBreak(doc, y, 5, pageH, margin);
            doc.text(line, margin + 4, y);
            y += 4.5;
          });
        }
        
        // Framework with explanation
        if (imp.improvementStrategy?.framework) {
          y = checkPageBreak(doc, y, 8, pageH, margin);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(COLORS.coaching.r, COLORS.coaching.g, COLORS.coaching.b);
          
          const frameworkText = imp.improvementStrategy.explanation 
            ? `-> ${imp.improvementStrategy.framework}: ${imp.improvementStrategy.explanation}`
            : `-> ${imp.improvementStrategy.framework}`;
          
          const fwLines = wrapText(doc, frameworkText, contentW - 10);
          fwLines.forEach((line) => {
            y = checkPageBreak(doc, y, 5, pageH, margin);
            doc.text(line, margin + 4, y);
            y += 4.5;
          });
        }
        
        y += 4;
      });
    }

    // === 30-DAY PLAN (FULLY EXPANDED) ===
    const weeks = ['week1', 'week2', 'week3', 'week4'].filter(w => plan[w]);
    if (weeks.length > 0) {
      y = checkPageBreak(doc, y, 30, pageH, margin);
      y = drawSectionTitle(doc, '30-Day Plan', y, COLORS.coaching);
      
      weeks.forEach((wk, i) => {
        const w = plan[wk];
        y = checkPageBreak(doc, y, 25, pageH, margin);
        
        // Week header with focus
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(COLORS.coaching.r, COLORS.coaching.g, COLORS.coaching.b);
        doc.text(`Week ${i + 1}: ${sanitizeText(w.focus || '')}`, margin, y);
        y += 6;
        
        // Daily actions - show ALL, fully wrapped
        if (w.dailyActions?.length) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
          
          w.dailyActions.forEach((action: string, ai: number) => {
            y = checkPageBreak(doc, y, 8, pageH, margin);
            const actionLines = wrapText(doc, `${ai + 1}. ${action}`, contentW - 12);
            actionLines.forEach((line) => {
              doc.text(line, margin + 5, y);
              y += 4.5;
            });
          });
        }
        
        y += 4;
      });
    }

    // === RESOURCES ===
    const resources = improvements.filter((i: any) => i.resource?.name).slice(0, 5);
    if (resources.length > 0) {
      y = checkPageBreak(doc, y, 12 + resources.length * 6, pageH, margin);
      y = drawSectionTitle(doc, 'Resources', y, COLORS.resource);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      
      resources.forEach((imp: any) => {
        y = checkPageBreak(doc, y, 6, pageH, margin);
        doc.setTextColor(COLORS.resource.r, COLORS.resource.g, COLORS.resource.b);
        doc.text(sanitizeText(`* ${imp.resource.name}`), margin, y);
        if (imp.resource.url) {
          doc.setTextColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b);
          doc.text(truncate(doc, imp.resource.url, 100), margin + 50, y);
        }
        y += 5;
      });
      y += 4;
    }

    // === IMMEDIATE ACTIONS ===
    const actions = closing.immediateActions || [];
    if (actions.length > 0) {
      y = checkPageBreak(doc, y, 12 + actions.length * 6, pageH, margin);
      y = drawSectionTitle(doc, 'Do This Today', y, COLORS.strength);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
      
      actions.slice(0, 6).forEach((action: string, i: number) => {
        y = checkPageBreak(doc, y, 8, pageH, margin);
        const actionLines = wrapText(doc, `${i + 1}. ${action}`, contentW - 10);
        actionLines.forEach((line) => {
          doc.text(line, margin, y);
          y += 4.5;
        });
      });
      y += 4;
    }

    // === CLOSING NOTE ===
    if (closing.personalNote) {
      y = checkPageBreak(doc, y, 30, pageH, margin);
      
      const noteLines = wrapText(doc, closing.personalNote, contentW - 12);
      const noteH = noteLines.length * 4.5 + 12;
      
      doc.setFillColor(COLORS.coachingBg.r, COLORS.coachingBg.g, COLORS.coachingBg.b);
      doc.roundedRect(margin, y, contentW, noteH, 2, 2, 'F');
      
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(COLORS.coaching.r, COLORS.coaching.g, COLORS.coaching.b);
      noteLines.forEach((line, i) => {
        doc.text(line, margin + 6, y + 8 + i * 4.5);
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
