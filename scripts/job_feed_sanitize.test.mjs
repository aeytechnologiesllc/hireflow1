#!/usr/bin/env node
/**
 * The job feeds' HTML cleaner (api/job-feed.mjs sanitizeFeedHtml; the Phase 7
 * security review, round 2): aggregators show a feed's HTML as it is, so
 * nothing a business writes may become markup but the plain tags allowed. A
 * tag that never closes ("<img src=x onerror=…" at the end of a description)
 * used to pass whole, and "5 < 6" ate the text up to the next ">".
 *
 * Run with: node scripts/job_feed_sanitize.test.mjs
 */
const { sanitizeFeedHtml } = await import("../api/job-feed.mjs");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

for (const [input, want] of [
  ["<p>Hello</p><img src=x onerror=alert(1)", "<p>Hello</p>&lt;img src=x onerror=alert(1)"],
  ["5 < 6 and <b>bold</b>", "5 &lt; 6 and <b>bold</b>"],
  ['<a href="javascript:x">x</a>', "<a>x</a>"],
  ['<p onclick="x">y</p>', "<p>y</p>"],
  ['<p>Go <a href="https://x.com">here</a></p>', '<p>Go <a href="https://x.com" rel="noopener noreferrer">here</a></p>'],
  ["<script>alert(1)</script><p>ok</p>", "<p>ok</p>"],
  ["<ul><li>One</li></ul>", "<ul><li>One</li></ul>"],
  // The third security review: a business's own entity-encoded tag stays text.
  ['&lt;a href="javascript:alert(1)" rel="noopener noreferrer">x&lt;/a>', '&lt;a href="javascript:alert(1)" rel="noopener noreferrer">x&lt;/a>'],
  ["&lt;p>&lt;strong>hi&lt;/strong>&lt;/p>", "&lt;p>&lt;strong>hi&lt;/strong>&lt;/p>"],
  ["a\u0000p>b", "ap>b"],
  ['<p>One</p>&lt;img src=x onerror=alert(1)>', '<p>One</p>&lt;img src=x onerror=alert(1)>'],
]) {
  const got = sanitizeFeedHtml(input);
  check(`${JSON.stringify(input)} → ${JSON.stringify(want)}`, got === want, JSON.stringify(got));
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
