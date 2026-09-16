/**
 * beacon.js — tiny, cookieless page-view counter.
 *
 * Loaded on the marketing page (public/landing.html, <script src="/beacon.js"
 * defer>) and reused by the SPA for route changes (src/hooks/usePageViewTracking.ts
 * calls window.__hfBeacon.track(path) on every client-side navigation, since
 * an SPA route change never fires a fresh page load for this script to
 * re-run on its own).
 *
 * Privacy, by construction, not by policy:
 *   - No cookie, no localStorage, no generated visitor id of any kind —
 *     nothing here is capable of re-identifying the same browser twice.
 *     `sessionUtm` below is an in-memory module variable, gone the moment
 *     the tab is closed or this script is re-evaluated.
 *   - Respects Do Not Track and Global Privacy Control: if either is set,
 *     this file makes zero network requests.
 *   - The referrer sent is a bare HOST (e.g. "google.com"), never the full
 *     referrer URL, which can carry a search query or other page state.
 *   - Sends only: path, referrer host, utm source/medium/campaign, a coarse
 *     device class, computed here client-side as a courtesy default (the
 *     server independently derives/validates its own from the User-Agent
 *     header and prefers that).
 *
 * Vanilla JS, no build step, no dependencies — this file is served as-is
 * from public/, and deliberately kept tiny (this whole file is well under
 * 2KB minified) since it ships on every page view.
 */
(function () {
  "use strict";

  if (typeof window === "undefined" || typeof fetch !== "function") return;

  function isOptedOut() {
    try {
      var dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
      if (dnt === "1" || dnt === "yes") return true;
      if (navigator.globalPrivacyControl === true) return true;
    } catch (e) {
      // If we can't tell, don't track.
      return true;
    }
    return false;
  }

  if (isOptedOut()) {
    window.__hfBeacon = { track: function () {} };
    return;
  }

  var ENDPOINT = "https://yqklrkpptnhubsnijqze.supabase.co/functions/v1/page-views";

  function deviceClass() {
    var w = window.innerWidth || document.documentElement.clientWidth || 1024;
    var ua = (navigator.userAgent || "").toLowerCase();
    if (/ipad|tablet/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))) return "tablet";
    if (w < 640 || /mobi|iphone|ipod/.test(ua) || (/android/.test(ua) && /mobile/.test(ua))) return "mobile";
    if (w < 1024) return "tablet";
    return "desktop";
  }

  function hostOf(url) {
    if (!url) return null;
    try {
      return new URL(url, window.location.href).hostname || null;
    } catch (e) {
      return null;
    }
  }

  // UTM params only exist on the URL that first brought someone in — an SPA
  // route change won't have them on location.search any more. Capture once
  // per page load (in memory only, per the privacy note above) and reuse
  // for every subsequent track() call in this tab.
  var sessionUtm = (function () {
    try {
      var params = new URLSearchParams(window.location.search);
      return {
        source: params.get("utm_source") || null,
        medium: params.get("utm_medium") || null,
        campaign: params.get("utm_campaign") || null,
      };
    } catch (e) {
      return { source: null, medium: null, campaign: null };
    }
  })();

  // The referrer is only meaningful for the very first view in this tab —
  // an in-app route change's "referrer" is just the app's own previous
  // page, which record_page_view doesn't need (the path history is
  // reconstructable from the app's own routes, not from this beacon).
  var initialReferrerHost = hostOf(document.referrer);
  var referrerSent = false;

  function track(path) {
    if (isOptedOut()) return;
    var body = {
      path: path || window.location.pathname,
      referrerHost: referrerSent ? null : initialReferrerHost,
      utmSource: sessionUtm.source,
      utmMedium: sessionUtm.medium,
      utmCampaign: sessionUtm.campaign,
      deviceClass: deviceClass(),
    };
    referrerSent = true;
    try {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {
      // Never let telemetry break the page.
    }
  }

  window.__hfBeacon = { track: track };

  // Skip the automatic initial track() call when this script is running
  // inside an iframe (window.self !== window.top): src/pages/Index.tsx
  // renders the "/" route as <iframe src="/landing.html">, a separate
  // same-origin browsing context with its own window/document/location.
  // public/landing.html carries this same "<script src=/beacon.js defer>"
  // tag, so without this guard a single homepage view would fire this
  // IIFE twice — once for the outer document (path "/") and once for the
  // iframe's own navigated document (path "/landing.html") — double
  // counting the site's single most-trafficked page. The outer document is
  // the one whose URL actually represents "what the visitor is looking
  // at", so only it should auto-report; a script running inside the iframe
  // stays loaded (window.__hfBeacon still gets set, in case anything inside
  // landing.html ever calls .track() explicitly) but does not self-fire.
  try {
    if (window.self !== window.top) return;
  } catch (e) {
    // Cross-origin parent (shouldn't happen for a same-origin iframe on
    // this site) — treat as "can't tell", so don't auto-fire from inside.
    return;
  }

  // Initial page load.
  track(window.location.pathname);
})();
