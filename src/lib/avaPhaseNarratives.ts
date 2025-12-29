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

// ============= Phase-Specific Data Interfaces =============

export interface QuizAnswerData {
  questionId?: string;
  question: string;
  questionType: 'multiple_choice' | 'text';
  selectedAnswer?: number | null;
  selectedAnswerText: string;
  correctAnswer?: number | null;
  textAnswer?: string;
  isCorrect: boolean | null;
}

export interface QuizPhaseData {
  answers: QuizAnswerData[];
  score: number;
  correct: number;
  total: number;
  passed: boolean;
  completedAt?: string;
  antiCheatViolations?: Array<{ type: string; timestamp: string }>;
  totalViolations?: number;
  violationSummary?: string;
}

export interface TypingPhaseData {
  wpm: number;
  accuracy: number;
  passed?: boolean;
  requiredWpm?: number;
  completedAt?: string;
}

export interface ChatSimulationPhaseData {
  score?: number;
  passed?: boolean;
  scenario?: string;
  messageCount?: number;
  evaluation?: string;
  recommendation?: string;
  messages?: Array<{ role: string; content: string }>;
  // Rich rubric data
  empathy?: number;
  problemSolving?: number;
  communication?: number;
  professionalism?: number;
  strengths?: string[];
  improvements?: string[];
  overallFeedback?: string;
  antiCheatSummary?: {
    hasViolations: boolean;
    violationCount: number;
    tabSwitches?: number;
    copyPasteAttempts?: number;
  };
}

export interface ChatInterviewPhaseData {
  score?: number;
  overallScore?: number;
  messageCount?: number;
  duration?: number;
  messages?: Array<{ role: string; content: string }>;
  summary?: string;
  // Rich rubric data
  communication?: number;
  technicalKnowledge?: number;
  problemSolving?: number;
  enthusiasm?: number;
  strengths?: string[];
  improvements?: string[];
  overallFeedback?: string;
}

export interface SalesSimulationPhaseData {
  score?: number;
  passed?: boolean;
  evaluation?: string;
  recommendation?: string;
  messages?: Array<{ role: string; content: string }>;
  // Rich rubric data
  rapport?: number;
  needsDiscovery?: number;
  productKnowledge?: number;
  objectionHandling?: number;
  closingSkills?: number;
  strengths?: string[];
  improvements?: string[];
  overallFeedback?: string;
  antiCheatSummary?: {
    hasViolations: boolean;
    violationCount: number;
    tabSwitches?: number;
    copyPasteAttempts?: number;
  };
}

export interface PortfolioPhaseData {
  score?: number;
  feedback?: string;
  portfolioUrls?: string[];
  fileCount?: number;
  analysis?: string;
}

export interface VideoPhaseData {
  videoUrl?: string;
  duration?: number;
  completedAt?: string;
}

export interface VoiceInterviewPhaseData {
  overall_score?: number;
  overallScore?: number;
  summary?: string;
  executive_summary?: string;
  recommendation?: string;
  credibility_rating?: string;
  
  // Score breakdown
  communication_score?: number;
  technical_score?: number;
  culture_fit_score?: number;
  problem_solving_score?: number;
  adaptability_score?: number;
  leadership_potential_score?: number;
  
  // Soft skills
  soft_skills?: {
    empathy?: number;
    confidence?: number;
    articulation?: number;
    active_listening?: number;
    enthusiasm?: number;
    professionalism?: number;
  };
  
  // Communication metrics
  communication_metrics?: {
    avg_response_time_seconds?: number;
    clarity_score?: number;
    filler_word_frequency?: string;
  };
  
  // Lists
  strengths?: string[];
  concerns?: string[];
  inconsistencies?: Array<{ claim: string; evidence: string; severity?: string }>;
  
  // Questions & quotes
  question_analysis?: Array<{
    question: string;
    response_quality?: string;
    score?: number;
    notable_quote?: string;
    key_points?: string[];
  }>;
  notable_quotes?: Array<{ quote: string; context?: string; sentiment?: string }>;
  suggested_followups?: Array<{ question: string; reason?: string; priority?: string }>;
  
  // Legacy
  questions?: Array<{ question: string; answer?: string; score?: number; feedback?: string }>;
  transcript?: Array<{ role: string; content: string }>;
  duration?: number;
}

export interface AvaPhaseNarrativeInput {
  phaseType: PhaseType;
  phaseLabel: string;
  baseFacts: string;
  applicationAnswers?: QA[];
  voiceInterviewResult?: any;
  rawSections: ParsedSectionLike[];
  analysisAvailable: boolean;
  wasRejected: boolean;
  
  // Job context for dynamic analysis
  jobTitle?: string;
  requiredSkills?: string[];
  jobDescription?: string;
  
  // Phase-specific detailed data
  quizData?: QuizPhaseData;
  typingData?: TypingPhaseData;
  chatSimulationData?: ChatSimulationPhaseData;
  chatInterviewData?: ChatInterviewPhaseData;
  salesSimulationData?: SalesSimulationPhaseData;
  portfolioData?: PortfolioPhaseData;
  videoData?: VideoPhaseData;
  voiceData?: VoiceInterviewPhaseData;
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
    
