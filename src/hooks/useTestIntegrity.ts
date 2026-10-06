import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useComputerHandover } from "@/components/candidate/continueOnComputerContext";
import {
  classifyRecordingError,
  keepaliveRpc,
  newClientId,
  watchAccessToken,
  withoutNul,
} from "@/hooks/useAssessmentSession";

/**
 * useTestIntegrity — the one anti-cheat hook for every test page and the
 * application form (docs/ASSESSMENT-RECORD.md §3.1 and §5.2).
 *
 * Six pages used to carry six copy-pasted versions of this, and they disagreed:
 * a paste in the typing test counted twice (the textarea and its container
 * both handled it), a tab switch in the chat tests counted twice (window blur
 * AND visibilitychange), nothing recorded how long anyone was away, the
 * PrintScreen check listened for a keydown Windows never sends, and every
 * record lived in browser memory until the final send — so a reload, "Try
 * again" or a closed tab lost it, and nothing reached the hiring team.
 *
 * Now, while `active`:
 *
 *   - copy, cut, paste, drag-and-drop and the context menu are blocked by
 *     document-level capture listeners, and each attempt is recorded ONCE
 *     (a Ctrl+V keydown and the paste event it produces are one attempt);
 *   - every time the applicant leaves — another tab, window or app — is ONE
 *     away episode with how long they were gone, sent when they come back
 *     (`tab_hidden` if the page was hidden at any point, else
 *     `window_blur`). Blips under 1 s are kept but marked short — the
 *     same 1,000 ms the database, the server and the staff record use, so
 *     the applicant is warned about every switch the hiring team is told of;
 *   - PrintScreen (on keyup, which is what Windows sends), Cmd/Win+Shift
 *     screenshot chords, and Meta+Shift followed by focus leaving while the
 *     page stays visible (a snipping overlay) are recorded;
 *   - text that arrives without typing — more than 20 characters in one input
 *     event, as a phone keyboard's clipboard chip does — is recorded;
 *   - closing or reloading the page (`pagehide`) is recorded, and so is
 *     leaving the test page inside the app.
 *
 * Every event goes to `record_integrity_events` within about a second, in small
 * batches, through a localStorage outbox that survives a reload and is flushed
 * with a keepalive request on `pagehide`. The server stamps its own time,
 * keeps the timeline for staff and, for every step but the form, updates the
 * owner's one live card in the bell.
 *
 * Browsers cannot stop a screenshot or a photo of the screen; this records what
 * a page can see, and the rules card says exactly that.
 *
 * For servers still on the previous build the hook also keeps the old
 * `violations` array, which the pages send with their final submit.
 *
 * The logic is createIntegrityMonitor, a plain function with every browser
 * dependency passed in; scripts/test_integrity.test.mjs drives it in Node.
 */

/* ------------------------------------------------------------------ types */

export type IntegrityKind =
  | "copy"
  | "cut"
  | "paste"
  | "bulk_insert"
  | "right_click"
  | "tab_hidden"
  | "window_blur"
  | "screenshot_key"
  | "screenshot_suspected"
  | "devtools"
  | "page_closed"
  | "other";

export interface IntegrityEvent {
  /** uuid — the server stores a retried event once. */
  id: string;
  kind: IntegrityKind;
  /** When it happened on this device; for an away episode, when they left. */
  client_at: string;
  duration_ms?: number;
  detail?: Record<string, unknown>;
}

/** The shape every submit body has always carried (`violations`), kept for
 *  servers that do not read the live record yet. */
export interface LegacyViolation {
  type:
    | "tab_switch"
    | "copy_attempt"
    | "cut_attempt"
    | "paste_attempt"
    | "right_click"
    | "keyboard_shortcut"
    | "screenshot_attempt"
    | "devtools";
  timestamp: string;
  details: string;
}

export type IntegrityMode = "test" | "form";

/** Away episodes shorter than this are recorded but treated as low severity
 *  (an OS notification, a password manager, a focus flicker). ONE threshold
 *  everywhere (docs/ASSESSMENT-RECORD.md §2.7): the database
 *  (`record_integrity_events` c_short_ms), the server, the staff record
 *  (src/cockpit/lib/assessmentRecord.ts) and this page all use 1,000 ms, so a
 *  switch the owner's card counts is one the applicant is told about. */
