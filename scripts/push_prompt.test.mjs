#!/usr/bin/env node
/**
 * Phone notifications: the screens (2026-10-21; docs/PUSH-NOTIFICATIONS.md).
 *
 *   A. The first-time card's memory (src/cockpit/push/pushPromptState.ts):
 *      once per person per device; "Not now" hides it 7 days and a second one
 *      for good; answered is answered; where it may appear.
 *   B. The service worker (public/hireflow-sw.js) run for real in a stand-in
 *      worker scope: a push shows a notification with the icon, badge, tag and
 *      link; a tap focuses the open window and takes it to the page ON ITS OWN
 *      origin (the staff host stays on the staff host); otherwise opens one.
 *   C. Where it is wired and what it says: both shells mount the card; Settings
 *      has the row and no longer the bare "Test Push Notification"; main.tsx
 *      removes every other service worker but keeps this one; the words are
 *      the owner's, and an applicant never reads "AI" or "Ava" in them.
 *
 * Run with: node scripts/push_prompt.test.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
function check(label, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
const read = (p) => readFile(path.join(ROOT, p), "utf8");
const P = await import(pathToFileURL(path.join(ROOT, "src/cockpit/push/pushPromptState.ts")).href);

/* ------------------------------------------------- A. the card's memory */
console.log("-- the first-time card remembers --");
const store = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, String(v)), data };
};
const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 21, 12);
const s = store();
check("a new person has answered nothing, so it may be offered", P.canOffer(P.readMemory(s, "u1"), now));
let m = P.afterNotNow(P.readMemory(s, "u1"), now);
check("'Not now' hides it for 7 days", !P.canOffer(m, now + 6 * DAY) && P.canOffer(m, now + 7 * DAY) && m.notNow === 1 && !m.done);
m = P.afterNotNow(m, now + 8 * DAY);
check("a second 'Not now' is for good", m.done && !P.canOffer(m, now + 999 * DAY) && m.notNow === 2);
check("turning on (or the phone's own 'Don't allow', or 'Got it') is answered for good", P.afterAnswered(P.NOTHING_YET).done && !P.canOffer(P.afterAnswered(P.NOTHING_YET), now + 400 * DAY));
P.writeMemory(s, "u1", m);
check("it is kept per person: the same phone, another account, is asked on its own", P.canOffer(P.readMemory(s, "u2"), now) && !P.canOffer(P.readMemory(s, "u1"), now));
check("and read back as written", JSON.stringify(P.readMemory(s, "u1")) === JSON.stringify(m));
for (const junk of ["", "not json", "null", "[]", '{"notNow":"x","hiddenUntil":-5,"done":"yes"}']) {
  s.setItem(P.promptKey("u3"), junk);
  const got = P.readMemory(s, "u3");
  check(`a damaged memory (${JSON.stringify(junk).slice(0, 24)}) is treated as nothing answered`, got.notNow === 0 && got.hiddenUntil === 0 && got.done === false);
}
check("no storage at all (private browsing) never throws", P.canOffer(P.readMemory(null, "u"), now) && (P.writeMemory(null, "u", m), true));
check("a storage that throws never breaks the app", (() => { try { P.writeMemory({ setItem() { throw new Error("full"); } }, "u", m); P.readMemory({ getItem() { throw new Error("denied"); } }, "u"); return true; } catch { return false; } })());

console.log("-- where it may appear --");
for (const ok of ["/dashboard", "/jobs", "/jobs/abc", "/applicants", "/applicants/", "/interviews", "/documents", "/more", "/analytics", "/team-portal", "/help", "/notifications"]) check(`ok on ${ok}`, P.promptPageOk(ok));
for (const no of ["/settings", "/settings/", "/messages", "/messages/abc", "/applicants/123", "/jobs/abc/applicants/123", "/interviews/9", "/jobs/create", "/jobs/abc/edit"]) check(`not on ${no}`, !P.promptPageOk(no));

/* ------------------------------------------------ B. the service worker */
console.log("-- the service worker --");
function loadWorker(origin) {
  const listeners = {};
  const shown = [];
  const calls = { opened: [], focused: 0, navigated: [], closed: 0, skipWaiting: 0, claimed: 0 };
  const self = {
    location: new URL(origin + "/hireflow-sw.js"),
    addEventListener: (type, fn) => (listeners[type] = fn),
    skipWaiting: () => void calls.skipWaiting++,
    registration: { showNotification: (title, options) => (shown.push({ title, options }), Promise.resolve()) },
    clients: {
      claim: () => (calls.claimed++, Promise.resolve()),
      windows: [],
      matchAll() {
        return Promise.resolve(this.windows);
      },
      openWindow: (url) => (calls.opened.push(url), Promise.resolve({})),
    },
  };
  vm.runInNewContext(readFileSyncShim, { self, URL, Promise }, { filename: "hireflow-sw.js" });
  return { self, listeners, shown, calls };
}
const readFileSyncShim = await read("public/hireflow-sw.js");
const wait = (event) => event.__p ?? Promise.resolve();
const eventWith = (extra) => {
  const e = { ...extra, waitUntil(p) { e.__p = p; } };
  return e;
};

