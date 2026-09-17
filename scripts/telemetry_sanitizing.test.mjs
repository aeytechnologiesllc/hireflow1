#!/usr/bin/env node
/**
 * Plain-assertion tests for supabase/functions/_shared/telemetry.ts — the
 * pure fingerprinting, payload-sanitizing and bot-filtering helpers shared
 * by the client-errors and page-views edge functions.
 *
 * Imports the .ts file directly (Node's built-in TypeScript type-stripping,
 * same as scripts/step_gate.test.mjs importing src/lib/candidateJourney.ts)
 * — no build step, and this is the exact code Deno runs in production.
 *
 * Run with: node scripts/telemetry_sanitizing.test.mjs
 */
import {
  isBotUserAgent,
  isLocalDevOrigin,
  honorsOptOut,
  classifyBrowserFamily,
  classifyDeviceClass,
  computeFingerprint,
  topStackFrame,
  normalizeRoute,
  sanitizeClientErrorPayload,
  sanitizePageViewPayload,
  MAX_MESSAGE_LEN,
  MAX_STACK_LEN,
  MAX_ROUTE_LEN,
} from "../supabase/functions/_shared/telemetry.ts";

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

// =============================================================================
// Fingerprinting
// =============================================================================
console.log("\nFingerprinting:\n");

{
  const stackV1 = "TypeError: Cannot read properties of undefined (reading 'name')\n  at UserCard (UserCard.tsx:42:18)\n  at renderList (List.tsx:10:3)";
  const stackV2Reformatted = "TypeError: Cannot read properties of undefined (reading 'name')\n  at UserCard (UserCard.tsx:99:4)\n  at renderList (List.tsx:55:9)";
  const fpA = computeFingerprint("Cannot read properties of undefined (reading 'name')", stackV1, "/candidates/123");
  const fpB = computeFingerprint("Cannot read properties of undefined (reading 'name')", stackV2Reformatted, "/candidates/123");
  check("same message+top-frame+route fingerprints identically across line-number shifts (build/release drift)", fpA === fpB, `${fpA} vs ${fpB}`);

  const fpDifferentRoute = computeFingerprint("Cannot read properties of undefined (reading 'name')", stackV1, "/jobs/456");
  check("the same error on a DIFFERENT route gets a different fingerprint", fpA !== fpDifferentRoute);

  const fpDifferentMessage = computeFingerprint("Cannot read properties of null (reading 'id')", stackV1, "/candidates/123");
  check("a different message gets a different fingerprint", fpA !== fpDifferentMessage);

  const fpNoStack = computeFingerprint("Something broke", null, "/x");
  check("a missing stack still produces a stable, non-empty fingerprint", typeof fpNoStack === "string" && fpNoStack.length > 0);
  check("computeFingerprint is deterministic (same inputs -> same output, called twice)", computeFingerprint("Something broke", null, "/x") === fpNoStack);

  // Two occurrences carrying different dynamic ids (uuids) in the message
  // group into the SAME fingerprint — the id varies per occurrence, the
  // error site doesn't.
  const fpId1 = computeFingerprint("Failed to load application 11111111-2222-3333-4444-555555555555", stackV1, "/applicants/x");
  const fpId2 = computeFingerprint("Failed to load application 66666666-7777-8888-9999-aaaaaaaaaaaa", stackV1, "/applicants/x");
  check("dynamic uuid/hex ids embedded in the message are normalized away, so occurrences still group together", fpId1 === fpId2, `${fpId1} vs ${fpId2}`);
}

{
  const top = topStackFrame("Error: boom\n  at handleClick (App.tsx:12:34)\n  at HTMLButtonElement.onclick (App.tsx:5:1)");
  check("topStackFrame picks the first real call-site line, not the 'Error: ...' header", top.includes("handleClick"), top);
  check("topStackFrame strips the trailing :line:col", !/:\d+:\d+$/.test(top), top);
}

// =============================================================================
// Bot filtering
// =============================================================================
console.log("\nBot filtering:\n");

{
  const bots = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "curl/8.4.0",
    "python-requests/2.31.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36",
    "facebookexternalhit/1.1",
    "Slackbot-LinkExpanding 1.0",
    "GPTBot/1.0",
  ];
  for (const ua of bots) {
    check(`flags known bot UA as a bot: "${ua.slice(0, 40)}..."`, isBotUserAgent(ua) === true);
  }

  const humans = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  ];
  for (const ua of humans) {
    check(`does NOT flag a real browser UA as a bot: "${ua.slice(0, 40)}..."`, isBotUserAgent(ua) === false);
  }

  check("a missing User-Agent is treated as a bot (not a real browser)", isBotUserAgent(null) === true);
  check("an empty User-Agent is treated as a bot", isBotUserAgent("") === true);

  check("DNT: 1 opts the caller out", honorsOptOut("1", null) === true);
  check("Sec-GPC: 1 opts the caller out", honorsOptOut(null, "1") === true);
  check("no DNT/GPC header does not opt the caller out", honorsOptOut(null, null) === false);
  check("DNT: 0 does not opt the caller out", honorsOptOut("0", null) === false);
}

