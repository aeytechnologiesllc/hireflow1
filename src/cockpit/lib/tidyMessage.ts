/**
 * tidyMessage.ts: tidies a message the hiring team is about to send
 * (docs/MESSAGES.md, "Tidied when you send").
 *
 * The owner, 2026-10-09, with "Hey john, let me know if you have any trouble
 * joining the interview" typed in the box: "can you also make it like
 * autocorrect grammar and spelling mistakes here? That could be good as
 * well."
 *
 * What this does, with no AI and no request: the small things a quick typist
 * leaves behind. A capital at the start of each sentence and line, the
 * applicant's own name capitalised, "i" as "I", doubled spaces, a space
 * before a comma, and a full stop on a sentence left open at the end of a
 * paragraph. So
 * that message goes out as "Hey John, let me know if you have any trouble
 * joining the interview."
 *
 * What it does NOT do: it never changes a word. Real spelling and grammar
 * (a misspelt word, a wrong tense) need a dictionary or a model; that is a
 * separate thing to switch on, and this must never guess.
 *
 * Every rule is written to do nothing when unsure: a link, an email address,
 * a time, a number, "e.g.", a word in capitals and a short sign-off line are
 * all left exactly as typed.
 *
 * Pure: no React, no Supabase.
 */

export interface TidyContext {
  /** The other person's name as on their profile ("Ana Maria Reyes"): its words are capitalised when typed in lower case. */
  recipientName?: string | null;
}

/** After one of these a full stop does not end a sentence. */
const ABBREVIATIONS = new Set(["e.g", "i.e", "etc", "vs", "mr", "mrs", "ms", "dr", "a.m", "p.m", "no", "approx", "st"]);

/**
 * Names that are also ordinary words. One of these is capitalised only where
 * it is plainly a name: straight after a greeting ("hi grace"). Elsewhere
 * "will", "may" or "hope" in the middle of a sentence is left alone.
 */
const ALSO_A_WORD = new Set([
  "will", "may", "mark", "rose", "art", "hope", "joy", "grace", "faith", "bill", "rich", "sue", "pat", "dawn", "april", "june", "august", "summer", "autumn", "sky", "star", "angel", "precious", "princess",
  "prince", "king", "queen", "lady", "love", "happy", "lucky", "honey", "baby", "boy", "girl", "son", "junior", "sunshine", "rain", "heaven", "blessed", "mercy", "charity", "dear", "bless", "jewel", "pearl",
  "ruby", "ivy", "holly", "lily", "daisy", "violet", "amber", "jade", "crystal", "diamond", "gem", "sunny", "rocky", "buddy", "chance", "justice", "major", "bishop", "dean", "earl", "duke", "an", "van", "de", "la",
  "del", "dela", "san", "the", "and", "can", "her", "him", "his", "she", "you", "your", "our", "for", "not", "one", "two", "ten", "long", "young", "white", "black", "brown", "green", "gray", "grey", "rivers",
]);

