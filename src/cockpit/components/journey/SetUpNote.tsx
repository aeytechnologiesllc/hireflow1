import { Check, X } from "lucide-react";

/**
 * The one line that says the guide is over (the owner, 2026-10-21): the first
 * time "Your first hire" goes away, "You're set up. From here, this page shows
 * only what needs you." once, with an X. Whether the guide was ever shown, and
 * whether this was put away, live in this browser only (localStorage): a
 * business that never saw the guide never gets the line, and nothing here
 * decides what the dashboard shows. The stage rules do that, from real data.
 */

export function SetUpNote({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="ck-rise flex items-center gap-3 rounded-[10px] py-2 pl-3.5 pr-2"
      style={{ background: "var(--action-soft)", border: "1px solid color-mix(in srgb, var(--action) 22%, transparent)" }}
      data-first-hire-set-up
    >
      <Check className="h-4 w-4 shrink-0" style={{ color: "var(--action)" }} strokeWidth={2.5} aria-hidden />
      <p className="min-w-0 flex-1 text-[13px] leading-[1.45]" style={{ color: "var(--ink)" }}>
        <span className="font-semibold">You&rsquo;re set up.</span> From here, this page shows only what needs you.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-70"
        style={{ color: "var(--ink-3)" }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
