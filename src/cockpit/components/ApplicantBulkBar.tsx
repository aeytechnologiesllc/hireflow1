import { useLayoutEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Ban, Check, Minus, X } from "lucide-react";

/**
 * Picking several applicants at once, and the bar that acts on them (Remove
 * and block N, Clear, Select all on this page).
 *
 * The owner, 2026-10-06, with applications pouring in: "give me a nicer,
 * easier way to drop down to delete some of these applicants. And that will
 * just block them too."
 *
 *  - SelectMark is the round checkbox drawn over a row's avatar: on a
 *    computer it shows on hover and on every row once one is picked; on a
 *    phone in Select mode. It is a sibling of the row's link, never inside it
 *    (a control inside an <a> is invalid and would open the profile).
 *  - The bar is portalled to <body> and fixed: a transformed ancestor (the
 *    cockpit's entrance animations leave one behind) would otherwise pin it
 *    to the page column. On a computer it sits over the list's own column;
 *    on a phone above the tab bar, full width.
 */

/** The round checkbox over an avatar (or the header's "all on this page"). */
export function SelectMark({
  checked,
  mixed = false,
  onToggle,
  label,
  size = 38,
  quiet = false,
}: {
  checked: boolean;
  /** Some on this page, not all (the header's). */
  mixed?: boolean;
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
  label: string;
  size?: number;
  /** Drawn smaller inside its box (the header's, beside a column label). */
  quiet?: boolean;
}) {
  const on = checked || mixed;
  const box = quiet ? 18 : 20;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mixed ? "mixed" : checked}
      aria-label={label}
      data-size="icon"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(e);
      }}
      className="grid shrink-0 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--jade)]"
      style={{
        width: size,
        height: size,
        // Opaque, so the avatar under it does not show through.
        background: quiet ? "transparent" : on ? "var(--jade-soft)" : "var(--surface-2)",
        border: quiet ? "none" : `1px solid ${on ? "var(--jade)" : "var(--line)"}`,
      }}
    >
      <span
        aria-hidden
        className="grid place-items-center rounded-[6px]"
        style={{
          width: box,
          height: box,
          background: on ? "var(--jade)" : "var(--hf-surface)",
          border: `1.5px solid ${on ? "var(--jade)" : "color-mix(in srgb, var(--ink-3) 85%, transparent)"}`,
          color: "var(--ground)",
        }}
      >
        {mixed ? <Minus className="h-3.5 w-3.5" strokeWidth={3} /> : checked ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

/** Where the bar sits on a computer: over the list's own column. */
function useColumnBox(anchor: HTMLElement | null, active: boolean): { left: number; width: number } | null {
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor || !active) return;
    const measure = () => {
      const r = anchor.getBoundingClientRect();
      setBox((was) => (was && was.left === r.left && was.width === r.width ? was : { left: r.left, width: r.width }));
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(anchor);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [anchor, active]);
  return box;
}

