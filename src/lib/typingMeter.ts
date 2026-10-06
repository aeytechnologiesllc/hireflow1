/**
 * typingMeter.ts — times the applicant's typing while they write a reply in
 * the chat practice (docs/TYPING-IN-CHAT.md). The separate typing test is
 * gone; speed and corrections are measured here, on their real replies.
 *
 * One meter per reply box. The page feeds it every keydown on the box (the
 * key, the event's time, the box's text as the key goes down, which is
 * before the key acts, and the event's flags) EXCEPT the Enter that sends
 * the reply, and takes a summary when the reply is sent:
 *
 *   - charsTyped: characters added between keystrokes, at most ONE for each
 *     character key pressed (a letter, a digit, a space, Shift+Enter). Text
 *     that grew by more than the keys pressed arrived some other way
 *     (dictation, a text expander, a script) and is not typed;
 *   - activeMs: the sum of the gaps between keystrokes, each gap counted up
 *     to TYPING_GAP_CAP_MS. A longer pause (thinking, reading) counts as
 *     that much and no more, so a longer pause never makes anyone faster
 *     (2026-10-06: the first rule dropped every gap over 2 s and still
 *     counted the character typed after it, so pausing 2.001 s before each
 *     word read 4 times faster than pausing 2.000 s). The gap to the Enter
 *     that sends is not fed, so a re-read before sending is not typing time;
 *   - corrections: Backspace and Delete presses (with or without Alt, Ctrl
 *     or Cmd);
 *   - keys: every key pressed (Shift, Control, Alt, Meta and Caps Lock on
 *     their own are not keys);
 *   - pasteLike: more than PASTE_LIKE_JUMP characters of the reply arrived
 *     without a key for each (paste is blocked; this catches text that
 *     arrived another way).
 *
 * A key held down repeats: the repeats are not keys, not corrections, not
 * typing time and not characters (the hold is one key press). Undo and redo
 * (Ctrl/Cmd+Z, Ctrl/Cmd+Y) bring back text that was already in the box: it
 * is neither typed nor paste-like. A keydown a script dispatched
 * (`isTrusted: false`) is ignored.
 *
 * The page sends this summary with the reply; the server works out the
 * speed and the reply times itself (ai-chat-simulation typing.ts), checks
 * the summary against the reply it stored, and never takes a total from the
 * page.
 *
 * Nothing here touches React or the DOM, and a keydown costs a few
 * comparisons: no state update, no render, so typing feels the same.
 * Import-free, so plain Node runs it for scripts/typing_meter.test.mjs.
 */

/** A gap between two keystrokes counts as typing time up to this much; the rest of a longer pause is thinking. */
export const TYPING_GAP_CAP_MS = 1000;

/** More than this many characters of a reply arriving without a key each is not typing. */
export const PASTE_LIKE_JUMP = 15;

/** Keys that do nothing on their own: not counted, and no gap is timed to them. */
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "OS", "CapsLock", "Fn", "FnLock", "Hyper", "Super"]);

/** Keys that put a character in the box although their name is longer than one character. */
const CHARACTER_KEYS = new Set(["Enter", "Process", "Dead", "Unidentified"]);

/** The event's flags the meter reads (React: e.repeat, e.nativeEvent.isTrusted, e.metaKey / e.ctrlKey). */
export interface KeyFlags {
  /** `event.repeat`: the key is held down and this is the browser repeating it. */
  repeat?: boolean;
  /** `event.isTrusted`: false for a keydown a script dispatched. Absent is trusted. */
  trusted?: boolean;
  /** Ctrl or Cmd is held (not AltGr): a shortcut, not a character. */
  shortcut?: boolean;
}

/** What the page sends with one reply (`typing` on the "respond" request). */
export interface TypingSummary {
  charsTyped: number;
  activeMs: number;
  corrections: number;
  keys: number;
  pasteLike: boolean;
}

