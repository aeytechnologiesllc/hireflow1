import { jsPDF } from "jspdf";

// Types for the AI-generated report data
export interface PerformanceReportData {
  executiveSummary: {
    headline: string;
    overallAssessment: string;
    standoutMoments: string[];
    criticalGrowthAreas: string[];
  };
  personalityProfile: {
    primaryTraits: Array<{ trait: string; score: number; description: string }>;
    communicationStyle: { style: string; strengths: string[]; developmentAreas: string[] };
    workStyleInsights: string;
  };
  phaseAnalysis: Array<{
    phaseName: string; score: number; status: string; summary: string;
    whatWentWell: string[]; areasForImprovement: string[]; keyMoments: string[]; coachingTip: string;
  }>;
  skillsBreakdown: {
    technicalSkills: Array<{ skill: string; score: number; evidence: string }>;
    softSkills: Array<{ skill: string; score: number; evidence: string }>;
    communicationMetrics: { clarity: number; articulation: number; confidence: number; professionalTone: number };
  };
  interviewDeepDive: {
    overallImpression: string;
    questionBreakdown: Array<{ question: string; responseQuality: string; notableQuote: string; whatWorked: string; whatToImprove: string; idealApproach: string }>;
    bodyLanguageAndTone: string;
    missedOpportunities: string[];
  };
  growthRoadmap: {
    immediate: Array<RoadmapItem>; shortTerm: Array<RoadmapItem>; longTerm: Array<RoadmapItem>;
  };
  motivationalClose: {
    personalizedMessage: string; nextSteps: string[];
    inspirationalQuote: { quote: string; author: string };
  };
  metadata: {
    candidateName: string; candidateEmail: string; jobTitle: string;
    overallScore: number; generatedAt: string; applicationId: string;
  };
}

interface RoadmapItem {
  title: string; priority: string; timeframe: string; description: string;
  actionSteps: string[];
  resources: Array<{ name: string; url: string; description: string }>;
  successMetric: string;
}

const COLORS = {
  primary: { r: 79, g: 70, b: 229 }, secondary: { r: 99, g: 102, b: 241 },
  success: { r: 34, g: 197, b: 94 }, warning: { r: 245, g: 158, b: 11 },
  danger: { r: 239, g: 68, b: 68 }, dark: { r: 30, g: 41, b: 59 },
  medium: { r: 100, g: 116, b: 139 }, light: { r: 148, g: 163, b: 184 },
  background: { r: 248, g: 250, b: 252 }, white: { r: 255, g: 255, b: 255 },
  gold: { r: 245, g: 158, b: 11 },
};

function setColor(doc: jsPDF, c: { r: number; g: number; b: number }) { doc.setTextColor(c.r, c.g, c.b); }
function setFillColor(doc: jsPDF, c: { r: number; g: number; b: number }) { doc.setFillColor(c.r, c.g, c.b); }
function setDrawColor(doc: jsPDF, c: { r: number; g: number; b: number }) { doc.setDrawColor(c.r, c.g, c.b); }
function roundedRect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, style: 'S' | 'F' | 'FD' = 'F') { doc.roundedRect(x, y, w, h, r, r, style); }

function drawProgressBar(doc: jsPDF, x: number, y: number, width: number, height: number, pct: number, color: { r: number; g: number; b: number }) {
  setFillColor(doc, { r: 226, g: 232, b: 240 }); roundedRect(doc, x, y, width, height, height / 2, 'F');
  if (pct > 0) { setFillColor(doc, color); roundedRect(doc, x, y, Math.min((pct / 100) * width, width), height, height / 2, 'F'); }
}

function getScoreColor(score: number) { return score >= 80 ? COLORS.success : score >= 60 ? COLORS.warning : COLORS.danger; }

function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const words = text.split(' '); const lines: string[] = []; let currentLine = '';
  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (doc.getTextWidth(testLine) > maxWidth && currentLine) { lines.push(currentLine); currentLine = word; }
    else { currentLine = testLine; }
  });
  if (currentLine) lines.push(currentLine);
  return lines;
}

