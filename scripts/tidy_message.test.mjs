#!/usr/bin/env node
/**
 * Messages: tidied when you send (docs/MESSAGES.md, "Tidied when you send";
 * src/cockpit/lib/tidyMessage.ts).
 *
 * The owner, 2026-10-09, with "Hey john, let me know if you have any trouble
 * joining the interview" typed in the box: "can you also make it like
 * autocorrect grammar and spelling mistakes here?"
 *
 * It changes what a person wrote, so most of these checks are about what it
 * must leave alone: a link, an address, a time, a number, an abbreviation, a
 * word in capitals, a sign-off, and above all the words themselves.
 *
 * Run with: node scripts/tidy_message.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");
const T = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/tidyMessage.ts")).href);

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
const code = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const tidy = (text, recipientName = "Gabriel John Santos") => T.tidyMessage(text, { recipientName });
const same = (name, text, recipientName) => check(`left alone: ${name}`, tidy(text, recipientName) === text, JSON.stringify(tidy(text, recipientName)));
const becomes = (name, text, want, recipientName) => check(name, tidy(text, recipientName) === want, JSON.stringify(tidy(text, recipientName)));

console.log("\nWhat it tidies");
{
  becomes("the owner's own example", "Hey john, let me know if you have any trouble joining the interview", "Hey John, let me know if you have any trouble joining the interview.");
  becomes("a capital at the start", "thanks for your message. we will get back to you soon.", "Thanks for your message. We will get back to you soon.");
  becomes("…after a question mark and an exclamation mark", "great! can you join at 4? see you then.", "Great! Can you join at 4? See you then.");
  becomes("…and at the start of each line", "hi gabriel,\nlet me know if that works for you\n\nthanks", "Hi Gabriel,\nLet me know if that works for you.\n\nThanks");
  becomes("'i' on its own, and i'm, i'll, i've, i'd", "i think i'm free then, and i'll check what i've got. i'd say yes", "I think I'm free then, and I'll check what I've got. I'd say yes.");
  becomes("any part of their name typed in lower case", "hello santos, or should I say gabriel john", "Hello Santos, or should I say Gabriel John.");
  becomes("doubled spaces, a space before a comma, none after one", "hello ,  john. thanks for   waiting,see you", "Hello, John. Thanks for waiting, see you.");
  becomes("a sentence left open before an empty line is closed too", "hello john\n\nyour interview is on friday at four\n\nsee you then, and thank you for waiting", "Hello John\n\nYour interview is on friday at four.\n\nSee you then, and thank you for waiting.");
  becomes("a full stop on a sentence left open at the end", "We will let you know by email", "We will let you know by email.");
  becomes("spaces and empty lines at the ends go", "  \n\nhello there how are you  \n\n", "Hello there how are you.");
  becomes("Windows line ends become plain ones", "line one is here now.\r\nline two is here now.", "Line one is here now.\nLine two is here now.");
  becomes("a pile of empty lines is at most two", "First part here.\n\n\n\n\n\nSecond part here.", "First part here.\n\n\nSecond part here.");
}

console.log("\nWhat it leaves exactly as typed");
{
  same("a message that is already right", "Hi John,\n\nThe call is at 4:00 PM Philippine time. See you then.\n\nBest,\nZulu Support Team");
  same("a short sign-off gets no full stop", "Thanks");
  same("…nor a name on the last line", "See you at the interview.\n\nZulu Support Team");
  same("a link at the end", "You can join here: https://hireflownow.com/applications");
  same("a link at the start of a sentence", "Open this. hireflownow.com/apply is the page.");
  same("an email address", "Write to us at support@zulu.example and we will answer.");
  same("a time and a decimal", "We start at 4.30 pm and it takes 0.5 hours at most.");
  same("e.g., i.e. and etc. do not start a sentence", "Bring something to write with, e.g. a notebook, i.e. paper, etc. and a pen.");
  same("an ellipsis trails off", "Let me check... one moment please.");
  same("a word typed in capitals", "The shift is FIXED and it is NOT flexible.");
  same("a word with a capital inside it", "Join from your iPhone or a laptop, not both.", "Gabriel Santos");
  same("a question or exclamation at the end", "Can you join at 4 PM tomorrow?");
  same("a list", "Please send:\n- your ID\n- a clear photo");
  same("a number list", "1. Open the page\n2. Press Join");
  check("left alone: nothing at all", tidy("") === "" && tidy("   \n  ") === "" && T.tidyMessage(undefined) === "" && T.tidyMessage(null) === "");
  becomes("a name that is also a word is not capitalised mid-sentence…", "we will call you in may and hope to see grace there", "We will call you in may and hope to see grace there.", "Grace May Will Hope");
  becomes("…only straight after a greeting", "hi grace, thank you for waiting on us", "Hi Grace, thank you for waiting on us.", "Grace May Will Hope");
  becomes("a name inside another word is not touched", "johnson and johnny are not john", "Johnson and johnny are not John.", "John Smith");
  becomes("a two-letter name part is not chased", "we go to the store on sunday", "We go to the store on sunday.", "Go To Li");
  becomes("their name in an address is not touched", "write to john@example.com or ask John", "Write to john@example.com or ask John.", "John Smith");
  becomes("with no name known it still tidies the rest", "hey john, how are you today", "Hey john, how are you today.", null);
}

console.log("\nIt never changes a word");
{
  const samples = [
    "hey john, let me know if you have any trouble joining the interview",
    "i recieved you're mesage and will get back too you soon",
    "thier is no need to worry ,we will   call you",
    "Hi Gabriel,\n\nyour interview is on friday at 4 pm.\nplease join from a computer\n\nthanks,\nzulu team",
  ];
  const words = (t) => t.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").split(/\s+/).filter(Boolean).join(" ");
  check("every sample has the same words in the same order after tidying (spelling is NOT corrected)", samples.every((s) => words(tidy(s)) === words(s)), samples.map((s) => tidy(s)).join(" | "));
  check("tidying a tidied message changes nothing more", samples.every((s) => tidy(tidy(s)) === tidy(s)));
  check("it never makes a message longer by more than one full stop and a few spaces", samples.every((s) => tidy(s).length <= s.length + 3));
}

console.log("\nThe wiring");
{
  const lib = code(await read("src/cockpit/lib/tidyMessage.ts"));
  check("it is plain code: no imports, no request, no AI", !/^import /m.test(lib) && !/supabase|fetch\(|functions\.invoke|openai/i.test(lib));
  const page = code(await read("src/cockpit/pages/Messages.tsx"));
  check("only the hiring team's messages are tidied, never an applicant's", /const text = isCandidate \? draft\.trim\(\) : tidyMessage\(draft, \{ recipientName: partner\?\.name \}\);/.test(page));
  check("what is sent is the tidied text, and a failed send keeps the words in the box", /await send\(text, contactId, activeApplicationId\);\s*setDraft\(""\);/.test(page) && /I couldn't send that/.test(page));
  check("the box says so, to the hiring team only", /Capital letters and full stops are tidied when you send\./.test(page) && /\{!isCandidate && /.test(page));
  check("the box lets the browser and the phone's keyboard help with spelling", /spellCheck/.test(page) && /autoCorrect="on"/.test(page) && /autoCapitalize="sentences"/.test(page));
  const doc = await read("docs/MESSAGES.md");
  check("docs/MESSAGES.md explains it, says what it does not do, and names this test", doc.includes("## Tidied when you send") && doc.includes("scripts/tidy_message.test.mjs") && /never changes a word/.test(doc));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