{
  const w = loadWorker("https://hireflownow.com");
  const install = eventWith({});
  w.listeners.install(install);
  const activate = eventWith({});
  w.listeners.activate(activate);
  await wait(activate);
  check("install takes over at once (skipWaiting) and activate claims open pages", w.calls.skipWaiting === 1 && w.calls.claimed === 1);
  check("it has no fetch handler and caches nothing", !w.listeners.fetch && !/caches\.|CacheStorage/.test(readFileSyncShim));

  const push = eventWith({ data: { json: () => ({ title: "New applicant", body: "Maria applied", url: "https://hireflownow.com/applicants/abc?tab=1", tag: "n-1" }), text: () => "" } });
  w.listeners.push(push);
  await wait(push);
  const n = w.shown[0];
  check("a push shows one notification with title and body", w.shown.length === 1 && n.title === "New applicant" && n.options.body === "Maria applied");
  check("with the HireFlow icon and badge", n.options.icon === "/icon-192.png?v=6" && n.options.badge === "/favicon-32.png?v=6");
  check("the tag is the notification's id, the link is kept for the tap", n.options.tag === "n-1" && n.options.data.url === "/applicants/abc?tab=1");

  const bare = eventWith({ data: null });
  w.listeners.push(bare);
  await wait(bare);
  check("a push with no data still shows something (the browser demands it)", w.shown.length === 2 && w.shown[1].title === "HireFlow");
  const text = eventWith({ data: { json: () => { throw new Error("not json"); }, text: () => "hello" } });
  w.listeners.push(text);
  await wait(text);
  check("a push that is not JSON shows its text", w.shown[2].options.body === "hello" && w.shown[2].title === "HireFlow");
  const evil = eventWith({ data: { json: () => ({ title: "x", url: "javascript:alert(1)" }), text: () => "" } });
  w.listeners.push(evil);
  await wait(evil);
  check("a link that is not a web address opens the front door instead", w.shown[3].options.data.url === "/");

  // A tap with a window already open on the site: focus it, send it to the page.
  const win = {
    url: "https://hireflownow.com/dashboard",
    focus() { w.calls.focused++; return Promise.resolve(win); },
    navigate(u) { w.calls.navigated.push(u); return Promise.resolve(win); },
  };
  const other = { url: "https://elsewhere.example/", focus() { throw new Error("must not touch another site's window"); }, navigate() { throw new Error("no"); } };
  w.self.clients.windows = [other, win];
  const click = eventWith({ notification: { close() { w.calls.closed++; }, data: { url: "/applicants/abc?tab=1" } } });
  w.listeners.notificationclick(click);
  await wait(click);
  check("a tap closes the notification and focuses the open HireFlow window", w.calls.closed === 1 && w.calls.focused >= 1);
  check("and takes it to the page", w.calls.navigated[0] === "https://hireflownow.com/applicants/abc?tab=1" && w.calls.opened.length === 0, JSON.stringify(w.calls));

  w.self.clients.windows = [];
  const cold = eventWith({ notification: { close() {}, data: { url: "/messages" } } });
  w.listeners.notificationclick(cold);
  await wait(cold);
  check("with no window open, a tap opens one", w.calls.opened[0] === "https://hireflownow.com/messages");
  const nothing = eventWith({ notification: { close() {}, data: null } });
  w.listeners.notificationclick(nothing);
  await wait(nothing);
  check("a notification with no link opens the app's front door", w.calls.opened[1] === "https://hireflownow.com/");

  w.self.clients.windows = [{ url: "https://hireflownow.com/x", focus: () => Promise.resolve(null), navigate: () => Promise.reject(new Error("not controlled")) }];
  const refused = eventWith({ notification: { close() {}, data: { url: "/jobs" } } });
  w.listeners.notificationclick(refused);
  await wait(refused);
  check("a window that refuses to be navigated is replaced by a new one", w.calls.opened[2] === "https://hireflownow.com/jobs");
}
{
  // The staff app is its own host: the server's link names hireflownow.com, the tap stays on staff.
  const w = loadWorker("https://staff.hireflownow.com");
  const push = eventWith({ data: { json: () => ({ title: "t", body: "b", url: "https://hireflownow.com/applicants/abc" }) } });
  w.listeners.push(push);
  await wait(push);
  check("on the staff host the pushed link becomes a staff-host path", w.shown[0].options.data.url === "/applicants/abc");
  const cold = eventWith({ notification: { close() {}, data: w.shown[0].options.data } });
  w.listeners.notificationclick(cold);
  await wait(cold);
  check("and a tap opens staff.hireflownow.com, never the applicants' host", w.calls.opened[0] === "https://staff.hireflownow.com/applicants/abc", w.calls.opened[0]);
}

