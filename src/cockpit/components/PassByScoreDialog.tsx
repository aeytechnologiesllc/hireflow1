import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { bulkPassDoneWords, bulkPassProgressWords } from "../lib/bulkPass";
import {
  PASS_BY_SCORE_DEFAULT,
  PASS_BY_SCORE_MAX,
  PASS_BY_SCORE_MIN,
  clampScoreLine,
  passByScorePlan,
  passByScoreWords,
  scoreBars,
  type ScoreRow,
} from "../lib/passByScore";
import { useBulkPass } from "../hooks/useBulkPass";
import { DeclineNotePreview } from "./ApplicantDecisionDialogs";

/**
 * Pass by score: pass on everyone who finished and scored under a line, in
 * one go (lib/passByScore.ts; docs/APPLICANTS-LIST.md, "Pass by score").
 *
 * The owner, 2026-10-09: "select a score ... it'll show like a clear
 * transparency how many people will be and ask me to confirm and then that's
 * it ... and then they would be notified."
 *
 * Everything he needs to decide is on one screen and moves as he moves the
 * line: how many it reaches, every one of them by name and score, who is left
 * alone and why, and the note each will read. Because it emails every one of
 * them and cannot be undone, the button is pressed twice: once to say how
 * many, once to mean it. Moving the line takes the second press back.
 *
 * The passing itself is the bulk Pass's (hooks/useBulkPass.ts): one person at
 * a time, declined then emailed, and an honest count at the end.
 *
 * Portalled to <body> like the cockpit's other dialogs: the entrance
 * animations leave a transform on an ancestor, which would trap a fixed
 * element inside the page column.
 */
