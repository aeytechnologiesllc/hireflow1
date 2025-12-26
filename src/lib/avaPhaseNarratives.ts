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

const PLACEHOLDER_PATTERNS = [
  "CANNOT_VERIFY", "CANNOT VERIFY", "CANNOTVERIFY",
  "NOT_AVAILABLE", "NOT AVAILABLE", "NOTAVAILABLE",
  "NOT_PROVIDED", "NOT PROVIDED", "NOTPROVIDED",
  "UNVERIFIED", "UNKNOWN", "N/A", "NA", "TBD",
  "[MATCH/MISMATCH/CANNOT_VERIFY]", "[CANNOT_VERIFY]",
  "PLACEHOLDER", "UNDEFINED", "NULL",
];

function isPlaceholderValue(value: string): boolean {
  if (!value || typeof value !== "string") return true;
  const upperValue = value.toUpperCase().trim();
  for (const placeholder of PLACEHOLDER_PATTERNS) {
    if (upperValue === placeholder || upperValue.includes(placeholder)) return true;
  }
  if (/^\[.*\]$/.test(value.trim())) return true;
  return false;
}

function cleanPlaceholderFromText(text: string): string {
  if (!text) return "";
  let cleaned = text;
  for (const placeholder of PLACEHOLDER_PATTERNS) {
    const regex = new RegExp(
      `[,;:\\s]*${placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[,;:\\s]*`,
      "gi",
    );
    cleaned = cleaned.replace(regex, " ");
  }
  return cleaned.replace(/\s+/g, " ").trim();
}

function clampText(text: string, maxLen: number) {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).trimEnd()}…`;
}

function safeToneForRejection(text: string, wasRejected: boolean) {
  if (!wasRejected) return text;
  return text
    .replace(/\b(excellent|outstanding|exceptional|perfect|impressive|superb|remarkable)\b/gi, "okay")
    .replace(/\b(highly recommend|strong candidate|great fit|top candidate|ideal)\b/gi, "reviewed")
    .replace(/\b(exceeded expectations|above average|exemplary)\b/gi, "met some requirements")
    .replace(/\b(passed successfully)\b/gi, "completed")
    .replace(/\b(strong performance)\b/gi, "the performance");
}

// Phase-specific friendly openers
function getPhaseOpener(phaseType: PhaseType, phaseLabel: string): string {
  switch (phaseType) {
    case "application_form":
      return "Let me walk you through what I found in the application form!";
    case "quiz":
      return "Alright, let's talk about how they did on the quiz!";
    case "portfolio":
      return "I took a close look at the work samples they submitted — here's what I found.";
    case "video":
      return "I watched their video introduction, and here's what stood out to me.";
    case "typing":
      return "I checked out their typing test results — let me break it down for you.";
    case "chat_simulation":
      return "I reviewed their chat simulation performance, and I have some thoughts!";
    case "chat_interview":
      return "I went through their chat interview responses — here's my take.";
    case "sales_simulation":
      return "I analyzed their sales simulation, and there's a lot to unpack here.";
    case "voice_interview":
      return "I listened to their voice interview, and I want to share what I noticed.";
    case "resume":
      return "I reviewed their resume and cross-checked it against what they told us.";
    default:
      return `Let me tell you what I found in the ${phaseLabel} phase.`;
  }
}

// Translate raw technical findings into friendly plain English
function translateFindingToPlainEnglish(rawFinding: string): string {
  const finding = rawFinding.trim();
  
  // Name mismatch patterns
  if (/name.*mismatch|mismatch.*name/i.test(finding)) {
    const nameMatch = finding.match(/["']([^"']+)["'].*["']([^"']+)["']/);
    if (nameMatch) {
      return `Here's something that caught my attention — the name they used ('${nameMatch[1]}') doesn't match what's on file ('${nameMatch[2]}'). That's definitely worth asking about.`;
    }
    return "I noticed the name they provided doesn't quite match up with what we have on record. That's a flag I'd want to clarify.";
  }
  
  // Skills not specified
  if (/skills.*not specified|skills were not/i.test(finding)) {
    return "They didn't mention any specific skills in their answers, which makes it harder for me to verify their background.";
  }
  
  // Resume unavailable
  if (/resume.*unavailable|resume is unavailable/i.test(finding)) {
    return "Without a resume to check, I can't verify some of their claims about experience.";
  }
  
  // Discrepancy patterns
  if (/discrepan/i.test(finding)) {
    const cleaned = finding.replace(/^(discrepancies? found:?|discrepancy:?)\s*/i, "").trim();
    if (cleaned) {
      return `Something worth flagging — ${cleaned.charAt(0).toLowerCase() + cleaned.slice(1)}`;
    }
    return "I found some inconsistencies that might need a closer look.";
  }
  
  // Match/verification patterns
  if (/match.*:.*match\b/i.test(finding) && !/mismatch/i.test(finding)) {
    return "On the positive side, some of their information checked out nicely.";
  }
  
  // AI content detection
  if (/ai[- ]?(generated|content|detection)/i.test(finding)) {
    return "I ran some checks for AI-generated content to make sure their answers feel genuine.";
  }
  
  // Authenticity signals
  if (/authenticity/i.test(finding)) {
    return "I looked at authenticity signals to see if their responses seemed genuine and personal.";
  }
  
  // Score-based findings
  if (/score|confidence|match rate/i.test(finding)) {
    const scoreMatch = finding.match(/(\d+(?:\.\d+)?)\s*%?/);
    if (scoreMatch) {
      const score = parseFloat(scoreMatch[1]);
      if (score >= 80) {
        return `Their score came in at ${scoreMatch[0]}, which is pretty solid!`;
      } else if (score >= 50) {
        return `They scored ${scoreMatch[0]} — not bad, but there's room for improvement.`;
      } else {
        return `Their score was ${scoreMatch[0]}, which is on the lower end and worth noting.`;
      }
    }
    return finding;
  }
  
  // Generic cleanup - just make it conversational
  const cleaned = finding
    .replace(/^[-•]\s*/, "")
    .replace(/:\s*MISMATCH\s*-?/gi, " doesn't match — ")
    .replace(/:\s*MATCH\s*-?/gi, " checks out — ")
    .replace(/verification layer/gi, "when I double-checked")
    .replace(/cross-reference/gi, "compared")
    .trim();
  
  return cleaned || finding;
}

