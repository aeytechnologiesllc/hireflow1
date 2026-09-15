import { AlertCircle } from "lucide-react";

/**
 * Stands in for a page's own "nothing here" copy when the data behind it
 * never actually came back. "You haven't posted a role yet" and "Nobody has
 * applied yet" are claims about the account; a failed fetch is a claim about
 * the network, and the two must never share a sentence — the account may
 * have plenty of jobs or applicants sitting behind a load that simply
 * failed. Every cockpit hook (useCockpitData.ts) surfaces `isError` +
 * `refetch` precisely so a page can catch this before reaching for its
 * empty-state text. Loading and genuinely-empty states are unaffected — this
 * only ever replaces the empty branch, and only when the fetch itself failed.
 */
export function CockpitErrorCard({
  message,
  onRetry,
  compact = false,
  className = "",
}: {
  /** One calm, plain sentence — no jargon, no "fetch failed". */
  message: string;
  onRetry: () => void;
  /** Tighter padding for a card sitting inside an already-busy layout
   *  (e.g. a thread pane) rather than standing alone on the page. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <section className={`ck-card ck-reveal ${compact ? "p-5" : "p-6 md:p-8"} ${className}`}>
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--hf-danger) 12%, transparent)" }}
        >
          <AlertCircle className="h-[18px] w-[18px]" style={{ color: "var(--hf-danger)" }} />
        </span>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {message}
        </p>
      </div>
      <div className="mt-5">
        <button type="button" className="ck-btn ck-btn-outline !py-2 !text-[12.5px]" onClick={onRetry}>
          Try again
        </button>
      </div>
    </section>
  );
}

export default CockpitErrorCard;
