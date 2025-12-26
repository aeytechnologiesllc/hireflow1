import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COLORS = {
  primary: { r: 99, g: 102, b: 241 },
  primaryDark: { r: 67, g: 56, b: 202 },
  strength: { r: 20, g: 184, b: 166 },
  strengthBg: { r: 240, g: 253, b: 250 },
  strengthBorder: { r: 153, g: 246, b: 228 },
  improvement: { r: 244, g: 63, b: 94 },
  improvementBg: { r: 255, g: 241, b: 242 },
  improvementBorder: { r: 254, g: 205, b: 211 },
  coaching: { r: 139, g: 92, b: 246 },
  coachingBg: { r: 245, g: 243, b: 255 },
  coachingBorder: { r: 221, g: 214, b: 254 },
  resource: { r: 245, g: 158, b: 11 },
  resourceBg: { r: 255, g: 251, b: 235 },
  resourceBorder: { r: 253, g: 230, b: 138 },
  dark: { r: 30, g: 41, b: 59 },
  body: { r: 71, g: 85, b: 105 },
  muted: { r: 148, g: 163, b: 184 },
  light: { r: 241, g: 245, b: 249 },
  white: { r: 255, g: 255, b: 255 },
};

const SPACING = { page: 20, section: 18, box: 12, text: 5, small: 8 };

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
      if (doc.getTextWidth(word) > maxWidth) {
        let remaining = word;
        while (remaining.length > 0) {
          let chars = remaining.length;
          while (chars > 1 && doc.getTextWidth(remaining.substring(0, chars)) > maxWidth) chars--;
          lines.push(remaining.substring(0, chars));
          remaining = remaining.substring(chars);
        }
        currentLine = '';
      } else {
        currentLine = word;
      }
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function safeText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, maxLines: number = 10, lineHeight: number = 5): number {
  if (!text) return 0;
  const lines = wrapText(doc, text, maxWidth).slice(0, maxLines);
  if (wrapText(doc, text, maxWidth).length > maxLines && lines.length > 0) {
    let last = lines[lines.length - 1];
    while (doc.getTextWidth(last + '...') > maxWidth && last.length > 1) last = last.slice(0, -1);
    lines[lines.length - 1] = last + '...';
  }
  lines.forEach((line, i) => doc.text(line, x, y + i * lineHeight));
  return lines.length * lineHeight;
}

function truncateLine(doc: jsPDF, text: string, maxWidth: number): string {
  if (!text || doc.getTextWidth(text) <= maxWidth) return text || '';
  let t = text;
  while (doc.getTextWidth(t + '...') > maxWidth && t.length > 1) t = t.slice(0, -1);
  return t + '...';
}

function drawRoundedRect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, fill: any, border?: any) {
  doc.setFillColor(fill.r, fill.g, fill.b);
  if (border) { doc.setDrawColor(border.r, border.g, border.b); doc.setLineWidth(0.5); doc.roundedRect(x, y, w, h, r, r, 'FD'); }
  else doc.roundedRect(x, y, w, h, r, r, 'F');
}

function checkPageBreak(doc: jsPDF, y: number, needed: number, pageH: number): number {
  if (y + needed > pageH - 35) { doc.addPage(); return SPACING.page; }
  return y;
}