function getPhaseSectionKeywords(phaseType: PhaseType): string[] {
  switch (phaseType) {
    case "application_form":
      return ["ai-generated", "ai content", "content detection", "cross-reference", "verification", "authenticity", "application answer", "application analysis"];
    case "quiz":
      return ["quiz", "assessment", "knowledge"];
    case "portfolio":
      return ["portfolio", "work sample"];
    case "video":
      return ["video", "presentation"];
    case "typing":
      return ["typing", "speed", "wpm"];
    case "chat_simulation":
      return ["chat simulation", "simulation"];
    case "chat_interview":
      return ["chat interview", "interview"];
    case "sales_simulation":
      return ["sales", "objection", "negotiation"];
    case "voice_interview":
      return ["voice", "interview", "communication"];
    case "resume":
      return ["resume", "document", "cv"];
    default:
      return [];
  }
}

function pickRelevantSections(rawSections: ParsedSectionLike[], phaseType: PhaseType): ParsedSectionLike[] {
  const keys = getPhaseSectionKeywords(phaseType);
  if (keys.length === 0) return [];
  return rawSections.filter((s) => {
    const title = s.title.toLowerCase();
    if (phaseType === "chat_simulation") return title.includes("chat") && title.includes("simulation");
    if (phaseType === "chat_interview") return title.includes("chat") && title.includes("interview");
    return keys.some((k) => title.includes(k));
  });
}

