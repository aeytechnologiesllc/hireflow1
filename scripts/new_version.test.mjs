#!/usr/bin/env node
/**
 * A tab left open moves to the newest build by itself (src/lib/newVersion.ts,
 * src/hooks/useAutoUpdate.ts; docs/INTERVIEWS.md tells the story).
 *
 * On 2026-10-07 the owner's staff tab had been open since before a fix
 * shipped. Two and a half hours later it set up an interview with the old
 * code, and the invitation email the fix had repaired was not sent. Staff
 * tabs were then made to reload as they changed page. The same evening he
 * sat on one applicant's page while a new set-up screen went live, opened it
 * without changing page, and got the old one: "you also need to make sure
 * that it will force reload ... all the applicants applying, they're not
 * going to see a new version unless you do a hard refresh." These checks
 * prove:
 *  - a newer build is recognised from the front page's own entry script;
 *  - a tab is never reloaded on a guess, and never twice for the same build;
 *  - every tab does it, staff and applicant;
 *  - never on a test step, in a call, while signing in or writing a job;
 *  - never over an open pop-up, a field in use, or something typed on the
 *    page; otherwise on arriving at a page, when out of view, or after the
 *    tab has sat untouched for a while.
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
  check("asks every three minutes while it is in view", V.VERSION_CHECK_MS === 3 * 60_000);
}

console.log("\nPages a reload must never interrupt");
{
  const busy = [
    "/applications/abc/quiz/step-1",
    "/applications/abc/typing-test/s",
    "/applications/abc/chat-simulation/s",
    "/applications/abc/chat-interview/s",
    "/applications/abc/voice-interview/s",
    "/applications/abc/video-intro/s",
    "/applications/abc/connection/s",
    "/applications/abc/application/s",
    "/applications/abc/portfolio/s",
    "/applications/abc/sales-simulation/s",
    "/applications/abc/interview-room",
    "/interviews/xyz/room",
    "/jobs/create",
    "/jobs/create-legacy",
    "/jobs/edit/123",
    "/auth",
    "/auth/callback",
    "/oauth/google/callback",
    "/join-team/CODE",
    "/candidate/auth",
    "/candidate/apply",
    "/candidate/apply/role-1/form",
    "/candidate/continue",
  ];
  const free = ["/", "/applications", "/applications/abc", "/applicants", "/applicants/abc", "/interviews", "/dashboard", "/jobs", "/messages", "/profile", "/settings", "/my-documents", "/notifications", "/candidate", "/customer-support-chat-agent", "/authors", "/jobs/created-by-me"];
  for (const p of busy) if (!V.isBusyPath(p)) check(`busy: ${p}`, false);
  for (const p of free) if (V.isBusyPath(p)) check(`not busy: ${p}`, false);
  check("every test step, both interview rooms, signing in, the short forms and writing a job", busy.every((p) => V.isBusyPath(p)));
  check("the lists, an application's own page, an applicant's page and the public pages are not", free.every((p) => !V.isBusyPath(p)));
  check("nothing, or not a path: not busy (and never reloaded on that account alone)", V.isBusyPath(null) === false && V.isBusyPath(undefined) === false && V.isBusyPath("") === false);

  // Every route in the app that sits below an application's own page is a
  // step or a call: a new one added there is busy without anyone remembering.
  const app = await read("src/App.tsx");
  const routes = [...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
  const below = routes.filter((r) => /^\/applications\/:[A-Za-z]+\/./.test(r));
  check("every route below an application's page is treated as busy", below.length >= 11 && below.every((r) => V.isBusyPath(r.replace(/:[A-Za-z]+/g, "x"))), below.filter((r) => !V.isBusyPath(r.replace(/:[A-Za-z]+/g, "x"))).join());
  check("…and so is the team's interview room", routes.includes("/interviews/:id/room") && V.isBusyPath("/interviews/x/room"));
}

console.log("\nIs this a moment a reload throws nothing away?");
{
  const quiet = { justArrived: false, visible: true, idleMs: 0, dialogOpen: false, typedHere: false, fieldFocused: false };
  const safe = (path, over = {}) => V.safeToReloadNow(path, { ...quiet, ...over });
  check("in view and just used: no", safe("/applicants/abc") === false);
  check("in view and left untouched for 45 seconds: yes", V.IDLE_BEFORE_RELOAD_MS === 45_000 && safe("/applicants/abc", { idleMs: 45_000 }) === true && safe("/applicants/abc", { idleMs: 44_999 }) === false);
  check("out of view: yes, at once", safe("/applications/abc", { visible: false }) === true);
  check("on arriving at a page: yes, at once", safe("/interviews", { justArrived: true }) === true);
  check("a pop-up open: no, however long it has sat", safe("/applicants/abc", { dialogOpen: true, idleMs: 3_600_000 }) === false && safe("/applicants/abc", { dialogOpen: true, visible: false }) === false);
  check("something typed on this page: no", safe("/messages", { typedHere: true, idleMs: 3_600_000 }) === false && safe("/messages", { typedHere: true, visible: false }) === false);
  check("the cursor in a field: no", safe("/applicants", { fieldFocused: true, idleMs: 3_600_000 }) === false);
  // The one that matters most: an applicant in the middle of a test.
  check("a test step: never, whatever else is true", ["/applications/abc/quiz/s", "/applications/abc/typing-test/s", "/applications/abc/chat-interview/s", "/applications/abc/voice-interview/s"].every((p) => safe(p, { idleMs: 3_600_000 }) === false && safe(p, { visible: false }) === false && safe(p, { justArrived: true }) === false));
  check("a call: never", safe("/applications/abc/interview-room", { visible: false, idleMs: 3_600_000, justArrived: true }) === false && safe("/interviews/x/room", { visible: false, justArrived: true }) === false);
  check("signing in, and writing a job: never", safe("/candidate/auth", { justArrived: true }) === false && safe("/jobs/create", { idleMs: 3_600_000, visible: false }) === false);
  check("an applicant waiting on their application's own page, tab in the background: yes", safe("/applications/abc", { visible: false }) === true);
}

console.log("\nThe wiring");
{
  const hook = await read("src/hooks/useAutoUpdate.ts");
  const layout = await read("src/components/AppLayout.tsx");
  const app = await read("src/App.tsx");
  check("every tab: it sits at the root of the app, inside the router, for staff and applicants alike", /function AutoUpdate\(\) \{\s*useAutoUpdate\(\);\s*return null;\s*\}/.test(app) && /<BrowserRouter>\s*<PageViewTracker \/>\s*<AutoUpdate \/>/.test(app) && !/useStaffAutoUpdate|useAutoUpdate/.test(layout));
  check("never on the dev server", (hook.match(/import\.meta\.env\.DEV/g) ?? []).length === 2);
  check("the front page is asked for afresh, never from a cache", /fetch\(`\/\?fresh=\$\{Date\.now\(\)\}`, \{ cache: "no-store", headers: \{ Accept: "text\/html" \} \}\)/.test(hook));
  check("…on arrival, on a timer, and when the tab is looked at again, and only while it is in view", /void ask\(\);\s*const asking = window\.setInterval\(ask, VERSION_CHECK_MS\);/.test(hook) && /document\.addEventListener\("visibilitychange", onVisible\);/.test(hook) && /if \(document\.visibilityState !== "visible"\) return;/.test(hook));
  check("a failed ask changes nothing", /\} catch \{\s*\/\/ Offline, or the site is mid-deploy: ask again later\.\s*\}/.test(hook));
  check("there is one place a reload happens, and it goes through the one rule", (hook.match(/window\.location\.reload\(\)/g) ?? []).length === 1 && /const safe = safeToReloadNow\(window\.location\.pathname, \{/.test(hook) && /if \(!safe\) return;/.test(hook));
  check("…never twice for one build, and remembered before it reloads", /if \(!shouldReloadFor\(runningEntry\(\), live\.current, reloadedFor\)\) return;/.test(hook) && hook.indexOf("window.sessionStorage.setItem(RELOADED_FOR") < hook.indexOf("window.location.reload()"));
  check("…and with no way to remember, it does not risk a loop", (hook.match(/\} catch \{[^}]*return;\s*\}/g) ?? []).length === 2);
  check("the rule is told what is really on the page: a pop-up, a field in use, typing, how long untouched", /dialogOpen: !!document\.querySelector\('\[role="dialog"\], \[role="alertdialog"\]'\)/.test(hook) && /fieldFocused: inAField\(document\.activeElement\)/.test(hook) && /typedHere: typedHere\.current/.test(hook) && /idleMs: Date\.now\(\) - lastTouched\.current/.test(hook));
  check("typing, choosing and uploading all count as 'typed here'", /window\.addEventListener\("input", typed, \{ capture: true, passive: true \}\);\s*window\.addEventListener\("change", typed, \{ capture: true, passive: true \}\);/.test(hook));
  check("a new page starts clean, and arriving counts only when the page left was not a busy one", /typedHere\.current = false;\s*if \(from !== location\.pathname\) reloadIfSafe\(!isBusyPath\(from\)\);/.test(hook));
  check("once a newer build is known it keeps looking for a safe moment", /window\.setInterval\(\(\) => reloadIfSafe\(false\), LOOK_FOR_A_MOMENT_MS\)/.test(hook));
  check("it sends nothing about the person: the address carries only the time", !/\b(user|userId|email|token|session)\b/.test(hook.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/sessionStorage/g, "")));
  const built = await read("index.html");
  check("the page this is built from has one module entry for the build to stamp", (built.match(/<script type="module" src="\/src\/main\.tsx"><\/script>/g) ?? []).length === 1);
  const doc = await read("docs/INTERVIEWS.md");
  check("the story is written down and names this test", doc.includes("scripts/new_version.test.mjs") && doc.includes("useAutoUpdate"));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