export interface TypingMeter {
  /** One keydown on the reply box: its key, its time in ms (event.timeStamp),
   *  the box's text as the key went down, and the event's flags. Not the
   *  Enter that sends the reply. */
  keydown(key: string, atMs: number, value: string, flags?: KeyFlags): void;
  /** The page set the box's text itself (cleared it, put a message back):
   *  that text was not typed, and the next keystroke is measured from it. */
  sync(value: string): void;
  /** The reply as sent: its summary. The meter starts over for the next one. */
  take(value: string): TypingSummary;
  /** A send that did not save went back into the box (its text is now
   *  `value`): its keystrokes count again with whatever is being typed now. */
  giveBack(summary: TypingSummary | null | undefined, value: string): void;
  /** The summary so far, without starting over. */
  peek(value?: string): TypingSummary;
  /** Forget everything: a new conversation, with `value` already in the box. */
  reset(value?: string): void;
}

export function createTypingMeter(
  options: { gapCapMs?: number; jumpChars?: number } = {},
): TypingMeter {
  const gapCapMs = options.gapCapMs ?? TYPING_GAP_CAP_MS;
  const jumpChars = options.jumpChars ?? PASTE_LIKE_JUMP;

  // The box is empty when a reply starts (the page clears it after a send).
  let lastLength = 0;
  let lastAt: number | null = null;
  let charsTyped = 0;
  let activeMs = 0;
  let corrections = 0;
  let keys = 0;
  let pasteLike = false;
  // Characters that arrived without a key for each, this reply.
  let unkeyed = 0;
  // What the keydown since the last look may have added: `owed` characters
  // typed (0 or 1), up to `held` from a held key repeating (not typed, not
  // suspicious), or anything at all from an undo or redo (`restoring`).
  let owed = 0;
  let held = 0;
  let restoring = false;

  const observe = (value: string) => {
    const length = typeof value === "string" ? value.length : lastLength;
    const grew = length - lastLength;
    if (grew > 0 && !restoring) {
      const typed = Math.min(grew, owed);
      charsTyped += typed;
      unkeyed += Math.max(0, grew - typed - held);
      if (unkeyed > jumpChars) pasteLike = true;
    }
    lastLength = length;
    owed = 0;
    held = 0;
    restoring = false;
  };

  const summary = (): TypingSummary => ({
    charsTyped,
    activeMs: Math.round(activeMs),
    corrections,
    keys,
    pasteLike,
  });

  const reset = (length: number) => {
    lastLength = length;
    lastAt = null;
    charsTyped = 0;
    activeMs = 0;
    corrections = 0;
    keys = 0;
    pasteLike = false;
    unkeyed = 0;
    owed = 0;
    held = 0;
    restoring = false;
  };

  return {
    keydown(key, atMs, value, flags = {}) {
      if (flags.trusted === false) return;
      observe(value);
      if (typeof key !== "string" || MODIFIER_KEYS.has(key)) return;
      if (flags.repeat === true) {
        // A held key: one press, already counted. Its repeats add nothing
        // but may each put one character in (not typed, not a paste), and
        // the hold is not typing time.
        held = 1;
        if (Number.isFinite(atMs)) lastAt = atMs;
        return;
      }
      if (Number.isFinite(atMs)) {
        if (lastAt !== null) {
          const gap = atMs - lastAt;
          if (gap >= 0) activeMs += Math.min(gap, gapCapMs);
        }
        lastAt = atMs;
      }
      keys += 1;
      if (key === "Backspace" || key === "Delete") corrections += 1;
      if (flags.shortcut === true) {
        // Undo / redo bring back text that was in the box: not typed, not a paste.
        const letter = key.toLowerCase();
        if (letter === "z" || letter === "y") restoring = true;
        return;
      }
      if (key.length === 1 || CHARACTER_KEYS.has(key)) owed = 1;
    },
    sync(value) {
      lastLength = typeof value === "string" ? value.length : 0;
      owed = 0;
      held = 0;
      restoring = false;
    },
    take(value) {
      observe(value);
      const taken = summary();
      reset(0);
      return taken;
    },
    giveBack(previous, value) {
      if (previous) {
        charsTyped += Math.max(0, previous.charsTyped || 0);
        activeMs += Math.max(0, previous.activeMs || 0);
        corrections += Math.max(0, previous.corrections || 0);
        keys += Math.max(0, previous.keys || 0);
        if (previous.pasteLike) pasteLike = true;
      }
      lastLength = typeof value === "string" ? value.length : lastLength;
      owed = 0;
      held = 0;
      restoring = false;
    },
    peek(value) {
      if (typeof value === "string") observe(value);
      return summary();
    },
    reset(value = "") {
      reset(typeof value === "string" ? value.length : 0);
    },
  };
}
