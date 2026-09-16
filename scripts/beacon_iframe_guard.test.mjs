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

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