// =============================================================================
// Browser / device classification
// =============================================================================
console.log("\nBrowser / device classification:\n");

{
  check(
    "classifies desktop Chrome as chrome",
    classifyBrowserFamily("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36") === "chrome",
  );
  check(
    "classifies Edge (which also carries a Chrome token) as edge, not chrome",
    classifyBrowserFamily("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0") === "edge",
  );
  check(
    "classifies mobile Safari as safari",
    classifyBrowserFamily("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1") === "safari",
  );
  check(
    "classifies Firefox as firefox",
    classifyBrowserFamily("Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0") === "firefox",
  );
  check("classifies an unrecognized UA as other", classifyBrowserFamily("SomeWeirdClient/1.0") === "other");
  check("classifies a missing UA as other", classifyBrowserFamily(null) === "other");

  check(
    "classifies an iPhone UA as mobile",
    classifyDeviceClass("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15") === "mobile",
  );
  check(
    "classifies an iPad UA as tablet",
    classifyDeviceClass("Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15") === "tablet",
  );
  check(
    "classifies plain Android (no 'Mobile' token) as tablet",
    classifyDeviceClass("Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36") === "tablet",
  );
  check(
    "classifies Android with 'Mobile' token as mobile",
    classifyDeviceClass("Mozilla/5.0 (Linux; Android 13; Mobile; SM-A125) AppleWebKit/537.36") === "mobile",
  );
  check(
    "classifies a desktop UA as desktop",
    classifyDeviceClass("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36") === "desktop",
  );
}

// =============================================================================
// Route normalization
// =============================================================================
console.log("\nRoute normalization:\n");

{
  check("strips query string", normalizeRoute("/jobs/123?utm_source=x") === "/jobs/123");
  check("strips hash", normalizeRoute("/jobs/123#apply") === "/jobs/123");
  check("adds a leading slash if missing", normalizeRoute("jobs/123") === "/jobs/123");
  check("falls back to '/' for empty input", normalizeRoute("") === "/");
  check("falls back to '/' for missing input", normalizeRoute(undefined) === "/");
  check("caps route length", normalizeRoute("/" + "a".repeat(1000)).length <= MAX_ROUTE_LEN);

  // Regression: a route segment can itself be a live bearer capability, not
  // just a path. team_invitations.invite_code is 'TEAM-' + 8 uppercase hex
  // chars (generate_invite_code() in 20251215054759_*.sql) — accepting it
  // lets the holder join that employer's team. If normalizeRoute only
  // strips query/hash and caps length without redacting, this code would
  // be stored verbatim in client_error_events.route and become readable by
  // every developer-role account, even though team_invitations RLS
  // deliberately restricts SELECT to the inviter only.
  const inviteRoute = normalizeRoute("/join-team/TEAM-A1B2C3D4");
  check("redacts a team-invite code embedded in a route segment", !inviteRoute.includes("TEAM-A1B2C3D4"), inviteRoute);
  check("an ordinary lowercase, dash-separated route segment is left untouched", normalizeRoute("/join-team") === "/join-team");
  check("an ordinary lowercase, dash-separated route segment with an id is left untouched", normalizeRoute("/candidates/jane-doe") === "/candidates/jane-doe");

  const docCodeRoute = normalizeRoute("/verify/DOC-A1B2C3");
  check("redacts a short document-verification code embedded in a route segment", !docCodeRoute.includes("DOC-A1B2C3"), docCodeRoute);
}

// =============================================================================
// Client-error payload sanitizing
// =============================================================================
console.log("\nClient-error payload sanitizing:\n");

