/**
 * Typing, measured inside the chat practice (docs/TYPING-IN-CHAT.md). The
 * separate typing test is gone; how fast and how accurately an applicant
 * types is read from the replies they write here.
 *
 * Three sources, each for what it can be trusted with:
 *
 *   - the PAGE times every keystroke of a reply (src/lib/typingMeter.ts) and
 *     sends one summary with it; it is stored on that reply's
 *     `candidate_turn` event as `detail.typing` (cleanReplyTyping, applied
 *     when it is stored AND again when it is read). Speed and corrections
 *     come from these per-reply summaries only, each checked against the
 *     reply the server stored (replyTypingRows): a total the page works out
 *     is never asked for and never read;
 *   - the SERVER's clock gives the reply time: from the player's message
 *     being stored (`assistant_turn.created_at`) to the applicant's reply
 *     being stored (`candidate_turn.created_at`);
 *   - the GRADER lists spelling mistakes left in the applicant's lines,
 *     quoted, and the server keeps only those it finds in those lines.
 *
 * `buildTypingResult` writes `notes.chatSimulationResult.typing` in exactly
 * the shape the doc fixes. Import-free apart from reviewText.ts (itself
 * import-free) and a type, so plain Node runs it for the tests.
 */
import { containsExact, flattenForReview, readLineNumber } from "../_shared/reviewText.ts";

/** Fewer timed replies than this is "not enough typing to time" (shown, never a fail). */
export const TYPING_MIN_TIMED_REPLIES = 3;

/** A reply shorter than this (trimmed) is too short to time for speed. */
export const TYPING_MIN_REPLY_CHARS = 20;

/** Faster than anyone types: the reply did not arrive key by key, it is counted as paste-like. */
export const TYPING_MAX_PLAUSIBLE_WPM = 300;

/**
 * More characters than this in the STORED reply that the page never saw
 * typed (content longer than charsTyped by more) is a reply that did not
 * arrive key by key: paste-like. The same allowance as the page's
 * PASTE_LIKE_JUMP (src/lib/typingMeter.ts).
 */
export const TYPING_UNTYPED_ALLOWANCE = 15;

/** The bars when the chat step's config does not set them: active-typing speed, not copy-typing. */
export const DEFAULT_TYPING_BAR: Readonly<TypingBar> = Object.freeze({ minWpm: 40, maxMedianReplySeconds: 90 });

export interface TypingBar {
  minWpm: number;
  maxMedianReplySeconds: number;
}

/** One reply's keystroke summary as stored on its candidate_turn (`detail.typing`). */
export interface ReplyTyping {
  charsTyped: number;
  activeMs: number;
  corrections: number;
  keys: number;
  pasteLike: boolean;
}

/**
 * Why there is no speed: fewer than 3 replies long enough to time
 * ("too_short"), most of the replies long enough arrived without being typed
 * key by key ("arrived_without_typing"), or the page sent no keystroke
 * timing at all, an older page ("not_sent"). null when the speed was timed.
 */
export type TypingNotTimed = "too_short" | "arrived_without_typing" | "not_sent";