function drawSectionHeader(doc: jsPDF, title: string, y: number, color: any): number {
  doc.setDrawColor(color.r, color.g, color.b); doc.setLineWidth(2); doc.line(SPACING.page, y, SPACING.page + 25, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(color.r, color.g, color.b);
  doc.text(title.toUpperCase(), SPACING.page + 30, y + 1);
  return y + 12;
}

function drawFooter(doc: jsPDF, page: number, total: number, docId: string) {
  const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight(), fy = h - 12;
  doc.setDrawColor(COLORS.light.r, COLORS.light.g, COLORS.light.b); doc.setLineWidth(0.5); doc.line(SPACING.page, fy - 5, w - SPACING.page, fy - 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b);
  doc.text(`ID: ${docId}`, SPACING.page, fy); doc.text(`Page ${page} of ${total}`, w - SPACING.page, fy, { align: 'right' });
  doc.text('HireFlow Improvement Blueprint', w / 2, fy, { align: 'center' });
}

// Map new ImprovementBlueprintData schema to PDF-expected flat structure
function mapBlueprintData(raw: any): any {
  // If blueprintData wrapper exists, extract from it
  const bp = raw.blueprintData || raw;
  
  console.log('[PDF] Mapping blueprint data...');
  console.log('[PDF] Has blueprintData wrapper:', !!raw.blueprintData);
  console.log('[PDF] Raw keys:', Object.keys(raw));
  if (bp) console.log('[PDF] Blueprint keys:', Object.keys(bp));

  // Extract metadata
  const meta = bp.metadata || {};
  const candidateName = meta.candidateName || bp.candidateName || 'Candidate';
  const jobTitle = meta.jobTitle || bp.jobTitle || 'Position';
  const overallScore = meta.overallScore ?? bp.overallScore ?? 0;
  const completedPhases = meta.completedPhases || [];
  const dataDepthMessage = meta.dataDepthMessage || '';

  console.log('[PDF] Mapped: candidateName =', candidateName);
  console.log('[PDF] Mapped: jobTitle =', jobTitle);
  console.log('[PDF] Mapped: overallScore =', overallScore);

  // Extract key insight from honestReflection
  const keyInsight = bp.honestReflection?.keyInsight || bp.keyInsight || '';
  const encouragement = bp.honestReflection?.scoreContext || bp.encouragement || '';

  // Map strengths from strengthsToLeverage.identified
  let strengths: any[] = [];
  if (bp.strengthsToLeverage?.identified?.length) {
    strengths = bp.strengthsToLeverage.identified.slice(0, 3).map((s: any) => ({
      title: s.strength || 'Strength',
      description: s.evidence ? `${s.evidence} ${s.futureStrategy || ''}`.trim() : s.futureStrategy || ''
    }));
  } else if (bp.strengths?.length) {
    strengths = bp.strengths.slice(0, 3);
  }
  console.log('[PDF] Mapped strengths count:', strengths.length);

  // Map improvements from improvementCoaching
  let improvements: any[] = [];
  if (bp.improvementCoaching?.length) {
    improvements = bp.improvementCoaching.slice(0, 3).map((imp: any) => ({
      area: imp.area || 'Area',
      suggestion: imp.whyThisMatters 
        ? `${imp.whyThisMatters} ${imp.improvementStrategy?.framework || ''}`.trim()
        : imp.improvementStrategy?.framework || imp.whatWasObserved || ''
    }));
  } else if (bp.improvements?.length) {
    improvements = bp.improvements.slice(0, 3);
  }
  console.log('[PDF] Mapped improvements count:', improvements.length);

  // Map weekly plan from thirtyDayPlan
  let weeklyPlan: any[] = [];
  if (bp.thirtyDayPlan) {
    const plan = bp.thirtyDayPlan;
    const weeks = ['week1', 'week2', 'week3', 'week4'];
    weeklyPlan = weeks
      .filter(w => plan[w])
      .slice(0, 4)
      .map((w, i) => ({
        theme: `Week ${i + 1}`,
        focus: plan[w].focus || '',
        activities: plan[w].dailyActions || []
      }));
  } else if (bp.weeklyPlan?.length) {
    weeklyPlan = bp.weeklyPlan.slice(0, 4);
  }
  console.log('[PDF] Mapped weeklyPlan count:', weeklyPlan.length);

  // Map resources from improvementCoaching[].resource
  let resources: any[] = [];
  if (bp.improvementCoaching?.length) {
    resources = bp.improvementCoaching
      .filter((imp: any) => imp.resource?.name)
      .slice(0, 3)
      .map((imp: any) => ({
        name: imp.resource.name,
        url: imp.resource.url || '',
        description: imp.resource.whyHelpful || ''
      }));
  } else if (bp.resources?.length) {
    resources = bp.resources.slice(0, 3);
  }
  console.log('[PDF] Mapped resources count:', resources.length);

  // Map immediate actions from closingMessage
  let immediateActions: string[] = [];
  if (bp.closingMessage?.immediateActions?.length) {
    immediateActions = bp.closingMessage.immediateActions.slice(0, 5);
  } else if (bp.immediateActions?.length) {
    immediateActions = bp.immediateActions.slice(0, 5);
  }
  console.log('[PDF] Mapped immediateActions count:', immediateActions.length);

  // Map closing message
  const closingMessage = bp.closingMessage?.personalNote || bp.closingMessage?.finalThought || bp.closingMessage || '';

  return {
    candidateName,
    jobTitle,
    overallScore,
    keyInsight,
    encouragement,
    strengths,
    improvements,
    weeklyPlan,
    resources,
    immediateActions,
    closingMessage: typeof closingMessage === 'string' ? closingMessage : '',
    metadata: {
      completedPhases,
      dataDepthMessage
    }
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const rawData = await req.json();
    console.log('[PDF] Received raw data keys:', Object.keys(rawData));
    
    // Map the data to expected structure
    const data = mapBlueprintData(rawData);
    console.log('[PDF] Final mapped data - candidateName:', data.candidateName, 'score:', data.overallScore);
    
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
    const margin = SPACING.page, contentW = pageW - margin * 2, boxP = SPACING.box;
    const docId = `BLP-${Date.now().toString(36).toUpperCase()}`;
    let y = margin;

    // Header
    doc.setFillColor(COLORS.primary.r, COLORS.primary.g, COLORS.primary.b); doc.rect(0, 0, pageW, 45, 'F');
    doc.setFillColor(COLORS.primaryDark.r, COLORS.primaryDark.g, COLORS.primaryDark.b); doc.rect(0, 42, pageW, 3, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
    doc.text('Your Improvement Blueprint', margin, 22);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.text('Personalized Career Development Guide', margin, 32);
    doc.setFontSize(9); doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), pageW - margin, 32, { align: 'right' });
    y = 60;

    // Candidate card
    drawRoundedRect(doc, margin, y, contentW, 28, 3, COLORS.light, COLORS.muted);
    doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text(truncateLine(doc, data.candidateName, contentW - 20), margin + boxP, y + 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(COLORS.body.r, COLORS.body.g, COLORS.body.b);
    doc.text(truncateLine(doc, `Applied for: ${data.jobTitle}`, contentW - 20), margin + boxP, y + 21);
    y += 38;

    // Data sources
    if (data.metadata?.completedPhases?.length || data.metadata?.dataDepthMessage) {
      y = drawSectionHeader(doc, 'Data Sources Analyzed', y, COLORS.primary);
      drawRoundedRect(doc, margin, y, contentW, 24, 3, COLORS.coachingBg, COLORS.coachingBorder);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(COLORS.body.r, COLORS.body.g, COLORS.body.b);
      doc.text(truncateLine(doc, (data.metadata?.completedPhases || ['Application Form']).join(' - '), contentW - boxP * 2), margin + boxP, y + 9);
      if (data.metadata?.dataDepthMessage) { doc.setFontSize(8); doc.setTextColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b); doc.text(truncateLine(doc, data.metadata.dataDepthMessage, contentW - boxP * 2), margin + boxP, y + 17); }
      y += 32;
    }

    // Score
    if (data.overallScore !== undefined) {
      y = drawSectionHeader(doc, 'Your Performance Score', y, COLORS.primary);
      const cx = margin + 25, cy = y + 20, score = data.overallScore || 0;
      doc.setFillColor(COLORS.light.r, COLORS.light.g, COLORS.light.b); doc.circle(cx, cy, 18, 'F');
      const sc = score >= 70 ? COLORS.strength : score >= 50 ? COLORS.resource : COLORS.improvement;
      doc.setFillColor(sc.r, sc.g, sc.b); doc.circle(cx, cy, 15, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(`${score}`, cx, cy + 2, { align: 'center' });
      doc.setFontSize(7); doc.text('/100', cx, cy + 8, { align: 'center' });
      if (data.keyInsight) {
        const ix = margin + 55, iw = contentW - 60;
        drawRoundedRect(doc, ix, y, iw, 40, 3, COLORS.coachingBg, COLORS.coachingBorder);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(COLORS.coaching.r, COLORS.coaching.g, COLORS.coaching.b);
        doc.text('KEY INSIGHT', ix + boxP, y + 10);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(COLORS.body.r, COLORS.body.g, COLORS.body.b);
        safeText(doc, data.keyInsight, ix + boxP, y + 18, iw - boxP * 2, 4, 5);
      }
      y += 50;
    }

    if (data.encouragement) {
      drawRoundedRect(doc, margin, y, contentW, 22, 3, COLORS.strengthBg, COLORS.strengthBorder);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(COLORS.strength.r, COLORS.strength.g, COLORS.strength.b);
      safeText(doc, data.encouragement, margin + boxP, y + 10, contentW - boxP * 2, 2, 5);
      y += 30;
    }

    // Strengths
    if (data.strengths?.length) {
      doc.addPage(); y = margin;
      y = drawSectionHeader(doc, 'Your Strengths', y, COLORS.strength); y += 5;
      for (let i = 0; i < Math.min(data.strengths.length, 4); i++) {
        y = checkPageBreak(doc, y, 50, pageH);
        const s = data.strengths[i];
        drawRoundedRect(doc, margin, y, contentW, 42, 4, COLORS.strengthBg, COLORS.strengthBorder);
        doc.setFillColor(COLORS.strength.r, COLORS.strength.g, COLORS.strength.b); doc.circle(margin + 12, y + 12, 6, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(`${i + 1}`, margin + 12, y + 14, { align: 'center' });
        doc.setTextColor(COLORS.strength.r, COLORS.strength.g, COLORS.strength.b); doc.setFontSize(11);
        doc.text(truncateLine(doc, s.title || `Strength ${i + 1}`, contentW - 35), margin + 24, y + 13);
        doc.setTextColor(COLORS.body.r, COLORS.body.g, COLORS.body.b); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        safeText(doc, s.description || '', margin + 24, y + 22, contentW - 35, 3, 5);
        y += 50;
      }
    }

    // Improvements
    if (data.improvements?.length) {
      y = checkPageBreak(doc, y, 80, pageH);
      y = drawSectionHeader(doc, 'Areas for Growth', y, COLORS.improvement); y += 5;
      for (let i = 0; i < Math.min(data.improvements.length, 4); i++) {
        y = checkPageBreak(doc, y, 55, pageH);
        const imp = data.improvements[i];
        drawRoundedRect(doc, margin, y, contentW, 48, 4, COLORS.improvementBg, COLORS.improvementBorder);
        doc.setFillColor(COLORS.improvement.r, COLORS.improvement.g, COLORS.improvement.b); doc.circle(margin + 12, y + 12, 6, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(`${i + 1}`, margin + 12, y + 14, { align: 'center' });
        doc.setTextColor(COLORS.improvement.r, COLORS.improvement.g, COLORS.improvement.b); doc.setFontSize(11);
        doc.text(truncateLine(doc, imp.area || `Area ${i + 1}`, contentW - 35), margin + 24, y + 13);
        doc.setTextColor(COLORS.body.r, COLORS.body.g, COLORS.body.b); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        safeText(doc, imp.suggestion || '', margin + 24, y + 22, contentW - 35, 4, 5);
        y += 56;
      }
    }

    // Weekly plan
    if (data.weeklyPlan?.length) {
      doc.addPage(); y = margin;
      y = drawSectionHeader(doc, '30-Day Development Plan', y, COLORS.coaching); y += 5;
      for (let i = 0; i < Math.min(data.weeklyPlan.length, 4); i++) {
        y = checkPageBreak(doc, y, 60, pageH);
        const w = data.weeklyPlan[i];
        doc.setFillColor(COLORS.coaching.r, COLORS.coaching.g, COLORS.coaching.b); doc.roundedRect(margin, y, 50, 8, 2, 2, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(`WEEK ${i + 1}`, margin + 5, y + 6);
        doc.setTextColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b); doc.setFontSize(10);
        doc.text(truncateLine(doc, w.theme || '', contentW - 60), margin + 55, y + 6);
        y += 14;
        drawRoundedRect(doc, margin, y, contentW, 35, 3, COLORS.coachingBg, COLORS.coachingBorder);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(COLORS.coaching.r, COLORS.coaching.g, COLORS.coaching.b);
        doc.text('Focus:', margin + boxP, y + 10);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(COLORS.body.r, COLORS.body.g, COLORS.body.b);
        doc.text(truncateLine(doc, w.focus || '', contentW - 35), margin + 25, y + 10);
        if (w.activities?.length) {
          doc.setFont('helvetica', 'bold'); doc.setTextColor(COLORS.coaching.r, COLORS.coaching.g, COLORS.coaching.b);
          doc.text('Activities:', margin + boxP, y + 20);
          doc.setFont('helvetica', 'normal'); doc.setTextColor(COLORS.body.r, COLORS.body.g, COLORS.body.b);
          safeText(doc, w.activities.slice(0, 3).join('; '), margin + 30, y + 20, contentW - 42, 2, 5);
        }
        y += 53;
      }
    }

    // Resources
    if (data.resources?.length) {
      y = checkPageBreak(doc, y, 80, pageH);
      y = drawSectionHeader(doc, 'Recommended Resources', y, COLORS.resource); y += 5;
      for (let i = 0; i < Math.min(data.resources.length, 4); i++) {
        y = checkPageBreak(doc, y, 35, pageH);
        const r = data.resources[i];
        drawRoundedRect(doc, margin, y, contentW, 28, 3, COLORS.resourceBg, COLORS.resourceBorder);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(COLORS.resource.r, COLORS.resource.g, COLORS.resource.b);
        doc.text(truncateLine(doc, r.name || 'Resource', contentW - 25), margin + boxP, y + 10);
        if (r.url) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b); doc.text(truncateLine(doc, r.url, contentW - 25), margin + boxP, y + 18); }
        if (r.description) { doc.setFontSize(8); doc.setTextColor(COLORS.body.r, COLORS.body.g, COLORS.body.b); doc.text(truncateLine(doc, r.description, contentW - 25), margin + boxP, y + 24); }
        y += 36;
      }
    }

    // Actions
    if (data.immediateActions?.length) {
      y = checkPageBreak(doc, y, 70, pageH);
      y = drawSectionHeader(doc, 'Immediate Actions', y, COLORS.strength); y += 5;
      drawRoundedRect(doc, margin, y, contentW, 50, 4, COLORS.strengthBg, COLORS.strengthBorder);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(COLORS.strength.r, COLORS.strength.g, COLORS.strength.b);
      doc.text('DO THIS TODAY', margin + boxP, y + 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(COLORS.body.r, COLORS.body.g, COLORS.body.b);
      let ay = y + 22;
      for (let i = 0; i < Math.min(data.immediateActions.length, 3); i++) {
        doc.text(truncateLine(doc, `${i + 1}. ${data.immediateActions[i]}`, contentW - 25), margin + boxP, ay); ay += 8;
      }
      y += 58;
    }

    // Closing
    if (data.closingMessage) {
      y = checkPageBreak(doc, y, 50, pageH);
      y = drawSectionHeader(doc, 'A Note From Your Career Coach', y, COLORS.coaching); y += 5;
      drawRoundedRect(doc, margin, y, contentW, 40, 4, COLORS.coachingBg, COLORS.coachingBorder);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(COLORS.coaching.r, COLORS.coaching.g, COLORS.coaching.b);
      safeText(doc, data.closingMessage, margin + boxP, y + 12, contentW - boxP * 2, 4, 6);
    }

    // Footers
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) { doc.setPage(p); drawFooter(doc, p, total, docId); }

    const fileName = `Improvement_Blueprint_${data.candidateName.replace(/\s+/g, '_')}.pdf`;
    console.log('[PDF] Generated successfully:', fileName, 'pages:', total);
    
    return new Response(JSON.stringify({ pdf: doc.output('datauristring').split(',')[1], pages: total, fileName }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    console.error('[PDF] Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
