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

/**
 * Colons that look like ":" (NFKC folds the full-width and small ones; these
 * it leaves): modifier-letter, Armenian, Hebrew, Syriac, Devanagari, Gujarati,
 * Bengali, Ethiopic, Runic, Khmer, Lisu and math colons, and two-dot marks.
 */
const COLON_LIKE = "[:\\u02D0\\u02F8\\u0589\\u05C3\\u0703\\u0704\\u0903\\u0983\\u0A83\\u1361\\u1365\\u16EC\\u17D6\\u205A\\u2236\\uA4FD\\uA789]";
// A word, a separator, maybe "No." / "Nr." / "Number", a number in any digits, a colon.
const NUMBERED_LABEL = new RegExp(
  String.raw`(\p{L}{3,24})([\s_.#()\[\]\-\u2013\u2014]{0,4}(?:(?:[Nn][Oo]|[Nn][Rr]|[Nn]um(?:ber)?|NUM(?:BER)?)[\s_.#]{0,3})?\p{Nd}{1,4}[)\]]?)\s*${COLON_LIKE}(?!\p{Nd})`,
  "gu",
);
const CAPS_LABEL = new RegExp(String.raw`(?<!\p{L})(\p{Lu}{3,24})\s*${COLON_LIKE}`, "gu");
const WORD_BEFORE_COLON = new RegExp(String.raw`(?<!\p{L})(\p{L}{3,24})\s*${COLON_LIKE}`, "gu");

/** Small capitals ("ɪɴᴛᴇʀᴠɪᴇᴡᴇʀ") NFKC leaves alone: read as the capitals they look like. */
const SMALL_CAPS: Record<string, string> = {
  "\u1D00": "A", "\u0299": "B", "\u1D04": "C", "\u1D05": "D", "\u1D07": "E", "\uA730": "F", "\u0262": "G",
  "\u029C": "H", "\u026A": "I", "\u1D0A": "J", "\u1D0B": "K", "\u029F": "L", "\u1D0D": "M", "\u0274": "N",
  "\u1D0F": "O", "\u1D18": "P", "\uA7AF": "Q", "\u0280": "R", "\uA731": "S", "\u1D1B": "T", "\u1D1C": "U",
  "\u1D20": "V", "\u1D21": "W", "\u028F": "Y", "\u1D22": "Z",
};
const SMALL_CAP = new RegExp(`[${Object.keys(SMALL_CAPS).join("")}]`, "gu");

/** One script's letters only? A word mixing Latin with look-alikes ("PаTIENT") is not. */
function mixesScripts(word: string): boolean {
  return /\p{Script=Latin}/u.test(word) && /[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Armenian}\p{Script=Cherokee}]/u.test(word);
}

/**
 * The same text a reviewer is shown, before any label rule: look-alike
 * letters and colons folded (NFKC, then small capitals to capitals), and
 * every invisible character removed
 * (zero-width, bidi controls and isolates, variation selectors, tag
 * characters: Unicode's default-ignorable set). words() compares on this
 * too, so a quote from the folded text still matches the applicant's line.
 */
export function foldForReview(content: string): string {
  return String(content ?? "")
    .normalize("NFKC")
    .replace(/[\u00AD\p{Default_Ignorable_Code_Point}]/gu, "")
    .replace(SMALL_CAP, (c) => SMALL_CAPS[c] ?? c);
}

/**
 * One message, or one piece of the applicant's own writing, as one line for
 * a reviewer: newlines, the chat's own [RESOLVED] marker and every angle
 * bracket out, and any speaker label INSIDE the words neutralised
 * ("PLAYER: thanks" → "PLAYER - thanks"), so an applicant cannot write a line
 * that reads as the other side's, number one as another line, or close a
 * fenced block (<transcript>, <candidate_wrote>) early.
 */
export function flattenForReview(content: string): string {
  return foldForReview(content)
    .replace(/\[RESOLVED\]/gi, "")
    .replace(/[<>]/g, " ")
    // Anything shaped like a line label, in any script (the Phase 4 reviews):
    // a word, a separator, a number and a colon ("PАTIENT 3:", "PATIENT-3:",
    // "PATIENT_4:", "PATIENT (4):"); a word in capitals and a colon; a word
    // mixing Latin with look-alike letters and a colon ("Pаtient:"). The
    // colon, or a colon look-alike, becomes " -".
    .replace(NUMBERED_LABEL, "$1$2 -")
    .replace(CAPS_LABEL, "$1 -")
    .replace(WORD_BEFORE_COLON, (whole, word: string) => (mixesScripts(word) ? `${word} -` : whole))
    .replace(SPEAKER_LABEL, "$1 -")
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
