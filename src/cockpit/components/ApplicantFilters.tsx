import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUpDown, Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";

/**
 * The Applicants list's filters (docs/APPLICANTS-LIST.md §1), drawn two ways
 * from one description of them:
 *
 *  - a computer gets a row of dropdowns ("Where they are  Any step ⌄"); a
 *    filter in use is a filled chip with an × that clears it;
 *  - a phone gets one Filters button with the count in use, opening a bottom
 *    sheet of chip groups, "Clear all" and "Show N applicants".
 *
 * Both write straight to the URL through `onPick`, so the list behind the
 * sheet is already the answer when it closes. Every menu and the sheet are
 * portalled to <body>: the page's entrance animations leave a transform on
 * their ancestors, and a transformed ancestor traps position:fixed and z-index
 * (it trapped the old FilterSelect's menus under the rail).
 *
 * Buttons carry their size inline: at 640px and under, index.css restyles
 * every <button> that is not .ck-btn (12px text, 44px tall, wrapping), and an
 * inline style is the one thing that rule does not beat.
 */

export interface FilterChoice {
  value: string;
  label: string;
  /** Shown beside the label in the sheet ("70 and up 22"). */
  count?: number;
}

export type FilterKey = "where" | "score" | "flags" | "below" | "country" | "applied" | "job";

export interface FilterGroup {
  key: FilterKey;
  /** The dropdown's name on a computer ("Below a bar"). */
  label: string;
  /** The group's heading in the sheet ("Below the job's bar on"). */
  sheetLabel: string;
  value: string;
  /** The value that means "not filtering" ("any", "all", ""). */
  anyValue: string;
  options: FilterChoice[];
  /** Show each option's count in the sheet. */
  counts?: boolean;
}

/* ── One dropdown: a trigger and a portalled menu ───────────────────────── */

interface DropdownProps {
  options: FilterChoice[];
  value: string;
  onPick: (value: string) => void;
  /** The trigger's contents. */
  children: ReactNode;
  ariaLabel: string;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
  /** Line the menu up with the trigger's right edge (the Sort control). */
  alignEnd?: boolean;
}

const MENU_GAP = 6;
const EDGE = 8;