/** `notes.chatSimulationResult.typing`, exactly as docs/TYPING-IN-CHAT.md fixes it. */
export interface ChatTypingResult {
  /** Over the replies that count taken together (their characters ÷ 5 ÷ their typing minutes), words a minute; null with fewer than 3. */
  wpm: number | null;
  /** Backspace + Delete ÷ keys over the same replies, as a percent; null with fewer than 3. */
  correctionsPct: number | null;
  /** Server-measured; null with fewer than 3 replies the server could time. */
  medianReplySeconds: number | null;
  /** Spelling mistakes left in the applicant's lines per 100 of their words; null when the grader gave no list. */
  typosPer100Words: number | null;
  repliesTimed: number;
  pasteLike: number;
  bar: TypingBar;
  /** false: below the bar on something measured; true: speed measured and nothing below; null: not enough to judge. */
  meetsBar: boolean | null;
  below: Array<"speed" | "reply_time">;
  /** Why wpm is null (TypingNotTimed), or null when it was timed. */
  notTimed: TypingNotTimed | null;
  measuredBy: { speed: "page"; replyTime: "server"; typos: "grader" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** A whole number from 0 to `max`, or null. */
function count(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.min(max, Math.round(value));
}

/**
 * The page's summary of one reply, made safe to store and to read: four
 * whole numbers in range and a flag, nothing else. Anything that is not
 * that shape is null (the reply then has no typing measure; it is never a
 * 0). Corrections can never exceed the keys pressed.
 */
export function cleanReplyTyping(value: unknown): ReplyTyping | null {
  if (!isRecord(value)) return null;
  const charsTyped = count(value.charsTyped, 100_000);
  const activeMs = count(value.activeMs, 3_600_000);
  const keys = count(value.keys, 100_000);
  const corrections = count(value.corrections, 100_000);
  if (charsTyped === null || activeMs === null || keys === null || corrections === null) return null;
  return {
    charsTyped,
    activeMs,
    corrections: Math.min(corrections, keys),
    keys,
    pasteLike: value.pasteLike === true,
  };
}

/** A bar from the config, when it is a sensible number; else null. */
function barNumber(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** The chat step's `config.typing: { min_wpm, max_median_reply_seconds }`, defaulting to 40 and 90. */
export function typingBarFrom(stepConfig: unknown): TypingBar {
  const typing = isRecord(stepConfig) && isRecord(stepConfig.typing) ? stepConfig.typing : {};
  return {
    minWpm: barNumber(typing.min_wpm, 1, 250) ?? DEFAULT_TYPING_BAR.minWpm,
    maxMedianReplySeconds: barNumber(typing.max_median_reply_seconds, 1, 3600) ?? DEFAULT_TYPING_BAR.maxMedianReplySeconds,
  };
}

/** The stored turn as this module reads it (assessmentSession.ts StoredTurn has these fields). */
export interface TypingTurn {
  kind: string;
  content: string;
  created_at: string | null;
  detail: Record<string, unknown>;
}

/** One applicant reply, as staff can read it in the grading record. */
export interface ReplyTypingRow {
  /** 1-based, counting the applicant's replies only. */
  reply: number;
  chars: number;
  /** Server time from the player's message to this reply, or null when it cannot be timed. */
  replySeconds: number | null;
  typing: ReplyTyping | null;
  /** Words a minute from this reply's own summary, when it counts toward speed. */
  wpm: number | null;
  correctionsPct: number | null;
  /** Counts toward the speed and corrections medians. */
  timed: boolean;
  pasteLike: boolean;
}

function timeOf(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function fromSubmittedTranscript(turn: TypingTurn): boolean {
  // Stored at submit by a previous-build page: its times are the submit's, not the chat's.
  return turn.detail.source === "submitted_transcript";
}

/**
 * Every applicant reply with its server reply time and its typing measure.
 * The reply time is taken only when the turn right before it is the
 * player's message (a second message sent before the player answered has no
 * message of the player's to answer).
 *
 * A reply's summary is checked against the reply the server stored before
 * it can count, and is paste-like (never timed) when it does not fit:
 *   - the page marked it paste-like;
 *   - more characters typed than keys pressed (the meter credits at most one
 *     character a key, so no summary of its own can say that);
 *   - the stored reply is longer than what was typed by more than
 *     TYPING_UNTYPED_ALLOWANCE characters (text that was never typed);
 *   - faster than TYPING_MAX_PLAUSIBLE_WPM.
 */
export function replyTypingRows(turns: readonly TypingTurn[]): ReplyTypingRow[] {
  const rows: ReplyTypingRow[] = [];
  let n = 0;
  turns.forEach((turn, i) => {
    if (turn.kind !== "candidate_turn") return;
    n += 1;
    const text = typeof turn.content === "string" ? turn.content.trim() : "";
    const previous = i > 0 ? turns[i - 1] : null;
    let replySeconds: number | null = null;
    if (previous && previous.kind === "assistant_turn" && !fromSubmittedTranscript(previous) && !fromSubmittedTranscript(turn)) {
      const from = timeOf(previous.created_at);
      const to = timeOf(turn.created_at);
      if (from !== null && to !== null && to >= from) replySeconds = (to - from) / 1000;
    }
    const typing = cleanReplyTyping(turn.detail.typing);
    let wpm: number | null = null;
    let correctionsPct: number | null = null;
    let pasteLike = !!typing && (
      typing.pasteLike ||
      typing.charsTyped > typing.keys ||
      text.length > typing.charsTyped + TYPING_UNTYPED_ALLOWANCE
    );
    if (typing && !pasteLike && text.length >= TYPING_MIN_REPLY_CHARS && typing.activeMs > 0 && typing.charsTyped > 0) {
      const speed = typing.charsTyped / 5 / (typing.activeMs / 60_000);
      if (speed > TYPING_MAX_PLAUSIBLE_WPM) pasteLike = true;
      else {
        wpm = speed;
        correctionsPct = typing.keys > 0 ? (typing.corrections / typing.keys) * 100 : 0;
      }
    }
    rows.push({ reply: n, chars: text.length, replySeconds, typing, wpm, correctionsPct, timed: wpm !== null, pasteLike });
  });
  return rows;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** The applicant's words (lines marked "user"), as the grader read them. */
export function applicantWordCount(messages: ReadonlyArray<{ role: string; content: unknown }>): number {
  let total = 0;
  for (const m of messages) {
    if (m.role !== "user" || typeof m.content !== "string") continue;
    total += flattenForReview(m.content).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  }
  return total;
}

/** One spelling mistake the server found in the applicant's own line. */
export interface SpellingMistake {
  line: number;
  word: string;
}

/**
 * The grader's `spellingMistakes` (`[{line, word}]`), kept only where the
 * word really is in that numbered line and that line is the applicant's
 * (`lines` is grading.ts reviewLines, the numbering the grader read). A word
 * on a player line, or one not in the line it names, is dropped. Each
 * (line, word) is counted once. Null when the grader gave no list at all
 * (the measure is then missing, never 0).
 */
export function verifiedSpellingMistakes(
  raw: unknown,
  lines: ReadonlyArray<{ n: number; role: string; text: string }>,
): SpellingMistake[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.spellingMistakes)) return null;
  const found: SpellingMistake[] = [];
  const seen = new Set<string>();
  for (const entry of raw.spellingMistakes.slice(0, 200)) {
    if (!isRecord(entry)) continue;
    const word = typeof entry.word === "string" ? entry.word.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    const lineNo = readLineNumber(entry.line);
    if (!word || lineNo === null) continue;
    const line = lines.find((l) => l.n === lineNo && l.role === "user");
    if (!line || !containsExact(line.text, word)) continue;
    const key = `${lineNo}:${word.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ line: lineNo, word });
  }
  return found;
}

/** Mistakes per 100 of the applicant's words, one decimal; null when unknown or nothing written. */
export function typosPer100Words(mistakes: number | null, applicantWords: number): number | null {
  if (mistakes === null || applicantWords <= 0) return null;
  return Math.round((Math.min(mistakes, applicantWords) / applicantWords) * 1000) / 10;
}

/**
 * `notes.chatSimulationResult.typing`, from the STORED turns (their
 * `detail.typing` and their server times), the step's bar, and the typos the
 * server verified.
 *
 * Speed and corrections are taken over the timed replies TOGETHER (all their
 * characters ÷ 5 ÷ all their typing minutes; all corrections ÷ all keys), so
 * a long reply weighs more than a short one and one short reply's pause
 * cannot move the figure much. Both need at least TYPING_MIN_TIMED_REPLIES
 * timed replies, and the median reply time needs as many replies the server
 * could time; fewer is "not enough to time", never a fail (notTimed says
 * why).
 */
export function buildTypingResult(input: {
  turns: readonly TypingTurn[];
  bar?: TypingBar | null;
  typosPer100Words?: number | null;
}): ChatTypingResult {
  const bar = input.bar ?? { ...DEFAULT_TYPING_BAR };
  const rows = replyTypingRows(input.turns);
  const timed = rows.filter((r) => r.timed);
  const enoughTyping = timed.length >= TYPING_MIN_TIMED_REPLIES;
  const replyTimes = rows.map((r) => r.replySeconds).filter((s): s is number => s !== null);

  const pooledChars = sum(timed.map((r) => (r.typing as ReplyTyping).charsTyped));
  const pooledMinutes = sum(timed.map((r) => (r.typing as ReplyTyping).activeMs)) / 60_000;
  const pooledKeys = sum(timed.map((r) => (r.typing as ReplyTyping).keys));
  const pooledCorrections = sum(timed.map((r) => (r.typing as ReplyTyping).corrections));
  const wpm = enoughTyping && pooledMinutes > 0 ? Math.round(pooledChars / 5 / pooledMinutes) : null;
  const correctionsPct = wpm === null ? null : pooledKeys > 0 ? Math.round((pooledCorrections / pooledKeys) * 100) : 0;
  const medianReplySeconds = replyTimes.length >= TYPING_MIN_TIMED_REPLIES ? Math.round(median(replyTimes)) : null;
  const pasteLike = rows.filter((r) => r.pasteLike).length;

  let notTimed: TypingNotTimed | null = null;
  if (wpm === null) {
    if (rows.length > 0 && rows.every((r) => r.typing === null)) notTimed = "not_sent";
    else if (pasteLike > 0 && pasteLike >= timed.length) notTimed = "arrived_without_typing";
    else notTimed = "too_short";
  }

  const below: Array<"speed" | "reply_time"> = [];
  if (wpm !== null && wpm < bar.minWpm) below.push("speed");
  if (medianReplySeconds !== null && medianReplySeconds > bar.maxMedianReplySeconds) below.push("reply_time");

  return {
    wpm,
    correctionsPct,
    medianReplySeconds,
    typosPer100Words: typeof input.typosPer100Words === "number" && Number.isFinite(input.typosPer100Words) ? input.typosPer100Words : null,
    repliesTimed: timed.length,
    pasteLike,
    bar: { minWpm: bar.minWpm, maxMedianReplySeconds: bar.maxMedianReplySeconds },
    meetsBar: below.length > 0 ? false : wpm === null ? null : true,
    below,
    notTimed,
    measuredBy: { speed: "page", replyTime: "server", typos: "grader" },
  };
}
