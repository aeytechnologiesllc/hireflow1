#!/usr/bin/env node
/**
 * Regression test for public/beacon.js's same-origin-iframe guard.
 *
 * src/pages/Index.tsx renders route "/" as <iframe src="/landing.html">, a
 * separate same-origin browsing context with its own window/document/
 * location. public/landing.html carries the same "<script src=/beacon.js
 * defer>" tag as index.html's outer document. Without a guard, beacon.js's
 * auto-firing IIFE would run in BOTH contexts on a single homepage view —
 * one POST for path "/" (outer) and one for path "/landing.html" (iframe)
 * — double-counting the site's single most-trafficked page.
 *
 * beacon.js is plain browser JS with no build step (see its own header
 * comment: "no dependencies"), so this test loads it with Node's built-in
 * `vm` module against a minimal hand-built window/document/navigator,
 * rather than pulling in a DOM dependency. It exercises the OUTER-document
 * and IFRAME cases exactly as the real page load would.
 *
 * Run with: node scripts/beacon_iframe_guard.test.mjs
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const beaconSource = await readFile(path.join(ROOT, "public", "beacon.js"), "utf8");

/**
 * Evaluates beacon.js in a fresh sandbox that mimics either the outer
 * document (isIframe: false, window.self === window.top) or the landing.html
 * iframe (isIframe: true, window.self !== window.top). Returns how many
 * times fetch() was called (i.e. how many page-view POSTs beacon.js made
 * on its own, on load, with no explicit .track() call from us).
 */
function loadBeaconAndCountAutoFetches({ isIframe, path: locationPath }) {
  let fetchCalls = 0;

  const sandbox = {
    console,
    fetch: () => {
      fetchCalls += 1;
      return Promise.resolve();
    },
    URL,
    URLSearchParams,
    navigator: { userAgent: "test-agent", doNotTrack: null, globalPrivacyControl: false },
    document: { referrer: "", documentElement: { clientWidth: 1024 } },
  };
  sandbox.window = {
    innerWidth: 1024,
    location: { pathname: locationPath, href: `https://hireflownow.com${locationPath}`, search: "" },
    doNotTrack: null,
  };
  // window.self === window.top for the outer document; a distinct object
  // for the iframe, exactly like a real same-origin iframe's globals.
  sandbox.window.self = sandbox.window;
  sandbox.window.top = isIframe ? {} : sandbox.window;

  vm.createContext(sandbox);
  vm.runInContext(beaconSource, sandbox, { filename: "beacon.js" });
  return { fetchCalls, sandbox };
}

console.log("\nbeacon.js same-origin-iframe guard:\n");

{
  const outer = loadBeaconAndCountAutoFetches({ isIframe: false, path: "/" });
  check("outer document (window.self === window.top) auto-fires exactly one page-view POST on load", outer.fetchCalls === 1, `fetchCalls=${outer.fetchCalls}`);
}

{
  const iframe = loadBeaconAndCountAutoFetches({ isIframe: true, path: "/landing.html" });
  check("iframe context (window.self !== window.top) does NOT auto-fire a page-view POST on load", iframe.fetchCalls === 0, `fetchCalls=${iframe.fetchCalls}`);
  check("iframe context still exposes window.__hfBeacon (so an explicit .track() call would still work)", typeof iframe.sandbox.window.__hfBeacon?.track === "function");
}

{
  // The bug this guards against: if the outer document AND the iframe both
  // auto-fire on the same homepage view, that's 2 POSTs for what a real
  // visitor experiences as one view.
  const outer = loadBeaconAndCountAutoFetches({ isIframe: false, path: "/" });
  const iframe = loadBeaconAndCountAutoFetches({ isIframe: true, path: "/landing.html" });
  check("a single homepage view (outer + its landing.html iframe) produces exactly ONE auto-fired page-view POST total, not two", outer.fetchCalls + iframe.fetchCalls === 1, `total=${outer.fetchCalls + iframe.fetchCalls}`);
}

