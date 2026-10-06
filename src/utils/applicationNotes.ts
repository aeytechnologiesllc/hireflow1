/**
 * Safe utilities for parsing and stringifying application notes.
 * 
 * The `applications.notes` column is a TEXT field that stores JSON data.
 * This module provides helpers that:
 * 1. Handle both string and object inputs (since Supabase may return either)
 * 2. Never silently lose data - if parsing fails, preserve it as __legacyTextNote
 * 3. Always produce valid JSON strings for database writes
 */

// Lightweight summaries — this is the `applications.notes` JSONB column, an
// AI/step-writer-populated blob whose real shape is asserted server-side
// (see the trusted_result_enforcement / protect_application_columns
// migrations), not by this type. Each interface below covers only the
// fields actually read off it anywhere in src/ (grepped across every
// `.field.subfield` access on notes of this type); a step's full raw
// blob — read only through the `[stepId: string]` index signature — stays
// `unknown` and is narrowed locally by whichever caller reads it.
export interface QuizResultSummary {
  score?: number;
  passed?: boolean;
  total?: number;
  correct?: number;
}

export interface TypingTestResultSummary {
  wpm?: number;
  accuracy?: number;
}

/**
 * The computer and connection check, written only by the connection-test
 * edge function's `record` op (docs/EQUIPMENT-CHECK.md §5). Every figure is
 * the server's, from its own clock; the browser's numbers are never stored.
 * Optional like its neighbours: readers must survive a row written by an
 * older build.
 */
export interface EquipmentCheckDeviceSummary {
  os?: string | null;
  osVersion?: string | null;
  browser?: string | null;
  browserVersion?: string | null;
  /** e.g. "1920×1080" */
  screen?: string | null;
  dpr?: number | null;
  cores?: number | null;
  memoryGb?: number | null;
  touch?: boolean | null;
  language?: string | null;
  timezone?: string | null;
  connectionType?: string | null;
  model?: string | null;
}

export interface EquipmentCheckResultSummary {
  downloadMbps?: number;
  uploadMbps?: number;
  latencyMs?: number;
  jitterMs?: number;
  measuredBy?: "server";
  /** How many runs before this one was sent (up to 3). */
  runs?: number;
  usingThisComputer?: "yes" | "no_switched" | "ran_here_anyway";
  deviceKind?: "computer" | "phone" | "tablet";
  device?: EquipmentCheckDeviceSummary;
  /** The job's own numbers, as configured on the step. */
  bars?: { minDownloadMbps?: number; minUploadMbps?: number; maxLatencyMs?: number };
  meetsBars?: boolean;
  /** Which bars were missed, e.g. ["upload"]. */
  below?: string[];
  measuredAt?: string;
  attempt?: number;
  _trusted?: boolean;
}

export interface ChatSimulationResultSummary {
  score?: number;
  passed?: boolean;
  recommendation?: string;
}

export interface ChatInterviewResultSummary {
  score?: number;
}

export interface SalesSimulationResultSummary {
  score?: number;
  recommendation?: string;
}

export interface PortfolioResultSummary {
  score?: number;
  feedback?: string;
}

// A step's raw stored blob, narrowed to the handful of fields callers read
// off notes[stepId] before knowing the step's real type (see e.g.
// CandidateApplicationDetail.tsx and QuizPhase.tsx). Cast to this — never
// widen the index signature above back to `any` — at each read site.
export interface StepRecordLike {
  completedAt?: string;
  videoUrl?: string;
  completed?: boolean;
}

/**
 * One answer on the application form, as stored in notes.applicationAnswers.
 *
 * `answer` is always a readable string — every reader (the scoring prompt,
 * the interview prompt, the dossier PDF, the staff screens) prints it as-is.
 * A pick-several question (type "multi_select", 2026-10-05: "Which shifts can
 * you cover?") ALSO carries `selected`, the ticked options in the job's own
 * option order; its `answer` is those options joined with "; " — never ","
 * because the options themselves contain commas ("Daytime, 8am to 4pm
 * Eastern").
 */
export interface ApplicationAnswerRecord {
  questionId?: string;
  question: string;
  answer: string;
  type?: string;
  selected?: string[];
}

export interface ApplicationNotesData {
  // Standard application fields
  applicationAnswers?: ApplicationAnswerRecord[];

  // Quiz data
  quizAnswers?: Record<string, unknown>;
  quizResult?: QuizResultSummary;

  // Typing test
  typingTestResult?: TypingTestResultSummary;

  // Computer and connection check
  equipmentCheckResult?: EquipmentCheckResultSummary;

  // Video intro
  videoIntroUrl?: string;
  videoIntroResult?: unknown;

  // Simulations
  chatSimulationResult?: ChatSimulationResultSummary;
  chatInterviewResult?: ChatInterviewResultSummary;
  salesSimulationResult?: SalesSimulationResultSummary;

