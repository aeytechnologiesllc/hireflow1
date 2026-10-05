#!/usr/bin/env node
/**
 * One anti-cheat hook for every test, recording each thing once, with how
 * long the applicant was away, live to the server.
 *
 * Until wave 2 (2026-10-06) six pages carried six copies of this, and the
 * owner's own run showed what that cost: a tab switch logged twice in the chat
 * practice (window blur AND visibilitychange), a paste counted twice in the
 * typing test (the textarea and its container both handled it), no away time
 * anywhere (three "Window lost focus" flags that could not be judged), a
 * PrintScreen check listening for a keydown Windows never sends, and a record
 * that lived in browser memory until the final send — so nothing reached the
 * hiring team, and a closed tab lost it.
 *
 * These checks run the real createIntegrityMonitor from
 * src/hooks/useTestIntegrity.ts (bundled with esbuild; only the Supabase
 * client and the toast library are stubbed) against fake events, fake timers
 * and a fake server, and prove that:
 *
 *   - a Ctrl+V and the paste event it produces are ONE attempt, and both are
 *     blocked; a paste after a blocked one is not counted again;
 *   - a tab switch (hidden + blur, then visible + focus) is ONE `tab_hidden`
 *     episode whose client_at is when they left and whose duration is how
 *     long they were gone; focus leaving a visible page is `window_blur`;
 *     a blip under 1 s is kept but marked short and not counted, and a
 *     1.2 s switch is counted and told — the same 1,000 ms threshold as the
 *     database, the server and the staff record;
 *   - PrintScreen on keyup is recorded (once with its keydown), and Meta+Shift
 *     followed by focus leaving a page that stays visible is a suspected
 *     screenshot, while a Meta+Shift tab switch is not;
 *   - Ctrl/Cmd+P and S are blocked and recorded, Ctrl/Cmd+A and Enter are
 *     untouched (the written interview keeps select-all and Enter-to-send);
 *   - text that arrives without typing is recorded as bulk_insert;
 *   - the application form guards its answer fields only, takes a paste in the
 *     email/phone fields (data-allow-paste), and never counts a file picker;
 *   - nothing is blocked or recorded while the test is not running;
 *   - events go to the server in one batch about a second later, survive a
 *     failed send (outbox, retried with backoff, kept in storage across a
 *     reload), stop quietly on the contract's stop codes, drop on HF004 and
 *     22P05, and never carry a U+0000 (Postgres refuses it in jsonb);
 *   - closing the page records page_closed, closes an open away episode and
 *     sends everything with a keepalive request; leaving the test page in the
 *     app records it too;
 *   - the old-shape `violations` list (for servers on the previous build)
 *     survives a reload and is cleared when the step is sent.
 *
 * Plus source checks that the six pages use the hook and no longer carry
 * their own copies.
 *
 * Run with: node scripts/test_integrity.test.mjs
 */

import path from "node:path";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const STUBS = {
  "@/integrations/supabase/client":
    'export const supabase = { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({}) } };\n' +
    'export const SUPABASE_URL = "https://example.supabase.co";\nexport const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";\n',
  sonner: "export const toast = { warning() {}, info() {}, error() {}, success() {} };",
};

const bundle = await build({
  stdin: {
    contents: 'export * from "./src/hooks/useTestIntegrity.ts";\n',
    resolveDir: ROOT,
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "silent",
  plugins: [
    {
      name: "stub-aliases",
      setup(b) {
        b.onResolve({ filter: /^(@\/|sonner$)/ }, (args) => {
          if (args.path in STUBS) return { path: args.path, namespace: "stub" };
          if (args.path === "@/hooks/useAssessmentSession") {
            return { path: path.join(ROOT, "src/hooks/useAssessmentSession.ts") };
          }
          throw new Error(`no stub for ${args.path}`);
        });
        b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: STUBS[args.path], loader: "js" }));
      },
    },
  ],
});
const mod = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const { createIntegrityMonitor, integrityToastFor, toLegacyViolation, formatAway, SHORT_AWAY_MS } = mod;

let failures = 0;
function check(name, condition, detail) {
  if (condition) console.log(`  ok    ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`);
  }
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

/* ------------------------------------------------------------- fixtures */

