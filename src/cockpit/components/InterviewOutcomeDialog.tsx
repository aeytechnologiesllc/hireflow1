import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CalendarX2, MessagesSquare, X } from "lucide-react";
import { outcomeAskWords, outcomeNextWords } from "../lib/interviewOutcome";
import type { InterviewScore } from "../lib/interviewScore";

/**
 * "How did it go?": the step that closes an interview (lib/interviewOutcome.ts;
 * docs/INTERVIEWS.md, "How did it go?").
 *
 * One question once the interview's time has passed, and the answer leads
 * somewhere. "We talked" marks it done and turns the same card into "What
 * next?": his own rating of the interview, then the offer letter, the
 * profile, or later. "They did not show up" hands over to the no-show
 * choices (NoShowDialog). Nothing here decides for him and nothing is sent
 * to the applicant from this card.
 *
 * Portalled to <body> like the cockpit's other dialogs.
 */
function Choice({ title, hint, icon, filled, disabled, onClick, mark }: { title: string; hint: string; icon?: ReactNode; filled?: boolean; disabled?: boolean; onClick: () => void; mark: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-outcome-choice={mark}
      className="flex w-full items-center gap-3 rounded-[12px] border px-4 py-3 text-left transition-[filter,background-color] disabled:opacity-50"
      style={filled ? { background: "var(--jade)", borderColor: "var(--jade)", color: "var(--btn-fg)" } : { background: "var(--hf-surface)", borderColor: "var(--hf-border-strong)", color: "var(--hf-text)" }}
    >
      {icon && (
        <span className="shrink-0" aria-hidden>
          {icon}
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[14.5px] font-semibold leading-[1.3]">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-[1.4]" style={{ opacity: filled ? 0.85 : 1, color: filled ? undefined : "var(--ink-3)" }}>
          {hint}
        </span>
      </span>
    </button>
  );
}

export function InterviewOutcomeDialog({
  open,
  stage,
  name,
  whenLabel,
  score,
  busy,
  canOffer,
  onTalked,
  onNoShow,
  onGuide,
  onOffer,
  onProfile,
  onClose,
}: {
  open: boolean;
  /** "ask": what happened. "next": it is marked done; what now. */
  stage: "ask" | "next";
  name: string;
  /** "today at 4:00 pm", as the page writes it. */
  whenLabel: string | null;
  score: InterviewScore | null;
  busy: boolean;
  /** False when there is no application to write a letter for (the showcase data). */
  canOffer: boolean;
  onTalked: () => void;
  onNoShow: () => void;
  onGuide: () => void;
  onOffer: () => void;
  onProfile: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;
  const ask = outcomeAskWords(name, whenLabel);
  const next = outcomeNextWords(name, score);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--hf-bg) 70%, transparent)", backdropFilter: "blur(2px)" }}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ck-outcome-title"
        data-interview-outcome={stage}
        className="ck-card relative flex max-h-[calc(100dvh-32px)] w-full max-w-[460px] flex-col p-0"
        style={{ animation: "ck-rise 0.22s cubic-bezier(0.4,0,0.2,1) both" }}
      >
        <div className="px-5 pb-1 pt-5">
          <button onClick={onClose} disabled={busy} className="absolute right-3 top-3 p-1 disabled:opacity-40" style={{ color: "var(--hf-text-muted)" }} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
          <h2 id="ck-outcome-title" className="pr-8 font-display text-[21px] leading-tight" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
            {stage === "ask" ? ask.title : next.title}
          </h2>
          {stage === "ask" && ask.when && (
            <p className="mt-1 pr-8 text-[13px]" style={{ color: "var(--hf-text-soft)" }}>
              {ask.when}
            </p>
          )}
        </div>

        <div className="ck-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-3">
          {stage === "ask" ? (
            <div className="flex flex-col gap-2.5">
              <Choice mark="talked" title={ask.talked} hint={ask.talkedHint} icon={<MessagesSquare className="h-5 w-5" />} filled disabled={busy} onClick={onTalked} />
              <Choice mark="no-show" title={ask.noShow} hint={ask.noShowHint} icon={<CalendarX2 className="h-5 w-5" />} disabled={busy} onClick={onNoShow} />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[12px] px-3.5 py-3" style={{ background: next.rated ? "var(--jade-soft)" : "var(--surface-2)" }} data-outcome-rating>
                <span className="min-w-0 text-[13.5px] font-semibold leading-snug" style={{ color: next.rated ? "var(--jade-soft-fg)" : "var(--hf-text)" }}>
                  {next.rating}
                </span>
                <button type="button" className="ck-btn ck-btn-outline !py-1.5 !text-[12.5px]" onClick={onGuide} data-outcome-guide>
                  {next.guide}
                </button>
              </div>
              <div className="mt-3 flex flex-col gap-2.5">
                {canOffer && <Choice mark="offer" title={next.offer} hint={next.offerHint} filled onClick={onOffer} />}
                <Choice mark="profile" title={next.profile} hint={next.profileHint} onClick={onProfile} />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end border-t px-5 py-3" style={{ borderColor: "var(--line)" }}>
          <button type="button" className="ck-btn ck-btn-ghost !py-2 !text-[13px]" onClick={onClose} disabled={busy} data-outcome-later>
            {stage === "ask" ? ask.later : next.later}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