function addPageHeader(doc: jsPDF, title: string, pageNum: number, totalPages: number) {
  const pw = doc.internal.pageSize.getWidth();
  setDrawColor(doc, COLORS.primary); doc.setLineWidth(0.5); doc.line(20, 15, pw - 20, 15);
  doc.setFontSize(10); setColor(doc, COLORS.primary); doc.setFont("helvetica", "bold"); doc.text(title, 20, 12);
  doc.setFont("helvetica", "normal"); setColor(doc, COLORS.medium); doc.text(`Page ${pageNum} of ${totalPages}`, pw - 20, 12, { align: 'right' });
}

function addSectionTitle(doc: jsPDF, title: string, y: number, icon?: string): number {
  setColor(doc, COLORS.primary); doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.text(icon ? `${icon} ${title}` : title, 20, y);
  setDrawColor(doc, COLORS.secondary); doc.setLineWidth(0.3); doc.line(20, y + 2, 100, y + 2);
  return y + 10;
}

function addSubsectionTitle(doc: jsPDF, title: string, y: number): number {
  setColor(doc, COLORS.dark); doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.text(title, 20, y);
  return y + 6;
}

export function generatePerformanceReport(reportData: PerformanceReportData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20; const contentWidth = pageWidth - (margin * 2);
  const { metadata, executiveSummary, personalityProfile, phaseAnalysis, skillsBreakdown, interviewDeepDive, growthRoadmap, motivationalClose } = reportData;

  // PAGE 1: COVER & EXECUTIVE SUMMARY
  setFillColor(doc, COLORS.primary); doc.rect(0, 0, pageWidth, 60, 'F');
  setColor(doc, COLORS.white); doc.setFontSize(24); doc.setFont("helvetica", "bold");
  doc.text("PERFORMANCE REPORT", pageWidth / 2, 25, { align: 'center' });
  doc.setFontSize(12); doc.setFont("helvetica", "normal");
  doc.text("Comprehensive Career Development Analysis", pageWidth / 2, 35, { align: 'center' });

  let y = 70;
  setFillColor(doc, { r: 226, g: 232, b: 240 }); roundedRect(doc, margin + 2, y + 2, contentWidth, 45, 4, 'F');
  setFillColor(doc, COLORS.white); roundedRect(doc, margin, y, contentWidth, 45, 4, 'F');
  y += 12; setColor(doc, COLORS.dark); doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text(metadata.candidateName || 'Candidate', margin + 10, y);
  y += 8; doc.setFontSize(11); doc.setFont("helvetica", "normal"); setColor(doc, COLORS.medium);
  doc.text(`Applied for: ${metadata.jobTitle}`, margin + 10, y); y += 6;
  doc.text(`Email: ${metadata.candidateEmail}`, margin + 10, y);

  const scoreX = pageWidth - margin - 35, scoreY = 92, scoreColor = getScoreColor(metadata.overallScore);
  setFillColor(doc, scoreColor); doc.circle(scoreX, scoreY, 18, 'F');
  setColor(doc, COLORS.white); doc.setFontSize(20); doc.setFont("helvetica", "bold");
  doc.text(`${metadata.overallScore}`, scoreX, scoreY + 2, { align: 'center' });
  doc.setFontSize(8); doc.text("SCORE", scoreX, scoreY + 10, { align: 'center' });

  y = 130; y = addSectionTitle(doc, "Executive Summary", y, "📊");
  setFillColor(doc, { r: 238, g: 242, b: 255 }); roundedRect(doc, margin, y, contentWidth, 20, 3, 'F');
  setColor(doc, COLORS.primary); doc.setFontSize(11); doc.setFont("helvetica", "bold");
  const hl = wrapText(doc, executiveSummary?.headline || "", contentWidth - 20);
  hl.forEach((l, i) => doc.text(l, margin + 10, y + 8 + (i * 5)));
  y += 25 + (hl.length > 1 ? (hl.length - 1) * 5 : 0);

  setColor(doc, COLORS.dark); doc.setFontSize(10); doc.setFont("helvetica", "normal");
  const al = wrapText(doc, executiveSummary?.overallAssessment || "", contentWidth);
  al.forEach((l, i) => doc.text(l, margin, y + (i * 5))); y += al.length * 5 + 10;

  const colW = (contentWidth - 10) / 2;
  setFillColor(doc, { r: 220, g: 252, b: 231 }); roundedRect(doc, margin, y, colW, 50, 3, 'F');
  setColor(doc, COLORS.success); doc.setFontSize(10); doc.setFont("helvetica", "bold");
  doc.text("✓ Standout Moments", margin + 5, y + 8);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); setColor(doc, COLORS.dark);
  let mY = y + 16;
  (executiveSummary?.standoutMoments || []).slice(0, 3).forEach(m => {
    const ls = wrapText(doc, `• ${m}`, colW - 10);
    ls.forEach((l, i) => { if (mY + (i * 4) < y + 48) doc.text(l, margin + 5, mY + (i * 4)); });
    mY += ls.length * 4 + 2;
  });

  setFillColor(doc, { r: 254, g: 243, b: 199 }); roundedRect(doc, margin + colW + 10, y, colW, 50, 3, 'F');
  setColor(doc, COLORS.warning); doc.setFontSize(10); doc.setFont("helvetica", "bold");
  doc.text("⚡ Growth Priorities", margin + colW + 15, y + 8);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); setColor(doc, COLORS.dark);
  let gY = y + 16;
  (executiveSummary?.criticalGrowthAreas || []).slice(0, 3).forEach(a => {
    const ls = wrapText(doc, `• ${a}`, colW - 10);
    ls.forEach((l, i) => { if (gY + (i * 4) < y + 48) doc.text(l, margin + colW + 15, gY + (i * 4)); });
    gY += ls.length * 4 + 2;
  });

  // PAGE 2: PERSONALITY
  doc.addPage(); addPageHeader(doc, "Personality Profile", 2, 7); y = 25;
  y = addSectionTitle(doc, "Personality Profile", y, "🧠");
  y = addSubsectionTitle(doc, "Core Personality Traits", y);
  (personalityProfile?.primaryTraits || []).slice(0, 5).forEach(t => {
    setFillColor(doc, COLORS.background); roundedRect(doc, margin, y, contentWidth, 22, 3, 'F');
    setColor(doc, COLORS.dark); doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(t.trait, margin + 5, y + 7);
    const sc = getScoreColor(t.score); setFillColor(doc, sc);
    roundedRect(doc, margin + 5 + doc.getTextWidth(t.trait) + 5, y + 2, 20, 8, 2, 'F');
    setColor(doc, COLORS.white); doc.setFontSize(8);
    doc.text(`${t.score}%`, margin + 5 + doc.getTextWidth(t.trait) + 15, y + 7, { align: 'center' });
    setColor(doc, COLORS.medium); doc.setFontSize(9); doc.setFont("helvetica", "normal");
    const dl = wrapText(doc, t.description, contentWidth - 10);
    dl.slice(0, 2).forEach((l, i) => doc.text(l, margin + 5, y + 13 + (i * 4)));
    y += 26;
  });
  y += 5; y = addSubsectionTitle(doc, "Communication Style", y);
  setFillColor(doc, { r: 238, g: 242, b: 255 }); roundedRect(doc, margin, y, contentWidth, 35, 3, 'F');
  setColor(doc, COLORS.primary); doc.setFontSize(12); doc.setFont("helvetica", "bold");
  doc.text(`Style: ${personalityProfile?.communicationStyle?.style || 'Analytical'}`, margin + 5, y + 10);
  setColor(doc, COLORS.dark); doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text(`Strengths: ${(personalityProfile?.communicationStyle?.strengths || []).slice(0,2).join(", ") || "N/A"}`, margin + 5, y + 20);
  doc.text(`Development: ${(personalityProfile?.communicationStyle?.developmentAreas || []).slice(0,2).join(", ") || "N/A"}`, margin + 5, y + 28);

  // PAGE 3: PHASE ANALYSIS
  doc.addPage(); addPageHeader(doc, "Phase Analysis", 3, 7); y = 25;
  y = addSectionTitle(doc, "Phase-by-Phase Performance", y, "📋");
  (phaseAnalysis || []).slice(0, 4).forEach(p => {
    const ch = 50;
    setFillColor(doc, COLORS.white); setDrawColor(doc, { r: 226, g: 232, b: 240 }); doc.setLineWidth(0.3);
    roundedRect(doc, margin, y, contentWidth, ch, 4, 'FD');
    const stc = p.status === 'excellent' ? COLORS.success : p.status === 'good' ? COLORS.warning : COLORS.danger;
    setFillColor(doc, stc); roundedRect(doc, margin, y, 4, ch, 2, 'F');
    setColor(doc, COLORS.dark); doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text(p.phaseName, margin + 10, y + 8);
    setColor(doc, stc); doc.text(`${p.score}%`, pageWidth - margin - 10, y + 8, { align: 'right' });
    drawProgressBar(doc, margin + 10, y + 12, contentWidth - 40, 4, p.score, stc);
    setColor(doc, COLORS.medium); doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text((p.summary || "").substring(0, 90), margin + 10, y + 22);
    if (p.whatWentWell?.[0]) { setColor(doc, COLORS.success); doc.setFontSize(8); doc.text(`✓ ${p.whatWentWell[0].substring(0, 80)}`, margin + 10, y + 32); }
    if (p.areasForImprovement?.[0]) { setColor(doc, COLORS.warning); doc.text(`△ ${p.areasForImprovement[0].substring(0, 80)}`, margin + 10, y + 40); }
    if (p.coachingTip) { setColor(doc, COLORS.primary); doc.setFont("helvetica", "italic"); doc.text(`💡 ${p.coachingTip.substring(0, 85)}`, margin + 10, y + 48); }
    y += ch + 8;
    if (y > pageHeight - 60) { doc.addPage(); addPageHeader(doc, "Phase Analysis (cont.)", 3, 7); y = 25; }
  });

  // PAGE 4: SKILLS
  doc.addPage(); addPageHeader(doc, "Skills Assessment", 4, 7); y = 25;
  y = addSectionTitle(doc, "Skills Assessment", y, "🎯");
  y = addSubsectionTitle(doc, "Communication Metrics", y);
  const mets = skillsBreakdown?.communicationMetrics || { clarity: 0, articulation: 0, confidence: 0, professionalTone: 0 };
  const metL = [{ n: "Clarity", v: mets.clarity }, { n: "Articulation", v: mets.articulation }, { n: "Confidence", v: mets.confidence }, { n: "Prof. Tone", v: mets.professionalTone }];
  const mw = (contentWidth - 30) / 4;
  metL.forEach((m, i) => {
    const mx = margin + (i * (mw + 10));
    setFillColor(doc, COLORS.background); roundedRect(doc, mx, y, mw, 35, 3, 'F');
    const sc = getScoreColor(m.v); setFillColor(doc, sc); doc.circle(mx + mw / 2, y + 12, 10, 'F');
    setColor(doc, COLORS.white); doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(`${m.v}`, mx + mw / 2, y + 14, { align: 'center' });
    setColor(doc, COLORS.dark); doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(m.n, mx + mw / 2, y + 30, { align: 'center' });
  });
  y += 45; y = addSubsectionTitle(doc, "Technical Skills", y);
  (skillsBreakdown?.technicalSkills || []).slice(0, 4).forEach(s => {
    setColor(doc, COLORS.dark); doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text(s.skill, margin, y);
    drawProgressBar(doc, margin + 60, y - 3, 80, 5, s.score, getScoreColor(s.score));
    setColor(doc, getScoreColor(s.score)); doc.text(`${s.score}%`, margin + 145, y);
    setColor(doc, COLORS.medium); doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text((s.evidence || "N/A").substring(0, 60), margin, y + 5); y += 14;
  });
  y += 5; y = addSubsectionTitle(doc, "Soft Skills", y);
  (skillsBreakdown?.softSkills || []).slice(0, 4).forEach(s => {
    setColor(doc, COLORS.dark); doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text(s.skill, margin, y);
    drawProgressBar(doc, margin + 60, y - 3, 80, 5, s.score, getScoreColor(s.score));
    setColor(doc, getScoreColor(s.score)); doc.text(`${s.score}%`, margin + 145, y);
    setColor(doc, COLORS.medium); doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text((s.evidence || "N/A").substring(0, 60), margin, y + 5); y += 14;
  });

  // PAGE 5: INTERVIEW
  doc.addPage(); addPageHeader(doc, "Interview Analysis", 5, 7); y = 25;
  y = addSectionTitle(doc, "Interview Deep Dive", y, "🎤");
  setFillColor(doc, { r: 238, g: 242, b: 255 }); roundedRect(doc, margin, y, contentWidth, 25, 3, 'F');
  setColor(doc, COLORS.dark); doc.setFontSize(10); doc.setFont("helvetica", "normal");
  const il = wrapText(doc, interviewDeepDive?.overallImpression || "Interview analysis not available.", contentWidth - 10);
  il.slice(0, 3).forEach((l, i) => doc.text(l, margin + 5, y + 8 + (i * 5))); y += 30;
  y = addSubsectionTitle(doc, "Question-by-Question Analysis", y);
  (interviewDeepDive?.questionBreakdown || []).slice(0, 3).forEach((qa, idx) => {
    const qh = 50;
    setFillColor(doc, COLORS.background); roundedRect(doc, margin, y, contentWidth, qh, 3, 'F');
    setFillColor(doc, COLORS.primary); roundedRect(doc, margin + 5, y + 3, 20, 10, 2, 'F');
    setColor(doc, COLORS.white); doc.setFontSize(8); doc.setFont("helvetica", "bold");
    doc.text(`Q${idx + 1}`, margin + 15, y + 9, { align: 'center' });
    const qc = qa.responseQuality === 'excellent' ? COLORS.success : qa.responseQuality === 'good' ? COLORS.warning : COLORS.danger;
    setFillColor(doc, qc); roundedRect(doc, pageWidth - margin - 30, y + 3, 25, 10, 2, 'F');
    setColor(doc, COLORS.white); doc.text((qa.responseQuality || "N/A").toUpperCase(), pageWidth - margin - 17.5, y + 9, { align: 'center' });
    setColor(doc, COLORS.dark); doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text((qa.question || "").substring(0, 60), margin + 30, y + 9);
    if (qa.notableQuote) { setColor(doc, COLORS.primary); doc.setFontSize(8); doc.setFont("helvetica", "italic"); doc.text(`"${qa.notableQuote.substring(0, 75)}..."`, margin + 5, y + 20); }
    setColor(doc, COLORS.success); doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(`✓ ${(qa.whatWorked || "N/A").substring(0, 70)}`, margin + 5, y + 30);
    setColor(doc, COLORS.warning); doc.text(`△ ${(qa.whatToImprove || "N/A").substring(0, 70)}`, margin + 5, y + 38);
    setColor(doc, COLORS.medium); doc.setFont("helvetica", "italic");
    doc.text(`💡 ${(qa.idealApproach || "N/A").substring(0, 70)}`, margin + 5, y + 46);
    y += qh + 8;
    if (y > pageHeight - 70) { doc.addPage(); addPageHeader(doc, "Interview Analysis (cont.)", 5, 7); y = 25; }
  });

  // PAGE 6: ROADMAP
  doc.addPage(); addPageHeader(doc, "Growth Roadmap", 6, 7); y = 25;
  y = addSectionTitle(doc, "Your Growth Roadmap", y, "🚀");
  const renderRoadmap = (items: RoadmapItem[], title: string, pc: { r: number; g: number; b: number }) => {
    if (!items?.length) return;
    setFillColor(doc, pc); roundedRect(doc, margin, y, contentWidth, 8, 2, 'F');
    setColor(doc, COLORS.white); doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text(title, margin + 5, y + 5.5); y += 12;
    items.slice(0, 2).forEach(item => {
      const ih = 45;
      setFillColor(doc, COLORS.background); roundedRect(doc, margin, y, contentWidth, ih, 3, 'F');
      const bc = item.priority === 'high' ? COLORS.danger : item.priority === 'medium' ? COLORS.warning : COLORS.success;
      setFillColor(doc, bc); roundedRect(doc, pageWidth - margin - 25, y + 3, 20, 8, 2, 'F');
      setColor(doc, COLORS.white); doc.setFontSize(7); doc.text((item.priority || "").toUpperCase(), pageWidth - margin - 15, y + 8, { align: 'center' });
      setColor(doc, COLORS.dark); doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text(item.title, margin + 5, y + 9);
      setColor(doc, COLORS.primary); doc.setFontSize(8); doc.setFont("helvetica", "normal");
      doc.text(`⏰ ${item.timeframe}`, margin + 5 + doc.getTextWidth(item.title) + 5, y + 9);
      setColor(doc, COLORS.medium); doc.setFontSize(8);
      doc.text((item.description || "").substring(0, 90), margin + 5, y + 17);
      setColor(doc, COLORS.dark); (item.actionSteps || []).slice(0, 2).forEach((s, i) => doc.text(`${i + 1}. ${s.substring(0, 55)}`, margin + 5, y + 25 + (i * 5)));
      if (item.resources?.length) {
        setColor(doc, COLORS.primary); doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.text("RESOURCES:", margin + 5, y + 38);
        doc.setFont("helvetica", "normal");
        doc.text(item.resources.slice(0, 2).map(r => `${r.name} (${r.url})`).join(" | ").substring(0, 90), margin + 35, y + 38);
      }
      y += ih + 5;
      if (y > pageHeight - 60) { doc.addPage(); addPageHeader(doc, "Growth Roadmap (cont.)", 6, 7); y = 25; }
    }); y += 5;
  };
  renderRoadmap(growthRoadmap?.immediate || [], "🔥 IMMEDIATE ACTIONS (This Week)", COLORS.danger);
  renderRoadmap(growthRoadmap?.shortTerm || [], "📅 SHORT-TERM GOALS (30-90 Days)", COLORS.warning);
  renderRoadmap(growthRoadmap?.longTerm || [], "🎯 LONG-TERM DEVELOPMENT (3-12 Months)", COLORS.primary);

  // PAGE 7: CLOSING
  doc.addPage(); addPageHeader(doc, "Your Next Chapter", 7, 7); y = 35;
  setFillColor(doc, COLORS.primary); doc.rect(0, y - 10, pageWidth, 50, 'F');
  setColor(doc, COLORS.white); doc.setFontSize(22); doc.setFont("helvetica", "bold");
  doc.text("Your Journey Continues", pageWidth / 2, y + 10, { align: 'center' });
  doc.setFontSize(11); doc.setFont("helvetica", "normal");
  doc.text("Every expert was once a beginner. Here's your path forward.", pageWidth / 2, y + 22, { align: 'center' });
  y = 90; y = addSectionTitle(doc, "A Personal Note For You", y, "💪");
  setFillColor(doc, { r: 238, g: 242, b: 255 }); roundedRect(doc, margin, y, contentWidth, 40, 4, 'F');
  setColor(doc, COLORS.dark); doc.setFontSize(10); doc.setFont("helvetica", "normal");
  const ml = wrapText(doc, motivationalClose?.personalizedMessage || "Your dedication to improving yourself is commendable!", contentWidth - 20);
  ml.slice(0, 4).forEach((l, i) => doc.text(l, margin + 10, y + 12 + (i * 6))); y += 50;
  y = addSectionTitle(doc, "Your Immediate Action Checklist", y, "✅");
  (motivationalClose?.nextSteps || []).slice(0, 5).forEach((s, i) => {
    setFillColor(doc, i % 2 === 0 ? COLORS.background : COLORS.white); roundedRect(doc, margin, y, contentWidth, 10, 2, 'F');
    setDrawColor(doc, COLORS.primary); doc.setLineWidth(0.5); doc.rect(margin + 5, y + 2, 5, 5, 'S');
    setColor(doc, COLORS.dark); doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(s.substring(0, 90), margin + 15, y + 7); y += 12;
  }); y += 10;
  setFillColor(doc, COLORS.gold); roundedRect(doc, margin, y, contentWidth, 30, 4, 'F');
  setColor(doc, COLORS.white); doc.setFontSize(11); doc.setFont("helvetica", "italic");
  const q = motivationalClose?.inspirationalQuote?.quote || "Success is not final, failure is not fatal: it is the courage to continue that counts.";
  const ql = wrapText(doc, `"${q}"`, contentWidth - 20);
  ql.slice(0, 2).forEach((l, i) => doc.text(l, pageWidth / 2, y + 10 + (i * 6), { align: 'center' }));
  doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.text(`— ${motivationalClose?.inspirationalQuote?.author || "Winston Churchill"}`, pageWidth / 2, y + 24, { align: 'center' });

  // Footer
  y = pageHeight - 25;
  setDrawColor(doc, COLORS.light); doc.setLineWidth(0.3); doc.line(margin, y - 5, pageWidth - margin, y - 5);
  setColor(doc, COLORS.medium); doc.setFontSize(8); doc.setFont("helvetica", "normal");
  doc.text("Generated by HireFlow AI Performance Analysis", pageWidth / 2, y, { align: 'center' });
  doc.text(`${new Date(metadata.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, pageWidth / 2, y + 5, { align: 'center' });

  const fileName = `Performance-Report-${(metadata.candidateName || 'Candidate').replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