function harness({ mode = "test", storage = memoryStorage(), sendResult = () => ({ error: null }) } = {}) {
  let now = 1_000_000;
  let hidden = false;
  let seq = 0;
  const timers = new Map();
  const sent = [];
  const keepalives = [];
  const seen = [];
  const monitor = createIntegrityMonitor({
    applicationId: "app-1",
    stepId: "step_chat",
    mode,
    now: () => now,
    setTimeout: (fn, ms) => {
      seq += 1;
      timers.set(seq, { fn, at: now + ms });
      return seq;
    },
    clearTimeout: (id) => timers.delete(id),
    isHidden: () => hidden,
    send: async (events) => {
      sent.push(events.map((e) => ({ ...e })));
      return sendResult(events);
    },
    keepalive: (events) => keepalives.push(events.map((e) => ({ ...e }))),
    storage,
    newId: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
    onEvent: (event) => seen.push(event),
  });
  return {
    monitor,
    h: monitor.handle,
    sent,
    keepalives,
    seen,
    storage,
    advance(ms) {
      now += ms;
    },
    setHidden(value) {
      hidden = value;
    },
    get now() {
      return now;
    },
    /** Runs every timer due by now (and any they schedule that are due). */
    async runDue() {
      for (let guard = 0; guard < 20; guard += 1) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at);
        if (due.length === 0) break;
        for (const [id, t] of due) {
          timers.delete(id);
          t.fn();
        }
        await settle();
      }
      await settle();
    },
    timerDelays() {
      return [...timers.values()].map((t) => t.at - now);
    },
  };
}

function memoryStorage() {
  const map = new Map();
  return {
    map,
    get: (k) => (map.has(k) ? map.get(k) : null),
    set: (k, v) => map.set(k, v),
    remove: (k) => map.delete(k),
  };
}

function ev(type, props = {}) {
  const e = { type, defaultPrevented: false, ...props };
  e.preventDefault = () => {
    e.defaultPrevented = true;
  };
  return e;
}

const textarea = (value = "") => ({ tagName: "TEXTAREA", value, closest: () => null });
const input = (type = "text", value = "", allowed = false) => ({
  tagName: "INPUT",
  type,
  value,
  closest: (sel) => (allowed && sel.includes("data-allow-paste") ? {} : null),
});
const body = { tagName: "BODY", closest: () => null };

const kinds = (list) => list.map((e) => e.kind);

/* --------------------------------------------------- clipboard: once each */

console.log("\nCopy, cut and paste are blocked and counted once:\n");
{
  const t = harness();
  t.monitor.setActive(true);
  const key = ev("keydown", { key: "v", code: "KeyV", ctrlKey: true, target: textarea() });
  t.h.keydown(key);
  const paste = ev("paste", { target: textarea() });
  t.h.paste(paste);
  const before = ev("beforeinput", { inputType: "insertFromPaste", target: textarea() });
  t.h.beforeinput(before);
  check("Ctrl+V keydown is blocked", key.defaultPrevented);
  check("the paste event it produces is blocked too", paste.defaultPrevented);
  check("a beforeinput paste is blocked", before.defaultPrevented);
  check("…and the three are ONE paste attempt", JSON.stringify(kinds(t.seen)) === '["paste"]', kinds(t.seen));
  t.advance(1_500);
  t.h.paste(ev("paste", { target: textarea() }));
  check("a later paste is a second attempt", kinds(t.seen).filter((k) => k === "paste").length === 2);
  const copy = ev("copy", { target: body });
  t.h.copy(copy);
  t.h.cut(ev("cut", { target: textarea() }));
  check("copy anywhere on a test page is blocked and recorded", copy.defaultPrevented && kinds(t.seen).includes("copy"));
  check("cut is recorded as cut", kinds(t.seen).includes("cut"));
  check("old-shape list: paste_attempt ×2, copy_attempt, cut_attempt", JSON.stringify(t.monitor.snapshot().violations.map((v) => v.type)) === '["paste_attempt","paste_attempt","copy_attempt","cut_attempt"]', t.monitor.snapshot().violations);
}

