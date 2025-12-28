/**
 * Safe utilities for parsing and stringifying application notes.
 * 
 * The `applications.notes` column is a TEXT field that stores JSON data.
 * This module provides helpers that:
 * 1. Handle both string and object inputs (since Supabase may return either)
 * 2. Never silently lose data - if parsing fails, preserve it as __legacyTextNote
 * 3. Always produce valid JSON strings for database writes
 */

export interface ApplicationNotesData {
  // Standard application fields
  applicationAnswers?: Array<{ question: string; answer: string }>;
  
  // Quiz data
  quizAnswers?: Record<string, any>;
  quizResult?: any;
  
  // Typing test
  typingTestResult?: any;
  
  // Video intro
  videoIntroUrl?: string;
  videoIntroResult?: any;
  
  // Simulations
  chatSimulationResult?: any;
  chatInterviewResult?: any;
  salesSimulationResult?: any;
  
  // Portfolio
  portfolioResult?: any;
  
  // Employer-managed metadata
  employerSkippedPhases?: string[];
  
  // Blueprint cache
  blueprintData?: any;
  
  // Legacy fallback for unparseable text
  __legacyTextNote?: string;
  
  // Voice interview events
  voiceInterviewInconsistencies?: any[];
  voiceInterviewNotes?: any[];
  
  // Resume analysis
  resumeAnalysis?: any;
  
  // Dynamic step data (step IDs as keys)
  [stepId: string]: any;
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