// The fourth growth review: carried tags are not counted again on a move inside the site.
function loadCounter({ search, referrer, host = "hireflownow.com", path: pagePath = "/blog" }) {
  const bodies = [];
  const replaced = [];
  const sandbox = {
    console,
    fetch: (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return Promise.resolve();
    },
    URL,
    URLSearchParams,
    navigator: { userAgent: "test-agent", doNotTrack: null, globalPrivacyControl: false },
    document: { referrer, documentElement: { clientWidth: 1024 } },
  };
  sandbox.window = {
    innerWidth: 1024,
    location: { pathname: pagePath, href: `https://${host}${pagePath}${search}`, search, hostname: host },
    history: { state: { key: "k" }, replaceState: (state, _title, url) => replaced.push({ state, url }) },
    doNotTrack: null,
  };
  sandbox.window.self = sandbox.window;
  sandbox.window.top = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(beaconSource, sandbox, { filename: "beacon.js" });
  return { bodies, replaced, track: (p) => sandbox.window.__hfBeacon.track(p) };
}
function countedFrom(opts) {
  return loadCounter(opts).bodies[0];
}
{
  const landed = countedFrom({ search: "?utm_source=youtube&utm_campaign=v1", referrer: "https://www.youtube.com/watch?v=x" });
  check("a visit that arrives tagged is counted with its tags", landed?.utmSource === "youtube" && landed?.utmCampaign === "v1", JSON.stringify(landed));
  const moved = countedFrom({ search: "?utm_source=youtube&utm_campaign=v1", referrer: "https://hireflownow.com/" });
  check("…the same visit moving on inside the site is not counted as another campaign visit", moved && moved.utmSource === null && moved.utmCampaign === null && moved.referrerHost === "hireflownow.com", JSON.stringify(moved));
  const hiring = countedFrom({ search: "?utm_source=job_page&utm_medium=hiring_link&hiring_link=1", referrer: "https://hireflownow.com/team-lead", path: "/" });
  check("…but a \"Post a job free\" click landing on the front page counts: that click is a new way in (the fifth growth review)", hiring?.utmSource === "job_page" && hiring?.utmMedium === "hiring_link", JSON.stringify(hiring));
}

// The sixth growth review: a hiring link counts once, on landing on the front
// page from another page of the site, the first time, whatever channel the
// visitor brought. The click carries a mark (hiring_link=1) nothing carries on.
{
  for (const [where, path] of [["the logo back to the front page", "/"], ["the guides", "/blog"], ["Open jobs", "/open-jobs"]]) {
    const moved = countedFrom({ search: "?utm_source=job_page&utm_medium=hiring_link", referrer: "https://hireflownow.com/", path });
    check(`a hiring-link visitor moving on with the tags carry-source.js carried is not counted again: ${where}`, moved && moved.utmSource === null && moved.utmMedium === null, JSON.stringify(moved));
  }
  const shareKit = countedFrom({ search: "?utm_source=facebook&utm_medium=job_share&utm_campaign=job_page&hiring_link=1", referrer: "https://hireflownow.com/c/acme/front-desk", path: "/" });
  check("a Share Kit visitor's hiring-link click counts, for their channel", shareKit?.utmSource === "facebook" && shareKit?.utmMedium === "job_share" && shareKit?.utmCampaign === "job_page", JSON.stringify(shareKit));
  const facebook = countedFrom({ search: "?utm_source=www.facebook.com&utm_medium=referral&utm_campaign=job_page&ref=www.facebook.com&hiring_link=1", referrer: "https://hireflownow.com/c/acme/front-desk", path: "/" });
  check("…and a Facebook post's untagged visitor's, for theirs", facebook?.utmSource === "www.facebook.com" && facebook?.utmMedium === "referral" && facebook?.utmCampaign === "job_page", JSON.stringify(facebook));
  const offFront = countedFrom({ search: "?utm_source=job_page&utm_medium=hiring_link&hiring_link=1", referrer: "https://hireflownow.com/team-lead", path: "/blog" });
  check("…the mark counts only on the front page, where every hiring link goes", offFront && offFront.utmSource === null, JSON.stringify(offFront));
  const counted = loadCounter({ search: "?utm_source=job_page&utm_medium=hiring_link&hiring_link=1", referrer: "https://hireflownow.com/team-lead", path: "/" });
  // The ninth growth review: on the front page the mark gives way to the fact
  // it was counted (seen=1), so a reload or Back, from the same page with no
  // mark, still passes it on through carry-source.js.
  check("…and is taken off the address once counted, the tags left and the fact in its place (so a reload counts nothing again, and still knows)", counted.replaced.length === 1 && counted.replaced[0].url === "/?utm_source=job_page&utm_medium=hiring_link&seen=1" && counted.replaced[0].state?.key === "k", JSON.stringify(counted.replaced));
  const offFrontReplaced = loadCounter({ search: "?utm_source=job_page&hiring_link=1", referrer: "https://hireflownow.com/team-lead", path: "/blog" }).replaced;
  check("…off the front page the mark is only taken off (nothing was counted there)", offFrontReplaced.length === 1 && offFrontReplaced[0].url === "/blog?utm_source=job_page", JSON.stringify(offFrontReplaced));
  const reload = countedFrom({ search: "?utm_source=job_page&utm_medium=hiring_link", referrer: "https://hireflownow.com/team-lead", path: "/" });
  check("…a reload of that front page (same referrer, no mark) is not counted again", reload && reload.utmSource === null, JSON.stringify(reload));
  const youtube = countedFrom({ search: "?utm_source=youtube&utm_medium=video", referrer: "https://hireflownow.com/blog", path: "/" });
  check("…and one YouTube visitor is still one campaign visit (the fourth growth review)", youtube && youtube.utmSource === null, JSON.stringify(youtube));
  const pasted = loadCounter({ search: "?utm_source=job_page&utm_medium=hiring_link&hiring_link=1", referrer: "https://web.whatsapp.com/", path: "/" });
  check("a hiring link opened from outside counts as any tagged arrival, and loses the mark too", pasted.bodies[0]?.utmSource === "job_page" && pasted.bodies[0]?.referrerHost === "web.whatsapp.com" && pasted.replaced.length === 1, JSON.stringify(pasted));
  const plain = loadCounter({ search: "?utm_source=youtube", referrer: "", path: "/" });
  check("an address without the mark is left as it is", plain.replaced.length === 0);
  // The staff sign-up's "← hireflownow.com" now carries the visitor's tags
  // back: they were counted when the visitor first arrived.
  const backFromSignUp = countedFrom({ search: "?utm_source=youtube&utm_medium=video", referrer: "https://staff.hireflownow.com/", path: "/" });
  check("a visitor going back from the staff sign-up with their tags is not counted again", backFromSignUp && backFromSignUp.utmSource === null && backFromSignUp.referrerHost === "staff.hireflownow.com", JSON.stringify(backFromSignUp));
}

