#!/usr/bin/env node
/**
 * The Content-Security-Policy and its report path (docs/LAUNCH-PLAN.md,
 * Phase 1, task 1), plus the TS link rules in src/lib/safeLink.ts.
 *
 *   - vercel.json carries exactly the policy scripts/csp.mjs builds from
 *     index.html and public/landing.html (a stale inline-script hash would
 *     block that script once the policy is enforced);
 *   - the policy never allows inline scripts wholesale, eval, or plugins, and
 *     reports to the client-errors function;
 *   - changing an inline script changes the policy (the hashes are real);
 *   - supabase/functions/_shared/cspReport.ts reads both report formats,
 *     keeps only the blocked host, and drops query strings;
 *   - safeLink's inAppPath / externalHref accept and refuse what they say.
 *
 * Run with: node scripts/csp.test.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const csp = await import(path.join(ROOT, "scripts/csp.mjs"));
const report = await import(path.join(ROOT, "supabase/functions/_shared/cspReport.ts"));
const links = await import(path.join(ROOT, "src/lib/safeLink.ts"));

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

// ---- the shipped policy ----------------------------------------------------
const sources = csp.readSources();
const policy = csp.buildPolicy(sources);
const vercel = JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const block = (vercel.headers ?? []).find(csp.isCspBlock);
check("vercel.json has a CSP header block for every path", !!block);
const header = block?.headers.find((h) => h.key === csp.HEADER_REPORT_ONLY || h.key === csp.HEADER_ENFORCED);
check("vercel.json policy matches the sources (run node scripts/csp.mjs --write if not)", header?.value === policy);
check("every page also says X-Frame-Options: SAMEORIGIN (the Phase 7 security audit: no framing by another site)", block?.headers?.some((h) => h.key === "X-Frame-Options" && h.value === "SAMEORIGIN"));

const directive = (name) => policy.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
check("script-src never allows 'unsafe-inline'", !/'unsafe-inline'/.test(directive("script-src")));
check("script-src never allows 'unsafe-eval'", !/'unsafe-eval'/.test(directive("script-src")));
check("script-src has no bare https: or *", !/\shttps:(\s|$)|\s\*(\s|$)/.test(directive("script-src")));
check("no package host that serves any npm package is trusted for scripts", !/https:\/\/unpkg\.com|https:\/\/cdn\.jsdelivr\.net(\s|$)/.test(directive("script-src")), directive("script-src"));
check("the PDF worker is served from this site", /pdf\.worker\.min\.mjs\?url/.test(readFileSync(path.join(ROOT, "src/lib/pdfWorker.ts"), "utf8")));
check("object-src is 'none'", directive("object-src") === "object-src 'none'");
check("base-uri is 'self'", directive("base-uri") === "base-uri 'self'");
check("frame-ancestors is 'self' (no framing by other sites)", directive("frame-ancestors") === "frame-ancestors 'self'");
check("reports go to client-errors ?kind=csp", directive("report-uri") === `report-uri ${csp.REPORT_URI}`);
check("every inline script is hashed", csp.inlineScripts(sources.indexHtml).length + csp.inlineScripts(sources.landingHtml).length === (directive("script-src").match(/'sha256-/g) ?? []).length - csp.inlineHandlers(sources.indexHtml).length);
check("JSON-LD data blocks are not hashed (they never run)", !csp.inlineScripts('<script type="application/ld+json">{"a":1}</script>').length);
// A CSP source whose path does not end in "/" matches that exact path only
// (CSP3 §6.7.2.12): every path-scoped script source must end in "/".
check("every path-scoped script source ends in / (a prefix, not an exact file)", directive("script-src").split(" ").filter((t) => /^https:\/\/[^/]+\/.+/.test(t)).every((t) => t.endsWith("/")), directive("script-src"));

const edited = csp.buildPolicy({ ...sources, indexHtml: sources.indexHtml.replace("window.__HF_PASSWORD_RECOVERY", "window.__HF_PASSWORD_RECOVERY_X") });
check("editing an inline script changes the policy", edited !== policy);

// ---- CSP report parsing ----------------------------------------------------
const legacy = report.cspReportsToClientErrors({
  "csp-report": {
    "document-uri": "https://hireflownow.com/applicants/abc?token=secret",
    "effective-directive": "script-src-elem",
    "blocked-uri": "https://evil.example/x.js?session=secret",
    "source-file": "https://hireflownow.com/assets/index-abc.js",
    "line-number": 12,
    disposition: "report",
  },
});
check("legacy report parsed", legacy.length === 1);
check("legacy message names directive and blocked host only", legacy[0]?.message === "CSP would block: script-src-elem evil.example", legacy[0]?.message);
check("legacy route is the path, no query", legacy[0]?.route === "/applicants/abc");
check("no query string survives anywhere", !JSON.stringify(legacy).includes("secret"));

const batch = report.cspReportsToClientErrors([
  { type: "csp-violation", url: "https://hireflownow.com/x", body: { documentURL: "https://hireflownow.com/open-jobs", effectiveDirective: "frame-src", blockedURL: "https://evil.example/", disposition: "enforce" } },
  { type: "deprecation", body: {} },
  { type: "csp-violation", body: { documentURL: "https://hireflownow.com/", effectiveDirective: "script-src-elem", blockedURL: "inline", disposition: "report" } },
]);
check("Reporting API batch: only csp-violation entries", batch.length === 2);
check("enforced report says 'blocked'", batch[0]?.message === "CSP blocked: frame-src evil.example");
check("inline keyword kept as a keyword", batch[1]?.message === "CSP would block: script-src-elem inline");
check("data: blocked URI reduced to its scheme", report.blockedLabel("data:text/html;base64,PHNjcmlwdD4=") === "data");
check("junk body gives nothing", report.cspReportsToClientErrors({ hello: "world" }).length === 0 && report.cspReportsToClientErrors("x").length === 0);
check("isCspReportRequest by content type", report.isCspReportRequest("application/csp-report", "https://x/f"));
check("isCspReportRequest by ?kind=csp", report.isCspReportRequest("application/json", "https://x/f?kind=csp"));
check("a crash report is not a CSP report", !report.isCspReportRequest("application/json", "https://x/f"));

// ---- safeLink --------------------------------------------------------------
for (const v of ["javascript:alert(1)", "//evil.example", "/\\evil.example", "https://evil.example", "/a b", "", null, 42]) {
  check(`inAppPath refuses ${JSON.stringify(v)}`, links.inAppPath(v) === null);
}
for (const v of ["/", "/applicants/x?y=1#z"]) check(`inAppPath keeps ${v}`, links.inAppPath(v) === v);
for (const v of ["javascript:alert(1)", "JaVaScRiPt:1", "data:text/html,x", "vbscript:x", "file:///etc/passwd", "//evil.example", "blob:https://hireflownow.com/x"]) {
  check(`externalHref refuses ${v}`, links.externalHref(v) === null);
}
check("externalHref keeps https", links.externalHref("https://meet.google.com/x") === "https://meet.google.com/x");
check("externalHref adds https:// to a bare domain", links.externalHref("www.linkedin.com/in/x") === "https://www.linkedin.com/in/x");
check("externalHref allows this page's blob: only when asked", links.externalHref("blob:https://hireflownow.com/x", { allowBlob: true }) === "blob:https://hireflownow.com/x");

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
