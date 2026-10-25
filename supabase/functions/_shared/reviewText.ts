/**
 * What a reviewer model is given to read, and how its answer is read back:
 * shared by the chat practice's reviewer (ai-chat-simulation/grading.ts,
 * prompts.ts) and the written interview's grader
 * (ai-chat-interview/interviewContext.ts), so both fence the applicant's words
 * the same way and check a quote the same way.
 *
 * Import-free on purpose (no `https://` specifiers, nothing Deno-only), so
 * scripts/lead_practice_grading.test.mjs runs it under plain Node as shipped.
 */

/**
 * 0-100, rounded; anything else (missing, NaN, a word, "4/5") is null —
 * never a guess. A plain number, or a number written as "90%" or "95/100".
 * A blank string is null, not 0 (Number("") is 0, which once stored an
 * interview the grader could not mark as a real 0).
 */
export function clampScore(value: unknown): number | null {
  let n = NaN;
  if (typeof value === "number") n = value;
  else if (typeof value === "string") {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*(?:%|\/\s*100)?\s*$/.exec(value);
    if (m) n = Number(m[1]);
  }
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(100, Math.max(0, n)));
}

/** A yes/no flag from a reviewer: true, "true", "yes", "1" or 1. Anything else is no. */
export function readFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  return typeof value === "string" && /^(true|yes|1)$/i.test(value.trim());
}