// The ninth growth review: the counter says whether this load's view counted
// the visitor as arriving (window.__hfBeacon.counted), and the front page's
// carry-source.js passes that on as seen=1. It never counts seen itself.
function loadCounterWindow(opts) {
  const bodies = [];
  const sandbox = {
    console,
    fetch: (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return Promise.resolve();
    },
    URL,
    URLSearchParams,
    navigator: { userAgent: "test-agent", doNotTrack: opts.dnt ?? null, globalPrivacyControl: false },
    document: { referrer: opts.referrer, documentElement: { clientWidth: 1024 } },
  };
  const pagePath = opts.path ?? "/";
  const host = opts.host ?? "hireflownow.com";
  sandbox.window = {
    innerWidth: 1024,
    location: { pathname: pagePath, href: `https://${host}${pagePath}${opts.search ?? ""}`, search: opts.search ?? "", hostname: host },
    history: { state: null, replaceState: () => {} },
    doNotTrack: opts.dnt ?? null,
  };
  sandbox.window.self = sandbox.window;
  sandbox.window.top = opts.iframe ? {} : sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(beaconSource, sandbox, { filename: "beacon.js" });
  return { bodies, beacon: sandbox.window.__hfBeacon };
}
{
  check("an arrival from outside: counted, and the counter says so", loadCounterWindow({ referrer: "https://www.youtube.com/", search: "?utm_source=youtube" }).beacon.counted === true && loadCounterWindow({ referrer: "" }).beacon.counted === true);
  check("…a \"Post a job free\" landing on the front page from inside the site: counted, and says so", loadCounterWindow({ referrer: "https://hireflownow.com/open-jobs", search: "?utm_source=youtube&hiring_link=1" }).beacon.counted === true);
  const moved = loadCounterWindow({ referrer: "https://hireflownow.com/blog", search: "?utm_source=youtube&seen=1" });
  check("…a move inside the site is not, says so, and seen=1 is never counted as a visit", moved.beacon.counted === false && moved.bodies[0]?.utmSource === null && moved.bodies[0]?.referrerHost === "hireflownow.com", JSON.stringify(moved.bodies));
  check("…from the staff sign-up: a move inside too", loadCounterWindow({ referrer: "https://staff.hireflownow.com/", search: "?utm_source=youtube" }).beacon.counted === false);
  check("…Do Not Track: nothing sent and nothing said", (() => { const r = loadCounterWindow({ referrer: "https://www.youtube.com/", dnt: "1" }); return r.bodies.length === 0 && r.beacon.counted !== true; })());
  check("…inside the landing iframe (no view of its own): nothing said", loadCounterWindow({ referrer: "https://www.youtube.com/", iframe: true }).beacon.counted !== true);
}

// The sixth growth review (a low): a move inside the app is the same visit
// moving on, counted as one from another of HireFlow's pages: its own host as
// the referrer, no campaign tags (Open jobs → a job page read "direct").
{
  const app = loadCounter({ search: "?utm_source=youtube&utm_medium=video", referrer: "https://www.youtube.com/", path: "/open-jobs" });
  app.track("/c/acme/front-desk");
  const [first, next] = app.bodies;
  check("the first view keeps where the visitor came from and their tags", first?.referrerHost === "www.youtube.com" && first?.utmSource === "youtube" && first?.utmMedium === "video", JSON.stringify(first));
  check("…a later view in the app names HireFlow's own host, with no tags", next?.path === "/c/acme/front-desk" && next?.referrerHost === "hireflownow.com" && next?.utmSource === null && next?.utmMedium === null && next?.utmCampaign === null, JSON.stringify(next));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