export const SHORT_AWAY_MS = 1_000;
/** Text added by one input event beyond this did not come from typing. */
export const BULK_INSERT_CHARS = 20;
/** A Meta+Shift chord this recent before focus leaves looks like a snip. */
export const SCREENSHOT_CHORD_MS = 1_500;
const SEND_DEBOUNCE_MS = 1_000;
const BATCH_SIZE = 50;
const KEEPALIVE_BATCH = 100;
/** The browser allows about 64 KB of keepalive bodies in flight per page, and
 *  the form draft and the heartbeat close the page alongside this batch. */
export const KEEPALIVE_EVENT_BYTES = 16_000;
const OUTBOX_CAP = 300;
const LEGACY_CAP = 200;
const DEDUPE_MS = 1_000;

/** "1m 12s", "45s", "1h 5m". */
export function formatAway(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${total % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** The old shape for one event, or null when old servers never counted it
 *  (a short blip, a closed page). */
export function toLegacyViolation(event: IntegrityEvent): LegacyViolation | null {
  const at = event.client_at;
  switch (event.kind) {
    case "tab_hidden":
    case "window_blur": {
      const ms = event.duration_ms ?? 0;
      if (ms < SHORT_AWAY_MS) return null;
      return {
        type: "tab_switch",
        timestamp: at,
        details: `Left the test for ${formatAway(ms)} (${event.kind === "tab_hidden" ? "another tab or app" : "another window"})`,
      };
    }
    case "copy":
      return { type: "copy_attempt", timestamp: at, details: "Copy attempted" };
    case "cut":
      return { type: "cut_attempt", timestamp: at, details: "Cut attempted" };
    case "paste":
      return { type: "paste_attempt", timestamp: at, details: "Paste attempted" };
    case "bulk_insert":
      return {
        type: "paste_attempt",
        timestamp: at,
        details:
          event.detail?.via === "drop"
            ? "Text dropped in"
            : `Text arrived without typing (${String(event.detail?.chars ?? "many")} characters)`,
      };
    case "right_click":
      return { type: "right_click", timestamp: at, details: "Right-click attempted" };
    case "screenshot_key":
    case "screenshot_suspected":
      return {
        type: "screenshot_attempt",
        timestamp: at,
        details: event.kind === "screenshot_key" ? "Screenshot key pressed" : "Possible screenshot",
      };
    case "devtools":
      return { type: "devtools", timestamp: at, details: "Developer tools shortcut" };
    case "other":
      return event.detail?.what === "shortcut"
        ? { type: "keyboard_shortcut", timestamp: at, details: `Blocked ${String(event.detail?.key ?? "a")} shortcut` }
        : null;
    default:
      return null;
  }
}

/** Counts what the applicant sees on the in-test strip and the owner sees on
 *  the card: away episodes of 1 s or more, and every alerting attempt. */
export function isFlagged(event: IntegrityEvent): boolean {
  return toLegacyViolation(event) !== null && event.kind !== "right_click" && event.kind !== "other";
}

/* ------------------------------------------------------ minimal DOM shapes */

interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  value?: unknown;
  type?: string;
  closest?: (selector: string) => unknown;
}

interface EventLike {
  type: string;
  target?: unknown;
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  inputType?: string;
  data?: string | null;
  persisted?: boolean;
  preventDefault?: () => void;
}

/** Fields marked `data-allow-paste` (the form's email and phone) are exempt. */
export const ALLOW_PASTE_ATTRIBUTE = "data-allow-paste";

const asTarget = (value: unknown): TargetLike | null =>
  value && typeof value === "object" ? (value as TargetLike) : null;

function isAllowed(target: TargetLike | null): boolean {
  if (!target?.closest) return false;
  try {
    return !!target.closest(`[${ALLOW_PASTE_ATTRIBUTE}]`);
  } catch {
    return false;
  }
}

const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "tel", "url", "number", "password", ""]);

function isEditable(target: TargetLike | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName || "").toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") return TEXT_INPUT_TYPES.has((target.type || "").toLowerCase());
  return false;
}

const isTextarea = (target: TargetLike | null) => (target?.tagName || "").toUpperCase() === "TEXTAREA";