  // Portfolio
  portfolioResult?: PortfolioResultSummary;

  // Employer-managed metadata
  employerSkippedPhases?: string[];

  // Blueprint cache
  blueprintData?: unknown;

  // Legacy fallback for unparseable text
  __legacyTextNote?: string;

  // Voice interview events
  voiceInterviewInconsistencies?: unknown[];
  voiceInterviewNotes?: unknown[];

  // Resume analysis
  resumeAnalysis?: unknown;

  // Dynamic step data (step IDs as keys) — real shape varies by step type;
  // narrow with a local cast at the read site instead of widening this.
  [stepId: string]: unknown;
}

/** Separator for a pick-several answer's readable string. Not "," — the
 *  options themselves contain commas. */
export const MULTI_SELECT_ANSWER_SEPARATOR = "; ";

/**
 * A pick-several answer, ready to store: the ticked options in the job's own
 * option order (not click order — the stored answer and the scoring
 * fingerprint must not change because someone ticked boxes bottom-up), any
 * value no longer among the options dropped, and the readable string.
 */
export function formatMultiSelectAnswer(
  options: readonly string[] | null | undefined,
  selected: readonly string[] | null | undefined,
): { answer: string; selected: string[] } {
  const picked = new Set(selected ?? []);
  const ordered = (options ?? []).filter((option, index, all) => picked.has(option) && all.indexOf(option) === index);
  return { answer: ordered.join(MULTI_SELECT_ANSWER_SEPARATOR), selected: ordered };
}

/**
 * Safely parses application.notes from unknown input (string, object, null).
 * Never throws - always returns a valid object.
 * If input is unparseable text, stores it in __legacyTextNote.
 */
export function parseApplicationNotes(notes: unknown): ApplicationNotesData {
  // Handle null/undefined
  if (notes === null || notes === undefined) {
    return {};
  }
  
  // Handle object (already parsed by Supabase or JSON type)
  if (typeof notes === "object" && !Array.isArray(notes)) {
    return notes as ApplicationNotesData;
  }
  
  // Handle string - attempt JSON parse
  if (typeof notes === "string") {
    if (!notes.trim()) {
      return {};
    }
    
    try {
      const parsed = JSON.parse(notes);
      // Ensure we got an object, not an array or primitive
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as ApplicationNotesData;
      }
      // Got an array or primitive - wrap it
      return { __legacyTextNote: notes };
    } catch {
      // JSON parse failed - store the raw text so we don't lose it
      return { __legacyTextNote: notes };
    }
  }
  
  // Unknown type - return empty
  return {};
}

/**
 * Stringify notes object for database storage.
 * Always returns a valid JSON string.
 */
export function stringifyApplicationNotes(notes: ApplicationNotesData): string {
  return JSON.stringify(notes);
}

/**
 * Merge new data into existing notes without losing any fields.
 * This is the safe way to update notes - it preserves all existing data.
 */
export function mergeApplicationNotes(
  existing: unknown,
  updates: Partial<ApplicationNotesData>
): ApplicationNotesData {
  const parsed = parseApplicationNotes(existing);
  return { ...parsed, ...updates };
}

/**
 * Check if a phase is in the employer-skipped list.
 * Checks both the phase ID and type for backward compatibility.
 */
export function isPhaseSkipped(
  notes: unknown,
  phaseId: string,
  phaseType?: string
): boolean {
  const parsed = parseApplicationNotes(notes);
  const skippedPhases = parsed.employerSkippedPhases || [];
  
  // Check if phase ID is in the list
  if (skippedPhases.includes(phaseId)) {
    return true;
  }
  
  // Check if phase type is in the list (backward compatibility)
  if (phaseType && skippedPhases.includes(phaseType)) {
    return true;
  }
  
  return false;
}

/**
 * Add phases to the skipped list (with deduplication).
 */
export function addSkippedPhases(
  notes: ApplicationNotesData,
  phaseIds: string[]
): ApplicationNotesData {
  const existing = notes.employerSkippedPhases || [];
  const combined = [...existing, ...phaseIds];
  // Deduplicate
  const unique = [...new Set(combined)];
  
  return {
    ...notes,
    employerSkippedPhases: unique,
  };
}

/**
 * Remove phases from the skipped list.
 */
export function removeSkippedPhases(
  notes: ApplicationNotesData,
  phaseIds: string[]
): ApplicationNotesData {
  const existing = notes.employerSkippedPhases || [];
  const filtered = existing.filter((id) => !phaseIds.includes(id));
  
  if (filtered.length === 0) {
    const { employerSkippedPhases, ...rest } = notes;
    return rest;
  }
  
  return {
    ...notes,
    employerSkippedPhases: filtered,
  };
}
