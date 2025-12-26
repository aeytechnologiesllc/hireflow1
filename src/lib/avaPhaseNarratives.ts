export type PhaseType =
  | "application_form"
  | "quiz"
  | "portfolio"
  | "video"
  | "typing"
  | "chat_simulation"
  | "chat_interview"
  | "sales_simulation"
  | "voice_interview"
  | "resume";

export interface ParsedSectionLike {
  title: string;
  items: string[];
}

type QA = { question: string; answer: string };

export interface AvaPhaseNarrativeInput {
  phaseType: PhaseType;
  phaseLabel: string;
  baseFacts: string;
  applicationAnswers?: QA[];
  voiceInterviewResult?: any;
  rawSections: ParsedSectionLike[];
  analysisAvailable: boolean;
  wasRejected: boolean;
}

// ============= Extraction Helpers =============

interface ExtractedAnalysis {
  resumeStatus: string | null;
  resumeNotes: string | null;
  nameMatch: { status: string; details: string } | null;
  aiContentStatus: string | null;
  coverLetterStatus: string | null;
  authenticityStatus: string | null;
  redFlags: string[];
  penalties: string[];
  baseScore: number | null;
  finalScore: number | null;
  scoreCap: string | null;
  missingSkills: string[];
  matchingSkills: string[];
  skillMatchRate: string | null;
  concerns: string[];
  keyStrengths: string[];
  recommendation: string | null;
  scoreExplanation: string | null;
}

function extractFromSection(sections: ParsedSectionLike[], sectionName: string): ParsedSectionLike | null {
  return sections.find(s => s.title.toLowerCase().includes(sectionName.toLowerCase())) || null;
}

function extractValue(items: string[], key: string): string | null {
  for (const item of items) {
    const match = item.match(new RegExp(`^${key}[:\\s]+(.+)$`, "i"));
    if (match) return match[1].trim();
  }
  return null;
}

function extractBulletItems(items: string[], afterKey?: string): string[] {
  const results: string[] = [];
  let inSection = !afterKey;
  
  for (const item of items) {
    if (afterKey && item.toLowerCase().includes(afterKey.toLowerCase())) {
      inSection = true;
      continue;
    }
    if (inSection && item.startsWith("-")) {
      results.push(item.replace(/^-\s*/, "").trim());
    }
  }
  return results;
}