console.log("\nShortcuts: print and save blocked, select-all and Enter untouched:\n");
{
  const t = harness();
  t.monitor.setActive(true);
  const print = ev("keydown", { key: "p", code: "KeyP", metaKey: true, target: body });
  t.h.keydown(print);
  const selectAll = ev("keydown", { key: "a", code: "KeyA", ctrlKey: true, target: textarea("draft") });
  t.h.keydown(selectAll);
  const enter = ev("keydown", { key: "Enter", code: "Enter", target: textarea("hello") });
  t.h.keydown(enter);
  const shiftEnter = ev("keydown", { key: "Enter", code: "Enter", shiftKey: true, target: textarea("hello") });
  t.h.keydown(shiftEnter);
  check("Cmd+P is blocked", print.defaultPrevented);
  check("…and recorded as a blocked shortcut", t.seen[0]?.kind === "other" && t.seen[0]?.detail?.key === "Cmd+P", t.seen[0]);
  check("Ctrl+A (select-all) is not blocked", !selectAll.defaultPrevented);
  check("Enter (send) is not blocked", !enter.defaultPrevented && !shiftEnter.defaultPrevented);
  check("only the print attempt was recorded", t.seen.length === 1, kinds(t.seen));
  const f12 = ev("keydown", { key: "F12", code: "F12", target: body });
  t.h.keydown(f12);
  check("F12 is recorded as developer tools", t.seen[1]?.kind === "devtools");
}

/* --------------------------------------------------------- away episodes */

console.log("\nLeaving the test is ONE episode, with how long they were away:\n");
{
  const t = harness();
  t.monitor.setActive(true);
  const left = t.now;
  t.setHidden(true);
  t.h.visibilitychange(ev("visibilitychange"));
  t.h.blur(ev("blur"));
  check("while away, the snapshot says away (the Paused overlay)", t.monitor.snapshot().away === true);
  t.advance(67_000);
  t.setHidden(false);
  t.h.visibilitychange(ev("visibilitychange"));
  t.h.focus(ev("focus"));
  check("a tab switch (hidden + blur, visible + focus) is one event", t.seen.length === 1, kinds(t.seen));
  const episode = t.seen[0];
  check("…of kind tab_hidden", episode?.kind === "tab_hidden");
  check("…stamped with when they LEFT", episode?.client_at === new Date(left).toISOString(), episode?.client_at);
  check("…lasting 67 s", episode?.duration_ms === 67_000, episode?.duration_ms);
  check("…not marked short", !episode?.detail?.short);
  check("back: no longer away", t.monitor.snapshot().away === false);
  check("old shape: one tab_switch saying how long", t.monitor.snapshot().violations[0]?.details === "Left the test for 1m 7s (another tab or app)", t.monitor.snapshot().violations[0]);
  check("counted once on the strip", t.monitor.snapshot().flagged === 1 && t.monitor.snapshot().awayCount === 1);

  t.h.blur(ev("blur"));
  t.advance(4_000);
  t.h.focus(ev("focus"));
  check("focus leaving a page that stays visible is window_blur", t.seen[1]?.kind === "window_blur" && t.seen[1]?.duration_ms === 4_000, t.seen[1]);

  t.h.blur(ev("blur"));
  t.advance(SHORT_AWAY_MS - 300);
  t.h.focus(ev("focus"));
  const blip = t.seen[2];
  check("a blip under 1 s is still recorded", blip?.kind === "window_blur");
  check("…marked short, low severity", blip?.detail?.short === true && blip?.detail?.severity === "low", blip?.detail);
  check("…and not counted on the strip or in the old list", t.monitor.snapshot().flagged === 2 && t.monitor.snapshot().violations.length === 2);

  // A blur, then the page is hidden too (minimised): still one episode, a tab_hidden.
  t.h.blur(ev("blur"));
  t.advance(1_000);
  t.setHidden(true);
  t.h.visibilitychange(ev("visibilitychange"));
  t.advance(9_000);
  t.setHidden(false);
  t.h.visibilitychange(ev("visibilitychange"));
  t.h.focus(ev("focus"));
  check("blur then hidden is ONE tab_hidden of the whole time", t.seen.length === 4 && t.seen[3].kind === "tab_hidden" && t.seen[3].duration_ms === 10_000, t.seen.slice(3));
}