/** The oldest events that fit one keepalive request (count and size). */
export function keepaliveBatch(events: IntegrityEvent[], maxBytes = KEEPALIVE_EVENT_BYTES): IntegrityEvent[] {
  const batch: IntegrityEvent[] = [];
  let bytes = 2;
  for (const event of events.slice(0, KEEPALIVE_BATCH)) {
    const size = JSON.stringify(event).length + 1;
    if (bytes + size > maxBytes) break;
    batch.push(event);
    bytes += size;
  }
  return batch;
}

/* --------------------------------------------------------------- monitor */

export interface IntegrityStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface IntegritySnapshot {
  violations: LegacyViolation[];
  /** The applicant is away right now (the page is hidden or unfocused). */
  away: boolean;
  /** Away episodes of 1 s or more, this page life and earlier ones. */
  awayCount: number;
  /** Everything counted on the strip and the owner's card. */
  flagged: number;
}

export interface IntegrityMonitorDeps {
  applicationId: string;
  stepId: string;
  mode: IntegrityMode;
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  isHidden: () => boolean;
  /** One batch to `record_integrity_events`. */
  send: (events: IntegrityEvent[]) => Promise<{ error: unknown }>;
  /** The same, as a keepalive request that outlives the page. */
  keepalive: (events: IntegrityEvent[]) => void;
  storage?: IntegrityStorage | null;
  newId?: () => string;
  onEvent?: (event: IntegrityEvent) => void;
  onChange?: (snapshot: IntegritySnapshot) => void;
}

export interface IntegrityMonitor {
  handle: Record<
    | "copy"
    | "cut"
    | "paste"
    | "contextmenu"
    | "keydown"
    | "keyup"
    | "beforeinput"
    | "input"
    | "focusin"
    | "drop"
    | "dragstart"
    | "visibilitychange"
    | "blur"
    | "focus"
    | "pagehide"
    | "online",
    (event: EventLike) => void
  >;
  setActive(active: boolean): void;
  /** The test was sent: stop, forget the old-shape list, send what is left. */
  finish(): void;
  /** Records leaving the test page inside the app (the hook calls it on unmount). */
  leftPage(): void;
  flush(): Promise<void>;
  snapshot(): IntegritySnapshot;
  readonly active: boolean;
  /** Events not yet acknowledged by the server. */
  readonly pending: number;
  dispose(): void;
}

