/**
 * carry-source.js — the front page passes on where its visitor came from
 * (2026-10-25; docs/LAUNCH-PLAN.md, Phase 2, task 3).
 *
 * Adds the campaign tags of the address that brought the visitor
 * (utm_source, utm_medium, utm_campaign; they replace a page's own, so a
 * guide's sign-up button keeps a YouTube visitor's tags) and the bare host of
 * the site they came from (as `ref`) to every sign-up and sign-in link to the staff site,
 * so the account that gets made can say how its owner arrived
 * (src/lib/signupSource.ts stores it as signup_source).
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
    if (!Object.keys(keep).length) return;
    var broughtTags = Object.keys(keep).some(function (key) { return key !== "ref"; });
    var links = document.querySelectorAll('a[href*="staff.hireflownow.com/auth"]');
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
    // the third growth review).
    var inside = document.querySelectorAll('a[href="/"], a[href^="/?"], a[href^="/blog"], a[href^="/open-jobs"], a[href*="://hireflownow.com/blog"], a[href*="://hireflownow.com/open-jobs"]');
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
      a.href = url.toString();
    });
  } catch (e) {
    // Never let this break the page.
  }
})();
