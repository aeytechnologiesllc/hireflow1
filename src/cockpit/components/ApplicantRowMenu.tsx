import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Ban, BookmarkMinus, BookmarkPlus, CheckSquare, ExternalLink, MoreHorizontal, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ActionDialog } from "./ActionDialog";
import { DeclineNotePreview, passDialogWords } from "./ApplicantDecisionDialogs";
import { useCockpitActions } from "../hooks/useCockpitData";
import { useApplicantBlockActions, type BlockTarget } from "../hooks/useApplicantBlocks";
import { useBulkPass } from "../hooks/useBulkPass";
import { bulkPassDoneWords, bulkPassProgressWords, bulkPassWords, type BulkPassPlan } from "../lib/bulkPass";
import { blockConfirmWords, firstNameOf, unblockConfirmWords } from "../lib/blockedApplicants";
import { canShortlist, shortlistActionLabel } from "../lib/shortlist";

/**
 * The ⋯ menu on each applicant (the list's row and phone card, and the full
 * profile), and the confirms it and the list's bar open: Pass (the polite
 * email, as on the profile), Pass on several at once (the same Pass, once per
 * person, confirmed once: lib/bulkPass.ts), Remove and block (silent, and it
 * sticks), Unblock. "Add to shortlist" is in the menu too and opens nothing:
 * one click, no confirm.
 *
 * The owner, 2026-10-06: "give me a nicer, easier way to drop down to delete
 * some of these applicants. And that will just block them too."
 *
 * The menu and every dialog are portalled to <body>: the cockpit's entrance
 * animations leave a transform on an ancestor, and a transformed ancestor
 * turns `position: fixed` into "fixed to that ancestor" (a menu or a dialog
 * trapped inside the row, or under the next one).
 *
 * Blocking never goes through useUpdateApplication (whose status write emails
 * the candidate): only the block_applicants RPC (hooks/useApplicantBlocks.ts).
 */

/* ── The ⋯ menu ─────────────────────────────────────────────────────────── */

export interface ApplicantMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** A row's height is about 44px; used only to decide up or down. */
const ITEM_H = 44;

