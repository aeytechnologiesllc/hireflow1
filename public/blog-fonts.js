// The guides' font, loaded without holding the first paint (the Phase 7
// growth audit, round 2: a plain stylesheet link kept every guide blank until
// Google Fonts answered). A script file, not an onload="" attribute: the
// guides run no inline script or handler (the Content-Security-Policy;
// scripts/build_blog.test.mjs). <noscript> in the page covers no JavaScript.
(function () {
  var link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap";
  document.head.appendChild(link);
})();
