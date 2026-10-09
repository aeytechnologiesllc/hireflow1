#!/usr/bin/env node
/**
 * The Messages page's message box and bubbles (docs/MESSAGES.md):
 * src/cockpit/pages/Messages.tsx.
 *
 * The owner, 2026-10-08, after pasting a twelve-line reply and seeing three
 * lines of it: "this doesn't feel good when I paste a message in the chat,
 * wherever my message is being displayed looks kind of small ... make it
 * more modern." These checks pin what was changed:
 *  - the box is as tall as what is in it, up to a share of the window, and
 *    is measured after every change to the words, not only on typing;
 *  - Enter sends, Shift+Enter is a new line, and a failed send keeps the
 *    words;
 *  - the person is told the other side also gets an email;
 *  - bubbles are a size up and keep line breaks;
 *  - the preview can open a thread (its stand-in client reads the thread's
 *    filter), so all of this can be looked at offline.
 *
 * Run with: node scripts/messages_composer.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Decoded, so a checkout whose path has a space in it works too.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");

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
/** Source with its comments taken out: a pin must not pass on a comment. */
const code = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const page = code(await read("src/cockpit/pages/Messages.tsx"));
const css = await read("src/cockpit/cockpit.css");

console.log("\nThe box grows with what is in it");
{
  check("it starts one line tall, and never stops at four lines again", /const COMPOSER_MIN_PX = 26;/.test(page) && !/max-h-24/.test(page) && !/scrollHeight, 96\)/.test(page));
  check("up to about half the window on a computer, under a third on a phone, and a ceiling", /const COMPOSER_MAX_PX = 460;\s*const COMPOSER_SHARE = 0\.46;\s*const COMPOSER_SHARE_PHONE = 0\.3;/.test(page) && /const share = window\.innerWidth < 768 \? COMPOSER_SHARE_PHONE : COMPOSER_SHARE;/.test(page));
  check("it is measured from the words themselves, after every change to them", /useLayoutEffect\(\(\) => \{\s*const box = composerRef\.current;\s*if \(!box\) return;\s*box\.style\.height = "auto";[\s\S]{0,420}box\.style\.height = `\$\{Math\.max\(COMPOSER_MIN_PX, Math\.min\(box\.scrollHeight, most\)\)\}px`;/.test(page) && /\}, \[draft, contactId, partnerShort\]\);/.test(page));
  check("…so typing no longer does its own measuring (a paste, a send and a new thread are covered the same way)", /onChange=\{\(e\) => setDraft\(e\.target\.value\)\}/.test(page) && (page.match(/style\.height = /g) ?? []).length === 2);
  check("past the cap it scrolls inside; under it there is no inner scrollbar", /box\.style\.overflowY = box\.scrollHeight > most \? "auto" : "hidden";/.test(page));
  check("the words are a readable size: 14.5px on a computer, 16px on a phone (an iPhone zooms the page in on a field with smaller text)", /className="ck-scroll block w-full resize-none bg-transparent px-0\.5 text-\[16px\] leading-\[1\.55\] outline-none md:text-\[14\.5px\]"/.test(page));
}

