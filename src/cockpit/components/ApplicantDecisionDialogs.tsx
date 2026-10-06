import { createPortal } from "react-dom";
import { ActionDialog } from "./ActionDialog";
import { advanceTargetLabel, avaAdvanceRec } from "../hooks/useCockpitData";
import { firstName } from "../lib/avaProse";
import type { Candidate } from "../data";
import type { CandidateJourneyStep } from "@/lib/candidateJourney";

/**
 * The four decisions a hiring team makes about one applicant — move them on,
 * let them take the next test, hire, pass (or take back an offer) — asked in
 * Ava's voice. One set, shared by the Applicants panel and the full profile,
 * so the same button asks the same question on both.
 *
 * Ava asks in the same words as the button that opened the dialog, and says
 * what she will actually do next. Never "advance", "stage", "pipeline" or
 * "the candidate" — this is a person, by name.
 *
 * Portalled to <body>: ActionDialog is a plain fixed overlay, and any
 * transformed ancestor (the cockpit's ck-rise / ck-reveal entrances leave one
 * behind) would centre it on the page column instead of the screen.
 */
export type ApplicantDecision = "advance" | "continue" | "hire" | "reject";

export function ApplicantDecisionDialogs({
  open,
  candidate,
  status,
  nextStep,
  busy,
  onClose,
  onAdvance,
  onContinue,
  onHire,
  onReject,
}: {
  open: ApplicantDecision | null;
  candidate: Candidate | null;
  /** applications.status, read before the move: it decides the words. */
  status: string | undefined;
  /** The step "Let them take the next test" opens, when there is one. */
  nextStep: CandidateJourneyStep | null;
  busy: boolean;
  onClose: () => void;
  onAdvance: () => void;
  onContinue: () => void;
  onHire: () => void;
  onReject: (reason?: string) => void;
}) {
  const who = candidate ? firstName(candidate.name) : "";
  const offered = status === "offered";
  return createPortal(
    <>
      {open === "advance" && candidate && (() => {
        const label = advanceTargetLabel(status);
        const rec = avaAdvanceRec(candidate.overall ?? 0, candidate.analyzed, candidate.recommendedAction, candidate.hardRejectReason);
        const ask =
          label === "Shortlist"
            ? { title: `Move ${who} to your shortlist?`, body: `I'll let ${who} know they've moved on, and keep them near the top of your list.` }
            : label === "Interview"
              ? { title: `Take ${who} to interview?`, body: `I'll tell ${who} you'd like to meet. You can pick the time straight after this.` }
              : label === "Offer"
                ? { title: `Make ${who} an offer?`, body: `I'll let ${who} know an offer is on its way from you, so nothing goes quiet while you write it.` }
                : { title: `Move ${who} forward?`, body: `I'll move ${who} on to the next step and let them know.` };
        return (
          <ActionDialog
            open
            title={ask.title}
            description={ask.body}
            confirmLabel={label ? `Move to ${label}` : "Move forward"}
            tone="brass"
            busy={busy}
            note={rec.text}
            noteTone={rec.tone}
            onConfirm={onAdvance}
            onClose={onClose}
          />
        );
      })()}
      {open === "continue" && candidate && (
        <ActionDialog
          open
          title={nextStep ? `Let ${who} take the ${nextStep.title}?` : `Let ${who} continue?`}
          description={
            nextStep
              ? `I'll open the ${nextStep.title} for ${who} and let them know. Nothing else changes — their score so far and your other options stay as they are.`
              : `${who} has finished every step already.`
          }
          confirmLabel={nextStep ? `Open the ${nextStep.title}` : "Close"}
          tone="brass"
          busy={busy}
          onConfirm={onContinue}
          onClose={onClose}
        />
      )}
      <ActionDialog
        open={open === "hire" && !!candidate}
        title={candidate ? `Hire ${who}?` : ""}
        description={candidate ? `I'll mark ${who} as hired for ${candidate.role} and let them know today. You can send the offer letter next.` : ""}
        confirmLabel="Confirm hire"
        tone="brass"
        busy={busy}
        onConfirm={onHire}
        onClose={onClose}
      />
      <ActionDialog
        open={open === "reject" && !!candidate}
        title={candidate ? (offered ? `Take back ${who}'s offer?` : `Pass on ${who}?`) : ""}
        description={
          candidate
            ? offered
              ? `I'll let ${who} know the offer is no longer open, in your name and kindly.`
              : `${who} comes off your list and I send a polite note in your name.`
            : ""
        }
        confirmLabel={candidate && offered ? "Take back offer" : "Pass"}
        tone="danger"
        busy={busy}
        withReason
        reasonLabel="Why, in a line? Only you see this."
        reasonPlaceholder="e.g. Strong, but went with someone with more weekend availability."
        onConfirm={onReject}
        onClose={onClose}
      />
    </>,
    document.body,
  );
}

export default ApplicantDecisionDialogs;
