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
 * from public/, and deliberately kept tiny (this whole file is about 2.5KB
 * minified) since it ships on every page view.
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

  // A developer's local server is not a visitor (page-views also drops these
  // server-side by Origin).
  function isLocalHost() {
    var h = (window.location && window.location.hostname) || "";
    return h === "localhost" || /\.localhost$/.test(h) || /^127\./.test(h) || h === "0.0.0.0" || h === "[::1]";
  }

  // Not a visitor either (2026-10-05): a browser driven by test automation
  // (Playwright, Selenium: navigator.webdriver is true) and the hiring team's
  // own staff site. Launch-day counts were mostly our own automated checks.
  function isAutomation() {
    try {
      return navigator.webdriver === true;
    } catch (e) {
      return false;
    }
  }

  function isStaffSite() {
    var h = (window.location && window.location.hostname) || "";
    return h.indexOf("staff.") === 0;
  }

  // On the staff site only the sign-up page is a visitor's page (2026-10-25):
  // counting it gives the funnel from the front page to a new account
  // (docs/ANALYTICS.md). Everything else there is the hiring team at work.
  function isSignUpPage(path) {
    return /^\/auth\/?$/.test(path || "");
  }
  var staffSite = isStaffSite();

  if (isOptedOut() || isLocalHost() || isAutomation() || (staffSite && !isSignUpPage(window.location.pathname))) {
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

  // UTM params only exist on the URL that first brought someone in. Capture
  // them once per page load (in memory only, per the privacy note above) for
  // this load's first view (track() below).
  var sessionUtm = (function () {
    try {
      // A page opened from another of HireFlow's own pages is the same visit
      // moving on: the tags it carries (carry-source.js puts them on the
      // logo, the guides and Open jobs so the sign-up can say where the
      // visitor came from) were counted when they arrived, so they are not
      // counted again (the fourth growth review: one YouTube visitor read as
      // three campaign visits, a Quora one as one).
      var params = new URLSearchParams(window.location.search);
      // …except a "Hiring? Post a job free" click landing on the front page:
      // a new way in, the click the owner counts (the fifth growth review:
      // they stopped counting), whatever channel the visitor brought. Its link
      // carries a mark, hiring_link=1 (src/lib/hiringLink.ts), that nothing
      // carries on and that is taken off the address here, so it counts once:
      // not again on the logo, the guides or Open jobs, nor on a reload (the
      // sixth growth review: keyed on the medium, one click read as four
      // campaign visits, and a Share Kit or Facebook visitor's never counted).
      var marked = params.get("hiring_link") === "1";
      if (params.has("hiring_link")) {
        try {
          var bare = new URL(window.location.href);
          bare.searchParams.delete("hiring_link");
          window.history.replaceState(window.history.state, "", bare.pathname + bare.search + bare.hash);
        } catch (e) {
          // The address keeps it; counting is unchanged.
        }
      }
      var from = hostOf(document.referrer);
      var fromInside = !staffSite && from && (from === window.location.hostname || /(^|\.)hireflownow\.com$/.test(from));
      if (fromInside && !(marked && window.location.pathname === "/")) {
        return { source: null, medium: null, campaign: null };
      }
      // The same tidy value carry-source.js puts on the sign-up link, so a
      // visit and the account it makes say the same source ("YouTube" and
      // "youtube" were two; the Phase 7 growth review).
      var tidy = function (v) {
        var t = String(v || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
        return t || null;
      };
      return {
        source: tidy(params.get("utm_source")),
        medium: tidy(params.get("utm_medium")),
        campaign: tidy(params.get("utm_campaign")),
      };
    } catch (e) {
      return { source: null, medium: null, campaign: null };
    }
  })();

  // The referrer and the tags belong to the very first view in this tab. An
  // in-app route change is the same visit moving on from one of HireFlow's
  // own pages, so it is counted the way a page opened from one is: HireFlow's
  // own host as the referrer and no campaign tags (they were counted when they
  // arrived). It used to send no referrer at all and the load's tags, so Open
  // jobs → a job page read "direct" (the sixth growth review), and a tagged
  // visit counted a campaign visit on every page it opened.
  var initialReferrerHost = hostOf(document.referrer);
  var referrerSent = false;

  function track(path) {
    if (isOptedOut()) return;
    if (staffSite && !isSignUpPage(path || window.location.pathname)) return;
    var first = !referrerSent;
    var body = {
      path: path || window.location.pathname,
      referrerHost: first ? initialReferrerHost : window.location.hostname || null,
      utmSource: first ? sessionUtm.source : null,
      utmMedium: first ? sessionUtm.medium : null,
      utmCampaign: first ? sessionUtm.campaign : null,
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
