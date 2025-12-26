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
  "UNVERIFIED", "UNKNOWN", "N/A", "TBD",
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
      return "I reviewed the application form and cross-checked it against the resume.";
    case "quiz":
      return "Here's how they did on the quiz.";
    case "portfolio":
      return "I looked at the work samples they submitted.";
    case "video":
      return "I watched their video introduction.";
    case "typing":
      return "I checked their typing test results.";
    case "chat_simulation":
      return "I reviewed their chat simulation performance.";
    case "chat_interview":
      return "I went through their chat interview responses.";
    case "sales_simulation":
      return "I analyzed their sales simulation.";
    case "voice_interview":
      return "I listened to their voice interview.";
    case "resume":
      return "I reviewed their resume and cross-checked it against their application.";
    default:
      return `I reviewed the ${phaseLabel} phase.`;
  }
}

// Extract resume-specific findings from rawSections
function extractResumeFindings(rawSections: ParsedSectionLike[]): {
  resumeClaims: string[];
  crossRefFindings: string[];
  concerns: string[];
} {
  const resumeClaims: string[] = [];
  const crossRefFindings: string[] = [];
  const concerns: string[] = [];

  for (const section of rawSections) {
    const titleLower = section.title.toLowerCase();

    // Resume/Document Analysis sections
    if (titleLower.includes("resume") || titleLower.includes("document") || titleLower.includes("cv")) {
      for (const item of section.items) {
        if (isPlaceholderValue(item)) continue;
        const cleaned = cleanPlaceholderFromText(item);
        if (!cleaned) continue;

        // Extract specific claims about experience, companies, skills
        if (/company|employer|work(?:ed)?\s+at|experience/i.test(cleaned)) {
          resumeClaims.push(cleaned);
        }
        if (/skill|technology|proficien/i.test(cleaned)) {
          resumeClaims.push(cleaned);
        }
        if (/year|duration|from.*to/i.test(cleaned)) {
          resumeClaims.push(cleaned);
        }
      }
    }

    // Cross-Reference sections
    if (titleLower.includes("cross") || titleLower.includes("reference") || titleLower.includes("verification")) {
      for (const item of section.items) {
        if (isPlaceholderValue(item)) continue;
        const cleaned = cleanPlaceholderFromText(item);
        if (!cleaned) continue;

        if (/mismatch|discrepan|inconsisten|different|doesn't match|does not match/i.test(cleaned)) {
          crossRefFindings.push(cleaned);
          concerns.push(cleaned);
        } else if (/match|verified|confirmed|consistent/i.test(cleaned)) {
          crossRefFindings.push(cleaned);
        }
      }
    }

    // Look for concerns/red flags in any section
    if (titleLower.includes("concern") || titleLower.includes("red flag") || titleLower.includes("issue")) {
      for (const item of section.items) {
        if (isPlaceholderValue(item)) continue;
        const cleaned = cleanPlaceholderFromText(item);
        if (cleaned && !concerns.includes(cleaned)) {
          concerns.push(cleaned);
        }
      }
    }

    // Also check individual items for concerning patterns
    for (const item of section.items) {
      if (isPlaceholderValue(item)) continue;
      const cleaned = cleanPlaceholderFromText(item);
      if (!cleaned) continue;

      // Name mismatch is a major concern
      if (/name.*mismatch|name.*doesn't match|name.*does not match|different.*name/i.test(cleaned)) {
        if (!concerns.some(c => c.toLowerCase().includes("name"))) {
          concerns.push(cleaned);
        }
      }
    }
  }

  // Deduplicate
  const uniqueResumeClaims = [...new Set(resumeClaims)].slice(0, 3);
  const uniqueCrossRef = [...new Set(crossRefFindings)].slice(0, 3);
  const uniqueConcerns = [...new Set(concerns)].slice(0, 3);

  return {
    resumeClaims: uniqueResumeClaims,
    crossRefFindings: uniqueCrossRef,
    concerns: uniqueConcerns,
  };
}

