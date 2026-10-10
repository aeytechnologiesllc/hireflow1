import { createPortal } from "react-dom";
import { ActionDialog } from "./ActionDialog";
import { advanceTargetLabel, avaAdvanceRec } from "../hooks/useCockpitData";
import { firstName } from "../lib/avaProse";
import type { Candidate } from "../data";
import type { CandidateJourneyStep } from "@/lib/candidateJourney";
import { declineNoteText } from "@/lib/declineNote";

/** What the Pass confirm says above the note; the list's menu says the same. */
export function passDialogWords(who: string, offered: boolean): string {
  return offered
    ? `${who}'s offer is taken back, and ${who} gets this note in your name:`
    : `${who} comes off your list and gets this note in your name:`;
}

/** The note they will read, word for word (src/lib/declineNote.ts: the email's own words). */
export function DeclineNotePreview({ jobTitle }: { jobTitle?: string | null }) {
  return <span>&ldquo;{declineNoteText(jobTitle)}&rdquo;</span>;
}

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
export type ApplicantDecision = "advance" | "continue" | "reject";

export function ApplicantDecisionDialogs({
  open,
  candidate,
  status,
  nextStep,
  busy,
  onClose,
  onAdvance,
  onContinue,
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
          label === "Review"
            ? { title: `Move ${who} into review?`, body: `I'll let ${who} know they've moved on. To mark them as one of your picks instead, use Add to shortlist: that one tells them nothing.` }
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
      {/* Hire is its own box since 2026-10-10 (HireDialog): the documents ticked and one welcome email. */}
      <ActionDialog
        open={open === "reject" && !!candidate}
        title={candidate ? (offered ? `Take back ${who}'s offer?` : `Pass on ${who}?`) : ""}
        description={candidate ? passDialogWords(who, offered) : ""}
        confirmLabel={candidate && offered ? "Take back offer" : "Pass"}
        tone="danger"
        busy={busy}
        // A plain confirm: no reason to type. What they will read is shown,
        // word for word (the owner: "just ask me for confirmation and send
        // them whatever they need").
        note={candidate ? <DeclineNotePreview jobTitle={candidate.role} /> : null}
        onConfirm={() => onReject()}
        onClose={onClose}
      />
    </>,
    document.body,
  );
}

export default ApplicantDecisionDialogs;