function extractEvidenceLines(sections: ParsedSectionLike[]) {
  const lines: string[] = [];
  for (const s of sections) {
    for (const raw of s.items || []) {
      const item = cleanPlaceholderFromText(raw);
      if (!item || isPlaceholderValue(item)) continue;
      const normalized = item.replace(/^[-•]\s*/, "").trim();
      if (/discrep|mismatch|inconsisten|red flag|concern|cannot verify|unverified|ownership|fraud|suspicious/i.test(normalized)) {
        lines.push(normalized);
      } else if (/(score|match rate|confidence|authenticity|verification)/i.test(normalized)) {
        lines.push(normalized);
      }
    }
  }
  const seen = new Set<string>();
  return lines.filter((l) => {
    const key = l.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
}

function pickAnswerQuotes(applicationAnswers?: QA[]) {
  if (!applicationAnswers?.length) return [];
  const quotes: { question: string; answer: string }[] = [];
  for (const qa of applicationAnswers) {
    const q = cleanPlaceholderFromText(qa.question || "");
    const a = cleanPlaceholderFromText(qa.answer || "");
    if (!q || !a || isPlaceholderValue(a)) continue;
    quotes.push({ question: q, answer: clampText(a, 100) });
    if (quotes.length >= 2) break;
  }
  return quotes;
}

// Get phase-specific "what I checked" explanation
function getWhatIChecked(phaseType: PhaseType): string {
  switch (phaseType) {
    case "application_form":
      return "I went through each answer looking at how clear and genuine they sounded, and then I compared what they said against any other info we have on file.";
    case "quiz":
      return "I looked at which questions they got right, which ones they missed, and how their overall score stacks up against what we're looking for.";
    case "portfolio":
      return "I reviewed the work samples they shared to see the quality, relevance, and whether it matches what they claimed about their experience.";
    case "video":
      return "I watched how they presented themselves — their communication style, confidence, and whether they came across as genuine.";
    case "typing":
      return "I checked their typing speed, accuracy, and overall consistency throughout the test.";
    case "chat_simulation":
      return "I analyzed how they handled the simulated conversation — their responses, problem-solving approach, and communication style.";
    case "chat_interview":
      return "I reviewed their interview responses to see how thoughtfully they answered and whether their answers were consistent.";
    case "sales_simulation":
      return "I looked at how they handled objections, their persuasion techniques, and their overall sales approach.";
    case "voice_interview":
      return "I listened to how they communicated under pressure, whether their answers stayed consistent, and how well they expressed their thoughts.";
    case "resume":
      return "I cross-checked their resume details against what they told us in their application to spot any inconsistencies.";
    default:
      return "I reviewed everything they submitted for this phase and compared it against what we expected.";
  }
}

// Friendly filler sentences that sound like Ava
const FRIENDLY_FILLERS = [
  "I always try to focus on what they actually said rather than making assumptions.",
  "It's important to me that I look at concrete evidence, not just vibes.",
  "When something doesn't quite line up, I flag it so you can ask them directly if needed.",
  "I like to keep my notes specific so we can always trace back to the original source.",
  "If there's anything I couldn't verify, I'd rather be upfront about it than guess.",
];

export function buildAvaPhaseNarrative(input: AvaPhaseNarrativeInput): string {
  const {
    phaseType,
    phaseLabel,
    baseFacts,
    applicationAnswers,
    voiceInterviewResult,
    rawSections,
    analysisAvailable,
    wasRejected,
  } = input;

  // Analysis not ready yet - friendly explanation
  if (!analysisAvailable) {
    const sentences = [
      `I can see the ${phaseLabel} phase is done — ${baseFacts}`,
      "I haven't gotten the detailed breakdown yet, so I can't dig into the specifics just yet.",
      "Once that comes through, I'll be able to tell you exactly what they claimed, what checked out, and what didn't.",
      "For now, I'm keeping it factual based on what I can actually see.",
      wasRejected
        ? "Since this application didn't move forward, I'll make sure to focus on the gaps and concerns when I get the full picture."
        : "When I get the full analysis, I'll also highlight what went well — but only the stuff I can actually back up.",
      "Hang tight, and I'll have more for you soon!",
    ];
    return safeToneForRejection(sentences.join(" "), wasRejected);
  }

  const relevantSections = pickRelevantSections(rawSections, phaseType);
  const evidenceLines = extractEvidenceLines(relevantSections);
  const answerQuotes = phaseType === "application_form" ? pickAnswerQuotes(applicationAnswers) : [];

  const sentences: string[] = [];

  // 1) Friendly opener
  sentences.push(getPhaseOpener(phaseType, phaseLabel));

  // 2) Quick facts in conversational tone
  sentences.push(`So here's the quick rundown: ${baseFacts}`);

  // 3) What I actually looked at
  sentences.push(getWhatIChecked(phaseType));

  // 4) Quote from application answers (conversational)
  if (answerQuotes.length > 0) {
    const first = answerQuotes[0];
    sentences.push(`When I looked at their answers, one thing I noted was when they were asked "${first.question}" — they said "${first.answer}".`);
    if (answerQuotes[1]) {
      const second = answerQuotes[1];
      sentences.push(`They also mentioned "${second.answer}" when asked about "${second.question}".`);
    }
  }

  // 5) Evidence findings translated to plain English
  if (evidenceLines.length > 0) {
    sentences.push(translateFindingToPlainEnglish(evidenceLines[0]));
    if (evidenceLines[1]) {
      sentences.push(`I also noticed this: ${translateFindingToPlainEnglish(evidenceLines[1]).charAt(0).toLowerCase() + translateFindingToPlainEnglish(evidenceLines[1]).slice(1)}`);
    }
    if (evidenceLines[2]) {
      sentences.push(`One more thing worth mentioning — ${translateFindingToPlainEnglish(evidenceLines[2]).charAt(0).toLowerCase() + translateFindingToPlainEnglish(evidenceLines[2]).slice(1)}`);
    }
  } else {
    sentences.push("The analysis didn't surface any major red flags in this phase, which is good to know.");
  }

  // 6) Voice interview specific summary
  if (phaseType === "voice_interview" && voiceInterviewResult?.summary) {
    const vi = cleanPlaceholderFromText(String(voiceInterviewResult.summary));
    if (vi && !isPlaceholderValue(vi)) {
      sentences.push(`From the interview itself, here's what I captured: "${clampText(vi, 180)}"`);
    }
  }

  // 7) Transition and implications
  sentences.push("When things lined up nicely, I counted that as a good sign. When they didn't, I flagged it for you to follow up on if needed.");

  // 8) Bottom line (tone-adjusted for rejection)
  if (wasRejected) {
    sentences.push("Given the concerns I found, I wasn't able to recommend moving forward with this candidate.");
    sentences.push("Even if some individual moments looked okay, the overall picture didn't meet the bar we're looking for.");
  } else {
    sentences.push("Overall, this phase gives us useful signal to work with.");
    sentences.push("The next step should be based on the strongest evidence we have so far.");
  }

  // 9) Add personality fillers if needed
  while (sentences.length < 11) {
    const fillerIndex = sentences.length % FRIENDLY_FILLERS.length;
    sentences.push(FRIENDLY_FILLERS[fillerIndex]);
  }

  // Cap at 15 sentences and apply rejection tone safety
  return sentences
    .slice(0, 15)
    .map((s) => safeToneForRejection(s, wasRejected))
    .join(" ");
}
