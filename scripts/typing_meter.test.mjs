#!/usr/bin/env node
/**
 * Typing measured inside the chat practice (docs/TYPING-IN-CHAT.md), under
 * plain Node against the REAL source files (no copies):
 *
 *   src/lib/typingMeter.ts                          the page's keystroke meter, one per reply box
 *   supabase/functions/ai-chat-simulation/typing.ts what the server builds from the stored replies
 *
 * Synthetic keystroke streams go through the meter exactly as the page feeds
 * it (the key, the event time, the box's text as the key goes down), and the
 * summaries it returns are stored on fake candidate_turn events with server
 * times, the way ai-chat-simulation stores them. Then:
 *
 *   - speed: every gap between keys counts up to 1 s (a longer pause never
 *     reads faster: no cliff), the Enter that sends is not timed, WPM =
 *     (chars ÷ 5) ÷ active minutes;
 *   - one character credited per character key: a held key's repeats, a
 *     script's keydowns and an undo add nothing, and text that arrives
 *     without a key each (more than 15 characters of it) is paste-like;
 *   - corrections: Backspace and Delete ÷ keys;
 *   - the aggregation: the timed replies TAKEN TOGETHER, the 3-reply
 *     minimum, replies under 20 characters skipped for speed, and why no
 *     speed was timed (notTimed);
 *   - each reply's summary checked against the stored reply (more characters
 *     than keys, or a reply longer than what was typed, is paste-like);
 *   - reply time from the SERVER's timestamps, never the page's;
 *   - nothing the page claims as a total is read.
 *
 * Run with: node scripts/typing_meter.test.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PASTE_LIKE_JUMP, TYPING_GAP_CAP_MS, createTypingMeter } from "../src/lib/typingMeter.ts";
import {
  DEFAULT_TYPING_BAR,
  TYPING_MIN_REPLY_CHARS,
  TYPING_MIN_TIMED_REPLIES,
  TYPING_UNTYPED_ALLOWANCE,
  buildTypingResult,
  cleanReplyTyping,
  replyTypingRows,
  typingBarFrom,
} from "../supabase/functions/ai-chat-simulation/typing.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

/**
 * Types `text` into a fake box, one key per character, `msPerKey` apart,
 * with an optional long pause before some characters. Returns the time after
 * the last key. Each keydown sees the box's text BEFORE the key acts, as a
 * real keydown does.
 */
function typeInto(meter, box, text, { start = 0, msPerKey = 200, pauses = {} } = {}) {
  let t = start;
  for (let i = 0; i < text.length; i += 1) {
    if (pauses[i]) t += pauses[i];
    const ch = text[i];
    meter.keydown(ch === "\n" ? "Enter" : ch, t, box.value);
    box.value += ch;
    t += msPerKey;
  }
  return t;
}

function press(meter, box, key, at) {
  meter.keydown(key, at, box.value);
  if (key === "Backspace") box.value = box.value.slice(0, -1);
}

