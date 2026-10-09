import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { noShowWords, secondChanceNote, type NoShowChoice } from "../lib/noShow";
import { DeclineNotePreview } from "./ApplicantDecisionDialogs";

/**
 * "They did not show up": what happens next (lib/noShow.ts;
 * docs/INTERVIEWS.md, "When they do not show up").
 *
 * Two choices side by side, each showing the exact words the applicant will
 * read, and a quiet third (only mark it). Nothing is sent until one is
 * pressed. The one suggested (one more chance the first time, pass the
 * second) is the filled button; the other is an outline.
 *
 * Portalled to <body> like the cockpit's other dialogs.
 */
export function NoShowDialog({
  open,
  name,
  jobTitle,
  earlierNoShows,
  busy,
  onChoose,
  onClose,
}: {
  open: boolean;
  name: string;
  jobTitle?: string | null;
  /** How many interviews this applicant has already missed. */
  earlierNoShows: number;
  busy: boolean;
  onChoose: (choice: NoShowChoice) => void;
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

  if (!open || typeof document === "undefined") return null;
  const words = noShowWords(name, earlierNoShows);
  const filled = "ck-btn ck-btn-primary !py-2 !text-[12.5px]";
  const outline = "ck-btn ck-btn-outline !py-2 !text-[12.5px]";

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
        aria-labelledby="ck-no-show-title"
        data-no-show
        className="ck-card relative flex max-h-[calc(100dvh-32px)] w-full max-w-[560px] flex-col p-0"
        style={{ animation: "ck-rise 0.22s cubic-bezier(0.4,0,0.2,1) both" }}
      >
        <div className="border-b px-5 pb-3.5 pt-5" style={{ borderColor: "var(--line)" }}>
          <button onClick={onClose} disabled={busy} className="absolute right-3 top-3 p-1 disabled:opacity-40" style={{ color: "var(--hf-text-muted)" }} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
          <h2 id="ck-no-show-title" className="pr-8 font-display text-[19px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
            {words.title}
          </h2>
          <p className="mt-1 pr-8 text-[13px] leading-snug" style={{ color: "var(--hf-text-soft)" }} data-no-show-body>
            {words.body}
          </p>
        </div>

        <div className="ck-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <section className="rounded-[12px] border px-3.5 py-3" style={{ borderColor: words.suggested === "chance" ? "var(--jade)" : "var(--line)" }} data-no-show-option="chance">
            <h3 className="text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>
              {words.chance.title}
            </h3>
            <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "var(--hf-text-soft)" }}>
              {words.chance.detail}
            </p>
            <p className="mt-2 rounded-[10px] px-3 py-2.5 text-[12.5px] leading-snug" style={{ background: "var(--surface-2)", color: "var(--hf-text-soft)" }}>
              &ldquo;{secondChanceNote(name)}&rdquo;
            </p>
            <button type="button" className={`mt-3 ${words.suggested === "chance" ? filled : outline}`} onClick={() => onChoose("chance")} disabled={busy} data-no-show-choose="chance">
              {words.chance.button}
            </button>
          </section>

          <section className="rounded-[12px] border px-3.5 py-3" style={{ borderColor: words.suggested === "pass" ? "var(--hf-danger)" : "var(--line)" }} data-no-show-option="pass">
            <h3 className="text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>
              {words.pass.title}
            </h3>
            <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "var(--hf-text-soft)" }}>
              {words.pass.detail}
            </p>
            <p className="mt-2 rounded-[10px] px-3 py-2.5 text-[12.5px] leading-snug" style={{ background: "var(--surface-2)", color: "var(--hf-text-soft)" }}>
              <DeclineNotePreview jobTitle={jobTitle} />
            </p>
            <button
              type="button"
              className={`mt-3 ${outline}`}
              style={{ color: "var(--hf-danger)", borderColor: "color-mix(in srgb, var(--hf-danger) 50%, transparent)" }}
              onClick={() => onChoose("pass")}
              disabled={busy}
              data-no-show-choose="pass"
            >
              {words.pass.button}
            </button>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3" style={{ borderColor: "var(--line)" }}>
          <button type="button" className="text-[12px] underline underline-offset-2 disabled:opacity-50" style={{ color: "var(--ink-2)" }} onClick={() => onChoose("mark")} disabled={busy} data-no-show-choose="mark">
            {words.markOnly}
          </button>
          <button type="button" className="ck-btn ck-btn-ghost !py-2 !text-[12.5px]" onClick={onClose} disabled={busy}>
            {busy ? "Working…" : "Cancel"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