console.log("\nOne box, with Send inside it");
{
  check("the words, the hint and Send share one rounded box", /className="ck-composer rounded-\[18px\] px-3\.5 pb-2\.5 pt-3"/.test(page) && page.indexOf("data-composer-box") < page.indexOf("data-composer-hint") && page.indexOf("data-composer-hint") < page.indexOf("data-composer-send"));
  check("the box lights up as a whole, and the textarea draws no frame of its own", /\.ck-composer:focus-within \{ border-color: var\(--jade\); box-shadow: 0 0 0 3px var\(--jade-soft\); \}/.test(css) && /\.ck-composer textarea:focus,\s*\.ck-composer textarea:focus-visible \{ outline: none; box-shadow: none; \}/.test(css));
  check("clicking the box's own padding puts the cursor in it", /if \(e\.target === e\.currentTarget\) composerRef\.current\?\.focus\(\);/.test(page));
  check("Enter sends, Shift+Enter is a new line", /if \(e\.key === "Enter" && !e\.shiftKey\) \{\s*e\.preventDefault\(\);\s*void handleSend\(\);/.test(page));
  check("…and the hint says so on a computer only", /<span className="max-md:hidden">Enter sends · Shift\+Enter for a new line\. <\/span>/.test(page));
  check("it says the other side is emailed too, without overpromising", /\{partnerShort\} gets an email too, unless they turned those off\./.test(page));
  check("Send waits for words, and a failed send keeps them in the box", /disabled=\{isSending \|\| !draft\.trim\(\)\}/.test(page) && /await send\(text, contactId, activeApplicationId\);\s*setDraft\(""\);\s*\} catch \{\s*toast\.error\("I couldn't send that — your message is still in the box\."\);/.test(page));
}

console.log("\nThe bubbles, and the header");
{
  check("a size up, rounder, and wide enough for a long message", /className="max-w-\[86%\] rounded-\[18px\] px-4 py-3 text-\[14\.5px\] leading-\[1\.55\] sm:max-w-\[72%\]"/.test(page));
  check("line breaks are kept, and a long word wraps instead of pushing the page wide", /<span className="block whitespace-pre-wrap break-words \[overflow-wrap:anywhere\]">\{text\}<\/span>/.test(page));
  check("the header says 'final score', in plain words", /` · final score \$\{sealedScore\}\/100`/.test(page) && !/· sealed \$\{/.test(page));
}

console.log("\nThe preview can open a thread");
{
  const client = await read("src/dev-preview/fixtureClient.ts");
  const hook = await read("src/hooks/useMessages.ts");
  check("the page asks for both directions of a thread in one filter", /\.or\(\s*`and\(sender_id\.eq\.\$\{user!\.id\},receiver_id\.eq\.\$\{contactId\}\),and\(sender_id\.eq\.\$\{contactId\},receiver_id\.eq\.\$\{user!\.id\}\)`/.test(hook));
  check("…and the stand-in client reads that filter (it used to have no such thing, and a thread never loaded)", /or\(filter: string\) \{/.test(client) && /anyOf\.some\(\(group\) => group\.every\(\(c\) => String\(row\[c\.col\] \?\? ""\) === c\.val\)\)/.test(client));
  const doc = await read("docs/MESSAGES.md");
  check("docs/MESSAGES.md explains it and names this test", doc.includes("## The message box") && doc.includes("scripts/messages_composer.test.mjs"));
}

console.log("\nOn a phone (2026-10-09: \"the messaging tab. You can't scroll\")");
{
  // The cause and the rule are in scripts/guards/no-scroll-traps.mjs; these
  // pin the page's own part.
  const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const scrollRule = /(^|\n)\.ck-scroll \{([^}]*)\}/.exec(cssCode)?.[2] ?? "";
  check("a box wearing .ck-scroll does not hold a finger's swipe to itself (the chat is as tall as the conversation there, the page scrolls)", scrollRule.includes("overflow-x: hidden") && !/overscroll-behavior/.test(scrollRule), scrollRule.trim());
  check("only the shell's own scroller and a dialog's body do", /main\.ck-scroll,\s*\[role="dialog"\] \.ck-scroll \{\s*overscroll-behavior-y: contain;\s*\}/.test(cssCode));
  check("after a send, the page follows the end of the chat, so Send does not slide under the tab bar", /sentAt\.current = Date\.now\(\);\s*await send\(text, contactId, activeApplicationId\);/.test(page) && /if \(el\.scrollHeight <= el\.clientHeight \+ 1 && Date\.now\(\) - sentAt\.current < SENT_FOLLOW_MS\) \{\s*const page = pageScroller\(el\);\s*if \(page\) page\.scrollTo\(\{ top: page\.scrollHeight \}\);\s*else window\.scrollTo\(\{ top: document\.documentElement\.scrollHeight \}\);/.test(page));
  check("only after a send: a message arriving while you read further up does not move the page", !/thread\.length[^\n]*scrollIntoView/.test(page) && /const SENT_FOLLOW_MS = 4000;/.test(page));
  check("a chat that gets taller just after it is drawn (the real font arriving, a picture loading) stays on its newest message", /const watch = new ResizeObserver\(\(\) => \{\s*if \(!held && Date\.now\(\) < until\) el\.scrollTop = el\.scrollHeight;\s*\}\);\s*watch\.observe\(inner\);/.test(page) && /const SETTLE_MS = 2500;/.test(page));
  check("…unless the reader has already taken hold of it, and the watching stops with the chat", /el\.addEventListener\("wheel", hold, \{ passive: true \}\);\s*el\.addEventListener\("touchstart", hold, \{ passive: true \}\);/.test(page) && /watch\.disconnect\(\);\s*el\.removeEventListener\("wheel", hold\);/.test(page));
  const preview = await read("src/dev-preview/install.ts");
  check("the preview has a chat taller than a phone screen to try this on (?__previewChats=long)", /if \(seed === "some" \|\| seed === "long"\) \{/.test(preview) && /if \(seed === "long"\) \{/.test(preview));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