console.log("\nOne short-away threshold everywhere (1,000 ms):\n");
{
  check("SHORT_AWAY_MS is 1,000 ms, the database's c_short_ms", SHORT_AWAY_MS === 1_000);
  const migration = await readFile(path.join(ROOT, "supabase/migrations/20261005230146_assessment_record.sql"), "utf8");
  check("…which is what the migration says", /c_short_ms\s+constant integer := 1000;/.test(migration));
  const staff = await readFile(path.join(ROOT, "src/cockpit/lib/assessmentRecord.ts"), "utf8");
  check("…and what the staff record says", /export const SHORT_AWAY_MS = 1000;/.test(staff));

  // A 1.2 s switch (a password manager, a notification) reaches the owner's
  // card on the server; the applicant is told about it too.
  const t = harness();
  t.monitor.setActive(true);
  t.h.blur(ev("blur"));
  t.advance(1_200);
  t.h.focus(ev("focus"));
  const episode = t.seen[0];
  check("a 1.2 s switch is not marked short", episode?.kind === "window_blur" && !episode?.detail?.short, episode);
  check("…it is counted on the strip and in the old list", t.monitor.snapshot().flagged === 1 && t.monitor.snapshot().violations.length === 1);
  check("…and the applicant is told", integrityToastFor(episode, "test")?.title === "You left the test for 1s");
  t.h.blur(ev("blur"));
  t.advance(999);
  t.h.focus(ev("focus"));
  check("999 ms is short (as on the server: duration_ms < 1000)", t.seen[1]?.detail?.short === true && t.monitor.snapshot().flagged === 1, t.seen[1]);
}

console.log("\nScreenshots: what a page can see, recorded once:\n");
{
  const t = harness();
  t.monitor.setActive(true);
  t.h.keydown(ev("keydown", { key: "PrintScreen", code: "PrintScreen", target: body }));
  t.h.keyup(ev("keyup", { key: "PrintScreen", code: "PrintScreen", target: body }));
  check("PrintScreen keydown + keyup is one screenshot_key", kinds(t.seen).join() === "screenshot_key", kinds(t.seen));
  t.advance(5_000);
  t.h.keyup(ev("keyup", { key: "PrintScreen", code: "PrintScreen", target: body }));
  check("PrintScreen on keyup alone (what Windows sends) is recorded", kinds(t.seen).join() === "screenshot_key,screenshot_key");

  // Meta+Shift, then a snipping overlay takes focus; the page stays visible.
  t.advance(5_000);
  t.h.keydown(ev("keydown", { key: "Shift", code: "ShiftLeft", metaKey: true, shiftKey: true, target: body }));
  t.advance(400);
  t.h.blur(ev("blur"));
  t.advance(400);
  await t.runDue();
  check("Meta+Shift then focus leaving a visible page is a suspected screenshot", kinds(t.seen).includes("screenshot_suspected"), kinds(t.seen));
  t.advance(2_000);
  t.h.focus(ev("focus"));

  const u = harness();
  u.monitor.setActive(true);
  u.h.keydown(ev("keydown", { key: "[", code: "BracketLeft", metaKey: true, shiftKey: true, target: body }));
  u.advance(100);
  u.h.blur(ev("blur"));
  u.setHidden(true);
  u.h.visibilitychange(ev("visibilitychange"));
  u.advance(400);
  await u.runDue();
  check("Meta+Shift that switches tabs (page hidden) is not a screenshot", !kinds(u.seen).includes("screenshot_suspected"), kinds(u.seen));
}

console.log("\nText that arrives without typing:\n");
{
  const t = harness();
  t.monitor.setActive(true);
  const area = textarea("");
  t.h.focusin(ev("focusin", { target: area }));
  area.value = "H";
  t.h.input(ev("input", { inputType: "insertText", data: "H", target: area }));
  check("one typed character is nothing", t.seen.length === 0);
  const chip = "I have five years of customer support experience";
  area.value = "H" + chip;
  t.h.input(ev("input", { inputType: "insertText", data: chip, target: area }));
  check("a phone keyboard's clipboard chip (insertText, 48 chars) is bulk_insert", t.seen[0]?.kind === "bulk_insert" && t.seen[0]?.detail?.chars === chip.length, t.seen[0]);
  const drop = ev("drop", { target: area });
  t.h.drop(drop);
  check("a drop is blocked and recorded as bulk_insert via drop", drop.defaultPrevented && t.seen[1]?.detail?.via === "drop");
  const dropBefore = ev("beforeinput", { inputType: "insertFromDrop", target: area });
  t.h.beforeinput(dropBefore);
  check("…and its beforeinput is the same drop, not a second", dropBefore.defaultPrevented && t.seen.length === 2, kinds(t.seen));
}