export function createIntegrityMonitor(deps: IntegrityMonitorDeps): IntegrityMonitor {
  const key = `${deps.applicationId}:${deps.stepId}`;
  const outboxKey = `hf.integrity.outbox:${key}`;
  const legacyKey = `hf.integrity.legacy:${key}`;
  const newId = deps.newId ?? newClientId;
  const iso = (ms: number) => new Date(ms).toISOString();

  const readJson = <T,>(storageKey: string): T[] => {
    try {
      const raw = deps.storage?.get(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  };
  const writeJson = (storageKey: string, value: unknown[]) => {
    try {
      if (value.length === 0) deps.storage?.remove(storageKey);
      else deps.storage?.set(storageKey, JSON.stringify(value));
    } catch {
      /* private mode or full storage — the live send still works */
    }
  };

  let active = false;
  let disposed = false;
  let stopped = false;
  let pending: IntegrityEvent[] = readJson<IntegrityEvent>(outboxKey).filter(
    (event) => event && typeof event.id === "string" && typeof event.kind === "string",
  );
  let legacy: LegacyViolation[] = readJson<LegacyViolation>(legacyKey);
  let awayCount = legacy.filter((v) => v.type === "tab_switch").length;
  let flagged = legacy.filter((v) => v.type !== "right_click" && v.type !== "keyboard_shortcut").length;

  let sending = false;
  let sendTimer: unknown = null;
  let backoffMs = 0;

  let awayStart: number | null = null;
  let awayHidden = false;
  let chordAt = -Infinity;
  let lastScreenshotAt = -Infinity;
  let snipCheck: unknown = null;
  const lastClipboardAt: Record<string, number> = {};
  const lastDropAt = { at: -Infinity };
  const lengths = new WeakMap<object, number>();

  const snapshot = (): IntegritySnapshot => ({
    violations: legacy,
    away: awayStart !== null,
    awayCount,
    flagged,
  });
  const changed = () => deps.onChange?.(snapshot());

  /* -- sending -- */

  const schedule = (ms: number) => {
    if (sendTimer !== null || stopped) return;
    sendTimer = deps.setTimeout(() => {
      sendTimer = null;
      void flush();
    }, ms);
  };

  async function flush(): Promise<void> {
    if (sending || stopped || pending.length === 0) return;
    if (sendTimer !== null) {
      deps.clearTimeout(sendTimer);
      sendTimer = null;
    }
    sending = true;
    const batch = pending.slice(0, BATCH_SIZE);
    let error: unknown = null;
    try {
      // No U+0000 in any string or key (§4.1): Postgres refuses one in jsonb
      // before the function runs (22P05), and that batch could never land.
      ({ error } = await deps.send(withoutNul(batch)));
    } catch (thrown) {
      error = thrown ?? { message: "request failed" };
    }
    sending = false;

    const sentIds = new Set(batch.map((event) => event.id));
    if (!error) {
      pending = pending.filter((event) => !sentIds.has(event.id));
      backoffMs = 0;
    } else {
      const action = classifyRecordingError(error);
      if (action === "stop") {
        // Not this applicant's step any more, or the record does not exist
        // here: nothing later will be accepted. The test carries on.
        stopped = true;
        pending = [];
      } else if (action === "drop") {
        pending = pending.filter((event) => !sentIds.has(event.id));
      } else {
        backoffMs = Math.min(60_000, backoffMs ? backoffMs * 2 : 2_500);
      }
    }
    writeJson(outboxKey, pending);
    if (pending.length > 0 && !stopped && !disposed) schedule(error ? backoffMs || SEND_DEBOUNCE_MS : SEND_DEBOUNCE_MS);
  }

  const sendKeepalive = () => {
    if (stopped || pending.length === 0) return;
    // Left in the outbox: the next page life sends them again, and the
    // server stores each id once.
    const batch = keepaliveBatch(withoutNul(pending));
    if (batch.length > 0) deps.keepalive(batch);
  };

  /* -- recording -- */

  const record = (
    kind: IntegrityKind,
    detail?: Record<string, unknown>,
    extra?: { client_at?: string; duration_ms?: number },
  ): IntegrityEvent => {
    const event: IntegrityEvent = {
      id: newId(),
      kind,
      client_at: extra?.client_at ?? iso(deps.now()),
      ...(extra?.duration_ms !== undefined ? { duration_ms: Math.max(0, Math.round(extra.duration_ms)) } : {}),
      ...(detail && Object.keys(detail).length > 0 ? { detail } : {}),
    };
    // Once the server has said it will take nothing more (the database
    // without this build's functions, a step that is no longer theirs), the
    // live send stops — but the old-shape list every submit still carries,
    // the strip's count and the applicant's feedback keep going. Stopping
    // those too froze `violations` at the first event while the migration
    // was not applied yet, and the hiring team's notes under-reported.
    if (!stopped) {
      pending.push(event);
      if (pending.length > OUTBOX_CAP) pending = pending.slice(pending.length - OUTBOX_CAP);
      writeJson(outboxKey, pending);
    }

    // The form counts only real tab or app switches, as it always has: a file
    // picker or password manager takes focus from the window without the
    // applicant leaving (still on the record, as window_blur).
    const old = deps.mode === "form" && event.kind === "window_blur" ? null : toLegacyViolation(event);
    if (old) {
      legacy = [...legacy, old].slice(-LEGACY_CAP);
      writeJson(legacyKey, legacy);
      if (old.type === "tab_switch") awayCount += 1;
      if (isFlagged(event)) flagged += 1;
    }
    deps.onEvent?.(event);
    changed();
    if (!stopped) schedule(SEND_DEBOUNCE_MS);
    return event;
  };

  /* -- away episodes -- */

  const startAway = (hidden: boolean) => {
    if (awayStart === null) {
      awayStart = deps.now();
      awayHidden = hidden;
      changed();
    } else if (hidden) {
      awayHidden = true;
    }
  };

  const endAway = (backVia: string, extraDetail?: Record<string, unknown>) => {
    if (awayStart === null) return;
    const started = awayStart;
    const duration = deps.now() - started;
    awayStart = null;
    record(
      awayHidden ? "tab_hidden" : "window_blur",
      {
        back_via: backVia,
        ...(duration < SHORT_AWAY_MS ? { short: true, severity: "low" } : {}),
        ...extraDetail,
      },
      { client_at: iso(started), duration_ms: duration },
    );
  };

  /* -- scope: where blocking applies -- */

  // Test pages block everywhere while the test runs. The application form
  // keeps its old behaviour: only its answer fields are guarded, and the
  // email and phone fields (marked data-allow-paste) take a paste.
  const guards = (target: TargetLike | null, opts: { fieldsOnly?: boolean } = {}) => {
    if (isAllowed(target)) return false;
    if (deps.mode === "form" || opts.fieldsOnly) return isEditable(target);
    return true;
  };

  const recent = (at: number | undefined) => at !== undefined && deps.now() - at < DEDUPE_MS;

  const recordClipboard = (kind: "copy" | "cut" | "paste", via: string) => {
    if (recent(lastClipboardAt[kind])) return;
    lastClipboardAt[kind] = deps.now();
    record(kind, { via });
  };

  const recordScreenshot = (kind: "screenshot_key" | "screenshot_suspected", detail: Record<string, unknown>) => {
    if (deps.now() - lastScreenshotAt < 2_000) return;
    lastScreenshotAt = deps.now();
    record(kind, detail);
  };

  const CLIPBOARD_KEYS: Record<string, "copy" | "cut" | "paste"> = { c: "copy", x: "cut", v: "paste" };

  const handle: IntegrityMonitor["handle"] = {
    copy: (e) => onClipboard(e, "copy"),
    cut: (e) => onClipboard(e, "cut"),
    paste: (e) => onClipboard(e, "paste"),

    contextmenu: (e) => {
      if (!active) return;
      const target = asTarget(e.target);
      if (isAllowed(target)) return;
      e.preventDefault?.();
      record("right_click");
    },

    keydown: (e) => {
      if (!active) return;
      const key = (e.key || "").toLowerCase();
      const code = e.code || "";
      const mod = !!(e.ctrlKey || e.metaKey);
      const target = asTarget(e.target);

      if (e.metaKey && e.shiftKey) chordAt = deps.now();

      if (deps.mode === "test") {
        if (key === "printscreen") {
          recordScreenshot("screenshot_key", { key: "PrintScreen", via: "keydown" });
          return;
        }
        // Cmd+Shift+3/4/5 (macOS) and Win+Shift+S (Windows) — usually taken
        // by the system before the page sees them, recorded when they do.
        if (e.metaKey && e.shiftKey && ["Digit3", "Digit4", "Digit5", "KeyS"].includes(code)) {
          recordScreenshot("screenshot_key", { key: code === "KeyS" ? "Win+Shift+S" : `Cmd+Shift+${code.slice(-1)}` });
          return;
        }
        const devtools =
          key === "f12" ||
          (e.ctrlKey && e.shiftKey && ["KeyI", "KeyJ", "KeyC"].includes(code)) ||
          (e.metaKey && e.altKey && ["KeyI", "KeyJ", "KeyC"].includes(code));
        if (devtools) {
          e.preventDefault?.();
          record("devtools", { via: "shortcut", key: key === "f12" ? "F12" : code });
          return;
        }
      }

      if (mod && !e.altKey && !e.shiftKey && CLIPBOARD_KEYS[key]) {
        if (!guards(target)) return;
        // Blocked here AND at the clipboard event (some browsers still fire
        // it); one attempt either way.
        e.preventDefault?.();
        recordClipboard(CLIPBOARD_KEYS[key], "shortcut");
        return;
      }

      if (deps.mode === "test" && mod && !e.altKey && (key === "p" || key === "s")) {
        // Print and Save copy the test out. Select-all (Ctrl/Cmd+A) and
        // Enter-to-send stay untouched.
        e.preventDefault?.();
        record("other", { what: "shortcut", key: `${e.metaKey ? "Cmd" : "Ctrl"}+${key.toUpperCase()}` });
      }
    },

    keyup: (e) => {
      if (!active || deps.mode !== "test") return;
      // Windows delivers PrintScreen on keyup only.
      if ((e.key || "").toLowerCase() === "printscreen") {
        recordScreenshot("screenshot_key", { key: "PrintScreen", via: "keyup" });
      }
    },

    beforeinput: (e) => {
      if (!active) return;
      const target = asTarget(e.target);
      const inputType = e.inputType || "";
      const isPaste = inputType === "insertFromPaste" || inputType === "insertFromPasteAsQuotation" || inputType === "insertFromYank";
      const isDrop = inputType === "insertFromDrop";
      if (!isPaste && !isDrop) return;
      if (!guards(target)) return;
      e.preventDefault?.();
      if (isPaste) recordClipboard("paste", "beforeinput");
      else if (deps.now() - lastDropAt.at >= DEDUPE_MS) {
        lastDropAt.at = deps.now();
        record("bulk_insert", { via: "drop" });
      }
    },

    focusin: (e) => {
      const target = asTarget(e.target);
      if (target && typeof target.value === "string") lengths.set(target, target.value.length);
    },

    input: (e) => {
      if (!active) return;
      const target = asTarget(e.target);
      if (!target || typeof target.value !== "string" || isAllowed(target)) return;
      const length = target.value.length;
      const previous = lengths.get(target);
      lengths.set(target, length);
      // The form records this only for long answers (textareas): browser
      // autofill fills names and addresses in one go, legitimately.
      if (deps.mode === "form" && !isTextarea(target)) return;
      if (!isEditable(target)) return;
      const inputType = e.inputType || "";
      if (inputType.startsWith("delete") || inputType === "insertFromPaste" || inputType === "insertFromDrop") return;
      const added = typeof e.data === "string" && e.data.length > 0 ? e.data.length : previous === undefined ? 0 : length - previous;
      if (added > BULK_INSERT_CHARS) {
        record("bulk_insert", { via: "input", chars: added, ...(inputType ? { input_type: inputType } : {}) });
      }
    },

    drop: (e) => {
      if (!active) return;
      const target = asTarget(e.target);
      if (!guards(target, { fieldsOnly: deps.mode === "form" })) return;
      e.preventDefault?.();
      if (deps.now() - lastDropAt.at < DEDUPE_MS) return;
      lastDropAt.at = deps.now();
      record("bulk_insert", { via: "drop" });
    },

    dragstart: (e) => {
      if (!active || deps.mode !== "test") return;
      // Dragging the passage or a question out is a copy by other means.
      e.preventDefault?.();
    },

    visibilitychange: () => {
      if (!active) return;
      if (deps.isHidden()) startAway(true);
      else endAway("visible");
    },

    blur: () => {
      if (!active) return;
      startAway(deps.isHidden());
      if (deps.mode === "test" && deps.now() - chordAt <= SCREENSHOT_CHORD_MS) {
        // A snipping overlay takes focus but leaves the page visible; a tab
        // switch (also reachable with Meta+Shift) hides it. Look again once
        // the visibility change would have arrived.
        if (snipCheck !== null) deps.clearTimeout(snipCheck);
        snipCheck = deps.setTimeout(() => {
          snipCheck = null;
          if (active && !deps.isHidden() && awayStart !== null) {
            recordScreenshot("screenshot_suspected", { via: "chord_then_blur" });
          }
        }, 400);
      }
    },

    focus: () => {
      if (!active || deps.isHidden()) return;
      endAway("focus");
    },

    pagehide: (e) => {
      if (!active) {
        sendKeepalive();
        return;
      }
      endAway("page_closed", { closed_while_away: true });
      record("page_closed", { via: "pagehide", ...(e.persisted ? { persisted: true } : {}) });
      sendKeepalive();
    },

    online: () => {
      backoffMs = 0;
      void flush();
    },
  };

  function onClipboard(e: EventLike, kind: "copy" | "cut" | "paste") {
    if (!active) return;
    const target = asTarget(e.target);
    if (!guards(target)) return;
    e.preventDefault?.();
    recordClipboard(kind, "event");
  }

  // Events left over from a page that closed before it could send them.
  if (pending.length > 0) schedule(SEND_DEBOUNCE_MS);

  return {
    handle,
    setActive(next: boolean) {
      if (disposed || active === next) return;
      if (next) {
        active = true;
        if (deps.isHidden()) startAway(true);
      } else {
        // The test ended while they were away: close the episode at the end.
        endAway("test_ended", { ended_while_away: true });
        active = false;
        void flush();
      }
      changed();
    },
    finish() {
      if (active) {
        endAway("test_ended", { ended_while_away: true });
        active = false;
      }
      legacy = [];
      awayCount = 0;
      flagged = 0;
      writeJson(legacyKey, legacy);
      changed();
      void flush();
    },
    leftPage() {
      if (!active) return;
      endAway("left_test_page");
      record("page_closed", { via: "left_test_page" });
      active = false;
      void flush();
    },
    flush,
    snapshot,
    get active() {
      return active;
    },
    get pending() {
      return pending.length;
    },
    dispose() {
      disposed = true;
      if (sendTimer !== null) deps.clearTimeout(sendTimer);
      if (snipCheck !== null) deps.clearTimeout(snipCheck);
      sendTimer = null;
      snipCheck = null;
    },
  };
}

/* ------------------------------------------------------------- feedback */

const TEST_TOASTS: Partial<Record<IntegrityKind, string>> = {
  copy: "Copy is turned off during this test.",
  cut: "Copy is turned off during this test.",
  paste: "Paste is turned off — type it yourself.",
  right_click: "Right-click is turned off during this test.",
  other: "That shortcut is turned off during this test.",
  devtools: "Developer tools aren't allowed during the test. That's been recorded.",
  screenshot_key: "Screenshots aren't allowed. That's been recorded and the hiring team is told.",
  screenshot_suspected: "Screenshots aren't allowed. That's been recorded and the hiring team is told.",
};

const FORM_TOASTS: Partial<Record<IntegrityKind, string>> = {
  copy: "Copy is turned off here — just type your own words.",
  cut: "Copy is turned off here — just type your own words.",
  paste: "Paste is turned off here — type your answer directly.",
  right_click: "Right-click is turned off here.",
};

/** The one wording for what the applicant is told, per kind. */
export function integrityToastFor(
  event: IntegrityEvent,
  mode: IntegrityMode,
): { id: string; title: string; description?: string } | null {
  const id = `integrity-${event.kind === "cut" ? "copy" : event.kind}`;
  if (event.kind === "tab_hidden" || event.kind === "window_blur") {
    const ms = event.duration_ms ?? 0;
    if (ms < SHORT_AWAY_MS) return null;
    if (mode === "form") {
      // A file picker or password manager takes focus without leaving the
      // page; only a real tab or app switch gets a word on the form.
      if (event.kind !== "tab_hidden") return null;
      return { id: "integrity-away", title: "Looks like you switched tabs", description: "That's been noted — stay on this page if you can." };
    }
    return {
      id: "integrity-away",
      title: `You left the test for ${formatAway(ms)}`,
      description: "That's recorded, and the hiring team is told.",
    };
  }
  if (event.kind === "bulk_insert") {
    if (mode === "form") return null;
    return event.detail?.via === "drop"
      ? { id, title: "Dropping text in is turned off — type it yourself." }
      : { id, title: "Text that wasn't typed is recorded.", description: "Type your answer yourself." };
  }
  const title = (mode === "form" ? FORM_TOASTS : TEST_TOASTS)[event.kind];
  return title ? { id, title } : null;
}

/* --------------------------------------------------------------- the hook */

export interface UseTestIntegrityOptions {
  applicationId: string | undefined;
  stepId: string | undefined;
  /** Block and record while true: the test is running (or the form is open). */
  active: boolean;
  /** "form": the application form (its fields only; email and phone take a
   *  paste; the server records but never alerts). Default "test". */
  mode?: IntegrityMode;
  /** Tell the applicant, in one wording, when something is blocked. */
  toasts?: boolean;
  onEvent?: (event: IntegrityEvent) => void;
}

export interface TestIntegrity extends IntegritySnapshot {
  /** Send everything still waiting (before a submit, for instance). */
  flush: () => Promise<void>;
  /** The step was sent: stop recording and clear the old-shape list. */
  finish: () => void;
}

const browserStorage: IntegrityStorage = {
  get: (k) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* storage refused */
    }
  },
  remove: (k) => {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* storage refused */
    }
  },
};

