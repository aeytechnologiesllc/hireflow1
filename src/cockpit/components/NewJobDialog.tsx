import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, X } from "lucide-react";
import AvaSeal from "@/components/ava/AvaSeal";
import { START_FROM_JOB_LINE, jobStartActionLabel, type JobStartOption } from "@/lib/jobCopy";

/**
 * "New job": where a new job starts from.
 *
 * The owner, 2026-10-07: "create a job, like new job and allow me to post
 * from the draft. So right now it just takes me to the AI, which is cool. I
 * want to be able to see if I can pull it from the draft … I like this job,
 * right? So I want to be able to add that to the draft and then that way I
 * can pull it, use the same job later."
 *
 * Two ways in, on one small card:
 *  - Write a new one with Ava: what "+ New job" has always done;
 *  - start from one you already have: a draft opens to be finished and
 *    published; a live or closed job is copied to a new draft first
 *    (src/lib/jobCopy.ts), and the copy opens. The original is not touched.
 *
 * The Jobs page opens it only when there is a job to start from; with none,
 * "+ New job" goes straight to Ava as before.
 *
 * Portalled to <body> like the cockpit's other dialogs: the entrance
 * animations leave a transform on an ancestor, which would trap a fixed
 * element inside the page column.
 */

const CHIP: Record<JobStartOption["status"], { label: string; bg: string; fg: string }> = {
  live: { label: "Live", bg: "var(--jade-soft)", fg: "var(--jade-soft-fg)" },
  draft: { label: "Draft", bg: "var(--amber-bg)", fg: "var(--amber-fg)" },
  closed: { label: "Closed", bg: "var(--surface-2)", fg: "var(--ink-2)" },
};

export function NewJobDialog({
  open,
  options,
  busyId,
  onAva,
  onPick,
  onClose,
}: {
  open: boolean;
  /** The jobs a new one can start from, in the order they are shown. */
  options: readonly JobStartOption[];
  /** The job being copied right now, if any: everything waits on it. */
  busyId: string | null;
  onAva: () => void;
  onPick: (option: JobStartOption) => void;
  onClose: () => void;
}) {
  const busy = busyId != null;
  const firstRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => firstRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--hf-bg) 70%, transparent)", backdropFilter: "blur(2px)" }}
        onClick={() => !busy && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ck-new-job-title"
        data-new-job-dialog
        className="ck-card relative flex max-h-[calc(100dvh-32px)] w-full max-w-[520px] flex-col p-5"
        style={{ animation: "ck-rise 0.22s cubic-bezier(0.4,0,0.2,1) both" }}
      >
        <button onClick={() => !busy && onClose()} className="absolute right-3 top-3" style={{ color: "var(--hf-text-muted)" }} aria-label="Close" disabled={busy}>
          <X className="h-4 w-4" />
        </button>

        <h2 id="ck-new-job-title" className="pr-7 font-display text-[19px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
          New job
        </h2>

        {/* ── Start fresh ── */}
        <button
          ref={firstRef}
          type="button"
          data-new-job-ava
          disabled={busy}
          onClick={onAva}
          className="mt-4 flex w-full items-center gap-3 rounded-[12px] border px-3.5 py-3 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] disabled:opacity-60"
          style={{ borderColor: "var(--hf-border-strong)" }}
        >
          <span className="shrink-0">
            <AvaSeal size={26} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold leading-tight" style={{ color: "var(--hf-text)" }}>
              Write a new one with Ava
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: "var(--hf-text-soft)" }}>
              Tell me who you need. I'll write the post and set up the tests.
            </span>
          </span>
          <ChevronRight aria-hidden className="h-4 w-4 shrink-0" style={{ color: "var(--hf-text-muted)" }} />
        </button>

        {/* ── Or one you already have ── */}
        <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>
          Or start from one you already have
        </div>
        <ul className="mt-2 flex min-h-0 flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: "46vh" }}>
          {options.map((option) => {
            const chip = CHIP[option.status];
            const copying = busyId === option.id;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  data-new-job-option={option.id}
                  data-status={option.status}
                  disabled={busy}
                  onClick={() => onPick(option)}
                  className="flex w-full items-center gap-3 rounded-[12px] border px-3.5 py-2.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] disabled:opacity-60"
                  style={{ borderColor: "var(--line)" }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold leading-tight" style={{ color: "var(--hf-text)" }}>
                      {option.title}
                      <span
                        className="ml-2 inline-block rounded-[5px] px-2 py-[3px] align-middle text-[10px] font-bold uppercase leading-none tracking-[0.06em]"
                        style={{ background: chip.bg, color: chip.fg, position: "relative", top: -1 }}
                      >
                        {chip.label}
                      </span>
                    </span>
                    <span className="mt-[3px] block text-[12px] leading-snug" style={{ color: "var(--ink-3)" }}>
                      {option.when}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12.5px] font-medium" style={{ color: option.status === "draft" ? "var(--jade-soft-fg)" : "var(--hf-text-soft)" }}>
                    {copying ? "Copying…" : jobStartActionLabel(option.status)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-3 text-[12px] leading-snug" style={{ color: "var(--ink-3)" }}>
          {START_FROM_JOB_LINE}
        </p>
      </div>
    </div>,
    document.body,
  );
}