// ============================================================================
console.log("The meter, from keystroke streams:\n");
{
  const meter = createTypingMeter();
  const box = { value: "" };
  const text = "Sorry for the wait, I can see your payment here."; // 48 characters
  typeInto(meter, box, text, { msPerKey: 200 });
  // The Enter that sends is not fed (the page skips it): the re-read before it is not typing.
  const s = meter.take(box.value);
  check("every character typed is counted", s.charsTyped === text.length, JSON.stringify(s));
  check("active time is the sum of the gaps between keys (47 gaps of 200 ms)", s.activeMs === (text.length - 1) * 200, String(s.activeMs));
  check("every key counts", s.keys === text.length);
  check("no corrections, nothing paste-like", s.corrections === 0 && s.pasteLike === false);
  const wpm = s.charsTyped / 5 / (s.activeMs / 60000);
  check("60 WPM typing reads as 60 WPM (within the one gap the first key has no time for)", wpm >= 60 && wpm < 62, String(wpm));
  const next = meter.take("");
  check("take() starts over for the next reply", next.charsTyped === 0 && next.activeMs === 0 && next.keys === 0 && next.pasteLike === false);
}
{
  const meter = createTypingMeter();
  const box = { value: "" };
  // A 5 s think in the middle and a 2.5 s one later: each counts as 1 s at most.
  typeInto(meter, box, "Let me check that for you right now.", { msPerKey: 150, pauses: { 10: 5000, 20: 2500 } });
  const s = meter.take(box.value);
  check(`a pause counts as ${TYPING_GAP_CAP_MS} ms of typing at most`, TYPING_GAP_CAP_MS === 1000 && s.activeMs === (box.value.length - 1 - 2) * 150 + 2 * TYPING_GAP_CAP_MS, String(s.activeMs));
  const meter2 = createTypingMeter();
  const box2 = { value: "" };
  typeInto(meter2, box2, "Let me check that for you right now.", { msPerKey: 150, pauses: { 10: 700 } });
  const s2 = meter2.take(box2.value);
  check("a gap under the cap counts in full", s2.activeMs === (box2.value.length - 1) * 150 + 700, String(s2.activeMs));
}
{
  // The same typist, pausing longer and longer before each word: the speed
  // never goes UP as the pause grows (the first rule dropped every gap over
  // 2 s and still counted the character after it: 24 WPM at 2.000 s, 98 WPM
  // at 2.001 s).
  const text = "Hi Devin, I'm the team lead and I've read the whole chat. You're right that Sam told you the bonus would land tonight.";
  const speedAt = (pause) => {
    const meter = createTypingMeter();
    let t = 0;
    let value = "";
    for (let i = 0; i < text.length; i += 1) {
      if (i > 0) t += text[i - 1] === " " ? pause : 150;
      meter.keydown(text[i], t, value);
      value += text[i];
    }
    const s = meter.take(value);
    return s.charsTyped / 5 / (s.activeMs / 60000);
  };
  const pauses = [200, 500, 900, 999, 1000, 1001, 1500, 1999, 2000, 2001, 3000, 6000];
  const speeds = pauses.map(speedAt);
  check("a longer pause never reads faster", speeds.every((v, i) => i === 0 || v <= speeds[i - 1] + 1e-9), speeds.map((v) => v.toFixed(1)).join(", "));
  check("…and there is no cliff at 1 s or 2 s", Math.abs(speedAt(1000) - speedAt(1001)) < 0.01 && Math.abs(speedAt(2000) - speedAt(2001)) < 0.01);
}
{
  const meter = createTypingMeter();
  const box = { value: "" };
  let t = typeInto(meter, box, "I am sorry abut", { msPerKey: 200 });
  press(meter, box, "Backspace", t);
  press(meter, box, "Backspace", (t += 200));
  press(meter, box, "Backspace", (t += 200));
  t = typeInto(meter, box, "out that.", { start: t + 200, msPerKey: 200 });
  meter.keydown("Shift", t, box.value);
  meter.keydown("Control", t + 10, box.value);
  const s = meter.take(box.value);
  check("Backspace presses are corrections", s.corrections === 3);
  check("modifier keys on their own are not keys", s.keys === 15 + 3 + 9);
  check("corrections as a share of keys: 3 of 27 = 11%", Math.round((s.corrections / s.keys) * 100) === 11);
  check("the characters typed are counted, gross (the three deleted too)", s.charsTyped === 15 + 9, String(s.charsTyped));
  const meter2 = createTypingMeter();
  meter2.keydown("Delete", 0, "abc");
  meter2.keydown("a", 100, "abc");
  check("Delete is a correction too", meter2.take("abca").corrections === 1);
}
{
  const meter = createTypingMeter();
  const box = { value: "" };
  let t = typeInto(meter, box, "Hi Angela, ", { msPerKey: 200 });
  // 30 characters land between two keystrokes (a drop, a clipboard chip).
  box.value += "x".repeat(30);
  t = typeInto(meter, box, "thanks.", { start: t, msPerKey: 200 });
  const s = meter.take(box.value);
  check(`30 characters arriving with no key for each is paste-like (over ${PASTE_LIKE_JUMP})`, s.pasteLike === true);
  check("…and those 30 are not counted as typed, every typed one is", s.charsTyped === "Hi Angela, thanks.".length, String(s.charsTyped));
  const meter2 = createTypingMeter();
  meter2.keydown("a", 0, "");
  meter2.keydown("b", 100, "a" + "c".repeat(PASTE_LIKE_JUMP)); // 15 arrived with no key
  check("15 characters with no key is not paste-like", meter2.take("a" + "c".repeat(PASTE_LIKE_JUMP) + "b").pasteLike === false);
  const meter2b = createTypingMeter();
  meter2b.keydown("a", 0, "");
  meter2b.keydown("b", 100, "a" + "c".repeat(PASTE_LIKE_JUMP + 1)); // 16
  check("…16 is", meter2b.take("a" + "c".repeat(PASTE_LIKE_JUMP + 1) + "b").pasteLike === true);
  const meter3 = createTypingMeter();
  meter3.keydown("a", 0, "");
  check("text that arrives after the last key is seen at send (the Send button)", meter3.take("a" + "z".repeat(40)).pasteLike === true);
}
{
  // Text arriving without keys in short pieces (dictation in phrases, a text
  // expander, an extension setting the value): each piece is 15 or fewer,
  // but they add up. One real key between pieces earns one character.
  const meter = createTypingMeter();
  let t = 0;
  let value = "";
  for (const piece of ["Hi Devin, I'm", "the team lead.", "I read the", "chat and I'm", "sorry. The", "bonus is being", "checked now."]) {
    t += 1500;
    meter.keydown(" ", t, value);
    value += " " + piece;
  }
  const s = meter.take(value);
  check("pieces of 15 or fewer that add up to more are paste-like", s.pasteLike === true, JSON.stringify(s));
  check("…and only one character a key is counted as typed", s.charsTyped === 7 && s.keys === 7, JSON.stringify(s));
}
{
  // A key held down: the browser repeats it (event.repeat). The repeats are
  // not keys, not corrections, not typing time and not typed characters.
  const base = "I understand, and I am sorry the bonus has not arrived yet. Let me check the notes.";
  const plain = createTypingMeter();
  const pbox = { value: "" };
  typeInto(plain, pbox, base, { msPerKey: 400 });
  const before = plain.take(pbox.value);
  const meter = createTypingMeter();
  const box = { value: "" };
  let t = typeInto(meter, box, base, { msPerKey: 400 });
  meter.keydown("x", t, box.value); // hold x: one press…
  box.value += "x";
  t += 500;
  for (let i = 0; i < 45; i += 1) {
    meter.keydown("x", t, box.value, { repeat: true }); // …45 repeats
    box.value += "x";
    t += 33;
  }
  t += 300;
  meter.keydown("Backspace", t, box.value); // hold Backspace: one press…
  box.value = box.value.slice(0, -1);
  t += 500;
  for (let i = 0; i < 45; i += 1) {
    meter.keydown("Backspace", t, box.value, { repeat: true }); // …45 repeats
    box.value = box.value.slice(0, -1);
    t += 33;
  }
  const s = meter.take(box.value);
  const wpm = (x) => x.charsTyped / 5 / (x.activeMs / 60000);
  check("a hold is one key (and one correction for Backspace), not 46", s.keys === before.keys + 2 && s.corrections === 1, JSON.stringify(s));
  check("…its repeats are not typed characters and not a paste", s.charsTyped === before.charsTyped + 1 && s.pasteLike === false, JSON.stringify(s));
  check("…and holding keys cannot raise the speed", wpm(s) <= wpm(before) + 0.5, `${wpm(before).toFixed(1)} -> ${wpm(s).toFixed(1)}`);
  check("…or make the corrections read as 24% (one held Backspace is one correction)", Math.round((s.corrections / s.keys) * 100) <= 2);
}
{
  // A keydown a script dispatched (isTrusted false) is ignored, and the text
  // it brought is seen as arriving without keys.
  const meter = createTypingMeter();
  let value = "";
  let t = 0;
  for (const ch of "Ok. ") {
    meter.keydown(ch, t, value);
    value += ch;
    t += 200;
  }
  for (const ch of "this text was typed by a script, not a person") {
    meter.keydown(ch, t, value, { trusted: false });
    value += ch;
    t += 5;
  }
  const s = meter.take(value);
  check("a script's keydowns are not keys and add no time", s.keys === 4 && s.activeMs === 600, JSON.stringify(s));
  check("…and their text is paste-like, never typed", s.pasteLike === true && s.charsTyped === 4, JSON.stringify(s));
}
{
  // Undo: delete a selected sentence, then Cmd+Z brings it back in one go.
  const meter = createTypingMeter();
  const box = { value: "" };
  const base = "I understand, and I am sorry the bonus has not arrived yet. Let me check the account notes for you now.";
  let t = typeInto(meter, box, base, { msPerKey: 200 });
  meter.keydown("Backspace", (t += 300), box.value);
  box.value = box.value.slice(0, -42); // the selected sentence goes
  meter.keydown("Meta", (t += 600), box.value);
  meter.keydown("z", (t += 100), box.value, { shortcut: true });
  box.value = base; // undo brings it back
  const s = meter.take(box.value);
  check("text an undo brings back is not paste-like", s.pasteLike === false, JSON.stringify(s));
  check("…and not typed a second time", s.charsTyped === base.length, String(s.charsTyped));
  const meter2 = createTypingMeter();
  meter2.keydown("v", 0, "", { shortcut: true });
  check("a shortcut is not a character (Cmd+V cannot earn the text it brings)", meter2.take("x".repeat(30)).pasteLike === true);
}
{
  // A send that did not save goes back in the box with its keystrokes.
  const meter = createTypingMeter();
  const box = { value: "" };
  const end = typeInto(meter, box, "Your deposit is with the payments team.", { msPerKey: 180 });
  const first = meter.take(box.value);
  box.value = "";
  meter.giveBack(first, "Your deposit is with the payments team.");
  box.value = "Your deposit is with the payments team.";
  typeInto(meter, box, " Thanks", { start: end + 10000, msPerKey: 180 });
  const again = meter.take(box.value);
  check("a message put back is not read as a paste when it is sent again", again.pasteLike === false);
  check("…and its keystrokes count with the new ones", again.charsTyped === first.charsTyped + 7 && again.keys === first.keys + 7, JSON.stringify(again));
  const meter2 = createTypingMeter();
  meter2.sync("old text that was already in the box");
  meter2.keydown("a", 0, "old text that was already in the box");
  check("text the page set itself (sync) is not a jump", meter2.take("old text that was already in the boxa").pasteLike === false);
  const meter3 = createTypingMeter();
  meter3.keydown("a", 0, "");
  meter3.reset("leftover draft text in the box");
  meter3.keydown("b", 50, "leftover draft text in the box");
  const r = meter3.take("leftover draft text in the boxb");
  check("reset() forgets the last conversation and starts from the box's text", r.keys === 1 && r.pasteLike === false && r.charsTyped === 1);
}
{
  const meter = createTypingMeter();
  meter.keydown("a", 100, "");
  meter.keydown("b", 50, "a"); // a clock that went backwards: no negative time
  meter.keydown("c", Number.NaN, "ab");
  const s = meter.take("abc");
  check("a time that goes backwards or is not a number adds no typing time", s.activeMs === 0 && s.keys === 3);
}
{
  // A keydown costs a few comparisons: 200,000 of them well under a second.
  const meter = createTypingMeter();
  let value = "";
  const t0 = performance.now();
  for (let i = 0; i < 200_000; i += 1) {
    meter.keydown("a", i * 120, value);
    value = i % 400 === 0 ? "" : value + "a";
    if (i % 400 === 0) meter.sync("");
  }
  const ms = performance.now() - t0;
  check(`a keydown is cheap (200,000 in ${ms.toFixed(0)} ms, no lag while typing)`, ms < 1000);
}

