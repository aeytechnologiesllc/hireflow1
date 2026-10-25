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
const PLAIN_MARK = /^[.,!?;:'"()[\]{}\-\u2013\u2014\u2026\u2018\u2019\u201C\u201D/&%$@#+=*_~^`|\\<>\u00B0\u00D7\u00F7\u00BF\u00A1\u2044\u060C\u061B\u061F]$/u;
// Guillemets read as the quote marks they are, never as angle brackets (the sixth Phase 4 review).
const GUILLEMETS: Record<string, string> = { "\u00AB": '"', "\u00BB": '"', "\u2039": "'", "\u203A": "'" };
// Emoji pieces that are symbols but no punctuation: skin tones and flag letters.
const EMOJI_PART = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}]/u;
const ODD_MARK = /[\p{P}\p{Sm}\p{So}\p{Sk}\p{Lm}\p{Zl}\p{Zp}\u0085\u000B\u000C\u2800]/gu;
// Modifier and length LETTERS of scripts that write with them (Japanese ー
// and 々, Thai ๆ, Lao ໆ): letters there. Their punctuation (〈〉《》「」, Thai
// ๚ ๛) is not kept: an angle bracket of any width could seem to close a
// fenced block, and ๚ could stand in for a colon (the sixth Phase 4 review).
const SCRIPT_MODIFIER = /^[\u0E46\u0EC6\u3005\u3031-\u3035\u309D\u309E\u30FC-\u30FE\uFF70\uFF9E\uFF9F]$/u;
// A combining mark is part of a word only after a LETTER of its own script
// (a Devanagari vowel sign after a Devanagari letter, Hebrew points or Arabic
// vowel marks after a letter of theirs), or an accent after a Latin letter
// (Yoruba "ẹ́"). Any other is decoration (P̲ATIENT, 4⃣, a visarga or a Myanmar
// mark used as a colon after a Latin, Cyrillic or Cherokee letter, or after a
// digit: "३ः"; the fourth, fifth and sixth Phase 4 reviews) and goes.
const MARK_SCRIPTS = [
  "Devanagari", "Bengali", "Gurmukhi", "Gujarati", "Oriya", "Tamil", "Telugu", "Kannada", "Malayalam", "Sinhala",
  "Thai", "Lao", "Tibetan", "Myanmar", "Khmer", "Hebrew", "Arabic", "Syriac", "Thaana", "Hangul", "Hiragana",
  "Katakana", "Han", "Ethiopic", "Mongolian", "Tagalog", "Javanese", "Balinese", "Sundanese", "Tai_Tham",
].map((name) => ({ letter: new RegExp(`^\\p{Script=${name}}$`, "u"), mark: new RegExp(`^\\p{Script_Extensions=${name}}$`, "u") }));
// Accents (grave, acute, circumflex, tilde, macron, breve, dots, ring, caron,
// cedilla, ogonek, the "below" accents): never a line, an overlay or a keycap.
const LATIN_ACCENT = /^[\u0300-\u0304\u0306-\u030C\u0323-\u0325\u0327\u0328\u032D\u0330\u0331]$/u;
function keepMarks(base: string, marks: string): string {
  if (!/^\p{L}$/u.test(base)) return "";
  if (/^\p{Script=Latin}$/u.test(base)) return [...marks].filter((m) => LATIN_ACCENT.test(m)).join("");
  const script = MARK_SCRIPTS.find((re) => re.letter.test(base));
  return script ? [...marks].filter((m) => script.mark.test(m)).join("") : "";
}
const MARK_RUN = /(\P{M})(\p{M}+)/gu;
const LEADING_MARKS = /^\p{M}+/u;
// A word that reads as a line label before a number ("PАTIENT 4:30", "PATIENT_4:5"):
// no small letters (capitals, or a script with no case: "ꓑꓮꓔꓲꓰꓠꓔ"), a speaker
// word, or letters of two scripts. Its time's colon becomes a full stop
// ("PATIENT 4.30"), which still reads as a time ("TOMORROW 10.30").
const LABEL_BEFORE_TIME = /(?<![\p{L}\p{M}])((?:\p{L}\p{M}*){3,24})([\s_.#\-\u2010-\u2015]{0,8})(\p{Nd}{1,4}):(?=\p{Nd})/gu;
const SPEAKER_WORD = /^(lead|player|agent|customer|patient|caller|interviewer|candidate)$/i;
function readsAsLabel(marked: string): boolean {
  const word = marked.replace(/\p{M}/gu, "");
  if (!/\p{Ll}/u.test(word) || SPEAKER_WORD.test(word)) return true;
  return /\p{Script=Latin}/u.test(word) && /[^\p{Script=Latin}]/u.test(word);
}
// Letters shaped like angle brackets (Canadian syllabics ᐸ ᐳ, and their kin).
const BRACKET_LETTER = /[\u1433\u1438\u1445\u144A\u1450\u1455\u2329\u232A]/gu;

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
    // Private-use and unassigned characters and the control codes go too: a
    // private-use U+E000 is the colon placeholder flattenForReview uses (the
    // eighth Phase 4 review: "PATIENT 3\uE000" came out as "PATIENT 3:").
    .replace(/[\u00AD\p{Default_Ignorable_Code_Point}\p{Cf}\p{Co}\p{Cn}]/gu, "")
    .replace(/[\u0000-\u0008\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(SMALL_CAP, (c) => SMALL_CAPS[c] ?? c)
    .replace(LEADING_MARKS, "")
    .replace(MARK_RUN, (_all, base: string, marks: string) => base + keepMarks(base, marks))
    .replace(/[\u00AB\u00BB\u2039\u203A]/g, (c) => GUILLEMETS[c] ?? c)
    .replace(ODD_MARK, (c) => (PLAIN_MARK.test(c) || EMOJI_PART.test(c) || SCRIPT_MODIFIER.test(c) ? c : " "));
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
    .replace(BRACKET_LETTER, " ")
    // One line, one space between words, before any label rule (the sixth review: four spaces or tabs before a time).
    .replace(/\s+/g, " ")
    .replace(SPEAKER_LABEL, "$1$2 -")
    .replace(LABEL_BEFORE_TIME, (whole, word: string, sep: string, digits: string) => (readsAsLabel(word) ? `${word}${sep}${digits}.` : whole))
    .replace(/(\p{Nd}):(?=\p{Nd})/gu, "$1\uE000")
    .replace(/\s*:\s*/g, " - ")
    .replace(/\uE000/g, ":")
    .replace(/ {2,}/g, " ")
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
