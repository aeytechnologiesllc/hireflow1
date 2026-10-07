import type { ListUpdates } from "../lib/applicantList";

/**
 * The Applicants list's update bar (docs/APPLICANTS-LIST.md §1, "The list
 * holds still"). While the owner reads, the order on screen holds still: a
 * new applicant, a score landing or someone finishing a test does not move
 * any row. What would move in THIS list waits here, as one quiet line,
 * "12 new · 5 moved · Show", and appears in one go when he presses it (or
 * changes the tab, a filter, the sort or the search, or comes back later).
 *
 * The slot is always there, at one height, saying "Up to date" when nothing
 * is waiting: a bar that appeared and vanished would push the whole list down
 * and back up, which is the jumping this replaced. On a phone it sits under
 * the tabs; on a computer at the top of the list.
 *
 * It is one <button> in both states (aria-disabled while up to date), so
 * pressing Show leaves the keyboard focus on it rather than dropping it to
 * the top of the document, and its words are a polite live region: "5 new"
 * arriving is announced once, not on every heartbeat.
 */
export function ListUpdatesBar({ updates, onShow, phone = false, className = "" }: { updates: ListUpdates; onShow: () => void; phone?: boolean; className?: string }) {
  const { fresh, moved } = updates;
  const waiting = fresh + moved > 0;
  const words = [fresh > 0 ? `${fresh} new` : null, moved > 0 ? `${moved} moved` : null].filter(Boolean).join(" · ");
  const spoken = [fresh > 0 ? `${fresh} new` : null, moved > 0 ? `${moved} moved` : null].filter(Boolean).join(" and ");
  // One height, waiting or not. A phone's is a full-width tap target.
  const height = phone ? 36 : 32;
  return (
    <div data-list-updates={waiting ? "waiting" : "idle"} style={{ height }} className={`flex items-stretch ${className}`}>
      <button
        type="button"
        // Out of index.css's phone-wide button rule (44px floor, 12px type):
        // the slot is one fixed height, and the whole bar is the tap target.
        data-size="icon"
        onClick={() => {
          if (waiting) onShow();
        }}
        aria-disabled={!waiting}
        aria-label={waiting ? `Show ${spoken} ${fresh + moved === 1 ? "applicant" : "applicants"}` : "The list is up to date"}
        className={[
          "flex w-full items-center justify-between gap-3 rounded-[10px] border text-[13px] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--jade)]",
          waiting ? "px-3.5 hover:bg-[var(--surface-2)]" : "cursor-default px-1",
        ].join(" ")}
        style={
          waiting
            ? { background: "var(--surface)", borderColor: "var(--line)", color: "var(--ink-2)" }
            : { background: "transparent", borderColor: "transparent", color: "var(--ink-3)" }
        }
      >
        <span className="flex min-w-0 items-center gap-2" aria-live="polite">
          <span
            aria-hidden
            className={`block shrink-0 rounded-full ${waiting ? "h-[7px] w-[7px]" : "h-[6px] w-[6px]"}`}
            style={{ background: "var(--jade)", opacity: waiting ? 1 : 0.8 }}
          />
          <span className={`tnum truncate ${waiting ? "" : "text-[12.5px]"}`}>{waiting ? words : "Up to date"}</span>
        </span>
        {waiting && (
          <span aria-hidden className="shrink-0 font-semibold" style={{ color: "var(--jade-soft-fg)" }}>
            Show
          </span>
        )}
      </button>
    </div>
  );
}
