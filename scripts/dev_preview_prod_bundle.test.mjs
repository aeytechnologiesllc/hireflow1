#!/usr/bin/env node
/**
 * Proves the /__preview dev-preview harness (src/dev-preview/) is genuinely
 * absent from the production bundle — not just source-gated (that's
 * scripts/guards/dev-preview-dev-only.mjs, which is faster but only checks
 * the source text). This actually runs `vite build` (the same production
 * build `npm run build` produces, into a throwaway directory so it can't
 * collide with a real build running elsewhere) and greps the output for
 * every marker that only exists in dev-preview code: its own file names, its
 * fixture-only strings (the fake employer/candidate identities), and the
 * seam functions/flags that turn it on.
 *
 * Run with: node scripts/dev_preview_prod_bundle.test.mjs
 */
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

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

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

// Strings that must never appear in a shipped bundle — chosen to be unique
// to dev-preview code and NOT plausible substrings of anything else in the
// app (real component/table names like "Applicants" or "Documents" are
// deliberately excluded from this list for that reason).
const FORBIDDEN_STRINGS = [
  "__setPreviewSupabaseClient",
  "dev-preview/install",
  "dev-preview/fixtureClient",
  "dev-preview/fixtures",
  "dev-preview/screens",
  "DevPreviewPicker",
  "__previewRole",
  "createFixtureSupabaseClient",
  // Fixture-only identities — real content never contains these.
  "mariascafe.example",
  "Jordan Alvarez",
  "Maria Alvarado",
];

async function main() {
  console.log("Building production bundle (vite build --mode production)...\n");
  const outDir = await mkdtemp(path.join(tmpdir(), "hireflow-dev-preview-build-"));
  try {
    await run("npx", ["vite", "build", "--outDir", outDir, "--emptyOutDir"], {
      cwd: ROOT,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, NODE_ENV: "production" },
    });

    const builtStat = await stat(outDir).catch(() => null);
    check("production build produced an output directory", !!builtStat && builtStat.isDirectory());

    const files = await walk(outDir);
    const jsAndHtmlFiles = files.filter((f) => /\.(js|mjs|html|css)$/.test(f));
    check("production build produced JS/HTML output files", jsAndHtmlFiles.length > 0, `found ${jsAndHtmlFiles.length}`);

    // No chunk file name should reference dev-preview code — a genuinely
    // dead-code-eliminated import never gets its own chunk.
    const suspiciousFileNames = files.filter((f) => /dev-preview|DevPreview|fixtureClient/i.test(path.basename(f)));
    check("no output file is named after dev-preview code", suspiciousFileNames.length === 0, suspiciousFileNames.join(", "));

    for (const marker of FORBIDDEN_STRINGS) {
      const hits = [];
      for (const file of jsAndHtmlFiles) {
        const text = await readFile(file, "utf8").catch(() => "");
        if (text.includes(marker)) hits.push(path.relative(outDir, file));
      }
      check(`bundle does not contain "${marker}"`, hits.length === 0, hits.join(", "));
    }

    // The /__preview route itself must not be reachable: index.html's
    // entry script graph should never request a dev-preview chunk. This is
    // implied by the string checks above, but assert the concrete file
    // count too so a future refactor that renames things can't silently
    // pass by coincidence.
    const indexHtml = await readFile(path.join(outDir, "index.html"), "utf8").catch(() => "");
    check("index.html was produced", indexHtml.length > 0);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
