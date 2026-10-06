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
import { fileURLToPath } from "node:url";

// fileURLToPath, not URL.pathname: a checkout under "HireFlow 1" keeps the
// space as %20 in a pathname, and the spawn then fails with ENOENT.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5390;
const BASE = `http://localhost:${PORT}`;
const VITE_BIN = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");

// The whole run takes seconds (about 2 s in CI). A hard deadline turns any
// future hang into a failure with a reason. Until 2026-10-04 this test passed
// every check in CI and then never exited, so every run sat until GitHub's
// 6-hour limit: it started Vite through `npx` and stopped only `npx`, Vite
// survived on Linux, and its open output pipe kept this process alive.
const DEADLINE_MS = 180_000;

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
  "/src/pages/ConnectionCheckPhase.tsx",
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

/** Signal Vite's whole process group: Vite itself and the esbuild service it starts. */
function signalServer(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    // already gone
  }
}

/** Stop the server and wait for it to exit: SIGTERM first, SIGKILL after 5 s. */
function stopServer(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    let force;
    child.once("exit", () => {
      clearTimeout(force);
      resolve();
    });
    signalServer(child, "SIGTERM");
    force = setTimeout(() => {
      signalServer(child, "SIGKILL");
      setTimeout(resolve, 1_000);
    }, 5_000);
  });
}

async function main() {
  console.log(`Starting vite dev on port ${PORT}...\n`);
  // Vite runs directly (no npx in between) in its own process group, so
  // stopping it reaches every process it started.
  const child = spawn(process.execPath, [VITE_BIN, "--port", String(PORT), "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
    detached: true,
  });

  // A separate process group no longer hears Ctrl-C or the CI runner's
  // timeout, so pass those on, and never leave the server behind on exit.
  process.on("exit", () => signalServer(child, "SIGKILL"));
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      signalServer(child, "SIGKILL");
      process.exit(1);
    });
  }

  const deadline = setTimeout(() => {
    console.log(`FAIL  - finished within ${DEADLINE_MS / 1000} s (still running, stopping the server)`);
    signalServer(child, "SIGKILL");
    process.exit(1);
  }, DEADLINE_MS);
  deadline.unref(); // fires only if something else is keeping the process alive

  let serverOutput = "";
  child.stdout.on("data", (d) => { serverOutput += d.toString(); });
  child.stderr.on("data", (d) => { serverOutput += d.toString(); });

  try {
    const up = await waitForServer(30_000);
    check("vite dev server came up on port 5390", up, serverOutput.slice(-500));
    // No early return: a server that never came up must reach the summary
    // below and fail the run (it used to return here and exit 0).
    if (up) {
      const visitedCount = await crawl();
      check("crawled a non-trivial first-party module graph", visitedCount > 15, `visited ${visitedCount} modules`);
    }
  } finally {
    await stopServer(child);
    child.stdout.destroy();
    child.stderr.destroy();
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  // Exit explicitly: a leftover handle (a keep-alive socket, a timer) must
  // never hold the test open after it has finished.
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
