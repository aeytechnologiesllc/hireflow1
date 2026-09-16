import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Paper/Ink, straight from src/index.css :root (Day theme) — a PDF has no
// CSS variables, so these are the same hex values converted to RGB by hand.
// Do not invent new colors here; if the palette changes, update both places.
const COLORS = {
  ground: { r: 0xf0, g: 0xeb, b: 0xdf },      // --ground  #F0EBDF
  surface: { r: 0xfc, g: 0xfa, b: 0xf4 },     // --surface #FCFAF4
  line: { r: 0xd6, g: 0xcd, b: 0xb6 },        // --line    #D6CDB6
  ink: { r: 0x14, g: 0x20, b: 0x1b },         // --ink     #14201B
  ink2: { r: 0x3f, g: 0x4b, b: 0x45 },        // --ink-2   #3F4B45
  ink3: { r: 0x5c, g: 0x65, b: 0x5e },        // --ink-3   #5C655E
  jade: { r: 0x0f, g: 0x6b, b: 0x4f },        // --jade    #0F6B4F
  jadeSoft: { r: 0xdc, g: 0xed, b: 0xe3 },    // --jade-soft #DCEDE3
  brass: { r: 0x8a, g: 0x64, b: 0x20 },       // --brass   #8A6420
  brassLine: { r: 0xc9, g: 0xa4, b: 0x5e },   // --brass-line #C9A45E
  amberBg: { r: 0xf6, g: 0xe7, b: 0xc6 },     // --amber-bg  #F6E7C6
  white: { r: 0xff, g: 0xff, b: 0xff },
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
    .replace(/ /g, ' ') // non-breaking space
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

function setFill(doc: jsPDF, c: { r: number; g: number; b: number }) { doc.setFillColor(c.r, c.g, c.b); }
function setDraw(doc: jsPDF, c: { r: number; g: number; b: number }) { doc.setDrawColor(c.r, c.g, c.b); }
function setText(doc: jsPDF, c: { r: number; g: number; b: number }) { doc.setTextColor(c.r, c.g, c.b); }

function checkPageBreak(doc: jsPDF, y: number, needed: number, pageH: number, margin: number, drawLetterhead: () => void): number {
  if (y + needed > pageH - 18) {
    doc.addPage();
    drawLetterhead();
    return margin;
  }
  return y;
}

function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(doc, COLORS.jade);
  doc.text(sanitizeText(title), 18, y);
  setDraw(doc, COLORS.brassLine);
  doc.setLineWidth(0.4);
  doc.line(18, y + 2.5, 192, y + 2.5);
  return y + 10;
}