{
  check("rejects a payload with no message", sanitizeClientErrorPayload({}) === null);
  check("rejects a payload whose message is only whitespace", sanitizeClientErrorPayload({ message: "   " }) === null);
  check("rejects a payload whose message is not a string", sanitizeClientErrorPayload({ message: 12345 }) === null);

  const clean = sanitizeClientErrorPayload({
    message: "Failed to fetch",
    stack: "Error: Failed to fetch\n  at load (App.tsx:1:1)",
    route: "/dashboard?token=secret",
    release: "abc123",
    userRole: "employer",
  });
  check("accepts a well-formed payload", clean !== null);
  check("route is normalized (query stripped)", clean.route === "/dashboard");
  check("a known userRole passes through", clean.userRole === "employer");
  check("produces a fingerprint", typeof clean.fingerprint === "string" && clean.fingerprint.length > 0);

  const withPii = sanitizeClientErrorPayload({
    message: "Notify failed for jane.doe@example.com",
    stack: "Error\n  at x (y.js:1:1)\nauthorization: Bearer aVeryLongOpaqueSessionTokenValue123456",
  });
  check("redacts an email address embedded in the message", !withPii.message.includes("@"), withPii.message);
  check("redacts a long opaque token embedded in the stack", !withPii.stack.includes("aVeryLongOpaqueSessionTokenValue123456"), withPii.stack);

  // Same exploit path, exercised through the full sanitizer (not just
  // normalizeRoute directly) since that's what client-errors/index.ts calls.
  // Deliberately the REAL 13-char invite-code length ("TEAM-" + 8 hex) —
  // short enough that the 24+ char TOKEN_RE alone would NOT catch it,
  // which is exactly why a dedicated short-code rule is required.
  const withInviteCodeRoute = sanitizeClientErrorPayload({
    message: "TypeError: x is not a function",
    stack: "at foo (bar.js:1:1)",
    route: "/join-team/TEAM-A1B2C3D4",
  });
  check("sanitizeClientErrorPayload redacts an invite code in route, not just message/stack", !withInviteCodeRoute.route.includes("TEAM-A1B2C3D4"), withInviteCodeRoute.route);

  const unknownRole = sanitizeClientErrorPayload({ message: "x", userRole: "super-admin-backdoor" });
  check("an unrecognized userRole is dropped, not passed through", unknownRole.userRole === null);

  // "word " repeated, not one long run — a single unbroken run of 24+
  // word-chars is itself treated as an opaque token and redacted (see the
  // PII-redaction check above), so a length-cap test needs realistic prose.
  const longMessage = sanitizeClientErrorPayload({ message: "failed to load ".repeat(1000), stack: "at frame ".repeat(1000) });
  check("message is capped at MAX_MESSAGE_LEN", longMessage.message.length === MAX_MESSAGE_LEN);
  check("stack is capped at MAX_STACK_LEN", longMessage.stack.length === MAX_STACK_LEN);

  const noStack = sanitizeClientErrorPayload({ message: "x", stack: "" });
  check("an empty stack normalizes to null, not an empty string", noStack.stack === null);
}

// =============================================================================
// Page-view payload sanitizing
// =============================================================================
console.log("\nPage-view payload sanitizing:\n");

{
  check("rejects a payload with no path", sanitizePageViewPayload({}, "desktop") === null);
  check("rejects a payload whose path is only whitespace", sanitizePageViewPayload({ path: "  " }, "desktop") === null);

  const clean = sanitizePageViewPayload(
    { path: "/jobs?utm_source=x", referrerHost: "https://www.google.com/search", utmSource: "google", utmMedium: "cpc", utmCampaign: "launch", deviceClass: "mobile" },
    "desktop",
  );
  check("normalizes the path (query stripped)", clean.path === "/jobs");
  check("reduces a referrer URL down to a bare host", clean.referrerHost === "www.google.com", clean.referrerHost);
  check("keeps a valid deviceClass", clean.deviceClass === "mobile");
  check("keeps utm params", clean.utmSource === "google" && clean.utmMedium === "cpc" && clean.utmCampaign === "launch");

  const invalidDevice = sanitizePageViewPayload({ path: "/x", deviceClass: "smart-fridge" }, "desktop");
  check("an invalid deviceClass falls back to the server-computed fallback", invalidDevice.deviceClass === "desktop");

  const noUtm = sanitizePageViewPayload({ path: "/x" }, "mobile");
  check("missing utm fields normalize to null, not undefined/empty-string", noUtm.utmSource === null && noUtm.utmMedium === null && noUtm.utmCampaign === null);
  check("missing referrerHost normalizes to null", noUtm.referrerHost === null);
  check("fallback device class is used when the client sends none", noUtm.deviceClass === "mobile");
}

// isLocalDevOrigin — dev-server pages must not land in production telemetry.
{
  check("localhost origin is local", isLocalDevOrigin("http://localhost:5471"));
  check("127.0.0.1 origin is local", isLocalDevOrigin("http://127.0.0.1:8080"));
  check("[::1] origin is local", isLocalDevOrigin("http://[::1]:8080"));
  check("LAN dev server (phone testing) is local", isLocalDevOrigin("http://192.168.1.20:8080"));
  check("*.local mDNS host is local", isLocalDevOrigin("http://my-mac.local:8080"));
  check("referer is used when origin is missing", isLocalDevOrigin(null, "http://localhost:8080/applicants"));
  check("the live site is not local", !isLocalDevOrigin("https://hireflownow.com"));
  check("www live site is not local", !isLocalDevOrigin("https://www.hireflownow.com", "https://www.hireflownow.com/jobs"));
  check("a Vercel preview is not local", !isLocalDevOrigin("https://hireflow1-git-x.vercel.app"));
  check("a lookalike host is not local", !isLocalDevOrigin("https://localhost.evil.com"));
  check("no origin and no referer is not local", !isLocalDevOrigin(null, null));
  check("an opaque 'null' origin falls through to referer", isLocalDevOrigin("null", "http://localhost:3000/"));
  check("garbage origin is not local", !isLocalDevOrigin("not a url"));
  check("a live origin wins over a local-looking referer", !isLocalDevOrigin("https://hireflownow.com", "http://localhost/"));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
