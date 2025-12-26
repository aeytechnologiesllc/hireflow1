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
  baseFacts: string; // short factual summary (scores/counts)
  applicationAnswers?: QA[];
  voiceInterviewResult?: any;
  rawSections: ParsedSectionLike[];
  analysisAvailable: boolean;
  wasRejected: boolean;
}

const PLACEHOLDER_PATTERNS = [
  "CANNOT_VERIFY",
  "CANNOT VERIFY",
  "CANNOTVERIFY",
  "NOT_AVAILABLE",
  "NOT AVAILABLE",
  "NOTAVAILABLE",
  "NOT_PROVIDED",
  "NOT PROVIDED",
  "NOTPROVIDED",
  "UNVERIFIED",
  "UNKNOWN",
  "N/A",
  "NA",
  "TBD",
  "[MATCH/MISMATCH/CANNOT_VERIFY]",
  "[CANNOT_VERIFY]",
  "PLACEHOLDER",
  "UNDEFINED",
  "NULL",
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

function quote(text: string) {
  const t = text.trim();
  return t ? `“${t}”` : "";
}

function safeTone(text: string, wasRejected: boolean) {
  if (!wasRejected) return text;
  return text
    .replace(/\b(excellent|outstanding|exceptional|perfect|impressive|superb|remarkable)\b/gi, "adequate")
    .replace(/\b(highly recommend|strong candidate|great fit|top candidate|ideal)\b/gi, "reviewed")
    .replace(/\b(exceeded expectations|above average|exemplary)\b/gi, "met requirements")
    .replace(/\b(passed successfully)\b/gi, "was completed")
    .replace(/\b(strong)\b/gi, "some");
}

function getPhaseSectionKeywords(phaseType: PhaseType): string[] {
  switch (phaseType) {
    case "application_form":
      return [
        "ai-generated",
        "ai content",
        "content detection",
        "cross-reference",
        "verification",
        "authenticity",
        "application answer",
        "application analysis",
      ];
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
    // For chat_simulation vs chat_interview, be strict.
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
      // Prefer discrepancy / mismatch / concern signals.
      if (
        /discrep|mismatch|inconsisten|red flag|concern|cannot verify|unverified|ownership|fraud|suspicious/i.test(
          normalized,
        )
      ) {
        lines.push(normalized);
      } else if (/(score|match rate|confidence|authenticity|verification)/i.test(normalized)) {
        lines.push(normalized);
      }
    }
  }

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const uniq = lines.filter((l) => {
    const key = l.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return uniq.slice(0, 4);
}

function pickAnswerQuotes(applicationAnswers?: QA[]) {
  if (!applicationAnswers?.length) return [];
  const quotes: string[] = [];

  for (const qa of applicationAnswers) {
    const q = cleanPlaceholderFromText(qa.question || "");
    const a = cleanPlaceholderFromText(qa.answer || "");
    if (!q || !a || isPlaceholderValue(a)) continue;

    // Keep answers short and quotable
    quotes.push(`${q}: ${quote(clampText(a, 140))}`);
    if (quotes.length >= 2) break;
  }

  return quotes;
}

function ensureMinSentences(sentences: string[], min: number) {
  const fillers = [
    "I focused on concrete claims, not just tone or confidence.",
    "I looked for internal consistency across what was submitted in this phase.",
    "When I couldn’t verify a claim, I treated it as an open risk rather than a pass.",
    "I summarized what I could directly support from the available evidence.",
    "I kept my notes specific so the hiring team can retrace the exact reasoning.",
  ];

  let i = 0;
  while (sentences.length < min && i < fillers.length) {
    sentences.push(fillers[i]);
    i += 1;
  }

  while (sentences.length < min) {
    sentences.push("I’m ready to refine this further if more phase evidence is added.");
  }

  return sentences;
}

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

  // If analysis isn't ready, still be multi-sentence (but honest about missing detail).
  if (!analysisAvailable) {
    const pending: string[] = [];
    pending.push(`I can see that the ${phaseLabel} phase is complete, and here’s what I have so far: ${baseFacts}`);
    pending.push(
      "I haven’t received the detailed analysis artifacts for this phase yet, so I can’t cite specific matches or mismatches from the verification layer.",
    );
    pending.push(
      "Once the analysis arrives, I’ll break this down into what the candidate claimed, what I checked, what matched, what didn’t, and what that means for risk.",
    );
    pending.push(
      "If you re-run analysis, I’ll convert the raw findings into a detailed first-person narrative with short quoted evidence.",
    );
    pending.push(
      wasRejected
        ? "Because this application is already rejected, I will keep the language strictly neutral and focus on evidence and gaps rather than praise."
        : "When the evidence is available, I’ll also call out strengths—but only when they’re directly supported by what was submitted.",
    );
    pending.push("For now, I’m intentionally not guessing beyond the facts I can see.");
    return safeTone(pending.join(" "), wasRejected);
  }

  const relevantSections = pickRelevantSections(rawSections, phaseType);
  const evidenceLines = extractEvidenceLines(relevantSections);
  const answerQuotes = phaseType === "application_form" ? pickAnswerQuotes(applicationAnswers) : [];

  const sentences: string[] = [];

  // 1) What happened
  sentences.push(`I reviewed the ${phaseLabel} phase and grounded my notes in the actual submitted evidence.`);
  sentences.push(`Fact check summary: ${baseFacts}`);

  // 2) What I checked
  if (phaseType === "application_form") {
    sentences.push(
      "I compared the written answers for clarity, authenticity signals, and internal consistency, then cross-referenced them against any verification findings I have.",
    );
  } else if (phaseType === "resume") {
    sentences.push(
      "I focused on resume ownership signals, identity consistency, and whether the document content aligns with the application claims.",
    );
  } else if (phaseType === "voice_interview") {
    sentences.push(
      "I looked at how the candidate communicated under pressure, whether answers stayed consistent, and whether the interview outcomes align with the rest of the file.",
    );
  } else {
    sentences.push(
      "I looked for consistency between performance outcomes, stated approach, and any evaluation notes produced for this phase.",
    );
  }

  // 3) Quote from application answers (when available)
  if (answerQuotes.length) {
    sentences.push(`Here are two concrete excerpts I used as anchors: ${answerQuotes[0]}`);
    if (answerQuotes[1]) {
      sentences.push(`Second anchor excerpt: ${answerQuotes[1]}`);
    }
  }

  // 4) Evidence lines from analysis sections
  if (evidenceLines.length) {
    const first = quote(clampText(evidenceLines[0], 170));
    sentences.push(`From the verification layer, one of the most relevant findings was ${first}`);

    if (evidenceLines[1]) {
      const second = quote(clampText(evidenceLines[1], 170));
      sentences.push(`A second finding I noted was ${second}`);
    }

    if (evidenceLines[2]) {
      const third = quote(clampText(evidenceLines[2], 170));
      sentences.push(`I also flagged ${third} as additional context.`);
    }
  } else {
    sentences.push(
      "The detailed section-level findings for this phase are present, but they don’t include clear, quotable discrepancy lines, so I’m sticking to what can be supported directly.",
    );
  }

  // 5) Implications / decision framing
  if (phaseType === "voice_interview" && voiceInterviewResult?.summary) {
    const vi = cleanPlaceholderFromText(String(voiceInterviewResult.summary));
    if (vi && !isPlaceholderValue(vi)) {
      sentences.push(`In the interview summary, I captured this outcome: ${quote(clampText(vi, 220))}`);
    }
  }

  sentences.push(
    "Where the file was consistent, I treated it as supportive evidence; where it wasn’t, I treated it as a verification gap that needs a human follow-up.",
  );

  if (wasRejected) {
    sentences.push(
      "Because this application is rejected, I’m not framing this as a positive recommendation—even if individual moments looked fine in isolation.",
    );
    sentences.push(
      "My bottom line is that the evidence and/or overall outcomes did not justify advancing the candidate in this workflow.",
    );
  } else {
    sentences.push(
      "My bottom line is that this phase adds signal to the overall decision, and the next step should be based on the strongest supported evidence.",
    );
  }

  ensureMinSentences(sentences, 11);

  // Cap at ~15 sentences to avoid essays.
  const finalSentences = sentences.slice(0, 15).map((s) => safeTone(s, wasRejected));
  return finalSentences.join(" ");
}