export function Dropdown({ options, value, onPick, children, ariaLabel, triggerClassName = "", triggerStyle, alignEnd = false }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number; maxHeight: number; minWidth: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? Math.max(220, r.width);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const wantLeft = alignEnd ? r.right - menuWidth : r.left;
    const left = Math.min(Math.max(EDGE, wantLeft), Math.max(EDGE, vw - menuWidth - EDGE));
    const below = vh - r.bottom - MENU_GAP - EDGE;
    const above = r.top - MENU_GAP - EDGE;
    // Open upward only when there is clearly more room above.
    const up = below < 200 && above > below;
    const maxHeight = Math.max(120, Math.min(360, up ? above : below));
    const menuHeight = Math.min(menuRef.current?.scrollHeight ?? maxHeight, maxHeight);
    setPlace({ top: up ? r.top - MENU_GAP - menuHeight : r.bottom + MENU_GAP, left, maxHeight, minWidth: Math.max(180, r.width) });
  }, [alignEnd]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    // The menu's own width is known only once it is drawn: place it again.
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onMove = () => measure();
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", onMove);
    // Capture: the page scrolls inside the shell's <main>, not the window.
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, measure]);

  // Opening puts focus on the chosen option, so the keyboard starts there.
  useEffect(() => {
    if (!open || !place) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]");
    const chosen = menuRef.current?.querySelector<HTMLButtonElement>("[aria-checked=true]");
    (chosen ?? items?.[0])?.focus({ preventScroll: true });
    // Only when it opens, not on every re-placement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, !!place]);

  const close = (refocus: boolean) => {
    setOpen(false);
    setPlace(null);
    if (refocus) triggerRef.current?.focus();
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      go(at + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      go(at - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    } else if (e.key === "End") {
      e.preventDefault();
      go(items.length - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
        style={triggerStyle}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={ariaLabel}
            onKeyDown={onMenuKey}
            className="fixed z-[80] overflow-y-auto rounded-[12px] border p-1"
            style={{
              top: place?.top ?? -9999,
              left: place?.left ?? -9999,
              maxHeight: place?.maxHeight ?? 360,
              minWidth: place?.minWidth ?? 180,
              maxWidth: "min(320px, calc(100vw - 16px))",
              background: "var(--hf-surface)",
              borderColor: "var(--hf-border-strong)",
              boxShadow: "var(--hf-shadow-raised)",
              visibility: place ? "visible" : "hidden",
              overscrollBehavior: "contain",
            }}
          >
            {options.map((o) => {
              const chosen = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={chosen}
                  onClick={() => {
                    onPick(o.value);
                    close(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-[8px] text-left outline-none transition-colors hover:bg-[var(--ground-2)] focus-visible:bg-[var(--ground-2)]"
                  style={{ fontSize: 13, padding: "8px 10px", minHeight: 36, whiteSpace: "nowrap", color: chosen ? "var(--ink)" : "var(--ink-2)", fontWeight: chosen ? 600 : 400 }}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.count != null && (
                    <span className="tnum text-[12px]" style={{ color: "var(--ink-3)" }}>
                      {o.count}
                    </span>
                  )}
                  <Check aria-hidden className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--jade)", opacity: chosen ? 1 : 0 }} />
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

/* ── The computer's row of dropdowns ───────────────────────────────────── */

// Longhands only, and every one of them on every render: React drops a
// longhand it set before when a shorthand beside it stays, so clearing a
// filter used to leave its trigger with no right padding at all.
const PICK_BASE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 13,
  paddingTop: 7,
  paddingBottom: 7,
  paddingLeft: 9,
  paddingRight: 9,
  minHeight: 34,
  borderRadius: 10,
  whiteSpace: "nowrap",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--line)",
  background: "var(--hf-surface)",
  color: "var(--ink-2)",
};
const PICK_SET: CSSProperties = {
  background: "var(--jade-soft)",
  borderColor: "color-mix(in srgb, var(--jade) 45%, transparent)",
  color: "var(--jade-soft-fg)",
  // Room for the × that clears it.
  paddingRight: 29,
};

/** One filter on a computer. In use: filled, with an × that clears it. */
function FilterPick({ group, onPick }: { group: FilterGroup; onPick: (key: FilterKey, value: string) => void }) {
  const set = group.value !== group.anyValue;
  const current = group.options.find((o) => o.value === group.value)?.label ?? group.value;
  return (
    <span className="relative inline-flex">
      <Dropdown
        options={group.options}
        value={group.value}
        onPick={(v) => onPick(group.key, v)}
        ariaLabel={`${group.label}: ${current}`}
        triggerClassName="transition-colors hover:border-[var(--hair)]"
        triggerStyle={{ ...PICK_BASE, ...(set ? PICK_SET : null) }}
      >
        <span>{group.label}</span>
        {/* Unset, the value ("Any", "All") says nothing the name does not:
            below 1440 it is left off, so the row fits on one line beside the
            sort on a laptop. A filter in use always shows what it is set to. */}
        <b className={set ? "font-medium" : "hidden font-medium min-[1440px]:inline"} style={{ color: set ? "var(--jade-soft-fg)" : "var(--ink)" }}>
          {current}
        </b>
        {!set && <ChevronDown aria-hidden className="h-3.5 w-3.5 opacity-70" />}
      </Dropdown>
      {set && (
        <button
          type="button"
          aria-label={`Clear ${group.label.toLowerCase()}`}
          onClick={() => onPick(group.key, group.anyValue)}
          className="absolute right-[5px] top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full transition-opacity hover:opacity-70"
          style={{ width: 22, height: 22, minHeight: 22, padding: 0, color: "var(--jade-soft-fg)" }}
        >
          <X aria-hidden className="h-3 w-3" strokeWidth={2.6} />
        </button>
      )}
    </span>
  );
}

/** "⇅ Sort  Score, high to low ⌄". `compact` is the phone's half-width button. */
export function SortControl({
  options,
  value,
  onPick,
  compact = false,
  shortLabel,
}: {
  options: FilterChoice[];
  value: string;
  onPick: (value: string) => void;
  compact?: boolean;
  /** The phone's one word for the chosen sort ("Score"). */
  shortLabel?: string;
}) {
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <Dropdown
      options={options}
      value={value}
      onPick={onPick}
      alignEnd
      ariaLabel={`Sort: ${current}`}
      triggerClassName={compact ? "w-full justify-center transition-colors hover:border-[var(--hair)]" : "transition-colors hover:border-[var(--hair)]"}
      triggerStyle={compact ? { ...PICK_BASE, width: "100%", justifyContent: "center", paddingTop: 9, paddingBottom: 9, paddingLeft: 10, paddingRight: 10, minHeight: 42, fontSize: 14 } : PICK_BASE}
    >
      <ArrowUpDown aria-hidden className="h-3.5 w-3.5 opacity-70" />
      {compact ? (
        <b className="font-medium" style={{ color: "var(--ink)" }}>
          {shortLabel ?? current}
        </b>
      ) : (
        <>
          {/* The word goes first when room is short (a 1280 laptop): the
              arrows already say it, and the row then fits on one line. */}
          <span className="hidden min-[1440px]:inline">Sort</span>
          <b className="font-medium" style={{ color: "var(--ink)" }}>
            {current}
          </b>
        </>
      )}
      <ChevronDown aria-hidden className="h-3.5 w-3.5 opacity-70" />
    </Dropdown>
  );
}

/** The row of dropdowns above the table (a computer, or a tablet). */
export function ApplicantFilterBar({
  groups,
  onPick,
  sort,
}: {
  groups: FilterGroup[];
  onPick: (key: FilterKey, value: string) => void;
  sort: ReactNode;
}) {
  return (
    // Sort keeps the top right; when the filters need a second line they wrap
    // beside it, under one another, not under the sort.
    <div className="flex items-start gap-1.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" role="group" aria-label="Filters">
        {groups.map((g) => (
          <FilterPick key={g.key} group={g} onPick={onPick} />
        ))}
      </div>
      <span className="shrink-0">{sort}</span>
    </div>
  );
}

/* ── The phone: a Filters button and its bottom sheet ──────────────────── */

export function FiltersButton({ count, onClick, open }: { count: number; onClick: () => void; open: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={open}
      className="transition-colors hover:border-[var(--hair)]"
      style={{ ...PICK_BASE, width: "100%", justifyContent: "center", paddingTop: 9, paddingBottom: 9, paddingLeft: 10, paddingRight: 10, minHeight: 42, fontSize: 14 }}
    >
      <SlidersHorizontal aria-hidden className="h-3.5 w-3.5 opacity-70" />
      <b className="font-medium" style={{ color: "var(--ink)" }}>
        Filters
      </b>
      {count > 0 && (
        <span
          className="tnum inline-flex items-center justify-center rounded-full text-[11px] font-semibold"
          style={{ minWidth: 18, height: 18, padding: "0 6px", background: "var(--jade)", color: "var(--btn-fg)" }}
          aria-label={`${count} in use`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// The whole border every time (on and off): a borderColor laid over a
// `border` shorthand is left behind, emptied, when the chip turns off.
const CHIP_BASE: CSSProperties = {
  fontSize: 13,
  padding: "7px 11px",
  minHeight: 34,
  borderRadius: 999,
  whiteSpace: "nowrap",
  border: "1px solid var(--line)",
  background: "var(--ground-2)",
  color: "var(--ink-2)",
  fontWeight: 400,
};
const CHIP_ON: CSSProperties = {
  background: "var(--jade-soft)",
  border: "1px solid color-mix(in srgb, var(--jade) 50%, transparent)",
  color: "var(--jade-soft-fg)",
  fontWeight: 500,
};

export function ApplicantFilterSheet({
  open,
  onClose,
  groups,
  onPick,
  onClearAll,
  matchCount,
}: {
  open: boolean;
  onClose: () => void;
  groups: FilterGroup[];
  onPick: (key: FilterKey, value: string) => void;
  onClearAll: () => void;
  /** How many the filters as they stand would show. */
  matchCount: number;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  // Every pick re-renders the page (it writes the URL), so the latest close
  // is read from a ref: the effect below must run once per opening, or focus
  // would jump back to the first chip after each tap.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Focus moves into the sheet, stays there, and goes back where it was.
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>("button");
    first?.focus({ preventScroll: true });
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
        if (focusable.length === 0) return;
        const firstEl = focusable[0];
        const lastEl = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  // The job is the page's scope (?roleId=), not a filter Clear all takes away.
  const inUse = groups.some((g) => g.key !== "job" && g.value !== g.anyValue);

  return createPortal(
    // Above the shell's phone tab bar (z-40), with the record sheet's layer.
    <div className="fixed inset-0 z-[70] flex flex-col justify-end">
      <div
        aria-hidden
        className="absolute inset-0"
        onClick={onClose}
        style={{
          // A blur, not a wash: --ink turns near-white in Night (the record
          // sheet's scrim, commit d12bd67). --slab stays dark in both themes.
          background: "color-mix(in srgb, var(--slab) 22%, transparent)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative mx-auto flex w-full max-w-[560px] flex-col rounded-t-[22px] border-t"
        style={{
          maxHeight: "88dvh",
          background: "var(--hf-surface)",
          borderColor: "var(--line)",
          boxShadow: "0 -20px 50px -20px rgba(0, 0, 0, 0.7)",
          animation: "ck-rise 0.22s cubic-bezier(0.4,0,0.2,1) both",
        }}
      >
        <div className="shrink-0 px-4 pt-2.5">
          <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded" style={{ background: "var(--line)" }} />
          <div className="flex items-center">
            <h2 id={titleId} className="font-display text-[21px] font-medium" style={{ color: "var(--ink)" }}>
              Filters
            </h2>
            <span className="ml-auto text-[13px] font-medium" style={{ color: "var(--jade-soft-fg)" }} aria-live="polite">
              {matchCount} match
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2" style={{ overscrollBehavior: "contain" }}>
          {groups.map((g) => (
            <section key={g.key} className="mt-4" aria-label={g.sheetLabel}>
              <div className="mb-2 text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--ink-3)" }}>
                {g.sheetLabel}
              </div>
              <div className="flex flex-wrap gap-[7px]">
                {g.options.map((o) => {
                  const on = o.value === g.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onPick(g.key, o.value)}
                      style={{ ...CHIP_BASE, ...(on ? CHIP_ON : null) }}
                    >
                      {o.label}
                      {g.counts && o.count != null && o.value !== g.anyValue && (
                        <span className="tnum ml-1 text-[12px]" style={{ color: on ? "var(--jade-soft-fg)" : "var(--ink-3)" }}>
                          {o.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div
          className="flex shrink-0 gap-2.5 border-t px-4 pt-3"
          style={{ borderColor: "var(--line-soft)", paddingBottom: "max(16px, env(safe-area-inset-bottom, 0px))" }}
        >
          <button
            type="button"
            onClick={onClearAll}
            disabled={!inUse}
            className="disabled:opacity-50"
            style={{ fontSize: 14, padding: "13px 16px", minHeight: 48, borderRadius: 12, background: "var(--surface-2)", color: "var(--ink-2)", whiteSpace: "nowrap" }}
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 transition-[filter] hover:brightness-105"
            style={{ fontSize: 15, fontWeight: 600, padding: "13px 16px", minHeight: 48, borderRadius: 12, background: "var(--jade)", color: "var(--btn-fg)", whiteSpace: "nowrap" }}
          >
            Show {matchCount} {matchCount === 1 ? "applicant" : "applicants"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