// ============================================================================
console.log("\nFrom the stored replies to notes.chatSimulationResult.typing:\n");

/** Stored turns: the player's message, then the applicant's reply `replyAfterS` later, server times. */
function chat(replies, { start = Date.parse("2026-10-06T15:00:00Z"), playerGapS = 8 } = {}) {
  const turns = [];
  let t = start;
  turns.push({ seq: 1, kind: "assistant_turn", content: "My deposit is missing.", created_at: new Date(t).toISOString(), detail: { role: "customer" } });
  let seq = 2;
  for (const r of replies) {
    t += r.replyAfterS * 1000;
    turns.push({ seq: seq++, kind: "candidate_turn", content: r.text, created_at: new Date(t).toISOString(), detail: { role: "agent", ...(r.typing !== undefined ? { typing: r.typing } : {}) } });
    t += playerGapS * 1000;
    turns.push({ seq: seq++, kind: "assistant_turn", content: "ok", created_at: new Date(t).toISOString(), detail: { role: "customer" } });
  }
  return turns;
}

/** One reply typed through the real meter at `msPerKey`, with its server reply time (sent with Enter, which the page does not time). */
function typedReply(text, msPerKey, replyAfterS, extra = {}) {
  const meter = createTypingMeter();
  const box = { value: "" };
  typeInto(meter, box, text, { msPerKey, ...extra });
  return { text, replyAfterS, typing: meter.take(box.value) };
}