const GREETING = /(?:^|[\s,.!?])(?:hi|hey|hello|dear|thanks|thank you|good morning|good afternoon|good evening|morning|afternoon|evening|ok|okay|sorry|welcome)[\s,]+$/i;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A run of non-space characters that is not prose: a link, an address, a file name, a number or a time. */
function isNotProse(token: string): boolean {
  return /:\/\/|^www\.|@|^\d|\.\w{2,4}(\/|$)|^[#/\\]/.test(token);
}

/** The first letter of the token at `index`, made a capital, unless the token is not prose or has capitals of its own. */
function capitaliseAt(text: string, index: number): string {
  const token = /^\S+/.exec(text.slice(index))?.[0] ?? "";
  if (!token || isNotProse(token)) return text;
  const first = token[0];
  if (!/[a-z]/.test(first)) return text;
  // "iPhone", "eBay": a word with a capital inside it was typed that way on purpose.
  if (/[A-Z]/.test(token.slice(1))) return text;
  return text.slice(0, index) + first.toUpperCase() + text.slice(index + 1);
}

function tidyLine(line: string): string {
  let out = line.replace(/[ \t]+$/g, "");
  // Doubled spaces inside the line (indentation at its start is left).
  out = out.replace(/(\S)[ \t]{2,}(?=\S)/g, "$1 ");
  // A space before a comma or a full stop that follows a word: "hello , there" -> "hello, there".
  out = out.replace(/([A-Za-z0-9)"'’])[ \t]+([,;!?])(?=\s|$)/g, "$1$2");
  out = out.replace(/([A-Za-z)"'’])[ \t]+\.(?=\s|$)/g, "$1.");
  // No space after a comma between two words: "hello,there" -> "hello, there". Never inside a number.
  out = out.replace(/([A-Za-z]),(?=[A-Za-z])/g, "$1, ");
  // "i" on its own, and i'm / i'll / i've / i'd. Not "i.e.".
  out = out.replace(/(^|[^A-Za-z0-9_'’.@/-])i(?=(?:['’](?:m|ll|ve|d)\b)|[\s,!?;:)]|$)/g, "$1I");
  return out;
}

function capitaliseSentences(line: string): string {
  let out = line;
  // The start of the line.
  const lead = /^\s*/.exec(out)?.[0].length ?? 0;
  out = capitaliseAt(out, lead);
  // After a full stop, a question mark or an exclamation mark and a space.
  const ends = /([.!?])(\s+)(?=[a-z])/g;
  let match: RegExpExecArray | null;
  const starts: number[] = [];
  while ((match = ends.exec(out)) !== null) {
    const stop = match.index;
    if (match[1] === ".") {
      // "..." trails off; "e.g." and "etc." do not end a sentence; "4.30" is a number.
      if (out[stop - 1] === ".") continue;
      const before = /(\S+)$/.exec(out.slice(0, stop))?.[1] ?? "";
      const word = before.replace(/^[("'“‘]+/, "").toLowerCase();
      if (ABBREVIATIONS.has(word) || /^\d+$/.test(word) || /^[a-z]$/.test(word)) continue;
    }
    starts.push(stop + match[1].length + match[2].length);
  }
  for (const index of starts) out = capitaliseAt(out, index);
  return out;
}

function capitaliseNames(text: string, recipientName: string | null | undefined): string {
  const parts = (recipientName ?? "")
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}'’-]/gu, ""))
    .filter((p) => p.length >= 3 && /^\p{Lu}/u.test(p));
  let out = text;
  for (const name of new Set(parts)) {
    const lower = name.toLowerCase();
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_@./'’-])${escapeRegExp(lower)}(?![\\p{L}\\p{N}_@/'’-]|\\.\\w)`, "gu");
    out = out.replace(pattern, (found, offset: number) => {
      // Only a name typed all in lower case; and a name that is also a word only after a greeting.
      if (ALSO_A_WORD.has(lower) && !GREETING.test(out.slice(0, offset))) return found;
      return name;
    });
  }
  return out;
}

/**
 * A sentence left open at the end of a paragraph (before an empty line, or at
 * the very end) gets its full stop. A short line (a greeting, a sign-off, a
 * name), a link, and a list item do not.
 */
function closeSentences(text: string): string {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const endsParagraph = i === lines.length - 1 || !lines[i + 1].trim();
    if (!endsParagraph || !line.trim()) continue;
    const words = line.trim().split(/\s+/);
    const lastWord = words[words.length - 1] ?? "";
    if (words.length < 4 || !/[A-Za-z0-9)"'’]$/.test(line) || isNotProse(lastWord) || /^(?:[-*•]|\d+[.)])/.test(line.trim())) continue;
    lines[i] = `${line}.`;
  }
  return lines.join("\n");
}

/**
 * The message as it will be sent. Never a different word, never a longer or
 * shorter message in any way that matters: only capitals, spacing and one
 * closing full stop.
 */
export function tidyMessage(text: string, context: TidyContext = {}): string {
  if (typeof text !== "string") return "";
  const body = text.replace(/\r\n?/g, "\n").replace(/^\s*\n/, "").replace(/\s+$/, "");
  if (!body.trim()) return "";
  let out = body
    .split("\n")
    .map(tidyLine)
    .join("\n")
    // Three or more empty lines are two.
    .replace(/\n{4,}/g, "\n\n\n");
  out = capitaliseNames(out, context.recipientName);
  out = out.split("\n").map(capitaliseSentences).join("\n");
  return closeSentences(out);
}