console.log("\nNothing happens while the test is not running:\n");
{
  const t = harness();
  const paste = ev("paste", { target: textarea() });
  t.h.paste(paste);
  t.h.contextmenu(ev("contextmenu", { target: body }));
  t.setHidden(true);
  t.h.visibilitychange(ev("visibilitychange"));
  t.setHidden(false);
  t.h.visibilitychange(ev("visibilitychange"));
  check("inactive: paste not blocked", !paste.defaultPrevented);
  check("inactive: nothing recorded", t.seen.length === 0);
}

/* -------------------------------------------------------------- the form */

console.log("\nThe application form keeps its own rules:\n");
{
  const t = harness({ mode: "form" });
  t.monitor.setActive(true);
  const phonePaste = ev("paste", { target: input("tel", "", true) });
  t.h.paste(phonePaste);
  const phoneKey = ev("keydown", { key: "v", code: "KeyV", metaKey: true, target: input("tel", "", true) });
  t.h.keydown(phoneKey);
  const emailPaste = ev("paste", { target: input("email", "", true) });
  t.h.paste(emailPaste);
  check("the phone field takes a paste (keydown and event)", !phonePaste.defaultPrevented && !phoneKey.defaultPrevented);
  check("the email field takes a paste", !emailPaste.defaultPrevented);
  check("…and neither is recorded", t.seen.length === 0, kinds(t.seen));
  const answerPaste = ev("paste", { target: textarea() });
  t.h.paste(answerPaste);
  check("an answer field still blocks a paste and records it", answerPaste.defaultPrevented && t.seen[0]?.kind === "paste");
  t.advance(2_000);
  const pageCopy = ev("copy", { target: body });
  t.h.copy(pageCopy);
  check("copying the page's own text (not a field) is allowed on the form", !pageCopy.defaultPrevented && t.seen.length === 1);
  const print = ev("keydown", { key: "p", code: "KeyP", ctrlKey: true, target: body });
  t.h.keydown(print);
  check("the form does not block Ctrl+P", !print.defaultPrevented);
  const nameField = input("text", "");
  nameField.value = "Robin Okafor from the autofill";
  t.h.input(ev("input", { inputType: "insertReplacementText", data: null, target: nameField }));
  check("browser autofill in an input is not bulk text on the form", t.seen.length === 1, kinds(t.seen));
  // A file picker takes focus without leaving the page.
  t.h.blur(ev("blur"));
  t.advance(12_000);
  t.h.focus(ev("focus"));
  check("a file picker's focus loss is on the record as window_blur", t.seen[1]?.kind === "window_blur");
  check("…but is not counted on the form's strip", t.monitor.snapshot().flagged === 1, t.monitor.snapshot());
  check("…and gets no 'you switched tabs' word", integrityToastFor(t.seen[1], "form") === null);
  t.setHidden(true);
  t.h.visibilitychange(ev("visibilitychange"));
  t.advance(30_000);
  t.setHidden(false);
  t.h.visibilitychange(ev("visibilitychange"));
  check("a real tab switch on the form is counted", t.monitor.snapshot().flagged === 2);
  check("…and gets the form's own wording", integrityToastFor(t.seen[2], "form")?.title === "Looks like you switched tabs");
}

/* --------------------------------------------------------------- sending */

