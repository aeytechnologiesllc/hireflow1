#!/usr/bin/env node
/**
 * Runs `deno check` over every supabase/functions/<name>/index.ts, skipping
 * the functions listed in scripts/deno-check-skip.json (each with a reason —
 * see that file's header). Used by CI (.github/workflows/ci.yml) and safe to
 * run locally with `node scripts/deno_check_functions.mjs`.
 *
 * Exits non-zero if any non-skipped function fails to typecheck, or if the
 * skip file names a function that no longer exists (stale entries rot).
 */
import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FUNCTIONS_DIR = path.join(ROOT, "supabase/functions");
const SKIP_FILE = path.join(ROOT, "scripts/deno-check-skip.json");

const skipRaw = JSON.parse(await readFile(SKIP_FILE, "utf8"));
const skip = skipRaw.skip ?? {};

const entries = await readdir(FUNCTIONS_DIR, { withFileTypes: true });
const names = entries
  .filter((e) => e.isDirectory() && e.name !== "_shared")
  .map((e) => e.name)
  .sort();

const staleSkips = Object.keys(skip).filter((n) => !names.includes(n));
if (staleSkips.length) {
  console.error(`\n  FAIL  scripts/deno-check-skip.json names function(s) that no longer exist: ${staleSkips.join(", ")}\n`);
  process.exit(1);
}

let failed = 0;
let checked = 0;
let skipped = 0;

for (const name of names) {
  const entryFile = path.join(FUNCTIONS_DIR, name, "index.ts");
  if (skip[name]) {
    console.log(`  skip - ${name}  (${skip[name]})`);
    skipped += 1;
    continue;
  }
  const result = spawnSync("deno", ["check", entryFile], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0) {
    console.log(`  ok   - ${name}`);
    checked += 1;
  } else {
    console.error(`FAIL   - ${name}`);
    console.error((result.stdout || "") + (result.stderr || ""));
    failed += 1;
  }
}

console.log(`\n${checked} checked, ${skipped} skipped, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