/* -------------------------------------------- C. wired, and the words */
console.log("-- wired in, and the words --");
const [app, team, settings, main, device, prompt, lib, hook, auth, config, manifest] = await Promise.all([
  read("src/components/AppLayout.tsx"),
  read("src/components/layouts/TeamMemberLayout.tsx"),
  read("src/pages/Settings.tsx"),
  read("src/main.tsx"),
  read("src/components/settings/DeviceNotifications.tsx"),
  read("src/cockpit/push/PushPrompt.tsx"),
  read("src/lib/webPush.ts"),
  read("src/hooks/useWebPush.ts"),
  read("src/hooks/useAuth.tsx"),
  read("supabase/config.toml"),
  read("public/site.webmanifest"),
]);
check("the owner's shell mounts the card and the sign-in re-save", /<PushPrompt \/>/.test(app) && /useWebPushSync\(\)/.test(app));
check("the team member's shell mounts the card", /<PushPrompt \/>/.test(team));
check("Settings has the row for the hiring side and for applicants", (settings.match(/<DeviceNotifications audience=/g) ?? []).length === 2);
check("the bare 'Test Push Notification' row is gone", !/Test Push Notification/.test(settings));
check("signing out from Settings takes this device off the account first", /removeThisDeviceBeforeSignOut\(\);\s*await supabase\.auth\.signOut\(\)/.test(settings) && /removeThisDeviceBeforeSignOut\(\);\s*await supabase\.auth\.signOut\(\)/.test(auth));
check("main.tsx sets up the one worker after the page has loaded, and still removes any other", /setUpServiceWorkers/.test(main) && /readyState === "complete"/.test(main) && /isNotificationsWorker\(script\) \? undefined : registration\.unregister\(\)/.test(lib));
check("it registers /hireflow-sw.js at the root scope, only where push exists", /register\(NOTIFICATIONS_WORKER, \{ scope: "\/" \}\)/.test(lib) && /"PushManager" in window/.test(lib) && /NOTIFICATIONS_WORKER = "\/hireflow-sw\.js"/.test(lib));
check("turning on asks for permission before anything is awaited (iPhone needs it inside the tap)", /export async function turnOnWebPush[\s\S]*?const permission = await Notification\.requestPermission\(\)/.test(lib) && !/export async function turnOnWebPush[\s\S]*?await [^N][\s\S]*?Notification\.requestPermission\(\)/.test(lib.slice(lib.indexOf("export async function turnOnWebPush"), lib.indexOf("const permission = await Notification.requestPermission()") + 60).replace(/^[\s\S]*?quickStatus\(\);/, "")));
check("it subscribes visibly (userVisibleOnly) with our key and saves through the function", /userVisibleOnly: true, applicationServerKey/.test(lib) && /save_web_push_subscription/.test(lib));
check("iPhone and iPad outside the Home Screen are 'needs-home-screen', checked before the push test", lib.indexOf('"needs-home-screen"') < lib.indexOf('return "unsupported"') && /isAppleTouchDevice\(\) && !isInstalledApp\(\)/.test(lib));
check("the Natively wrapper keeps its own path", /turnOnNativeNotifications/.test(hook) && /insideNativeApp\(\)/.test(hook));
check("push-public-key is configured like the other browser-called functions", /\[functions\.push-public-key\][^[]*verify_jwt = true/.test(config));

const said = (re) => re.test(prompt);
check("card title is the owner's", said(/Know the moment someone applies/));
check("card body is the owner's", said(/Turn on notifications and HireFlow tells you when someone applies, finishes their tests or replies\./));
check("the iPhone card says to add it to the Home Screen first, with only 'Got it'", said(/On iPhone, add HireFlow to your Home Screen first: tap Share, then Add to Home Screen, then open HireFlow from there\./) && said(/Got it/));
check("buttons: 'Turn on notifications' and 'Not now'", said(/Turn on notifications\n/) && said(/Not now/));
check("after turning on, a toast and nothing else (no test push is sent)", /toast\.success\("Notifications are on"\)/.test(prompt) && !/sendTest/.test(prompt));
check("the card never opens over another dialog, the first steps or a tip", /\[role="dialog"\]:not\(\[data-push-prompt\]\), \[role="alertdialog"\], \[data-first-steps\], \[data-first-hire\], \[data-guided-tip\]/.test(prompt));
check("Settings words: On, Off, Blocked, Home Screen, browser can't", ["Notifications on this device", "Turn on", "Send a test", "Add HireFlow to your Home Screen first", "This browser can't show notifications", "Turn them on for HireFlow in your phone's Settings."].every((t) => device.includes(t)));
const applicantWords = [device, prompt, await read("supabase/functions/send-test-push/index.ts")].join("\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
check("no 'AI' or 'Ava' in anything an applicant can read here", !/\bAva\b|\bAI\b/.test(applicantWords.replace(/AIza/g, "")));
check("no developer words on the screens (VAPID, endpoint, subscription, service worker)", !/VAPID|endpoint|subscription|service worker|push service/i.test([device, prompt].join("\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")));
check("the manifest still opens from the Home Screen at the root", /"display": "standalone"/.test(manifest) && /"scope": "\/"/.test(manifest));

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
