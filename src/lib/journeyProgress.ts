import type { CandidateJourneyStep } from "@/lib/candidateJourney";

/**
 * journeyProgress.ts — has the candidate DONE the step they are standing on?
 *
 * The employer's "Let them take the next test" control (2026-10-04) must only
 * appear when a candidate is parked: their current step's result is on file
 * and Ava, recommending against them, has not opened the next one. While a
 * step is still theirs to take, the control stays hidden — otherwise it would
 * be a way to skip a test nobody took.
 *
 * The per-type evidence is the same the candidate's own screen reads to say
 * "Under review" rather than "Up next" (CandidateApplicationDetail.tsx's
 * hasPhaseData); docs/TRUSTED-RESULTS.md lists where each result lands.
 * Keep the two in step.
 */
export function stepHasResult(
  notes: Record<string, unknown>,
  voiceInterviewResult: unknown,
  step: Pick<CandidateJourneyStep, "id" | "type">,
): boolean {
  const record = notes[step.id] as { completedAt?: unknown; completed?: unknown; videoUrl?: unknown } | undefined;
  switch (step.type) {
    case "application": {
      const answers = notes.applicationAnswers;
      return Array.isArray(answers) && answers.length > 0;
    }
    case "typing_test":
      return !!notes.typingTestResult;
    case "chat_simulation":
      return !!notes.chatSimulationResult;
    case "chat_interview":
      return !!notes.chatInterviewResult;
    case "sales_simulation":
      return !!notes.salesSimulationResult;
    case "quiz":
      return !!(record?.completedAt || notes.quizResult);
    case "video_intro":
    case "video_message":
      return !!notes.videoIntroUrl || !!(record?.videoUrl || record?.completed);
    case "portfolio_upload":
      return !!notes.portfolioResult;
    case "voice_interview":
      return !!voiceInterviewResult;
    case "decision":
      return true;
    default:
      return !!notes[step.id];
  }
}