console.log("\nEvents go to the server about a second later, in one batch:\n");
{
  const t = harness();
  t.monitor.setActive(true);
  t.h.paste(ev("paste", { target: textarea() }));
  t.advance(1_200);
  t.h.copy(ev("copy", { target: body }));
  check("nothing is sent synchronously", t.sent.length === 0);
  check(
    "…but both are in the stored outbox at once (a tab closing inside that second loses nothing)",
    JSON.parse(t.storage.map.get("hf.integrity.outbox:app-1:step_chat") || "[]").length === 2,
  );
  t.advance(-200);
  await t.runDue();
  check("one batch after ~1 s, with both events", t.sent.length === 1 && t.sent[0].length === 2, t.sent);
  check("each event carries an id, a kind and its client time", t.sent[0].every((e) => e.id && e.kind && e.client_at));
  check("acknowledged events leave the outbox", t.monitor.pending === 0 && !t.storage.map.has("hf.integrity.outbox:app-1:step_chat"));
}
{
  let fail = true;
  const storage = memoryStorage();
  const t = harness({ storage, sendResult: () => (fail ? { error: { message: "TypeError: Failed to fetch" } } : { error: null }) });
  t.monitor.setActive(true);
  t.h.paste(ev("paste", { target: textarea() }));
  t.advance(1_000);
  await t.runDue();
  check("a network failure keeps the event", t.monitor.pending === 1 && t.sent.length === 1);
  check("…in storage, for a reload", JSON.parse(storage.map.get("hf.integrity.outbox:app-1:step_chat") || "[]").length === 1);
  check("…and retries with a backoff", t.timerDelays().some((d) => d >= 2_000), t.timerDelays());

  // The tab closes before the retry; the next page life sends it.
  const next = harness({ storage });
  check("a new page life finds the unsent event", next.monitor.pending === 1);
  next.advance(1_000);
  await next.runDue();
  check("…and sends it with its original id", next.sent[0]?.[0]?.id === t.sent[0][0].id, next.sent);
  fail = false;
}
{
  const t = harness({ sendResult: () => ({ error: { code: "PGRST202", message: "Could not find the function" } }) });
  t.monitor.setActive(true);
  t.h.paste(ev("paste", { target: textarea() }));
  t.advance(1_000);
  await t.runDue();
  t.advance(3_000);
  t.h.paste(ev("paste", { target: textarea() }));
  t.advance(1_000);
  await t.runDue();
  check("a function not deployed yet (PGRST202) stops recording after one try", t.sent.length === 1, t.sent.length);
  check("…and the page is never blocked by it (the paste was still blocked)", t.monitor.pending === 0);
}
{
  // The client can reach production before the migration does: the live send
  // stops, but the old-shape list every submit carries (what the hiring team
  // reads on a server without the record), the strip and the feedback do not.
  const storage = memoryStorage();
  const t = harness({ storage, sendResult: () => ({ error: { code: "PGRST202", message: "Could not find the function" } }) });
  t.monitor.setActive(true);
  const paste = () => {
    const e = ev("paste", { target: textarea() });
    t.h.paste(e);
    return e.defaultPrevented;
  };
  paste();
  t.advance(1_000);
  await t.runDue();
  t.advance(5_000);
  const blocked = paste();
  t.advance(5_000);
  t.h.blur(ev("blur"));
  t.advance(8_000);
  t.h.focus(ev("focus"));
  t.advance(5_000);
  paste();
  t.advance(1_000);
  await t.runDue();
  const snap = t.monitor.snapshot();
  check("after a stop code, later events still reach the old-shape list", snap.violations.length === 4, snap.violations);
  check("…the strip keeps counting", snap.flagged === 4, snap.flagged);
  check("…and the applicant is still told (onEvent for each)", t.seen.length === 4, kinds(t.seen));
  check("…a later paste is still blocked", blocked === true);
  check("…but nothing more is sent, queued or stored in the outbox", t.sent.length === 1 && t.monitor.pending === 0 && !storage.map.has("hf.integrity.outbox:app-1:step_chat"), { sent: t.sent.length, pending: t.monitor.pending });
  check("…and the list survives a reload for the submit", harness({ storage }).monitor.snapshot().violations.length === 4);
}
{
  const many = Array.from({ length: 300 }, (_, i) => ({ id: `id-${i}`, kind: "paste", client_at: "2026-10-06T10:00:00.000Z", detail: { via: "event", note: "x".repeat(200) } }));
  const batch = mod.keepaliveBatch(many);
  check("a keepalive batch stays inside its share of the 64 KB budget", JSON.stringify(batch).length <= mod.KEEPALIVE_EVENT_BYTES && batch.length > 0, JSON.stringify(batch).length);
  check("…oldest first", batch[0].id === "id-0");
}
{
  // Postgres refuses a U+0000 in a jsonb argument before the function runs
  // (22P05): every string and key goes without one, live and by keepalive.
  const t = harness();
  t.monitor.setActive(true);
  const area = textarea("");
  t.h.focusin(ev("focusin", { target: area }));
  const chip = "pasted from a PDF\u0000 with a NUL in it, long enough";
  area.value = chip;
  t.h.input(ev("input", { inputType: "insertText\u0000", data: chip, target: area }));
  t.advance(1_000);
  await t.runDue();
  const live = JSON.stringify(t.sent);
  check("a live batch carries no U+0000", t.sent.length === 1 && !live.includes("\\u0000") && !live.includes("\u0000"), live);
  check("…each NUL becomes U+FFFD, as on the server", t.sent[0][0]?.detail?.input_type === "insertText\uFFFD", t.sent[0][0]?.detail);
  // A second one, still waiting when the tab closes.
  area.value = chip + chip;
  t.advance(2_000);
  t.h.input(ev("input", { inputType: "insertText\u0000", data: chip, target: area }));
  t.h.pagehide(ev("pagehide"));
  const closing = JSON.stringify(t.keepalives);
  check("…and so does the keepalive batch on close", t.keepalives.length === 1 && t.keepalives[0].some((e) => e.kind === "bulk_insert") && !closing.includes("\\u0000") && !closing.includes("\u0000"), closing);
}
{
  // A 22P05 can never succeed on a retry: the batch is dropped, recording goes on.
  let calls = 0;
  const t = harness({ sendResult: () => (++calls === 1 ? { error: { code: "22P05", message: "unsupported Unicode escape sequence" } } : { error: null }) });
  t.monitor.setActive(true);
  t.h.paste(ev("paste", { target: textarea() }));
  t.advance(1_000);
  await t.runDue();
  check("22P05 drops that batch (never retried)", t.monitor.pending === 0 && t.sent.length === 1, { pending: t.monitor.pending, sent: t.sent.length });
  t.advance(3_000);
  t.h.copy(ev("copy", { target: body }));
  t.advance(1_000);
  await t.runDue();
  check("…and recording carries on", t.sent.length === 2 && t.sent[1][0].kind === "copy", t.sent);
}
{
  let calls = 0;
  const t = harness({ sendResult: () => (++calls === 1 ? { error: { code: "HF004", message: "step_finished" } } : { error: null }) });
  t.monitor.setActive(true);
  t.h.paste(ev("paste", { target: textarea() }));
  t.advance(1_000);
  await t.runDue();
  t.advance(3_000);
  t.h.copy(ev("copy", { target: body }));
  t.advance(1_000);
  await t.runDue();
  check("HF004 (the step was sent) drops that batch but keeps recording", t.sent.length === 2 && t.sent[1][0].kind === "copy" && t.monitor.pending === 0, t.sent);
}