// Which application × step has a monitor mounted, so a monitor torn down by
// React's development double-mount (and set up again a moment later) does not
// record "left the test page".
const mountedMonitors = new Map<string, number>();

export function useTestIntegrity({
  applicationId,
  stepId,
  active,
  mode = "test",
  toasts = true,
  onEvent,
}: UseTestIntegrityOptions): TestIntegrity {
  const [snap, setSnap] = useState<IntegritySnapshot>({ violations: [], away: false, awayCount: 0, flagged: 0 });
  const monitorRef = useRef<IntegrityMonitor | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  // Set by the step gate when the server's computer_required refusal swaps
  // this page out (docs/COMPUTER-ONLY-TESTS.md): not the person leaving.
  const handover = useComputerHandover();
  const handoverRef = useRef(handover);
  handoverRef.current = handover;

  useEffect(() => {
    if (!applicationId || !stepId) return;
    watchAccessToken();
    const monitorKey = `${applicationId}:${stepId}`;
    const monitor = createIntegrityMonitor({
      applicationId,
      stepId,
      mode,
      now: () => Date.now(),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
      isHidden: () => document.visibilityState === "hidden",
      send: async (events) => {
        const { error } = await supabase.rpc("record_integrity_events", {
          p_application_id: applicationId,
          p_step_id: stepId,
          p_events: events as unknown as never,
        });
        return { error };
      },
      keepalive: (events) => {
        keepaliveRpc("record_integrity_events", {
          p_application_id: applicationId,
          p_step_id: stepId,
          p_events: events,
        });
      },
      storage: browserStorage,
      onEvent: (event) => {
        if (toasts) {
          const message = integrityToastFor(event, mode);
          if (message) toast.warning(message.title, { id: message.id, description: message.description });
        }
        onEventRef.current?.(event);
      },
      onChange: setSnap,
    });
    monitorRef.current = monitor;
    mountedMonitors.set(monitorKey, (mountedMonitors.get(monitorKey) ?? 0) + 1);
    setSnap(monitor.snapshot());

    const h = monitor.handle;
    const docEvents = ["copy", "cut", "paste", "contextmenu", "keydown", "keyup", "beforeinput", "input", "focusin", "drop", "dragstart"] as const;
    const docListeners = docEvents.map((type) => {
      const listener = (event: Event) => h[type](event as unknown as EventLike);
      document.addEventListener(type, listener, true);
      return [type, listener] as const;
    });
    const onVisibility = (event: Event) => h.visibilitychange(event as unknown as EventLike);
    const onBlur = (event: Event) => h.blur(event as unknown as EventLike);
    const onFocus = (event: Event) => h.focus(event as unknown as EventLike);
    const onPageHide = (event: Event) => h.pagehide(event as unknown as EventLike);
    const onOnline = (event: Event) => h.online(event as unknown as EventLike);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("online", onOnline);

    return () => {
      for (const [type, listener] of docListeners) document.removeEventListener(type, listener, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("online", onOnline);
      mountedMonitors.set(monitorKey, Math.max(0, (mountedMonitors.get(monitorKey) ?? 1) - 1));
      if (monitorRef.current === monitor) monitorRef.current = null;
      // Leaving the page mid-test inside the app (the back arrow) is
      // recorded like closing it — unless a monitor for the same test is
      // back a moment later (React's development double-mount), or the
      // step gate took the page away for "Continue on your computer" (the
      // server refused this device): that ends the test quietly, as a
      // finished one does, with no "left the test page".
      window.setTimeout(() => {
        if (handoverRef.current?.current) monitor.setActive(false);
        else if ((mountedMonitors.get(monitorKey) ?? 0) === 0) monitor.leftPage();
        void monitor.flush().finally(() => monitor.dispose());
      }, 0);
    };
  }, [applicationId, stepId, mode, toasts]);

  useEffect(() => {
    monitorRef.current?.setActive(active);
  }, [active, applicationId, stepId, mode, toasts]);

  const flush = useCallback(async () => {
    await monitorRef.current?.flush();
  }, []);
  const finish = useCallback(() => {
    monitorRef.current?.finish();
  }, []);

  return { ...snap, flush, finish };
}
