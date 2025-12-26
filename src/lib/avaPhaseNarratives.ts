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
  questions?: Array<{
    question: string;
    answer?: string;
    score?: number;
    feedback?: string;
  }>;
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

  const roleContext = jobTitle ? ` for the ${jobTitle} position` : '';

  if (quizData && quizData.answers && quizData.answers.length > 0) {
    const { answers, score, correct, total, passed, antiCheatViolations, totalViolations } = quizData;
    
    // Separate multiple choice vs text questions
    const mcQuestions = answers.filter(a => a.questionType === 'multiple_choice' && a.isCorrect !== null);
    const textQuestions = answers.filter(a => a.questionType === 'text');
    const correctMC = mcQuestions.filter(a => a.isCorrect === true);
    const incorrectMC = mcQuestions.filter(a => a.isCorrect === false);
    
    // Dynamic opening based on performance
    if (passed && score >= 80) {
      paragraphs.push(`Strong knowledge demonstration${roleContext}. ${mcQuestions.length > 0 ? `${correctMC.length}/${mcQuestions.length} correct (${score}%)` : `Score: ${score}%`}.`);
    } else if (passed) {
      paragraphs.push(`Passed the assessment${roleContext} with ${score}%. ${mcQuestions.length > 0 ? `${correctMC.length}/${mcQuestions.length} questions correct.` : ''}`);
    } else {
      paragraphs.push(`Did not meet passing threshold${roleContext}. Score: ${score}%. ${mcQuestions.length > 0 ? `${correctMC.length}/${mcQuestions.length} correct.` : ''}`);
    }
    
    // Knowledge gap analysis - what topics they struggled with
    if (incorrectMC.length > 0) {
      const wrongTopics: string[] = [];
      for (const wrong of incorrectMC.slice(0, 3)) {
        const qSnippet = wrong.question.length > 60 
          ? wrong.question.substring(0, 60) + "..." 
          : wrong.question;
        if (wrong.selectedAnswerText.toLowerCase() !== 'not answered') {
          wrongTopics.push(`"${qSnippet}" → answered "${wrong.selectedAnswerText.substring(0, 40)}"`);
        } else {
          wrongTopics.push(`"${qSnippet}" → left unanswered`);
        }
      }
      
      if (wrongTopics.length > 0) {
        paragraphs.push(`Knowledge gaps:\n• ${wrongTopics.join('\n• ')}`);
      }
    }
    
    // Open-ended response quality
    let textLowEffortCount = 0;
    if (textQuestions.length > 0) {
      const textInsights: string[] = [];
      
      for (const tq of textQuestions) {
        const answer = tq.textAnswer || tq.selectedAnswerText || '';
        
        if (!answer || answer.trim().length < 10 || 
            /^(i don'?t know|idk|n\/?a|none|no|yes|\?+|\.+|test|asdf|dasd|[a-z]{1,5}s?)$/i.test(answer.trim())) {
          textLowEffortCount++;
        }
      }
      
      if (textLowEffortCount > 0) {
        paragraphs.push(`Open-ended responses: ${textLowEffortCount}/${textQuestions.length} showed minimal effort.`);
      } else if (textQuestions.length > 0) {
        paragraphs.push(`Open-ended responses: Provided thoughtful answers to all ${textQuestions.length} questions.`);
      }
    }
    
    // Anti-cheat violations
    if (totalViolations && totalViolations > 0 && antiCheatViolations) {
      const tabSwitches = antiCheatViolations.filter(v => v.type === 'tab_switch').length;
      const copyAttempts = antiCheatViolations.filter(v => v.type === 'copy_attempt').length;
      const pasteAttempts = antiCheatViolations.filter(v => v.type === 'paste_attempt').length;
      
      const violationParts: string[] = [];
      if (tabSwitches > 0) violationParts.push(`${tabSwitches} tab switch${tabSwitches !== 1 ? 'es' : ''}`);
      if (copyAttempts > 0) violationParts.push(`${copyAttempts} copy attempt${copyAttempts !== 1 ? 's' : ''}`);
      if (pasteAttempts > 0) violationParts.push(`${pasteAttempts} paste attempt${pasteAttempts !== 1 ? 's' : ''}`);
      
      if (violationParts.length > 0) {
        paragraphs.push(`⚠️ Integrity: ${totalViolations} violation${totalViolations !== 1 ? 's' : ''} detected (${violationParts.join(", ")}).`);
      }
    }
    
    // Training recommendation if applicable
    if (!passed || score < 60) {
      if (textLowEffortCount > textQuestions.length / 2) {
        paragraphs.push(`If hired: Would need substantial training and should demonstrate more commitment in assessments.`);
      } else {
        paragraphs.push(`If hired: Would need focused training on the knowledge areas tested.`);
      }
    }
    
  } else {
    // Fallback
    const scoreMatch = baseFacts.match(/(\d+)%/);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[1], 10);
      paragraphs.push(`Quiz score${roleContext}: ${score}%.`);
      
      if (score >= 80) {
        paragraphs.push("Solid knowledge base demonstrated.");
      } else if (score >= 60) {
        paragraphs.push("Adequate knowledge with some gaps.");
      } else {
        paragraphs.push("Significant knowledge gaps identified.");
      }
    } else {
      paragraphs.push(baseFacts);
    }
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/Strong knowledge demonstration/gi, "Quiz completed");
  }
  return narrative;
}

function buildTypingNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected, typingData, jobTitle } = input;
  const paragraphs: string[] = [];

  const roleContext = jobTitle ? ` for the ${jobTitle} role` : '';

  if (typingData) {
    const { wpm, accuracy, passed, requiredWpm } = typingData;
    
    // Dynamic opening based on performance
    if (requiredWpm) {
      if (wpm >= requiredWpm + 20) {
        paragraphs.push(`Excellent typing speed${roleContext}: ${wpm} WPM (${accuracy}% accuracy). Exceeds requirement of ${requiredWpm} WPM by ${wpm - requiredWpm} words.`);
      } else if (wpm >= requiredWpm) {
        paragraphs.push(`Meets typing requirement${roleContext}: ${wpm} WPM with ${accuracy}% accuracy. Required: ${requiredWpm} WPM.`);
      } else {
        paragraphs.push(`Below typing requirement${roleContext}: ${wpm} WPM (required: ${requiredWpm} WPM). Accuracy: ${accuracy}%.`);
      }
    } else {
      paragraphs.push(`Typing test result: ${wpm} WPM with ${accuracy}% accuracy.`);
      
      if (wpm >= 70) {
        paragraphs.push("Speed: Above average, suitable for high-volume typing roles.");
      } else if (wpm >= 50) {
        paragraphs.push("Speed: Average, suitable for moderate typing requirements.");
      } else if (wpm >= 35) {
        paragraphs.push("Speed: Below average, may be limiting for typing-intensive roles.");
      } else {
        paragraphs.push("Speed: Slow, would be a concern for roles requiring regular typing.");
      }
    }
    
    // Accuracy assessment
    if (accuracy >= 98) {
      paragraphs.push("Accuracy: Near-perfect, shows attention to detail.");
    } else if (accuracy >= 95) {
      paragraphs.push("Accuracy: Good, minimal errors.");
    } else if (accuracy >= 90) {
      paragraphs.push("Accuracy: Moderate, some errors observed.");
    } else {
      paragraphs.push("Accuracy: Needs improvement, frequent errors.");
    }
    
    // Speed vs accuracy trade-off
    if (wpm >= 60 && accuracy < 92) {
      paragraphs.push("Note: Prioritized speed over accuracy.");
    } else if (wpm < 45 && accuracy >= 98) {
      paragraphs.push("Note: Prioritized accuracy over speed.");
    }
    
  } else {
    // Fallback
    const wpmMatch = baseFacts.match(/(\d+)\s*WPM/i);
    const accMatch = baseFacts.match(/(\d+)%/);
    
    if (wpmMatch) {
      paragraphs.push(`Typing result${roleContext}: ${wpmMatch[1]} WPM${accMatch ? ` with ${accMatch[1]}% accuracy` : ''}.`);
    } else {
      paragraphs.push(baseFacts);
    }
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/Excellent typing speed/gi, "Typing speed recorded");
  }
  return narrative;
}

function buildVoiceInterviewNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, voiceInterviewResult, wasRejected, voiceData, jobTitle } = input;
  const paragraphs: string[] = [];

  const roleContext = jobTitle ? ` for the ${jobTitle} position` : '';
  
  // Use voiceData if available, otherwise fall back to voiceInterviewResult
  const data = voiceData || voiceInterviewResult;
  
  if (data) {
    const score = data.overall_score || data.overallScore;
    
    // Dynamic opening based on score
    if (score !== undefined) {
      if (score >= 80) {
        paragraphs.push(`Strong interview performance${roleContext}. Overall score: ${score}/100.`);
      } else if (score >= 60) {
        paragraphs.push(`Adequate interview performance${roleContext}. Score: ${score}/100.`);
      } else {
        paragraphs.push(`Interview revealed areas for development${roleContext}. Score: ${score}/100.`);
      }
    } else {
      paragraphs.push(`Completed voice interview${roleContext}.`);
    }
    
    // Question-by-question analysis if available
    if (data.questions && data.questions.length > 0) {
      const strongAnswers = data.questions.filter(q => q.score && q.score >= 80);
      const weakAnswers = data.questions.filter(q => q.score && q.score < 60);
      
      if (strongAnswers.length > 0) {
        const strongTopics = strongAnswers.slice(0, 2).map(q => {
          const topic = q.question.length > 40 ? q.question.substring(0, 40) + "..." : q.question;
          return `"${topic}" (${q.score}/100)`;
        });
        paragraphs.push(`Strong answers on: ${strongTopics.join(", ")}.`);
      }
      
      if (weakAnswers.length > 0) {
        const weakTopics = weakAnswers.slice(0, 2).map(q => {
          const topic = q.question.length > 40 ? q.question.substring(0, 40) + "..." : q.question;
          return `"${topic}" (${q.score}/100)`;
        });
        paragraphs.push(`Areas to probe: ${weakTopics.join(", ")}.`);
      }
    }
    
    // Summary insight
    if (data.summary && data.summary.length > 10) {
      const summaryPreview = data.summary.length > 200 
        ? data.summary.substring(0, 200) + "..." 
        : data.summary;
      paragraphs.push(`Summary: ${summaryPreview}`);
    }
    
    // Duration
    if (data.duration) {
      const minutes = Math.round(data.duration / 60);
      paragraphs.push(`Duration: ${minutes} minute${minutes !== 1 ? 's' : ''}.`);
    }
    
  } else {
    paragraphs.push(`Voice interview completed${roleContext}.`);
    paragraphs.push(baseFacts);
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/Strong interview performance/gi, "Interview completed");
  }
  return narrative;
}

function buildPortfolioNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected, portfolioData } = input;
  const paragraphs: string[] = [];

  paragraphs.push("I looked at the work samples they submitted.");

  if (portfolioData) {
    const { score, feedback, fileCount, analysis } = portfolioData;
    
    if (fileCount) {
      paragraphs.push(`They submitted ${fileCount} portfolio item${fileCount !== 1 ? 's' : ''} for review.`);
    }
    
    if (score !== undefined) {
      paragraphs.push(`The portfolio received a score of ${score}/100.`);
      
      if (score >= 85) {
        paragraphs.push("This is impressive work. The quality and presentation show strong technical skills and creativity.");
      } else if (score >= 70) {
        paragraphs.push("The portfolio shows solid skills. The work is competent with some standout pieces.");
      } else if (score >= 50) {
        paragraphs.push("The portfolio is decent but has room for improvement. Some pieces are stronger than others.");
      } else {
        paragraphs.push("The portfolio needs more polish to meet expectations. The work shows potential but isn't quite there yet.");
      }
    }
    
    if (feedback) {
      paragraphs.push(`Specific feedback: ${feedback}`);
    }
    
    if (analysis) {
      paragraphs.push(analysis);
    }
    
  } else {
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
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/strong technical skills/gi, "the work").replace(/creativity/gi, "their approach");
  }
  return narrative;
}