export function PassByScoreDialog({
  open,
  rows,
  jobLabel,
  onClose,
  onDone,
}: {
  open: boolean;
  /** Everyone on the list for the job in view (not only the rows drawn, and not narrowed by a tab or a search). */
  rows: readonly ScoreRow[];
  /** The job's name, or "All your jobs". */
  jobLabel: string;
  onClose: () => void;
  /** After a run, with the ids it set out to pass on. */
  onDone?: (ids: string[]) => void;
}) {
  const [line, setLine] = useState(PASS_BY_SCORE_DEFAULT);
  const [typed, setTyped] = useState(String(PASS_BY_SCORE_DEFAULT));
  const [armed, setArmed] = useState(false);
  const { passMany, progress, busy } = useBulkPass();

  // Every opening starts from the same place, unarmed.
  useEffect(() => {
    if (!open) return;
    setLine(PASS_BY_SCORE_DEFAULT);
    setTyped(String(PASS_BY_SCORE_DEFAULT));
    setArmed(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const plan = useMemo(() => passByScorePlan(rows, line), [rows, line]);
  const words = useMemo(() => passByScoreWords(plan), [plan]);
  const bars = useMemo(() => scoreBars(plan.scores), [plan.scores]);

  if (!open || typeof document === "undefined") return null;

  const count = plan.pass.targets.length;
  const tallest = Math.max(1, ...bars);
  const moveTo = (value: number) => {
    const next = clampScoreLine(value);
    setLine(next);
    setTyped(String(next));
    setArmed(false);
  };

  const run = async () => {
    if (busy || count === 0) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    const targets = plan.pass.targets;
    const result = await passMany(targets);
    const said = bulkPassDoneWords(result);
    (said.ok ? toast.success : toast.error)(said.title, said.description ? { description: said.description } : undefined);
    onDone?.(targets.map((t) => t.applicationId));
    onClose();
  };

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
        aria-labelledby="ck-pass-by-score-title"
        data-pass-by-score
        className="ck-card relative flex max-h-[calc(100dvh-32px)] w-full max-w-[560px] flex-col p-0"
        style={{ animation: "ck-rise 0.22s cubic-bezier(0.4,0,0.2,1) both" }}
      >
        <div className="border-b px-5 pb-3.5 pt-5" style={{ borderColor: "var(--line)" }}>
          <button onClick={onClose} disabled={busy} className="absolute right-3 top-3 p-1 disabled:opacity-40" style={{ color: "var(--hf-text-muted)" }} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
          <h2 id="ck-pass-by-score-title" className="pr-8 font-display text-[19px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
            Pass by score
          </h2>
          <p className="mt-0.5 pr-8 text-[13px]" style={{ color: "var(--hf-text-soft)" }}>
            {jobLabel}
          </p>
        </div>

        <div className="ck-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4" data-pass-body>
          {/* The line. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <label htmlFor="ck-pass-line" className="text-[14px]" style={{ color: "var(--hf-text)" }}>
              Pass on everyone who finished and scored under
            </label>
            <div className="flex items-center gap-1.5">
              <button type="button" className="ck-btn ck-btn-outline !h-9 !w-9 !p-0" onClick={() => moveTo(line - 5)} disabled={busy || line <= PASS_BY_SCORE_MIN} aria-label="Lower the line by 5">
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <input
                id="ck-pass-line"
                inputMode="numeric"
                value={typed}
                disabled={busy}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 3);
                  setTyped(digits);
                  setArmed(false);
                  if (digits !== "") setLine(clampScoreLine(Number(digits)));
                }}
                onBlur={() => setTyped(String(line))}
                // 16px on a phone: an iPhone zooms the page in on a field with smaller text.
                className="ck-input h-9 w-[64px] text-center !text-[16px] font-semibold tabular-nums md:!text-[15px]"
                aria-describedby="ck-pass-headline"
                data-pass-line
              />
              <button type="button" className="ck-btn ck-btn-outline !h-9 !w-9 !p-0" onClick={() => moveTo(line + 5)} disabled={busy || line >= PASS_BY_SCORE_MAX} aria-label="Raise the line by 5">
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          {/* The picture: where everyone who finished scored, and where the line falls. */}
          <div className="mt-4" aria-hidden data-pass-picture>
            <div className="relative flex h-[76px] items-end gap-1">
              {bars.map((n, i) => {
                // A bar the line cuts through is drawn in two parts.
                const from = i * 10;
                const cut = Math.min(1, Math.max(0, (plan.under - from) / 10));
                const height = n === 0 ? 3 : Math.max(8, Math.round((n / tallest) * 76));
                return (
                  <div key={i} className="relative flex-1 overflow-hidden rounded-t-[5px]" style={{ height, background: n === 0 ? "var(--line-soft)" : "var(--jade-soft)" }}>
                    {n > 0 && cut > 0 && <div className="absolute inset-y-0 left-0" style={{ width: `${cut * 100}%`, background: "var(--crit)", opacity: 0.78 }} />}
                    {n > 0 && (
                      <span className="absolute inset-x-0 top-0.5 text-center text-[10px] font-semibold tabular-nums" style={{ color: "var(--hf-text)" }}>
                        {n}
                      </span>
                    )}
                  </div>
                );
              })}
              <div className="pointer-events-none absolute inset-y-[-6px] w-px" style={{ left: `${plan.under}%`, background: "var(--hf-text)" }} />
            </div>
            <div className="mt-1 flex justify-between text-[10.5px] tabular-nums" style={{ color: "var(--ink-3)" }}>
              <span>0</span>
              <span>50</span>
              <span>100</span>
            </div>
          </div>
          <input
            type="range"
            min={PASS_BY_SCORE_MIN}
            max={PASS_BY_SCORE_MAX}
            step={1}
            value={line}
            disabled={busy}
            onChange={(e) => moveTo(Number(e.target.value))}
            className="mt-1 w-full accent-[var(--jade)]"
            aria-label="The score line"
            data-pass-slider
          />

          {/* What it does, in numbers. */}
          <p id="ck-pass-headline" className="mt-4 font-display text-[22px] leading-tight" style={{ color: "var(--hf-text)", fontWeight: 500 }} aria-live="polite" data-pass-headline>
            {words.headline}
          </p>
          <p className="mt-1 text-[13px] leading-snug" style={{ color: "var(--hf-text-soft)" }}>
            {words.effect}
          </p>
          {count > 0 && (
            <p className="mt-2 rounded-[10px] px-3 py-2.5 text-[12.5px] leading-snug" style={{ background: "var(--surface-2)", color: "var(--hf-text-soft)" }} data-pass-note>
              <DeclineNotePreview jobTitle={plan.pass.jobTitle} />
            </p>
          )}

          {/* Every one of them, by name. */}
          {count > 0 && (
            <>
              <p className="mt-4 text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>
                Who that is, lowest score first
              </p>
              <ul className="ck-scroll mt-1.5 max-h-[168px] overflow-y-auto rounded-[10px] border" style={{ borderColor: "var(--line)" }} data-pass-who>
                {plan.reached.map((person) => (
                  <li key={person.id} className="flex items-center justify-between gap-3 border-b px-3 py-1.5 text-[13px] last:border-b-0" style={{ borderColor: "var(--line-soft)", color: "var(--hf-text)" }}>
                    <span className="min-w-0 truncate">{person.name}</span>
                    <span className="shrink-0 tabular-nums" style={{ color: "var(--hf-text-soft)" }}>
                      {person.score}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Who is left alone, and why. */}
          {words.left.length > 0 && (
            <ul className="mt-4 space-y-1 text-[12.5px] leading-snug" style={{ color: "var(--hf-text-soft)" }} data-pass-left>
              {words.left.map((text) => (
                <li key={text} className="flex gap-2">
                  <span aria-hidden style={{ color: "var(--ink-3)" }}>
                    •
                  </span>
                  <span className="min-w-0">{text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3" style={{ borderColor: "var(--line)" }}>
          <span className="min-w-0 flex-1 text-[12px] leading-snug" style={{ color: armed ? "var(--crit)" : "var(--ink-3)" }} role="status" data-pass-warning>
            {busy ? "Keep this open until it finishes." : armed ? words.warning : count > 0 ? "Nothing happens until you confirm." : ""}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <button type="button" className="ck-btn ck-btn-ghost !py-2 !text-[13px]" onClick={armed && !busy ? () => setArmed(false) : onClose} disabled={busy}>
              {armed && !busy ? "Back" : "Cancel"}
            </button>
            {/* The first press is the cockpit's own "danger" button (an
                outline); only the press that means it is filled. */}
            <button
              type="button"
              className={`ck-btn !py-2 !text-[13px] ${armed || busy ? "" : "ck-btn-outline"}`}
              style={
                armed || busy
                  ? { background: "var(--crit)", color: "var(--btn-fg)" }
                  : { color: "var(--hf-danger)", borderColor: "color-mix(in srgb, var(--hf-danger) 50%, transparent)", opacity: count === 0 ? 0.5 : 1 }
              }
              onClick={() => void run()}
              disabled={busy || count === 0}
              data-pass-confirm={armed ? "armed" : "idle"}
            >
              {busy && progress ? bulkPassProgressWords(progress.done, progress.total) : armed ? words.confirm : words.arm}
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