    const concernItems = assessmentSection.items
      .filter(item => item.startsWith("-") && !item.includes("→"))
      .map(item => item.replace(/^-\s*/, "").trim());
    result.concerns.push(...concernItems);
  }

  // Score Explanation
  const scoreExplSection = extractFromSection(sections, "score explanation");
  if (scoreExplSection) {
    result.scoreExplanation = scoreExplSection.items
      .filter(item => !item.includes(":") || item.length > 50)
      .map(item => item.replace(/^Score is \d+% because\s*/i, ""))
      .join(" ")
      .trim();
  }

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
    return "Application form submitted. Detailed analysis pending.";
  }

  const analysis = parseAnalysis(rawSections);
  const paragraphs: string[] = [];

  // Opening with document status
  const opening: string[] = ["Application form and supporting documents reviewed."];
  
  if (analysis.resumeStatus?.includes("UNAVAILABLE")) {
    opening.push("Resume file could not be processed. Analysis based on application answers and other materials.");
  } else if (analysis.resumeStatus?.includes("VALID_RESUME")) {
    opening.push("Resume reviewed alongside application.");
  } else if (analysis.resumeNotes) {
    opening.push(analysis.resumeNotes);
  }
  paragraphs.push(opening.join(" "));

  // Key findings
  const findings: string[] = [];
  
  if (analysis.nameMatch) {
    if (analysis.nameMatch.status === "MISMATCH") {
      findings.push(`Name discrepancy detected: ${analysis.nameMatch.details}`);
    } else if (analysis.nameMatch.status === "MATCH") {
      findings.push("Name verified against application.");
    }
  }

  if (analysis.coverLetterStatus?.includes("LIKELY_AI_GENERATED")) {
    findings.push("Cover letter shows signs of AI generation or minimal personalization.");
  } else if (analysis.coverLetterStatus?.includes("POSSIBLY_AI")) {
    findings.push("Some application content may be AI-assisted.");
  }

  if (analysis.authenticityStatus === "QUESTIONABLE") {
    findings.push("Application authenticity requires verification.");
  }

  if (findings.length > 0) {
    paragraphs.push(findings.join(" "));
  }

  // Skills analysis
  if (analysis.missingSkills.length > 0 || analysis.skillMatchRate) {
    const skillsInfo: string[] = [];
    
    if (analysis.skillMatchRate && analysis.skillMatchRate !== "0%") {
      skillsInfo.push(`Skill match rate: ${analysis.skillMatchRate}.`);
    } else if (analysis.skillMatchRate === "0%") {
      skillsInfo.push("Required skills not demonstrated in application.");
    }
    
    if (analysis.missingSkills.length > 0) {
      skillsInfo.push(`Missing skills: ${analysis.missingSkills.slice(0, 4).join(", ")}.`);
    }

    if (skillsInfo.length > 0) {
      paragraphs.push(skillsInfo.join(" "));
    }
  }

  // Concerns (stated once, consolidated)
  const allConcerns = [...new Set([...analysis.redFlags, ...analysis.concerns])].slice(0, 4);
  if (allConcerns.length > 0) {
    paragraphs.push(`**Points to Address:** ${allConcerns.join("; ")}.`);
  }

  // Bottom line
  if (analysis.scoreExplanation) {
    paragraphs.push(`**Assessment:** ${analysis.scoreExplanation}`);
  } else if (analysis.recommendation) {
    paragraphs.push(`**Recommendation:** ${analysis.recommendation}.`);
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative
      .replace(/\b(excellent|outstanding|exceptional|perfect|impressive)\b/gi, "adequate")
      .replace(/\b(highly recommend|strong candidate|great fit)\b/gi, "considered");
  }

  return narrative;
}

function buildQuizNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected, quizData, jobTitle } = input;
  const paragraphs: string[] = [];

  const roleContext = jobTitle ? ` for ${jobTitle}` : '';

  if (quizData && quizData.answers && quizData.answers.length > 0) {
    const { answers, score, correct, total, passed, antiCheatViolations, totalViolations } = quizData;
    
    const mcQuestions = answers.filter(a => a.questionType === 'multiple_choice' && a.isCorrect !== null);
    const textQuestions = answers.filter(a => a.questionType === 'text');
    const correctMC = mcQuestions.filter(a => a.isCorrect === true);
    const incorrectMC = mcQuestions.filter(a => a.isCorrect === false);
    
    // Opening based on performance
    if (passed && score >= 80) {
      paragraphs.push(`**Result:** Passed${roleContext} with ${score}% (${correctMC.length}/${mcQuestions.length} correct). Strong knowledge foundation demonstrated.`);
    } else if (passed) {
      paragraphs.push(`**Result:** Passed${roleContext} with ${score}% (${correctMC.length}/${mcQuestions.length} correct). Meets minimum requirements.`);
    } else {
      paragraphs.push(`**Result:** Did not pass${roleContext}. Score: ${score}% (${correctMC.length}/${mcQuestions.length} correct). Below required threshold.`);
    }
    
    // Knowledge gaps - what they missed
    if (incorrectMC.length > 0) {
      const gapDescriptions: string[] = [];
      for (const wrong of incorrectMC.slice(0, 3)) {
        const qLower = wrong.question.toLowerCase();
        const answerText = wrong.selectedAnswerText?.toLowerCase() || '';
        
        if (answerText === 'not answered' || !answerText) {
          gapDescriptions.push("left key questions unanswered");
        } else if (qLower.includes('customer')) {
          gapDescriptions.push("customer handling fundamentals");
        } else if (qLower.includes('multitask')) {
          gapDescriptions.push("multitasking concepts");
        } else {
          gapDescriptions.push("core role knowledge");
        }
      }
      
      if (gapDescriptions.length > 0) {
        const uniqueGaps = [...new Set(gapDescriptions)].slice(0, 3);
        paragraphs.push(`**Knowledge Gaps:** ${uniqueGaps.join(", ")}.`);
      }
    }
    
    // Written response quality
    let textLowEffortCount = 0;
    if (textQuestions.length > 0) {
      for (const tq of textQuestions) {
        const answer = tq.textAnswer || tq.selectedAnswerText || '';
        if (!answer || answer.trim().length < 10 || 
            /^(i don'?t know|idk|n\/?a|none|no|yes|\?+|\.+|test|asdf|dasd|[a-z]{1,5}s?)$/i.test(answer.trim())) {
          textLowEffortCount++;
        }
      }
      
      if (textLowEffortCount === textQuestions.length) {
        paragraphs.push(`**Written Responses:** Minimal effort across all open-ended questions.`);
      } else if (textLowEffortCount > textQuestions.length / 2) {
        paragraphs.push(`**Written Responses:** Most responses showed low effort.`);
      } else if (textLowEffortCount > 0) {
        paragraphs.push(`**Written Responses:** Mixed quality. ${textLowEffortCount} response(s) lacked substance.`);
      } else {
        paragraphs.push(`**Written Responses:** Thoughtful answers showing engagement.`);
      }
    }
    
    // Integrity monitoring
    if (totalViolations && totalViolations > 0 && antiCheatViolations) {
      const tabSwitches = antiCheatViolations.filter(v => v.type === 'tab_switch').length;
      const copyAttempts = antiCheatViolations.filter(v => v.type === 'copy_attempt').length;
      const pasteAttempts = antiCheatViolations.filter(v => v.type === 'paste_attempt').length;
      
      const parts: string[] = [];
      if (tabSwitches > 0) parts.push(`${tabSwitches} tab switches`);
      if (copyAttempts > 0) parts.push(`${copyAttempts} copy attempts`);
      if (pasteAttempts > 0) parts.push(`${pasteAttempts} paste attempts`);
      
      if (parts.length > 0) {
        paragraphs.push(`**Integrity Flag:** ${parts.join(", ")} detected during assessment.`);
      }
    }
    
    // Training recommendation
    if (!passed || score < 60) {
      paragraphs.push(`**If Proceeding:** Significant training investment required for role fundamentals.`);
    }
    
  } else {
    // Fallback
    const scoreMatch = baseFacts.match(/(\d+)%/);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[1], 10);
      paragraphs.push(`Quiz completed${roleContext} with ${score}% score.`);
    } else {
      paragraphs.push(`Quiz completed${roleContext}. ${baseFacts}`);
    }
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/Strong knowledge foundation/gi, "Quiz completed");
  }
  return narrative;
}

function buildTypingNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected, typingData, jobTitle } = input;
  const paragraphs: string[] = [];

  const roleContext = jobTitle ? ` for ${jobTitle}` : '';

  if (typingData) {
    const { wpm, accuracy, passed, requiredWpm } = typingData;
    
    // Result with context
    if (requiredWpm) {
      if (wpm >= requiredWpm) {
        paragraphs.push(`**Result:** ${wpm} WPM with ${accuracy}% accuracy. Meets requirement of ${requiredWpm} WPM${roleContext}.`);
      } else {
        const gap = requiredWpm - wpm;
        paragraphs.push(`**Result:** ${wpm} WPM with ${accuracy}% accuracy. Below requirement by ${gap} WPM${roleContext}.`);
      }
    } else {
      paragraphs.push(`**Result:** ${wpm} WPM with ${accuracy}% accuracy${roleContext}.`);
    }
    
    // Speed context
    if (wpm >= 70) {
      paragraphs.push(`**Speed Assessment:** Above average. Suitable for high-volume typing work.`);
    } else if (wpm >= 50) {
      paragraphs.push(`**Speed Assessment:** Average range. Adequate for moderate typing needs.`);
    } else if (wpm >= 35) {
      paragraphs.push(`**Speed Assessment:** Below average. May limit productivity in typing-intensive roles.`);
    } else {
      paragraphs.push(`**Speed Assessment:** Significantly below typical requirements.`);
    }
    
    // Accuracy insight
    if (accuracy >= 98) {
      paragraphs.push(`**Accuracy:** Excellent attention to detail.`);
    } else if (accuracy < 90) {
      paragraphs.push(`**Accuracy:** Error frequency higher than ideal at ${accuracy}%.`);
    }
    
  } else {
    const wpmMatch = baseFacts.match(/(\d+)\s*WPM/i);
    const accMatch = baseFacts.match(/(\d+)%/);
    
    if (wpmMatch) {
      paragraphs.push(`Typing test: ${wpmMatch[1]} WPM${accMatch ? `, ${accMatch[1]}% accuracy` : ''}${roleContext}.`);
    } else {
      paragraphs.push(`Typing test completed${roleContext}. ${baseFacts}`);
    }
  }

  return paragraphs.join("\n\n");
}

function buildVoiceInterviewNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, voiceInterviewResult, wasRejected, voiceData, jobTitle } = input;
  const paragraphs: string[] = [];

  const roleContext = jobTitle ? ` for ${jobTitle}` : '';
  
  // Use voiceData if available, otherwise fall back to voiceInterviewResult
  const data = voiceData || voiceInterviewResult;
  
  if (data) {
    const score = data.overall_score || data.overallScore;
    const recommendation = data.recommendation;
    const credibility = data.credibility_rating;
    
    // Natural opening based on score + recommendation
    if (score !== undefined) {
      if (score >= 85) {
        paragraphs.push(`The voice interview went exceptionally well${roleContext}—they scored ${score} out of 100. Came across as confident, articulate, and genuinely engaged throughout.`);
      } else if (score >= 70) {
        paragraphs.push(`The voice interview was solid${roleContext}, scoring ${score} out of 100. Good communication with some standout moments.`);
      } else if (score >= 50) {
        paragraphs.push(`The voice interview${roleContext} was mixed—${score} out of 100. They showed potential but need development in their communication skills.`);
      } else {
        paragraphs.push(`The voice interview${roleContext} revealed significant areas for development. They scored ${score} out of 100, which suggests they'd need significant coaching.`);
      }
    } else {
      paragraphs.push(`They completed the voice interview${roleContext}.`);
    }
    
    // Credibility assessment - important trust signal
    if (credibility) {
      if (credibility.toLowerCase() === 'high') {
        paragraphs.push(`Their credibility rating is high—their answers were consistent and verifiable, no red flags there.`);
      } else if (credibility.toLowerCase() === 'medium') {
        paragraphs.push(`Credibility rating is medium—most answers checked out, but a few things might be worth verifying.`);
      } else if (credibility.toLowerCase() === 'low') {
        paragraphs.push(`I'd flag that their credibility rating is low—there were some inconsistencies in their responses that warrant scrutiny.`);
      }
    }
    
    // Score breakdown - woven into narrative naturally (like chat interview)
    const scoreInsights: string[] = [];
    if (data.communication_score !== undefined) {
      if (data.communication_score >= 80) scoreInsights.push("communicated exceptionally well");
      else if (data.communication_score >= 60) scoreInsights.push("communicated adequately");
      else scoreInsights.push("struggled with clear communication");
    }
    if (data.technical_score !== undefined) {
      if (data.technical_score >= 80) scoreInsights.push("demonstrated strong technical understanding");
      else if (data.technical_score >= 60) scoreInsights.push("showed decent technical knowledge");
      else scoreInsights.push("had gaps in technical understanding");
    }
    if (data.culture_fit_score !== undefined) {
      if (data.culture_fit_score >= 80) scoreInsights.push("seemed like a great culture fit");
      else if (data.culture_fit_score < 50) scoreInsights.push("may not align with team culture");
    }
    if (data.problem_solving_score !== undefined) {
      if (data.problem_solving_score >= 80) scoreInsights.push("approached problems thoughtfully");
      else if (data.problem_solving_score < 50) scoreInsights.push("needs development in problem-solving");
    }
    if (data.adaptability_score !== undefined && data.adaptability_score >= 80) {
      scoreInsights.push("showed good adaptability");
    }
    if (data.leadership_potential_score !== undefined && data.leadership_potential_score >= 80) {
      scoreInsights.push("demonstrated leadership potential");
    }
    
    if (scoreInsights.length > 0) {
      if (scoreInsights.length === 1) {
        paragraphs.push(`Notably, they ${scoreInsights[0]}.`);
      } else {
        const lastInsight = scoreInsights.pop();
        paragraphs.push(`Breaking it down: they ${scoreInsights.join(", ")}, and ${lastInsight}.`);
      }
    }
    
    // Soft skills analysis - like chat simulation rubrics
    if (data.soft_skills) {
      const softSkillInsights: string[] = [];
      const ss = data.soft_skills;
      
      if (ss.confidence !== undefined && ss.confidence >= 80) {
        softSkillInsights.push("projected confidence");
      }
      if (ss.articulation !== undefined && ss.articulation >= 80) {
        softSkillInsights.push("articulated thoughts clearly");
      }
      if (ss.empathy !== undefined && ss.empathy >= 80) {
        softSkillInsights.push("showed strong empathy");
      }
      if (ss.enthusiasm !== undefined && ss.enthusiasm >= 80) {
        softSkillInsights.push("came across as genuinely enthusiastic");
      }
      if (ss.professionalism !== undefined && ss.professionalism >= 80) {
        softSkillInsights.push("maintained a professional tone");
      }
      if (ss.active_listening !== undefined && ss.active_listening >= 80) {
        softSkillInsights.push("listened attentively");
      }
      
      // Also mention weak areas
      if (ss.confidence !== undefined && ss.confidence < 50) {
        softSkillInsights.push("seemed unsure of themselves");
      }
      if (ss.enthusiasm !== undefined && ss.enthusiasm < 50) {
        softSkillInsights.push("didn't show much enthusiasm");
      }
      
      if (softSkillInsights.length > 0) {
        if (softSkillInsights.length <= 2) {
          paragraphs.push(`On the soft skills front: they ${softSkillInsights.join(" and ")}.`);
        } else {
          const last = softSkillInsights.pop();
          paragraphs.push(`Soft skills breakdown: they ${softSkillInsights.join(", ")}, and ${last}.`);
        }
      }
    }
    
    // Communication metrics - natural mention
    if (data.communication_metrics) {
      const cm = data.communication_metrics;
      const metricNotes: string[] = [];
      
      if (cm.avg_response_time_seconds !== undefined) {
        if (cm.avg_response_time_seconds < 3) {
          metricNotes.push("responded quickly—maybe too quickly");
        } else if (cm.avg_response_time_seconds > 10) {
          metricNotes.push("took their time to think before responding");
        }
      }
      if (cm.clarity_score !== undefined) {
        if (cm.clarity_score >= 80) metricNotes.push("spoke with good clarity");
        else if (cm.clarity_score < 50) metricNotes.push("could be clearer in their delivery");
      }
      if (cm.filler_word_frequency && cm.filler_word_frequency.toLowerCase() === 'high') {
        metricNotes.push("used a lot of filler words (um, like, you know)");
      }
      
      if (metricNotes.length > 0) {
        paragraphs.push(`Communication-wise, they ${metricNotes.join(" and ")}.`);
      }
    }
    
    // Strengths - conversational (like chat interview)
    if (data.strengths && data.strengths.length > 0) {
      const strengthsList = data.strengths.slice(0, 3).map(s => s.toLowerCase());
      paragraphs.push(`What stood out: ${strengthsList.join(", ")}.`);
    }
    
    // Concerns - natural (like sales simulation)
    if (data.concerns && data.concerns.length > 0) {
      const concernsList = data.concerns.slice(0, 3).map(c => c.toLowerCase());
      paragraphs.push(`Areas of concern: ${concernsList.join(", ")}.`);
    }
    
    // Red flags / Inconsistencies - important credibility signal
    if (data.inconsistencies && data.inconsistencies.length > 0) {
      const topIssue = data.inconsistencies[0];
      if (topIssue.severity === 'high' || topIssue.severity === 'major') {
        paragraphs.push(`One red flag: they claimed "${topIssue.claim}" but ${topIssue.evidence}—definitely worth probing.`);
      } else {
        paragraphs.push(`Minor inconsistency noted: their claim about "${topIssue.claim}" didn't quite match up with ${topIssue.evidence}.`);
      }
    }
    
    // Notable quotes - adds color
    if (data.notable_quotes && data.notable_quotes.length > 0) {
      const topQuote = data.notable_quotes[0];
      if (topQuote.sentiment === 'positive' || !topQuote.sentiment) {
        paragraphs.push(`One quote that stood out: "${topQuote.quote}"${topQuote.context ? ` (when discussing ${topQuote.context})` : ''}.`);
      } else if (topQuote.sentiment === 'concerning') {
        paragraphs.push(`Something that raised an eyebrow: "${topQuote.quote}".`);
      }
    }
    
    // Question analysis fallback (legacy format)
    if (!data.strengths && !data.soft_skills && data.questions && data.questions.length > 0) {
      const strongAnswers = data.questions.filter(q => q.score && q.score >= 80);
      const weakAnswers = data.questions.filter(q => q.score && q.score < 60);
      
      if (strongAnswers.length > 0 && weakAnswers.length > 0) {
        const strongTopic = strongAnswers[0].question.length > 40 
          ? strongAnswers[0].question.substring(0, 40) + "..." 
          : strongAnswers[0].question;
        const weakTopic = weakAnswers[0].question.length > 40 
          ? weakAnswers[0].question.substring(0, 40) + "..." 
          : weakAnswers[0].question;
        paragraphs.push(`They shined when talking about "${strongTopic}" but struggled with "${weakTopic}"—worth probing in a follow-up.`);
      } else if (strongAnswers.length > 0) {
        paragraphs.push(`They gave particularly strong answers throughout.`);
      } else if (weakAnswers.length > 0) {
        paragraphs.push(`They struggled with several questions—something to explore further.`);
      }
    }
    
    // Question analysis (new format)
    if (data.question_analysis && data.question_analysis.length > 0) {
      const excellent = data.question_analysis.filter(q => q.response_quality === 'excellent' || (q.score && q.score >= 85));
      const poor = data.question_analysis.filter(q => q.response_quality === 'poor' || (q.score && q.score < 50));
      
      if (excellent.length > 0) {
        const bestQ = excellent[0];
        const topic = bestQ.question.length > 35 ? bestQ.question.substring(0, 35) + "..." : bestQ.question;
        paragraphs.push(`They really nailed the question about "${topic}"${bestQ.notable_quote ? ` with a memorable response` : ''}.`);
      }
      if (poor.length > 0) {
        const worstQ = poor[0];
        const topic = worstQ.question.length > 35 ? worstQ.question.substring(0, 35) + "..." : worstQ.question;
        paragraphs.push(`They struggled with "${topic}"—definitely probe this in a live conversation.`);
      }
    }
    
    // Executive summary - show FULL summary for premium video interview analysis (no truncation)
    if (data.executive_summary && data.executive_summary.length > 10) {
      paragraphs.push(`**Executive Summary:** ${data.executive_summary}`);
    } else if (data.summary && data.summary.length > 10) {
      paragraphs.push(`**Summary:** ${data.summary}`);
    }
    
    // Suggested follow-ups - valuable for next interview round
    if (data.suggested_followups && data.suggested_followups.length > 0) {
      const followups = data.suggested_followups.slice(0, 3);
      const followupList = followups.map((f, i) => {
        const question = f.question || (typeof f === 'string' ? f : '');
        const reason = f.reason ? ` (${f.reason})` : '';
        return `${i + 1}. "${question}"${reason}`;
      }).join('\n');
      paragraphs.push(`**Suggested Follow-up Questions for Next Round:**\n${followupList}`);
    }
    
    // Duration - casual mention at end
    if (data.duration) {
      const minutes = Math.round(data.duration / 60);
      if (minutes > 10) {
        paragraphs.push(`They were engaged for about ${minutes} minutes—took their time with it.`);
      } else if (minutes < 3) {
        paragraphs.push(`Interview was just ${minutes} minute${minutes !== 1 ? 's' : ''}—pretty brief, might indicate they rushed.`);
      }
    }
    
    // Recommendation - natural closing (like sales simulation)
    if (recommendation) {
      const rec = recommendation.toLowerCase().replace(/_/g, ' ');
      if (rec.includes('strong') && rec.includes('recommend')) {
        paragraphs.push(`Based on this interview, I'd strongly recommend moving forward with them.`);
      } else if (rec.includes('recommend') || rec.includes('proceed') || rec.includes('advance')) {
        paragraphs.push(`Overall, I think they warrant further consideration.`);
      } else if (rec.includes('not recommend') || rec.includes('pass') || rec.includes('reject')) {
        paragraphs.push(`Based on this interview, I'd have concerns about moving forward.`);
      } else if (rec.includes('maybe') || rec.includes('consider')) {
        paragraphs.push(`This one's a judgment call—they've got potential but also some gaps.`);
      }
    }
    
  } else {
    paragraphs.push(`They completed the voice interview${roleContext}. ${baseFacts}`);
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/went exceptionally well/gi, "was completed")
                        .replace(/strongly recommend moving forward/gi, "interview completed")
                        .replace(/warrant further consideration/gi, "completed their interview");
  }
  return narrative;
}

function buildPortfolioNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected, portfolioData, jobTitle } = input;
  const paragraphs: string[] = [];

  const roleContext = jobTitle ? ` for ${jobTitle}` : '';

  if (portfolioData) {
    const { score, feedback, fileCount, analysis } = portfolioData;
    
    // Natural opening
    if (fileCount && fileCount > 1) {
      paragraphs.push(`I looked through the ${fileCount} work samples they submitted${roleContext}.`);
    } else {
      paragraphs.push(`I reviewed the portfolio work they submitted${roleContext}.`);
    }
    
    // Score-based assessment - natural language
    if (score !== undefined) {
      if (score >= 85) {
        paragraphs.push(`This is impressive work—scored ${score} out of 100. The quality and presentation show real skill and creativity. Definitely someone who takes pride in their craft.`);
      } else if (score >= 70) {
        paragraphs.push(`Solid portfolio overall, coming in at ${score} out of 100. The work is competent with some standout pieces, though not everything hit the mark.`);
      } else if (score >= 50) {
        paragraphs.push(`The portfolio is decent but has room to grow—${score} out of 100. Some pieces are stronger than others, and there's potential here that's not fully realized yet.`);
      } else {
        paragraphs.push(`The portfolio needs more polish to meet our expectations—${score} out of 100. The work shows they're still developing their skills.`);
      }
    }
    
    // Feedback integration - natural flow
    if (feedback && feedback.length > 10) {
      paragraphs.push(feedback);
    }
    
    if (analysis && analysis.length > 10 && analysis !== feedback) {
      paragraphs.push(analysis);
    }
    
  } else {
    // Fallback
    paragraphs.push(`They submitted portfolio work for review${roleContext}.`);
    
    const scoreMatch = baseFacts.match(/(\d+)\/100/);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[1], 10);
      if (score >= 80) {
        paragraphs.push(`Strong work overall—shows they've got the technical chops and creative eye.`);
      } else if (score >= 60) {
        paragraphs.push(`Decent portfolio, though there's room for improvement.`);
      } else {
        paragraphs.push(`The work needs more polish—not quite where we'd want it to be.`);
      }
    } else if (baseFacts && baseFacts.length > 10) {
      paragraphs.push(baseFacts);
    }
    
    paragraphs.push(`The files are available for you to review directly if you want to take a closer look.`);
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/impressive work/gi, "work reviewed").replace(/real skill/gi, "effort");
  }
  return narrative;
}

