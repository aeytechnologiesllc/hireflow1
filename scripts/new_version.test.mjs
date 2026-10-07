#!/usr/bin/env node
/**
 * A staff tab left open moves to the newest build (src/lib/newVersion.ts,
 * src/hooks/useStaffAutoUpdate.ts; docs/INTERVIEWS.md tells the story).
 *
 * On 2026-10-07 the owner's staff tab had been open since before a fix
 * shipped. Two and a half hours later it set up an interview with the old
 * code, and the invitation email the fix had repaired was not sent. These
 * checks prove:
 *  - a newer build is recognised from the front page's own entry script;
 *  - a tab is never reloaded on a guess, and never twice for the same build;
 *  - the reload only ever happens as the page changes, never mid-task;
 *  - only staff tabs do it: an applicant may be in the middle of a test.
 *
 * Run with: node scripts/new_version.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const V = await import(pathToFileURL(path.join(ROOT, "src/lib/newVersion.ts")).href);
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

const page = (hash) => `<!doctype html><html><head><script type="module" crossorigin src="/assets/index-${hash}.js"></script><link rel="modulepreload" href="/assets/vendor-react-AbC12.js"></head><body><div id="root"></div></body></html>`;

console.log("\nWhich build is this?");
{
  check("the front page names its entry script", V.entryScript(page("hv83CORD")) === "/assets/index-hv83CORD.js");
  check("hashes with a dash or an underscore are read whole", V.entryScript(page("a_B-9z")) === "/assets/index-a_B-9z.js");
  check("another script on the page is not mistaken for it", V.entryScript('<script type="module" src="/assets/vendor-react-AbC12.js"></script>') === null);
  check("the dev server's page names none", V.entryScript('<script type="module" src="/src/main.tsx"></script>') === null);
  check("an error page, or nothing at all: none", V.entryScript("<h1>502</h1>") === null && V.entryScript("") === null && V.entryScript(null) === null && V.entryScript(undefined) === null && V.entryScript(42) === null);
  check("a running script's own address reads the same", V.entryScriptOfUrl("https://hireflownow.com/assets/index-hv83CORD.js") === "/assets/index-hv83CORD.js" && V.entryScriptOfUrl("/src/main.tsx") === null);
}

console.log("\nIs a newer one live?");
{
  const a = "/assets/index-aaa.js";
  const b = "/assets/index-bbb.js";
  check("a different entry script is a newer build", V.isNewerBuild(a, b) === true);
  check("the same one is not", V.isNewerBuild(a, a) === false);
  check("unknown on either side is 'no': never reloaded on a guess", [[null, b], [a, null], [null, null], ["", b], [a, ""], [undefined, b]].every(([x, y]) => V.isNewerBuild(x, y) === false));
  check("reload for a newer build", V.shouldReloadFor(a, b, null) === true);
  check("…once: if the reload still landed on the old one, the tab is left alone", V.shouldReloadFor(a, b, b) === false);
  check("…and again when a later build goes live", V.shouldReloadFor(b, "/assets/index-ccc.js", b) === true);
  check("never when up to date, whatever was reloaded before", V.shouldReloadFor(b, b, a) === false && V.shouldReloadFor(b, b, null) === false);
  check("asks every five minutes", V.VERSION_CHECK_MS === 5 * 60_000);
}

console.log("\nThe wiring");
{
  const hook = await read("src/hooks/useStaffAutoUpdate.ts");
  const layout = await read("src/components/AppLayout.tsx");
  check("only staff tabs: the owner and team members, once signed in", /useStaffAutoUpdate\(!!user && !loading && \(role === "employer" \|\| isTeamMember\)\);/.test(layout));
  check("never on the dev server", (hook.match(/import\.meta\.env\.DEV/g) ?? []).length === 2);
  check("the front page is asked for afresh, never from a cache", /fetch\(`\/\?fresh=\$\{Date\.now\(\)\}`, \{ cache: "no-store", headers: \{ Accept: "text\/html" \} \}\)/.test(hook));
  check("…on arrival, on a timer, and when the tab is looked at again, and only while it is visible", /void check\(\);\s*const timer = window\.setInterval\(check, VERSION_CHECK_MS\);/.test(hook) && /document\.addEventListener\("visibilitychange", onVisible\);/.test(hook) && /if \(document\.visibilityState !== "visible"\) return;/.test(hook));
  check("a failed ask changes nothing", /\} catch \{\s*\/\/ Offline, or the site is mid-deploy: ask again later\.\s*\}/.test(hook));
  check("the reload happens only as the page changes", /\}, \[enabled, location\.pathname\]\);/.test(hook) && (hook.match(/window\.location\.reload\(\)/g) ?? []).length === 1);
  const move = hook.slice(hook.indexOf("// The page has just changed"));
  check("…decided by the one rule, and remembered before it reloads", /if \(!shouldReloadFor\(runningEntry\(\), live\.current, reloadedFor\)\) return;/.test(move) && move.indexOf('window.sessionStorage.setItem(RELOADED_FOR') < move.indexOf("window.location.reload()"));
  check("…and with no way to remember, it does not risk a loop", (move.match(/\} catch \{[^}]*return;\s*\}/g) ?? []).length === 2);
  check("it sends nothing about the person: the address carries only the time", !/\b(user|userId|email|token|session)\b/.test(hook.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
  const built = await read("index.html");
  check("the page this is built from has one module entry for the build to stamp", (built.match(/<script type="module" src="\/src\/main\.tsx"><\/script>/g) ?? []).length === 1);
  const doc = await read("docs/INTERVIEWS.md");
  check("the story is written down and names this test", doc.includes("scripts/new_version.test.mjs") && doc.includes("useStaffAutoUpdate"));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
