/**
 * Phase Duration Estimates
 * Used for showing candidates estimated time remaining in their application journey.
 */

export interface PhaseDuration {
  min: number; // minimum minutes
  max: number; // maximum minutes
  label: string; // human-readable label
  isCandidateAction: boolean; // whether candidate needs to do something
}

export const phaseDurationEstimates: Record<string, PhaseDuration> = {
  application: { min: 5, max: 10, label: "5-10 min", isCandidateAction: true },
  quiz: { min: 5, max: 15, label: "5-15 min", isCandidateAction: true },
  typing_test: { min: 2, max: 5, label: "2-5 min", isCandidateAction: true },
  video_intro: { min: 3, max: 10, label: "3-10 min", isCandidateAction: true },
  video_message: { min: 2, max: 5, label: "2-5 min", isCandidateAction: true },
  chat_simulation: { min: 10, max: 20, label: "10-20 min", isCandidateAction: true },
  chat_interview: { min: 15, max: 25, label: "15-25 min", isCandidateAction: true },
  sales_simulation: { min: 10, max: 20, label: "10-20 min", isCandidateAction: true },
  voice_interview: { min: 10, max: 20, label: "10-20 min", isCandidateAction: true },
  portfolio_upload: { min: 5, max: 15, label: "5-15 min", isCandidateAction: true },
  review: { min: 0, max: 0, label: "Employer review", isCandidateAction: false },
  interview: { min: 30, max: 60, label: "30-60 min", isCandidateAction: true },
  hired: { min: 0, max: 0, label: "Complete!", isCandidateAction: false },
};

/**
 * Calculate estimated time remaining for incomplete phases
 */
export function calculateRemainingTime(
  phases: Array<{ id: string; type: string }>,
  completedPhaseIndexes: number[],
  currentPhaseIndex: number
): { minMinutes: number; maxMinutes: number; label: string } {
  let minTotal = 0;
  let maxTotal = 0;

  for (let i = currentPhaseIndex; i < phases.length; i++) {
    if (completedPhaseIndexes.includes(i)) continue;
    
    const phase = phases[i];
    const duration = phaseDurationEstimates[phase.type] || phaseDurationEstimates[phase.id];
    
    if (duration && duration.isCandidateAction) {
      minTotal += duration.min;
      maxTotal += duration.max;
    }
  }

  if (minTotal === 0 && maxTotal === 0) {
    return { minMinutes: 0, maxMinutes: 0, label: "Almost done!" };
  }

  if (minTotal === maxTotal) {
    return { minMinutes: minTotal, maxMinutes: maxTotal, label: `~${minTotal} min` };
  }

  return {
    minMinutes: minTotal,
    maxMinutes: maxTotal,
    label: `~${minTotal}-${maxTotal} min`,
  };
}

/**
 * Get the duration label for a specific phase type
 */
export function getPhaseDurationLabel(phaseType: string): string {
  const duration = phaseDurationEstimates[phaseType];
  if (!duration) return "";
  if (!duration.isCandidateAction) return duration.label;
  return duration.label;
}