console.log("\nClosing the page, and leaving it inside the app:\n");
{
  const t = harness();
  t.monitor.setActive(true);
  t.h.blur(ev("blur"));
  t.advance(5_000);
  t.h.pagehide(ev("pagehide", { persisted: false }));
  check("pagehide mid-test records page_closed", kinds(t.seen).includes("page_closed"));
  check("…closes the open away episode first", t.seen[0]?.kind === "window_blur" && t.seen[0]?.detail?.closed_while_away === true, t.seen[0]);
  check("…and sends everything with a keepalive request", t.keepalives.length === 1 && kinds(t.keepalives[0]).join() === "window_blur,page_closed", t.keepalives);

  const u = harness();
  u.monitor.setActive(true);
  u.monitor.leftPage();
  check("leaving the test page in the app is page_closed via left_test_page", u.seen[0]?.kind === "page_closed" && u.seen[0]?.detail?.via === "left_test_page");
  check("…and stops recording", u.monitor.active === false);

  const w = harness();
  w.monitor.setActive(true);
  w.monitor.setActive(false);
  w.monitor.leftPage();
  w.h.pagehide(ev("pagehide"));
  check("after the test ends, neither leaving nor closing is recorded", w.seen.length === 0, kinds(w.seen));
}
{
  const t = harness();
  t.monitor.setActive(true);
  t.setHidden(true);
  t.h.visibilitychange(ev("visibilitychange"));
  t.advance(20_000);
  t.monitor.setActive(false);
  check("a test that ends while they are away closes the episode at the end", t.seen[0]?.kind === "tab_hidden" && t.seen[0]?.duration_ms === 20_000 && t.seen[0]?.detail?.ended_while_away === true, t.seen[0]);
}

console.log("\nThe old-shape list (for servers on the previous build):\n");
{
  const storage = memoryStorage();
  const t = harness({ storage });
  t.monitor.setActive(true);
  t.h.paste(ev("paste", { target: textarea() }));
  t.h.contextmenu(ev("contextmenu", { target: body }));
  const reload = harness({ storage });
  check("survives a reload (the quiz always kept it)", reload.monitor.snapshot().violations.length === 2, reload.monitor.snapshot().violations);
  check("…and right-click is in the list but not on the strip", reload.monitor.snapshot().flagged === 1);
  reload.monitor.finish();
  check("finish() (the step was sent) clears it", reload.monitor.snapshot().violations.length === 0 && !storage.map.has("hf.integrity.legacy:app-1:step_chat"));
  check("toLegacyViolation drops page_closed", toLegacyViolation({ id: "x", kind: "page_closed", client_at: "t" }) === null);
  check("formatAway: 72 s → 1m 12s, 45 s → 45s", formatAway(72_000) === "1m 12s" && formatAway(45_000) === "45s");
  check("the applicant is told how long they were away", integrityToastFor({ id: "x", kind: "tab_hidden", client_at: "t", duration_ms: 12_000 }, "test")?.title === "You left the test for 12s");
  check("…but not for a blip", integrityToastFor({ id: "x", kind: "window_blur", client_at: "t", duration_ms: 400 }, "test") === null);
}