/** A transcript line number from a reviewer: a positive whole number, or null. */
export function readLineNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\s*\d+\s*$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Every speaker label a reviewer's transcript uses (chat practice and interview). */
const SPEAKER_LABEL = /\b(LEAD|PLAYER|AGENT|CUSTOMER|PATIENT|CALLER|INTERVIEWER|CANDIDATE)(\s*#?\s*\p{Nd}+)?\s*:/giu;

/** Small capitals ("ɪɴᴛᴇʀᴠɪᴇᴡᴇʀ") NFKC leaves alone: read as the capitals they look like. */
const SMALL_CAPS: Record<string, string> = {
  "\u1D00": "A", "\u0299": "B", "\u1D04": "C", "\u1D05": "D", "\u1D07": "E", "\uA730": "F", "\u0262": "G",
  "\u029C": "H", "\u026A": "I", "\u1D0A": "J", "\u1D0B": "K", "\u029F": "L", "\u1D0D": "M", "\u0274": "N",
  "\u1D0F": "O", "\u1D18": "P", "\uA7AF": "Q", "\u0280": "R", "\uA731": "S", "\u1D1B": "T", "\u1D1C": "U",
  "\u1D20": "V", "\u1D21": "W", "\u028F": "Y", "\u1D22": "Z",
};
const SMALL_CAP = new RegExp(`[${Object.keys(SMALL_CAPS).join("")}]`, "gu");

/**
 * Punctuation and symbols an applicant's text keeps. Every OTHER punctuation
 * mark, symbol, modifier letter, line or paragraph separator and blank-looking
 * character becomes a space: a closed list of what may stay, instead of an
 * open list of colon look-alikes (ː ˸ ։ ׃ ܃ ⁚ ∶ ꓽ ꞉ ⦂ and more), which four
 * reviews kept extending (the Phase 4 reviews). Currency signs, letters,
 * numbers and emoji stay as written.
 */
const PLAIN_MARK = /^[.,!?;:'"()[\]{}\-\u2013\u2014\u2026\u2018\u2019\u201C\u201D/&%$@#+=*_~^`|\\<>]$/u;
const ODD_MARK = /[\p{P}\p{Sm}\p{So}\p{Sk}\p{Lm}\p{Zl}\p{Zp}\u0085\u000B\u000C\u2800]/gu;
// Modifier and length marks of scripts that write with them (Japanese ー and 々, Thai ๆ, Korean): letters there.
const SCRIPT_MODIFIER = /[\u0E00-\u0EFF\u3000-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF]/u;
// A combining mark after a Latin letter, a digit, punctuation or a space is
// decoration (P̲ATIENT, 4⃣, a visarga used as a colon); after a letter of a
// script that writes with marks (Devanagari, Thai...) it is part of the word.
const DECORATING_MARKS = /(?<=[\p{Script=Latin}\p{N}\p{P}\p{S}\p{Z}\s])\p{M}+/gu;

/**
 * The same text a reviewer is shown, before any label rule: look-alike
 * letters folded (NFKC, then small capitals to capitals), every invisible
 * character removed (zero-width, bidi controls and isolates, variation
 * selectors, tag characters: Unicode's default-ignorable set, and the other
 * format characters), decorating marks removed, and every punctuation or
 * symbol outside a short plain list turned into a space. words() compares on
 * this too, so a quote from the folded text still matches the applicant's
 * line.
 */
export function foldForReview(content: string): string {
  return String(content ?? "")
    .normalize("NFKC")
    .replace(/[\u00AD\p{Default_Ignorable_Code_Point}\p{Cf}]/gu, "")
    .replace(SMALL_CAP, (c) => SMALL_CAPS[c] ?? c)
    .replace(DECORATING_MARKS, "")
    .replace(ODD_MARK, (c) =>
      PLAIN_MARK.test(c) || /\p{Extended_Pictographic}/u.test(c) || SCRIPT_MODIFIER.test(c) ? c : " ",
    );
}

/**
 * One message, or one piece of the applicant's own writing, as one line for
 * a reviewer: newlines, the chat's own [RESOLVED] marker and every angle
 * bracket out, and no colon after a word (a colon look-alike is already a
 * space, foldForReview), so an applicant cannot write a line that reads as
 * the other side's ("PATIENT 4: thank you" becomes "PATIENT 4 - thank you"),
 * number one as another line, or close a fenced block (<transcript>,
 * <candidate_wrote>) early. A colon between two digits stays (10:30, 3:1,
 * John 3:16), but not right after a speaker label ("PATIENT 4:30").
 */
export function flattenForReview(content: string): string {
  return foldForReview(content)
    .replace(/\[RESOLVED\]/gi, "")
    .replace(/[<>]/g, " ")
    .replace(SPEAKER_LABEL, "$1$2 -")
    .replace(/(\p{Nd}):(?=\p{Nd})/gu, "$1\uE000")
    .replace(/\s*:\s*/g, " - ")
    .replace(/\uE000/g, ":")
    .replace(/\s*[\r\n]+\s*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** A reviewer's text field as one tidy line, at most `max` characters; null when empty. */
export function cleanText(value: unknown, max = 300): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

/** A reviewer's list of short points (at most `limit`). */
export function textList(value: unknown, limit = 4): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => cleanText(v)).filter((v): v is string => !!v).slice(0, limit);
}

/** Lowercase words, punctuation and quote marks dropped: what quotes are compared on. */
export function words(text: string): string[] {
  return foldForReview(text)
    .toLowerCase()
    .replace(/[‘’“”"'`.,!?;:()[\]{}…\-–—/\\*]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  // "guaranteed" / "guarantee", "refunded" / "refund": same first five letters.
  return a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5);
}

/** Is the quote, word for word (case and punctuation aside), inside the text? */
export function containsExact(text: string, quote: string): boolean {
  const q = words(quote);
  if (q.length === 0) return false;
  return ` ${words(text).join(" ")} `.includes(` ${q.join(" ")} `);
}

/**
 * Is `quote` something the applicant (role "user") actually wrote? Exact
 * (after flattening punctuation and case) or, for a slightly misquoted line,
 * at least three-quarters of the quote's words of 3+ letters in ONE of the
 * applicant's messages. The other side's lines (the player, the interviewer)
 * and the brief never count. Good enough to decide whether a quote may be
 * SHOWN as the applicant's words; never enough on its own to cap a mark.
 */
export function quoteIsApplicants(quote: string, messages: ReadonlyArray<{ role: string; content: unknown }>): boolean {
  const q = words(quote);
  if (q.length === 0) return false;
  const qText = q.join(" ");
  const content = q.filter((w) => w.length >= 3);
  for (const m of messages) {
    if (m.role !== "user" || typeof m.content !== "string") continue;
    const w = words(m.content);
    if (` ${w.join(" ")} `.includes(` ${qText} `)) return true;
    if (content.length >= 2) {
      const found = content.filter((cw) => w.some((mw) => sameWord(cw, mw))).length;
      if (found / content.length >= 0.75) return true;
    }
  }
  return false;
}
