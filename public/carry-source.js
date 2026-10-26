/**
 * carry-source.js — the front page passes on where its visitor came from
 * (2026-10-25; docs/LAUNCH-PLAN.md, Phase 2, task 3).
 *
 * Adds the campaign tags of the address that brought the visitor
 * (utm_source, utm_medium, utm_campaign; they replace a page's own, so a
 * guide's sign-up button keeps a YouTube visitor's tags) and the bare host of
 * the site they came from (as `ref`) to every sign-up and sign-in link to the staff site,
 * so the account that gets made can say how its owner arrived
 * (src/lib/signupSource.ts stores it as signup_source). On the links onward
 * through the site it also passes on whether the front page has already
 * counted the visitor (seen=1), so a later "Post a job free" is not a second
 * visit; that one never goes to a sign-up link.
 *
 * Same privacy rules as beacon.js: no cookie, no storage, no id, only short
 * plain values, and nothing at all under Do Not Track / Global Privacy
 * Control. Vanilla JS, no build step.
 */
(function () {
  "use strict";
  try {
    var dnt = navigator.doNotTrack || window.doNotTrack;
    if (dnt === "1" || dnt === "yes" || navigator.globalPrivacyControl === true) return;
    var plain = /^[a-z0-9._-]{1,60}$/;
    // The same tidy value beacon.js counts: lower case, anything else a dash
    // ("Spring Sale" is "spring-sale", never dropped; the Phase 7 growth review).
    var tidy = function (v) {
      return String(v || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    };
    var params = new URLSearchParams(window.location.search);
    var keep = {};
    // The tags only, never a "Post a job free" link's mark (hiring_link=1,
    // src/lib/hiringLink.ts): carried on, every later page would count as
    // another hiring-link click (the sixth growth review).
    ["utm_source", "utm_medium", "utm_campaign"].forEach(function (key) {
      var v = tidy(params.get(key));
      if (plain.test(v)) keep[key] = v;
    });
    var ref = "";
    try {
      ref = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : "";
    } catch (e) {
      ref = "";
    }
    if (ref && ref !== window.location.hostname && ref.indexOf("hireflownow.com") === -1 && plain.test(ref)) keep.ref = ref;
    // A site the visitor came from, carried here from the page before (below):
    // the referrer on this page is HireFlow's own.
    var carriedRef = tidy(params.get("ref"));
    if (!keep.ref && carriedRef && carriedRef.indexOf("hireflownow.com") === -1 && plain.test(carriedRef)) keep.ref = carriedRef;
    // The front page has counted this visitor (seen=1; src/lib/hiringLink.ts
    // SEEN_MARK): a fact passed on to the next page, so a "Post a job free"
    // later in the visit is not counted again however many pages sit between
    // (the ninth growth review: read off the referrer, which names only the
    // page just before, front page → Guides → Open jobs counted one YouTube
    // visitor twice, and a campaign-tagged one on every loop). It holds when:
    //   - this is the front page and beacon.js (loaded first) counted its view:
    //     an arrival from outside, or a "Post a job free" landing (if a blocker
    //     kept beacon.js from loading, the same test: an arrival from outside;
    //     nothing is counted then, but the sign-up keeps the visitor's own
    //     channel rather than a later link's name);
    //   - the page before passed it on (believed only from one of HireFlow's
    //     own pages: an address copied with it and opened elsewhere is a new
    //     visitor);
    //   - this is the front page, reached from the staff sign-up's
    //     "← hireflownow.com": the fact never goes to a sign-up page (no
    //     account keeps anything but the four tags), so the visitor is taken
    //     as counted, as Admin → Growth already leaves that arrival out of the
    //     front page (20261025520000).
    // A visitor who reached the front page from a guide, or from Open jobs,
    // without it was not counted there, and their first "Post a job free" is.
    var fromInside = !!ref && (ref === window.location.hostname || /(^|\.)hireflownow\.com$/.test(ref));
    var front = window.location.pathname === "/";
    var counted = window.__hfBeacon ? window.__hfBeacon.counted === true : !fromInside;
    var seen = (params.get("seen") === "1" && fromInside) || (front && (counted || ref === "staff.hireflownow.com"));
    if (!Object.keys(keep).length && !seen) return;
    var broughtTags = Object.keys(keep).some(function (key) { return key !== "ref"; });
    // Never the fact: the sign-up links get the three tags and ref only.
    var links = Object.keys(keep).length ? document.querySelectorAll('a[href*="staff.hireflownow.com/auth"]') : [];
    Array.prototype.forEach.call(links, function (a) {
      var url = new URL(a.href);
      // The visitor's own campaign tags say how they reached the site: when
      // they brought any, they replace the page's whole set, so a YouTube
      // visit never reads "medium: bar" (the fifth Phase 6 review). A link's
      // own ref stays.
      if (broughtTags) ["utm_source", "utm_medium", "utm_campaign"].forEach(function (key) { url.searchParams.delete(key); });
      // No tags but another site sent them (Quora, a search): that site is
      // the source, and the page's own campaign says which button (the third
      // growth review: "blog" hid where they came from).
      else if (keep.ref) {
        url.searchParams.set("utm_source", keep.ref);
        url.searchParams.set("utm_medium", "referral");
      }
      Object.keys(keep).forEach(function (key) {
        if (key !== "ref" || !url.searchParams.has(key)) url.searchParams.set(key, keep[key]);
      });
      a.href = url.toString();
    });
    // …and onward through the site: the guides, the open jobs and the front
    // page (the logo) carry the visitor's tags, or the site they came from, to
    // the next page, whose own sign-up links then get them (front page →
    // Guides → a guide → sign-up used to read "blog"; the logo dropped them:
    // the third growth review). The front page's count rides along too, and
    // to a careers page or a job (the ninth growth review).
    var inside = document.querySelectorAll('a[href="/"], a[href^="/?"], a[href^="/blog"], a[href^="/open-jobs"], a[href^="/careers"], a[href^="/c/"], a[href*="://hireflownow.com/blog"], a[href*="://hireflownow.com/open-jobs"], a[href*="://hireflownow.com/careers"], a[href*="://hireflownow.com/c/"]');
    Array.prototype.forEach.call(inside, function (a) {
      var url = new URL(a.href, window.location.href);
      if (url.hostname !== window.location.hostname && url.hostname !== "hireflownow.com") return;
      if (broughtTags) {
        ["utm_source", "utm_medium", "utm_campaign"].forEach(function (key) {
          if (keep[key]) url.searchParams.set(key, keep[key]);
        });
      } else if (keep.ref) {
        url.searchParams.set("ref", keep.ref);
      }
      if (seen) url.searchParams.set("seen", "1");
      a.href = url.toString();
    });
  } catch (e) {
    // Never let this break the page.
  }
})();