/* ------------------------------------------------- the pages keep the fix */

console.log("\nThe pages use the one hook:\n");
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");
const PAGES = {
  "src/pages/ApplicationFormPhase.tsx": { timed: false },
  "src/pages/QuizPhase.tsx": { timed: true },
  "src/pages/TypingTestPhase.tsx": { timed: true },
  "src/pages/ChatSimulationPhase.tsx": { timed: true },
  "src/pages/ChatInterviewPhase.tsx": { timed: true },
  "src/pages/SalesSimulationPhase.tsx": { timed: true },
};
for (const [rel, { timed }] of Object.entries(PAGES)) {
  const text = await read(rel);
  const name = rel.split("/").pop();
  check(`${name}: uses useTestIntegrity`, /useTestIntegrity\(\{/.test(text));
  check(`${name}: no copy of its own (AntiCheatViolation, onPaste/onCopy handlers, blur listener)`,
    !/interface AntiCheatViolation/.test(text) && !/onPaste=\{/.test(text) && !/onCopy=\{/.test(text) &&
      !/addEventListener\(\s*["']blur["']/.test(text));
  check(`${name}: sends the old-shape list from the hook`, /integrity\.violations/.test(text) || !timed);
  if (timed) {
    check(`${name}: the rules card gates Start`, /<TestRulesCard accepted=\{rulesAccepted\}/.test(text) && /disabled=\{[^}]*!rulesAccepted/.test(text));
    check(`${name}: stops recording once sent (integrity.finish)`, /integrity\.finish\(\)/.test(text));
  }
}
{
  const form = await read("src/pages/ApplicationFormPhase.tsx");
  check("form: email and phone take a paste (data-allow-paste)", (form.match(/data-allow-paste=""/g) ?? []).length === 2);
  check("form: the hook runs in form mode", /mode: "form"/.test(form));
  const card = await read("src/components/candidate/NextStepCard.tsx");
  check("NextStepCard no longer carries the wave-1 rules line", !/TestRulesNotice/.test(card));
  const interview = await read("src/pages/ChatInterviewPhase.tsx");
  check("written interview: Enter-to-send is still on the textarea", /if \(e\.key === "Enter" && !e\.shiftKey\)/.test(interview));
  for (const rel of ["src/pages/ChatSimulationPhase.tsx", "src/pages/ChatInterviewPhase.tsx", "src/pages/SalesSimulationPhase.tsx"]) {
    const text = await read(rel);
    const name = rel.split("/").pop();
    check(`${name}: a resume reads the server's state first (grading → waiting screen, failed → sent again)`,
      /serverConversationState\((session|record)\.reply, (session|record)\.serverStatus\)/.test(text) && /waitForServerCheck\(/.test(text) && /setResendTriggered\(true\)/.test(text));
    check(`${name}: waits on the server's check with the heartbeat live`, /useServerCheck\(\{/.test(text) && /\|\| serverCheckWaiting/.test(text));
    check(`${name}: Start waits for the resume decision`, /disabled=\{[^}]*!resumeDecided/.test(text));
  }
  const quiz = await read("src/pages/QuizPhase.tsx");
  check("quiz: a skeleton, never the intro, until the resume is decided", /if \(!quizInitialized\) \{/.test(quiz));
  check("quiz: this device's progress is read without waiting for the server", /!session\.settled && !readStoredQuizProgress\(QUIZ_STORAGE_KEY\)/.test(quiz));
  const typing = await read("src/pages/TypingTestPhase.tsx");
  check("typing: snapshots while typing, and not a run-ending complete on a back/forward-cache pagehide",
    /action: "snapshot"/.test(typing) && /if \(event\.persisted\) \{\s*sendSnapshot\(true\);\s*return;/.test(typing));
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
