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

  const roleContext = jobTitle ? ` for the ${jobTitle} role` : '';

  if (quizData && quizData.answers && quizData.answers.length > 0) {
    const { answers, score, correct, total, passed, antiCheatViolations, totalViolations } = quizData;
    
    // Separate multiple choice vs text questions
    const mcQuestions = answers.filter(a => a.questionType === 'multiple_choice' && a.isCorrect !== null);
    const textQuestions = answers.filter(a => a.questionType === 'text');
    const correctMC = mcQuestions.filter(a => a.isCorrect === true);
    const incorrectMC = mcQuestions.filter(a => a.isCorrect === false);
    
    // Natural opening based on performance
    if (passed && score >= 80) {
      paragraphs.push(`They did well on the knowledge assessment${roleContext}, getting ${correctMC.length} out of ${mcQuestions.length} questions right for a ${score}% score. That's a solid foundation.`);
    } else if (passed) {
      paragraphs.push(`They passed the knowledge assessment${roleContext} with a ${score}% score—${correctMC.length} out of ${mcQuestions.length} correct. Not perfect, but they cleared the bar.`);
    } else {
      paragraphs.push(`They struggled with the knowledge assessment${roleContext}, scoring just ${score}%—only ${correctMC.length} out of ${mcQuestions.length} questions right. That's below what I'd need to feel confident moving forward.`);
    }
    
    // Knowledge gap analysis - describe what they got wrong naturally
    if (incorrectMC.length > 0) {
      const wrongDescriptions: string[] = [];
      for (const wrong of incorrectMC.slice(0, 3)) {
        const qLower = wrong.question.toLowerCase();
        const answerText = wrong.selectedAnswerText?.toLowerCase() || '';
        
        if (answerText === 'not answered' || !answerText) {
          // Describe what they skipped
          if (qLower.includes('customer')) {
            wrongDescriptions.push("skipped a question about handling customer situations");
          } else if (qLower.includes('multitask')) {
            wrongDescriptions.push("left the multitasking question blank");
          } else {
            wrongDescriptions.push("left a key question unanswered");
          }
        } else {
          // Describe their incorrect thinking
          if (qLower.includes('transfer') && answerText.includes('transfer')) {
            wrongDescriptions.push("said they'd transfer a customer immediately without explanation");
          } else if (qLower.includes('unsure') && (answerText.includes("don't know") || answerText.includes('end'))) {
            wrongDescriptions.push("would tell customers they don't know and end the conversation");
          } else if (qLower.includes('multitask') && answerText.includes('false')) {
            wrongDescriptions.push("incorrectly answered that multitasking isn't important");
          } else {
            // Generic but still natural
            const topicHint = qLower.length > 50 ? qLower.substring(0, 50) : qLower;
            wrongDescriptions.push(`got the question about "${topicHint}..." wrong`);
          }
        }
      }
      
      if (wrongDescriptions.length > 0) {
        if (wrongDescriptions.length === 1) {
          paragraphs.push(`Looking at what they missed: they ${wrongDescriptions[0]}. That's a fundamental concept for this kind of role.`);
        } else {
          const lastItem = wrongDescriptions.pop();
          paragraphs.push(`Looking at what they missed: they ${wrongDescriptions.join(", ")}, and ${lastItem}. These are fundamental concepts for this role.`);
        }
      }
    }
    
    // Open-ended response quality - natural description
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
        paragraphs.push(`On the written questions, they gave bare-minimum answers across the board—single words or vague responses that don't show any real thought.`);
      } else if (textLowEffortCount > textQuestions.length / 2) {
        paragraphs.push(`Most of their written responses were pretty thin—minimal effort that makes me wonder how seriously they're taking this.`);
      } else if (textLowEffortCount > 0) {
        paragraphs.push(`Some of their written responses were thoughtful, but ${textLowEffortCount} of them looked like minimal effort.`);
      } else {
        paragraphs.push(`On the written questions, they put in solid effort—thoughtful answers that show they're engaged.`);
      }
    }
    
    // Anti-cheat violations - more conversational
    if (totalViolations && totalViolations > 0 && antiCheatViolations) {
      const tabSwitches = antiCheatViolations.filter(v => v.type === 'tab_switch').length;
      const copyAttempts = antiCheatViolations.filter(v => v.type === 'copy_attempt').length;
      const pasteAttempts = antiCheatViolations.filter(v => v.type === 'paste_attempt').length;
      
      const parts: string[] = [];
      if (tabSwitches > 0) parts.push(`switched tabs ${tabSwitches} time${tabSwitches !== 1 ? 's' : ''}`);
      if (copyAttempts > 0) parts.push(`tried to copy text ${copyAttempts} time${copyAttempts !== 1 ? 's' : ''}`);
      if (pasteAttempts > 0) parts.push(`attempted to paste ${pasteAttempts} time${pasteAttempts !== 1 ? 's' : ''}`);
      
      if (parts.length > 0) {
        paragraphs.push(`I also noticed some potential integrity issues—they ${parts.join(" and ")} during the assessment, which could indicate they were looking up answers.`);
      }
    }
    
    // Training recommendation - natural advice
    if (!passed || score < 60) {
      if (textLowEffortCount > textQuestions.length / 2) {
        paragraphs.push(`If you did decide to bring them on, they'd need significant training on these fundamentals—and honestly, the low-effort written answers make me wonder about their commitment level.`);
      } else {
        paragraphs.push(`If you did move forward with them, expect to invest in training on these knowledge areas.`);
      }
    }
    
  } else {
    // Fallback - still make it natural
    const scoreMatch = baseFacts.match(/(\d+)%/);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[1], 10);
      if (score >= 80) {
        paragraphs.push(`They did well on the quiz${roleContext} with a ${score}% score—shows they've got the knowledge base.`);
      } else if (score >= 60) {
        paragraphs.push(`They got a ${score}% on the quiz${roleContext}. Adequate, though there are some gaps to be aware of.`);
      } else {
        paragraphs.push(`The quiz${roleContext} was rough—only ${score}%. Significant knowledge gaps here.`);
      }
    } else {
      paragraphs.push(`They completed the quiz${roleContext}. ${baseFacts}`);
    }
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/They did well/gi, "They completed the quiz");
  }
  return narrative;
}

function buildTypingNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected, typingData, jobTitle } = input;
  const paragraphs: string[] = [];

  const roleContext = jobTitle ? ` for ${jobTitle}` : '';

  if (typingData) {
    const { wpm, accuracy, passed, requiredWpm } = typingData;
    
    // Natural opening that tells a story
    if (requiredWpm) {
      if (wpm >= requiredWpm + 20) {
        paragraphs.push(`Their typing came in at ${wpm} WPM with ${accuracy}% accuracy—well above the ${requiredWpm} WPM we're looking for${roleContext}. Speed won't be a bottleneck here.`);
      } else if (wpm >= requiredWpm) {
        paragraphs.push(`They hit ${wpm} WPM with ${accuracy}% accuracy, which meets our requirement of ${requiredWpm} WPM${roleContext}. They cleared the bar.`);
      } else {
        const gap = requiredWpm - wpm;
        paragraphs.push(`Their typing came in at ${wpm} WPM, which is ${gap} words per minute below our ${requiredWpm} WPM requirement${roleContext}. Accuracy was ${accuracy}%.`);
        paragraphs.push(`For a role that requires regular typing, this could slow down their productivity.`);
      }
    } else {
      // No requirement set - give context
      paragraphs.push(`They typed at ${wpm} WPM with ${accuracy}% accuracy.`);
      
      if (wpm >= 70) {
        paragraphs.push(`That's above average—they'd handle high-volume typing work without issues.`);
      } else if (wpm >= 50) {
        paragraphs.push(`That's about average, fine for moderate typing needs.`);
      } else if (wpm >= 35) {
        paragraphs.push(`That's below average, which could be limiting if the role involves a lot of typing.`);
      } else {
        paragraphs.push(`That's pretty slow—something to consider if typing is a regular part of the job.`);
      }
    }
    
    // Accuracy insight - woven in naturally
    if (accuracy >= 98) {
      paragraphs.push(`The near-perfect accuracy shows good attention to detail.`);
    } else if (accuracy < 90) {
      paragraphs.push(`The ${accuracy}% accuracy means they're making fairly frequent errors—might need to slow down.`);
    }
    
    // Speed vs accuracy trade-off - natural observation
    if (wpm >= 60 && accuracy < 92) {
      paragraphs.push(`Looks like they prioritized speed over accuracy—something to keep in mind.`);
    } else if (wpm < 45 && accuracy >= 98) {
      paragraphs.push(`They were clearly being careful to avoid mistakes, which is why the speed is lower.`);
    }
    
  } else {
    // Fallback - still natural
    const wpmMatch = baseFacts.match(/(\d+)\s*WPM/i);
    const accMatch = baseFacts.match(/(\d+)%/);
    
    if (wpmMatch) {
      const wpm = parseInt(wpmMatch[1], 10);
      paragraphs.push(`They typed at ${wpm} WPM${accMatch ? ` with ${accMatch[1]}% accuracy` : ''}${roleContext}.`);
      if (wpm < 40) {
        paragraphs.push(`That's on the slower side for most typing-heavy roles.`);
      }
    } else {
      paragraphs.push(`They completed the typing test${roleContext}. ${baseFacts}`);
    }
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/Speed won't be a bottleneck/gi, "Typing test completed");
  }
  return narrative;
}

function buildVoiceInterviewNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, voiceInterviewResult, wasRejected, voiceData, jobTitle } = input;
  const paragraphs: string[] = [];

  const roleContext = jobTitle ? ` for ${jobTitle}` : '';
  
  // Use voiceData if available, otherwise fall back to voiceInterviewResult
  const data = voiceData || voiceInterviewResult;
  
  if (data) {
    const score = data.overall_score || data.overallScore;
    
    // Natural opening based on score
    if (score !== undefined) {
      if (score >= 80) {
        paragraphs.push(`The voice interview went really well${roleContext}. They came across confident and articulate, scoring ${score} out of 100.`);
      } else if (score >= 60) {
        paragraphs.push(`The voice interview was decent${roleContext}—they scored ${score} out of 100. Solid, but not outstanding.`);
      } else {
        paragraphs.push(`The voice interview${roleContext} revealed some areas for development. They scored ${score} out of 100, which suggests they'd need coaching on their communication skills.`);
      }
    } else {
      paragraphs.push(`They completed the voice interview${roleContext}.`);
    }
    
    // Question-by-question analysis if available - natural flow
    if (data.questions && data.questions.length > 0) {
      const strongAnswers = data.questions.filter(q => q.score && q.score >= 80);
      const weakAnswers = data.questions.filter(q => q.score && q.score < 60);
      
      if (strongAnswers.length > 0 && weakAnswers.length > 0) {
        const strongTopic = strongAnswers[0].question.length > 40 
          ? strongAnswers[0].question.substring(0, 40) + "..." 
          : strongAnswers[0].question;
        const weakTopic = weakAnswers[0].question.length > 40 
          ? weakAnswers[0].question.substring(0, 40) + "..." 
          : weakAnswers[0].question;
        paragraphs.push(`They shined when talking about "${strongTopic}" but struggled with "${weakTopic}"—worth probing in a follow-up conversation.`);
      } else if (strongAnswers.length > 0) {
        paragraphs.push(`They gave particularly strong answers throughout, especially on topics like their experience and motivation.`);
      } else if (weakAnswers.length > 0) {
        const weakTopic = weakAnswers[0].question.length > 40 
          ? weakAnswers[0].question.substring(0, 40) + "..." 
          : weakAnswers[0].question;
        paragraphs.push(`They struggled with questions like "${weakTopic}"—you might want to dig deeper there if you meet with them.`);
      }
    }
    
    // Summary insight - integrate naturally
    if (data.summary && data.summary.length > 10) {
      const summaryPreview = data.summary.length > 180 
        ? data.summary.substring(0, 180) + "..." 
        : data.summary;
      paragraphs.push(summaryPreview);
    }
    
    // Duration - casual mention
    if (data.duration) {
      const minutes = Math.round(data.duration / 60);
      if (minutes > 10) {
        paragraphs.push(`They took their time with it—about ${minutes} minutes total.`);
      } else if (minutes < 3) {
        paragraphs.push(`It was a quick interview, just ${minutes} minute${minutes !== 1 ? 's' : ''}—might indicate they rushed through it.`);
      }
    }
    
  } else {
    paragraphs.push(`They completed the voice interview${roleContext}. ${baseFacts}`);
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/went really well/gi, "was completed");
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