function buildVideoNarrative(input: AvaPhaseNarrativeInput): string {
  const { wasRejected, videoData } = input;
  const paragraphs: string[] = [];

  paragraphs.push("I watched their video introduction.");
  paragraphs.push("The candidate recorded and submitted a video introduction.");
  
  if (videoData && videoData.duration) {
    const minutes = Math.floor(videoData.duration / 60);
    const seconds = videoData.duration % 60;
    if (minutes > 0) {
      paragraphs.push(`The video is ${minutes} minute${minutes !== 1 ? 's' : ''} and ${seconds} second${seconds !== 1 ? 's' : ''} long.`);
    } else {
      paragraphs.push(`The video is ${seconds} second${seconds !== 1 ? 's' : ''} long.`);
    }
  }
  
  paragraphs.push("The video is available for you to review directly — it's often the best way to get a sense of their personality, communication style, and presence.");

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/best way to get a sense/gi, "a way to see");
  }
  return narrative;
}

function buildChatSimulationNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected, chatSimulationData, jobTitle } = input;
  const paragraphs: string[] = [];

  const roleContext = jobTitle ? ` for the ${jobTitle} role` : '';

  if (chatSimulationData) {
    const { 
      score, scenario, messageCount, evaluation, recommendation, passed, messages,
      empathy, problemSolving, communication, professionalism,
      strengths, improvements, overallFeedback, antiCheatSummary 
    } = chatSimulationData;
    
    // Dynamic opening based on performance
    if (score !== undefined) {
      if (score >= 80) {
        paragraphs.push(`Strong performance in the customer support simulation${roleContext}. Score: ${score}/100.`);
      } else if (score >= 60) {
        paragraphs.push(`Adequate performance in the customer simulation${roleContext}. Score: ${score}/100.`);
      } else if (score >= 40) {
        paragraphs.push(`Below-average performance in customer simulation${roleContext}. Score: ${score}/100.`);
      } else {
        paragraphs.push(`Significant challenges observed in customer simulation${roleContext}. Score: ${score}/100.`);
      }
    } else {
      paragraphs.push(`Completed the customer support simulation${roleContext}.`);
    }
    
    // Scenario context
    if (scenario) {
      paragraphs.push(`Scenario: ${scenario}.`);
    }
    
    // Rubric breakdown - show scores for each dimension
    const rubricParts: string[] = [];
    if (empathy !== undefined) rubricParts.push(`Empathy ${empathy}/100`);
    if (problemSolving !== undefined) rubricParts.push(`Problem-Solving ${problemSolving}/100`);
    if (communication !== undefined) rubricParts.push(`Communication ${communication}/100`);
    if (professionalism !== undefined) rubricParts.push(`Professionalism ${professionalism}/100`);
    
    if (rubricParts.length > 0) {
      paragraphs.push(`Rubric: ${rubricParts.join(", ")}.`);
    }
    
    // Strengths
    if (strengths && strengths.length > 0) {
      paragraphs.push(`Strengths: ${strengths.join(", ")}.`);
    }
    
    // Areas for improvement
    if (improvements && improvements.length > 0) {
      paragraphs.push(`Areas for improvement:\n• ${improvements.join("\n• ")}`);
    }
    
    // Overall feedback from AI
    if (overallFeedback) {
      paragraphs.push(`Evaluation: ${overallFeedback}`);
    } else if (evaluation) {
      paragraphs.push(`Analysis: ${evaluation}`);
    }
    
    // Anti-cheat violations
    if (antiCheatSummary && antiCheatSummary.hasViolations) {
      const violationParts: string[] = [];
      if (antiCheatSummary.tabSwitches) violationParts.push(`${antiCheatSummary.tabSwitches} tab switch${antiCheatSummary.tabSwitches !== 1 ? 'es' : ''}`);
      if (antiCheatSummary.copyPasteAttempts) violationParts.push(`${antiCheatSummary.copyPasteAttempts} copy/paste attempt${antiCheatSummary.copyPasteAttempts !== 1 ? 's' : ''}`);
      
      if (violationParts.length > 0) {
        paragraphs.push(`⚠️ Integrity: ${antiCheatSummary.violationCount} violation${antiCheatSummary.violationCount !== 1 ? 's' : ''} detected (${violationParts.join(", ")}).`);
      } else {
        paragraphs.push(`⚠️ Integrity: ${antiCheatSummary.violationCount} violation${antiCheatSummary.violationCount !== 1 ? 's' : ''} detected.`);
      }
    }
    
    // Message analysis (fallback if no rubric data)
    if (!rubricParts.length && messages && messages.length > 0) {
      const candidateMessages = messages.filter(m => m.role === 'user' || m.role === 'candidate');
      if (candidateMessages.length > 0) {
        const shortResponses = candidateMessages.filter(m => m.content.length < 30).length;
        const detailedResponses = candidateMessages.filter(m => m.content.length > 100).length;
        
        if (shortResponses > candidateMessages.length / 2) {
          paragraphs.push(`Response depth: Brief responses throughout. For customer service, more thorough responses are typically expected.`);
        } else if (detailedResponses > candidateMessages.length / 2) {
          paragraphs.push(`Response depth: Provided detailed, thorough responses - good for complex customer issues.`);
        }
        
        // Check for empathy indicators
        const empathyPhrases = candidateMessages.filter(m => 
          /sorry|understand|frustrating|help you|apologize|appreciate/i.test(m.content)
        ).length;
        
        if (empathyPhrases >= 2) {
          paragraphs.push(`Empathy: Showed appropriate empathy and customer acknowledgment.`);
        } else if (candidateMessages.length >= 3 && empathyPhrases === 0) {
          paragraphs.push(`Empathy: Limited empathy language observed - area for coaching.`);
        }
      }
    }
    
    // Recommendation
    if (recommendation) {
      paragraphs.push(`Recommendation: ${recommendation}`);
    }
    
  } else {
    paragraphs.push(`Completed the chat simulation${roleContext}.`);
    paragraphs.push(baseFacts);
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/Strong performance|excellent performance/gi, "Completed the simulation");
  }
  return narrative;
}

function buildChatInterviewNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected, chatInterviewData, jobTitle } = input;
  const paragraphs: string[] = [];

  const roleContext = jobTitle ? ` for the ${jobTitle} position` : '';

  if (chatInterviewData) {
    const { 
      score, overallScore, messageCount, duration, summary, messages,
      communication, technicalKnowledge, problemSolving, enthusiasm,
      strengths, improvements, overallFeedback
    } = chatInterviewData;
    const finalScore = score || overallScore;
    
    // Dynamic opening based on score
    if (finalScore !== undefined) {
      if (finalScore >= 80) {
        paragraphs.push(`Strong chat interview performance${roleContext}. Score: ${finalScore}/100.`);
      } else if (finalScore >= 60) {
        paragraphs.push(`Adequate chat interview performance${roleContext}. Score: ${finalScore}/100.`);
      } else {
        paragraphs.push(`Chat interview revealed areas for development${roleContext}. Score: ${finalScore}/100.`);
      }
    } else {
      paragraphs.push(`Completed the chat interview${roleContext}.`);
    }
    
    // Rubric breakdown
    const rubricParts: string[] = [];
    if (communication !== undefined) rubricParts.push(`Communication ${communication}/100`);
    if (technicalKnowledge !== undefined) rubricParts.push(`Technical Knowledge ${technicalKnowledge}/100`);
    if (problemSolving !== undefined) rubricParts.push(`Problem-Solving ${problemSolving}/100`);
    if (enthusiasm !== undefined) rubricParts.push(`Enthusiasm ${enthusiasm}/100`);
    
    if (rubricParts.length > 0) {
      paragraphs.push(`Rubric: ${rubricParts.join(", ")}.`);
    }
    
    // Strengths
    if (strengths && strengths.length > 0) {
      paragraphs.push(`Strengths: ${strengths.join(", ")}.`);
    }
    
    // Areas for improvement
    if (improvements && improvements.length > 0) {
      paragraphs.push(`Areas for improvement:\n• ${improvements.join("\n• ")}`);
    }
    
    // Overall feedback
    if (overallFeedback) {
      paragraphs.push(`Evaluation: ${overallFeedback}`);
    } else if (summary) {
      paragraphs.push(`Summary: ${summary}`);
    }
    
    // Session details
    if (messageCount && duration) {
      const minutes = Math.round(duration / 60);
      paragraphs.push(`Session: ${messageCount} messages over ${minutes} minute${minutes !== 1 ? 's' : ''}.`);
    } else if (messageCount) {
      paragraphs.push(`Session: ${messageCount} messages exchanged.`);
    }
    
  } else {
    paragraphs.push(`Completed the chat interview${roleContext}.`);
    paragraphs.push(baseFacts);
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/Strong chat interview performance/gi, "Chat interview completed");
  }
  return narrative;
}

function buildSalesSimulationNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected, salesSimulationData, jobTitle } = input;
  const paragraphs: string[] = [];

  const roleContext = jobTitle ? ` for the ${jobTitle} role` : '';

  if (salesSimulationData) {
    const { 
      score, evaluation, recommendation, passed, messages,
      rapport, needsDiscovery, productKnowledge, objectionHandling, closingSkills,
      strengths, improvements, overallFeedback, antiCheatSummary
    } = salesSimulationData;
    
    // Dynamic opening based on performance
    if (score !== undefined) {
      if (score >= 85) {
        paragraphs.push(`Strong sales performance${roleContext}. Score: ${score}/100.`);
      } else if (score >= 70) {
        paragraphs.push(`Adequate sales performance${roleContext}. Score: ${score}/100.`);
      } else if (score >= 50) {
        paragraphs.push(`Below-average sales performance${roleContext}. Score: ${score}/100.`);
      } else {
        paragraphs.push(`Significant challenges in sales simulation${roleContext}. Score: ${score}/100.`);
      }
    } else {
      paragraphs.push(`Completed the sales simulation${roleContext}.`);
    }
    
    // Rubric breakdown - show scores for each dimension
    const rubricParts: string[] = [];
    if (rapport !== undefined) rubricParts.push(`Rapport ${rapport}/100`);
    if (needsDiscovery !== undefined) rubricParts.push(`Needs Discovery ${needsDiscovery}/100`);
    if (productKnowledge !== undefined) rubricParts.push(`Product Knowledge ${productKnowledge}/100`);
    if (objectionHandling !== undefined) rubricParts.push(`Objection Handling ${objectionHandling}/100`);
    if (closingSkills !== undefined) rubricParts.push(`Closing ${closingSkills}/100`);
    
    if (rubricParts.length > 0) {
      paragraphs.push(`Rubric: ${rubricParts.join(", ")}.`);
    }
    
    // Strengths
    if (strengths && strengths.length > 0) {
      paragraphs.push(`Strengths: ${strengths.join(", ")}.`);
    }
    
    // Areas for improvement
    if (improvements && improvements.length > 0) {
      paragraphs.push(`Areas for improvement:\n• ${improvements.join("\n• ")}`);
    }
    
    // Overall feedback
    if (overallFeedback) {
      paragraphs.push(`Evaluation: ${overallFeedback}`);
    } else if (evaluation) {
      paragraphs.push(`Analysis: ${evaluation}`);
    }
    
    // Anti-cheat violations
    if (antiCheatSummary && antiCheatSummary.hasViolations) {
      paragraphs.push(`⚠️ Integrity: ${antiCheatSummary.violationCount} violation${antiCheatSummary.violationCount !== 1 ? 's' : ''} detected.`);
    }
    
    // Recommendation
    if (recommendation) {
      paragraphs.push(`Recommendation: ${recommendation}`);
    }
    
    // Fallback to conversation analysis if no rubric
    if (!rubricParts.length && messages && messages.length > 0) {
      const candidateMessages = messages.filter(m => m.role === 'user' || m.role === 'candidate');
      if (candidateMessages.length >= 3) {
        const closingKeywords = candidateMessages.some(m => 
          /shall we proceed|ready to|sign up|get started|next step/i.test(m.content)
        );
        if (closingKeywords) {
          paragraphs.push("They made appropriate attempts to move the conversation toward a close.");
        }
      }
    }
    
  } else {
    paragraphs.push(`Completed the sales simulation${roleContext}.`);
    paragraphs.push(baseFacts);
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/Strong sales performance/gi, "Sales simulation completed");
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