export function ActionsMenu({
  items,
  label,
  size = 32,
  className = "",
}: {
  /** The items, or a function that makes them: the list passes a function,
   *  so a row builds its menu only while it is open (300 rows, one menu). */
  items: readonly ApplicantMenuItem[] | (() => readonly ApplicantMenuItem[]);
  /** The button's accessible name ("More actions for Maria Santos"). */
  label: string;
  /** The button's square size in px (at least 32; 36 on a phone card). */
  size?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const list = open ? (typeof items === "function" ? items() : items) : null;
  const count = list?.length ?? 0;

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setPos(null);
    if (refocus) buttonRef.current?.focus();
  }, []);

  /** Where the button was when the menu was placed. */
  const anchorAt = useRef<{ top: number; left: number } | null>(null);
  const place = useCallback(() => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    anchorAt.current = { top: r.top, left: r.left };
    const height = count * ITEM_H + 14;
    const right = Math.max(8, window.innerWidth - r.right);
    const below = window.innerHeight - r.bottom;
    // Opens downward unless there is no room under it and more above.
    if (below < height + 12 && r.top > below) setPos({ bottom: window.innerHeight - r.top + 6, right });
    else setPos({ top: r.bottom + 6, right });
  }, [count]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  // The menu belongs to ONE applicant: when their row moves under it with no
  // scroll at all (a row above deleted or blocked by a teammate, a card above
  // growing, the list taken afresh), it closes rather than sit beside someone
  // else, where "Remove and block" would read as theirs. Checked once a
  // frame, only while it is open.
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const watch = () => {
      const button = buttonRef.current;
      const was = anchorAt.current;
      if (!button || !button.isConnected) {
        close(false);
        return;
      }
      if (was) {
        const r = button.getBoundingClientRect();
        if (Math.abs(r.top - was.top) > 0.5 || Math.abs(r.left - was.left) > 0.5) {
          close(false);
          return;
        }
      }
      frame = window.requestAnimationFrame(watch);
    };
    frame = window.requestAnimationFrame(watch);
    return () => window.cancelAnimationFrame(frame);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
        return;
      }
      if (e.key === "Tab") {
        close(false);
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? [])];
      if (buttons.length === 0) return;
      e.preventDefault();
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      let next = 0;
      if (e.key === "End") next = buttons.length - 1;
      else if (e.key === "ArrowDown") next = (at + 1) % buttons.length;
      else if (e.key === "ArrowUp") next = (at - 1 + buttons.length) % buttons.length;
      buttons[next].focus();
    };
    // A scrolled list or a resized window moves the button: close rather
    // than float somewhere it no longer belongs.
    const onMove = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      close(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, close]);

  useEffect(() => {
    if (open && pos) menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
  }, [open, pos]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-size="icon"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title="More"
        className={[
          "grid shrink-0 place-items-center rounded-full transition-colors",
          "hover:bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--jade)]",
          open ? "bg-[color-mix(in_srgb,var(--ink)_8%,transparent)]" : "",
          className,
        ].join(" ")}
        style={{ width: size, height: size, color: "var(--ink-2)" }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) close(false);
          else setOpen(true);
        }}
      >
        <MoreHorizontal aria-hidden className="h-[18px] w-[18px]" />
      </button>
      {open &&
        pos &&
        list &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            className="fixed z-[70] flex min-w-[208px] max-w-[calc(100vw-16px)] flex-col gap-0.5 rounded-[12px] border p-1.5"
            style={{
              top: pos.top,
              bottom: pos.bottom,
              right: pos.right,
              background: "var(--hf-surface)",
              borderColor: "var(--hf-border-strong)",
              boxShadow: "var(--hf-shadow-raised)",
            }}
          >
            {list.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className="ck-btn ck-btn-ghost min-h-[40px] w-full !justify-start !gap-2.5 !px-3 !text-[13.5px]"
                style={{ color: item.danger ? "var(--hf-danger)" : "var(--hf-text)" }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  close(false);
                  item.onSelect();
                }}
              >
                {item.icon ?? <span aria-hidden className="h-4 w-4 shrink-0" />}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

/* ── What the menu can ask for ──────────────────────────────────────────── */

export type ApplicantActionRequest =
  | { kind: "pass"; target: BlockTarget; offered: boolean; /** The job they applied for: the note names it. */ jobTitle?: string | null }
  | { kind: "passMany"; plan: BulkPassPlan }
  | { kind: "block"; targets: BlockTarget[] }
  | { kind: "unblock"; target: BlockTarget };

/** The items for one applicant, in the order they read. */
export function applicantMenuItems({
  target,
  status,
  blocked,
  jobTitle,
  shortlist,
  onOpenProfile,
  onSelect,
  onRequest,
}: {
  target: BlockTarget;
  status: string;
  blocked: boolean;
  /** The job they applied for, for the note a Pass sends. */
  jobTitle?: string | null;
  /** The team's shortlist (lib/shortlist.ts): whether they are on it, and
   *  the one click that changes that. No confirm: it decides nothing and the
   *  applicant is not told. Absent where the page has its own button. */
  shortlist?: { on: boolean; onToggle: () => void };
  /** Absent on the profile itself. */
  onOpenProfile?: () => void;
  /** "Select" (the list's checkboxes); absent where there is none. */
  onSelect?: () => void;
  onRequest: (request: ApplicantActionRequest) => void;
}): ApplicantMenuItem[] {
  const items: ApplicantMenuItem[] = [];
  // A blocked person's application the block closed (the Blocked tab): only
  // Unblock is left to do. One it left open (an interview on another job)
  // can still be passed on or closed, and they can be unblocked from it.
  const closed = status === "rejected";
  if (onOpenProfile) items.push({ key: "open", label: "Open profile", icon: <ExternalLink aria-hidden className="h-4 w-4 shrink-0" />, onSelect: onOpenProfile });
  if (onSelect && !(blocked && closed)) items.push({ key: "select", label: "Select", icon: <CheckSquare aria-hidden className="h-4 w-4 shrink-0" />, onSelect });
  const unblock: ApplicantMenuItem = { key: "unblock", label: "Unblock", icon: <RotateCcw aria-hidden className="h-4 w-4 shrink-0" />, onSelect: () => onRequest({ kind: "unblock", target }) };
  if (blocked && closed) {
    items.push(unblock);
    return items;
  }
  // The shortlist is the people still in the running: not offered on someone
  // declined or blocked.
  if (shortlist && canShortlist(status, blocked)) {
    const Icon = shortlist.on ? BookmarkMinus : BookmarkPlus;
    items.push({ key: "shortlist", label: shortlistActionLabel(shortlist.on), icon: <Icon aria-hidden className="h-4 w-4 shrink-0" />, onSelect: shortlist.onToggle });
  }
  // Pass, the polite way out, exactly as the profile offers it: not once they
  // are declined or hired; an offer is taken back rather than passed on.
  if (status !== "rejected" && status !== "hired") {
    const offered = status === "offered";
    items.push({
      key: "pass",
      label: offered ? "Take back offer" : "Pass",
      icon: <XCircle aria-hidden className="h-4 w-4 shrink-0" />,
      onSelect: () => onRequest({ kind: "pass", target, offered, jobTitle }),
    });
  }
  items.push({ key: "block", label: "Remove and block", icon: <Ban aria-hidden className="h-4 w-4 shrink-0" />, danger: true, onSelect: () => onRequest({ kind: "block", targets: [target] }) });
  if (blocked) items.push(unblock);
  return items;
}

/* ── The confirms ───────────────────────────────────────────────────────── */

/**
 * One confirm at a time, for whatever the menu or the bulk bar asked. Pass
 * goes through the profile's own path (useCockpitActions().reject: the
 * polite email, as today); Remove and block and Unblock through their RPCs.
 * `onStart` hears the confirm before anything is sent (the list settles those
 * rows then, so a realtime update that lands before the round trip shows at
 * once instead of waiting in the update bar); `onDone` hears how it went,
 * after the dialog has closed.
 */
export function ApplicantActionDialogs({
  request,
  onClose,
  onStart,
  onDone,
}: {
  request: ApplicantActionRequest | null;
  onClose: () => void;
  onStart?: (request: ApplicantActionRequest) => void;
  onDone?: (request: ApplicantActionRequest, ok: boolean) => void;
}) {
  const { block, unblock, busy: blockBusy } = useApplicantBlockActions();
  const { reject, isUpdating } = useCockpitActions();
  const { passMany, progress: passProgress } = useBulkPass();
  const [working, setWorking] = useState(false);
  const busy = working || blockBusy || isUpdating;

  const finish = useCallback(
    async (run: () => Promise<boolean>) => {
      if (!request) return;
      onStart?.(request);
      setWorking(true);
      let ok = false;
      try {
        ok = await run();
      } finally {
        setWorking(false);
      }
      onClose();
      onDone?.(request, ok);
    },
    [request, onClose, onStart, onDone],
  );

  if (!request) return null;

  let dialog: ReactNode = null;
  if (request.kind === "block") {
    const names = request.targets.map((t) => t.name);
    const words = blockConfirmWords(names);
    dialog = (
      <ActionDialog
        open
        title={words.title}
        description={words.body}
        confirmLabel={words.confirm}
        tone="danger"
        busy={busy}
        withReason
        reasonLabel="Why? Optional, and only your team sees it."
        reasonPlaceholder="e.g. Spam: the same answers pasted in again."
        onConfirm={(reason) => void finish(() => block(request.targets, reason))}
        onClose={onClose}
      />
    );
  } else if (request.kind === "passMany") {
    // The single Pass, once per person, confirmed once (lib/bulkPass.ts).
    const words = bulkPassWords(request.plan);
    dialog = (
      <ActionDialog
        open
        title={words.title}
        description={words.body}
        confirmLabel={words.confirm}
        tone="danger"
        busy={busy}
        busyLabel={passProgress ? bulkPassProgressWords(passProgress.done, passProgress.total) : undefined}
        note={<DeclineNotePreview jobTitle={request.plan.jobTitle} />}
        onConfirm={() =>
          void finish(async () => {
            const result = await passMany(request.plan.targets);
            const said = bulkPassDoneWords(result);
            (said.ok ? toast.success : toast.error)(said.title, said.description ? { description: said.description } : undefined);
            return said.ok;
          })
        }
        onClose={onClose}
      />
    );
  } else if (request.kind === "unblock") {
    const words = unblockConfirmWords(request.target.name);
    dialog = (
      <ActionDialog
        open
        title={words.title}
        description={words.body}
        confirmLabel={words.confirm}
        busy={busy}
        onConfirm={() => void finish(() => unblock(request.target))}
        onClose={onClose}
      />
    );
  } else {
    // The profile's Pass dialog, word for word (ApplicantDecisionDialogs).
    const who = firstNameOf(request.target.name);
    dialog = (
      <ActionDialog
        open
        title={request.offered ? `Take back ${who}'s offer?` : `Pass on ${who}?`}
        description={passDialogWords(who, request.offered)}
        confirmLabel={request.offered ? "Take back offer" : "Pass"}
        tone="danger"
        busy={busy}
        note={<DeclineNotePreview jobTitle={request.jobTitle} />}
        onConfirm={() =>
          void finish(async () => {
            await reject(request.target.applicationId);
            return true;
          })
        }
        onClose={onClose}
      />
    );
  }
  return createPortal(dialog, document.body);
}

/* ── On the profile: a blocked person says so ───────────────────────────── */

/** "Blocked · they can't apply to your jobs again" with Unblock beside it. */
export function BlockedNote({ blockedAt, onUnblock, className = "" }: { blockedAt?: string | null; onUnblock: () => void; className?: string }) {
  const when = blockedAt ? new Date(blockedAt) : null;
  const day = when && !Number.isNaN(when.getTime()) ? when.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border px-3.5 py-2.5 text-[13px] leading-[1.45] ${className}`}
      style={{ borderColor: "color-mix(in srgb, var(--hf-danger) 30%, transparent)", background: "color-mix(in srgb, var(--hf-danger) 7%, transparent)", color: "var(--hf-text)" }}
    >
      <Ban aria-hidden className="h-4 w-4 shrink-0" style={{ color: "var(--hf-danger)" }} />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">Blocked{day ? ` on ${day}` : ""}.</span>{" "}
        <span style={{ color: "var(--hf-text-soft)" }}>They can't apply to your jobs again with this account or email, and they weren't told.</span>
      </span>
      <button type="button" className="ck-btn ck-btn-outline min-h-[36px] !py-1.5 !text-[12.5px]" onClick={onUnblock}>
        Unblock
      </button>
    </div>
  );
}