/** The speed of replies TAKEN TOGETHER: all their characters ÷ 5 ÷ all their typing minutes. */
function pooledWpm(replies) {
  const chars = replies.reduce((a, r) => a + r.typing.charsTyped, 0);
  const ms = replies.reduce((a, r) => a + r.typing.activeMs, 0);
  return Math.round(chars / 5 / (ms / 60000));
}

const R1 = "I'm sorry for the wait, I can see the deposit you made last night.";
const R2 = "Can you tell me the name on the account you paid from, please?";
const R3 = "Thank you. I've passed it to the payments team with those details.";
const R4 = "You'll get a message here as soon as they have looked at it.";
{
  // 60 WPM = 200 ms a key; 48 WPM = 250 ms; 40 WPM = 300 ms.
  const replies = [typedReply(R1, 200, 40), typedReply(R2, 250, 30), typedReply(R3, 300, 50), typedReply(R4, 250, 20)];
  const turns = chat(replies);
  const typing = buildTypingResult({ turns, bar: typingBarFrom({}), typosPer100Words: 1.2 });
  check("WPM is the replies taken together (all characters ÷ 5 ÷ all typing minutes: 49)", typing.wpm === pooledWpm(replies) && typing.wpm === 49, String(typing.wpm));
  check("all four replies are timed", typing.repliesTimed === 4);
  check("reply time is the server's: median of 40, 30, 50, 20 s = 35 s", typing.medianReplySeconds === 35, String(typing.medianReplySeconds));
  check("no corrections", typing.correctionsPct === 0);
  check("the doc's exact keys, in the doc's order", Object.keys(typing).join(",") === "wpm,correctionsPct,medianReplySeconds,typosPer100Words,repliesTimed,pasteLike,bar,meetsBar,below,notTimed,measuredBy", Object.keys(typing).join(","));
  check("bars default to 40 WPM and 90 s", typing.bar.minWpm === 40 && typing.bar.maxMedianReplySeconds === 90 && DEFAULT_TYPING_BAR.minWpm === 40);
  check("meets the bar: true, nothing below, and timed (notTimed null)", typing.meetsBar === true && typing.below.length === 0 && typing.notTimed === null);
  check("measuredBy says who measured what", JSON.stringify(typing.measuredBy) === JSON.stringify({ speed: "page", replyTime: "server", typos: "grader" }));
  check("typos per 100 words is carried as given by the grader step", typing.typosPer100Words === 1.2);
}
{
  // A short reply's pause cannot move the figure much: one 20-character reply
  // typed slowly beside three long fast ones.
  const fast = [typedReply(R1, 200, 30), typedReply(R2, 200, 30), typedReply(R3, 200, 30)];
  const short = typedReply("Let me check that.!!", 200, 10, { pauses: { 19: 6000 } });
  const typing = buildTypingResult({ turns: chat([...fast, short]) });
  check("a long reply weighs more than a short one (taken together, not one median vote each)", typing.wpm === pooledWpm([...fast, short]) && typing.wpm >= 55, String(typing.wpm));
}
{
  const slowReplies = [typedReply(R1, 400, 120), typedReply(R2, 400, 100), typedReply(R3, 400, 95)];
  const slow = chat(slowReplies);
  const typing = buildTypingResult({ turns: slow, bar: typingBarFrom({ typing: { min_wpm: 40, max_median_reply_seconds: 90 } }) });
  check("30 WPM is below a 40 bar; replies in 100 s are over a 90 s bar", typing.wpm === pooledWpm(slowReplies) && typing.wpm === 30 && typing.medianReplySeconds === 100, String(typing.wpm));
  check("below names both, and meetsBar is false", typing.below.join(",") === "speed,reply_time" && typing.meetsBar === false);
  check("no typo list from the grader: typosPer100Words is null, never 0", typing.typosPer100Words === null);
  const bar = typingBarFrom({ typing: { min_wpm: 25, max_median_reply_seconds: 120 } });
  const relaxed = buildTypingResult({ turns: slow, bar });
  check("the step's own bar is used (25 WPM, 120 s): meets it", relaxed.meetsBar === true && relaxed.bar.minWpm === 25 && relaxed.bar.maxMedianReplySeconds === 120);
  check("a bar that is not a sensible number falls back to the default", typingBarFrom({ typing: { min_wpm: "fast", max_median_reply_seconds: -4 } }).minWpm === 40 && typingBarFrom({ typing: { min_wpm: "fast", max_median_reply_seconds: -4 } }).maxMedianReplySeconds === 90);
}
{
  const turns = chat([typedReply(R1, 200, 30), typedReply("ok one moment", 100, 5), typedReply(R2, 200, 30), typedReply(R3, 200, 30)]);
  const rows = replyTypingRows(turns);
  check(`a reply under ${TYPING_MIN_REPLY_CHARS} characters is not timed for speed`, rows[1].timed === false && rows[1].wpm === null);
  check("…but its reply time still counts (the server timed it)", rows[1].replySeconds === 5);
  const typing = buildTypingResult({ turns });
  const sixty = pooledWpm([typedReply(R1, 200, 30), typedReply(R2, 200, 30), typedReply(R3, 200, 30)]);
  check("the other three are timed (60 WPM a key, 61 with the first key's gap not timed)", typing.repliesTimed === 3 && typing.wpm === sixty && sixty === 61, String(typing.wpm));
}
{
  const turns = chat([typedReply(R1, 200, 30), typedReply(R2, 200, 30)]);
  const typing = buildTypingResult({ turns });
  check(`fewer than ${TYPING_MIN_TIMED_REPLIES} timed replies: no WPM, no corrections, no reply-time median`, typing.wpm === null && typing.correctionsPct === null && typing.medianReplySeconds === null && typing.repliesTimed === 2);
  check("…and that is never a fail: meetsBar is null, below is empty", typing.meetsBar === null && typing.below.length === 0);
  check("…and it says why: too few long replies", typing.notTimed === "too_short");
}
/** A reply where `typed` was typed and the rest arrived at once. */
function pastedReply(typed, arrived, replyAfterS = 6) {
  const meter = createTypingMeter();
  const box = { value: "" };
  typeInto(meter, box, typed, { msPerKey: 200 });
  box.value += arrived;
  return { text: box.value, replyAfterS, typing: meter.take(box.value) };
}
{
  const pasted = pastedReply("Hi, ", "this whole sentence arrived at once without typing.");
  const turns = chat([typedReply(R1, 200, 30), pasted, typedReply(R2, 200, 30), typedReply(R3, 200, 30)]);
  const typing = buildTypingResult({ turns });
  check("a paste-like reply is counted and never timed", typing.pasteLike === 1 && typing.repliesTimed === 3 && typing.wpm === 61);
  const mostlyPasted = buildTypingResult({
    turns: chat([pastedReply("Hi, ", "this whole sentence arrived at once without typing."), pastedReply("So ", "and so did this one, which nobody typed either."), typedReply(R1, 200, 30), pastedReply("Ok ", "a third line that came in one piece, not typed.")]),
  });
  check("replies that arrived without typing are why no speed was timed (said, so it is never read as 'too short')", mostlyPasted.wpm === null && mostlyPasted.pasteLike === 3 && mostlyPasted.repliesTimed === 1 && mostlyPasted.notTimed === "arrived_without_typing", JSON.stringify(mostlyPasted));
}
{
  // The summary is checked against the reply the server stored.
  const honest = typedReply(R2, 200, 30);
  const moreCharsThanKeys = { ...honest, typing: { ...honest.typing, charsTyped: honest.typing.keys + 1 } };
  const rows = replyTypingRows(chat([moreCharsThanKeys]));
  check("more characters typed than keys pressed: paste-like, not timed (the meter credits one a key)", rows[0].pasteLike === true && rows[0].timed === false);
  const short = typedReply("Thanks, one moment.", 200, 30);
  const longerThanTyped = { ...short, text: short.text + " ".padEnd(TYPING_UNTYPED_ALLOWANCE + 2, "z") };
  const fits = { ...short, text: short.text + "z".repeat(TYPING_UNTYPED_ALLOWANCE) };
  const [over, within] = replyTypingRows(chat([longerThanTyped, fits]));
  check(`a stored reply longer than what was typed by more than ${TYPING_UNTYPED_ALLOWANCE}: paste-like`, over.pasteLike === true && over.timed === false, JSON.stringify(over));
  check(`…by ${TYPING_UNTYPED_ALLOWANCE} or fewer it still counts`, within.pasteLike === false && within.timed === true, JSON.stringify(within));
}
{
  // Nothing the page claims as a total is read: an extra wpm on a reply, or numbers out of range.
  const forged = { charsTyped: 60, activeMs: 12000, corrections: 2, keys: 64, pasteLike: false, wpm: 140, correctionsPct: 0, medianReplySeconds: 1 };
  const clean = cleanReplyTyping(forged);
  check("a reply's summary keeps only its five measures (a page's own wpm is dropped)", JSON.stringify(Object.keys(clean)) === JSON.stringify(["charsTyped", "activeMs", "corrections", "keys", "pasteLike"]));
  check("not an object, or a measure missing or negative: no typing for that reply (never 0)", cleanReplyTyping(null) === null && cleanReplyTyping("fast") === null && cleanReplyTyping({ charsTyped: 10, activeMs: 100, keys: 10 }) === null && cleanReplyTyping({ charsTyped: -1, activeMs: 1, corrections: 0, keys: 1 }) === null);
  check("corrections can never exceed keys; pasteLike is only a real true", cleanReplyTyping({ charsTyped: 5, activeMs: 900, corrections: 50, keys: 9, pasteLike: "yes" }).corrections === 9 && cleanReplyTyping({ charsTyped: 5, activeMs: 900, corrections: 0, keys: 9, pasteLike: "yes" }).pasteLike === false);
  const absurd = { text: R2, replyAfterS: 30, typing: { charsTyped: 63, activeMs: 500, corrections: 0, keys: 63, pasteLike: false } };
  const turns = chat([typedReply(R1, 200, 30), absurd, typedReply(R3, 200, 30), typedReply(R4, 200, 30)]);
  const typing = buildTypingResult({ turns });
  check("a reply faster than anyone types (1,512 WPM) is not timed and counts as paste-like", typing.pasteLike === 1 && typing.repliesTimed === 3 && typing.wpm === 61, JSON.stringify(typing));
  const noDetail = chat([{ text: R1, replyAfterS: 30 }, { text: R2, replyAfterS: 40 }, { text: R3, replyAfterS: 50 }]);
  const old = buildTypingResult({ turns: noDetail });
  check("replies from a page that sent no summary: speed not timed, reply time still measured by the server", old.wpm === null && old.repliesTimed === 0 && old.medianReplySeconds === 40);
  check("…and it says the page did not time them (an older page), not that they were too short", old.notTimed === "not_sent");
}
{
  // Reply time is the server's: what the page says it sent (client_at) is never read.
  const turns = chat([typedReply(R1, 200, 30), typedReply(R2, 200, 60), typedReply(R3, 200, 90)]);
  turns.forEach((t) => {
    if (t.kind === "candidate_turn") t.client_at = "2026-10-06T15:00:01Z";
  });
  check("the median reply time comes from created_at only (60 s)", buildTypingResult({ turns }).medianReplySeconds === 60);
  // Two of the applicant's messages in a row: the second answers no player message.
  const doubled = chat([typedReply(R1, 200, 30), typedReply(R2, 200, 30), typedReply(R3, 200, 30)]);
  doubled.splice(2, 1); // the player's answer to the first reply never came
  const rows = replyTypingRows(doubled);
  check("a reply right after the applicant's own message has no reply time", rows[1].replySeconds === null && rows[0].replySeconds === 30 && rows[2].replySeconds === 30, JSON.stringify(rows.map((r) => r.replySeconds)));
  const submitted = chat([typedReply(R1, 200, 30)]).map((t) => ({ ...t, detail: { ...t.detail, source: "submitted_transcript" } }));
  check("a transcript a previous-build page sent at submit is not timed (its times are the submit's)", replyTypingRows(submitted)[0].replySeconds === null);
}