function parseAnalysis(sections: ParsedSectionLike[]): ExtractedAnalysis {
  const result: ExtractedAnalysis = {
    resumeStatus: null,
    resumeNotes: null,
    nameMatch: null,
    aiContentStatus: null,
    coverLetterStatus: null,
    authenticityStatus: null,
    redFlags: [],
    penalties: [],
    baseScore: null,
    finalScore: null,
    scoreCap: null,
    missingSkills: [],
    matchingSkills: [],
    skillMatchRate: null,
    concerns: [],
    keyStrengths: [],
    recommendation: null,
    scoreExplanation: null,
  };

  // Document Validation
  const docSection = extractFromSection(sections, "document validation");
  if (docSection) {
    result.resumeStatus = extractValue(docSection.items, "Status");
    result.resumeNotes = extractValue(docSection.items, "Notes");
  }

  // Cross-Reference Verification
  const crossRefSection = extractFromSection(sections, "cross-reference");
  if (crossRefSection) {
    const nameMatchRaw = extractValue(crossRefSection.items, "Name Match");
    if (nameMatchRaw) {
      const parts = nameMatchRaw.split(" - ");
      result.nameMatch = {
        status: parts[0]?.trim() || "",
        details: parts.slice(1).join(" - ").trim() || "",
      };
    }
    const discrepancies = extractValue(crossRefSection.items, "Discrepancies Found");
    if (discrepancies && discrepancies.toLowerCase() !== "none") {
      result.concerns.push(discrepancies);
    }
  }

  // AI-Generated Content Detection
  const aiSection = extractFromSection(sections, "ai-generated content");
  if (aiSection) {
    result.aiContentStatus = extractValue(aiSection.items, "Overall Authenticity");
    result.coverLetterStatus = extractValue(aiSection.items, "Cover Letter");
    const aiNotes = extractValue(aiSection.items, "AI Detection Notes");
    if (aiNotes) result.concerns.push(aiNotes);
  }

  // Authenticity Assessment
  const authSection = extractFromSection(sections, "authenticity assessment");
  if (authSection) {
    result.authenticityStatus = extractValue(authSection.items, "Status");
    const redFlagsRaw = extractValue(authSection.items, "Red Flags");
    if (redFlagsRaw && redFlagsRaw.toLowerCase() !== "none") {
      result.redFlags = redFlagsRaw.split(",").map(f => f.trim()).filter(Boolean);
    }
  }

  // Scoring Breakdown
  const scoringSection = extractFromSection(sections, "scoring breakdown");
  if (scoringSection) {
    const baseScoreRaw = extractValue(scoringSection.items, "Base Score");
    if (baseScoreRaw) result.baseScore = parseInt(baseScoreRaw, 10) || null;
    
    const finalScoreRaw = extractValue(scoringSection.items, "FINAL CALCULATED SCORE");
    if (finalScoreRaw) result.finalScore = parseInt(finalScoreRaw, 10) || null;
    
    const scoreCapRaw = extractValue(scoringSection.items, "Score Cap Applied");
    if (scoreCapRaw) result.scoreCap = scoreCapRaw;
    
    // Extract penalties
    result.penalties = scoringSection.items
      .filter(item => item.startsWith("-") && item.includes("→"))
      .map(item => item.replace(/^-\s*/, "").trim());
  }

  // Skills Match
  const skillsSection = extractFromSection(sections, "skills match");
  if (skillsSection) {
    const matchingRaw = extractValue(skillsSection.items, "Matching Skills");
    if (matchingRaw && !matchingRaw.includes("CANNOT_VERIFY") && matchingRaw.toLowerCase() !== "none") {
      result.matchingSkills = matchingRaw.split(",").map(s => s.trim()).filter(Boolean);
    }
    
    const missingRaw = extractValue(skillsSection.items, "Missing Skills");
    if (missingRaw && missingRaw.toLowerCase() !== "none") {
      result.missingSkills = missingRaw.split(",").map(s => s.trim()).filter(Boolean).slice(0, 5);
    }
    
    result.skillMatchRate = extractValue(skillsSection.items, "Match Rate");
  }

  // Overall Assessment
  const assessmentSection = extractFromSection(sections, "overall assessment");
  if (assessmentSection) {
    result.recommendation = extractValue(assessmentSection.items, "Recommendation");
    const strengthsRaw = extractValue(assessmentSection.items, "Key Strengths");
    if (strengthsRaw && strengthsRaw.toLowerCase() !== "none identified") {
      result.keyStrengths = strengthsRaw.split(",").map(s => s.trim()).filter(Boolean);
    }
    
    // Extract areas of concern
    const concernItems = assessmentSection.items
      .filter(item => item.startsWith("-") && !item.includes("→"))
      .map(item => item.replace(/^-\s*/, "").trim());
    result.concerns.push(...concernItems);
  }

  // Score Explanation
  const scoreExplSection = extractFromSection(sections, "score explanation");
  if (scoreExplSection) {
    // Join all items in this section as the explanation
    result.scoreExplanation = scoreExplSection.items
      .filter(item => !item.includes(":") || item.length > 50)
      .map(item => item.replace(/^Score is \d+% because\s*/i, ""))
      .join(" ")
      .trim();
  }

  // Deduplicate concerns
  result.concerns = [...new Set(result.concerns)].filter(c => 
    c.toLowerCase() !== "none" && 
    c.length > 3 &&
    !c.includes("CANNOT_VERIFY")
  );

  return result;
}

// ============= Narrative Builders =============

