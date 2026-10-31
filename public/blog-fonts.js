// The guides' fonts, loaded without holding the first paint (the Phase 7
// growth audit, round 2: a plain stylesheet link kept every guide blank until
// Google Fonts answered). A script file, not an onload="" attribute: the
// guides run no inline script or handler (the Content-Security-Policy;
// scripts/build_blog.test.mjs). <noscript> in the page covers no JavaScript.
// The front page's own three faces at its exact address (public/landing.html,
// FONTS_CSS in scripts/build-blog.mjs): Besley, Courier Prime and Schibsted
// Grotesk, so a visitor who came from the front page has them already.
(function () {
  var link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Besley:ital,wght@0,500..800;1,500..600&family=Courier+Prime&family=Schibsted+Grotesk:wght@400..700&display=swap";
  document.head.appendChild(link);
})();
