/**
 * carry-source.js — the front page passes on where its visitor came from
 * (2026-10-25; docs/LAUNCH-PLAN.md, Phase 2, task 3).
 *
 * Adds the campaign tags of the address that brought the visitor
 * (utm_source, utm_medium, utm_campaign) and the bare host of the site they
 * came from (as `ref`) to every sign-up and sign-in link to the staff site,
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
    var params = new URLSearchParams(window.location.search);
    var keep = {};
    ["utm_source", "utm_medium", "utm_campaign"].forEach(function (key) {
      var v = (params.get(key) || "").trim().toLowerCase();
      if (plain.test(v)) keep[key] = v;
    });
    var ref = "";
    try {
      ref = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : "";
    } catch (e) {
      ref = "";
    }
    if (ref && ref !== window.location.hostname && ref.indexOf("hireflownow.com") === -1 && plain.test(ref)) keep.ref = ref;
    if (!Object.keys(keep).length) return;
    var links = document.querySelectorAll('a[href*="staff.hireflownow.com/auth"]');
    Array.prototype.forEach.call(links, function (a) {
      var url = new URL(a.href);
      Object.keys(keep).forEach(function (key) {
        if (!url.searchParams.has(key)) url.searchParams.set(key, keep[key]);
      });
      a.href = url.toString();
    });
  } catch (e) {
    // Never let this break the page.
  }
})();
