#!/usr/bin/env node
/**
 * Verifies every /__preview screen's module graph loads cleanly — no
 * unresolved import, no syntax error Vite's transform pipeline would choke
 * on — without a browser: runs `vite dev` on port 5390 (DEV mode, so the
 * dev-preview code is reachable there, unlike the production build) and
 * does a headless fetch of each entry module plus its first-party (src/**)
 * import graph, breadth-first. This does not execute React or catch a bad
 * prop shape at runtime — it catches exactly what a broken import, typo'd
 * path, or syntax error in any dev-preview file or any real page it renders
 * would produce: a non-200 response from Vite's own transform.
 *
 * Run with: node scripts/dev_preview_smoke.test.mjs
 */
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PORT = 5390;
const BASE = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;
const failures = [];
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? `  (${detail})` : ""}`);
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

// Every entry point the /__preview harness reaches: its own files, plus the
// real page component behind each screen in src/dev-preview/screens.ts.
const ENTRY_MODULES = [
  "/src/dev-preview/install.ts",
  "/src/dev-preview/fixtureClient.ts",
  "/src/dev-preview/fixtures.ts",
  "/src/dev-preview/ids.ts",
  "/src/dev-preview/screens.ts",
  "/src/dev-preview/DevPreviewPicker.tsx",
  "/src/pages/DevPreview.tsx",
  "/src/pages/Dashboard.tsx",
  "/src/pages/Jobs.tsx",
  "/src/pages/Applicants.tsx",
  "/src/pages/ApplicantDetails.tsx",
  "/src/pages/Interviews.tsx",
  "/src/pages/Messages.tsx",
  "/src/pages/Documents.tsx",
  "/src/cockpit/pages/Team.tsx",
  "/src/pages/Analytics.tsx",
  "/src/pages/Settings.tsx",
  "/src/pages/Applications.tsx",
  "/src/pages/CandidateApplicationDetail.tsx",
  "/src/pages/MyDocuments.tsx",
  "/src/components/candidate/CandidateStepGate.tsx",
  "/src/pages/ApplicationFormPhase.tsx",
  "/src/pages/TypingTestPhase.tsx",
  "/src/pages/QuizPhase.tsx",
  "/src/pages/VideoIntroPhase.tsx",
  "/src/pages/ChatSimulationPhase.tsx",
  "/src/pages/ChatInterviewPhase.tsx",
  "/src/pages/SalesSimulationPhase.tsx",
  "/src/pages/VoiceInterviewPhase.tsx",
  "/src/pages/PortfolioUploadPhase.tsx",
  "/src/pages/AvaCreateJob.tsx",
];

const JS_LIKE = /\.(ts|tsx|js|jsx|mjs)$/;
const IMPORT_RE = /\bimport\s*(?:[\w*{}\s,]+from\s*)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
const EXPORT_FROM_RE = /\bexport\s*(?:[\w*{}\s,]+from\s*)?["']([^"']+)["']/g;

function resolveSpecifier(spec, fromUrl) {
  if (spec.startsWith("@/")) return `/src/${spec.slice(2)}`;
  if (spec.startsWith("/")) return spec;
  if (spec.startsWith(".")) {
    const fromDir = fromUrl.slice(0, fromUrl.lastIndexOf("/"));
    const parts = `${fromDir}/${spec}`.split("/");
    const out = [];
    for (const part of parts) {
      if (part === "" || part === ".") continue;
      if (part === "..") out.pop();
      else out.push(part);
    }
    return `/${out.join("/")}`;
  }
  return null; // bare specifier (npm package) — out of scope, node_modules is trusted.
}

async function waitForServer(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok || res.status === 404) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function crawl() {
  const visited = new Set();
  const queue = [...ENTRY_MODULES];
  const MAX_VISITS = 500;

  while (queue.length > 0 && visited.size < MAX_VISITS) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    let res;
    try {
      res = await fetch(`${BASE}${url}`);
    } catch (err) {
      check(`fetch ${url}`, false, String(err));
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      check(`${url} transforms (HTTP ${res.status})`, false, body.slice(0, 200).replace(/\s+/g, " "));
      continue;
    }
    check(`${url} transforms`, true);

    if (!JS_LIKE.test(url)) continue; // don't parse CSS/assets for further imports

    const text = await res.text();
    const specs = new Set();
    for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE, EXPORT_FROM_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) specs.add(m[1]);
    }
    for (const spec of specs) {
      const resolved = resolveSpecifier(spec, url);
      if (!resolved) continue; // bare package specifier — not first-party
      if (!resolved.startsWith("/src/")) continue; // stay inside first-party source
      if (visited.has(resolved)) continue;
      queue.push(resolved);
    }
  }

  return visited.size;
}

async function main() {
  console.log(`Starting vite dev on port ${PORT}...\n`);
  const child = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  let serverOutput = "";
  child.stdout.on("data", (d) => { serverOutput += d.toString(); });
  child.stderr.on("data", (d) => { serverOutput += d.toString(); });

  try {
    const up = await waitForServer(30_000);
    check("vite dev server came up on port 5390", up, serverOutput.slice(-500));
    if (!up) return;

    const visitedCount = await crawl();
    check("crawled a non-trivial first-party module graph", visitedCount > 15, `visited ${visitedCount} modules`);
  } finally {
    child.kill("SIGTERM");
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
