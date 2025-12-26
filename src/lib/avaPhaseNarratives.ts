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
}

export interface ChatInterviewPhaseData {
  score?: number;
  overallScore?: number;
  messageCount?: number;
  duration?: number;
  messages?: Array<{ role: string; content: string }>;
  summary?: string;
}

export interface SalesSimulationPhaseData {
  score?: number;
  passed?: boolean;
  evaluation?: string;
  recommendation?: string;
  messages?: Array<{ role: string; content: string }>;
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
  const { baseFacts, wasRejected, quizData } = input;
  const paragraphs: string[] = [];

  // If we have actual quiz data, generate a detailed analysis
  if (quizData && quizData.answers && quizData.answers.length > 0) {
    const { answers, score, correct, total, passed, antiCheatViolations, totalViolations } = quizData;
    
    // Opening with quiz overview
    paragraphs.push(`I went through each of the ${answers.length} questions on this assessment.`);
    
    // Separate multiple choice vs text questions
    const mcQuestions = answers.filter(a => a.questionType === 'multiple_choice' && a.isCorrect !== null);
    const textQuestions = answers.filter(a => a.questionType === 'text');
    const correctMC = mcQuestions.filter(a => a.isCorrect === true);
    const incorrectMC = mcQuestions.filter(a => a.isCorrect === false);
    
    // Score breakdown
    if (mcQuestions.length > 0) {
      paragraphs.push(`Out of ${mcQuestions.length} scoreable question${mcQuestions.length !== 1 ? 's' : ''}, they got ${correctMC.length} correct (${score}%).`);
    }
    
    // Analyze incorrect answers with specific examples
    if (incorrectMC.length > 0) {
      const wrongDetails: string[] = [];
      const samplesToShow = incorrectMC.slice(0, 3); // Show up to 3 wrong answers
      
      for (const wrong of samplesToShow) {
        const questionSnippet = wrong.question.length > 80 
          ? wrong.question.substring(0, 80) + "..." 
          : wrong.question;
        const answerSnippet = wrong.selectedAnswerText.length > 60
          ? wrong.selectedAnswerText.substring(0, 60) + "..."
          : wrong.selectedAnswerText;
        
        if (wrong.selectedAnswerText.toLowerCase() !== 'not answered') {
          wrongDetails.push(`When asked "${questionSnippet}", they answered "${answerSnippet}" — that's not the correct approach.`);
        } else {
          wrongDetails.push(`They left the question "${questionSnippet}" unanswered.`);
        }
      }
      
      if (wrongDetails.length > 0) {
        paragraphs.push(`Looking at what they got wrong: ${wrongDetails.join(" ")}`);
      }
      
      if (incorrectMC.length > 3) {
        paragraphs.push(`There were ${incorrectMC.length - 3} more incorrect answers beyond these.`);
      }
    }
    
    // Analyze text/open-ended responses
    let textLowEffortCount = 0;
    if (textQuestions.length > 0) {
      const textDetails: string[] = [];
      let thoughtfulCount = 0;
      
      for (const tq of textQuestions) {
        const answer = tq.textAnswer || tq.selectedAnswerText || '';
        const questionSnippet = tq.question.length > 60 
          ? tq.question.substring(0, 60) + "..." 
          : tq.question;
        
        // Check for low-effort answers
        if (!answer || answer.trim().length < 10 || 
            /^(i don'?t know|idk|n\/?a|none|no|yes|\?+|\.+|test|asdf|dasd|[a-z]{1,5}s?)$/i.test(answer.trim())) {
          textLowEffortCount++;
          if (textDetails.length < 2) {
            const answerPreview = answer.trim().length > 0 ? `"${answer.trim().substring(0, 30)}"` : '"(left blank)"';
            textDetails.push(`When asked "${questionSnippet}", they wrote ${answerPreview} — that doesn't show effort or understanding.`);
          }
        } else if (answer.trim().length > 50) {
          thoughtfulCount++;
        }
      }
      
      if (textDetails.length > 0) {
        paragraphs.push(`For the open-ended questions, their responses were minimal. ${textDetails.join(" ")}`);
      } else if (thoughtfulCount === textQuestions.length) {
        paragraphs.push(`The open-ended questions were answered thoughtfully, showing they put in genuine effort.`);
      } else if (thoughtfulCount > 0) {
        paragraphs.push(`Some of the open-ended responses showed decent effort, while others could have used more detail.`);
      }
    }
    
    // Highlight correct answers (show what they got right)
    if (correctMC.length > 0 && correctMC.length <= 5) {
      const correctExamples = correctMC.slice(0, 2).map(c => {
        const qSnippet = c.question.length > 50 ? c.question.substring(0, 50) + "..." : c.question;
        return `"${qSnippet}"`;
      });
      paragraphs.push(`On the positive side, they correctly answered questions about ${correctExamples.join(" and ")}.`);
    } else if (correctMC.length > 5) {
      paragraphs.push(`They demonstrated solid knowledge on ${correctMC.length} questions, showing competency in several areas.`);
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
        paragraphs.push(`⚠️ I detected ${totalViolations} anti-cheat violation${totalViolations !== 1 ? 's' : ''} during the quiz: ${violationParts.join(", ")}. This suggests they may have been looking up answers.`);
      }
    } else {
      paragraphs.push(`No cheating violations were detected during the quiz.`);
    }
    
    // Bottom line assessment
    if (passed) {
      if (score >= 90) {
        paragraphs.push(`Bottom line: Excellent performance. They clearly know the material well and are well-prepared for this role.`);
      } else if (score >= 70) {
        paragraphs.push(`Bottom line: Solid performance that demonstrates good foundational knowledge. Minor gaps but nothing that would be a dealbreaker.`);
      } else {
        paragraphs.push(`Bottom line: They passed, but just barely. There are knowledge gaps that might need attention during onboarding.`);
      }
    } else {
      if (textLowEffortCount > textQuestions.length / 2) {
        paragraphs.push(`Bottom line: The quiz reveals significant knowledge gaps, and the minimal effort on text questions is concerning. This candidate would need substantial training.`);
      } else {
        paragraphs.push(`Bottom line: The score indicates significant knowledge gaps that would need to be addressed. I'd recommend discussing these areas in an interview if you proceed.`);
      }
    }
    
  } else {
    // Fallback to basic narrative if no detailed data
    paragraphs.push("Here's how they did on the quiz.");
    paragraphs.push(baseFacts);

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
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/excellent result|excellent performance/gi, "the result").replace(/solid performance/gi, "the performance");
  }
  return narrative;
}

function buildTypingNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected, typingData } = input;
  const paragraphs: string[] = [];

  paragraphs.push("I checked their typing test results.");

  if (typingData) {
    const { wpm, accuracy, passed, requiredWpm } = typingData;
    
    // Detailed analysis with the actual data
    paragraphs.push(`They achieved ${wpm} WPM with ${accuracy}% accuracy.`);
    
    // Compare to requirement if available
    if (requiredWpm) {
      if (wpm >= requiredWpm) {
        const margin = wpm - requiredWpm;
        if (margin >= 20) {
          paragraphs.push(`This significantly exceeds the required ${requiredWpm} WPM by ${margin} words per minute — they're a fast typist.`);
        } else if (margin >= 5) {
          paragraphs.push(`This meets the required ${requiredWpm} WPM with a comfortable margin.`);
        } else {
          paragraphs.push(`This just meets the required ${requiredWpm} WPM — they made the cutoff.`);
        }
      } else {
        paragraphs.push(`This falls short of the required ${requiredWpm} WPM by ${requiredWpm - wpm} words per minute.`);
      }
    } else {
      // General WPM assessment
      if (wpm >= 80) {
        paragraphs.push("This is an excellent typing speed, well above average for most office roles. They'd handle high-volume typing tasks easily.");
      } else if (wpm >= 60) {
        paragraphs.push("This is a solid typing speed that should work well for most roles requiring regular typing.");
      } else if (wpm >= 40) {
        paragraphs.push("This is an average typing speed. It's workable but might be a concern for roles requiring heavy typing.");
      } else {
        paragraphs.push("This typing speed is on the lower side and might be a limitation for roles requiring fast typing.");
      }
    }
    
    // Accuracy assessment
    if (accuracy >= 99) {
      paragraphs.push("The accuracy is near-perfect — very few errors. This shows attention to detail.");
    } else if (accuracy >= 97) {
      paragraphs.push("The accuracy is excellent — minimal errors during the test.");
    } else if (accuracy >= 95) {
      paragraphs.push("The accuracy is good, though there were a few mistakes.");
    } else if (accuracy >= 90) {
      paragraphs.push("The accuracy could use some improvement. Error rate was noticeable.");
    } else {
      paragraphs.push("Accuracy was a concern — there were frequent errors during the test. This could impact work quality.");
    }
    
    // Speed vs accuracy balance
    if (wpm >= 60 && accuracy < 95) {
      paragraphs.push("Note: They prioritized speed over accuracy. Depending on the role, you may want to check if they can slow down for more careful work.");
    } else if (wpm < 50 && accuracy >= 98) {
      paragraphs.push("They're trading speed for precision. This could work well for roles where accuracy matters more than volume.");
    }
    
  } else {
    // Fallback to parsing baseFacts
    paragraphs.push(baseFacts);

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
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/strong typing speed|excellent/gi, "noted").replace(/solid/gi, "adequate");
  }
  return narrative;
}

function buildVoiceInterviewNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, voiceInterviewResult, wasRejected, voiceData } = input;
  const paragraphs: string[] = [];

  paragraphs.push("I listened to their voice interview.");
  
  // Use voiceData if available, otherwise fall back to voiceInterviewResult
  const data = voiceData || voiceInterviewResult;
  
  if (data) {
    const score = data.overall_score || data.overallScore;
    
    if (score !== undefined) {
      paragraphs.push(`Overall interview score: ${score}/100.`);
    }
    
    // Analyze individual questions if available
    if (data.questions && data.questions.length > 0) {
      paragraphs.push(`The interview covered ${data.questions.length} question${data.questions.length !== 1 ? 's' : ''}. Here's how they did on each:`);
      
      const questionAnalysis: string[] = [];
      let strongAnswers = 0;
      let weakAnswers = 0;
      
      for (const q of data.questions.slice(0, 5)) { // Show up to 5 questions
        const qScore = q.score;
        const qSnippet = q.question.length > 60 ? q.question.substring(0, 60) + "..." : q.question;
        
        if (qScore !== undefined) {
          if (qScore >= 80) {
            strongAnswers++;
            if (q.feedback) {
              questionAnalysis.push(`• "${qSnippet}" — Strong response (${qScore}/100). ${q.feedback}`);
            }
          } else if (qScore < 60) {
            weakAnswers++;
            if (q.feedback) {
              questionAnalysis.push(`• "${qSnippet}" — Needs improvement (${qScore}/100). ${q.feedback}`);
            }
          }
        }
      }
      
      if (questionAnalysis.length > 0) {
        paragraphs.push(questionAnalysis.join("\n"));
      }
      
      // Summary of strong vs weak
      if (strongAnswers > weakAnswers * 2) {
        paragraphs.push("They handled most questions confidently and articulated their thoughts well.");
      } else if (weakAnswers > strongAnswers) {
        paragraphs.push("Several responses needed more depth or clarity. They might benefit from more preparation for behavioral interviews.");
      }
    }
    
    // Include summary if available
    if (data.summary) {
      const summaryPreview = data.summary.length > 300 
        ? data.summary.substring(0, 300) + "..." 
        : data.summary;
      paragraphs.push(`Key takeaway: "${summaryPreview}"`);
    }
    
    // Duration context
    if (data.duration) {
      const minutes = Math.round(data.duration / 60);
      paragraphs.push(`The interview lasted approximately ${minutes} minute${minutes !== 1 ? 's' : ''}.`);
    }
    
    // Overall assessment
    if (score !== undefined) {
      if (score >= 80) {
        paragraphs.push("They came across well — good communication, clear thinking, and professional demeanor.");
      } else if (score >= 60) {
        paragraphs.push("The interview was adequate. They got their points across but didn't particularly stand out.");
      } else {
        paragraphs.push("There were some communication challenges during the interview that might be worth exploring further.");
      }
    }
  } else {
    paragraphs.push(baseFacts);
    paragraphs.push("The interview recording and transcript are available for your direct review.");
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/came across well/gi, "completed the interview").replace(/good communication/gi, "showed effort");
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
  const { baseFacts, wasRejected, chatSimulationData } = input;
  const paragraphs: string[] = [];

  paragraphs.push("I reviewed their chat simulation performance.");

  if (chatSimulationData) {
    const { score, scenario, messageCount, evaluation, recommendation, passed, messages } = chatSimulationData;
    
    if (scenario) {
      paragraphs.push(`They worked through a ${scenario} scenario.`);
    }
    
    if (messageCount) {
      paragraphs.push(`The conversation included ${messageCount} message${messageCount !== 1 ? 's' : ''}.`);
    }
    
    if (score !== undefined) {
      paragraphs.push(`They scored ${score}/100 on the simulation.`);
      
      if (score >= 85) {
        paragraphs.push("Excellent performance — they handled the simulation like a pro. Response quality, tone, and timing were all on point.");
      } else if (score >= 70) {
        paragraphs.push("Good performance overall. They understood the customer's needs and provided helpful responses.");
      } else if (score >= 50) {
        paragraphs.push("Performance was acceptable but there's room for improvement. Some responses could have been more helpful or professional.");
      } else {
        paragraphs.push("There were significant challenges in the simulation. Customer handling skills would need development.");
      }
    }
    
    if (evaluation) {
      paragraphs.push(`Evaluation: ${evaluation}`);
    }
    
    if (recommendation) {
      paragraphs.push(`My recommendation: ${recommendation}`);
    }
    
    // Analyze message patterns if available
    if (messages && messages.length > 0) {
      const candidateMessages = messages.filter(m => m.role === 'user' || m.role === 'candidate');
      if (candidateMessages.length > 0) {
        const avgLength = Math.round(candidateMessages.reduce((sum, m) => sum + m.content.length, 0) / candidateMessages.length);
        if (avgLength < 50) {
          paragraphs.push("Note: Their responses were quite brief. For customer service roles, more detailed responses are usually expected.");
        } else if (avgLength > 200) {
          paragraphs.push("They provided thorough, detailed responses — good for complex customer issues.");
        }
      }
    }
    
  } else {
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
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/handled the simulation well|excellent performance/gi, "completed the simulation");
  }
  return narrative;
}

function buildChatInterviewNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected, chatInterviewData } = input;
  const paragraphs: string[] = [];

  paragraphs.push("I reviewed their chat interview.");

  if (chatInterviewData) {
    const { score, overallScore, messageCount, duration, summary, messages } = chatInterviewData;
    const finalScore = score || overallScore;
    
    if (messageCount) {
      paragraphs.push(`The interview consisted of ${messageCount} message${messageCount !== 1 ? 's' : ''}.`);
    }
    
    if (duration) {
      const minutes = Math.round(duration / 60);
      paragraphs.push(`It took approximately ${minutes} minute${minutes !== 1 ? 's' : ''} to complete.`);
    }
    
    if (finalScore !== undefined) {
      paragraphs.push(`Overall interview score: ${finalScore}/100.`);
      
      if (finalScore >= 80) {
        paragraphs.push("Strong interview performance. They communicated clearly and provided thoughtful responses.");
      } else if (finalScore >= 60) {
        paragraphs.push("Decent interview. They got their points across, though some answers could have been more detailed.");
      } else {
        paragraphs.push("The interview revealed some areas that need work. Responses lacked depth or clarity in places.");
      }
    }
    
    if (summary) {
      paragraphs.push(`Summary: ${summary}`);
    }
    
    // Quick analysis of message quality if available
    if (messages && messages.length > 0) {
      const candidateMessages = messages.filter(m => m.role === 'user' || m.role === 'candidate' || m.role === 'assistant');
      if (candidateMessages.length >= 3) {
        paragraphs.push("The full transcript is available if you want to review their specific responses.");
      }
    }
    
  } else {
    paragraphs.push(baseFacts);
    paragraphs.push("The interview provides useful context for your decision.");
  }

  let narrative = paragraphs.join("\n\n");
  if (wasRejected) {
    narrative = narrative.replace(/strong interview performance/gi, "the interview was completed");
  }
  return narrative;
}

function buildSalesSimulationNarrative(input: AvaPhaseNarrativeInput): string {
  const { baseFacts, wasRejected, salesSimulationData } = input;
  const paragraphs: string[] = [];

  paragraphs.push("I analyzed their sales simulation.");

  if (salesSimulationData) {
    const { score, evaluation, recommendation, passed, messages } = salesSimulationData;
    
    if (score !== undefined) {
      paragraphs.push(`They scored ${score}/100 on the sales simulation.`);
      
      if (score >= 85) {
        paragraphs.push("Strong sales instincts on display. They navigated objections well, built rapport, and moved toward closing effectively.");
      } else if (score >= 70) {
        paragraphs.push("Good sales fundamentals. They understood the customer's needs and made reasonable attempts to address concerns.");
      } else if (score >= 50) {
        paragraphs.push("Showed potential but would benefit from more sales training. Some objection handling was weak.");
      } else {
        paragraphs.push("Sales skills need significant development. They struggled with objections and closing techniques.");
      }
    }
    
    if (evaluation) {
      paragraphs.push(`Evaluation: ${evaluation}`);
    }
    
    if (recommendation) {
      paragraphs.push(`My recommendation: ${recommendation}`);
    }
    
    // Analyze conversation if available
    if (messages && messages.length > 0) {
      const candidateMessages = messages.filter(m => m.role === 'user' || m.role === 'candidate');
      if (candidateMessages.length >= 3) {
        // Check for closing attempts
        const closingKeywords = candidateMessages.some(m => 
          /shall we proceed|ready to|sign up|get started|next step/i.test(m.content)
        );
        if (closingKeywords) {
          paragraphs.push("They made appropriate attempts to move the conversation toward a close.");
        }
      }
    }
    
  } else {
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
      return buildChatInterviewNarrative(input);
    case "sales_simulation":
      return buildSalesSimulationNarrative(input);
    default:
      return buildGenericNarrative(input);
  }
}