export function ApplicantBulkBar({
  count,
  pageCount,
  allOnPage,
  onSelectPage,
  onClear,
  onBlock,
  busy = false,
  anchor,
  phone,
  aboveTabBar,
}: {
  /** How many are picked. The bar shows from 1, or on a phone in Select mode. */
  count: number;
  /** How many rows are drawn now ("Select all 25 on this page"). */
  pageCount: number;
  allOnPage: boolean;
  onSelectPage: () => void;
  /** Clear (and, on a phone, leave Select mode). */
  onClear: () => void;
  onBlock: () => void;
  busy?: boolean;
  /** The list's own column, for where the bar sits on a computer. */
  anchor: HTMLElement | null;
  phone: boolean;
  /** The owner's phone shell has a tab bar at the foot; the team member's has none. */
  aboveTabBar: boolean;
}) {
  const box = useColumnBox(anchor, !phone);
  if (typeof document === "undefined") return null;

  const style: CSSProperties = phone
    ? { left: 12, right: 12, bottom: `calc(env(safe-area-inset-bottom, 0px) + ${aboveTabBar ? 74 : 12}px)` }
    : box
      ? { left: box.left + Math.max(0, (box.width - 760) / 2), width: Math.min(760, box.width), bottom: 20 }
      : { left: "50%", transform: "translateX(-50%)", width: "min(760px, calc(100vw - 32px))", bottom: 20 };

  const blockLabel = count > 0 ? `Remove and block ${count}` : "Remove and block";

  return createPortal(
    <div
      role="region"
      aria-label="Selected applicants"
      className="fixed z-[45] rounded-[16px] border px-3 py-2.5 md:px-4"
      style={{
        ...style,
        background: "var(--hf-surface)",
        borderColor: "var(--hf-border-strong)",
        boxShadow: "var(--hf-shadow-raised)",
        animation: "ck-rise 0.2s cubic-bezier(0.4,0,0.2,1) both",
      }}
    >
      {phone ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--hf-text)" }}>
            <span className="min-w-0 flex-1 font-medium" aria-live="polite">
              {count === 0 ? "Tap applicants to pick them" : `${count} selected`}
            </span>
            {!allOnPage && pageCount > 0 && (
              <button type="button" className="ck-btn ck-btn-ghost min-h-[36px] !px-2.5 !text-[13px]" onClick={onSelectPage}>
                Select all {pageCount}
              </button>
            )}
            <button type="button" className="ck-btn ck-btn-ghost min-h-[36px] !px-2.5 !text-[13px]" onClick={onClear}>
              Done
            </button>
          </div>
          <button
            type="button"
            className="ck-btn ck-btn-outline min-h-[44px] w-full !text-[14px]"
            style={{ color: "var(--hf-danger)", borderColor: "color-mix(in srgb, var(--hf-danger) 50%, transparent)" }}
            disabled={count === 0 || busy}
            onClick={onBlock}
          >
            <Ban aria-hidden className="h-4 w-4" />
            {blockLabel}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[13.5px]" style={{ color: "var(--hf-text)" }}>
          <button type="button" data-size="icon" aria-label="Clear the selection" className="ck-btn ck-btn-ghost h-9 w-9 !p-0" onClick={onClear}>
            <X aria-hidden className="h-4 w-4" />
          </button>
          <span className="font-medium" aria-live="polite">
            {count} selected
          </span>
          {!allOnPage && pageCount > 0 && (
            <button type="button" className="ck-btn ck-btn-ghost h-9 !px-3 !text-[13px]" onClick={onSelectPage}>
              Select all {pageCount} on this page
            </button>
          )}
          <span className="flex-1" />
          <button type="button" className="ck-btn ck-btn-ghost h-9 !px-3 !text-[13px]" onClick={onClear}>
            Clear
          </button>
          <button
            type="button"
            className="ck-btn ck-btn-outline h-9 !px-4 !text-[13px]"
            style={{ color: "var(--hf-danger)", borderColor: "color-mix(in srgb, var(--hf-danger) 50%, transparent)" }}
            disabled={count === 0 || busy}
            onClick={onBlock}
          >
            <Ban aria-hidden className="h-4 w-4" />
            {blockLabel}
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

/* ── One row with its checkbox and ⋯ ────────────────────────────────────── */

/**
 * A list row (ApplicantTableRow or ApplicantCard, passed as children) with
 * its own controls beside the link, never inside it. On the table: the
 * checkbox over the avatar (on hover, and on every row once one is picked)
 * and the ⋯ where the chevron was. On a card: one corner at the foot, the ⋯,
 * or the checkbox while picking. The look of the row itself is untouched;
 * the frame only keeps its hover while the pointer is on a control, tints a
 * picked row, and moves the entrance fade onto itself so the controls rise
 * with it.
 */
export function ApplicantRowFrame({
  variant,
  children,
  menu = null,
  select = null,
  selecting = false,
  selected = false,
  reveal = false,
  index = 0,
}: {
  variant: "table" | "card";
  children: ReactNode;
  menu?: ReactNode;
  /** The checkbox; null where nothing can be picked (the Blocked tab). */
  select?: { checked: boolean; onToggle: (event: MouseEvent<HTMLButtonElement>) => void; label: string } | null;
  /** Something is being picked: every checkbox shows. */
  selecting?: boolean;
  selected?: boolean;
  reveal?: boolean;
  index?: number;
}) {
  const table = variant === "table";
  const className = [
    "group/frame relative",
    reveal ? "ck-reveal" : "",
    table
      ? [
          "[&:hover>a]:bg-[color-mix(in_srgb,var(--ink)_3.5%,transparent)] [&:hover>a]:before:opacity-100",
          menu ? "[&_[data-row-chevron]]:invisible" : "",
          selected ? "[&>a]:!bg-[color-mix(in_srgb,var(--jade)_9%,transparent)] [&>a]:before:!opacity-100" : "",
        ].join(" ")
      : [
          menu || select ? "[&_[data-card-foot]]:pr-10" : "",
          selected ? "[&>a]:!border-[var(--jade)] [&>a]:shadow-[0_0_0_1px_var(--jade)]" : "",
        ].join(" "),
  ].join(" ");

  return (
    <div className={className} data-applicant-frame data-selected={selected ? "" : undefined} style={reveal ? ({ ["--ck-i" as string]: Math.min(index, table ? 12 : 8) } as CSSProperties) : undefined}>
      {children}
      {table && select && (
        <span
          className={[
            "absolute left-5 top-1/2 z-[1] -translate-y-1/2 transition-opacity duration-150",
            selecting || select.checked ? "" : "pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100 group-hover/frame:pointer-events-auto group-hover/frame:opacity-100",
          ].join(" ")}
        >
          <SelectMark checked={select.checked} onToggle={select.onToggle} label={select.label} />
        </span>
      )}
      {table && menu && <span className="absolute right-2 top-1/2 z-[1] -translate-y-1/2">{menu}</span>}
      {!table && (selecting && select ? true : !!menu) && (
        <span className="absolute bottom-1.5 right-1.5 z-[1]">
          {/* While picking the whole card is the tap: the mark is the quiet
              box only, so it never crowds the dots above it. */}
          {selecting && select ? <SelectMark quiet checked={select.checked} onToggle={select.onToggle} label={select.label} size={36} /> : menu}
        </span>
      )}
    </div>
  );
}
