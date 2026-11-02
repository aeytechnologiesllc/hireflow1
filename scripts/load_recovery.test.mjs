#!/usr/bin/env node
/**
 * A page whose code did not load whole reloads itself, once a minute at most
 * (src/lib/loadRecovery.ts; live 2026-11-02: an applicant on Safari got
 * "Cannot access uninitialized variable" fourteen times in four minutes on a
 * dropping connection).
 *
 * Run with: node scripts/load_recovery.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const R = await import(path.join(ROOT, "src/lib/loadRecovery.ts"));

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

for (const m of ["Cannot access uninitialized variable.", "Cannot access 'x' before initialization", "Importing a module script failed.", "Failed to fetch dynamically imported module: https://x/a.js", "Load failed", "Unable to preload CSS for /assets/a.css"]) {
  check(`a load failure: ${m}`, R.isLoadFailure(m));
}
for (const m of ["Cannot read properties of undefined (reading 'id')", "x is not a function", "Load failed to parse the answer", "", null]) {
  check(`not a load failure: ${JSON.stringify(m)}`, !R.isLoadFailure(m));
}

function fakeWindow(stored) {
  const store = new Map(stored == null ? [] : [[R.RELOAD_AT_KEY, stored]]);
  const w = { reloads: 0, location: { reload: () => (w.reloads += 1) }, sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } };
  return w;
}
{
  const w = fakeWindow(null);
  check("the first failure reloads", R.reloadForLoadFailure(w) === true && w.reloads === 1);
  check("a second within the minute does not (no loop on a dead connection)", R.reloadForLoadFailure(w) === false && w.reloads === 1);
}
{
  const w = fakeWindow(String(Date.now() - R.RELOAD_GAP_MS - 1));
  check("a minute after the last, it may reload again (a visit can drop more than once)", R.reloadForLoadFailure(w) === true && w.reloads === 1);
}
{
  const w = { reloads: 0, location: { reload: () => (w.reloads += 1) }, sessionStorage: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } };
  check("no storage (a private window): one reload, then the error screen", R.reloadForLoadFailure(w) === true && R.reloadForLoadFailure(w) === false && w.reloads === 1);
}
const boundary = await readFile(path.join(ROOT, "src/components/ErrorBoundary.tsx"), "utf8");
const lazy = await readFile(path.join(ROOT, "src/lib/lazyWithReload.ts"), "utf8");
check("the error screen reloads a load failure by itself", /isLoadFailure\(error\.message\) && reloadForLoadFailure\(\)/.test(boundary) && /Loading it again/.test(boundary));
check("a lazy page that fails to download uses the same once-a-minute reload", /reloadForLoadFailure\(\)/.test(lazy) && !/hf-chunk-reload/.test(lazy));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