function buildApplicationFormNarrative(input: AvaPhaseNarrativeInput): string {
  const { rawSections, wasRejected, analysisAvailable } = input;

  if (!analysisAvailable || rawSections.length === 0) {
    return "The application form has been submitted. I'm still waiting for the detailed analysis to come through. Once I have it, I'll provide a full breakdown.";
  }

  const analysis = parseAnalysis(rawSections);
  const paragraphs: string[] = [];

  // Paragraph 1: Opening with resume status
  const opening: string[] = ["I reviewed the application form and checked the supporting documents."];
  
  if (analysis.resumeStatus?.includes("UNAVAILABLE")) {
    opening.push("The resume couldn't be parsed — it's in a format I can't read directly, so I had to rely on the application answers instead.");
  } else if (analysis.resumeNotes) {
    opening.push(analysis.resumeNotes);
  }
  paragraphs.push(opening.join(" "));

  // Paragraph 2: Key findings (name match, AI detection)
  const findings: string[] = [];
  
  if (analysis.nameMatch) {
    if (analysis.nameMatch.status === "MISMATCH") {
      findings.push(`I noticed a name mismatch: ${analysis.nameMatch.details}`);
    } else if (analysis.nameMatch.status === "MATCH") {
      findings.push("The name on file matches the application.");
    }
  }

  if (analysis.coverLetterStatus?.includes("LIKELY_AI_GENERATED")) {
    findings.push("The cover letter appears to be AI-generated or shows minimal effort.");
  } else if (analysis.coverLetterStatus?.includes("POSSIBLY_AI")) {
    findings.push("Some parts of the application may have been AI-assisted.");
  }

  if (analysis.authenticityStatus === "QUESTIONABLE") {
    findings.push("Overall, the application's authenticity is questionable.");
  }

  if (findings.length > 0) {
    paragraphs.push(findings.join(" "));
  }

  // Paragraph 3: Score breakdown and penalties
  if (analysis.baseScore !== null || analysis.penalties.length > 0) {
    const scoreInfo: string[] = [];
    
    if (analysis.baseScore !== null && analysis.finalScore !== null) {
      scoreInfo.push(`The initial score was ${analysis.baseScore}, but after applying penalties, it came down to ${analysis.finalScore}.`);
    }
    
    if (analysis.penalties.length > 0) {
      const penaltySummary = analysis.penalties
        .map(p => p.replace(/→.*$/, "").trim())
        .slice(0, 3)
        .join("; ");
      scoreInfo.push(`Penalties included: ${penaltySummary}.`);
    }
    
    if (analysis.scoreCap) {
      scoreInfo.push(`Score was capped because: ${analysis.scoreCap.replace(/^Capped from \d+ to \d+ because:\s*/i, "")}.`);
    }

    if (scoreInfo.length > 0) {
      paragraphs.push(scoreInfo.join(" "));
    }
  }

  // Paragraph 4: Skills analysis
  if (analysis.missingSkills.length > 0 || analysis.skillMatchRate) {
    const skillsInfo: string[] = [];
    
    if (analysis.skillMatchRate && analysis.skillMatchRate !== "0%") {
      skillsInfo.push(`Skill match rate: ${analysis.skillMatchRate}.`);
    } else if (analysis.skillMatchRate === "0%") {
      skillsInfo.push("None of the required skills were verified on this application.");
    }
    
    if (analysis.missingSkills.length > 0) {
      skillsInfo.push(`Key skills I couldn't find: ${analysis.missingSkills.slice(0, 4).join(", ")}.`);
    }

    if (skillsInfo.length > 0) {
      paragraphs.push(skillsInfo.join(" "));
    }
  }

  // Paragraph 5: Red flags and concerns
  const allConcerns = [...new Set([...analysis.redFlags, ...analysis.concerns])].slice(0, 4);
  if (allConcerns.length > 0) {
    paragraphs.push(`Red flags to note: ${allConcerns.join(", ")}.`);
  }

  // Paragraph 6: Bottom line
  if (analysis.scoreExplanation) {
    paragraphs.push(`Bottom line: ${analysis.scoreExplanation}`);
  } else if (analysis.recommendation) {
    if (analysis.recommendation.toLowerCase().includes("not recommended")) {
      paragraphs.push("Given these findings, I'm not recommending this candidate move forward.");
    } else {
      paragraphs.push(`My recommendation: ${analysis.recommendation}.`);
    }
  }

  // Apply tone adjustment for rejected candidates
  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative
      .replace(/\b(excellent|outstanding|exceptional|perfect|impressive)\b/gi, "adequate")
      .replace(/\b(highly recommend|strong candidate|great fit)\b/gi, "considered");
  }

  return narrative;
}

function buildQuizNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected } = input;
  const paragraphs: string[] = [];

  paragraphs.push("Here's how they did on the quiz.");
  paragraphs.push(baseFacts);

  // Extract score from baseFacts if possible
  const scoreMatch = baseFacts.match(/(\d+)%/);
  if (scoreMatch) {
    const score = parseInt(scoreMatch[1], 10);
    if (score >= 90) {
      paragraphs.push("This is an excellent result — they clearly know the material well.");
    } else if (score >= 70) {
      paragraphs.push("A solid performance that shows good foundational knowledge.");
    } else if (score >= 50) {
      paragraphs.push("There are some gaps in their knowledge that might need attention.");
    } else {
      paragraphs.push("The score indicates significant knowledge gaps that would need to be addressed.");
    }
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/excellent result/gi, "the result").replace(/solid performance/gi, "the performance");
  }
  return narrative;
}

function buildTypingNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected } = input;
  const paragraphs: string[] = [];

  paragraphs.push("I checked their typing test results.");
  paragraphs.push(baseFacts);

  // Extract WPM if possible
  const wpmMatch = baseFacts.match(/(\d+)\s*WPM/i);
  const accMatch = baseFacts.match(/(\d+)%\s*accuracy/i);
  
  if (wpmMatch) {
    const wpm = parseInt(wpmMatch[1], 10);
    if (wpm >= 70) {
      paragraphs.push("This is a strong typing speed, well above average for most roles.");
    } else if (wpm >= 50) {
      paragraphs.push("A decent typing speed that should work for most tasks.");
    } else {
      paragraphs.push("The typing speed is on the lower side — might be a concern depending on the role requirements.");
    }
  }

  if (accMatch) {
    const acc = parseInt(accMatch[1], 10);
    if (acc >= 98) {
      paragraphs.push("The accuracy is excellent — very few errors.");
    } else if (acc < 95) {
      paragraphs.push("Accuracy could use some improvement.");
    }
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/strong typing speed/gi, "typing speed").replace(/excellent/gi, "noted");
  }
  return narrative;
}

function buildVoiceInterviewNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, voiceInterviewResult, wasRejected } = input;
  const paragraphs: string[] = [];

  paragraphs.push("I listened to their voice interview.");
  paragraphs.push(baseFacts);

  // Extract insights from voice interview result
  if (voiceInterviewResult) {
    if (voiceInterviewResult.summary) {
      paragraphs.push(`Key takeaway: "${voiceInterviewResult.summary.slice(0, 200)}${voiceInterviewResult.summary.length > 200 ? '...' : ''}"`);
    }
    
    const score = voiceInterviewResult.overall_score || voiceInterviewResult.overallScore;
    if (score !== undefined) {
      if (score >= 80) {
        paragraphs.push("They came across well — good communication and engagement.");
      } else if (score >= 60) {
        paragraphs.push("The interview was adequate, though nothing particularly stood out.");
      } else {
        paragraphs.push("There were some communication challenges during the interview.");
      }
    }
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/came across well/gi, "completed the interview").replace(/good communication/gi, "showed effort");
  }
  return narrative;
}

function buildPortfolioNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected } = input;
  const paragraphs: string[] = [];

  paragraphs.push("I looked at the work samples they submitted.");
  paragraphs.push(baseFacts);

  const scoreMatch = baseFacts.match(/(\d+)\/100/);
  if (scoreMatch) {
    const score = parseInt(scoreMatch[1], 10);
    if (score >= 80) {
      paragraphs.push("The portfolio shows strong technical skills and creativity.");
    } else if (score >= 60) {
      paragraphs.push("The work is decent, though there's room for improvement.");
    } else {
      paragraphs.push("The portfolio needs more polish to meet expectations.");
    }
  } else {
    paragraphs.push("The portfolio is available for your review.");
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/strong technical skills/gi, "the work").replace(/creativity/gi, "their approach");
  }
  return narrative;
}

function buildVideoNarrative(input: AvaPhaseNarrativeInput): string {
  const { wasRejected } = input;
  const paragraphs: string[] = [];

  paragraphs.push("I watched their video introduction.");
  paragraphs.push("The candidate recorded and submitted a video introduction.");
  paragraphs.push("The video is available for you to review directly — it's often the best way to get a sense of their personality and communication style.");

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/best way to get a sense/gi, "a way to see");
  }
  return narrative;
}

function buildChatSimulationNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected } = input;
  const paragraphs: string[] = [];

  paragraphs.push("I reviewed their chat simulation performance.");
  paragraphs.push(baseFacts);

  const scoreMatch = baseFacts.match(/(\d+)\/100/);
  if (scoreMatch) {
    const score = parseInt(scoreMatch[1], 10);
    if (score >= 80) {
      paragraphs.push("They handled the simulation well — good response quality and timing.");
    } else if (score >= 60) {
      paragraphs.push("Performance was acceptable, with some areas for improvement.");
    } else {
      paragraphs.push("There were challenges in the simulation that would need coaching.");
    }
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/handled the simulation well/gi, "completed the simulation");
  }
  return narrative;
}

function buildSalesSimulationNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected } = input;
  const paragraphs: string[] = [];

  paragraphs.push("I analyzed their sales simulation.");
  paragraphs.push(baseFacts);

  const scoreMatch = baseFacts.match(/(\d+)\/100/);
  if (scoreMatch) {
    const score = parseInt(scoreMatch[1], 10);
    if (score >= 80) {
      paragraphs.push("Strong sales instincts on display — they navigated objections well.");
    } else if (score >= 60) {
      paragraphs.push("Showed potential but would benefit from more sales training.");
    } else {
      paragraphs.push("Sales skills need significant development.");
    }
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/Strong sales instincts/gi, "The performance was noted");
  }
  return narrative;
}

function buildGenericNarrative(input: AvaPhaseNarrativeInput): string {
  const { phaseLabel, baseFacts, wasRejected } = input;
  const paragraphs: string[] = [];

  paragraphs.push(`I reviewed the ${phaseLabel} phase.`);
  paragraphs.push(baseFacts);
  paragraphs.push("This phase provides useful signal for your decision.");

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/useful signal/gi, "additional context");
  }
  return narrative;
}

// ============= Main Export =============

export function buildAvaPhaseNarrative(input: AvaPhaseNarrativeInput): string {
  switch (input.phaseType) {
    case "application_form":
      return buildApplicationFormNarrative(input);
    case "quiz":
      return buildQuizNarrative(input);
    case "typing":
      return buildTypingNarrative(input);
    case "voice_interview":
      return buildVoiceInterviewNarrative(input);
    case "portfolio":
      return buildPortfolioNarrative(input);
    case "video":
      return buildVideoNarrative(input);
    case "chat_simulation":
      return buildChatSimulationNarrative(input);
    case "chat_interview":
      return buildGenericNarrative({ ...input, phaseLabel: "Chat Interview" });
    case "sales_simulation":
      return buildSalesSimulationNarrative(input);
    default:
      return buildGenericNarrative(input);
  }
}