function buildVideoNarrative(input: AvaPhaseNarrativeInput): string {
  const { wasRejected, videoData, jobTitle } = input;
  const paragraphs: string[] = [];

  const roleContext = jobTitle ? ` for ${jobTitle}` : '';

  // Natural opening
  paragraphs.push(`They recorded a video introduction${roleContext}.`);
  
  if (videoData && videoData.duration) {
    const minutes = Math.floor(videoData.duration / 60);
    const seconds = videoData.duration % 60;
    
    if (minutes > 2) {
      paragraphs.push(`They took their time with it—${minutes} minutes and ${seconds} seconds. Shows they put thought into presenting themselves.`);
    } else if (minutes >= 1) {
      paragraphs.push(`It's about ${minutes} minute${minutes !== 1 ? 's' : ''} long, which is a good length to get a sense of who they are.`);
    } else if (seconds < 30) {
      paragraphs.push(`It's just ${seconds} seconds—pretty brief. Might indicate they rushed through it or weren't sure what to say.`);
    } else {
      paragraphs.push(`It's ${seconds} seconds long—short but sometimes that's all you need.`);
    }
  }
  
  paragraphs.push(`I'd recommend watching it yourself—video intros are often the best way to get a feel for someone's personality, communication style, and presence that doesn't come through on paper.`);

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/best way to get a feel/gi, "a way to see more about");
  }
  return narrative;
}

function buildChatSimulationNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected, chatSimulationData, jobTitle } = input;
  const paragraphs: string[] = [];

  const roleContext = jobTitle ? ` for ${jobTitle}` : '';

  if (chatSimulationData) {
    const { 
      score, scenario, messageCount, evaluation, recommendation, passed, messages,
      empathy, problemSolving, communication, professionalism,
      strengths, improvements, overallFeedback, antiCheatSummary 
    } = chatSimulationData;
    
    // Natural opening based on performance
    if (score !== undefined) {
      if (score >= 80) {
        paragraphs.push(`They handled the customer simulation really well${roleContext}, scoring ${score} out of 100. Showed they can think on their feet and keep customers happy.`);
      } else if (score >= 60) {
        paragraphs.push(`They did okay in the customer simulation${roleContext}—${score} out of 100. Not bad, but there's room to sharpen their approach.`);
      } else if (score >= 40) {
        paragraphs.push(`The customer simulation${roleContext} was a struggle for them—just ${score} out of 100. They had trouble navigating the customer's needs effectively.`);
      } else {
        paragraphs.push(`In the customer simulation${roleContext}, they scored just ${score} out of 100—struggling with the basics of customer interaction. This is a concern for any customer-facing role.`);
      }
    } else {
      paragraphs.push(`They completed the customer support simulation${roleContext}.`);
    }
    
    // Scenario context - natural mention
    if (scenario) {
      paragraphs.push(`The scenario involved ${scenario.toLowerCase()}.`);
    }
    
    // Rubric breakdown - woven into narrative naturally
    const rubricInsights: string[] = [];
    if (empathy !== undefined) {
      if (empathy >= 80) rubricInsights.push("showed genuine empathy");
      else if (empathy < 50) rubricInsights.push("struggled to show empathy");
    }
    if (problemSolving !== undefined) {
      if (problemSolving >= 80) rubricInsights.push("solved problems effectively");
      else if (problemSolving < 50) rubricInsights.push("had trouble problem-solving");
    }
    if (communication !== undefined) {
      if (communication >= 80) rubricInsights.push("communicated clearly");
      else if (communication < 50) rubricInsights.push("communication was unclear at times");
    }
    if (professionalism !== undefined) {
      if (professionalism >= 80) rubricInsights.push("stayed professional throughout");
      else if (professionalism < 50) rubricInsights.push("professionalism could use work");
    }
    
    if (rubricInsights.length > 0) {
      if (rubricInsights.length === 1) {
        paragraphs.push(`Notably, they ${rubricInsights[0]}.`);
      } else {
        const lastInsight = rubricInsights.pop();
        paragraphs.push(`Looking at the breakdown: they ${rubricInsights.join(", ")}, and ${lastInsight}.`);
      }
    }
    
    // Strengths - natural flow
    if (strengths && strengths.length > 0) {
      if (strengths.length === 1) {
        paragraphs.push(`One thing that stood out: ${strengths[0].toLowerCase()}.`);
      } else {
        paragraphs.push(`Things they did well: ${strengths.slice(0, 3).map(s => s.toLowerCase()).join(", ")}.`);
      }
    }
    
    // Areas for improvement - conversational
    if (improvements && improvements.length > 0) {
      if (improvements.length === 1) {
        paragraphs.push(`The main area to work on: ${improvements[0].toLowerCase()}.`);
      } else {
        paragraphs.push(`Areas that need work: ${improvements.slice(0, 3).map(i => i.toLowerCase()).join(", ")}.`);
      }
    }
    
    // Overall feedback from AI - integrate naturally
    if (overallFeedback && overallFeedback.length > 10) {
      paragraphs.push(overallFeedback);
    } else if (evaluation && evaluation.length > 10) {
      paragraphs.push(evaluation);
    }
    
    // Anti-cheat violations - conversational
    if (antiCheatSummary && antiCheatSummary.hasViolations) {
      const parts: string[] = [];
      if (antiCheatSummary.tabSwitches) parts.push(`switched tabs ${antiCheatSummary.tabSwitches} time${antiCheatSummary.tabSwitches !== 1 ? 's' : ''}`);
      if (antiCheatSummary.copyPasteAttempts) parts.push(`tried to copy/paste ${antiCheatSummary.copyPasteAttempts} time${antiCheatSummary.copyPasteAttempts !== 1 ? 's' : ''}`);
      
      if (parts.length > 0) {
        paragraphs.push(`I should mention—they ${parts.join(" and ")} during the simulation, which could mean they were looking for help outside the exercise.`);
      }
    }
    
    // Message analysis (fallback if no rubric data) - natural observations
    if (!rubricInsights.length && messages && messages.length > 0) {
      const candidateMessages = messages.filter(m => m.role === 'user' || m.role === 'candidate');
      if (candidateMessages.length > 0) {
        const shortResponses = candidateMessages.filter(m => m.content.length < 30).length;
        const detailedResponses = candidateMessages.filter(m => m.content.length > 100).length;
        
        if (shortResponses > candidateMessages.length / 2) {
          paragraphs.push(`Their responses tended to be brief—for customer service, you usually want someone who gives more thorough answers.`);
        } else if (detailedResponses > candidateMessages.length / 2) {
          paragraphs.push(`They gave detailed, thorough responses, which is what you want for handling complex customer issues.`);
        }
        
        const empathyPhrases = candidateMessages.filter(m => 
          /sorry|understand|frustrating|help you|apologize|appreciate/i.test(m.content)
        ).length;
        
        if (empathyPhrases >= 2) {
          paragraphs.push(`They showed good empathy throughout—acknowledging the customer's feelings and apologizing where appropriate.`);
        } else if (candidateMessages.length >= 3 && empathyPhrases === 0) {
          paragraphs.push(`I didn't see much empathy language in their responses—that's something they'd need coaching on.`);
        }
      }
    }
    
    // Recommendation - natural closing
    if (recommendation && recommendation.length > 5) {
      if (recommendation.toLowerCase().includes('not recommend') || recommendation.toLowerCase().includes('pass on')) {
        paragraphs.push(`Based on this simulation, I'd lean toward passing on this candidate for customer-facing work.`);
      } else if (recommendation.toLowerCase().includes('recommend') || recommendation.toLowerCase().includes('proceed')) {
        paragraphs.push(`Overall, I think they've got the foundation to handle customer interactions.`);
      }
    }
    
  } else {
    paragraphs.push(`They completed the chat simulation${roleContext}. ${baseFacts}`);
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/handled the customer simulation really well/gi, "completed the customer simulation");
  }
  return narrative;
}

function buildChatInterviewNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected, chatInterviewData, jobTitle } = input;
  const paragraphs: string[] = [];

  const roleContext = jobTitle ? ` for ${jobTitle}` : '';

  if (chatInterviewData) {
    const { 
      score, overallScore, messageCount, duration, summary, messages,
      communication, technicalKnowledge, problemSolving, enthusiasm,
      strengths, improvements, overallFeedback
    } = chatInterviewData;
    const finalScore = score || overallScore;
    
    // Natural opening based on score
    if (finalScore !== undefined) {
      if (finalScore >= 80) {
        paragraphs.push(`The chat interview went great${roleContext}—they scored ${finalScore} out of 100. Came across as engaged, knowledgeable, and well-prepared.`);
      } else if (finalScore >= 60) {
        paragraphs.push(`The chat interview was solid${roleContext}, scoring ${finalScore} out of 100. Good enough to warrant further consideration.`);
      } else {
        paragraphs.push(`The chat interview${roleContext} revealed some gaps. They scored ${finalScore} out of 100, which suggests they'd need development in key areas.`);
      }
    } else {
      paragraphs.push(`They completed the chat interview${roleContext}.`);
    }
    
    // Rubric breakdown - woven into narrative
    const insights: string[] = [];
    if (communication !== undefined) {
      if (communication >= 80) insights.push("communicated clearly and confidently");
      else if (communication < 50) insights.push("communication could be clearer");
    }
    if (technicalKnowledge !== undefined) {
      if (technicalKnowledge >= 80) insights.push("demonstrated solid technical knowledge");
      else if (technicalKnowledge < 50) insights.push("showed gaps in technical understanding");
    }
    if (problemSolving !== undefined) {
      if (problemSolving >= 80) insights.push("approached problems methodically");
      else if (problemSolving < 50) insights.push("struggled with problem-solving questions");
    }
    if (enthusiasm !== undefined) {
      if (enthusiasm >= 80) insights.push("seemed genuinely enthusiastic about the role");
      else if (enthusiasm < 50) insights.push("didn't show much enthusiasm");
    }
    
    if (insights.length > 0) {
      if (insights.length === 1) {
        paragraphs.push(`Notably, they ${insights[0]}.`);
      } else {
        const lastInsight = insights.pop();
        paragraphs.push(`Looking at the details: they ${insights.join(", ")}, and ${lastInsight}.`);
      }
    }
    
    // Strengths - conversational
    if (strengths && strengths.length > 0) {
      paragraphs.push(`What stood out: ${strengths.slice(0, 3).map(s => s.toLowerCase()).join(", ")}.`);
    }
    
    // Areas for improvement - natural
    if (improvements && improvements.length > 0) {
      paragraphs.push(`Areas to develop: ${improvements.slice(0, 3).map(i => i.toLowerCase()).join(", ")}.`);
    }
    
    // Overall feedback
    if (overallFeedback && overallFeedback.length > 10) {
      paragraphs.push(overallFeedback);
    } else if (summary && summary.length > 10) {
      paragraphs.push(summary);
    }
    
    // Session details - casual mention
    if (messageCount && duration) {
      const minutes = Math.round(duration / 60);
      if (minutes >= 10) {
        paragraphs.push(`They were engaged throughout—${messageCount} messages exchanged over about ${minutes} minutes.`);
      }
    }
    
  } else {
    paragraphs.push(`They completed the chat interview${roleContext}. ${baseFacts}`);
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/went great/gi, "was completed");
  }
  return narrative;
}

function buildSalesSimulationNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected, salesSimulationData, jobTitle } = input;
  const paragraphs: string[] = [];

  const roleContext = jobTitle ? ` for ${jobTitle}` : '';

  if (salesSimulationData) {
    const { 
      score, evaluation, recommendation, passed, messages,
      rapport, needsDiscovery, productKnowledge, objectionHandling, closingSkills,
      strengths, improvements, overallFeedback, antiCheatSummary
    } = salesSimulationData;
    
    // Natural opening based on performance
    if (score !== undefined) {
      if (score >= 85) {
        paragraphs.push(`They crushed the sales simulation${roleContext}—${score} out of 100. Natural sales instincts and good technique throughout.`);
      } else if (score >= 70) {
        paragraphs.push(`They did well in the sales simulation${roleContext}, scoring ${score} out of 100. Solid fundamentals with some areas to refine.`);
      } else if (score >= 50) {
        paragraphs.push(`The sales simulation${roleContext} was mixed—${score} out of 100. They've got potential but need more polish on their approach.`);
      } else {
        paragraphs.push(`The sales simulation${roleContext} was a struggle, scoring just ${score} out of 100. They'd need significant coaching to be effective in a sales role.`);
      }
    } else {
      paragraphs.push(`They completed the sales simulation${roleContext}.`);
    }
    
    // Rubric breakdown - woven into narrative naturally
    const salesInsights: string[] = [];
    if (rapport !== undefined) {
      if (rapport >= 80) salesInsights.push("built good rapport with the prospect");
      else if (rapport < 50) salesInsights.push("struggled to build rapport");
    }
    if (needsDiscovery !== undefined) {
      if (needsDiscovery >= 80) salesInsights.push("asked smart discovery questions");
      else if (needsDiscovery < 50) salesInsights.push("missed opportunities to understand needs");
    }
    if (productKnowledge !== undefined) {
      if (productKnowledge >= 80) salesInsights.push("knew the product well");
      else if (productKnowledge < 50) salesInsights.push("seemed uncertain about product details");
    }
    if (objectionHandling !== undefined) {
      if (objectionHandling >= 80) salesInsights.push("handled objections smoothly");
      else if (objectionHandling < 50) salesInsights.push("got flustered by objections");
    }
    if (closingSkills !== undefined) {
      if (closingSkills >= 80) salesInsights.push("closed confidently");
      else if (closingSkills < 50) salesInsights.push("didn't really try to close");
    }
    
    if (salesInsights.length > 0) {
      if (salesInsights.length === 1) {
        paragraphs.push(`Notably, they ${salesInsights[0]}.`);
      } else {
        const lastInsight = salesInsights.pop();
        paragraphs.push(`Breaking it down: they ${salesInsights.join(", ")}, and ${lastInsight}.`);
      }
    }
    
    // Strengths - natural
    if (strengths && strengths.length > 0) {
      paragraphs.push(`What they did well: ${strengths.slice(0, 3).map(s => s.toLowerCase()).join(", ")}.`);
    }
    
    // Areas for improvement - conversational
    if (improvements && improvements.length > 0) {
      paragraphs.push(`What they need to work on: ${improvements.slice(0, 3).map(i => i.toLowerCase()).join(", ")}.`);
    }
    
    // Overall feedback
    if (overallFeedback && overallFeedback.length > 10) {
      paragraphs.push(overallFeedback);
    } else if (evaluation && evaluation.length > 10) {
      paragraphs.push(evaluation);
    }
    
    // Anti-cheat violations - casual mention
    if (antiCheatSummary && antiCheatSummary.hasViolations) {
      paragraphs.push(`I noticed they stepped away from the simulation ${antiCheatSummary.violationCount} time${antiCheatSummary.violationCount !== 1 ? 's' : ''}—might have been looking for help.`);
    }
    
    // Conversation analysis fallback
    if (!salesInsights.length && messages && messages.length > 0) {
      const candidateMessages = messages.filter(m => m.role === 'user' || m.role === 'candidate');
      if (candidateMessages.length >= 3) {
        const closingKeywords = candidateMessages.some(m => 
          /shall we proceed|ready to|sign up|get started|next step/i.test(m.content)
        );
        if (closingKeywords) {
          paragraphs.push(`They made efforts to move the conversation toward a close, which shows some sales instinct.`);
        } else {
          paragraphs.push(`They didn't really try to close the deal—something a good sales rep would push for.`);
        }
      }
    }
    
    // Recommendation - natural closing
    if (recommendation && recommendation.length > 5) {
      if (recommendation.toLowerCase().includes('not recommend') || recommendation.toLowerCase().includes('pass')) {
        paragraphs.push(`Based on this, I'd have concerns about putting them in a sales role.`);
      } else if (recommendation.toLowerCase().includes('recommend') || recommendation.toLowerCase().includes('proceed')) {
        paragraphs.push(`Overall, they've shown they can handle the sales conversation.`);
      }
    }
    
  } else {
    paragraphs.push(`They completed the sales simulation${roleContext}. ${baseFacts}`);
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/crushed the sales simulation/gi, "completed the sales simulation");
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
      return buildChatInterviewNarrative(input);
    case "sales_simulation":
      return buildSalesSimulationNarrative(input);
    default:
      return buildGenericNarrative(input);
  }
}
