#!/usr/bin/env node
/**
 * The site's Content-Security-Policy, built from the files it protects.
 *
 * Why: the 2026-10-24 audit (docs/LAUNCH-PLAN.md, Phase 1, task 1) found a
 * stored-link script injection; the link filters fix that one, and a CSP is
 * the backstop for the next one: a page that only runs its own scripts
 * cannot be made to run an attacker's.
 *
 * The policy allows exactly what the app loads today (built from the code,
 * not from memory): its own files; the inline scripts in index.html and
 * public/landing.html by their sha256 (computed here, so editing one of them
 * without re-running this script is caught by scripts/csp.test.mjs); the
 * Natively wrapper SDK and nothing else from jsDelivr's npm path; Daily for
 * the built-in video room; the Supabase
 * project; OpenAI's realtime endpoint (the voice interview); Google's OAuth
 * and Calendar API (the scheduling wizard); ipify (the signing record's IP);
 * Google Fonts.
 *
 * It ships as Content-Security-Policy-Report-Only first: nothing is blocked,
 * every violation is reported to the client-errors function (?kind=csp,
 * supabase/functions/_shared/cspReport.ts) and lands in client_error_events
 * with release = 'csp'. Once a day of real traffic reports nothing that
 * should be allowed, run with --enforce to switch the header.
 *
 *   node scripts/csp.mjs            print the policy
 *   node scripts/csp.mjs --write    write it into vercel.json (report-only)
 *   node scripts/csp.mjs --write --enforce   write it as the enforced header
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SUPABASE = "https://yqklrkpptnhubsnijqze.supabase.co";
const SUPABASE_WSS = "wss://yqklrkpptnhubsnijqze.supabase.co";
export const REPORT_URI = `${SUPABASE}/functions/v1/client-errors?kind=csp`;

const sha256 = (text) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

/** Every inline <script> that runs (no src, not a JSON data block), as written. */
export function inlineScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && type !== "text/javascript" && type !== "module" && type !== "application/javascript") continue;
    out.push(m[2]);
  }
  return out;
}

/** Inline event-handler attributes (onload="..."), which need 'unsafe-hashes'. */
export function inlineHandlers(html) {
  const out = [];
  const re = /<[a-z][^>]*\s(on[a-z]+)\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[2]);
  return out;
}

export function buildPolicy({ indexHtml, landingHtml }) {
  const scripts = [...inlineScripts(indexHtml), ...inlineScripts(landingHtml)];
  const handlers = [...inlineHandlers(indexHtml), ...inlineHandlers(landingHtml)];
  const hashes = [...new Set(scripts.map(sha256))];
  const handlerHashes = [...new Set(handlers.map(sha256))];
  const directives = [
    ["default-src", ["'self'"]],
    [
      "script-src",
      [
        "'self'",
        ...hashes,
        ...(handlerHashes.length ? ["'unsafe-hashes'", ...handlerHashes] : []),
        // A path ending in "/" matches as a prefix (a path that does not end
        // in "/" matches one exact file). The PDF worker is served from this
        // site (src/lib/pdfWorker.ts), so no package host is trusted.
        "https://cdn.jsdelivr.net/npm/natively@2.20.0/",
        "https://*.daily.co",
        "blob:",
      ],
    ],
    ["style-src", ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]],
    ["font-src", ["'self'", "data:", "https://fonts.gstatic.com"]],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["media-src", ["'self'", "blob:", "data:", SUPABASE, "https://*.daily.co"]],
    [
      "connect-src",
      [
        "'self'",
        SUPABASE,
        SUPABASE_WSS,
        "https://*.daily.co",
        "wss://*.daily.co",
        "https://api.openai.com",
        "https://www.googleapis.com",
        "https://oauth2.googleapis.com",
        "https://api.ipify.org",
        "https://cdn.jsdelivr.net",
      ],
    ],
    ["frame-src", ["'self'", "blob:", "data:", SUPABASE, "https://*.daily.co", "https://accounts.google.com"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'", "https://accounts.google.com"]],
    ["frame-ancestors", ["'self'"]],
    ["report-uri", [REPORT_URI]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

export function readSources() {
  return {
    indexHtml: readFileSync(path.join(ROOT, "index.html"), "utf8"),
    landingHtml: readFileSync(path.join(ROOT, "public/landing.html"), "utf8"),
  };
}

export const HEADER_REPORT_ONLY = "Content-Security-Policy-Report-Only";
export const HEADER_ENFORCED = "Content-Security-Policy";

/** The vercel.json header block this script owns (one, for every path and both hosts). */
export function cspHeaderBlock(policy, enforce) {
  return {
    source: "/(.*)",
    headers: [
      { key: enforce ? HEADER_ENFORCED : HEADER_REPORT_ONLY, value: policy },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Enforced now, while the policy's frame-ancestors is still report-only
      // (the Phase 7 security audit: nothing stopped another site framing the
      // app). Nothing of HireFlow frames another of its own hosts.
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ],
  };
}

export function isCspBlock(block) {
  return (
    block &&
    block.source === "/(.*)" &&
    !block.has &&
    Array.isArray(block.headers) &&
    block.headers.some((h) => h.key === HEADER_REPORT_ONLY || h.key === HEADER_ENFORCED)
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const policy = buildPolicy(readSources());
  if (!process.argv.includes("--write")) {
    console.log(policy);
    process.exit(0);
  }
  const enforce = process.argv.includes("--enforce");
  const vercelPath = path.join(ROOT, "vercel.json");
  const vercel = JSON.parse(readFileSync(vercelPath, "utf8"));
  vercel.headers = (vercel.headers ?? []).filter((b) => !isCspBlock(b));
  vercel.headers.push(cspHeaderBlock(policy, enforce));
  writeFileSync(vercelPath, `${JSON.stringify(vercel, null, 2)}\n`);
  console.log(`vercel.json: ${enforce ? HEADER_ENFORCED : HEADER_REPORT_ONLY} written (${policy.length} chars).`);
}