// ============================================================================
console.log("\nThe page wires the meter without a re-render per key:\n");
{
  const page = readFileSync(path.join(ROOT, "src/pages/ChatSimulationPhase.tsx"), "utf8");
  check("one meter for the page's life (useState initialiser, not state per key)", /const \[typingMeter\] = useState\(\(\) => createTypingMeter\(\)\);/.test(page));
  const keydown = page.slice(page.indexOf("const handleTextareaKeyDown"), page.indexOf("const streamCustomerReply"));
  check("every keydown on the reply box feeds it, before Enter sends", keydown.indexOf("typingMeter.keydown(e.key, at, e.currentTarget.value, {") > 0 && keydown.indexOf("typingMeter.keydown(") < keydown.indexOf("sendMessage()"));
  check("…except the Enter that sends (the re-read before it is not typing)", /const sends = e\.key === "Enter" && !e\.shiftKey && state === "chatting";\s*if \(!sends\) \{/.test(keydown));
  check("…with the flags that keep held keys, scripts and shortcuts out", keydown.includes("repeat: e.repeat,") && keydown.includes("trusted: e.nativeEvent.isTrusted,") && keydown.includes("shortcut: e.metaKey || (e.ctrlKey && !e.altKey),"));
  check("the keydown handler sets no state", !/set[A-Z]\w*\(/.test(keydown));
  const send = page.slice(page.indexOf("const sendMessage = async"), page.indexOf("// A reload (or another device) resumes"));
  check("each reply takes its own summary and sends it with the message", send.includes("const typing = typingMeter.take(inputValue);") && /typing,\n\s*\}\);/.test(send));
  check("the request body carries it as `typing`", page.includes("typing: opts.typing,"));
  check("a message put back in the box takes its keystrokes back", page.includes("typingMeter.giveBack(opts.typing,"));
  check("the rules card says typing is noted", page.includes("<TestRulesCard accepted={rulesAccepted} onAcceptedChange={setRulesAccepted} typingNoted />"));
  const card = readFileSync(path.join(ROOT, "src/components/candidate/TestRulesCard.tsx"), "utf8");
  check("…in the doc's words", card.includes("We also note how quickly and accurately you type your replies."));
  check("…and only where the page asks for it (off by default)", card.includes("typingNoted = false") && /\{typingNoted && \(/.test(card));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