// Build the application form narrative focused on resume cross-referencing
function buildApplicationFormNarrative(
  input: AvaPhaseNarrativeInput
): string {
  const { baseFacts, rawSections, wasRejected, analysisAvailable } = input;

  if (!analysisAvailable) {
    return [
      "The application form has been submitted.",
      baseFacts,
      "I'm still waiting for the detailed analysis to come through.",
      "Once I have it, I'll cross-reference the resume with the application answers.",
    ].join("\n\n");
  }

  const { resumeClaims, crossRefFindings, concerns } = extractResumeFindings(rawSections);
  const paragraphs: string[] = [];

  // Opening paragraph
  paragraphs.push(getPhaseOpener("application_form", "Application Form"));

  // Resume analysis paragraph
  if (resumeClaims.length > 0) {
    const resumeParagraph = resumeClaims
      .map(claim => {
        // Clean up and make conversational
        const cleaned = claim
          .replace(/^[-•]\s*/, "")
          .replace(/:\s*/g, " shows ")
          .trim();
        return `On the resume, ${cleaned.charAt(0).toLowerCase() + cleaned.slice(1)}`;
      })
      .join(". ");
    paragraphs.push(resumeParagraph + ".");
  }

  // Cross-reference findings paragraph
  if (crossRefFindings.length > 0) {
    const hasIssues = concerns.length > 0;
    if (hasIssues) {
      const issuesParagraph = crossRefFindings
        .filter(f => /mismatch|discrepan|inconsisten|different/i.test(f))
        .map(finding => {
          // Make it conversational: "Resume says X, but application says Y"
          const cleaned = finding
            .replace(/^[-•]\s*/, "")
            .replace(/MISMATCH/gi, "doesn't match")
            .replace(/discrepancy/gi, "difference")
            .trim();
          return cleaned;
        })
        .join(". ");

      if (issuesParagraph) {
        paragraphs.push(`When I compared the resume to the application, I found some differences. ${issuesParagraph}.`);
      }
    } else {
      paragraphs.push("When I compared the resume to the application answers, things lined up well.");
    }
  } else {
    paragraphs.push("I compared the resume details with the application answers to check for consistency.");
  }

  // Concerns paragraph
  if (concerns.length > 0) {
    const concernsList = concerns
      .map(c => {
        // Clean up concern text
        return c
          .replace(/^[-•]\s*/, "")
          .replace(/name.*mismatch/i, "the name on the resume doesn't match the applicant's name")
          .replace(/MISMATCH/gi, "doesn't match")
          .trim();
      })
      .join(". ");

    paragraphs.push(`Here's what I'd flag for follow-up: ${concernsList}.`);
  }

  // Conclusion
  if (wasRejected) {
    paragraphs.push("Based on the discrepancies I found, I wasn't able to recommend moving forward.");
  } else if (concerns.length === 0) {
    paragraphs.push("Overall, no major red flags stood out from this review.");
  } else {
    paragraphs.push("These items are worth clarifying before making a final decision.");
  }

  return safeToneForRejection(paragraphs.join("\n\n"), wasRejected);
}

// Generic phase narrative builder for non-application phases
function buildGenericPhaseNarrative(input: AvaPhaseNarrativeInput): string {
  const {
    phaseType,
    phaseLabel,
    baseFacts,
    voiceInterviewResult,
    rawSections,
    analysisAvailable,
    wasRejected,
  } = input;

  // Analysis not ready yet
  if (!analysisAvailable) {
    const sentences = [
      `The ${phaseLabel} phase is complete.`,
      baseFacts,
      "I'm waiting for the detailed breakdown to dig into the specifics.",
    ];
    return safeToneForRejection(sentences.join("\n\n"), wasRejected);
  }

  const paragraphs: string[] = [];

  // Opening
  paragraphs.push(getPhaseOpener(phaseType, phaseLabel));

  // Facts
  paragraphs.push(baseFacts);

  // Extract relevant findings
  const { concerns } = extractResumeFindings(rawSections);

  // Voice interview specific
  if (phaseType === "voice_interview" && voiceInterviewResult?.summary) {
    const summary = cleanPlaceholderFromText(String(voiceInterviewResult.summary));
    if (summary && !isPlaceholderValue(summary)) {
      paragraphs.push(`From the interview: "${clampText(summary, 180)}"`);
    }
  }

  // Any concerns
  if (concerns.length > 0) {
    paragraphs.push(`A few things to note: ${concerns.slice(0, 2).join(". ")}.`);
  }

  // Conclusion
  if (wasRejected) {
    paragraphs.push("Given the concerns, I wasn't able to recommend moving forward.");
  } else {
    paragraphs.push("This phase provides useful signal for your decision.");
  }

  return safeToneForRejection(paragraphs.join("\n\n"), wasRejected);
}

export function buildAvaPhaseNarrative(input: AvaPhaseNarrativeInput): string {
  // Use specialized builder for application form
  if (input.phaseType === "application_form") {
    return buildApplicationFormNarrative(input);
  }

  // Use generic builder for other phases
  return buildGenericPhaseNarrative(input);
}
