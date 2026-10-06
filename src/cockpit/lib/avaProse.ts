/**
 * avaProse.ts — how the cockpit puts Ava's words, and the applicant's own, on
 * screen. One copy, shared by the Applicants list and the full profile
 * (CandidateDetail): both pages used to carry their own copy of the report
 * reader below, and the two had already started to drift.
 *
 * Display only. Nothing here changes a stored record.
 */

/**
 * Ava's full resume report (`ai_analysis`) is a structured document built for
 * the scoring engine — bold section headers, then mostly machine-readable
 * "Label: Value" diagnostic lines (`Status: VALID_RESUME`, `Confidence: 100%`,
 * `Name Match: MATCH`…). None of that is meant for an employer to read; the
 * report carries exactly two passages actually written as prose — the
 * "Summary:" line and the "SCORE EXPLANATION" section — so prefer those when
 * they're present. Anything else (a short decline note, a phase blurb) is
 * already plain prose and just needs markdown/bullet/header stripped.
 */
export function extractLabeledLine(raw: string, label: string): string {
  const m = raw.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, "im"));
  return m ? m[1].replace(/\*\*/g, "").trim() : "";
}

export function extractReportSection(raw: string, header: string): string {
  const m = raw.match(new RegExp(`\\*\\*${header}\\*\\*[^\\n]*\\n([\\s\\S]*?)(?:\\n\\*\\*|\\n---|$)`, "i"));
  if (!m) return "";
  return m[1]
    .split(/\n+/)
    .map((l) => l.replace(/\*\*/g, "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function avaProse(raw: string | null | undefined): string {
  if (!raw) return "";

  const summary = extractLabeledLine(raw, "Summary");
  const explanation = extractReportSection(raw, "SCORE EXPLANATION");
  const structuredProse = [summary, explanation].filter(Boolean).join(" ").trim();
  if (structuredProse) return structuredProse;

  // Not the structured resume-report template — it's already prose (a decline
  // note, a phase blurb). Just strip markdown emphasis, bullets, and any bare
  // ALL-CAPS section headers.
  return raw
    .split(/\n+/)
    .map((line) => line.replace(/\*\*/g, "").replace(/^[-–—•*]+\s*/, "").trim())
    .filter((line) => line.length > 2 && !/^[A-Z0-9 ,/&'()-]+:?$/.test(line))
    .join(" ")
    .trim();
}

/** Cut to `max` characters at a sentence end when one is near, else at a
 *  word, with an ellipsis. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentence > max * 0.45) return cut.slice(0, sentence + 1).trim();
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 0 ? space : max).trimEnd()}…`;
}

/** Ava talks to the employer about a person, not a record — so she uses the
 *  name they'd say out loud. */
export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full;
}

export function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/* ── The voice interview's own words ──────────────────────────────────── */

export interface TranscriptTurn {
  role?: string;
  content?: string;
  timestamp?: number | string;
}

export function toMillis(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const ms = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function transcriptOf(app?: { voice_interview_transcript?: unknown } | null): TranscriptTurn[] {
  const raw = app?.voice_interview_transcript;
  return Array.isArray(raw) ? (raw as TranscriptTurn[]) : [];
}

/** Measured length of the interview — the transcript's own clock, not a setting. */
export function interviewMinutes(turns: TranscriptTurn[]): number | null {
  const first = toMillis(turns[0]?.timestamp);
  const last = toMillis(turns[turns.length - 1]?.timestamp);
  if (first == null || last == null || last <= first) return null;
  return Math.max(1, Math.round((last - first) / 60000));
}

function stampLabel(ms: number): string {
  const secs = Math.round(ms / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

/** The candidate's own words: their longest answer, quoted whole. */
export function pullQuote(turns: TranscriptTurn[]): { text: string; at: string | null } | null {
  const answers = turns.filter(
    (t) => t.role === "user" && typeof t.content === "string" && t.content.trim().length > 40,
  );
  if (answers.length === 0) return null;
  const best = answers.reduce((a, b) => ((b.content?.length ?? 0) > (a.content?.length ?? 0) ? b : a));
  const start = toMillis(turns[0]?.timestamp);
  const spoken = toMillis(best.timestamp);
  return {
    text: clip(best.content!.trim().replace(/\s+/g, " "), 190),
    at: start != null && spoken != null && spoken >= start ? stampLabel(spoken - start) : null,
  };
}