function paragraph(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, size = 9, color = COLORS.ink2, lineHeight = 4.6): number {
  if (!text) return y;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(size);
  setText(doc, color);
  const lines = wrapText(doc, text, maxWidth);
  lines.forEach((line, i) => doc.text(line, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

// A quiet, repeating letterhead strip — the "clear letterhead composition"
// the design brief calls for: a hairline rule, the candidate/job on the
// left, page context on the right. Every page after the cover carries it so
// a printed or screenshotted single page still reads as HireFlow's.
function drawLetterheadStrip(doc: jsPDF, name: string, job: string, pageW: number, margin: number): void {
  setFill(doc, COLORS.surface);
  doc.rect(0, 0, pageW, 18, 'F');
  setDraw(doc, COLORS.brassLine);
  doc.setLineWidth(0.4);
  doc.line(0, 18, pageW, 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setText(doc, COLORS.jade);
  doc.text('HireFlow', margin, 11.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setText(doc, COLORS.ink3);
  doc.text(sanitizeText(`Improvement Blueprint - ${name} - ${job}`), margin + 24, 11.5);
}

// The cover page IS the letterhead — a quiet ivory ground, a thin brass
// rule, HireFlow's mark in jade, and the candidate/job/date set like a
// letter's opening. No banner colors outside the palette, no large green
// fill (the accent is a hairline and a seal disc, never a filled block).
function drawCoverLetterhead(doc: jsPDF, name: string, job: string, generatedAt: string, pageW: number, pageH: number, margin: number, contentW: number): number {
  setFill(doc, COLORS.ground);
  doc.rect(0, 0, pageW, pageH, 'F');

  // Seal disc — the same jade-disc/brass-ring mark used across the product,
  // drawn with vector shapes (never a stock icon).
  const sealX = margin + 7, sealY = 26, sealR = 7;
  setDraw(doc, COLORS.brassLine);
  doc.setLineWidth(0.8);
  doc.circle(sealX, sealY, sealR, 'S');
  setFill(doc, COLORS.jade);
  doc.circle(sealX, sealY, sealR - 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setText(doc, COLORS.ink);
  doc.text('HireFlow', margin + 18, 24);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setText(doc, COLORS.ink3);
  doc.text('Improvement Blueprint', margin + 18, 30.5);

  setDraw(doc, COLORS.brassLine);
  doc.setLineWidth(0.5);
  doc.line(margin, 42, pageW - margin, 42);

  let y = 60;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  setText(doc, COLORS.ink);
  wrapText(doc, name, contentW).forEach((line, i) => doc.text(line, margin, y + i * 9));
  y += 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  setText(doc, COLORS.ink2);
  doc.text(sanitizeText(job), margin, y);
  y += 10;

  doc.setFontSize(9);
  setText(doc, COLORS.ink3);
  const dateStr = new Date(generatedAt || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(`Prepared ${dateStr}`, margin, y);

  return y + 14;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const rawData = await req.json();
    const bp = rawData.blueprintData || rawData;

    console.log('[PDF] Generating Improvement Blueprint (Paper/Ink letterhead)...');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210, pageH = 297, margin = 18, contentW = pageW - margin * 2;

    const meta = bp.metadata || {};
    const name = meta.candidateName || 'Candidate';
    const job = meta.jobTitle || 'this role';
    const summary = bp.summary || {};
    const whatWentWell = bp.whatWentWell || [];
    const gaps = bp.gapsForThisRole || [];
    const presenting = bp.presentingYourExperience || {};
    const plan = bp.practicePlan || {};
    const roles = bp.rolesToConsiderNext || [];
    const closing = bp.closing || {};

    const drawStrip = () => drawLetterheadStrip(doc, name, job, pageW, margin);

    // === COVER / LETTERHEAD ===
    let y = drawCoverLetterhead(doc, name, job, meta.generatedAt, pageW, pageH, margin, contentW);

    if (summary.whatHappened) {
      setFill(doc, COLORS.surface);
      setDraw(doc, COLORS.line);
      doc.setLineWidth(0.3);
      const lines = wrapText(doc, summary.whatHappened, contentW - 16);
      const boxH = lines.length * 4.8 + 12;
      doc.roundedRect(margin, y, contentW, boxH, 2, 2, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      setText(doc, COLORS.ink2);
      lines.forEach((line, i) => doc.text(line, margin + 8, y + 8 + i * 4.8));
      y += boxH + 6;
    }

    if (summary.keyTakeaway) {
      setFill(doc, COLORS.jadeSoft);
      const lines = wrapText(doc, summary.keyTakeaway, contentW - 16);
      const boxH = lines.length * 4.6 + 10;
      doc.roundedRect(margin, y, contentW, boxH, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      setText(doc, COLORS.jade);
      doc.text('The one thing to remember', margin + 8, y + 6.5);
      doc.setFont('helvetica', 'normal');
      setText(doc, COLORS.ink);
      lines.forEach((line, i) => doc.text(line, margin + 8, y + 11.5 + i * 4.6));
      y += boxH;
    }

    if (meta.dataDepthMessage) {
      y += 5;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      setText(doc, COLORS.ink3);
      const lines = wrapText(doc, meta.dataDepthMessage, contentW);
      lines.forEach((line, i) => doc.text(line, margin, y + i * 4));
      y += lines.length * 4;
    }

    // === PAGE 2+: DETAIL ===
    doc.addPage();
    drawStrip();
    y = 30;

    // What went well
    if (whatWentWell.length > 0) {
      y = drawSectionTitle(doc, 'What went well', y);
      whatWentWell.forEach((s: any) => {
        y = checkPageBreak(doc, y, 20, pageH, margin, drawStrip);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        setText(doc, COLORS.jade);
        const strengthLines = wrapText(doc, `+ ${s.strength || ''}`, contentW - 6);
        strengthLines.forEach((line) => { doc.text(line, margin, y); y += 4.6; });
        if (s.evidence) {
          y = paragraph(doc, s.evidence, margin + 4, y, contentW - 10, 8.5, COLORS.ink3);
          y += 1;
        }
        if (s.howToUseItNextTime) {
          y = paragraph(doc, `Next time: ${s.howToUseItNextTime}`, margin + 4, y, contentW - 10, 8.5, COLORS.ink2);
        }
        y += 5;
      });
      y += 2;
    }

    // Gaps for this role
    if (gaps.length > 0) {
      y = checkPageBreak(doc, y, 16, pageH, margin, drawStrip);
      y = drawSectionTitle(doc, 'Where this role needed more', y);
      gaps.forEach((g: any) => {
        y = checkPageBreak(doc, y, 26, pageH, margin, drawStrip);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        setText(doc, COLORS.ink);
        doc.text(sanitizeText(g.area || ''), margin, y);
        y += 4.8;

        if (g.requirement) {
          setFill(doc, COLORS.amberBg);
          const reqLines = wrapText(doc, `This role looked for: ${g.requirement}`, contentW - 12);
          const boxH = reqLines.length * 4 + 5;
          y = checkPageBreak(doc, y, boxH + 2, pageH, margin, drawStrip);
          doc.roundedRect(margin, y - 3, contentW, boxH, 1.5, 1.5, 'F');
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(7.5);
          setText(doc, COLORS.brass);
          reqLines.forEach((line, i) => doc.text(line, margin + 5, y + 1.5 + i * 4));
          y += boxH + 2;
        }

        if (g.whatWeObserved) {
          y = checkPageBreak(doc, y, 10, pageH, margin, drawStrip);
          y = paragraph(doc, g.whatWeObserved, margin, y, contentW, 8.5, COLORS.ink2);
        }
        if (g.whyItMatters) {
          y = checkPageBreak(doc, y, 10, pageH, margin, drawStrip);
          y = paragraph(doc, `Why it matters: ${g.whyItMatters}`, margin, y, contentW, 8.5, COLORS.ink3);
        }

        (g.practiceSteps || []).forEach((step: any) => {
          y = checkPageBreak(doc, y, 14, pageH, margin, drawStrip);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          setText(doc, COLORS.jade);
          const actionLines = wrapText(doc, `-> ${step.action || ''}`, contentW - 8);
          actionLines.forEach((line) => { doc.text(line, margin + 3, y); y += 4.2; });
          if (step.example) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            setText(doc, COLORS.ink3);
            const exLines = wrapText(doc, `Try: ${step.example}`, contentW - 12);
            exLines.forEach((line) => { y = checkPageBreak(doc, y, 5, pageH, margin, drawStrip); doc.text(line, margin + 7, y); y += 4; });
          }
        });

        y += 5;
      });
    }

    // Presenting your experience
    if (presenting.observation || presenting.suggestion || presenting.example) {
      y = checkPageBreak(doc, y, 16, pageH, margin, drawStrip);
      y = drawSectionTitle(doc, 'Presenting your experience', y);
      if (presenting.observation) y = paragraph(doc, presenting.observation, margin, y, contentW, 8.5, COLORS.ink2) + 1;
      if (presenting.suggestion) {
        y = checkPageBreak(doc, y, 10, pageH, margin, drawStrip);
        y = paragraph(doc, presenting.suggestion, margin, y, contentW, 8.5, COLORS.ink) + 2;
      }
      if (presenting.example) {
        y = checkPageBreak(doc, y, 14, pageH, margin, drawStrip);
        setFill(doc, COLORS.surface);
        setDraw(doc, COLORS.line);
        doc.setLineWidth(0.3);
        const exLines = wrapText(doc, presenting.example, contentW - 12);
        const boxH = exLines.length * 4.4 + 8;
        doc.roundedRect(margin, y, contentW, boxH, 1.5, 1.5, 'FD');
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.5);
        setText(doc, COLORS.ink2);
        exLines.forEach((line, i) => doc.text(line, margin + 6, y + 6 + i * 4.4));
        y += boxH + 4;
      }
      y += 2;
    }

    // Practice plan
    if (plan.thisWeek?.length || plan.nextTwoWeeks?.length) {
      y = checkPageBreak(doc, y, 16, pageH, margin, drawStrip);
      y = drawSectionTitle(doc, 'Your practice plan', y);
      if (plan.thisWeek?.length) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        setText(doc, COLORS.brass);
        doc.text('This week', margin, y);
        y += 5;
        plan.thisWeek.forEach((item: string, i: number) => {
          y = checkPageBreak(doc, y, 8, pageH, margin, drawStrip);
          y = paragraph(doc, `${i + 1}. ${item}`, margin + 2, y, contentW - 4, 8.5, COLORS.ink2);
          y += 1;
        });
        y += 3;
      }
      if (plan.nextTwoWeeks?.length) {
        y = checkPageBreak(doc, y, 10, pageH, margin, drawStrip);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        setText(doc, COLORS.brass);
        doc.text('Next two weeks', margin, y);
        y += 5;
        plan.nextTwoWeeks.forEach((item: string, i: number) => {
          y = checkPageBreak(doc, y, 8, pageH, margin, drawStrip);
          y = paragraph(doc, `${i + 1}. ${item}`, margin + 2, y, contentW - 4, 8.5, COLORS.ink2);
          y += 1;
        });
      }
      y += 6;
    }

    // Roles to consider next
    if (roles.length > 0) {
      y = checkPageBreak(doc, y, 16, pageH, margin, drawStrip);
      y = drawSectionTitle(doc, 'Roles to consider next', y);
      roles.forEach((r: any) => {
        y = checkPageBreak(doc, y, 12, pageH, margin, drawStrip);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setText(doc, COLORS.ink);
        doc.text(sanitizeText(r.roleType || ''), margin, y);
        y += 4.6;
        if (r.why) y = paragraph(doc, r.why, margin + 2, y, contentW - 4, 8.5, COLORS.ink3) + 3;
      });
      y += 2;
    }

    // Closing — a quiet neutral card with a single jade rule on the left
    // edge (not a filled green box: see the "no large green fills" rule —
    // jade-soft is reserved for small callouts, never a page-width block).
    if (closing.note) {
      y = checkPageBreak(doc, y, 26, pageH, margin, drawStrip);
      setFill(doc, COLORS.surface);
      setDraw(doc, COLORS.line);
      doc.setLineWidth(0.3);
      const noteLines = wrapText(doc, closing.note, contentW - 16);
      const noteH = noteLines.length * 4.6 + 10;
      doc.roundedRect(margin, y, contentW, noteH, 2, 2, 'FD');
      setFill(doc, COLORS.jade);
      doc.rect(margin, y, 1.4, noteH, 'F');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      setText(doc, COLORS.ink2);
      noteLines.forEach((line, i) => doc.text(line, margin + 7, y + 7 + i * 4.6));
      y += noteH + 6;
    }

    if (closing.disclaimer) {
      y = checkPageBreak(doc, y, 12, pageH, margin, drawStrip);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      setText(doc, COLORS.ink3);
      const discLines = wrapText(doc, closing.disclaimer, contentW);
      discLines.forEach((line, i) => doc.text(line, margin, y + i * 3.6));
    }

    // Footers on every page
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      setText(doc, COLORS.ink3);
      doc.text(`Page ${p} of ${total}`, pageW - margin, pageH - 8, { align: 'right' });
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
