import { NextStepCard } from "@/components/candidate/NextStepCard";

interface PhaseAlreadySubmittedProps {
  applicationId: string;
  /** The step's candidate-facing title (from the journey, never a machine name). */
  phaseName: string;
  /** Kept for existing callers; the card reads the live row instead. */
  submittedAt?: string;
  /** Kept for existing callers; the card reads processing_mode from the live row. */
  isManualMode?: boolean;
}

/**
 * Shown when a candidate opens a step whose result was ALREADY on file when
 * the page first loaded (a bookmarked link, the back button, a second tab).
 *
 * This used to be "<Step> Submitted · Your application is being processed"
 * with one button, "Back to Application". Every step page swapped its own
 * waiting and "Start next step" screens for it as soon as a background refresh
 * brought the just-sent result back, so on 2026-10-05 the owner hit it after
 * the form, the typing test, the chat practice and the interview. Step pages
 * now decide "already done" once, at first load; and this card is no longer a
 * dead end — it is the live NextStepCard: "Start <next step>" when one is
 * open, or exactly where things stand when it is not.
 */
export function PhaseAlreadySubmitted({ applicationId, phaseName }: PhaseAlreadySubmittedProps) {
  return <NextStepCard applicationId={applicationId} completedTitle={phaseName} />;
}
